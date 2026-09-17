import { test, expect } from '@playwright/test';

test('overview uses both columns without header clutter or changes to the live experiment', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.archonDebug?.brain.snapshot().simulationTime ?? 0)).toBeGreaterThan(.2);
  await page.evaluate(() => window.archonDebug.brain.configure({ realtime: false }));
  await expect.poll(() => page.evaluate(() => window.archonDebug.brain.snapshot().runtime.pendingMs)).toBeNull();
  const before = await page.evaluate(() => window.archonDebug.brain.snapshot());
  await expect(page.locator('.viewer-header .signal-path')).toHaveCount(0);
  await expect(page.locator('#experience-explanation .signal-path')).toHaveCount(1);
  await expect(page.locator('#experience-purpose')).toHaveCount(0);
  await expect(page.locator('.viewer-header')).not.toContainText('How it works');
  await expect(page.locator('#neural-panel .brain-heading')).toBeHidden();
  await page.locator('#how-it-works').scrollIntoViewIfNeeded();
  const intro = await page.locator('#how-it-works > p').first().boundingBox();
  const flow = await page.locator('#experience-process').boundingBox();
  const stages = await page.locator('.overview-stages').boundingBox();
  expect(flow.x).toBeGreaterThan(intro.x + intro.width);
  expect(stages.x).toBeCloseTo(flow.x, 0);
  expect(stages.x + stages.width).toBeGreaterThan(1200);
  await expect(page.locator('#how-it-works h2')).toBeInViewport();
  expect(await page.locator('#how-it-works').evaluate(el => el.children[1].classList.contains('signal-path'))).toBe(true);
  const after = await page.evaluate(() => window.archonDebug.brain.snapshot());
  for (const key of ['last', 'pose', 'sources', 'initial', 'simulationTime', 'options']) expect(after[key]).toEqual(before[key]);
  expect(await page.locator('#experience-explanation > section > h2').allTextContents()).toEqual([
    'How it works', 'What you can do right now', 'What the current demo demonstrates',
    'What it does not do yet', 'What we want to build next', 'Why this direction matters',
  ]);
  await expect(page.locator('.roadmap-status')).toHaveCount(5);
  await page.screenshot({path:'docs/project-overview-revision/how-it-works.png'});
  await page.locator('#current-limits').scrollIntoViewIfNeeded();
  await page.screenshot({path:'docs/project-overview-revision/limits-roadmap.png'});
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({path:'docs/project-overview-revision/top.png'});
  await page.screenshot({path:'docs/project-overview-revision/full.png', fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.locator('#how-it-works').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0,window.scrollY));
  expect(await page.locator('#experience-explanation').evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'docs/project-overview-revision/narrow.png'});
});
