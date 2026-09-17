import { reveal } from './helpers/disclosures.js';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('Header controls download a JSON file and loads that file into a fresh paused experiment', async ({ page }, testInfo) => {
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  await expect(page.getByRole('button', { name: 'Save experiment', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save experiment', exact: true })).toBeDisabled();
  await page.evaluate(() => window.archonDebug.brain.start({ profile: 'olfactory', mode: 'interactive', seed: 7, realtime: false,
    outputsEnabled: false, directional: false, sources: [{ id: 'partial-b', label: 'B', position: { x: 3, y: 2.4, z: -2 }, strength: .7, remaining: .43 }] }));
  await reveal(page, '#experiment-name');
  await page.getByLabel('Experiment name', { exact: true }).fill('Partial energy');
  const downloadPromise = page.waitForEvent('download');
  await reveal(page, '#save-experiment');
  await page.getByRole('button', { name: 'Save experiment', exact: true }).click();
  const download = await downloadPromise, path = testInfo.outputPath('experiment.json');
  await download.saveAs(path);
  const text = await fs.readFile(path, 'utf8'), file = JSON.parse(text);
  expect(file.name).toBe('Partial energy');
  expect(file.sources[0].remaining).toBe(.43);
  expect(file.settings).toEqual({ outputsEnabled: false, directional: false, assist: false });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.evaluate(() => window.archonDebug.brain.removeSource('partial-b'));
  const chooserPromise = page.waitForEvent('filechooser');
  await reveal(page, '#load-experiment');
  await page.getByRole('button', { name: 'Load experiment', exact: true }).click();
  await (await chooserPromise).setFiles(path);
  await expect(page.locator('#experiment-status')).toContainText('Press Play');
  const loaded = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(loaded.sources).toEqual(file.sources);
  expect(loaded.simulationTime).toBe(0);
  expect(loaded.options.outputsEnabled).toBe(false);
  expect(loaded.options.directional).toBe(false);
  await expect(page.locator('#experiment-current')).toContainText('Partial energy');
  await expect(page.locator('#experiment-current')).toContainText('olfactory');
  await page.locator('#experiment-files').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('loaded-experiment.png') });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.archonDebug.brain.snapshot().simulationTime)).toBeGreaterThan(.2);
  const after = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(after.pose).toEqual(file.pose);
  expect(after.sources).toEqual(file.sources);
  expect(after.currentCommand.reason).toBe('outputs-blocked');
});

test('invalid uploads leave the paused experiment, seed, remaining energy and restart baseline intact', async ({ page }) => {
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  const file = await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    await brain.start({ profile: 'olfactory', mode: 'interactive', seed: 3, realtime: false,
      sources: [{ id: 'valid-a', label: 'A', position: { x: 0, y: 2.4, z: 2 }, strength: 1, remaining: .64 }] });
    await brain.steps(35);
    return brain.saveExperiment('Keep this state');
  });
  const stable = () => page.evaluate(() => {
    const s = window.archonDebug.brain.snapshot();
    return { status: s.status, initial: s.initial, metadata: s.metadata, options: s.options, pose: s.pose, sources: s.sources,
      time: s.simulationTime, last: s.last, command: s.currentCommand, paused: window.archonDebug.snapshot({ measureEyes: false }).paused };
  });
  const before = await stable();
  const variants = ['{', JSON.stringify({ ...file, version: 999 }),
    JSON.stringify({ ...file, sources: [file.sources[0], { ...file.sources[0], label: 'B' }] }),
    JSON.stringify({ ...file, sources: [{ ...file.sources[0], remaining: 2 }] }),
    JSON.stringify({ ...file, compatibility: { ...file.compatibility, behavior: 'different' } }),
    JSON.stringify({ ...file, modelUrl: 'https://invalid.example/model.js' }), ' '.repeat(65537)];
  for (const text of variants) {
    await page.locator('#experiment-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.locator('#experiment-status')).toHaveAttribute('role', 'alert');
    await expect(page.getByRole('button', { name: 'Load experiment', exact: true })).toBeEnabled();
    expect(await stable()).toEqual(before);
  }
});

test('loading a reused source ID refreshes its A/B labels without duplicate or stale handles', async ({ page }) => {
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(() => window.archonDebug.brain.start({ profile: 'olfactory', mode: 'interactive', realtime: false,
    sources: [{ id: 'same-id', label: 'A', position: { x: 3, y: 2.4, z: 0 }, strength: 1, remaining: .4 }] }));
  await expect(page.getByRole('button', { name: 'Move source A', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const brain = window.archonDebug.brain, file = await brain.saveExperiment();
    file.sources[0].label = 'B';
    await brain.loadExperiment(JSON.stringify(file));
  });
  await expect(page.getByRole('button', { name: 'Move source B', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move source A', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select source B', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.archonDebug.brain.snapshot().markerIds)).toEqual(['same-id']);
});

test('loading holds Play and neural settings until the real model response is ready', async ({ page }) => {
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  const file = await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    await brain.start({ profile: 'olfactory', mode: 'interactive', realtime: false, sources: [] });
    return brain.saveExperiment('Ready first');
  });
  await reveal(page, '#gui-container');
  await page.getByRole('button', { name: /Neural control/ }).click();
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/data/groups783.json', async route => {
    const response = await route.fetch(); // Real annotations, only delivery is held.
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.locator('#experiment-file').setInputFiles({ name: 'ready.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await expect(page.locator('#neural-status')).toContainText('loading');
    await expect(page.locator('#pause')).toBeDisabled();
    await expect(page.locator('#restart')).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: 'Transmit outputs', exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(page.locator('#experiment-status')).toContainText('Press Play');
  await expect(page.getByRole('checkbox', { name: 'Transmit outputs', exact: true })).toBeEnabled();
  expect((await page.evaluate(() => window.archonDebug.brain.snapshot())).simulationTime).toBe(0);
});
