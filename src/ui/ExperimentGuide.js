import { neuralCondition } from '../neural/conditions.js';

// Optional instructions and explicit experiment setup. No motion/target commands
// or independent simulation clock; the existing session owns all behavior.
export class ExperimentGuide {
  constructor(ui, scene) {
    this.ui = ui; this.folded = true; this.ownedInitial = null;
    this.root = document.createElement('aside'); this.root.id = 'experiment-guide';
    this.root.setAttribute('aria-label', 'Experiment guide');
    this.root.innerHTML = `<button id="guide-toggle" aria-expanded="false" aria-controls="guide-body">How it works</button>
      <div id="guide-body" hidden><h2 id="guide-title">A signal. A response.</h2>
      <p id="guide-message">Change the environment. Watch the brain and body respond.</p>
      <p>This computer simulation uses real fly connectome data. It is not a living brain or a complete reproduction of brain biology.</p><p>Model outputs control movement and absorption. App rules handle joint motion, contact linking and visual effects. No new learning or memory formation is implemented.</p><details id="comparison-help"><summary>What happens without neural control?</summary><p>The simulation keeps running, but its outputs no longer drive the Archon’s movement or absorption. Capture a layout, then restart both runs from the same initial conditions.</p></details><div class="guide-actions"><button id="guide-start">Try one source</button><button id="guide-add" hidden>Add second signal</button><button id="guide-capture" hidden>Capture comparison</button></div>
      <div id="guide-comparison" hidden><p>Same start. Only output transmission changes.</p><div class="guide-actions"><button id="guide-connected">Connect &amp; restart</button><button id="guide-blocked">Block &amp; restart</button></div><small>Fresh brain each run · assist off</small></div>
      <p id="guide-status" role="status"></p></div>`;
    scene.append(this.root);
    // Technical comparison explanation lives with the experiment settings.
    ui.root.querySelector('#experiment-details').append(this.root.querySelector('#guide-comparison small'));
    this.nodes = Object.fromEntries([...this.root.querySelectorAll('[id]')].map(n => [n.id, n]));
    this.nodes['guide-toggle'].addEventListener('click', () => { this.folded = !this.folded; });
    this.nodes['guide-start'].addEventListener('click', () => this.start());
    this.nodes['guide-capture'].addEventListener('click', () => this.capture());
    this.nodes['guide-connected'].addEventListener('click', () => this.runComparison(true));
    this.nodes['guide-blocked'].addEventListener('click', () => this.runComparison(false));
    this.nodes['guide-add'].addEventListener('click', () => {
      if (!ui.sourceEditor.editable || ui.brain.world.sources.length >= 2) return;
      // Fixed world location from the original two-source condition; never moved
      // onto a trajectory or placed relative to the moving body.
      const position = neuralCondition('interactive').sources[1].position;
      ui.sourceEditor.selectedId = ui.brain.addSource(position).id;
      ui.frameView(true);
    });
  }
  async start() {
    const b = this.ui.brain;
    if (this.busy || this.ui.experimentFiles.busy || b.experimentBusy || b.status === 'loading') return;
    if (b.initial && !window.confirm('Start a new experiment with one energy source? This replaces the current experiment. Save it first if you want to keep its conditions.')) return;
    this.busy = true; this.error = ''; this.notice = ''; this.folded = false; this.comparison = null;
    const condition = neuralCondition('left'); condition.sources[0].label = 'A';
    this.ui.setPaused(false);
    const ready = b.start({ ...condition, mode: 'interactive', realtime: true,
      outputsEnabled: true, directional: true, assist: false, experimentName: 'One signal' });
    this.ownedInitial = b.initial;
    try {
      await ready;
      if (b.initial !== this.ownedInitial) return;
      this.ui.sourceEditor.selectedId = b.world.sources[0].id;
      this.ui.frameView(true);
    } catch (error) { this.error = error.message; }
    finally { this.busy = false; }
  }
  async capture() {
    const b = this.ui.brain;
    if (this.busy || b.experimentBusy || b.status !== 'running' || b.mode !== 'interactive') return;
    this.busy = true; this.error = ''; this.notice = '';
    try {
      const file = await b.saveExperiment('Signal comparison');
      // Capture does not replace the current session's initial state. Loading a
      // comparison is an explicit new experiment using the existing file path.
      file.settings.assist = false;
      this.comparison = { file, initial: b.initial, editId: b.metrics.edits.at(-1)?.id,
        directional: b.options.directional, assist: b.options.assist };
      this.ownedInitial = b.initial;
      this.notice = 'Layout captured. Choose a run.';
    } catch (error) { this.error = error.message; }
    finally { this.busy = false; }
  }
  async runComparison(outputsEnabled) {
    const b = this.ui.brain, comparison = this.comparison;
    if (!comparison || this.busy || b.experimentBusy || b.status !== 'running') return;
    if (!this.comparisonCurrent()) { this.invalidateComparison(); return; }
    this.busy = true; this.error = ''; this.notice = '';
    const file = { ...comparison.file, settings: { ...comparison.file.settings, outputsEnabled } };
    const ready = b.loadExperiment(JSON.stringify(file));
    this.ownedInitial = b.initial;
    try {
      await ready;
      comparison.initial = b.initial; comparison.editId = b.metrics.edits.at(-1)?.id;
      comparison.directional = b.options.directional; comparison.assist = b.options.assist;
      comparison.run = outputsEnabled;
      this.ui.frameView(true);
      this.ui.setPaused(false);
    } catch (error) { this.error = error.message; }
    finally { this.busy = false; }
  }
  comparisonCurrent() {
    const b = this.ui.brain, c = this.comparison;
    return c && c.initial === b.initial && c.editId === b.metrics.edits.at(-1)?.id
      && c.directional === b.options.directional && c.assist === b.options.assist;
  }
  invalidateComparison() {
    this.comparison = null; this.notice = 'Conditions changed. Capture again to compare.';
  }
  text(id, value) { if (this.nodes[id].textContent !== value) this.nodes[id].textContent = value; }
  update() {
    const { brain: b, preview, playback, sourceEditor } = this.ui;
    if (!this.busy && this.ownedInitial && this.ownedInitial !== b.initial) {
      this.ownedInitial = null; this.comparison = null; this.folded = true; this.error = ''; this.notice = '';
    }
    if (!this.busy && this.comparison && (!this.comparisonCurrent() || b.status === 'off' || b.status === 'error')) this.invalidateComparison();
    const owned = this.ownedInitial === b.initial && !!this.ownedInitial;
    if (b.initial !== this.lastInitial) { this.lastInitial = b.initial; if (!owned && !this.busy) this.folded = true; }
    this.root.hidden = !this.inline && preview.active;
    const intro = (b.status === 'off' || b.status === 'error') && !preview.active;
    const compact = matchMedia('(max-width: 760px)').matches && !!this.ui.root.dataset.panel;
    this.nodes['guide-body'].hidden = !this.inline && (this.folded || compact);
    this.nodes['guide-toggle'].hidden = !!this.inline;
    this.nodes['guide-toggle'].setAttribute('aria-expanded', String(!this.nodes['guide-body'].hidden));
    this.text('guide-toggle', this.folded || compact ? 'How it works' : 'Hide guide');
    this.nodes['guide-start'].hidden = preview.active;
    this.nodes['guide-add'].hidden = !owned || b.world.sources.length !== 1 || b.status === 'off';
    const ready = b.status === 'running' && b.mode === 'interactive';
    this.nodes['guide-capture'].hidden = !ready || !!this.comparison;
    this.nodes['guide-comparison'].hidden = !this.comparison || !ready;
    for (const id of ['guide-start', 'guide-add', 'guide-capture', 'guide-connected', 'guide-blocked']) this.nodes[id].disabled = this.busy || this.ui.experimentFiles.busy || !!b.experimentBusy || b.status === 'loading';
    if (!sourceEditor.editable) this.nodes['guide-add'].disabled = true;
    const count = b.world.sources.length;
    this.root.dataset.comparison = this.comparison ? this.comparison.run === undefined ? 'captured' : this.comparison.run ? 'connected' : 'blocked' : 'none';
    this.text('guide-title', this.comparison ? 'Compare the connection' : intro ? 'A signal. A response.' : owned ? count < 2 ? 'One signal' : 'Two signals' : 'Explore the response');
    const message = intro ? 'Change the environment. Watch the brain and body respond.'
      : b.status === 'loading' ? 'Loading FlyWire v783…'
        : owned && count < 2 ? b.currentCommand?.phase === 'absorb' ? 'A is being absorbed. Add a second signal to explore.' : 'Watch the response to A. You can drag it or add another signal.'
          : 'Drag A or B. Watch the inputs and movement change.';
    this.text('guide-message', this.comparison ? this.comparison.run === undefined ? 'Start either run from the captured layout.' : b.options.outputsEnabled ? 'Neural outputs drive movement and interaction.' : 'Outputs blocked. Neural signals remain visible.' : message);
    this.text('guide-status', this.error || (b.status === 'error' ? b.error : b.experimentBusy ? 'Finishing file operation…' : this.busy ? 'Preparing experiment…' : this.notice || (this.ui.stage.rig.controls.enabled ? 'Turn Orbit off to edit.' : !intro && playback.paused ? 'Paused. Edit the layout, then press Play.' : '')));
  }
}
