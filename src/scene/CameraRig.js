import { OrthographicCamera, Vector3, Box3, MOUSE } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CameraRig {
  constructor(canvas) {
    this.camera = new OrthographicCamera(-5, 5, 4, -4, 0.1, 80);
    this.target = new Vector3(0, 1.95, 0);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = true;
    this.controls.mouseButtons.MIDDLE = MOUSE.PAN;
    this.controls.minZoom = 0.65;
    this.controls.maxZoom = 1.8;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.reset();
  }
  reset() {
    this.keepInView = false;
    this.target.set(0, 1.95, 0);
    this.camera.position.set(5.8, 9.2, 12);
    this.camera.zoom = 1;
    this.camera.near = .1; this.camera.far = 80;
    this.controls.target.copy(this.target);
    this.camera.lookAt(this.target);
    this.controls.update();
    this.controls.enabled = false;
    this.camera.updateProjectionMatrix();
  }
  setOrbit(enabled) {
    if (!enabled && this.controls.enabled) {
      this.controls.enableDamping = false;
      this.controls.update();
      this.controls.enableDamping = true;
    }
    this.controls.enabled = enabled;
    if (enabled) this.keepInView = false;
    this.target.copy(this.controls.target);
  }
  frame(spheres) {
    this.setOrbit(false);
    this.keepInView = false;
    const box = new Box3();
    for (const { center, radius } of spheres) {
      const r = new Vector3(radius, radius, radius);
      box.expandByPoint(center.clone().sub(r)); box.expandByPoint(center.clone().add(r));
    }
    if (box.isEmpty()) return;
    box.getCenter(this.target);
    const offset = new Vector3(5.8, 7.25, 12);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
    const inverse = this.camera.quaternion.clone().invert();
    let width = 0, height = 0, depth = 0;
    for (const { center, radius } of spheres) {
      const p = center.clone().sub(this.target).applyQuaternion(inverse);
      width = Math.max(width, Math.abs(p.x) + radius);
      height = Math.max(height, Math.abs(p.y) + radius);
      depth = Math.max(depth, Math.abs(p.z) + radius);
    }
    const fit = Math.min(this.camera.right * .94 / width, this.camera.top * .94 / height, 1.6);
    this.frameLimited = fit < .00001 || depth > 400000;
    this.camera.zoom = Math.max(.00001, fit);
    const distance = Math.min(400000, Math.max(offset.length(), depth + 2));
    this.camera.position.copy(this.target).add(offset.normalize().multiplyScalar(distance));
    this.camera.near = .1;
    this.camera.far = Math.min(1000000, distance + depth + 10);
    this.controls.target.copy(this.target);
    this.controls.minZoom = Math.min(.65, this.camera.zoom);
    this.camera.updateMatrixWorld(true);
    this.camera.updateProjectionMatrix();
  }
  resize(width, height, insets = {}) {
    const left = insets.left || 0, right = insets.right || 0;
    const top = insets.top || 0, bottom = insets.bottom || 0;
    const safeWidth = Math.max(1, width - left - right);
    const safeHeight = Math.max(1, height - top - bottom);
    const halfHeight = Math.max(3.6, 3.3 / (safeWidth / safeHeight));
    this.camera.left = -halfHeight * safeWidth / safeHeight;
    this.camera.right = halfHeight * safeWidth / safeHeight;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    // The existing rig frames the unobscured region. View offset extends the
    // same projection behind the panels; world coordinates remain unchanged.
    this.camera.setViewOffset(safeWidth, safeHeight, -left, -top, width, height);
    this.camera.updateProjectionMatrix();
  }
  update(delta = 0, sphere = null, editing = false) {
    if (this.controls.enabled) { this.controls.update(); return; }
    if (!this.keepInView || !sphere || editing || delta <= 0) return;
    const q = this.camera.quaternion;
    const p = sphere.center.clone().sub(this.controls.target).applyQuaternion(q.clone().invert());
    const halfX = this.camera.right / this.camera.zoom, halfY = this.camera.top / this.camera.zoom;
    const limitX = Math.max(halfX * .2, halfX * .94 - sphere.radius);
    const limitY = Math.max(halfY * .2, halfY * .94 - sphere.radius);
    const outside = (value, limit) => Math.sign(value) * Math.max(0, Math.abs(value) - limit);
    const shift = new Vector3(outside(p.x, limitX), outside(p.y, limitY), 0)
      .multiplyScalar(1 - Math.exp(-3 * Math.min(delta, .05))).applyQuaternion(q);
    this.camera.position.add(shift);
    this.controls.target.add(shift);
    this.target.copy(this.controls.target);
    this.camera.updateMatrixWorld(true);
  }
}
