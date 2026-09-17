import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined) });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
mkdirSync('docs/recordings', { recursive: true });
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:4173');
  await page.locator('#status').filter({ hasText: 'Ready' }).waitFor();
  for (const mode of ['Composite', 'Body', 'Top']) {
    await page.getByRole('button', { name: mode === 'Top' ? 'Composite' : mode, exact: true }).click();
    if (mode === 'Top') {
      await page.getByRole('button', { name: 'Orbit', exact: true }).click();
      await page.mouse.move(640, 350); await page.mouse.down();
      await page.mouse.move(640, 820, { steps: 18 }); await page.mouse.up();
      await page.waitForTimeout(500);
    }
    await page.evaluate(() => window.archonDebug.setTime(0));
    await page.waitForFunction(() => window.archonDebug.snapshot({ measureEyes: false }).gasTime === 0);
    await page.evaluate(() => {
      const stream = document.querySelector('canvas').captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 4000000 });
      const chunks = [];
      window.motionRecording = new Promise(resolve => {
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = () => {
          stream.getTracks().forEach(track => track.stop());
          const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
        };
      });
      window.motionRecorder = recorder; recorder.start();
    });
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.waitForFunction(() => {
      const state = window.archonDebug.snapshot({ measureEyes: false });
      return state.time > 7.4 && state.interaction.phase === 'idle';
    }, null, { timeout: 45000 });
    const data = await page.evaluate(() => { window.motionRecorder.stop(); return window.motionRecording; });
    const path = `docs/recordings/interaction-${mode.toLowerCase()}.webm`;
    writeFileSync(path, Buffer.from(data, 'base64'));
    console.log(path);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
