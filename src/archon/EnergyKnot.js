import { Group, Mesh, IcosahedronGeometry, PlaneGeometry, ShaderMaterial, AdditiveBlending } from 'three';
import { noiseGLSL } from '../shaders/noise.js';

// Shared by the palm charges and the optional preview source.
export class EnergyKnot extends Group {
  constructor(radius = 0.14) {
    super();
    this.radius = radius;
    const uniforms = { uTime: { value: 0 }, uStrength: { value: 0 } };
    this.core = new Mesh(new IcosahedronGeometry(1, 3), new ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        uniform float uTime; varying vec3 vPosition;
        ${noiseGLSL}
        void main(){
          vPosition=position;
          float flare = noise3(position * 7.0 + vec3(uTime * 2.0, -uTime, uTime * .7));
          vec3 p = position * (.88 + flare * .30);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uStrength; varying vec3 vPosition;
        ${noiseGLSL}
        void main(){
          float n = fbm(vPosition * 4.5 + vec3(uTime * 0.3, -uTime * 0.5, uTime * 0.2));
          float light = smoothstep(0.22, 0.75, n);
          vec3 color = mix(vec3(0.12, 0.5, 1.7), vec3(1.7, 2.8, 3.0), light);
          gl_FragColor = vec4(color, (0.26 + light * 0.68) * uStrength);
        }
      `,
      transparent: true, blending: AdditiveBlending, depthWrite: false,
    }));
    this.halo = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
      uniforms,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uStrength; varying vec2 vUv;
        ${noiseGLSL}
        void main(){
          vec2 p=(vUv-.5)*2.0; float r=length(p);
          float n=fbm(vec3(p*7.0,uTime*1.6));
          float fringe=1.0-smoothstep(.26,.53+n*.28,r);
          float glow=exp(-dot(p,p)*6.0)*(1.0-smoothstep(.65,1.0,r));
          gl_FragColor=vec4(.015,.20,1.2,(fringe*.46+glow*.24)*uStrength);
        }
      `,
      transparent: true, blending: AdditiveBlending, depthWrite: false,
    }));
    for (const mesh of [this.core, this.halo]) { mesh.layers.set(1); mesh.renderOrder = 5; this.add(mesh); }
  }
  update(time, strength, camera) {
    this.visible = strength > 0.001;
    this.core.material.uniforms.uTime.value = time;
    this.core.material.uniforms.uStrength.value = strength;
    this.core.scale.setScalar(this.radius * (0.86 + Math.sin(time * 4.1) * 0.05) * (0.65 + strength * 0.35));
    this.core.rotation.set(time * 0.23, time * 0.17, 0);
    this.halo.scale.setScalar(this.radius * 2.8);
    this.halo.quaternion.copy(camera.quaternion);
  }
}
