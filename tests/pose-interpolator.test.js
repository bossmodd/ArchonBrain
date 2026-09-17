import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseInterpolator } from '../src/scene/PoseInterpolator.js';

test('display interpolation crosses the heading seam by the short arc and stops at the confirmed pose', () => {
  const start = { x: 0, z: 0, heading: Math.PI - .1 };
  const end = { x: 2, z: 4, heading: -Math.PI + .1 };
  const view = new PoseInterpolator(start);
  view.setTarget(end);
  const middle = { ...view.update(.05) };
  assert.equal(middle.x, 1); assert.equal(middle.z, 2);
  assert(Math.abs(Math.abs(middle.heading) - Math.PI) < 1e-10, 'Do not turn through zero across ±π');
  assert.deepEqual(view.update(10), end);
  assert.deepEqual(view.update(10), end, 'No extrapolation without a confirmed pose');
  assert.deepEqual(start, { x: 0, z: 0, heading: Math.PI - .1 });
});
