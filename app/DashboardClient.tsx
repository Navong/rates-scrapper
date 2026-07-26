"use client";

// Client-rendered dashboard. Polls /api/ranking (cookie auth, same-origin) so
// switching corridor/method or refreshing never reloads the page.

import { useCallback, useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { AppHeader, SiteFooter } from "@/lib/ui";
import { anchorOf } from "@/lib/countries";
import CountryViewPicker from "./CountryViewPicker";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const fmt = (n) => "₩" + Math.round(n).toLocaleString("en-US");
const n0 = (v) => Math.round(v).toLocaleString("en-US");
// Channel dot colours fall back to the provider family ("GME_WU" → "GME").
const chipFor = (chip, p) => chip[p] || chip[String(p).split("_")[0]] || "#888";

// Operational counters for the red stat bar (mirrors the server's sheetStats).
function computeStats(d, method) {
  const anchorKey = anchorOf(d.anchor, method);
  const rows = d.blocks[method] || [];
  const live = rows.filter((r) => !r.noRate && r.total != null);
  const gme = live.find((r) => r.provider === anchorKey);
  const asc = [...live].sort((a, b) => a.total - b.total);
  const cheapest = asc[0];
  const rank = gme ? asc.findIndex((r) => r.provider === anchorKey) + 1 : null;
  const beat = gme ? live.filter((r) => r.total < gme.total).length : null;
  const gap = gme && cheapest ? gme.total - cheapest.total : null;
  const toUpdate = d.manualNeed || 0;
  return {
    cards: [
      { k: "Live", v: live.length, d: "var(--good)" },
      { k: "Beat GME", v: beat == null ? "—" : beat, d: "var(--brand)" },
      { k: "GME rank", v: rank == null ? "—" : "#" + rank, d: "#3a86ff" },
      { k: "To update", v: toUpdate, d: "var(--warn)" },
    ],
    totals: [
      { k: cheapest ? cheapest.op : "Cheapest", v: cheapest ? fmt(cheapest.total) : "—" },
      { k: "vs GME", v: gap == null ? "—" : gap > 0 ? "+" + fmt(gap) : "Best" },
    ],
  };
}

// Shadcn/Recharts diverging bar chart: axis = the anchor (GME).
function Chart({ d, method, chip }) {
  const rows = (d.blocks[method] || []).filter((r) => !r.noRate && r.total != null).slice().sort((a, b) => b.total - a.total);
  if (!rows.length) return null;

  const anchorKey = anchorOf(d.anchor, method);
  const anchor = anchorKey ? rows.find((r) => r.provider === anchorKey) : null;
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.gap ?? 0)));
  const domain = Math.ceil(maxAbs * 1.28);
  const chartData = rows.map((r) => ({
    provider: r.provider,
    label: r.op + (r.manual ? "*" : ""),
    gap: anchorKey === r.provider ? 0 : (r.gap ?? 0),
    total: r.total,
    fee: r.fee,
    color: chipFor(chip, r.provider),
    anchor: anchorKey === r.provider,
  }));
  const config = {
    gap: { label: "Price gap", color: "var(--good)" },
  };

  const ProviderTick = ({ x, y, payload }) => {
    const item = chartData.find((row) => row.provider === payload.value);
    if (!item) return null;
    return (
      <g transform={`translate(${x},${y})`}>
        <circle cx={-88} cy={0} r={4} fill={item.color} />
        <text x={-76} y={4} fill={item.anchor ? "var(--brand)" : "var(--text)"} fontSize={11.5} fontWeight={item.anchor ? 750 : 600}>
          {item.label}
        </text>
      </g>
    );
  };

  const GapBar = ({ x, y, width, height, payload }) => {
    const item = payload;
    if (!item) return null;
    const positive = item.gap > 0;
    const rectX = width < 0 ? x + width : x;
    const rectWidth = Math.abs(width);
    const label = item.anchor ? "anchor" : `${positive ? "+" : "−"}${n0(Math.abs(item.gap))}`;
    return (
      <g>
        {!item.anchor && item.gap !== 0 ? (
          <rect x={rectX} y={y} width={rectWidth} height={height} rx={4} fill={positive ? "var(--bad)" : "var(--good)"} fillOpacity={0.9} />
        ) : null}
        <text
          x={item.anchor ? x + 8 : positive ? rectX + rectWidth + 7 : rectX - 7}
          y={y + height / 2 + 4}
          textAnchor={item.anchor || positive ? "start" : "end"}
          fill={item.anchor ? "var(--muted)" : positive ? "var(--bad)" : "var(--good)"}
          fontSize={11}
          fontWeight={700}
        >
          {label}
        </text>
      </g>
    );
  };

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-[112px] top-0 z-10 flex justify-center gap-5 text-[10.5px] text-muted">
        <span>← cheaper</span><span>more expensive →</span>
      </div>
      <ChartContainer config={config} className="h-auto min-h-[220px] w-full" style={{ height: Math.max(220, chartData.length * 34 + 48) }}>
        <BarChart accessibilityLayer data={chartData} layout="vertical" margin={{ top: 24, right: 58, left: 14, bottom: 4 }}>
          <CartesianGrid horizontal={false} />
          <YAxis dataKey="provider" type="category" tickLine={false} axisLine={false} width={104} tick={<ProviderTick />} />
          <XAxis type="number" domain={[-domain, domain]} hide />
          <ReferenceLine x={0} stroke="var(--muted)" strokeOpacity={0.5} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(_, payload) => payload?.[0]?.payload?.label}
                formatter={(value, _name, item) => (
                  <>
                    <span className="flex-1 text-muted">{item.payload?.anchor ? "GME anchor" : "Price gap"}</span>
                    <b className="tabular-nums">
                      {item.payload?.anchor ? "Anchor" : `${Number(value) > 0 ? "+" : "−"}${fmt(Math.abs(Number(value)))}`}
                    </b>
                    <span className="col-span-2 text-[11px] text-muted">Total {fmt(item.payload?.total)} · fee {fmt(item.payload?.fee)}</span>
                  </>
                )}
              />
            }
          />
          <Bar dataKey="gap" shape={<GapBar />} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function DashboardSkeletonRow() {
  return (
    <div className="row skeleton" aria-hidden="true">
      <div className="skrank" />
      <div>
        <div className="skop">
          <span className="skdot" />
          <span className="skline main" />
          <span className="skpill" />
        </div>
        <div className="skline meta" />
      </div>
      <div className="skamt">
        <div className="skline total" />
        <div className="skline delta" />
      </div>
    </div>
  );
}

