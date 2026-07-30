"use client";

// Client-driven sheet view. Mirrors the dashboard: the chrome (red bar, stat bar,
// nav, corridor tabs) stays FIXED while only the content region shows a skeleton
// on a corridor switch. Server-seeded (initialData) for an instant first paint.

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, LoaderCircle, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { AppHeader, SiteFooter } from "@/lib/ui";
import { anchorOf } from "@/lib/countries";
import ManualEditor from "./ManualEditor";
import FeeEditor from "./FeeEditor";
import CountryViewPicker from "../CountryViewPicker";

// Spreadsheet cell fills (kept in sync with ranking.mjs FILL/*_FILL). Defined
// here so this client component doesn't import the server-only ranking module.
const FILL = { GMONEY: "#92D050", E9PAY: "#FFFF00", GME: "#FF0000", HANPASS: "#CC99FF", SBI: "#00FFFF" };
const OTHER_FILL = "#9DC3E6";
const COUNTRY_FILL = "#D9D9D9";
const SERVICE_FILL = "#F8CBAD";
const NEG_GAP_FILL = "#12B886";
// Channel keys like "GME_WU" fall back to their family colour ("GME").
const fillFor = (p) => FILL[p] || FILL[String(p).split("_")[0]] || OTHER_FILL;

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const pad2 = (n) => String(n).padStart(2, "0");
const stampNow = () => {
  const d = new Date();
  return { date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
};
// 12-hour clock like "4:32 PM" for the copied-image caption.
const time12 = (d = new Date()) => {
  const ap = d.getHours() >= 12 ? "PM" : "AM";
  const h = d.getHours() % 12 || 12;
  return `${h}:${pad2(d.getMinutes())} ${ap}`;
};

const SHEET_COLS = [92, 112, 130, 92, 108, 108, 138, 100];
const SHEET_W = SHEET_COLS.reduce((a, b) => a + b, 0);
const ROW_H = 30;
const STAMP_H = 28;
const TABLE_GAP = 22;
const VERTICAL_GRID_GAP = 12;
const PANEL_PAD = 18;

function drawCell(ctx, x, y, w, h, text, { bg = "#fff", bold = false, align = "center", color = "#000", border = "#c9ced6" } = {}) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + .5, y + .5, w, h);
  if (text == null || text === "") return;
  ctx.fillStyle = color;
  ctx.font = `${bold ? "700 " : "400 "}13px Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const tx = align === "right" ? x + w - 8 : align === "left" ? x + 8 : x + w / 2;
  ctx.fillText(String(text), tx, y + h / 2, w - 12);
}

function drawServiceTable(ctx, d, service, rows, x, y, dateStr, timeStr, showStamp = true) {
  const xs = SHEET_COLS.reduce((out, w) => [...out, out[out.length - 1] + w], [x]);
  if (showStamp) {
    drawCell(ctx, xs[6], y, SHEET_COLS[6], STAMP_H, `Date : ${dateStr}`, { align: "left", bold: true });
    drawCell(ctx, xs[7], y, SHEET_COLS[7], STAMP_H, timeStr, { align: "right", bold: true });
    y += STAMP_H;
  }

  ["Country", "Service", "Competitor", `FCY(${service.currency ?? d.currency})`, "KRW ①", "Service fee ②", "Total price ①+②", "Price gap"]
    .forEach((h, i) => drawCell(ctx, xs[i], y, SHEET_COLS[i], ROW_H, h, { bg: "#f2f4f6", bold: true }));
  y += ROW_H;

  const bodyY = y;
  const bodyH = Math.max(ROW_H, rows.length * ROW_H);
  if (rows.length) {
    drawCell(ctx, xs[0], bodyY, SHEET_COLS[0], bodyH, d.name, { bg: COUNTRY_FILL });
    drawCell(ctx, xs[1], bodyY, SHEET_COLS[1], bodyH, service.label, { bg: SERVICE_FILL });
  }

  const anchorKey = anchorOf(d.anchor, service.key);
  const amt = service.receiveAmount ?? d.receiveAmount;
  rows.forEach((r, i) => {
    const isAnchor = anchorKey === r.provider;
    const fill = fillFor(r.provider);
    const color = r.noRate ? "#98a0ab" : "#000";
    const gap = isAnchor || r.gap == null ? "-" : r.gap < 0 ? `- ${fmt(-r.gap)}` : fmt(r.gap);
    const values = [
      r.op,
      fmt(amt),
      r.noRate ? "-" : fmt(r.krw),
      r.noRate ? "-" : r.fee === 0 ? "-" : fmt(r.fee),
      r.noRate ? "-" : fmt(r.total),
      r.noRate ? "-" : gap,
    ];
    values.forEach((v, col) => {
      const actualCol = col + 2;
      const bg = actualCol === 2 ? fill : "#fff";
      const align = actualCol >= 3 ? "right" : "center";
      const cellColor = actualCol === 7 && !r.noRate && !isAnchor && r.gap < 0 ? NEG_GAP_FILL : color;
      drawCell(ctx, xs[actualCol], y, SHEET_COLS[actualCol], ROW_H, v, { bg, align, color: cellColor, bold: isAnchor || actualCol === 6 });
    });
    y += ROW_H;
  });
}

async function copySheetAsPng(d, dateStr, timeStr) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard is not supported in this browser.");
  }

  // Dynamic caption, e.g. "Philippines Rate Comparison as of 10:44 AM".
  // Kept SEPARATE from the image (not drawn into it).
  const caption = `${d.name} Rate Comparison as of ${time12()}`;

  const grid = !!d.grid;
  const verticalGrid = grid && !!d.gridVertical;
  const tableHeights = d.methods.map((m, i) =>
    (verticalGrid && i > 0 ? 0 : STAMP_H) + ROW_H + (d.blocks[m.key] || []).length * ROW_H
  );
  const width = PANEL_PAD * 2 + (grid && !verticalGrid ? SHEET_W * 2 + 14 : SHEET_W);
  const height = PANEL_PAD * 2 + (grid && !verticalGrid
    ? Math.max(tableHeights[0] || 0, tableHeights[1] || 0) + 14 + (tableHeights[2] || 0)
    : tableHeights.reduce((sum, h, i) => sum + h + (i ? (verticalGrid ? VERTICAL_GRID_GAP : TABLE_GAP) : 0), 0));

  const scale = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  if (grid && !verticalGrid) {
    d.methods.forEach((m, i) => {
      const x = PANEL_PAD + (i === 1 ? SHEET_W + 14 : i === 2 ? (SHEET_W + 14) / 2 : 0);
      const y = PANEL_PAD + (i === 2 ? Math.max(tableHeights[0] || 0, tableHeights[1] || 0) + 14 : 0);
      drawServiceTable(ctx, d, m, d.blocks[m.key] || [], x, y, dateStr, timeStr);
    });
  } else {
    let y = PANEL_PAD;
    d.methods.forEach((m, i) => {
      if (i) y += verticalGrid ? VERTICAL_GRID_GAP : TABLE_GAP;
      drawServiceTable(ctx, d, m, d.blocks[m.key] || [], PANEL_PAD, y, dateStr, timeStr, !verticalGrid || i === 0);
      y += tableHeights[i];
    });
  }

  const png = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create PNG.")), "image/png"));

  // Clipboard with THREE parts so the image and caption stay separate:
  //   text/html  — image first, followed by a new line and caption; rich targets (Teams,
  //                Kakao, email, docs) preserve that order and formatting.
  //   image/png  — pure-image targets paste just the picture.
  //   text/plain — plain-text fields fall back to the caption text.
  const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onloadend = () => res(r.result); r.readAsDataURL(png); });
  const safe = caption.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<img src="${dataUrl}" alt="${safe}"><br><span style="font:15px Arial,sans-serif">${safe}</span>`;
  await navigator.clipboard.write([new ClipboardItem({
    "text/html": new Blob([html], { type: "text/html" }),
    "image/png": png,
    "text/plain": new Blob([caption], { type: "text/plain" }),
  })]);
}

