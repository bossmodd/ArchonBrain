import { reveal } from './helpers/disclosures.js';
import { test, expect } from '@playwright/test';

async function atTime(page, time) {
  await page.evaluate(value => window.archonDebug.setTime(value), time);
  await expect.poll(async () => (await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }))).gasTime).toBe(time);
}

test('absorption flows from source into rigged palms through retargeting, orbit and interruption', async ({ page }) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  await atTime(page, 0);
  await page.evaluate(() => window.archonDebug.setVisualState({ interaction: { phase: 'absorb', target: { x: 3.1, y: 2.9, z: 1.5 } } }));
  await atTime(page, 1.4);
  const active = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction);
  expect(active.connection, 'Absorption needs a real rendered connection').toBeDefined();
  expect(active.connection.strength).toBe(1);
  expect(active.connection.frontFacing, 'The energy ribbon must face the camera rather than be culled').toEqual([true, true]);
  const checkAttachment = state => {
    state.connection.ends.forEach((point, i) => point.forEach((value, axis) => expect(value).toBeCloseTo(state.hands[i][axis], 4)));
    state.connection.starts.forEach(point => point.forEach((value, axis) => expect(value).toBeCloseTo(state.source[axis], 4)));
    expect(state.sockets.map(socket => socket.parent)).toEqual(['LeftHand', 'RightHand']);
  };
  checkAttachment(active);
  const before = await page.locator('canvas').screenshot();
  await atTime(page, 1.5);
  const later = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction);
  expect(later.connection.packetProgress).toBeGreaterThan(active.connection.packetProgress);
  expect(later.connection.packetDistanceToHand).toBeLessThan(active.connection.packetDistanceToHand);
  expect((await page.locator('canvas').screenshot()).equals(before)).toBe(false);
  await page.evaluate(() => window.archonDebug.setVisualState({ interaction: { phase: 'absorb', target: { x: -2.7, y: 3.6, z: 2.6 } } }));
  await atTime(page, 2.2);
  await reveal(page, '#orbit');
  await page.getByRole('button', { name: 'Orbit', exact: true }).click();
  await page.mouse.move(640, 410);
  await page.mouse.down();
  await page.mouse.move(810, 470, { steps: 12 });
  await page.mouse.up();
  const moved = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }));
  checkAttachment(moved.interaction);
  expect(moved.interaction.source).toEqual([-2.7, 3.6, 2.6]);
  expect(moved.effectsVisible).toBe(true);
  expect(moved.satellites).toHaveLength(3);
  expect(moved.parameters.shellOpacity).toBe(0.7);
  await page.evaluate(() => window.archonDebug.setVisualState({ interaction: { phase: 'idle' } }));
  await atTime(page, 2.7);
  const fading = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction);
  expect(fading.connection.strength).toBe(0);
  expect(fading.pose).toBeGreaterThan(0);
  await atTime(page, 3.5);
  const idle = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction);
  expect(idle.phase).toBe('idle');
  expect(idle.charge).toBe(0);
  expect(idle.pose).toBe(0);
  expect(errors).toEqual([]);
});

test('interaction signals move actual shoulder, elbow, chest and head bones then restore idle', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  await atTime(page, 0);
  const rest = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction);
  expect(rest, 'The existing visual input must expose interaction motion').toBeDefined();
  await page.evaluate(() => window.archonDebug.setVisualState({ interaction: { phase: 'prepare', target: { x: 3.1, y: 2.9, z: 1.5 } } }));
  await atTime(page, 0.5);
  const preparing = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction);
  expect(preparing.pose).toBeGreaterThan(0);
  expect(preparing.pose).toBeLessThan(1);
  expect(preparing.flow).toBe(0);
  await page.evaluate(() => window.archonDebug.setVisualState({ interaction: { phase: 'absorb' } }));
  await atTime(page, 1.3);
  const reaching = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction);
  for (const joint of ['LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'Spine', 'Head']) {
    const a = rest.joints[joint];
    const b = reaching.joints[joint];
    expect(Math.hypot(...b.map((value, i) => value - a[i])), joint).toBeGreaterThan(0.025);
  }
  for (let i = 0; i < 2; i++) {
    const distance = hand => Math.hypot(...hand.map((value, axis) => value - [3.1, 2.9, 1.5][axis]));
    expect(distance(reaching.hands[i])).toBeLessThan(distance(rest.hands[i]));
    // The rest pose already spreads one hand toward this oblique target.
    // Verify a real gesture as well as closer contact, without demanding arm stretch.
    expect(Math.hypot(...reaching.hands[i].map((value, axis) => value - rest.hands[i][axis]))).toBeGreaterThan(0.35);
  }
  await page.evaluate(() => window.archonDebug.setVisualState({ interaction: { phase: 'release' } }));
  await atTime(page, 2.6);
  const released = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction);
  expect(released.pose).toBe(0);
  expect(released.phase).toBe('idle');
  // Compare with the idle pose at the same time, including the existing breathing.
  await page.reload();
  await expect(page.locator('#status')).toHaveText('Ready');
  await atTime(page, 2.6);
  const idle = await page.evaluate(() => window.archonDebug.snapshot({ measureEyes: false }).interaction);
  for (const joint of Object.keys(idle.joints)) {
    released.joints[joint].forEach((value, i) => expect(value).toBeCloseTo(idle.joints[joint][i], 5));
  }
});

