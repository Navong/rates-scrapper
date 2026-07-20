// Shared corridor cache + background warmer, extracted from the legacy
// server.mjs so the Next.js route handlers, pages and the instrumentation hook
// all share ONE set of in-memory singletons.
//
// Next re-evaluates modules on hot reload (dev) and may load a module more than
// once, so the state is pinned to globalThis — there is exactly one rankCache,
// one in-flight map and one warmer per Node process.

import { readFileSync, existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { collectRates, buildBasesPayload } from "../scrape.mjs";
import { collectCountry } from "../providers.mjs";
import { getCountry, countryList } from "../countries.mjs";

const CACHE_TTL = Number(process.env.CACHE_TTL ?? 240) * 1000; // identical request cached
const MAX_STALE = Number(process.env.MAX_STALE ?? 900) * 1000; // never serve older than this

const STATE_DIR = process.env.STATE_DIR || ".";
const CACHE_FILE = join(STATE_DIR, "rank-cache.json");

const G = globalThis;
const S = (G.__rateState ??= {
  rankCache: new Map(),        // code -> { at, records, errors }
  inflight: new Map(),         // code -> Promise (single-flight)
  ratesCache: { at: 0, data: null }, // /rates Cambodia payload
  warmerStarted: false,
  loaded: false,
});

// Restore the corridor cache from disk once per process, so a restart comes up
// WARM (serves the last rates instantly; the warmer/SWR refreshes them in the
// background) instead of cold-scraping every corridor on first visit.
if (!S.loaded) {
  S.loaded = true;
  try {
    if (existsSync(CACHE_FILE)) {
      const raw = JSON.parse(readFileSync(CACHE_FILE, "utf8").replace(/^﻿/, ""));
      for (const [code, entry] of Object.entries(raw || {})) {
        if (entry && Array.isArray(entry.records)) S.rankCache.set(code, entry);
      }
      if (S.rankCache.size) console.log(`Cache: restored ${S.rankCache.size} corridors from disk (warm on boot)`);
    }
  } catch (e) {
    console.error("cache restore failed:", e.message);
  }
}

// Debounced write of the whole corridor cache after a refresh.
let persistTimer = null;
function persistSoon() {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try {
      await mkdir(STATE_DIR, { recursive: true });
      await writeFile(CACHE_FILE, JSON.stringify(Object.fromEntries(S.rankCache)));
    } catch (e) {
      console.error("cache persist failed:", e.message);
    }
  }, 1500);
}

export const rankCacheState = () => S.rankCache;
export const inflightSize = () => S.inflight.size;

/** Non-blocking peek: the cached corridor entry if warm, else null (no scrape).
 *  Lets a server component seed initial data only when it's instantly available. */
export const getCached = (code) => S.rankCache.get(code) || null;

/** Scrape a corridor once, no matter how many callers ask concurrently. */
function refreshCountry(country, fresh) {
  const code = country.code;
  const pending = S.inflight.get(code);
  if (pending) return pending;

  const p = collectCountry(country, { fresh })
    .then(({ records, errors }) => {
      const now = Date.now();
      for (const r of records) r._at = now; // stamp each fresh fetch

      // Last-known-good: if a provider/method failed this run but we held a
      // recent value, carry it forward (bounded by MAX_STALE) rather than
      // blanking the competitor — a transient GME miss no longer drops the
      // anchor. Any error we can cover this way is cleared from the run.
      const prev = S.rankCache.get(code);
      const key = (r) => `${r.provider}/${r.method}`;
      let covered = null;
      if (prev?.records?.length) {
        const have = new Set(records.map(key));
        const carried = [];
        for (const r of prev.records) {
          if (country.providers[r.provider] && !have.has(key(r)) && r._at && now - r._at < MAX_STALE) {
            records.push({ ...r, carried: true }); // keeps its original _at → bounded
            carried.push(key(r));
          }
        }
        if (carried.length) {
          // Errors report `who` as either "PROVIDER/METHOD" (per-method fetchers)
          // or the bare "PROVIDER" (single-rate providers like SBI). Cover both
          // forms so a carried value also clears its "unavailable" warning.
          covered = new Set();
          for (const k of carried) { covered.add(k); covered.add(k.split("/")[0]); }
        }
      }
      const finalErrors = covered ? errors.filter((e) => !covered.has(e.who)) : errors;

      const entry = { at: now, records, errors: finalErrors };
      S.rankCache.set(code, entry);
      persistSoon(); // keep a warm snapshot on disk for the next restart
      return entry;
    })
    .finally(() => S.inflight.delete(code));

  S.inflight.set(code, p);
  return p;
}

