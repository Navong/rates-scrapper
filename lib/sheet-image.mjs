// Server-side render of the ranking "sheet view" to PNG — the same table the
// client draws to <canvas> for its "Copy image" button, so a workflow (Teams /
// Power Automate) can fetch the sheet as an image instead of a human clicking.
//
// SVG is composed to mirror drawServiceTable()/drawCell() in SheetClient.jsx,
// then rasterized with sharp. Fonts: DejaVu Sans (installed in the Docker image).
import sharp from "sharp";
import { anchorOf } from "../countries.mjs";

// Cell fills — kept in sync with SheetClient.jsx / ranking.mjs.
const FILL = { GMONEY: "#92D050", E9PAY: "#FFFF00", GME: "#FF0000", HANPASS: "#CC99FF", SBI: "#00FFFF" };
const OTHER_FILL = "#9DC3E6";
const COUNTRY_FILL = "#D9D9D9";
const SERVICE_FILL = "#F8CBAD";
const NEG_GAP = "#12B886";
const fillFor = (p) => FILL[p] || FILL[String(p).split("_")[0]] || OTHER_FILL;

const SHEET_COLS = [92, 112, 130, 92, 108, 108, 138, 100];
const SHEET_W = SHEET_COLS.reduce((a, b) => a + b, 0);
const ROW_H = 30, STAMP_H = 28, TABLE_GAP = 22, PANEL_PAD = 18;
const FONT = "DejaVu Sans, Arial, sans-serif";

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// One bordered cell (+ optional text). Mirrors drawCell().
function cell(x, y, w, h, text, { bg = "#fff", bold = false, align = "center", color = "#000" } = {}) {
  let s = `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w}" height="${h}" fill="${bg}" stroke="#c9ced6" stroke-width="1"/>`;
  if (text != null && text !== "") {
    const tx = align === "right" ? x + w - 8 : align === "left" ? x + 8 : x + w / 2;
    const anchor = align === "right" ? "end" : align === "left" ? "start" : "middle";
    s += `<text x="${tx}" y="${y + h / 2}" font-family="${FONT}" font-size="13" font-weight="${bold ? 700 : 400}" fill="${color}" text-anchor="${anchor}" dominant-baseline="central">${esc(text)}</text>`;
  }
  return s;
}

// One service table at (x, y). Mirrors drawServiceTable().
function serviceTable(d, service, rows, x, y, dateStr, timeStr) {
  const xs = SHEET_COLS.reduce((out, w) => [...out, out[out.length - 1] + w], [x]);
  let s = "";
  s += cell(xs[6], y, SHEET_COLS[6], STAMP_H, `Date : ${dateStr}`, { align: "left", bold: true });
  s += cell(xs[7], y, SHEET_COLS[7], STAMP_H, timeStr, { align: "right", bold: true });
  y += STAMP_H;

  ["Country", "Service", "Competitor", `FCY(${d.currency})`, "KRW ①", "Service fee ②", "Total price ①+②", "Price gap"]
    .forEach((h, i) => { s += cell(xs[i], y, SHEET_COLS[i], ROW_H, h, { bg: "#f2f4f6", bold: true }); });
  y += ROW_H;

  const bodyY = y;
  const bodyH = Math.max(ROW_H, rows.length * ROW_H);
  if (rows.length) {
    s += cell(xs[0], bodyY, SHEET_COLS[0], bodyH, d.name, { bg: COUNTRY_FILL });
    s += cell(xs[1], bodyY, SHEET_COLS[1], bodyH, service.label, { bg: SERVICE_FILL });
  }

  const anchorKey = anchorOf(d.anchor, service.key);
  const amt = service.receiveAmount ?? d.receiveAmount;
  rows.forEach((r) => {
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
      const cellColor = actualCol === 7 && !r.noRate && !isAnchor && r.gap < 0 ? NEG_GAP : color;
      s += cell(xs[actualCol], y, SHEET_COLS[actualCol], ROW_H, v, { bg, align, color: cellColor, bold: isAnchor || actualCol === 6 });
    });
    y += ROW_H;
  });
  return s;
}

// Render the whole corridor sheet (all its services) to a PNG buffer.
export async function sheetPNG(d, dateStr, timeStr) {
  const tableHeights = d.methods.map((m) => STAMP_H + ROW_H + (d.blocks[m.key] || []).length * ROW_H);
  const grid = !!d.grid;
  const width = PANEL_PAD * 2 + (grid ? SHEET_W * 2 + 14 : SHEET_W);
  const height = PANEL_PAD * 2 + (grid
    ? Math.max(tableHeights[0] || 0, tableHeights[1] || 0) + 14 + (tableHeights[2] || 0)
    : tableHeights.reduce((sum, h, i) => sum + h + (i ? TABLE_GAP : 0), 0));

  let body = "";
  if (grid) {
    d.methods.forEach((m, i) => {
      const x = PANEL_PAD + (i === 1 ? SHEET_W + 14 : i === 2 ? (SHEET_W + 14) / 2 : 0);
      const y = PANEL_PAD + (i === 2 ? Math.max(tableHeights[0] || 0, tableHeights[1] || 0) + 14 : 0);
      body += serviceTable(d, m, d.blocks[m.key] || [], x, y, dateStr, timeStr);
    });
  } else {
    let y = PANEL_PAD;
    d.methods.forEach((m, i) => {
      if (i) y += TABLE_GAP;
      body += serviceTable(d, m, d.blocks[m.key] || [], PANEL_PAD, y, dateStr, timeStr);
      y += tableHeights[i];
    });
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`
    + `<rect width="${width}" height="${height}" fill="#ffffff"/>${body}</svg>`;
  // Render at 2× for a crisp image (matches the client's devicePixelRatio cap).
  return sharp(Buffer.from(svg), { density: 144 }).resize(Math.ceil(width * 2), Math.ceil(height * 2)).png().toBuffer();
}
