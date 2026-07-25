import { NextResponse } from "next/server";
import { readStats } from "@/lib/analytics.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await readStats();
  return NextResponse.json(s || {});
}
