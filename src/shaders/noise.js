// Continuous 3D value noise. Shared by the volume and surface layers to avoid UV seams.
export const noiseGLSL = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
                 mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
                 mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float n = noise3(p) * 0.57;
  p = p * 2.03 + vec3(3.1, 7.4, 1.9);
  n += noise3(p) * 0.28;
  p = p * 2.01 + vec3(1.8, 3.7, 6.1);
  return n + noise3(p) * 0.15;
}
// Two overlapping advection phases hide the reset. Features travel radially
// away from the origin; no world-space upward scroll is involved.
float radialFbm(vec3 p, float time) {
  float phaseA = fract(time * 0.105);
  float phaseB = fract(phaseA + 0.5);
  float weightA = 0.5 - 0.5 * cos(phaseA * 6.283185);
  vec3 direction = p / max(length(p), 0.3);
  float a = fbm(p - direction * phaseA * 2.7);
  float b = fbm(p - direction * phaseB * 2.7);
  return mix(b, a, weightA);
}
`;
