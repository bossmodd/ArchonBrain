import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined) });
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
mkdirSync('docs/screenshots', { recursive: true });
try {
  await page.goto('http://127.0.0.1:5173/docs/rig-study.html');
  await page.waitForFunction(() => Boolean(window.rigStudy));
  for (const view of ['top', 'oblique', 'side']) {
    for (const [phase, time] of [['gather', 1.1], ['absorb', 2.4], ['release', 6.4], ['idle', 7.0]]) {
      await page.evaluate(({ view, time }) => { window.rigStudy.view(view); window.rigStudy.pose(time); }, { view, time });
      await page.locator('canvas').screenshot({ path: `docs/screenshots/arm-${view}-${phase}.png` });
    }
  }
  const calibration = await page.evaluate(() => window.rigStudy.body.info.armCalibration);
  assert.ok(calibration.correctedVertices > 1000); assert.deepEqual(errors, []);
  writeFileSync('docs/arm-verification.json', JSON.stringify({ verifiedAt: new Date().toISOString(), calibration, errors, captures: 12 }, null, 2) + '\n');
  console.log(JSON.stringify({ calibration, errors, captures: 12 }));
} finally { await browser.close(); }
