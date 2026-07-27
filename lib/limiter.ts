// Per-provider call governor. Every upstream provider gets its own:
//
//   1. memo       — identical calls reuse the last response for `ttl`
//   2. in-flight  — concurrent identical calls collapse into ONE network call
//   3. queue      — that provider's calls are serialized with a minimum gap
//
// Queues are per-provider, so a slow/limited provider (GME) never stalls the
// others. Pass { fresh: true } to bypass the memo but still respect the queue —
// that's what the background warmer uses.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `gap` = minimum ms between two calls to that provider.
// `ttl` = how long an identical response is reused.
const PROVIDER_TTL = Number(process.env.PROVIDER_TTL ?? 90) * 1000;
const DEFAULT = { gap: 300, ttl: PROVIDER_TTL };
const CONFIG = {
  // GME 429s after ~6 rapid calls — the strictest budget by far.
  // ttl is deliberately BELOW the warmer's per-corridor cycle (CACHE_TTL) so the
  // warmer always gets a real refresh, while bursts still hit the memo.
  // GME cools down (HTTP 200 + errorCode 429) after ~4 rapid calls. gap 1500ms +
  // the warmer running one corridor at a time keeps bursts to ≤2 calls, well
  // under the limit. retries: backoff sum (9.3s) + fetch stays under JOB_TIMEOUT
  // (25s) so a genuinely failing call reports its real reason, not a timeout.
  GME:      { gap: 1500, ttl: Number(process.env.GME_TTL ?? 200) * 1000, retries: [800, 2500, 6000] },
  E9PAY:    { gap: 350, ttl: PROVIDER_TTL },
  HANPASS:  { gap: 350, ttl: PROVIDER_TTL },
  GMONEY:   { gap: 350, ttl: PROVIDER_TTL },
  JRF:      { gap: 450, ttl: PROVIDER_TTL },
  COINSHOT:  { gap: 700, ttl: PROVIDER_TTL }, // 2-step (page + POST)
  SBI:       { gap: 900, ttl: PROVIDER_TTL }, // 2-step + anti-bot
  UTRANSFER: { gap: 400, ttl: PROVIDER_TTL },
  PANDA:     { gap: 400, ttl: PROVIDER_TTL },
  SENTBE:    { gap: 400, ttl: PROVIDER_TTL },
};
const cfgFor = (p) => CONFIG[p] ?? DEFAULT;

const queues = new Map();   // provider -> { last, chain }
const memo = new Map();     // "provider|key" -> { at, data }
const inflight = new Map(); // "provider|key" -> Promise

/** Serialize one provider's calls with its minimum gap. */
function enqueue(provider, fn) {
  const { gap } = cfgFor(provider);
  let q = queues.get(provider);
  if (!q) { q = { last: 0, chain: Promise.resolve() }; queues.set(provider, q); }

  const run = q.chain.then(async () => {
    const wait = Math.max(0, q.last + gap - Date.now());
    if (wait) await sleep(wait);
    q.last = Date.now();
    return fn();
  });
  q.chain = run.catch(() => {}); // a failure must not poison the queue
  return run;
}

/**
 * Run `fn` under this provider's governor.
 * @param {string} provider  GME | E9PAY | …
 * @param {string} key       identifies the exact request (country|method)
 * @param {boolean} fresh    skip the memo (still queued + deduped)
 */
export function limited(provider, key, fn, { fresh = false } = {}) {
  const k = `${provider}|${key}`;
  const { ttl } = cfgFor(provider);

  if (!fresh) {
    const hit = memo.get(k);
    if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.data);
  }
  const pending = inflight.get(k);
  if (pending) return pending; // collapse concurrent identical calls

  const p = enqueue(provider, fn)
    .then((data) => { memo.set(k, { at: Date.now(), data }); return data; })
    .finally(() => inflight.delete(k));

  inflight.set(k, p);
  return p;
}

/**
 * GME needs retry + backoff on top of the governor. GME's endpoint is
 * occasionally flaky on a single call (a transient network reset, a 5xx, or a
 * momentary non-zero errorCode) — that used to drop whichever method ran first
 * (e.g. GME/CASH for Philippines) for the whole run. We retry any transient
 * failure and only return once GME reports success (errorCode "0"). The total
 * backoff budget stays under JOB_TIMEOUT so a doomed call fails cleanly rather
 * than masquerading as a timeout.
 */
export function gmeFetch(url, options, opts = {}) {
  const key = String(options?.body ?? url);
  const { retries } = cfgFor("GME");

  return limited("GME", key, async () => {
    let lastErr;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, options);
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { throw new Error(`bad response (HTTP ${res.status})`); }

        if (res.ok && String(data.errorCode) === "0") return data;

        // Everything else is treated as retryable: 429, 5xx, or a transient
        // errorCode. The message is preserved for the final throw.
        const why = String(data.errorCode) === "429" || res.status === 429 ? "rate limited (429)"
          : res.ok ? `errorCode ${data.errorCode}: ${data.msg ?? ""}`.trim()
          : `HTTP ${res.status}`;
        lastErr = new Error(`GME ${why}`);
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e)); // network reset, parse error, …
      }
      if (attempt >= retries.length) throw lastErr;
      await sleep(retries[attempt]);
    }
  }, opts);
}

/** Introspection for /health. */
export function limiterStats() {
  return { providers: [...queues.keys()], memoEntries: memo.size, inflight: inflight.size };
}
