// Unified corridor table (applies to every corridor):
//
//   Country | Service | Competitor | FCY(XXX) | KRW ① | Service fee ② | Total price ①+② | Price gap
//
//   • KRW ①  = exchange amount only (fee NOT included)
//   • ②      = service fee, kept separate, from the corridor's own fee table
//   • Total  = ① + ②
//   • Gap    = Total − GME's Total   (GME is the anchor; its fee/gap render as "-")
//   • Sorted descending by Total (most expensive first)
//   • One table per service (Bank / Cash / Card → separate tables)
//   • Colours: Gmoney green · E9pay yellow · GME red (bold) · Hanpass purple · others blue
//
// Manual providers (Sentbe, FoneMoney, Cross…) come from the saved manual bases.

import { PROVIDER_LABEL, countryList, anchorOf, providerInMethod, currencyFor } from "./countries";
import { page, countryTabs, siteHeader } from "./theme";
import { statusOf, humanAge } from "./manual";
import { feeFor, getFeeOverride } from "./fees";

// Competitor cell fills. Anything not listed falls back to blue ("others").
export const FILL = {
  GMONEY: "#92D050",   // green
  E9PAY: "#FFFF00",    // yellow
  GME: "#FF0000",      // red (bold)
  HANPASS: "#CC99FF",  // purple
};
export const OTHER_FILL = "#9DC3E6"; // blue
export const COUNTRY_FILL = "#D9D9D9";
export const SERVICE_FILL = "#F8CBAD";

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const pad2 = (n) => String(n).padStart(2, "0");

// Merge scraped records + manual bases; sort descending by Total; compute gap vs anchor.
export function buildRows(country, records, manual) {
  const out = {};
  for (const m of country.methods) {
    const rows = records
      .filter((r) => r.method === m.key)
      // Fee override (if any) wins over the scraped/config fee, applied here at
      // render time so a fee edit takes effect without a re-scrape.
      .map((r) => ({ provider: r.provider, op: country.providers[r.provider]?.label || PROVIDER_LABEL[r.provider] || r.provider, krw: r.principalKRW, fee: feeFor(country.code, r.provider, m.key, r.feeKRW), manual: false }));

    for (const [prov, cfg] of Object.entries(country.providers)) {
      if (!cfg.manual) continue;
      if (!providerInMethod(cfg, m.key)) continue; // channel scoped to other methods
      const entry = manual?.[country.code]?.[prov]?.[m.key];
      const st = statusOf(entry);
      // Expired / never-set values are kept in the table but marked `noRate`:
      // the competitor still shows, its rate columns render "-", and it takes no
      // part in the Price gap math (a stale number would silently corrupt it).
      const noRate = st.status !== "fresh";
      rows.push({
        provider: prov, op: cfg.label || PROVIDER_LABEL[prov] || prov,
        krw: noRate ? null : entry.value, fee: feeFor(country.code, prov, m.key, cfg.fee?.[m.key] ?? 0),
        manual: true, noRate, manualStatus: st.status, manualAge: humanAge(st.ageMs),
      });
    }

    // Rows without a live rate get total = null; they sort to the bottom and are
    // excluded from the anchor/gap computation.
    rows.forEach((r) => (r.total = r.noRate ? null : r.krw + r.fee));
    rows.sort((a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity));

    const anchorKey = anchorOf(country.anchor, m.key);
    const anchor = anchorKey ? rows.find((r) => r.provider === anchorKey && r.total != null) : null;
    rows.forEach((r) => (r.gap = anchor && r.total != null ? r.total - anchor.total : null));
    out[m.key] = rows;
  }
  return out;
}

