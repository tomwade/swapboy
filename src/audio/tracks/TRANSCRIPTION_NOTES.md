# Transcription notes — pret/pokered → Web Audio synth JSON

Sources (fetched 2026-06-10 from `pret/pokered` master):

- `audio/music/pokecenter.asm`
- `audio/music/titlescreen.asm`
- `macros/scripts/audio.asm` (command encodings)
- `audio/engine_1.asm` (note length / tempo / pitch math)
- `audio/notes.asm` (frequency table)
- `constants/audio_constants.asm` (`C_`=0 … `B_`=11)

The transcription was produced by mechanically executing the channel scripts
(including `sound_call` subroutines, finite `sound_loop N` repeats, and state
that persists across `sound_ret` — octave, note speed, duty), not by hand.

## Timing derivation

From `audio/engine_1.asm`, `Audio1_note_length`:

```
ld e, a          ; e = note length nibble + 1   (note macro: dn pitch, length-1)
...
ld a, [hl]       ; a = wChannelNoteSpeeds  (low nibble of note_type cmd)
call Audio1_MultiplyAdd      ; hl = note_speed * note_length
ld a, [wMusicTempo] / [wMusicTempo+1]  ; de = tempo (16-bit, big-endian; tempo 144 -> $0090)
ld a, l
ld l, [wChannelNoteDelayCountersFractionalPart]
call Audio1_MultiplyAdd      ; hl = frac + (speed*length) * tempo
ld [frac], e                 ; low byte accumulates
ld [wChannelNoteDelayCounters], d   ; HIGH byte = delay in engine ticks
```

`Audio1_MultiplyAdd` computes `hl = l + a*de`. So each note lasts

```
frames = (note_speed * note_length * tempo) / 256
```

with the /256 fractional remainder carried to the next note (exact on average).
The engine is driven once per video frame: 4194304 / 70224 = **59.7275 Hz**.

Both songs set `tempo 144`, so 1 "speed-unit" (speed × length = 1) lasts
`144/256 = 0.5625` frames.

- **pokecenter**: every `note_type` uses speed 12, so I chose
  **1 tick = 1 length unit at speed 12** = 12 speed-units = 6.75 frames.
  `secondsPerTick = 6.75 × 70224/4194304 = 0.113013268 s`.
  A `note X, 2` is exactly `len: 2`.
- **titlescreen**: speeds 12 and 8 are both used; gcd(12, 8) = 4, so
  **1 tick = 4 speed-units** = 2.25 frames.
  `secondsPerTick = 2.25 × 70224/4194304 = 0.037671089 s`.
  A length-L note is `3L` ticks at speed 12 and `2L` ticks at speed 8.

All note lengths and rests are exact integers in these units (verified by
assertion during generation).

## Octave → MIDI mapping (from the frequency table)

`audio/notes.asm` stores one 16-bit value per pitch class
(`C_ = $F82C`, `C# = $F89D`, `D_ = $F907`, … `A_ = $FB58`, `B_ = $FBDA`).
`Audio1_CalculateFrequency` (engine_1.asm) treats the value as signed,
arithmetic-shifts it right by `asm_octave − 1` (the `octave` macro stores
`8 − octave`; the loop shifts until that counter reaches 7), then adds $0800:

```
X = (T >> (octave-1)) + 2048        ; T signed, e.g. C_ = $F82C = −2004
f = 131072 / (2048 − X) = 131072 / (−(T >> (octave−1)))
```

Decoded anchors (square channels):

- `C_`, octave 1: T = −2004 → f = 131072/2004 = **65.41 Hz** = C2 → MIDI 36
- `A_`, octave 1: T = $FB58 = −1192 → f = 131072/1192 = **109.96 Hz** = A2 → MIDI 45
- `A_`, octave 3: −1192 >> 2 = −298 → f = 131072/298 = **439.84 Hz** = A4 → MIDI 69
  (**pokered octave 3 contains A = 440 Hz**)
- `F#`, octave 1: $FA77 = −1417 → 131072/1417 = **92.50 Hz** = F#2 → MIDI 42

