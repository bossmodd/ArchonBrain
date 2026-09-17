import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const url = process.argv[2] || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], responses = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('response', response => { if (/flybrain\.(wasm|js)|flywire783|groups783|archon-rigged/.test(response.url())) responses.push({ url: response.url(), status: response.status() }); });
const source = (x, z, strength = 1, y = 2.4) => [{ id: 'one', position: { x, y, z }, strength, remaining: 1 }];
const start = options => page.evaluate(options => window.archonDebug.brain.start({ realtime: false, ...options }), options);
const steps = count => page.evaluate(count => window.archonDebug.brain.steps(count), count);
const configure = options => page.evaluate(options => window.archonDebug.brain.configure(options), options);
const get = () => page.evaluate(() => window.archonDebug.brain.snapshot());
const report = { at: new Date().toISOString(), url, cases: {} };
await mkdir('docs/neural', { recursive: true });
await mkdir('docs/screenshots', { recursive: true });
try {
  await page.goto(url);
  await page.waitForFunction(() => window.archonDebug?.brain);
  report.metadata = await start({ sources: [] });
  report.cases.noStimulus = await steps(15);
  for (const [label, x] of [['left', 2.2], ['right', -2.2]]) {
    await start({ sources: source(x, 2.4) });
    report.cases[label] = await steps(60);
  }
  await configure({ sources: source(1.5, 3.2, 0.3) });
  report.cases.changedPositionAndStrength = await steps(15);
  // Test range entry without inventing a pursuit behavior: place the one source
  // just outside the range along an OBSERVED neural translation vector.
  await start({ sources: source(-1.12665, 2.06233) });
  let moving;
  for (let i = 0; i < 200; i++) {
    moving = await steps(1);
    if (Math.abs(moving.last.command.speed) > 0.02) break;
  }
  assert(Math.abs(moving.last.command.speed) > 0.02, 'Need an actual translation output for the boundary trial');
  report.cases.beforeRangeEntry = moving;
  const p = moving.pose, sign = Math.sign(moving.last.command.speed);
  await configure({ sources: source(p.x + Math.sin(p.heading) * sign * 2.30001, p.z + Math.cos(p.heading) * sign * 2.30001) });
  report.rangeIntervention = { type: 'explicit source placement along observed movement', startingDistance: 2.30001, speed: moving.last.command.speed };
  report.cases.rangeEntryAndAbsorption = await steps(50);
  const contact = report.cases.rangeEntryAndAbsorption.log.find(row => row.sense.inputs.contactSugar === 0 && row.next.inputs.contactSugar > 0);
  assert(contact, 'Actual neural translation must cross the contact boundary');
  assert(report.cases.rangeEntryAndAbsorption.log.some(row => row.result.absorbed > 0), 'Actual MN9 must activate absorption');
  const initialRemaining = report.cases.rangeEntryAndAbsorption.sources[0].remaining;
  report.cases.depletion = await steps(30);
  assert(report.cases.depletion.sources[0].remaining < initialRemaining);
  // Accelerated neural stepping is diagnostic only; allow the existing motion
  // envelope to settle before checking the actual visible rig and beam.
  await page.waitForFunction(() => window.archonDebug.snapshot({ measureEyes: false }).interaction.extension > 0.98);
  report.visible = await page.evaluate(() => window.archonDebug.snapshot());
  await page.screenshot({ path: 'docs/screenshots/neural-absorption.png' });
  const before = await get();
  await configure({ outputsEnabled: false, assist: true });
  report.cases.outputBlocked = await steps(30);
  assert.deepEqual(report.cases.outputBlocked.pose, before.pose);
  assert.deepEqual(report.cases.outputBlocked.sources, before.sources);
  assert.equal(report.cases.outputBlocked.currentCommand.assistYaw, 0);
  await configure({ outputsEnabled: true, assist: false });
  await steps(30);
  await configure({ sources: [] });
  report.cases.removedDuringInteraction = await steps(8);
  assert.equal(report.cases.removedDuringInteraction.last.command.reason, 'no-target');
  assert.equal(report.cases.removedDuringInteraction.last.next.inputs.contactSugar, 0);
  // Keep a valid nearby target while reducing contact drive: release must come
  // from measured MN9, not target disappearance or range loss.
  await start({ sources: source(0, 2, 1, 3) });
  await steps(30);
  await configure({ sources: source(0, 2, 0.02, 3) });
  report.cases.weakContact = await steps(25);
  assert(report.cases.weakContact.events.some(e => e.reason === 'MN9-below-hold'));
  assert(report.cases.weakContact.last.next.target.distance < 2.3);
  // Compare assistance on/off from exactly the same real neural initial state.
  for (const assist of [false, true]) {
    await start({ sources: source(-1.12665, 2.06233), assist });
    report.cases[assist ? 'assistOn' : 'assistOff'] = await steps(60);
  }
  // No updates while paused; neural/environment clocks resume one fixed step at a time.
  await start({ realtime: true, sources: source(0, 2.15, 1, 3) });
  await page.waitForFunction(() => window.archonDebug.brain.snapshot().simulationTime > 2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForTimeout(200);
  const paused = await get();
  await page.waitForTimeout(350);
  assert.equal((await get()).simulationTime, paused.simulationTime);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(t => window.archonDebug.brain.snapshot().simulationTime > t + 0.5, paused.simulationTime);
  report.cases.realtime = await get();
  assert(Math.abs(report.cases.realtime.simulationTime * 1000 - report.cases.realtime.last.response.modelTimeMs) < 1e-6);
  await page.evaluate(() => window.archonDebug.brain.configure({ realtime: false }));
  await page.waitForTimeout(200);
  const stalledBefore = await get();
  await page.workers()[0].evaluate(() => { self.onmessage = () => {}; });
  await page.evaluate(() => window.archonDebug.brain.steps(1).catch(e => e.message));
  report.cases.stalled = await get();
  assert.equal(report.cases.stalled.status, 'error');
  assert.deepEqual(report.cases.stalled.pose, stalledBefore.pose);
  assert.deepEqual(report.cases.stalled.sources, stalledBefore.sources);
  await page.screenshot({ path: 'docs/screenshots/neural-failure.png' });
  assert.deepEqual(errors, []);
  assert(responses.every(r => r.status === 200));
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  report.errors = errors;
  report.responses = responses;
  await writeFile('docs/neural/verification.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ cases: Object.keys(report.cases), errors, failure: report.failure, file: 'docs/neural/verification.json' }, null, 2));
  await browser.close();
}
