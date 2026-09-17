import { Group } from 'three';
import { BodyMesh } from './BodyMesh.js';
import { InnerGlow } from './InnerGlow.js';
import { PsionicShell } from './PsionicShell.js';
import { FilamentLayer } from './FilamentLayer.js';
import { SparkParticles } from './SparkParticles.js';
import { RedSatelliteSystem } from './RedSatelliteSystem.js';
import { idleMotion } from './motion.js';
import { ElectricArcs } from './ElectricArcs.js';
import { InteractionState } from './InteractionState.js';
import { AbsorptionEffect } from './AbsorptionEffect.js';

export class ArchonEntity extends Group {
  constructor(parameters, depthTarget, camera) {
    super();
    this.name = 'ArchonEntity';
    this.parameters = parameters;
    this.visualState = { energy: 0.5 };
    this.interaction = new InteractionState();
    this.position.y = 2.4;
    this.body = new BodyMesh(parameters);
    this.glow = new InnerGlow();
    this.shell = new PsionicShell(parameters, depthTarget, camera);
    this.filaments = new FilamentLayer(parameters);
    this.sparks = new SparkParticles(parameters);
    this.satellites = new RedSatelliteSystem(parameters);
    this.arcs = new ElectricArcs(parameters);
    this.absorption = new AbsorptionEffect();
    this.add(this.body, this.glow, this.shell, this.filaments, this.sparks, this.satellites, this.arcs, this.absorption);
    this.effects = [this.glow, this.shell, this.filaments, this.sparks, this.satellites, this.arcs, this.absorption];
  }
  async load(source) { await this.body.load(source); return this; }
  resetInteraction() { this.interaction = new InteractionState(); }
  setLocomotion({ x, z, heading }) {
    if (![x, z, heading].every(Number.isFinite)) throw new Error('Locomotion pose must be finite');
    this.position.x = x;
    this.position.z = z;
    this.body.heading = heading;
  }
  // Rendering input only. Future controllers may supply this value;
  // this class never decides movement, learning or behavior.
  setVisualState({ energy, interaction } = {}) {
    if (Number.isFinite(energy)) this.visualState.energy = Math.max(0, Math.min(1, energy));
    if (interaction) return this.interaction.set(interaction);
  }
  update(time, delta, camera) {
    const motion = idleMotion(time, this.parameters.pulseSpeed);
    const radius = this.parameters.shellRadius * motion.pulse;
    this.position.y = 2.4 + motion.hover * 0.35;
    this.interactionFrame = this.interaction.update(time);
    this.body.update(time, this.interactionFrame);
    this.updateWorldMatrix(true, true);
    const hands = this.body.interactionPose.handPositions();
    this.absorption.update(time, this.interactionFrame, hands, camera);
    this.glow.update(time, radius, camera, this.parameters.shellOpacity);
    this.shell.update(time, radius, camera, this.visualState.energy);
    this.shell.setInteraction(this.interactionFrame, hands);
    this.filaments.update(time, radius);
    this.sparks.update(time, radius);
    this.satellites.update(time, this.parameters.shellRadius, camera);
    this.arcs.update(time, radius);
  }
  snapshot({ measureEyes = true } = {}) {
    return {
      body: this.body.info,
      breath: this.body.chest ? this.body.chest.scale.y / this.body.chestScale.y : 1,
      eyeParent: this.body.eyes?.parent?.name,
      eyeSurfaceGap: measureEyes ? this.body.measureEyeSurfaceGap() : null,
      layers: this.children.map(child => child.name),
      satellites: this.satellites.satellites.map(satellite => satellite.head.position.toArray()),
      sparkCount: this.sparks.geometry.drawRange.count,
      gasTime: this.shell.material.uniforms.uTime.value,
      gasEnergy: this.shell.material.uniforms.uEnergy.value,
      visualState: { ...this.visualState },
      interaction: {
        ...this.interactionFrame,
        target: this.interaction.target.toArray(),
        source: this.interaction.destination.toArray(),
        ...this.body.interactionPose?.snapshot(),
        connection: this.absorption.snapshot(),
      },
    };
  }
}
