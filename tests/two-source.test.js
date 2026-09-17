import test from 'node:test';
import assert from 'node:assert/strict';
import { NeuralWorld } from '../src/neural/NeuralWorld.js';

const source = (id, x, z, strength = 1, remaining = 1) => ({ id, position: { x, y: 2.4, z }, strength, remaining });
test('both sources contribute to the combined signal independently of array order or display name', () => {
  const world = new NeuralWorld({ profile: 'olfactory' });
  const a = source('second-created', 3.4641, 2), b = source('first-created', -3.4641, 2);
  world.setSources([a, b]);
  const together = world.sense();
  assert.equal(together.contributions.length, 2);
  assert.equal(together.inputs.signalLeft, together.inputs.signalRight);
  assert.equal(together.inputs.contactSugar, 0);
  for (const side of ['left', 'right']) assert.equal(together.concentrations[side], together.contributions.reduce((sum, s) => sum + s.concentrations[side], 0));
  world.setSources([b, a]);
  assert.deepEqual(world.sense().inputs, together.inputs);
  world.setSources([a]);
  assert(world.sense().concentrations.left < together.concentrations.left);
  world.setSources([a, { ...b, strength: 0.3 }]);
  assert(world.sense().inputs.signalLeft > world.sense().inputs.signalRight);
});

test('a new contact requires its own MN9 hold time and an exact contact tie is reported explicitly', async () => {
  const fs = await import('node:fs');
  const { FlyBrain } = await import('../public/neural/flybrain/flybrain.js');
  const { NeuralModel } = await import('../src/neural/NeuralModel.js');
  const { NeuralController } = await import('../src/neural/NeuralController.js');
  const brain = await FlyBrain.load({ graph: new URL('../public/neural/flybrain/data/flywire783.fbg.gz', import.meta.url), recordCapacity: 1024 });
  const model = new NeuralModel(brain, JSON.parse(fs.readFileSync('public/neural/flybrain/data/groups783.json')), 1);
  const world = new NeuralWorld(), controller = new NeuralController();
  world.setSources([source('tie-a', 1, 1), source('tie-b', -1, 1)]);
  assert.equal(controller.step(model.step({}).outputs, world.sense(), .1).reason, 'contact-tie');
  world.setSources([source('a', 0, 2)]);
  controller.step(model.step({ contactSugar: 150 }).outputs, world.sense(), .1);
  world.setSources([source('b', 0, 2)]);
  const changed = controller.step(model.step({ contactSugar: 150 }).outputs, world.sense(), .1);
  assert(changed.feedHz >= 12);
  assert.equal(changed.phase, 'idle', 'MN9 time accumulated for a different contact must not start this one');
  const maintained = controller.step(model.step({ contactSugar: 150 }).outputs, world.sense(), .1);
  assert.equal(maintained.phase, 'prepare');
  assert.equal(maintained.targetId, 'b');
});

test('contact binding prefers a reachable source and keeps its ID until invalid, with no A/B tie priority', () => {
  const world = new NeuralWorld({ profile: 'olfactory' });
  const near = source('near', 0, 2, 0.3), far = source('far', 4, 0);
  world.setSources([far, near]);
  assert.equal(world.sense().target.id, 'near', 'A stronger remote source must not suppress valid contact');
  assert.equal(world.sense().inputs.contactSugar, 45);
  const other = source('other', 1, 0);
  world.setSources([near, other]);
  assert.equal(world.sense('near').target.id, 'near');
  assert.equal(world.sense('near').inputs.contactSugar, 45);
  assert.equal(world.sense('near').contributions.length, 2);
  world.setSources([{ ...near, position: { x: 8, y: 2.4, z: 0 } }, other]);
  assert.equal(world.sense('near').target.id, 'near');
  assert.equal(world.sense('near').inputs.contactSugar, 0, 'Never substitute the other contact during an active binding');
  world.setSources([other]);
  assert.equal(world.sense('near').target, null);
  for (const pair of [[source('A', 1, 0), source('B', -1, 0)], [source('B', -1, 0), source('A', 1, 0)]]) {
    world.setSources(pair);
    assert.equal(world.sense().target, null);
    assert.equal(world.sense().targetReason, 'contact-tie');
  }
});
