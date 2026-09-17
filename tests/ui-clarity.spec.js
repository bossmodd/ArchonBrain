import { reveal } from './helpers/disclosures.js';
import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  return page.evaluate(async () => {
    const b = window.archonDebug.brain;
    await b.start({ profile: 'olfactory', mode: 'interactive', realtime: false, seed: 7,
      sources: [{ id: 'clarity-a', label: 'A', position: { x: 3.464, y: 2.4, z: 2 }, strength: 1, remaining: .73 },
        { id: 'clarity-b', label: 'B', position: { x: -3.464, y: 2.4, z: 2 }, strength: .7, remaining: .51 }] });
    await b.steps(20); await b.saveExperiment('UI clarity'); return b.snapshot();
  });
}

test('normal view keeps real diagnostics behind disclosures without changing the experiment', async ({ page }, testInfo) => {
  const before = await setup(page);
  for (const id of ['signal-left', 'output-turn', 'action-speed', 'brain-spikes', 'source-contributions', 'experiment-current', 'neural-diagnostics']) await expect(page.locator(`#${id}`)).toBeHidden();
  await expect(page.locator('#brain-atlas')).toBeVisible();
  await expect(page.locator('#atlas-caption')).not.toBeInViewport();
  await expect(page.locator('#spike-trace')).toBeVisible();
  await expect(page.locator('#experiment-status')).toBeHidden();
  await expect(page.locator('#guide-message')).toBeHidden();
  await reveal(page, '#view-all');
  await page.getByRole('button', { name: 'View all', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('after-default.png') });
  await page.locator('#neural-detail > summary').click();
  await expect(page.locator('#signal-left')).toHaveText(before.last.response.inputs.signalLeft.toFixed(1));
  await expect(page.locator('#brain-spikes')).toHaveText(before.last.response.spikes.toLocaleString('en-US'));
  await expect(page.locator('#action-speed')).toHaveText(before.currentCommand.speed.toFixed(2));
  await expect(page.locator('#output-raw')).toContainText('turnLeft');
  await reveal(page, '#environment-details > summary');
  await page.locator('#environment-details > summary').click();
  await expect(page.locator('#source-contributions')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('after-details.png') });
  await page.locator('#neural-detail > summary').click();
  await reveal(page, '#environment-details > summary');
  await page.locator('#environment-details > summary').click();
  const after = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(after.last).toEqual(before.last); expect(after.pose).toEqual(before.pose);
  expect(after.sources).toEqual(before.sources); expect(after.initial).toEqual(before.initial);
  expect(after.simulationTime).toBe(before.simulationTime);
});

test('Brain engine status is separate from Interact and manual Preview selection', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#current-mode')).toBeHidden();
  await page.evaluate(() => window.archonDebug.brain.start({ realtime: false }));
  await expect(page.locator('#current-mode')).toHaveText('Brain');
  await expect(page.locator('#current-mode')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator('#interact')).toHaveAttribute('aria-pressed', 'false');
  await reveal(page, '#interaction-preview');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('#exception-status')).toHaveText('Manual preview');
  await expect(page.locator('#current-mode')).toBeHidden();
  await expect(page.locator('#interaction-preview')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#neural-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#interact')).toHaveAttribute('aria-pressed', 'false');
});

test('delayed and failed real model requests are visible outside diagnostics', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const before = await page.evaluate(() => window.archonDebug.brain.snapshot());
  await page.workers()[0].evaluate(() => { self.onmessage = () => {}; });
  await page.evaluate(() => window.archonDebug.brain.configure({ realtime: true }));
  await expect(page.locator('#run-summary')).toContainText('Response delayed');
  await expect(page.locator('#activity-sample')).toContainText('Latest completed sample');
  await expect(page.locator('#run-summary')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#run-summary')).toContainText('timed out');
  const after = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(after.last).toEqual(before.last); expect(after.pose).toEqual(before.pose); expect(after.sources).toEqual(before.sources);
  await expect(page.locator('#neural-detail')).not.toHaveAttribute('open', '');
});

test('keyboard disclosures and small-screen panels never toggle playback or alter the experiment', async ({ page }, testInfo) => {
  const before = await setup(page);
  await page.locator('#learn-link').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#guide-body')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('#guide-message')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.locator('.viewer-header').boundingBox()).height).toBeLessThanOrEqual(290);
  await page.screenshot({ path: testInfo.outputPath('small-default.png') });
  await page.locator('#environment-panel').scrollIntoViewIfNeeded();
  await reveal(page, '#source-editor');
  await page.getByRole('button', { name: 'Select source A', exact: true }).click();
  await expect(page.locator('#source-strength')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('small-environment.png') });
  await page.locator('#neural-panel').scrollIntoViewIfNeeded();
  await expect(page.locator('#brain-atlas')).toBeVisible();
  await page.locator('#neural-detail > summary').press('Space');
  await expect(page.locator('#signal-left')).toBeVisible();
  await page.locator('#signal-left').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('small-details.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const scene = await page.locator('#scene-viewport').boundingBox(), footer = await page.locator('.viewer-footer').boundingBox();
  expect(scene.y + scene.height).toBeLessThanOrEqual(footer.y);
  const after = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(after.last).toEqual(before.last); expect(after.initial).toEqual(before.initial); expect(after.sources).toEqual(before.sources);
  await expect(page.locator('#pause')).toHaveAttribute('data-icon', 'play');
});

