import test from 'node:test';
import assert from 'node:assert/strict';
import * as files from '../src/neural/ExperimentFile.js';

const compatibility = { model: 'model-hash', behavior: 'behavior-hash' };
const fixture = () => ({ format: 'neuro-archon-experiment', version: 1, name: 'Two sources', compatibility,
  seed: 7, profile: 'olfactory', mode: 'interactive', pose: { x: 1.25, z: -2, heading: .4 },
  sources: [{ id: 'source-2', label: 'B', position: { x: -3, y: 2.4, z: 4 }, strength: .65, remaining: .37 }],
  settings: { outputsEnabled: false, directional: false, assist: true } });

test('experiment JSON preserves partial energy, IDs, logical pose and explicit control gates', () => {
  assert.equal(typeof files.parseExperiment, 'function', 'A strict experiment parser is required');
  const original = fixture();
  const restored = files.parseExperiment(JSON.stringify(original), compatibility);
  assert.deepEqual(restored, original);
  restored.sources[0].remaining = 0;
  assert.equal(original.sources[0].remaining, .37);
});

test('invalid or incompatible initial conditions are rejected without coercion or silent defaults', () => {
  const cases = [
    ['version', d => { d.version = 2; }],
    ['format', d => { d.format = 'brain-state'; }],
    ['model', d => { d.compatibility = { ...compatibility, model: 'other' }; }],
    ['behavior', d => { d.compatibility = { ...compatibility, behavior: 'other' }; }],
    ['profile', d => { d.profile = 'unknown'; }],
    ['mode', d => { d.mode = 'autopilot'; }],
    ['profile/mode', d => { d.profile = 'lc11'; }],
    ['seed', d => { d.seed = -1; }],
    ['seed integer', d => { d.seed = 1.5; }],
    ['seed max', d => { d.seed = 4294967296; }],
    ['coordinate', d => { d.pose.x = Infinity; }],
    ['heading', d => { d.pose.heading = '0'; }],
    ['coordinate bound', d => { d.sources[0].position.x = 1e100; }],
    ['strength', d => { d.sources[0].strength = 1.01; }],
    ['remaining', d => { d.sources[0].remaining = -.01; }],
    ['remaining missing', d => { delete d.sources[0].remaining; }],
    ['duplicate ID', d => { d.sources.push({ ...d.sources[0], label: 'A' }); }],
    ['duplicate label', d => { d.sources.push({ ...d.sources[0], id: 'different' }); }],
    ['too many sources', d => { d.sources = [d.sources[0], d.sources[0], d.sources[0]]; }],
    ['ID', d => { d.sources[0].id = {}; }],
    ['unknown setting', d => { d.settings.seek = true; }],
    ['boolean', d => { d.settings.outputsEnabled = 'false'; }],
    ['missing gate', d => { delete d.settings.directional; }],
    ['remote URL', d => { d.modelUrl = 'https://example.com/model.js'; }],
    ['name', d => { d.name = ''; }],
  ];
  for (const [name, change] of cases) {
    const data = fixture(); change(data);
    assert.throws(() => files.parseExperiment(JSON.stringify(data), compatibility), undefined, name);
  }
  for (const text of ['{', 'null', '[]', ' '.repeat(65537)]) assert.throws(() => files.parseExperiment(text, compatibility));
  for (const sources of [[], fixture().sources]) {
    const data = { ...fixture(), sources, seed: 0 };
    assert.deepEqual(files.parseExperiment(JSON.stringify(data), compatibility), data);
  }
});
