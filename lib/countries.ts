// Per-country configuration. Everything country-specific lives here:
// the receive basis, which providers apply, their method codes, and their fees.
//
// Fee rules:
//   - Providers whose API returns the fee (GME, Gmoney, Hanpass, JRF, CoinShot)
//     use the API value; `fee` below is only a fallback.
//   - E9pay's fee comes from its method_map (hardcoded per method here).
//   - Manual providers (Sentbe, FoneMoney) use the fee configured here.

export const COUNTRIES = {
  KH: {
    code: "KH",
    name: "Cambodia",
    flag: "🇰🇭",
    currency: "USD",
    receiveAmount: 1000,
    anchor: "GME",        // Price gap is measured against GME on every corridor
    grid: true,
    gridVertical: true,    // match the Philippines vertical sheet layout
    // Rule 5: one table per service.
    methods: [
      { key: "BANK", label: "Bank Deposit" },
      { key: "WALLET", label: "Cash Payment" }, // wallet rates, CP fee (your choice)
    ],
    // Cambodia uses the FIXED fee table (same as the Office Script), not the
    // per-API fee. Every provider has an explicit `fee` → it always wins.
    providers: {
      GME:     { countryName: "Cambodia", deliveryMethod: { BANK: "2", WALLET: "13" }, fee: { BANK: 5000, WALLET: 5000 } },
      E9PAY:   { nation: { BANK: "KH09", WALLET: "KH04" }, fee: { BANK: 5000, WALLET: 5000 } },
      HANPASS: { countryCode: "KH", option: { BANK: "BANK_TRANSFER", WALLET: "MOBILE_WALLET" }, fee: { BANK: 5000, WALLET: 5000 } },
      GMONEY:  { country: "Cambodia", payment: { BANK: "Bank Account", WALLET: "Wing Account" }, fee: { BANK: 2500, WALLET: 4000 } },
      SBI:     { countryId: "CAMBODIA", fee: { BANK: 5000, WALLET: 5000 } }, // single rate, no method split
      // Official Cambodia USD web rate, shared across methods; fees differ.
      SENTBE:  { rateKey: "usd_krw_kh", fee: { BANK: 2500, WALLET: 5000 } },
    },
  },

  VN: {
    code: "VN",
    name: "Vietnam",
    flag: "🇻🇳",
    currency: "VND",
    receiveAmount: 20000000,
    anchor: "GME",
    methods: [{ key: "BANK", label: "Bank Deposit" }],
    // Provider params verified live against each API for VND 20,000,000.
    // E9pay VN nation = VN03 (found by probing); Gmoney needs the payout country
    // spelled "Viet Nam" (with a space) or its API returns no rate.
    providers: {
      GME:     { countryName: "Vietnam", deliveryMethod: { BANK: "2" }, fee: { BANK: 5000 } },
      E9PAY:   { nation: { BANK: "VN03" }, fee: { BANK: 7000 } },
      HANPASS: { countryCode: "VN", option: { BANK: "BANK_TRANSFER" }, fee: { BANK: 5000 } },
      GMONEY:  { country: "Viet Nam", payment: { BANK: "Bank Account" }, fee: { BANK: 3500 } },
      SBI:     { countryId: "VIETNAM", fee: { BANK: 5000 } },
      JRF:     { type: { BANK: "Bank Transfer" }, fee: { BANK: 5000 } },
      // No public rate API → entered manually on the sheet.
      SENTBE:  { manual: true, fee: { BANK: 5000 } },
      // Cross is entered manually because its public quote can include changing
      // promotional bonuses and is not a stable business comparison rate.
      CROSS:   { manual: true, fee: { BANK: 5000 } },
    },
  },

  NP: {
    code: "NP",
    name: "Nepal",
    flag: "🇳🇵",
    currency: "NPR",
    receiveAmount: 100000,
    anchor: "GME",
    methods: [{ key: "BANK", label: "Bank Transfer" }],
    // Nepal's fees differ from Cambodia's — its own explicit table.
    providers: {
      GME:      { countryName: "Nepal", deliveryMethod: { BANK: "2" }, fee: { BANK: 0 } },
      E9PAY:    { nation: { BANK: "NP" }, fee: { BANK: 5000 } },
      HANPASS:  { countryCode: "NP", option: { BANK: "BANK_TRANSFER" }, fee: { BANK: 2500 } },
      GMONEY:   { country: "Nepal", payment: { BANK: "Bank Account" }, fee: { BANK: 0 } },
      COINSHOT: { fee: { BANK: 0 } },
      JRF:      { type: { BANK: "Bank Transfer" }, fee: { BANK: 3000 } },
      SENTBE:   { fee: { BANK: 2500 } },
      FONEMONEY:{ manual: true, fee: { BANK: 0 } },
    },
  },

  ID: {
    code: "ID",
    name: "Indonesia",
    flag: "🇮🇩",
    currency: "IDR",
    receiveAmount: 13000000,
    anchor: "GME_BNI",
    // v1.1.11 renamed the generic GME bank series and corrected two business
    // fees. Normalize older snapshots at read time so the graph has one
    // continuous, comparable history instead of a deployment-time step.
    historyMigration: {
      marker: "GME_BNI",
      aliases: { GME: "GME_BNI" },
      totalDeltaBefore: { CROSS: -5000, JRF: 500 },
    },
    methods: [{ key: "BANK", label: "Bank Deposit" }],
    // Fees seeded from each provider's own API. Adjust here if the business
    // fee table differs — this column is authoritative for the sheet.
    providers: {
      GME_BNI:   { api: "GME", label: "GME (BNI)", countryName: "Indonesia", deliveryMethod: { BANK: "2" }, totalIncludesFee: true, fee: { BANK: 0 } },
      E9PAY:     { nation: { BANK: "ID01" }, fee: { BANK: 5000 } },
      SENTBE:    { fee: { BANK: 5000 } },
      SBI:       { countryId: "INDONESIA", fee: { BANK: 5000 } },
      COINSHOT:  { fee: { BANK: 2500 } },
      GME_BRI:   { manual: true, label: "GME (BRI)", fee: { BANK: 0 } },
      JRF:       { type: { BANK: "Bank Transfer" }, fee: { BANK: 5000 } },
      UTRANSFER: { fee: { BANK: 5000 } },
      GMONEY:    { country: "Indonesia", payment: { BANK: "Bank Account" }, fee: { BANK: 2500 } },
      HANPASS:   { countryCode: "ID", option: { BANK: "BANK_TRANSFER" }, fee: { BANK: 5000 } },
      CROSS:     { platform: 68, rateUnit: 100, fee: { BANK: 0 } }, // crossenf.com quote API
    },
  },

  LK: {
    code: "LK",
    name: "Sri Lanka",
    flag: "🇱🇰",
    currency: "LKR",
    receiveAmount: 230000,
    anchor: "GME",
    methods: [{ key: "BANK", label: "Bank Deposit" }],
    // Fees are the business table (they differ from what the providers' APIs
    // report — e.g. E9pay's own fee is 2,000 and Gmoney's is 2,500).
    providers: {
      GME:     { countryName: "Sri Lanka", deliveryMethod: { BANK: "2" }, fee: { BANK: 5000 } },
      E9PAY:   { nation: { BANK: "LK03" }, fee: { BANK: 5000 } },
      HANPASS: { countryCode: "LK", option: { BANK: "BANK_TRANSFER" }, fee: { BANK: 5000 } },
      GMONEY:  { country: "Sri Lanka", payment: { BANK: "Bank Account" }, fee: { BANK: 1500 } },
      COINSHOT:{ fee: { BANK: 0 } },
      JRF:     { type: { BANK: "Bank Transfer" }, fee: { BANK: 4500 } },
      SENTBE:  { fee: { BANK: 5000 } },
      HANAEZ:  { manual: true, fee: { BANK: 5427 } }, // app-only — manual entry
    },
  },

  BD: {
    code: "BD",
    name: "Bangladesh",
    flag: "🇧🇩",
    currency: "BDT",
    receiveAmount: 100000,
    anchor: "GME",
    methods: [{ key: "BANK", label: "Bank Deposit" }],
    // All scraped (verified live against each API for BDT 100,000). E9pay resolves
    // Bangladesh by currency (any BD nation code returns the same bank rate);
    // Cross uses platform 76 (rate_currency "1 BDT" → rateUnit 1).
    providers: {
      GME:       { countryName: "Bangladesh", deliveryMethod: { BANK: "2" }, fee: { BANK: 5000 } },
      E9PAY:     { nation: { BANK: "BD09" }, fee: { BANK: 5000 } }, // BD09/BD10 = bank (matches site); BD01 is a WRONG cheaper channel
      HANPASS:   { countryCode: "BD", option: { BANK: "BANK_TRANSFER" }, fee: { BANK: 5000 } },
      GMONEY:    { country: "Bangladesh", payment: { BANK: "Bank Account" }, fee: { BANK: 5000 } },
      JRF:       { type: { BANK: "Bank Transfer" }, fee: { BANK: 0 } },
      UTRANSFER: { fee: { BANK: 5000 } },
      CROSS:     { platform: 76, rateUnit: 1, fee: { BANK: 0 } }, // crossenf.com quote API
    },
  },

  PH: {
    code: "PH",
    name: "Philippines",
    flag: "🇵🇭",
    currency: "PHP",
    receiveAmount: 40000,
    anchor: "GME",
    // Keep the three service tables in one vertical column in sheet view.
    grid: true,
    gridVertical: true,
    // GME quotes the SAME exchange rate for all three PH payout methods (verified
    // against the live API). Fetch it once and mirror, instead of 3 calls — that
    // is what keeps us under GME's ~4-rapid-call burst limit (errorCode 429).
    gmeSingleRate: true,
    // Rule 5: one table per service.
    methods: [
      { key: "CASH", label: "Cash Payment" },
      { key: "BANK", label: "Bank Deposit" },
      { key: "WALLET", label: "Mobile Wallet" },
    ],
    // GME exposes only these three payout methods for PH (no partner breakdown).
    providers: {
      GME:      { countryName: "Philippines", deliveryMethod: { CASH: "1", BANK: "2", WALLET: "13" },
                  totalIncludesFee: true, fee: { CASH: 0, BANK: 0, WALLET: 0 } },
      // GME's public quote distinguishes payout types but does not expose these
      // partner-specific rates, so they remain separate manual sheet entries.
      GME_CEBUANA:  { manual: true, label: "GME (Cebuana)", methods: ["CASH"], fee: { CASH: 0 } },
      GME_WU:       { manual: true, label: "GME (WU)", methods: ["CASH"], fee: { CASH: 0 } },
      GME_METROBANK:{ manual: true, label: "GME (Metrobank)", methods: ["BANK"], fee: { BANK: 0 } },
      E9PAY:    { nation: { CASH: "PH03", BANK: "PH11", WALLET: "PH15" },   // PH15 = Gcash
                  fee: { CASH: 5000, BANK: 5000, WALLET: 3000 } },
      HANPASS:  { countryCode: "PH", option: { CASH: "CASH_PICK_UP", BANK: "BANK_TRANSFER", WALLET: "MOBILE_WALLET" },
                  fee: { CASH: 5000, BANK: 5000, WALLET: 5000 } },
      GMONEY:   { country: "Philippines", payment: { CASH: "Cash Pickup", BANK: "Bank Account", WALLET: "Gcash" },
                  fee: { CASH: 0, BANK: 0, WALLET: 0 } },
      JRF:      { type: { CASH: "Cash Pay", BANK: "Bank Transfer", WALLET: "GCASH" },
                  fee: { CASH: 5000, BANK: 5000, WALLET: 5000 } },
      COINSHOT: { fee: { CASH: 0, BANK: 0, WALLET: 0 } },
      SBI:      { countryId: "PHILIPPINES", fee: { CASH: 5000, BANK: 5000, WALLET: 5000 } },
      UTRANSFER:{ fee: { CASH: 5000, BANK: 2500, WALLET: 1500 } },
      SENTBE:   { fee: { CASH: 5000, BANK: 5000, WALLET: 2500 } },
      CROSS:    { platform: 20, rateUnit: 1, fee: { CASH: 0, BANK: 0, WALLET: 0 } }, // crossenf.com — one rate, all methods
    },
  },

  CN: {
    code: "CN",
    name: "China",
    flag: "🇨🇳",
    currency: "CNY",
    receiveAmount: 10000,
    anchor: "GME",
    methods: [{ key: "ALIPAY", label: "Alipay" }],
    providers: {
      GME:      { countryName: "China", deliveryMethod: { ALIPAY: "17" }, fee: { ALIPAY: 0 } }, // ALIPAY WALLET
      E9PAY:    { nation: { ALIPAY: "CN15" }, fee: { ALIPAY: 7000 } },
      HANPASS:  { countryCode: "CN", option: { ALIPAY: "Alipay" }, fee: { ALIPAY: 0 } },
      GMONEY:   { country: "China", payment: { ALIPAY: "Alipay" }, fee: { ALIPAY: 0 } },
      COINSHOT: { fee: { ALIPAY: 10000 } },
      UTRANSFER:{ fee: { ALIPAY: 5000 } },
      PANDA:    { fee: { ALIPAY: 8000 } }, // scraped via prod.pandaremit.com
      SBI:      { countryId: "CHINA", fee: { ALIPAY: 5000 } },
      // No clean public rate API → manual (like Sentbe). Seed from the sheet.
      // (WireBarley's API response is encrypted client-side — not scrapeable.)
      KAKAO:     { manual: true, fee: { ALIPAY: 0 } },
      DEBUNK:    { manual: true, fee: { ALIPAY: 5000 } },
      MOIN:      { manual: true, fee: { ALIPAY: 0 } },
      WIREBARLEY:{ manual: true, fee: { ALIPAY: 0 } },
      SENTBE:    { fee: { ALIPAY: 0 } },
      CROSS:     { platform: 122, rateUnit: 1, fee: { ALIPAY: 0 } }, // crossenf.com — Alipay platform
    },
  },

  TH: {
    code: "TH",
    name: "Thailand",
    flag: "🇹🇭",
    currency: "THB",
    receiveAmount: 26000,
    anchor: "GME",
    methods: [{ key: "BANK", label: "Bank Deposit" }],
    // Provider params verified live against each API for THB 26,000.
    // E9pay's Thailand nation code is TH02 (found by probing).
    providers: {
      GME:       { countryName: "Thailand", deliveryMethod: { BANK: "2" }, fee: { BANK: 5000 } },
      E9PAY:     { nation: { BANK: "TH02" }, fee: { BANK: 5000 } },
      HANPASS:   { countryCode: "TH", option: { BANK: "BANK_TRANSFER" }, fee: { BANK: 5000 } },
      GMONEY:    { country: "Thailand", payment: { BANK: "Bank Account" }, fee: { BANK: 5000 } },
      SBI:       { countryId: "THAILAND", fee: { BANK: 5000 } },
      JRF:       { type: { BANK: "Bank Transfer" }, fee: { BANK: 5000 } },
      COINSHOT:  { fee: { BANK: 2500 } },
      CROSS:     { platform: 80, rateUnit: 1, fee: { BANK: 5000 } }, // crossenf.com quote API
      // No public rate API → entered manually on the sheet.
      WIREBARLEY:{ manual: true, fee: { BANK: 3000 } },
    },
  },

  ZA: {
    code: "ZA",
    name: "South Africa",
    flag: "🇿🇦",
    currency: "ZAR",
    receiveAmount: 10000,
    anchor: "GME",
    methods: [{ key: "BANK", label: "Bank Deposit" }],
    // Public calculator parameters verified live for ZAR 10,000.
    providers: {
      GMONEY:  { country: "South Africa", payment: { BANK: "Bank Account" }, fee: { BANK: 5000 } },
      GME:     { countryName: "South Africa", deliveryMethod: { BANK: "2" }, fee: { BANK: 5000 } },
      HANPASS: { countryCode: "ZA", option: { BANK: "BANK_TRANSFER" }, fee: { BANK: 5000 } },
      SENTBE:  { fee: { BANK: 5000 } },
    },
  },

  TL: {
    code: "TL",
    name: "Timor-Leste",
    flag: "🇹🇱",
    currency: "USD",
    receiveAmount: 1000,
    anchor: "GME",
    grid: true,
    gridVertical: true,
    // GME returns the same USD quote for bank and cash. Fetch once and mirror
    // it across the three business channels to avoid unnecessary rate-limit use.
    gmeSingleRate: true,
    methods: [
      { key: "BANK", label: "Bank Deposit (BNCTL)" },
      { key: "CASH_MG", label: "Cash Payment MG" },
      { key: "CASH_WU", label: "Cash Payment WU" },
    ],
    providers: {
      GME: {
        countryName: "Timor-Leste",
        deliveryMethod: { BANK: "2", CASH_MG: "1", CASH_WU: "1" },
        fee: { BANK: 5000, CASH_MG: 5000, CASH_WU: 5000 },
      },
      HANPASS: {
        countryCode: "TL",
        option: { BANK: "BANK_TRANSFER", CASH_MG: "CASH_PICK_UP", CASH_WU: "CASH_PICK_UP" },
        fee: { BANK: 5000, CASH_MG: 5000, CASH_WU: 5000 },
      },
      GMONEY: {
        country: "Timor-Leste",
        payment: { BANK: "Bank Account", CASH_MG: "Cash Pickup" },
        methods: ["BANK", "CASH_MG"],
        fee: { BANK: 0, CASH_MG: 0 },
      },
    },
  },

  RU: {
    code: "RU",
    name: "Russia",
    flag: "🇷🇺",
    currency: "RUB",
    receiveAmount: 10000,
    anchor: { CARD: "GME", CASH: null },
    methods: [
      { key: "CARD", label: "Card Payment" },
      { key: "CASH", label: "Cash Payment" },
    ],
    providers: {
      GME: {
        countryName: "Russian Federation",
        deliveryMethod: { CARD: "14" },
        methods: ["CARD"],
        fee: { CARD: 5000 },
      },
      E9PAY_CARD: {
        api: "E9PAY", label: "E9pay", nation: { CARD: "RU19" },
        methods: ["CARD"], fee: { CARD: 2000 },
      },
      // The public Russia cash channel is USD-only; this table is RUB 10,000.
      E9PAY_CASH: {
        manual: true, label: "E9pay", methods: ["CASH"], fee: { CASH: 7000 },
      },
    },
  },

  UZ: {
    code: "UZ",
    name: "Uzbekistan",
    flag: "🇺🇿",
    currency: "USD",
    receiveAmount: 1000,
    anchor: "GME",
    methods: [
      { key: "CASH", label: "Cash Payment", currency: "USD", receiveAmount: 1000 },
      { key: "CARD", label: "Card Payment", currency: "UZS", receiveAmount: 1000000 },
    ],
    providers: {
      GME: {
        countryName: "Uzbekistan",
        deliveryMethod: { CASH: "1", CARD: "26" },
        fee: { CASH: 5000, CARD: 2000 },
      },
      E9PAY: {
        nation: { CASH: "UZ01", CARD: "UZ15" },
        fee: { CASH: 7000, CARD: 2000 },
      },
      HANPASS: {
        countryCode: "UZ",
        option: { CASH: "CASH_PICK_UP", CARD: "CARD_TRANSFER" },
        fee: { CASH: 5000, CARD: 2500 },
      },
      GMONEY_CASH: {
        api: "GMONEY", label: "Gmoney", country: "Uzbekistan",
        payment: { CASH: "Cash Pickup" }, methods: ["CASH"], fee: { CASH: 5000 },
      },
      GMONEY_CARD: {
        manual: true, label: "Gmoney", methods: ["CARD"], fee: { CARD: 2000 },
      },
      COINSHOT: {
        manual: true, label: "Coinshot", methods: ["CASH"], fee: { CASH: 8000 },
      },
      SENTBE_CASH: {
        api: "SENTBE", label: "SentBe", rateKey: "usd_krw_uz",
        methods: ["CASH"], fee: { CASH: 5000 },
      },
      SENTBE_CARD: {
        api: "SENTBE", label: "SentBe", rateKey: "uzs_krw",
        methods: ["CARD"], fee: { CARD: 1000 },
      },
    },
  },

  MM: {
    code: "MM",
    name: "Myanmar",
    flag: "🇲🇲",
    currency: "MMK",
    receiveAmount: 5000000, // default; each method overrides below
    grid: true,
    gridVertical: true,     // match the Philippines vertical three-table sheet
    // Providers are split by partner "channel", each scoped to one method. Where a
    // public API can select the channel it's scraped (params verified live against
    // the sheet); GME's partners aren't API-selectable so only those rows stay
    // manual. The Price-gap anchor is a specific GME channel/method.
    anchor: { CASH: "GME_RIA", BANK: "GME_CB", WALLET: "GME_KBZPAY" },
    methods: [
      { key: "CASH", label: "Cash Payment", receiveAmount: 5000000 },
      { key: "BANK", label: "Bank Deposit", receiveAmount: 5000000 },
      { key: "WALLET", label: "Mobile Wallet", receiveAmount: 4000000 },
    ],
    providers: {
      // --- Cash Payment ---
      GME_API_CASH_WALLET: { api: "GME", label: "GME", countryName: "Myanmar",
                       deliveryMethod: { CASH: "1", WALLET: "13" }, singleRate: true,
                       methods: ["CASH", "WALLET"], fee: { CASH: 5000, WALLET: 5000 } },
      GME_API_BANK:  { api: "GME", label: "GME", countryName: "Myanmar",
                       deliveryMethod: { BANK: "2" }, methods: ["BANK"], fee: { BANK: 8000 } },
      HANAEZ:        { manual: true, label: "Hana EZ", methods: ["CASH", "BANK", "WALLET"],
                       fee: { CASH: 5000, BANK: 5000, WALLET: 5000 } },
      GME_WU:        { manual: true, label: "GME (WU)",  methods: ["CASH"], fee: { CASH: 0 } },
      GME_RIA:       { manual: true, label: "GME (Ria)", methods: ["CASH"], fee: { CASH: 0 } },
      GMONEY_CASH:   { api: "GMONEY", label: "Gmoney (Cash Pickup)", country: "Myanmar", payment: { CASH: "Cash Pickup" }, methods: ["CASH"], fee: { CASH: 5000 } },
      HANPASS_WU:    { api: "HANPASS", label: "Hanpass (WU)", countryCode: "MM", option: { CASH: "CASH_PICK_UP" }, methods: ["CASH"], fee: { CASH: 5000 } },
      // --- Bank Deposit ---
      GME_AYA:       { manual: true, label: "GME (AYA)", methods: ["BANK"], fee: { BANK: 0 } },
      GME_KBZ:       { manual: true, label: "GME (KBZ)", methods: ["BANK"], fee: { BANK: 0 } },
      GME_CB:        { manual: true, label: "GME (CB)",  methods: ["BANK"], fee: { BANK: 0 } },
      E9PAY_CB:      { api: "E9PAY", label: "E9pay (CB)", nation: { BANK: "MM01" }, methods: ["BANK"], fee: { BANK: 8000 } },
      E9PAY_KBZ:     { api: "E9PAY", label: "E9pay (KBZ)", nation: { BANK: "MM05" }, methods: ["BANK"], fee: { BANK: 8000 } },
      GMONEY_CB:     { api: "GMONEY", label: "Gmoney (CB)", country: "Myanmar", payment: { BANK: "Bank Account" }, methods: ["BANK"], fee: { BANK: 5000 } },
      SBI:           { api: "SBI", label: "SBI Cosmoney", countryId: "MYANMAR", methods: ["BANK"], fee: { BANK: 5000 } },
      HANPASS_CB:    { api: "HANPASS", label: "HANPASS (CB)", countryCode: "MM", option: { BANK: "BANK_TRANSFER" }, methods: ["BANK"], fee: { BANK: 5000 } },
      // --- Mobile Wallet ---
      GME_WAVE:      { manual: true, label: "GME (Wave Pay)", methods: ["WALLET"], fee: { WALLET: 0 } },
      GME_KBZPAY:    { manual: true, label: "GME (KBZ Pay)",  methods: ["WALLET"], fee: { WALLET: 0 } },
      GMONEY_WAVE:   { api: "GMONEY", label: "Gmoney (Wave Pay)", country: "Myanmar", payment: { WALLET: "WaveMoney" }, methods: ["WALLET"], fee: { WALLET: 3500 } },
      GMONEY_KBZPAY: { api: "GMONEY", label: "Gmoney (KBZ Pay)", country: "Myanmar", payment: { WALLET: "KBZPay" }, methods: ["WALLET"], fee: { WALLET: 3500 } },
      GMONEY_AYAPAY: { api: "GMONEY", label: "Gmoney (AYA Pay)", country: "Myanmar", payment: { WALLET: "AYA PAY" }, methods: ["WALLET"], fee: { WALLET: 3500 } },
      E9PAY_WAVE:    { api: "E9PAY", label: "E9pay (Wave Pay)", nation: { WALLET: "MM06" }, methods: ["WALLET"], fee: { WALLET: 3000 } },
      E9PAY_KBZPAY:  { api: "E9PAY", label: "E9 Pay (KBZ Pay)", nation: { WALLET: "MM04" }, methods: ["WALLET"], fee: { WALLET: 5000 } },
      HANPASS_WAVE:  { api: "HANPASS", label: "Hanpass (Wave Pay)", countryCode: "MM", option: { WALLET: "WAVE_PAY" }, methods: ["WALLET"], fee: { WALLET: 5000 } },
      HANPASS_KBZPAY:{ api: "HANPASS", label: "Hanpass (KBZ Pay)", countryCode: "MM", option: { WALLET: "MOBILE_WALLET" }, methods: ["WALLET"], fee: { WALLET: 5000 } },
    },
  },
};

