import { useEffect, useRef } from 'react';
import { GameEngine } from './engine/engine';
import { TitleScene } from './engine/scenes/title';
import { attachWalletBridge } from './bridge/walletBridge';
import { loadAssets } from './gfx/assets';
import { music } from './audio/music';

export function GameCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    const engine = new GameEngine(canvas);
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
      detach();
      music.stop();
      engine.dispose();
    };
  }, []);

  return <canvas ref={ref} />;
}
