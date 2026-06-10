import type { GameEngine, Scene } from '../engine';
import type { ReactToEngine } from '../../bridge/events';
import { DialogBox } from '../dialog';
import { Menu } from '../menu';
import { drawMap, drawNpcs, isSolid, targetAt, META, SPAWN } from '../map';
import { spr } from '../../gfx/assets';
import { drawFlipped } from '../../gfx/sprites';
import { music, type Track } from '../../audio/music';
import { sfxBump, sfxStartMenu } from '../../audio/sfx';
import { SwapFlow } from '../swapFlow';
import dialogData from '../../data/dialog.json';
import pokecenterTrack from '../../audio/tracks/pokecenter.json';

type Dir = 'up' | 'down' | 'left' | 'right';
const DELTA: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

const STEP_FRAMES = 16; // 16px tile at 1px/frame — Gen 1 walking speed

export class CenterScene implements Scene {
  private cx = SPAWN.cx;
  private cy = SPAWN.cy;
  private dir: Dir = 'up';
  private moving: { dx: number; dy: number; progress: number } | null = null;
  private stepParity = false;
  private turnDelay = 0;
  private bumpCooldown = 0;
  private blockedWalk = 0;

  private dialog = new DialogBox();
  private menu: Menu | null = null;
  private afterDialog: (() => void) | null = null;
  private swap: SwapFlow | null = null;

  constructor(private engine: GameEngine) {}

  enter(): void {
    music.play(pokecenterTrack as Track);
  }

  onAction(a: ReactToEngine): void {
    this.swap?.onAction(a);
  }

  update(): void {
    const input = this.engine.input;
    if (this.bumpCooldown > 0) this.bumpCooldown--;

    if (this.swap) {
      this.swap.update();
      if (this.swap.finished) this.swap = null;
      return;
    }

    if (this.menu) {
      const res = this.menu.update(input);
      if (!res) return;
      this.menu = null;
      if (res.kind === 'cancel') {
        this.dialog.close();
        return;
      }
      const action = (dialogData.nurse.menu[res.index] ?? { action: 'nothing' }).action;
      if (action === 'swap') {
        this.dialog.close();
        this.swap = new SwapFlow(this.engine);
      } else {
        this.dialog.open(dialogData.nurse_nothing.pages);
      }
      return;
    }

    if (this.dialog.active) {
      this.dialog.update(input);
      if (this.dialog.done) {
        if (this.afterDialog) {
          const cb = this.afterDialog;
          this.afterDialog = null;
          cb();
        } else {
          this.dialog.close();
        }
      }
      return;
    }

    this.updateMovement();

    if (input.pressed('a') && !this.moving) {
      const [dx, dy] = DELTA[this.dir];
      this.interact(this.cx + dx, this.cy + dy);
    }
  }

  private updateMovement(): void {
    const input = this.engine.input;

    if (this.moving) {
      this.moving.progress++;
      if (this.moving.progress >= STEP_FRAMES) {
        this.cx += this.moving.dx;
        this.cy += this.moving.dy;
        this.moving = null;
      }
      return;
    }

    const held: Dir | null = input.held('up')
      ? 'up'
      : input.held('down')
        ? 'down'
        : input.held('left')
          ? 'left'
          : input.held('right')
            ? 'right'
            : null;
    if (!held) {
      this.blockedWalk = 0;
      return;
    }

    if (held !== this.dir) {
      this.dir = held;
      this.turnDelay = 4; // turn in place before stepping
      return;
    }
    if (this.turnDelay > 0) {
      this.turnDelay--;
      return;
    }

    const [dx, dy] = DELTA[this.dir];
    if (isSolid(this.cx + dx, this.cy + dy)) {
      this.blockedWalk++;
      if (this.bumpCooldown === 0) {
        sfxBump();
        this.bumpCooldown = 16;
      }
      return;
    }
    this.blockedWalk = 0;
    this.stepParity = !this.stepParity;
    this.moving = { dx, dy, progress: 0 };
  }

  private interact(tx: number, ty: number): void {
    const target = targetAt(tx, ty);
    if (!target) return;
    if (target === 'nurse') {
      this.dialog.open(dialogData.nurse.pages, { holdAtEnd: true });
      this.afterDialog = () => {
        const labels = dialogData.nurse.menu.map((m) => ({ label: m.label }));
        const tw = Math.max(...labels.map((l) => l.label.length)) + 3;
        this.menu = new Menu({ items: labels, tx: Math.max(0, 20 - tw), ty: 5 });
      };
    } else if (target === 'pc') {
      sfxStartMenu();
      this.dialog.open(dialogData.pc.pages);
    } else if (target === 'bench_man') {
      this.dialog.open(dialogData.bench_man.pages);
    }
  }

  private playerSprite(): { img: HTMLCanvasElement; flip: boolean } {
    const facing = this.dir === 'right' ? 'LEFT' : this.dir.toUpperCase();
    const flip = this.dir === 'right';
    let frame = 'STAND';
    if (this.moving) {
      const p = this.moving.progress;
      if (p >= 4 && p < 12) frame = 'WALK';
    } else if (this.blockedWalk > 0) {
      if (Math.floor(this.blockedWalk / 8) % 2 === 1) frame = 'WALK';
    }
    return { img: spr(`PLAYER_${facing}_${frame}`), flip };
  }

  draw(ctx: CanvasRenderingContext2D): void {
    drawMap(ctx);
    drawNpcs(ctx);

    let px = this.cx * META;
    let py = this.cy * META - 4;
    if (this.moving) {
      px -= this.moving.dx * (META - this.moving.progress);
      py -= this.moving.dy * (META - this.moving.progress);
    }
    const { img, flip } = this.playerSprite();
    if (flip) drawFlipped(ctx, img, px, py);
    else ctx.drawImage(img, px, py);

    this.swap?.draw(ctx);
    this.dialog.draw(ctx, this.engine.frame);
    this.menu?.draw(ctx);
  }
}
