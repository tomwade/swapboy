export type Button = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start';

const KEYMAP: Record<string, Button> = {
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Space: 'a',
  KeyZ: 'a',
  KeyX: 'b',
  ShiftLeft: 'b',
  ShiftRight: 'b',
  Escape: 'b',
  Enter: 'start',
};

export interface Input {
  held(b: Button): boolean;
  /** Edge: went down since the previous tick. */
  pressed(b: Button): boolean;
  /** Call once at the end of every fixed step. */
  endFrame(): void;
  dispose(): void;
}

export function createInput(onFirstGesture: () => void): Input {
  const down = new Set<Button>();
  // Keydowns buffered until the next tick, so even sub-frame taps register.
  const justPressed = new Set<Button>();
  let gestured = false;

  const gesture = (): void => {
    if (!gestured) {
      gestured = true;
      onFirstGesture();
    }
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    gesture();
    const b = KEYMAP[e.code];
    if (!b) return;
    e.preventDefault();
    // Own hold-repeat timing: OS key-repeat events are ignored.
    if (!e.repeat) {
      down.add(b);
      justPressed.add(b);
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    const b = KEYMAP[e.code];
    if (b) down.delete(b);
  };
  const onBlur = (): void => down.clear();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointerdown', gesture);

  return {
    held: (b) => down.has(b),
    pressed: (b) => justPressed.has(b),
    endFrame() {
      justPressed.clear();
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointerdown', gesture);
    },
  };
}
