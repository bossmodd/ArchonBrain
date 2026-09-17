import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { parseNeuronAtlas } from '../src/ui/NeuronAtlas.js';

test('the pinned FlyWire atlas preserves model index order and rejects incompatible coordinate data', async () => {
  const data = gunzipSync(await readFile(new URL('../public/neural/flybrain/data/pos783.bin.gz', import.meta.url)));
  const atlas = parseNeuronAtlas(data);
  assert.equal(atlas.count, 138639);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (const index of [0, 400, 138638]) {
    const point = atlas.point(index);
    assert.equal(point.x, view.getUint16(8 + index * 2, true) / 65535);
    assert.equal(point.y, view.getUint16(8 + atlas.count * 2 + index * 2, true) / 65535);
    assert.equal(point.classId, data[8 + atlas.count * 4 + index]);
  }
  assert.throws(() => atlas.point(-1), /index/);
  assert.throws(() => parseNeuronAtlas(data.subarray(0, 100)), /atlas/);
  const wrong = Uint8Array.from(data); wrong[4] = 1;
  assert.throws(() => parseNeuronAtlas(wrong), /atlas/);
});
