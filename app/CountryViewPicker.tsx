"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export default function CountryViewPicker({ countries, country, activeView, onCountryChange, admin = false }) {
  const listId = useId();
  const rootRef = useRef(null);
  const selected = countries.find((c) => c.code === country);
  const [query, setQuery] = useState(selected ? `${selected.flag} ${selected.name}` : "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term || query === `${selected?.flag} ${selected?.name}`) return countries;
    return countries.filter((c) =>
      c.name.toLowerCase().includes(term) || c.code.toLowerCase().includes(term)
    );
  }, [countries, query, selected]);

  useEffect(() => {
    const next = countries.find((c) => c.code === country);
    if (next) setQuery(`${next.flag} ${next.name}`);
  }, [countries, country]);

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  function choose(next) {
    setQuery(`${next.flag} ${next.name}`);
    setOpen(false);
    setActiveIndex(0);
    if (next.code === country) return;
    onCountryChange(next.code);
    window.history.replaceState(null, "", `${window.location.pathname}?country=${next.code}`);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && open && filtered[activeIndex]) {
      event.preventDefault();
      choose(filtered[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      if (selected) setQuery(`${selected.flag} ${selected.name}`);
    }
  }

  return (
    <section className="country-view-picker" aria-label="Country and view selection">
      <div className="country-search" ref={rootRef}>
        <label htmlFor={listId}>Search country</label>
        <div className={`country-search-field${open ? " open" : ""}`}>
          <span className="search-icon" aria-hidden="true" />
          <input
            id={listId}
            value={query}
            placeholder="Type a country name or code"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${listId}-options`}
            aria-autocomplete="list"
            aria-activedescendant={open && filtered[activeIndex] ? `${listId}-${filtered[activeIndex].code}` : undefined}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={(e) => {
              e.currentTarget.select();
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className="country-chevron"
            aria-label={open ? "Close country list" : "Open country list"}
            tabIndex={-1}
            onClick={() => setOpen((v) => !v)}
          />
        </div>

        {open ? (
          <div className="country-menu" id={`${listId}-options`} role="listbox">
            <div className="country-menu-head">
              <span>{filtered.length} {filtered.length === 1 ? "country" : "countries"}</span>
              <span>Type to filter</span>
            </div>
            <div className="country-options">
              {filtered.length ? filtered.map((c, i) => (
                <button
                  type="button"
                  role="option"
                  id={`${listId}-${c.code}`}
                  aria-selected={c.code === country}
                  className={`${c.code === country ? "selected " : ""}${i === activeIndex ? "active" : ""}`}
                  key={c.code}
                  onPointerMove={() => setActiveIndex(i)}
                  onClick={() => choose(c)}
                >
                  <span className="country-flag" aria-hidden="true">{c.flag}</span>
                  <span className="country-option-name">
                    <b>{c.name}</b>
                    <small>South Korea → {c.name}</small>
                  </span>
                  <span className="country-code">{c.code}</span>
                  {c.code === country ? <span className="country-check" aria-hidden="true">✓</span> : null}
                </button>
              )) : (
                <div className="country-empty">
                  <b>No country found</b>
                  <span>Try a country name or two-letter code.</span>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className={`view-switch${admin ? " with-stats" : ""}`} aria-label="Choose a view">
        <Link
          className={activeView === "dashboard" ? "on" : ""}
          href={`/?country=${country}`}
          aria-current={activeView === "dashboard" ? "page" : undefined}
        >
          Dashboard
        </Link>
        <Link
          className={activeView === "sheet" ? "on" : ""}
          href={`/ranking?country=${country}`}
          aria-current={activeView === "sheet" ? "page" : undefined}
        >
          Sheet view
        </Link>
        <Link
          className={activeView === "history" ? "on" : ""}
          href={`/history?country=${country}`}
          aria-current={activeView === "history" ? "page" : undefined}
        >
          Rate graph
        </Link>
        {admin ? <Link href="/stats">Usage stats</Link> : null}
      </div>
    </section>
  );
}
