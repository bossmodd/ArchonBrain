import { reveal } from './helpers/disclosures.js';
import { test, expect } from '@playwright/test';

test('the guide starts the proven one-source experiment and adds a fixed second source without resetting the model', async ({ page }) => {
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.getByRole('link', { name: 'How it works ↓', exact: true }).click();
  await page.getByRole('button', { name: 'Try one source', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.archonDebug.brain.snapshot().status)).toBe('running');
  const initial = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(initial.initial.profile).toBe('olfactory'); expect(initial.mode).toBe('interactive');
  await expect(page.locator('#experiment-name')).toHaveValue('One signal');
  const chosenName = 'A deliberately long experiment name that must remain intact';
  await reveal(page, '#experiment-name');
  await page.locator('#experiment-name').fill(chosenName);
  expect(initial.initial.sources).toHaveLength(1); expect(initial.initial.seed).toBe(1);
  expect(initial.initial.sources[0].position).toEqual({ x: 4 * Math.sin(Math.PI / 3), y: 2.4, z: 4 * Math.cos(Math.PI / 3) });
  expect(initial.options).toMatchObject({ outputsEnabled: true, assist: false, directional: true });
  await expect(page.locator('#guide-start')).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const before = await page.evaluate(async () => {
    const b = window.archonDebug.brain;
    await b.saveExperiment('Before adding');
    return b.snapshot();
  });
  await reveal(page, '#guide-add');
  await page.getByRole('button', { name: 'Add second signal', exact: true }).click();
  const after = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(after.sources).toHaveLength(2);
  expect(after.sources[0]).toEqual(before.sources[0]); expect(after.pose).toEqual(before.pose);
  expect(after.sources[1].position).toEqual({ x: -Math.sqrt(12), y: 2.4, z: 2 });
  expect(after.initial).toEqual(before.initial);
  expect(after.simulationTime).toBe(before.simulationTime); expect(after.metadata).toEqual(before.metadata);
  await expect(page.locator('#guide-message')).toContainText('Drag A or B');
  await page.evaluate(() => window.scrollTo(0, 0));
  expect((await page.evaluate(() => window.archonDebug.brain.snapshot())).sources).toEqual(after.sources);
  await page.getByRole('button', { name: 'Interact', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.archonDebug.brain.snapshot().sources.length)).toBe(2);
  await expect(page.locator('#guide-add')).toBeHidden();
  await expect(page.locator('#experiment-name')).toHaveValue(chosenName);
});

test('editing feedback waits for a real input window and preserves that window when later samples arrive', async ({ page }) => {
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(async () => {
    const b = window.archonDebug.brain;
    await b.start({ profile: 'olfactory', mode: 'interactive', realtime: false, outputsEnabled: false,
      sources: [{ id: 'a', label: 'A', position: { x: 1, y: 2.4, z: 2 }, strength: 1 }] });
    await b.steps(20); await b.saveExperiment('Edit receipt');
  });
  await page.locator('#neural-detail > summary').click();
  await reveal(page, '#runtime-details > summary');
  await page.locator('#runtime-details > summary').click();
  await reveal(page, '#source-editor');
  await page.getByRole('button', { name: 'Select source A', exact: true }).click();
  await expect(page.locator('#source-strength')).toBeEnabled();
  await page.locator('#source-strength').press('ArrowLeft');
  await expect(page.locator('#signal-feedback')).toHaveAttribute('data-state', 'queued');
  await expect(page.locator('#feedback-result')).toContainText('Play');
  await expect(page.locator('#signal-feedback')).not.toHaveAttribute('data-model-time', /.+/);
  const first = await page.evaluate(async () => {
    const b = window.archonDebug.brain;
    return (await b.steps(1)).last;
  });
  await expect(page.locator('#signal-feedback')).toHaveAttribute('data-state', 'applied');
  await expect(page.locator('#feedback-result')).toContainText('Outputs blocked');
  await expect(page.locator('#signal-feedback')).toHaveAttribute('data-edit-id', String(first.timing.editId));
  await expect(page.locator('#signal-feedback')).toHaveAttribute('data-input-left', String(first.response.inputs.signalLeft));
  await expect(page.locator('#signal-feedback')).toHaveAttribute('data-turn-right', String(first.response.outputs.turnRight));
  await expect(page.locator('#signal-feedback')).toHaveAttribute('data-speed', '0');
  await page.evaluate(() => window.archonDebug.brain.steps(2));
  await expect(page.locator('#signal-feedback')).toHaveAttribute('data-model-time', String(first.response.modelTimeMs));
  await page.evaluate(() => window.archonDebug.brain.restart());
  await expect(page.locator('#signal-feedback')).toBeHidden();
});

