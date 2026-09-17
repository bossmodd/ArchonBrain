import { INPUTS, SIGNAL_INPUTS } from '../neural/NeuralModel.js';
import { BrainActivity } from './BrainActivity.js';

const number = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '—';
// A view of the last completed sample and the currently applied command.
export class NeuralReadout {
  constructor(ui) {
    this.ui = ui;
    this.root = ui.root.querySelector('#neural-flow');
    this.root.innerHTML = `<div class="brain-heading"><span>FlyWire v783</span><span id="model-state"></span></div>
      <div id="brain-activity"></div>
      <section class="sensory-input"><h3>Sensory input <small id="signal-profile"></small></h3>
      ${[['left', 'Left'], ['right', 'Right'], ['contact', 'Contact sugar']].map(([key, label]) => `<div class="signal-line"><span>${label}</span><output id="signal-${key}">—</output><meter id="meter-${key}" min="0" max="1" value="0" aria-label="${label} input"></meter></div>`).join('')}</section>
      <section class="motor-output"><h3>Neural output <small>Hz · L / R</small></h3>
        ${[['turn', 'Turn', 'DNa02'], ['go', 'Move', 'Go'], ['feed', 'Absorb', 'MN9']].map(([key, label, group]) => `<div class="output-line" id="row-${key}"><span id="${key === 'go' ? 'go-label' : `${key}-label`}">${label} <small>${group}</small></span><output id="output-${key}">—</output><div class="paired-bars"><i id="bar-${key}-left"></i><i id="bar-${key}-right"></i></div></div>`).join('')}
        </section>
      <section class="action-summary"><div id="action-state"></div><div class="action-values"><span><output id="action-speed">—</output><small>speed · u/s</small></span><span><output id="action-yaw">—</output><small>yaw · rad/s</small></span></div>
        <div class="control-badges"><span id="gate-badge"></span><span id="assist-badge"></span></div></section>
      <details id="neural-detail"><summary>Signal details</summary><p id="sample-time"></p><p id="model-detail"></p><p id="atlas-definition">Background: one anchor per annotated model neuron, not soma locations or branches. Original pos_x/pos_y are voxel coordinates; the exported axes are independently normalized. Original extents and depth are not stored, so physical aspect is not verified. Gold: delivered input Hz, not measured firing. Cyan: recorded motor groups only, not all neurons. The trace totals network spikes per completed 100 ms window; up to 80 displayed samples over 8 model seconds, with an automatic vertical scale. Missing windows are not reconstructed.</p><dl><dt>DNp09 / MDN</dt><dd id="output-walk">—</dd></dl><p id="neural-gate"></p><p id="action-reason"></p><p id="action-transition"></p><p id="action-assist"></p><small>Map: input rates and recorded motor neurons. Background: anatomical positions. Bars use a 100 Hz display scale; values are unclipped.</small></details>`;
    this.activity = new BrainActivity(this.root.querySelector('#brain-activity'));
    const detail = this.root.querySelector('#neural-detail');
    const signals = document.createElement('div'); signals.id = 'signal-values';
    signals.append(this.root.querySelector('.sensory-input'), this.root.querySelector('.motor-output'), this.root.querySelector('.action-summary'));
    detail.querySelector('summary').after(signals);
    detail.append(this.root.querySelector('#atlas-caption'), this.root.querySelector('.spike-strip > div'));
    detail.append(this.root.querySelector('#model-state'));
    const sampleLabel = document.createElement('span'); sampleLabel.id = 'activity-sample';
    this.root.querySelector('.spike-strip').before(sampleLabel);
    const raw = document.createElement('pre'); raw.id = 'output-raw';
    const rawDetail = document.createElement('details'); rawDetail.innerHTML = '<summary>Raw motor rates</summary>';
    rawDetail.append(raw); detail.append(rawDetail);
    this.nodes = Object.fromEntries([...this.root.querySelectorAll('[id]')].map(n => [n.id, n]));
    this.footer = document.createElement('span'); this.footer.id = 'run-summary';
    ui.root.querySelector('.view-note').prepend(this.footer);
    this.exceptions = document.createElement('span'); this.exceptions.id = 'exception-status'; this.exceptions.hidden = true;
    ui.root.querySelector('.viewer-header').append(this.exceptions);
    this.mode = document.createElement('span'); this.mode.id = 'current-mode'; this.mode.textContent = 'Brain'; this.mode.hidden = true;
    ui.root.querySelector('nav').append(this.mode);
  }
  text(key, value) { if (this.nodes[key].textContent !== value) this.nodes[key].textContent = value; }
  update(runtime, lastCause = '') {
    const { brain, playback, preview } = this.ui;
    this.ui.updatePlaybackIcon();
    const pause = this.ui.root.querySelector('#pause');
    const pauseText = playback.paused ? 'Play' : 'Pause';
    if (pause.querySelector('span').textContent !== pauseText) {
      pause.querySelector('span').textContent = pauseText;
      pause.setAttribute('aria-pressed', String(playback.paused));
      this.ui.root.querySelector('.live-dot').classList.toggle('paused', playback.paused);
    }
    const row = brain.last, active = brain.status !== 'off';
    this.mode.hidden = !active || brain.mode === 'interactive' || preview.active;
    const input = active ? row?.response.inputs : null, output = active ? row?.response.outputs : null;
    const command = active ? brain.currentCommand : null;
    const remote = brain.world.profile === 'olfactory', definitions = remote ? SIGNAL_INPUTS : INPUTS;
    const state = brain.status === 'running' && playback.paused ? 'paused' : brain.status;
    // The sample label describes the completed record, not the transient
    // worker state between 100 ms windows. Keep it stable while the age and
    // output freshness remain available in the detailed readout.
    const sampleKind = playback.paused ? 'Paused sample' : 'Latest completed sample';
    this.text('activity-sample', !active || !row ? 'No activity sample' : sampleKind);
    this.activity.root.dataset.freshness = playback.paused ? 'paused' : runtime.outputState;
    this.text('model-state', brain.error ? 'Error' : state === 'off' ? 'Offline' : state);
    this.nodes['model-state'].dataset.state = state;
    this.text('model-detail', `${brain.metadata ? 'FlyWire v783' : 'Model not loaded'} · ${brain.world.profile}\n${brain.error || state}`);
    this.nodes['model-state'].setAttribute('role', brain.error ? 'alert' : 'status');
    this.activity.update(brain.metadata, row, active);
    this.text('sample-time', active && row ? `${sampleKind} · input at ${number(row.sense.time)} s → result ${number(row.response.modelTimeMs / 1000)} s\n${runtime.outputState} · age ${number(runtime.outputAgeMs, 0)} ms` : 'No completed sample');
    this.text('signal-profile', remote ? 'ORN · Hz' : 'LC11 · Hz');
    for (const [id, key] of [['left', remote ? 'signalLeft' : 'visualLeft'], ['right', remote ? 'signalRight' : 'visualRight'], ['contact', 'contactSugar']]) {
      this.text(`signal-${id}`, number(input?.[key]));
      const meter = this.nodes[`meter-${id}`]; meter.max = definitions[key].maxHz; meter.value = input?.[key] ?? 0;
      meter.setAttribute('aria-valuetext', input ? `${number(input[key])} Hz of ${meter.max} Hz` : 'No sample');
    }
    const pair = (a, b) => `${number(output?.[a])} / ${number(output?.[b])}`;
    this.text('output-turn', pair('turnLeft', 'turnRight'));
    this.text('output-go', remote ? pair('goLeft', 'goRight') : 'Not used');
    this.nodes['output-go'].hidden = this.nodes['go-label'].hidden = !remote;
    this.nodes['row-go'].hidden = !remote;
    for (const [key, left, right] of [['turn', 'turnLeft', 'turnRight'], ['go', 'goLeft', 'goRight'], ['feed', 'feedLeft', 'feedRight']]) {
      for (const [side, channel] of [['left', left], ['right', right]]) this.nodes[`bar-${key}-${side}`].style.setProperty('--amount', Math.min(1, (output?.[channel] ?? 0) / 100));
    }
    this.text('output-walk', pair('forward', 'backward'));
    this.text('output-feed', pair('feedLeft', 'feedRight'));
    this.text('output-raw', row && active ? JSON.stringify(row.response.raw, null, 2) : 'No completed sample');
    this.text('neural-gate', !active ? 'Brain off' : brain.options.outputsEnabled ? 'Output transmission ON' : 'Output transmission blocked · neural samples continue while running');
    this.text('action-speed', number(command?.speed, 2)); this.text('action-yaw', number(command?.yaw, 2));
    const phase = command?.phase;
    const action = phase === 'absorb' ? 'Absorbing' : phase === 'prepare' ? 'Connecting' : phase === 'release' ? 'Releasing' : command && Math.abs(command.speed) > .01 ? 'Moving' : command && Math.abs(command.yaw) > .01 ? 'Turning' : 'Idle';
    this.text('action-state', command ? `Last applied command: ${action}${command.targetId ? ` · ${brain.world.sources.find(s => s.id === command.targetId)?.label || command.targetId}` : ''}` : preview.active ? 'Manual preview' : 'No applied command');
    this.nodes['action-state'].title = command ? `${command.phase} · linked ${command.targetId || 'none'}` : '';
    this.text('gate-badge', !active ? 'Brain off' : brain.options.outputsEnabled ? 'Outputs on' : 'Outputs blocked');
    this.nodes['gate-badge'].dataset.blocked = !brain.options.outputsEnabled;
    this.text('assist-badge', `Assist ${brain.options.assist ? 'on' : 'off'}`);
    this.text('action-reason', command?.reason || 'No neural command'); this.text('action-transition', active ? lastCause : '');
    this.text('action-assist', `Assist ${brain.options.assist ? 'ON' : 'OFF'} · ${number(command?.assistYaw, 2)} rad/s\nDirection ${brain.options.directional ? 'ON' : 'OFF'}`);
    const exceptions = [active && !brain.options.outputsEnabled && 'Neural output disconnected', active && !brain.options.directional && 'Directional signal removed', active && brain.options.assist && 'Steering assist enabled', preview.active && 'Manual preview'].filter(Boolean).join(' · ');
    this.exceptions.textContent = exceptions; this.exceptions.hidden = !exceptions;
    const execution = brain.error ? `Model error: ${brain.error}` : state === 'loading' ? 'Loading model…' : playback.paused ? 'Paused' : preview.active ? 'Preview' : state === 'running' ? `Running · ${runtime.outputState === 'delayed' ? 'Response delayed' : runtime.outputState === 'waiting' ? 'Waiting for response' : action === 'Idle' ? 'Waiting' : action}` : 'Ready';
    const text = `${execution} · Sim ${number(brain.world.time)} s`;
    this.footer.setAttribute('role', brain.error ? 'alert' : 'status');
    if (this.footer.textContent !== text) this.footer.textContent = text;
  }
}
