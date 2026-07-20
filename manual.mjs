// Manual provider rates (Sentbe, FoneMoney, Cross, Hana EZ) — the ones with no
// public rate API. Stored with a timestamp so a value typed an hour ago can never
// masquerade as live data.
//
//   fresh   : younger than MANUAL_TTL (1h)     → shown normally
//   expired : older than MANUAL_TTL            → shown as "-" (must be re-entered)
//   unset   : never entered                    → shown as "-", flagged on the form
//
// The value must be refreshed every hour. Once it lapses we no longer trust the
// number for the Price gap column, so the sheet renders "-" instead of guessing.

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { COUNTRIES } from "./countries.mjs";

// Manual rates are stored per payout method, because a provider (e.g. Sentbe in
// Cambodia) can quote a different rate for Bank Deposit vs Cash Payment.
//   store = { KH: { SENTBE: { BANK: {value,at,by}, WALLET: {value,at,by} } } }
const methodsOf = (code) => (COUNTRIES[code]?.methods || []).map((m) => m.key);

const STATE_DIR = process.env.STATE_DIR || ".";
const FILE = join(STATE_DIR, "manual.json");
const LEGACY = join(STATE_DIR, "sentbe.json");
const AUDIT = join(STATE_DIR, "manual-audit.jsonl");

export const MANUAL_TTL = Number(process.env.MANUAL_TTL_HOURS ?? 1) * 3600_000;
// Past the window the value is untrusted. No separate "stale" grace band — once
// an hour lapses it's expired and the sheet shows "-" until it's re-entered.
export const MANUAL_EXPIRE = MANUAL_TTL;
/** Reject entries deviating more than this % from the scraped peers. */
export const MAX_DEVIATION_PCT = Number(process.env.MANUAL_DEVIATION_PCT ?? 3);

let store = {}; // { KH: { SENTBE: { BANK: {value,at,by}, WALLET: {value,at,by} } } }

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

(function load() {
  try {
    if (existsSync(FILE)) store = migrate(readJson(FILE));
    else if (existsSync(LEGACY)) {
      const old = readJson(LEGACY); // { bd, cp }
      if (old?.bd) store = migrate({ KH: { SENTBE: { value: old.bd, at: null, by: "" } } });
    }
  } catch (e) {
    console.error("manual store load FAILED — refusing to start with an empty store:", e.message);
    throw e; // fail loudly rather than silently serve a table with no manual rows
  }
})();

function persist() {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error("manual store save failed:", e.message);
  }
}

export const getStore = () => store;
export const getEntry = (code, prov, method) => store?.[code]?.[prov]?.[method] ?? null;

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
  store[code] = store[code] || {};
  store[code][prov] = store[code][prov] || {};
  store[code][prov][method] = { value, at: new Date().toISOString(), by };
  persist();
  try {
    appendFileSync(AUDIT, JSON.stringify({ t: new Date().toISOString(), code, prov, method, from: prev?.value ?? null, to: value, by }) + "\n");
  } catch { /* audit is best-effort */ }
  return store[code][prov][method];
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
