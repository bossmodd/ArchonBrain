import { test, expect } from '@playwright/test';

test('the real rig gathers asymmetrically then extends with a visible chest accent and recovers', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const at = async time => {
    await page.evaluate(t => window.archonDebug.setTime(t), time);
    await expect.poll(() => page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).gasTime)).toBe(time);
    return page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction);
  };
  await at(0);
  await page.evaluate(() => window.archonDebug.setVisualState({ interaction: { phase: 'prepare', target: { x: 3.5, y: 3.3, z: 1.2 } } }));
  const gathered = await at(1.1);
  await page.evaluate(() => window.archonDebug.setVisualState({ interaction: { phase: 'absorb' } }));
  const accent = await at(1.4);
  const travel = gathered.hands.map((hand, i) => Math.hypot(...hand.map((value, j) => value - accent.hands[i][j])));
  expect(Math.min(...travel), 'Both hands must move from the gathered pose').toBeGreaterThan(0.25);
  expect(Math.max(...travel), 'At least one hand needs a clearly visible sweep').toBeGreaterThan(0.45);
  expect(Math.abs(gathered.hands[0][1] - gathered.hands[1][1]), 'Avoid mirrored hands at one height').toBeGreaterThan(0.18);
  expect(Math.hypot(...accent.joints.Spine.map((value, i) => value - gathered.joints.Spine[i]))).toBeGreaterThan(0.08);
  const held = await at(2.1);
  expect(held.impulse).toBe(0);
  expect(held.connection.strength).toBe(1);
  await page.evaluate(() => window.archonDebug.setVisualState({ interaction: { phase: 'release' } }));
  const cut = await at(2.1);
  expect(cut.hands).toEqual(held.hands);
  const recovered = await at(3.3);
  expect(recovered.phase).toBe('idle');
  expect(recovered.pose).toBe(0);
  expect(recovered.extension).toBe(0);
});
