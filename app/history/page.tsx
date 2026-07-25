import { cookies } from "next/headers";
import { countryList, getCountry } from "@/lib/countries";
import { roleFromValue } from "@/lib/roles";
import { todayStr } from "@/lib/ui";
import HistoryClient from "./HistoryClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const country = getCountry(sp.country || "KH");
  const method = country.methods.some((m) => m.key === sp.method)
    ? sp.method
    : country.methods[0].key;
  const range = sp.range === "today" ? "today" : "7d";
  const admin = roleFromValue((await cookies()).get("rt")?.value) === "admin";

  return (
    <HistoryClient
      countries={countryList()}
      initialCountry={country.code}
      initialMethod={method}
      initialRange={range}
      initialData={null}
      reportDate={todayStr()}
      admin={admin}
    />
  );
}