/**
 * Cache policy:
 *   fresh          → scrape now (still single-flight)
 *   young          → HIT
 *   stale          → serve stale instantly + refresh in the background (SWR)
 *   too old / cold → wait for a scrape
 */
export async function getCountryRecords(country, fresh) {
  const hit = S.rankCache.get(country.code);
  const age = hit ? Date.now() - hit.at : Infinity;

  if (fresh) return { ...(await refreshCountry(country, true)), cached: false, stale: false };
  if (hit && age < CACHE_TTL) return { ...hit, cached: true, stale: false };
  if (hit && age < MAX_STALE) {
    refreshCountry(country, false).catch((e) => console.error("bg refresh failed:", e.message));
    return { ...hit, cached: true, stale: true };
  }
  return { ...(await refreshCountry(country, false)), cached: false, stale: false };
}

/** Force the next /ranking read for a corridor to re-pick-up manual edits. */
export function invalidateCountry(code) {
  S.rankCache.delete(code);
}

/** Cambodia base-rate payload for Excel / Power Automate (its own small cache). */
export async function getRatesPayload(fresh) {
  if (!fresh && CACHE_TTL && S.ratesCache.data && Date.now() - S.ratesCache.at < CACHE_TTL) {
    return { data: S.ratesCache.data, cached: true };
  }
  const payload = buildBasesPayload(await collectRates());
  S.ratesCache = { at: Date.now(), data: payload };
  return { data: payload, cached: false };
}

export function healthCorridors() {
  const corridors = {};
  for (const c of countryList()) {
    const hit = S.rankCache.get(c.code);
    corridors[c.code] = hit
      ? { ageSec: Math.round((Date.now() - hit.at) / 1000), failed: hit.errors.map((e) => e.who) }
      : "cold";
  }
  return corridors;
}

// --- Background warmer -------------------------------------------------------
// Refreshes one corridor at a time on a rotation, so upstream load is a function
// of corridors × time — never of how many people are using the app. It also
// spreads GME's calls out, keeping it under its ~6-per-window limit.
export function startWarmer() {
  if (S.warmerStarted) return;
  if (process.env.WARMER === "off") { console.log("Warmer: disabled (WARMER=off)"); S.warmerStarted = true; return; }
  const codes = countryList().map((c) => c.code);
  if (!codes.length || !CACHE_TTL) return;
  S.warmerStarted = true;

  const every = Math.max(5000, Math.floor(CACHE_TTL / codes.length));
  let i = 0;
  const tick = async () => {
    const country = getCountry(codes[i++ % codes.length]);
    try {
      const t0 = Date.now();
      const { errors } = await refreshCountry(country, false);
      console.log(`[warm] ${country.code} ${Date.now() - t0}ms failed=${errors.map((e) => `${e.who} (${e.error})`).join("; ") || "none"}`);
    } catch (e) {
      console.error(`[warm] ${country.code} failed:`, e.message);
    }
  };

  setTimeout(tick, 3000);
  setInterval(tick, every);
  console.log(`Warmer: ${codes.length} corridors, one every ${Math.round(every / 1000)}s (full cycle ${Math.round(CACHE_TTL / 1000)}s)`);
}
