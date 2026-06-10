import type { GameEngine, Scene } from '../engine';
import type { ReactToEngine } from '../../bridge/events';
import { DialogBox } from '../dialog';
import { Menu } from '../menu';
import { music } from '../../audio/music';
import { sfxDenied, sfxPressAB } from '../../audio/sfx';
import { CenterScene } from './center';
import dialogData from '../../data/dialog.json';

type State = 'intro' | 'menu' | 'connecting' | 'confirmed' | 'failed' | 'none';

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}..${addr.slice(-4)}`;
}

export class ConnectScene implements Scene {
  private dialog = new DialogBox();
  private menu: Menu | null = null;
  private connectors: { uid: string; name: string }[] = [];
  private state: State = 'intro';
  private confirmTimer = 0;

  constructor(private engine: GameEngine) {}

  enter(): void {
    this.dialog.open(dialogData.connect_intro.pages, { holdAtEnd: true });
    this.engine.emit({ type: 'GET_CONNECTORS' });
  }

  onAction(a: ReactToEngine): void {
    switch (a.type) {
      case 'CONNECTORS': {
        this.connectors = a.list;
        return;
      }
      case 'CONNECTED': {
        music.stop();
        sfxPressAB();
        this.menu = null;
        this.state = 'confirmed';
        this.confirmTimer = 90;
        this.dialog.open([`ID No. ${shortAddress(a.address)} confirmed!`], { holdAtEnd: true });
        return;
      }
      case 'CONNECT_FAILED': {
        sfxDenied();
        this.state = 'failed';
        this.menu = null;
        this.dialog.open(dialogData.connect_failed.pages);
        return;
      }
      default:
        return;
    }
  }

  update(): void {
    const input = this.engine.input;
    this.dialog.update(input);

    switch (this.state) {
      case 'intro': {
        if (!this.dialog.done) return;
        if (this.connectors.length === 0) {
          this.state = 'none';
          this.dialog.open(dialogData.connect_none.pages);
          return;
        }
        this.state = 'menu';
        this.menu = new Menu({
          items: [...this.connectors.map((c) => ({ label: c.name.toUpperCase().slice(0, 13) })), { label: 'CANCEL' }],
          tx: 4,
          ty: 2,
        });
        return;
      }
      case 'menu': {
        const res = this.menu!.update(input);
        if (!res) return;
        if (res.kind === 'cancel' || res.index === this.connectors.length) {
          this.engine.pop(); // back to title
          return;
        }
        const chosen = this.connectors[res.index]!;
        this.menu = null;
        this.state = 'connecting';
        this.dialog.openWaiting('Linking');
        this.engine.emit({ type: 'CONNECT', connectorUid: chosen.uid });
        return;
      }
      case 'confirmed': {
        if (this.confirmTimer > 0) {
          this.confirmTimer--;
          return;
        }
        const engine = this.engine;
        engine.fadeOut(() => {
          engine.replace(new CenterScene(engine));
          engine.fadeIn();
        });
        this.state = 'intro'; // inert; scene is about to be replaced
        return;
      }
      case 'failed': {
        if (this.dialog.done) {
          this.state = 'menu';
          this.dialog.open(dialogData.connect_intro.pages, { holdAtEnd: true });
          this.menu = new Menu({
            items: [...this.connectors.map((c) => ({ label: c.name.toUpperCase().slice(0, 13) })), { label: 'CANCEL' }],
            tx: 4,
            ty: 2,
          });
        }
        return;
      }
      case 'none': {
        if (this.dialog.done) this.engine.pop();
        return;
      }
      default:
        return;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.dialog.draw(ctx, this.engine.frame);
    this.menu?.draw(ctx);
  }
}
