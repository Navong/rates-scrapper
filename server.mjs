// HTTP backend for the Exchange Rate automation.
//
//   GET /                 → landing page with country picker
//   GET /ranking?country= → rate-comparison table (HTML; &format=json for data)
//   GET /manual?country=  → form to enter manual rates (Sentbe, FoneMoney)
//   GET /rates            → Cambodia base-rate payload for Excel / Power Automate
//   GET /health           → { ok: true }
//
// Run:  node server.mjs            (PORT env, default 8787)

import http from "node:http";
import { collectRates, buildBasesPayload } from "./scrape.mjs";
import { getStore, getEntry, setEntry, statusOf, deviation } from "./manual.mjs";
import { getCountry, countryList, PROVIDER_LABEL } from "./countries.mjs";
import { collectCountry } from "./providers.mjs";
import { limiterStats } from "./limiter.mjs";
import { renderRankingHtml, buildRankingData } from "./ranking.mjs";
import { renderDashboard } from "./dashboard.mjs";
import { logEvent, readStats, renderStats } from "./analytics.mjs";
import { page } from "./theme.mjs";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT) || 8787;
const TOKEN = process.env.RATES_TOKEN || "";
const CACHE_TTL = Number(process.env.CACHE_TTL ?? 240) * 1000; // identical request → cached 4 min

let ratesCache = { at: 0, data: null };          // /rates (Cambodia payload)
const rankCache = new Map();                      // country -> { at, records, errors }

// Manual rates live in manual.mjs (timestamped, with staleness + audit).
const manual = getStore();

const readBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });

// Auth accepts ?token=, an x-api-token header, or the "rt" cookie (set on first
// successful visit) so the bare URL works in a browser afterwards.
function cookieToken(req) {
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)rt=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}
const authed = (url, req) =>
  !TOKEN || url.searchParams.get("token") === TOKEN || req.headers["x-api-token"] === TOKEN || cookieToken(req) === TOKEN;

const wantsHtml = (req) => (req.headers.accept || "").includes("text/html");

// Anonymous visitor id (random cookie) so we can count unique browsers without
// storing IPs. If Cloudflare Access is ever put in front, its email header wins.
function visitor(req, res) {
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)vid=([^;]+)/);
  if (m) return m[1];
  const id = randomUUID().slice(0, 8);
  const prev = res.getHeader("Set-Cookie");
  const cookie = `vid=${id}; Path=/; Max-Age=63072000; SameSite=Lax; Secure`;
  res.setHeader("Set-Cookie", prev ? [].concat(prev, cookie) : cookie);
  return id;
}
const accessUser = (req) => req.headers["cf-access-authenticated-user-email"] || "";
function rememberToken(res, url) {
  if (TOKEN && url.searchParams.get("token") === TOKEN) {
    res.setHeader("Set-Cookie", `rt=${encodeURIComponent(TOKEN)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure; HttpOnly`);
  }
}
function loginPage(next, bad) {
  const body = `
<div style="margin-top:12vh">
  <h1>Rate dashboard</h1>
  <div class="sub" style="margin-bottom:16px">Enter your access token.</div>
  ${bad ? '<div class="warn">Invalid token.</div>' : ""}
  <div class="panel">
    <form method="GET" action="${next}">
      <input class="field" name="token" type="password" placeholder="token" autofocus style="text-align:left;font-size:16px">
      <button class="btn primary" type="submit">Continue</button>
    </form>
  </div>
</div>`;
  return page({ title: "Sign in", body, wrapClass: "sm" });
}
const tq = (extra = "") => (extra ? `?${extra.replace(/^&/, "")}` : "");

// Never serve data older than this, even under stale-while-revalidate.
const MAX_STALE = Number(process.env.MAX_STALE ?? 900) * 1000; // 15 min
const inflightCountry = new Map(); // code -> Promise  (single-flight)

/** Scrape a corridor once, no matter how many callers ask concurrently. */
function refreshCountry(country, fresh) {
  const code = country.code;
  const pending = inflightCountry.get(code);
  if (pending) return pending;

  const p = collectCountry(country, { fresh })
    .then(({ records, errors }) => {
      const entry = { at: Date.now(), records, errors };
      rankCache.set(code, entry);
      return entry;
    })
    .finally(() => inflightCountry.delete(code));

  inflightCountry.set(code, p);
  return p;
}

/**
 * Cache policy:
 *   fresh          → scrape now (still single-flight)
 *   young          → HIT
 *   stale          → serve stale instantly + refresh in the background (SWR)
 *   too old / cold → wait for a scrape
 */
async function getCountryRecords(country, fresh) {
  const hit = rankCache.get(country.code);
  const age = hit ? Date.now() - hit.at : Infinity;

  if (fresh) return { ...(await refreshCountry(country, true)), cached: false, stale: false };
  if (hit && age < CACHE_TTL) return { ...hit, cached: true, stale: false };
  if (hit && age < MAX_STALE) {
    refreshCountry(country, false).catch((e) => console.error("bg refresh failed:", e.message));
    return { ...hit, cached: true, stale: true }; // answer now, refresh behind
  }
  return { ...(await refreshCountry(country, false)), cached: false, stale: false };
}

