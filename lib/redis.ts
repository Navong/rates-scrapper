// Shared Redis client + small helpers (leader lock, per-key lock, pub/sub).
//
// Redis is OPTIONAL: if REDIS_URL is unset or the server is unreachable, every
// helper degrades to a no-op / null so the app still runs on a single instance
// with in-memory-only state (dev, or a Redis outage). The cache treats Redis as
// a durable + cross-instance layer, never the only copy.
//
// Pinned to globalThis so Next's dev hot-reload / double module load share ONE
// connection per process.

import Redis from "ioredis";

const URL = process.env.REDIS_URL || "";

const G = globalThis as any;
const S = (G.__redisState ??= { client: null as Redis | null, tried: false });

/** The shared client, or null when Redis is disabled/unconfigured. */
export function redis(): Redis | null {
  if (!URL) return null;
  if (S.client || S.tried) return S.client;
  S.tried = true;
  try {
    const c = new Redis(URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      // Offline queue ON (default): commands issued during the brief connect
      // window WAIT for the connection instead of failing — otherwise early
      // writes are lost and locks silently degrade to unguarded. When Redis is
      // genuinely down, commands reject after maxRetriesPerRequest and each
      // helper below catches → degrades to single-instance behaviour.
      connectTimeout: 4000,
      // Reconnect with backoff; never throw the process down on a blip.
      retryStrategy: (times: number) => Math.min(times * 200, 3000),
    });
    c.on("error", (e: Error) => {
      // Log at most occasionally — a down Redis shouldn't spam the log.
      if (Date.now() - (S.lastErr || 0) > 15000) { S.lastErr = Date.now(); console.error("[redis]", e.message); }
    });
    c.on("connect", () => console.log(`[redis] connected ${URL}`));
    S.client = c;
  } catch (e: any) {
    console.error("[redis] init failed:", e.message);
    S.client = null;
  }
  return S.client;
}

export const redisEnabled = () => !!URL;
export const redisReady = () => !!S.client && S.client.status === "ready";

/** Quick reachability probe (bounded) so callers can skip Redis work when it's
 *  down instead of paying the retry budget on every key. */
export async function pingOK(): Promise<boolean> {
  const c = redis();
  if (!c) return false;
  try { return (await c.ping()) === "PONG"; } catch { return false; }
}

/** JSON get/set with graceful failure (returns fallback on any error). */
export async function jget<T>(key: string, fallback: T | null = null): Promise<T | null> {
  const c = redis();
  if (!c) return fallback;
  try {
    const raw = await c.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
export async function jset(key: string, value: unknown, ttlSec?: number): Promise<void> {
  const c = redis();
  if (!c) return;
  try {
    const s = JSON.stringify(value);
    if (ttlSec) await c.set(key, s, "EX", ttlSec);
    else await c.set(key, s);
  } catch { /* durable layer is best-effort */ }
}

// Release only if we still own the lock (compare-and-delete), so a slow holder
// can't delete a lock a newer holder acquired.
const UNLOCK = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
let token = 0;
const mkToken = () => `${process.pid}:${Date.now()}:${token++}`;

/**
 * Run `fn` while holding `key`, at most one holder cluster-wide. If the lock is
 * already held, returns `null` WITHOUT running fn (caller decides what to do —
 * e.g. read the value the other holder is producing). No Redis → runs fn
 * unguarded (single instance, so safe).
 */
export async function withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
  const c = redis();
  if (!c) return fn();
  const tok = mkToken();
  let got = false;
  try { got = (await c.set(key, tok, "PX", ttlMs, "NX")) === "OK"; } catch { return fn(); /* redis blip → don't block work */ }
  if (!got) return null;
  try { return await fn(); }
  finally { try { await c.eval(UNLOCK, 1, key, tok); } catch { /* ttl will expire it */ } }
}

/**
 * Leader election for the warmer: try to hold `key` for ttlSec. Call repeatedly
 * (each tick) to renew — a dead leader's key expires and another instance takes
 * over within ttlSec. No Redis → always leader (single instance).
 */
export async function isLeader(key: string, ttlSec: number): Promise<boolean> {
  const c = redis();
  if (!c) return true;
  const tok = (S.leaderTok ??= mkToken());
  try {
    // Acquire if free, or renew if we already hold it.
    const cur = await c.get(key);
    if (cur === null) return (await c.set(key, tok, "EX", ttlSec, "NX")) === "OK";
    if (cur === tok) { await c.expire(key, ttlSec); return true; }
    return false; // reachable, held by another instance → not leader
  } catch {
    // Redis unreachable → degrade to single-instance: act as leader so the
    // warmer keeps running (better a brief double-scrape if Redis returns than
    // no scraping at all while it's down).
    return true;
  }
}
