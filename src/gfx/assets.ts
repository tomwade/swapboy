import { bake } from './sprites';
import { loadFont, type BitmapFont } from './font';
import { buildTtfLogo } from './logo';
import * as tilesArt from './art/tiles';
import * as charsArt from './art/characters';
import * as titleArt from './art/title';

let font: BitmapFont | null = null;
const sprites = new Map<string, HTMLCanvasElement>();

export async function loadAssets(): Promise<void> {
  font = await loadFont();
  for (const mod of [tilesArt, charsArt, titleArt] as Record<string, unknown>[]) {
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === 'string') sprites.set(name, bake(value));
    }
  }
  const ttfLogo = await buildTtfLogo();
  if (ttfLogo) sprites.set('TITLE_LOGO_TTF', ttfLogo);
}

export function sprOrNull(name: string): HTMLCanvasElement | null {
  return sprites.get(name) ?? null;
}

export function FONT(): BitmapFont {
  if (!font) throw new Error('Assets not loaded');
  return font;
}

export function spr(name: string): HTMLCanvasElement {
  const s = sprites.get(name);
  if (!s) throw new Error(`Missing sprite: ${name}`);
  return s;
}
