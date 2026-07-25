// ============================================================
// Exchange Rate Automation — fetches the backend, writes BD/CP base rows,
// then applies fees + Time + the Cambodia ranking block.
//
//   Run from Excel ON THE WEB (fetch needs CORS, which the backend sends).
//   Endpoint: https://rates.navong.xyz/rates  (named Cloudflare tunnel)
// ============================================================

const RATES_URL = "https://rates.navong.xyz/rates";
const RATES_TOKEN = "<YOUR_RATES_TOKEN>";

type Bases = { gme: number | null; e9pay: number | null; hanpass: number | null; gmoney: number | null; sbi: number | null; sentbe: number | null };
type Payload = { date: string; time: string; bankDeposit: Bases; mobileWallet: Bases; sbiAvailable: boolean; partial: boolean };

// Pull live rates and append a Bank Deposit row + a Cash Payment row of BASES.
async function pushLatestRates(sheet: ExcelScript.Worksheet): Promise<void> {
  const res = await fetch(`${RATES_URL}?token=${RATES_TOKEN}`);
  if (!res.ok) { console.log(`❌ Backend HTTP ${res.status}`); return; }
  const data = (await res.json()) as Payload;
  console.log(`Fetched ${data.date} ${data.time}  partial=${data.partial} sbi=${data.sbiAvailable}`);

  const COL = { date: 0, gme: 1, e9pay: 2, hanpass: 3, gmoney: 4, sbi: 5, sentbe: 6, time: 7, remarks: 8 };

  // Read the Remarks column ONCE (avoids per-cell reads in a loop).
  const remarks = sheet.getRange("I5:I304").getValues(); // index 0 == sheet row 5
  let last = 5;
  for (let i = 0; i < remarks.length; i++) {
    const rem = String(remarks[i][0] ?? "").toLowerCase();
    if (rem.includes("bank") || rem.includes("cash")) last = 5 + i;
    else if (5 + i > last + 3) break;
  }
  let next = last + 1;

  const writeRow = (row: number, b: Bases, remark: string) => {
    sheet.getCell(row - 1, COL.date).setValue(data.date);
    const put = (col: number, v: number | null) => { if (v !== null && v !== undefined) sheet.getCell(row - 1, col).setValue(v); };
    put(COL.gme, b.gme);       // GME = final total (left untouched below)
    put(COL.e9pay, b.e9pay);   // others = base principal (fee added below)
    put(COL.hanpass, b.hanpass);
    put(COL.gmoney, b.gmoney);
    put(COL.sbi, b.sbi);       // blank if SBI blocked this run
    sheet.getCell(row - 1, COL.time).setValue(data.time);
    sheet.getCell(row - 1, COL.remarks).setValue(remark);
  };

  writeRow(next, data.bankDeposit, "Bank Deposit");
  writeRow(next + 1, data.mobileWallet, "Cash Payment");
  console.log(`✅ Appended row ${next} (BD) and ${next + 1} (CP)`);
}

