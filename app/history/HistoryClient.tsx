"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import CountryViewPicker from "../CountryViewPicker";
import { KOREA_TIME_ZONE } from "@/lib/date";
import { AppHeader, SiteFooter } from "@/lib/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PROVIDER_COLOR = {
  // Keep the graph consistent with the provider colors used in the rate sheet.
  GME: "#ff0000", E9PAY: "#ffff00", SENTBE: "#9dc3e6",
  HANPASS: "#cc99ff", SBI: "#00ffff", GMONEY: "#92d050",
  JRF: "#0ea5e9", CROSS: "#84cc16",
  COINSHOT: "#14b8a6", UTRANSFER: "#f97316", PANDA: "#4b5563",
};
// Red is reserved for the GME family so its line is always identifiable.
const FALLBACK = ["#64748b", "#6366f1", "#2563eb", "#059669", "#d97706"];
const colorFor = (key, index = 0) =>
  PROVIDER_COLOR[key] || PROVIDER_COLOR[String(key).split("_")[0]] || FALLBACK[index % FALLBACK.length];
const isGme = (key) => String(key).split("_")[0] === "GME";
const money = (value) => `₩${Math.round(value).toLocaleString("en-US")}`;
const signed = (value) => {
  const rounded = Math.round(value);
  return rounded === 0 ? "₩0" : `${rounded > 0 ? "+" : "−"}₩${Math.abs(rounded).toLocaleString("en-US")}`;
};

export function HistoryChartSkeleton() {
  return (
    <Card className="overflow-hidden" aria-busy="true" aria-label="Loading rate graph">
      <CardHeader className="history-card-header border-b border-line">
        <div className="history-route-title sk" />
        <div className="history-route-subtitle sk" />
      </CardHeader>
      <CardContent className="history-card-content pt-6">
        <div className="history-skeleton-chart sk" />
      </CardContent>
    </Card>
  );
}

