# Remittance Rate Comparison

Korea-outbound money-transfer **rate comparison**. Scrapes ~14 providers across 9
corridors (KH · VN · NP · ID · LK · PH · CN · TH · MM) and serves them as a dashboard,
a spreadsheet "sheet view", a JSON feed for Excel / Power Automate, and usage stats.

**Next.js 15 (App Router) · Tailwind v4 · single persistent Node instance** behind a
Cloudflare tunnel.

---

## Architecture

```mermaid
flowchart TD
    subgraph Client["What people open"]
        DASH["Dashboard page"]:::c
        SHEET["Rate sheet page"]:::c
        STATS["Usage page"]:::c
    end

    subgraph Server["Our app"]
        API["Request handler"]:::s
        CACHE["Fast memory<br/>of recent rates"]:::hot
        ORCH["Rate collector"]:::s
        LIM["Traffic controller"]:::s
        PROV["Provider connectors"]:::s
        CFG["Settings<br/>corridors · providers · fees"]:::cfg
        DISK[("Saved copy on disk")]:::disk
    end

    UP["Money-transfer companies<br/>GME · E9pay · Hanpass · Gmoney · SBI · JRF …"]:::up

    Client -->|ask for rates| API --> CACHE
    CACHE -->|missing or too old| ORCH --> LIM --> PROV --> UP
    CFG -. configures .-> ORCH & PROV & LIM
    CACHE <-->|save / reload| DISK
    WARM([auto-refresher]):::hot -->|one corridor at a time| CACHE

    classDef c fill:#eef4ff,stroke:#3a86ff,color:#1a1d24;
    classDef s fill:#f6f7f9,stroke:#8a8f98,color:#1a1d24;
    classDef cfg fill:#fff4e6,stroke:#f5a623,color:#1a1d24;
    classDef hot fill:#fdecef,stroke:#e4002b,color:#1a1d24;
    classDef disk fill:#f1f3f5,stroke:#6b7280,color:#1a1d24;
    classDef up fill:#ffffff,stroke:#c9ced6,color:#6b7280;
```

Four files, four jobs:

| File | Job |
|------|-----|
| `lib/countries.mjs` | **WHAT** — corridors, providers/channels, fee tables, price-gap anchors |
| `lib/providers.mjs` | **HOW** — one config-driven fetcher per upstream API |
| `lib/limiter.mjs` | **HOW OFTEN** — per-provider memo + in-flight dedupe + serial queue |
| `lib/cache.mjs` | **WHEN** — stale-while-revalidate cache + background warmer + persistence |

---

## Scrape flow — `collectCountry(country)`

```mermaid
flowchart LR
    C[Settings:<br/>who to check] --> LOOP{for each<br/>provider}
    LOOP -->|typed in by hand| M[use the saved<br/>sheet value]
    LOOP -->|has a live website| K{one rate, or<br/>one per payout type?}
    K -->|per payout type| PM["check each type<br/>GME · E9pay · Hanpass · Gmoney · JRF"]
    K -->|one rate| SR["check once, copy onto<br/>every type — SBI · Coinshot …"]
    PM & SR --> G[traffic controller]
    G --> API[(company website)]
    API --> REC["one tidy result<br/>amount · fee · total"]
    REC --> FEE[add our fee]
    FEE --> OUT["results + any failures"]
```

- Every fetcher returns the **same shape** — `sendTotalKRW = principalKRW + feeKRW`.
- Jobs run **concurrently** (`Promise.allSettled`, each under a per-job timeout); one
  provider failing never drops the others.
- Provider API codes are corridor-specific and **found by probing** (e.g. E9pay VN =
  `VN03`, Gmoney needs `"Viet Nam"` with a space), then recorded in `lib/countries.mjs`.

---

## The governor — `lib/limiter.mjs`

Every call passes three layers so upstreams are never hammered:

```mermaid
flowchart LR
    CALL[need a rate] --> MEMO{asked<br/>recently?}
    MEMO -->|yes| RET[reuse the answer]
    MEMO -->|no| INF{already asking<br/>right now?}
    INF -->|yes| JOIN[wait for that one]
    INF -->|no| Q[wait your turn<br/>one at a time, spaced out]
    Q --> NET[(ask the company)]
    NET --> STORE[remember the answer] --> RET
```

Queues are **per-provider**, so a slow one never blocks the others. **GME is the
strictest** (HTTP 200 + `errorCode 429` after ~4 rapid calls) → largest gap + backoff
retries under the 25 s job timeout. The memo key includes the channel key, so two
channels of one API don't collide.

