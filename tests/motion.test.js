import test from 'node:test';
import assert from 'node:assert/strict';
import { idleMotion, satellitePosition } from '../src/archon/motion.js';

test('idle motion breathes and hovers continuously within calm bounds', () => {
  const samples = Array.from({ length: 601 }, (_, index) => idleMotion(index / 10, 0.65));
  assert.ok(samples.some(sample => sample.pulse > 1.01), 'Shell must breathe');
  assert.ok(samples.some(sample => sample.hover > 0.02), 'Body must hover');
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index];
    assert.ok(Math.abs(sample.hover) <= 0.061);
    assert.ok(Math.abs(sample.pulse - 1) <= 0.021);
    if (index) assert.ok(Math.abs(sample.pulse - samples[index - 1].pulse) < 0.005);
  }
  assert.equal(idleMotion(10, 0).pulse, 1, 'Zero speed freezes shell breathing');
});

test('three satellites follow independent continuous orbits outside the breathing shell', () => {
  for (const shellRadius of [1.2, 1.85, 2.6]) {
    for (let time = 0; time <= 120; time += 0.25) {
      const positions = [0, 1, 2].map(index => satellitePosition(time, index, shellRadius, 6.3, 0.3));
      for (const [index, p] of positions.entries()) {
        assert.ok(Math.hypot(p.x, p.y, p.z) > shellRadius * 1.02 + 0.15, 'Satellite must clear the shell');
        const next = satellitePosition(time + 0.001, index, shellRadius, 6.3, 0.3);
        assert.ok(Math.hypot(p.x - next.x, p.y - next.y, p.z - next.z) < 0.01);
      }
      assert.notDeepEqual(positions[0], positions[1]);
      assert.notDeepEqual(positions[1], positions[2]);
    }
  }
  assert.deepEqual(satellitePosition(0, 0, 1.85, 0, 0.3), satellitePosition(20, 0, 1.85, 0, 0.3));
});

test('top-down satellite paths have distinct projected axes rather than nested copies of one orbit', () => {
  const projections = [0, 1, 2].map(index => {
    const period = Math.PI * 2 / (6.3 * [0.32, 0.235, 0.278][index]);
    const points = Array.from({ length: 360 }, (_, i) => satellitePosition(i * period / 360, index, 1.85, 6.3, 0.42));
    const x = points.reduce((s, p) => s + p.x, 0) / points.length;
    const z = points.reduce((s, p) => s + p.z, 0) / points.length;
    const xx = points.reduce((s, p) => s + (p.x - x) ** 2, 0) / points.length;
    const zz = points.reduce((s, p) => s + (p.z - z) ** 2, 0) / points.length;
    const xz = points.reduce((s, p) => s + (p.x - x) * (p.z - z), 0) / points.length;
    const spread = Math.hypot(xx - zz, 2 * xz);
    return { angle: Math.atan2(2 * xz, xx - zz) / 2, aspect: Math.sqrt((xx + zz - spread) / (xx + zz + spread)) };
  });
  const axisDifference = Math.acos(Math.abs(Math.cos(projections[1].angle - projections[2].angle)));
  assert.ok(axisDifference > 0.6, 'The two steep paths must cross at clearly different angles from above');
  assert.ok(Math.max(...projections.map(p => p.aspect)) > 0.8, 'Keep one broad path around the rim');
  assert.ok(Math.min(...projections.map(p => p.aspect)) < 0.5, 'At least one path must wrap over and under the shell');
});
