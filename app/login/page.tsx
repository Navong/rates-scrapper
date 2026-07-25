import { CREDIT } from "@/lib/meta";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }) {
  const sp = (await searchParams) || {};
  // POST to /api/login so the password is never placed in the URL. `next` is
  // where to send the user after a successful sign-in.
  const next = typeof sp.next === "string" && sp.next ? sp.next : "/";
  const bad = sp.bad === "1";

  return (
    <main className="loginpage">
      <div className="logincard">
        <div className="loginhead">
          <span className="logo"><img src="/gme-logo.avif" alt="GME" /></span>
          <h1>Rate Dashboard</h1>
          <div className="sub">Remittance rate comparison</div>
        </div>
        <div className="loginbody">
          {bad ? <div className="loginerr">⚠ Incorrect password — please try again.</div> : null}
          <form method="POST" action="/api/login">
            <input type="hidden" name="next" value={next} />
            <label htmlFor="pw">Password</label>
            <input id="pw" className="field" name="pw" type="password" placeholder="Enter password"
              autoFocus autoComplete="current-password" />
            <button className="btn primary" type="submit">Sign in</button>
          </form>
          <div className="loginfoot">🔒 Authorized access only · {CREDIT}</div>
        </div>
      </div>
    </main>
  );
}
