import { cookies, headers } from "next/headers";
import { getCountry, countryList } from "@/lib/countries";
import { CHIP, buildRankingData } from "@/lib/ranking";
import { getCached } from "@/lib/cache";
import { getStore } from "@/lib/manual";
import { logEvent } from "@/lib/analytics";
import { roleFromValue } from "@/lib/roles";
import { todayStr } from "@/lib/ui";
import DashboardClient from "./DashboardClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  const ck = await cookies();
  const h = await headers();
  logEvent({ k: "page", p: "/", c: null, v: ck.get("vid")?.value, u: h.get("cf-access-authenticated-user-email") || "" });

  // Seed the first corridor from the warm cache so the dashboard paints with
  // real rates on first load — no download-hydrate-then-fetch round trip. If the
  // cache is cold we pass null and the client fetches (skeleton), same as before.
  const list = countryList();
  const initialCountry = list[0].code;
  const country = getCountry(initialCountry);
  const hit = getCached(initialCountry);
  const initialData = hit
    ? { ...buildRankingData(country, hit.records, getStore()), failed: hit.errors }
    : null;

  const admin = roleFromValue(ck.get("rt")?.value) === "admin";

  return (
    <DashboardClient
      countries={list}
      chip={CHIP}
      reportDate={todayStr()}
      initialCountry={initialCountry}
      initialData={initialData}
      admin={admin}
    />
  );
}
