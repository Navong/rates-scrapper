"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import CountryViewPicker from "../CountryViewPicker";
import { AppHeader, SiteFooter } from "@/lib/ui";

// Line colours match the sheet's provider colours (deepened just enough to read
// as thin lines on a light card). Channel keys like "GME_WU" fall back to the
// family colour ("GME"); anything unmapped cycles the fallback palette.
const PROVIDER_COLOR = {
  GME: "#FF0000", E9PAY: "#EAB308", GMONEY: "#5CB338", HANPASS: "#9B5DE5",
  SBI: "#00B4D8", JRF: "#7FB3E0", CROSS: "#2E77BC",
  COINSHOT: "#12B886", UTRANSFER: "#E8590C", PANDA: "#5F3DC4",
};
const FALLBACK = ["#495057", "#d6336c", "#3a86ff", "#00a8a8", "#f59f00"];
const colorFor = (key, i = 0) =>
  PROVIDER_COLOR[key] || PROVIDER_COLOR[String(key).split("_")[0]] || FALLBACK[i % FALLBACK.length];
const money = (v) => `₩${Math.round(v).toLocaleString("en-US")}`;

const signed = (v) => {
  const r = Math.round(v);
  return r === 0 ? "₩0" : `${r > 0 ? "+" : "−"}₩${Math.abs(r).toLocaleString("en-US")}`;
};

function RateTooltip({ active, payload, label, mode }: any) {
  if (!active || !payload?.length) return null;
  const interpolated = payload[0]?.payload?._interpolated;
  const shownPayload = payload.slice(0, 8);
  const remaining = payload.length - shownPayload.length;
  const fmt = (item) => mode === "movement"
    ? `${signed(item.value)}  (${money(item.payload?.[`${item.dataKey}__abs`])})`
    : money(item.value);
  return (
    <div className="shadcn-chart-tooltip">
      <div className="tooltip-time">
        {new Date(Number(label)).toLocaleString("en-US", {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        })}{mode === "movement" ? " · vs average" : ""}
      </div>
      {shownPayload.map((item) => (
        <div className="tooltip-row" key={item.dataKey}>
          <span className="tooltip-dot" style={{ background: item.color }} />
          <span>{item.name}</span>
          <b>{fmt(item)}</b>
        </div>
      ))}
      {remaining > 0 ? <div className="tooltip-more">+{remaining} more providers</div> : null}
      {interpolated ? <div className="tooltip-estimate">Between 10-min snapshots</div> : null}
    </div>
  );
}

function HourlyDot({ cx, cy, payload, stroke, sparse, onPointEnter, onPointLeave }: any) {
  if (payload?._interpolated || cx == null || cy == null) return null;
  if (sparse && new Date(payload.t).getMinutes() !== 0) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="var(--card)"
      stroke={stroke}
      strokeWidth={2}
      className="history-point"
      onMouseEnter={() => onPointEnter?.(payload, cx, cy)}
      onMouseLeave={() => onPointLeave?.()}
    />
  );
}

export function HistoryChartSkeleton() {
  return (
    <div className="history-chart-skeleton" aria-busy="true" aria-label="Loading rate graph">
      <div className="history-skeleton-legend">
        {Array.from({ length: 5 }).map((_, i) => <span className="sk" key={i} />)}
      </div>
      <div className="history-skeleton-chart sk">
        <span className="history-skeleton-line line-one" />
        <span className="history-skeleton-line line-two" />
        <span className="history-skeleton-line line-three" />
      </div>
    </div>
  );
}

