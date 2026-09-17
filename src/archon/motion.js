export function idleMotion(time, pulseSpeed = 0.65) {
  return {
    hover: Math.sin(time * 0.7) * 0.045 + Math.sin(time * 0.31) * 0.015,
    pulse: 1 + Math.sin(time * pulseSpeed) * 0.02,
  };
}

export function satellitePosition(time, index, shellRadius, speed, clearance) {
  const t = time * speed;
  const phase = [0.6, 3.7, 2.0][index];
  const angle = t * [0.32, -0.235, 0.278][index] + phase + Math.sin(t * 0.17 + phase) * 0.12;
  const radius = shellRadius * 1.06 + clearance + index * 0.11
    + Math.sin(t * 0.23 + index * 2.1) * 0.07 + Math.cos(angle * 2 + phase) * 0.09;
  // One broad rim path and two steep wraps with different lines of nodes.
  // The old three planes all shared the X axis, so their top views coincided.
  const tilt = [0.28, 1.22, -1.09][index] + Math.sin(t * 0.06 + phase) * 0.10;
  const yaw = [0.15, 1.05, -0.65][index] + t * [0.012, -0.016, 0.009][index]
    + Math.sin(t * 0.047 + phase) * 0.12;
  const curl = Math.sin(angle * 2.3 + phase) * radius * 0.055;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius * Math.sin(tilt) + curl * Math.cos(tilt);
  const z = Math.sin(angle) * radius * Math.cos(tilt) - curl * Math.sin(tilt);
  return {
    x: x * Math.cos(yaw) + z * Math.sin(yaw),
    y,
    z: -x * Math.sin(yaw) + z * Math.cos(yaw),
  };
}