function InteractiveRateChart({ providers, visible, range, mode, onToggleProvider }) {
  const chartProviders = providers.filter((provider) => provider.points.length);
  const chartData = useMemo(() => {
    const averages = {};
    for (const provider of chartProviders) {
      averages[provider.key] = provider.points.reduce((sum, point) => sum + point.v, 0) / provider.points.length;
    }
    const byTime = new Map();
    for (const provider of chartProviders) {
      for (const point of provider.points) {
        const row = byTime.get(point.t) || { t: point.t };
        row[provider.key] = mode === "movement" ? point.v - averages[provider.key] : point.v;
        row[`${provider.key}__abs`] = point.v;
        byTime.set(point.t, row);
      }
    }
    return [...byTime.values()].sort((a, b) => a.t - b.t);
  }, [chartProviders, mode]);

  if (!chartData.length) {
    return <div className="history-empty">Select at least one provider with collected history.</div>;
  }

  const config = Object.fromEntries(chartProviders.map((provider) => [
    provider.key,
    { label: provider.label, color: colorFor(provider.key, providers.indexOf(provider)) },
  ])) satisfies ChartConfig;
  const plottedValues = chartData.flatMap((row) =>
    chartProviders.filter((provider) => visible.has(provider.key)).map((provider) => row[provider.key]),
  ).filter(Number.isFinite);
  const minimum = plottedValues.length ? Math.min(...plottedValues) : 0;
  const maximum = plottedValues.length ? Math.max(...plottedValues) : 0;
  const padding = Math.max(mode === "movement" ? 25 : 60, (maximum - minimum) * 0.08);

  return (
    <ChartContainer config={config} className="h-[300px] w-full sm:h-[390px]">
      <AreaChart data={chartData} margin={{ top: 8, right: 10, left: 10, bottom: 4 }} accessibilityLayer>
        <defs>
          {chartProviders.map((provider) => {
            const id = `fill-${provider.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
            const color = colorFor(provider.key, providers.indexOf(provider));
            return (
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1" key={provider.key}>
                <stop offset="5%" stopColor={color} stopOpacity={0.34} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid vertical={false} />
        <YAxis hide domain={[minimum - padding, maximum + padding]} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value) => range === "today"
            ? new Date(value).toLocaleTimeString("en-US", { timeZone: KOREA_TIME_ZONE, hour: "numeric", minute: "2-digit" })
            : new Date(value).toLocaleDateString("en-US", { timeZone: KOREA_TIME_ZONE, month: "short", day: "numeric" })}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(value) => new Date(Number(value)).toLocaleString("en-US", {
                timeZone: KOREA_TIME_ZONE,
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
              payloadSorter={(left, right) => {
                const leftValue = Number(left.payload?.[`${left.dataKey}__abs`] ?? left.value);
                const rightValue = Number(right.payload?.[`${right.dataKey}__abs`] ?? right.value);
                return rightValue - leftValue;
              }}
              formatter={(value, _name, item) => (
                <>
                  <span className="flex-1 text-muted">{config[item.dataKey]?.label}</span>
                  <b className="tabular-nums">
                    {mode === "movement"
                      ? `${signed(value)} (${money(item.payload?.[`${item.dataKey}__abs`])})`
                      : money(value)}
                  </b>
                </>
              )}
            />
          }
        />
        {[...chartProviders].sort((left, right) => Number(isGme(left.key)) - Number(isGme(right.key))).map((provider) => {
          const id = `fill-${provider.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          const color = colorFor(provider.key, providers.indexOf(provider));
          return (
            <Area
              key={provider.key}
              dataKey={provider.key}
              name={provider.label}
              type="natural"
              fill={`url(#${id})`}
              fillOpacity={1}
              stroke={color}
              strokeWidth={2}
              hide={!visible.has(provider.key)}
              connectNulls
              isAnimationActive
              animationDuration={500}
            />
          );
        })}
        <ChartLegend content={<ChartLegendContent onItemClick={onToggleProvider} visible={visible} />} />
      </AreaChart>
    </ChartContainer>
  );
}

export default function HistoryClient({
  countries, initialCountry, initialMethod, initialRange = "today",
  initialData, reportDate, admin = false,
}) {
  const [country, setCountry] = useState(initialCountry);
  const [method, setMethod] = useState(initialMethod);
  const [range, setRange] = useState(initialRange);
  const [mode, setMode] = useState("price");
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visibleKeys, setVisibleKeys] = useState(initialData?.providers?.map((provider) => provider.key) || []);
  const didMount = useRef(false);
  const countryConfig = countries.find((item) => item.code === country) || countries[0];
  const methods = countryConfig?.methods || [];

  const load = useCallback(async (code, nextMethod, nextRange) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/history?country=${code}&method=${nextMethod}&range=${nextRange}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData(await response.json());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      if (!data) load(country, method, range);
      return;
    }
    const firstMethod = methods[0]?.key;
    if (!firstMethod) return;
    setData(null);
    setMethod(firstMethod);
    window.history.replaceState(null, "", `/history?country=${country}&method=${firstMethod}&range=${range}`);
    load(country, firstMethod, range);
  }, [country]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setVisibleKeys(data?.providers?.map((provider) => provider.key) || []);
  }, [data]);

  const visible = useMemo(() => new Set(visibleKeys), [visibleKeys]);
  const latest = data?.providers
    ?.flatMap((provider) => provider.points.map((point) => ({ ...point, provider: provider.label })))
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

  function changeMethod(nextMethod) {
    setMethod(nextMethod);
    window.history.replaceState(null, "", `/history?country=${country}&method=${nextMethod}&range=${range}`);
    load(country, nextMethod, range);
  }

  function changeRange(nextRange) {
    setRange(nextRange);
    window.history.replaceState(null, "", `/history?country=${country}&method=${method}&range=${nextRange}`);
    load(country, method, nextRange);
  }

  function toggleProvider(key) {
    setVisibleKeys((current) => current.includes(key)
      ? current.length > 1 ? current.filter((item) => item !== key) : current
      : [...current, key]);
  }

  return (
    <main className="wrap historypage">
      <AppHeader
        title="Rate history"
        sub={`${countryConfig.flag} ${countryConfig.name} · total KRW required for the configured receive amount`}
        active="history"
        stats={stats}
        reportDate={reportDate}
        admin={admin}
        showNav={false}
      />

      <CountryViewPicker countries={countries} country={country} activeView="history" onCountryChange={setCountry} admin={admin} />

      {methods.length > 1 ? (
        <div className="mtabs history-methods">
          {methods.map((item) => (
            <button key={item.key} className={`mtab${method === item.key ? " on" : ""}`} onClick={() => changeMethod(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <div className="warn">Failed to load history: {error}</div> : null}
      {!data || loading ? <HistoryChartSkeleton /> : (
        <Card className="overflow-hidden pt-0">
          <CardHeader className="history-card-header flex items-center gap-3 border-b border-line py-5 sm:flex-row">
            <div className="grid flex-1 gap-1">
              <CardTitle>{mode === "movement" ? "Rate movement" : "Total KRW trend"}</CardTitle>
              <CardDescription>
                {mode === "movement" ? "Deviation from each provider’s average" : "Total KRW required"} · captured when rates change
              </CardDescription>
            </div>
            <div className="history-card-actions">
              <div className="history-range" aria-label="Graph value mode">
                <button className={mode === "movement" ? "on" : ""} onClick={() => setMode("movement")}>Movement</button>
                <button className={mode === "price" ? "on" : ""} onClick={() => setMode("price")}>Price</button>
              </div>
              <Select value={range} onValueChange={changeRange}>
                <SelectTrigger className="w-[150px]" aria-label="Select graph range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                </SelectContent>
              </Select>
              <button className="btn" onClick={() => load(country, method, range)} disabled={loading}>Refresh</button>
            </div>
          </CardHeader>
          <CardContent className="history-card-content px-2 pt-5 sm:px-6 sm:pt-6">
            <InteractiveRateChart
              providers={data.providers || []}
              visible={visible}
              range={range}
              mode={mode}
              onToggleProvider={toggleProvider}
            />
          </CardContent>
        </Card>
      )}

      <SiteFooter note="History includes automatic providers only; manual entries are excluded." />
    </main>
  );
}
