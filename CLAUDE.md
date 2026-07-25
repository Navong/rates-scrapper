# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A multi-provider **Korea-outbound remittance rate comparison** app. It scrapes ~14 money-transfer providers across corridors (Cambodia, Nepal, Indonesia, Sri Lanka, Philippines, China, Thailand, Myanmar) and presents them as a web dashboard, a spreadsheet-style "sheet view", a JSON feed for Excel/Power Automate, and usage analytics. It was migrated from a plain Node `http` server to **Next.js 15 (App Router) + Tailwind v4**. The business-logic modules (`lib/countries.ts`, `lib/providers.ts`, …) live under `lib/` alongside the Next app.

## Commands

```bash
npm run dev            # next dev -p 8787 — compiles routes on first hit (slow first click; dev only)
npm run build          # next build — STOP any running server first (see gotcha below)
npm start              # next start -p 8787 — production; a PERSISTENT process is required
npm run scrape         # tsx lib/scrape.ts — Cambodia scrape → rates.xlsx (CLI, not the server)
npm run json           # lib/scrape.ts --json  (raw JSON to stdout)
npm run payload        # lib/scrape.ts --payload  (the /rates Power-Automate payload shape)
```

There is **no test suite / linter config**. Verify changes by running the server and hitting the endpoints (see below). Probe scripts (ad-hoc `.ts` run with `tsx`, importing `lib/providers.ts`) are the usual way to check a provider's live API.

**Deployment is Docker-only.** `docker compose up -d --build` on the dev host, or `./pi-update.sh [vX.Y.Z]` on the Raspberry Pi (pulls the prebuilt image — see [docs/](docs/) and the README). `start-host-docker.bat` waits for the Docker engine then brings the stack up; a Startup shortcut (optionally via `launch-hidden.vbs`) can run it hidden at logon. The app sits behind a shared **cloudflared** tunnel on `127.0.0.1:8787` — run it from the **residential IP** (some providers, esp. SBI, block datacenter/cloud IPs).

