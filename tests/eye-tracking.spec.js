import { test, expect } from '@playwright/test';

test('eye light stays on the actual skinned face during reaching, retargeting and release', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const at = async time => {
    await page.evaluate(t => window.archonDebug.setTime(t), time);
    await expect.poll(() => page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).gasTime)).toBe(time);
  };
  await at(0);
  for (const [phase, time, target] of [
    ['prepare', 0.6, { x: 3.5, y: 3.3, z: 1.2 }],
    ['absorb', 1.8, { x: 3.5, y: 3.3, z: 1.2 }],
    ['absorb', 3.2, { x: -3, y: 4, z: 2 }],
    ['absorb', 4.5, { x: 0.5, y: 2.7, z: -3 }],
    ['release', 5.1],
    ['idle', 6.5],
  ]) {
    await page.evaluate(signal => window.archonDebug.setVisualState({ interaction: signal }), { phase, target });
    await at(time);
    const state = await page.evaluate(() => window.archonDebug.snapshot());
    expect(state.eyeSurfaceGap, `${phase} at ${time}s must measure the face, including back-facing poses`).not.toBeNull();
    expect(state.eyeSurfaceGap, `${phase} at ${time}s must not detach from the skinned face`).toBeLessThan(0.02);
  }
});
