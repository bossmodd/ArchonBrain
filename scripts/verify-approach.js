import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const trials = JSON.parse(fs.readFileSync('docs/neural/approach-trials.json'));
const report = { at: new Date().toISOString(), url, timeoutSeconds: 30, contactRange: 2.3, assist: false, cases: [], errors: [], responses: [] };
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
page.on('response', r => { if (/flybrain\.(wasm|js)|flywire783|groups783|tame783|archon-rigged/.test(r.url())) report.responses.push({ url: r.url(), status: r.status() }); });
const start = options => page.evaluate(options => window.archonDebug.brain.start({ realtime: false, profile: 'olfactory', ...options }), options);
const steps = count => page.evaluate(count => window.archonDebug.brain.steps(count), count);
const configure = options => page.evaluate(options => window.archonDebug.brain.configure(options), options);
const key = t => `${t.name}/${t.seed}/${t.pose.heading}`;
const summarize = (state, trial, mode) => {
  const rows = state.log, first = rows[0], last = rows.at(-1);
  const contact = rows.find(r => r.next.inputs.contactSugar > 0), absorption = rows.find(r => r.result.absorbed > 0);
  return { key: key(trial), name: trial.name, split: trial.split, seed: trial.seed, heading: trial.pose.heading, mode,
    initialDistance: first.sense.target?.distance, finalDistance: last.next.target?.distance,
    minDistance: Math.min(...rows.map(r => r.next.target?.distance ?? Infinity)),
    initialBearing: first.sense.target?.bearing, contactBearing: contact?.next.target.bearing ?? null,
    finalBearing: last.next.target?.bearing, contactSeconds: contact?.next.time ?? null, absorptionSeconds: absorption?.next.time ?? null,
    remaining: state.sources[0]?.remaining, pose: state.pose, initialInputs: first.response.inputs,
    meanOutputs: Object.fromEntries(Object.keys(first.response.outputs).map(k => [k, rows.reduce((sum, r) => sum + r.response.outputs[k], 0) / rows.length])),
    pathLength: rows.reduce((sum, r) => sum + Math.hypot(r.next.pose.x - r.sense.pose.x, r.next.pose.z - r.sense.pose.z), 0),
    maxClockErrorMs: Math.max(...rows.map(r => Math.abs(r.response.modelTimeMs - r.next.time * 1000))),
    cappedInputs: rows.filter(r => r.response.inputs.signalLeft === 48 || r.response.inputs.signalRight === 48).length,
    maxSpikesPerWindow: Math.max(...rows.map(r => r.response.spikes)),
  };
};
try {
  await page.goto(url);
  await page.waitForFunction(() => window.archonDebug?.brain);
  for (const mode of ['active', 'blocked', 'directionless']) {
    for (const trial of trials.filter(t => mode !== 'blocked' || t.split === 'development')) {
      const initial = { seed: trial.seed, pose: trial.pose, sources: [trial.source], directional: mode !== 'directionless', assist: false };
      await start(initial);
      if (mode === 'blocked') {
        await configure({ outputsEnabled: false });
        await page.evaluate(() => window.archonDebug.brain.restart());
      }
      const state = await steps(trial.timeoutSeconds * 10);
      const summary = summarize(state, trial, mode);
      assert.equal(state.metadata.silencedNeurons, 161);
      assert.deepEqual(state.sources[0].position, trial.source.position);
      assert(state.log.every(r => r.command.assistYaw === 0));
      assert(state.log.every(r => r.sense.target.distance <= 2.3 || r.response.inputs.contactSugar === 0));
      assert(summary.maxClockErrorMs < 1e-6);
      if (mode === 'blocked') {
        const active = report.cases.find(c => c.summary.mode === 'active' && c.summary.key === summary.key);
        assert.deepEqual(state.initial, active.state.initial);
        assert.deepEqual(state.log[0].response.outputs, active.state.log[0].response.outputs);
        assert.deepEqual(state.pose, trial.pose);
        assert.equal(state.sources[0].remaining, 1);
        assert.equal(summary.absorptionSeconds, null);
      }
      if (mode === 'directionless') assert(state.log.every(r => r.response.inputs.signalLeft === r.response.inputs.signalRight));
      report.cases.push({ trial, summary, state });
      console.log(JSON.stringify(summary));
    }
  }
  // Actual app regression: unchanged nearby pathway, then remote absorption,
  // depletion, loss of neural feed drive, target removal and worker failure.
  report.regression = {};
  await start({ profile: 'lc11' });
  report.regression.near = await steps(40);
  assert(report.regression.near.log.some(r => r.result.absorbed > 0));
  await start({ sources: [] });
  report.regression.noStimulus = await steps(30);
  assert(report.regression.noStimulus.log.every(r => r.response.spikes === 0));
  const trial = trials[0];
  await start({ seed: trial.seed, sources: [trial.source], pose: trial.pose });
  await steps(85);
  await page.waitForFunction(() => window.archonDebug.snapshot({ measureEyes: false }).interaction.extension > .98);
  report.visible = await page.evaluate(() => window.archonDebug.snapshot());
  assert(report.visible.eyeSurfaceGap < .01);
  for (let i = 0; i < 2; i++) assert(Math.hypot(...report.visible.interaction.connection.ends[i].map((v, j) => v - report.visible.interaction.hands[i][j])) < .001);
  await page.screenshot({ path: 'docs/screenshots/remote-absorption.png' });
  const before = await page.evaluate(() => window.archonDebug.brain.snapshot());
  report.regression.feedback = await steps(20);
  assert(report.regression.feedback.sources[0].remaining < before.sources[0].remaining);
  const weak = report.regression.feedback.sources.map(s => ({ ...s, strength: .02 }));
  await configure({ sources: weak });
  report.regression.weakContact = await steps(20);
  assert(report.regression.weakContact.events.some(e => e.reason === 'MN9-below-hold'));
  await configure({ sources: before.sources });
  await steps(30);
  await configure({ sources: [] });
  report.regression.removal = await steps(10);
  assert.equal(report.regression.removal.currentCommand.reason, 'no-target');
  assert.equal(report.regression.removal.last.next.inputs.contactSugar, 0);
  await start({ sources: [trial.source] });
  await steps(85);
  const stalled = await page.evaluate(() => window.archonDebug.brain.snapshot());
  await page.workers()[0].evaluate(() => { self.onmessage = () => {}; });
  await page.evaluate(() => window.archonDebug.brain.steps(1).catch(e => e.message));
  report.regression.failure = await page.evaluate(() => window.archonDebug.brain.snapshot());
  assert.equal(report.regression.failure.status, 'error');
  assert.deepEqual(report.regression.failure.pose, stalled.pose);
  assert.deepEqual(report.regression.failure.sources, stalled.sources);
  assert.equal(report.regression.failure.currentCommand.speed, 0);
  assert.deepEqual(report.errors, []);
  assert(report.responses.every(r => r.status === 200));
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  fs.writeFileSync('docs/neural/approach-app-verification.json', JSON.stringify(report));
  fs.writeFileSync('docs/neural/approach-app-summary.json', JSON.stringify({ ...report, cases: report.cases.map(c => c.summary), regression: Object.fromEntries(Object.entries(report.regression || {}).map(([k, s]) => [k, { status: s.status, pose: s.pose, sources: s.sources, command: s.currentCommand }])) }, null, 2));
  console.log(JSON.stringify({ cases: report.cases.length, errors: report.errors, failure: report.failure }));
  await browser.close();
}