**Key env vars:** `RATES_TOKEN` (machine API token, also `x-api-token` header), `ACCESS_PASSWORD` (web login, default `gme`), `CACHE_TTL` (seconds; also sets the warmer's full-cycle time), `GME_TTL`, `STATE_DIR` (persistent data dir, default `.`; production uses `data/`), `TZ=Asia/Seoul`, `MAX_STALE` (SWR ceiling, default 900s), `WARMER=off` to disable the warmer, `MANUAL_TTL_HOURS` (default 1), `PROVIDER_TTL` (per-provider memo).

## Routes

- `/` dashboard · `/ranking` sheet view · `/stats` usage — client-rendered, seeded from cache on the server.
- `/api/ranking?country=XX` — corridor JSON the clients poll · `/api/stats` — stats JSON.
- `/rates` — **byte-compatible** Cambodia payload consumed by Excel/Power Automate; keep its shape stable.
- `/manual` (POST) — save manual rates (inline sheet editor) · `/health` — cache + limiter status · `/login`.

## Architecture (the parts that span files)

**Config is the source of truth: `lib/countries.ts`.** A corridor declares `methods` (payout types, each may set its own `receiveAmount`), an `anchor` (the GME baseline for the Price-gap column — a string, or a `{method: providerKey}` map for per-method anchors), and `providers`. The scrapers, the tables, the anchor math, and the manual editor are all driven off this object. Helpers `amountFor` / `anchorOf` / `providerInMethod` live here and are **pure (no Node imports), so client components may import them** — unlike `lib/ranking.ts`/`lib/manual.ts`, which pull in `node:fs` and must never be imported from a `"use client"` file.

**Providers and "channels" (`lib/providers.ts`).** Each fetcher (`fetchGme`, `fetchE9pay`, …) is config-driven and takes the provider **key** so one API can back several rows: a provider entry can be a *channel* like `HANPASS_CB` / `GME_WU` with `label`, `methods: [...]` (scoped to those methods), a per-method fee, and either `manual: true` **or** `api: "HANPASS"` to pick the scraper. `collectCountry` resolves `cfg.api || key`, scrapes the non-manual ones concurrently, and mirrors single-rate providers onto their methods. Manual channels are entered by hand; scraped channels hit live APIs. Provider API codes (E9pay nation codes, GME delivery codes, etc.) are **corridor-specific and often undiscoverable by guessing** — probe the live API and match returned KRW to known values to identify a channel.

**The governor: `lib/limiter.ts`.** Every provider gets a memo (TTL), in-flight dedupe, and a **per-provider serial queue with a minimum gap**. GME is the strictest (burst-limits to HTTP 200 + `errorCode 429` after ~4 rapid calls) — `gmeFetch` retries all transient failures with backoff under the 25s job timeout. The memo key includes the channel key so two channels of the same api don't collide.

**Cache + warmer: `lib/cache.ts`.** In-memory singletons pinned to `globalThis` (survive dev hot-reload). Policy is stale-while-revalidate: serve cached instantly, refresh in the background. A **background warmer** (started once via `instrumentation.ts`) refreshes one corridor at a time on a rotation — upstream load is corridors×time, never users×time, and this is what keeps GME under its burst limit. The corridor cache is **persisted to `STATE_DIR/rank-cache.json`** and restored on boot, so a restart comes up warm instead of cold-scraping. **Last-known-good carry-forward:** if a provider fails a scrape but a value from the last `MAX_STALE` exists, it's carried and its "unavailable" warning is cleared (matching both `PROVIDER` and `PROVIDER/METHOD` error shapes). Because of the warmer + in-memory state, **this app cannot be serverless and must run as a single persistent instance** (two instances = duplicate scraping + GME trouble).

**Manual rates: `lib/manual.ts`.** Providers with no scrapeable API are typed in on the sheet. Stored per `code → provider → method` with a timestamp, a 1-hour TTL (expired → shown as `-`, excluded from the gap math), an audit log, and a typo guard (deviation vs live peers). Field names are `CODE__PROVIDER__METHOD` (double underscore, so single-underscore channel keys are safe).

**Pages are client components seeded server-side.** `app/page.tsx`/`ranking/page.tsx`/`stats/page.tsx` are thin server components that read the warm cache and hand initial data to `DashboardClient`/`SheetClient`/`StatsClient`. The chrome (red bar, stat bar, nav, corridor tabs from `lib/ui.tsx`) stays fixed while only the content region skeletons on a corridor switch. Corridor tabs switch **client-side** (no navigation). The sheet renders both an HTML table and a `<canvas>` (for "copy as image").

**Auth: `middleware.ts`.** Gates HTML pages (redirect to `/login`) and data endpoints (401). Accepts the short `ACCESS_PASSWORD` via `?pw=` or the long `RATES_TOKEN` via `?token=` / `x-api-token`; a valid credential is remembered in the `rt` cookie. Cookies are `Secure` — over plain HTTP they won't persist (fine over the HTTPS tunnel / localhost).

## Gotchas

- **Never `npm run build` while a server is serving** — the running process reads `.next` and the overwrite corrupts it (chunk `MODULE_NOT_FOUND`). Stop the server, build, then start.
- **One instance only.** Multiple `next start` / the legacy server / a Docker container all fight for 8787 and each runs its own warmer. Check `netstat -ano | findstr :8787` when the port seems "stale"; a Docker container from an old image can shadow the host build.
- **Client components must not import `lib/ranking.ts`, `lib/manual.ts`, `lib/scrape.ts`, or `lib/cache.ts`** (they use `node:fs`). Import pure data/helpers from `lib/countries.ts` instead; inline small constants (e.g. FILL colors) if needed.
- **`lib/theme.ts` + `lib/meta.ts` are load-bearing, despite looking legacy.** The live app imports `lib/ranking.ts`/`lib/analytics.ts` for their data functions, and those still `import` from `lib/theme.ts` (→ `lib/meta.ts`) at the top level — so the HTML-renderer halves come along for the ride. Don't delete `lib/theme.ts`/`lib/meta.ts` or the render exports without first stripping those imports. (The truly-legacy `server.mjs`/`dashboard.mjs` and the host-launch `.bat`s were removed in the Docker-only cleanup — recover from git history if ever needed.)
