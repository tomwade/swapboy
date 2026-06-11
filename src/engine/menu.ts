import { GB_W, TILE } from '../gfx/screen';

const SCREEN_TW = GB_W / TILE;
import { FONT, spr } from '../gfx/assets';
import { drawWindow } from './window';
import { sfxPressAB } from '../audio/sfx';
import type { Input } from './input';

export interface MenuItem {
  label: string;
  /** Optional right-aligned second line (e.g. pool volume). */
  detail?: string;
}

export interface MenuOpts {
  items: MenuItem[];
  /** Tile position of the window's top-left; tx shifts left if needed to keep the window on screen. */
  tx: number;
  ty: number;
  /** Tile width; defaults to fit the longest label + cursor + border. */
  tw?: number;
  initialIndex?: number;
}

export type MenuResult = { kind: 'select'; index: number } | { kind: 'cancel' } | null;

/** Gen 1 menu window: ▶ cursor, one item per 2 tile rows (3 with a detail line). */
export class Menu {
  index: number;
  readonly tx: number;
  readonly ty: number;
  readonly tw: number;
  readonly th: number;
  private items: MenuItem[];
  private rowOf: number[] = [];

  constructor(opts: MenuOpts) {
    this.items = opts.items;
    this.index = opts.initialIndex ?? 0;
    const longest = Math.max(
      ...opts.items.map((i) => Math.max(i.label.length, (i.detail?.length ?? 0))),
    );
    this.tw = opts.tw ?? Math.min(SCREEN_TW, longest + 3);
    this.tx = Math.max(0, Math.min(opts.tx, SCREEN_TW - this.tw));
    this.ty = opts.ty;
    let row = 1;
    for (const item of this.items) {
      this.rowOf.push(row);
      row += item.detail !== undefined ? 3 : 2;
    }
    this.th = row + 1;
  }

  update(input: Input): MenuResult {
    if (input.pressed('up') && this.index > 0) {
      this.index--;
      sfxPressAB();
    }
    if (input.pressed('down') && this.index < this.items.length - 1) {
      this.index++;
      sfxPressAB();
    }
    if (input.pressed('a')) {
      sfxPressAB();
      return { kind: 'select', index: this.index };
    }
    if (input.pressed('b')) {
      sfxPressAB();
      return { kind: 'cancel' };
    }
    return null;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    drawWindow(ctx, this.tx, this.ty, this.tw, this.th);
    const font = FONT();
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      const row = this.rowOf[i]!;
      font.drawTile(ctx, item.label, this.tx + 2, this.ty + row);
      if (item.detail !== undefined) {
        const dx = this.tx + this.tw - 1 - item.detail.length;
        font.drawTile(ctx, item.detail, Math.max(this.tx + 2, dx), this.ty + row + 1);
      }
    }
    const cursorRow = this.rowOf[this.index]!;
    ctx.drawImage(spr('UI_ARROW_RIGHT'), (this.tx + 1) * TILE, (this.ty + cursorRow) * TILE);
  }
}
