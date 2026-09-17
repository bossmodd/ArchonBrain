import { Group, Raycaster, Vector3, CatmullRomCurve3, TubeGeometry, Mesh, MeshBasicMaterial, Color, AdditiveBlending, NormalBlending } from 'three';
import { SurfaceAnchor } from './SurfaceAnchor.js';

const RINGS = 20;
const SIDES = 6;

export class EyeGlow extends Group {
  constructor(body, model) {
    super();
    this.name = 'EyeGlow';
    this.eyeCount = 0;
    this.lines = [];
    body.updateWorldMatrix(true, false);
    // SkinnedMesh refreshes bindMatrixInverse in updateMatrixWorld, not
    // updateWorldMatrix. Normalize the skin before casting onto the face.
    body.updateMatrixWorld(true);
    const ray = new Raycaster();
    // Authored eye lines for the supplied model, normalized to 2.9 units high.
    // Raycasting finds the real face surface instead of floating lights in front of it.
    for (const side of [-1, 1]) {
      const points = [];
      const anchors = [];
      for (let i = 0; i <= 2; i++) {
        const u = i / 2;
        const origin = body.localToWorld(new Vector3(0.019 + side * (0.028 + u * 0.06), 1.125 + u * 0.065, 4));
        ray.set(origin, new Vector3(0, 0, -1));
        const hit = ray.intersectObject(model, true)[0];
        if (hit) {
          anchors.push(new SurfaceAnchor(hit));
          const point = body.worldToLocal(hit.point.clone());
          point.z += 0.008;
          points.push(point);
        }
      }
      if (points.length < 3) continue;
      const curve = new CatmullRomCurve3(points);
      const line = { curve, anchors, meshes: [] };
      this.lines.push(line);
      for (const halo of [false, true]) {
        const geometry = new TubeGeometry(curve, 20, halo ? 0.018 : 0.0065, 6, false);
        const positions = geometry.attributes.position;
        const center = new Vector3();
        for (let ring = 0; ring <= 20; ring++) {
          curve.getPointAt(ring / 20, center);
          const taper = Math.pow(Math.sin(Math.PI * ring / 20), 0.65) * 0.95 + 0.05;
          for (let vertex = 0; vertex <= 6; vertex++) {
            const index = ring * 7 + vertex;
            positions.setXYZ(index,
              center.x + (positions.getX(index) - center.x) * taper,
              center.y + (positions.getY(index) - center.y) * taper,
              center.z + (positions.getZ(index) - center.z) * taper,
            );
          }
        }
        const material = new MeshBasicMaterial({
          color: halo ? new Color(2.5, 0.08, 5.5) : new Color(1.7, 3.8, 5),
          transparent: halo, opacity: halo ? 0.4 : 1,
          blending: halo ? AdditiveBlending : NormalBlending, depthWrite: !halo,
        });
        // Keep halo out of the opaque depth capture; the eye core writes real depth.
        const mesh = new Mesh(geometry, material);
        mesh.layers.set(halo ? 1 : 0);
        mesh.renderOrder = halo ? 4 : 0;
        mesh.frustumCulled = false;
        this.add(mesh);
        line.meshes.push({ mesh, radius: halo ? 0.018 : 0.0065 });
      }
      this.eyeCount++;
    }
  }
  updateSurface() {
    this.updateWorldMatrix(true, false);
    for (const { anchors, curve, meshes } of this.lines) {
      anchors.forEach((anchor, i) => {
        anchor.sample();
        curve.points[i].copy(anchor.point).addScaledVector(anchor.normal, 0.008);
        this.worldToLocal(curve.points[i]);
      });
      curve.updateArcLengths();
      const frames = curve.computeFrenetFrames(RINGS, false);
      const center = new Vector3();
      for (const { mesh, radius } of meshes) {
        const positions = mesh.geometry.attributes.position;
        for (let ring = 0; ring <= RINGS; ring++) {
          curve.getPointAt(ring / RINGS, center);
          const taper = Math.pow(Math.sin(Math.PI * ring / RINGS), 0.65) * 0.95 + 0.05;
          for (let vertex = 0; vertex <= SIDES; vertex++) {
            const angle = vertex / SIDES * Math.PI * 2;
            const normal = frames.normals[ring], binormal = frames.binormals[ring];
            const a = Math.cos(angle) * radius * taper, b = Math.sin(angle) * radius * taper;
            positions.setXYZ(ring * (SIDES + 1) + vertex,
              center.x + normal.x * a + binormal.x * b,
              center.y + normal.y * a + binormal.y * b,
              center.z + normal.z * a + binormal.z * b);
          }
        }
        positions.needsUpdate = true;
      }
    }
  }
  measureSurfaceGap() {
    let maximum = 0;
    for (const { anchors, meshes } of this.lines) {
      const mesh = meshes[0].mesh;
      const positions = mesh.geometry.attributes.position;
      // Measure the rendered tube against the original GLB triangles, even
      // when the head is turned away from the camera or the world Z axis.
      for (const anchor of anchors) {
        const surface = anchor.sample().point;
        let nearest = Infinity;
        for (let ring = 0; ring <= RINGS; ring++) {
          const center = new Vector3();
          for (let i = 0; i < SIDES; i++) center.add(new Vector3().fromBufferAttribute(positions, ring * (SIDES + 1) + i));
          mesh.localToWorld(center.divideScalar(SIDES));
          nearest = Math.min(nearest, center.distanceTo(surface));
        }
        maximum = Math.max(maximum, nearest);
      }
    }
    return maximum;
  }
}
