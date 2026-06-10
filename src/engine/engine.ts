import { createScreen, GB_W, GB_H, type Screen } from '../gfx/screen';
import { BW, fadedPalette } from '../gfx/palette';
import { createInput, type Input } from './input';
import { unlockAudio } from '../audio/apu';
import type { EngineToReact, ReactToEngine } from '../bridge/events';

export interface Scene {
  enter?(): void;
  exit?(): void;
  /** Async results from the bridge, drained at the start of each tick. */
  onAction?(a: ReactToEngine): void;
  update(): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

const STEP_MS = 1000 / 59.7275; // DMG refresh rate
const MAX_STEPS = 5; // background-tab catch-up clamp
const FADE_STEP_FRAMES = 8;

export class GameEngine {
  readonly screen: Screen;
  readonly input: Input;
  frame = 0;
  /** 0 = normal palette, 4 = fully white. */
  fadeLevel = 0;

  private stack: Scene[] = [];
  private inbox: ReactToEngine[] = [];
  private emitListeners = new Set<(e: EngineToReact) => void>();
  private rafId = 0;
  private last = -1;
  private acc = 0;
  private seqCounter = 0;
  private fadeAnim: { dir: 1 | -1; nextAt: number; onDone?: () => void } | null = null;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.screen = createScreen(canvas);
    this.input = createInput(() => unlockAudio());
  }

  nextSeq(): number {
    return ++this.seqCounter;
  }

  emit(e: EngineToReact): void {
    for (const l of this.emitListeners) l(e);
  }

  onEmit(l: (e: EngineToReact) => void): () => void {
    this.emitListeners.add(l);
    return () => this.emitListeners.delete(l);
  }

  dispatch(a: ReactToEngine): void {
    this.inbox.push(a);
  }

  get scene(): Scene | undefined {
    return this.stack[this.stack.length - 1];
  }

  push(s: Scene): void {
    this.stack.push(s);
    s.enter?.();
  }

  pop(): void {
    const s = this.stack.pop();
    s?.exit?.();
  }

  replace(s: Scene): void {
    while (this.stack.length > 0) this.pop();
    this.push(s);
  }

  /** Fade to white over 4 steps, then run onDone (scene updates pause meanwhile). */
  fadeOut(onDone?: () => void): void {
    this.fadeAnim = { dir: 1, nextAt: this.frame, onDone };
  }

  fadeIn(onDone?: () => void): void {
    this.fadeLevel = 4;
    this.fadeAnim = { dir: -1, nextAt: this.frame, onDone };
  }

  start(): void {
    const loop = (t: number): void => {
      if (this.disposed) return;
      if (this.last < 0) this.last = t;
      this.acc += t - this.last;
      this.last = t;
      let steps = 0;
      while (this.acc >= STEP_MS && steps < MAX_STEPS) {
        this.tick();
        this.acc -= STEP_MS;
        steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;
      this.render();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    this.screen.dispose();
    while (this.stack.length > 0) this.pop();
    this.emitListeners.clear();
  }

  private tick(): void {
    const top = this.scene;
    if (top?.onAction) {
      const actions = this.inbox.splice(0);
      for (const a of actions) top.onAction(a);
    } else if (this.inbox.length > 0 && this.stack.length > 0) {
      this.inbox.length = 0;
    }

    if (this.fadeAnim) {
      if (this.frame >= this.fadeAnim.nextAt) {
        this.fadeLevel += this.fadeAnim.dir;
        this.fadeAnim.nextAt = this.frame + FADE_STEP_FRAMES;
        const done = this.fadeAnim.dir > 0 ? this.fadeLevel >= 4 : this.fadeLevel <= 0;
        if (done) {
          const cb = this.fadeAnim.onDone;
          this.fadeAnim = null;
          cb?.();
        }
      }
    } else {
      top?.update();
    }

    this.input.endFrame();
    this.frame++;
  }

  private render(): void {
    const ctx = this.screen.ctx;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, GB_W, GB_H);
    for (const s of this.stack) s.draw(ctx);
    this.applyFade(ctx);
    this.screen.present();
  }

  /** Palette-level fade as a post-process; exact because all drawing uses the BW shades. */
  private applyFade(ctx: CanvasRenderingContext2D): void {
    if (this.fadeLevel <= 0) return;
    if (this.fadeLevel >= 4) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, GB_W, GB_H);
      return;
    }
    const pal = fadedPalette(BW, this.fadeLevel);
    const img = ctx.getImageData(0, 0, GB_W, GB_H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]!;
      const idx = r >= 213 ? 0 : r >= 128 ? 1 : r >= 43 ? 2 : 3;
      const s = pal[idx as 0 | 1 | 2 | 3];
      d[i] = s[0];
      d[i + 1] = s[1];
      d[i + 2] = s[2];
    }
    ctx.putImageData(img, 0, 0);
  }
}
