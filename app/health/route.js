import { NextResponse } from "next/server";
import { healthCorridors, inflightSize } from "@/lib/cache.mjs";
import { limiterStats } from "@/lib/limiter.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    corridors: healthCorridors(),
    inflight: inflightSize(),
    limiter: limiterStats(),
  });
}
