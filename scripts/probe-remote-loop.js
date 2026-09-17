import fs from 'node:fs';
import { FlyBrain } from '../public/neural/flybrain/flybrain.js';
import { NeuralModel } from '../src/neural/NeuralModel.js';
import { NeuralWorld, SIGNAL_CONFIG } from '../src/neural/NeuralWorld.js';
import { NeuralController, REMOTE_CONTROL_CONFIG } from '../src/neural/NeuralController.js';
const brain = await FlyBrain.load({ graph: new URL('../public/neural/flybrain/data/flywire783.fbg.gz', import.meta.url), recordCapacity: 1024 });
const annotation = JSON.parse(fs.readFileSync('public/neural/flybrain/data/groups783.json'));
const silenced = JSON.parse(fs.readFileSync('third_party/hae/ningen/web/data/tame783.json')).silenced;
const trials = JSON.parse(fs.readFileSync('docs/neural/approach-trials.json')).filter(t => process.argv.includes('--all') || t.split === 'development');
const results = [];
for (const trial of trials) {
  const model = new NeuralModel(brain, annotation, trial.seed, { profile: 'olfactory', silenced });
  const world = new NeuralWorld({ profile: 'olfactory', directional: !process.argv.includes('--erase') });
  const controller = new NeuralController({ profile: 'olfactory' });
  world.setSources([trial.source]); world.pose = { ...trial.pose };
  const history = [];
  for (let i = 0; i < trial.timeoutSeconds * 10; i++) {
    const sense = world.sense(), response = model.step(sense.inputs);
    const command = controller.step(response.outputs, sense, .1, { assist: false });
    const result = world.advance(command, .1);
    history.push({ sense, response, command, result, next: world.sense() });
  }
  const summary = { name: trial.name, seed: trial.seed, heading: trial.pose.heading, initial: history[0].sense.target.distance,
    final: world.sense().target.distance, min: Math.min(...history.map(r => r.next.target.distance)),
    contact: history.find(r => r.next.inputs.contactSugar > 0)?.next.time ?? null,
    absorption: history.find(r => r.result.absorbed > 0)?.next.time ?? null, remaining: world.sources[0].remaining,
    initialInputs: history[0].response.inputs, pose: world.pose,
    mean: Object.fromEntries(Object.keys(history[0].response.outputs).map(k => [k, history.reduce((sum, r) => sum + r.response.outputs[k], 0) / history.length])) };
  results.push({ trial, summary, history }); console.log(JSON.stringify(summary));
}
fs.writeFileSync(`docs/neural/${process.env.PROBE_NAME || 'remote-development'}.json`, JSON.stringify({ signal: SIGNAL_CONFIG, control: REMOTE_CONTROL_CONFIG, results }));
