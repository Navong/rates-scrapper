"use client";

// Client-driven usage stats: chrome fixed, content area skeletons while loading
// (e.g. on refresh). Server-seeded for an instant first paint. Numbers use an
// explicit en-US locale so SSR and hydration match.

import { useCallback, useState } from "react";
import { AppHeader, SiteFooter } from "@/lib/ui.jsx";

const n = (v) => Number(v).toLocaleString("en-US");

function statBarFor(s) {
  if (!s) return null;
  return {
    cards: [
      { k: "Opened today", v: n(s.todayViews), d: "var(--good)" },
      { k: "Unique today", v: n(s.uniqueToday), d: "#3a86ff" },
      { k: "API calls", v: n(s.apiCalls), d: "var(--brand)" },
      { k: "Avg result", v: s.scrape?.n ? `${s.scrape.avg}ms` : "—", d: "var(--warn)" },
    ],
    totals: [
      { k: "Total views", v: n(s.totalViews) },
      { k: "Unique", v: n(s.uniqueTotal) },
    ],
  };
}

function Card({ label, value, sub }) {
  return (
    <div className="card">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

function StatsBody({ s, names }) {
  const maxDay = Math.max(1, ...s.days.map((d) => d.views));
  const corridorRows = Object.entries(s.byCorridor).sort((a, b) => b[1].views - a[1].views);
  return (
    <>
      <div className="grid">
        <Card label="누적 view (total)" value={n(s.totalViews)} sub={`${s.uniqueTotal} unique visitors`} />
        <Card label="Opened today" value={n(s.todayViews)} sub={`${s.uniqueToday} unique today`} />
        <Card label="Time to get result" value={s.scrape.n ? s.scrape.avg + " ms" : "—"}
          sub={s.scrape.n ? `p95 ${s.scrape.p95} ms · ${s.scrape.n} live scrapes` : "no scrapes yet"} />
        <Card label="Served from cache" value={s.cachedServe.n ? s.cachedServe.avg + " ms" : "—"} sub={`${s.cachedServe.n} hits`} />
      </div>
      <h2>Last 7 days</h2>
      <div className="chart">
        {s.days.map((d) => (
          <div className="bar" key={d.day}>
            <div className="fill" style={{ height: `${Math.round((d.views / maxDay) * 100)}%` }} />
            <span className="n">{d.views}</span>
            <span className="d">{d.day.slice(5)}</span>
          </div>
        ))}
      </div>
      <h2>By corridor</h2>
      <table>
        <tbody>
          <tr><th>Corridor</th><th className="num">Today</th><th className="num">Total</th></tr>
          {corridorRows.map(([c, v]) => (
            <tr key={c}><td>{names[c] || c}</td><td className="num">{v.today}</td><td className="num">{v.views}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function StatsSkeleton() {
  return (
    <>
      <div className="grid">
        {Array.from({ length: 4 }).map((_, i) => <div className="sk" style={{ height: 86 }} key={i} />)}
      </div>
      <div className="sk" style={{ height: 130, margin: "20px 0" }} />
      <div className="sk" style={{ height: 160 }} />
    </>
  );
}

export default function StatsClient({ names, reportDate, initialStats, admin = false }) {
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stats", { headers: { Accept: "application/json" } });
      const j = await res.json();
      setStats(j && Object.keys(j).length ? j : null);
    } catch { /* keep prior */ } finally {
      setLoading(false);
    }
  }, []);

  const refreshBtn = (
    <button className={"btn" + (loading ? " spin" : "")} title="Refresh" onClick={load}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" />
      </svg>
      <span>Refresh</span>
    </button>
  );

  return (
    <main className="wrap statspage">
      <AppHeader
        title="Usage stats"
        sub={stats ? `since ${(stats.since || "").slice(0, 16).replace("T", " ")}` : "No usage recorded yet."}
        active="stats"
        extra={refreshBtn}
        stats={statBarFor(stats)}
        reportDate={reportDate}
        admin={admin}
      />

      {loading ? (
        <StatsSkeleton />
      ) : stats ? (
        <StatsBody s={stats} names={names} />
      ) : (
        <div className="panel"><p className="sub" style={{ margin: 0 }}>Open the dashboard to start collecting events.</p></div>
      )}

      <SiteFooter note={stats ? <span>API calls (Excel / Power Automate): {n(stats.apiCalls)}</span> : null} />
    </main>
  );
}
