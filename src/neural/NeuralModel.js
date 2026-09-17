// Group names and laterality are from hae's groups783.json/build_groups.py.
// These are readouts, not claims that the fly has an Archon absorption behavior.
export const STEP_MS = 100;
export const INPUTS = Object.freeze({
  visualLeft: { groups: ['vpn:LC11:L'], maxHz: 120 },
  visualRight: { groups: ['vpn:LC11:R'], maxHz: 120 },
  contactSugar: { groups: ['shiu:sugar', 'shiu:sugar_left'], maxHz: 150 },
});
// Exact ORN combination and 48 Hz cap from the pinned hae ningen odMeat input.
const signalGroups = side => ['DP1m', 'DC4', 'VL2a', 'VM7d', 'VM7v'].map(type => `olfactory:ORN_${type}:${side}`);
export const SIGNAL_INPUTS = Object.freeze({
  signalLeft: { groups: signalGroups('L'), maxHz: 48 },
  signalRight: { groups: signalGroups('R'), maxHz: 48 },
  contactSugar: INPUTS.contactSugar,
});
const goGroups = side => ['DNa03', 'DNa13', 'DNa15', 'DNa16', 'DNp32'].map(type => `dn:${type}:${side}`);
export const OUTPUTS = Object.freeze({
  turnLeft: ['dn:DNa02:L'], turnRight: ['dn:DNa02:R'],
  forward: ['dn:DNp09:L', 'dn:DNp09:R'],
  backward: ['dn:MDN:L', 'dn:MDN:R'],
  feedLeft: ['motor:CB0701:L'], feedRight: ['motor:CB0701:R'],
  goLeft: goGroups('L'), goRight: goGroups('R'),
});
export class NeuralModel {
  constructor(brain, annotation, seed = 1, { profile = 'lc11', silenced = [] } = {}) {
    if (brain.n !== 138639 || brain.nnz !== 15091983 || annotation.n !== brain.n) throw new Error('Expected complete FlyWire v783 graph and annotations');
    if (!['lc11', 'olfactory'].includes(profile)) throw new Error('Unknown sensory profile');
    if (profile === 'olfactory' && (silenced.length !== 161 || silenced.some(i => !Number.isInteger(i) || i < 0 || i >= brain.n))) throw new Error('Olfactory profile requires the source 161-neuron stabilization list');
    this.brain = brain;
    this.inputDefinitions = profile === 'olfactory' ? SIGNAL_INPUTS : INPUTS;
    const pick = keys => [...new Set(keys.flatMap(key => {
      const indices = annotation.groups[key]?.idx;
      if (!indices?.length || indices.some(i => !Number.isInteger(i) || i < 0 || i >= brain.n)) throw new Error(`Missing or invalid neural group: ${key}`);
      return indices;
    }))];
    this.inputs = Object.fromEntries(Object.entries(this.inputDefinitions).map(([k, v]) => [k, pick(v.groups)]));
    this.outputs = Object.fromEntries(Object.entries(OUTPUTS).map(([k, v]) => [k, pick(v)]));
    const describe = map => Object.fromEntries(Object.entries(map).map(([k, idx]) => [k, { indices: idx, ids: idx.map(i => brain.id(i).toString()) }]));
    this.metadata = { version: '3625e01b09e5960a54722143ea03e67c845b88bb', dataset: annotation.dataset,
      neurons: brain.n, connections: brain.nnz, params: brain.params, seed,
      profile, plasticity: false, silencedNeurons: profile === 'olfactory' ? silenced.length : 0,
      inputs: describe(this.inputs), outputs: describe(this.outputs) };
    brain.clearStimuli();
    if (silenced.length) brain.silence(silenced, profile === 'olfactory', { byIndex: true });
    brain.reset(seed);
  }
  step(requested) {
    const inputs = {};
    for (const [key, { maxHz }] of Object.entries(this.inputDefinitions)) {
      const value = requested[key] ?? 0;
      if (!Number.isFinite(value)) throw new Error(`Input ${key} must be finite`);
      inputs[key] = Math.max(0, Math.min(maxHz, value));
    }
    for (const [key, indices] of Object.entries(this.inputs)) this.brain.stimulate(indices, inputs[key], { byIndex: true });
    const counts = this.brain.counts();
    const before = Object.fromEntries(Object.entries(this.outputs).map(([k, indices]) => [k, indices.map(i => counts[i])]));
    const start = performance.now();
    const result = this.brain.run(STEP_MS, { events: false });
    const raw = Object.fromEntries(Object.entries(this.outputs).map(([k, indices]) => [k, indices.map((i, j) => (counts[i] - before[k][j]) / (STEP_MS / 1000))]));
    const outputs = Object.fromEntries(Object.entries(raw).map(([k, rates]) => [k, rates.reduce((sum, rate) => sum + rate, 0) / rates.length]));
    return { inputs, raw, outputs, ms: STEP_MS, modelTimeMs: this.brain.time, spikes: result.spikes, wallMs: performance.now() - start };
  }
}
