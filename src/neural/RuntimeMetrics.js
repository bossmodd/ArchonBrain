// Observations only. Nothing here schedules or changes a neural/environment step.
export class RuntimeMetrics {
  constructor() { this.reset(); }
  reset(now = performance.now()) {
    this.startedAt = this.lastAt = now;
    this.mode = 'off';
    this.activeMs = this.pausedMs = this.hiddenMs = 0;
    this.samples = [{ activeMs: 0, simulationTime: 0 }];
    this.frames = []; this.edits = []; this.editSerial = 0;
    this.lastAppliedAt = null;
  }
  sync(now, simulationTime, mode) {
    const elapsed = Math.max(0, now - this.lastAt);
    if (this.mode === 'running') this.activeMs += elapsed;
    else if (this.mode === 'paused') this.pausedMs += elapsed;
    else if (this.mode === 'hidden') this.hiddenMs += elapsed;
    this.lastAt = now; this.mode = mode;
    if (this.activeMs - this.samples.at(-1).activeMs >= 100) {
      this.samples.push({ activeMs: this.activeMs, simulationTime });
      while (this.samples.length > 2 && this.samples[1].activeMs < this.activeMs - 5000) this.samples.shift();
    }
  }
  frame(now) {
    this.frames.push(now);
    while (this.frames.length > 1 && this.frames[0] < now - 2000) this.frames.shift();
  }
  edit(revision, now) {
    const previous = this.edits.at(-1);
    if (previous?.state === 'queued') previous.state = 'superseded';
    this.edits.push({ id: ++this.editSerial, revision, eventAt: now, state: 'queued' });
    if (this.edits.length > 200) this.edits.shift();
  }
  submitEdit(revision, now) {
    const edit = this.edits.at(-1);
    if (edit?.state !== 'queued' || edit.revision > revision) return null;
    Object.assign(edit, { inputAt: now, inputLatencyMs: now - edit.eventAt, state: 'submitted' });
    return edit;
  }
  applied(edit, now) {
    this.lastAppliedAt = now;
    if (edit) Object.assign(edit, { appliedAt: now, applyLatencyMs: now - edit.eventAt, state: 'applied' });
  }
  snapshot(now, pendingAt, simulationTime) {
    const oldest = this.samples[0], span = this.activeMs - oldest.activeMs;
    const age = this.lastAppliedAt === null ? null : now - this.lastAppliedAt;
    const waiting = pendingAt !== undefined && pendingAt !== null;
    const outputState = this.mode !== 'running' ? this.mode
      : waiting ? (now - pendingAt > 250 ? 'delayed' : 'computing')
        : age === null ? 'waiting' : age > 250 ? 'delayed' : 'fresh';
    return { clockOrigin: performance.timeOrigin, activeSeconds: this.activeMs / 1000,
      elapsedSeconds: (now - this.startedAt) / 1000, pausedSeconds: this.pausedMs / 1000, hiddenSeconds: this.hiddenMs / 1000,
      realtimeFactor: this.mode === 'running' && span >= 250 ? (simulationTime - oldest.simulationTime) * 1000 / span : null,
      renderFps: this.frames.length > 1 ? (this.frames.length - 1) * 1000 / (this.frames.at(-1) - this.frames[0]) : null,
      outputState, outputAgeMs: age, pendingMs: waiting ? now - pendingAt : null,
      latestEdit: this.edits.at(-1) ? { ...this.edits.at(-1) } : null };
  }
}
