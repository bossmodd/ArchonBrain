import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { parseNeuronAtlas } from '../src/ui/NeuronAtlas.js';

test('ArchonBrain shows mapped real motor activity without inventing firing or advancing the experiment', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1');
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await expect(page).toHaveTitle('ArchonBrain');
  await expect(page.locator('h1')).toHaveText('ArchonBrain');
  await expect(page.locator('#brain-atlas')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#neural-detail')).not.toHaveAttribute('open', '');
  await expect(page.locator('#brain-atlas [data-hz]')).toHaveCount(0);
  const sample = await page.evaluate(async () => {
    const b = window.archonDebug.brain;
    await b.start({ profile: 'olfactory', mode: 'interactive', realtime: false, seed: 7, outputsEnabled: false,
      sources: [{ id: 'actual-a', label: 'A', position: { x: 1, y: 2.4, z: 2 }, strength: 1, remaining: .8 }] });
    await b.steps(22);
    await b.saveExperiment('Measured activity');
    return b.snapshot();
  });
  const atlas = parseNeuronAtlas(gunzipSync(await readFile(new URL('../public/neural/flybrain/data/pos783.bin.gz', import.meta.url))));
  await expect(page.locator('#brain-spikes')).toHaveText(sample.last.response.spikes.toLocaleString('en-US'));
  const observed = await page.locator('#brain-atlas .motor-neuron').evaluateAll(nodes => nodes.map(n => ({ ...n.dataset })));
  expect(observed.length).toBeGreaterThan(10);
  for (const point of observed) {
    const group = sample.metadata.outputs[point.channel];
    const index = group.ids.indexOf(point.id);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(Number(point.hz)).toBe(sample.last.response.raw[point.channel][index]);
    expect(Number(point.x)).toBe(atlas.point(group.indices[index]).x);
    expect(Number(point.y)).toBe(atlas.point(group.indices[index]).y);
  }
  expect(observed.some(point => Number(point.hz) > 0)).toBe(true);
  await expect(page.locator('#action-speed')).toHaveText('0.00');
  await expect(page.locator('#gate-badge')).toHaveText('Outputs blocked');
  const activityMarkup = () => page.locator('#brain-atlas .input-points, #brain-atlas .motor-points').evaluateAll(nodes => nodes.map(node => node.innerHTML));
  const frozen = await activityMarkup();
  const bounds = await page.locator('#brain-atlas').getAttribute('viewBox');
  await page.screenshot({ path: testInfo.outputPath('archonbrain-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#neural-panel').scrollIntoViewIfNeeded();
  await expect(page.locator('#brain-atlas')).toBeVisible();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath('archonbrain-mobile.png') });
  // The static atlas rerasterizes at the new display size. Its coordinates and
  // the real sampled input/motor highlights must remain exactly unchanged.
  expect(await activityMarkup()).toEqual(frozen);
  expect(await page.locator('#brain-atlas').getAttribute('viewBox')).toBe(bounds);
  expect((await page.evaluate(() => window.archonDebug.brain.snapshot())).last).toEqual(sample.last);
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.evaluate(() => window.archonDebug.brain.restart());
  await expect(page.locator('#brain-spikes')).toHaveText('—');
  await expect(page.locator('#brain-atlas [data-hz]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