export function buildRankingData(country, records, manual) {
  // Providers with no public rate API — typed in per method on the sheet.
  // manualProviders collapses to one row per provider (worst status across its
  // methods) for the note; manualNeed counts every method entry needing a refresh.
  const rank = { fresh: 0, stale: 1, unset: 2, expired: 3 };
  const byProv = {};
  let manualNeed = 0;
  for (const [prov, cfg] of Object.entries(country.providers)) {
    if (!cfg.manual) continue;
    for (const m of country.methods) {
      if (!providerInMethod(cfg, m.key)) continue;
      const st = statusOf(manual?.[country.code]?.[prov]?.[m.key]);
      if (st.status !== "fresh") manualNeed++;
      const cur = byProv[prov];
      if (!cur || rank[st.status] > rank[cur.status]) {
        byProv[prov] = { code: prov, label: cfg.label || PROVIDER_LABEL[prov] || prov, set: st.status !== "unset", status: st.status, age: humanAge(st.ageMs) };
      }
    }
  }
  const manualProviders = Object.values(byProv);

  // Per-method editor cards (so the client sheet can render the inline editor).
  // A channel is scoped to its own method(s); others show a card per method.
  const provs = Object.entries(country.providers).filter(([, c]) => c.manual);
  const multi = country.methods.length > 1;
  const manualCards = provs.flatMap(([prov, cfg]) =>
    country.methods.filter((m) => providerInMethod(cfg, m.key)).map((m) => {
      const entry = manual?.[country.code]?.[prov]?.[m.key];
      const st = statusOf(entry);
      const base = cfg.label || PROVIDER_LABEL[prov] || prov;
      return {
        name: `${country.code}__${prov}__${m.key}`,
        label: multi ? `${base} · ${m.label}` : base,
        value: entry?.value != null ? Number(entry.value).toLocaleString("en-US") : "",
        fresh: st.status === "fresh", status: st.status, age: humanAge(st.ageMs),
        fee: feeFor(country.code, prov, m.key, cfg.fee?.[m.key] ?? 0),
      };
    })
  );
  // Footer names: unique provider families (so a many-channel corridor like
  // Myanmar reads "GME, Gmoney, …" rather than listing every channel).
  const manualNames = [...new Set(provs.map(([p]) => PROVIDER_LABEL[p.split("_")[0]] || PROVIDER_LABEL[p] || p))].join(", ");

  // Fee-editor cards: every provider × method it applies to, with its effective
  // fee (override or config default) and whether an override is currently set.
  const feeCards = Object.entries(country.providers).flatMap(([prov, cfg]) =>
    country.methods.filter((m) => providerInMethod(cfg, m.key)).map((m) => {
      const def = cfg.fee?.[m.key] ?? 0;
      const base = cfg.label || PROVIDER_LABEL[prov] || prov;
      return {
        name: `${country.code}__${prov}__${m.key}`,
        label: multi ? `${base} · ${m.label}` : base,
        fee: feeFor(country.code, prov, m.key, def),
        def,
        override: getFeeOverride(country.code, prov, m.key) != null,
      };
    })
  );

  return {
    country: country.code, name: country.name, flag: country.flag,
    currency: country.currency, receiveAmount: country.receiveAmount,
    anchor: country.anchor, methods: country.methods, grid: !!country.grid,
    manualProviders, manualNeed, manualCards, manualNames, feeCards,
    blocks: buildRows(country, records, manual),
  };
}

export const CHIP = {
  GME: "#e53935", E9PAY: "#f9a825", SBI: "#3f51b5", GMONEY: "#43a047",
  HANPASS: "#8e24aa", SENTBE: "#1e88e5", COINSHOT: "#1e88e5", JRF: "#1e88e5",
  FONEMONEY: "#1e88e5", CROSS: "#1e88e5", HANAEZ: "#1e88e5", UTRANSFER: "#1e88e5",
  KAKAO: "#fbc02d", DEBUNK: "#1e88e5", MOIN: "#1e88e5", WIREBARLEY: "#1e88e5", PANDA: "#1e88e5",
};

