import { Object3D, Quaternion, Vector3, MathUtils } from 'three';

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);
const RIGHT = new Vector3(1, 0, 0);
const jointNames = ['Spine', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
const position = object => object.getWorldPosition(new Vector3());

function rotateWorld(bone, rotation, weight = 1) {
  const parent = bone.parent.getWorldQuaternion(new Quaternion());
  const localDelta = parent.clone().invert().multiply(rotation).multiply(parent);
  const desired = localDelta.multiply(bone.quaternion);
  bone.quaternion.slerp(desired, weight);
  bone.updateWorldMatrix(false, true);
}

function aimBone(bone, currentDirection, desiredDirection, weight) {
  if (currentDirection.lengthSq() < 1e-8 || desiredDirection.lengthSq() < 1e-8) return;
  rotateWorld(bone, new Quaternion().setFromUnitVectors(currentDirection.normalize(), desiredDirection.normalize()), weight);
}

export class InteractionPose {
  constructor(body, model) {
    this.body = body;
    this.joints = Object.fromEntries(jointNames.map(name => [name, model.getObjectByName(name)]));
    const missing = jointNames.filter(name => !this.joints[name]?.isBone);
    if (missing.length) throw new Error(`Interaction requires rig joints: ${missing.join(', ')}.`);
    this.rest = Object.fromEntries(jointNames.map(name => [name, this.joints[name].quaternion.clone()]));
    model.updateWorldMatrix(true, true);
    this.arms = ['Left', 'Right'].map((side, index) => {
      const socket = new Object3D();
      socket.name = `${side}PalmEnergySocket`;
      // GLB joint units: this point sits in the palm, beyond the wrist joint.
      socket.position.set(0, 8, 2);
      this.joints[`${side}Hand`].add(socket);
      const upper = this.joints[`${side}Arm`];
      const lower = this.joints[`${side}ForeArm`];
      const hand = this.joints[`${side}Hand`];
      const upperDirection = position(lower).sub(position(upper)).normalize();
      const lowerDirection = position(hand).sub(position(lower)).normalize();
      const hinge = upperDirection.clone().cross(lowerDirection).normalize()
        .applyQuaternion(upper.getWorldQuaternion(new Quaternion()).invert());
      return {
        side: index === 0 ? 1 : -1, socket,
        shoulder: this.joints[`${side}Shoulder`],
        upper, lower, hand, hinge, restBend: upperDirection.angleTo(lowerDirection),
      };
    });
  }
  restore() {
    for (const name of jointNames) this.joints[name].quaternion.copy(this.rest[name]);
  }
  update(time, state) {
    const weight = state.pose;
    if (weight <= 0) return;
    const { windup, extension, impulse } = state;
    this.body.updateWorldMatrix(true, true);
    const direction = state.target.clone().sub(position(this.body));
    if (direction.lengthSq() < 0.01) return;
    const yaw = Math.atan2(direction.x, direction.z);
    const relativeYaw = Math.atan2(Math.sin(yaw - (this.body.heading ?? 0)), Math.cos(yaw - (this.body.heading ?? 0)));
    const pitch = MathUtils.clamp(Math.atan2(direction.y - 0.7, Math.hypot(direction.x, direction.z)), -0.5, 0.5);
    // Root yaw supplies the broad turn. Chest and head complete the aim;
    // the reaching gesture below is performed by the actual arm joints.
    const forward = new Vector3(direction.x, 0, direction.z).normalize();
    this.body.position.addScaledVector(forward, (extension * 0.075 + impulse * 0.085 - windup * 0.045) * weight);
    this.body.position.y += (windup * 0.055 + impulse * 0.055 + Math.sin(time * 1.6) * extension * 0.012) * weight;
    this.body.rotation.y += (relativeYaw * 0.62 - windup * 0.10 + impulse * 0.035) * weight;
    this.body.rotation.z += (-windup * 0.035 + Math.sin(time * 1.8) * extension * 0.012) * weight;
    this.body.updateWorldMatrix(true, true);
    rotateWorld(this.joints.Spine, new Quaternion().setFromAxisAngle(UP, (relativeYaw * 0.34 + windup * 0.19 - impulse * 0.075) * weight));
    const right = RIGHT.clone().applyAxisAngle(UP, yaw);
    const bodyAccent = -windup * 0.18 + extension * 0.16 + impulse * 0.10;
    rotateWorld(this.joints.Spine, new Quaternion().setFromAxisAngle(right, (-pitch * 0.65 + bodyAccent + Math.sin(time * 1.7) * extension * 0.018) * weight));
    rotateWorld(this.joints.Head, new Quaternion().setFromAxisAngle(UP, relativeYaw * 0.09 * weight));
    rotateWorld(this.joints.Head, new Quaternion().setFromAxisAngle(right, (-pitch * 0.35 - bodyAccent * 0.35) * weight));

    // Small leg counter-motion keeps the silhouette balanced as the chest opens.
    for (const side of ['Left', 'Right']) {
      const amount = side === 'Left' ? 1 : 0.7;
      rotateWorld(this.joints[`${side}UpLeg`], new Quaternion().setFromAxisAngle(right, (windup * 0.13 - extension * 0.06) * weight * amount));
      rotateWorld(this.joints[`${side}Leg`], new Quaternion().setFromAxisAngle(right, (-windup * 0.22 + extension * 0.06) * weight * amount));
    }

    for (const arm of this.arms) {
      rotateWorld(arm.shoulder, new Quaternion().setFromAxisAngle(UP, -arm.side * 0.17 * weight));
      const shoulder = position(arm.upper);
      const elbow = position(arm.lower);
      const wrist = position(arm.hand);
      const upperLength = shoulder.distanceTo(elbow);
      const lowerLength = elbow.distanceTo(wrist);
      const toward = state.target.clone().sub(shoulder).normalize();
      const lateral = new Vector3().crossVectors(UP, toward).normalize();
      if (lateral.lengthSq() < 0.01) lateral.copy(right);
      const reach = (upperLength + lowerLength) * (0.975 + Math.sin(time * 2.1 + arm.side) * 0.006);
      const goal = shoulder.clone().addScaledVector(toward, reach).addScaledVector(lateral, arm.side * 0.09);
      goal.y += (arm.side > 0 ? 0.045 : -0.10) + Math.sin(time * 2.1 + arm.side) * 0.026 * extension;
      const gathered = shoulder.clone().addScaledVector(toward, (upperLength + lowerLength) * 0.58).addScaledVector(lateral, arm.side * 0.12);
      gathered.y += arm.side > 0 ? 0.025 : -0.22;
      // Gather in front of the chest. Keep the elbows outside and below the
      // shoulders throughout the sweep instead of reversing the bend plane.
      goal.lerp(gathered, Math.pow(windup, arm.side > 0 ? 0.85 : 1.2));
      const ray = goal.clone().sub(shoulder);
      const distance = MathUtils.clamp(ray.length(), Math.abs(upperLength - lowerLength) + 0.005, upperLength + lowerLength - 0.005);
      ray.normalize();
      goal.copy(shoulder).addScaledVector(ray, distance);
      const along = (upperLength * upperLength + distance * distance - lowerLength * lowerLength) / (2 * distance);
      const bend = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
      const pole = lateral.multiplyScalar(arm.side * (0.65 + windup * 0.15)).addScaledVector(UP, -1.0);
      pole.addScaledVector(ray, -pole.dot(ray)).normalize();
      const elbowGoal = shoulder.clone().addScaledVector(ray, along).addScaledVector(pole, bend);
      const upperDirection = elbowGoal.clone().sub(shoulder).normalize();
      const lowerDirection = goal.clone().sub(elbowGoal).normalize();
      const swing = new Quaternion().setFromUnitVectors(elbow.sub(shoulder).normalize(), upperDirection);
      const normal = arm.hinge.clone().applyQuaternion(arm.upper.getWorldQuaternion(new Quaternion())).applyQuaternion(swing).normalize();
      const desiredNormal = upperDirection.clone().cross(lowerDirection).normalize();
      const roll = Math.atan2(upperDirection.dot(normal.clone().cross(desiredNormal)), normal.dot(desiredNormal));
      const rotation = new Quaternion().setFromAxisAngle(upperDirection, roll).multiply(swing);
      rotateWorld(arm.upper, rotation, weight);
      // The forearm has one bend axis from the authored rig. An unrestricted
      // shortest-arc aim here used to roll the elbow as the target moved.
      const bendRotation = new Quaternion().setFromAxisAngle(arm.hinge, upperDirection.angleTo(lowerDirection) - arm.restBend);
      const lowerPose = bendRotation.multiply(this.rest[arm.lower.name]);
      arm.lower.quaternion.slerp(lowerPose, weight);
      arm.lower.updateWorldMatrix(false, true);
      // Preserve the authored wrist and finger silhouette; only a small aim
      // correction is needed after the elbow and upper arm have turned.
      const handDirection = UP.clone().applyQuaternion(arm.hand.getWorldQuaternion(new Quaternion()));
      const handTarget = state.target.clone().sub(position(arm.hand)).normalize();
      const handAngle = handDirection.angleTo(handTarget);
      aimBone(arm.hand, handDirection, handTarget, weight * Math.min(0.65, 0.45 / Math.max(handAngle, 0.001)));
    }
    this.body.updateWorldMatrix(true, true);
  }
  handPositions() { return this.arms.map(arm => position(arm.socket)); }
  snapshot() {
    return {
      joints: Object.fromEntries(jointNames.map(name => [name, this.joints[name].quaternion.toArray()])),
      hands: this.handPositions().map(hand => hand.toArray()),
      sockets: this.arms.map(arm => ({ parent: arm.socket.parent.name, local: arm.socket.position.toArray() })),
      forward: FORWARD.clone().applyQuaternion(this.joints.Head.getWorldQuaternion(new Quaternion())).toArray(),
    };
  }
}
