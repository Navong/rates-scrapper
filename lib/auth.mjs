// Auth helpers (the live gate is middleware.js — these mirror it for reuse).
//
// A request is authed if a valid credential arrives any of these ways:
//   • ?pw=…                     (human login form — ACCESS_PASSWORD, default "gme")
//   • ?token=…                  (machine / legacy bookmarkable link — RATES_TOKEN)
//   • x-api-token header         (Excel / Power Automate — RATES_TOKEN)
//   • rt cookie                  (set on the first successful visit)
// When neither ACCESS_PASSWORD nor RATES_TOKEN is set, everything is open.

export const PASSWORD = process.env.ACCESS_PASSWORD || "gme";
export const TOKEN = process.env.RATES_TOKEN || "";

const accepts = (v) => !!v && (v === PASSWORD || (TOKEN && v === TOKEN));

const cookieVal = (cookieHeader, name) => {
  const m = (cookieHeader || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : "";
};

/** Low-level check from the raw sources. */
export function isAuthed({ pw = "", query = "", header = "", cookie = "" }) {
  if (!PASSWORD && !TOKEN) return true;
  return accepts(pw) || accepts(query) || accepts(header) || accepts(cookie);
}

/** Check a standard Request (route handlers, server components via headers()). */
export function authedFromRequest(req) {
  const url = new URL(req.url);
  return isAuthed({
    pw: url.searchParams.get("pw") || "",
    query: url.searchParams.get("token") || "",
    header: req.headers.get("x-api-token") || "",
    cookie: cookieVal(req.headers.get("cookie"), "rt"),
  });
}

export const RT_COOKIE = "rt";
export const VID_COOKIE = "vid";
export const accessUserFromHeaders = (h) => h.get("cf-access-authenticated-user-email") || "";
