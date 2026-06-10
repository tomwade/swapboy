// Fixed 160x144 Game Boy backbuffer, integer-scaled onto the visible canvas.
export const GB_W = 160;
export const GB_H = 144;
export const TILE = 8;

export interface Screen {
  /** Draw target for all game rendering (160x144). */
  ctx: CanvasRenderingContext2D;
  /** Blit the backbuffer to the visible canvas at integer scale. */
  present(): void;
  /** Recompute scale from the window size. */
  resize(): void;
  dispose(): void;
}

export function createScreen(visible: HTMLCanvasElement): Screen {
  const back = document.createElement('canvas');
  back.width = GB_W;
  back.height = GB_H;
  const ctx = back.getContext('2d')!;
  const vctx = visible.getContext('2d')!;

  // Fixed budget for the Game Boy shell chrome around the LCD.
  const CHROME_X = 190;
  const CHROME_Y = 170;

  function resize(): void {
    const cw = window.innerWidth - CHROME_X;
    const ch = window.innerHeight - CHROME_Y;
    const k = Math.max(1, Math.floor(Math.min(cw / GB_W, ch / GB_H)));
    visible.width = GB_W * k;
    visible.height = GB_H * k;
    // Resets to true whenever the canvas size attribute changes — re-set every time.
    vctx.imageSmoothingEnabled = false;
  }

  const onResize = (): void => resize();
  window.addEventListener('resize', onResize);
  resize();

  return {
    ctx,
    present() {
      vctx.drawImage(back, 0, 0, visible.width, visible.height);
    },
    resize,
    dispose() {
      window.removeEventListener('resize', onResize);
    },
  };
}
