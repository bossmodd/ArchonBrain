import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';

const url = process.argv[2] || 'http://127.0.0.1:5173';
const output = process.argv[3] || 'docs/first-experience/range-results.json';
if (fs.existsSync(output)) throw new Error('Refusing to overwrite an existing verification record');
const conditions = JSON.parse(fs.readFileSync('docs/first-experience/range-conditions.json'));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = { environment: { browser: browser.version(), mode: 'Headless installed desktop Chrome, actual app WASM worker', platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0].model, url }, conditions, results: [], errors: [] };
page.on('pageerror', e => report.errors.push(e.message));
try {
  await page.goto(url); await page.locator('#status').filter({ hasText: 'Ready' }).waitFor();
  for (const trial of conditions.cases) {
    const state = await page.evaluate(async trial => {
      const b = window.archonDebug.brain;
      await b.start({ profile: 'olfactory', mode: 'interactive', realtime: false, assist: false,
        directional: true, outputsEnabled: true, seed: trial.seed, pose: trial.pose, sources: [trial.source] });
      return b.steps(trial.seconds * 10);
    }, trial);
    const rows = state.log;
    assert.equal(rows.length, trial.seconds * 10);
    assert.equal(state.metadata.silencedNeurons, 161);
    assert.deepEqual(state.sources[0].position, trial.source.position);
    assert(rows.every(r => r.command.assistYaw === 0 && (r.sense.target.distance <= 2.3 || r.response.inputs.contactSugar === 0)));
    const contact = rows.find(r => r.next.inputs.contactSugar > 0);
    const absorb = rows.find(r => r.result.absorbed > 0);
    const summary = { id: trial.id, contactSeconds: contact?.next.time ?? null, absorptionSeconds: absorb?.next.time ?? null,
      finalDistance: rows.at(-1).next.target.distance, minDistance: Math.min(...rows.map(r => r.next.target.distance)),
      finalBearing: rows.at(-1).next.target.bearing, remaining: state.sources[0].remaining,
      pathLength: rows.reduce((sum, r) => sum + Math.hypot(r.next.pose.x - r.sense.pose.x, r.next.pose.z - r.sense.pose.z), 0),
      saturatedWindows: rows.filter(r => r.response.inputs.signalLeft >= 48 || r.response.inputs.signalRight >= 48).length,
      maxSpikes: Math.max(...rows.map(r => r.response.spikes)),
      maxClockErrorMs: Math.max(...rows.map(r => Math.abs(r.next.time * 1000 - r.response.modelTimeMs))) };
    assert(summary.maxClockErrorMs < 1e-6);
    report.results.push({ trial, summary, trace: rows.map(r => ({ time: r.next.time, inputs: r.response.inputs,
      raw: r.response.raw, outputs: r.response.outputs, command: r.command, pose: r.next.pose,
      remaining: r.result.sources[0].remaining, nextInputs: r.next.inputs })) });
    console.log(JSON.stringify(summary));
  }
  assert.deepEqual(report.errors, []);
} finally {
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
  await browser.close();
}
