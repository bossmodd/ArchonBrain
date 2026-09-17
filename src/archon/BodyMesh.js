import { Box3, Group, Vector3, MeshStandardMaterial, Color } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { idleMotion } from './motion.js';
import { EyeGlow } from './EyeGlow.js';
import { InteractionPose } from './InteractionPose.js';
import { calibrateLeftArm } from './ArmRigCalibration.js';

export class BodyMesh extends Group {
  constructor(parameters) {
    super();
    this.name = 'BodyMesh';
    this.parameters = parameters;
    this.rimUniform = { value: parameters.rimIntensity };
    this.info = { meshCount: 0, joints: 0, source: '/models/archon-rigged.glb', height: 0 };
  }

  async load(source = this.info.source) {
    this.info.source = source;
    const gltf = await new GLTFLoader().loadAsync(this.info.source);
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model, true);
    const size = bounds.getSize(new Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('The GLB has no valid body mesh.');
    const scale = 2.9 / size.y;
    const center = bounds.getCenter(new Vector3());
    model.scale.multiplyScalar(scale);
    model.position.copy(center).multiplyScalar(-scale);
    this.info.height = size.y * scale;
    this.info.width = size.x * scale;
    this.info.animations = gltf.animations.length;
    model.traverse(object => {
      if (!object.isMesh) return;
      if (object.isSkinnedMesh) this.surfaceMesh = object;
      this.info.meshCount++;
      if (object.isSkinnedMesh) this.info.joints += object.skeleton.bones.length;
      const original = object.material;
      const material = new MeshStandardMaterial({
        color: new Color('#182535'), roughness: 0.91, metalness: 0.12,
        map: original.map,
        emissive: new Color('#1c9ad5'), emissiveMap: original.emissiveMap,
        emissiveIntensity: 0.07,
      });
      material.onBeforeCompile = shader => {
        shader.uniforms.uRimIntensity = this.rimUniform;
        shader.fragmentShader = 'uniform float uRimIntensity;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          // Normal rounding can make the dot product slightly exceed one.
          // A negative base here produces NaN, which spreads through bloom.
          float rim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.2);
          totalEmissiveRadiance += vec3(0.015, 0.27, 0.62) * rim * uRimIntensity;
        `);
      };
      object.material = material;
      object.castShadow = true;
      // The supplied clip is preserved in gltf; calm showcase uses its authored rest pose.
      original.dispose();
    });
    if (!this.info.meshCount) throw new Error('The GLB has no renderable mesh.');
    this.add(model);
    this.info.armCalibration = calibrateLeftArm(this, this.surfaceMesh);
    this.chest = model.getObjectByName('Spine');
    this.chestScale = this.chest?.scale.clone();
    this.breathJoints = ['neck', 'LeftArm', 'RightArm'].map(name => model.getObjectByName(name)).filter(Boolean).map(bone => ({ bone, rest: bone.rotation.clone() }));
    const head = model.getObjectByName('Head');
    if (head) {
      this.eyes = new EyeGlow(this, model);
      this.add(this.eyes);
      this.updateWorldMatrix(true, true);
      head.attach(this.eyes);
      this.info.eyeCount = this.eyes.eyeCount;
    }
    this.interactionPose = new InteractionPose(this, model);
    return this;
  }

  update(time, interaction) {
    this.interactionPose?.restore();
    this.position.set(0, idleMotion(time).hover, 0);
    this.rotation.y = (this.heading ?? 0) + Math.sin(time * 0.18) * 0.025;
    this.rotation.z = Math.sin(time * 0.29) * 0.005;
    const breath = Math.sin(time * 0.55);
    if (this.chest) {
      this.chest.scale.copy(this.chestScale);
      this.chest.scale.y *= 1 + breath * 0.007;
      this.chest.scale.x *= 1 + breath * 0.003;
    }
    for (const { bone, rest } of this.breathJoints ?? []) {
      bone.rotation.copy(rest);
      if (bone.name === 'neck') bone.rotation.x += breath * 0.004;
      else bone.rotation.z += breath * (bone.name === 'LeftArm' ? 0.009 : -0.009);
    }
    this.rimUniform.value = this.parameters.rimIntensity;
    if (interaction) this.interactionPose?.update(time, interaction);
    // Refresh skin bind transforms after the pose, before sampling the face.
    this.updateWorldMatrix(true, false);
    this.updateMatrixWorld(true);
    this.eyes?.updateSurface();
  }

  measureEyeSurfaceGap() {
    if (!this.eyes || !this.surfaceMesh) return null;
    this.updateMatrixWorld(true);
    return this.eyes.measureSurfaceGap();
  }
}
