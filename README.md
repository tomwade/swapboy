# POKéMON — Uniswap Edition

A Pokémon Blue-style Game Boy frontend for Uniswap on **Base**. Boot to a
recreated title screen (unicorn instead of Squirtle), connect an EVM wallet
through a Game Boy dialog, walk around a Pokémon Center, and ask the nurse to
swap tokens: live top-5 pools by 24h volume, live quotes, approval/permit
handling, and real on-chain execution — all rendered on a 160×144 canvas with
a synthesized Game Boy APU for music and sound effects.

## Setup

```sh
npm install
cp .env.example .env.local   # then paste your Uniswap API key
npm run dev
```

- `UNISWAP_API_KEY` comes from the [Uniswap developer dashboard](https://developers.uniswap.org/dashboard)
  (free). It is injected **server-side** by the Vite dev proxy
  (`/uniswap-api` → `trade-api.gateway.uniswap.org/v1`) and never reaches the
  client bundle.
- Optional: drop the freeware **"Pokemon GB"** TTF (dafont.com/pokemon-gb.font)
  at `public/fonts/pokemon-gb.ttf` for the pixel-exact Gen 1 font. Without it
  the app falls back to the vendored Press Start 2P (OFL).

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move (tile-by-tile) |
| Space / Z | A button — interact, confirm, advance text (hold to fast-forward) |
| X / Shift / Esc | B button — cancel |

## How it's built

- **160×144 backbuffer**, integer-scaled, `image-rendering: pixelated`; fixed
  59.7275 Hz timestep. All art is hand-authored string-grid pixel data
  (`src/gfx/art/*.ts`) baked to canvases at boot; text renders from an
  alpha-thresholded 8×8 glyph atlas (no `fillText` at runtime).
- **Audio** (`src/audio/`): a Web Audio Game Boy APU — band-limited pulse waves
  at the four duty cycles, 4-bit stair-step envelopes, NR10-style sweeps, and a
  15-bit LFSR noise channel. The five UI sound effects use the exact register
  data from the pret/pokered disassembly; the title and Pokémon Center themes
  are hand-transcribed note-for-note into MIDI-number JSON
  (`src/audio/tracks/`, see `TRANSCRIPTION_NOTES.md`).
- **Game ↔ wallet bridge** (`src/bridge/`): the engine is framework-free and
  synchronous; all async work (wagmi actions, HTTP) happens in
  `walletBridge.ts`, communicating through typed events with sequence numbers
  to drop stale responses.
- **Swaps**: top pools from GeckoTerminal's keyless API (60s cache); quoting +
  calldata from the official **Uniswap Trading API** (`/check_approval` →
  `/quote` → `/swap`), executed via the connected wallet. WETH is presented
  and transacted as native ETH. NPC dialog text lives in
  `src/data/dialog.json`.

## Testing

```sh
node tools/e2e.mjs        # full drive with a mock EIP-6963 wallet (no funds move)
node tools/probe-pc.mjs   # targeted PC-interaction probe
node tools/render-art.mjs src/gfx/art/title.ts 4   # render pixel art to PNGs
```

The e2e mock wallet returns a real Base address (live balances), lets the app
fetch real pools and real quotes, builds real swap calldata, then **rejects**
the transaction send — verifying the whole flow without spending anything.

## Production note

The dev proxy only exists under `npm run dev`. Deploying requires a ~10-line
edge function doing the same rewrite + `x-api-key` injection.

## Provenance

All pixel art is original, hand-authored in Gen 1 style (no extracted Nintendo
assets); melodies are hand-transcribed from the pret/pokered disassembly's
note data. Non-commercial fan project — Pokémon is © Nintendo/Game Freak;
this project is not affiliated with Nintendo, Game Freak, or Uniswap Labs.
