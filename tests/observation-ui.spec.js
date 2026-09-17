import { reveal } from './helpers/disclosures.js';
import { test, expect } from '@playwright/test';
import { Quaternion, Vector3 } from 'three';

async function project(page, position) {
  const c = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).cameraPose);
  const rect = await page.locator('#scene-safe-area').boundingBox();
  const p = new Vector3(...position).sub(new Vector3(...c.position)).applyQuaternion(new Quaternion(...c.quaternion).invert());
  return { x: rect.x + (p.x * c.zoom / c.halfWidth + 1) * rect.width / 2, y: rect.y + (1 - p.y * c.zoom / c.halfHeight) * rect.height / 2 };
}

test('one existing canvas is framed by observation panels and keeps camera and controls aligned', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('#neural-panel')).toBeVisible();
  const canvas = await page.locator('canvas').boundingBox();
  const left = await page.locator('#neural-panel').boundingBox();
  const right = await page.locator('#environment-panel').boundingBox();
  expect(left.width).toBeGreaterThanOrEqual(330); expect(right.width).toBeLessThanOrEqual(290);
  expect(canvas.x).toBeGreaterThan(left.x + left.width);
  expect(canvas.x + canvas.width).toBeLessThan(right.x);
  expect((canvas.width + 2) / left.width).toBeCloseTo(1.38, 1);
  const camera = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).cameraPose);
  const safe = await page.locator('#scene-safe-area').boundingBox();
  expect(camera.halfWidth / camera.halfHeight).toBeCloseTo(safe.width / safe.height, 2);
  await expect(page.locator('.viewer-header #save-experiment')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Restart same state', exact: true })).toHaveCount(1);
  await expect(page.locator('.viewer-footer #restart')).toBeVisible();
});

test('panel and theme changes preserve a paused real experiment on desktop and small screens', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  const saved = await page.evaluate(async () => {
    const b = window.archonDebug.brain;
    await b.start({ profile: 'olfactory', mode: 'interactive', realtime: false, seed: 7,
      sources: [{ id: 'a', label: 'A', position: { x: 0, y: 2.4, z: 2 }, strength: 1, remaining: .8 },
        { id: 'b', label: 'B', position: { x: -4, y: 2.4, z: -3 }, strength: .7, remaining: .6 }] });
    await b.steps(22);
    return b.saveExperiment('Two-source observation');
  });
  await reveal(page, '#experiment-name');
  await page.getByLabel('Experiment name', { exact: true }).fill(saved.name);
  await reveal(page, '#source-editor');
  await page.getByRole('button', { name: 'Select source B', exact: true }).click();
  await reveal(page, '#view-all');
  await page.getByRole('button', { name: 'View all', exact: true }).click();
  const stable = () => page.evaluate(() => {
    const b = window.archonDebug.brain.snapshot();
    return { initial: b.initial, pose: b.pose, sources: b.sources, command: b.currentCommand, last: b.last, time: b.simulationTime, options: b.options };
  });
  const before = await stable();
  await page.screenshot({ path: testInfo.outputPath('desktop-data.png') });
  await page.evaluate(() => { document.querySelector('.observation-ui').dataset.theme = 'plain'; });
  await page.screenshot({ path: testInfo.outputPath('desktop-plain.png') });
  expect(await stable()).toEqual(before);
  await page.evaluate(() => { document.querySelector('.observation-ui').dataset.theme = 'brass'; });
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.locator('#neural-panel').scrollIntoViewIfNeeded();
  await expect(page.locator('#neural-panel')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('medium-data.png') });
  await page.locator('#neural-panel').scrollIntoViewIfNeeded();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#neural-panel')).toBeVisible();
  await expect(page.locator('#environment-panel')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('small-scene.png') });
  await page.locator('#neural-panel').scrollIntoViewIfNeeded();
  await expect(page.locator('#neural-panel')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('small-neural.png') });
  await page.locator('#environment-panel').scrollIntoViewIfNeeded();
  await expect(page.locator('#neural-panel')).toBeVisible();
  await expect(page.locator('#environment-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select source B', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('small-environment.png') });
  expect(await stable()).toEqual(before);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Restart same state', exact: true })).toHaveCount(1);
});

