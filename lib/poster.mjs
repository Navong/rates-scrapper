// Server-side rate-poster generator (Node runtime only — uses sharp).
// Composes an SVG marketing poster for a corridor/service and rasterizes it to
// PNG, compositing the real GME logo on top. No Canva / OAuth / external calls.
//
// IMPORTANT (Docker): librsvg needs fonts installed or SVG <text> renders blank.
// The Dockerfile installs `ttf-dejavu`; we reference "DejaVu Sans" so text shows
// on Alpine (local dev falls back to the OS's own DejaVu/sans-serif).
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";

const W = 1080, H = 1350;
const RED = "#e4002b";
const INK = "#141414";
const MUTE = "#8a8f98";
const LINE = "#e6e8ec";
const FONT = "DejaVu Sans, Arial, sans-serif";

const won = (n) => "₩" + Math.round(n).toLocaleString("en-US");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Cache the logo as a sized PNG buffer (converted from the source AVIF once).
let _logo = null;
async function logoPng() {
  if (_logo) return _logo;
  const src = path.join(process.cwd(), "public", "gme-logo.avif");
  const buf = await readFile(src);
  const img = sharp(buf);
  const meta = await img.metadata();
  const width = 300;
  const height = Math.round((meta.height / meta.width) * width);
  const png = await img.resize(width).png().toBuffer();
  _logo = { png, width, height };
  return _logo;
}

// data: { countryName, currency, receiveAmount, methodLabel, rate, krw, fee, total, dateStr }
function svg(d) {
  const send = `${d.currency === "USD" ? "$" : ""}${d.receiveAmount.toLocaleString("en-US")}${d.currency !== "USD" ? " " + d.currency : ""}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="0" y="0" width="${W}" height="12" fill="${RED}"/>

  <!-- header label (logo composited on top by sharp) -->
  <text x="${W / 2}" y="300" text-anchor="middle" font-family="${FONT}" font-size="30" letter-spacing="8" fill="${MUTE}">REMITTANCE</text>

  <!-- destination -->
  <text x="${W / 2}" y="392" text-anchor="middle" font-family="${FONT}" font-size="34" fill="${MUTE}">Send money to</text>
  <text x="${W / 2}" y="470" text-anchor="middle" font-family="${FONT}" font-size="76" font-weight="bold" fill="${INK}">${esc(d.countryName)}</text>

  <!-- service pill -->
  <rect x="${W / 2 - 150}" y="510" width="300" height="60" rx="30" fill="${RED}"/>
  <text x="${W / 2}" y="550" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="bold" fill="#ffffff">${esc(d.methodLabel)}</text>

  <!-- hero rate -->
  <text x="${W / 2}" y="700" text-anchor="middle" font-family="${FONT}" font-size="36" fill="${MUTE}">1 ${esc(d.currency)} =</text>
  <text x="${W / 2}" y="852" text-anchor="middle" font-family="${FONT}" font-size="180" font-weight="bold" fill="${RED}">${won(d.rate)}</text>

  <line x1="140" y1="950" x2="${W - 140}" y2="950" stroke="${LINE}" stroke-width="2"/>

  <!-- breakdown -->
  <text x="150" y="1030" font-family="${FONT}" font-size="38" fill="${INK}">You send</text>
  <text x="${W - 150}" y="1030" text-anchor="end" font-family="${FONT}" font-size="38" font-weight="bold" fill="${INK}">${esc(send)}</text>

  <text x="150" y="1100" font-family="${FONT}" font-size="38" fill="${INK}">You pay</text>
  <text x="${W - 150}" y="1100" text-anchor="end" font-family="${FONT}" font-size="38" font-weight="bold" fill="${INK}">${won(d.total)}</text>

  <text x="150" y="1160" font-family="${FONT}" font-size="28" fill="${MUTE}">Includes ${won(d.fee)} transfer fee</text>

  <!-- footer -->
  <rect x="0" y="${H - 90}" width="${W}" height="90" fill="#faf5f6"/>
  <text x="150" y="${H - 35}" font-family="${FONT}" font-size="28" fill="${MUTE}">Rates as of ${esc(d.dateStr)}</text>
  <text x="${W - 150}" y="${H - 35}" text-anchor="end" font-family="${FONT}" font-size="28" font-weight="bold" fill="${RED}">rates.nathanc.site</text>
</svg>`;
}

export async function posterPNG(d) {
  const base = Buffer.from(svg(d));
  const { png, width, height } = await logoPng();
  return sharp(base)
    .composite([{ input: png, top: 150, left: Math.round((W - width) / 2) }])
    .png()
    .toBuffer();
}
