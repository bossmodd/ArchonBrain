import { Group, Vector3 } from 'three';
import { EnergyKnot } from '../archon/EnergyKnot.js';

// A viewer-only demonstration timeline. It sends the same public signals as
// an external controller; it does not select targets, approach or absorb resources.
export class InteractionPreview extends Group {
  constructor(entity, camera) {
    super();
    this.name = 'InteractionPreview';
    this.entity = entity;
    this.camera = camera;
    this.target = new Vector3(3.5, 3.3, 1.2);
    this.source = new EnergyKnot(0.3);
    this.source.position.copy(this.target);
    this.add(this.source);
    this.active = this.visible = false;
    this.time = 0;
    this.startedAt = this.releasedAt = 0;
  }
  start() {
    this.active = this.visible = true;
    this.startedAt = this.time;
    this.absorbing = false;
    this.entity.setVisualState({ interaction: { phase: 'prepare', target: this.target, intensity: 1 } });
  }
  stop() {
    this.active = false;
    this.releasedAt = this.time;
    this.entity.setVisualState({ interaction: { phase: 'release' } });
  }
  cancel() { this.active = this.visible = false; }
  update(time) {
    this.time = time;
    if (!this.visible) return;
    const elapsed = time - this.startedAt;
    if (this.active && elapsed >= 1.2 && !this.absorbing) {
      this.entity.setVisualState({ interaction: { phase: 'absorb', target: this.target } });
      this.absorbing = true;
    }
    if (this.active && elapsed >= 5.8) this.stop();
    const strength = this.active ? Math.min(1, Math.max(0, elapsed) / 0.35) : Math.max(0, 1 - (time - this.releasedAt) / 1.1);
    this.source.update(time, strength * 0.82, this.camera);
    if (!this.active && strength <= 0) this.visible = false;
  }
}
