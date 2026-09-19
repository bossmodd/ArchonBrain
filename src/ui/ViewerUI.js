import GUI from 'lil-gui';
import { Vector3 } from 'three';
import { defaults } from '../archon/parameters.js';
import { neuralCondition } from '../neural/conditions.js';
import { SourceEditor } from './SourceEditor.js';
import { ExperimentFiles } from './ExperimentFiles.js';
import { ObservationLayout } from './ObservationLayout.js';

const icons = {
  orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)"/>',
  tune: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="M8 5l11 7-11 7Z"/>',
  reset: '<path d="M4 10a8 8 0 1 1 2 8M4 4v6h6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;

export class ViewerUI {
  constructor(parameters, stage, entity, playback, preview) {
    const query = new URLSearchParams(location.search);
    this.publicExperience = query.get('tools') !== '1' && query.get('brain') !== '1' && !query.has('trial');
    this.parameters = parameters;
    this.stage = stage;
    this.entity = entity;
    this.playback = playback;
    this.preview = preview;
    this.root = document.createElement('div');
    this.root.className = 'viewer-ui';
    this.root.innerHTML = `
      <header class="viewer-header">
        <div class="wordmark"><img class="brand-portrait" src="/images/archon-icon.png" alt="" width="44" height="44"><div><h1>ArchonBrain</h1></div></div>
        <nav aria-label="Viewer controls">
          <button id="interaction-preview" aria-pressed="false" title="Preview absorption">Preview</button>
          <button id="orbit" aria-pressed="false" title="Toggle orbit (O)">${icon('orbit')}<span>Orbit</span></button>
          <button id="tune" aria-expanded="false" aria-controls="tuning-panel" title="Toggle settings (G)">${icon('tune')}<span>Settings</span></button>
        </nav>
      </header>
      <div class="camera-tools" role="group" aria-label="Camera framing">
        <button id="view-archon">Archon view</button><button id="view-all">View all</button>
        <button id="keep-in-view" aria-pressed="false">Keep in view</button>
      </div>
      <span id="interaction-state" aria-live="polite"></span>
      <aside id="tuning-panel" hidden><div id="gui-container"></div><button id="reset">${icon('reset')}Reset</button></aside>
      <footer class="viewer-footer">
        <div class="view-note"><span class="live-dot"></span><span id="view-mode">Fixed view</span></div>
        <div class="layer-switch" role="group" aria-label="Layers">
          <button id="full" aria-pressed="true">Composite</button><button id="body" aria-pressed="false">Body</button>
        </div>
        <button id="pause" aria-pressed="false" title="Play / pause (Space)">${icon('pause')}<span>Pause</span></button>
      </footer>`;
    document.querySelector('#app').append(this.root);
    this.gui = new GUI({ container: this.root.querySelector('#gui-container'), title: 'Settings', width: 284 });
    const definitions = [
      ['shellRadius', 'Shell radius', 1.2, 2.6, 0.01],
      ['shellOpacity', 'Gas density', 0, 1, 0.01],
      ['pulseSpeed', 'Pulse speed', 0, 1.8, 0.01],
      ['filamentIntensity', 'Arc intensity', 0, 2, 0.01],
      ['sparkDensity', 'Sparks', 0, 160, 1],
      ['satelliteSpeed', 'Orbit speed', 0, 12, 0.01],
      ['satelliteOrbitRadius', 'Orbit distance', 0.3, 1.2, 0.01],
      ['rimIntensity', 'Rim light', 0, 2.5, 0.01],
    ];
    for (const [key, name, min, max, step] of definitions) this.gui.add(parameters, key, min, max, step).name(name).listen();
    this.gui.$title.setAttribute('aria-label', 'Collapse settings');
    this.bind('interaction-preview', () => {
      this.brain?.stop('manual-preview');
      if (preview.active) preview.stop();
      else preview.start();
      this.setPaused(false);
      this.updateInteraction();
    });
    this.bind('orbit', () => this.setOrbit(!stage.rig.controls.enabled));
    this.bind('view-archon', () => this.frameView(false));
    this.bind('view-all', () => this.frameView(true));
    this.bind('keep-in-view', () => {
      const enabled = !stage.rig.keepInView;
      if (enabled) this.setOrbit(false);
      stage.rig.keepInView = enabled;
    });
    this.bind('tune', () => {
      const panel = this.root.querySelector('#tuning-panel');
      panel.hidden = !panel.hidden;
      this.root.querySelector('#tune').setAttribute('aria-expanded', String(!panel.hidden));
    });
    this.bind('full', () => this.showEffects(true));
    this.bind('body', () => this.showEffects(false));
    this.bind('pause', () => this.setPaused(!playback.paused));
    this.bind('reset', () => {
      this.brain?.stop('viewer-reset');
      preview.cancel();
      entity.setVisualState({ interaction: { phase: 'idle' } });
      Object.assign(parameters, defaults);
      this.setOrbit(false);
      stage.rig.reset();
      this.showEffects(true);
      this.setPaused(false);
    });
    this.onKey = event => {
      if (event.defaultPrevented || (event.key === ' ' && event.target.closest('button, summary, a, [role="button"]'))) return;
      if (event.target.matches('input, textarea, select') || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (this.publicExperience && key !== 'o') return;
      const action = { o: 'orbit', g: 'tune', ' ': 'pause' }[key];
      if (action) { event.preventDefault(); this.root.querySelector(`#${action}`).click(); }
      if (key === 'h') this.root.classList.toggle('hidden-ui');
    };
    window.addEventListener('keydown', this.onKey);
    this.setPaused(playback.paused);
  }
  bind(id, action) { this.root.querySelector(`#${id}`).addEventListener('click', action); }
  archonBounds() {
    const p = this.parameters;
    const radius = Math.max(p.shellRadius * 1.4, (p.shellRadius * 1.06 + p.satelliteOrbitRadius + .38) * 1.06 + .25);
    return { center: new Vector3(this.entity.position.x, 2.4, this.entity.position.z), radius };
  }
  updateCamera(delta) {
    const editing = Boolean(this.sourceEditor?.drag || this.sourceEditor?.placement);
    this.stage.rig.update(this.playback.paused ? 0 : delta, this.archonBounds(), editing);
    this.root.querySelector('#keep-in-view').setAttribute('aria-pressed', String(this.stage.rig.keepInView));
  }
  frameView(all) {
    const spheres = [this.archonBounds()];
    if (all) for (const s of this.brain?.world.sources || []) spheres.push({ center: new Vector3(s.position.x, s.position.y, s.position.z), radius: .7 });
    this.setOrbit(false);
    this.stage.rig.frame(spheres);
    if (this.stage.rig.frameLimited) this.root.querySelector('#view-mode').textContent = 'Framing limit · use Archon view';
  }
  attachNeural(brain) {
    this.brain = brain;
    const button = document.createElement('button');
    button.id = 'neural-toggle';
    button.textContent = 'Brain';
    button.title = 'Run FlyWire v783';
    button.setAttribute('aria-pressed', 'false');
    this.root.querySelector('nav').prepend(button);
    const interact = document.createElement('button');
    interact.id = 'interact'; interact.textContent = 'Interact';
    interact.setAttribute('aria-pressed', 'false');
    interact.title = 'Edit two sources with the verified olfactory profile';
    this.root.querySelector('nav').prepend(interact);
    this.bind('interact', () => this.runNeuralCondition('interactive'));
    this.sourceEditor = new SourceEditor(brain, this.stage, this.root);
    const label = document.createElement('span');
    label.id = 'neural-status';
    label.setAttribute('role', 'status');
    this.root.querySelector('.view-note').append(label);
    this.diagnostics = document.createElement('pre');
    this.diagnostics.id = 'neural-diagnostics';
    this.diagnostics.setAttribute('aria-label', 'Neural diagnostics');
    this.diagnostics.hidden = true;
    this.root.append(this.diagnostics);
    this.neuralSettings = { condition: 'near' };
    this.bind('neural-toggle', () => {
      if (brain.status === 'running' || brain.status === 'loading') brain.stop();
      else this.runNeuralCondition(this.neuralSettings.condition);
    });
    const settings = {};
    for (const key of ['outputsEnabled', 'assist', 'directional']) Object.defineProperty(settings, key, {
      enumerable: true, get: () => brain.options[key], set: value => { brain.configure({ [key]: value }); },
    });
    const folder = this.gui.addFolder('Neural control').close();
    this.neuralFolder = folder;
    folder.add(settings, 'outputsEnabled').name('Transmit outputs').listen();
    folder.add(settings, 'assist').name('Steering assist').listen();
    folder.add(settings, 'directional').name('Directional signal').listen();
    folder.add(this.neuralSettings, 'condition', { 'Interactive sources': 'interactive', 'Near absorption': 'near', 'Remote left': 'left', 'Remote front': 'front', 'Remote right': 'right', 'Remote rear': 'rear' }).name('Condition').listen();
    folder.add({ run: () => this.runNeuralCondition(this.neuralSettings.condition) }, 'run').name('Run condition');
    this.restartControl = folder.add({ restart: () => {
      if (brain.experimentBusy || (this.publicExperience && brain.status === 'loading')) return;
      if (this.publicExperience && this.playback.paused && brain.status === 'running') {
        this.setPaused(false);
        return;
      }
      this.setPaused(false);
      brain.restart().then(() => { if (this.publicExperience) this.frameView(true); }).catch(() => {});
    } }, 'restart').name('Restart same state');
    this.experimentFiles = new ExperimentFiles(this, brain);
    this.layout = new ObservationLayout(this);
    this.updateNeural('off');
  }
  runNeuralCondition(name) {
    if (this.brain.experimentBusy) return;
    this.neuralSettings.condition = name;
    this.setPaused(false);
    return this.brain.start({ ...neuralCondition(name), ...this.brain.options, realtime: true, ...(name === 'interactive' ? { assist: false } : {}) }).catch(() => {});
  }
  updateNeuralReadout() {
    const brain = this.brain;
    if (!brain) return;
    this.experimentFiles.update();
    this.sourceEditor.update();
    this.diagnostics.hidden = brain.status === 'off';
    const row = brain.last, command = brain.currentCommand;
    const number = value => Number.isFinite(value) ? value.toFixed(1) : '—';
    const input = row?.response.inputs, output = row?.response.outputs;
    const olfactory = brain.initial?.profile === 'olfactory';
    const target = row?.next.target;
    const on = value => value ? 'ON' : 'OFF';
    const events = brain.events.filter(event => event.type === 'interaction');
    const lastTransition = events.findLast((event, i) => ['prepare', 'release'].includes(event.phase) && event.phase !== events[i - 1]?.phase);
    const lastCause = lastTransition ? `Last ${lastTransition.phase === 'prepare' ? 'start' : 'stop'}: ${lastTransition.reason}` : '';
    const runtime = brain.runtime(), edit = runtime.latestEdit;
    this.layout.readout.update(runtime, lastCause);
    this.layout.map.update();
    this.layout.guide.update(runtime);
    this.layout.feedback.update(runtime);
    this.layout.experience?.update();
    this.root.querySelector('#environment-empty').hidden = !this.sourceEditor.panel.hidden;
    if (this.diagnostics.hidden) return;
    const text = [
      ...(brain.mode === 'interactive' ? (row?.sense.contributions || []).map(s => `${s.label} [${s.id}] strength ${s.strength.toFixed(2)} · remaining ${(s.remaining * 100).toFixed(1)}% · conc L/R ${s.concentrations.left.toFixed(3)} / ${s.concentrations.right.toFixed(3)}`) : []),
      `${olfactory ? 'Psionic signal' : 'LC11'} L/R ${number(input?.[olfactory ? 'signalLeft' : 'visualLeft'])} / ${number(input?.[olfactory ? 'signalRight' : 'visualRight'])} Hz · Sugar ${number(input?.contactSugar)} · sample ${number(row?.sense.time)} s`,
      `DNa02 ${number(output?.turnLeft)} / ${number(output?.turnRight)} · Go ${number(output?.goLeft)} / ${number(output?.goRight)} · MN9 ${number(output?.feedLeft)} / ${number(output?.feedRight)} Hz`,
      `Move ${number(command?.speed)} u/s · Turn ${number(command?.yaw)} rad/s · Assist ${number(command?.assistYaw)}`,
      `Distance ${number(target?.distance)} · ${command?.phase || brain.status} · linked ${command?.targetId || 'none'} · t ${number(brain.world.time)} s`,
      brain.error || `${command?.reason || brain.status}${this.playback.paused ? ' · paused' : ''}${lastCause ? ` · ${lastCause}` : ''}`,
      `Outputs ${on(brain.options.outputsEnabled)} · Assist ${on(brain.options.assist)} · Direction ${on(brain.options.directional)}`,
      `Sim ${number(brain.world.time)} s · Run ${number(runtime.activeSeconds)} s · Rate ${number(runtime.realtimeFactor)}× · Render ${number(runtime.renderFps)} fps`,
      `Output ${runtime.outputState} · age ${number(runtime.outputAgeMs)} ms · Pause ${number(runtime.pausedSeconds)} s · Hidden ${number(runtime.hiddenSeconds)} s`,
      `Edit ${edit ? `#${edit.id} ${edit.state} · input ${number(edit.inputLatencyMs)} ms · applied ${number(edit.applyLatencyMs)} ms` : 'none'}`,
    ].join('\n');
    if (this.diagnostics.textContent !== text) this.diagnostics.textContent = text;
  }
  updateNeural(state, error) {
    const label = this.root.querySelector('#neural-status');
    if (!label) return;
    label.textContent = error ? `Brain error: ${error}` : `Brain: ${state} · ${this.brain?.world.profile || 'lc11'}`;
    label.setAttribute('role', error ? 'alert' : 'status');
    this.root.querySelector('#neural-toggle').setAttribute('aria-pressed', String(state === 'running' || state === 'loading'));
    this.root.querySelector('#interact').setAttribute('aria-pressed', String(this.brain?.mode === 'interactive' && (state === 'running' || state === 'loading')));
  }
  updateInteraction() {
    const button = this.root.querySelector('#interaction-preview');
    const label = this.preview.active ? 'Stop' : 'Preview';
    if (button.textContent !== label) button.textContent = label;
    button.setAttribute('aria-pressed', String(this.preview.active));
    const labelNode = this.root.querySelector('#interaction-state');
    const text = { prepare: 'Preparing', absorb: 'Absorbing', release: 'Releasing', idle: '' }[this.entity.interaction.phase];
    if (labelNode.textContent !== text) labelNode.textContent = text;
  }
  setOrbit(enabled) {
    this.stage.rig.setOrbit(enabled);
    this.root.querySelector('#orbit').setAttribute('aria-pressed', String(enabled));
    this.root.querySelector('#view-mode').textContent = enabled ? 'Drag to orbit / scroll to zoom' : 'Fixed view';
  }
  showEffects(visible) {
    for (const effect of this.entity.effects) effect.visible = visible;
    this.stage.groundLight.intensity = visible ? 12 : 3;
    this.root.querySelector('#full').setAttribute('aria-pressed', String(visible));
    this.root.querySelector('#body').setAttribute('aria-pressed', String(!visible));
  }
  setPaused(paused) {
    if (!paused && this.brain?.experimentBusy) return;
    this.brain?.syncTiming();
    this.playback.paused = paused;
    this.brain?.syncTiming();
    this.root.querySelector('#pause').setAttribute('aria-pressed', String(paused));
    this.root.querySelector('#pause span').textContent = paused ? 'Play' : 'Pause';
    this.root.querySelector('.live-dot').classList.toggle('paused', paused);
    this.updatePlaybackIcon();
  }
  updatePlaybackIcon() {
    const button = this.root.querySelector('#pause'), name = this.playback.paused ? 'play' : 'pause';
    if (button.dataset.icon !== name) { button.querySelector('svg').innerHTML = icons[name]; button.dataset.icon = name; }
  }
}
