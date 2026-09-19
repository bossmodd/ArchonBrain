import { test, expect } from '@playwright/test';

test('public identity uses the supplied portrait, a right-aligned repository link, and honest fan-project intent', async ({ page }) => {
  await page.goto('/');
  const portrait = page.locator('.wordmark img');
  await expect(portrait).toHaveAttribute('src', '/images/archon-portrait.gif');
  await expect.poll(() => portrait.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  const repo = page.locator('.viewer-header a.github-link');
  await expect(repo).toHaveAttribute('href', 'https://github.com/bossmodd/ArchonBrain');
  await expect(repo).toHaveAccessibleName('GitHub');
  await expect(repo.locator('svg')).toBeVisible();
  const social = page.getByRole('link', { name: 'X — @Paczep', exact: true });
  await expect(social).toHaveAttribute('href', 'https://x.com/Paczep');
  await expect(social.locator('svg')).toBeVisible();
  await expect(social).toHaveAttribute('rel', 'noopener noreferrer');
  const header = await page.locator('.viewer-header').boundingBox(), link = await social.boundingBox();
  expect((await repo.boundingBox()).x).toBeLessThan(link.x);
  expect(link.x + link.width).toBeCloseTo(header.x + header.width, 0);
  await expect(page.locator('#how-it-works')).toContainText('autonomy');
  await expect(page.locator('#project-roadmap')).toContainText('other StarCraft units');
  await expect(page.locator('#project-direction')).toContainText('non-commercial fan-made');
  await expect(page.locator('#current-limits')).toContainText('does not improve through repeated experience');
  await expect.poll(() => page.evaluate(() => window.archonDebug?.brain.snapshot().simulationTime ?? 0)).toBeGreaterThan(.2);
  await page.screenshot({path:'docs/project-identity/top.png'});
  await page.locator('#project-direction').scrollIntoViewIfNeeded();
  await page.screenshot({path:'docs/project-identity/direction.png'});
});
