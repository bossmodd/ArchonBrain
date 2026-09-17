import { NeuralReadout } from './NeuralReadout.js';
import { EnvironmentMap } from './EnvironmentMap.js';
import { ExperimentGuide } from './ExperimentGuide.js';
import { SignalFeedback } from './SignalFeedback.js';
import { ExperienceLayout } from './ExperienceLayout.js';
// Moves existing controls; owns presentation only, never a simulation clock.
export class ObservationLayout {
  constructor(ui) {
    this.ui = ui;
    const root = ui.root;
    root.classList.add('observation-ui', 'workbench-ui');
    root.dataset.theme = new URLSearchParams(location.search).get('uiTheme') === 'plain' ? 'plain' : 'brass';
    const make = (tag, id, html = '') => {
      const node = document.createElement(tag); node.id = id; node.innerHTML = html; return node;
    };
    this.left = make('aside', 'neural-panel', '<h2>Neural activity</h2><div id="neural-flow"></div>');
    this.left.setAttribute('aria-label', 'Neural activity');
    this.right = make('aside', 'environment-panel', '<h2>Environment</h2><div id="minimap-host"></div><p id="environment-empty">Enter Interact to place and edit sources.</p>');
    this.right.setAttribute('aria-label', 'Environment');
    this.scene = make('main', 'scene-viewport'); this.scene.className = 'scene-surface';
    this.scene.setAttribute('aria-label', 'Archon scene');
    const observation = make('section', 'observation-stage');
    const archon = make('section', 'archon-panel', '<div class="observation-heading"><h2>Archon</h2></div>');
    archon.append(this.scene);
    observation.append(this.left, archon, this.right);
    root.append(observation);
    const safeArea = make('div', 'scene-safe-area');
    safeArea.setAttribute('aria-hidden', 'true');
    this.scene.append(safeArea);
    this.scene.append(ui.stage.renderer.domElement, ui.sourceEditor.layer, root.querySelector('.camera-tools'), root.querySelector('.layer-switch'), root.querySelector('#interaction-state'));
    root.querySelector('.camera-tools').append(root.querySelector('#orbit'));
    this.right.append(ui.sourceEditor.panel);
    const details = make('details', 'runtime-details', '<summary>Timing & sample details</summary>');
    details.append(ui.diagnostics); this.left.append(details);
    const footer = root.querySelector('.viewer-footer');
    root.insertBefore(observation, footer);
    footer.prepend(root.querySelector('#pause'), ui.restartControl.$button);
    ui.restartControl.domElement.remove();
    ui.restartControl.$button.id = 'restart';
    const header = root.querySelector('.viewer-header');
    header.append(ui.experimentFiles.panel, root.querySelector('#tune'));
    const help = ui.experimentFiles.panel.querySelector('p');
    help.id = 'experiment-help';
    root.querySelector('#tuning-panel').append(help);
    this.scene.append(document.querySelector('#status'));
    ui.stage.observeViewport(this.scene, safeArea);
    this.readout = new NeuralReadout(ui);
    const expand = make('button', 'brain-expand', 'Expand');
    expand.setAttribute('aria-haspopup', 'dialog');
    this.left.querySelector('h2').append(expand);
    const dialog = make('dialog', 'brain-dialog', '<header><h2>Neural activity</h2><button id="brain-close">Close</button></header><div id="expanded-brain"></div>');
    dialog.setAttribute('aria-label', 'Neural activity');
    root.append(dialog);
    const brainView = root.querySelector('#brain-activity');
    const caption = make('div', 'brain-view-home');
    brainView.before(caption);
    caption.append(brainView);
    expand.addEventListener('click', () => {
      caption.style.height = `${brainView.getBoundingClientRect().height}px`;
      dialog.querySelector('#expanded-brain').append(brainView);
      dialog.showModal();
    });
    dialog.querySelector('#brain-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { caption.append(brainView); caption.style.height = ''; expand.focus({ preventScroll: true }); });
    // Native dialog handles Escape/focus trapping. Viewer keyboard shortcuts
    // must not also run while the focused modal is handling the same key.
    dialog.addEventListener('keydown', event => event.stopPropagation());
    this.readout.root.querySelector('#neural-detail').append(details);
    this.readout.root.querySelector('#neural-detail').append(root.querySelector('#interaction-state'));
    const engine = make('section', 'engine-control', '<h3>Neural engine</h3>');
    engine.append(root.querySelector('#neural-toggle'));
    root.querySelector('#tuning-panel').prepend(engine);
    const experimentDetail = make('details', 'experiment-details', '<summary>Experiment details</summary>');
    experimentDetail.append(root.querySelector('#experiment-current'), help);
    root.querySelector('#tuning-panel').append(experimentDetail);
    this.map = new EnvironmentMap(ui);
    const learn = make('section', 'learn-section');
    root.append(learn);
    this.guide = new ExperimentGuide(ui, learn);
    this.guide.inline = true;
    const intro = make('section', 'app-intro', '<div><strong>A simulated fly brain drives this Archon.</strong><p>Move the energy sources and watch the brain and body respond.</p></div><div class="signal-path" aria-label="Source signals to neural activity to movement and absorption"><span>Source signals<small>Odor input</small></span><b aria-hidden="true">→</b><span>Neural activity<small>Fly brain model</small></span><b aria-hidden="true">→</b><span>Movement &amp; absorption<small>Neural outputs</small></span></div><div id="first-experience"><small>Start with one energy source.</small></div>');
    header.append(intro);
    const explanation = make('section', 'learn-introduction', '<h2>How it works</h2><p>Energy sources send odor signals into a simulated fly brain. Its neural outputs drive the Archon’s movement and absorption. Move a source to change what the brain receives.</p>');
    learn.prepend(explanation);
    const learnLink = make('a', 'learn-link', 'How it works ↓');
    learnLink.href = '#learn-section';
    intro.firstElementChild.querySelector('p').append(' ', learnLink);
    intro.querySelector('#first-experience').prepend(root.querySelector('#guide-start'));
    const instruction = make('p', 'source-instruction', 'Select A or B, then drag its marker to move the source.');
    explanation.append(instruction);
    this.feedback = new SignalFeedback(ui, this.scene);
    details.append(this.feedback.root);
    const experiment = make('details', 'experiment-menu', '<summary>Experiment</summary><div class="menu-content"></div>');
    root.querySelector('#tuning-panel').append(experiment);
    experiment.querySelector('.menu-content').append(experimentDetail);
    header.append(ui.experimentFiles.status);
    const view = make('details', 'view-menu', '<summary>View</summary><div class="menu-content"></div>');
    root.querySelector('.camera-tools').append(view);
    view.querySelector('.menu-content').append(root.querySelector('#view-all'), root.querySelector('#orbit'));
    root.querySelector('.camera-tools').append(root.querySelector('#keep-in-view'));
    const developer = make('details', 'developer-tools', '<summary>Developer tools</summary><p>Manual preview and rendering controls are separate from neural experiments.</p>');
    root.querySelector('#tuning-panel').append(developer);
    root.querySelector('nav').append(root.querySelector('#interaction-preview'));
    developer.append(root.querySelector('.layer-switch'), engine, root.querySelector('#gui-container'), root.querySelector('#reset'), details, this.map.details);
    const signalDetail = root.querySelector('#neural-detail');
    const model = make('details', 'model-diagnostics', '<summary>Model &amp; sample diagnostics</summary>');
    for (const id of ['sample-time', 'model-detail', 'model-state', 'action-reason', 'action-transition', 'action-assist', 'interaction-state']) model.append(root.querySelector('#' + id));
    developer.append(model, root.querySelector('#output-raw').parentElement);
    // Source/brain readouts keep direct references after moving their nodes.
    signalDetail.querySelector('#atlas-definition').after(root.querySelector('#atlas-caption'));
    const brainExplanation = make('section', 'brain-explanation', '<h2>What the brain view shows</h2><p>Each point is a model neuron’s mapped location. Gold marks delivered sensory inputs; cyan marks recorded motor spikes. The graph shows actual network activity.</p>');
    const atlasDetail = make('details', 'atlas-details', '<summary>About the neuron map</summary>');
    atlasDetail.append(root.querySelector('#atlas-description'), root.querySelector('#atlas-definition'), root.querySelector('#atlas-caption'));
    signalDetail.append(atlasDetail);
    brainExplanation.append(signalDetail);
    const activityCaption = make('div', 'activity-caption');
    root.querySelector('.spike-strip').before(activityCaption);
    activityCaption.append(root.querySelector('#spike-definition'), root.querySelector('#activity-sample'));
    root.querySelector('.spike-strip svg').setAttribute('preserveAspectRatio', 'none');
    learn.append(brainExplanation);
    const advanced = make('button', 'open-advanced', 'Developer tools');
    explanation.append(advanced);
    advanced.addEventListener('click', () => {
      header.scrollIntoView({ block: 'start' });
      if (root.querySelector('#tune').getAttribute('aria-expanded') !== 'true') root.querySelector('#tune').click();
      developer.open = true;
    });
    archon.querySelector('.observation-heading').append(root.querySelector('.camera-tools'));
    const comparisonHelp = root.querySelector('#comparison-help');
    comparisonHelp.append(root.querySelector('#guide-capture'), root.querySelector('#guide-comparison'));
    const limits = make('details', 'model-limits', '<summary>About the model and its limits</summary>');
    for (const paragraph of root.querySelectorAll('#guide-body > p:not([id])')) limits.append(paragraph);
    limits.append(instruction, advanced);
    explanation.append(limits);
    const comparison = make('section', 'comparison-explanation', '<h2>Compare neural control</h2><p>Compare behavior with and without neural outputs from the same starting conditions. Neural computation continues in both runs.</p>');
    learn.append(comparison);
    comparison.append(this.guide.root);
    comparisonHelp.querySelector('summary').textContent = 'Open comparison tools';
    comparisonHelp.querySelector('summary').after(root.querySelector('#guide-title'), root.querySelector('#guide-message'));
    comparisonHelp.append(root.querySelector('#guide-body > .guide-actions'), root.querySelector('#guide-status'));
    // Put the explanatory columns in reading order without copying controls.
    learn.append(brainExplanation, comparison);
    root.append(make('footer', 'site-footer', '<strong>ArchonBrain</strong><span>A simulation using the FlyWire v783 connectome.</span><a href="#learn-section">How it works</a>'));
    // Native disclosures hide descendants from focus. Menus stay within the UI.
    for (const menu of [experiment, view]) menu.addEventListener('keydown', event => {
      if (event.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); event.stopPropagation(); }
    });
    if (ui.publicExperience) this.experience = new ExperienceLayout(ui);
  }
}
