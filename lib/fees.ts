// Per-corridor service-fee overrides. The corridor config (countries.mjs) sets
// each provider/method's default fee; this store lets those be edited from the UI
// without a code change. An override always wins over the config default.
//
//   store = { KH: { GME: { BANK: 5000, WALLET: 5000 }, … }, … }
//
// Unlike manual RATES, fees are stable configuration — no TTL, no expiry. A saved
// fee persists until changed. Applied at render time (ranking.mjs), so a change
// takes effect on the next request with no re-scrape.

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { redisEnabled, jget, jset, rpushCapped, publish, subscribe } from "./redis";

const STATE_DIR = process.env.STATE_DIR || ".";
const FILE = join(STATE_DIR, "fees.json");
const AUDIT = join(STATE_DIR, "fees-audit.jsonl");
const FKEY = "fees";
const FAUDIT = "fees-audit";
const FCHANNEL = "fees:changed";
const AUDIT_CAP = 5000;

let store = {}; // { code: { provider: { method: number } } }

// Strip a possible UTF-8 BOM (PowerShell-touched files) before parsing.
const readJson = (f) => JSON.parse(readFileSync(f, "utf8").replace(/^﻿/, ""));

(function load() {
  try {
    if (existsSync(FILE)) store = readJson(FILE);
  } catch (e: any) {
    console.error("fee store load failed:", e.message);
  }
})();

/** Hydrate fees from Redis + subscribe to cross-instance edits. No-op without Redis. */
export async function initFees() {
  if (!redisEnabled()) return;
  const remote = await jget<any>(FKEY);
  if (remote && typeof remote === "object") store = remote;
  else await jset(FKEY, store); // first run → seed from file
  subscribe(FCHANNEL, async () => { const s = await jget<any>(FKEY); if (s) store = s; });
}

function persist() {
  if (redisEnabled()) { jset(FKEY, store); publish(FCHANNEL, { t: Date.now() }); return; }
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch (e: any) {
    console.error("fee store save failed:", e.message);
  }
}

function audit(entry) {
  if (redisEnabled()) rpushCapped(FAUDIT, entry, AUDIT_CAP);
  else try { appendFileSync(AUDIT, JSON.stringify(entry) + "\n"); } catch { /* best-effort */ }
}

export const getFeeStore = () => store;

/** @returns {number|undefined} the override, or undefined when none is set. */
export const getFeeOverride = (code, prov, method) => store?.[code]?.[prov]?.[method];

/** Effective fee: override wins over the corridor config default (0 is valid). */
export const feeFor = (code, prov, method, cfgFee) => {
  const o = getFeeOverride(code, prov, method);
  return o == null ? (cfgFee ?? 0) : o;
};

export function setFee(code, prov, method, value, by = "") {
  const prev = getFeeOverride(code, prov, method);
  store[code] = store[code] || {};
  store[code][prov] = store[code][prov] || {};
  store[code][prov][method] = value;
  persist();
  audit({ t: new Date().toISOString(), code, prov, method, from: prev ?? null, to: value, by });
}

/** Remove an override so the row falls back to the config default. */
export function clearFee(code, prov, method) {
  if (store?.[code]?.[prov] && method in store[code][prov]) {
    delete store[code][prov][method];
    persist();
  }
}
