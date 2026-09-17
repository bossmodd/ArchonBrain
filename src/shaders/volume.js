import { noiseGLSL } from './noise.js';

export const volumeVertex = /* glsl */ `
varying vec3 vLocal;
varying float vViewDepth;
void main() {
  vLocal = position;
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vViewDepth = -viewPosition.z;
  gl_Position = projectionMatrix * viewPosition;
}
`;

export const volumeFragment = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uRadius;
uniform float uEnergy;
uniform float uInteraction;
uniform float uReach;
uniform vec3 uFlowDirection;
uniform vec3 uHandA;
uniform vec3 uHandB;
uniform vec3 uRayDirection;
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
uniform vec2 uNearFar;
varying vec3 vLocal;
varying float vViewDepth;
${noiseGLSL}

void main() {
  // Orthographic rays are parallel. The body depth clips the integration,
  // so only gas physically in front of an opaque surface obscures it.
  vec3 rd = normalize(uRayDirection);
  vec3 ro = vLocal - rd * 3.0;
  float b = dot(ro, rd);
  float discriminant = b * b - dot(ro, ro) + 1.21;
  if (discriminant < 0.0) discard;
  float root = sqrt(discriminant);
  float start = -b - root;
  float back = -b + root;
  float end = back;
  float depth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).x;
  float opaqueDepth = mix(uNearFar.x, uNearFar.y, depth);
  float startDepth = vViewDepth + (start - 3.0) * uRadius;
  end = min(end, start + (opaqueDepth - startDepth) / uRadius);
  if (end <= start) discard;
  float intersectsBody = 1.0 - step(back - 0.01, end);
  vec3 closest = ro - rd * dot(ro, rd);
  vec3 surface = ro + rd * end;
  float torsoVeil = exp(-dot(closest * 2.2, closest * 2.2));
  float extremities = (1.0 - smoothstep(0.30, 0.59, abs(surface.x))) * (1.0 - smoothstep(0.38, 0.69, abs(surface.y)));
  float visibilityBias = mix(1.0, 0.02 + torsoVeil * extremities * 1.9, intersectsBody);
  float handClearance = smoothstep(0.09, 0.24, min(distance(surface, uHandA), distance(surface, uHandB)));
  visibilityBias *= mix(1.0, handClearance * 0.94 + 0.06, uReach * intersectsBody);

  float stepSize = (end - start) / 32.0;
  float t = start + stepSize * 0.5;
  vec4 accumulated = vec4(0.0);
  vec3 drift = vec3(sin(uTime * 0.11), cos(uTime * 0.09), sin(uTime * 0.07)) * 0.22;
  for (int i = 0; i < 32; i++) {
    vec3 p = ro + rd * t;
    float r = length(p);
    float warp = fbm(p * 3.1 + drift);
    vec3 curl = vec3(warp, noise3(p * 3.0 + drift + 9.4), noise3(p * 3.0 + drift + 17.2));
    float channel = smoothstep(0.55, 0.96, dot(p / max(r, 0.001), uFlowDirection)) * uInteraction;
    vec3 streaming = uFlowDirection * sin(r * 15.0 + uTime * 3.5) * channel * 0.24;
    float clouds = radialFbm(p * 7.5 + curl * 2.3 + streaming, uTime);
    float envelope = 1.0 - smoothstep(0.57, 1.04, r + (warp - 0.48) * 0.55);
    float core = exp(-dot(p * vec3(1.25, 1.05, 1.25), p * vec3(1.25, 1.05, 1.25)) * 5.5);
    float tendrils = smoothstep(0.37, 0.67, clouds);
    float density = envelope * (0.07 + tendrils * 3.3 + core * 1.15);
    float alpha = 1.0 - exp(-density * stepSize * uOpacity * 2.3 * visibilityBias);
    float purple = smoothstep(0.43, 0.67, noise3(p * 2.3 - drift + vec3(3.0, 7.0, 13.0))) * (1.0 - core);
    vec3 color = mix(vec3(0.008, 0.2, 0.95), vec3(0.8, 0.045, 1.5), purple * 0.85);
    color = mix(color, vec3(0.08, 1.0, 1.5), tendrils * 0.46);
    vec3 coreColor = vec3(1.6, 2.15, 2.6) * (0.62 + tendrils * 0.65);
    color = mix(color, coreColor, core * 0.95);
    color *= 0.85 + uEnergy * 0.35;
    color += vec3(0.08, 0.3, 0.42) * channel * tendrils;
    accumulated.rgb += (1.0 - accumulated.a) * color * alpha;
    accumulated.a += (1.0 - accumulated.a) * alpha;
    t += stepSize;
  }
  gl_FragColor = accumulated;
}
`;
