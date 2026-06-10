import type { Palette } from './palette';

// Pixel art is authored as template-literal string grids:
//   '.' = transparent, '0'..'3' = palette index (0 lightest .. 3 darkest).
// Rows are newline-separated; leading/trailing blank lines are ignored.
// Rows may have different lengths; short rows are padded with transparency.

export interface PixelGrid {
  w: number;
  h: number;
  /** Row-major palette indices; -1 = transparent. */
  px: Int8Array;
}

export function parseGrid(src: string): PixelGrid {
  const rows = src.split('\n').filter((r) => r.trim().length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const px = new Int8Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) {
      const c = row[x]!;
      if (c >= '0' && c <= '3') px[y * w + x] = c.charCodeAt(0) - 48;
    }
  }
  return { w, h, px };
}

/** Bake a grid to a canvas with a concrete palette (one per palette in use). */
export function bakeGrid(grid: PixelGrid, palette: Palette): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = grid.w;
  canvas.height = grid.h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(grid.w, grid.h);
  for (let i = 0; i < grid.px.length; i++) {
    const idx = grid.px[i]!;
    if (idx < 0) continue;
    const [r, g, b] = palette[idx as 0 | 1 | 2 | 3];
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * A sprite baked for every fade level of the base palette (0..4), so palette
 * fades are a per-frame lookup rather than a re-bake.
 */
export interface BakedSprite {
  w: number;
  h: number;
  byFade: HTMLCanvasElement[];
}

export function bakeSprite(grid: PixelGrid, palettes: Palette[]): BakedSprite {
  return {
    w: grid.w,
    h: grid.h,
    byFade: palettes.map((p) => bakeGrid(grid, p)),
  };
}

/** Draw horizontally mirrored (Game Boy OAM X-flip — used for right-facing frames). */
export function drawFlipped(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(img, -x - img.width, y);
  ctx.restore();
}
