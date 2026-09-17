import './style.css';
import './ui/observation.css';
import './ui/experience.css';
import { Stage } from './scene/Stage.js';
import { ArchonEntity } from './archon/ArchonEntity.js';
import { defaults } from './archon/parameters.js';
import { ViewerUI } from './ui/ViewerUI.js';
import { InteractionPreview } from './scene/InteractionPreview.js';
import { NeuralSession } from './neural/NeuralSession.js';

const status = document.querySelector('#status');
let failureContext = 'Could not start WebGL.';

async function start() {
  const parameters = { ...defaults };
  const stage = new Stage(document.querySelector('#app'));
  const source = new URLSearchParams(location.search).get('model') || '/models/archon-rigged.glb';
  failureContext = `Could not load GLB.\n${source}\nCheck the file in public/models. No substitute model was loaded.`;
  if (!source.startsWith('/models/') || source.includes('..') || !source.endsWith('.glb')) {
    throw new Error('The model must be a .glb file in /models/.');
  }
  const entity = new ArchonEntity(parameters, stage.depthTarget, stage.rig.camera);
  await entity.load(source);
  stage.scene.add(entity);
  failureContext = 'Could not start the viewer.';
  const playback = { paused: matchMedia('(prefers-reduced-motion: reduce)').matches };
  const preview = new InteractionPreview(entity, stage.rig.camera);
  stage.scene.add(preview);
  const ui = new ViewerUI(parameters, stage, entity, playback, preview);
  const brain = new NeuralSession(entity, preview, stage.rig.camera, playback,
    (state, error) => ui.updateNeural(state, error));
  stage.scene.add(brain);
  ui.attachNeural(brain);
  status.textContent = 'Ready';
  let time = 0;
  let last = performance.now();
  stage.renderer.setAnimationLoop(now => {
    brain.metrics.frame(now);
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!playback.paused) time += delta;
    ui.updateCamera(delta);
    preview.update(time);
    brain.update(time, playback.paused ? 0 : delta);
    entity.shell.material.uniforms.uNearFar.value.set(stage.rig.camera.near, stage.rig.camera.far);
    entity.update(time, delta, stage.rig.camera);
    ui.updateInteraction();
    ui.updateNeuralReadout();
    stage.render();
  });
  window.archonDebug = {
    brain: {
      start: options => brain.start(options),
      restart: () => brain.restart(),
      saveExperiment: name => brain.saveExperiment(name),
      loadExperiment: text => brain.loadExperiment(text),
      stop: () => brain.stop(),
      configure: options => brain.configure(options),
      addSource: position => brain.addSource(position),
      editSource: (id, patch) => brain.editSource(id, patch),
      removeSource: id => brain.removeSource(id),
      steps: count => brain.steps(count),
      snapshot: () => brain.snapshot(),
    },
    snapshot: options => ({
      ...entity.snapshot(options), parameters: { ...parameters },
      renderedPose: { x: entity.position.x, z: entity.position.z, heading: entity.body.heading ?? 0 },
      gasDepthRange: entity.shell.material.uniforms.uNearFar.value.toArray(),
      cameraPose: { position: stage.rig.camera.position.toArray(), target: stage.rig.controls.target.toArray(),
        quaternion: stage.rig.camera.quaternion.toArray(), zoom: stage.rig.camera.zoom,
        halfWidth: stage.rig.camera.right, halfHeight: stage.rig.camera.top,
        near: stage.rig.camera.near, far: stage.rig.camera.far, keepInView: stage.rig.keepInView ?? false },
      camera: stage.rig.controls.enabled ? 'orbit' : 'fixed',
      drawCalls: stage.renderer.info.render.calls,
      time, paused: playback.paused, effectsVisible: entity.shell.visible,
      previewVisible: preview.visible,
    }),
    setTime: value => { brain.stop('manual-time'); ui.setPaused(true); time = Math.max(0, Number(value) || 0); },
    setVisualState: state => {
      if (state?.interaction) { brain.stop('manual-preview'); preview.cancel(); }
      return entity.setVisualState(state);
    },
    inspectRig: () => {
      entity.updateMatrixWorld(true);
      const bones = [];
      entity.body.traverse(object => {
        if (object.isBone && ['Head', 'neck', 'Spine', 'Spine02', 'LeftArm', 'RightArm'].includes(object.name)) {
          const position = object.position.clone();
          object.getWorldPosition(position);
          entity.body.worldToLocal(position);
          bones.push({ name: object.name, position: position.toArray(), scale: object.scale.toArray(), quaternion: object.quaternion.toArray() });
        }
      });
      return bones;
    },
    setLayerVisible: (name, visible) => {
      const layer = entity.children.find(child => child.name === name);
      if (layer) layer.visible = visible;
    },
  };
  if (new URLSearchParams(location.search).get('brain') === '1') {
    ui.setPaused(false);
    ui.runNeuralCondition(new URLSearchParams(location.search).get('trial') || 'near');
  } else if (ui.publicExperience) {
    const pausedAtStart = playback.paused;
    const ready = ui.runNeuralCondition('interactive');
    if (pausedAtStart) ui.setPaused(true);
    await ready;
    if (brain.status === 'running') ui.frameView(true);
  }
}

start().catch(error => {
  status.setAttribute('role', 'alert');
  status.textContent = `${failureContext}\n${error.message}`;
});
