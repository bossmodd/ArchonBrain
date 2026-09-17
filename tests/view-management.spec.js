import { reveal } from './helpers/disclosures.js';
import { test, expect } from '@playwright/test';
import { Quaternion, Vector3 } from 'three';

function inside(camera, center, radius) {
  const p = new Vector3(...center).sub(new Vector3(...camera.position)).applyQuaternion(new Quaternion(...camera.quaternion).invert());
  return Math.abs(p.x) + radius < camera.halfWidth / camera.zoom
    && Math.abs(p.y) + radius < camera.halfHeight / camera.zoom
    && -p.z - radius > camera.near && -p.z + radius < camera.far;
}

test('view controls frame the real body envelope and zero, one or two sources without moving the world', async ({ page }) => {
  await page.goto('/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(() => window.archonDebug.brain.start({ profile: 'olfactory', mode: 'interactive', realtime: false,
    pose: { x: 22, z: -13, heading: 1 }, sources: [
      { id: 'a', position: { x: -14, y: 2.4, z: 16 }, strength: 1 },
      { id: 'b', position: { x: 18, y: 2.4, z: 17 }, strength: 1 }] }));
  const before = await page.evaluate(() => window.archonDebug.brain.snapshot());
  for (const count of [2, 1, 0]) {
    if (count < 2) await page.evaluate(count => {
      const brain = window.archonDebug.brain;
      brain.configure({ sources: brain.snapshot().sources.slice(0, count) });
    }, count);
  await reveal(page, '#view-all');
    await page.getByRole('button', { name: 'View all', exact: true }).click();
    const result = await page.evaluate(() => ({ visual: window.archonDebug.snapshot({ measureEyes: false }), brain: window.archonDebug.brain.snapshot() }));
    expect(inside(result.visual.cameraPose, [22, 2.4, -13], 3.05)).toBe(true);
    for (const s of result.brain.sources) expect(inside(result.visual.cameraPose, [s.position.x, s.position.y, s.position.z], .6)).toBe(true);
    expect(result.brain.pose).toEqual(before.pose); expect(result.brain.simulationTime).toBe(0);
  }
  await page.evaluate(() => window.archonDebug.brain.addSource({ x: 100000, y: 2.4, z: -100000 }));
  await reveal(page, '#view-all');
  await page.getByRole('button', { name: 'View all', exact: true }).click();
  const far = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).cameraPose);
  expect(Object.values(far).flat().filter(v => typeof v === 'number').every(Number.isFinite)).toBe(true);
  await page.getByRole('button', { name: 'Archon view', exact: true }).click();
  const close = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).cameraPose);
  expect(close.zoom).toBeGreaterThan(.5);
  expect(inside(close, [22, 2.4, -13], 3.05)).toBe(true);
});

test('framing keeps the existing gas occlusion depth range synchronized with the actual camera', async ({ page }) => {
  await page.goto('/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  await page.getByRole('button', { name: 'Archon view', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const state = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }));
  expect(state.gasDepthRange).toEqual([state.cameraPose.near, state.cameraPose.far]);
});

test('optional screen keeping has a quiet center, suspends throughout dragging, and yields to Orbit', async ({ page }) => {
  await page.goto('/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(() => window.archonDebug.brain.start({ profile: 'olfactory', mode: 'interactive', realtime: false,
    sources: [{ id: 'a', position: { x: 0, y: 2.4, z: 2 }, strength: 1 }] }));
  await page.getByRole('button', { name: 'Archon view', exact: true }).click();
  await reveal(page, '#keep-in-view');
  const keep = page.getByRole('button', { name: 'Keep in view', exact: true });
  await expect(keep).toHaveAttribute('aria-pressed', 'false', { timeout: 2000 });
  await reveal(page, '#keep-in-view');
  await keep.click();
  const before = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).cameraPose);
  await page.waitForTimeout(250);
  expect((await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).cameraPose)).position).toEqual(before.position);
  const handle = await page.getByRole('button', { name: 'Move source A', exact: true }).boundingBox();
  await page.mouse.move(handle.x + 10, handle.y + 10); await page.mouse.down();
  await page.evaluate(() => window.archonDebug.brain.configure({ pose: { x: 12, z: 0, heading: 2 } }));
  await page.waitForTimeout(250);
  await page.mouse.move(handle.x + 55, handle.y + 10, { steps: 5 });
  expect((await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).cameraPose)).position).toEqual(before.position);
  await page.mouse.up(); await page.waitForTimeout(500);
  const followed = await page.evaluate(() => ({ camera: window.archonDebug.snapshot({ measureEyes: false }).cameraPose, brain: window.archonDebug.brain.snapshot() }));
  expect(followed.camera.position).not.toEqual(before.position);
  expect(followed.camera.quaternion).toEqual(before.quaternion);
  expect(followed.brain.pose).toEqual({ x: 12, z: 0, heading: 2 });
  expect(followed.brain.simulationTime).toBe(0);
  await reveal(page, '#orbit');
  await page.getByRole('button', { name: 'Orbit', exact: true }).click();
  await expect(keep).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Move source A', exact: true, includeHidden: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Select source A', exact: true })).toBeDisabled();
  await page.mouse.move(750, 400); await page.mouse.down(); await page.mouse.move(810, 440, { steps: 8 }); await page.mouse.up();
  await reveal(page, '#orbit');
  await page.getByRole('button', { name: 'Orbit', exact: true }).click();
  const manual = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).cameraPose);
  await page.waitForTimeout(250);
  expect((await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).cameraPose)).position).toEqual(manual.position);
  expect(manual.target).not.toEqual([0, 1.95, 0]);
});
