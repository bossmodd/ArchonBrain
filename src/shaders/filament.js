import { noiseGLSL } from './noise.js';

export const filamentVertex = /* glsl */ `
uniform float uTime;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vView;
${noiseGLSL}
void main() {
  vLocal = position;
  float displacement = radialFbm(position * 4.0, uTime) - 0.48;
  vec3 pos = position * (1.0 + displacement * 0.18);
  vec4 view = modelViewMatrix * vec4(pos, 1.0);
  vView = -view.xyz;
  vNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * view;
}
`;

export const filamentFragment = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uPhase;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vView;
${noiseGLSL}
void main() {
  vec3 p = vLocal;
  vec3 flow = vec3(sin(uTime * 0.1) * 0.2, cos(uTime * 0.13) * 0.2, uPhase);
  vec3 warp = vec3(fbm(p * 4.0 + flow), fbm(p * 4.0 + flow + 12.7), fbm(p * 4.0 + flow + 5.4));
  float n = radialFbm(p * 7.0 + warp * 2.0 + flow, uTime);
  float fine = fbm(p * 16.0 + warp * 4.0 - flow * 1.1);
  float smoke = smoothstep(0.44, 0.71, n);
  float wisp = exp(-abs(n - 0.56) * 65.0) * smoothstep(0.40, 0.68, fine);
  float fragmented = smoothstep(0.35, 0.67, warp.x);
  // Even normalized vectors can round to a dot product above one.
  float facing = clamp(abs(dot(normalize(vNormal), normalize(vView))), 0.0, 1.0);
  float strength = wisp * 0.18 * fragmented;
  strength *= mix(0.22, 1.0, pow(1.0 - facing, 1.2)) * uIntensity;
  vec3 color = mix(vec3(0.045, 0.85, 2.6), vec3(0.8, 0.08, 1.8), smoothstep(0.50, 0.69, warp.y));
  color = mix(color, vec3(0.12, 2.0, 2.1), smoke);
  gl_FragColor = vec4(color, strength);
}
`;
