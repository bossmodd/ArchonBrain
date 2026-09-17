import { test, expect } from '@playwright/test';

test('the supplied rig bends its elbows as hinges without rolling the forearms during the gesture', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const samples = await page.evaluate(async () => {
    const { BodyMesh } = await import('/src/archon/BodyMesh.js');
    const { InteractionState } = await import('/src/archon/InteractionState.js');
    const { defaults } = await import('/src/archon/parameters.js');
    const { Group, Vector3, Quaternion } = await import('/node_modules/.vite/deps/three.js');
    const body = await new BodyMesh({ ...defaults }).load();
    const root = new Group(); root.position.y = 2.4; root.add(body); root.updateMatrixWorld(true);
    const pos = bone => bone.getWorldPosition(new Vector3());
    const rest = body.interactionPose.arms.map(arm => ({
      rotation: arm.lower.quaternion.clone(),
      axis: pos(arm.lower).sub(pos(arm.upper)).cross(pos(arm.hand).sub(pos(arm.lower))).normalize()
        .applyQuaternion(arm.upper.getWorldQuaternion(new Quaternion()).invert()),
    }));
    const state = new InteractionState();
    state.set({ phase: 'prepare', target: { x: 3.5, y: 3.3, z: 1.2 } });
    const samples = [];
    for (let step = 0; step <= 66; step++) {
      const time = step * 0.05;
      if (step === 23) state.set({ phase: 'absorb' });
      if (step === 43) state.set({ phase: 'release' });
      body.update(time, state.update(time)); root.updateMatrixWorld(true);
      body.interactionPose.arms.forEach((arm, i) => {
        const delta = arm.lower.quaternion.clone().multiply(rest[i].rotation.clone().invert()).normalize();
        const rotationAxis = new Vector3(delta.x, delta.y, delta.z);
        const twist = rotationAxis.clone().addScaledVector(rest[i].axis, -rotationAxis.dot(rest[i].axis)).length();
        samples.push({ time, side: arm.side, twist, elbowRise: pos(arm.lower).y - pos(arm.upper).y });
      });
    }
    return samples;
  });
  const worst = samples.reduce((a, b) => a.twist > b.twist ? a : b);
  expect(worst.twist, JSON.stringify(worst)).toBeLessThan(0.025);
  expect(Math.max(...samples.map(s => s.elbowRise)), 'Elbows stay below shoulders while gathering and extending').toBeLessThan(0.03);
});
