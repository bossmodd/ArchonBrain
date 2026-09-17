import { Group, Mesh, BufferGeometry, Float32BufferAttribute, ShaderMaterial, AdditiveBlending, Vector3, Points, MathUtils } from 'three';
import { EnergyKnot } from './EnergyKnot.js';
import { noiseGLSL } from '../shaders/noise.js';

const SEGMENTS = 96;
const PACKETS = 16;
const UP = new Vector3(0, 1, 0);
const hash = n => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return (value - Math.floor(value)) * 2 - 1; };
// Linear spatial knots keep angular bends; temporal interpolation avoids flashing.
function electricNoise(u, time, seed = 0) {
  const x = u * 13, knot = Math.floor(x), frame = Math.floor(time * 9);
  const blend = MathUtils.smoothstep(time * 9 - frame, 0, 1);
  const sample = tick => MathUtils.lerp(hash(knot + tick * 31 + seed), hash(knot + 1 + tick * 31 + seed), x - knot);
  return MathUtils.lerp(sample(frame), sample(frame + 1), blend);
}

function pathPoint(start, midpoint, end, u, time, result) {
  const tangent = midpoint.clone().sub(start).normalize();
  const lateral = new Vector3().crossVectors(tangent, UP).normalize();
  if (lateral.lengthSq() < 0.01) lateral.set(1, 0, 0);
  const vertical = new Vector3().crossVectors(lateral, tangent).normalize();
  const envelope = Math.sin(u * Math.PI);
  result.lerpVectors(start, midpoint, u);
  result.addScaledVector(end.clone().sub(midpoint), MathUtils.smoothstep(u, 0.56, 1));
  result.addScaledVector(lateral, (electricNoise(u, time) * 0.23 + Math.sin(u * 21 - time * 7) * 0.055) * envelope);
  result.addScaledVector(vertical, (electricNoise(u, time, 83) * 0.19 + Math.sin(u * 17 - time * 5) * 0.07) * envelope);
  return result;
}

function ribbon(secondary = false, branch = false) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array((SEGMENTS + 1) * 6), 3));
  const uv = [], indices = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    uv.push(i / SEGMENTS, 0, i / SEGMENTS, 1);
    if (i < SEGMENTS) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  const mesh = new Mesh(geometry, new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uStrength: { value: 0 }, uSecondary: { value: Number(secondary) }, uBranch: { value: Number(branch) } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: /* glsl */ `
      uniform float uTime, uStrength, uSecondary, uBranch; varying vec2 vUv;
      ${noiseGLSL}
      void main(){
        // Both the bright knots and the corona move from source (u=0) to palms.
        float travel = vUv.x * 11.0 - uTime * 4.4;
        float n = fbm(vec3(travel, vUv.y * 5.0, uTime * .7));
        float detail = noise3(vec3(vUv.x * 48.0 - uTime * 12.0, vUv.y * 13.0, uTime * 1.3));
        float y = vUv.y * 2.0 - 1.0;
        float spine = y + sin(vUv.x * 53.0 - uTime * 13.0) * .045;
        float edge = abs(spine);
        float swell = smoothstep(.28,.72, noise3(vec3(travel, 2.0, uTime * .3)));
        float core = 1.0 - smoothstep(.025 + swell * .04, .075 + swell * .07, edge);
        float sheath = 1.0 - smoothstep(.16, .34 + swell * .12, edge);
        float flame = 1.0 - smoothstep(.22 + n * .30, .38 + n * .53 + detail * .10, edge);
        float veinPath = sin(vUv.x * 27.0 - uTime * 6.0) * (.18 + n * .38);
        float veins = (1.0 - smoothstep(.015,.055,abs(y-veinPath))) * smoothstep(.38,.68,detail);
        vec3 color = mix(vec3(.004,.035,.85), vec3(.008,.42,1.55), sheath);
        color = mix(color, vec3(.9,1.5,1.9), core);
        color += vec3(.025,.35,1.2) * veins;
        float alpha = flame * .72 + sheath * .2 + core * .25 + veins * .2;
        // Draw the shared trunk once, then reveal the second receiving branch.
        float fork = mix(1.0, smoothstep(.54,.70,vUv.x), uSecondary);
        float tip = mix(1.0, 1.0-smoothstep(.62,1.0,vUv.x), uBranch);
        gl_FragColor = vec4(color, min(alpha, .94) * uStrength * fork * tip);
      }
    `,
    transparent: true, blending: AdditiveBlending, depthWrite: false,
  }));
  mesh.layers.set(1); mesh.renderOrder = 4; mesh.frustumCulled = false;
  return mesh;
}

function writeRing(positions, i, point, across, width) {
  for (let side = 0; side < 2; side++) {
    const offset = width * (side ? 1 : -1);
    positions.setXYZ(i * 2 + side, point.x + across.x * offset, point.y + across.y * offset, point.z + across.z * offset);
  }
}