// Operational counters for the stat bar (first method), same logic as the server.
function computeStats(d) {
  const method = d.methods[0].key;
  const anchorKey = anchorOf(d.anchor, method);
  const rows = d.blocks[method] || [];
  const live = rows.filter((r) => !r.noRate && r.total != null);
  const gme = live.find((r) => r.provider === anchorKey);
  const asc = [...live].sort((a, b) => a.total - b.total);
  const cheapest = asc[0];
  const rank = gme ? asc.findIndex((r) => r.provider === anchorKey) + 1 : null;
  const beat = gme ? live.filter((r) => r.total < gme.total).length : null;
  const gap = gme && cheapest ? gme.total - cheapest.total : null;
  return {
    cards: [
      { k: "Live", v: live.length, d: "var(--good)" },
      { k: "Beat GME", v: beat == null ? "—" : beat, d: "var(--brand)" },
      { k: "GME rank", v: rank == null ? "—" : `#${rank}`, d: "#3a86ff" },
      { k: "To update", v: d.manualNeed || 0, d: "var(--warn)" },
    ],
    totals: [
      { k: cheapest ? cheapest.op : "Cheapest", v: cheapest ? `₩${fmt(cheapest.total)}` : "—" },
      { k: "vs GME", v: gap == null ? "—" : gap > 0 ? `+₩${fmt(gap)}` : "Best" },
    ],
  };
}

