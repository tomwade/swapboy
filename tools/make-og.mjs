// Capture the title screen as a 1200x630 OG share image (public/og.png).
// Boots the real app in headless Chrome and screenshots the GB shell on the
// page background. Requires the dev server: node tools/make-og.mjs [url]
//
// The PRESS SPACE prompt blinks on a 30-frame cycle; the shot is timed via the
// dev-only window.__gbEngine hook so the prompt is always visible.
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.argv[2] ?? 'http://localhost:5173';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=1200,700', '--hide-scrollbars'],
  defaultViewport: { width: 1200, height: 630, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle0' });

// Engine exists once assets load and the title scene starts.
await page.waitForFunction('window.__gbEngine !== undefined', { timeout: 15_000 });

// Early in the visible half of the blink cycle => prompt stays up during shot.
await page.waitForFunction('window.__gbEngine.frame % 60 >= 2 && window.__gbEngine.frame % 60 <= 18', {
  polling: 'raf',
  timeout: 15_000,
});

await page.screenshot({ path: 'public/og.png' });
await browser.close();
console.log('wrote public/og.png (1200x630)');
