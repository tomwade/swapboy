// Render string-grid pixel art ('.'=transparent, '0'-'3'=shades) to upscaled PNGs
// for visual inspection. Zero dependencies (hand-rolled PNG via zlib).
//
//   node tools/render-art.mjs src/gfx/art/tiles.ts [scale]
//
// Writes tools/out/<module>/<EXPORT_NAME>.png for every exported grid string.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHADES = [
  [0xff, 0xff, 0xff],
  [0xaa, 0xaa, 0xaa],
  [0x55, 0x55, 0x55],
  [0x00, 0x00, 0x00],
];
// Transparent renders as a pink checker so it can't be confused with white.
const CHECKER_A = [0xff, 0xc0, 0xd8];
const CHECKER_B = [0xf0, 0xa0, 0xc0];

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function pngFromRGB(width, height, rgb) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    rgb.copy(raw, y * (1 + width * 3) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function looksLikeGrid(v) {
  if (typeof v !== 'string') return false;
  const rows = v.split('\n').filter((r) => r.trim().length > 0);
  return rows.length >= 2 && rows.every((r) => /^[.0-3]+\s*$/.test(r));
}

function renderGrid(src, scale) {
  const rows = src.split('\n').filter((r) => r.trim().length > 0).map((r) => r.trimEnd());
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const W = w * scale;
  const H = h * scale;
  const rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = Math.floor(x / scale);
      const gy = Math.floor(y / scale);
      const c = rows[gy][gx];
      let col;
      if (c >= '0' && c <= '3') col = SHADES[c.charCodeAt(0) - 48];
      else col = (gx + gy) % 2 === 0 ? CHECKER_A : CHECKER_B;
      const o = (y * W + x) * 3;
      rgb[o] = col[0];
      rgb[o + 1] = col[1];
      rgb[o + 2] = col[2];
    }
  }
  return { png: pngFromRGB(W, H, rgb), w, h };
}

const [, , modulePath, scaleArg] = process.argv;
if (!modulePath) {
  console.error('usage: node tools/render-art.mjs <path/to/art-module.ts> [scale=8]');
  process.exit(1);
}
const scale = Number(scaleArg ?? 8);
const mod = await import(pathToFileURL(resolve(modulePath)).href);
const outDir = resolve('tools/out', basename(modulePath).replace(/\.[tj]s$/, ''));
mkdirSync(outDir, { recursive: true });
let count = 0;
for (const [name, value] of Object.entries(mod)) {
  if (!looksLikeGrid(value)) continue;
  const { png, w, h } = renderGrid(value, scale);
  const file = resolve(outDir, `${name}.png`);
  writeFileSync(file, png);
  console.log(`${name}: ${w}x${h} -> ${file}`);
  count++;
}
if (count === 0) console.log('No grid exports found.');
