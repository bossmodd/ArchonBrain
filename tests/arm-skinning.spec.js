import { test, expect } from '@playwright/test';

test('turning the left wrist moves the fingers without dragging the middle of the forearm', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async () => {
    const { BodyMesh } = await import('/src/archon/BodyMesh.js');
    const { defaults } = await import('/src/archon/parameters.js');
    const { Vector3 } = await import('/node_modules/.vite/deps/three.js');
    const body = await new BodyMesh({ ...defaults }).load();
    body.updateMatrixWorld(true);
    const mesh = body.surfaceMesh;
    const forearm = [], fingers = [];
    const sample = i => body.worldToLocal(mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld));
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      const p = sample(i);
      if (p.x > 0.57 && p.x < 0.65 && p.y > 0.5 && p.y < 0.85 && p.z < -0.1) forearm.push({ i, p });
      if (p.x > 1.0 && p.y < 0.4) fingers.push({ i, p });
    }
    body.getObjectByName('LeftHand').rotateZ(0.6);
    body.updateMatrixWorld(true);
    const motion = points => points.reduce((sum, { i, p }) => sum + sample(i).distanceTo(p), 0) / points.length;
    return { forearmCount: forearm.length, fingerCount: fingers.length, forearmMotion: motion(forearm), fingerMotion: motion(fingers) };
  });
  expect(result.forearmCount).toBeGreaterThan(300);
  expect(result.fingerCount).toBeGreaterThan(300);
  expect(result.fingerMotion).toBeGreaterThan(0.04);
  expect(result.forearmMotion, 'The hand bone must not bend the mid-forearm a second time').toBeLessThan(0.025);
});

test('left-arm calibration preserves the authored rest surface and all right-side skin weights', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async () => {
    const { BodyMesh } = await import('/src/archon/BodyMesh.js');
    const { defaults } = await import('/src/archon/parameters.js');
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const { Vector3, Box3 } = await import('/node_modules/.vite/deps/three.js');
    const body = await new BodyMesh({ ...defaults }).load(); body.updateMatrixWorld(true);
    const model = (await new GLTFLoader().loadAsync('/models/archon-rigged.glb')).scene;
    model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model, true), scale = 2.9 / box.getSize(new Vector3()).y;
    model.scale.multiplyScalar(scale); model.position.copy(box.getCenter(new Vector3())).multiplyScalar(-scale);
    model.updateMatrixWorld(true);
    let original; model.traverse(object => { if (object.isSkinnedMesh) original = object; });
    const corrected = body.surfaceMesh;
    let restError = 0, rightWeightError = 0;
    for (let i = 0; i < original.geometry.attributes.position.count; i++) {
      const a = original.getVertexPosition(i, new Vector3()).applyMatrix4(original.matrixWorld);
      const b = corrected.getVertexPosition(i, new Vector3()).applyMatrix4(corrected.matrixWorld);
      restError = Math.max(restError, a.distanceTo(b));
      if (a.x >= 0) continue;
      for (let component = 0; component < 4; component++) {
        for (const name of ['skinIndex', 'skinWeight']) rightWeightError = Math.max(rightWeightError,
          Math.abs(original.geometry.attributes[name].getComponent(i, component) - corrected.geometry.attributes[name].getComponent(i, component)));
      }
    }
    return { restError, rightWeightError, calibrated: body.info.armCalibration.correctedVertices };
  });
  expect(result.calibrated).toBeGreaterThan(1000);
  expect(result.restError, 'Rebinding must preserve the actual authored mesh, including head and hands').toBeLessThan(0.00002);
  expect(result.rightWeightError, 'The right half of the original skin must remain untouched').toBe(0);
});