test('loads the actual rigged GLB into a centered oblique scene without WebGL errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?tools=1');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#status')).toHaveText('Ready');
  const state = await page.evaluate(() => window.archonDebug.snapshot());
  expect(state.body.meshCount).toBeGreaterThan(0);
  expect(state.body.joints).toBe(24);
  expect(state.body.source).toBe('/models/archon-rigged.glb');
  expect(state.body.height).toBeCloseTo(2.9, 1);
  expect(state.camera).toBe('fixed');
  expect(state.drawCalls).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('two eye glows follow the head rig while the chest breathes slowly in place', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const initial = await page.evaluate(() => window.archonDebug.snapshot());
  expect(initial.body.eyeCount).toBe(2);
  expect(initial.eyeParent).toBe('Head');
  expect(initial.eyeSurfaceGap).not.toBeNull();
  expect(initial.eyeSurfaceGap).toBeLessThan(0.035);
  await page.evaluate(() => window.archonDebug.setTime(0));
  await expect.poll(async () => (await page.evaluate(() => window.archonDebug.snapshot())).gasTime).toBe(0);
  const rest = await page.evaluate(() => window.archonDebug.snapshot().breath);
  await page.evaluate(() => window.archonDebug.setTime(3));
  await expect.poll(async () => (await page.evaluate(() => window.archonDebug.snapshot())).gasTime).toBe(3);
  const inhale = await page.evaluate(() => window.archonDebug.snapshot().breath);
  expect(inhale).not.toBe(rest);
  expect(inhale).toBeGreaterThan(0.99);
  expect(inhale).toBeLessThan(1.01);
});

test('external visual state clamps energy and changes the real paused frame without moving the body', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  expect(await page.evaluate(() => typeof window.archonDebug.setVisualState)).toBe('function');
  await page.evaluate(() => { window.archonDebug.setTime(5); window.archonDebug.setVisualState({ energy: -1 }); });
  await expect.poll(async () => (await page.evaluate(() => window.archonDebug.snapshot())).gasEnergy).toBe(0);
  const low = await page.locator('canvas').screenshot();
  const body = await page.evaluate(() => window.archonDebug.snapshot().body);
  await page.evaluate(() => window.archonDebug.setVisualState({ energy: 10 }));
  await expect.poll(async () => (await page.evaluate(() => window.archonDebug.snapshot())).gasEnergy).toBe(1);
  expect((await page.locator('canvas').screenshot()).equals(low)).toBe(false);
  await page.evaluate(() => window.archonDebug.setVisualState({ energy: NaN }));
  const after = await page.evaluate(() => window.archonDebug.snapshot());
  expect(after.visualState.energy).toBe(1);
  expect(after.body).toEqual(body);
  expect(after.time).toBe(5);
});

test('a real missing GLB response shows an actionable error without a substitute body', async ({ page }) => {
  await page.goto('/?model=/models/missing.glb');
  await expect(page.getByRole('alert')).toContainText('Could not load GLB');
  await expect(page.getByRole('alert')).toContainText('/models/missing.glb');
  expect(await page.evaluate(() => window.archonDebug?.snapshot().body.meshCount ?? 0)).toBe(0);
});

test('viewer controls change real parameters, orbit, pause, isolate body and restore defaults', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await reveal(page, '#gui-container');
  await expect(page.locator('.lil-gui.lil-root')).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(/[\uac00-\ud7a3]/);
  const inputs = page.locator('.lil-gui .lil-number input');
  await expect(inputs).toHaveCount(8);
  await inputs.nth(0).fill('2.1');
  await inputs.nth(0).press('Tab');
  expect((await page.evaluate(() => window.archonDebug.snapshot())).parameters.shellRadius).toBe(2.1);
  await reveal(page, '#orbit');
  await page.getByRole('button', { name: 'Orbit', exact: true }).click();
  expect((await page.evaluate(() => window.archonDebug.snapshot())).camera).toBe('orbit');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const stopped = await page.evaluate(() => window.archonDebug.snapshot());
  await page.waitForTimeout(150);
  expect((await page.evaluate(() => window.archonDebug.snapshot())).time).toBe(stopped.time);
  await reveal(page, '#body');
  await page.getByRole('button', { name: 'Body', exact: true }).click();
  expect((await page.evaluate(() => window.archonDebug.snapshot())).effectsVisible).toBe(false);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  const reset = await page.evaluate(() => window.archonDebug.snapshot());
  expect(reset.parameters.shellRadius).toBe(1.85);
  expect(reset.camera).toBe('fixed');
  expect(reset.effectsVisible).toBe(true);
});

test('renders animated energy and three shards at nine times the original orbit speed', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const before = await page.evaluate(() => window.archonDebug.snapshot());
  expect(before.layers).toEqual(expect.arrayContaining(['BodyMesh', 'InnerGlow', 'PsionicShell', 'FilamentLayer', 'SparkParticles', 'RedSatelliteSystem']));
  expect(before.satellites).toHaveLength(3);
  expect(before.parameters.satelliteSpeed).toBeCloseTo(0.7 * 9);
  expect(before.sparkCount).toBe(48);
  const firstFrame = await page.locator('canvas').screenshot();
  await expect.poll(async () => (await page.evaluate(() => window.archonDebug.snapshot())).time).toBeGreaterThan(before.time + 0.5);
  const after = await page.evaluate(() => window.archonDebug.snapshot());
  expect(after.satellites).not.toEqual(before.satellites);
  expect(after.gasTime).toBeGreaterThan(before.gasTime);
  expect((await page.locator('canvas').screenshot()).equals(firstFrame)).toBe(false);
});
