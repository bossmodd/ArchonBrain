import { Group, Mesh, SphereGeometry, ShaderMaterial, AdditiveBlending, DoubleSide } from 'three';
import { filamentVertex, filamentFragment } from '../shaders/filament.js';

export class FilamentLayer extends Group {
  constructor(parameters) {
    super();
    this.name = 'FilamentLayer';
    this.parameters = parameters;
    const geometry = new SphereGeometry(1, 72, 48);
    for (let i = 0; i < 2; i++) {
      const layer = new Mesh(geometry, new ShaderMaterial({
        vertexShader: filamentVertex, fragmentShader: filamentFragment,
        uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 }, uPhase: { value: i * 8.2 } },
        transparent: true, blending: AdditiveBlending, side: DoubleSide, depthWrite: false,
      }));
      layer.layers.set(1);
      layer.renderOrder = 3;
      layer.rotation.set(i * 0.6, i * 0.7, i * 0.3);
      this.add(layer);
    }
  }
  update(time, radius) {
    this.children.forEach((layer, index) => {
      layer.scale.setScalar(radius * (index === 0 ? 0.92 : 0.8));
      layer.material.uniforms.uTime.value = time;
      layer.material.uniforms.uIntensity.value = this.parameters.filamentIntensity * (index === 0 ? 0.1 : 0.15);
    });
  }
}