test('resized desktop and small layouts keep real floor placement, source dragging and camera framing aligned', async ({ page }, testInfo) => {
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(() => window.archonDebug.brain.start({ profile: 'olfactory', mode: 'interactive', realtime: false, sources: [] }));
  for (const width of [1440, 1000, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    if (width === 390) {
      await expect(page.locator('#environment-panel')).toBeVisible();
      await page.locator('#environment-panel').scrollIntoViewIfNeeded();
      await expect(page.locator('#environment-panel')).toBeVisible();
      const panel = await page.locator('#environment-panel').boundingBox();
      expect(panel.x).toBeGreaterThanOrEqual(0); expect(panel.x + panel.width).toBeLessThanOrEqual(width);
    }
    await page.getByRole('button', { name: 'Archon view', exact: true }).click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => window.archonDebug.brain.configure({ sources: [] }));
    const point = await project(page, [1.5, 0, -2]);
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => page.evaluate(() => window.archonDebug.brain.snapshot().sources.length)).toBe(1);
    const source = (await page.evaluate(() => window.archonDebug.brain.snapshot())).sources[0];
    expect(source.position.x).toBeCloseTo(1.5, 2); expect(source.position.z).toBeCloseTo(-2, 2);
    await expect(page.getByRole('button', { name: 'Move source A', exact: true })).toBeVisible();
    const handle = await page.getByRole('button', { name: 'Move source A', exact: true }).boundingBox();
    const projected = await project(page, [source.position.x, source.position.y, source.position.z]);
    expect(handle.x + handle.width / 2).toBeCloseTo(projected.x, 0);
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2 + 25, handle.y + handle.height / 2 + 15, { steps: 5 }); await page.mouse.up();
    const moved = (await page.evaluate(() => window.archonDebug.brain.snapshot())).sources[0];
    const after = await project(page, [moved.position.x, moved.position.y, moved.position.z]);
    expect(after.x - projected.x).toBeCloseTo(25, 0); expect(after.y - projected.y).toBeCloseTo(15, 0);
    expect(moved.remaining).toBe(source.remaining);
    const visual = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }));
    expect(visual.gasDepthRange).toEqual([visual.cameraPose.near, visual.cameraPose.far]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: testInfo.outputPath(`layout-${width}.png`) });
  }
});

test('the SVG map shares the displayed pose and selection never redirects the connected absorption target', async ({ page }) => {
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  const before = await page.evaluate(async () => {
    const b = window.archonDebug.brain;
    await b.start({ mode: 'interactive', profile: 'olfactory', realtime: false, sources: [
      { id: 'contact-a', label: 'A', position: { x: 0, y: 2.4, z: 2 }, strength: 1 },
      { id: 'far-b', label: 'B', position: { x: -5, y: 2.4, z: -4 }, strength: .8 },
    ] });
    return b.steps(20);
  });
  expect(before.currentCommand.targetId).toBe('contact-a');
  await expect(page.locator('#environment-map')).toBeVisible();
  await page.getByRole('button', { name: 'Edit source B on map', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select source B', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#source-connection')).toContainText('A');
  await expect(page.locator('#source-ids')).toContainText('Linked ID: contact-a');
  await expect(page.locator('#map-source-contact-a')).toHaveAttribute('data-linked', 'true');
  await expect(page.locator('#map-source-far-b')).toHaveAttribute('aria-pressed', 'true');
  const after = await page.evaluate(() => {
    const pose = window.archonDebug.snapshot({ measureEyes: false }).renderedPose;
    const map = document.querySelector('#map-archon');
    return { brain: window.archonDebug.brain.snapshot(), pose, map: { x: Number(map.dataset.x), z: Number(map.dataset.z), heading: Number(map.dataset.heading) } };
  });
  expect(after.map).toEqual(after.pose);
  expect(after.brain.currentCommand).toEqual(before.currentCommand);
  expect(after.brain.sources).toEqual(before.sources); expect(after.brain.pose).toEqual(before.pose);
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('neural panel reports the actual sampled signals and outputs while blocked commands stay separate', async ({ page }) => {
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  const state = await page.evaluate(async () => {
    const b = window.archonDebug.brain;
    await b.start({ profile: 'olfactory', realtime: false, outputsEnabled: false,
      sources: [{ id: 'actual', position: { x: 1, y: 2.4, z: 2 }, strength: 1 }] });
    return b.steps(20);
  });
  await expect(page.locator('#signal-left')).toHaveText(state.last.response.inputs.signalLeft.toFixed(1));
  await expect(page.locator('#signal-right')).toHaveText(state.last.response.inputs.signalRight.toFixed(1));
  await expect(page.locator('#output-feed')).toContainText(state.last.response.outputs.feedLeft.toFixed(1));
  await expect(page.locator('#neural-gate')).toContainText('Output transmission blocked');
  await expect(page.locator('#action-speed')).toHaveText('0.00');
  await expect(page.locator('#action-reason')).toContainText('outputs-blocked');
  await expect(page.locator('#sample-time')).toContainText(state.last.sense.time.toFixed(1));
  const again = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(again.simulationTime).toBe(state.simulationTime);
  expect(again.pose).toEqual(state.pose); expect(again.sources).toEqual(state.sources);
});
