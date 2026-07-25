// Lightweight, self-hosted usage tracking. One JSONL line per request in
// STATE_DIR/events.jsonl — no third party, no raw IPs stored.
//
// Each event: { t, k, p, c, d, ch, v, u }
//   t  ISO timestamp        k  kind: "page" | "api"
//   p  path                 c  corridor code (KH/NP/ID)
//   d  duration ms          ch cached (true = served from cache)
//   v  visitor id (random cookie)   u  user email (if Cloudflare Access is on)

import { appendFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { page, siteHeader } from "./theme";

const STATE_DIR = process.env.STATE_DIR || ".";
const FILE = join(STATE_DIR, "events.jsonl");
const MAX_READ = 8 * 1024 * 1024; // only aggregate the tail of very large logs

export function logEvent(ev) {
  const line = JSON.stringify({ t: new Date().toISOString(), ...ev }) + "\n";
  appendFile(FILE, line).catch((e) => console.error("analytics write failed:", e.message));
}

const dayKey = (d) => {
  // Local day (server runs TZ=Asia/Seoul), so "today" matches the user's day.
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export async function readStats() {
  let raw = "";
  try {
    const st = await stat(FILE);
    const fh = await readFile(FILE, "utf8");
    raw = st.size > MAX_READ ? fh.slice(-MAX_READ) : fh;
  } catch {
    return null; // no events yet
  }

  const events = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* skip partial line */ }
  }
  if (!events.length) return null;

  const today = dayKey(Date.now());
  const pages = events.filter((e) => e.k === "page");
  const scrapes = events.filter((e) => typeof e.d === "number" && e.ch === false);
  const served = events.filter((e) => typeof e.d === "number" && e.ch === true);

  const byCorridor = {};
  for (const e of pages) {
    const c = e.c || "-";
    byCorridor[c] = byCorridor[c] || { views: 0, today: 0 };
    byCorridor[c].views++;
    if (dayKey(e.t) === today) byCorridor[c].today++;
  }

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const k = dayKey(Date.now() - i * 86400000);
    days.push({ day: k, views: pages.filter((e) => dayKey(e.t) === k).length });
  }

  const uniq = (list) => new Set(list.map((e) => e.u || e.v).filter(Boolean)).size;
  const scrapeMs = scrapes.map((e) => e.d);
  const servedMs = served.map((e) => e.d);

  return {
    totalViews: pages.length,                                   // 누적 view
    todayViews: pages.filter((e) => dayKey(e.t) === today).length,
    uniqueTotal: uniq(pages),
    uniqueToday: uniq(pages.filter((e) => dayKey(e.t) === today)),
    apiCalls: events.filter((e) => e.k === "api").length,
    scrape: { n: scrapeMs.length, avg: Math.round(avg(scrapeMs)), p95: Math.round(pct(scrapeMs, 95)) },
    cachedServe: { n: servedMs.length, avg: Math.round(avg(servedMs)) },
    byCorridor,
    days,
    since: events[0]?.t ?? null,
  };
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export function renderStats(s, names = {}) {
  if (!s) {
    return page({
      title: "Usage stats",
      wrapClass: "md",
      body: `${siteHeader({ title: "Usage stats", sub: "No usage recorded yet.", active: "stats" })}
             <div class="panel"><p class="sub" style="margin:0">Open the dashboard to start collecting events.</p></div>`,
    });
  }
  const maxDay = Math.max(1, ...s.days.map((d) => d.views));
  const bars = s.days.map((d) =>
    `<div class="bar"><div class="fill" style="height:${Math.round((d.views / maxDay) * 100)}%"></div>
     <span class="n">${d.views}</span><span class="d">${d.day.slice(5)}</span></div>`).join("");

  const rows = Object.entries(s.byCorridor).sort((a, b) => b[1].views - a[1].views).map(([c, v]) =>
    `<tr><td>${esc(names[c] || c)}</td><td class="num">${v.today}</td><td class="num">${v.views}</td></tr>`).join("");

  const card = (label, value, sub = "") =>
    `<div class="card"><div class="lbl">${label}</div><div class="val">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;

  const extraCss = `
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:18px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}
  .lbl{color:var(--muted);font-size:12.5px}
  .val{font-size:26px;font-weight:700;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
  h2{font-size:15px;margin:20px 0 8px}
  .chart{display:flex;gap:8px;align-items:flex-end;height:130px;background:var(--card);
         border:1px solid var(--line);border-radius:14px;padding:12px}
  .bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}
  .fill{width:100%;background:var(--accent);border-radius:6px 6px 0 0;min-height:3px;opacity:.85}
  .n{font-size:11px;color:var(--muted);margin-top:4px}
  .d{font-size:10.5px;color:var(--muted)}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);
        border-radius:14px;overflow:hidden}
  th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;font-size:14px}
  th{color:var(--muted);font-weight:600;font-size:12.5px}
  tr:last-child td{border-bottom:none}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  `;

  const body = `
${siteHeader({
    title: "Usage stats",
    sub: `since ${esc((s.since || "").slice(0, 16).replace("T", " "))}`,
    active: "stats",
    stats: {
      cards: [
        { k: "Opened today", v: s.todayViews.toLocaleString(), d: "var(--good)" },
        { k: "Unique today", v: s.uniqueToday.toLocaleString(), d: "#3a86ff" },
        { k: "API calls", v: s.apiCalls.toLocaleString(), d: "var(--brand)" },
        { k: "Avg result", v: s.scrape.n ? `${s.scrape.avg}ms` : "—", d: "var(--warn)" },
      ],
      totals: [
        { k: "Total views", v: s.totalViews.toLocaleString() },
        { k: "Unique", v: s.uniqueTotal.toLocaleString() },
      ],
    },
  })}

<div class="grid">
  ${card("누적 view (total)", s.totalViews.toLocaleString(), `${s.uniqueTotal} unique visitors`)}
  ${card("Opened today", s.todayViews.toLocaleString(), `${s.uniqueToday} unique today`)}
  ${card("Time to get result", s.scrape.n ? s.scrape.avg + " ms" : "—", s.scrape.n ? `p95 ${s.scrape.p95} ms · ${s.scrape.n} live scrapes` : "no scrapes yet")}
  ${card("Served from cache", s.cachedServe.n ? s.cachedServe.avg + " ms" : "—", `${s.cachedServe.n} hits`)}
</div>

<h2>Last 7 days</h2>
<div class="chart">${bars}</div>

<h2>By corridor</h2>
<table><tr><th>Corridor</th><th class="num">Today</th><th class="num">Total</th></tr>${rows}</table>`;

  const footNote = `<span>API calls (Excel / Power Automate): ${s.apiCalls.toLocaleString()}</span>`;
  return page({ title: "Usage stats", body, extraCss, wrapClass: "md", footNote });
}
