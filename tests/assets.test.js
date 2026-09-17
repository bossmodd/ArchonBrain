import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('provided rigged GLB is bundled intact with its mesh, skeleton and embedded image', () => {
  const path = new URL('../public/models/archon-rigged.glb', import.meta.url);
  assert.ok(existsSync(path), 'The actual supplied GLB must be present; no substitute body');
  const data = readFileSync(path);
  assert.equal(data.toString('utf8', 0, 4), 'glTF');
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  const gltf = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)));
  assert.ok(gltf.meshes.length > 0);
  assert.equal(gltf.skins[0].joints.length, 24);
  assert.ok(gltf.images.every(image => Number.isInteger(image.bufferView)));
  assert.ok(gltf.buffers.every(buffer => !buffer.uri), 'GLB must be self contained');
});
