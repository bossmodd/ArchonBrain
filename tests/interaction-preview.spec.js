import { reveal } from './helpers/disclosures.js';
import { test, expect } from '@playwright/test';

test('preview runs the same prepare/absorb/release signals and Stop interrupts preparation', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(() => window.archonDebug.setTime(0));
  await expect.poll(() => page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).gasTime)).toBe(0);
  await reveal(page, '#interaction-preview');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction.phase)).toBe('prepare');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction.phase)).toBe('idle');
  expect((await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }))).interaction.connection.strength).toBe(0);
  await reveal(page, '#interaction-preview');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction.phase)).toBe('absorb');
  await expect.poll(() => page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction.connection.strength)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction.phase), { timeout: 15000 }).toBe('idle');
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(/[\uac00-\ud7a3]/);
});
