import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getCountry } from "@/lib/countries";
import { getCountryRecords } from "@/lib/cache";
import { buildRankingData } from "@/lib/ranking";
import { getStore } from "@/lib/manual";
import { logEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The dashboard polls this for corridor data. Same JSON shape the legacy
// /ranking?format=json produced, plus a `failed` array of unavailable providers.
export async function GET(req) {
  const url = new URL(req.url);
  const country = getCountry(url.searchParams.get("country") || "KH");
  const fresh = url.searchParams.get("fresh") === "1";
  const t0 = Date.now();
  try {
    const { records, errors, cached, stale } = await getCountryRecords(country, fresh);
    const manual = getStore();
    const data = { ...buildRankingData(country, records, manual), failed: errors };

    const dur = Date.now() - t0;
    const state = stale ? "STALE" : cached ? "HIT" : "MISS";
    const c = await cookies();
    const h = await headers();
    const failedDetail = errors.map((e) => `${e.who} (${e.error})`).join("; ") || "none";
    console.log(`[${new Date().toISOString()}] /api/ranking ${country.code} ${dur}ms cache=${state} failed=${failedDetail}`);
    logEvent({
      k: "api", p: "/ranking", c: country.code, d: dur, ch: cached,
      v: c.get("vid")?.value, u: h.get("cf-access-authenticated-user-email") || "",
    });
    return NextResponse.json(data, { headers: { "x-cache": state } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