function ServiceTable({ d, service, rows, dateStr, timeStr, showStamp = true }) {
  const anchorKey = anchorOf(d.anchor, service.key);
  const amt = service.receiveAmount ?? d.receiveAmount;
  return (
    <table>
      <tbody>
        {showStamp ? (
          <tr>
            <td className="none" colSpan={6} />
            <td className="dt">Date : {dateStr}</td>
            <td className="dt num">{timeStr}</td>
          </tr>
        ) : null}
        <tr>
          <th>Country</th><th>Service</th><th>Competitor</th>
          <th>FCY({service.currency ?? d.currency})</th><th>KRW ①</th><th>Service fee ②</th>
          <th className="b">Total price ①+②</th><th>Price gap</th>
        </tr>
        {rows.map((r, i) => {
          const isAnchor = anchorKey === r.provider;
          const fill = fillFor(r.provider);
          const bold = isAnchor ? { fontWeight: 700 } : undefined;
          const first = i === 0;
          const cCell = first ? <td rowSpan={rows.length} className="mid" style={{ background: COUNTRY_FILL }}>{d.name}</td> : null;
          const sCell = first ? <td rowSpan={rows.length} className="mid" style={{ background: SERVICE_FILL }}>{service.label}</td> : null;
          if (r.noRate) {
            return (
              <tr className="norate" key={r.provider}>
                {cCell}{sCell}
                <td className="mid" style={{ background: fill }}>{r.op}</td>
                <td className="num">{fmt(amt)}</td>
                <td className="num">-</td><td className="num">-</td>
                <td className="num b">-</td><td className="num">-</td>
              </tr>
            );
          }
          const feeCell = r.fee === 0 ? "-" : fmt(r.fee);
          const gapCell = isAnchor || r.gap == null ? "-" : (r.gap < 0 ? `- ${fmt(-r.gap)}` : fmt(r.gap));
          const gapCls = !isAnchor && r.gap < 0 ? "num neg" : "num";
          return (
            <tr style={bold} key={r.provider}>
              {cCell}{sCell}
              <td className="mid" style={{ background: fill, ...(bold || {}) }}>{r.op}</td>
              <td className="num">{fmt(amt)}</td>
              <td className="num">{fmt(r.krw)}</td>
              <td className="num">{feeCell}</td>
              <td className="num b" style={bold}>{fmt(r.total)}</td>
              <td className={gapCls}>{gapCell}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SkeletonTable({ showStamp = true }) {
  const rows = showStamp ? 8 : 7;
  const headerRow = showStamp ? 1 : 0;
  return (
    <table className="sksheet">
      <tbody>
        {Array.from({ length: rows }).map((_, row) => (
          <tr key={row}>
            {Array.from({ length: 8 }).map((__, col) => (
              <td key={col} className={row === headerRow ? "skhead" : ""}>
                <span className="skcell" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SheetSkeleton({ verticalGrid = false, tableCount = 1 }) {
  return (
    <>
      <div className="panel sheetpanel">
        <div className="sheetscroll" aria-hidden="true">
          {verticalGrid ? (
            <div className="sheets vertical">
              {Array.from({ length: tableCount }).map((_, i) => <SkeletonTable key={i} showStamp={i === 0} />)}
            </div>
          ) : <SkeletonTable />}
        </div>
      </div>
      <div className="panel manualp" style={{ marginTop: 16 }} aria-hidden="true">
        <div className="skmanual">
          {Array.from({ length: 4 }).map((_, i) => <div className="skmcard" key={i} />)}
        </div>
      </div>
    </>
  );
}

export default function SheetClient({ countries, reportDate, initialCountry, initialData, admin = false, teamsEnabled = false }) {
  const [country, setCountry] = useState(initialCountry);
  const [data, setData] = useState(initialData || null);
  const [err, setErr] = useState("");
  const [mounted, setMounted] = useState(false);
  const [stamp, setStamp] = useState({ date: reportDate, time: "" });
  const [copyState, setCopyState] = useState("");
  const [sendState, setSendState] = useState("");
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const didMount = useRef(false);

  // `fresh` forces a real re-scrape (bypasses the cache/memo) — same contract as
  // the dashboard's Refresh. The limiter still queues + spaces the upstream calls.
  const load = useCallback(async (code, fresh = false, notify = false) => {
    const requestId = ++requestRef.current;
    setErr("");
    setLoading(true);
    const started = performance.now();
    const toastId = notify ? toast.add({
      type: "loading",
      title: "Refreshing live rates",
      description: "Contacting every provider. Slow providers can take up to 25 seconds.",
      timeout: 0,
    }) : null;
    try {
      const res = await fetch(`/api/ranking?country=${code}${fresh ? "&fresh=1" : ""}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const nextData = await res.json();
      if (requestId !== requestRef.current) return;
      setData(nextData);
      setStamp(stampNow());
      if (toastId) {
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        toast.update(toastId, {
          type: nextData.failed?.length ? "warning" : "success",
          title: nextData.failed?.length ? "Sheet refreshed with warnings" : "Sheet refreshed",
          description: nextData.failed?.length
            ? `${nextData.failed.length} provider${nextData.failed.length === 1 ? "" : "s"} unavailable · ${seconds}s`
            : `Latest provider rates loaded in ${seconds}s.`,
          timeout: 5000,
        });
      }
    } catch (e) {
      if (requestId !== requestRef.current) return;
      setErr(e.message);
      if (toastId) {
        toast.update(toastId, {
          type: "error",
          title: "Refresh failed",
          description: e.message,
          timeout: 6000,
        });
      }
    } finally {
      // Only the newest request may clear the spinner (a superseded one must not).
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { setMounted(true); setStamp(stampNow()); }, []);

  // On mount reuse the server-seeded corridor; on a switch, skeleton then fetch.
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      if (data) return;
    } else {
      setData(null);
    }
    load(country);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  const d = data;
  const selectedCountry = countries.find((c) => c.code === country);
  const layoutGrid = d?.grid ?? selectedCountry?.grid;
  const layoutVertical = d?.gridVertical ?? selectedCountry?.gridVertical;
  const dateStr = mounted ? stamp.date : reportDate;
  const timeStr = mounted ? stamp.time : "";

  // Corridors whose methods share one receive amount show it; a multi-amount
  // corridor (e.g. Myanmar: 50M/5M/4M) shows the per-method amount in each table.
  const amounts = d ? new Set(d.methods.map((m) => m.receiveAmount ?? d.receiveAmount)) : null;
  const sub = d
    ? <>{d.flag} {d.name}{amounts.size === 1 ? <> · receive {(d.methods[0].receiveAmount ?? d.receiveAmount).toLocaleString("en-US")} {d.currency}</> : <> · {d.currency}</>} · {dateStr}{timeStr ? ` ${timeStr}` : ""}</>
    : "Loading…";

  const copySheet = useCallback(async () => {
    if (!d || copyState === "copying") return;
    setCopyState("copying");
    try {
      await copySheetAsPng(d, dateStr, timeStr);
      setCopyState("copied");
      setTimeout(() => setCopyState(""), 1800);
    } catch (e) {
      setCopyState("failed");
      setErr(e.message);
      setTimeout(() => setCopyState(""), 2200);
    }
  }, [copyState, d, dateStr, timeStr]);

  const copyButton = (
    <Button variant="secondary" type="button" disabled={!d || copyState === "copying"} onClick={copySheet} title="Copy sheet as image">
      {copyState === "copying"
        ? <LoaderCircle data-icon="inline-start" className="animate-spin" />
        : copyState === "copied"
          ? <Check data-icon="inline-start" />
          : <Copy data-icon="inline-start" />}
      <span>{copyState === "copying" ? "Copying..." : copyState === "copied" ? "Copied" : copyState === "failed" ? "Failed" : "Copy image"}</span>
    </Button>
  );

  // Post the caption + sheet image to the team's Teams channel (server → webhook).
  const sendTeams = useCallback(async () => {
    if (!d || sendState === "sending") return;
    setSendState("sending");
    try {
      const res = await fetch(`/api/send-teams?country=${country}`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setSendState("sent");
      setTimeout(() => setSendState(""), 2000);
    } catch (e) {
      setSendState("failed");
      setErr("Send to Teams failed: " + e.message);
      setTimeout(() => setSendState(""), 2600);
    }
  }, [sendState, d, country]);

  const sendButton = teamsEnabled ? (
    <Button variant="outline" type="button" disabled={!d || sendState === "sending"} onClick={sendTeams} title="Send caption + image to Teams">
      {sendState === "sending"
        ? <LoaderCircle data-icon="inline-start" className="animate-spin" />
        : <Send data-icon="inline-start" />}
      <span>{sendState === "sending" ? "Sending..." : sendState === "sent" ? "Sent ✓" : sendState === "failed" ? "Failed" : "Send to Teams"}</span>
    </Button>
  ) : null;

  // Re-scrape the current corridor now. Same look/behaviour as the dashboard and
  // stats Refresh, so the three pages stay consistent.
  const refreshButton = (
    <Button
      variant="default"
      type="button"
      id="refresh"
      title="Re-scrape this corridor now"
      disabled={loading}
      onClick={() => load(country, true, true)}
    >
      <RefreshCw data-icon="inline-start" className={loading ? "animate-spin" : ""} />
      <span>Refresh</span>
    </Button>
  );

  const headerActions = <>{refreshButton}{copyButton}{sendButton}</>;

  let tables = null;
  if (d) {
    const rendered = d.methods.map((m, i) => (
      <ServiceTable key={m.key} d={d} service={m} rows={d.blocks[m.key] || []} dateStr={dateStr} timeStr={timeStr}
        showStamp={!d.gridVertical || i === 0} />
    ));
    tables = d.grid
      ? <div className={`sheets${d.gridVertical ? " vertical" : ""}`}>{rendered}</div>
      : rendered.map((t, i) => <div key={i}>{t}{i < rendered.length - 1 ? <div style={{ height: 22 }} /> : null}</div>);
  }

  return (
    <main className={`wrap sheetpage${layoutGrid ? " grid" : ""}${layoutVertical ? " grid-vertical" : ""}`}>
      <AppHeader
        title="Sheet view"
        sub={sub}
        active="sheet"
        country={country}
        extra={headerActions}
        stats={d ? computeStats(d) : null}
        reportDate={reportDate}
        admin={admin}
        showNav={false}
      />

      <CountryViewPicker
        countries={countries}
        country={country}
        activeView="sheet"
        onCountryChange={setCountry}
        admin={admin}
      />

      <div id="sheet-region">
        {err ? <div className="warn">Failed to load: {err}</div> : null}
        {!d ? (
          <SheetSkeleton verticalGrid={layoutVertical} tableCount={selectedCountry?.methods?.length || 1} />
        ) : (
          <>
            {d.failed?.length ? <div className="warn">⚠ Unavailable this run: {d.failed.map((f) => f.who).join(", ")}</div> : null}
            <div className="panel sheetpanel"><div className="sheetscroll">{tables}</div></div>
            {d.manualCards?.length ? <ManualEditor code={d.country} cards={d.manualCards} onSaved={() => load(country)} /> : null}
            {d.feeCards?.length ? <FeeEditor code={d.country} cards={d.feeCards} onSaved={() => load(country)} /> : null}
          </>
        )}
      </div>

      <SiteFooter note={d?.manualNames ? <span>* manual input: {d.manualNames}</span> : null} />
    </main>
  );
}
