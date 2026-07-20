// Modern, dynamic dashboard served at "/".
// It fetches /ranking?country=…&format=json client-side, so switching country or
// refreshing never reloads the page. The classic sheet-format tables live on at
// /ranking — this view never changes them.

import { countryList } from "./countries.mjs";
import { CHIP } from "./ranking.mjs";
import { BASE_CSS, siteHeader, siteFooter } from "./theme.mjs";

export function renderDashboard(token) {
  const boot = JSON.stringify({ countries: countryList(), chip: CHIP, token: token || "" });

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Remittance rate dashboard</title>
<style>
${BASE_CSS}
  /* side-by-side: ranked cards | price-gap chart. Stacks under 980px. */
  .cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;align-items:start}
  @media (max-width:980px){ .cols{grid-template-columns:1fr} }
  /* diverging price-gap chart (zero line = GME) — inline SVG */
  #chart svg{display:block;width:100%;height:auto}
  .ax{stroke:var(--muted);opacity:.45;stroke-width:1}
  .axdash{stroke:var(--line);stroke-width:1;stroke-dasharray:2 4}
  .bar-up{fill:var(--bad);opacity:.9}
  .bar-down{fill:var(--good);opacity:.9}
  .g:hover .bar-up,.g:hover .bar-down{opacity:1}
  .lbl{fill:var(--text);font-size:11.5px;font-weight:600}
  .lbl.anchor{fill:var(--bad)}
  .val{font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}
  .val-up{fill:var(--bad)} .val-down{fill:var(--good)} .val-zero{fill:var(--muted)}
  .cap{fill:var(--muted);font-size:10.5px}
  .note{margin-top:14px;font-size:12px;color:var(--muted);line-height:1.6}
  .note a{color:var(--accent);font-weight:600;text-decoration:none}
  .mtag{display:inline-block;font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;
        background:var(--chipbg);color:var(--muted);margin-left:6px;vertical-align:middle}
  .unset{color:var(--bad);font-weight:600}
  .btn.spin svg{animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .mtabs{display:flex;gap:6px;margin-bottom:14px}
  .mtab{flex:1;text-align:center;border:1px solid var(--line);background:var(--card);border-radius:10px;
        padding:9px;font-size:13.5px;font-weight:600;cursor:pointer;color:var(--muted)}
  .mtab.on{color:var(--text);border-color:var(--accent)}
  .summary{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:14px}
  .summary .big{font-size:26px;font-weight:700;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
  .summary .lbl{color:var(--muted);font-size:13px}
  .rows{display:flex;flex-direction:column;gap:8px}
  .row{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;
       display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;position:relative;overflow:hidden}
  .row.best{border-color:var(--good)}
  .row.anchor{border-color:var(--bad)}
  .bar{position:absolute;left:0;bottom:0;height:3px;background:var(--accent);opacity:.35}
  .rank{width:26px;height:26px;border-radius:8px;background:var(--chipbg);color:var(--muted);
        display:grid;place-items:center;font-size:12.5px;font-weight:700}
  .op{display:flex;align-items:center;gap:8px;font-weight:650}
  .dot{width:10px;height:10px;border-radius:50%;flex:none}
  .meta{color:var(--muted);font-size:12.5px;margin-top:2px}
  .amt{text-align:right}
  .amt .t{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}
  .badge{display:inline-block;font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:6px}
  .b-best{background:rgba(15,157,88,.14);color:var(--good)}
  .b-anchor{background:rgba(229,57,53,.14);color:var(--bad)}
  .delta{font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums}
  .up{color:var(--bad)} .down{color:var(--good)} .zero{color:var(--muted)}
  .skel{height:64px;border-radius:14px;background:linear-gradient(90deg,var(--card),var(--chipbg),var(--card));
        background-size:200% 100%;animation:sh 1.2s infinite}
  @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
</style></head><body><div class="wrap">
${siteHeader({
    title: "Rate comparison",
    sub: `<span id="sub">Loading…</span>`,
    active: "dashboard",
    extra: `<button class="btn" id="refresh" title="Refresh">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
        stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>
      <span>Refresh</span></button>`,
  })}

<div class="tabs" id="tabs"></div>
<div class="mtabs" id="mtabs"></div>
<div id="warn"></div>

<div class="cols">
  <div>
    <div class="summary" id="summary"></div>
    <div class="rows" id="rows"></div>
  </div>
  <div class="panel">
    <h3 id="chart-title">Price gap vs GME</h3>
    <div id="chart"></div>
    <div class="note" id="manual-note"></div>
  </div>
</div>

${siteFooter('<span id="auto">Auto-refresh 4m</span>')}
</div>
<script>
const BOOT = ${boot};
const q = (t) => BOOT.token ? t + "token=" + encodeURIComponent(BOOT.token) : t.replace(/[?&]$/,"");
const fmt = (n) => "₩" + Math.round(n).toLocaleString("en-US");
const state = { country: BOOT.countries[0].code, method: null, data: null, loading: false, at: 0 };

function el(id){ return document.getElementById(id); }

function renderTabs(){
  el("tabs").innerHTML = BOOT.countries.map(c =>
    \`<button class="tab \${c.code===state.country?"on":""}" data-c="\${c.code}">\${c.flag} \${c.name}</button>\`).join("");
  el("tabs").querySelectorAll(".tab").forEach(b => b.onclick = () => {
    state.country = b.dataset.c; state.method = null; state.data = null; render(); load();
  });
}

function renderSkeleton(){
  el("rows").innerHTML = Array.from({length:6}).map(()=>'<div class="skel"></div>').join("");
  el("summary").innerHTML = '<div class="lbl">Cheapest</div><div class="big">—</div>';
  el("chart").innerHTML = '<div class="skel" style="height:220px"></div>';
  el("manual-note").innerHTML = "";
}

const n0 = (v) => Math.round(v).toLocaleString("en-US");

// Diverging bar chart: axis = the anchor (GME). Left = cheaper, right = pricier.
function renderChart(d){
  const rows = (d.blocks[state.method] || []).slice().sort((a,b)=>b.total-a.total);
  if(!rows.length){ el("chart").innerHTML = ""; return; }

  const anchor = d.anchor ? rows.find(r=>r.provider===d.anchor) : null;
  el("chart-title").textContent = anchor ? \`Price gap vs \${anchor.op}\` : "Total price spread";

  const W = 520, padL = 96, padR = 14, top = 26, rowH = 28, barH = 13;
  const plotW = W - padL - padR;
  const cx = padL + plotW / 2;
  const halfW = plotW / 2 - 58;            // leave room for the value label
  const H = top + rows.length * rowH + 6;
  const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.gap ?? 0)));

  const body = rows.map((r,i)=>{
    const isA = d.anchor === r.provider;
    const gap = r.gap ?? 0;
    const w = isA ? 0 : (Math.abs(gap) / maxAbs) * halfW;
    const y = top + i * rowH;
    const by = y + (rowH - barH) / 2 - 2;
    const cls = gap > 0 ? "bar-up" : "bar-down";
    const bar = (isA || gap === 0) ? "" : (gap > 0
      ? \`<rect class="\${cls}" x="\${cx}" y="\${by}" width="\${w}" height="\${barH}" rx="3"/>\`
      : \`<rect class="\${cls}" x="\${cx-w}" y="\${by}" width="\${w}" height="\${barH}" rx="3"/>\`);

    const vTxt = isA ? "anchor" : (gap>0?"+":"−") + n0(Math.abs(gap));
    const vCls = isA ? "val-zero" : (gap>0 ? "val-up" : "val-down");
    const vX = isA ? cx + 8 : (gap>0 ? cx + w + 6 : cx - w - 6);
    const vAnchor = isA ? "start" : (gap>0 ? "start" : "end");

    const dot = \`<circle cx="7" cy="\${by+barH/2}" r="4" fill="\${BOOT.chip[r.provider]||"#888"}"/>\`;
    const name = r.op + (r.manual ? "*" : "");
    return \`<g class="g"><title>\${r.op} — total \${n0(r.total)} KRW · fee \${n0(r.fee)}</title>
      \${dot}
      <text class="lbl \${isA?"anchor":""}" x="18" y="\${by+barH/2+4}">\${name}</text>
      \${bar}
      <text class="val \${vCls}" x="\${vX}" y="\${by+barH/2+4}" text-anchor="\${vAnchor}">\${vTxt}</text>
    </g>\`;
  }).join("");

  el("chart").innerHTML = \`<svg viewBox="0 0 \${W} \${H}" role="img"
      aria-label="Price gap versus \${anchor?anchor.op:"cheapest"} for each competitor">
    <text class="cap" x="\${cx-10}" y="12" text-anchor="end">← cheaper</text>
    <text class="cap" x="\${cx+10}" y="12" text-anchor="start">more expensive →</text>
    <line class="axdash" x1="\${cx-halfW}" y1="\${top-4}" x2="\${cx-halfW}" y2="\${H-4}"/>
    <line class="axdash" x1="\${cx+halfW}" y1="\${top-4}" x2="\${cx+halfW}" y2="\${H-4}"/>
    <line class="ax" x1="\${cx}" y1="\${top-6}" x2="\${cx}" y2="\${H-4}"/>
    \${body}
  </svg>\`;

  // Footnote: which providers have no public API and must be typed in.
  const mp = d.manualProviders || [];
  if(mp.length){
    const tag = { fresh:"", stale:' <span class="unset">stale</span>', expired:' <span class="unset">expired — shows "-"</span>', unset:' <span class="unset">never set</span>' };
    const list = mp.map(m => \`<b>\${m.label}</b> <span style="opacity:.75">\${m.status==="unset"?"":m.age}</span>\${tag[m.status]||""}\`).join(", ");
    const bad = d.manualNeed || 0;
    el("manual-note").innerHTML =
      \`* <b>Manual input</b> — no public rate API: \${list}.
       \${bad ? \`<b class="unset">\${bad} need updating.</b>\` : ""}
       <a href="/ranking?country=\${d.country}">Edit on sheet view →</a>\`;
  } else {
    el("manual-note").innerHTML = "All competitors on this corridor are scraped automatically.";
  }
}

// Operational stat bar for the selected corridor + active method. Mirrors the
// server's statBarInner markup so the shared red chrome stays consistent.
function updateStatBar(d){
  const bar = el("statbar"); if(!bar) return;
  const rows = d.blocks[state.method] || [];
  const live = rows.filter(r => !r.noRate && r.total != null);
  const gme = live.find(r => r.provider === d.anchor);
  const asc = live.slice().sort((a,b)=>a.total-b.total);
  const cheapest = asc[0];
  const rank = gme ? asc.findIndex(r=>r.provider===d.anchor)+1 : null;
  const beat = gme ? live.filter(r=>r.total < gme.total).length : null;
  const gap = (gme && cheapest) ? gme.total - cheapest.total : null;
  const toUpdate = d.manualNeed || 0;
  const cards = [
    { k:"Live",      v:live.length,                       d:"var(--good)" },
    { k:"Beat GME",  v:beat==null?"—":beat,               d:"var(--brand)" },
    { k:"GME rank",  v:rank==null?"—":("#"+rank),         d:"#3a86ff" },
    { k:"To update", v:toUpdate,                          d:"var(--warn)" },
  ];
  const totals = [
    { k:cheapest?cheapest.op:"Cheapest", v:cheapest?fmt(cheapest.total):"—" },
    { k:"vs GME", v:gap==null?"—":(gap>0?"+"+fmt(gap):"Best") },
  ];
  bar.innerHTML =
    '<div class="statset">' + cards.map(c =>
      \`<div class="stat"><div class="k"><span class="d" style="background:\${c.d}"></span>\${c.k}</div><div class="v">\${c.v}</div></div>\`).join("") +
    '</div><div class="stotals">' + totals.map(t =>
      \`<div class="stot"><div class="k">\${t.k}</div><div class="v">\${t.v}</div></div>\`).join("") +
    '</div>';
}

function render(){
  renderTabs();
  const d = state.data;
  if(!d){ el("mtabs").innerHTML=""; el("warn").innerHTML=""; renderSkeleton(); return; }

  el("sub").textContent = \`\${d.flag} \${d.name} · receive \${d.receiveAmount.toLocaleString()} \${d.currency} · updated \${new Date(state.at).toLocaleTimeString()}\`;
  // Keep the shared nav's corridor-scoped link pointing at the selected country.
  el("nav-sheet").href  = q(\`/ranking?country=\${d.country}&\`);

  // method tabs (only when the country has more than one)
  if(d.methods.length > 1){
    if(!state.method) state.method = d.methods[0].key;
    el("mtabs").innerHTML = d.methods.map(m =>
      \`<button class="mtab \${m.key===state.method?"on":""}" data-m="\${m.key}">\${m.label}</button>\`).join("");
    el("mtabs").querySelectorAll(".mtab").forEach(b => b.onclick = () => { state.method = b.dataset.m; render(); });
  } else { state.method = d.methods[0].key; el("mtabs").innerHTML = ""; }

  el("warn").innerHTML = (d.failed && d.failed.length)
    ? \`<div class="warn">⚠ Unavailable this run: \${d.failed.map(f=>f.who).join(", ")}</div>\` : "";

  updateStatBar(d); // operational counters in the red chrome
  renderChart(d); // price-gap chart alongside the ranked cards

  const rows = (d.blocks[state.method] || []).slice().sort((a,b)=>a.total-b.total); // cheapest first
  if(!rows.length){ el("rows").innerHTML=""; return; }
  const min = rows[0].total, max = rows[rows.length-1].total;
  const anchor = d.anchor ? rows.find(r=>r.provider===d.anchor) : null;

  el("summary").innerHTML =
    \`<div class="lbl">Cheapest — \${rows[0].op}</div>
     <div class="big">\${fmt(min)}</div>
     <div class="lbl">saves \${fmt(max-min)} vs \${rows[rows.length-1].op}\${anchor ? \` · \${d.anchor} is \${fmt(Math.abs(anchor.total-min))} \${anchor.total>min?"higher":"lowest"}\` : ""}</div>\`;

  el("rows").innerHTML = rows.map((r,i)=>{
    const isBest = i===0, isAnchor = d.anchor===r.provider;
    const delta = r.total - min;
    const vs = anchor ? r.total - anchor.total : null;
    const pct = max>min ? ((r.total-min)/(max-min))*100 : 0;
    const dCls = delta===0 ? "zero" : "up";
    const vsTxt = vs===null || isAnchor ? "" :
      \`<span class="delta \${vs>0?"up":"down"}">\${vs>0?"+":"−"}\${fmt(Math.abs(vs))} vs \${d.anchor}</span>\`;
    return \`<div class="row \${isBest?"best":""} \${isAnchor?"anchor":""}">
      <div class="bar" style="width:\${pct}%"></div>
      <div class="rank">\${i+1}</div>
      <div>
        <div class="op"><span class="dot" style="background:\${BOOT.chip[r.provider]||"#888"}"></span>\${r.op}
          \${isBest?'<span class="badge b-best">Cheapest</span>':""}
          \${isAnchor?'<span class="badge b-anchor">You</span>':""}
          \${r.manual?'<span class="mtag" title="No public rate API — typed in manually">manual</span>':""}
        </div>
        <div class="meta">fee \${fmt(r.fee)} · exchange \${fmt(r.total-r.fee)}</div>
      </div>
      <div class="amt">
        <div class="t">\${fmt(r.total)}</div>
        <div class="delta \${dCls}">\${delta===0?"best price":"+"+fmt(delta)}</div>
        \${vsTxt?\`<div>\${vsTxt}</div>\`:""}
      </div>
    </div>\`;
  }).join("");
}

async function load(fresh){
  if(state.loading) return;
  state.loading = true;
  el("refresh").classList.add("spin");
  try{
    const url = q(\`/ranking?country=\${state.country}&format=json&\${fresh?"fresh=1&":""}\`);
    const res = await fetch(url, { headers: { "Accept":"application/json" } });
    if(!res.ok) throw new Error("HTTP " + res.status);
    state.data = await res.json();
    state.at = Date.now();
  }catch(e){
    el("warn").innerHTML = \`<div class="warn">Failed to load: \${e.message}</div>\`;
  }finally{
    state.loading = false;
    el("refresh").classList.remove("spin");
    render();
  }
}

el("refresh").onclick = () => load(true);
render(); load();
// Poll roughly every 4 min, jittered ±20s so open tabs never sync into a burst.
// The server serves these from a warm cache anyway; this just refreshes the view.
setInterval(() => load(false), 240000 + Math.floor((Math.random()*40 - 20) * 1000));
</script></body></html>`;
}