test('file progress and persistent failures stay visible and restored exceptions survive closed settings', async ({ page }) => {
  await setup(page);
  const file = await page.evaluate(async () => {
    const b = window.archonDebug.brain, file = await b.saveExperiment('Restored exceptions');
    file.settings.outputsEnabled = false; file.settings.directional = false; file.settings.assist = true;
    return file;
  });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/data/groups783.json', async route => {
    const response = await route.fetch(); // Preserve the actual annotations; delay only delivery.
    await held; await route.fulfill({ response });
  });
  await page.locator('#experiment-file').setInputFiles({ name: 'restored.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('#experiment-status')).toContainText('Loading');
  await expect(page.locator('#run-summary')).toContainText('Loading model');
  await expect(page.locator('#pause')).toBeDisabled();
  release();
  await expect(page.locator('#experiment-status')).toContainText('Press Play');
  await expect(page.locator('#exception-status')).toHaveText('Neural output disconnected · Directional signal removed · Steering assist enabled');
  await expect(page.locator('#experiment-name')).toHaveValue(file.name);
  await expect(page.locator('#pause')).toHaveAttribute('data-icon', 'play');
  await expect(page.locator('#experiment-status')).toBeHidden({ timeout: 8000 });
  const before = await page.evaluate(() => window.archonDebug.brain.snapshot());
  await page.locator('#experiment-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await expect(page.locator('#experiment-status')).toHaveAttribute('role', 'alert');
  await page.waitForTimeout(5200);
  await expect(page.locator('#experiment-status')).toBeVisible();
  expect((await page.evaluate(() => window.archonDebug.brain.snapshot())).sources).toEqual(before.sources);
});

test('source selection is explicit and nearby map labels separate without moving their anchors', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#source-detail')).toHaveText('Select A or B');
  await expect(page.locator('#source-strength')).toBeHidden();
  await page.evaluate(async () => {
    const b = window.archonDebug.brain;
    await b.start({ profile: 'olfactory', mode: 'interactive', realtime: false, sources: [
      { id: 'bound-a', label: 'A', position: { x: 0, y: 2.4, z: 2 }, strength: 1 },
      { id: 'other-b', label: 'B', position: { x: .1, y: 2.4, z: 2.15 }, strength: .7 }] });
    await b.steps(22); await b.saveExperiment('Bound source');
  });
  const before = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(before.currentCommand.targetId).toBe('bound-a');
  await page.getByRole('button', { name: 'Edit source B on map', exact: true }).click();
  await expect(page.locator('#source-detail')).toHaveText('Editing B');
  await expect(page.locator('#source-remaining')).toContainText('Energy left');
  await expect(page.locator('#source-connection')).toContainText('Linked to A');
  await expect(page.locator('#source-connection')).not.toContainText('bound-a');
  const a = await page.locator('#map-source-bound-a .map-label').boundingBox();
  const b = await page.locator('#map-source-other-b .map-label').boundingBox();
  expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
  await expect(page.locator('#map-source-bound-a')).toHaveAttribute('transform', /translate\(0 -2\)/);
  await expect(page.locator('#map-source-other-b')).toHaveAttribute('transform', /translate\(0.1 -2.15\)/);
  const after = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(after.sources).toEqual(before.sources); expect(after.currentCommand).toEqual(before.currentCommand);
  await reveal(page, '#orbit');
  await page.getByRole('button', { name: 'Orbit', exact: true }).click();
  await expect(page.locator('#source-strength')).toBeDisabled();
  await expect(page.locator('#map-source-other-b')).toHaveAttribute('tabindex', '-1');
  await reveal(page, '#orbit');
  await page.getByRole('button', { name: 'Orbit', exact: true }).click();
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  await expect(page.locator('#source-detail')).toHaveText('Select A or B');
  await expect(page.locator('#source-strength')).toBeHidden();
});

test('paused samples stay intact while playback, engine and exception indicators reflect actual state', async ({ page }, testInfo) => {
  const before = await setup(page);
  await expect(page.locator('#pause')).toHaveAttribute('data-icon', 'play');
  await expect(page.locator('#run-summary')).toContainText('Paused');
  await expect(page.locator('#run-summary')).not.toContainText('Moving');
  await expect(page.locator('#neural-toggle')).toBeHidden();
  await expect(page.locator('#interact')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#exception-status')).toBeHidden();
  await page.locator('#neural-detail > summary').click();
  await expect(page.locator('#action-state')).toContainText('Last applied command');
  await expect(page.locator('#sample-time')).toContainText('Paused sample');
  await expect(page.locator('#action-speed')).toHaveText(before.currentCommand.speed.toFixed(2));
  await page.locator('#neural-detail > summary').click();
  await page.screenshot({ path: testInfo.outputPath('paused.png') });
  await page.evaluate(() => window.archonDebug.brain.configure({ outputsEnabled: false, directional: false, assist: true }));
  await expect(page.locator('#exception-status')).toHaveText('Neural output disconnected · Directional signal removed · Steering assist enabled');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('#pause')).toHaveAttribute('data-icon', 'pause');
  await expect(page.locator('#run-summary')).toContainText('Running');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#pause')).toHaveAttribute('data-icon', 'play');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await reveal(page, '#neural-toggle');
  await expect(page.locator('#neural-toggle')).toBeVisible();
  await expect(page.locator('#neural-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const after = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(after.last).toEqual(before.last); expect(after.simulationTime).toBe(before.simulationTime);
});
