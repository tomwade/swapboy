// Bitmap glyph atlas. Canvas fillText antialiasing cannot be disabled, so the
// font is rendered ONCE at 8px, alpha-thresholded to pure black, and blitted as
// 8x8 tiles. fillText is banned everywhere else in the codebase.
const CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' +
  ".,!?'\"&()[]:;/\\-+%$#@*=<>_~^|{}é©×";

const SUBSTITUTES: Record<string, string> = { 'é': 'e', '©': 'c', '×': 'x', '’': "'" };

export const GLYPH = 8;

export interface BitmapFont {
  /** Draw text at pixel coords (top-left). One glyph per 8px cell. */
  draw(ctx: CanvasRenderingContext2D, text: string, px: number, py: number): void;
  /** Draw text at tile coords (×8). */
  drawTile(ctx: CanvasRenderingContext2D, text: string, tx: number, ty: number): void;
}

async function tryLoadFace(family: string, url: string): Promise<string | null> {
  try {
    const face = new FontFace(family, `url(${url})`);
    await face.load();
    document.fonts.add(face);
    return family;
  } catch {
    return null;
  }
}

export async function loadFont(): Promise<BitmapFont> {
  const family =
    (await tryLoadFace('PokemonGB', '/fonts/pokemon-gb.ttf')) ??
    (await tryLoadFace('PressStart2P', '/fonts/press-start-2p.ttf'));
  if (!family) throw new Error('No font could be loaded');

  const scratch = document.createElement('canvas');
  scratch.width = GLYPH * 2;
  scratch.height = GLYPH * 2;
  const sctx = scratch.getContext('2d', { willReadFrequently: true })!;

  const atlas = document.createElement('canvas');
  atlas.width = GLYPH * CHARSET.length;
  atlas.height = GLYPH;
  const actx = atlas.getContext('2d')!;
  const slots = new Map<string, number>();

  const renderGlyph = (ch: string, slot: number): boolean => {
    sctx.clearRect(0, 0, scratch.width, scratch.height);
    sctx.font = `${GLYPH}px ${family}`;
    sctx.textBaseline = 'top';
    sctx.fillStyle = '#000';
    sctx.fillText(ch, 0, 0);
    const img = sctx.getImageData(0, 0, GLYPH, GLYPH);
    let any = false;
    const out = actx.createImageData(GLYPH, GLYPH);
    for (let i = 0; i < GLYPH * GLYPH; i++) {
      if (img.data[i * 4 + 3]! >= 128) {
        out.data[i * 4 + 3] = 255; // pure black, full alpha
        any = true;
      }
    }
    if (any) actx.putImageData(out, slot * GLYPH, 0);
    return any;
  };

  for (let i = 0; i < CHARSET.length; i++) {
    const ch = CHARSET[i]!;
    if (renderGlyph(ch, i)) slots.set(ch, i);
  }

  const slotFor = (ch: string): number | undefined =>
    slots.get(ch) ?? (SUBSTITUTES[ch] !== undefined ? slots.get(SUBSTITUTES[ch]!) : undefined);

  const draw = (ctx: CanvasRenderingContext2D, text: string, px: number, py: number): void => {
    let x = px;
    for (const ch of text) {
      if (ch !== ' ') {
        const slot = slotFor(ch);
        if (slot !== undefined) {
          ctx.drawImage(atlas, slot * GLYPH, 0, GLYPH, GLYPH, x, py, GLYPH, GLYPH);
        }
      }
      x += GLYPH;
    }
  };

  return {
    draw,
    drawTile: (ctx, text, tx, ty) => draw(ctx, text, tx * GLYPH, ty * GLYPH),
  };
}
