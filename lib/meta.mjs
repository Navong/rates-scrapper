// Single source of truth for the build credit / copyright shown on every page.
export const APP_NAME = "Remittance Rate Comparison";
export const AUTHOR = "Nathan";
export const TEAM = "Cambodia Team";
export const YEAR = 2026;

export const CREDIT = `Built by ${AUTHOR} · ${TEAM}`;
export const COPYRIGHT = `© ${YEAR} ${AUTHOR} — ${TEAM}. All rights reserved.`;

/** Footer markup shared by the dashboard, sheet view, stats and manual pages. */
export const CREDIT_HTML = `<div class="credit">${CREDIT}</div>`;

export const CREDIT_CSS = `
  .credit{margin-top:26px;padding-top:12px;border-top:1px solid rgba(128,128,128,.25);
          font-size:12px;color:#8a8f98;line-height:1.6;text-align:center}
`;
