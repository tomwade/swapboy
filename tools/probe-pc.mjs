// Targeted probe: connect, then walk straight to the PC and interact.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ADDRESS = '0x4200000000000000000000000000000000000011';
const MOCK = `(() => {
  const provider = {
    request: async (args) => {
      switch (args.method) {
        case 'eth_requestAccounts': case 'eth_accounts': return ['${ADDRESS}'];
        case 'eth_chainId': return '0x2105';
        case 'wallet_switchEthereumChain': return null;
        default: { const e = new Error('nope'); e.code = -32601; throw e; }
      }
    },
    on: () => {}, removeListener: () => {},
  };
  const detail = Object.freeze({ info: { uuid: 'f1c9c8a2-1111-4222-8333-444455556666', name: 'Mock Wallet', icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=', rdns: 'io.mock.wallet' }, provider });
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('tools/out/e2e', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 820, height: 760 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(MOCK);
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
await sleep(1200);
const press = async (c, ms = 70) => { await page.keyboard.down(c); await sleep(ms); await page.keyboard.up(c); };
const hold = async (c, ms) => { await page.keyboard.down(c); await sleep(ms); await page.keyboard.up(c); };
await press('Space');
for (let i = 0; i < 4; i++) { await sleep(1100); await press('Space'); }
await sleep(600);
await press('Space'); // select wallet
await sleep(5000); // confirmed + fade -> center
// Tap-walk one tile at a time: spawn (4,7) -> (7,7) -> (7,3) -> (8,3), face right at PC (9,3)
const tap = async (c) => { await hold(c, 230); await sleep(260); };
for (let i = 0; i < 3; i++) await tap('KeyD');
for (let i = 0; i < 4; i++) await tap('KeyW');
await tap('KeyD');
await sleep(300);
await press('Space');
await sleep(2200);
await page.screenshot({ path: 'tools/out/e2e/probe-pc.png' });
await browser.close();
console.log('pc probe done');
