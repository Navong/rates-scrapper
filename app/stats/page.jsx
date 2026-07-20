import { cookies } from "next/headers";
import { countryList } from "@/countries.mjs";
import { readStats } from "@/analytics.mjs";
import { roleFromValue } from "@/lib/roles.mjs";
import { todayStr } from "@/lib/ui.jsx";
import StatsClient from "./StatsClient.jsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const s = await readStats();
  const names = Object.fromEntries(countryList().map((c) => [c.code, `${c.flag} ${c.name}`]));
  const admin = roleFromValue((await cookies()).get("rt")?.value) === "admin";
  return <StatsClient names={names} reportDate={todayStr()} initialStats={s || null} admin={admin} />;
}
