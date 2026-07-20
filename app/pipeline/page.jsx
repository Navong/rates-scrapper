import { cookies, headers } from "next/headers";
import { getCountry, anchorOf } from "@/countries.mjs";
import { getCountryRecords } from "@/lib/cache.mjs";
import { buildRankingData } from "@/ranking.mjs";
import { getStore } from "@/manual.mjs";
import { logEvent } from "@/analytics.mjs";
import { AppHeader, SiteFooter, todayStr } from "@/lib/ui.jsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fmt = (n) => "₩" + Math.round(n).toLocaleString("en-US");

// For each Cambodia service, where does GME rank, and is it a poster opportunity
// (GME 3rd or 4th cheapest — competitive enough to promote)?
function analyze(d) {
  return d.methods.map((m) => {
    const anchorKey = anchorOf(d.anchor, m.key);
    const live = (d.blocks[m.key] || []).filter((r) => !r.noRate && r.total != null).sort((a, b) => a.total - b.total);
    const gme = live.find((r) => r.provider === anchorKey);
    const rank = gme ? live.findIndex((r) => r.provider === anchorKey) + 1 : null;
    const cheaper = gme ? live.filter((r) => r.total < gme.total) : [];
    return { method: m, live, gme, rank, cheaper, cheapest: live[0], trigger: rank === 3 || rank === 4 };
  });
}

export default async function PipelinePage() {
  const country = getCountry("KH"); // Cambodia only (by request)
  const { records } = await getCountryRecords(country, false);
  const d = buildRankingData(country, records, getStore());
  const rows = analyze(d);
  const opportunities = rows.filter((r) => r.trigger).length;

  const ck = await cookies();
  const h = await headers();
  logEvent({ k: "page", p: "/pipeline", c: "KH", v: ck.get("vid")?.value, u: h.get("cf-access-authenticated-user-email") || "" });

  return (
    <main className="wrap pipelinepage">
      <AppHeader
        title="Pipeline"
        sub="Cambodia rate-poster automation · GME rank monitor"
        active="pipeline"
        admin
        reportDate={todayStr()}
        stats={{
          cards: [
            { k: "Corridor", v: "🇰🇭 Cambodia", d: "#3a86ff" },
            { k: "Services", v: d.methods.length, d: "var(--good)" },
            { k: "Opportunities", v: opportunities, d: opportunities ? "var(--brand)" : "var(--muted)" },
            { k: "Trigger", v: "GME #3–4", d: "var(--warn)" },
          ],
          totals: [
            { k: "Poster", v: "Canva" },
            { k: "Status", v: opportunities ? "Ready" : "Waiting" },
          ],
        }}
      />

      <div className="panel pipeexplain">
        <b>How it works —</b> when GME lands <b>3rd or 4th cheapest</b> in a Cambodia service (competitive enough to promote),
        it's flagged as a <b>poster opportunity</b>: generate a rate poster (PNG) → post to Facebook → send to the team.
      </div>

      {rows.map((r) => (
        <div key={r.method.key} className={`panel oppcard${r.trigger ? " hit" : ""}`}>
          <div className="opphead">
            <h3>{r.method.label}</h3>
            {r.rank == null
              ? <span className="oppbadge none">GME rate unavailable</span>
              : r.trigger
                ? <span className="oppbadge hit">🎯 Poster opportunity — GME #{r.rank}</span>
                : <span className="oppbadge">GME rank #{r.rank}</span>}
          </div>
          {r.gme ? (
            <>
              <div className="oppmeta">
                GME total <b>{fmt(r.gme.total)}</b> · cheapest {r.cheapest.op} <b>{fmt(r.cheapest.total)}</b>
                {r.cheaper.length ? <> · {r.cheaper.length} beat GME</> : <> · GME is cheapest</>}
              </div>
              {r.cheaper.length ? (
                <div className="oppbeat">Cheaper than GME: {r.cheaper.map((c) => `${c.op} ${fmt(c.total)}`).join(" · ")}</div>
              ) : null}
            </>
          ) : (
            <div className="oppmeta">No live GME rate this run — carried-forward or unavailable.</div>
          )}
          <div className="oppact">
            {r.gme ? (
              <a className={`btn${r.trigger ? " primary" : ""}`} href={`/api/pipeline/poster?method=${r.method.key}`}
                target="_blank" rel="noreferrer" style={{ width: "auto", padding: "11px 20px" }}>
                Generate poster (PNG)
              </a>
            ) : (
              <button className="btn" type="button" disabled style={{ width: "auto", padding: "11px 20px" }}>
                Generate poster (PNG)
              </button>
            )}
            <span className="oppnote">
              {r.gme
                ? (r.trigger ? "Opens the rate poster in a new tab · right-click to save" : "GME not 3rd/4th — poster still available")
                : "No live GME rate this run"}
            </span>
          </div>
        </div>
      ))}

      <div className="panel roadmap">
        <h3>Automation steps</h3>
        <ol>
          <li><b className="rdone">✓ Detect</b> — GME 3rd/4th in Cambodia (live, above). Fees &amp; manual rates are already factored in.</li>
          <li><b className="rdone">✓ Poster</b> — generated server-side as a PNG from live rates (no Canva/OAuth). Click <b>Generate poster</b> on any service above.</li>
          <li><b className="rtodo">○ Facebook</b> — auto-post the poster to the page (blocked: no API access yet).</li>
          <li><b className="rtodo">○ Send to team</b> — deliver the poster (Teams webhook, Slack, or email — pick one).</li>
        </ol>
      </div>

      <SiteFooter note={<span>🔒 Admin · pipeline automation (Cambodia)</span>} />
    </main>
  );
}
