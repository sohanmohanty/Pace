// Zero-dependency PWA icon generator.
// Draws the Pace mark (three growing bars on a teal rounded square) and
// encodes PNGs by hand — no native image libraries needed.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

// ---- PNG encoding -----------------------------------------------------------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// ---- Drawing ----------------------------------------------------------------
// Signed distance to a rounded rectangle centered at (cx, cy).
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - r;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Render the icon.
 * fullBleed: paint the background over the whole square (maskable / apple-touch).
 * contentScale: shrink the mark for maskable safe zones.
 */
function render(size, { fullBleed = false, contentScale = 1 } = {}) {
  const pix = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const bgHalf = fullBleed ? size / 2 : size * 0.5 * 0.96;
  const bgRadius = fullBleed ? 0 : size * 0.22;

  // Three left-aligned bars, growing in width: quiet "momentum" mark.
  const s = contentScale;
  const barH = size * 0.088 * s;
  const barR = barH / 2;
  const left = c - size * 0.27 * s;
  const widths = [0.28, 0.40, 0.54].map((w) => size * w * s);
  const ys = [-0.155, 0, 0.155].map((o) => c + size * o * s);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const dBg = sdRoundRect(px, py, c, c, bgHalf, bgHalf, bgRadius);
      const aBg = fullBleed ? 1 : clamp01(0.5 - dBg);
      if (aBg <= 0) continue;

      // Vertical teal gradient.
      const t = py / size;
      let rC = Math.round(14 + (10 - 14) * t);
      let gC = Math.round(114 + (94 - 114) * t);
      let bC = Math.round(104 + (87 - 104) * t);

      // Bars in warm off-white.
      let aBar = 0;
      for (let i = 0; i < 3; i++) {
        const d = sdRoundRect(px, py, left + widths[i] / 2, ys[i], widths[i] / 2, barH / 2, barR);
        aBar = Math.max(aBar, clamp01(0.5 - d));
      }
      if (aBar > 0) {
        rC = Math.round(rC + (246 - rC) * aBar);
        gC = Math.round(gC + (244 - gC) * aBar);
        bC = Math.round(bC + (239 - bC) * aBar);
      }

      const idx = (y * size + x) * 4;
      pix[idx] = rC;
      pix[idx + 1] = gC;
      pix[idx + 2] = bC;
      pix[idx + 3] = Math.round(aBg * 255);
    }
  }
  return encodePNG(size, size, pix);
}

writeFileSync(join(outDir, "icon-192.png"), render(192));
writeFileSync(join(outDir, "icon-512.png"), render(512));
writeFileSync(join(outDir, "icon-maskable-512.png"), render(512, { fullBleed: true, contentScale: 0.78 }));
writeFileSync(join(outDir, "apple-touch-icon.png"), render(180, { fullBleed: true, contentScale: 0.9 }));
console.log("Icons written to", outDir);
