// Versioned initial conditions only; neural state is never serialized.
export const MAX_EXPERIMENT_BYTES = 65536;
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
function fields(value, required, optional = []) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Expected an object');
  requireValue(required.every(key => Object.hasOwn(value, key)), `Required fields: ${required.join(', ')}`);
  requireValue(Object.keys(value).every(key => [...required, ...optional].includes(key)), 'Unsupported field or setting');
}
function textValue(value, name) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= 80
    && Array.from(value).every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127), `${name} must be 1–80 readable characters`);
}
function position(value, keys) {
  fields(value, keys);
  requireValue(keys.every(key => Number.isFinite(value[key]) && Math.abs(value[key]) <= 1e6), 'Coordinates and heading must be finite and within ±1000000');
}
export function parseExperiment(text, compatibility) {
  requireValue(typeof text === 'string' && new TextEncoder().encode(text).length <= MAX_EXPERIMENT_BYTES, 'Experiment file must be at most 64 KiB');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Invalid experiment JSON'); }
  fields(data, ['format', 'version', 'name', 'compatibility', 'seed', 'profile', 'mode', 'pose', 'sources', 'settings']);
  requireValue(data.format === 'neuro-archon-experiment' && data.version === 1, 'Unsupported experiment format or version');
  textValue(data.name, 'Experiment name');
  fields(data.compatibility, ['model', 'behavior']);
  requireValue(data.compatibility.model === compatibility.model && data.compatibility.behavior === compatibility.behavior, 'Incompatible model or behavior settings. This file cannot be applied to this build.');
  requireValue(Number.isInteger(data.seed) && data.seed >= 0 && data.seed <= 0xffffffff, 'Seed must be a uint32');
  requireValue(['lc11', 'olfactory'].includes(data.profile), 'Unsupported sensory profile');
  requireValue(['fixed', 'interactive'].includes(data.mode) && (data.mode !== 'interactive' || data.profile === 'olfactory'), 'Unsupported profile and mode combination');
  position(data.pose, ['x', 'z', 'heading']);
  requireValue(Array.isArray(data.sources) && data.sources.length <= 2, 'Expected zero, one or two sources');
  const ids = new Set(), labels = new Set();
  for (const source of data.sources) {
    fields(source, ['id', 'position', 'strength', 'remaining'], ['label']);
    textValue(source.id, 'Source ID');
    requireValue(!ids.has(source.id), 'Source IDs must be unique'); ids.add(source.id);
    if (data.mode === 'interactive' || source.label !== undefined) {
      requireValue(['A', 'B'].includes(source.label) && !labels.has(source.label), 'Source labels must be distinct A/B');
      labels.add(source.label);
    }
    position(source.position, ['x', 'y', 'z']);
    requireValue(['strength', 'remaining'].every(key => Number.isFinite(source[key]) && source[key] >= 0 && source[key] <= 1), 'Strength and remaining must be within 0–1');
  }
  fields(data.settings, ['outputsEnabled', 'directional', 'assist']);
  requireValue(Object.values(data.settings).every(value => typeof value === 'boolean'), 'Control settings must be booleans');
  return data;
}
