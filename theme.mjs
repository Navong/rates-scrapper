// Shared look & feel for every page (dashboard, sheet view, stats, sign-in).
// One set of tokens → the pages can't drift apart, and dark mode works everywhere.

import { CREDIT, COPYRIGHT } from "./meta.mjs";
import { COUNTRIES } from "./countries.mjs";

// GME operations-dashboard language: a full-bleed red brand bar with the logo
// and status pills, a stat-counter strip, underline tabs, and a red footer —
// Pretendard (loaded in page()) keeps the Korean typography crisp. Red is the
// primary brand/accent throughout.
export const BASE_CSS = `
  :root{
    --brand:#e4002b; --brand-d:#b60022;
    --bg:#f4f5f7; --card:#ffffff; --text:#1a1d24; --muted:#6b7280; --line:#e6e8ec;
    --good:#12b886; --bad:#e4002b; --warn:#f5a623; --accent:#e4002b; --accent-weak:#fdecef;
    --chipbg:#f1f3f5; --chiptext:#4e5968;
    --shadow:0 1px 2px rgba(0,0,0,.04), 0 6px 18px rgba(17,24,39,.06);
    --shadow-sm:0 1px 2px rgba(0,0,0,.05);
    --wrap:1180px;
  }
  @media (prefers-color-scheme: dark){
    :root{ --brand:#e4002b; --brand-d:#b60022;
           --bg:#0f1115; --card:#171a21; --text:#e9edf2; --muted:#9aa0a6; --line:#262a33;
           --good:#2fd08b; --bad:#ff5a6a; --warn:#f7b955; --accent:#ff5364; --accent-weak:#2a1418;
           --chipbg:#20242c; --chiptext:#aeb6c2;
           --shadow:0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35);
           --shadow-sm:0 1px 2px rgba(0,0,0,.3); }
  }
  *{box-sizing:border-box}
  html,body{overflow-x:hidden}
  body{margin:0;background:var(--bg);color:var(--text);
       font:15px/1.55 "Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;letter-spacing:-.01em}
  .wrap{--wrap:1180px;max-width:var(--wrap);margin:0 auto;padding:0 20px}
  .wrap.lg{--wrap:1460px}
  .wrap.xl{--wrap:1760px}
  .wrap.md{--wrap:860px}
  .wrap.sm{--wrap:480px}

  /* ---- Full-bleed red brand bar -------------------------------------------- */
  .appbar{background:linear-gradient(95deg,var(--brand),var(--brand-d));color:#fff;
          width:100vw;margin-left:calc(50% - 50vw)}
  .appbar-in{max-width:var(--wrap);margin:0 auto;padding:13px 20px;display:flex;
             align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .brandrow{display:flex;align-items:center;gap:13px;min-width:0}
  .logo{background:#fff;color:var(--brand);font-weight:900;font-size:15px;letter-spacing:.4px;
        border-radius:10px;padding:9px 11px;line-height:1;box-shadow:0 2px 6px rgba(0,0,0,.18)}
  .appbar h1{font-size:19px;font-weight:800;color:#fff;letter-spacing:-.02em;margin:0}
  .appbar .sub{color:rgba(255,255,255,.82);font-size:12.5px;margin-top:2px}
  .appbar .sub a{color:#fff;font-weight:600}
  .appstatus{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .rpill{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:#fff;
         border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:600;
         display:inline-flex;gap:7px;align-items:center;cursor:default;text-decoration:none}
  .rpill b{font-weight:800}
  .rpill.live{background:#fff;color:var(--brand);border-color:transparent}
  .rpill .dotlive{width:7px;height:7px;border-radius:50%;background:#16c784;
                  box-shadow:0 0 0 3px rgba(22,199,132,.3)}
  .appbar .btn{background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.3);color:#fff}
  .appbar .btn:hover{background:#fff;color:var(--brand)}

  /* ---- Stat-counter strip -------------------------------------------------- */
  .statbar{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);
           margin:18px 0 16px;padding:15px 18px;display:flex;align-items:center;
           justify-content:space-between;gap:18px;flex-wrap:wrap}
  .statset{display:flex;gap:28px;flex-wrap:wrap}
  .stat{display:flex;flex-direction:column;gap:4px}
  .stat .k{font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);
           display:flex;align-items:center;gap:6px}
  .stat .k .d{width:8px;height:8px;border-radius:50%}
  .stat .v{font-size:25px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1}
  .stotals{display:flex;gap:10px}
  .stot{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:8px 16px;
        text-align:right;min-width:82px}
  .stot .k{font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted)}
  .stot .v{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.3}

  /* ---- Underline nav tabs -------------------------------------------------- */
  .nav{display:flex;gap:2px;border-bottom:2px solid var(--line);margin-bottom:16px;flex-wrap:wrap}
  .nav .btn{background:none;border:none;border-radius:0;padding:10px 14px;color:var(--muted);
            border-bottom:2px solid transparent;margin-bottom:-2px;font-weight:700;font-size:14px;
            display:inline-flex;gap:7px;align-items:center;cursor:pointer;text-decoration:none;
            transition:color .15s,border-color .15s}
  .nav .btn:hover{color:var(--text)}
  .nav .btn.on{color:var(--brand);border-bottom-color:var(--brand)}
  @media (max-width:640px){ .nav .btn span{display:none} .nav .btn{padding:10px 12px} }

  h1{font-size:20px;font-weight:800;margin:0;letter-spacing:-.02em}
  .sub{color:var(--muted);font-size:13px;margin-top:2px;font-weight:500}
  .btn{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:11px;
       padding:9px 14px;font-size:14px;font-weight:600;cursor:pointer;display:inline-flex;gap:7px;
       align-items:center;text-decoration:none;transition:background .15s,color .15s,transform .06s,border-color .15s}
  .btn:hover{border-color:var(--accent);color:var(--accent)}
  .btn:active{transform:translateY(1px)}
  .btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;justify-content:center;
       width:100%;padding:14px;font-weight:700;box-shadow:0 6px 16px rgba(228,0,43,.26)}
  .btn.primary:hover{background:var(--brand-d);color:#fff}
  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
  .tab{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:8px 15px;
       font-weight:600;font-size:14px;cursor:pointer;color:var(--chiptext);text-decoration:none;
       display:inline-block;transition:background .15s,color .15s,border-color .15s}
  .tab:hover{border-color:var(--accent);color:var(--accent)}
  .tab.on{background:var(--accent);border-color:var(--accent);color:#fff}
  .tab.on:hover{color:#fff}
  .panel{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;box-shadow:var(--shadow)}
  .panel h3{margin:0 0 12px;font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
  .warn{background:rgba(228,0,43,.08);color:var(--bad);border-radius:12px;padding:11px 14px;
        font-size:12.5px;margin-bottom:14px;font-weight:500}
  .ok{color:var(--good);font-weight:600}
  .field{width:100%;padding:14px;font-size:20px;margin:8px 0 4px;border:1.5px solid var(--line);
         border-radius:12px;background:var(--card);color:var(--text);text-align:center;font-weight:600;
         transition:border-color .15s,box-shadow .15s}
  .field:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px var(--accent-weak)}
  label{font-weight:600;display:block;margin-top:16px;font-size:14px}

  /* ---- Full-bleed red footer ----------------------------------------------- */
  .appfoot{background:linear-gradient(95deg,var(--brand),var(--brand-d));color:#fff;
           width:100vw;margin-left:calc(50% - 50vw);margin-top:44px;padding:14px 20px}
  .appfoot-in{max-width:var(--wrap);margin:0 auto;display:flex;justify-content:space-between;
              gap:12px;flex-wrap:wrap;align-items:center;font-size:12.5px;color:rgba(255,255,255,.9)}
  .appfoot-in a{color:#fff;font-weight:700;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.5)}
  .appfoot .fnote{color:rgba(255,255,255,.82)}
`;

