// Display only: confirmed simulation poses, never predicted movement.
export class PoseInterpolator {
  constructor(pose) { this.reset(pose); }
  reset(pose) {
    this.current = { ...pose };
    this.from = { ...pose };
    this.target = { ...pose };
    this.elapsed = 0.1;
  }
  setTarget(pose) {
    if (['x', 'z', 'heading'].every(k => pose[k] === this.target[k])) return;
    this.from = { ...this.current };
    this.target = { ...pose };
    this.elapsed = 0;
  }
  freeze() { this.reset(this.current); }
  update(delta) {
    this.elapsed = Math.min(.1, this.elapsed + Math.max(0, delta));
    const alpha = this.elapsed / .1;
    for (const key of ['x', 'z']) this.current[key] = this.from[key] + (this.target[key] - this.from[key]) * alpha;
    const turn = this.target.heading - this.from.heading;
    this.current.heading = this.from.heading + Math.atan2(Math.sin(turn), Math.cos(turn)) * alpha;
    if (alpha === 1) this.current = { ...this.target };
    return this.current;
  }
}
