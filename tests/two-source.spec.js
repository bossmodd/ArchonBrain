import { reveal } from './helpers/disclosures.js';
import { test, expect } from '@playwright/test';

test('real absorption stays bound to its ID when another source becomes a stronger closer contact', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const before = await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    await brain.start({ profile: 'olfactory', realtime: false, sources: [
      { id: 'connected', position: { x: 0, y: 2.4, z: 2 }, strength: 1, remaining: 0.8 },
      { id: 'other', position: { x: 6, y: 2.4, z: 0 }, strength: 0.3, remaining: 1 },
    ] });
    return brain.steps(30);
  });
  expect(before.currentCommand.phase).toBe('absorb');
  expect(before.currentCommand.targetId).toBe('connected');
  const after = await page.evaluate(async () => {
    const brain = window.archonDebug.brain, sources = brain.snapshot().sources;
    sources[1].position = { x: 1, y: 2.4, z: 0 }; sources[1].strength = 1;
    brain.configure({ sources });
    return brain.steps(15);
  });
  expect(after.currentCommand.phase).toBe('absorb');
  expect(after.currentCommand.targetId).toBe('connected');
  expect(after.sources[0].remaining).toBeLessThan(before.sources[0].remaining);
  expect(after.sources[1].remaining).toBe(1);
  expect(after.last.response.inputs).not.toEqual(before.last.response.inputs);
  expect(after.last.sense.contributions).toHaveLength(2);
  const removed = await page.evaluate(() => {
    const brain = window.archonDebug.brain;
    brain.configure({ sources: brain.snapshot().sources.filter(s => s.id !== 'connected') });
    return brain.snapshot();
  });
  expect(removed.currentCommand.reason).toBe('no-target');
  expect(removed.currentCommand.phase).toBe('release');
  expect(removed.currentCommand.targetId).toBeNull();
  expect(removed.sources[0].remaining).toBe(1);
  await page.evaluate(() => window.archonDebug.brain.steps(3));
  await expect(page.locator('#neural-diagnostics')).toContainText('Last stop: no-target', { timeout: 2000 });
});

test('source edits preserve IDs, remaining energy and the live brain, while restart restores both initial sources', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    await brain.start({ profile: 'olfactory', mode: 'interactive', realtime: false, sources: [
      { id: 'initial-a', label: 'A', position: { x: 0, y: 2.4, z: 2 }, strength: 1, remaining: .8 },
      { id: 'initial-b', label: 'B', position: { x: 6, y: 2.4, z: 0 }, strength: .3, remaining: .9 },
    ] });
    const before = await brain.steps(30);
    brain.editSource('initial-a', { position: { x: .1, y: 2.4, z: 2 }, strength: .7 });
    const edited = brain.snapshot();
    const next = await brain.steps(1);
    brain.removeSource('initial-a');
    const removed = brain.snapshot();
    const added = brain.addSource({ x: -3, y: 2.4, z: 2 });
    let limit;
    try { brain.addSource({ x: 0, y: 2.4, z: 5 }); } catch (error) { limit = error.message; }
    const modified = brain.snapshot();
    await brain.restart();
    return { before, edited, next, removed, added, limit, modified, restored: brain.snapshot() };
  });
  expect(result.before.currentCommand.phase).toBe('absorb');
  expect(result.edited.sources[0].remaining).toBe(result.before.sources[0].remaining);
  expect(result.edited.sources[0].strength).toBe(.7);
  expect(result.edited.simulationTime).toBe(result.before.simulationTime);
  expect(result.next.last.response.modelTimeMs).toBe(result.before.last.response.modelTimeMs + 100);
  expect(result.removed.currentCommand.phase).toBe('release');
  expect(result.added.id).not.toBe('initial-a');
  expect(result.added.label).toBe('A');
  expect(result.modified.sources[0].id).toBe('initial-b');
  expect(result.modified.sources[0].remaining).toBe(.9);
  expect(result.limit).toContain('two');
  expect(result.restored.mode).toBe('interactive');
  expect(result.restored.sources).toEqual(result.before.initial.sources);
  expect(result.restored.pose).toEqual(result.before.initial.pose);
  expect(result.restored.simulationTime).toBe(0);
});

test('moving the connected source updates its actual effect and immediately releases it outside range', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    await brain.start({ profile: 'olfactory', mode: 'interactive', realtime: false, sources: [
      { id: 'moving', position: { x: 0, y: 2.4, z: 2 }, strength: 1 },
    ] });
    await brain.steps(30);
    brain.editSource('moving', { position: { x: .4, y: 2.4, z: 2 } });
  });
  await expect.poll(() => page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction.target[0])).toBeCloseTo(.4, 2);
  const outside = await page.evaluate(() => {
    const brain = window.archonDebug.brain;
    brain.editSource('moving', { position: { x: 7, y: 2.4, z: 2 } });
    return brain.snapshot();
  });
  expect(outside.currentCommand.phase).toBe('release');
  expect(outside.currentCommand.reason).toBe('out-of-range');
  expect(outside.currentCommand.targetId).toBeNull();
});

