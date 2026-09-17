import test from 'node:test';
import assert from 'node:assert/strict';
import { NeuralWorld } from '../src/neural/NeuralWorld.js';

test('pose, source position and remaining signal feed bounded lateral vision and pre-absorption contact', () => {
  const world = new NeuralWorld();
  assert.deepEqual(world.sense().inputs, { visualLeft: 0, visualRight: 0, contactSugar: 0 });
  world.setSources([{ id: 'one', position: { x: 2, y: 3, z: 2 }, strength: 1, remaining: 1 }]);
  const left = world.sense();
  assert(left.inputs.visualLeft > left.inputs.visualRight);
  assert.equal(left.inputs.contactSugar, 0);
  world.pose.heading = Math.PI / 2;
  assert(world.sense().inputs.visualRight > world.sense().inputs.visualLeft);
  world.pose = { x: 1, z: 1, heading: 0 };
  const contact = world.sense();
  assert.equal(contact.inputs.contactSugar, 150, 'Contact must exist before absorption starts');
  world.advance({ speed: 0.5, yaw: 0, phase: 'absorb', targetId: 'one', feed: 1 }, 0.1);
  const next = world.sense();
  assert(next.target.distance < contact.target.distance);
  assert(next.inputs.contactSugar < contact.inputs.contactSugar);
  assert(world.sources[0].remaining < 1);
  world.setSources([]);
  assert.equal(world.sense().target, null);
  assert.throws(() => world.setSources([{ id: 'bad', position: { x: NaN, y: 0, z: 0 } }]), /finite/);
});

test('real network drives measured locomotion and contact absorption with feedback; ablation blocks it', async () => {
  const { readFile } = await import('node:fs/promises');
  const { FlyBrain } = await import('../public/neural/flybrain/flybrain.js');
  const { NeuralModel } = await import('../src/neural/NeuralModel.js');
  const { NeuralController } = await import('../src/neural/NeuralController.js');
  const base = new URL('../public/neural/flybrain/', import.meta.url);
  const brain = await FlyBrain.load({ graph: new URL('data/flywire783.fbg.gz', base), recordCapacity: 1024 });
  const model = new NeuralModel(brain, JSON.parse(await readFile(new URL('data/groups783.json', base))), 1);
  const world = new NeuralWorld();
  world.setSources([{ id: 'one', position: { x: -1.12665, y: 2.4, z: 2.06233 }, strength: 1 }]);
  const controller = new NeuralController();
  const history = [];
  for (let i = 0; i < 150; i++) {
    const sense = world.sense();
    const response = model.step(sense.inputs);
    const command = controller.step(response.outputs, sense, 0.1);
    world.advance(command, 0.1);
    history.push({ sense, response, command, next: world.sense() });
  }
  assert(history.some(h => h.command.speed < 0 && h.response.outputs.backward > 0), 'Observed MDN response drives retreat, not forced approach');
  assert(history.some(h => Math.abs(h.command.yaw) > 0 && h.response.outputs.turnLeft !== h.response.outputs.turnRight));
  // The model did not approach. Source relocation is an explicit environment intervention.
  world.setSources([{ id: 'one', position: { x: world.pose.x, y: 3, z: world.pose.z + 2 }, strength: 1 }]);
  for (let i = 0; i < 60; i++) {
    const sense = world.sense(), response = model.step(sense.inputs);
    const command = controller.step(response.outputs, sense, 0.1);
    world.advance(command, 0.1);
    history.push({ sense, response, command, next: world.sense() });
  }
  assert(history.some(h => h.sense.inputs.contactSugar > 0 && h.command.phase === 'prepare'));
  assert(history.some(h => h.command.phase === 'absorb' && h.next.inputs.contactSugar < h.sense.inputs.contactSugar));
  assert(world.sources[0].remaining < 1);
  const stopped = controller.step(model.step(world.sense().inputs).outputs, world.sense(), 0.1, { outputsEnabled: false, assist: true });
  assert.equal(stopped.speed, 0);
  assert.equal(stopped.yaw, 0);
  assert.equal(stopped.assistYaw, 0);
  assert.equal(stopped.phase, 'release');
  assert.equal(stopped.reason, 'outputs-blocked');
  let blocked = stopped;
  for (let i = 0; i < 20; i++) blocked = controller.step(model.step(world.sense().inputs).outputs, world.sense(), 0.1, { outputsEnabled: false });
  assert.equal(blocked.phase, 'idle', 'Output ablation must finish recovery instead of repeatedly requesting release');
  world.setSources([]);
  assert.equal(controller.step(model.step({}).outputs, world.sense(), 0.1).reason, 'no-target');
});

test('contact requires three-dimensional proximity, not only floor projection', () => {
  const world = new NeuralWorld();
  world.setSources([{ id: 'above', position: { x: 0, y: 8, z: 0 }, strength: 1 }]);
  assert.equal(world.sense().inputs.contactSugar, 0);
  world.advance({ speed: 0, yaw: 0, phase: 'absorb', targetId: 'above', feed: 1 }, 0.1);
  assert.equal(world.sources[0].remaining, 1);
});

test('spatial signal sensors mirror and rotate with the body without giving remote sugar input', () => {
  const world = new NeuralWorld({ profile: 'olfactory' });
  const source = { id: 'one', position: { x: 3.4641, y: 2.4, z: 2 }, strength: 1 };
  world.setSources([source]);
  const left = world.sense();
  assert(left.inputs.signalLeft > left.inputs.signalRight);
  assert(left.inputs.signalLeft <= 48 && left.inputs.signalRight >= 0);
  assert.equal(left.inputs.contactSugar, 0);
  world.setSources([{ ...source, position: { ...source.position, x: -source.position.x } }]);
  const right = world.sense();
  assert.equal(right.inputs.signalLeft, left.inputs.signalRight);
  assert.equal(right.inputs.signalRight, left.inputs.signalLeft);
  world.pose.heading = Math.PI;
  assert(world.sense().inputs.signalLeft > world.sense().inputs.signalRight);
  const directional = world.sense().inputs;
  world.directional = false;
  const erased = world.sense().inputs;
  assert.equal(erased.signalLeft, erased.signalRight);
  assert(Math.abs(erased.signalLeft + erased.signalRight - directional.signalLeft - directional.signalRight) < 1e-10, 'Direction removal preserves the total delivered rate');
  world.setSources([{ ...source, remaining: 0.1 }]);
  assert(world.sense().inputs.signalLeft < erased.signalLeft);
  world.setSources([]);
  assert.deepEqual(world.sense().inputs, { signalLeft: 0, signalRight: 0, contactSugar: 0 });
});
