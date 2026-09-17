import { projectOverview } from './projectOverview.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const lucideIcon = (className, paths) => {
  const icon = document.createElementNS(SVG_NS, 'svg');
  icon.classList.add(className, 'process-icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = paths;
  return icon;
};

// Public presentation of the existing experiment. No simulation or target policy.
export class ExperienceLayout {
  constructor(ui) {
    this.ui = ui;
    const root = ui.root;
    document.documentElement.classList.add('experience-page');
    root.classList.replace('workbench-ui', 'experience-ui');
    // Existing controllers retain their references. These controls belong to the
    // separate tools entry, not an undisclosed menu in the public experience.
    const internals = document.createElement('div');
    internals.id = 'experiment-internals'; internals.hidden = true; internals.inert = true;
    root.append(internals);
    const camera = root.querySelector('.camera-tools');
    camera.append(root.querySelector('#view-all'), root.querySelector('#orbit'));
    for (const selector of ['nav', '#app-intro', '#experiment-files', '#experiment-status', '#tune', '#tuning-panel', '#learn-section', '#site-footer', '#view-archon', '#keep-in-view', '#view-menu', '#pause', '#view-mode', '#neural-status', '#brain-expand', '#brain-dialog', '#environment-empty', '#source-editor', '.map-legend']) {
      internals.append(root.querySelector(selector));
    }
    this.process = root.querySelector('.signal-path');
    this.process.id = 'experience-process';
    const brainIcon = lucideIcon('lucide-brain', '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>');
    const radioIcon = lucideIcon('lucide-radio-tower', '<path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/>');
    const moveIcon = lucideIcon('lucide-move-up-right', '<path d="M13 5h6v6"/><path d="m19 5-14 14"/>');
    this.process.querySelector('span:nth-of-type(1)').prepend(radioIcon);
    this.process.querySelector('span:nth-of-type(2)').prepend(brainIcon);
    this.process.querySelector('span:nth-of-type(3)').prepend(moveIcon);
    this.process.querySelector('span:nth-of-type(1) small').textContent = 'Simulated odor inputs';
    this.process.querySelector('span:nth-of-type(2) small').textContent = 'Fly-connectome model';
    this.process.querySelector('span:nth-of-type(3) small').textContent = 'Measured outputs · body control';
    root.querySelector('#orbit span').textContent = 'Free view';
    root.querySelector('#orbit').title = 'Rotate, pan, and zoom';
    root.querySelector('#restart').textContent = 'Start over';
    root.querySelector('#restart').title = 'Restart with the original two sources';
    this.instruction = document.createElement('p');
    this.instruction.id = 'experience-instruction';
    root.querySelector('.viewer-header').append(this.instruction);
    this.energy = document.createElement('section');
    this.energy.id = 'source-energy';
    this.energy.innerHTML = '<h3>Energy left</h3>';
    root.querySelector('#environment-panel').append(this.energy, root.querySelector('#source-connection'));
    root.querySelector('#spike-definition').textContent = 'Network spikes / 100 ms · last 8 s';
    this.signal = document.createElement('section');
    this.signal.id = 'experience-signal';
    this.signal.innerHTML = '<h3>Signal details</h3><p id="experience-signal-values"><span id="experience-signal-input">Waiting for the first completed sample…</span><span id="experience-signal-output"></span></p>';
    root.querySelector('#neural-panel').append(this.signal);
    this.rows = new Map();
    this.explanation = document.createElement('section');
    this.explanation.id = 'experience-explanation';
    this.explanation.innerHTML = projectOverview;
    this.explanation.querySelector('#how-heading').after(this.process);
    root.insertBefore(this.explanation, root.querySelector('.viewer-footer'));
    root.querySelector('#environment-panel').append(root.querySelector('.viewer-footer'));
  }
  update() {
    const { brain, root, playback } = this.ui;
    const instruction = brain.status === 'error' ? 'The neural model stopped. Start over to retry.'
      : brain.status === 'loading' ? 'Loading the fly brain…'
        : brain.world.sources.length === 0 ? 'No sources. Use Start over to restore A and B.' : '';
    if (this.instruction.textContent !== instruction) this.instruction.textContent = instruction;
    this.instruction.hidden = !instruction;
    const row = brain.last;
    const input = row?.response?.inputs;
    const output = row?.response?.outputs;
    const fmt = value => Number.isFinite(value) ? value.toFixed(1) : '—';
    const inputText = input
      ? `Input L/R ${fmt(input.signalLeft)} / ${fmt(input.signalRight)} Hz · contact ${fmt(input.contactSugar)} Hz`
      : brain.status === 'loading' ? 'Waiting for the first completed neural sample…' : 'No completed neural sample';
    const outputText = output
      ? `Move L/R ${fmt(output.goLeft)} / ${fmt(output.goRight)} Hz · Turn L/R ${fmt(output.turnLeft)} / ${fmt(output.turnRight)} Hz`
      : '';
    this.signal.querySelector('#experience-signal-input').textContent = inputText;
    this.signal.querySelector('#experience-signal-output').textContent = outputText;
    const restart = root.querySelector('#restart');
    restart.disabled = brain.status === 'loading' || Boolean(brain.experimentBusy);
    const startLabel = playback.paused && brain.status === 'running' ? 'Start' : 'Start over';
    if (restart.textContent !== startLabel) restart.textContent = startLabel;
    restart.title = startLabel === 'Start' ? 'Start the current arrangement' : 'Restart with the original two sources';
    for (const [id, row] of this.rows) if (!brain.world.sources.some(s => s.id === id)) { row.remove(); this.rows.delete(id); }
    for (const source of brain.world.sources) {
      if (!this.rows.has(source.id)) {
        const row = document.createElement('div'); row.className = 'energy-row'; row.dataset.sourceId = source.id;
        row.innerHTML = '<span></span><meter min="0" max="1"></meter><output></output>';
        this.energy.append(row); this.rows.set(source.id, row);
      }
      const row = this.rows.get(source.id), label = source.label || source.id;
      row.querySelector('span').textContent = label;
      const meter = row.querySelector('meter');
      meter.value = source.remaining; meter.setAttribute('aria-label', `Source ${label} energy left`);
      row.querySelector('output').textContent = `${Math.round(source.remaining * 100)}%`;
    }
  }
}
