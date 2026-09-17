import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, OrthographicCamera } from 'three';
import { AbsorptionEffect } from '../src/archon/AbsorptionEffect.js';

test('rendered energy forms an irregular shared trunk that forks only near the actual palms', () => {
  const effect = new AbsorptionEffect();
  const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 30);
  camera.position.set(5, 8, 12); camera.lookAt(0, 2, 0); camera.updateMatrixWorld();
  const hands = [new Vector3(0.7, 3.4, 0.05), new Vector3(0.5, 3.15, 0.65)];
  const state = { source: new Vector3(3.5, 3.3, 1.2), flow: 1, charge: 1, intensity: 1, impulse: 0 };
  effect.update(2.4, state, hands, camera);
  const ring = (beam, fraction) => {
    const p = beam.geometry.attributes.position;
    const i = Math.round((p.count / 2 - 1) * fraction) * 2;
    const a = new Vector3().fromBufferAttribute(p, i), b = new Vector3().fromBufferAttribute(p, i + 1);
    return { center: a.clone().add(b).multiplyScalar(0.5), width: a.distanceTo(b) };
  };
  for (const u of [0.15, 0.3, 0.5]) {
    assert.ok(ring(effect.beams[0], u).center.distanceTo(ring(effect.beams[1], u).center) < 0.001,
      'The source needs one thick shared stream, not two separate smooth cables');
  }
  effect.beams.forEach((beam, i) => {
    assert.ok(ring(beam, 0).center.distanceTo(state.source) < 1e-5);
    assert.ok(ring(beam, 1).center.distanceTo(hands[i]) < 1e-5);
  });
  const widths = Array.from({ length: 19 }, (_, i) => ring(effect.beams[0], (i + 1) / 20).width);
  assert.ok(Math.max(...widths) / Math.min(...widths) > 1.8, 'The silhouette needs thick flares and narrow necks');
  const before = ring(effect.beams[0], 0.4).center;
  effect.update(2.55, state, hands, camera);
  assert.ok(before.distanceTo(ring(effect.beams[0], 0.4).center) > 0.025, 'The electrical bends must reorganize over time');
});