// ---------- one table per service ----------
// `showCountry` is off for grid corridors: the column repeats the same value on
// every row of every table, and the page header already names the country.
function serviceTable(country, service, rows, dateStr, timeStr, showCountry = true) {
  const cols = showCountry ? 8 : 7;
  // Date/Time sit in the grid, above the last two columns.
  const stamp = `<tr>
    <td class="none" colspan="${cols - 2}"></td>
    <td class="dt">Date : ${esc(dateStr)}</td>
    <td class="dt num">${esc(timeStr)}</td>
  </tr>`;
  const head = `<tr>
    ${showCountry ? "<th>Country</th>" : ""}<th>Service</th><th>Competitor</th>
    <th>FCY(${esc(currencyFor(country, service.key))})</th><th>KRW ①</th><th>Service fee ②</th>
    <th class="b">Total price ①+②</th><th>Price gap</th>
  </tr>`;

  const body = rows.map((r, i) => {
    const isAnchor = country.anchor === r.provider;
    const fill = FILL[r.provider] || OTHER_FILL;
    const bold = isAnchor ? "font-weight:700" : "";
    const first = i === 0;
    const cCell = showCountry && first ? `<td rowspan="${rows.length}" class="mid" style="background:${COUNTRY_FILL}">${esc(country.name)}</td>` : "";
    const sCell = first ? `<td rowspan="${rows.length}" class="mid" style="background:${SERVICE_FILL}">${esc(service.label)}</td>` : "";
    // A manual competitor whose rate lapsed (or was never entered) shows "-" in
    // every value column — no live number, so no fee/total/gap either.
    if (r.noRate) {
      return `<tr class="norate">
        ${cCell}${sCell}
        <td class="mid" style="background:${fill}">${esc(r.op)}</td>
        <td class="num">${fmt(country.receiveAmount)}</td>
        <td class="num">-</td><td class="num">-</td>
        <td class="num b">-</td><td class="num">-</td>
      </tr>`;
    }
    // Fee is its own column: "-" only when the fee is genuinely 0 (never because
    // the row is the anchor). The gap is "-" for the anchor (it is 0 by definition).
    const feeCell = r.fee === 0 ? "-" : fmt(r.fee);
    const gapCell = isAnchor || r.gap == null ? "-" : (r.gap < 0 ? `- ${fmt(-r.gap)}` : fmt(r.gap));
    const gapCls = !isAnchor && r.gap < 0 ? " neg" : "";
    return `<tr style="${bold}">
      ${cCell}${sCell}
      <td class="mid" style="background:${fill};${bold}">${esc(r.op)}</td>
      <td class="num">${fmt(country.receiveAmount)}</td>
      <td class="num">${fmt(r.krw)}</td>
      <td class="num">${feeCell}</td>
      <td class="num b" style="${bold}">${fmt(r.total)}</td>
      <td class="num${gapCls}">${gapCell}</td>
    </tr>`;
  }).join("");

  return `<table>${stamp}${head}${body}</table>`;
}


// Inline manual-rate editor, shown right under the sheet. Saving posts via AJAX
// (see the page script) and re-renders the tables in place — no navigation.
function manualPanel(country, manual) {
  const provs = Object.entries(country.providers).filter(([, c]) => c.manual);
  if (!provs.length) return "";
  const multi = country.methods.length > 1;
  // One input per (provider × method) — a provider can quote a different rate
  // per payout method (e.g. Sentbe KH: Bank Deposit vs Cash Payment).
  const cards = provs.flatMap(([prov, cfg]) =>
    country.methods.map((m) => {
      const entry = manual?.[country.code]?.[prov]?.[m.key];
      const st = statusOf(entry);
      const fresh = st.status === "fresh";
      const val = entry?.value != null ? Number(entry.value).toLocaleString("en-US") : "";
      const badge = fresh
        ? `<span class="mst fresh">✓ ${esc(humanAge(st.ageMs))}</span>`
        : `<span class="mst old">${st.status === "unset" ? "not set" : "expired"}</span>`;
      const fee = cfg.fee?.[m.key] ?? 0;
      const name = `${PROVIDER_LABEL[prov] || prov}${multi ? ` · ${esc(m.label)}` : ""}`;
      return `<label class="mcard">
        <span class="mrow"><b>${name}</b>${badge}</span>
        <input name="${country.code}__${prov}__${m.key}" type="text" inputmode="numeric" pattern="[0-9,]*"
               value="${val}" placeholder="base KRW" autocomplete="off">
        <span class="mfee">+ ${fee.toLocaleString()} fee</span>
      </label>`;
    })
  ).join("");
  return `<div class="panel manualp">
    <h3>Manual rates · re-enter every hour</h3>
    <div id="m-warn"></div>
    <form id="manual-form" onsubmit="return false">
      <div class="mgrid">${cards}</div>
      <div class="mact">
        <button class="btn primary" type="submit" data-save style="width:auto;padding:12px 22px">Save &amp; update sheet</button>
        <span id="m-msg" class="msg"></span>
      </div>
    </form>
  </div>`;
}

