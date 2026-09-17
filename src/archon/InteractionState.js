import { Vector3, MathUtils } from 'three';

const phases = new Set(['idle', 'prepare', 'absorb', 'release']);
const ease = value => { const t = MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); };

// An animation envelope, not a behavior controller. Only incoming signals
// choose whether to prepare, absorb or release; there is no target selection.
export class InteractionState {
  constructor() {
    this.time = 0;
    this.changedAt = 0;
    this.phase = 'idle';
    this.pose = this.flow = this.charge = 0;
    this.windup = this.extension = this.impulse = 0;
    this.from = { pose: 0, flow: 0, charge: 0, windup: 0, extension: 0, impulse: 0 };
    this.target = new Vector3();
    this.destination = new Vector3();
    this.hasTarget = false;
    this.intensity = 1;
  }
  set({ phase, target, intensity } = {}) {
    if (!phases.has(phase)) return false;
    const active = phase === 'prepare' || phase === 'absorb';
    if (target && ![target.x, target.y, target.z].every(Number.isFinite)) return false;
    if (active && !target && !this.hasTarget) return false;
    if (target) {
      this.destination.copy(target);
      if (!this.hasTarget) this.target.copy(target);
      this.hasTarget = true;
    }
    if (Number.isFinite(intensity)) this.intensity = MathUtils.clamp(intensity, 0, 1);
    const next = phase === 'idle' ? (this.phase === 'idle' ? 'idle' : 'release') : phase;
    if (next !== this.phase) {
      this.from = { pose: this.pose, flow: this.flow, charge: this.charge, windup: this.windup, extension: this.extension, impulse: this.impulse };
      this.phase = next;
      this.changedAt = this.time;
    }
    return true;
  }
  update(time) {
    const delta = Math.max(0, time - this.time);
    this.time = time;
    this.target.lerp(this.destination, 1 - Math.exp(-delta * 6));
    const elapsed = Math.max(0, time - this.changedAt);
    const active = this.phase === 'prepare' || this.phase === 'absorb';
    const absorbing = this.phase === 'absorb';
    this.pose = MathUtils.lerp(this.from.pose, active ? 1 : 0, ease(elapsed / (absorbing ? 0.7 : 1.1)));
    this.windup = MathUtils.lerp(this.from.windup, this.phase === 'prepare' ? 1 : 0, ease(elapsed / (absorbing ? 0.32 : 0.72)));
    this.extension = MathUtils.lerp(this.from.extension, active ? (absorbing ? 1 : 0.12) : 0, ease(elapsed / (absorbing ? 0.38 : 1.1)));
    const accent = absorbing && elapsed < 0.6 ? Math.sin(Math.PI * elapsed / 0.6) ** 2 : 0;
    this.impulse = this.from.impulse * (1 - ease(elapsed / 0.3)) + accent * (1 - this.from.impulse);
    this.charge = MathUtils.lerp(this.from.charge, active ? (absorbing ? 1 : 0.65) : 0, ease(elapsed / (active ? 0.8 : 0.55)));
    this.flow = MathUtils.lerp(this.from.flow, absorbing ? 1 : 0, ease(elapsed / 0.4));
    if (this.phase === 'release' && elapsed >= 1.1) this.phase = 'idle';
    return {
      phase: this.phase, pose: this.pose, charge: this.charge,
      flow: this.flow * ease((this.pose - 0.45) / 0.55) * ease((this.extension - 0.2) / 0.8),
      windup: this.windup, extension: this.extension, impulse: this.impulse,
      intensity: this.intensity, target: this.target, source: this.destination,
    };
  }
}
