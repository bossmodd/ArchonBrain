export const WORLD_CONFIG = Object.freeze({ centerHeight: 2.4, contactRange: 2.3, signalDistance: 6, absorptionPerSecond: 0.12 });
// Source spatial concentration/contrast/log-rate adapter, scaled to this body.
export const SIGNAL_CONFIG = Object.freeze({ sensorOffset: 0.6, contrast: 12, rateScaleHz: 14, concentrationGain: 5, maxHz: 48 });
const clamp = value => Math.max(0, Math.min(1, value));
const angle = value => Math.atan2(Math.sin(value), Math.cos(value));

export class NeuralWorld {
  constructor({ profile = 'lc11', directional = true } = {}) {
    this.profile = profile;
    this.directional = directional;
    this.pose = { x: 0, z: 0, heading: 0 };
    this.sources = [];
    this.time = 0;
  }
  setSources(sources) {
    const ids = new Set();
    this.sources = sources.map(source => {
      const { id, label, position, strength = 1, remaining = 1 } = source;
      if (!id || ids.has(id)) throw new Error('Source IDs must be unique');
      if (![position?.x, position?.y, position?.z, strength, remaining].every(Number.isFinite)) throw new Error('Source values must be finite');
      ids.add(id);
      return { id, ...(label ? { label } : {}), position: { ...position }, strength: clamp(strength), remaining: clamp(remaining) };
    });
  }
  sense(connectedId = null) {
    const inputs = { visualLeft: 0, visualRight: 0, contactSugar: 0 };
    const contributions = [];
    let concentrationLeft = 0, concentrationRight = 0;
    let target = null;
    for (const source of this.sources) {
      const emission = source.strength * source.remaining;
      const dx = source.position.x - this.pose.x, dz = source.position.z - this.pose.z;
      const distance = Math.hypot(dx, source.position.y - WORLD_CONFIG.centerHeight, dz);
      const bearing = angle(Math.atan2(dx, dz) - this.pose.heading);
      const signal = emission / (1 + (distance / WORLD_CONFIG.signalDistance) ** 2);
      // Engineering sensory proxy at the visual projection layer, not a retina simulation.
      // +X is the rig's anatomical left; +heading turns toward +X from +Z.
      const visual = 120 * signal * (0.2 + 0.8 * Math.max(0, Math.cos(bearing)));
      inputs.visualLeft += visual * (1 - 0.85 * Math.max(0, -Math.sin(bearing)));
      inputs.visualRight += visual * (1 - 0.85 * Math.max(0, Math.sin(bearing)));
      const lateralX = Math.cos(this.pose.heading) * SIGNAL_CONFIG.sensorOffset;
      const lateralZ = -Math.sin(this.pose.heading) * SIGNAL_CONFIG.sensorOffset;
      const concentration = side => emission / (1 + (Math.hypot(dx - side * lateralX, source.position.y - WORLD_CONFIG.centerHeight, dz - side * lateralZ) / WORLD_CONFIG.signalDistance) ** 2);
      const concentrations = { left: concentration(1), right: concentration(-1) };
      concentrationLeft += concentrations.left;
      concentrationRight += concentrations.right;
      const sensed = { ...source, position: { ...source.position }, distance, bearing, signal, emission, concentrations };
      contributions.push(sensed);
      if (emission > 0 && (!target || signal > target.signal)) target = sensed;
    }
    let targetReason = target ? 'remote-signal' : 'no-target';
    if (connectedId) {
      target = contributions.find(source => source.id === connectedId) || null;
      targetReason = target ? 'connected' : 'no-target';
    } else {
      const contacts = contributions.filter(source => source.emission > 0 && source.distance <= WORLD_CONFIG.contactRange)
        .sort((a, b) => a.distance - b.distance || b.emission - a.emission);
      if (contacts.length) {
        const [first, second] = contacts;
        const tie = second && Math.abs(first.distance - second.distance) < 1e-9 && Math.abs(first.emission - second.emission) < 1e-9;
        target = tie ? null : first;
        targetReason = tie ? 'contact-tie' : 'nearest-contact';
      }
    }
    inputs.visualLeft = Math.min(120, inputs.visualLeft);
    inputs.visualRight = Math.min(120, inputs.visualRight);
    if (target && target.distance <= WORLD_CONFIG.contactRange) inputs.contactSugar = 150 * target.emission;
    if (this.profile === 'olfactory') {
      const mean = (concentrationLeft + concentrationRight) / 2;
      const contrast = mean > 0 ? Math.max(-1, Math.min(1, SIGNAL_CONFIG.contrast * (concentrationLeft - concentrationRight) / (2 * mean))) : 0;
      const hz = side => Math.min(SIGNAL_CONFIG.maxHz, SIGNAL_CONFIG.rateScaleHz * Math.log1p(SIGNAL_CONFIG.concentrationGain * mean * (1 + side * contrast)));
      const left = hz(1), right = hz(-1), rateMean = (left + right) / 2;
      return { inputs: { signalLeft: this.directional ? left : rateMean, signalRight: this.directional ? right : rateMean, contactSugar: inputs.contactSugar },
        contributions, concentrations: { left: concentrationLeft, right: concentrationRight }, target, targetReason, pose: { ...this.pose }, time: this.time };
    }
    return { inputs, contributions, target, targetReason, pose: { ...this.pose }, time: this.time };
  }
  advance(command, dt) {
    this.pose.heading = angle(this.pose.heading + command.yaw * dt);
    this.pose.x += Math.sin(this.pose.heading) * command.speed * dt;
    this.pose.z += Math.cos(this.pose.heading) * command.speed * dt;
    const source = this.sources.find(s => s.id === command.targetId);
    let absorbed = 0;
    if (command.phase === 'absorb' && source && Math.hypot(source.position.x - this.pose.x, source.position.y - WORLD_CONFIG.centerHeight, source.position.z - this.pose.z) <= WORLD_CONFIG.contactRange) {
      absorbed = Math.min(source.remaining, WORLD_CONFIG.absorptionPerSecond * clamp(command.feed) * dt);
      source.remaining = Math.max(0, source.remaining - absorbed);
    }
    this.time += dt;
    return { absorbed, pose: { ...this.pose }, sources: structuredClone(this.sources) };
  }
}
