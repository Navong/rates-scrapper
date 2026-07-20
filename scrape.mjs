// Remittance exchange-rate scraper — KR → Cambodia (USD), receive 1000 USD.
//
// Compares two providers by hitting their live calculator APIs directly:
//
//   GME Remit (gmeremit.com)
//     POST /api/exchange-rate  — JSON body, JSON response.
//   E9PAY (e9pay.co.kr)         <-- competitor
//     POST /cmm/calcExchangeRate.do — form body, JSON-in-JSON response.
//   GMONEY (gmoneytrans.com)    <-- competitor
//     GET  mapi.gmoneytrans.net/exratenew1/ajx_calcRate.asp — delimited text.
//   HANPASS (hanpass.com)       <-- competitor
//     POST app.hanpass.com/app/v1/remittance/get-cost — JSON body/response.
//   SBI COSMONEY (sbicosmoney.com) <-- competitor
//     POST /calc/amount — needs session cookie + CSRF token from the homepage.
//     NOTE: behind Cloudflare anti-bot; may return a "System Maintenance" page
//     to non-browser requests. Handled gracefully (reported as unavailable).
//
// Fixed inputs on EVERY scrape: Cambodia / USD / receive 1000 USD, for the
// bank-deposit and mobile-wallet payout methods of each provider.
//
// Usage:
//   node scrape.mjs            # print comparison + append rows to rates.csv
//   node scrape.mjs --json     # print raw API responses

const RECEIVE_USD = "1000";

// --- Provider configs --------------------------------------------------------

const GME = {
  name: "GME",
  endpoint: "https://www.gmeremit.com/api/exchange-rate",
  // GME differentiates the rate per payout method.
  methods: [
    { type: "BANK DEPOSIT", deliveryMethod: "2" },   // 계좌 입금
    { type: "MOBILE WALLET", deliveryMethod: "13" }, // 모바일 월렛
  ],
};

const E9PAY = {
  name: "E9PAY",
  endpoint: "https://www.e9pay.co.kr/cmm/calcExchangeRate.do",
  // remitNation = the method-specific receiver code; fee is fixed per method.
  methods: [
    { type: "BANK DEPOSIT", remitNation: "KH09", fee: 5000 },  // ABA 계좌송금(USD)
    { type: "MOBILE WALLET", remitNation: "KH04", fee: 5000 }, // WING 모바일 월렛
  ],
};

const GMONEY = {
  name: "GMONEY",
  endpoint: "https://mapi.gmoneytrans.net/exratenew1/ajx_calcRate.asp",
  // GMONEY uses descriptive method names; fee comes back in the response.
  methods: [
    { type: "BANK DEPOSIT", payment_type: "Bank Account" },
    { type: "MOBILE WALLET", payment_type: "Wing Account" }, // Wing wallet
  ],
};

const HANPASS = {
  name: "HANPASS",
  endpoint: "https://app.hanpass.com/app/v1/remittance/get-cost",
  methods: [
    { type: "BANK DEPOSIT", remittanceOption: "BANK_TRANSFER" },
    { type: "MOBILE WALLET", remittanceOption: "MOBILE_WALLET" },
  ],
};

// SBI gives a single mid-rate per country (no payout-method split, no fee in
// the calculator). We fetch it once and report it for both method rows.
const SBI = {
  name: "SBI",
  home: "https://www.sbicosmoney.com/?lang=en",
  endpoint: "https://www.sbicosmoney.com/calc/amount",
  countryId: "CAMBODIA",
  currency: "USD",
};

function toNumber(s) {
  return Number(String(s ?? "").replace(/,/g, ""));
}

// --- Fetchers: each returns a normalized record ------------------------------

async function fetchGme(method) {
  const { gmeFetch } = await import("./limiter.mjs"); // shared throttle + 429 retry
  const d = await gmeFetch(GME.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      Referer: "https://www.gmeremit.com/",
    },
    body: JSON.stringify({
      pCurr: "USD",
      pCountryName: "Cambodia",
      cAmt: "",
      pAmt: RECEIVE_USD,
      deliveryMethod: method.deliveryMethod,
      calBy: "P",
    }),
  });
  if (String(d.errorCode) !== "0") throw new Error(`GME error ${d.errorCode}: ${d.msg ?? ""}`);

  const sendTotal = toNumber(d.collAmt); // includes fee
  const fee = toNumber(d.scCharge);
  return {
    provider: GME.name,
    method: method.type,
    krwPerUsd: Number((toNumber(d.exRate) ? 1 / toNumber(d.exRate) : 0).toFixed(2)),
    principalKRW: sendTotal - fee,
    feeKRW: fee,
    sendTotalKRW: sendTotal,
    _raw: d,
  };
}