export class AbsorptionEffect extends Group {
  constructor() {
    super();
    this.name = 'AbsorptionEffect';
    this.beams = [ribbon(), ribbon(true)];
    this.branches = Array.from({ length: 6 }, () => ribbon(false, true));
    this.charges = [new EnergyKnot(), new EnergyKnot()];
    this.source = new Vector3(); this.midpoint = new Vector3();
    this.ends = [new Vector3(), new Vector3()];
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(PACKETS * 3), 3));
    this.packets = new Points(geometry, new ShaderMaterial({
      uniforms: { uStrength: { value: 0 } },
      vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=4.5;}',
      fragmentShader: 'uniform float uStrength;void main(){float r=length(gl_PointCoord-.5)*2.0;gl_FragColor=vec4(.65,2.0,3.0,(1.0-smoothstep(0.0,1.0,r))*uStrength);}',
      transparent: true, blending: AdditiveBlending, depthWrite: false,
    }));
    this.packets.layers.set(1); this.packets.renderOrder = 5; this.packets.frustumCulled = false;
    this.add(...this.beams, ...this.branches, ...this.charges, this.packets);
    this.strength = this.packetProgress = 0;
  }
  update(time, state, hands, camera) {
    this.updateWorldMatrix(true, false);
    this.worldToLocal(this.source.copy(state.source));
    this.ends.forEach((end, i) => this.worldToLocal(end.copy(hands[i])));
    this.midpoint.copy(this.ends[0]).add(this.ends[1]).multiplyScalar(0.5);
    this.strength = state.flow * state.intensity;
    const view = camera.getWorldDirection(new Vector3()); this.viewDirection = view;
    const tangent = this.midpoint.clone().sub(this.source).normalize();
    const across = new Vector3().crossVectors(tangent, view).normalize();
    if (across.lengthSq() < 0.01) across.copy(UP);
    const point = new Vector3();
    const accent = 1 + (state.impulse || 0) * 0.28;
    this.beams.forEach((beam, index) => {
      const end = this.ends[index];
      const charge = this.charges[index];
      charge.position.copy(end);
      charge.update(time + index * 0.7, state.charge * state.intensity, camera);
      beam.visible = this.strength > 0.001;
      beam.material.uniforms.uTime.value = time;
      beam.material.uniforms.uStrength.value = this.strength;
      const positions = beam.geometry.attributes.position;
      for (let i = 0; i <= SEGMENTS; i++) {
        const u = i / SEGMENTS;
        pathPoint(this.source, this.midpoint, end, u, time, point);
        const swell = 0.5 + 0.5 * electricNoise(u, time * 0.53, 117);
        const width = (0.15 + swell * swell * 0.45) * accent * (1 - MathUtils.smoothstep(u, 0.66, 1) * 0.32);
        writeRing(positions, i, point, across, width);
      }
      positions.needsUpdate = true;
    });
    this.branches.forEach((branch, index) => {
      branch.visible = this.strength > 0.001;
      branch.material.uniforms.uTime.value = time + index * .31;
      branch.material.uniforms.uStrength.value = this.strength * (0.45 + 0.25 * Math.sin(time * 11 + index * 3.4));
      const positions = branch.geometry.attributes.position;
      const origin = .15 + index * .105;
      const sign = index % 2 ? -1 : 1;
      for (let i = 0; i <= SEGMENTS; i++) {
        const u = i / SEGMENTS;
        pathPoint(this.source, this.midpoint, this.midpoint, origin + u * .14, time, point);
        point.addScaledVector(across, sign * (Math.sin(u * Math.PI * .65) * .27 + electricNoise(u, time, index * 17) * .045 * u));
        const width = .064 * (1 - u * .75) * (1 + Math.sin(u * 21 + index) * .3);
        writeRing(positions, i, point, across, width);
      }
      positions.needsUpdate = true;
    });
    this.packetProgress = (time * 0.4 + 0.11) % 1;
    const packetPositions = this.packets.geometry.attributes.position;
    for (let i = 0; i < PACKETS; i++) {
      const u = (this.packetProgress + Math.floor(i / 2) / (PACKETS / 2)) % 1;
      pathPoint(this.source, this.midpoint, this.ends[i % 2], u, time, point);
      packetPositions.setXYZ(i, point.x, point.y, point.z);
    }
    packetPositions.needsUpdate = true;
    this.packets.material.uniforms.uStrength.value = this.strength;
    this.packets.visible = this.strength > 0.001;
  }
  snapshot() {
    // Read rendered geometry endpoints, not the input used to generate them.
    const endpoint = (beam, ring) => {
      const positions = beam.geometry.attributes.position;
      const point = new Vector3().fromBufferAttribute(positions, ring * 2);
      point.add(new Vector3().fromBufferAttribute(positions, ring * 2 + 1)).multiplyScalar(0.5);
      return this.localToWorld(point).toArray();
    };
    return {
      strength: this.strength,
      starts: this.beams.map(beam => endpoint(beam, 0)),
      ends: this.beams.map(beam => endpoint(beam, SEGMENTS)),
      packetProgress: this.packetProgress,
      frontFacing: this.beams.map(beam => {
        const p = beam.geometry.attributes.position;
        const indices = beam.geometry.index.array;
        const base = Math.floor(SEGMENTS / 2) * 6;
        const a = new Vector3().fromBufferAttribute(p, indices[base]);
        const b = new Vector3().fromBufferAttribute(p, indices[base + 1]).sub(a);
        const c = new Vector3().fromBufferAttribute(p, indices[base + 2]).sub(a);
        return b.cross(c).dot(this.viewDirection ?? new Vector3()) < 0;
      }),
      packetDistanceToHand: new Vector3().fromBufferAttribute(this.packets.geometry.attributes.position, 0).distanceTo(this.ends[0]),
    };
  }
}
