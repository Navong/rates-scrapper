"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import CountryViewPicker from "../CountryViewPicker";
import { AppHeader, SiteFooter } from "@/lib/ui";

const COLORS = ["#e4002b", "#3a86ff", "#12b886", "#8e24aa", "#f59f00", "#00a8a8", "#e8590c", "#495057", "#d6336c", "#5f3dc4"];
const money = (v) => `₩${Math.round(v).toLocaleString("en-US")}`;

function RateTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const interpolated = payload[0]?.payload?._interpolated;
  const shownPayload = payload.slice(0, 8);
  const remaining = payload.length - shownPayload.length;
  return (
    <div className="shadcn-chart-tooltip">
      <div className="tooltip-time">
        {new Date(Number(label)).toLocaleString("en-US", {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        })}
      </div>
      {shownPayload.map((item) => (
        <div className="tooltip-row" key={item.dataKey}>
          <span className="tooltip-dot" style={{ background: item.color }} />
          <span>{item.name}</span>
          <b>{money(item.value)}</b>
        </div>
      ))}
      {remaining > 0 ? <div className="tooltip-more">+{remaining} more providers</div> : null}
      {interpolated ? <div className="tooltip-estimate">Between 30-min snapshots</div> : null}
    </div>
  );
}

function HourlyDot({ cx, cy, payload, stroke }: any) {
  if (payload?._interpolated || cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={3.5} fill="var(--card)" stroke={stroke} strokeWidth={2} />;
}

function RateChart({ providers, visible, range, from, to }) {
  const shown = providers.filter((p) => visible.has(p.key) && p.points.length);
  const points = shown.flatMap((p) => p.points);
  const chartData = useMemo(() => {
    const byTime = new Map();
    for (const provider of shown) {
      for (const point of provider.points) {
        const row = byTime.get(point.t) || { t: point.t };
        row[provider.key] = point.v;
        byTime.set(point.t, row);
      }
    }
    // Points are already 30-minute spaced from the backend — plot them directly.
    const rows = [...byTime.values()].sort((a, b) => a.t - b.t);

    // Recharts activates an axis tooltip at data rows. Add interpolated hover
    // positions between the real 30-minute rows so the tooltip works along the
    // whole line rather than only at each point.
    const step = 5 * 60 * 1000;
    const dense = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      dense.push(a);
      for (let t = a.t + step; t < b.t; t += step) {
        const ratio = (t - a.t) / (b.t - a.t);
        const row = { t, _interpolated: true };
        for (const provider of shown) {
          const av = a[provider.key], bv = b[provider.key];
          if (Number.isFinite(av) && Number.isFinite(bv)) row[provider.key] = av + (bv - av) * ratio;
        }
        dense.push(row);
      }
    }
    if (rows.length) dense.push(rows[rows.length - 1]);
    return dense;
  }, [shown]);

  // Real (non-interpolated) point count — used to hide dots when the line is dense.
  const realCount = chartData.filter((r) => !r._interpolated).length;
  const showDots = realCount <= 160;

  if (!points.length) return <div className="history-empty">No automatic rate history has been collected for this selection yet.</div>;

  const rawMin = Math.min(...points.map((p) => p.v));
  const rawMax = Math.max(...points.map((p) => p.v));
  // Tight padding so small intraday moves aren't flattened by empty headroom.
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
            width={62}
            tickFormatter={(v) => `${Math.round(v / 1000)}k`}
          />
          <Tooltip
            shared
            trigger="hover"
            cursor={false}
            content={<RateTooltip />}
            isAnimationActive
            animationDuration={120}
            animationEasing="ease-out"
            allowEscapeViewBox={{ x: false, y: false }}
          />
          {shown.map((provider) => {
            const color = COLORS[providers.findIndex((p) => p.key === provider.key) % COLORS.length];
            return (
              <Line
                key={provider.key}
                dataKey={provider.key}
                name={provider.label}
                type="natural"
                stroke={color}
                strokeWidth={2}
                dot={showDots ? <HourlyDot /> : false}
                activeDot={{ r: 5, fill: "var(--card)", strokeWidth: 2 }}
                connectNulls
                isAnimationActive
                animationDuration={550}
                animationEasing="ease-out"
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function HistoryClient({ countries, initialCountry, initialMethod, initialRange = "today", initialData, reportDate, admin = false }) {
  const [country, setCountry] = useState(initialCountry);
  const [method, setMethod] = useState(initialMethod);
  const [range, setRange] = useState(initialRange);
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
      return;
    }
    const first = methods[0]?.key;
    if (!first) return;
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
          <div><h2>Total KRW trend</h2><p>Automatic providers only · 30-minute points</p></div>
          <div className="history-actions">
            <div className="history-range" aria-label="Graph time range">
              <button className={range === "today" ? "on" : ""} onClick={() => changeRange("today")}>Today</button>
              <button className={range === "7d" ? "on" : ""} onClick={() => changeRange("7d")}>7 days</button>
            </div>
            <button className="btn" onClick={() => load(country, method, range)} disabled={loading}>{loading ? "Loading…" : "Refresh graph"}</button>
          </div>
        </div>

        {error ? <div className="warn">Failed to load history: {error}</div> : null}
        <div className="history-legend">
          {(data?.providers || []).map((p, i) => (
            <button key={p.key} className={visible.has(p.key) ? "on" : ""} onClick={() => toggleProvider(p.key)}>
              <span style={{ background: COLORS[i % COLORS.length] }} />{p.label}
            </button>
          ))}
        </div>
        <RateChart
          providers={data?.providers || []}
          visible={visible}
          range={range}
          from={data?.from}
          to={data?.to}
        />
      </section>

      <SiteFooter note="History begins collecting after this feature is deployed; manual entries are never included." />
    </main>
  );
}
