// Generates app/icon.png (the browser-tab favicon) from public/gme-logo.avif:
// the GME logo rendered in WHITE on a rounded RED tile, so it's bold and legible
// at 16px tab size (a red wordmark on white reads as blank when shrunk).
// Run once: node scripts/gen-icon.mjs   (needs sharp: npm i sharp --no-save)
import sharp from "sharp";

const SRC = "public/gme-logo.avif";
const OUT = "app/icon.png";
const S = 128, pad = 12, radius = 26;
const RED = { r: 0xe4, g: 0x00, b: 0x2b };

const meta = await sharp(SRC).metadata();
const scale = (S - pad * 2) / meta.width;
const lw = Math.round(meta.width * scale);
const lh = Math.round(meta.height * scale);

// White silhouette of the logo: take its alpha as a mask over a white block.
const alpha = await sharp(SRC).resize(lw, lh).ensureAlpha().extractChannel(3).toColourspace("b-w").toBuffer();
const whiteLogo = await sharp({ create: { width: lw, height: lh, channels: 3, background: { r: 255, g: 255, b: 255 } } })
  .joinChannel(alpha).png().toBuffer();

// Rounded red tile (corners cut to transparent via an SVG mask).
const round = Buffer.from(`<svg width="${S}" height="${S}"><rect width="${S}" height="${S}" rx="${radius}" ry="${radius}"/></svg>`);
const tile = await sharp({ create: { width: S, height: S, channels: 4, background: { ...RED, alpha: 1 } } })
  .composite([{ input: round, blend: "dest-in" }]).png().toBuffer();

// White logo centered on the red tile.
await sharp(tile)
  .composite([{ input: whiteLogo, left: Math.round((S - lw) / 2), top: Math.round((S - lh) / 2) }])
  .png().toFile(OUT);

console.log(`wrote ${OUT} — ${S}x${S}, white logo (${lw}x${lh}) on red tile`);
