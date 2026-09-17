import { test, expect } from '@playwright/test';

test('reference observation columns share the tools page and explanations follow without resetting state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const scene = await page.locator('#scene-viewport').boundingBox();
  const brain = await page.locator('#neural-panel').boundingBox();
  expect((scene.width + 2) / brain.width).toBeCloseTo(1.38, 1);
  expect(brain.width).toBeGreaterThan(320);
  const footer = await page.locator('.viewer-footer').boundingBox();
  expect(footer.y + footer.height).toBeLessThanOrEqual(1000);
  await page.screenshot({ path: 'docs/experience-ui/tools-regression/overlay-layout/after-initial.png' });
  const before = await page.evaluate(() => window.archonDebug.brain.snapshot());
  await page.locator('#learn-section').scrollIntoViewIfNeeded();
  await expect(page.locator('#learn-section')).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  const after = await page.evaluate(() => window.archonDebug.brain.snapshot());
  delete before.runtime; delete after.runtime; // Wall-clock telemetry continues while reading.
  expect(after).toEqual(before);
  expect(await page.locator('canvas').count()).toBe(1);
});

test('camera projection reserves the overlay area at every zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async () => {
    const { CameraRig } = await import('/src/scene/CameraRig.js');
    const { Vector3 } = await import('/node_modules/.vite/deps/three.js');
    const canvas = document.createElement('canvas');
    const rig = new CameraRig(canvas);
    rig.resize(1440, 800, { left: 450, right: 320, top: 66, bottom: 20 });
    return [0.7, 1, 1.6].map(zoom => {
      rig.camera.zoom = zoom; rig.camera.updateProjectionMatrix(); rig.camera.updateMatrixWorld();
      const p = new Vector3().copy(rig.controls.target).project(rig.camera);
      return [(p.x + 1) * 720, (1 - p.y) * 400];
    });
  });
  for (const [x, y] of result) { expect(x).toBeCloseTo(785, 2); expect(y).toBeCloseTo(423, 2); }
});

test('real neural data stays intact through desktop explanation and mobile panels', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  const before = await page.evaluate(async () => {
    const b = window.archonDebug.brain;
    await b.start({ profile: 'olfactory', mode: 'interactive', realtime: false, seed: 7,
      sources: [{ id: 'a', label: 'A', position: { x: -3.464, y: 2.4, z: 2 }, strength: 1, remaining: .8 },
        { id: 'b', label: 'B', position: { x: 3, y: 2.4, z: 3 }, strength: .7, remaining: .6 }] });
    await b.steps(12); await b.saveExperiment('Overlay observation'); return b.snapshot();
  });
  await page.locator('#view-menu > summary').click(); await page.locator('#view-all').click();
  await page.locator('#view-menu > summary').click();
  await page.screenshot({ path: 'docs/experience-ui/tools-regression/overlay-layout/desktop.png' });
  await page.locator('#learn-link').click();
  await page.screenshot({ path: 'docs/experience-ui/tools-regression/overlay-layout/explanation.png' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/experience-ui/tools-regression/overlay-layout/mobile.png' });
  await page.locator('#neural-panel').scrollIntoViewIfNeeded();
  await page.locator('#neural-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/experience-ui/tools-regression/overlay-layout/mobile-neural.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const after = await page.evaluate(() => window.archonDebug.brain.snapshot());
  for (const key of ['last', 'initial', 'pose', 'sources', 'simulationTime', 'options']) expect(after[key]).toEqual(before[key]);
  expect(before.last.response.spikes).toBeGreaterThan(0);
});
