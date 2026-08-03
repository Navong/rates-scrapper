import { getCountry } from "@/lib/countries";
import { getCountryRecords } from "@/lib/cache";
import { buildRankingData } from "@/lib/ranking";
import { getStore } from "@/lib/manual";
import { sheetPNG } from "@/lib/sheet-image";
import { koreaTime24, todayStr } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sheet?country=KH  → the ranking sheet (all services) as a PNG.
//
// Data endpoint (accepts ?token=<RATES_TOKEN> or x-api-token, like /rates), so a
// Teams / Power Automate workflow can grab the sheet image by URL — the server-side
// equivalent of the sheet view's "Copy image" button. The admin cookie works too.
export async function GET(req) {
  const code = (new URL(req.url).searchParams.get("country") || "KH").toUpperCase();
  const country = getCountry(code);
  if (!country) return new Response(JSON.stringify({ error: "unknown country" }), { status: 400 });

  const { records } = await getCountryRecords(country, false);
  const d = buildRankingData(country, records, getStore());

  // Explicit Korean time, independent of the host/container timezone.
  const now = new Date();
  const dateStr = todayStr(now);
  const timeStr = koreaTime24(now);

  const png = await sheetPNG(d, dateStr, timeStr);
  const fname = `sheet-${code}-${dateStr}.png`;
  return new Response(png, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="${fname}"`,
      "Cache-Control": "public, max-age=120",
    },
  });
}
