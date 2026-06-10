import { useEffect, useRef } from 'react';
import { GameEngine } from './engine/engine';
import { TitleScene } from './engine/scenes/title';
import { attachWalletBridge } from './bridge/walletBridge';
import { loadAssets } from './gfx/assets';
import { music } from './audio/music';
import { TouchControls } from './TouchControls';

export function GameCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    const engine = new GameEngine(canvas);
    engineRef.current = engine;
    const detach = attachWalletBridge(engine);

    void loadAssets().then(() => {
      if (cancelled) return;
      engine.replace(new TitleScene(engine));
      engine.start();
      if (import.meta.env.DEV) {
        (window as unknown as { __gbEngine?: GameEngine }).__gbEngine = engine;
      }
    });

    // StrictMode-safe teardown: without this, dev double-mount runs two loops.
    return () => {
      cancelled = true;
      engineRef.current = null;
      detach();
      music.stop();
      engine.dispose();
    };
  }, []);

  return (
    <div className="gb-shell">
      <div className="gb-bezel">
        <div className="gb-bezel-caption">DOT MATRIX WITH STEREO SOUND</div>
        <div className="gb-led-wrap">
          <span className="gb-led" />
          <span>BATT</span>
        </div>
        <div className="gb-screen-wrap">
          <canvas ref={ref} />
        </div>
      </div>
      <div className="gb-brand">
        SWAPBOY <span className="tm">TM</span>
      </div>
      <TouchControls
        press={(b) => engineRef.current?.input.buttonDown(b)}
        release={(b) => engineRef.current?.input.buttonUp(b)}
      />
    </div>
  );
}
