// Shared look & feel chrome as React components — the direct port of theme.mjs
// (siteHeader / statBar / nav / siteFooter / countryTabs). No "use client": these
// are presentational and safe to render on the server OR inside a client
// component. `reportDate` is always passed in (never Date() in render) so server
// and client markup match and never trip a hydration mismatch.

import Link from "next/link";
import { CREDIT, COPYRIGHT } from "../meta.mjs";
import { COUNTRIES } from "../countries.mjs";

// --- Global stat strip (same operational facts on every page) ---------------
const _prov = Object.values(COUNTRIES).flatMap((c) => Object.entries(c.providers));
const STAT = {
  corridors: Object.keys(COUNTRIES).length,
  providers: new Set(_prov.map(([p]) => p)).size,
  scraped: new Set(_prov.filter(([, c]) => !c.manual).map(([p]) => p)).size,
  manual: new Set(_prov.filter(([, c]) => c.manual).map(([p]) => p)).size,
  currencies: new Set(Object.values(COUNTRIES).map((c) => c.currency)).size,
};

export function defaultStats() {
  return {
    cards: [
      { k: "Corridors", v: STAT.corridors, d: "#3a86ff" },
      { k: "Auto-scraped", v: STAT.scraped, d: "var(--good)" },
      { k: "Manual input", v: STAT.manual, d: "var(--brand)" },
      { k: "Currencies", v: STAT.currencies, d: "var(--warn)" },
    ],
    totals: [
      { k: "Providers", v: STAT.providers },
      { k: "Corridors", v: STAT.corridors },
    ],
  };
}

export function StatBar({ stats }) {
  const s = stats || defaultStats();
  return (
    <div className="statbar" id="statbar">
      <div className="statset">
        {s.cards.map((c, i) => (
          <div className="stat" key={i}>
            <div className="k"><span className="d" style={{ background: c.d || "var(--muted)" }} />{c.k}</div>
            <div className="v">{c.v}</div>
          </div>
        ))}
      </div>
      <div className="stotals">
        {(s.totals || []).map((t, i) => (
          <div className="stot" key={i}>
            <div className="k">{t.k}</div>
            <div className="v">{t.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: "🏠", href: () => "/" },
  { key: "sheet", label: "Sheet view", icon: "📊", href: (c) => (c ? `/ranking?country=${c}` : "/ranking") },
  { key: "stats", label: "Usage stats", icon: "📈", href: () => "/stats" },
];
// Admin-only nav item.
const PIPELINE = { key: "pipeline", label: "Pipeline", icon: "🚀", href: () => "/pipeline" };

export function Nav({ active = "", country = "", admin = false }) {
  const items = admin ? [...NAV, PIPELINE] : NAV;
  return (
    <nav className="nav">
      {items.map((n) => (
        <Link key={n.key} id={`nav-${n.key}`} className={`btn${n.key === active ? " on" : ""}`} href={n.href(country)}>
          {n.icon} <span>{n.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/**
 * @param {{title, sub?, active?, country?, extra?, stats?, live?, reportDate}} o
 * `sub`/`extra` accept React nodes; `stats` overrides the default counters.
 */
export function AppHeader({ title, sub = null, active = "", country = "", extra = null, stats = null, live = "Live", reportDate, admin = false }) {
  return (
    <>
      <header className="appbar">
        <div className="appbar-in">
          <div className="brandrow">
            <span className="logo"><img src="/gme-logo.avif" alt="GME" /></span>
            <div>
              <h1>{title}</h1>
              {sub ? <div className="sub">{sub}</div> : null}
            </div>
          </div>
          <div className="appstatus">
            {extra}
            <span className="rpill">Report Date <b>{reportDate}</b></span>
            <span className="rpill live"><span className="dotlive" />{live}</span>
          </div>
        </div>
      </header>
      <StatBar stats={stats} />
      <Nav active={active} country={country} admin={admin} />
    </>
  );
}

export function SiteFooter({ note = null }) {
  return (
    <footer className="appfoot">
      <div className="appfoot-in">
        <span className="fnote">{note || COPYRIGHT}</span>
        <span>{CREDIT}</span>
      </div>
    </footer>
  );
}

export function CountryTabs({ countries, activeCode, hrefFor }) {
  return (
    <div className="tabs">
      {countries.map((c) => (
        <Link key={c.code} className={`tab${c.code === activeCode ? " on" : ""}`} href={hrefFor(c)}>
          {c.flag} {c.name}
        </Link>
      ))}
    </div>
  );
}

// Lives in lib/date.mjs (pure, no React) so route handlers can import it
// without pulling this module in; re-exported here for existing callers.
export { todayStr } from "./date.mjs";
