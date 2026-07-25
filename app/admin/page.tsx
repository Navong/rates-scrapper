import { CREDIT } from "@/lib/meta";

export const dynamic = "force-dynamic";

// Separate admin sign-in (username + password). Posts to the same /api/login,
// which routes to the admin path when a username is present. Public page (not
// gated) so admins can reach it; on success it goes to `next` (default /pipeline).
export default async function AdminLoginPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const next = typeof sp.next === "string" && sp.next ? sp.next : "/pipeline";
  const bad = sp.bad === "1";

  return (
    <main className="loginpage">
      <div className="logincard">
        <div className="loginhead">
          <span className="logo"><img src="/gme-logo.avif" alt="GME" /></span>
          <h1>Admin sign in</h1>
          <div className="sub">Pipeline &amp; automation</div>
        </div>
        <div className="loginbody">
          {bad ? <div className="loginerr">⚠ Incorrect username or password.</div> : null}
          <form method="POST" action="/api/login">
            <input type="hidden" name="next" value={next} />
            <label htmlFor="username">Username</label>
            <input id="username" className="field" name="username" type="text" placeholder="Admin username"
              autoFocus autoComplete="username" style={{ marginBottom: 14 }} />
            <label htmlFor="pw">Password</label>
            <input id="pw" className="field" name="pw" type="password" placeholder="Admin password"
              autoComplete="current-password" />
            <button className="btn primary" type="submit">Sign in as admin</button>
          </form>
          <div className="loginfoot">🔒 Admin access · {CREDIT}</div>
        </div>
      </div>
    </main>
  );
}
