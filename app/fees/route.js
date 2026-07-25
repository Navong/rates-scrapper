import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { setFee, clearFee } from "@/lib/fees.mjs";
import { getCountry, PROVIDER_LABEL } from "@/lib/countries.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const url = new URL(req.url);
  const country = getCountry(url.searchParams.get("country") || "KH");
  return NextResponse.redirect(new URL(`/ranking?country=${country.code}`, url), 302);
}

// Save service-fee overrides from the sheet's fee editor. Field name is
// code__prov__method. An empty value clears the override (falls back to config).
export async function POST(req) {
  const url = new URL(req.url);
  const country = getCountry(url.searchParams.get("country") || "KH");
  const p = new URLSearchParams(await req.text());
  const h = await headers();
  const by = h.get("cf-access-authenticated-user-email") || "";
  const saved = [];

  for (const [key, raw] of p.entries()) {
    const parts = key.split("__");
    if (parts.length !== 3) continue;
    const [code, prov, method] = parts;
    if (raw.trim() === "") { clearFee(code, prov, method); continue; }
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) continue; // 0 is valid; negatives are not
    setFee(code, prov, method, n, by);
    saved.push(`${country.providers[prov]?.label || PROVIDER_LABEL[prov] || prov} ${n.toLocaleString()}`);
  }

  console.log(`[${new Date().toISOString()}] fees saved for ${country.code}: ${saved.join(", ") || "none"}`);

  if (url.searchParams.get("format") === "json") {
    return NextResponse.json({ ok: true, saved });
  }
  return NextResponse.redirect(new URL(`/ranking?country=${country.code}`, url), 302);
}
