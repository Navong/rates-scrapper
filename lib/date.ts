// Pure date helpers — no React / next imports, so API route handlers can use
// these without dragging the UI chrome (and `next/link`) into their bundle.
// Re-exported from lib/ui.jsx so existing `todayStr` imports keep working.

export const KOREA_TIME_ZONE = "Asia/Seoul";

const partsFor = (d, options) => Object.fromEntries(
  new Intl.DateTimeFormat("en-US", { timeZone: KOREA_TIME_ZONE, ...options })
    .formatToParts(d)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]),
);

export const todayStr = (d = new Date()) => {
  const p = partsFor(d, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
};

export const koreaTime24 = (d = new Date()) => {
  const p = partsFor(d, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${p.hour}:${p.minute}`;
};

export const koreaTime12 = (d = new Date()) => new Intl.DateTimeFormat("en-US", {
  timeZone: KOREA_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true,
}).format(d);
