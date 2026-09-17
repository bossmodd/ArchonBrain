import { parseNeuronAtlas } from './NeuronAtlas.js';

const NS = 'http://www.w3.org/2000/svg';
const xy = point => [12 + point.x * 488, 16 + point.y * 288];

// Presentation only: anatomy is static; highlights use the existing completed
// window's input rates and per-neuron motor rates. No fabricated full-brain firing.
export class BrainActivity {
  constructor(host) {
    host.innerHTML = `<figure class="brain-figure">
      <svg id="brain-atlas" viewBox="0 0 512 328" role="img" aria-label="FlyWire neuron positions with delivered inputs and measured motor activity" data-state="loading">
        <image width="512" height="328"/><g class="input-points"></g><g class="motor-points"></g>
        <text x="14" y="316">L</text><text x="490" y="316">R</text>
      </svg><figcaption id="atlas-caption">Loading neuron positions…</figcaption>
      <p id="atlas-description">Neuron anchor locations · 2D projection</p><div class="brain-legend"><span>Applied inputs</span><span>Recorded motor spikes</span></div>
      </figure><p id="spike-definition">Network spikes / 100 ms · last 8 s</p><div class="spike-strip"><div><output id="brain-spikes">—</output><small>spikes / 100 ms</small></div>
      <svg viewBox="0 0 160 40" role="img" aria-label="Measured network spike totals"><polyline id="spike-trace" points=""/></svg></div>`;
    this.root = host.querySelector('#brain-atlas');
    this.caption = host.querySelector('#atlas-caption');
    this.spikes = host.querySelector('#brain-spikes');
    this.trace = host.querySelector('#spike-trace');
    this.history = [];
    this.resizeObserver = new ResizeObserver(() => this.rasterize());
    this.resizeObserver.observe(this.root);
    this.load().catch(error => {
      this.root.dataset.state = 'error';
      this.caption.textContent = 'Neuron map unavailable';
      host.querySelector('#atlas-description').textContent = 'Neuron map unavailable';
      this.caption.title = error.message;
    });
  }
  async load() {
    const response = await fetch('/neural/flybrain/data/pos783.bin.gz');
    if (!response.ok) throw new Error(`Neuron positions: HTTP ${response.status}`);
    let bytes = new Uint8Array(await response.arrayBuffer());
    // Vite serves .gz with Content-Encoding; static hosts may serve raw gzip.
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    this.atlas = parseNeuronAtlas(bytes);
    // Fit the existing projected coordinates without changing their mapping.
    const points = [];
    for (let i = 0; i < this.atlas.count; i++) {
      const point = this.atlas.point(i);
      if (point.classId !== 255) points.push({ xy: xy(point), classId: point.classId });
    }
    this.points = points;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { xy: [x, y] } of points) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    this.bounds = { x: minX - 6, y: minY - 6, width: maxX - minX + 12, height: maxY - minY + 24 };
    const b = this.bounds;
    this.root.setAttribute('viewBox', `${b.x} ${b.y} ${b.width} ${b.height}`);
    this.root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.root.querySelectorAll('text').forEach((node, i) => {
      node.setAttribute('x', i ? maxX - 10 : minX);
      node.setAttribute('y', maxY + 16);
    });
    this.rasterize();
    const placed = points.length;
    this.root.dataset.state = 'ready'; this.root.dataset.placed = placed;
    this.caption.textContent = `${placed.toLocaleString('en-US')} mapped neurons`;
    this.caption.title = 'FlyWire v783 anchor points, not somas or branches. X/Y normalized separately; physical aspect is not preserved.';
  }
  rasterize() {
    if (!this.points) return;
    const rect = this.root.getBoundingClientRect(), b = this.bounds;
    if (!rect.width || !rect.height) return;
    // The static point image is regenerated at the actual fitted display size,
    // including device pixels. Inputs/motor circles stay vector SVG elements.
    const scale = Math.min(rect.width / b.width, rect.height / b.height) * Math.min(devicePixelRatio || 1, 3);
    const width = Math.ceil(b.width * scale), height = Math.ceil(b.height * scale);
    if (this.root.dataset.rasterWidth === String(width) && this.root.dataset.rasterHeight === String(height)) return;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, -b.x * scale, -b.y * scale);
    const colors = ['#82a9b653', '#568daa30', '#c5d6d35b', '#769cba50', '#769cba50', '#a3b9bc60', '#a3b9bc60', '#a3b9bc60', '#a3b9bc60'];
    for (const point of this.points) {
      ctx.fillStyle = colors[point.classId]; ctx.fillRect(...point.xy, .65, .65);
    }
    const image = this.root.querySelector('image');
    for (const [key, value] of Object.entries({ x: b.x, y: b.y, width: width / scale, height: height / scale })) image.setAttribute(key, value);
    image.setAttribute('href', canvas.toDataURL('image/png'));
    this.root.dataset.rasterWidth = width; this.root.dataset.rasterHeight = height;
  }
  update(metadata, row, active) {
    if (!this.atlas) return;
    if (metadata !== this.metadata || (!active && this.sample)) {
      this.metadata = metadata; this.sample = null; this.history = [];
      delete this.root.dataset.sampleTime;
      this.spikes.textContent = '—'; this.trace.setAttribute('points', '');
      this.root.querySelector('.input-points').replaceChildren();
      this.root.querySelector('.motor-points').replaceChildren();
    }
    if (!active || !metadata || !row || row.response === this.sample) return;
    this.sample = row.response;
    this.root.dataset.sampleTime = row.response.modelTimeMs;
    for (const [kind, groups, rates] of [
      ['input', metadata.inputs, row.response.inputs],
      ['motor', metadata.outputs, row.response.raw],
    ]) {
      const nodes = [];
      for (const [channel, group] of Object.entries(groups)) group.indices.forEach((index, j) => {
        const point = this.atlas.point(index); if (point.classId === 255) return;
        const hz = kind === 'input' ? rates[channel] : rates[channel][j];
        const [x, y] = xy(point), node = document.createElementNS(NS, 'circle');
        Object.assign(node.dataset, { channel, id: group.ids[j], index, x: point.x, y: point.y, hz });
        node.setAttribute('cx', x); node.setAttribute('cy', y);
        node.setAttribute('r', hz > 0 ? 1.5 + Math.min(2.5, Math.sqrt(hz) / 4) : .8);
        node.setAttribute('opacity', hz > 0 ? .45 + .55 * Math.min(1, hz / 60) : .16);
        node.setAttribute('class', `${kind}-neuron`);
        const title = document.createElementNS(NS, 'title');
        title.textContent = `${group.ids[j]} · ${channel} · ${hz.toFixed(1)} Hz`;
        node.append(title); nodes.push(node);
      });
      this.root.querySelector(`.${kind}-points`).replaceChildren(...nodes);
    }
    this.spikes.textContent = row.response.spikes.toLocaleString('en-US');
    this.history.push({ time: row.response.modelTimeMs, count: row.response.spikes });
    this.history = this.history.slice(-80);
    const max = Math.max(1, ...this.history.map(p => p.count));
    const end = row.response.modelTimeMs, start = Math.max(0, end - 8000);
    this.trace.setAttribute('points', this.history.map(p => `${(p.time - start) / 8000 * 160},${38 - p.count / max * 34}`).join(' '));
    this.trace.dataset.samples = this.history.length;
    this.trace.dataset.lastCount = row.response.spikes;
  }
}