async function main(workbook: ExcelScript.Workbook) {

  const sheet = workbook.getActiveWorksheet();

  // ── 0. Pull live rates and append the two new base rows ──────────────────
  await pushLatestRates(sheet);

  // ── 수수료 상수 ───────────────────────────────────────────────
  const FEE: Record<string, { bd: number; cp: number }> = {
    "e9pay":   { bd: 5000, cp: 5000 },
    "hanpass": { bd: 5000, cp: 5000 },
    "gmoney":  { bd: 2500, cp: 4000 },
    "sbi":     { bd: 5000, cp: 5000 },
    "sentbe":  { bd: 1875, cp: 3750 },
  };

  // ── 헬퍼: Time 포맷 정규화 → "AM/PM HH:MM" ───────────────────
  function normalizeTime(raw: string): string {
    if (!raw) return "";
    raw = raw.trim();

    let period = "";
    let timePart = raw;

    const ampmMatch = raw.match(/^(AM|PM)\s*(.+)$/i);
    if (ampmMatch) {
      period = ampmMatch[1].toUpperCase();
      timePart = ampmMatch[2].trim();
    } else {
      const h24Match = raw.match(/^(\d{1,2}):(\d{2})$/);
      if (h24Match) {
        let h = parseInt(h24Match[1]);
        const m = h24Match[2];
        period = h >= 12 ? "PM" : "AM";
        if (h > 12) h -= 12;
        if (h === 0) h = 12;
        return `${period} ${String(h).padStart(2, "0")}:${m}`;
      }
    }

    timePart = timePart.replace(/^:/, "");
    const parts = timePart.split(":");
    if (parts.length < 2) return raw;

    let h = parseInt(parts[0]) || 0;
    const m = parts[parts.length - 1].padStart(2, "0");

    if (!period) {
      period = h >= 12 ? "PM" : "AM";
      if (h > 12) h -= 12;
      if (h === 0) h = 12;
    }

    return `${period} ${String(h).padStart(2, "0")}:${m}`;
  }

  // ── 열 인덱스 (0-based) ───────────────────────────────────────
  const COL = {
    date: 0, gme: 1, e9pay: 2, hanpass: 3,
    gmoney: 4, sbi: 5, sentbe: 6, time: 7, remarks: 8
  };

  // ── 1. 마지막 데이터 행 찾기 — Remarks 열을 한 번에 읽어 루프 ──
  const remarksCol = sheet.getRange("I5:I304").getValues(); // index 0 == row 5
  let lastRow = 5;
  for (let i = 0; i < remarksCol.length; i++) {
    const r = 5 + i;
    const remarks = String(remarksCol[i][0] ?? "").toLowerCase().trim();
    if (remarks.includes("bank") || remarks.includes("cash")) {
      lastRow = r;
    } else if (r > lastRow + 3) break;
  }

  // ── 2. 마지막 BD / CP 행만 찾기 (위에서 읽은 배열 재사용) ─────
  let bdRow = -1, cpRow = -1;
  for (let r = lastRow; r >= 5; r--) {
    const remarks = String(remarksCol[r - 5]?.[0] ?? "").toLowerCase().trim();
    if (remarks.includes("bank") && bdRow === -1) bdRow = r;
    if (remarks.includes("cash") && cpRow === -1) cpRow = r;
    if (bdRow !== -1 && cpRow !== -1) break;
  }

  if (bdRow === -1) {
    console.log("❌ Bank Deposit 행을 찾을 수 없습니다. I열(Remarks)을 확인하세요.");
    return;
  }

  console.log(`마지막 BD row: ${bdRow}, CP row: ${cpRow}`);

  // ── 3. 원본 base 읽기 (행 단위로 한 번에) ───────────────────
  type RateSnapshot = Record<string, number>;

  function readBases(row: number): RateSnapshot {
    // B..G (cols 2..7) + their formulas, read once per row.
    const vals = sheet.getRange(`B${row}:G${row}`).getValues()[0];
    const fmls = sheet.getRange(`B${row}:G${row}`).getFormulas()[0];
    const base = (idx: number): number => {
      const f = String(fmls[idx] ?? "");
      if (f.startsWith("=")) {
        const m = f.match(/=(\d+)/);
        if (m) return parseInt(m[1]);
      }
      return Number(vals[idx]);
    };
    return {
      gme:     Number(vals[0]), // GME: fee 포함 최종값
      e9pay:   base(1),
      hanpass: base(2),
      gmoney:  base(3),
      sbi:     base(4),
      sentbe:  base(5),
    };
  }

  const bdBases = readBases(bdRow);
  const cpBases = cpRow !== -1 ? readBases(cpRow) : null;

  console.log(`BD bases → GME:${bdBases.gme} E9:${bdBases.e9pay} HP:${bdBases.hanpass} GMO:${bdBases.gmoney} SBI:${bdBases.sbi} STB:${bdBases.sentbe}`);

  // ── 4. 마지막 BD/CP 행에만 수수료 + Time 적용 ────────────────
  const opCols = [
    { col: COL.gme,     key: "gme"     },
    { col: COL.e9pay,   key: "e9pay"   },
    { col: COL.hanpass, key: "hanpass" },
    { col: COL.gmoney,  key: "gmoney"  },
    { col: COL.sbi,     key: "sbi"     },
    { col: COL.sentbe,  key: "sentbe"  },
  ];

  function applyFeeAndTime(targetRow: number, feeType: "bd" | "cp", bases: RateSnapshot) {
    for (const op of opCols) {
      if (op.key === "gme") continue; // GME: 이미 fee 포함

      const base = bases[op.key];
      if (!base || isNaN(base)) continue;

      const fee = FEE[op.key][feeType];
      sheet.getCell(targetRow - 1, op.col).setFormula(`=${base}+${fee}`);
    }

    const dateCell = sheet.getCell(targetRow - 1, COL.date);
    if (!dateCell.getValue() && !dateCell.getFormula()) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      dateCell.setValue(`${yyyy}-${mm}-${dd}`);
    }

    const timeCell = sheet.getCell(targetRow - 1, COL.time);
    const timeRaw = String(timeCell.getValue() ?? "").trim();
    let timeToWrite: string;
    if (timeRaw && timeRaw !== "null") {
      timeToWrite = normalizeTime(timeRaw);
    } else {
      const now = new Date();
      let h = now.getHours();
      const m = String(now.getMinutes()).padStart(2, "0");
      const period = h >= 12 ? "PM" : "AM";
      if (h > 12) h -= 12;
      if (h === 0) h = 12;
      timeToWrite = `${period} ${String(h).padStart(2, "0")}:${m}`;
    }
    timeCell.setValue(timeToWrite);
    console.log(`  Time → "${timeToWrite}"`);
    console.log(`✅ [${feeType.toUpperCase()}] Row ${targetRow} 수수료 + Time 적용 완료`);
  }

  applyFeeAndTime(bdRow, "bd", bdBases);
  if (cpRow !== -1 && cpBases) applyFeeAndTime(cpRow, "cp", cpBases);

  // ── 5. Cambodia 최종값 계산 ──────────────────────────────────
  function opToKey(opRaw: string): string {
    const lower = opRaw.toLowerCase().trim();
    if (lower === "gme")     return "gme";
    if (lower === "e9pay")   return "e9pay";
    if (lower === "hanpass") return "hanpass";
    if (lower === "gmoney")  return "gmoney";
    if (lower === "sbi")     return "sbi";
    if (lower === "sentbe")  return "sentbe";
    return lower;
  }

  function getFinalRate(bases: RateSnapshot, opKey: string, feeType: "bd" | "cp"): number {
    const base = bases[opKey];
    if (!base) return 0;
    if (opKey === "gme") return base;
    const fee = FEE[opKey]?.[feeType] ?? 0;
    return base + fee;
  }

  // ── 6. Cambodia 헤더 행 찾기 (L열) — 한 번에 읽기 ────────────
  const lCol = sheet.getRange("L5:L30").getValues(); // index 0 == row 5
  let bdHeaderRow = -1, cpHeaderRow = -1;
  for (let i = 0; i < lCol.length; i++) {
    const lVal = String(lCol[i][0] ?? "").toLowerCase().trim();
    if (lVal.includes("bank") && bdHeaderRow === -1) bdHeaderRow = 5 + i;
    if (lVal.includes("cash") && cpHeaderRow === -1) cpHeaderRow = 5 + i;
  }

  if (bdHeaderRow === -1) {
    console.log("❌ Cambodia 섹션을 찾을 수 없습니다.");
    return;
  }

  // ── 7. Cambodia 블록 업데이트 ────────────────────────────────
  function updateBlock(headerRow: number, bases: RateSnapshot, feeType: "bd" | "cp") {
    type Entry = { op: string; finalRate: number; sc: number };
    const entries: Entry[] = [];

    // operator 이름(M열)을 한 번에 읽기
    const ops = sheet.getRange(`M${headerRow}:M${headerRow + 5}`).getValues();
    for (let i = 0; i < ops.length; i++) {
      const opRaw = String(ops[i][0] ?? "").trim();
      if (!opRaw || opRaw.toLowerCase() === "oparator") continue;

      const key = opToKey(opRaw);
      const finalRate = getFinalRate(bases, key, feeType);
      const sc = key === "gme" ? 5000 : (FEE[key]?.[feeType] ?? 0);

      console.log(`  READ: op="${opRaw}" finalRate=${finalRate}`);
      entries.push({ op: opRaw, finalRate, sc });
    }

    if (entries.length === 0) {
      console.log(`❌ Cambodia 블록(row ${headerRow})에 operator 없음`);
      return;
    }

    entries.sort((a, b) => b.finalRate - a.finalRate);
    const maxRate = entries[0].finalRate;

    console.log(`[${feeType.toUpperCase()}] max rate: ${maxRate}`);

    const OP_COLOR: Record<string, string> = {
      "gme":     "FF0000",
      "e9pay":   "FFFF00",
      "sbi":     "4472C4",
      "gmoney":  "2F75B5",
      "hanpass": "2F75B5",
      "sentbe":  "DDEBF7",
    };

    for (let i = 0; i < entries.length; i++) {
      const r = headerRow + i;
      const e = entries[i];
      const priceGap = maxRate - e.finalRate;
      const key = opToKey(e.op);

      const mCell = sheet.getCell(r - 1, 12);
      mCell.setValue(e.op);
      const color = OP_COLOR[key] ?? "FFFFFF";
      mCell.getFormat().getFill().setColor(`#${color}`);
      mCell.getFormat().getFont().setBold(true);

      sheet.getCell(r - 1, 13).setValue(e.finalRate);                      // N: Rate
      sheet.getCell(r - 1, 14).setValue(e.sc);                             // O: SC
      sheet.getCell(r - 1, 15).setValue(priceGap === 0 ? "" : priceGap);   // P: Gap
      sheet.getCell(r - 1, 16).setFormula(`=N${r}/1000`);                  // Q
      sheet.getCell(r - 1, 17).setFormula(`=N${r}-O${r}`);                 // R

      console.log(`  #${i + 1} ${e.op}: ${e.finalRate} | SC:${e.sc} | gap:${priceGap} | color:#${color}`);
    }
  }

  updateBlock(bdHeaderRow, bdBases, "bd");
  if (cpHeaderRow !== -1 && cpBases) updateBlock(cpHeaderRow, cpBases, "cp");

  console.log("✅ 전체 완료!");
}
