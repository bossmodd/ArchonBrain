import {
  Group, Mesh, BufferGeometry, Float32BufferAttribute, ShaderMaterial,
  OctahedronGeometry, MeshBasicMaterial, Color, DoubleSide, AdditiveBlending, Vector3,
} from 'three';
import { satellitePosition } from './motion.js';

const SEGMENTS = 56;
export class RedSatelliteSystem extends Group {
  constructor(parameters) {
    super();
    this.name = 'RedSatelliteSystem';
    this.parameters = parameters;
    this.satellites = [];
    this.view = new Vector3();
    this.point = new Vector3();
    this.next = new Vector3();
    this.side = new Vector3();
    for (let i = 0; i < 3; i++) {
      const geometry = new BufferGeometry();
      const vertices = new Float32Array((SEGMENTS + 1) * 6);
      const uvs = [];
      const indices = [];
      for (let s = 0; s <= SEGMENTS; s++) {
        uvs.push(s / SEGMENTS, 0, s / SEGMENTS, 1);
        if (s < SEGMENTS) {
          const a = s * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      const ribbon = new Mesh(geometry, new ShaderMaterial({
        uniforms: { uView: { value: new Vector3() }, uRadius: { value: 1.85 } },
        vertexShader: 'varying vec2 vUv; varying vec3 vPosition; void main(){vUv=uv;vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vPosition; uniform vec3 uView; uniform float uRadius;
          void main(){
            // Raster interpolation can overshoot the UV endpoints by one ULP.
            vec2 uv = clamp(vUv, 0.0, 1.0);
            float center = 1.0 - abs(uv.y * 2.0 - 1.0);
            float head = pow(1.0 - uv.x, 2.0);
            vec3 color = mix(vec3(1.5, 0.002, 0.012), vec3(4.0, 0.012, 0.035), pow(center, 4.0) * head);
            float depth = dot(vPosition, uView);
            float projectedRadius = length(vPosition - uView * depth);
            float behind = smoothstep(-.12,.45,depth) * (1.0-smoothstep(uRadius*.75,uRadius*1.04,projectedRadius));
            gl_FragColor = vec4(color, pow(center, 0.7) * (1.0 - uv.x) * (1.0-behind*.78));
          }
        `,
        transparent: true, blending: AdditiveBlending, side: DoubleSide, depthWrite: false,
      }));
      ribbon.layers.set(1);
      ribbon.renderOrder = 5;
      ribbon.frustumCulled = false;
      const head = new Mesh(new OctahedronGeometry(1, 0), new MeshBasicMaterial({ color: new Color(3.8, 0.008, 0.026) }));
      head.layers.set(0);
      head.scale.set(0.052, 0.025, 0.21);
      this.add(ribbon, head);
      this.satellites.push({ ribbon, head });
    }
  }
  update(time, radius, camera) {
    camera.getWorldDirection(this.view);
    const speed = this.parameters.satelliteSpeed;
    const clearance = this.parameters.satelliteOrbitRadius;
    this.satellites.forEach(({ ribbon, head }, index) => {
      ribbon.material.uniforms.uView.value.copy(this.view);
      ribbon.material.uniforms.uRadius.value = radius;
      const positions = ribbon.geometry.attributes.position;
      const trail = [4.6, 5.7, 4.0][index] * (1 + Math.sin(time * speed * 0.17 + index * 2) * 0.16);
      for (let s = 0; s <= SEGMENTS; s++) {
        const u = s / SEGMENTS;
        const phaseTime = time * speed - Math.pow(u, 0.94) * trail;
        const p = satellitePosition(phaseTime, index, radius, 1, clearance);
        const q = satellitePosition(phaseTime + 0.01, index, radius, 1, clearance);
        this.point.set(p.x, p.y, p.z);
        this.next.set(q.x, q.y, q.z).sub(this.point).normalize();
        this.side.crossVectors(this.next, this.view).normalize();
        const width = 0.008 + Math.pow(1 - u, 1.8) * (index === 0 ? 0.062 : 0.052);
        positions.setXYZ(s * 2, p.x + this.side.x * width, p.y + this.side.y * width, p.z + this.side.z * width);
        positions.setXYZ(s * 2 + 1, p.x - this.side.x * width, p.y - this.side.y * width, p.z - this.side.z * width);
        if (s === 0) {
          head.position.copy(this.point);
          head.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), this.next);
        }
      }
      positions.needsUpdate = true;
    });
  }
}