// --- Global stat strip (same operational facts on every page) ---------------
const _prov = Object.values(COUNTRIES).flatMap((c) => Object.entries(c.providers));
const STAT = {
  corridors: Object.keys(COUNTRIES).length,
  providers: new Set(_prov.map(([p]) => p)).size,
  scraped: new Set(_prov.filter(([, c]) => !c.manual).map(([p]) => p)).size,
  manual: new Set(_prov.filter(([, c]) => c.manual).map(([p]) => p)).size,
  currencies: new Set(Object.values(COUNTRIES).map((c) => c.currency)).size,
};

function defaultStats() {
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

/** Inner markup of the stat bar — shared shape so the client dashboard can
 *  rebuild it and it always matches. */
export function statBarInner(stats) {
  const s = stats || defaultStats();
  const cards = s.cards.map((c) =>
    `<div class="stat"><div class="k"><span class="d" style="background:${c.d || "var(--muted)"}"></span>${c.k}</div><div class="v">${c.v}</div></div>`
  ).join("");
  const tot = (s.totals || []).map((t) => `<div class="stot"><div class="k">${t.k}</div><div class="v">${t.v}</div></div>`).join("");
  return `<div class="statset">${cards}</div><div class="stotals">${tot}</div>`;
}

function statBar(stats) {
  return `<div class="statbar" id="statbar">${statBarInner(stats)}</div>`;
}

// --- Shared header ----------------------------------------------------------
// Manual rates are edited inline on the sheet view now, so there's no standalone
// nav item for them. The ids let the dashboard (which switches corridor
// client-side) rewrite the corridor-scoped links on the fly.
const NAV = [
  { key: "dashboard", label: "Dashboard",   icon: "🏠", href: () => "/" },
  { key: "sheet",     label: "Sheet view",  icon: "📊", href: (c) => (c ? `/ranking?country=${c}` : "/ranking") },
  { key: "stats",     label: "Usage stats", icon: "📈", href: () => "/stats" },
];

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * @param {{title:string, sub?:string, active?:string, country?:string,
 *          extra?:string, stats?:object, live?:string}} o
 * `extra` renders as an action pill in the red bar; `stats` overrides the
 * default global counters; `live` overrides the green status pill text.
 */
export function siteHeader({ title, sub = "", active = "", country = "", extra = "", stats = null, live = "Live" }) {
  const links = NAV.map(
    (n) => `<a id="nav-${n.key}" class="btn${n.key === active ? " on" : ""}" href="${n.href(country)}">${n.icon} <span>${n.label}</span></a>`
  ).join("");
  return `<header class="appbar"><div class="appbar-in">
  <div class="brandrow">
    <span class="logo">GME</span>
    <div>
      <h1>${title}</h1>
      ${sub ? `<div class="sub">${sub}</div>` : ""}
    </div>
  </div>
  <div class="appstatus">
    ${extra}
    <span class="rpill">Report Date <b>${today()}</b></span>
    <span class="rpill live"><span class="dotlive"></span>${live}</span>
  </div>
</div></header>
${statBar(stats)}
<nav class="nav">${links}</nav>`;
}

/** Shared red footer bar: optional page note on the left, build credit on the right. */
export function siteFooter(note = "") {
  return `<footer class="appfoot"><div class="appfoot-in">
  <span class="fnote">${note || COPYRIGHT}</span>
  <span>${CREDIT}</span>
</div></footer>`;
}

/** Full HTML document with the shared chrome + shared footer. */
export function page({ title, body, extraCss = "", wrapClass = "", footNote = "" }) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<style>${BASE_CSS}${extraCss}</style></head><body>
<div class="wrap ${wrapClass}">
${body}
${siteFooter(footNote)}
</div></body></html>`;
}

/** Country pill navigation, shared by the sheet view. */
export function countryTabs(countries, activeCode, hrefFor) {
  return `<div class="tabs">${countries
    .map((c) => `<a class="tab${c.code === activeCode ? " on" : ""}" href="${hrefFor(c)}">${c.flag} ${c.name}</a>`)
    .join("")}</div>`;
}
