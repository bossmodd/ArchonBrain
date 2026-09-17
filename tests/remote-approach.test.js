import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FlyBrain } from '../public/neural/flybrain/flybrain.js';
import { NeuralModel } from '../src/neural/NeuralModel.js';
import { NeuralWorld } from '../src/neural/NeuralWorld.js';
import { NeuralController } from '../src/neural/NeuralController.js';

test('real unassisted output reaches predeclared left and rear sources and enters existing absorption', async () => {
  const brain = await FlyBrain.load({ graph: new URL('../public/neural/flybrain/data/flywire783.fbg.gz', import.meta.url), recordCapacity: 1024 });
  const annotation = JSON.parse(fs.readFileSync('public/neural/flybrain/data/groups783.json'));
  const silenced = JSON.parse(fs.readFileSync('third_party/hae/ningen/web/data/tame783.json')).silenced;
  const trials = JSON.parse(fs.readFileSync('docs/neural/approach-trials.json')).filter(t => t.split === 'development' && ['left', 'rear'].includes(t.name));
  for (const trial of trials) {
    const model = new NeuralModel(brain, annotation, trial.seed, { profile: 'olfactory', silenced });
    const world = new NeuralWorld({ profile: 'olfactory' }), controller = new NeuralController({ profile: 'olfactory' });
    world.setSources([trial.source]); world.pose = { ...trial.pose };
    let absorbed = 0;
    for (let i = 0; i < 300 && !absorbed; i++) {
      const sense = world.sense();
      if (sense.target.distance > 2.3) assert.equal(sense.inputs.contactSugar, 0);
      const response = model.step(sense.inputs), command = controller.step(response.outputs, sense, .1);
      assert.equal(command.assistYaw, 0);
      absorbed += world.advance(command, .1).absorbed;
    }
    assert(absorbed > 0, `${trial.name}: no absorption within 30 simulated seconds; distance ${world.sense().target.distance}`);
    assert.deepEqual(world.sources[0].position, trial.source.position);
  }
});
