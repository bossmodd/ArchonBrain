// Fixed before any movement; world positions are never adjusted to a trajectory.
export function neuralCondition(name = 'near') {
  if (name === 'interactive') return { profile: 'olfactory', mode: 'interactive', seed: 1,
    sources: [{ id: 'initial-a', label: 'A', position: { x: Math.sqrt(12), y: 2.4, z: 2 }, strength: 1, remaining: 1 },
      { id: 'initial-b', label: 'B', position: { x: -Math.sqrt(12), y: 2.4, z: 2 }, strength: 1, remaining: 1 }] };
  if (name === 'near') return { profile: 'lc11', seed: 1 };
  const angles = { left: Math.PI / 3, front: 0, right: -Math.PI / 3, rear: Math.PI };
  if (!(name in angles)) throw new Error(`Unknown neural condition: ${name}`);
  const angle = angles[name];
  return { profile: 'olfactory', seed: 1, pose: { x: 0, z: 0, heading: 0 },
    sources: [{ id: 'one', position: { x: 4 * Math.sin(angle), y: 2.4, z: 4 * Math.cos(angle) }, strength: 1, remaining: 1 }] };
}
