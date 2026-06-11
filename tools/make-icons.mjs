// Generate favicon + apple-touch-icon PNGs from the TITLE_UNICORN string grid.
// Zero dependencies (hand-rolled RGBA PNG via zlib, same scheme as render-art).
//
//   node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// B/W sprite shades (white body + black outline reads on light and dark tabs).
const SHADES = [
  [0xff, 0xff, 0xff],
  [0xaa, 0xaa, 0xaa],
  [0x55, 0x55, 0x55],
  [0x00, 0x00, 0x00],
];
const DMG_LIGHTEST = [0x9b, 0xbc, 0x0f];

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

function pngFromRGBA(width, height, rgba) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: truecolor + alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Parse a string grid into rows of chars, trimmed to the content bounding box. */
function parseTrimmed(grid) {
  const rows = grid.split('\n').filter((r) => r.length > 0);
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '.') {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  });
  return rows.slice(minY, maxY + 1).map((row) => row.slice(minX, maxX + 1));
}

/**
 * Draw the grid at integer `scale`, centered on a size x size canvas.
 * `bg` = [r,g,b] for an opaque background, or null for transparency.
 */
function renderIcon(rows, size, scale, bg) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    if (bg) {
      rgba[i * 4] = bg[0];
      rgba[i * 4 + 1] = bg[1];
      rgba[i * 4 + 2] = bg[2];
      rgba[i * 4 + 3] = 255;
    }
  }
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const ox = Math.floor((size - w * scale) / 2);
  const oy = Math.floor((size - h * scale) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < (rows[y] ?? '').length; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === undefined) continue;
      const [r, g, b] = SHADES[Number(ch)];
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = ox + x * scale + dx;
          const py = oy + y * scale + dy;
          if (px < 0 || py < 0 || px >= size || py >= size) continue;
          const o = (py * size + px) * 4;
          rgba[o] = r;
          rgba[o + 1] = g;
          rgba[o + 2] = b;
          rgba[o + 3] = 255;
        }
      }
    }
  }
  return pngFromRGBA(size, size, rgba);
}

const { TITLE_UNICORN } = await import(
  pathToFileURL(resolve('src/gfx/art/title.ts')).href
);
const unicorn = parseTrimmed(TITLE_UNICORN);
console.log(`unicorn bbox: ${Math.max(...unicorn.map((r) => r.length))}x${unicorn.length}`);

writeFileSync('public/favicon.png', renderIcon(unicorn, 64, 1, null));
console.log('wrote public/favicon.png (64x64, transparent)');

writeFileSync('public/apple-touch-icon.png', renderIcon(unicorn, 180, 3, DMG_LIGHTEST));
console.log('wrote public/apple-touch-icon.png (180x180, DMG green)');