const TAG = {
  fresh: null,
  stale: <span className="unset">stale</span>,
  expired: <span className="unset">expired — shows &quot;-&quot;</span>,
  unset: <span className="unset">never set</span>,
};

function ManualNote({ d }) {
  const mp = d.manualProviders || [];
  if (!mp.length) return "All competitors on this corridor are scraped automatically.";
  const bad = d.manualNeed || 0;
  return (
    <>
      * <b>Manual input</b> — no public rate API:{" "}
      {mp.map((m, i) => (
        <span key={m.code}>
          {i > 0 ? ", " : ""}
          <b>{m.label}</b> <span style={{ opacity: 0.75 }}>{m.status === "unset" ? "" : m.age}</span>
          {TAG[m.status] ? <> {TAG[m.status]}</> : null}
        </span>
      ))}
      .{" "}
      {bad ? <b className="unset">{bad} need updating.</b> : null}{" "}
      <a href={`/ranking?country=${d.country}`}>Edit on sheet view →</a>
    </>
  );
}

export default function DashboardClient({ countries, chip, reportDate, initialCountry, initialData, admin = false }) {
  const [country, setCountry] = useState(initialCountry || countries[0].code);
  const [method, setMethod] = useState(null);
  const [data, setData] = useState(initialData || null);
  const [at, setAt] = useState(initialData ? Date.now() : 0);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const loadingRef = useRef(false);
  const didMount = useRef(false);

  const load = useCallback(async (code, fresh) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setErr("");
    try {
      const url = `/api/ranking?country=${code}${fresh ? "&fresh=1" : ""}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      setData(j);
      setAt(Date.now());
    } catch (e) {
      setErr(e.message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // `mounted` gates client-only, locale-sensitive text (the "updated HH:MM:SS")
  // so it isn't rendered during SSR/hydration (avoids a hydration mismatch).
  useEffect(() => setMounted(true), []);

  // On mount, reuse the server-seeded data (no client round-trip). On a later
  // corridor switch, clear to the skeleton and fetch the new corridor.
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      if (data) return; // seeded by the server → skip the initial fetch
    } else {
      setMethod(null);
      setData(null);
    }
    load(country, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  // Poll ~4min, jittered ±20s so open tabs never sync into a burst.
  useEffect(() => {
    const id = setInterval(() => load(country, false), 240000 + Math.floor((Math.random() * 40 - 20) * 1000));
    return () => clearInterval(id);
  }, [country, load]);

  const d = data;
  const methods = d?.methods || [];
  const curMethod = d ? (method && methods.some((m) => m.key === method) ? method : methods[0].key) : null;

  const refreshBtn = (
    <button className={"btn" + (loading ? " spin" : "")} id="refresh" title="Refresh" onClick={() => load(country, true)}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" />
      </svg>
      <span>Refresh</span>
    </button>
  );

  const curAmount = d ? ((methods.find((m) => m.key === curMethod)?.receiveAmount) ?? d.receiveAmount) : 0;
  const sub = d
    ? <>{d.flag} {d.name} · receive {curAmount.toLocaleString("en-US")} {d.currency}{mounted && at ? ` · updated ${new Date(at).toLocaleTimeString()}` : ""}</>
    : "Loading…";

  // Exclude no-rate / unset manual rows so an expired competitor never shows as
  // a ₩0 "cheapest". They still appear as "-" on the sheet view and are counted
  // in the manual note / "To update" stat.
  const sourceRows = d ? (d.blocks[curMethod] || []) : [];
  const liveRows = sourceRows.filter((r) => !r.noRate && r.total != null).slice().sort((a, b) => a.total - b.total);
  const noRateRows = sourceRows.filter((r) => r.noRate || r.total == null);
  const rows = [...liveRows, ...noRateRows];
  const min = liveRows.length ? liveRows[0].total : 0;
  const max = liveRows.length ? liveRows[liveRows.length - 1].total : 0;
  const anchorKey = d ? anchorOf(d.anchor, curMethod) : null;
  const anchor = anchorKey ? liveRows.find((r) => r.provider === anchorKey) : null;

  return (
    <main className="wrap dashpage">
      <AppHeader
        title="Rate comparison"
        sub={sub}
        active="dashboard"
        country={country}
        extra={refreshBtn}
        stats={d ? computeStats(d, curMethod) : null}
        reportDate={reportDate}
        admin={admin}
        showNav={false}
      />

      <CountryViewPicker
        countries={countries}
        country={country}
        activeView="dashboard"
        onCountryChange={setCountry}
        admin={admin}
      />

      {d && methods.length > 1 ? (
        <div className="mtabs">
          {methods.map((m) => (
            <button key={m.key} className={"mtab" + (m.key === curMethod ? " on" : "")} onClick={() => setMethod(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
      ) : null}

      <div id="warn">
        {err
          ? <div className="warn">Failed to load: {err}</div>
          : d?.failed?.length
            ? <div className="warn">⚠ Unavailable this run: {d.failed.map((f) => f.who).join(", ")}</div>
            : null}
      </div>

      <div className="cols">
        <div>
          <div className="summary" id="summary">
            {!d ? (
              <><div className="lbl">Cheapest</div><div className="big">—</div></>
            ) : liveRows.length ? (
              <>
                <div className="lbl">Cheapest — {liveRows[0].op}</div>
                <div className="big">{fmt(min)}</div>
                <div className="lbl">
                  saves {fmt(max - min)} vs {liveRows[liveRows.length - 1].op}
                  {anchor ? ` · ${anchor.op} is ${fmt(Math.abs(anchor.total - min))} ${anchor.total > min ? "higher" : "lowest"}` : ""}
                </div>
              </>
            ) : null}
          </div>

          <div className="rows" id="rows">
            {!d
              ? Array.from({ length: 6 }).map((_, i) => <DashboardSkeletonRow key={i} />)
              : rows.map((r, i) => {
                const hasRate = !r.noRate && r.total != null;
                const isBest = hasRate && i === 0, isAnchor = anchorKey === r.provider;
                const delta = hasRate ? r.total - min : null;
                const vs = hasRate && anchor ? r.total - anchor.total : null;
                const pct = hasRate && max > min ? ((r.total - min) / (max - min)) * 100 : 0;
                const dCls = delta === 0 ? "zero" : "up";
                return (
                  <div className={`row ${isBest ? "best" : ""} ${isAnchor ? "anchor" : ""} ${hasRate ? "" : "norate"}`} key={r.provider}>
                    {hasRate ? <div className="bar" style={{ width: pct + "%" }} /> : null}
                    <div className="rank">{hasRate ? i + 1 : "-"}</div>
                    <div>
                      <div className="op">
                        <span className="dot" style={{ background: chipFor(chip, r.provider) }} />{r.op}
                        {isBest ? <span className="badge b-best">Cheapest</span> : null}
                        {isAnchor ? <span className="badge b-anchor">You</span> : null}
                        {r.manual ? <span className="mtag" title="No public rate API — typed in manually">manual</span> : null}
                      </div>
                      <div className="meta">{hasRate ? <>fee {fmt(r.fee)} · exchange {fmt(r.total - r.fee)}</> : "fee - · exchange -"}</div>
                    </div>
                    <div className="amt">
                      <div className="t">{hasRate ? fmt(r.total) : "-"}</div>
                      <div className={`delta ${dCls}`}>{hasRate ? (delta === 0 ? "best price" : "+" + fmt(delta)) : (r.manualStatus || "needs update")}</div>
                      {vs !== null && !isAnchor ? (
                        <div>
                          <span className={`delta ${vs > 0 ? "up" : "down"}`}>
                            {vs > 0 ? "+" : "−"}{fmt(Math.abs(vs))} vs {anchor ? anchor.op : ""}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-line">
            <CardTitle id="chart-title">
              {d && anchor ? `Price gap vs ${anchor.op}` : d ? "Total price spread" : "Price gap vs GME"}
            </CardTitle>
            <CardDescription>Compared with the GME anchor · lower is cheaper</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pt-5">
            <div id="chart">
              {!d ? <div className="skel" style={{ height: 220 }} /> : <Chart d={d} method={curMethod} chip={chip} />}
            </div>
          </CardContent>
          <CardFooter className="border-t border-line px-6 py-4">
            <div className="note m-0" id="manual-note">{d ? <ManualNote d={d} /> : null}</div>
          </CardFooter>
        </Card>
      </div>

      <SiteFooter note={<span id="auto">Auto-refresh 4m</span>} />
    </main>
  );
}