// --- Background warmer -------------------------------------------------------
// Refreshes one corridor at a time on a rotation, so upstream load is a function
// of corridors × time — never of how many people are using the app. It also
// spreads GME's calls out, which is what keeps it under its ~6-per-window limit.
function startWarmer() {
  if (process.env.WARMER === "off") { console.log("Warmer: disabled (WARMER=off)"); return; }
  const codes = countryList().map((c) => c.code);
  if (!codes.length || !CACHE_TTL) return;
  const every = Math.max(5000, Math.floor(CACHE_TTL / codes.length)); // stagger across the TTL
  let i = 0;

  const tick = async () => {
    const country = getCountry(codes[i++ % codes.length]);
    try {
      const t0 = Date.now();
      // fresh=false on purpose: each provider's memo TTL is set below the cycle
      // time, so the warmer gets real data while bursts still hit the memo.
      const { errors } = await refreshCountry(country, false);
      console.log(`[warm] ${country.code} ${Date.now() - t0}ms failed=${errors.map((e) => `${e.who} (${e.error})`).join("; ") || "none"}`);
    } catch (e) {
      console.error(`[warm] ${country.code} failed:`, e.message);
    }
  };

  setTimeout(tick, 3000);            // warm the first corridor shortly after boot
  setInterval(tick, every);
  console.log(`Warmer: ${codes.length} corridors, one every ${Math.round(every / 1000)}s (full cycle ${Math.round(CACHE_TTL / 1000)}s)`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "x-api-token, content-type");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

  if (url.pathname === "/health") {
    const corridors = {};
    for (const c of countryList()) {
      const hit = rankCache.get(c.code);
      corridors[c.code] = hit ? { ageSec: Math.round((Date.now() - hit.at) / 1000), failed: hit.errors.map((e) => e.who) } : "cold";
    }
    res.end(JSON.stringify({ ok: true, corridors, inflight: inflightCountry.size, limiter: limiterStats() }));
    return;
  }

  // ---- Dashboard (modern, client-rendered) ----
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!authed(url, req)) {
      res.statusCode = 401;
      res.end(loginPage("/", url.searchParams.has("token")));
      return;
    }
    rememberToken(res, url);
    res.setHeader("Cache-Control", "no-store");
    const v = visitor(req, res);
    res.end(renderDashboard("")); // auth rides on the cookie
    logEvent({ k: "page", p: "/", c: null, v, u: accessUser(req) });
    return;
  }

  // ---- Usage stats ----
  if (url.pathname === "/stats") {
    if (!authed(url, req)) {
      if (wantsHtml(req)) { res.statusCode = 401; res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(loginPage("/stats", url.searchParams.has("token"))); return; }
      res.statusCode = 401; res.end(JSON.stringify({ error: "unauthorized" })); return;
    }
    rememberToken(res, url);
    const s = await readStats();
    if (url.searchParams.get("format") === "json") { res.end(JSON.stringify(s || {})); return; }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    const names = Object.fromEntries(countryList().map((c) => [c.code, `${c.flag} ${c.name}`]));
    res.end(renderStats(s, names));
    return;
  }

  // ---- Manual rates (bulk: every corridor on one page) ----
  if (url.pathname === "/manual" || url.pathname === "/sentbe") {
    if (!authed(url, req)) {
      if (wantsHtml(req)) { res.statusCode = 401; res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(loginPage("/manual", url.searchParams.has("token"))); return; }
      res.statusCode = 401; res.end(JSON.stringify({ error: "unauthorized" })); return;
    }
    rememberToken(res, url);
    const country = getCountry(url.searchParams.get("country") || "KH");

    // The standalone manual page is gone — editing lives inline on the sheet
    // view. A GET just sends you there; the inline editor still POSTs here.
    if (req.method !== "POST") {
      res.statusCode = 302;
      res.setHeader("Location", `/ranking?country=${country.code}`);
      res.end();
      return;
    }

    const p = new URLSearchParams(await readBody(req));
    const confirm = p.get("confirm") === "1";
    const by = accessUser(req) || "";
    const saved = [], warnings = [], pending = {};

    // Parse the changed fields first. Field name is code__prov__method.
    const changes = [];
    for (const [key, raw] of p.entries()) {
      const parts = key.split("__");
      if (parts.length !== 3) continue;
      const [code, prov, method] = parts;
      if (raw.trim() === "") continue;
      const n = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(n) || n <= 0) continue;
      const existing = getEntry(code, prov, method);
      // Skip only if the value is unchanged AND still fresh. Re-submitting the
      // same number for an expired rate must refresh its timestamp (that is how
      // you satisfy the hourly "re-enter" requirement without changing the rate).
      if (existing && existing.value === n && existing.at && statusOf(existing).status === "fresh") continue;
      changes.push({ key, code, prov, method, raw, n, existing });
    }

    // The typo guard needs peers for the SAME method. Load each touched corridor
    // once — otherwise a cold cache would silently disable the check.
    const peersByKey = {};
    if (!confirm && changes.length) {
      for (const { code, method } of changes) {
        const kk = `${code}|${method}`;
        if (kk in peersByKey) continue;
        try {
          const { records } = await getCountryRecords(getCountry(code), false);
          peersByKey[kk] = records.filter((r) => r.method === method).map((r) => r.principalKRW);
        } catch { peersByKey[kk] = []; }
      }
    }

    for (const { key, code, prov, method, raw, n, existing } of changes) {
      const kk = `${code}|${method}`;
      if (!confirm) {
        let dev = deviation(n, peersByKey[kk] ?? []);
        // Fallback when peers are unavailable: compare against the last value.
        if (!dev && (peersByKey[kk] ?? []).length < 2 && existing?.value) {
          const pctv = ((n - existing.value) / existing.value) * 100;
          if (Math.abs(pctv) > 15) dev = { pct: pctv, median: existing.value };
        }
        if (dev) {
          const ml = getCountry(code).methods.find((m) => m.key === method)?.label || method;
          warnings.push({ key, label: `${getCountry(code).name} · ${PROVIDER_LABEL[prov]} · ${ml}`, value: n, ...dev });
          pending[key] = raw;
          continue;
        }
      }
      setEntry(code, prov, method, n, by);
      rankCache.delete(code); // force the ranking to pick it up
      saved.push(`${PROVIDER_LABEL[prov]} ${n.toLocaleString()}`);
    }

    console.log(`[${new Date().toISOString()}] manual saved: ${saved.join(", ") || "none"}${warnings.length ? ` | blocked: ${warnings.map((w) => w.label).join(", ")}` : ""}`);
    // The sheet-view inline editor posts with ?format=json and re-renders itself.
    // That is the only caller; any other POST just bounces back to the sheet.
    if (url.searchParams.get("format") === "json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true, saved, warnings, pending }));
      return;
    }
    res.statusCode = 302;
    res.setHeader("Location", `/ranking?country=${country.code}`);
    res.end();
    return;
  }

  // ---- Ranking ----
  if (url.pathname === "/ranking" || url.pathname === "/ranking.html") {
    if (!authed(url, req)) {
      if (wantsHtml(req)) { res.statusCode = 401; res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(loginPage(url.pathname, url.searchParams.has("token"))); return; }
      res.statusCode = 401; res.end(JSON.stringify({ error: "unauthorized" })); return;
    }
    rememberToken(res, url);
    const country = getCountry(url.searchParams.get("country") || "KH");
    try {
      const t0 = Date.now();
      const isJson = url.searchParams.get("format") === "json";
      const v = visitor(req, res);
      const { records, errors, cached, stale } = await getCountryRecords(country, url.searchParams.get("fresh") === "1");
      const dur = Date.now() - t0;
      const state = stale ? "STALE" : cached ? "HIT" : "MISS";
      res.setHeader("x-cache", state);
      const failedDetail = errors.map((e) => `${e.who} (${e.error})`).join("; ") || "none";
      console.log(`[${new Date().toISOString()}] /ranking ${country.code} ${dur}ms cache=${state} failed=${failedDetail}`);
      if (isJson) {
        res.end(JSON.stringify({ ...buildRankingData(country, records, manual), failed: errors }));
      } else {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderRankingHtml(country, records, manual, { now: new Date(), failed: errors }));
      }
      // Sheet view counts as a page; the dashboard's JSON poll counts as api.
      // ch=true means "served without waiting on a scrape" (HIT or STALE).
      logEvent({ k: isJson ? "api" : "page", p: "/ranking", c: country.code, d: dur, ch: cached, v, u: accessUser(req) });
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ---- Cambodia base-rate payload (Excel / Power Automate) — unchanged ----
  if (url.pathname === "/rates") {
    if (!authed(url, req)) { res.statusCode = 401; res.end(JSON.stringify({ error: "unauthorized" })); return; }
    const fresh = url.searchParams.get("fresh") === "1";
    const t0 = Date.now();
    if (!fresh && CACHE_TTL && ratesCache.data && Date.now() - ratesCache.at < CACHE_TTL) {
      res.setHeader("x-cache", "HIT");
      res.end(JSON.stringify(ratesCache.data));
      logEvent({ k: "api", p: "/rates", c: "KH", d: Date.now() - t0, ch: true });
      return;
    }
    try {
      const payload = buildBasesPayload(await collectRates());
      ratesCache = { at: Date.now(), data: payload };
      res.setHeader("x-cache", "MISS");
      res.end(JSON.stringify(payload));
      logEvent({ k: "api", p: "/rates", c: "KH", d: Date.now() - t0, ch: false });
    } catch (err) {
      res.statusCode = 500; res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found", routes: ["/", "/ranking", "/manual", "/rates", "/health"] }));
});

server.listen(PORT, "::", () => {
  console.log(`Rate backend listening on http://[::]:${PORT} (dual-stack)`);
  console.log(`  /  /ranking?country=…  /manual  /stats  /rates  /health`);
  if (TOKEN) console.log("  (auth required: ?token=… or x-api-token header)");
  startWarmer();
});