test('Interact exposes actual floor placement, selection, drag, strength and deletion without Orbit or Preview conflicts', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.getByRole('button', { name: 'Interact', exact: true }).click();
  await expect(page.locator('#neural-status')).toContainText('running · olfactory');
  await expect(page.locator('#source-editor')).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const a = page.getByRole('button', { name: 'Move source A', exact: true });
  await a.click();
  const before = await page.evaluate(() => window.archonDebug.brain.snapshot());
  const aid = before.sources.find(s => s.label === 'A').id;
  const strength = page.getByRole('slider', { name: 'Signal strength', exact: true });
  await strength.focus(); await strength.press('Home');
  for (let i = 0; i < 10; i++) await strength.press('ArrowRight');
  const box = await a.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 6 }); await page.mouse.up();
  const edited = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(edited.sources.find(s => s.id === aid).strength).toBeCloseTo(.5);
  expect(edited.sources.find(s => s.id === aid).remaining).toBe(before.sources.find(s => s.id === aid).remaining);
  expect(edited.sources.find(s => s.id === aid).position).not.toEqual(before.sources.find(s => s.id === aid).position);
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  expect((await page.evaluate(() => window.archonDebug.brain.snapshot())).sources).toHaveLength(1);
  const canvas = await page.locator('canvas').boundingBox();
  const floorClick = () => page.mouse.click(canvas.x + canvas.width * .82, canvas.y + canvas.height * .78);
  await floorClick();
  const added = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(added.sources).toHaveLength(2);
  expect(added.sources.find(s => s.label === 'A').id).not.toBe(aid);
  expect(added.sources.find(s => s.label === 'A').strength).toBe(1);
  await page.mouse.click(canvas.x + canvas.width * .75, canvas.y + canvas.height * .72);
  expect((await page.evaluate(() => window.archonDebug.brain.snapshot())).sources).toHaveLength(2);
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  await reveal(page, '#orbit');
  await page.getByRole('button', { name: 'Orbit', exact: true }).click();
  await floorClick();
  expect((await page.evaluate(() => window.archonDebug.brain.snapshot())).sources).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Move source B', exact: true, includeHidden: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Select source B', exact: true })).toBeDisabled();
  await reveal(page, '#orbit');
  await page.getByRole('button', { name: 'Orbit', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('#neural-diagnostics')).toContainText('B [');
  await expect(page.locator('#neural-diagnostics')).toContainText('conc L/R');
  await reveal(page, '#interaction-preview');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('#source-editor')).toBeHidden();
  expect((await page.evaluate(() => window.archonDebug.brain.snapshot())).status).toBe('off');
});

test('repeated source replacement releases deleted visuals instead of accumulating hidden sources', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    await brain.start({ mode: 'interactive', profile: 'olfactory', realtime: false, sources: [] });
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    let current;
    for (let i = 0; i < 5; i++) {
      if (current) brain.removeSource(current.id);
      current = brain.addSource({ x: i * .2, y: 2.4, z: 3 });
      await frame();
    }
    return { state: brain.snapshot(), current };
  });
  expect(result.state.markerIds).toEqual([result.current.id]);
});

test('interactive controls and absorption status remain separate on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    await brain.start({ mode: 'interactive', profile: 'olfactory', realtime: false,
      sources: [{ id: 'near', position: { x: 0, y: 2.4, z: 2 }, strength: 1 }] });
    await brain.steps(20);
  });
  await expect(page.locator('#interaction-state')).toHaveText('Absorbing');
  await page.locator('#neural-detail > summary').click();
  await reveal(page, '#runtime-details > summary');
  await page.getByText('Timing & sample details', { exact: true }).click();
  const header = await page.locator('.viewer-header').boundingBox();
  const status = await page.locator('#run-summary').boundingBox();
  await expect(page.locator('#run-summary')).toContainText('Absorbing');
  const diagnostics = await page.locator('#neural-panel').boundingBox();
  expect(status.y).toBeGreaterThan(header.y + header.height);
  expect(diagnostics.y + diagnostics.height).toBeLessThanOrEqual(status.y);
  await expect(page.locator('#interaction-state')).toHaveText('Absorbing');
  await expect(page.locator('#neural-diagnostics')).toContainText('MN9');
  await reveal(page, '#developer-tools > summary');
  const settings = await page.locator('#tuning-panel').boundingBox();
  const toggle = await page.locator('#tune').boundingBox();
  expect(settings.y).toBeGreaterThanOrEqual(toggle.y + toggle.height);
  expect(settings.y + settings.height).toBeLessThanOrEqual((await page.locator('.viewer-footer').boundingBox()).y);
  await page.locator('#tune').click();
  await page.getByRole('button', { name: 'Archon view', exact: true }).click();
  await expect(page.locator('#run-summary')).toContainText('Absorbing');
});
