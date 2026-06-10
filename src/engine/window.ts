import { TILE } from '../gfx/screen';
import { spr } from '../gfx/assets';

/** Draw a Gen 1 bordered window at tile coords; interior is white. */
export function drawWindow(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  tw: number,
  th: number,
): void {
  const x = tx * TILE;
  const y = ty * TILE;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, tw * TILE, th * TILE);

  const tl = spr('UI_BORDER_TL');
  const tr = spr('UI_BORDER_TR');
  const bl = spr('UI_BORDER_BL');
  const br = spr('UI_BORDER_BR');
  const h = spr('UI_BORDER_H');
  const v = spr('UI_BORDER_V');

  for (let i = 1; i < tw - 1; i++) {
    ctx.drawImage(h, x + i * TILE, y);
    ctx.drawImage(h, x + i * TILE, y + (th - 1) * TILE);
  }
  for (let j = 1; j < th - 1; j++) {
    ctx.drawImage(v, x, y + j * TILE);
    ctx.drawImage(v, x + (tw - 1) * TILE, y + j * TILE);
  }
  ctx.drawImage(tl, x, y);
  ctx.drawImage(tr, x + (tw - 1) * TILE, y);
  ctx.drawImage(bl, x, y + (th - 1) * TILE);
  ctx.drawImage(br, x + (tw - 1) * TILE, y + (th - 1) * TILE);
}
