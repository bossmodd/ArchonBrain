import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const url = process.argv[2] || 'http://127.0.0.1:5173';
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || (existsSync(systemChrome) ? systemChrome : undefined),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
mkdirSync('docs/screenshots', { recursive: true });

async function setTime(time) {
  await page.evaluate(time => window.archonDebug.setTime(time), time);
  await page.waitForFunction(time => window.archonDebug.snapshot().gasTime === time, time);
}

try {
  const asset = page.waitForResponse(response => response.url().endsWith('/models/archon-rigged.glb'));
  await page.goto(url);
  await page.getByRole('status').filter({ hasText: 'Ready' }).waitFor();
  const response = await asset;
  assert.equal(response.status(), 200);
  await setTime(0);
  await page.screenshot({ path: 'docs/screenshots/showcase.png' });
  await setTime(12);
  await page.screenshot({ path: 'docs/screenshots/showcase-later.png' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.screenshot({ path: 'docs/screenshots/controls.png' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Body', exact: true }).click();
  await page.screenshot({ path: 'docs/screenshots/body.png' });
  await page.getByRole('button', { name: 'Composite', exact: true }).click();
  await page.getByRole('button', { name: 'Orbit', exact: true }).click();
  await page.mouse.move(690, 455);
  await page.mouse.down();
  await page.mouse.move(905, 510, { steps: 24 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'docs/screenshots/orbit.png' });
  await page.getByRole('button', { name: 'Orbit', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'docs/screenshots/mobile.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  const result = {
    verifiedAt: new Date().toISOString(), url, glbHTTP: response.status(),
    glbContentType: response.headers()['content-type'], errors,
    screenshots: ['showcase', 'showcase-later', 'controls', 'body', 'orbit', 'mobile'],
    state: await page.evaluate(() => window.archonDebug.snapshot()),
  };
  writeFileSync('docs/browser-verification.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
