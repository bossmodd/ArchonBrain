// A receipt for an edited environment reaching the existing neural pipeline.
// Association with a completed window is not an isolated causal-effect estimate.
export class SignalFeedback {
  constructor(ui, scene) {
    this.ui = ui;
    this.root = document.createElement('div'); this.root.id = 'signal-feedback'; this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Last environment edit');
    this.root.innerHTML = `<div class="feedback-path"><span data-stage="edit">Edit</span><span data-stage="input">Input</span><span data-stage="brain">Brain</span><span data-stage="body">Body</span></div><div id="feedback-result" aria-live="polite"></div>`;
    scene.append(this.root);
    this.result = this.root.querySelector('#feedback-result');
  }
  update(runtime) {
    const b = this.ui.brain, edit = runtime.latestEdit, now = performance.now();
    if (this.initial !== b.initial) { this.initial = b.initial; this.editId = null; this.row = null; }
    this.root.hidden = b.status !== 'running' || !edit || (edit.state === 'applied' && now - edit.appliedAt > 5000);
    const inputFlash = !this.root.hidden && Number.isFinite(edit?.inputAt) && now - edit.inputAt < 1200;
    const outputFlash = !this.root.hidden && edit?.state === 'applied' && now - edit.appliedAt < 1200;
    this.ui.layout.readout.root.classList.toggle('input-received', inputFlash);
    this.ui.layout.readout.root.classList.toggle('output-received', outputFlash);
    if (this.root.hidden) return;
    if (this.editId !== edit.id) {
      this.editId = edit.id; this.row = null;
      for (const key of ['modelTime', 'inputLeft', 'inputRight', 'turnLeft', 'turnRight', 'speed', 'yaw']) delete this.root.dataset[key];
    }
    if (edit.state === 'applied' && !this.row) this.row = b.log.findLast(row => row.timing.editId === edit.id);
    this.root.dataset.editId = edit.id; this.root.dataset.state = edit.state;
    for (const [name, confirmed] of [['edit', true], ['input', Number.isFinite(edit.inputAt)], ['brain', !!this.row], ['body', !!this.row]]) {
      this.root.querySelector(`[data-stage="${name}"]`).dataset.confirmed = confirmed;
    }
    let message = edit.state === 'queued' ? this.ui.playback.paused ? 'Queued · press Play' : 'Waiting for input'
      : edit.state === 'submitted' ? 'Input delivered · computing'
        : edit.state === 'discarded' ? 'Changed again · result discarded' : 'Waiting for the completed sample';
    if (this.row) {
      const { response, command, options } = this.row;
      Object.assign(this.root.dataset, { modelTime: response.modelTimeMs,
        inputLeft: response.inputs.signalLeft ?? response.inputs.visualLeft,
        inputRight: response.inputs.signalRight ?? response.inputs.visualRight,
        turnLeft: response.outputs.turnLeft, turnRight: response.outputs.turnRight, speed: command.speed, yaw: command.yaw });
      const action = command.phase === 'absorb' ? 'Absorbing' : command.phase === 'prepare' ? 'Connecting'
        : Math.abs(command.speed) > .01 ? 'Moving' : Math.abs(command.yaw) > .01 ? 'Turning' : 'No movement command';
      message = options.outputsEnabled ? `Input processed · ${action}` : 'Input processed · Outputs blocked';
      this.root.querySelector('[data-stage="body"]').dataset.blocked = !options.outputsEnabled;
      this.result.title = `Actual input L/R ${Number(this.root.dataset.inputLeft).toFixed(1)}/${Number(this.root.dataset.inputRight).toFixed(1)} Hz; DNa02 ${response.outputs.turnLeft.toFixed(1)}/${response.outputs.turnRight.toFixed(1)} Hz; speed ${command.speed.toFixed(2)}, yaw ${command.yaw.toFixed(2)}; ${edit.applyLatencyMs.toFixed(0)} ms from edit`;
    } else {
      delete this.root.querySelector('[data-stage="body"]').dataset.blocked;
      this.result.removeAttribute('title');
    }
    if (this.result.textContent !== message) this.result.textContent = message;
  }
}
