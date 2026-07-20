# Power Automate flow — configure step by step

Fully unattended: a scheduled flow calls the backend, then runs the Office Script
that writes the rows + applies fees + ranking. Ties into your O365 (you can add a
Teams message at the end too).

```
Recurrence ──► HTTP GET /rates ──► Run Office Script (ratesJson = HTTP Body)
```

## Prerequisites (one-time)

1. **Workbook in OneDrive/SharePoint.** The "Exchange rate (Daily).xlsx" (or a copy)
   must live in OneDrive for Business or SharePoint — Run Script can't touch local files.
2. **Save the Office Script in your account.** In that workbook (Excel on the web)
   → **Automate → New Script** → paste all of `office-script-flow.ts` → **Save**
   (e.g. name it `ExchangeRate_Flow`). It now appears in the Run Script picker.
3. **Open the correct month sheet as the active tab** before runs, or always keep
   the workbook's active sheet on the current month — the script uses the active sheet.
4. **HTTP is a premium connector.** Power Automate's HTTP action needs a premium
   plan. If you don't have it, see "No premium?" at the bottom.

## Build the flow

1. **make.powerautomate.com → Create → Scheduled cloud flow.**
   - Name: `Exchange Rate Daily`
   - Repeat every: e.g. `1 Day`. Click **Create**, then in the Recurrence card set
     specific times — e.g. add `09:00` and `18:00`, Time zone **(UTC+09:00) Seoul**
     (matches your AM/PM rows).

2. **+ New step → HTTP** (premium).
   - Method: **GET**
   - URI: `https://rates.navong.xyz/rates?token=<YOUR_RATES_TOKEN>`
   - (nothing else needed)

3. **+ New step → Excel Online (Business) → Run script.**
   - Location: **OneDrive for Business** (or your SharePoint site)
   - Document Library / File: pick your workbook
   - Script: **ExchangeRate_Flow**
   - It shows a parameter **ratesJson** → click it → **Dynamic content** → choose
     **Body** (from the HTTP step).

4. **Save.** Click **Test → Manually → Run** and watch it go green.
   Two new rows (Bank Deposit + Cash Payment) appear, fees/Time/ranking updated.

### Optional: post to Teams
Add a final step **Microsoft Teams → Post message in a chat or channel**, e.g.
"Exchange rates updated for @{body('HTTP')?['date']} @{body('HTTP')?['time']}".

## Handle a blocked provider (SBI etc.)
The payload includes `partial` and `sbiAvailable`. If a provider was momentarily
blocked its base is `null`, and the script simply leaves that cell blank (your
fee logic already skips empty/NaN). Optional: add a **Condition** on
`body('HTTP')?['partial']` to post a Teams warning when `true`.

## No premium (HTTP connector) plan?
Use the **OneDrive file bridge** instead — no premium needed:
1. Have the backend also write the JSON to a OneDrive-synced folder on the PC
   (I can add an endpoint/writer that dumps `latest-rates.json`).
2. Flow: **OneDrive for Business → Get file content** (standard connector) →
   **Run script** with that content as `ratesJson`.
Tell me and I'll wire the backend to drop `latest-rates.json` into your OneDrive.

## Token / URL reminders
- Endpoint: `https://rates.navong.xyz/rates?token=…` (stable named tunnel).
- Backend container + cloudflared service must be running (they auto-start).
- Rotate the token: change `RATES_TOKEN` in `.env`, `docker compose up -d backend`,
  update the URI here.
