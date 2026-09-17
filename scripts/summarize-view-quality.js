import fs from 'node:fs';
import assert from 'node:assert/strict';
const r = JSON.parse(fs.readFileSync('docs/neural/view-quality-continuous.json'));
assert(!r.failure, r.failure); assert(r.wallSeconds >= 300);
const stats = values => {
  const a = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = q => a[Math.min(a.length - 1, Math.floor(q * a.length))];
  return { n: a.length, min: a[0], p50: at(.5), p95: at(.95), max: a.at(-1), mean: a.reduce((a, b) => a + b, 0) / a.length };
};
const active = r.samples.filter(s => ['fresh', 'computing', 'delayed', 'waiting'].includes(s.runtime.outputState) && s.runtime.activeSeconds > 5);
const all = [...r.samples, ...r.actions.flatMap(a => [a.before, a.after]), ...Object.values(r.tabTransition)];
const rows = [...new Map(all.flatMap(s => s.rows).map(row => [row.seq, row])).values()];
const edits = new Map(), paused = new Set();
const rank = { queued: 0, submitted: 1, superseded: 2, discarded: 3, applied: 4 };
for (const s of all) {
  for (const e of s.edits) {
    const previous = edits.get(e.eventAt);
    if (!previous || rank[e.state] >= rank[previous.state]) edits.set(e.eventAt, e);
    if (s.paused && e.state === 'queued') paused.add(e.eventAt);
  }
}
const applied = [...edits.values()].filter(e => e.state === 'applied');
const normal = applied.filter(e => !paused.has(e.eventAt)), pausedEdits = applied.filter(e => paused.has(e.eventAt));
const trend = (from, to) => {
  const samples = active.filter(s => s.elapsed >= from && s.elapsed < to);
  return { fps: stats(samples.map(s => s.runtime.renderFps)), rate: stats(samples.map(s => s.runtime.realtimeFactor)),
    modelMs: stats(samples.flatMap(s => s.rows.map(row => row.modelWallMs))), roundTripMs: stats(samples.flatMap(s => s.rows.map(row => row.roundTripMs))) };
};
const probe = r.motionProbe, seconds = (probe.at(-1).now - probe[0].now) / 1000;
const changed = key => probe.slice(1).filter((p, i) => ['x', 'z', 'heading'].some(k => p[key][k] !== probe[i][key][k])).length / seconds;
const angularJump = key => Math.max(...probe.slice(1).map((p, i) => {
  const d = p[key].heading - probe[i][key].heading; return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * 180 / Math.PI;
}));
const summary = { environment: r.environment, wallSeconds: r.wallSeconds, actionCount: r.actions.length, errors: r.errors,
  fps: stats(active.map(s => s.runtime.renderFps)), realtimeFactor: stats(active.map(s => s.runtime.realtimeFactor)),
  modelWallMs: stats(rows.map(row => row.modelWallMs)), roundTripMs: stats(rows.map(row => row.roundTripMs)),
  normalEdits: { n: normal.length, inputMs: stats(normal.map(e => e.inputLatencyMs)), appliedMs: stats(normal.map(e => e.applyLatencyMs)) },
  pausedEdits, editStates: [...edits.values()].reduce((counts, e) => { counts[e.state] = (counts[e.state] || 0) + 1; return counts; }, {}),
  firstMinute: trend(10, 60), lastMinute: trend(240, 301),
  motion: { renderFps: (probe.length - 1) / seconds, displayedPoseHz: changed('display'), actualWorldPoseHz: changed('world'),
    maxDisplayTurnDegrees: angularJump('display'), maxWorldTurnDegrees: angularJump('world') },
  tab: { hiddenSimulationDelta: r.tabTransition.hidden.simulationTime - r.tabTransition.before.simulationTime,
    returnSimulationDelta: r.tabTransition.returned.simulationTime - r.tabTransition.hidden.simulationTime,
    hiddenSeconds: r.tabTransition.returned.runtime.hiddenSeconds },
  maxHandAttachmentError: Math.max(...all.map(s => s.handAttachmentError)), final: r.samples.at(-1).runtime };
fs.writeFileSync('docs/neural/view-quality-continuous-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
