import { cookies, headers } from "next/headers";
import { getCountry, countryList } from "@/lib/countries";
import { getCached } from "@/lib/cache";
import { buildRankingData } from "@/lib/ranking";
import { getStore } from "@/lib/manual";
import { logEvent } from "@/lib/analytics";
import { roleFromValue } from "@/lib/roles";
import { todayStr } from "@/lib/ui";
import SheetClient from "./SheetClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RankingPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const country = getCountry(sp.country || "KH");

  const ck = await cookies();
  const h = await headers();
  logEvent({ k: "page", p: "/ranking", c: country.code, v: ck.get("vid")?.value, u: h.get("cf-access-authenticated-user-email") || "" });

  // Seed from the warm cache for an instant first paint (no client round-trip).
  // Cold → null and the client fetches with a skeleton (chrome stays fixed).
  const hit = getCached(country.code);
  const initialData = hit
    ? { ...buildRankingData(country, hit.records, getStore()), failed: hit.errors }
    : null;

  const admin = roleFromValue(ck.get("rt")?.value) === "admin";
  const teamsEnabled = !!process.env.TEAMS_WEBHOOK_URL;

  return (
    <SheetClient
      countries={countryList()}
      reportDate={todayStr()}
      initialCountry={country.code}
      initialData={initialData}
      admin={admin}
      teamsEnabled={teamsEnabled}
    />
  );
}
