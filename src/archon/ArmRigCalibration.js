import { Vector3, Vector4, MathUtils } from 'three';

// Calibration for the supplied Archon GLB, in the body's normalized rest space.
// Its left elbow is inside the upper arm, and its mid-forearm is weighted 100%
// to LeftHand. Preserve the source asset and mesh; repair this chain on load.
export function calibrateLeftArm(body, mesh) {
  const skeleton = mesh.skeleton;
  const names = ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'];
  const bones = names.map(name => skeleton.bones.find(bone => bone.name === name));
  if (bones.some(bone => !bone)) return null;
  body.updateWorldMatrix(true, true);
  body.updateMatrixWorld(true);
  const localPosition = bone => body.worldToLocal(bone.getWorldPosition(new Vector3()));
  const [, upper, lower, hand] = bones;
  const oldShoulder = localPosition(upper), oldElbow = localPosition(lower), wrist = localPosition(hand);
  // Do not apply asset-specific landmarks to a different rig.
  if (mesh.geometry.attributes.position.count !== 141738 || Math.abs(oldElbow.x - 0.2744) > 0.02) return null;
  const shoulder = new Vector3(0.335, 0.91, -0.14);
  const elbow = new Vector3(0.555, 0.72, -0.28);
  const upperAxis = elbow.clone().sub(shoulder), lowerAxis = wrist.clone().sub(elbow);
  const upperLength = upperAxis.length(), lowerLength = lowerAxis.length();
  const totalLength = upperLength + lowerLength;
  const indices = bones.map(bone => skeleton.bones.indexOf(bone));
  const skin = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
  // This GLB's authored bind pose is not the raw position buffer. Bake its
  // actual rest surface before rebinding so calibration cannot change shape.
  const restPositions = new Float32Array(skin.count * 3);
  const restNormals = new Float32Array(skin.count * 3);
  const normalAttribute = mesh.geometry.attributes.normal;
  const normal = new Vector4();
  const p = new Vector3();
  for (let i = 0; i < skin.count; i++) {
    mesh.getVertexPosition(i, p).toArray(restPositions, i * 3);
    normal.set(normalAttribute.getX(i), normalAttribute.getY(i), normalAttribute.getZ(i), 0);
    mesh.applyBoneTransform(i, normal);
    p.set(normal.x, normal.y, normal.z).normalize().toArray(restNormals, i * 3);
  }
  let correctedVertices = 0;
  for (let i = 0; i < skin.count; i++) {
    const retained = new Map(); let limbWeight = 0;
    for (let component = 0; component < 4; component++) {
      const index = skin.getComponent(i, component), weight = weights.getComponent(i, component);
      if (indices.slice(1).includes(index)) limbWeight += weight;
      else if (weight > 0) retained.set(index, (retained.get(index) || 0) + weight);
    }
    if (limbWeight < 0.0001) continue;
    p.fromArray(restPositions, i * 3).applyMatrix4(mesh.matrixWorld); body.worldToLocal(p);
    if (p.x < 0 || p.y < 0.12 || p.y > 1.22) continue;
    const u = MathUtils.clamp(p.clone().sub(shoulder).dot(upperAxis) / upperAxis.lengthSq(), -0.5, 1);
    const v = MathUtils.clamp(p.clone().sub(elbow).dot(lowerAxis) / lowerAxis.lengthSq(), 0, 1.7);
    const upperPoint = shoulder.clone().addScaledVector(upperAxis, u);
    const lowerPoint = elbow.clone().addScaledVector(lowerAxis, v);
    const along = p.distanceToSquared(upperPoint) < p.distanceToSquared(lowerPoint) ? u * upperLength : upperLength + v * lowerLength;
    const arm = MathUtils.smoothstep(p.x, 0.19, 0.37) * MathUtils.smoothstep(along, -0.04, 0.14);
    const bend = MathUtils.smoothstep(along, upperLength - 0.12, upperLength + 0.12);
    const palm = MathUtils.smoothstep(along, totalLength - 0.10, totalLength + 0.055);
    const influence = [1 - arm, arm * (1 - bend), arm * bend * (1 - palm), arm * bend * palm];
    influence.forEach((value, j) => retained.set(indices[j], (retained.get(indices[j]) || 0) + limbWeight * value));
    const entries = [...retained].filter(([, weight]) => weight > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = entries.reduce((total, [, weight]) => total + weight, 0);
    for (let component = 0; component < 4; component++) {
      skin.setComponent(i, component, entries[component]?.[0] || 0);
      weights.setComponent(i, component, (entries[component]?.[1] || 0) / sum);
    }
    correctedVertices++;
  }
  const move = (bone, point) => {
    bone.position.copy(bone.parent.worldToLocal(body.localToWorld(point.clone())));
    bone.updateWorldMatrix(true, true);
  };
  move(upper, shoulder); move(lower, elbow); move(hand, wrist);
  body.updateWorldMatrix(true, true);
  mesh.geometry.attributes.position.copyArray(restPositions);
  normalAttribute.copyArray(restNormals);
  skeleton.calculateInverses();
  mesh.bind(skeleton, mesh.matrixWorld);
  skin.needsUpdate = weights.needsUpdate = mesh.geometry.attributes.position.needsUpdate = normalAttribute.needsUpdate = true;
  mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
  mesh.boundingBox = mesh.boundingSphere = null;
  return {
    correctedVertices,
    originalLengths: [oldShoulder.distanceTo(oldElbow), oldElbow.distanceTo(wrist)],
    calibratedLengths: [upperLength, lowerLength],
  };
}
