import { NextResponse } from "next/server";
import { roleFromValue } from "./lib/roles";

// Password gate + anonymous visitor cookie.
// Self-contained (reads process.env at call time) so it works in the middleware
// runtime without relying on module-init env capture.
//
// Humans sign in with a short password (ACCESS_PASSWORD, default "gme") via the
// login form (?pw=). Machines (Excel / Power Automate hitting /rates) keep using
// the long RATES_TOKEN via ?token= or the x-api-token header. Either credential,
// once accepted, is remembered in the `rt` cookie so the bare URL just works.

const RT = "rt";
const VID = "vid";

// HTML pages redirect to the sign-in page; data endpoints answer 401 JSON.
const HTML_PATHS = ["/", "/ranking", "/history", "/stats", "/pipeline"];
const DATA_PREFIXES = ["/rates", "/manual", "/fees", "/api"];
// Admin-only (role must be "admin", not just any logged-in viewer).
const ADMIN_PREFIXES = ["/pipeline", "/api/pipeline"];

const isHtmlPath = (p) => HTML_PATHS.includes(p);
const isDataPath = (p) => DATA_PREFIXES.some((d) => p === d || p.startsWith(d + "/") || p.startsWith(d));
const isAdminPath = (p) => ADMIN_PREFIXES.some((d) => p === d || p.startsWith(d + "/"));

function ensureVisitor(req, res) {
  if (!req.cookies.get(VID)) {
    const id = (globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2)).slice(0, 8);
    res.cookies.set(VID, id, { path: "/", maxAge: 63072000, sameSite: "lax", secure: true });
  }
}

export function middleware(req) {
  const { pathname, searchParams } = req.nextUrl;
  const accepts = (v) => roleFromValue(v) !== null;

  // Preflight and the login endpoint (which authenticates you) pass through.
  if (req.method === "OPTIONS" || pathname === "/api/login") return NextResponse.next();

  const protectedHtml = isHtmlPath(pathname);
  const protectedData = isDataPath(pathname);
  if (!protectedHtml && !protectedData) {
    const res = NextResponse.next();
    ensureVisitor(req, res);
    return res;
  }

  const pw = searchParams.get("pw") || "";       // human login form
  const token = searchParams.get("token") || ""; // machine / legacy link
  const header = req.headers.get("x-api-token") || "";
  const cookie = req.cookies.get(RT)?.value || "";
  const provided = pw || token || header;        // credential to remember, if valid
  const role = roleFromValue(cookie) || roleFromValue(pw) || roleFromValue(token) || roleFromValue(header);
  const ok = role !== null;

  // Build an absolute redirect URL from the FORWARDED scheme/host, not from
  // req.url — behind the Cloudflare tunnel the container sees http://localhost,
  // and redirecting there would drop the Secure cookie / bounce the login. The
  // Edge runtime requires an absolute URL (a relative Location throws).
  const redirectTo = (location, cookie) => {
    const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
    const res = NextResponse.redirect(new URL(location, `${proto}://${host}`), 307);
    if (cookie) res.cookies.set(RT, cookie, { path: "/", sameSite: "lax", secure: true, httpOnly: true });
    ensureVisitor(req, res);
    return res;
  };

  if (!ok) {
    if (protectedHtml) {
      const keep = new URLSearchParams(searchParams);
      const hadCred = keep.has("pw") || keep.has("token");
      keep.delete("pw");      // never carry the (wrong) credential into the login link
      keep.delete("token");
      const nextVal = pathname + (keep.toString() ? `?${keep}` : "");
      // Admin pages go to the admin sign-in; everything else to the viewer login.
      const loginPath = isAdminPath(pathname) ? "/admin" : "/login";
      return redirectTo(`${loginPath}?next=${encodeURIComponent(nextVal)}${hadCred ? "&bad=1" : ""}`);
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Admin-only paths: a logged-in viewer can't reach them → prompt admin sign-in.
  if (isAdminPath(pathname) && role !== "admin") {
    if (isDataPath(pathname)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return redirectTo(`/admin?next=${encodeURIComponent(pathname)}`);
  }

  // A valid credential in the URL (?pw= / ?token=) on an HTML page: set the
  // cookie and redirect to the clean URL so the password isn't left in the
  // address bar / history. (Machine data endpoints keep query auth, no redirect.)
  if (req.method === "GET" && protectedHtml && (pw || token)) {
    const keep = new URLSearchParams(searchParams);
    keep.delete("pw");
    keep.delete("token");
    const clean = pathname + (keep.toString() ? `?${keep}` : "");
    return redirectTo(clean, accepts(provided) ? provided : null);
  }

  const res = NextResponse.next();
  // Remember a valid credential passed via header so the bare URL works later.
  if (accepts(provided)) {
    res.cookies.set(RT, provided, { path: "/", sameSite: "lax", secure: true, httpOnly: true });
  }
  ensureVisitor(req, res);
  return res;
}

export const config = {
  // Everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
