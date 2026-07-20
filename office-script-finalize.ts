// ============================================================
// STEP 2 of 2 — ExchangeRate_Finalize
// Run AFTER you've typed the Sentbe base into col G of the two new rows.
// Reads the last Bank Deposit + Cash Payment rows, applies fees (incl. Sentbe)
// + Time, and rebuilds the Cambodia ranking block.  No fetch, no parameters.
// ============================================================

function main(workbook: ExcelScript.Workbook) {

  const sheet = workbook.getActiveWorksheet();

  // ── 수수료 상수 ───────────────────────────────────────────────
  const FEE: Record<string, { bd: number; cp: number }> = {
    "e9pay":   { bd: 5000, cp: 5000 },
    "hanpass": { bd: 5000, cp: 5000 },
    "gmoney":  { bd: 2500, cp: 4000 },
    "sbi":     { bd: 5000, cp: 5000 },
    "sentbe":  { bd: 1875, cp: 3750 },
  };

  function normalizeTime(raw: string): string {
    if (!raw) return "";
    raw = raw.trim();
    let period = "";
    let timePart = raw;
    const ampmMatch = raw.match(/^(AM|PM)\s*(.+)$/i);
    if (ampmMatch) { period = ampmMatch[1].toUpperCase(); timePart = ampmMatch[2].trim(); }
    else {
      const h24 = raw.match(/^(\d{1,2}):(\d{2})$/);
      if (h24) {
        let h = parseInt(h24[1]); const m = h24[2];
        period = h >= 12 ? "PM" : "AM"; if (h > 12) h -= 12; if (h === 0) h = 12;
        return `${period} ${String(h).padStart(2, "0")}:${m}`;
      }
    }
    timePart = timePart.replace(/^:/, "");
    const parts = timePart.split(":");
    if (parts.length < 2) return raw;
    let h = parseInt(parts[0]) || 0;
    const m = parts[parts.length - 1].padStart(2, "0");
    if (!period) { period = h >= 12 ? "PM" : "AM"; if (h > 12) h -= 12; if (h === 0) h = 12; }
    return `${period} ${String(h).padStart(2, "0")}:${m}`;
  }

  const COL = { date: 0, gme: 1, e9pay: 2, hanpass: 3, gmoney: 4, sbi: 5, sentbe: 6, time: 7, remarks: 8 };

  // ── 1~2. 마지막 BD / CP 행 찾기 (Remarks 한 번 읽기) ──────────
  const remarksCol = sheet.getRange("I5:I304").getValues();
  let lastRow = 5;
  for (let i = 0; i < remarksCol.length; i++) {
    const r = 5 + i;
    const rem = String(remarksCol[i][0] ?? "").toLowerCase().trim();
    if (rem.includes("bank") || rem.includes("cash")) lastRow = r;
    else if (r > lastRow + 3) break;
  }
  let bdRow = -1, cpRow = -1;
  for (let r = lastRow; r >= 5; r--) {
    const rem = String(remarksCol[r - 5]?.[0] ?? "").toLowerCase().trim();
    if (rem.includes("bank") && bdRow === -1) bdRow = r;
    if (rem.includes("cash") && cpRow === -1) cpRow = r;
    if (bdRow !== -1 && cpRow !== -1) break;
  }
  if (bdRow === -1) { console.log("❌ Bank Deposit 행을 찾을 수 없습니다."); return; }
  console.log(`마지막 BD row: ${bdRow}, CP row: ${cpRow}`);

  // ── 3. base 읽기 ────────────────────────────────────────────
  type RateSnapshot = Record<string, number>;
  function readBases(row: number): RateSnapshot {
    const vals = sheet.getRange(`B${row}:G${row}`).getValues()[0];
    const fmls = sheet.getRange(`B${row}:G${row}`).getFormulas()[0];
    const base = (idx: number): number => {
      const f = String(fmls[idx] ?? "");
      if (f.startsWith("=")) { const m = f.match(/=(\d+)/); if (m) return parseInt(m[1]); }
      return Number(vals[idx]);
    };
    return { gme: Number(vals[0]), e9pay: base(1), hanpass: base(2), gmoney: base(3), sbi: base(4), sentbe: base(5) };
  }
  const bdBases = readBases(bdRow);
  const cpBases = cpRow !== -1 ? readBases(cpRow) : null;
  console.log(`BD bases → GME:${bdBases.gme} E9:${bdBases.e9pay} HP:${bdBases.hanpass} GMO:${bdBases.gmoney} SBI:${bdBases.sbi} STB:${bdBases.sentbe}`);

  // ── 4. 수수료 + Time ────────────────────────────────────────
  const opCols = [
    { col: COL.gme, key: "gme" }, { col: COL.e9pay, key: "e9pay" },
    { col: COL.hanpass, key: "hanpass" }, { col: COL.gmoney, key: "gmoney" },
    { col: COL.sbi, key: "sbi" }, { col: COL.sentbe, key: "sentbe" },
  ];
  function applyFeeAndTime(targetRow: number, feeType: "bd" | "cp", bases: RateSnapshot) {
    for (const op of opCols) {
      if (op.key === "gme") continue;
      const base = bases[op.key];
      if (!base || isNaN(base)) continue; // Sentbe still blank → skipped until you fill it
      sheet.getCell(targetRow - 1, op.col).setFormula(`=${base}+${FEE[op.key][feeType]}`);
    }
    const dateCell = sheet.getCell(targetRow - 1, COL.date);
    if (!dateCell.getValue() && !dateCell.getFormula()) {
      const now = new Date();
      dateCell.setValue(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
    }
    const timeCell = sheet.getCell(targetRow - 1, COL.time);
    const timeRaw = String(timeCell.getValue() ?? "").trim();
    let timeToWrite: string;
    if (timeRaw && timeRaw !== "null") timeToWrite = normalizeTime(timeRaw);
    else {
      const now = new Date();
      let h = now.getHours(); const m = String(now.getMinutes()).padStart(2, "0");
      const period = h >= 12 ? "PM" : "AM"; if (h > 12) h -= 12; if (h === 0) h = 12;
      timeToWrite = `${period} ${String(h).padStart(2, "0")}:${m}`;
    }
    timeCell.setValue(timeToWrite);
    console.log(`✅ [${feeType.toUpperCase()}] Row ${targetRow} 적용 완료`);
  }
  applyFeeAndTime(bdRow, "bd", bdBases);
  if (cpRow !== -1 && cpBases) applyFeeAndTime(cpRow, "cp", cpBases);

  // ── 5~7. Cambodia 랭킹 블록 ─────────────────────────────────
  function opToKey(o: string): string { return o.toLowerCase().trim(); }
  function getFinalRate(bases: RateSnapshot, opKey: string, feeType: "bd" | "cp"): number {
    const base = bases[opKey];
    if (!base) return 0;
    if (opKey === "gme") return base;
    return base + (FEE[opKey]?.[feeType] ?? 0);
  }
  const lCol = sheet.getRange("L5:L30").getValues();
  let bdHeaderRow = -1, cpHeaderRow = -1;
  for (let i = 0; i < lCol.length; i++) {
    const lVal = String(lCol[i][0] ?? "").toLowerCase().trim();
    if (lVal.includes("bank") && bdHeaderRow === -1) bdHeaderRow = 5 + i;
    if (lVal.includes("cash") && cpHeaderRow === -1) cpHeaderRow = 5 + i;
  }
  if (bdHeaderRow === -1) { console.log("❌ Cambodia 섹션 없음"); return; }

  function updateBlock(headerRow: number, bases: RateSnapshot, feeType: "bd" | "cp") {
    type Entry = { op: string; finalRate: number; sc: number };
    const entries: Entry[] = [];
    const ops = sheet.getRange(`M${headerRow}:M${headerRow + 5}`).getValues();
    for (let i = 0; i < ops.length; i++) {
      const opRaw = String(ops[i][0] ?? "").trim();
      if (!opRaw || opRaw.toLowerCase() === "oparator") continue;
      const key = opToKey(opRaw);
      entries.push({ op: opRaw, finalRate: getFinalRate(bases, key, feeType), sc: key === "gme" ? 5000 : (FEE[key]?.[feeType] ?? 0) });
    }
    if (entries.length === 0) return;
    entries.sort((a, b) => b.finalRate - a.finalRate);
    const maxRate = entries[0].finalRate;
    const OP_COLOR: Record<string, string> = { "gme": "FF0000", "e9pay": "FFFF00", "sbi": "4472C4", "gmoney": "2F75B5", "hanpass": "2F75B5", "sentbe": "DDEBF7" };
    for (let i = 0; i < entries.length; i++) {
      const r = headerRow + i;
      const e = entries[i];
      const key = opToKey(e.op);
      const mCell = sheet.getCell(r - 1, 12);
      mCell.setValue(e.op);
      mCell.getFormat().getFill().setColor(`#${OP_COLOR[key] ?? "FFFFFF"}`);
      mCell.getFormat().getFont().setBold(true);
      sheet.getCell(r - 1, 13).setValue(e.finalRate);
      sheet.getCell(r - 1, 14).setValue(e.sc);
      sheet.getCell(r - 1, 15).setValue(maxRate - e.finalRate === 0 ? "" : maxRate - e.finalRate);
      sheet.getCell(r - 1, 16).setFormula(`=N${r}/1000`);
      sheet.getCell(r - 1, 17).setFormula(`=N${r}-O${r}`);
    }
  }
  updateBlock(bdHeaderRow, bdBases, "bd");
  if (cpHeaderRow !== -1 && cpBases) updateBlock(cpHeaderRow, cpBases, "cp");

  console.log("✅ 전체 완료!");
}
