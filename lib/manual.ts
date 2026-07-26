// Manual provider rates (Sentbe, FoneMoney, Cross, Hana EZ) — the ones with no
// public rate API. Stored with a timestamp so an old typed value can never
// masquerade as live data.
//
//   fresh   : younger than MANUAL_TTL (30m)    → shown normally
//   expired : older than MANUAL_TTL            → shown as "-" (must be re-entered)
//   unset   : never entered                    → shown as "-", flagged on the form
//
// The value must be refreshed every 30 minutes. Once it lapses we no longer trust the
// number for the Price gap column, so the sheet renders "-" instead of guessing.

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { COUNTRIES } from "./countries";
import { redisEnabled, jget, jset, rpushCapped, publish, subscribe } from "./redis";

// Manual rates are stored per payout method, because a provider (e.g. Sentbe in
// Cambodia) can quote a different rate for Bank Deposit vs Cash Payment.
//   store = { KH: { SENTBE: { BANK: {value,at,by}, WALLET: {value,at,by} } } }
const methodsOf = (code) => (COUNTRIES[code]?.methods || []).map((m) => m.key);

const STATE_DIR = process.env.STATE_DIR || ".";
const FILE = join(STATE_DIR, "manual.json");
const LEGACY = join(STATE_DIR, "sentbe.json");
const AUDIT = join(STATE_DIR, "manual-audit.jsonl");
// Redis keys (used when REDIS_URL is set — shared across instances).
const MKEY = "manual";
const MAUDIT = "manual-audit";
const MCHANNEL = "manual:changed";
const AUDIT_CAP = 5000;

const manualTtlMinutes = process.env.MANUAL_TTL_MINUTES != null
  ? Number(process.env.MANUAL_TTL_MINUTES)
  // Keep an explicitly configured legacy deployment working.
  : process.env.MANUAL_TTL_HOURS != null
    ? Number(process.env.MANUAL_TTL_HOURS) * 60
    : 30;
export const MANUAL_TTL = manualTtlMinutes * 60_000;
// Past the window the value is untrusted. No separate "stale" grace band — once
// 30 minutes lapse, it's expired and the sheet shows "-" until it's re-entered.
export const MANUAL_EXPIRE = MANUAL_TTL;
/** Reject entries deviating more than this % from the scraped peers. */
export const MAX_DEVIATION_PCT = Number(process.env.MANUAL_DEVIATION_PCT ?? 3);

// Next dev compiles instrumentation and route handlers into separate module
// graphs. A global store keeps both graphs (and hot reloads) on the same
// Redis-hydrated object.
const S = (globalThis as any).__manualState ??= { store: {} };
// shape: { KH: { SENTBE: { BANK: {value,at,by}, WALLET: {value,at,by} } } }

// Bring older shapes forward to the per-method map:
//   - bare number            → { [each method]: {value, at:null, by:""} }
//   - { value, at, by }      → { [each method]: that entry }   (replicated)
//   - { BANK:{…}, WALLET:{…} } → kept as-is (already per-method)
function migrate(raw) {
  const out = {};
  for (const [code, provs] of Object.entries(raw || {})) {
    out[code] = {};
    for (const [prov, v] of Object.entries(provs || {})) {
      if (v && typeof v === "object" && !("value" in v)) {
        out[code][prov] = v; // already per-method
        continue;
      }
      const entry = typeof v === "number" ? { value: v, at: null, by: "" } : v;
      const keys = methodsOf(code);
      out[code][prov] = {};
      for (const m of (keys.length ? keys : ["ALL"])) out[code][prov][m] = { ...entry };
    }
  }
  return out;
}

// A UTF-8 BOM (e.g. a file touched by PowerShell) makes JSON.parse throw, which
// would silently wipe every manual rate. Strip it before parsing.
const readJson = (f) => JSON.parse(readFileSync(f, "utf8").replace(/^﻿/, ""));

