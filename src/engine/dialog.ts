// Gen 1 dialog box, geometry verified against pret/pokered:
// full-width box at tile (0,12), 20x6 tiles; text rows at tile y 14 and 16,
// x 1, 18 chars per line; typewriter at 3 frames/char (1 while A/B held);
// blinking ▼ at tile (18,16); two-line scroll.
import { TILE } from '../gfx/screen';
import { FONT, spr } from '../gfx/assets';
import { drawWindow } from './window';
import { sfxPressAB } from '../audio/sfx';
import type { Input } from './input';

export const DIALOG_WIDTH = 18;
const SPEED_FRAMES = 3;
const ARROW_BLINK_FRAMES = 30; // ~500ms

export function wordWrap(text: string, width = DIALOG_WIDTH): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    let w = word;
    while (w.length > width) {
      if (line.length > 0) {
        lines.push(line);
        line = '';
      }
      lines.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (line.length === 0) line = w;
    else if (line.length + 1 + w.length <= width) line += ' ' + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

type State =
  | 'reveal'
  | 'wait-line'
  | 'wait-page'
  | 'wait-dismiss'
  | 'done'
  | 'waiting-anim'
  | 'closed';

export interface DialogOpts {
  /** Finish without a final A-press (box stays open, e.g. a menu pops over it). */
  holdAtEnd?: boolean;
}

export class DialogBox {
  private pages: string[][] = [];
  private lines: string[] = [];
  private lineIdx = 0;
  private charIdx = 0;
  private row = 0;
  private shown: [string, string] = ['', ''];
  private delay = 0;
  private state: State = 'closed';
  private waitingBase = '';
  private holdAtEnd = false;

  open(pages: string[], opts?: DialogOpts): void {
    this.holdAtEnd = opts?.holdAtEnd ?? false;
    this.pages = pages.map((p) => wordWrap(p));
    this.nextPage();
  }

  /** Open with an animated "..." line for async waits; never finishes on its own. */
  openWaiting(text: string): void {
    this.state = 'waiting-anim';
    this.waitingBase = wordWrap(text)[0] ?? '';
    this.shown = [this.waitingBase, ''];
  }

  close(): void {
    this.state = 'closed';
    this.pages = [];
    this.shown = ['', ''];
  }

  get active(): boolean {
    return this.state !== 'closed';
  }

  /** All text revealed and acknowledged. */
  get done(): boolean {
    return this.state === 'done';
  }

  private nextPage(): void {
    const page = this.pages.shift();
    if (!page) {
      this.state = 'done';
      return;
    }
    this.lines = page;
    this.lineIdx = 0;
    this.charIdx = 0;
    this.row = 0;
    this.shown = ['', ''];
    this.delay = 0;
    this.state = 'reveal';
  }

  update(input: Input): void {
    switch (this.state) {
      case 'reveal': {
        const speed = input.held('a') || input.held('b') ? 1 : SPEED_FRAMES;
        this.delay++;
        if (this.delay < speed) return;
        this.delay = 0;
        const line = this.lines[this.lineIdx]!;
        if (this.charIdx < line.length) {
          this.shown[this.row === 0 ? 0 : 1] += line[this.charIdx];
          this.charIdx++;
          return;
        }
        // Line complete.
        if (this.lineIdx + 1 >= this.lines.length) {
          if (this.pages.length > 0) this.state = 'wait-page';
          else this.state = this.holdAtEnd ? 'done' : 'wait-dismiss';
          return;
        }
        this.lineIdx++;
        this.charIdx = 0;
        if (this.row === 0) {
          this.row = 1;
        } else {
          this.state = 'wait-line';
        }
        return;
      }
      case 'wait-line': {
        if (input.pressed('a') || input.pressed('b')) {
          sfxPressAB();
          this.shown = [this.shown[1], ''];
          this.state = 'reveal';
        }
        return;
      }
      case 'wait-page': {
        if (input.pressed('a') || input.pressed('b')) {
          sfxPressAB();
          this.nextPage();
        }
        return;
      }
      case 'wait-dismiss': {
        if (input.pressed('a') || input.pressed('b')) {
          sfxPressAB();
          this.state = 'done';
        }
        return;
      }
      default:
        return;
    }
  }

  draw(ctx: CanvasRenderingContext2D, frame: number): void {
    if (this.state === 'closed') return;
    drawWindow(ctx, 0, 12, 20, 6);
    const font = FONT();
    let line0 = this.shown[0];
    if (this.state === 'waiting-anim') {
      const dots = Math.floor(frame / 20) % 4;
      line0 = this.waitingBase + '.'.repeat(dots);
    }
    font.drawTile(ctx, line0, 1, 14);
    font.drawTile(ctx, this.shown[1], 1, 16);
    const waiting = this.state === 'wait-line' || this.state === 'wait-page';
    if (waiting && Math.floor(frame / ARROW_BLINK_FRAMES) % 2 === 0) {
      ctx.drawImage(spr('UI_ARROW_DOWN'), 18 * TILE, 16 * TILE);
    }
  }
}
