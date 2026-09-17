import { chromium } from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { WORLD_CONFIG, SIGNAL_CONFIG } from '../src/neural/NeuralWorld.js';
import { CONTROL_CONFIG, REMOTE_CONTROL_CONFIG } from '../src/neural/NeuralController.js';

const baseline = JSON.parse(fs.readFileSync('docs/neural/view-quality-baseline.json'));
for (const [key, value] of Object.entries({ WORLD_CONFIG, SIGNAL_CONFIG, CONTROL_CONFIG, REMOTE_CONTROL_CONFIG })) assert.deepEqual(value, baseline[key]);
for (const [path, hash] of Object.entries(baseline.sha256)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'), hash, `Preserve ${path}`);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const url = process.argv[2] || 'http://127.0.0.1:4173';
const report = { at: new Date().toISOString(), url, baseline, cases: [], singleRegression: [], errors: [], responses: [] };
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
page.on('response', r => { if (/flybrain\.(wasm|js)|flywire783|groups783|tame783|archon-rigged/.test(r.url())) report.responses.push({ url: r.url(), status: r.status() }); });
const start = options => page.evaluate(options => window.archonDebug.brain.start({ profile: 'olfactory', mode: 'interactive', realtime: false, assist: false, ...options }), options);
const get = () => page.evaluate(() => window.archonDebug.brain.snapshot());
const summarize = (trial, trace) => {
  const firstContact = trace.find(r => r.response.inputs.contactSugar > 0), firstAbsorption = trace.find(r => r.result.absorbed > 0);
  const totals = {}, transitions = [];
  let previous = '';
  for (const row of trace) {
    const key = `${row.command.phase}/${row.command.targetId}/${row.command.reason}`;
    if (key !== previous) transitions.push({ time: row.next.time, phase: row.command.phase, id: row.command.targetId, reason: row.command.reason, sources: row.result.sources });
    previous = key;
    if (row.result.absorbed > 0) totals[row.command.targetId] = (totals[row.command.targetId] || 0) + row.result.absorbed;
  }
  return { name: trial.name, seed: trial.seed, firstContact: firstContact ? { id: firstContact.sense.target.id, time: firstContact.sense.time } : null,
    firstAbsorption: firstAbsorption ? { id: firstAbsorption.command.targetId, time: firstAbsorption.next.time } : null,
    absorbedTotals: totals, transitions, finalPose: trace.at(-1).next.pose, finalSources: trace.at(-1).result.sources,
    pathLength: trace.reduce((sum, r) => sum + Math.hypot(r.next.pose.x - r.sense.pose.x, r.next.pose.z - r.sense.pose.z), 0),
    initialInputs: trace[0].response.inputs, finalInputs: trace.at(-1).response.inputs,
    meanOutputs: Object.fromEntries(Object.keys(trace[0].response.outputs).map(k => [k, trace.reduce((sum, r) => sum + r.response.outputs[k], 0) / trace.length])) };
};
try {
  await page.goto(url); await page.waitForFunction(() => window.archonDebug?.brain);
  for (const trial of JSON.parse(fs.readFileSync('docs/neural/two-source-trials.json'))) {
    await start({ seed: trial.seed, sources: trial.sources });
    await page.getByRole('button', { name: 'View all', exact: true }).click();
    const initial = await get(), trace = [], actions = [];
    const run = async count => {
      while (count > 0) {
        const chunk = Math.min(count, 100);
        await page.getByRole('button', { name: count % 200 ? 'Archon view' : 'View all', exact: true }).click();
        await page.getByRole('button', { name: 'Keep in view', exact: true }).click();
        const state = await page.evaluate(count => window.archonDebug.brain.steps(count), chunk);
        const lastSequence = trace.at(-1)?.sequence ?? -1;
        trace.push(...state.log.filter(row => row.sequence > lastSequence)); count -= chunk;
      }
    };
    if (trial.action) {
      await run(trial.action.at * 10);
      const before = await get();
      const value = await page.evaluate(action => {
        const brain = window.archonDebug.brain;
        if (action.type === 'add') return brain.addSource(action.source.position);
        if (action.type === 'edit') return brain.editSource(action.id, action.patch);
        return brain.removeSource(action.id);
      }, trial.action);
      const after = await get();
      assert.equal(before.simulationTime, after.simulationTime);
      assert.equal(before.last.response.modelTimeMs, after.last.response.modelTimeMs);
      if (trial.name === 'edit-other-during-absorption' || trial.name === 'overlap-lock') {
        assert.equal(before.currentCommand.phase, 'absorb');
        assert.equal(after.currentCommand.targetId, before.currentCommand.targetId);
      }
      if (trial.name === 'delete-connected') { assert.equal(before.currentCommand.phase, 'absorb'); assert.equal(after.currentCommand.reason, 'no-target'); }
      actions.push({ action: trial.action, value, before, after });
      await run((trial.seconds - trial.action.at) * 10);
    } else await run(trial.seconds * 10);
    for (const row of trace) {
      assert.equal(row.command.assistYaw, 0);
      assert(row.response.inputs.signalLeft <= 48 && row.response.inputs.signalRight <= 48);
      for (const source of row.result.sources) {
        const before = row.sense.contributions.find(c => c.id === source.id);
        assert(before);
        const change = before.remaining - source.remaining;
        assert(Math.abs(change - (row.command.targetId === source.id ? row.result.absorbed : 0)) < 1e-12, 'Only the bound source may lose energy');
      }
    }
    const state = await get(), summary = summarize(trial, trace);
    const oldCase = JSON.parse(fs.readFileSync('docs/neural/two-source-verification.json')).cases.find(c => c.trial.name === trial.name && c.trial.seed === trial.seed);
    assert.deepEqual(trace.map(r => r.response.outputs), oldCase.trace.map(r => r.response.outputs));
    assert.deepEqual(trace.map(r => r.next.pose), oldCase.trace.map(r => r.next.pose));
    assert.deepEqual(trace.map(r => r.result.sources), oldCase.trace.map(r => r.result.sources));
    report.cases.push({ trial, initial, actions, summary, trace, state, matchesBaseline: true });
    console.log(JSON.stringify(summary));
  }
  const ordered = report.cases.find(c => c.trial.name === 'equal-separated' && c.trial.seed === 1);
  const reversed = report.cases.find(c => c.trial.name === 'equal-reversed-array');
  assert.deepEqual(ordered.trace.map(r => r.response.outputs), reversed.trace.map(r => r.response.outputs));
  assert.deepEqual(ordered.trace.map(r => r.next.pose), reversed.trace.map(r => r.next.pose));

  // Compare the original 20 single-source fixtures against the preserved app log.
  const old = JSON.parse(fs.readFileSync('docs/neural/approach-app-summary.json')).cases.filter(c => c.mode === 'active');
  for (const trial of JSON.parse(fs.readFileSync('docs/neural/approach-trials.json'))) {
    await start({ mode: 'fixed', seed: trial.seed, sources: [trial.source], pose: trial.pose });
    const state = await page.evaluate(async () => {
      for (let i = 0; i < 6; i++) {
        document.querySelector(i % 2 ? '#view-all' : '#view-archon').click();
        document.querySelector('#keep-in-view').click();
        await window.archonDebug.brain.steps(50);
      }
      return window.archonDebug.brain.snapshot();
    });
    const absorbed = state.log.find(r => r.result.absorbed > 0);
    assert(absorbed, `${trial.name} single regression must absorb`);
    const previous = old.find(c => c.name === trial.name && c.seed === trial.seed && c.heading === trial.pose.heading);
    for (const key of ['x', 'z', 'heading']) assert(Math.abs(state.pose[key] - previous.pose[key]) < 1e-9);
    assert(Math.abs(state.sources[0].remaining - previous.remaining) < 1e-12);
    report.singleRegression.push({ trial, absorbedAt: absorbed.next.time, finalPose: state.pose, remaining: state.sources[0].remaining, matchesBaseline: true });
  }
  assert.deepEqual(report.errors, []);
  assert(report.responses.every(r => r.status === 200));
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  fs.writeFileSync('docs/neural/view-quality-behavior.json', JSON.stringify(report));
  fs.writeFileSync('docs/neural/view-quality-behavior-summary.json', JSON.stringify({ ...report, cases: report.cases.map(c => ({ ...c.summary, actions: c.actions.map(a => ({ action: a.action, value: a.value, before: a.before.currentCommand, after: a.after.currentCommand })) })) }, null, 2));
  console.log(JSON.stringify({ cases: report.cases.length, singleRegression: report.singleRegression.length, errors: report.errors, failure: report.failure }));
  await browser.close();
}
