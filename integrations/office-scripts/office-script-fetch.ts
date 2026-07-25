// ============================================================
// Add this to the TOP of your existing Exchange Rate Office Script.
//
// It calls the backend, then writes TWO new base-rate rows
// (Bank Deposit + Cash Payment). Your existing logic below then
// reads those bases and applies fees + Time + the ranking block.
//
// IMPORTANT:
//  - Works when you click **Run** in Excel **on the web** (fetch needs CORS,
//    which the backend now sends). Excel desktop fetch support varies.
//  - When run from **Power Automate**, fetch is blocked — use the HTTP
//    connector instead (see POWER-AUTOMATE-SETUP.md).
//  - Replace RATES_URL with your NAMED-tunnel URL once set up; the quick
//    tunnel URL changes on every restart.
// ============================================================

const RATES_URL = "https://rates.navong.xyz/rates";      // stable named-tunnel endpoint
const RATES_TOKEN = "<YOUR_RATES_TOKEN>";  // RATES_TOKEN from .env

type Bases = { gme: number | null; e9pay: number | null; hanpass: number | null; gmoney: number | null; sbi: number | null; sentbe: number | null };
type Payload = { date: string; time: string; bankDeposit: Bases; mobileWallet: Bases; sbiAvailable: boolean; partial: boolean };

async function pushLatestRates(sheet: ExcelScript.Worksheet): Promise<void> {
  const res = await fetch(`${RATES_URL}?token=${RATES_TOKEN}`);
  if (!res.ok) { console.log(`❌ Backend HTTP ${res.status}`); return; }
  const data = (await res.json()) as Payload;
  console.log(`Fetched ${data.date} ${data.time}  partial=${data.partial} sbi=${data.sbiAvailable}`);

  const COL = { date: 0, gme: 1, e9pay: 2, hanpass: 3, gmoney: 4, sbi: 5, sentbe: 6, time: 7, remarks: 8 };

  // Find the last existing data row (scan Remarks for bank/cash); data starts row 5.
  let last = 5;
  for (let r = 5; r <= 300; r++) {
    const rem = String(sheet.getCell(r - 1, COL.remarks).getValue() ?? "").toLowerCase();
    if (rem.includes("bank") || rem.includes("cash")) last = r;
    else if (r > last + 3) break;
  }
  let next = last + 1;

  const writeRow = (row: number, b: Bases, remark: string) => {
    sheet.getCell(row - 1, COL.date).setValue(data.date);
    const put = (col: number, v: number | null) => { if (v !== null && v !== undefined) sheet.getCell(row - 1, col).setValue(v); };
    put(COL.gme, b.gme);       // GME = final total (your code leaves GME as-is)
    put(COL.e9pay, b.e9pay);   // others = base principal (your code adds the fee)
    put(COL.hanpass, b.hanpass);
    put(COL.gmoney, b.gmoney);
    put(COL.sbi, b.sbi);       // blank if SBI was blocked that run
    // sentbe intentionally left blank (not scraped)
    sheet.getCell(row - 1, COL.time).setValue(data.time);
    sheet.getCell(row - 1, COL.remarks).setValue(remark);
  };

  writeRow(next, data.bankDeposit, "Bank Deposit");
  writeRow(next + 1, data.mobileWallet, "Cash Payment");
  console.log(`✅ Appended row ${next} (BD) and ${next + 1} (CP)`);
}

// ── Then change your main signature to async and call it first ──────────────
//
// async function main(workbook: ExcelScript.Workbook) {
//   const sheet = workbook.getActiveWorksheet();
//   await pushLatestRates(sheet);   // ← add this line
//
//   ... your existing fee / Time / ranking code unchanged ...
// }
