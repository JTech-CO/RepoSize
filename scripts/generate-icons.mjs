// Generates the RepoSize extension icons (16/32/48/128 px) as PNGs with no
// third-party dependencies — a tiny pure-JS PNG encoder plus 4x supersampled
// rasterisation for smooth edges.
//
// Design: a rounded dark tile with three growing bars (green → amber → red),
// echoing the extension's size-warning levels.
//
// Run with: npm run icons

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling factor

const COLORS = {
  bg: [22, 27, 34], // #161b22
  bar1: [63, 185, 80], // #3fb950 green
  bar2: [210, 153, 34], // #d29922 amber
  bar3: [248, 81, 73], // #f85149 red
};

// Three stadium-shaped bars of increasing length, vertically centred.
const BARS = [
  { x0: 0.2, x1: 0.54, yc: 0.28, color: COLORS.bar1 },
  { x0: 0.2, x1: 0.66, yc: 0.5, color: COLORS.bar2 },
  { x0: 0.2, x1: 0.8, yc: 0.72, color: COLORS.bar3 },
];
const BAR_HEIGHT = 0.14;
const CORNER = 0.22; // tile corner radius (normalised)

function insideRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx0 = x0 + r;
  const cx1 = x1 - r;
  const cy0 = y0 + r;
  const cy1 = y1 - r;
  if (x < cx0 && y < cy0) return (x - cx0) ** 2 + (y - cy0) ** 2 <= r * r;
  if (x > cx1 && y < cy0) return (x - cx1) ** 2 + (y - cy0) ** 2 <= r * r;
  if (x < cx0 && y > cy1) return (x - cx0) ** 2 + (y - cy1) ** 2 <= r * r;
  if (x > cx1 && y > cy1) return (x - cx1) ** 2 + (y - cy1) ** 2 <= r * r;
  return true;
}

/** Returns [r,g,b,a] for a normalised point, or null for transparent. */
function sample(u, v) {
  const r = BAR_HEIGHT / 2;
  for (const bar of BARS) {
    if (insideRoundRect(u, v, bar.x0, bar.yc - r, bar.x1, bar.yc + r, r)) {
      return bar.color;
    }
  }
  if (insideRoundRect(u, v, 0, 0, 1, 1, CORNER)) return COLORS.bg;
  return null;
}

function renderRGBA(size) {
  const hi = size * SS;
  const rgba = Buffer.alloc(size * size * 4);

  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = tx * SS + sx;
          const py = ty * SS + sy;
          const u = (px + 0.5) / hi;
          const v = (py + 0.5) / hi;
          const c = sample(u, v);
          if (c) {
            rSum += c[0];
            gSum += c[1];
            bSum += c[2];
            aSum += 255;
          }
        }
      }
      const n = SS * SS;
      const o = (ty * size + tx) * 4;
      // Average colour is weighted only by covered subpixels so edges keep
      // their true colour while alpha fades.
      const covered = aSum / 255;
      rgba[o] = covered ? Math.round(rSum / covered) : 0;
      rgba[o + 1] = covered ? Math.round(gSum / covered) : 0;
      rgba[o + 2] = covered ? Math.round(bSum / covered) : 0;
      rgba[o + 3] = Math.round(aSum / n);
    }
  }
  return rgba;
}

// --- Minimal PNG encoder ---------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 already zero: compression / filter / interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Main ------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const png = encodePNG(size, renderRGBA(size));
  const file = join(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, png);
  console.log(`  icon${size}.png  (${png.length} bytes)`);
}
console.log('Icons written to public/icons/');