async function fetchE9pay(method) {
  const body = new URLSearchParams({
    DEFRAY_AMOUNT: RECEIVE_USD,
    SEND_NATN_COD: method.remitNation, // reverse mode: enter USD receive → get KRW
    CRNCY_COD: "USD",
    RCVER_EXPECT_NATN_COD: "KR",
    RCVER_EXPECT_CRNCY_COD: "KRW",
    SIMULATION_YN: "Y",
    OVSE_FEE_PROMOTION_YN: "N",
    TOGGLE: "",
    LANG_COD: "",
  });
  const res = await fetch(E9PAY.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      Referer: "https://www.e9pay.co.kr/",
    },
    body,
  });
  if (!res.ok) throw new Error(`E9PAY HTTP ${res.status}`);
  const outer = await res.json();
  if (outer.responseCode !== "S") throw new Error(`E9PAY error: ${outer.responseMsg ?? ""}`);
  const d = JSON.parse(outer.data);

  const principal = toNumber(d.DEFRAY_AMOUNT); // converted KRW, excludes remit fee
  const fee = method.fee;                       // fixed per method (page attribute)
  return {
    provider: E9PAY.name,
    method: method.type,
    krwPerUsd: toNumber(d.APPLC_EHGT),
    principalKRW: principal,
    feeKRW: fee,
    sendTotalKRW: principal + fee,
    _raw: d,
  };
}

