// Lookahead sequencer for MIDI-note-format JSON tracks, played through the GB APU.
import { audioReady, midiToFreq, now, onUnlock, pulse } from './apu';

export interface TrackNote {
  midi: number;
  tick: number;
  len: number;
}

export interface TrackChannel {
  duty: number;
  gain: number;
  notes: TrackNote[];
}

export interface Track {
  name: string;
  secondsPerTick: number;
  lengthTicks: number;
  loop: boolean;
  channels: TrackChannel[];
}

const TIMER_MS = 25;
const HORIZON = 0.18; // seconds of lookahead
// Gentle per-note stair-step decay — GB music notes decay via note_type fade.
const MUSIC_FADE = 6;

class MusicPlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private track: Track | null = null;
  private pending: Track | null = null;
  private epoch = 0; // AudioContext time corresponding to tick 0 of this pass
  private pointers: number[] = [];
  private muted = false;

  constructor() {
    onUnlock(() => {
      if (this.pending) {
        const t = this.pending;
        this.pending = null;
        this.play(t);
      }
    });
  }

  play(track: Track): void {
    if (!audioReady()) {
      this.pending = track;
      return;
    }
    this.stop();
    this.track = track;
    this.epoch = now() + 0.1;
    this.pointers = track.channels.map(() => 0);
    this.timer = setInterval(() => this.pump(), TIMER_MS);
    this.pump();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.track = null;
    this.pending = null;
  }

  /** Pause scheduling for `seconds` (e.g. while a jingle plays), then resume. */
  duck(seconds: number): void {
    if (!this.track) return;
    this.muted = true;
    const resumeTrack = this.track;
    setTimeout(() => {
      this.muted = false;
      if (this.track === resumeTrack) {
        // Restart cleanly from the top of the loop.
        this.play(resumeTrack);
      }
    }, seconds * 1000);
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  get current(): string | null {
    return this.track?.name ?? this.pending?.name ?? null;
  }

  private pump(): void {
    const track = this.track;
    if (!track || this.muted) return;
    const horizon = now() + HORIZON;
    const spt = track.secondsPerTick;
    const passSeconds = track.lengthTicks * spt;

    for (;;) {
      let allDone = true;
      for (let c = 0; c < track.channels.length; c++) {
        const ch = track.channels[c]!;
        let p = this.pointers[c]!;
        while (p < ch.notes.length) {
          const n = ch.notes[p]!;
          const at = this.epoch + n.tick * spt;
          if (at >= horizon) break;
          pulse({
            freq: midiToFreq(n.midi),
            duty: ch.duty,
            when: at,
            dur: Math.max(n.len * spt - 0.012, 0.03),
            vol: 10,
            fade: MUSIC_FADE,
            gain: ch.gain,
          });
          p++;
        }
        this.pointers[c] = p;
        if (p < ch.notes.length) allDone = false;
      }
      if (!allDone) return;
      // All channels exhausted within the horizon: loop or stop.
      if (!track.loop || passSeconds <= 0) {
        this.stop();
        return;
      }
      this.epoch += passSeconds;
      this.pointers = track.channels.map(() => 0);
      if (this.epoch >= horizon) return;
    }
  }
}

export const music = new MusicPlayer();