// Display names as they appear in the sheet.
export const PROVIDER_LABEL = {
  GME: "GME", E9PAY: "E9pay", HANPASS: "Hanpass", GMONEY: "Gmoney",
  SBI: "SBI", SENTBE: "Sentbe", COINSHOT: "Coinshot", JRF: "JRF",
  FONEMONEY: "FoneMoney", CROSS: "Cross", HANAEZ: "Hana EZ", UTRANSFER: "UTRANSFER",
  KAKAO: "Kakao", DEBUNK: "Debunk", MOIN: "Moin", WIREBARLEY: "WireBarley", PANDA: "Panda",
};

export const MANUAL_PROVIDERS = ["SENTBE", "FONEMONEY", "HANAEZ"];

// The receive amount for a method (methods may override the corridor default).
export const amountFor = (country, mkey) =>
  country.methods.find((m) => m.key === mkey)?.receiveAmount ?? country.receiveAmount;

export const currencyFor = (country, mkey) =>
  country.methods.find((m) => m.key === mkey)?.currency ?? country.currency;

// The Price-gap anchor for a method. `anchor` is either a provider key (all
// methods) or a { method: providerKey } map (a specific channel per method).
export const anchorOf = (anchor, mkey) =>
  anchor && typeof anchor === "object" ? anchor[mkey] : anchor;

// Whether a provider/channel participates in a given method. Channels declare
// `methods: [...]`; providers without it apply to every method (default).
export const providerInMethod = (cfg, mkey) => !cfg.methods || cfg.methods.includes(mkey);

export function getCountry(code) {
  return COUNTRIES[String(code || "KH").toUpperCase()] || COUNTRIES.KH;
}
export function countryList() {
  return Object.values(COUNTRIES).map((c) => ({
    code: c.code,
    name: c.name,
    flag: c.flag,
    currency: c.currency,
    receiveAmount: c.receiveAmount,
    methods: c.methods,
    grid: "grid" in c && !!c.grid,
    gridVertical: "gridVertical" in c && !!c.gridVertical,
  }));
}
