import { NextResponse } from "next/server";
import { getRatesPayload } from "@/lib/cache.mjs";
import { logEvent } from "@/lib/analytics.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cambodia base-rate payload for Excel / Power Automate — unchanged shape.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-token, content-type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req) {
  const url = new URL(req.url);
  const fresh = url.searchParams.get("fresh") === "1";
  const t0 = Date.now();
  try {
    const { data, cached } = await getRatesPayload(fresh);
    logEvent({ k: "api", p: "/rates", c: "KH", d: Date.now() - t0, ch: cached });
    return NextResponse.json(data, { headers: { ...CORS, "x-cache": cached ? "HIT" : "MISS" } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS });
  }
}
