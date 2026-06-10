// 2-bit Game Boy palette. Index 0 = lightest, 3 = darkest, plus transparent in sprites.
// Black-and-white "Super Game Boy" rendition of Pokémon Blue.
export type Shade = [r: number, g: number, b: number];
export type Palette = [Shade, Shade, Shade, Shade];

export const BW: Palette = [
  [0xff, 0xff, 0xff],
  [0xaa, 0xaa, 0xaa],
  [0x55, 0x55, 0x55],
  [0x00, 0x00, 0x00],
];

export const DMG_GREEN: Palette = [
  [0x9b, 0xbc, 0x0f],
  [0x8b, 0xac, 0x0f],
  [0x30, 0x62, 0x30],
  [0x0f, 0x38, 0x0f],
];

const WHITE: Shade = [0xff, 0xff, 0xff];

// 4-step Game Boy fade: each step shifts every shade one slot toward white.
// fadeLevel 0 = normal palette, 4 = fully white.
export function fadedPalette(base: Palette, fadeLevel: number): Palette {
  const lvl = Math.max(0, Math.min(4, fadeLevel | 0));
  return [0, 1, 2, 3].map((i) => {
    const src = i - lvl;
    return src < 0 ? WHITE : base[src as 0 | 1 | 2 | 3];
  }) as Palette;
}

export function cssColor(s: Shade): string {
  return `rgb(${s[0]},${s[1]},${s[2]})`;
}
