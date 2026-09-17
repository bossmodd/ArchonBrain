import { NeuralModel } from './NeuralModel.js';
let model;
self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'init') {
      const base = new URL('/neural/flybrain/', self.location.origin);
      const { FlyBrain } = await import(/* @vite-ignore */ new URL('flybrain.js', base).href);
      const response = await fetch(new URL('data/groups783.json', base));
      if (!response.ok) throw new Error(`Neural annotations: HTTP ${response.status}`);
      const annotation = await response.json();
      let silenced = [];
      if (data.profile === 'olfactory') {
        const stabilization = await fetch(new URL('data/tame783.json', base));
        if (!stabilization.ok) throw new Error(`Neural stabilization: HTTP ${stabilization.status}`);
        silenced = (await stabilization.json()).silenced;
      }
      const brain = await FlyBrain.load({ graph: new URL('data/flywire783.fbg.gz', base), wasm: new URL('flybrain.wasm', base), recordCapacity: 1024 });
      model = new NeuralModel(brain, annotation, data.seed, { profile: data.profile, silenced });
      self.postMessage({ id, value: model.metadata });
    } else if (type === 'step') {
      if (!model) throw new Error('Neural model is not loaded');
      self.postMessage({ id, value: model.step(data.inputs) });
    } else throw new Error(`Unknown neural request: ${type}`);
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