test('connected and blocked comparisons reload one captured logical layout and edits invalidate that capture', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  const before = await page.evaluate(async () => {
    const b = window.archonDebug.brain;
    await b.start({ profile: 'olfactory', mode: 'interactive', realtime: false, seed: 7,
      sources: [{ id: 'partial-a', label: 'A', position: { x: 3.464, y: 2.4, z: 2 }, strength: 1, remaining: .73 },
        { id: 'partial-b', label: 'B', position: { x: -3.464, y: 2.4, z: 2 }, strength: .7, remaining: .51 }] });
    await b.steps(20); await b.saveExperiment('Current layout'); return b.snapshot();
  });
  await page.getByRole('link', { name: 'How it works ↓', exact: true }).click();
  await reveal(page, '#guide-capture');
  await page.getByRole('button', { name: 'Capture comparison', exact: true }).click();
  await expect(page.locator('#guide-connected')).toBeVisible();
  await expect(page.locator('#guide-start')).toBeVisible();
  await expect(page.locator('#guide-add')).toBeHidden();
  await expect(page.locator('#guide-capture')).toBeHidden();
  expect((await page.evaluate(() => window.archonDebug.brain.snapshot())).initial).toEqual(before.initial);
  await page.getByRole('button', { name: 'Block & restart', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.archonDebug.brain.snapshot().simulationTime)).toBeGreaterThan(.4);
  const blocked = await page.evaluate(async () => { const b = window.archonDebug.brain; await b.saveExperiment('Check blocked'); return b.snapshot(); });
  expect(blocked.initial.pose).toEqual(before.pose); expect(blocked.initial.sources).toEqual(before.sources);
  expect(blocked.initial.seed).toBe(before.initial.seed); expect(blocked.options.outputsEnabled).toBe(false);
  expect(blocked.pose).toEqual(before.pose); expect(blocked.sources).toEqual(before.sources);
  expect(blocked.log.every(r => r.command.speed === 0 && r.command.yaw === 0 && r.result.absorbed === 0)).toBe(true);
  expect(blocked.log.some(r => r.response.spikes > 0)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('comparison-blocked.png') });
  await page.getByRole('button', { name: 'Connect & restart', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.archonDebug.brain.snapshot().simulationTime)).toBeGreaterThan(.6);
  const connected = await page.evaluate(async () => { const b = window.archonDebug.brain; await b.saveExperiment('Check connected'); return b.snapshot(); });
  expect(connected.initial).toEqual(blocked.initial);
  expect(connected.options).toEqual({ ...blocked.options, outputsEnabled: true });
  expect(connected.log[0].response.inputs).toEqual(blocked.log[0].response.inputs);
  expect(connected.log[0].response.raw).toEqual(blocked.log[0].response.raw);
  expect(connected.log.some(r => Math.abs(r.command.speed) + Math.abs(r.command.yaw) > 0)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('comparison-connected.png') });
  await reveal(page, '#source-editor');
  await page.getByRole('button', { name: 'Select source A', exact: true }).click();
  await expect(page.locator('#source-strength')).toBeEnabled();
  await page.locator('#source-strength').press('ArrowLeft');
  await expect(page.locator('#guide-connected')).toBeHidden();
  await expect(page.locator('#guide-status')).toContainText('Capture again');
});

test('a comparison cannot overwrite an edit made before the next display frame', async ({ page }) => {
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(() => window.archonDebug.brain.start({ profile: 'olfactory', mode: 'interactive', realtime: false,
    sources: [{ id: 'a', label: 'A', position: { x: 3, y: 2.4, z: 2 }, strength: 1 }] }));
  await page.getByRole('link', { name: 'How it works ↓', exact: true }).click();
  await reveal(page, '#guide-capture');
  await page.getByRole('button', { name: 'Capture comparison', exact: true }).click();
  await expect(page.locator('#guide-connected')).toBeVisible();
  const result = await page.evaluate(() => {
    const b = window.archonDebug.brain;
    b.editSource('a', { strength: .5 }); const before = b.snapshot();
    document.querySelector('#guide-connected').click();
    return { before, after: b.snapshot() };
  });
  expect(result.after.sources).toEqual(result.before.sources);
  expect(result.after.initial).toEqual(result.before.initial);
  expect(result.after.metadata).toEqual(result.before.metadata);
  await expect(page.locator('#guide-status')).toContainText('Capture again');
});

test('the guided signal reaches real absorption and keeps the scene usable on a small screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  await page.screenshot({ path: testInfo.outputPath('start-desktop.png') });
  await page.getByRole('link', { name: 'How it works ↓', exact: true }).click();
  await page.getByRole('button', { name: 'Try one source', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.archonDebug.brain.snapshot().status)).toBe('running');
  const state = await page.evaluate(async () => {
    const b = window.archonDebug.brain;
    await b.saveExperiment('Settled'); b.configure({ realtime: false });
    return b.steps(100);
  });
  expect(state.log.some(r => r.result.absorbed > 0)).toBe(true);
  expect(state.sources[0].remaining).toBeLessThan(1);
  expect(state.log.every(r => r.command.assistYaw === 0)).toBe(true);
  await reveal(page, '#view-all');
  await page.getByRole('button', { name: 'View all', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('one-signal-absorption.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#guide-body')).toBeVisible();
  const body = await page.locator('#guide-body').boundingBox(), scene = await page.locator('#scene-viewport').boundingBox();
  expect(body.x).toBeGreaterThanOrEqual(scene.x); expect(body.x + body.width).toBeLessThanOrEqual(scene.x + scene.width);
  expect(body.y).toBeGreaterThanOrEqual(scene.y + 38);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: testInfo.outputPath('guide-small.png') });
  await page.locator('#neural-panel').scrollIntoViewIfNeeded();
  await expect(page.locator('#guide-body')).not.toBeInViewport();
  await expect(page.locator('#brain-atlas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath('neural-small.png') });
  const after = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(after.simulationTime).toBe(state.simulationTime); expect(after.pose).toEqual(state.pose);
  expect(after.sources).toEqual(state.sources);
});
