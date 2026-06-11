import { Analytics } from '@vercel/analytics/react';
import { GameCanvas } from './GameCanvas';

export function App() {
  return (
    <>
      <GameCanvas />
      <Analytics />
    </>
  );
}
