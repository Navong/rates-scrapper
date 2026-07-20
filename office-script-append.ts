// ============================================================
// STEP 1 of 2 — ExchangeRate_Append
// Fetches the backend and appends TWO new rows (Bank Deposit + Cash Payment)
// with BASE values. Sentbe (col G) is left BLANK for you to fill in manually.
// No fees / no ranking here — that's step 2 (ExchangeRate_Finalize).
//
//   Run from Excel ON THE WEB (needs fetch + CORS, both enabled).
// ============================================================

const RATES_URL = "https://rates.navong.xyz/rates";
const RATES_TOKEN = "<YOUR_RATES_TOKEN>";

type Bases = { gme: number | null; e9pay: number | null; hanpass: number | null; gmoney: number | null; sbi: number | null; sentbe: number | null };
type Payload = { date: string; time: string; bankDeposit: Bases; mobileWallet: Bases; sbiAvailable: boolean; partial: boolean };

async function main(workbook: ExcelScript.Workbook) {
  const sheet = workbook.getActiveWorksheet();

  const res = await fetch(`${RATES_URL}?token=${RATES_TOKEN}`);
  if (!res.ok) { console.log(`❌ Backend HTTP ${res.status}`); return; }
  const data = (await res.json()) as Payload;
  console.log(`Fetched ${data.date} ${data.time}  partial=${data.partial} sbi=${data.sbiAvailable}`);

  const COL = { date: 0, gme: 1, e9pay: 2, hanpass: 3, gmoney: 4, sbi: 5, sentbe: 6, time: 7, remarks: 8 };

  // Find the last existing data row (read Remarks column once).
  const remarks = sheet.getRange("I5:I304").getValues(); // index 0 == row 5
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
    put(COL.gme, b.gme);       // GME = final total
    put(COL.e9pay, b.e9pay);   // base principal (fee added in step 2)
    put(COL.hanpass, b.hanpass);
    put(COL.gmoney, b.gmoney);
    put(COL.sbi, b.sbi);       // blank if SBI was blocked this run
    // col G (sentbe) intentionally left blank — you fill it in manually
    sheet.getCell(row - 1, COL.time).setValue(data.time);
    sheet.getCell(row - 1, COL.remarks).setValue(remark);
  };

  writeRow(next, data.bankDeposit, "Bank Deposit");
  writeRow(next + 1, data.mobileWallet, "Cash Payment");
  console.log(`✅ Appended row ${next} (BD) and ${next + 1} (CP). Now type Sentbe into col G, then run ExchangeRate_Finalize.`);
}
