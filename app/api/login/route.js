import { NextResponse } from "next/server";
import { verifyAdmin, adminToken } from "@/lib/admin.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Password login via POST, so the password is never in the URL / history / logs.
// Redirects use a RELATIVE Location (path only) so the browser stays on the
// current origin — behind the Cloudflare tunnel `new URL(req.url)` resolves to
// http://localhost, and an absolute redirect there would drop the Secure cookie.
function redirect(path, cookie) {
  const res = new NextResponse(null, { status: 303, headers: { Location: path } });
  if (cookie) {
    // Session cookie (no maxAge/expires) → cleared when the browser closes.
    res.cookies.set("rt", cookie, { path: "/", sameSite: "lax", secure: true, httpOnly: true });
  }
  return res;
}

export async function POST(req) {
  const PASSWORD = process.env.ACCESS_PASSWORD || "gme";
  const TOKEN = process.env.RATES_TOKEN || "";

  const form = new URLSearchParams(await req.text());
  const username = (form.get("username") || "").trim();
  const pw = form.get("pw") || "";
  const next = form.get("next") || "/";

  // Only a same-origin path (leading single "/", not protocol-relative "//").
  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const enc = encodeURIComponent(next);

  // Admin sign-in: username present → verify against the scrypt hash, set the
  // opaque admin token as the session (never the password). Failures bounce back
  // to the admin login, not the viewer login.
  if (username) {
    return verifyAdmin(username, pw) ? redirect(dest, adminToken()) : redirect(`/admin?next=${enc}&bad=1`);
  }

  // Viewer sign-in: password only.
  const ok = pw === PASSWORD || (TOKEN && pw === TOKEN);
  return ok ? redirect(dest, pw) : redirect(`/login?next=${enc}&bad=1`);
}
