// Country-aware provider fetchers.
// Every fetcher resolves to a uniform record:
//   { provider, method, principalKRW, feeKRW, sendTotalKRW, rate }
// where sendTotalKRW = principalKRW + feeKRW  (total KRW to send for the
// country's fixed receive amount).

import { gmeFetch, limited } from "./limiter";
import { amountFor, providerInMethod } from "./countries";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The 2-step anti-bot scrapers (SBI, Coinshot) occasionally serve a bot page or
// blip on a single call. A couple of quick retries turns those transient misses
// into a success instead of dropping the provider for the whole run.
async function withRetry(fn, attempts = 2, delay = 700) {
  let last;
  for (let i = 0; i <= attempts; i++) {
    try { return await fn(); }
    catch (e) { last = e; if (i < attempts) await sleep(delay); }
  }
  throw last;
}

const num = (s) => Number(String(s ?? "").replace(/,/g, ""));
const rec = (provider, method, principalKRW, feeKRW, rate, _raw) => ({
  provider, method,
  principalKRW: Math.round(principalKRW),
  feeKRW: Math.round(feeKRW),
  sendTotalKRW: Math.round(principalKRW) + Math.round(feeKRW),
  rate, _raw,
});

// Every fetcher shares this key so the governor can dedupe/memo per request.
// `key` is the provider/channel key (a corridor may have several channels of the
// same api, e.g. HANPASS_WU + HANPASS_CB), so it must be part of the memo key.
const K = (country, key, mkey) => `${country.code}|${key}|${mkey}`;

// ---------- GME ----------
// Fetchers take the provider KEY so one api can back multiple channels; `cfg` and
// the record's provider are read from that key. Defaults keep single-provider
// corridors working unchanged.
export async function fetchGme(country, mkey, opts, key = "GME") {
  const cfg = country.providers[key];
  const d = await gmeFetch("https://www.gmeremit.com/api/exchange-rate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, Referer: "https://www.gmeremit.com/" },
    body: JSON.stringify({
      pCurr: country.currency, pCountryName: cfg.countryName, cAmt: "",
      pAmt: String(amountFor(country, mkey)), deliveryMethod: cfg.deliveryMethod[mkey], calBy: "P",
    }),
  }, opts);
  if (String(d.errorCode) !== "0") throw new Error(`GME error ${d.errorCode}: ${d.msg ?? ""}`);
  const total = num(d.collAmt), fee = num(d.scCharge);
  return rec(key, mkey, total - fee, fee, num(d.exRate), d);
}

// ---------- E9PAY ----------
export function fetchE9pay(country, mkey, opts, key = "E9PAY") {
  return limited("E9PAY", K(country, key, mkey), () => e9payCall(country, mkey, key), opts);
}
async function e9payCall(country, mkey, key = "E9PAY") {
  const cfg = country.providers[key];
  const body = new URLSearchParams({
    DEFRAY_AMOUNT: String(amountFor(country, mkey)),
    SEND_NATN_COD: cfg.nation[mkey],       // reverse mode: enter receive → get KRW
    CRNCY_COD: country.currency,
    RCVER_EXPECT_NATN_COD: "KR", RCVER_EXPECT_CRNCY_COD: "KRW",
    SIMULATION_YN: "Y", OVSE_FEE_PROMOTION_YN: "N", TOGGLE: "", LANG_COD: "",
  });
  const res = await fetch("https://www.e9pay.co.kr/cmm/calcExchangeRate.do", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest", "User-Agent": UA, Referer: "https://www.e9pay.co.kr/",
    },
    body,
  });
  if (!res.ok) throw new Error(`E9PAY HTTP ${res.status}`);
  const outer = await res.json();
  if (outer.responseCode !== "S") throw new Error(`E9PAY error: ${outer.responseMsg ?? ""}`);
  const d = JSON.parse(outer.data);
  return rec(key, mkey, num(d.DEFRAY_AMOUNT), cfg.fee[mkey], num(d.APPLC_EHGT), d);
}

