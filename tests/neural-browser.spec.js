import { reveal } from './helpers/disclosures.js';
import { test, expect } from '@playwright/test';

test('remote real worker approach and restart use the same seed, source, pose and gates', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const active = await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    await brain.start({ realtime: false, profile: 'olfactory', seed: 1, sources: [{ id: 'fixed', position: { x: Math.sqrt(12), y: 2.4, z: 2 }, strength: 1 }] });
    return brain.steps(160);
  });
  expect(active.metadata.profile).toBe('olfactory');
  expect(active.metadata.silencedNeurons).toBe(161);
  expect(active.log.some(row => row.result.absorbed > 0)).toBe(true);
  expect(active.log.every(row => row.command.assistYaw === 0)).toBe(true);
  expect(active.log.every(row => row.sense.target.distance <= 2.3 || row.response.inputs.contactSugar === 0)).toBe(true);
  const blocked = await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    brain.configure({ outputsEnabled: false });
    await brain.restart();
    return brain.steps(160);
  });
  expect(blocked.initial).toEqual(active.initial);
  expect(blocked.pose).toEqual({ x: 0, z: 0, heading: 0 });
  expect(blocked.sources[0].remaining).toBe(1);
  expect(blocked.log[0].response.outputs).toEqual(active.log[0].response.outputs);
  expect(blocked.currentCommand.reason).toBe('outputs-blocked');
  const repeated = await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    brain.configure({ outputsEnabled: true });
    await brain.restart();
    return brain.steps(160);
  });
  expect(repeated.pose).toEqual(active.pose);
  expect(repeated.sources).toEqual(active.sources);
  expect(repeated.log.map(row => row.response.outputs)).toEqual(active.log.map(row => row.response.outputs));
});

test('small diagnostics expose real remote input, motor command and same-state output comparison', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/?brain=1&trial=left');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.locator('#neural-detail > summary').click();
  await reveal(page, '#runtime-details > summary');
  await page.getByText('Timing & sample details', { exact: true }).click();
  await expect(page.locator('#neural-diagnostics')).toBeVisible();
  await expect(page.locator('#neural-diagnostics')).toContainText('Psionic signal');
  await expect(page.locator('#neural-diagnostics')).toContainText('DNa02');
  await expect(page.locator('#neural-diagnostics')).toContainText('Assist OFF');
  const initial = await page.evaluate(() => window.archonDebug.brain.snapshot().initial);
  expect(initial.profile).toBe('olfactory');
  expect(initial.sources[0].position.x).toBeCloseTo(Math.sqrt(12));
  await page.locator('#tune').click();
  await reveal(page, '#gui-container');
  await page.getByRole('button', { name: /Neural control/ }).click();
  await page.getByLabel('Transmit outputs').uncheck();
  await page.getByRole('button', { name: 'Restart same state', exact: true }).click();
  await expect(page.locator('#neural-diagnostics')).toContainText('Outputs OFF');
  await expect(page.locator('#neural-diagnostics')).toContainText('outputs-blocked');
  const blocked = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(blocked.initial).toEqual(initial);
  expect(blocked.pose).toEqual(initial.pose);
  await page.getByLabel('Condition', { exact: true }).selectOption({ label: 'Remote right' });
  await page.getByRole('button', { name: 'Run condition', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.archonDebug.brain.snapshot().initial?.sources[0].position.x)).toBeCloseTo(-Math.sqrt(12));
});

test('actual worker output drives existing rig, feedback and absorption; output ablation and removal stop interaction', async ({ page }) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(async () => {
    await window.archonDebug.brain.start({ realtime: false, sources: [] });
    await window.archonDebug.brain.steps(3);
  });
  let state = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(state.metadata.neurons).toBe(138639);
  expect(state.last.response.spikes).toBe(0);
  await page.evaluate(async () => {
    window.archonDebug.brain.configure({ sources: [{ id: 'one', position: { x: -1.12665, y: 2.4, z: 2.06233 }, strength: 1 }] });
    await window.archonDebug.brain.steps(150);
  });
  state = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(state.log.some(row => row.command.yaw !== 0)).toBe(true);
  expect(state.log.some(row => row.command.speed !== 0)).toBe(true);
  expect(state.last.next.pose.heading).not.toBe(0);
  await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    const { pose } = brain.snapshot();
    brain.configure({ sources: [{ id: 'one', position: { x: pose.x, y: 3, z: pose.z + 2 }, strength: 1 }] });
    await brain.steps(35);
  });
  state = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(state.log.some(row => row.command.phase === 'absorb' && row.result.absorbed > 0)).toBe(true);
  expect(state.sources[0].remaining).toBeLessThan(1);
  await expect.poll(() => page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction.phase)).toBe('absorb');
  const visual = await page.evaluate(() => window.archonDebug.snapshot());
  expect(visual.eyeSurfaceGap).toBeLessThan(0.01);
  for (let i = 0; i < 2; i++) {
    expect(Math.hypot(...visual.interaction.connection.ends[i].map((v, j) => v - visual.interaction.hands[i][j]))).toBeLessThan(0.001);
  }
  await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    brain.configure({ outputsEnabled: false, assist: true });
    await brain.steps(20);
  });
  state = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(state.last.command.reason).toBe('outputs-blocked');
  expect(state.last.command.speed).toBe(0);
  expect(state.last.command.yaw).toBe(0);
  expect(state.last.command.assistYaw).toBe(0);
  await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    brain.configure({ outputsEnabled: true, assist: false });
    await brain.steps(35);
    brain.configure({ sources: [] });
    await brain.steps(1);
  });
  state = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(state.last.command.reason).toBe('no-target');
  expect(state.last.result.absorbed).toBe(0);
  expect(state.last.next.inputs.contactSugar).toBe(0);
  expect(errors).toEqual([]);
});

test('missing real model is exposed as failure without substitute behavior', async ({ page }) => {
  await page.route('**/neural/flybrain/data/flywire783.fbg.gz', route => route.fulfill({ status: 404, body: 'Missing graph' }));
  await page.goto('/?brain=1');
  await expect(page.locator('#neural-status')).toContainText('Brain error:');
  const state = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(state.status).toBe('error');
  expect(state.log).toHaveLength(0);
  expect(state.pose).toEqual({ x: 0, z: 0, heading: 0 });
  await expect.poll(() => page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction.phase)).toBe('idle');
});

test('a stalled real worker cannot keep applying its last output', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(async () => {
    await window.archonDebug.brain.start({ realtime: false });
    await window.archonDebug.brain.steps(30);
  });
  const before = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(before.last.command.phase).toBe('absorb');
  await page.workers()[0].evaluate(() => { self.onmessage = () => {}; });
  await page.evaluate(() => window.archonDebug.brain.steps(1).catch(e => e.message));
  await expect(page.locator('#neural-status')).toContainText('timed out');
  const after = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(after.pose).toEqual(before.pose);
  expect(after.sources).toEqual(before.sources);
  expect(after.currentCommand.reason).toBe('neural-failure');
  expect(after.currentCommand.speed).toBe(0);
  expect(after.currentCommand.phase).toBe('release');
});

test('cancelling model initialization cannot fail the next real model session', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    const first = brain.start({ realtime: false });
    brain.stop();
    const second = brain.start({ realtime: false });
    const loads = await Promise.allSettled([first, second]);
    return { loads: loads.map(load => load.status), state: brain.snapshot() };
  });
  expect(result.loads).toEqual(['rejected', 'fulfilled']);
  expect(result.state.status).toBe('running');
  await page.evaluate(() => window.archonDebug.brain.steps(2));
});
