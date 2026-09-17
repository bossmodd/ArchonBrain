import { test, expect } from '@playwright/test';

test('panel title gaps and overview content edges share the same alignment', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#brain-atlas')).toHaveAttribute('data-state', 'ready');
  const layout = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect();
    const textBottom = selector => {
      const range = document.createRange(); range.selectNodeContents(document.querySelector(selector));
      return range.getBoundingClientRect().bottom;
    };
    return {
      neuralGap: box('#brain-atlas').top - textBottom('#neural-panel > h2'),
      archonGap: box('#scene-viewport').top - textBottom('.observation-heading h2'),
      left: box('#neural-panel').left, right: box('#environment-panel').right,
      sections: [...document.querySelectorAll('#experience-explanation > section')].map(el => {
        const r = el.getBoundingClientRect(), css = getComputedStyle(el);
        return { left: r.left + parseFloat(css.paddingLeft), right: r.right - parseFloat(css.paddingRight) };
      }),
    };
  });
  expect(layout.neuralGap).toBeCloseTo(layout.archonGap, 0);
  for (const section of layout.sections) {
    expect(section.left).toBeCloseTo(layout.left, 0);
    expect(section.right).toBeCloseTo(layout.right, 0);
  }
  await page.screenshot({path:'docs/panel-spacing.png', fullPage:true});
});
