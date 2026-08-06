"use client";

// Inline service-fee editor for a corridor. Lists every provider × method with
// its effective fee; saving posts overrides to /fees and re-fetches the sheet so
// totals update in place. Collapsed by default since fees change rarely.

import { useRef, useState } from "react";

export default function FeeEditor({ code, cards, onSaved }) {
  const formRef = useRef(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const form = formRef.current;
    if (!form || saving) return;
    setSaving(true);
    setMsg("Saving…");
    const data = new URLSearchParams(new FormData(form));
    try {
      const r = await fetch(`/fees?country=${code}&format=json`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: data.toString(),
      });
      const j = await r.json();
      await onSaved?.();
      setMsg(j.saved && j.saved.length ? `✓ Updated ${j.saved.length} fee(s)` : "No changes");
    } catch {
      setMsg("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="panel feep">
      <summary>⚙ Edit service fees</summary>
      <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
        <div className="feegrid">
          {cards.map((c) => (
            <label className="feecard" key={c.name}>
              <span className="mrow">
                <b>{c.label}</b>
                {c.override ? <span className="mst fresh">edited</span> : null}
              </span>
              <input name={c.name} type="text" inputMode="numeric" pattern="[0-9,]*"
                defaultValue={c.fee.toLocaleString("en-US")} autoComplete="off" />
              <span className="mfee">default {c.def.toLocaleString("en-US")} · empty = reset</span>
            </label>
          ))}
        </div>
        <div className="mact">
          <button className={"btn primary" + (saving ? " spin" : "")} type="button" onClick={save} style={{ width: "auto", padding: "12px 22px" }}>
            Save fees
          </button>
          <span className="msg">{msg}</span>
        </div>
      </form>
    </details>
  );
}
