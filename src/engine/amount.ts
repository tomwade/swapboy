// Gen 1 Mart-counter style amount entry, generalized to a multi-digit register.
// Internally a bigint in token base units — no floats anywhere.
import { formatUnits } from 'viem';
import { TILE } from '../gfx/screen';
import { FONT } from '../gfx/assets';
import { drawWindow } from './window';
import { sfxPressAB, sfxBump } from '../audio/sfx';
import type { Input } from './input';

const HOLD_DELAY = 15; // frames before auto-repeat
const HOLD_EVERY = 4;

export interface AmountOpts {
  decimals: number;
  /** Max enterable (already gas-adjusted for native). Base units. */
  max: bigint;
  symbol: string;
  /** Raw balance for the BAG line. Base units. */
  balance: bigint;
}

export type AmountResult = 'confirm' | 'cancel' | null;

export class AmountEntry {
  value = 0n;
  private caret = 0;
  private intDigits: number;
  private fracDigits: number;
  private holdUp = 0;
  private holdDown = 0;

  constructor(private opts: AmountOpts) {
    this.fracDigits = Math.min(6, opts.decimals);
    const maxWhole = opts.max / 10n ** BigInt(opts.decimals);
    this.intDigits = Math.max(2, Math.min(7, maxWhole.toString().length));
    // Start the caret on the first fractional digit for small balances,
    // on the last integer digit otherwise.
    this.caret = maxWhole > 0n ? this.intDigits - 1 : this.intDigits;
  }

  private slotCount(): number {
    return this.intDigits + this.fracDigits;
  }

  /** Base-unit step for the digit slot under the caret. */
  private stepOf(slot: number): bigint {
    const exp =
      slot < this.intDigits
        ? this.opts.decimals + (this.intDigits - 1 - slot)
        : this.opts.decimals - 1 - (slot - this.intDigits);
    return exp >= 0 ? 10n ** BigInt(exp) : 0n;
  }

  private bump(dir: 1 | -1): void {
    const step = this.stepOf(this.caret);
    if (step === 0n) return;
    if (dir > 0) {
      const next = this.value + step;
      this.value = next > this.opts.max ? this.opts.max : next;
    } else {
      this.value = this.value >= step ? this.value - step : 0n;
    }
    sfxPressAB();
  }

  update(input: Input): AmountResult {
    if (input.pressed('left') && this.caret > 0) {
      this.caret--;
      sfxPressAB();
    }
    if (input.pressed('right') && this.caret < this.slotCount() - 1) {
      this.caret++;
      sfxPressAB();
    }

    const repeat = (held: boolean, counter: number): [boolean, number] => {
      if (!held) return [false, 0];
      counter++;
      const fire = counter === 1 || (counter > HOLD_DELAY && (counter - HOLD_DELAY) % HOLD_EVERY === 0);
      return [fire, counter];
    };
    let fire: boolean;
    [fire, this.holdUp] = repeat(input.held('up'), this.holdUp);
    if (fire) this.bump(1);
    [fire, this.holdDown] = repeat(input.held('down'), this.holdDown);
    if (fire) this.bump(-1);

    if (input.pressed('a')) {
      if (this.value <= 0n) {
        sfxBump();
        return null;
      }
      sfxPressAB();
      return 'confirm';
    }
    if (input.pressed('b')) {
      sfxPressAB();
      return 'cancel';
    }
    return null;
  }

  /** Fixed-slot display string, e.g. "00.042500". */
  private display(): string {
    const dec = BigInt(this.opts.decimals);
    const whole = this.value / 10n ** dec;
    const frac = this.value % 10n ** dec;
    const wholeStr = whole.toString().padStart(this.intDigits, '0').slice(-this.intDigits);
    const fracStr = frac
      .toString()
      .padStart(this.opts.decimals, '0')
      .slice(0, this.fracDigits)
      .padEnd(this.fracDigits, '0');
    return this.fracDigits > 0 ? `${wholeStr}.${fracStr}` : wholeStr;
  }

  /** Pixel x of the caret within the display string (skips the '.'). */
  private caretCol(): number {
    return this.caret < this.intDigits ? this.caret : this.caret + 1;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const font = FONT();
    const text = `*${this.display()}`;
    const balText = `BAG ${trimAmount(formatUnits(this.opts.balance, this.opts.decimals))} ${this.opts.symbol}`;
    const innerW = Math.max(text.length, Math.min(balText.length, 16));
    const tw = innerW + 2;
    const tx = Math.max(0, 19 - tw);
    const ty = 4;
    drawWindow(ctx, tx, ty, tw, 7);
    font.drawTile(ctx, text, tx + 1, ty + 1);
    font.draw(ctx, '^', (tx + 1 + 1 + this.caretCol()) * TILE, (ty + 2) * TILE + 2);
    font.drawTile(ctx, balText.slice(0, innerW), tx + 1, ty + 4);
  }
}

/** Trim a decimal string to ~5 significant-ish display chars: "1.2491". */
export function trimAmount(s: string, maxLen = 9): string {
  if (!s.includes('.')) return s.length > maxLen ? s.slice(0, maxLen) : s;
  let out = s.slice(0, Math.max(s.indexOf('.') + 2, maxLen));
  out = out.replace(/0+$/, '').replace(/\.$/, '');
  return out;
}
