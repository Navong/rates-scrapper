// Seven-day history for automatically scraped rates.
// Redis deployments keep one capped list per corridor. Single-instance setups
// fall back to one compact JSONL file per corridor under STATE_DIR.

import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redisEnabled, rpushCapped, ltail } from "./redis";

const STATE_DIR = process.env.STATE_DIR || ".";
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SNAPSHOT_INTERVAL_MS = 30 * 60 * 1000;   // sample history every 30 minutes
const REDIS_CAP = 400;                         // ≈ 8 days of 30-minute snapshots
const RKEY = (code) => `rate-history:${code}`;
const FILE = (code) => join(STATE_DIR, `rate-history-${code}.jsonl`);
const lastCompact = new Map();
const lastSnapshot = new Map();

const finite = (value) => Number.isFinite(Number(value));

export async function recordRateSnapshot(country, records, at = Date.now()) {
  // The warmer scrapes often to keep the live cache fresh, but history only needs
  // periodic points — sample at most once per SNAPSHOT_INTERVAL_MS per corridor.
  if (at - (lastSnapshot.get(country.code) || 0) < SNAPSHOT_INTERVAL_MS) return;

  const rows = records
    .filter((r) => !r.carried && !country.providers[r.provider]?.manual)
    .filter((r) => finite(r.sendTotalKRW) && finite(r.rate))
    .map((r) => ({
      p: r.provider,
      m: r.method,
      total: Math.round(Number(r.sendTotalKRW)),
      rate: Number(r.rate),
    }));
  if (!rows.length) return;
  lastSnapshot.set(country.code, at);

  const snapshot = { t: at, rows };
  if (redisEnabled()) {
    await rpushCapped(RKEY(country.code), snapshot, REDIS_CAP);
    return;
  }

  await mkdir(STATE_DIR, { recursive: true });
  await appendFile(FILE(country.code), JSON.stringify(snapshot) + "\n");

  // Keep fallback files bounded without rewriting on every warm cycle.
  if (at - (lastCompact.get(country.code) || 0) > 6 * 60 * 60 * 1000) {
    lastCompact.set(country.code, at);
    compactFile(country.code, at - WINDOW_MS).catch((e) =>
      console.error(`history compact ${country.code} failed:`, e.message)
    );
  }
}

async function readSnapshots(code) {
  if (redisEnabled()) return ltail(RKEY(code), REDIS_CAP);
  try {
    const raw = await readFile(FILE(code), "utf8");
    return raw.split("\n").flatMap((line) => {
      if (!line.trim()) return [];
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } catch {
    return [];
  }
}

async function compactFile(code, cutoff) {
  const snapshots = (await readSnapshots(code)).filter((s) => Number(s.t) >= cutoff);
  const tmp = FILE(code) + ".tmp";
  await writeFile(tmp, snapshots.map((s) => JSON.stringify(s)).join("\n") + (snapshots.length ? "\n" : ""));
  await rename(tmp, FILE(code));
}

export async function readRateHistory(country, method, range = "today") {
  const now = Date.now();
  // "Today" is intentionally a rolling 24-hour window. A calendar-midnight
  // cutoff makes the graph appear to lose all history at 00:00 and leaves only
  // one point, which an area chart cannot visibly draw.
  const cutoff = range === "today" ? now - 24 * 60 * 60 * 1000 : now - WINDOW_MS;
  const snapshots = (await readSnapshots(country.code))
    .filter((s) => Number(s.t) >= cutoff && Array.isArray(s.rows))
    .sort((a, b) => Number(a.t) - Number(b.t));

  // Bucket both new and previously collected denser history into consistent
  // 30-minute points. Since snapshots are sorted, the latest value wins.
  const bucketMs = SNAPSHOT_INTERVAL_MS;
  const buckets = new Map();
  for (const snap of snapshots) {
    const t = Math.floor(Number(snap.t) / bucketMs) * bucketMs;
    for (const row of snap.rows) {
      if (row.m !== method || !finite(row.total)) continue;
      buckets.set(`${row.p}:${t}`, { t, v: Number(row.total), rate: Number(row.rate) });
    }
  }

  const providers = (Object.entries(country.providers) as Array<[string, any]>)
    .filter(([, cfg]) => !cfg.manual)
    .filter(([, cfg]) => !cfg.methods || cfg.methods.includes(method))
    .map(([key, cfg]) => ({
      key,
      label: cfg.label || key.replaceAll("_", " "),
      points: [...buckets.entries()]
        .filter(([id]) => id.startsWith(`${key}:`))
        .map(([, point]) => point)
        .sort((a, b) => a.t - b.t),
    }))
    .filter((p) => p.points.length);

  return {
    country: country.code,
    currency: country.currency,
    method,
    range: range === "today" ? "today" : "7d",
    from: cutoff,
    to: now,
    providers,
    snapshots: new Set([...buckets.values()].map((point) => point.t)).size,
  };
}
