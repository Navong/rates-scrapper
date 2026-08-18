// Shared corridor cache + background warmer.
//
// Layers:
//   1. in-memory Map (globalThis singleton)  — the hot path every request reads.
//   2. Redis (when REDIS_URL is set)          — durable + shared across instances.
//   3. rank-cache.json                        — FALLBACK persistence only when
//                                               Redis is disabled (dev / no Redis).
//
// Multi-instance: exactly one instance runs the warmer (a Redis "leader" lock);
// followers serve from the shared Redis copy and never duplicate-scrape (a
// per-corridor Redis lock guards on-demand scrapes too). With no Redis the app
// is a single instance and everything falls back to in-memory + the JSON file.

import { readFileSync, existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { collectRates, buildBasesPayload } from "./scrape";
import { collectCountry } from "./providers";
import { getCountry, countryList } from "./countries";
import { redisEnabled, pingOK, jget, jset, withLock, isLeader } from "./redis";
import { recordRateSnapshot } from "./rate-history";

const CACHE_TTL = Number(process.env.CACHE_TTL ?? 240) * 1000; // identical request cached
const MAX_STALE = Number(process.env.MAX_STALE ?? 900) * 1000; // never serve older than this
const REDIS_ENTRY_TTL = Math.max(3600, Math.round(MAX_STALE / 1000) * 8); // seconds; dead corridors self-expire

const STATE_DIR = process.env.STATE_DIR || ".";
const CACHE_FILE = join(STATE_DIR, "rank-cache.json");
const RKEY = (code) => `rank:${code}`;            // per-corridor Redis key
const SCRAPE_LOCK = (code) => `lock:scrape:${code}`;
const WARMER_LEADER = "warmer:leader";

const G = globalThis as any;
const S = (G.__rateState ??= {
  rankCache: new Map(),        // code -> { at, records, errors }
  inflight: new Map(),         // code -> Promise (single-flight, per process)
  ratesCache: { at: 0, data: null }, // /rates Cambodia payload
  dirty: new Set(),            // codes pending a Redis write
  warmerStarted: false,
  loaded: false,
});

// Restore from the JSON file ONLY when Redis is off (Redis restore is async,
// below). Keeps dev / no-Redis coming up warm exactly as before.
if (!S.loaded && !redisEnabled()) {
  S.loaded = true;
  try {
    if (existsSync(CACHE_FILE)) {
      const raw = JSON.parse(readFileSync(CACHE_FILE, "utf8").replace(/^﻿/, ""));
      for (const [code, entry] of Object.entries(raw || {}) as any) {
        if (entry && Array.isArray(entry.records)) S.rankCache.set(code, entry);
      }
      if (S.rankCache.size) console.log(`Cache: restored ${S.rankCache.size} corridors from disk (warm on boot)`);
    }
  } catch (e: any) {
    console.error("cache restore failed:", e.message);
  }
}

/** Load the warm corridor cache from Redis into memory once (call at boot). */
export async function initCacheFromRedis() {
  if (S.loaded || !redisEnabled()) return;
  if (!(await pingOK())) { console.warn("Cache: Redis unreachable at boot — starting cold (in-memory)"); return; }
  S.loaded = true;
  let n = 0;
  for (const c of countryList()) {
    const entry = await jget(RKEY(c.code));
    if (entry && Array.isArray((entry as any).records)) { S.rankCache.set(c.code, entry); n++; }
  }
  if (n) console.log(`Cache: restored ${n} corridors from Redis (warm on boot)`);
}

// Debounced flush of dirty corridors → Redis (per-key) or the JSON file.
let persistTimer: any = null;
function persistSoon() {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    const codes = [...S.dirty]; S.dirty.clear();
    try {
      if (redisEnabled()) {
        for (const code of codes) {
          const entry = S.rankCache.get(code);
          if (entry) await jset(RKEY(code), entry, REDIS_ENTRY_TTL);
        }
      } else {
        await mkdir(STATE_DIR, { recursive: true });
        await writeFile(CACHE_FILE, JSON.stringify(Object.fromEntries(S.rankCache)));
      }
    } catch (e: any) {
      console.error("cache persist failed:", e.message);
    }
  }, 1500);
}

export const rankCacheState = () => S.rankCache;
export const inflightSize = () => S.inflight.size;

/** Non-blocking peek: the cached corridor entry if warm, else null (no scrape).
 *  Lets a server component seed initial data only when it's instantly available. */
export const getCached = (code) => S.rankCache.get(code) || null;

/** Pull a corridor from Redis into memory if Redis holds a NEWER entry than we
 *  do (this is how a follower instance picks up the leader's fresh scrapes). */
async function syncFromRedis(code) {
  if (!redisEnabled()) return S.rankCache.get(code) || null;
  const remote: any = await jget(RKEY(code));
  const local = S.rankCache.get(code);
  if (remote && Array.isArray(remote.records) && (!local || remote.at > local.at)) {
    S.rankCache.set(code, remote);
    return remote;
  }
  return local || remote || null;
}

