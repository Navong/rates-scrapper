# Trigger the ranking from Teams

A Power Automate flow listens for a keyword in Teams, calls the backend, and
replies with the CAMBODIA ranking.

```
Teams keyword "rates" ──► HTTP GET /ranking ──► Reply in the same channel
```

## Build the flow

1. **make.powerautomate.com → Create → Automated cloud flow.**
2. Trigger: **Microsoft Teams → "When keywords are mentioned".**
   - Keywords: `rates`
   - Channel/Group: choose where people will type it (or "All channels").
3. **+ New step → HTTP** (premium):
   - Method **GET**
   - URI: `https://rates.navong.xyz/ranking?token=<YOUR_RATES_TOKEN>`
   - Sentbe is included automatically from the saved value (see below) — no params.
4. **+ New step → Microsoft Teams → "Reply with a message in a channel"** (or
   "Post message in a chat or channel"):
   - Team / Channel: use the trigger's dynamic values (Team Id, Channel Id) so it
     replies where the keyword was typed.
   - Message: insert the **Body** from the HTTP step.
5. **Save** and type `rates` in that Teams channel to test.

## ⚠️ Teams + HTML styling
Teams renders a *subset* of HTML. Tables, borders, and bold work; **per-cell
background colors are usually stripped**, so the table shows but without the
red/yellow/blue operator fills. Three ways to handle it:

- **A. Plain table (default):** post `Body` as above — readable, just no colors.
- **B. Rich link:** post a one-line message with a link to the full colored page:
  `Today's rates: https://rates.navong.xyz/ranking?token=…` — click opens the
  styled HTML in a browser. Most reliable for the exact look.
- **C. Adaptive Card:** I can add a `/ranking?format=card` endpoint that returns
  Adaptive Card JSON (colored containers, renders natively in Teams). Ask and I'll
  build it — best of both: in-Teams + colored.

## Setting the manual Sentbe rate (simple form)
Open this in a browser, type the two base amounts, click **Save**:
```
https://rates.navong.xyz/sentbe?token=<YOUR_RATES_TOKEN>
```
It's stored on the server (survives restarts), so `/ranking` includes Sentbe
automatically — no URL params anywhere. Update it only when the Sentbe rate changes.

## Notes
- Backend + cloudflared service must be running (they auto-start).
- `format=json` is available if you'd rather build the message yourself in the flow.
- HTTP is a premium connector (same as the daily flow). No premium? Use the
  OneDrive-file bridge idea from POWER-AUTOMATE-FLOW.md.