function RateChart({ providers, visible, range, from, to, mode }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const shown = providers.filter((p) => visible.has(p.key) && p.points.length);
  const points = shown.flatMap((p) => p.points);
  const chartData = useMemo(() => {
    // "movement" plots each provider's deviation from its own average so tiny
    // moves aren't flattened by the big price gap between providers; "price" plots
    // absolute KRW. The absolute value is kept alongside (…__abs) for the tooltip.
    const mean = {};
    for (const p of shown) mean[p.key] = p.points.reduce((s, pt) => s + pt.v, 0) / p.points.length;

    const byTime = new Map();
    for (const provider of shown) {
      for (const point of provider.points) {
        const row = byTime.get(point.t) || { t: point.t };
        row[provider.key] = mode === "movement" ? point.v - mean[provider.key] : point.v;
        row[`${provider.key}__abs`] = point.v;
        byTime.set(point.t, row);
      }
    }
    return [...byTime.values()].sort((a, b) => a.t - b.t);
  }, [shown, mode]);

  // Real (non-interpolated) point count — used to hide dots when the line is dense.
  const realCount = chartData.filter((r) => !r._interpolated).length;
  const tooltipPayload = hoveredPoint
    ? shown
      .filter((provider) => Number.isFinite(hoveredPoint.row[provider.key]))
      .map((provider, i) => ({
        dataKey: provider.key,
        name: provider.label,
        value: hoveredPoint.row[provider.key],
        color: colorFor(provider.key, Math.max(0, providers.findIndex((p) => p.key === provider.key))),
        payload: hoveredPoint.row,
      }))
    : [];

  if (!points.length) return <div className="history-empty">No automatic rate history has been collected for this selection yet.</div>;

  // Range from the plotted deviation values, with tight padding so small intraday
  // moves aren't flattened by empty headroom.
  const plotted = chartData.flatMap((r) => shown.map((p) => r[p.key])).filter(Number.isFinite);
  const rawMin = plotted.length ? Math.min(...plotted) : 0;
  const rawMax = plotted.length ? Math.max(...plotted) : 0;
  const padding = Math.max(60, (rawMax - rawMin) * .03);

  return (
    <div className="shadcn-chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 12, right: 12, bottom: 8, left: 12 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            allowDataOverflow
            tickLine={false}
            axisLine={false}
            minTickGap={38}
            tickMargin={8}
            tickFormatter={(t) => range === "today"
              ? new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
              : new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" })}
          />
          <YAxis
            domain={[rawMin - padding, rawMax + padding]}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={72}
            tickFormatter={(v) => mode === "movement" ? signed(v) : `${Math.round(v / 1000)}k`}
          />
          {/* Render GME (the anchor) LAST so its line sits on top and is never
              hidden where the movement lines overlap near zero. */}
          {[...shown]
            .sort((a, b) => (String(a.key).split("_")[0] === "GME" ? 1 : 0) - (String(b.key).split("_")[0] === "GME" ? 1 : 0))
            .map((provider) => {
              const isGme = String(provider.key).split("_")[0] === "GME";
              const color = colorFor(provider.key, providers.findIndex((p) => p.key === provider.key));
              return (
                <Line
                  key={provider.key}
                  dataKey={provider.key}
                  name={provider.label}
                  type="natural"
                  stroke={color}
                  strokeWidth={isGme ? 3 : 2}
                  dot={(
                    <HourlyDot
                      sparse={realCount > 160}
                      onPointEnter={(row, x, y) => setHoveredPoint({ row, x, y })}
                      onPointLeave={() => setHoveredPoint(null)}
                    />
                  )}
                  activeDot={false}
                  connectNulls
                  isAnimationActive
                  animationDuration={550}
                  animationEasing="ease-out"
                />
              );
            })}
        </LineChart>
      </ResponsiveContainer>
      {hoveredPoint ? (
        <div
          className="history-point-tooltip"
          style={{
            "--tooltip-x": `${hoveredPoint.x + 12}px`,
            "--tooltip-y": `${hoveredPoint.y + 12}px`,
          } as any}
        >
          <RateTooltip active payload={tooltipPayload} label={hoveredPoint.row.t} mode={mode} />
        </div>
      ) : null}
    </div>
  );
}

export default function HistoryClient({ countries, initialCountry, initialMethod, initialRange = "today", initialData, reportDate, admin = false }) {
  const [country, setCountry] = useState(initialCountry);
  const [method, setMethod] = useState(initialMethod);
  const [range, setRange] = useState(initialRange);
  const [mode, setMode] = useState("movement"); // "price" | "movement"
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visibleKeys, setVisibleKeys] = useState(initialData?.providers?.map((p) => p.key) || []);
  const didMount = useRef(false);
  const countryCfg = countries.find((c) => c.code === country) || countries[0];
  const methods = countryCfg?.methods || [];

  const load = useCallback(async (code, nextMethod, nextRange) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/history?country=${code}&method=${nextMethod}&range=${nextRange}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      if (data) return;
      load(country, method, range);
      return;
    }
    const first = methods[0]?.key;
    if (!first) return;
    setData(null);
    setMethod(first);
    window.history.replaceState(null, "", `/history?country=${country}&method=${first}&range=${range}`);
    load(country, first, range);
  }, [country]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setVisibleKeys(data?.providers?.map((p) => p.key) || []);
  }, [data]);

  const visible = useMemo(() => new Set(visibleKeys), [visibleKeys]);
  const latest = data?.providers?.flatMap((p) => p.points.map((point) => ({ ...point, provider: p.label })))
    .sort((a, b) => b.t - a.t)[0];
  const stats = data ? {
    cards: [
      { k: "Tracked providers", v: data.providers.length, d: "#3a86ff" },
      { k: "Snapshots", v: data.snapshots, d: "var(--good)" },
      { k: "Window", v: range === "today" ? "Today" : "7 days", d: "var(--brand)" },
      { k: "Manual rates", v: "Excluded", d: "var(--warn)" },
    ],
    totals: [
      { k: "Latest", v: latest ? money(latest.v) : "—" },
      { k: "Series", v: visible.size },
    ],
  } : null;

  function changeMethod(next) {
    setMethod(next);
    window.history.replaceState(null, "", `/history?country=${country}&method=${next}&range=${range}`);
    load(country, next, range);
  }

  function changeRange(next) {
    setRange(next);
    window.history.replaceState(null, "", `/history?country=${country}&method=${method}&range=${next}`);
    load(country, method, next);
  }

  function toggleProvider(key) {
    setVisibleKeys((current) => current.includes(key) ? current.filter((x) => x !== key) : [...current, key]);
  }

  return (
    <main className="wrap historypage">
      <AppHeader
        title="7-day rate history"
        sub={`${countryCfg.flag} ${countryCfg.name} · total KRW required for the configured receive amount`}
        active="history"
        stats={stats}
        reportDate={reportDate}
        admin={admin}
        showNav={false}
      />

      <CountryViewPicker countries={countries} country={country} activeView="history" onCountryChange={setCountry} admin={admin} />

      {methods.length > 1 ? (
        <div className="mtabs history-methods">
          {methods.map((m) => (
            <button key={m.key} className={`mtab${method === m.key ? " on" : ""}`} onClick={() => changeMethod(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
      ) : null}

      <section className={`panel history-panel${loading ? " loading" : ""}`}>
        <div className="history-panel-head">
          <div>
            <h2>{mode === "movement" ? "Rate movement" : "Total KRW trend"}</h2>
            <p>{mode === "movement" ? "Deviation from each provider's average" : "Total KRW required"} · 10-minute points</p>
          </div>
          <div className="history-actions">
            <div className="history-range" aria-label="Graph value mode">
              <button className={mode === "movement" ? "on" : ""} onClick={() => setMode("movement")}>Movement</button>
              <button className={mode === "price" ? "on" : ""} onClick={() => setMode("price")}>Price</button>
            </div>
            <div className="history-range" aria-label="Graph time range">
              <button className={range === "today" ? "on" : ""} onClick={() => changeRange("today")}>Today</button>
              <button className={range === "7d" ? "on" : ""} onClick={() => changeRange("7d")}>7 days</button>
            </div>
            <button className="btn" onClick={() => load(country, method, range)} disabled={loading}>{loading ? "Loading…" : "Refresh graph"}</button>
          </div>
        </div>

        {error ? <div className="warn">Failed to load history: {error}</div> : null}
        {!data || loading ? <HistoryChartSkeleton /> : (
          <>
            <div className="history-legend">
              {(data?.providers || []).map((p, i) => (
                <button key={p.key} className={visible.has(p.key) ? "on" : ""} onClick={() => toggleProvider(p.key)}>
                  <span style={{ background: colorFor(p.key, i) }} />{p.label}
                </button>
              ))}
            </div>
            <RateChart
              providers={data?.providers || []}
              visible={visible}
              range={range}
              from={data?.from}
              to={data?.to}
              mode={mode}
            />
          </>
        )}
      </section>

      <SiteFooter note="History begins collecting after this feature is deployed; manual entries are never included." />
    </main>
  );
}
