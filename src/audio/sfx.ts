// Gen 1 sound effects, decoded from the pret/pokered disassembly register data.
// square_note params: (length, volume, fade, X) -> (length+1) frames at the
// 11-bit frequency f = 131072/(2048-X). SFX channels ignore tempo.
import { FRAME, now, pulse, noise, regToFreq, audioReady, midiToFreq } from './apu';

type SquareNote = [len: number, vol: number, fade: number, x: number];

function runSquares(
  seq: (SquareNote | { rest: number })[],
  duty: number,
  start: number,
  sweep?: { period: number; shift: number },
): void {
  let t = start;
  for (const item of seq) {
    if ('rest' in item) {
      t += (item.rest + 1) * FRAME;
      continue;
    }
    const [len, vol, fade, x] = item;
    const dur = (len + 1) * FRAME;
    pulse({ freq: regToFreq(x), duty, when: t, dur, vol, fade, sweep });
    t += dur;
  }
}

/** A-button / menu select / text-advance beep (SFX_Press_AB_1). */
export function sfxPressAB(): void {
  if (!audioReady()) return;
  const t = now() + 0.005;
  runSquares(
    [
      [0, 9, 1, 1984],
      [0, 8, 1, 2000],
      [0, 9, 1, 1984],
      [12, 10, 1, 2000],
    ],
    0.5,
    t,
  );
}

/** Bump-into-wall (SFX_Collision_1): 102.4 Hz with a rapid downward sweep. */
export function sfxBump(): void {
  if (!audioReady()) return;
  pulse({
    freq: regToFreq(768),
    duty: 0.5,
    when: now() + 0.005,
    dur: 16 * FRAME,
    vol: 15,
    fade: 1,
    sweep: { period: 5, shift: -2 },
  });
}

/** Denied/error buzzer (SFX_Denied_1): two detuned 75%-duty pulses. */
export function sfxDenied(): void {
  if (!audioReady()) return;
  const t = now() + 0.005;
  const sweep = { period: 5, shift: -2 };
  runSquares([[4, 15, 0, 1280], { rest: 4 }, [15, 15, 0, 1280]], 0.75, t, sweep);
  runSquares([[4, 15, 0, 1025], { rest: 4 }, [15, 15, 0, 1025]], 0.75, t, sweep);
}

/** Start-menu open (SFX_Start_Menu_1): two noise bursts. */
export function sfxStartMenu(): void {
  if (!audioReady()) return;
  const t = now() + 0.005;
  noise({ nr43: 51, when: t, dur: 2 * FRAME, vol: 14, fade: 2 });
  noise({ nr43: 34, when: t + 2 * FRAME, dur: 9 * FRAME, vol: 14, fade: 1 });
}

/**
 * Item-get fanfare (SFX_Get_Item2): three channels, tempo 256, note speed 5
 * (= 5 frames per length unit). Decoded note-for-note from the asm with
 * octave param o, note n -> MIDI 24 + 12*o + n (verified against the engine's
 * Audio1_CalculateFrequency). Used for swap success.
 */
export function sfxItemGet(): void {
  if (!audioReady()) return;
  const t = now() + 0.02;
  const U = 5 * FRAME; // one length unit
  type N = { m: number; len: number; at: number; fade?: number };

  // Ch5 (duty 50%, vol 11): D5 C5 A4 | D#5 D#5 D5 C5 C5 A#4 | C5
  const ch5: N[] = [
    { m: 74, len: 4, at: 0, fade: 4 },
    { m: 72, len: 4, at: 4, fade: 4 },
    { m: 69, len: 8, at: 8, fade: 4 },
    { m: 75, len: 2, at: 16, fade: 2 },
    { m: 75, len: 2, at: 18, fade: 2 },
    { m: 74, len: 2, at: 20, fade: 2 },
    { m: 72, len: 2, at: 22, fade: 2 },
    { m: 72, len: 2, at: 24, fade: 2 },
    { m: 70, len: 2, at: 26, fade: 2 },
    { m: 72, len: 8, at: 28, fade: 4 },
  ];
  // Ch6 (duty 50%, vol 12): A5 F5 C5 | A#5 x3 G5 G5 A#5 | A5
  const ch6: N[] = [
    { m: 81, len: 4, at: 0, fade: 5 },
    { m: 77, len: 4, at: 4, fade: 5 },
    { m: 72, len: 8, at: 8, fade: 5 },
    { m: 82, len: 2, at: 16, fade: 2 },
    { m: 82, len: 2, at: 18, fade: 2 },
    { m: 82, len: 2, at: 20, fade: 2 },
    { m: 79, len: 2, at: 22, fade: 2 },
    { m: 79, len: 2, at: 24, fade: 2 },
    { m: 82, len: 2, at: 26, fade: 2 },
    { m: 81, len: 8, at: 28, fade: 4 },
  ];
  // Ch7 (wave channel approximated at 25% duty, quiet): F6 D#6 C6 + run to A6
  const ch7: N[] = [
    { m: 89, len: 4, at: 0 },
    { m: 87, len: 4, at: 4 },
    { m: 84, len: 8, at: 8 },
    { m: 87, len: 1, at: 16 },
    { m: 87, len: 1, at: 18 },
    { m: 88, len: 1, at: 20 },
    { m: 89, len: 1, at: 22 },
    { m: 89, len: 1, at: 24 },
    { m: 91, len: 1, at: 26 },
    { m: 93, len: 8, at: 28 },
  ];

  for (const n of ch5)
    pulse({ freq: midiToFreq(n.m), duty: 0.5, when: t + n.at * U, dur: n.len * U, vol: 11, fade: n.fade ?? 0, gain: 0.9 });
  for (const n of ch6)
    pulse({ freq: midiToFreq(n.m), duty: 0.5, when: t + n.at * U, dur: n.len * U, vol: 12, fade: n.fade ?? 0, gain: 0.9 });
  for (const n of ch7)
    pulse({ freq: midiToFreq(n.m), duty: 0.25, when: t + n.at * U, dur: n.len * U, vol: 8, fade: 0, gain: 0.5 });
}

/** Total duration of the item-get fanfare in seconds (for music ducking). */
export const ITEM_GET_SECONDS = 36 * 5 * FRAME + 0.3;
