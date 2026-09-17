import { Triangle, Vector3 } from 'three';

// Follow the triangle's actual deformation, including every skin influence.
// A bone attachment alone cannot follow vertices weighted to several bones.
export class SurfaceAnchor {
  constructor(hit) {
    this.mesh = hit.object;
    this.indices = [hit.face.a, hit.face.b, hit.face.c];
    this.vertices = this.indices.map(index => this.mesh.getVertexPosition(index, new Vector3()));
    this.barycentric = Triangle.getBarycoord(this.mesh.worldToLocal(hit.point.clone()), ...this.vertices, new Vector3());
    this.point = new Vector3();
    this.normal = new Vector3();
  }
  sample() {
    this.indices.forEach((index, i) => this.mesh.localToWorld(this.mesh.getVertexPosition(index, this.vertices[i])));
    this.point.set(0, 0, 0);
    this.vertices.forEach((vertex, i) => this.point.addScaledVector(vertex, this.barycentric.getComponent(i)));
    Triangle.getNormal(...this.vertices, this.normal);
    return this;
  }
}
