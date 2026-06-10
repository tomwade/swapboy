import type { GameEngine, Scene } from '../engine';
import { FONT, spr } from '../../gfx/assets';
import { music, type Track } from '../../audio/music';
import { sfxPressAB } from '../../audio/sfx';
import { ConnectScene } from './connect';
import titleTrack from '../../audio/tracks/title.json';

export class TitleScene implements Scene {
  constructor(private engine: GameEngine) {}

  enter(): void {
    music.play(titleTrack as Track);
  }

  update(): void {
    const input = this.engine.input;
    if (input.pressed('a') || input.pressed('start')) {
      sfxPressAB();
      this.engine.push(new ConnectScene(this.engine));
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const font = FONT();
    const logo = spr('TITLE_LOGO');
    ctx.drawImage(logo, Math.floor((160 - logo.width) / 2), 6);

    const subtitle = 'Uniswap Edition';
    font.draw(ctx, subtitle, Math.floor((160 - subtitle.length * 8) / 2), 52);

    if (Math.floor(this.engine.frame / 30) % 2 === 0) {
      const prompt = 'PRESS SPACE';
      font.draw(ctx, prompt, Math.floor((160 - prompt.length * 8) / 2), 64);
    }

    const unicorn = spr('TITLE_UNICORN');
    const trainer = spr('TITLE_TRAINER');
    ctx.drawImage(unicorn, 24, 126 - unicorn.height);
    ctx.drawImage(trainer, 100, 126 - trainer.height);

    const copyright = "©'26 ATRIUM ACADEMY";
    font.draw(ctx, copyright, Math.floor((160 - copyright.length * 8) / 2), 134);
  }
}
