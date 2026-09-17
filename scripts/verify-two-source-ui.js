import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const report = { at: new Date().toISOString(), url, errors: [], frames: [] };
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (['error', 'warning'].includes(m.type())) report.errors.push(m.text()); });
const capture = async name => {
  await page.screenshot({ path: `docs/screenshots/${name}.png` });
  report.frames.push({ name, diagnostics: await page.locator('#neural-diagnostics').innerText(),
    brain: await page.evaluate(() => window.archonDebug.brain.snapshot()),
    visual: await page.evaluate(() => window.archonDebug.snapshot()) });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
};
try {
  await page.goto(url);
  await page.locator('#status').filter({ hasText: 'Ready' }).waitFor();
  await page.getByRole('button', { name: 'Interact', exact: true }).click();
  await page.waitForFunction(() => window.archonDebug.brain.snapshot().status === 'running');
  await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    brain.configure({ realtime: false });
    await brain.restart();
    await brain.steps(1);
  });
  await page.getByRole('button', { name: 'Select source A', exact: true }).click();
  await capture('two-source-initial');
  await page.evaluate(() => window.archonDebug.brain.steps(279));
  await page.waitForFunction(() => window.archonDebug.snapshot({ measureEyes: false }).interaction.extension > .98);
  await page.getByRole('button', { name: 'Select source B', exact: true }).click();
  assert.equal(await page.evaluate(() => window.archonDebug.brain.snapshot().currentCommand.targetId), 'initial-b');
  await capture('two-source-absorption');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await capture('two-source-mobile');
  assert.deepEqual(report.errors, []);
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  fs.writeFileSync('docs/neural/two-source-ui-verification.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ frames: report.frames.map(f => f.name), errors: report.errors, failure: report.failure }));
  await browser.close();
}
