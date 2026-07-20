# Power Automate + Node backend — wiring the scraper to your Office Script

The Node scraper is the **backend** (it does the hard fetching, incl. SBI's
anti-bot flow). Your **Office Script** stays the formatter/ranker. Power Automate
glues them: it pulls live base rates from the backend, writes two new rows, then
runs your script.

```
Node backend  ──GET /rates──►  Power Automate  ──write 2 rows──►  Excel (OneDrive)
(base rates)                    (scheduled)      ──Run script──►  your Office Script
```

## 1. The backend payload

`GET /rates` returns (example):

```json
{
  "date": "2026-06-13",
  "time": "PM 02:15",
  "receiveUSD": 1000,
  "bankDeposit":  { "gme": 1534871, "e9pay": 1528050, "hanpass": 1526194, "gmoney": 1527370, "sbi": 1535367, "sentbe": null },
  "mobileWallet": { "gme": 1539872, "e9pay": 1528050, "hanpass": 1527564, "gmoney": 1527370, "sbi": 1535367, "sentbe": null },
  "sbiAvailable": true
}
```

Important — these are the **base values your Office Script expects**:

- `gme`   = final total (GME fee already included; your script does not touch GME).
- `e9pay / hanpass / gmoney / sbi` = **base principal**; your script adds the fee
  (`=base+fee`) per its FEE table.
- `sentbe` = `null` (not scraped — leave the cell blank).
- `bankDeposit`  → write into the **"Bank Deposit"** row.
- `mobileWallet` → write into the **"Cash Payment"** row (your script applies the
  CP fees: Gmoney +4000, Sentbe +3750, etc.). We use Mobile Wallet rates here per
  your choice.

You can preview it without a server:  `node scrape.mjs --payload`

## 2. The backend is deployed on Railway (public URL)

```
https://rate-backend-production.up.railway.app/rates     ← live JSON
https://rate-backend-production.up.railway.app/health
```

Power Automate **cloud** can call this directly — no tunnel needed. Server
timezone is set to `Asia/Seoul`, so `date`/`time` are KST like your sheet.

- Redeploy after code changes:  `railway up --detach`  (from this folder).
- Logs / status:  `railway logs`  /  `railway status`.
- Optional shared secret: set a `RATES_TOKEN` variable on Railway
  (`railway variables --set "RATES_TOKEN=..."`), then call `/rates?token=...`.

> ⚠️ **SBI on the cloud**: Railway's datacenter IP is blocked by SBI's
> Cloudflare anti-bot, so `sbi` comes back `null` (`sbiAvailable: false`) from
> the Railway URL. The other four providers work. If you need SBI populated,
> run `node scrape.mjs --payload` **locally** (residential IP) for that value,
> or have your Office Script leave SBI unchanged when the payload's `sbi` is null.

You can still run it locally too (`serve.bat`) if you prefer localhost + PAD.

### Local Docker + Cloudflare Tunnel (SBI works ✅) — tested

Running the backend on **your own machine** makes requests leave your residential
IP, so **SBI is NOT blocked** (verified: `sbiAvailable: true`). Steps:

```
docker compose up -d --build     # backend + cloudflared quick tunnel
docker compose logs tunnel       # copy the https://<random>.trycloudflare.com URL
# point Power Automate's HTTP GET at  <that-url>/rates
docker compose down              # stop
```

Trade-offs vs Railway:
- ✅ Full data incl. SBI.  ❌ Your PC + Docker must be running for the flow to work.
- ⚠️ The quick-tunnel URL is **random and changes on every restart**, and is
  **public with no auth**. For production use either:
  - set `RATES_TOKEN` (in `docker-compose.yml`) and call `/rates?token=...`, and/or
  - use a **named tunnel** for a stable hostname:
    `cloudflared tunnel login` → `cloudflared tunnel create rate` →
    `cloudflared tunnel route dns rate rates.yourdomain.com` →
    run with a config pointing the tunnel at `http://localhost:8787`.

**Best of both:** Railway for an always-on URL (4 providers), local Docker+tunnel
when you need SBI included.

## 3. The Power Automate (cloud) flow

1. **Recurrence** trigger — e.g. daily 09:00 and 18:00 (matches your AM/PM rows).
2. **HTTP** action (or *"Invoke an HTTP request"*): `GET https://<your-url>/rates`.
3. **Parse JSON** — paste the sample above as the schema.
4. **Excel Online (Business) → Add a row into a table** (or *Update a row*) twice:
   - Row A (Bank Deposit): Date=`date`, GME=`bankDeposit/gme`, E9pay=`bankDeposit/e9pay`,
     Hanpass=`bankDeposit/hanpass`, Gmoney=`bankDeposit/gmoney`, SBI=`bankDeposit/sbi`,
     Sentbe=(blank), Time=`time`, Remarks=`Bank Deposit`.
   - Row B (Cash Payment): same but from `mobileWallet/*`, Remarks=`Cash Payment`.
   - Write **plain numbers** into B–G. Your script's `extractBase` reads them as the
     base, then rewrites them as `=base+fee` on the first run.
   > Tip: if your month sheet isn't an Excel *Table*, use the Office Scripts
   > "write to range" approach instead — see step 5 variant.
5. **Excel Online (Business) → Run script** → select your Exchange Rate script.
   It finds the last Bank/Cash rows, applies fees + Time, and refreshes the
   Cambodia ranking block.

### Variant (no Excel Table): let the script write the rows too
If your monthly sheets aren't formatted as Tables, the cleanest path is to pass
the JSON straight into your Office Script and have it append the rows. Extend your
script's `main` to accept the payload as a parameter and write the BD/CP rows
before its existing fee/ranking logic. (Ask and I can produce that script edit.)

## 4. Test checklist

- `node scrape.mjs --payload` prints JSON ✔
- `serve.bat` running, browser to `http://localhost:8787/rates` shows JSON ✔
- Flow run → two new rows appear → script run → fees + ranking update ✔
- If `sbiAvailable: false`, SBI was blocked that run — its cell will be `null`;
  re-run or let the next schedule catch it.
