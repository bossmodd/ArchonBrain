import { MAX_EXPERIMENT_BYTES } from '../neural/ExperimentFile.js';

// File I/O only. NeuralSession owns validation, pause boundaries and initialization.
export class ExperimentFiles {
  constructor(ui, brain) {
    Object.assign(this, { ui, brain });
    this.panel = document.createElement('section');
    this.panel.id = 'experiment-files';
    this.panel.setAttribute('aria-label', 'Experiment files');
    this.panel.innerHTML = `
      <label for="experiment-name">Experiment name</label>
      <input id="experiment-name" type="text" maxlength="80" value="Experiment" autocomplete="off">
      <div class="experiment-actions"><button id="save-experiment">Save experiment</button><button id="load-experiment">Load experiment</button></div>
      <input id="experiment-file" type="file" accept=".json,application/json" aria-label="Experiment JSON file" hidden>
      <p>Save the current layout and run settings. Loading initializes a new neural experiment.</p>
      <div id="experiment-current"></div><div id="experiment-status" role="status" aria-live="polite" hidden></div>`;
    ui.root.querySelector('#tuning-panel').insertBefore(this.panel, ui.root.querySelector('#reset'));
    this.name = this.panel.querySelector('#experiment-name');
    this.name.addEventListener('input', () => { this.nameEdited = true; });
    this.input = this.panel.querySelector('#experiment-file');
    this.status = this.panel.querySelector('#experiment-status');
    this.current = this.panel.querySelector('#experiment-current');
    this.save = this.panel.querySelector('#save-experiment');
    this.load = this.panel.querySelector('#load-experiment');
    this.save.addEventListener('click', () => this.perform(async () => {
      this.message('Pausing and waiting for the current neural window…');
      const file = await brain.saveExperiment(this.name.value.trim() || 'Experiment');
      const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2) + '\n'], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = (file.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'experiment') + '.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.message('Saved current conditions. Paused; restart baseline unchanged.');
    }));
    this.load.addEventListener('click', () => this.input.click());
    this.input.addEventListener('change', () => {
      const file = this.input.files[0];
      this.input.value = '';
      if (!file) return;
      this.perform(async () => {
        this.message('Loading experiment…');
        if (file.size > MAX_EXPERIMENT_BYTES) throw new Error('Experiment file must be at most 64 KiB');
        const text = await file.text();
        const loaded = await brain.loadExperiment(text);
        this.name.value = loaded.name;
        this.nameEdited = false;
        this.message('Loaded at time 0. Press Play to start.');
      });
    });
    this.update();
  }
  message(text, error = false) {
    this.messageAt = performance.now(); this.messageError = error;
    this.status.hidden = !text;
    this.status.textContent = text;
    this.status.setAttribute('role', error ? 'alert' : 'status');
  }
  async perform(action) {
    if (this.busy) return;
    this.busy = true; this.update();
    try { await action(); }
    catch (error) { this.message(error.message, true); }
    finally {
      this.busy = false;
      this.ui.setPaused(this.ui.playback.paused);
      this.update();
    }
  }
  update() {
    const { brain } = this;
    if (this.namedInitial !== brain.initial) {
      this.namedInitial = brain.initial;
      if (!this.nameEdited && brain.experimentName) this.name.value = brain.experimentName;
    }
    if (!this.busy && !brain.experimentBusy && !this.messageError && this.messageAt && performance.now() - this.messageAt > 5000) this.status.hidden = true;
    const locked = Boolean(brain.experimentBusy);
    if (this.locked !== locked) {
      this.locked = locked;
      for (const controller of this.ui.neuralFolder.controllers) controller.disable(locked);
      this.ui.setPaused(this.ui.playback.paused);
      if (locked) this.ui.sourceEditor.drag = this.ui.sourceEditor.placement = null;
    }
    this.save.disabled = this.busy || brain.status !== 'running';
    this.load.disabled = this.name.disabled = Boolean(this.busy || brain.experimentBusy);
    for (const id of ['pause', 'neural-toggle', 'interact', 'interaction-preview', 'reset']) {
      this.ui.root.querySelector(`#${id}`).disabled = Boolean(brain.experimentBusy);
    }
    const on = value => value ? 'ON' : 'OFF';
    const text = brain.initial ? `Current: ${brain.experimentName || 'Unsaved experiment'} · ${brain.world.profile} · seed ${brain.initial.seed}\nOutputs ${on(brain.options.outputsEnabled)} · Direction ${on(brain.options.directional)} · Assist ${on(brain.options.assist)}` : 'No neural experiment';
    const current = this.current;
    if (current.textContent !== text) current.textContent = text;
  }
}
