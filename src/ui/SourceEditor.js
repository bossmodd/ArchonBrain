import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { WORLD_CONFIG } from '../neural/NeuralWorld.js';

// Pointer/selection adapter only. NeuralSession owns every source and action.
export class SourceEditor {
  constructor(brain, stage, root) {
    Object.assign(this, { brain, stage, root });
    this.canvas = stage.renderer.domElement;
    this.ray = new Raycaster();
    this.pointer = new Vector2();
    this.plane = new Plane(new Vector3(0, 1, 0), 0);
    this.selectedId = null;
    this.handles = new Map();
    this.panel = document.createElement('section');
    this.panel.id = 'source-editor';
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', 'Source editing');
    this.panel.innerHTML = `<div class="source-toolbar"><strong>Energy sources</strong><span class="source-choices"></span><button type="button" id="delete-source" disabled>Delete selected</button></div>
      <label class="source-strength">Signal strength <input id="source-strength" type="range" min="0" max="1" step="0.05" disabled><output id="source-power">—</output></label>
      <div id="source-detail">Select A or B</div><div id="source-hint"></div>
      <small>Baseline strength: 1. Other strengths are unverified.</small>`;
    this.layer = document.createElement('div');
    this.layer.className = 'source-handles';
    root.append(this.layer, this.panel);
    this.range = this.panel.querySelector('input');
    this.deleteButton = this.panel.querySelector('#delete-source');
    this.fields = document.createElement('div'); this.fields.id = 'source-fields';
    this.remaining = document.createElement('div'); this.remaining.id = 'source-remaining';
    this.fields.append(this.panel.querySelector('.source-strength'), this.remaining, this.deleteButton);
    this.panel.querySelector('.source-toolbar').after(this.panel.querySelector('#source-detail'), this.fields);
    this.range.addEventListener('input', event => {
      if (this.editable && this.selectedId) brain.editSource(this.selectedId, { strength: Number(this.range.value) }, event.timeStamp);
    });
    this.deleteButton.addEventListener('click', event => {
      if (this.editable && this.selectedId) brain.removeSource(this.selectedId, event.timeStamp);
      this.selectedId = null;
    });
    this.canvas.addEventListener('pointerdown', event => {
      if (!this.editable || event.button !== 0 || !event.isPrimary || event.ctrlKey || event.metaKey || event.altKey) return;
      this.placement = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointerup', event => {
      const start = this.placement; this.placement = null;
      if (!start || !this.editable || start.pointerId !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
      const point = this.point(event, 0);
      if (point && Math.abs(point.x) < 19.2 && Math.abs(point.z) < 19.2 && brain.world.sources.length < 2) {
        this.selectedId = brain.addSource({ x: point.x, y: WORLD_CONFIG.centerHeight, z: point.z }, event.timeStamp).id;
      }
    });
    this.canvas.addEventListener('pointercancel', () => { this.placement = null; });
  }
  get editable() {
    return this.brain.mode === 'interactive' && this.brain.status === 'running' && !this.brain.experimentBusy && !this.stage.rig.controls.enabled;
  }
  point(event, height) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.stage.rig.camera);
    this.plane.constant = -height;
    return this.ray.ray.intersectPlane(this.plane, new Vector3());
  }
  addHandle(source) {
    const handle = document.createElement('button');
    handle.className = 'source-handle';
    handle.type = 'button';
    handle.textContent = source.label;
    handle.setAttribute('aria-label', `Move source ${source.label}`);
    handle.addEventListener('click', () => { if (this.editable) this.selectedId = source.id; });
    handle.addEventListener('pointerdown', event => {
      if (!this.editable || event.button !== 0 || !event.isPrimary) return;
      const current = this.brain.world.sources.find(s => s.id === source.id);
      if (!current) return;
      this.selectedId = source.id;
      const point = this.point(event, current.position.y);
      if (!point) return;
      this.drag = { id: source.id, pointerId: event.pointerId, height: current.position.y,
        offsetX: current.position.x - point.x, offsetZ: current.position.z - point.z };
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener('pointermove', event => {
      const drag = this.drag;
      if (!this.editable || !drag || drag.id !== source.id || drag.pointerId !== event.pointerId) return;
      if (!this.brain.world.sources.some(s => s.id === drag.id)) { this.drag = null; return; }
      const point = this.point(event, drag.height);
      if (point) this.brain.editSource(drag.id, { position: {
        x: Math.max(-19.2, Math.min(19.2, point.x + drag.offsetX)), y: drag.height,
        z: Math.max(-19.2, Math.min(19.2, point.z + drag.offsetZ)),
      } }, event.timeStamp);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(name, () => { this.drag = null; });
    const choice = document.createElement('button');
    choice.type = 'button'; choice.textContent = source.label;
    choice.setAttribute('aria-label', `Select source ${source.label}`);
    choice.addEventListener('click', () => { this.selectedId = source.id; });
    this.panel.querySelector('.source-choices').append(choice);
    this.layer.append(handle);
    this.handles.set(source.id, { handle, choice });
  }
  update() {
    const visible = this.brain.mode === 'interactive' && this.brain.status !== 'off';
    this.panel.hidden = this.layer.hidden = !visible;
    if (!visible) { this.drag = this.placement = null; return; }
    const sources = this.brain.world.sources;
    for (const [id, { handle, choice }] of this.handles) if (!sources.some(s => s.id === id)) {
      handle.remove(); choice.remove(); this.handles.delete(id);
    }
    if (!sources.some(s => s.id === this.selectedId)) this.selectedId = null;
    const rect = this.canvas.getBoundingClientRect();
    for (const source of sources) {
      if (!this.handles.has(source.id)) this.addHandle(source);
      const { handle, choice } = this.handles.get(source.id);
      if (handle.textContent !== source.label) {
        handle.textContent = choice.textContent = source.label;
        handle.setAttribute('aria-label', `Move source ${source.label}`);
        choice.setAttribute('aria-label', `Select source ${source.label}`);
      }
      const point = new Vector3(source.position.x, source.position.y, source.position.z).project(this.stage.rig.camera);
      handle.style.left = `${(point.x + 1) * rect.width / 2}px`;
      handle.style.top = `${(1 - point.y) * rect.height / 2}px`;
      handle.hidden = Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || Math.abs(point.z) > 1;
      handle.disabled = choice.disabled = !this.editable;
      handle.setAttribute('aria-pressed', String(source.id === this.selectedId));
      choice.setAttribute('aria-pressed', String(source.id === this.selectedId));
    }
    const selected = sources.find(s => s.id === this.selectedId);
    this.range.disabled = this.deleteButton.disabled = !selected || !this.editable;
    this.fields.hidden = !selected;
    if (selected) this.range.value = selected.strength;
    this.panel.querySelector('#source-power').textContent = selected ? selected.strength.toFixed(2) : '—';
    this.panel.querySelector('#source-detail').textContent = selected ? `Editing ${selected.label}` : 'Select A or B';
    this.remaining.textContent = selected ? `Energy left ${(selected.remaining * 100).toFixed(1)}%` : '';
    this.panel.querySelector('#source-hint').textContent = this.brain.status !== 'running' ? `Model ${this.brain.status}` : this.stage.rig.controls.enabled ? 'Turn Orbit off to edit sources.' : `${sources.length}/2 sources · ${sources.length < 2 ? 'Click floor to add.' : 'Delete a source to add another.'} Drag A/B to move.`;
  }
}