So for pulse channels: **MIDI = 12 × (pokered_octave + 2) + pitch_index**
(pitch_index from `constants/audio_constants.asm`: C_=0, C#=1, … B_=11).

**Wave channel (Ch3) is one octave lower.** `Audio1_ApplyWavePatternAndFrequency`
writes the same register value to CH3 (`ld [hl], e ; store frequency low byte`),
but Game Boy hardware CH3 produces `f = 65536/(2048−X)` — half the square
channels' `131072/(2048−X)` (32-sample wave vs 8-step duty). All Ch3 notes are
therefore shifted **−12 semitones** in the JSON. This is audible in-game (the
title screen bass riff is low) and makes the bass sit below the melody.

## pokecenter.json

- Loop: `.mainloop` on all three channels is the entire song; no intro notes
  (only setup commands precede it). All three channels loop at exactly
  **256 ticks = 28.93 s**. JSON loops the whole thing.
- Channel 1 (pulse 1, lead melody): `duty_cycle 3` throughout → **0.75**, gain 0.55.
  `note_type` volumes 10–11.
- Channel 2 (pulse 2, harmony/counter-melody): alternates `duty_cycle 2` (subs +
  long second-half lead, 2688 speed-units) and `duty_cycle 3` (A/E pedal fills,
  384 speed-units). Dominant = 2 → **0.5**, gain 0.45.
- Channel 3 (wave, arpeggio ostinato): synth approximation **duty 0.25**,
  gain 0.35, notes −12 (see above). Engine wave volume nibble = 1 (full).
- Key check: pitch-class census D:29 E:50 F#:60 G:50 A:73 B:26 C#:21 — D major.
  The two F naturals are literally in the asm (`note F_, 2`, Ch1, the chromatic
  F#–F–F# neighbor figure that opens the tune) and one G# (Ch3, chromatic
  passing tone before an A). They are correct, not mapping errors.
- `toggle_perfect_pitch` (Ch1) raises the frequency register by 1 (~a few
  cents) — ignored. `vibrato` commands ignored per spec.

## title.json

- Loop: all three channels have a real **intro** (the "rumble"/crash pickup
  before the loop) followed by `.mainloop … sound_loop 0, .mainloop`. The JSON
  contains **only the `.mainloop` body**; the intro is omitted (the spec says
  loop the looping section). All three channels loop at exactly
  **1152 ticks = 43.40 s**.
  - Ch3 `.loop1` block (`sound_loop 3, .loop1`) plays **3 times total**
    (engine inits `wChannelLoopCounters` to 1; jumps back while counter ≠ N),
    and is expanded accordingly.
- Channel 1 (pulse 1, harmony/low counterline): `duty_cycle 3` → **0.75**, gain 0.55.
- Channel 2 (pulse 2, lead melody): `duty_cycle 1` (25%) for almost the whole
  loop (4020 speed-units) with one brief `duty_cycle 3` fade-in note
  (`note_type 12, 0, -3`, 192 speed-units). Dominant = 1 → **0.25**, gain 0.45.
  The fade-in G is kept as a normal note (gain choices only, per spec).
- Channel 3 (wave, bass riff + Pokémon-cry slide effects): **duty 0.25**,
  gain 0.35, notes −12. The `pitch_slide` D notes near the loop end (the
  "cry" sweeps, pokered octaves 5/6 → MIDI 86/74 after the wave shift) are
  kept as plain notes; the slide itself is not represented.
- Channel 4 (noise/drums) skipped entirely per spec.

## Verification

- Generated by executing the asm; per-channel loop lengths asserted equal
  (256/256/256 and 1152/1152/1152) — a strong end-to-end check since the three
  channels are written independently.
- First/last 8 notes of every channel hand-checked against the asm
  (e.g. pokecenter Ch1 opens F#4 F4 F#4 D5 C#5 B4 A4 B4 = MIDI 66 65 66 74 73
  71 69 71 and ends …D4 E4 F#4 G4 = 62 64 66 67; title Ch2 opens G4 B4 D5 from
  `.sub1` = 67 71 74; title Ch3 ends C4 C4 B3 = 60 60 59 after the wave shift).
- No overlapping notes (note end = next note start at the closest); rests are gaps.
- Loop durations 28.93 s and 43.40 s — within the 10–60 s bound.
- Melody/bass ranges: title ch3 mean MIDI 54.5 < ch1 59.4 < ch2 (melody) 71.2.
