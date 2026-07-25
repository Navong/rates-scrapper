import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getEntry, setEntry, statusOf, deviation } from "@/lib/manual";
import { getCountry, PROVIDER_LABEL } from "@/lib/countries";
import { getCountryRecords, invalidateCountry } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A bare GET just bounces to the sheet view — editing lives inline there.
export async function GET(req) {
  const url = new URL(req.url);
  const country = getCountry(url.searchParams.get("country") || "KH");
  return NextResponse.redirect(new URL(`/ranking?country=${country.code}`, url), 302);
}

// The inline sheet editor POSTs here (?format=json) and re-renders itself.
// Field name is code__prov__method. Values that look like typos are held back
// with a warning unless confirm=1.
export async function POST(req) {
  const url = new URL(req.url);
  const country = getCountry(url.searchParams.get("country") || "KH");
  const p = new URLSearchParams(await req.text());
  const confirm = p.get("confirm") === "1";
  const h = await headers();
  const by = h.get("cf-access-authenticated-user-email") || "";
  const saved = [], warnings = [], pending = {};

  const changes = [];
  for (const [key, raw] of p.entries()) {
    const parts = key.split("__");
    if (parts.length !== 3) continue;
    const [code, prov, method] = parts;
    if (raw.trim() === "") continue;
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) continue;
    const existing = getEntry(code, prov, method);
    // Re-submitting the same number for an EXPIRED rate must refresh its
    // timestamp; skip only when unchanged AND still fresh.
    if (existing && existing.value === n && existing.at && statusOf(existing).status === "fresh") continue;
    changes.push({ key, code, prov, method, raw, n, existing });
  }

  // Typo guard needs peers for the SAME method — load each touched corridor once.
  const peersByKey = {};
  if (!confirm && changes.length) {
    for (const { code, method } of changes) {
      const kk = `${code}|${method}`;
      if (kk in peersByKey) continue;
      try {
        const { records } = await getCountryRecords(getCountry(code), false);
        peersByKey[kk] = records.filter((r) => r.method === method).map((r) => r.principalKRW);
      } catch { peersByKey[kk] = []; }
    }
  }

  for (const { key, code, prov, method, raw, n, existing } of changes) {
    const kk = `${code}|${method}`;
    // Channels (e.g. GME_RIA) carry their own display label; fall back to PROVIDER_LABEL.
    const provLabel = getCountry(code).providers[prov]?.label || PROVIDER_LABEL[prov] || prov;
    if (!confirm) {
      let dev = deviation(n, peersByKey[kk] ?? []);
      if (!dev && (peersByKey[kk] ?? []).length < 2 && existing?.value) {
        const pctv = ((n - existing.value) / existing.value) * 100;
        if (Math.abs(pctv) > 15) dev = { pct: pctv, median: existing.value };
      }
      if (dev) {
        const ml = getCountry(code).methods.find((m) => m.key === method)?.label || method;
        warnings.push({ key, label: `${getCountry(code).name} · ${provLabel} · ${ml}`, value: n, ...dev });
        pending[key] = raw;
        continue;
      }
    }
    setEntry(code, prov, method, n, by);
    invalidateCountry(code);
    saved.push(`${provLabel} ${n.toLocaleString()}`);
  }

  console.log(`[${new Date().toISOString()}] manual saved: ${saved.join(", ") || "none"}${warnings.length ? ` | blocked: ${warnings.map((w) => w.label).join(", ")}` : ""}`);

  if (url.searchParams.get("format") === "json") {
    return NextResponse.json({ ok: true, saved, warnings, pending });
  }
  return NextResponse.redirect(new URL(`/ranking?country=${country.code}`, url), 302);
}