// Client script: AJAX-save the manual panel, then swap #sheet-region with the
// freshly rendered server HTML so the tables reflect the new values instantly.
function sheetScript(country) {
  return `<script>(function(){
  var code=${JSON.stringify(country.code)};
  function region(){return document.getElementById('sheet-region');}
  function fmt(n){return Number(n).toLocaleString('en-US');}
  async function refresh(){
    var r=await fetch('/ranking?country='+code,{headers:{'X-Requested-With':'fetch'}});
    var doc=new DOMParser().parseFromString(await r.text(),'text/html');
    var fresh=doc.getElementById('sheet-region');
    if(fresh&&region())region().innerHTML=fresh.innerHTML;
  }
  function warnHtml(ws){
    return '<div class="warn"><b>&#9888; These look like typos &mdash; not saved.</b><ul style="margin:6px 0 0 18px">'+
      ws.map(function(w){return '<li>'+w.label+': <b>'+fmt(w.value)+'</b> is '+(w.pct>0?'+':'')+w.pct.toFixed(1)+'% vs peers (median '+fmt(Math.round(w.median))+')</li>';}).join('')+
      '</ul><button class="btn" data-save data-confirm style="margin-top:8px">Save anyway (I checked)</button></div>';
  }
  async function save(confirm){
    var form=document.getElementById('manual-form'); if(!form)return;
    var msg=document.getElementById('m-msg'); if(msg)msg.textContent='Saving\\u2026';
    var data=new URLSearchParams(new FormData(form)); if(confirm)data.set('confirm','1');
    try{
      var r=await fetch('/manual?country='+code+'&format=json',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:data.toString()});
      var j=await r.json();
      if(j.warnings&&j.warnings.length){var w=document.getElementById('m-warn'); if(w)w.innerHTML=warnHtml(j.warnings); if(msg)msg.textContent=''; return;}
      await refresh();
      var m2=document.getElementById('m-msg'); if(m2)m2.textContent=(j.saved&&j.saved.length)?('\\u2713 Saved '+j.saved.length+' \\u2014 sheet updated'):'No changes';
    }catch(e){if(msg)msg.textContent='Save failed';}
  }
  document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-save]'); if(b){e.preventDefault(); save(b.hasAttribute('data-confirm'));}});
})();</script>`;
}

// Operational counters for the stat bar, computed for the corridor's primary
// (first) method: who's live, how many beat GME, GME's rank, manual rates that
// need re-entry — plus the cheapest total and GME's gap as the boxed totals.
function sheetStats(country, grouped, manual, failed = []) {
  const wkrw = (n) => `₩${fmt(n)}`;
  const rows = grouped[country.methods[0].key] || [];
  const live = rows.filter((r) => !r.noRate && r.total != null);
  const gme = live.find((r) => r.provider === country.anchor);
  const asc = [...live].sort((a, b) => a.total - b.total);
  const cheapest = asc[0];
  const rank = gme ? asc.findIndex((r) => r.provider === country.anchor) + 1 : null;
  const beat = gme ? live.filter((r) => r.total < gme.total).length : null;
  const gap = gme && cheapest ? gme.total - cheapest.total : null;

  let toUpdate = 0;
  for (const [prov, cfg] of Object.entries(country.providers)) {
    if (!cfg.manual) continue;
    for (const m of country.methods) {
      if (statusOf(manual?.[country.code]?.[prov]?.[m.key]).status !== "fresh") toUpdate++;
    }
  }

  return {
    cards: [
      { k: "Live", v: live.length, d: "var(--good)" },
      { k: "Beat GME", v: beat == null ? "—" : beat, d: "var(--brand)" },
      { k: "GME rank", v: rank == null ? "—" : `#${rank}`, d: "#3a86ff" },
      { k: "To update", v: toUpdate, d: "var(--warn)" },
    ],
    totals: [
      { k: cheapest ? cheapest.op : "Cheapest", v: cheapest ? wkrw(cheapest.total) : "—" },
      { k: "vs GME", v: gap == null ? "—" : gap > 0 ? `+${wkrw(gap)}` : "Best" },
    ],
  };
}

