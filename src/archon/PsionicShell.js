import { Mesh, BoxGeometry, ShaderMaterial, Vector2, Vector3 } from 'three';
import { volumeVertex, volumeFragment } from '../shaders/volume.js';

export class PsionicShell extends Mesh {
  constructor(parameters, depthTarget, camera) {
    const material = new ShaderMaterial({
      vertexShader: volumeVertex, fragmentShader: volumeFragment,
      uniforms: {
        uTime: { value: 0 }, uOpacity: { value: parameters.shellOpacity },
        uRadius: { value: parameters.shellRadius }, uEnergy: { value: 0.5 },
        uRayDirection: { value: new Vector3() },
        uInteraction: { value: 0 }, uReach: { value: 0 },
        uFlowDirection: { value: new Vector3(0, 0, 1) },
        uHandA: { value: new Vector3() }, uHandB: { value: new Vector3() },
        uSceneDepth: { value: depthTarget.depthTexture },
        uResolution: { value: new Vector2(depthTarget.width, depthTarget.height) },
        uNearFar: { value: new Vector2(camera.near, camera.far) },
      },
      transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: false,
    });
    super(new BoxGeometry(2.22, 2.22, 2.22), material);
    this.name = 'PsionicShell';
    this.parameters = parameters;
    this.depthTarget = depthTarget;
    this.layers.set(1);
    this.renderOrder = 2;
  }
  update(time, radius, camera, energy) {
    this.scale.setScalar(radius);
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = time;
    uniforms.uRadius.value = radius;
    uniforms.uOpacity.value = this.parameters.shellOpacity;
    uniforms.uEnergy.value = energy;
    camera.getWorldDirection(uniforms.uRayDirection.value);
    uniforms.uResolution.value.set(this.depthTarget.width, this.depthTarget.height);
  }
  setInteraction(state, hands) {
    this.updateWorldMatrix(true, false);
    const uniforms = this.material.uniforms;
    uniforms.uInteraction.value = state.flow * state.intensity;
    uniforms.uReach.value = state.pose;
    this.worldToLocal(uniforms.uFlowDirection.value.copy(state.source)).normalize();
    this.worldToLocal(uniforms.uHandA.value.copy(hands[0]));
    this.worldToLocal(uniforms.uHandB.value.copy(hands[1]));
  }
}
