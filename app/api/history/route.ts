import { NextResponse } from "next/server";
import { getCountry } from "@/lib/countries";
import { readRateHistory } from "@/lib/rate-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const url = new URL(req.url);
  const country = getCountry(url.searchParams.get("country") || "KH");
  const requested = url.searchParams.get("method");
  const range = url.searchParams.get("range") === "7d" ? "7d" : "today";
  const method = country.methods.some((m) => m.key === requested)
    ? requested
    : country.methods[0].key;
  return NextResponse.json(await readRateHistory(country, method, range));
}
