// Game Boy (DMG) APU on Web Audio: band-limited pulse waves at the four duty
// cycles, 4-bit stair-step envelopes, NR10-style frequency sweep, and a
// 15-bit LFSR noise channel. All SFX/music synthesis goes through here.

export const FRAME = 1 / 59.7275; // one DMG frame in seconds

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const duties = new Map<number, PeriodicWave>();
let noise15: AudioBuffer | null = null;
let noise7: AudioBuffer | null = null;
const unlockCallbacks: (() => void)[] = [];

function makeDutyWave(c: AudioContext, d: number): PeriodicWave {
  const N = 64;
  const real = new Float32Array(N + 1);
  const imag = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) {
    real[n] = (2 / (n * Math.PI)) * Math.sin(2 * Math.PI * n * d);
    imag[n] = (2 / (n * Math.PI)) * (1 - Math.cos(2 * Math.PI * n * d));
  }
  return c.createPeriodicWave(real, imag);
}

function makeLfsrBuffer(c: AudioContext, sevenBit: boolean): AudioBuffer {
  const len = sevenBit ? 127 : 32767;
  // A few repetitions so short buffers loop smoothly at low playback rates.
  const reps = sevenBit ? 64 : 2;
  const buf = c.createBuffer(1, len * reps, c.sampleRate);
  const data = buf.getChannelData(0);
  let lfsr = 0x7fff;
  for (let i = 0; i < len * reps; i++) {
    const bit = (lfsr ^ (lfsr >> 1)) & 1;
    lfsr = (lfsr >> 1) | (bit << 14);
    if (sevenBit) lfsr = (lfsr & ~0x40) | (bit << 6);
    data[i] = lfsr & 1 ? 0.5 : -0.5;
  }
  return buf;
}

function init(): void {
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.13;
  master.connect(ctx.destination);
  for (const d of [0.125, 0.25, 0.5, 0.75]) duties.set(d, makeDutyWave(ctx, d));
  noise15 = makeLfsrBuffer(ctx, false);
  noise7 = makeLfsrBuffer(ctx, true);
}

/** Call on the first user gesture (autoplay policy). Safe to call repeatedly. */
export function unlockAudio(): void {
  if (!ctx) {
    init();
    for (const cb of unlockCallbacks) cb();
    unlockCallbacks.length = 0;
  }
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

export function onUnlock(cb: () => void): void {
  if (ctx) cb();
  else unlockCallbacks.push(cb);
}

export function audioReady(): boolean {
  return ctx !== null;
}

export function now(): number {
  return ctx ? ctx.currentTime : 0;
}

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** GB 11-bit register value -> Hz. */
export function regToFreq(x: number): number {
  return 131072 / (2048 - x);
}

/**
 * 4-bit stair-step envelope (the DMG character): one 1/15 volume step every
 * `fade` * (1/64)s. fade > 0 decays, < 0 swells, 0 holds.
 */
function envelope(g: GainNode, when: number, dur: number, vol: number, fade: number): void {
  const base = vol / 15;
  g.gain.setValueAtTime(base, when);
  if (fade !== 0) {
    const stepDur = (Math.abs(fade) * 1) / 64;
    const dir = fade > 0 ? -1 : 1;
    let v = vol;
    for (let t = when + stepDur; t < when + dur; t += stepDur) {
      v += dir;
      if (v <= 0) {
        g.gain.setValueAtTime(0, t);
        break;
      }
      if (v >= 15) {
        g.gain.setValueAtTime(1, t);
        break;
      }
      g.gain.setValueAtTime(v / 15, t);
    }
  }
  // Tiny release to avoid clicks.
  g.gain.setValueAtTime(g.gain.value, when + dur);
  g.gain.linearRampToValueAtTime(0, when + dur + 0.004);
}

export interface SweepOpts {
  /** NR10 period (sweep step every period * 1/128 s). */
  period: number;
  /** Signed shift: negative = X -= X>>|shift| (pitch falls), positive = rises. */
  shift: number;
}

export interface PulseOpts {
  freq: number;
  duty: number;
  when: number;
  dur: number;
  /** 0..15 */
  vol: number;
  /** GB envelope pace; 0 = hold. */
  fade: number;
  sweep?: SweepOpts;
  gain?: number;
}

export function pulse(o: PulseOpts): void {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(duties.get(o.duty) ?? duties.get(0.5)!);
  osc.frequency.setValueAtTime(o.freq, o.when);

  if (o.sweep) {
    const stepDur = (o.sweep.period * 1) / 128;
    let x = 2048 - 131072 / o.freq;
    const mag = Math.abs(o.sweep.shift);
    const dir = o.sweep.shift < 0 ? -1 : 1;
    for (let t = o.when + stepDur; t < o.when + o.dur; t += stepDur) {
      x += dir * Math.floor(x / Math.pow(2, mag));
      if (x <= 0 || x >= 2048) break;
      osc.frequency.setValueAtTime(regToFreq(x), t);
    }
  }

  const g = ctx.createGain();
  envelope(g, o.when, o.dur, o.vol, o.fade);
  const trim = ctx.createGain();
  trim.gain.value = o.gain ?? 1;
  osc.connect(g).connect(trim).connect(master);
  osc.start(o.when);
  osc.stop(o.when + o.dur + 0.01);
}

export interface NoiseOpts {
  /** Raw NR43 register value. */
  nr43: number;
  when: number;
  dur: number;
  vol: number;
  fade: number;
}

export function noise(o: NoiseOpts): void {
  if (!ctx || !master) return;
  const s = (o.nr43 >> 4) & 0xf;
  const sevenBit = ((o.nr43 >> 3) & 1) === 1;
  const r = o.nr43 & 7;
  const clock = 524288 / (r === 0 ? 0.5 : r) / Math.pow(2, s + 1);
  const src = ctx.createBufferSource();
  src.buffer = sevenBit ? noise7! : noise15!;
  src.loop = true;
  src.playbackRate.value = clock / ctx.sampleRate;
  const g = ctx.createGain();
  envelope(g, o.when, o.dur, o.vol, o.fade);
  src.connect(g).connect(master);
  src.start(o.when);
  src.stop(o.when + o.dur + 0.01);
}
