import { Group } from 'three';
import { EnergyKnot } from '../archon/EnergyKnot.js';
import { NeuralWorld, WORLD_CONFIG } from './NeuralWorld.js';
import { NeuralController } from './NeuralController.js';
import { STEP_MS } from './NeuralModel.js';
import { PoseInterpolator } from '../scene/PoseInterpolator.js';
import { RuntimeMetrics } from './RuntimeMetrics.js';
import compatibility from 'virtual:experiment-compatibility';
import { parseExperiment } from './ExperimentFile.js';

const DEFAULT_SOURCES = [{ id: 'one', position: { x: 0, y: 3, z: 2.15 }, strength: 1, remaining: 1 }];
export class NeuralSession extends Group {
  constructor(entity, preview, camera, playback, onStatus = () => {}) {
    super();
    this.name = 'NeuralSources';
    Object.assign(this, { entity, preview, camera, playback, onStatus });
    this.world = new NeuralWorld();
    this.renderPose = new PoseInterpolator(this.world.pose);
    this.controller = new NeuralController();
    this.options = { realtime: true, outputsEnabled: true, assist: false, directional: true };
    this.status = 'off';
    this.mode = 'fixed';
    this.sourceSerial = 0;
    this.log = [];
    this.events = [];
    this.markers = new Map();
    this.requestId = this.revision = 0;
    this.discardedWindows = 0;
    this.metrics = new RuntimeMetrics();
    document.addEventListener('visibilitychange', () => this.syncTiming());
    this.timer = setInterval(() => this.pump(), 25);
  }
  setStatus(status, error = null) {
    this.syncTiming();
    this.status = status;
    this.syncTiming();
    this.error = error;
    this.recordEvent({ type: 'status', status, error });
    this.onStatus(status, error);
  }
  async start({ seed = 1, profile = 'lc11', mode = 'fixed', sources = DEFAULT_SOURCES, pose = { x: 0, z: 0, heading: 0 }, experimentName = null, ...options } = {}) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be a uint32');
    if (!['lc11', 'olfactory'].includes(profile)) throw new Error('Unknown sensory profile');
    if (!['fixed', 'interactive'].includes(mode) || (mode === 'interactive' && profile !== 'olfactory')) throw new Error('Interactive mode requires the olfactory profile');
    this.stop();
    this.mode = mode;
    this.experimentName = experimentName;
    this.preview.cancel();
    this.world = new NeuralWorld({ profile });
    this.controller = new NeuralController({ profile });
    this.log = [];
    this.events = [];
    this.last = this.metadata = null;
    this.discardedWindows = 0;
    this.options = { realtime: true, outputsEnabled: true, assist: false, directional: true };
    this.configure({ sources, pose, ...options });
    this.initial = { seed, profile, mode, sources: structuredClone(this.world.sources), pose: { ...this.world.pose }, ...(experimentName ? { experimentName } : {}) };
    this.apply(this.controller.stop('waiting-for-neural-output'));
    this.worker = new Worker(new URL('./brain.worker.js', import.meta.url), { type: 'module' });
    const worker = this.worker;
    this.worker.onmessage = ({ data }) => {
      const pending = this.pending;
      if (!pending || pending.id !== data.id) return;
      clearTimeout(pending.timer);
      this.pending = null;
      if (data.error) pending.reject(new Error(data.error));
      else pending.resolve(data.value);
    };
    this.worker.onerror = event => { if (this.worker === worker) this.fail(event.message || 'Neural worker failed'); };
    this.setStatus('loading');
    try {
      this.metadata = await this.request('init', { seed, profile }, 45000);
      this.metrics.reset();
      this.setStatus('running');
      this.nextTick = performance.now();
      return this.metadata;
    } catch (error) { if (this.worker === worker && this.status !== 'off') this.fail(error.message); throw error; }
  }
  restart() {
    return this.start({ ...structuredClone(this.initial || {}), ...this.options });
  }
  async saveExperiment(name = 'Experiment') {
    if (this.status !== 'running' || this.experimentBusy) throw new Error('Wait for a ready neural experiment before saving');
    this.experimentBusy = 'saving';
    const worker = this.worker;
    this.syncTiming();
    this.playback.paused = true;
    this.syncTiming();
    try {
      // stepSettled covers response handling AND the logical world update.
      // Edits already applied by configure are included; stale revisions retain
      // the existing discard policy. No extra neural window is submitted.
      await this.stepSettled;
      if (this.worker !== worker || this.status !== 'running') throw new Error('The neural session changed while saving');
      const file = { format: 'neuro-archon-experiment', version: 1, name, compatibility,
        seed: this.initial.seed, profile: this.world.profile, mode: this.mode,
        pose: { ...this.world.pose }, sources: structuredClone(this.world.sources),
        settings: Object.fromEntries(['outputsEnabled', 'directional', 'assist'].map(key => [key, this.options[key]])) };
      return parseExperiment(JSON.stringify(file), compatibility);
    } finally { this.experimentBusy = null; }
  }
  async loadExperiment(text) {
    // Complete validation before pausing, stopping, or changing any live state.
    const file = parseExperiment(text, compatibility);
    if (this.experimentBusy) throw new Error('Experiment file operation in progress');
    this.experimentBusy = 'loading';
    this.syncTiming();
    this.playback.paused = true;
    this.syncTiming();
    try {
      this.stop('experiment-loaded');
      this.entity.resetInteraction();
      await this.start({ seed: file.seed, profile: file.profile, mode: file.mode,
        sources: file.sources, pose: file.pose, ...file.settings, realtime: true, experimentName: file.name });
      return file;
    } finally { this.playback.paused = true; this.experimentBusy = null; this.syncTiming(); }
  }
  addSource(position, editEventAt = performance.now()) {
    if (this.mode !== 'interactive') throw new Error('Enter Interact to edit sources');
    if (this.world.sources.length >= 2) throw new Error('At most two sources');
    let id;
    do { id = `source-${++this.sourceSerial}`; } while ([...this.world.sources, ...(this.initial?.sources || [])].some(s => s.id === id));
    const label = ['A', 'B'].find(label => !this.world.sources.some(s => s.label === label));
    this.configure({ sources: [...this.world.sources, { id, label, position, strength: 1, remaining: 1 }], editEventAt });
    return structuredClone(this.world.sources.find(s => s.id === id));
  }
  editSource(id, { position, strength } = {}, editEventAt = performance.now()) {
    if (this.mode !== 'interactive') throw new Error('Enter Interact to edit sources');
    if (!this.world.sources.some(s => s.id === id)) throw new Error('Source no longer exists');
    this.configure({ sources: this.world.sources.map(s => s.id === id ? { ...s,
      ...(position ? { position } : {}), ...(strength !== undefined ? { strength } : {}) } : s), editEventAt });
  }
  removeSource(id, editEventAt = performance.now()) {
    if (this.mode !== 'interactive') throw new Error('Enter Interact to edit sources');
    this.configure({ sources: this.world.sources.filter(s => s.id !== id), editEventAt });
  }
  request(type, fields, timeout = 1500) {
    if (this.pending) throw new Error('Neural request already in flight');
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error(`Neural ${type} timed out after ${timeout} ms`));
      }, timeout);
      this.pending = { id, resolve, reject, timer, sentAt: performance.now() };
      this.worker.postMessage({ id, type, ...fields });
    });
  }
  closeWorker() {
    this.worker?.terminate();
    this.worker = null;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error('Neural session stopped'));
      this.pending = null;
    }
  }
  stop(reason = 'neural-stopped') {
    if (this.status === 'off') return;
    this.renderPose.freeze();
    this.revision++;
    this.closeWorker();
    this.apply(this.controller.stop(reason));
    this.visible = false;
    this.setStatus('off');
  }
  fail(message) {
    this.renderPose.freeze();
    this.closeWorker();
    this.revision++;
    this.apply(this.controller.stop('neural-failure'));
    this.setStatus('error', message);
  }
  configure({ sources, pose, editEventAt = performance.now(), ...options } = {}) {
    if (pose && ![pose.x, pose.z, pose.heading].every(Number.isFinite)) throw new Error('Pose must be finite');
    if (sources && this.mode === 'interactive') {
      if (sources.length > 2) throw new Error('At most two sources');
      const labeled = sources.map(s => ({ ...s, label: s.label || this.world.sources.find(old => old.id === s.id)?.label }));
      const used = new Set(labeled.map(s => s.label).filter(Boolean));
      sources = labeled.map(s => { const label = s.label || ['A', 'B'].find(label => !used.has(label)); used.add(label); return { ...s, label }; });
      if (used.size !== sources.length || sources.some(s => !['A', 'B'].includes(s.label))) throw new Error('Source labels must be distinct A/B');
    }
    if (sources) this.world.setSources(sources);
    if (pose) {
      this.world.pose = { ...pose };
      this.renderPose.reset(pose);
      this.entity.setLocomotion(pose);
    }
    for (const key of ['outputsEnabled', 'assist', 'realtime', 'directional']) if (key in options) this.options[key] = Boolean(options[key]);
    this.world.directional = this.options.directional;
    this.revision++;
    this.recordEvent({ type: 'configuration', sources, pose, options });
    if (sources && this.status === 'running') this.metrics.edit(this.revision, editEventAt);
    this.syncTiming();
    const linked = this.world.sense(this.controller.targetId).target;
    if (!this.options.outputsEnabled) {
      this.renderPose.freeze();
      this.apply(this.controller.stop('outputs-blocked'));
    }
    else if (this.controller.targetId && (!linked || linked.distance > WORLD_CONFIG.contactRange || linked.emission <= 0)) {
      this.apply(this.controller.stop(!linked ? 'no-target' : linked.emission <= 0 ? 'no-signal' : 'out-of-range'));
    } else if (!this.world.sources.some(s => s.strength * s.remaining > 0)) this.apply(this.controller.stop('no-target'));
    else if (this.controller.targetId && this.currentCommand) this.apply(this.currentCommand);
  }
  apply(command) {
    if (command.phase !== this.currentCommand?.phase || command.reason !== this.currentCommand?.reason) {
      this.recordEvent({ type: 'interaction', phase: command.phase, reason: command.reason, targetId: command.targetId });
    }
    this.currentCommand = command;
    const source = this.world.sources.find(s => s.id === command.targetId);
    this.entity.setVisualState({ interaction: { phase: command.phase, ...(source ? { target: source.position, intensity: command.feed } : {}) } });
  }
  async step() {
    if (this.status !== 'running') throw new Error('Neural model is not running');
    if (this.experimentBusy) throw new Error('Experiment file operation in progress');
    const revision = this.revision;
    const worker = this.worker;
    const sense = this.world.sense(this.controller.targetId);
    const requestedAt = performance.now();
    const edit = this.metrics.submitEdit(revision, requestedAt);
    let finish;
    const settled = this.stepSettled = new Promise(resolve => { finish = resolve; });
    try {
      const response = await this.request('step', { inputs: sense.inputs });
      if (revision !== this.revision || this.status !== 'running') {
        this.discardedWindows++;
        if (edit) Object.assign(edit, { state: 'discarded', discardedAt: performance.now() });
        return null;
      }
      if (response.ms !== STEP_MS || performance.now() - requestedAt > 1500) throw new Error('Stale neural response');
      const command = this.controller.step(response.outputs, sense, STEP_MS / 1000, this.options);
      const result = this.world.advance(command, STEP_MS / 1000);
      if (this.options.outputsEnabled) this.renderPose.setTarget(this.world.pose);
      this.apply(command);
      const appliedAt = performance.now();
      this.metrics.applied(edit, appliedAt);
      this.syncTiming(appliedAt);
      const row = { sequence: this.requestId, sense, response, command, result, next: this.world.sense(this.controller.targetId),
        options: { ...this.options }, roundTripMs: appliedAt - requestedAt,
        timing: { inputAt: requestedAt, appliedAt, revision, editId: edit?.id ?? null } };
      this.last = row;
      this.log.push(row);
      if (this.log.length > 400) this.log.shift();
      return row;
    } catch (error) { if (this.worker === worker && this.status === 'running') this.fail(error.message); throw error; }
    finally { finish(); if (this.stepSettled === settled) this.stepSettled = null; }
  }
  async steps(count) {
    if (this.options.realtime) throw new Error('Set realtime: false before stepping');
    if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('Steps must be 1..1000');
    for (let i = 0; i < count; i++) await this.step();
    return this.snapshot();
  }
  pump() {
    this.syncTiming();
    if (this.status !== 'running' || !this.options.realtime || this.pending || this.experimentBusy || this.playback.paused || document.hidden) return;
    const now = performance.now();
    if (now < this.nextTick) return;
    // At most one fixed window. Slow computation slows simulation; no RAF-based
    // integration, backlog bursts or repeated application of the previous output.
    this.nextTick = now + STEP_MS;
    this.step().catch(() => {}); // step has already exposed the exact failure.
  }
  update(time, delta = 0) {
    this.entity.setLocomotion(this.renderPose.update(delta));
    this.visible = this.status === 'running' || this.status === 'loading';
    for (const [id, marker] of this.markers) if (!this.world.sources.some(s => s.id === id)) {
      this.remove(marker);
      marker.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
      this.markers.delete(id);
    }
    for (const source of this.world.sources) {
      let marker = this.markers.get(source.id);
      if (!marker) { marker = new EnergyKnot(0.3); this.add(marker); this.markers.set(source.id, marker); }
      marker.position.copy(source.position);
      marker.update(time, source.strength * source.remaining * 0.82, this.camera);
    }
  }
  snapshot() {
    return { status: this.status, mode: this.mode, error: this.error, metadata: this.metadata, initial: structuredClone(this.initial), options: { ...this.options },
      experimentName: this.experimentName, experimentBusy: this.experimentBusy,
      pose: { ...this.world.pose }, sources: structuredClone(this.world.sources), markerIds: [...this.markers.keys()], simulationTime: this.world.time,
      discardedWindows: this.discardedWindows, currentCommand: this.currentCommand, last: this.last, log: this.log, events: this.events,
      runtime: this.runtime(), edits: this.metrics.edits };
  }
  syncTiming(now = performance.now()) {
    const mode = this.status !== 'running' ? this.status : !this.options.realtime ? 'manual'
      : document.hidden ? 'hidden' : this.playback.paused ? 'paused' : 'running';
    this.metrics?.sync(now, this.world.time, mode);
  }
  runtime() {
    const now = performance.now(); this.syncTiming(now);
    return this.metrics.snapshot(now, this.pending?.sentAt, this.world.time);
  }
  recordEvent(event) {
    this.events.push({ simulationTime: this.world.time, ...event });
    if (this.events.length > 200) this.events.shift();
  }
}
