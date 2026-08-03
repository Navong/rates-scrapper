// Writes scrape results to rates.xlsx in the "Exchange rate (Daily)" format:
//   - One worksheet per month (e.g. "June 2026"), like the legacy master file.
//   - Main table columns: Date | GME | E9pay | Hanpass | Gmoney | SBI | Sentbe | Time | Remarks
//   - Two rows appended per run: a "Bank Deposit" row and a "Mobile Wallet" row.
//   - Provider cells hold the total as a formula =principal+serviceCharge.
//   - A ranking block (to the right) is refreshed each run: per-provider total,
//     service charge, price gap vs cheapest, Rate/$ and price without charge.
//
// If the workbook is open in Excel (locked), the save fails with a clear message
// instead of crashing the scrape.

import ExcelJS from "exceljs";
import { existsSync } from "node:fs";
import { KOREA_TIME_ZONE, todayStr } from "./date";

// Provider -> main-table column (B..G). Sentbe (G) stays blank (not scraped).
const PROVIDER_COL = { GME: 2, E9PAY: 3, HANPASS: 4, GMONEY: 5, SBI: 6 };
const HEADERS = ["Date", "GME", "E9pay", "Hanpass", "Gmoney", "SBI", "Sentbe", "Time", "Remarks"];
const METHODS = [
  { key: "BANK DEPOSIT", remark: "Bank Deposit" },
  { key: "MOBILE WALLET", remark: "Mobile Wallet" },
];
// Ranking block lives in columns K..P (11..16).
const RANK_START_COL = 11;

const NAVY = "FF1F4E78";
const LIGHT = "FFE2EFDA";

function monthSheetName(d) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: KOREA_TIME_ZONE, month: "long", year: "numeric",
  }).format(d);
}
function timeLabel(d) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: KOREA_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: true,
  }).formatToParts(d).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  return `${parts.dayPeriod} ${parts.hour}:${parts.minute}`;
}
function fill(cell, argb) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function buildHeader(ws) {
  ws.mergeCells(1, 1, 1, 9);
  const title = ws.getCell(1, 1);
  title.value = "Daily Exchange Rate — KR → Cambodia, receive 1000 USD";
  title.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  title.alignment = { horizontal: "center" };
  fill(title, NAVY);

  const hr = ws.getRow(2);
  HEADERS.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.alignment = { horizontal: "center" };
    fill(c, NAVY);
  });
  ws.views = [{ state: "frozen", ySplit: 2 }];
  [12, 13, 13, 13, 13, 13, 13, 11, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  // Provider columns formatted as thousands; date column as date.
  for (let col = 2; col <= 7; col++) ws.getColumn(col).numFmt = "#,##0";
  ws.getColumn(1).numFmt = "yyyy-mm-dd";
}

// Last used row in the MAIN table (scan column A from row 3 down).
function lastMainRow(ws) {
  let last = 2;
  ws.eachRow((row, n) => {
    if (n > 2 && row.getCell(1).value != null && row.getCell(1).value !== "") last = n;
  });
  return last;
}

function providerTotalCell(rec) {
  // SBI: single rate, no fee exposed → plain value. Others: =principal+fee.
  if (rec.feeKRW == null) return rec.sendTotalKRW;
  return { formula: `${rec.principalKRW}+${rec.feeKRW}`, result: rec.sendTotalKRW };
}