---

## Cache handling — `lib/cache.mjs`

Policy is **stale-while-revalidate**: serve instantly, refresh in the background.

```mermaid
flowchart TD
    REQ[someone wants rates] --> Q{how old is<br/>our copy?}
    Q -->|new enough| SERVE[send it now]
    Q -->|a bit old| SS[send it now] --> REV[quietly refresh<br/>in the background]
    Q -->|nothing yet| SCRAPE[fetch now] --> FILL[save + send]
    REV --> MEM
    FILL --> MEM

    WARM([auto-refresher<br/>one corridor per turn]) --> MEM[("fast memory")]
    MEM -->|save| DISK[("copy on disk")]
    DISK -->|reload on restart → starts warm| MEM
```

- **Warmer** (`instrumentation.js`) refreshes one corridor at a time → upstream load is
  `corridors × time`, never `users × time`. This is what keeps GME under its burst limit.
- **Disk persistence** → a restart comes up **warm**, not cold-scraping every corridor.
- **Last-known-good carry-forward** → a provider that misses one scrape keeps its value
  from within `MAX_STALE` (default 900 s) and clears its warning — matched on both
  `PROVIDER` and `PROVIDER/METHOD` shapes, so a transient SBI miss never blanks the row or
  the GME price-gap anchor.
- **Manual rates** (`lib/manual.mjs`) — providers with no scrapeable API are typed on the
  sheet: `code → provider → method`, 1-hour TTL, audit log, typo guard.

> ⚠️ **One instance only.** The in-memory cache + warmer mean this app **cannot be
> serverless**. Two servers on `:8787` (host + Docker, or Windows + Pi) each run a warmer
> and fight over GME's limit — run exactly one.

---

## Request lifecycle

```mermaid
sequenceDiagram
    participant U as User (web / Excel)
    participant MW as Login check
    participant API as Request handler
    participant $ as Fast memory
    participant O as Rate collector

    U->>MW: ask for a corridor's rates
    MW->>API: allowed in
    API->>$: do we have it?
    alt new enough
        $-->>U: send saved rates
    else old or missing
        $-->>U: send old rates (or wait if none yet)
        $->>O: refresh in the background
        O-->>$: fresh rates → add fees → save
    end
    Note over $: the auto-refresher runs this same path on a rotation, with nobody waiting
```

---

## Reference

| Route | Purpose |
|-------|---------|
| `/` · `/ranking` · `/stats` | dashboard · sheet view · usage |
| `/api/ranking?country=XX` | corridor JSON the clients poll |
| `/api/sheet?country=XX` | ranking sheet rendered server-side as **PNG** |
| `/api/poster?method=XX` | single-rate marketing poster **PNG** |
| `/api/send-teams?country=XX` | POST — caption + sheet image to a Teams webhook |
| `/rates` | byte-compatible Excel / Power Automate payload (keep stable) |
| `/manual` · `/fees` | POST — save manual rates / fee overrides |
| `/health` · `/login` · `/admin` | status · web login · admin sign-in |

```bash
npm run dev      # next dev -p 8787
npm run build    # next build   (stop any running server first)
npm start        # next start -p 8787   (persistent process required)
npm run scrape   # CLI Cambodia scrape → rates.xlsx   (--json | --payload)
```

**Env:** `RATES_TOKEN` · `ACCESS_PASSWORD` · `ADMIN_USER`/`ADMIN_PASSWORD_HASH`/`ADMIN_TOKEN`
· `CACHE_TTL` (= warmer cycle) · `GME_TTL` · `MAX_STALE` · `STATE_DIR` · `TZ=Asia/Seoul`
· `TEAMS_WEBHOOK_URL` · `WARMER=off`.

---

## Deployment

Runs as one Docker container behind a Cloudflare tunnel on `127.0.0.1:8787`, from a
**residential IP** (some providers, e.g. SBI, block datacenter IPs).

```bash
docker compose up -d --build     # local / dev host — builds from source

# Raspberry Pi (arm64) — pulls the pre-built image, no build. One command:
./pi-update.sh                   # redeploy the pinned version
./pi-update.sh v1.0.1            # switch to v1.0.1, then redeploy
```

**Releases are tag-driven:** push a `vX.Y.Z` git tag → GitHub Actions builds a multi-arch
(amd64 + arm64) image on native runners and publishes `navong/rate-scraper:vX.Y.Z`
(+ `:latest`) to Docker Hub.
