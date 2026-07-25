# Send rate IMAGES to Teams (no manual "Copy image")

Deliver a rate **image** to a Teams channel straight from a URL — no one has to
open the sheet page and click **Copy image**. Two images are available:

| Image | URL | What it is |
|-------|-----|------------|
| **Sheet view** (primary) | `/api/sheet?country=KH` | The full ranking sheet — every provider, both services, colored cells, Date/time stamp. Same as the "Copy image" button. |
| **Marketing poster** | `/api/poster?method=BANK` | A single-rate promo poster (GME logo + hero rate) for one Cambodia service. |

```
Teams keyword "rates"   ──►  Post Adaptive Card  ──►  image from /api/sheet
   (or a daily schedule)        (image element)          (live rates, all providers)
```

## The image URLs

```
Sheet:   https://rates.nathanc.site/api/sheet?country=KH&token=<YOUR_RATES_TOKEN>
Poster:  https://rates.nathanc.site/api/poster?method=BANK&token=<YOUR_RATES_TOKEN>
```

- **Sheet** `country=` — any corridor: `KH` `NP` `ID` `LK` `PH` `CN` `TH` `MM`.
- **Poster** `method=` — `BANK` (Bank Deposit) or `WALLET` (Cash Payment).
- `token=` = your `RATES_TOKEN` (same token your `/rates` flow already uses).
- Both are generated **live** from the current rates on each fetch.

Open a URL in a browser first to confirm it renders.

---

## Option A — Power Automate keyword flow (matches your "rates" flow)

Type **`rates`** in Teams → the flow replies with the sheet image.

1. **make.powerautomate.com → Create → Automated cloud flow.**
2. Trigger: **Microsoft Teams → "When keywords are mentioned".**
   - Keyword: `rates`
   - Channel/Group: where the team will type it.
3. **+ New step → Microsoft Teams → "Post card in a chat or channel"**
   (a.k.a. *Post adaptive card*):
   - Post as: **Flow bot** · Post in: **Channel** · use the trigger's **Team** / **Channel** dynamic values.
   - **Adaptive Card** = paste this (image-only):

```json
{
  "type": "AdaptiveCard",
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "version": "1.4",
  "body": [
    {
      "type": "Image",
      "url": "https://rates.nathanc.site/api/sheet?country=KH&token=<YOUR_RATES_TOKEN>",
      "altText": "Cambodia remittance rate sheet",
      "size": "Stretch"
    }
  ]
}
```

4. **Save**, type `rates` in the channel to test.

> **Other corridors / the poster:** duplicate the flow with a different keyword
> (e.g. `nepal` → `country=NP`, `poster` → the `/api/poster` URL), or add more
> `Image` elements to the same card's `body`.

---

## Option B — Incoming Webhook (simplest, no premium connector)

Good for a scheduled post or a one-liner from any script.

1. In the Teams channel: **••• → Connectors → Incoming Webhook → Configure** →
   name it, **Create**, copy the webhook URL.
2. POST an Adaptive Card wrapped for the webhook. Example with `curl`:

```bash
curl -H "Content-Type: application/json" -d '{
  "type": "message",
  "attachments": [{
    "contentType": "application/vnd.microsoft.card.adaptive",
    "content": {
      "type": "AdaptiveCard",
      "version": "1.4",
      "body": [{
        "type": "Image",
        "url": "https://rates.nathanc.site/api/sheet?country=KH&token=<YOUR_RATES_TOKEN>",
        "altText": "Cambodia rate sheet",
        "size": "Stretch"
      }]
    }
  }]
}' "<YOUR_TEAMS_WEBHOOK_URL>"
```

Drop that same JSON into a Power Automate **Recurrence → HTTP POST** to post on a
schedule (e.g. daily 10:00 KST).

---

## Cache-busting (if Teams shows a stale image)

The URL is stable, so Teams/browsers may cache the last PNG for ~2 min. If you
post more than once and see the old image, append a changing value:

```
…/api/sheet?country=KH&token=<YOUR_RATES_TOKEN>&t=@{utcNow()}
```

(`@{utcNow()}` in Power Automate, or any timestamp) forces a fresh fetch.

## Notes
- Backend + cloudflared must be running (Docker autostart). Rebuild once to pick
  up the new endpoints: `docker compose up -d --build`.
- The image URL carries `RATES_TOKEN`; anyone with the card can load the image.
  It only exposes the rate image — but if you'd rather not embed the token, ask
  and I'll add a separate image-only token or make these endpoints public.
