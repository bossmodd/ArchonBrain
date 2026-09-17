import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FlyBrain } from '../public/neural/flybrain/flybrain.js';
import { NeuralModel } from '../src/neural/NeuralModel.js';

test('real v783 inputs produce measured motor spikes in consecutive 100 ms windows', async () => {
  const base = new URL('../public/neural/flybrain/', import.meta.url);
  const groups = JSON.parse(await readFile(new URL('data/groups783.json', base)));
  const brain = await FlyBrain.load({ graph: new URL('data/flywire783.fbg.gz', base), recordCapacity: 1024 });
  const model = new NeuralModel(brain, groups, 1);
  assert.equal(model.metadata.neurons, 138639);
  assert.equal(model.metadata.connections, 15091983);
  assert.deepEqual(model.metadata.outputs.turnLeft.ids, ['720575940629327659']);
  assert.deepEqual(model.metadata.outputs.feedRight.ids, ['720575940660219265']);
  const quiet = model.step({});
  assert.equal(quiet.modelTimeMs, 100);
  assert.equal(quiet.spikes, 0);
  const trials = Array.from({ length: 10 }, () => model.step({ contactSugar: 150 }));
  assert(trials.some(x => x.outputs.feedLeft > 0 && x.outputs.feedRight > 0));
  assert.equal(trials.at(-1).modelTimeMs, 1100);
  assert.equal(trials[0].inputs.contactSugar, 150);
  assert.equal(model.step({ contactSugar: 999 }).inputs.contactSugar, 150);
  assert.throws(() => model.step({ visualLeft: NaN }), /finite/);
  assert.throws(() => new NeuralModel(brain, { ...groups, groups: {} }), /Missing/);
});

test('measured ORN locomotor output moves the body without consulting remote target direction', async () => {
  const { NeuralController } = await import('../src/neural/NeuralController.js');
  const base = new URL('../public/neural/flybrain/', import.meta.url);
  const annotation = JSON.parse(await readFile(new URL('data/groups783.json', base)));
  const silenced = JSON.parse(await readFile(new URL('../third_party/hae/ningen/web/data/tame783.json', import.meta.url))).silenced;
  const brain = await FlyBrain.load({ graph: new URL('data/flywire783.fbg.gz', base), recordCapacity: 1024 });
  const model = new NeuralModel(brain, annotation, 1, { profile: 'olfactory', silenced });
  const left = new NeuralController({ profile: 'olfactory' });
  const right = new NeuralController({ profile: 'olfactory' });
  const commands = [];
  for (let i = 0; i < 10; i++) {
    const { outputs } = model.step({ signalLeft: 20 });
    const target = { id: 'fixed', distance: 4, emission: 1, bearing: 1 };
    const a = left.step(outputs, { target }, 0.1);
    const b = right.step(outputs, { target: { ...target, bearing: -1, position: { x: -4, y: 2.4, z: 0 } } }, 0.1);
    assert.equal(a.speed, b.speed);
    assert.equal(a.yaw, b.yaw, 'Remote bearing must not enter unassisted motor decoding');
    assert.equal(a.assistYaw, 0);
    commands.push(a);
  }
  assert(commands.some(command => command.speed > 0 && command.yaw > 0));
});

test('stabilized source ORNs retain measured side-specific steering, locomotor output and sugar response', async () => {
  const base = new URL('../public/neural/flybrain/', import.meta.url);
  const groups = JSON.parse(await readFile(new URL('data/groups783.json', base)));
  const silenced = JSON.parse(await readFile(new URL('../third_party/hae/ningen/web/data/tame783.json', import.meta.url))).silenced;
  const brain = await FlyBrain.load({ graph: new URL('data/flywire783.fbg.gz', base), recordCapacity: 1024 });
  const probes = [];
  for (const side of ['Left', 'Right']) {
    const model = new NeuralModel(brain, groups, 1, { profile: 'olfactory', silenced });
    assert.equal(model.metadata.silencedNeurons, 161);
    assert.equal(model.metadata.plasticity, false);
    const rows = Array.from({ length: 10 }, () => model.step({ [`signal${side}`]: 20 }));
    const mean = key => rows.reduce((sum, row) => sum + row.outputs[key], 0) / rows.length;
    assert(mean(`turn${side}`) > mean(`turn${side === 'Left' ? 'Right' : 'Left'}`));
    assert(mean(`go${side}`) > 0);
    assert(rows.every(row => row.spikes < 10000));
    for (let i = 0; i < 10; i++) model.step({});
    assert.equal(model.step({}).spikes, 0, 'No self-sustained activity after input ends');
    const contact = Array.from({ length: 10 }, () => model.step({ contactSugar: 150 }));
    assert(contact.some(row => row.outputs.feedLeft > 12 && row.outputs.feedRight > 12));
    probes.push(mean(`turn${side}`));
  }
  assert(probes.every(hz => hz > 0));
});