// Initial load from the local file. When Redis is the source of truth this is
// just a migration seed (initManual overwrites from Redis, or seeds Redis with
// it on first run). With no Redis it's the live store, so a corrupt file still
// fails loudly rather than silently serving a table with no manual rows.
(function load() {
  try {
    if (existsSync(FILE)) S.store = migrate(readJson(FILE));
    else if (existsSync(LEGACY)) {
      const old = readJson(LEGACY); // { bd, cp }
      if (old?.bd) S.store = migrate({ KH: { SENTBE: { value: old.bd, at: null, by: "" } } });
    }
  } catch (e: any) {
    console.error("manual store file load failed:", e.message);
    if (!redisEnabled()) throw e; // no Redis → this file IS the store; don't start empty
  }
})();

/** Hydrate the in-memory store from Redis (shared source of truth) and subscribe
 *  to cross-instance edits. Call once at boot; no-op without Redis. */
export async function initManual() {
  if (!redisEnabled()) return;
  const remote = await jget<any>(MKEY);
  if (remote && typeof remote === "object") S.store = remote; // Redis wins
  else await jset(MKEY, S.store);                              // first run → seed from file
  // Another instance edited a rate → reload our copy.
  subscribe(MCHANNEL, async () => { const next = await jget<any>(MKEY); if (next) S.store = next; });
}

function persist() {
  if (redisEnabled()) { jset(MKEY, S.store); publish(MCHANNEL, { t: Date.now() }); return; }
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(S.store, null, 2));
  } catch (e: any) {
    console.error("manual store save failed:", e.message);
  }
}

export const getStore = () => S.store;
export const getEntry = (code, prov, method) => S.store?.[code]?.[prov]?.[method] ?? null;

/** @returns {{status:"unset"|"fresh"|"stale"|"expired", ageMs:number|null, at:string|null}} */
export function statusOf(entry) {
  if (!entry || entry.value == null || isNaN(entry.value)) return { status: "unset", ageMs: null, at: null };
  if (!entry.at) return { status: "stale", ageMs: null, at: null }; // migrated: age unknown → treat as stale
  const ageMs = Date.now() - new Date(entry.at).getTime();
  if (ageMs > MANUAL_EXPIRE) return { status: "expired", ageMs, at: entry.at };
  if (ageMs > MANUAL_TTL) return { status: "stale", ageMs, at: entry.at };
  return { status: "fresh", ageMs, at: entry.at };
}

/** Expired values must not reach the ranking. */
export const usable = (entry) => statusOf(entry).status !== "expired" && statusOf(entry).status !== "unset";

export function setEntry(code, prov, method, value, by = "") {
  const prev = getEntry(code, prov, method);
  S.store[code] = S.store[code] || {};
  S.store[code][prov] = S.store[code][prov] || {};
  S.store[code][prov][method] = { value, at: new Date().toISOString(), by };
  persist();
  const audit = { t: new Date().toISOString(), code, prov, method, from: prev?.value ?? null, to: value, by };
  if (redisEnabled()) rpushCapped(MAUDIT, audit, AUDIT_CAP);
  else try { appendFileSync(AUDIT, JSON.stringify(audit) + "\n"); } catch { /* audit is best-effort */ }
  return S.store[code][prov][method];
}

export function humanAge(ageMs) {
  if (ageMs == null) return "unknown";
  const m = Math.floor(ageMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Sanity-check a typed base against the corridor's live scraped peers.
 * Catches the dropped/extra digit that would silently wreck the Price gap column.
 * @returns {null | { pct:number, median:number }} null = looks fine
 */
export function deviation(value, peerPrincipals) {
  const peers = peerPrincipals.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (peers.length < 2) return null; // nothing to compare against
  const mid = Math.floor(peers.length / 2);
  const median = peers.length % 2 ? peers[mid] : (peers[mid - 1] + peers[mid]) / 2;
  const pct = ((value - median) / median) * 100;
  return Math.abs(pct) > MAX_DEVIATION_PCT ? { pct, median } : null;
}
