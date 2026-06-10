import { useRef, useState, type PointerEvent } from 'react';
import type { Button } from './engine/input';

type Dir = 'up' | 'down' | 'left' | 'right';

interface TouchControlsProps {
  press: (b: Button) => void;
  release: (b: Button) => void;
}

/**
 * On-screen DMG controls for touch devices (hidden on desktop via CSS).
 * The D-pad moves, A and B both fire the engine's select ('a') button,
 * and Start/Select are cosmetic.
 */
export function TouchControls({ press, release }: TouchControlsProps) {
  const [dir, setDir] = useState<Dir | null>(null);
  const [aDown, setADown] = useState(false);
  const [bDown, setBDown] = useState(false);
  const dirRef = useRef<Dir | null>(null);
  const dpadPointer = useRef<number | null>(null);

  const applyDir = (d: Dir | null): void => {
    if (dirRef.current === d) return;
    if (dirRef.current) release(dirRef.current);
    if (d) press(d);
    dirRef.current = d;
    setDir(d);
  };

  const dirFromEvent = (e: PointerEvent<HTMLDivElement>): Dir | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    // Dead zone in the middle so a centered thumb doesn't jitter.
    if (Math.hypot(x, y) < r.width * 0.12) return null;
    if (Math.abs(x) > Math.abs(y)) return x < 0 ? 'left' : 'right';
    return y < 0 ? 'up' : 'down';
  };

  const onDpadDown = (e: PointerEvent<HTMLDivElement>): void => {
    dpadPointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    applyDir(dirFromEvent(e));
  };
  const onDpadMove = (e: PointerEvent<HTMLDivElement>): void => {
    // Capture means we keep getting moves: the thumb can slide between directions.
    if (dpadPointer.current === e.pointerId) applyDir(dirFromEvent(e));
  };
  const onDpadUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (dpadPointer.current === e.pointerId) {
      dpadPointer.current = null;
      applyDir(null);
    }
  };

  const abHandlers = (setDown: (v: boolean) => void) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDown(true);
      press('a');
    },
    onPointerUp: () => {
      setDown(false);
      release('a');
    },
    onPointerCancel: () => {
      setDown(false);
      release('a');
    },
  });

  return (
    <div className="gb-controls" onContextMenu={(e) => e.preventDefault()}>
      <div className="gb-controls-row">
        <div
          className="gb-dpad"
          data-dir={dir ?? 'none'}
          onPointerDown={onDpadDown}
          onPointerMove={onDpadMove}
          onPointerUp={onDpadUp}
          onPointerCancel={onDpadUp}
        >
          <div className="gb-dpad-cross">
            <span className="gb-dpad-h" />
            <span className="gb-dpad-v" />
            <span className="gb-dpad-center" />
          </div>
        </div>
        <div className="gb-ab">
          <div className="gb-ab-btn">
            <button type="button" aria-label="B" data-pressed={bDown} {...abHandlers(setBDown)} />
            <span>B</span>
          </div>
          <div className="gb-ab-btn">
            <button type="button" aria-label="A" data-pressed={aDown} {...abHandlers(setADown)} />
            <span>A</span>
          </div>
        </div>
      </div>
      <div className="gb-ss">
        <div className="gb-ss-btn">
          <button type="button" aria-label="Select" />
          <span>SELECT</span>
        </div>
        <div className="gb-ss-btn">
          <button type="button" aria-label="Start" />
          <span>START</span>
        </div>
      </div>
    </div>
  );
}