// ---------- HANPASS ----------
export function fetchHanpass(country, mkey, opts, key = "HANPASS") {
  return limited("HANPASS", K(country, key, mkey), () => hanpassCall(country, mkey, key), opts);
}
async function hanpassCall(country, mkey, key = "HANPASS") {
  const cfg = country.providers[key];
  const res = await fetch("https://app.hanpass.com/app/v1/remittance/get-cost", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept-Language": "en", Accept: "*/*", "User-Agent": UA },
    body: JSON.stringify({
      inputAmount: String(amountFor(country, mkey)), inputCurrencyCode: country.currency,
      fromCurrencyCode: "KRW", toCurrencyCode: "KRW", toCountryCode: cfg.countryCode,
      memberSeq: "1", remittanceOption: cfg.option[mkey], lang: "en",
    }),
  });
  if (!res.ok) throw new Error(`HANPASS HTTP ${res.status}`);
  const d = await res.json();
  if (d.resultCode !== "0") throw new Error(`HANPASS error: ${d.resultMessage ?? ""}`);
  return rec(key, mkey, num(d.depositAmount), num(d.transferFee), num(d.reverseExchangeRate), d);
}

// ---------- GMONEY ----------
export function fetchGmoney(country, mkey, opts, key = "GMONEY") {
  return limited("GMONEY", K(country, key, mkey), () => gmoneyCall(country, mkey, key), opts);
}
async function gmoneyCall(country, mkey, key = "GMONEY") {
  const cfg = country.providers[key];
  const qs = new URLSearchParams({
    receive_amount: String(amountFor(country, mkey)), payout_country: cfg.country,
    total_collected: "", payment_type: cfg.payment[mkey], currencyType: country.currency,
  });
  // Country names can contain spaces ("Sri Lanka") — must be encoded in the Referer.
  const ref = `https://mapi.gmoneytrans.net/exratenew1/Default.asp?country=${encodeURIComponent(cfg.country.toLowerCase())}`;
  const res = await fetch(`https://mapi.gmoneytrans.net/exratenew1/ajx_calcRate.asp?${qs}`, {
    headers: { "User-Agent": UA, Referer: ref },
  });
  if (!res.ok) throw new Error(`GMONEY HTTP ${res.status}`);
  const text = await res.text();
  const f = {};
  for (const m of text.matchAll(/([A-Za-z]+)--td_clm--(.*?)--td_end--/g)) f[m[1]] = m[2];
  if (!f.exchangeRate) throw new Error("GMONEY: no rate in response");
  return rec(key, mkey, num(f.sendAmount), num(f.serviceCharge), num(f.exchangeRate), f);
}

// ---------- SBI (single mid-rate, no fee) ----------
export function fetchSbi(country, opts, key = "SBI") {
  // SBI occasionally serves an anti-bot page; a few spaced retries (fresh cookie
  // each time) clear most transient blocks. Stays well under JOB_TIMEOUT.
  return limited("SBI", K(country, key, "ALL"), () => withRetry(() => sbiCall(country, key), 3, 1200), opts);
}
async function sbiCall(country, key = "SBI") {
  const cfg = country.providers[key];
  const home = "https://www.sbicosmoney.com/?lang=en";
  const hr = await fetch(home, { headers: { "User-Agent": UA } });
  const cookie = (hr.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const html = await hr.text();
  const xsrf = (cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || (html.match(/name=['"]_csrf['"][^>]*content=['"]([^'"]+)/) || [])[1];

  const res = await fetch("https://www.sbicosmoney.com/calc/amount", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      ...(xsrf ? { "X-XSRF-TOKEN": xsrf } : {}), ...(cookie ? { Cookie: cookie } : {}),
      deviceId: "", device: "", os: "", hardware1: "", hardware2: "",
      Origin: "https://www.sbicosmoney.com", Referer: home, "User-Agent": UA,
    },
    body: JSON.stringify({ countryId: cfg.countryId, currency: country.currency, osInfo: "Mozilla/5.0" }),
  });
  const text = await res.text();
  let d;
  try { d = JSON.parse(text); } catch { throw new Error("SBI blocked (anti-bot page)"); }
  const rate = num(d.exchangeRate); // KRW per unit of receive currency
  if (!rate) throw new Error("SBI: no rate");
  return rec(key, "ALL", country.receiveAmount * rate, 0, rate, d);
}

// ---------- COINSHOT ----------
export function fetchCoinshot(country, opts, key = "COINSHOT") {
  return limited("COINSHOT", K(country, key, "BANK"), () => withRetry(() => coinshotCall(country, key)), opts);
}
async function coinshotCall(country, key = "COINSHOT") {
  const home = "https://coinshot.org/main";
  const hr = await fetch(home, { headers: { "User-Agent": UA } });
  const cookie = (hr.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const html = await hr.text();
  const csrf = (html.match(/name="_csrf"[^>]*content="([^"]+)"/) || html.match(/content="([^"]+)"[^>]*name="_csrf"/) || [])[1];
  const hdr = (html.match(/name="_csrf_header"[^>]*content="([^"]+)"/) || [])[1] || "X-CSRF-TOKEN";

  const res = await fetch("https://coinshot.org/calculate/sending", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      ...(csrf ? { [hdr]: csrf } : {}), ...(cookie ? { Cookie: cookie } : {}),
      Referer: home, "User-Agent": UA,
    },
    body: new URLSearchParams({
      receivingAmount: String(country.receiveAmount),
      sendingCurrency: "KRW", receivingCurrency: country.currency,
    }),
  });
  if (!res.ok) throw new Error(`COINSHOT HTTP ${res.status}`);
  const d = await res.json();
  if (!d.fromAmount) throw new Error("COINSHOT: no fromAmount");
  const fee = num(d.coinshotFee) || num(d.fromFee) || 0;
  return rec(key, "BANK", num(d.fromAmount), fee, num(d.rate), d);
}

// ---------- UTRANSFER (single rate per currency) ----------
export function fetchUtransfer(country, opts, key = "UTRANSFER") {
  return limited("UTRANSFER", K(country, key, "ALL"), () => utransferCall(country, key), opts);
}
async function utransferCall(country, key = "UTRANSFER") {
  // /api/v1/common/fee_calculate is public and lists every currency's rate.
  const res = await fetch("https://www.utransfer.com/api/v1/common/fee_calculate", {
    headers: { Accept: "application/json", Referer: "https://www.utransfer.com/", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`UTRANSFER HTTP ${res.status}`);
  const j = await res.json();
  const row = (j.data || []).find((x) => x.code === country.currency);
  if (!row?.ex_rate) throw new Error(`UTRANSFER: ${country.currency} not offered`);
  const rate = Number(row.ex_rate); // KRW per unit of receive currency
  return rec(key, "ALL", country.receiveAmount * rate, Number(row.fee_amount) || 0, rate, row);
}

// ---------- PANDA (single rate per currency; pandaRate = target ccy per 1 KRW) ----------
export function fetchPanda(country, opts, key = "PANDA") {
  return limited("PANDA", K(country, key, "ALL"), () => pandaCall(country, key), opts);
}
async function pandaCall(country, key = "PANDA") {
  const res = await fetch(`https://prod.pandaremit.com/pricing/rate/KRW/${country.currency}`, {
    headers: { Accept: "application/json", Referer: "https://www.pandaremit.com/", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`PANDA HTTP ${res.status}`);
  const j = await res.json();
  const rate = Number(j.model?.pandaRate); // receive-currency per 1 KRW (the rate the calculator uses)
  if (!rate) throw new Error(`PANDA: ${country.currency} not offered`);
  return rec(key, "ALL", country.receiveAmount / rate, 0, 1 / rate, j.model);
}

// ---------- JRF ----------
export function fetchJrf(country, mkey, opts, key = "JRF") {
  return limited("JRF", K(country, key, mkey), () => jrfCall(country, mkey, key), opts);
}
async function jrfCall(country, mkey, key = "JRF") {
  const cfg = country.providers[key];
  const res = await fetch("https://www.jpremit.co.kr/default.aspx/calcfee", { // lowercase path required
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest",
      Referer: "https://www.jpremit.co.kr/", "User-Agent": UA,
    },
    body: JSON.stringify({
      sendmoney: "1000000", receiveMoney: 0,
      type: cfg.type[mkey], country: country.currency, id: "display",
    }),
  });
  if (!res.ok) throw new Error(`JRF HTTP ${res.status}`);
  const j = await res.json();
  const d = j.d;
  if (!d || !d.customer_rate) throw new Error("JRF: no rate");
  const rate = Number(d.customer_rate);          // receive-currency per KRW
  const principal = amountFor(country, mkey) / rate; // KRW needed to buy the receive amount
  return rec(key, mkey, principal, Number(d.ServiceFee), rate, d);
}

// ---------- CROSS ----------
// Public quote API (crossenf.com). The receive-mode quote returns `service_rate`
// = KRW per `rateUnit` units of the payout currency (rateUnit is the "100" in a
// "100 VND" rate_currency, else 1). Cross quotes ONE rate for the whole corridor
// (bank == wallet == cash), so it's a SINGLE_RATE provider mirrored onto every
// method.
//
// `includeBonus` picks WHICH price we publish, because Cross advertises a
// standing first-transfer bonus (`topup_amount`, e.g. +100,000 VND):
//   true  → the API's own `sending_amount`, i.e. the exact number a visitor sees
//           on crossenf.com. Spot-checks against the website match.
//   false → derived from service_rate, i.e. the standard rate a repeat customer
//           pays — comparable with peers (GME/E9pay) that run no promo.
// Default is `true`: the sheet is competitor intel that gets screenshotted, so it
// must agree with the competitor's public site. Flip per corridor in countries.mjs.
export function fetchCross(country, opts, key = "CROSS") {
  return limited("CROSS", `${country.code}|${key}`, () => crossCall(country, key), opts);
}
async function crossCall(country, key = "CROSS") {
  const cfg = country.providers[key];
  const mkey = country.methods[0].key;
  const recv = amountFor(country, mkey);
  const qs = new URLSearchParams({
    platform_id: String(cfg.platform), quote_type: "receive",
    sending_amount: "0", receiving_amount: String(recv),
    use_max_point: "true", deposit_type: "Manual", apply_user_limit: "0", is_home: "0",
  });
  const res = await fetch(`https://crossenf.com/v2/outbound/quote/?${qs}`, {
    headers: { "User-Agent": UA, Referer: "https://crossenf.com/remittance", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`CROSS HTTP ${res.status}`);
  const j = await res.json();
  if (Number(j.error_code) !== 0 || !j.data) throw new Error(`CROSS error: ${j.error || j.error_code}`);
  const rate = Number(j.data.service_rate); // KRW per `rateUnit` units of payout currency
  if (!rate) throw new Error("CROSS: no rate");
  // Website price (bonus applied) vs standard rate — see the note above.
  const bonusPrice = Number(j.data.sending_amount);
  const listPrice = recv * rate / (cfg.rateUnit || 1);
  const useBonus = cfg.includeBonus !== false;
  if (useBonus && !bonusPrice) throw new Error("CROSS: no sending_amount");
  return rec(key, mkey, useBonus ? bonusPrice : listPrice, cfg.fee?.[mkey] ?? (Number(j.data.fee) || 0), rate, j.data);
}

// ---------- Orchestrator ----------
// Providers that quote a rate per payout method.
const PER_METHOD = { GME: fetchGme, E9PAY: fetchE9pay, HANPASS: fetchHanpass, GMONEY: fetchGmoney, JRF: fetchJrf };
// Providers with ONE rate for the whole corridor — fetched once, mirrored onto
// every service so they appear in each table.
const SINGLE_RATE = { SBI: fetchSbi, COINSHOT: fetchCoinshot, UTRANSFER: fetchUtransfer, PANDA: fetchPanda, CROSS: fetchCross };

/**
 * Apply the country's fixed fee table. When a country declares a fee for a
 * provider/method it always wins over whatever the provider's API returned, and
 * the total is recomputed from the exchange principal.
 */
function applyFee(country, r) {
  const provider = country.providers[r.provider];
  // Some APIs return the exact business-table total without exposing a
  // separate fee. Keep that total intact while displaying a zero fee.
  if (provider?.totalIncludesFee) {
    return { ...r, principalKRW: r.sendTotalKRW, feeKRW: 0 };
  }
  const fee = provider?.fee?.[r.method];
  if (fee == null) return r;
  return { ...r, feeKRW: fee, sendTotalKRW: r.principalKRW + fee };
}

/**
 * Fetch every scraped provider for a country, across its methods.
 * Manual providers (Sentbe/FoneMoney) are handled by the caller.
 * One provider failing never fails the rest.
 */
// One slow provider (e.g. GME riding out a 429 backoff) must not stall the whole
// corridor. Cap each one; it simply reports as unavailable for that run.
const JOB_TIMEOUT = Number(process.env.JOB_TIMEOUT ?? 25) * 1000;
function withTimeout(promise, who) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${who} timed out`)), JOB_TIMEOUT); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

export async function collectCountry(country, opts = {}) {
  const jobs = [];
  for (const [prov, cfg] of Object.entries(country.providers)) {
    if (cfg.manual) continue;
    // A channel picks its fetcher via cfg.api; a plain provider uses its own key.
    const api = cfg.api || prov;

    if (SINGLE_RATE[api]) {
      jobs.push({ who: prov, p: withTimeout(SINGLE_RATE[api](country, opts, prov), prov) });
      continue;
    }
    const fn = PER_METHOD[api];
    if (!fn) continue;

    // GME corridors flagged `gmeSingleRate` quote one rate for every payout
    // method → fetch once (first method) and mirror below. This is the main
    // lever that keeps GME under its burst limit for 3-method corridors (PH).
    if (api === "GME" && country.gmeSingleRate) {
      const mkey = country.methods[0].key;
      const who = `${prov}/${mkey}`;
      jobs.push({ who, p: withTimeout(fn(country, mkey, opts, prov), who) });
      continue;
    }

    for (const m of country.methods) {
      if (!providerInMethod(cfg, m.key)) continue; // channel scoped to other methods
      const who = `${prov}/${m.key}`;
      jobs.push({ who, p: withTimeout(fn(country, m.key, opts, prov), who) });
    }
  }

  const settled = await Promise.allSettled(jobs.map((j) => j.p));
  const records = [], errors = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") records.push(s.value);
    else errors.push({ who: jobs[i].who, error: String(s.reason?.message ?? s.reason) });
  });

  // Mirror single-rate providers (and single-rate GME corridors) onto every
  // service they participate in.
  const expanded = records.flatMap((r) => {
    const cfg = country.providers[r.provider];
    const api = cfg?.api || r.provider;
    if (SINGLE_RATE[api] || (api === "GME" && country.gmeSingleRate)) {
      return country.methods.filter((m) => providerInMethod(cfg, m.key)).map((m) => ({ ...r, method: m.key }));
    }
    return [r];
  });

  return { records: expanded.map((r) => applyFee(country, r)), errors };
}