async function fetchGmoney(method) {
  const qs = new URLSearchParams({
    receive_amount: RECEIVE_USD, // calc by receive amount → leave total_collected empty
    payout_country: "Cambodia",
    total_collected: "",
    payment_type: method.payment_type,
    currencyType: "USD",
  });
  const res = await fetch(`${GMONEY.endpoint}?${qs}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      Referer: "https://mapi.gmoneytrans.net/exratenew1/Default.asp?country=cambodia",
    },
  });
  if (!res.ok) throw new Error(`GMONEY HTTP ${res.status}`);
  const text = await res.text();

  // Response tail format: KEY--td_clm--VALUE--td_end-- repeated.
  const fields = {};
  for (const m of text.matchAll(/([A-Za-z]+)--td_clm--(.*?)--td_end--/g)) {
    fields[m[1]] = m[2];
  }
  if (!fields.exchangeRate) throw new Error("GMONEY: no rate in response");

  const principal = toNumber(fields.sendAmount); // KRW, excludes service charge
  const fee = toNumber(fields.serviceCharge);
  return {
    provider: GMONEY.name,
    method: method.type,
    krwPerUsd: Number((toNumber(fields.exchangeRate) ? 1 / toNumber(fields.exchangeRate) : 0).toFixed(2)),
    principalKRW: principal,
    feeKRW: fee,
    sendTotalKRW: principal + fee,
    _raw: fields,
  };
}

async function fetchHanpass(method) {
  // "calc by receive amount": inputCurrencyCode = USD, toCurrencyCode = KRW.
  const res = await fetch(HANPASS.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "en",
      Accept: "*/*",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
    body: JSON.stringify({
      inputAmount: RECEIVE_USD,
      inputCurrencyCode: "USD",
      fromCurrencyCode: "KRW",
      toCurrencyCode: "KRW",
      toCountryCode: "KH",
      memberSeq: "1",
      remittanceOption: method.remittanceOption,
      lang: "en",
    }),
  });
  if (!res.ok) throw new Error(`HANPASS HTTP ${res.status}`);
  const d = await res.json();
  if (d.resultCode !== "0") throw new Error(`HANPASS error: ${d.resultMessage ?? ""}`);

  return {
    provider: HANPASS.name,
    method: method.type,
    krwPerUsd: Number(toNumber(d.reverseExchangeRate).toFixed(2)),
    principalKRW: toNumber(d.depositAmount),
    feeKRW: toNumber(d.transferFee),
    sendTotalKRW: toNumber(d.depositAmountIncludingFee),
    _raw: d,
  };
}

// Returns ONE normalized record (rate only), or null if unavailable.
async function fetchSbi() {
  // Step 1: load homepage to get the JSESSIONID cookie + CSRF token.
  const homeRes = await fetch(SBI.home, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  });
  const setCookies = homeRes.headers.getSetCookie?.() ?? [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  const html = await homeRes.text();
  const xsrf =
    (cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] ||
    (html.match(/name=['"]_csrf['"][^>]*content=['"]([^'"]+)/) || [])[1];

  // Step 2: POST the calculator endpoint.
  const res = await fetch(SBI.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      ...(xsrf ? { "X-XSRF-TOKEN": xsrf } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      deviceId: "",
      device: "",
      os: "",
      hardware1: "",
      hardware2: "",
      Origin: "https://www.sbicosmoney.com",
      Referer: SBI.home,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
    body: JSON.stringify({
      countryId: SBI.countryId,
      currency: SBI.currency,
      osInfo: "Mozilla/5.0",
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // Anti-bot / maintenance HTML instead of JSON.
    return null;
  }
  const rate = toNumber(data.exchangeRate);
  if (!rate) return null;

  return {
    provider: SBI.name,
    krwPerUsd: Number(rate.toFixed(2)),
    principalKRW: Math.round(toNumber(RECEIVE_USD) * rate), // 1000 USD worth of KRW
    feeKRW: null,                                           // not exposed in calculator
    sendTotalKRW: Math.round(toNumber(RECEIVE_USD) * rate), // no fee available
    _raw: data,
  };
}

// --- Reusable collector (used by CLI, Excel writer, and HTTP backend) ---------

/**
 * Fetch all providers resiliently — one provider failing does NOT fail the rest.
 * Returns { timestamp, meta, records, sbi, errors }.
 */
export async function collectRates() {
  const timestamp = new Date().toISOString();
  const meta = { timestamp, country: "Cambodia", currency: "USD", receiveUSD: toNumber(RECEIVE_USD) };

  const jobs = [
    ...GME.methods.map((m) => ({ who: `GME/${m.type}`, p: fetchGme(m) })),
    ...E9PAY.methods.map((m) => ({ who: `E9PAY/${m.type}`, p: fetchE9pay(m) })),
    ...GMONEY.methods.map((m) => ({ who: `GMONEY/${m.type}`, p: fetchGmoney(m) })),
    ...HANPASS.methods.map((m) => ({ who: `HANPASS/${m.type}`, p: fetchHanpass(m) })),
  ];

  const settled = await Promise.allSettled(jobs.map((j) => j.p));
  const records = [];
  const errors = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") records.push({ ...meta, ...s.value });
    else errors.push({ who: jobs[i].who, error: String(s.reason?.message ?? s.reason) });
  });

  // SBI: single rate; commonly blocked on datacenter IPs (returns null then).
  let sbi = null;
  try {
    sbi = await fetchSbi();
  } catch (e) {
    errors.push({ who: "SBI", error: String(e?.message ?? e) });
  }

  return { timestamp, meta, records, sbi, errors };
}

function ampmTime(d) {
  let h = d.getHours();
  const ampm = h < 12 ? "AM" : "PM";
  h = h % 12 || 12;
  return `${ampm} ${String(h).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Build the "base values" payload the Office Script expects per BD/CP row.
 * GME = final total (fee already in it); others = base principal; SBI = principal;
 * Sentbe = null (not scraped). The "mobileWallet" set feeds the Cash Payment row.
 */
export function buildBasesPayload({ timestamp, records, sbi, errors = [] }) {
  const d = new Date(timestamp);
  const baseFor = (method) => {
    const get = (prov) => records.find((r) => r.provider === prov && r.method === method);
    return {
      gme: get("GME")?.sendTotalKRW ?? null,        // GME total incl. its fee
      e9pay: get("E9PAY")?.principalKRW ?? null,    // base principal (script adds fee)
      hanpass: get("HANPASS")?.principalKRW ?? null,
      gmoney: get("GMONEY")?.principalKRW ?? null,
      sbi: sbi?.principalKRW ?? null,               // single rate, same both rows
      sentbe: null,                                  // not scraped
    };
  };
  return {
    date: d.toISOString().slice(0, 10),
    time: ampmTime(d),
    receiveUSD: toNumber(RECEIVE_USD),
    bankDeposit: baseFor("BANK DEPOSIT"),  // → "Bank Deposit" row
    mobileWallet: baseFor("MOBILE WALLET"), // → "Cash Payment" row (CP fees applied by script)
    sbiAvailable: !!sbi,
    partial: errors.length > 0,            // true if any provider failed this run
    failed: errors,                        // [{ who, error }]
  };
}

// --- Main --------------------------------------------------------------------

async function main() {
  if (process.argv.includes("--payload")) {
    console.log(JSON.stringify(buildBasesPayload(await collectRates()), null, 2));
    return;
  }

  const { timestamp, meta, records, sbi } = await collectRates();
  const sbiRecord = sbi ? { ...meta, method: "ALL", ...sbi } : null;

  if (process.argv.includes("--json")) {
    const all = sbiRecord ? [...records, sbiRecord] : records;
    console.log(JSON.stringify(all.map(({ _raw, ...r }) => ({ ...r, _raw })), null, 2));
    return;
  }

  // Comparison table: lower sendTotalKRW = cheaper (better for the sender).
  console.log(`\nKR → Cambodia · receive ${toNumber(RECEIVE_USD).toLocaleString()} USD   (${timestamp})\n`);
  console.log("provider  method         1 USD (KRW)   send incl. fee (KRW)   fee");
  console.log("--------  -------------  -----------   --------------------   -----");
  for (const m of ["BANK DEPOSIT", "MOBILE WALLET"]) {
    const rows = records.filter((r) => r.method === m).sort((a, b) => a.sendTotalKRW - b.sendTotalKRW);
    for (const r of rows) {
      const best = r === rows[0] ? " ◀ cheaper" : "";
      console.log(
        `${r.provider.padEnd(8)}  ${r.method.padEnd(13)}  ${r.krwPerUsd.toLocaleString().padStart(9)}   ${r.sendTotalKRW.toLocaleString().padStart(18)}   ${r.feeKRW.toLocaleString().padStart(5)}${best}`
      );
    }
    console.log("");
  }

  // SBI shown separately: single mid-rate, fee not exposed → not cost-rankable.
  if (sbiRecord) {
    console.log(`SBI       (single rate)  ${sbiRecord.krwPerUsd.toLocaleString().padStart(9)}   ${"fee n/a — rate only".padStart(18)}`);
  } else {
    console.log("SBI       (single rate)  unavailable (Cloudflare anti-bot / maintenance from this network)");
  }
  console.log("");

  // Append to CSV log
  const fs = await import("node:fs");
  const path = new URL("./rates.csv", import.meta.url);
  const header = "timestamp,provider,country,currency,method,receiveUSD,krwPerUsd,principalKRW,feeKRW,sendTotalKRW\n";
  if (!fs.existsSync(path)) fs.writeFileSync(path, header);
  const csvRows = sbiRecord ? [...records, sbiRecord] : records;
  for (const r of csvRows) {
    fs.appendFileSync(
      path,
      [r.timestamp, r.provider, r.country, r.currency, r.method, r.receiveUSD, r.krwPerUsd, r.principalKRW, r.feeKRW ?? "", r.sendTotalKRW].join(",") + "\n"
    );
  }

  // Write Excel workbook in the "Exchange rate (Daily)" monthly format.
  const { writeExcel } = await import("./xlsx-writer.mjs");
  const xlsxPath = new URL("./rates.xlsx", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const res = await writeExcel(xlsxPath, records, sbi, new Date(timestamp));
  console.log(res.ok ? `✓ rates.xlsx updated (sheet "${res.sheet}")` : `⚠ Excel not written: ${res.error}`);
}

// Only run when invoked directly (not when imported by server.mjs).
// Portable across Node versions (doesn't rely on import.meta.main).
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
let isMain = false;
try {
  isMain = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
} catch {
  isMain = false;
}
if (isMain) {
  main().catch((err) => {
    console.error("Scrape failed:", err.message);
    process.exit(1);
  });
}
