import { getCountry, anchorOf } from "@/countries.mjs";
import { getCountryRecords } from "@/lib/cache.mjs";
import { buildRankingData } from "@/ranking.mjs";
import { getStore } from "@/manual.mjs";
import { posterPNG } from "@/lib/poster.mjs";
import { todayStr } from "@/lib/ui.jsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/poster?method=BANK   → marketing rate-poster PNG for a Cambodia service.
//
// This is a DATA endpoint (not under /api/pipeline), so middleware accepts the
// machine token (?token=<RATES_TOKEN> or x-api-token) exactly like /rates — which
// is what lets Microsoft Teams / Power Automate embed the image by URL. The admin
// session cookie also satisfies it, so the in-app "Generate poster" button works too.
export async function GET(req) {
  const country = getCountry("KH"); // Cambodia only (pipeline scope)
  const url = new URL(req.url);
  const methodKey = url.searchParams.get("method") || country.methods[0].key;
  const method = country.methods.find((m) => m.key === methodKey);
  if (!method) return new Response(JSON.stringify({ error: "unknown method" }), { status: 400 });

  const { records } = await getCountryRecords(country, false);
  const d = buildRankingData(country, records, getStore());

  const anchorKey = anchorOf(country.anchor, method.key);
  const row = (d.blocks[method.key] || []).find((r) => r.provider === anchorKey && !r.noRate && r.total != null);
  if (!row) {
    return new Response(JSON.stringify({ error: "no live GME rate for this service" }), { status: 409 });
  }

  const png = await posterPNG({
    countryName: country.name,
    currency: country.currency,
    receiveAmount: country.receiveAmount,
    methodLabel: method.label,
    rate: row.krw / country.receiveAmount, // pure exchange rate (fee shown separately)
    krw: row.krw,
    fee: row.fee,
    total: row.total,
    dateStr: todayStr(),
  });

  const fname = `GME-${country.code}-${method.key}-${todayStr()}.png`;
  return new Response(png, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="${fname}"`,
      // Let Teams/browsers cache briefly so re-renders in a card are cheap.
      "Cache-Control": "public, max-age=120",
    },
  });
}
