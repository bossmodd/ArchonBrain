import { Group, Line, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, Color, AdditiveBlending } from 'three';

const NODES = 38;
// Separate broken discharges inside the gas, rather than a continuous surface net.
export class ElectricArcs extends Group {
  constructor(parameters) {
    super();
    this.name = 'ElectricArcs';
    this.parameters = parameters;
    for (let i = 0; i < 15; i++) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(NODES * 3), 3));
      const line = new Line(geometry, new LineBasicMaterial({
        color: i % 3 === 0 ? new Color(2.6, 0.18, 5) : new Color(0.65, 2.2, 3.6),
        transparent: true, blending: AdditiveBlending, depthWrite: false,
      }));
      line.layers.set(1);
      line.renderOrder = 3;
      line.frustumCulled = false;
      this.add(line);
    }
  }
  update(time, radius) {
    this.children.forEach((line, index) => {
      const phase = index * 2.399963;
      const latitude = Math.asin(1 - 2 * (index + 0.5) / this.children.length);
      const r = radius * (0.64 + (index % 4) * 0.075);
      const positions = line.geometry.attributes.position;
      const evolution = time * 1.1 + phase;
      for (let j = 0; j < NODES; j++) {
        const u = j / (NODES - 1);
        const theta = phase + u * (0.8 + (index % 3) * 0.22) + Math.sin(time * 0.18 + phase) * 0.15;
        const jitter = Math.sin(u * 69 + evolution) * 0.016 + Math.sin(u * 137 - evolution * 0.8) * 0.009;
        const lat = latitude + Math.sin(u * 11 + phase) * 0.12 + jitter;
        const localRadius = r + Math.sin(u * 45 + evolution) * 0.02;
        positions.setXYZ(j, Math.cos(theta) * Math.cos(lat) * localRadius, Math.sin(lat) * localRadius, Math.sin(theta) * Math.cos(lat) * localRadius);
      }
      positions.needsUpdate = true;
      const life = Math.pow(0.5 + 0.5 * Math.sin(time * (1.05 + index * 0.037) + phase), 3);
      line.material.opacity = this.parameters.filamentIntensity * (0.05 + life * 0.65);
    });
  }
}