// The actual scrape + carry-forward + store. Guarded by a Redis lock (via the
// caller) so two instances never scrape the same corridor at once.
async function doScrape(country, fresh) {
  const code = country.code;
  const { records, errors } = await collectCountry(country, { fresh });
  const now = Date.now();
  for (const r of records) r._at = now;

  // Last-known-good: carry a recent value forward when a provider misses this
  // run (bounded by MAX_STALE) so a transient miss never blanks the row/anchor.
  const prev = S.rankCache.get(code);
  const key = (r) => `${r.provider}/${r.method}`;
  let covered: any = null;
  if (prev?.records?.length) {
    const have = new Set(records.map(key));
    const carried: string[] = [];
    for (const r of prev.records) {
      if (country.providers[r.provider] && !country.providers[r.provider].manual && !have.has(key(r)) && r._at && now - r._at < MAX_STALE) {
        records.push({ ...r, carried: true });
        carried.push(key(r));
      }
    }
    if (carried.length) {
      covered = new Set();
      for (const k of carried) { covered.add(k); covered.add(k.split("/")[0]); }
    }
  }
  const finalErrors = covered ? errors.filter((e) => !covered.has(e.who)) : errors;

  // Record after bounded carry-forward. A provider that misses the exact
  // 30-minute sampling scrape can then reuse its recent verified value instead
  // of leaving an artificial hole in the graph. Longer outages still produce
  // gaps because carry-forward is capped by MAX_STALE.
  await recordRateSnapshot(country, records, now).catch((e) =>
    console.error(`history write ${code} failed:`, e.message)
  );

  const entry = { at: now, records, errors: finalErrors };
  S.rankCache.set(code, entry);
  S.dirty.add(code);
  persistSoon();
  return entry;
}

/** Scrape a corridor once per process (single-flight) AND once cluster-wide
 *  (Redis lock). If another instance holds the scrape lock, adopt the value it
 *  writes to Redis instead of scraping again. */
function refreshCountry(country, fresh) {
  const code = country.code;
  const pending = S.inflight.get(code);
  if (pending) return pending;

  const run = (async () => {
    // withLock returns null if another instance is already scraping this corridor.
    const got = await withLock(SCRAPE_LOCK(code), 30000, () => doScrape(country, fresh));
    if (got !== null) return got;

    // Someone else is scraping — poll Redis briefly for their fresh result.
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const remote: any = await syncFromRedis(code);
      if (remote && Date.now() - remote.at < CACHE_TTL) return remote;
    }
    // Nothing arrived (cold start race) — scrape unguarded as a last resort.
    return doScrape(country, fresh);
  })().finally(() => S.inflight.delete(code));

  S.inflight.set(code, run);
  return run;
}

/**
 * Cache policy (per instance, over the shared Redis copy):
 *   fresh          → scrape now (single-flight + cluster lock)
 *   young          → HIT
 *   stale          → serve stale instantly + refresh in the background (SWR)
 *   too old / cold → wait for a scrape (or a peer's fresh Redis entry)
 */
export async function getCountryRecords(country, fresh) {
  if (fresh) return { ...(await refreshCountry(country, true)), cached: false, stale: false };

  // Adopt a newer Redis entry first, so a follower serves the leader's fresh data.
  const hit = await syncFromRedis(country.code);
  const age = hit ? Date.now() - hit.at : Infinity;

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
  const corridors: any = {};
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
// of corridors × time — never of how many people use the app. Exactly ONE
// instance warms (Redis leader lock); with no Redis, this instance is leader.
export function startWarmer() {
  if (S.warmerStarted) return;
  if (process.env.WARMER === "off") { console.log("Warmer: disabled (WARMER=off)"); S.warmerStarted = true; return; }
  const codes = countryList().map((c) => c.code);
  if (!codes.length || !CACHE_TTL) return;
  S.warmerStarted = true;

  const every = Math.max(5000, Math.floor(CACHE_TTL / codes.length));
  const leaderTtl = Math.ceil(every / 1000) + 20; // must outlast the gap between renewals
  let i = 0;
  let wasLeader: boolean | null = null;

  const tick = async () => {
    // Renew/attempt leadership every tick; only the leader scrapes.
    const leader = await isLeader(WARMER_LEADER, leaderTtl);
    if (leader !== wasLeader) {
      console.log(`Warmer: this instance is ${leader ? "LEADER (scraping)" : "a follower (idle; serving shared cache)"}`);
      wasLeader = leader;
    }
    if (!leader) return;

    const country = getCountry(codes[i++ % codes.length]);
    try {
      const t0 = Date.now();
      const { errors } = await refreshCountry(country, false);
      console.log(`[warm] ${country.code} ${Date.now() - t0}ms failed=${errors.map((e) => `${e.who} (${e.error})`).join("; ") || "none"}`);
    } catch (e: any) {
      console.error(`[warm] ${country.code} failed:`, e.message);
    }
  };

  setTimeout(tick, 3000);
  setInterval(tick, every);
  console.log(`Warmer: ${codes.length} corridors, one every ${Math.round(every / 1000)}s (full cycle ${Math.round(CACHE_TTL / 1000)}s)${redisEnabled() ? " · leader-gated" : ""}`);
}