export function renderRankingHtml(country, records, manual, meta = {}) {
  const grouped = buildRows(country, records, manual);
  const now = meta.now instanceof Date ? meta.now : new Date();
  const dateStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  // Same tables, same size everywhere. `grid` corridors lay them out
  // two-across with the last one centred underneath, instead of stacking.
  const rendered = country.methods.map((m) => serviceTable(country, m, grouped[m.key] || [], dateStr, timeStr, true));
  const tables = country.grid
    ? `<div class="sheets">${rendered.join("")}</div>`
    : rendered.join('<div style="height:22px"></div>');

  const tabs = countryTabs(countryList(), country.code, (c) => `?country=${c.code}`);
  const manualNames = Object.entries(country.providers).filter(([, c]) => c.manual).map(([p]) => PROVIDER_LABEL[p]).join(", ");

  const body = `
${siteHeader({
    title: "Sheet view",
    sub: `${esc(country.flag)} ${esc(country.name)} · receive ${country.receiveAmount.toLocaleString()} ${esc(country.currency)} · ${esc(dateStr)} ${esc(timeStr)}`,
    active: "sheet", country: country.code,
    stats: sheetStats(country, grouped, manual, meta.failed),
  })}
${tabs}
<div id="sheet-region">
${meta.failed?.length ? `<div class="warn">⚠ Unavailable this run: ${esc(meta.failed.map((f) => f.who).join(", "))}</div>` : ""}
<div class="panel sheetpanel"><div class="sheetscroll">${tables}</div></div>
${manualPanel(country, manual)}
</div>
${sheetScript(country)}`;

  const footNote = manualNames ? `<span>* manual input: ${esc(manualNames)}</span>` : "";

  // The table cells keep their exact spreadsheet look (fixed fills, grey borders).
  const extraCss = `
  .sheetscroll{overflow-x:auto}
  .sheetscroll table{border-collapse:collapse;background:#fff;color:#000}
  .sheetscroll th,.sheetscroll td{border:1px solid #c9ced6;padding:6px 11px;font-size:13px;white-space:nowrap}
  .sheetscroll th{background:#f2f4f6;font-weight:700;text-align:center;color:#333d4b}
  .sheetscroll th.b,.sheetscroll td.b{font-weight:700}
  .sheetscroll .num{text-align:right;font-variant-numeric:tabular-nums}
  .sheetscroll .mid{text-align:center;vertical-align:middle}
  .sheetscroll td.none{border:none;background:transparent}
  .sheetscroll td.dt{font-weight:600;background:#fff}
  ${country.grid ? `
  /* Grid corridors (3 services): two tables on top, the third centred below.
     The panel spans the page; the grid fits the tables into it. */
  .sheetscroll{overflow-x:visible}
  .sheets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}
  .sheets > table{width:100%;table-layout:auto}
  .sheets > table:last-child{grid-column:1 / -1;width:calc(50% - 7px);justify-self:center}
  .sheets th{white-space:normal;line-height:1.2;font-weight:600}
  .sheets th,.sheets td{padding:4px 7px;font-size:12px}
  @media (max-width:1150px){
    .sheets{grid-template-columns:1fr}
    .sheets > table:last-child{grid-column:auto;width:100%}
  }
  ` : `
  /* Single-table corridors: the sheet card hugs the table instead of stretching
     the full page width. The manual editor below stays full width. */
  .sheetpanel{width:fit-content;max-width:100%}
  `}
  /* A manual competitor whose rate lapsed reads as "-" in muted grey. */
  .sheetscroll tr.norate td{color:#98a0ab}
  /* Inline manual editor */
  .manualp{margin-top:16px}
  .mgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
  .mcard{display:flex;flex-direction:column;gap:6px;background:var(--bg);border:1px solid var(--line);
         border-radius:14px;padding:12px}
  .mrow{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:14px}
  .mcard input{padding:10px;font-size:16px;font-weight:600;border:1.5px solid var(--line);border-radius:10px;
               background:var(--card);color:var(--text);text-align:right}
  .mcard input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px var(--accent-weak)}
  .mfee{font-size:11.5px;color:var(--muted)}
  .mst{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;white-space:nowrap}
  .mst.fresh{background:rgba(21,184,134,.15);color:var(--good)}
  .mst.old{background:rgba(240,68,82,.14);color:var(--bad)}
  .mact{display:flex;align-items:center;gap:14px;margin-top:16px;flex-wrap:wrap}
  .msg{font-size:13.5px;color:var(--muted);font-weight:600}
  `;

  // Single-table corridors use the dashboard width (1180px); grid corridors
  // (3 services side by side) widen to fit both tables without clipping.
  return page({ title: `${country.name} rate comparison`, body, extraCss, wrapClass: country.grid ? "lg" : "", footNote });
}
