// Generate PWA icons without native image libraries. Draw the Pace mark,
// a short path and stop matching the Day Line, and encode PNGs directly.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

// PNG encoding
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

// Drawing
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

  // Draw the path, stop ring, and end dot with signed distances, matching
// the geometry in components/Logo.tsx.
  const s = contentScale;
  const P = (ux, uy) => [c + (ux - 0.5) * size * s, c + (uy - 0.5) * size * s];
  const [ax, ay] = P(0.2, 0.68);
  const [bx, by] = P(0.48, 0.2);
  const [ex, ey] = P(0.84, 0.44);
  const samples = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const mt = 1 - t;
    samples.push([mt * mt * ax + 2 * mt * t * bx + t * t * ex, mt * mt * ay + 2 * mt * t * by + t * t * ey]);
  }
  const pathW = size * 0.1 * s;
  const stopT = 0.62;
  const mt = 1 - stopT;
  const [sx, sy] = [mt * mt * ax + 2 * mt * stopT * bx + stopT * stopT * ex, mt * mt * ay + 2 * mt * stopT * by + stopT * stopT * ey];
  const stopR = size * 0.13 * s;
  const stopW = size * 0.085 * s;
  const dotR = size * 0.06 * s;

  const sdPath = (px, py) => {
    let best = Infinity;
    for (let i = 1; i < samples.length; i++) {
      const [x0, y0] = samples[i - 1];
      const [x1, y1] = samples[i];
      const vx = x1 - x0, vy = y1 - y0;
      const wx = px - x0, wy = py - y0;
      const tt = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy || 1)));
      const d = Math.hypot(px - (x0 + tt * vx), py - (y0 + tt * vy));
      if (d < best) best = d;
    }
    return best - pathW / 2;
  };

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

      // Warm off-white mark: path, then the stop ring (teal center), then the end dot.
      const dStop = Math.hypot(px - sx, py - sy);
      let aMark = clamp01(0.5 - sdPath(px, py));
      // Cut the path out of the stop's interior so the ring reads as a ring.
      if (dStop < stopR - stopW / 2) aMark = 0;
      aMark = Math.max(aMark, clamp01(0.5 - (Math.abs(dStop - stopR) - stopW / 2)));
      aMark = Math.max(aMark, clamp01(0.5 - (Math.hypot(px - ex, py - ey) - dotR)));
      if (aMark > 0) {
        rC = Math.round(rC + (246 - rC) * aMark);
        gC = Math.round(gC + (244 - gC) * aMark);
        bC = Math.round(bC + (239 - bC) * aMark);
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

// ICO container holding PNG images (supported by every current browser and by Google).
function encodeICO(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

writeFileSync(join(outDir, "icon-192.png"), render(192));
writeFileSync(join(outDir, "icon-512.png"), render(512));
writeFileSync(join(outDir, "icon-maskable-512.png"), render(512, { fullBleed: true, contentScale: 0.78 }));
writeFileSync(join(outDir, "apple-touch-icon.png"), render(180, { fullBleed: true, contentScale: 0.9 }));
// Google Search requires a favicon whose size is a multiple of 48px; it fetches /favicon.ico.
writeFileSync(
  join(outDir, "..", "favicon.ico"),
  encodeICO([16, 32, 48].map((size) => ({ size, data: render(size) })))
);
console.log("Icons written to", outDir);
