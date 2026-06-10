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
    (await tryLoadFace('PokemonClassic', '/fonts/pokemon-classic.ttf')) ??
    (await tryLoadFace('PressStart2P', '/fonts/press-start-2p.ttf'));
  if (!family) throw new Error('No font could be loaded');

  const scratch = document.createElement('canvas');
  scratch.width = GLYPH * 2;
  scratch.height = GLYPH * 2;
  const sctx = scratch.getContext('2d', { willReadFrequently: true })!;

  const atlas = document.createElement('canvas');
  atlas.width = GLYPH * (CHARSET.length + 1);
  atlas.height = GLYPH;
  const actx = atlas.getContext('2d')!;
  const slots = new Map<string, number>();

  /** Threshold a glyph to a GLYPH x GLYPH 1-bit cell. Returns null if blank. */
  const rasterize = (ch: string): Uint8Array | null => {
    sctx.clearRect(0, 0, scratch.width, scratch.height);
    sctx.font = `${GLYPH}px ${family}`;
    sctx.textBaseline = 'top';
    sctx.fillStyle = '#000';
    sctx.fillText(ch, 0, 0);
    const img = sctx.getImageData(0, 0, GLYPH, GLYPH);
    const bits = new Uint8Array(GLYPH * GLYPH);
    let any = false;
    for (let i = 0; i < GLYPH * GLYPH; i++) {
      if (img.data[i * 4 + 3]! >= 128) {
        bits[i] = 1;
        any = true;
      }
    }
    return any ? bits : null;
  };

  const writeSlot = (bits: Uint8Array, slot: number): void => {
    // Center the ink horizontally in the cell (Gen 1 tiles are monospace;
    // narrow proportional glyphs look gappy when left-aligned).
    let minX = GLYPH;
    let maxX = -1;
    for (let y = 0; y < GLYPH; y++) {
      for (let x = 0; x < GLYPH; x++) {
        if (bits[y * GLYPH + x]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    const shift = maxX >= minX ? Math.floor((GLYPH - (maxX - minX + 1)) / 2) - minX : 0;
    const out = actx.createImageData(GLYPH, GLYPH);
    for (let y = 0; y < GLYPH; y++) {
      for (let x = 0; x < GLYPH; x++) {
        if (!bits[y * GLYPH + x]) continue;
        const nx = x + shift;
        if (nx >= 0 && nx < GLYPH) out.data[(y * GLYPH + nx) * 4 + 3] = 255;
      }
    }
    actx.putImageData(out, slot * GLYPH, 0);
  };

  for (let i = 0; i < CHARSET.length; i++) {
    const ch = CHARSET[i]!;
    if (ch === '©') continue; // always hand-drawn (see below)
    const bits = rasterize(ch);
    if (bits) {
      writeSlot(bits, i);
      slots.set(ch, i);
    }
  }

  // © is its own hand-drawn tile (as in Gen 1). Canvas silently substitutes a
  // system font for characters a face lacks, so rendering it from the TTF is
  // unreliable across the three font options.
  {
    const COPYRIGHT = [
      '..3333..',
      '.3....3.',
      '3..33..3',
      '3.3....3',
      '3.3....3',
      '3..33..3',
      '.3....3.',
      '..3333..',
    ];
    const bits = new Uint8Array(GLYPH * GLYPH);
    for (let y = 0; y < GLYPH; y++) {
      for (let x = 0; x < GLYPH; x++) {
        if (COPYRIGHT[y]![x] === '3') bits[y * GLYPH + x] = 1;
      }
    }
    writeSlot(bits, CHARSET.length);
    slots.set('©', CHARSET.length);
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
