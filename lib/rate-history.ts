// Seven-day history for automatically scraped rates.
// Redis deployments keep one capped list per corridor. Single-instance setups
// fall back to one compact JSONL file per corridor under STATE_DIR.

import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redisEnabled, rpushCapped, ltail } from "./redis";

const STATE_DIR = process.env.STATE_DIR || ".";
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SNAPSHOT_INTERVAL_MS = 30 * 60 * 1000;   // unchanged values still get a 30-minute heartbeat
const REDIS_CAP = 6000;                        // enough for 7 days of change-driven snapshots
const RKEY = (code) => `rate-history:${code}`;
const FILE = (code) => join(STATE_DIR, `rate-history-${code}.jsonl`);
const lastCompact = new Map();
const lastSnapshot = new Map();
const lastSnapshotSignature = new Map();

const finite = (value) => Number.isFinite(Number(value));

export async function recordRateSnapshot(country, records, at = Date.now()) {
  const rows = records
    // Carried values are accepted here only after cache.ts has bounded them by
    // MAX_STALE. This smooths over a transient provider miss at sample time
    // without inventing values across a real outage.
    .filter((r) => !country.providers[r.provider]?.manual)
    .filter((r) => finite(r.sendTotalKRW) && finite(r.rate))
    .map((r) => ({
      p: r.provider,
      m: r.method,
      total: Math.round(Number(r.sendTotalKRW)),
      rate: Number(r.rate),
    }));
  if (!rows.length) return;

  // Capture a point as soon as any provider value changes. When the whole
  // corridor is unchanged, retain a 30-minute heartbeat so flat periods remain
  // represented without storing every warmer scrape.
  const signature = rows
    .slice()
    .sort((a, b) => `${a.p}/${a.m}`.localeCompare(`${b.p}/${b.m}`))
    .map((row) => `${row.p}/${row.m}:${row.total}:${row.rate}`)
    .join("|");
  const unchanged = signature === lastSnapshotSignature.get(country.code);
  if (unchanged && at - (lastSnapshot.get(country.code) || 0) < SNAPSHOT_INTERVAL_MS) return;

  lastSnapshot.set(country.code, at);
  lastSnapshotSignature.set(country.code, signature);

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

  const migration = country.historyMigration;
  const migrationAt = migration
    ? snapshots.find((snapshot) => snapshot.rows.some((row) => row.p === migration.marker))?.t
    : null;

  // Preserve the real collection timestamp. Providers in one scrape share the
  // same timestamp, while rate changes between heartbeats appear immediately.
  const buckets = new Map();
  for (const snap of snapshots) {
    const t = Number(snap.t);
    for (const row of snap.rows) {
      if (row.m !== method || !finite(row.total)) continue;
      const legacy = migrationAt != null && t < Number(migrationAt);
      const provider = legacy ? (migration.aliases?.[row.p] || row.p) : row.p;
      const delta = legacy ? Number(migration.totalDeltaBefore?.[row.p] || 0) : 0;
      buckets.set(`${provider}:${t}`, { t, v: Number(row.total) + delta, rate: Number(row.rate) });
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
