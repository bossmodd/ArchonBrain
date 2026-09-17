import { test, expect } from '@playwright/test';

test('real elapsed time excludes Pause and paused edits wait for actual input and output timestamps', async ({ page }) => {
  await page.goto('/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  await page.getByRole('button', { name: 'Interact', exact: true }).click();
  await expect(page.locator('#neural-status')).toContainText('running');
  await page.waitForTimeout(600);
  const running = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(running.runtime?.activeSeconds).toBeGreaterThan(.3);
  expect(running.runtime?.realtimeFactor).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForTimeout(100); // Let the already submitted model window finish.
  const paused = await page.evaluate(() => {
    const brain = window.archonDebug.brain;
    brain.editSource(brain.snapshot().sources[0].id, { strength: .7 });
    return brain.snapshot();
  });
  await page.waitForTimeout(300);
  const waiting = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(waiting.runtime.activeSeconds - paused.runtime.activeSeconds).toBeLessThan(.04);
  expect(waiting.runtime.pausedSeconds).toBeGreaterThan(.3);
  expect(waiting.simulationTime).toBe(paused.simulationTime);
  expect(waiting.runtime.latestEdit.state).toBe('queued');
  expect(waiting.runtime.outputState).toBe('paused');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.archonDebug.brain.snapshot().runtime.latestEdit.state)).toBe('applied');
  const applied = await page.evaluate(() => window.archonDebug.brain.snapshot().runtime);
  expect(applied.latestEdit.inputAt).toBeGreaterThanOrEqual(applied.latestEdit.eventAt + 300);
  expect(applied.latestEdit.appliedAt).toBeGreaterThanOrEqual(applied.latestEdit.inputAt);
  expect(applied.latestEdit.applyLatencyMs).toBeGreaterThanOrEqual(300);
  expect(applied.renderFps).toBeGreaterThan(10);
  await expect(page.locator('#neural-diagnostics')).toContainText('Run');
  await expect(page.locator('#neural-diagnostics')).toContainText('Edit');
});

test('edit latency starts at the native slider event timestamp', async ({ page }) => {
  await page.goto('/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  await page.getByRole('button', { name: 'Interact', exact: true }).click();
  await expect(page.locator('#neural-status')).toContainText('running');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Select source A', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Signal strength' })).toBeEnabled();
  await expect(page.getByRole('slider', { name: 'Signal strength' })).toHaveValue('1');
  await page.evaluate(() => document.querySelector('#source-strength').addEventListener('input', event => {
    window.sourceInputTimestamp = event.timeStamp;
  }, { capture: true, once: true }));
  await page.getByRole('slider', { name: 'Signal strength' }).press('ArrowLeft');
  const result = await page.evaluate(() => ({ event: window.sourceInputTimestamp, edit: window.archonDebug.brain.snapshot().runtime.latestEdit }));
  expect(result.edit.eventAt).toBe(result.event);
});
