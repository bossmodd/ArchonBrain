import { OUTPUTS } from './NeuralModel.js';
import { WORLD_CONFIG } from './NeuralWorld.js';

export const CONTROL_CONFIG = Object.freeze({ smoothingSeconds: 0.15, feedStartHz: 12, feedHoldHz: 6,
  startHoldSeconds: 0.2, stopHoldSeconds: 0.3, preparationSeconds: 1.2,
  maxSpeed: 1, forwardScaleHz: 12, backwardScaleHz: 30, turnScaleHz: 50, maxYaw: 1.1, maxAssistYaw: 0.2 });
export const REMOTE_CONTROL_CONFIG = Object.freeze({ ...CONTROL_CONFIG, turnScaleHz: 10 });
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

export class NeuralController {
  constructor({ profile = 'lc11' } = {}) {
    this.profile = profile;
    this.filtered = Object.fromEntries(Object.keys(OUTPUTS).map(k => [k, 0]));
    this.phase = 'idle';
    this.targetId = null;
    this.above = this.below = this.phaseTime = 0;
  }
  stop(reason, dt = 0) {
    if (this.phase === 'prepare' || this.phase === 'absorb') { this.phase = 'release'; this.phaseTime = 0; }
    else if (this.phase === 'release') {
      this.phaseTime += dt;
      if (this.phaseTime >= 1.1) { this.phase = 'idle'; this.phaseTime = 0; }
    }
    this.above = this.below = 0;
    for (const k in this.filtered) this.filtered[k] = 0;
    this.targetId = null;
    return { speed: 0, yaw: 0, neuralSpeed: 0, neuralYaw: 0, assistYaw: 0, feed: 0, phase: this.phase, targetId: null, reason };
  }
  step(outputs, sense, dt, { outputsEnabled = true, assist = false } = {}) {
    if (!outputsEnabled) return this.stop('outputs-blocked', dt);
    if (Object.keys(OUTPUTS).some(k => !Number.isFinite(outputs[k]) || outputs[k] < 0)) throw new Error('Invalid neural outputs');
    const c = this.profile === 'olfactory' ? REMOTE_CONTROL_CONFIG : CONTROL_CONFIG;
    for (const k in this.filtered) this.filtered[k] += (outputs[k] - this.filtered[k]) * (1 - Math.exp(-dt / c.smoothingSeconds));
    const f = this.filtered;
    const forwardHz = this.profile === 'olfactory' ? Math.max(f.forward, f.goLeft, f.goRight) : f.forward;
    const neuralSpeed = clamp(forwardHz / c.forwardScaleHz - f.backward / c.backwardScaleHz, -1, 1) * c.maxSpeed;
    const neuralYaw = clamp((f.turnLeft - f.turnRight) / c.turnScaleHz, -1, 1) * c.maxYaw;
    const feedHz = (f.feedLeft + f.feedRight) / 2;
    const target = sense.target;
    const contact = target && target.distance <= WORLD_CONFIG.contactRange && target.emission > 0;
    const active = this.phase === 'prepare' || this.phase === 'absorb';
    let reason = !target ? (sense.targetReason === 'contact-tie' ? 'contact-tie' : 'no-target') : target.emission <= 0 ? 'no-signal' : !contact ? 'out-of-range' : 'waiting-for-MN9';
    this.phaseTime += dt;
    if (this.candidateId !== target?.id) this.above = 0;
    this.candidateId = target?.id;
    this.above = contact && feedHz >= c.feedStartHz ? this.above + dt : 0;
    this.below = feedHz < c.feedHoldHz ? this.below + dt : 0;
    const release = why => { this.phase = 'release'; this.phaseTime = 0; this.above = 0; this.targetId = null; reason = why; };
    if (active && (!contact || this.targetId !== target?.id)) release(!target ? 'no-target' : !contact ? 'out-of-range' : 'target-changed');
    else if (active && this.below >= c.stopHoldSeconds) release('MN9-below-hold');
    else if (this.phase === 'prepare' && this.phaseTime >= c.preparationSeconds) { this.phase = 'absorb'; this.phaseTime = 0; reason = 'MN9-maintained'; }
    else if (this.phase === 'release' && this.phaseTime >= 1.1) { this.phase = 'idle'; this.phaseTime = 0; }
    else if (this.phase === 'idle' && this.above >= c.startHoldSeconds) { this.phase = 'prepare'; this.phaseTime = 0; this.targetId = target.id; reason = 'MN9-above-start'; }
    else if (active) reason = 'MN9-maintained';
    // Optional small correction only while neural walking is already present.
    // There is no independent cruise speed, target pursuit or absorption trigger.
    const holding = this.phase === 'prepare' || this.phase === 'absorb';
    const assistYaw = assist && target && !holding ? c.maxAssistYaw * Math.sin(target.bearing) * clamp(neuralSpeed / c.maxSpeed, 0, 1) : 0;
    return { speed: holding ? 0 : neuralSpeed, yaw: holding ? 0 : clamp(neuralYaw + assistYaw, -c.maxYaw, c.maxYaw),
      neuralSpeed, neuralYaw, assistYaw, feed: clamp(feedHz / 80, 0, 1), feedHz,
      phase: this.phase, targetId: this.targetId, reason, filtered: { ...f } };
  }
}
