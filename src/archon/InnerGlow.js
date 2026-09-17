import { Mesh, PlaneGeometry, ShaderMaterial, AdditiveBlending } from 'three';
import { noiseGLSL } from '../shaders/noise.js';

export class InnerGlow extends Mesh {
  constructor() {
    super(new PlaneGeometry(2, 2), new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uOpacity; varying vec2 vUv;
        ${noiseGLSL}
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float n = fbm(vec3(p * 3.0, uTime * 0.075));
          float glow = exp(-dot(p, p) * 5.0) * (0.42 + n * 0.5);
          glow *= 1.0 - smoothstep(0.6, 1.0, length(p));
          gl_FragColor = vec4(vec3(0.25, 0.7, 1.0), glow * uOpacity * 0.65);
        }
      `,
      transparent: true, blending: AdditiveBlending, depthWrite: false,
    }));
    this.name = 'InnerGlow';
    this.layers.set(1);
    this.renderOrder = 1;
  }
  update(time, radius, camera, opacity) {
    this.quaternion.copy(camera.quaternion);
    camera.getWorldDirection(this.position).multiplyScalar(radius * 0.65);
    this.scale.setScalar(radius * 0.85);
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uOpacity.value = opacity;
  }
}
