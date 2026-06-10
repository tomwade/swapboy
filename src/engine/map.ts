import { spr } from '../gfx/assets';

export const META = 16; // metatile size: movement/collision grid unit
export const MAP_W = 10;
export const MAP_H = 9;

// W top wall, w side wall, S shelf, C counter, P wall PC, B bench, p plant,
// M doormat, F diamond floor, f plain floor (service strip behind the counter,
// where the nurse stands — shelves at its right end keep the player out).
const GRID = [
  'WWWWWWWWWW',
  'wSSSSSSSWw',
  'wffffffSSw',
  'wCCCCCCFFP',
  'BFFFFFFFFw',
  'BFFFFFFFFw',
  'pFFFFFFFpw',
  'wFFFMMFFFw',
  'WWWWWWWWWW',
];

const SPRITE_OF: Record<string, string> = {
  W: 'TILE_WALL_TOP',
  w: 'TILE_WALL_SIDE',
  S: 'TILE_SHELF',
  C: 'TILE_COUNTER',
  P: 'TILE_PC',
  B: 'TILE_BENCH',
  p: 'TILE_PLANT',
  M: 'TILE_MAT',
  F: 'TILE_FLOOR',
  f: 'TILE_FLOOR_PLAIN',
};

const SOLID = new Set(['W', 'w', 'S', 'C', 'P', 'B', 'p']);

export interface Npc {
  id: string;
  cx: number;
  cy: number;
  sprite: string;
}

export const NPCS: Npc[] = [
  // Stands on the floor strip behind the counter.
  { id: 'nurse', cx: 3, cy: 2, sprite: 'NURSE_DOWN' },
  // Sits ON the bench tile at the left wall.
  { id: 'bench_man', cx: 0, cy: 4, sprite: 'MAN_SEATED' },
];

export const SPAWN = { cx: 4, cy: 7 };

export function isSolid(cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= MAP_W || cy >= MAP_H) return true;
  const ch = GRID[cy]![cx]!;
  if (SOLID.has(ch)) return true;
  return NPCS.some((n) => n.cx === cx && n.cy === cy);
}

/** What the player interacts with when facing tile (cx, cy). */
export function targetAt(cx: number, cy: number): string | null {
  if (cy === 3 && cx >= 1 && cx <= 6) return 'nurse'; // talk across the counter
  if (cx === 9 && cy === 3) return 'pc';
  if (cx === 0 && cy === 4) return 'bench_man';
  return null;
}

export function drawMap(ctx: CanvasRenderingContext2D): void {
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const name = SPRITE_OF[GRID[y]![x]!]!;
      ctx.drawImage(spr(name), x * META, y * META);
    }
  }
}

export function drawNpcs(ctx: CanvasRenderingContext2D): void {
  for (const n of NPCS) {
    // Characters draw 4px above their tile, Gen 1 style.
    ctx.drawImage(spr(n.sprite), n.cx * META, n.cy * META - 4);
  }
}
