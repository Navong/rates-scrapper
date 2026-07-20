# Send the rate POSTER (image only) to Teams

Deliver just the marketing **poster image** to a Teams channel — no rate table,
no data. Teams pulls the PNG straight from the backend by URL.

```
Teams keyword "poster"  ──►  Post Adaptive Card  ──►  image from /api/poster
   (or a daily schedule)        (image element)          (live GME rates)
```

## The image URL

```
https://rates.nathanc.site/api/poster?method=BANK&token=<YOUR_RATES_TOKEN>
```

- `method=BANK`   → **Bank Deposit** poster
- `method=WALLET` → **Cash Payment** poster
- `token=` = your `RATES_TOKEN` (same token your `/rates` flow already uses).
- The image is generated live from the current rates each time it's fetched.

Open that URL in a browser first to confirm the poster renders.

---

## Option A — Power Automate keyword flow (matches your "rates" flow)

Type **`poster`** in Teams → the flow replies with the poster image.

1. **make.powerautomate.com → Create → Automated cloud flow.**
2. Trigger: **Microsoft Teams → "When keywords are mentioned".**
   - Keyword: `poster`
   - Channel/Group: where the team will type it.
3. **+ New step → Microsoft Teams → "Post card in a chat or channel"**
   (a.k.a. *Post adaptive card*):
   - Post as: **Flow bot** · Post in: **Channel** · use the trigger's **Team** / **Channel** dynamic values.
   - **Adaptive Card** = paste this (it's image-only):

```json
{
  "type": "AdaptiveCard",
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "version": "1.4",
  "body": [
    {
      "type": "Image",
      "url": "https://rates.nathanc.site/api/poster?method=BANK&token=<YOUR_RATES_TOKEN>",
      "altText": "GME Cambodia rate poster",
      "size": "Stretch"
    }
  ]
}
```

4. **Save**, type `poster` in the channel to test.

> **Two services?** Add a second `Image` element to the `body` with
> `method=WALLET` to post Bank Deposit **and** Cash Payment in one card.

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
        "url": "https://rates.nathanc.site/api/poster?method=BANK&token=<YOUR_RATES_TOKEN>",
        "altText": "GME Cambodia rate poster",
        "size": "Stretch"
      }]
    }
  }]
}' "<YOUR_TEAMS_WEBHOOK_URL>"
```

Drop that same JSON into a Power Automate **Recurrence → HTTP POST** to post on a
schedule (e.g. daily 10:00).

---

## Optional — only post when GME is competitive

The poster is worth sending when GME is 3rd/4th cheapest (the Pipeline page's
"opportunity" rule). To gate the post on that, add a **Condition** before posting
that checks the ranking feed — ask and I'll add a tiny `/api/pipeline/opportunity`
JSON endpoint (returns `{ "trigger": true, "method": "BANK" }`) so the flow can
branch on it. Until then, the keyword/scheduled post always sends the current poster.

## Cache-busting (if Teams shows a stale image)

The URL is stable, so Teams/browsers may cache the last PNG for ~2 min. If you
post more than once and see the old image, append a changing value:

```
…/api/poster?method=BANK&token=<YOUR_RATES_TOKEN>&t=@{utcNow()}
```

(`@{utcNow()}` in Power Automate, or any timestamp) forces a fresh fetch.

## Notes
- Backend + cloudflared must be running (Docker autostart). Rebuild once to pick
  up the new endpoint: `docker compose up -d --build`.
- The poster URL carries `RATES_TOKEN`; anyone with the card can load the image.
  It only exposes marketing posters — but if you'd rather not embed the token,
  ask and I'll add a separate `POSTER_TOKEN` (poster-only) or make `/api/poster`
  public.
