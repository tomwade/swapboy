// End-to-end drive of the Game Boy app with a mock EIP-6963 wallet.
// The mock returns a real Base address (for live balance reads via the public
// RPC), signs typed data with a dummy signature, and REJECTS transaction sends
// with code 4001 — so the flow exercises real pools + real Trading API quotes
// + real swap calldata, then verifies the wallet-rejection path. No funds move.
//
//   node tools/e2e.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://localhost:5173';
const OUT = 'tools/out/e2e';
const ADDRESS = '0x4200000000000000000000000000000000000011'; // Base fee vault (has ETH)
const WETH = '0x4200000000000000000000000000000000000006';

const MOCK_PROVIDER = `(() => {
  const ADDRESS = '${ADDRESS}';
  const provider = {
    request: async (args) => {
      switch (args.method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return [ADDRESS];
        case 'eth_chainId':
          return '0x2105';
        case 'wallet_switchEthereumChain':
          return null;
        case 'eth_signTypedData_v4':
          return '0x' + '11'.repeat(65);
        case 'eth_sendTransaction': {
          const err = new Error('User rejected the request.');
          err.code = 4001;
          throw err;
        }
        default: {
          const err = new Error('Mock: unsupported ' + args.method);
          err.code = -32601;
          throw err;
        }
      }
    },
    on: () => {},
    removeListener: () => {},
  };
  const detail = Object.freeze({
    info: {
      uuid: 'f1c9c8a2-1111-4222-8333-444455556666',
      name: 'Mock Wallet',
      icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
      rdns: 'io.mock.wallet',
    },
    provider,
  });
  const announce = () =>
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
})();`;

// Pick the same top-5 pools the app will fetch; find the first with a WETH side.
async function pickPool() {
  const res = await fetch(
    'https://api.geckoterminal.com/api/v2/networks/base/dexes/uniswap-v3-base/pools?sort=h24_volume_usd_desc&include=base_token,quote_token&page=1',
  );
  const body = await res.json();
  const tokens = new Map(body.included.map((t) => [t.id, t.attributes]));
  for (let i = 0; i < Math.min(5, body.data.length); i++) {
    const p = body.data[i];
    const base = tokens.get(p.relationships.base_token.data.id);
    const quote = tokens.get(p.relationships.quote_token.data.id);
    if (base?.address?.toLowerCase() === WETH.toLowerCase()) return { index: i, side: 0, name: p.attributes.name };
    if (quote?.address?.toLowerCase() === WETH.toLowerCase()) return { index: i, side: 1, name: p.attributes.name };
  }
  return { index: 0, side: 0, name: 'fallback' };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const target = await pickPool();
console.log(`target pool #${target.index + 1} (${target.name}), ETH side = token${target.side}`);

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=840,780', '--hide-scrollbars'],
  defaultViewport: { width: 820, height: 760 },
});
const page = await browser.newPage();
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error') console.log(`[console.${t}]`, m.text());
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.evaluateOnNewDocument(MOCK_PROVIDER);

let step = 0;
const shot = async (name) => {
  step++;
  const file = `${OUT}/${String(step).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  console.log(`shot: ${file}`);
};
const press = async (code, holdMs = 70) => {
  await page.keyboard.down(code);
  await sleep(holdMs);
  await page.keyboard.up(code);
};
const hold = async (code, ms) => {
  await page.keyboard.down(code);
  await sleep(ms);
  await page.keyboard.up(code);
};

await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(1200);
await shot('title');

// Title -> connect; intro is 4 wrapped lines -> needs A presses to scroll.
await press('Space');
for (let i = 0; i < 4; i++) {
  await sleep(1100);
  await press('Space');
}
await sleep(600);
await shot('connect-menu');

// Select first wallet (MOCK WALLET)
await press('Space');
await sleep(2200); // linking + "ID No ... confirmed!" + 90-frame pause
await shot('connected');
await sleep(2600); // fade out/in to center
await shot('center');

// Walk up to the counter (spawn 4,7 -> row 3 below counter)
await hold('KeyW', 2000);
await sleep(400);
await shot('at-counter');

// Talk to nurse ("Welcome to the Pokemon Center! How can I help?" = 3 lines)
await press('Space');
await sleep(2600);
await press('Space'); // advance line scroll
await sleep(1600);
await shot('nurse-menu');

// SWAP TOKENS
await press('Space');
await sleep(3000); // pool fetch (live GeckoTerminal)
await shot('pool-list');

// Navigate to the target pool
for (let i = 0; i < target.index; i++) {
  await press('KeyS');
  await sleep(250);
}
await press('Space');
await sleep(1500);
await shot('direction');

// Pick the ETH side
if (target.side === 1) {
  await press('KeyS');
  await sleep(250);
}
await press('Space');
await sleep(2800); // token meta fetch (live RPC)
await shot('amount');

// Increment the digit under the caret twice (small ETH amount), confirm
await press('KeyW');
await sleep(200);
await press('KeyW');
await sleep(200);
await shot('amount-entered');
await press('Space');
await sleep(4500); // live quote via Trading API proxy
await shot('quote-confirm');

// YES -> native ETH path -> build swap (real calldata) -> send -> mock rejects
await press('Space');
await sleep(6500);
await shot('after-reject');

// Dismiss rejection -> back to confirm -> NO -> goodbye -> explore
await press('Space');
await sleep(1500);
await shot('back-at-confirm');
await press('KeyS'); // cursor to NO
await sleep(250);
await press('Space');
await sleep(1800);
await shot('goodbye');
await press('Space');
await sleep(1500);

// Walk to the bench man at (0,4): down, left to col 1, up to row 4, face left
await hold('KeyS', 1600);
await hold('KeyA', 1800);
await hold('KeyW', 950);
await sleep(200);
await press('KeyA');
await sleep(300);
await press('Space');
await sleep(2600);
await press('Space');
await sleep(2000);
await shot('bench-man');
await press('Space');
await sleep(800);
await press('Space');
await sleep(800);

// PC: walk right across the room to (8,3), face right, interact
await hold('KeyD', 3400);
await hold('KeyW', 1000);
await press('KeyD');
await sleep(400);
await press('Space');
await sleep(2400);
await shot('pc');

await browser.close();
console.log('E2E drive complete.');