function writeRankingBlock(ws, byMethod, dateObj) {
  // Clear the ranking columns first.
  for (let r = 1; r <= Math.max(ws.rowCount, 40); r++) {
    for (let c = RANK_START_COL; c <= RANK_START_COL + 5; c++) ws.getCell(r, c).value = null;
  }
  const cols = ["Operator", "1000$ (total)", "Service Charge", "Price gap", "Rate/$", "Price w/o charge"];
  let row = 1;
  const dateStr = dateObj.toISOString().slice(0, 10);

  for (const m of METHODS) {
    const recs = byMethod[m.key];
    // Title
    const t = ws.getCell(row, RANK_START_COL);
    t.value = `${m.remark} ranking — ${dateStr}`;
    t.font = { bold: true, color: { argb: "FFFFFFFF" } };
    for (let c = 0; c <= 5; c++) fill(ws.getCell(row, RANK_START_COL + c), NAVY);
    row++;
    // Header
    cols.forEach((h, i) => {
      const c = ws.getCell(row, RANK_START_COL + i);
      c.value = h;
      c.font = { bold: true };
      fill(c, "FFD9E1F2");
    });
    row++;
    // Rows sorted cheapest-first by total.
    const sorted = [...recs].sort((a, b) => a.total - b.total);
    const minTotal = sorted.length ? sorted[0].total : 0;
    sorted.forEach((r, i) => {
      const base = ws.getCell(row, RANK_START_COL);
      base.value = r.provider;
      ws.getCell(row, RANK_START_COL + 1).value = r.total;
      ws.getCell(row, RANK_START_COL + 2).value = r.charge ?? "";
      ws.getCell(row, RANK_START_COL + 3).value = r.total - minTotal;
      ws.getCell(row, RANK_START_COL + 4).value = Number((r.total / 1000).toFixed(2)); // Rate/$
      ws.getCell(row, RANK_START_COL + 5).value = r.charge != null ? r.total - r.charge : "";
      for (let c = 1; c <= 3; c++) ws.getCell(row, RANK_START_COL + c).numFmt = "#,##0";
      ws.getCell(row, RANK_START_COL + 4).numFmt = "#,##0.00";
      ws.getCell(row, RANK_START_COL + 5).numFmt = "#,##0";
      if (i === 0) base.parent && [0, 1, 2, 3, 4, 5].forEach((c) => fill(ws.getCell(row, RANK_START_COL + c), LIGHT));
      row++;
    });
    row += 1; // gap between blocks
  }
  // Widen ranking columns.
  [16, 14, 14, 11, 10, 15].forEach((w, i) => {
    const col = ws.getColumn(RANK_START_COL + i);
    if (col.width == null || col.width < w) col.width = w;
  });
}

/**
 * @param {string} filePath   absolute path to rates.xlsx
 * @param {object[]} records  the 8 provider/method records (GME/E9PAY/GMONEY/HANPASS x 2 methods)
 * @param {object|null} sbi   SBI single-rate record (or null if unavailable)
 * @param {Date} dateObj      run timestamp
 */
export async function writeExcel(filePath, records, sbi, dateObj) {
  const wb = new ExcelJS.Workbook();
  if (existsSync(filePath)) {
    try {
      await wb.xlsx.readFile(filePath);
    } catch {
      /* corrupt/locked read — start fresh */
    }
  }

  const sheetName = monthSheetName(dateObj);
  let ws = wb.getWorksheet(sheetName);
  if (!ws) {
    ws = wb.addWorksheet(sheetName);
    buildHeader(ws);
  }

  // ---- Append the two daily rows (Bank Deposit, Mobile Wallet) ----
  let next = lastMainRow(ws) + 1;
  const byMethodForRanking = {};
  for (const m of METHODS) {
    const row = ws.getRow(next);
    const [year, month, day] = todayStr(dateObj).split("-").map(Number);
    row.getCell(1).value = new Date(Date.UTC(year, month - 1, day));
    row.getCell(8).value = timeLabel(dateObj);
    row.getCell(9).value = m.remark;

    const ranking = [];
    for (const [prov, col] of Object.entries(PROVIDER_COL)) {
      const rec = prov === "SBI" ? sbi : records.find((r) => r.provider === prov && r.method === m.key);
      if (!rec) continue;
      row.getCell(col).value = providerTotalCell(rec);
      ranking.push({
        provider: prov === "GME" ? "GME" : prov === "E9PAY" ? "E9pay" : prov === "HANPASS" ? "Hanpass" : prov === "GMONEY" ? "Gmoney" : "SBI",
        total: rec.sendTotalKRW,
        charge: rec.feeKRW, // may be null (SBI)
      });
    }
    byMethodForRanking[m.key] = ranking;
    next++;
  }

  // ---- Refresh ranking block ----
  writeRankingBlock(ws, byMethodForRanking, dateObj);

  // Keep months in chronological tab order is non-trivial; leave as created.
  try {
    await wb.xlsx.writeFile(filePath);
    return { ok: true, sheet: sheetName };
  } catch (err) {
    const locked = err.code === "EBUSY" || err.code === "EPERM";
    return { ok: false, error: locked ? "rates.xlsx is open in Excel — close it and re-run." : err.message };
  }
}
