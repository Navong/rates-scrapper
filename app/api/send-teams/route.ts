import { getCountry } from "@/lib/countries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pad2 = (n) => String(n).padStart(2, "0");
const time12 = (d = new Date()) => {
  const ap = d.getHours() >= 12 ? "PM" : "AM";
  const h = d.getHours() % 12 || 12;
  return `${pad2(h)}:${pad2(d.getMinutes())} ${ap}`;
};

// POST /api/send-teams?country=KH
// Posts the caption ("<Country> Rate at hh:mm AM/PM") + the live sheet image to a
// Teams channel via an Incoming Webhook / Workflow URL (env TEAMS_WEBHOOK_URL).
// The image is referenced by URL — Teams fetches /api/sheet with the machine token.
// Auth: middleware gates /api (cookie or ?token=), so only signed-in users reach it.
export async function POST(req) {
  const url = new URL(req.url);
  const code = (url.searchParams.get("country") || "KH").toUpperCase();
  const country = getCountry(code);
  if (!country) return Response.json({ ok: false, error: "unknown country" }, { status: 400 });

  const webhook = process.env.TEAMS_WEBHOOK_URL || "";
  if (!webhook) {
    return Response.json({ ok: false, error: "TEAMS_WEBHOOK_URL is not configured on the server." }, { status: 501 });
  }

  const caption = `${country.name} Rate at ${time12()}`;

  // Absolute base from the forwarded scheme/host (behind the Cloudflare tunnel the
  // container sees http://localhost). The token lets Teams fetch the image.
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  const token = process.env.RATES_TOKEN || "";
  const imageUrl = `${proto}://${host}/api/sheet?country=${code}&token=${encodeURIComponent(token)}&t=${Date.now()}`;

  // Adaptive Card: caption line above the sheet image (matches the copied paste).
  const payload = {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        type: "AdaptiveCard",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        version: "1.4",
        body: [
          { type: "TextBlock", text: caption, wrap: true, size: "Medium" },
          { type: "Image", url: imageUrl, size: "Stretch", altText: caption },
        ],
      },
    }],
  };

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    if (!res.ok) {
      return Response.json({ ok: false, error: `Teams webhook HTTP ${res.status}: ${body.slice(0, 200)}` }, { status: 502 });
    }
    return Response.json({ ok: true, caption });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 502 });
  }
}
