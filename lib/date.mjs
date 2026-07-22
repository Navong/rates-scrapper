// Pure date helpers — no React / next imports, so API route handlers can use
// these without dragging the UI chrome (and `next/link`) into their bundle.
// Re-exported from lib/ui.jsx so existing `todayStr` imports keep working.

export const todayStr = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
