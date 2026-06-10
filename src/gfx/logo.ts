// Title logo rendered from the Pokemon Solid/Hollow TTFs at boot:
// gray drop shadow (Solid, offset) -> white fill (Solid) -> black outline
// (Hollow), then quantized to the 4-shade palette so it sits cleanly in the
// 2-bit world. Falls back to the hand-drawn string-grid logo if absent.
const W = 152;
const H = 52;
const TEXT = 'Pokémon';

async function tryLoadFace(family: string, url: string): Promise<boolean> {
  try {
    const face = new FontFace(family, `url(${url})`);
    await face.load();
    document.fonts.add(face);
    return true;
  } catch {
    return false;
  }
}

export async function buildTtfLogo(): Promise<HTMLCanvasElement | null> {
  const [solid, hollow] = await Promise.all([
    tryLoadFace('PokemonSolid', '/fonts/pokemon-solid.ttf'),
    tryLoadFace('PokemonHollow', '/fonts/pokemon-hollow.ttf'),
  ]);
  if (!solid || !hollow) return null;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // Fit the text width inside the canvas (leave room for the shadow offset).
  let size = H;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (; size > 10; size--) {
    ctx.font = `${size}px PokemonSolid`;
    if (ctx.measureText(TEXT).width <= W - 8) break;
  }
  const cx = Math.floor(W / 2) - 1;
  const cy = Math.floor(H / 2);

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  // Drop shadow.
  ctx.fillStyle = '#555';
  ctx.font = `${size}px PokemonSolid`;
  ctx.fillText(TEXT, cx + 2, cy + 3);
  // White letter fill (knocks the shadow out under the letters).
  ctx.fillStyle = '#fff';
  ctx.fillText(TEXT, cx, cy);
  // Black outline.
  ctx.fillStyle = '#000';
  ctx.font = `${size}px PokemonHollow`;
  ctx.fillText(TEXT, cx, cy);

  // Quantize every pixel to the nearest of the 4 shades (kills antialiasing).
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Composite onto white using alpha, then snap the gray level.
    const a = d[i + 3]! / 255;
    const g = d[i]! * a + 255 * (1 - a);
    const v = g >= 213 ? 255 : g >= 128 ? 170 : g >= 43 ? 85 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
