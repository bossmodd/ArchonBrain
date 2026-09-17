import { Points, BufferGeometry, Float32BufferAttribute, ShaderMaterial, AdditiveBlending } from 'three';

const MAX_SPARKS = 160;
export class SparkParticles extends Points {
  constructor(parameters) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3));
    geometry.setAttribute('aSeed', new Float32BufferAttribute(Array.from({ length: MAX_SPARKS }, (_, i) => ((i * 0.618034) % 1)), 1));
    super(geometry, new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; varying float vAlpha;
        void main() {
          vAlpha = pow(0.5 + 0.5 * sin(uTime * (0.65 + aSeed) + aSeed * 62.0), 4.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 1.8 + aSeed * 3.4;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main(){
          float r = length(gl_PointCoord - 0.5) * 2.0;
          gl_FragColor = vec4(0.4, 2.0, 3.0, (1.0 - smoothstep(0.0, 1.0, r)) * vAlpha);
        }
      `,
      transparent: true, blending: AdditiveBlending, depthWrite: false,
    }));
    this.name = 'SparkParticles';
    this.parameters = parameters;
    this.layers.set(1);
    this.renderOrder = 4;
    this.frustumCulled = false;
  }
  update(time, radius) {
    const positions = this.geometry.attributes.position;
    const count = Math.min(MAX_SPARKS, Math.max(0, Math.round(this.parameters.sparkDensity)));
    this.geometry.setDrawRange(0, count);
    for (let i = 0; i < count; i++) {
      const y = 1 - 2 * ((i + 0.5) / MAX_SPARKS);
      // Permute latitude so a sparse sample still covers the entire sphere.
      const latitude = 1 - 2 * (((i * 61) % MAX_SPARKS + 0.5) / MAX_SPARKS);
      const angle = i * 2.399963 + time * (0.03 + (i % 7) * 0.005);
      const r = radius * (1 + 0.025 * Math.sin(i + time * 0.4));
      const ring = Math.sqrt(1 - latitude * latitude);
      positions.setXYZ(i, Math.cos(angle) * ring * r, latitude * r, Math.sin(angle) * ring * r + y * 0.008);
    }
    positions.needsUpdate = true;
    this.material.uniforms.uTime.value = time;
  }
}
