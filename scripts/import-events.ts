// ONE-TIME import of the pre-Redis analytics log (STATE_DIR/events.jsonl) into
// the Redis `events` list, so /stats keeps its history after the Redis switch.
//
// Run ONCE, inside the running container (it has REDIS_URL + the bind-mounted
// /data/events.jsonl):
//
//   docker compose exec backend npx tsx scripts/import-events.ts
//
// Safe by default: it refuses to run if the Redis list already has events (so a
// second run can't duplicate them). Pass --force to append anyway. Optionally
// pass a file path as the first argument.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { redis, redisEnabled, pingOK } from "../lib/redis";

const EKEY = "events";        // must match lib/analytics.ts
const EVENTS_CAP = 200_000;   // must match lib/analytics.ts
const STATE_DIR = process.env.STATE_DIR || ".";
const FORCE = process.argv.includes("--force");
const FILE = process.argv.slice(2).find((a) => !a.startsWith("--")) || join(STATE_DIR, "events.jsonl");

async function main() {
  if (!redisEnabled()) { console.error("REDIS_URL is not set — nothing to import into."); process.exit(1); }
  if (!(await pingOK())) { console.error("Redis unreachable — run this inside the container (docker compose exec backend …)."); process.exit(1); }
  if (!existsSync(FILE)) { console.error(`No file at ${FILE} — nothing to import.`); process.exit(1); }
  const c = redis()!;

  const existing = await c.llen(EKEY);
  if (existing > 0 && !FORCE) {
    console.error(`Redis "${EKEY}" already holds ${existing} events — re-running would DUPLICATE them.`);
    console.error(`Pass --force to append anyway.`);
    process.exit(1);
  }

  // Each stored entry is a JSON string (logEvent does JSON.stringify; readStats
  // does JSON.parse). The file lines are already that exact shape — validate and
  // push the raw line so the format matches.
  const raw = readFileSync(FILE, "utf8").replace(/^﻿/, "");
  const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);

  let ok = 0, bad = 0;
  let pipe = c.pipeline();
  for (const line of lines) {
    try { JSON.parse(line); } catch { bad++; continue; }
    pipe.rpush(EKEY, line);
    if (++ok % 1000 === 0) { await pipe.exec(); pipe = c.pipeline(); }
  }
  await pipe.exec();

  const len = await c.llen(EKEY);
  if (len > EVENTS_CAP) await c.ltrim(EKEY, -EVENTS_CAP, -1); // keep the tail, like logEvent
  const final = await c.llen(EKEY);

  console.log(`Imported ${ok} events${bad ? ` (${bad} unparseable lines skipped)` : ""} from ${FILE}.`);
  console.log(`Redis "${EKEY}" now holds ${final} events.`);
  c.disconnect();
}

main().catch((e) => { console.error("import failed:", e); process.exit(1); });
