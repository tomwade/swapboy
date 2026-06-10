// Minimal probe: mock wallet with verbose RPC logging, drive title -> connect.
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ADDRESS = '0x4200000000000000000000000000000000000011';

const MOCK = `(() => {
  const ADDRESS = '${ADDRESS}';
  const provider = {
    request: async (args) => {
      console.log('[mock rpc]', JSON.stringify(args));
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 820, height: 760 },
});
const page = await browser.newPage();
page.on('console', (m) => console.log(`[${m.type()}]`, m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.evaluateOnNewDocument(MOCK);
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
await sleep(1000);
await page.keyboard.press('Space'); // title -> connect
// Mash A to get through the intro text, then select the first wallet.
for (let i = 0; i < 6; i++) {
  await sleep(900);
  await page.keyboard.press('Space');
}
await sleep(4000);
await page.screenshot({ path: 'tools/out/e2e/probe-connect.png' });
await browser.close();
console.log('probe done');
