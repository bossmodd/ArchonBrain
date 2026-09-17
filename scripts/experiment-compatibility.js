import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const model = ['flybrain.js', 'flybrain.wasm', 'data/flywire783.fbg.gz', 'data/groups783.json', 'data/tame783.json']
  .map(path => `public/neural/flybrain/${path}`);
const behavior = ['NeuralModel.js', 'NeuralWorld.js', 'NeuralController.js', 'NeuralSession.js', 'brain.worker.js', 'ExperimentFile.js']
  .map(path => `src/neural/${path}`);
const absolute = path => fileURLToPath(new URL(`../${path}`, import.meta.url));
const fingerprint = paths => {
  const hash = createHash('sha256');
  for (const path of paths) hash.update(path).update('\0').update(readFileSync(absolute(path))).update('\0');
  return hash.digest('hex');
};

// Hash the actual bundled data/runtime and adapter code, not an editable file URL.
export function experimentCompatibility() {
  const id = '\0virtual:experiment-compatibility';
  return {
    name: 'experiment-compatibility',
    resolveId(source) { if (source === 'virtual:experiment-compatibility') return id; },
    load(source) {
      if (source !== id) return;
      for (const path of [...model, ...behavior]) this.addWatchFile(absolute(path));
      return `export default ${JSON.stringify({ model: `flywire-v783:${fingerprint(model)}`, behavior: fingerprint(behavior) })};`;
    },
    handleHotUpdate(ctx) {
      if (![...model, ...behavior].some(path => absolute(path) === ctx.file)) return;
      const module = ctx.server.moduleGraph.getModuleById(id);
      if (module) { ctx.server.moduleGraph.invalidateModule(module); return [...ctx.modules, module]; }
    },
  };
}
