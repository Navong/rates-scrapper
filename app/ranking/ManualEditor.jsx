"use client";

// Inline manual-rate editor (React port of ranking.mjs manualPanel + sheetScript).
// Saves via AJAX to /manual?...&format=json; typo warnings render inline with a
// "Save anyway" button, and a clean save calls router.refresh() so the server
// re-renders the tables + stat bar with the new values — no full navigation.

import { useRef, useState } from "react";

const fmt = (n) => Number(n).toLocaleString("en-US");

export default function ManualEditor({ code, cards, onSaved }) {
  const formRef = useRef(null);
  const [warnings, setWarnings] = useState(null);
  const [msg, setMsg] = useState("");

  async function save(confirm) {
    const form = formRef.current;
    if (!form) return;
    setMsg("Saving…");
    const data = new URLSearchParams(new FormData(form));
    if (confirm) data.set("confirm", "1");
    try {
      const r = await fetch(`/manual?country=${code}&format=json`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: data.toString(),
      });
      const j = await r.json();
      if (j.warnings && j.warnings.length) {
        setWarnings(j.warnings);
        setMsg("");
        return;
      }
      setWarnings(null);
      await onSaved?.(); // re-fetch the sheet data (updates tables + stat bar in place)
      setMsg(j.saved && j.saved.length ? `✓ Saved ${j.saved.length} — sheet updated` : "No changes");
    } catch {
      setMsg("Save failed");
    }
  }

  return (
    <div className="panel manualp">
      <h3>Manual rates · re-enter every hour</h3>
      <div id="m-warn">
        {warnings ? (
          <div className="warn">
            <b>⚠ These look like typos — not saved.</b>
            <ul style={{ margin: "6px 0 0 18px" }}>
              {warnings.map((w) => (
                <li key={w.key}>
                  {w.label}: <b>{fmt(w.value)}</b> is {w.pct > 0 ? "+" : ""}{w.pct.toFixed(1)}% vs peers (median {fmt(Math.round(w.median))})
                </li>
              ))}
            </ul>
            <button className="btn" style={{ marginTop: 8 }} onClick={() => save(true)}>Save anyway (I checked)</button>
          </div>
        ) : null}
      </div>
      <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
        <div className="mgrid">
          {cards.map((c) => (
            <label className="mcard" key={c.name}>
              <span className="mrow">
                <b>{c.label}</b>
                {c.fresh
                  ? <span className="mst fresh">✓ {c.age}</span>
                  : <span className="mst old">{c.status === "unset" ? "not set" : "expired"}</span>}
              </span>
              <input name={c.name} type="text" inputMode="numeric" pattern="[0-9,]*"
                defaultValue={c.value} placeholder="base KRW" autoComplete="off" />
              <span className="mfee">+ {c.fee.toLocaleString()} fee</span>
            </label>
          ))}
        </div>
        <div className="mact">
          <button className="btn primary" type="button" onClick={() => save(false)} style={{ width: "auto", padding: "12px 22px" }}>
            Save &amp; update sheet
          </button>
          <span id="m-msg" className="msg">{msg}</span>
        </div>
      </form>
    </div>
  );
}
