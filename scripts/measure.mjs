/*
 * Drives the built lab with headless Chromium and scrapes the app's own
 * instrumentation (latency meters expose data-* attributes, FPS badge
 * exposes data-fps) to collect real blocking-vs-concurrent measurements.
 *
 * Usage (playwright-core is NOT a dependency of the lab itself):
 *   npm run build && npm run preview &          # serve on :4173
 *   npm i --no-save playwright-core
 *   PW_CHROMIUM=/path/to/chrome node scripts/measure.mjs
 */
import { chromium } from 'playwright-core';

const URL = 'http://localhost:4173/';
const EXECUTABLE = process.env.PW_CHROMIUM;

async function typeInto(page, selector, text, fpsSamples) {
  await page.click(selector);
  for (const ch of text) {
    await page.type(selector, ch, { delay: 120 });
    if (fpsSamples) {
      const fps = await page.getAttribute('.fps-badge', 'data-fps');
      fpsSamples.push(Number(fps));
    }
  }
  // let the last transition/deferred render settle
  await page.waitForTimeout(800);
}

async function readMeter(page, source) {
  const el = page.locator(`.latency-meter[data-source="${source}"]`);
  return {
    average: Number(await el.getAttribute('data-average')),
    worst: Number(await el.getAttribute('data-worst')),
  };
}

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500); // let FPS baseline settle

const results = {};

// --- Section 1: blocking search ---
const fpsBlocking = [];
await typeInto(page, '.search-panel.blocking input', 'turbo', fpsBlocking);
results.blocking = await readMeter(page, 'blocking');
results.blocking.minFps = Math.min(...fpsBlocking.filter((n) => n > 0));

// clear + settle
await page.waitForTimeout(1200);

// --- Section 2: concurrent search ---
const fpsConcurrent = [];
await typeInto(page, '.search-panel.concurrent input', 'turbo', fpsConcurrent);
results.concurrent = await readMeter(page, 'concurrent');
results.concurrent.minFps = Math.min(...fpsConcurrent.filter((n) => n > 0));

// interrupted transitions logged?
results.interrupted = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.update-log tbody tr')];
  return rows.filter((r) => r.textContent.includes('interrupted')).length;
});

// flamechart chunk counts
await page.waitForTimeout(600);
results.flame = await page.evaluate(() => {
  return [...document.querySelectorAll('.flame-row')].map((row) => ({
    title: row.querySelector('.flame-title')?.childNodes[0]?.textContent?.trim(),
    stats: row.querySelector('.flame-stats')?.textContent,
  }));
});

// --- Section 3: deferred demo, ON then OFF ---
const deferInput = '.deferred-demo input[type="text"]';
await page.fill(deferInput, '');
await typeInto(page, deferInput, 'lab', null);
results.deferredOn = await readMeter(page, 'deferred-on');

await page.click('.deferred-demo .toggle input');
await typeInto(page, deferInput, 'xyz', null);
results.deferredOff = await readMeter(page, 'deferred-off');

console.log(JSON.stringify(results, null, 2));
await browser.close();
