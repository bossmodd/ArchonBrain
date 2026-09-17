import { test, expect } from '@playwright/test';

test('renders intermediate poses between real neural updates without advancing the environment', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    await brain.start({ profile: 'olfactory', realtime: false,
      sources: [{ id: 'remote', position: { x: Math.sqrt(12), y: 2.4, z: 2 }, strength: 1 }] });
    const initial = window.archonDebug.snapshot({ measureEyes: false }).renderedPose;
    const actual = await brain.steps(1), frames = [], mapFrames = [];
    for (let i = 0; i < 12; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      frames.push(window.archonDebug.snapshot({ measureEyes: false }).renderedPose);
      const map = document.querySelector('#map-archon').dataset;
      mapFrames.push({ x: Number(map.x), z: Number(map.z), heading: Number(map.heading) });
    }
    return { initial, actual, frames, mapFrames, after: brain.snapshot() };
  });
  expect(Math.hypot(result.actual.pose.x, result.actual.pose.z)).toBeGreaterThan(0);
  const intermediate = result.frames.filter(p => Math.hypot(p.x - result.initial.x, p.z - result.initial.z) > 1e-6
    && Math.hypot(p.x - result.actual.pose.x, p.z - result.actual.pose.z) > 1e-6);
  expect(new Set(intermediate.map(p => JSON.stringify(p))).size).toBeGreaterThanOrEqual(3);
  expect(result.frames.at(-1)).toEqual(result.actual.pose);
  expect(result.after.pose).toEqual(result.actual.pose);
  expect(result.after.simulationTime).toBe(.1);
  expect(result.after.last.response.modelTimeMs).toBe(100);
  expect(result.mapFrames).toEqual(result.frames);
});

test('blocking outputs cancels unfinished display movement and restart snaps to the initial pose', async ({ page }) => {
  await page.goto('/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    await brain.start({ profile: 'olfactory', realtime: false,
      sources: [{ id: 'remote', position: { x: Math.sqrt(12), y: 2.4, z: 2 }, strength: 1 }] });
    await brain.steps(1);
    brain.configure({ outputsEnabled: false });
    const before = window.archonDebug.snapshot({ measureEyes: false }).renderedPose;
    await new Promise(resolve => setTimeout(resolve, 200));
    await brain.steps(2);
    await new Promise(resolve => setTimeout(resolve, 150));
    const after = window.archonDebug.snapshot({ measureEyes: false }).renderedPose;
    await brain.restart();
    return { before, after, reset: window.archonDebug.snapshot({ measureEyes: false }).renderedPose };
  });
  expect(result.after).toEqual(result.before);
  expect(result.reset).toEqual({ x: 0, z: 0, heading: 0 });
});
