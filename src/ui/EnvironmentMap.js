const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attributes = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
};

// Inline Lucide paths keep the public observation surface dependency-free.
const STATUS_ICONS = {
  idle: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1"/>',
  linked: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  connecting: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  absorbing: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  releasing: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="8" x2="16" y1="8" y2="16"/>',
  paused: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
};

// The square is the existing tiled floor, not a movement/collision boundary.
export class EnvironmentMap {
  constructor(ui) {
    this.ui = ui; this.sources = new Map();
    this.root = ui.root.querySelector('#minimap-host');
    this.map = svg('svg', { id: 'environment-map', viewBox: '-22 -22 44 44', 'aria-label': 'Environment map, top view. Up is positive Z, right is positive X.' });
    this.map.append(svg('path', { d: 'M-19.2 0H19.2M0 -19.2V19.2', class: 'map-axes' }),
      svg('rect', { x: -19.2, y: -19.2, width: 38.4, height: 38.4, class: 'map-floor' }));
    this.archon = svg('g', { id: 'map-archon', 'aria-label': 'Archon display position and heading' });
    this.archon.append(svg('path', { d: 'M0 -2.3L1.6 1.4L0 .7L-1.6 1.4Z' }));
    this.map.append(this.archon);
    this.caption = document.createElement('p'); this.caption.className = 'map-caption';
    this.legend = document.createElement('p'); this.legend.className = 'map-legend';
    this.legend.textContent = 'Square: editing · ring: linked';
    this.contributions = document.createElement('p'); this.contributions.id = 'source-contributions';
    this.root.append(this.map, this.legend);
    this.details = document.createElement('details'); this.details.id = 'environment-details';
    this.details.innerHTML = '<summary>Environment details</summary>';
    this.details.append(this.caption, this.contributions, ui.sourceEditor.panel.querySelector('small'));
    this.ids = document.createElement('p'); this.ids.id = 'source-ids'; this.details.append(this.ids);
    ui.root.querySelector('#environment-panel').append(this.details);
    this.connection = document.createElement('div'); this.connection.id = 'source-connection';
    this.connection.setAttribute('role', 'status');
    ui.sourceEditor.panel.querySelector('#source-detail').after(this.connection);
  }
  add(source) {
    const node = svg('g', { id: `map-source-${source.id}`, role: 'button', tabindex: 0, class: 'map-source' });
    node.append(svg('circle', { r: 2.8, class: 'map-hit' }), svg('circle', { r: 2, class: 'map-connected' }),
      svg('circle', { r: .8, class: 'map-anchor' }), svg('path', { class: 'map-leader' }));
    const label = svg('g', { class: 'map-label' });
    label.append(svg('rect', { x: -2, y: -2, width: 4, height: 4, rx: .2 }), svg('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' }));
    node.append(label);
    const select = () => { if (this.ui.sourceEditor.editable) this.ui.sourceEditor.selectedId = source.id; };
    node.addEventListener('click', select);
    node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); select(); } });
    this.map.append(node); this.sources.set(source.id, node);
  }
  update() {
    const { brain, entity, sourceEditor } = this.ui;
    const sources = brain.status === 'off' ? [] : brain.world.sources;
    const linked = brain.status === 'off' ? null : brain.currentCommand?.targetId;
    const x = entity.position.x, z = entity.position.z, heading = entity.body.heading ?? 0;
    const extent = Math.max(22, Math.abs(x) + 3, Math.abs(z) + 3, ...sources.flatMap(s => [Math.abs(s.position.x) + 3, Math.abs(s.position.z) + 3]));
    this.map.setAttribute('viewBox', `${-extent} ${-extent} ${extent * 2} ${extent * 2}`);
    const scale = extent / 22;
    this.archon.setAttribute('transform', `translate(${x} ${-z}) rotate(${heading * 180 / Math.PI}) scale(${scale})`);
    Object.assign(this.archon.dataset, { x, z, heading });
    // Label-only collision avoidance in normalized map units. World anchors,
    // view extent and all environment coordinates remain unchanged.
    const occupied = [{ x: x / scale, y: -z / scale }];
    for (const [id, node] of this.sources) if (!sources.some(s => s.id === id)) { node.remove(); this.sources.delete(id); }
    for (const source of sources) {
      if (!this.sources.has(source.id)) this.add(source);
      const node = this.sources.get(source.id), label = source.label || source.id;
      node.setAttribute('transform', `translate(${source.position.x} ${-source.position.z}) scale(${scale})`);
      node.setAttribute('aria-label', `Edit source ${label} on map`);
      node.setAttribute('aria-pressed', String(sourceEditor.selectedId === source.id));
      node.setAttribute('aria-disabled', String(!sourceEditor.editable));
      node.setAttribute('tabindex', sourceEditor.editable ? '0' : '-1');
      node.dataset.linked = String(source.id === linked);
      node.querySelector('text').textContent = source.label || '•';
      const anchor = { x: source.position.x / scale, y: -source.position.z / scale };
      const candidates = [[0,-4.5],[4.5,0],[-4.5,0],[0,4.5],[4.5,-4.5],[-4.5,-4.5],[4.5,4.5],[-4.5,4.5]];
      const [dx, dy] = candidates.find(([dx,dy]) => Math.abs(anchor.x + dx) <= 19.7 && Math.abs(anchor.y + dy) <= 19.7 && occupied.every(p => Math.abs(anchor.x + dx - p.x) >= 4.4 || Math.abs(anchor.y + dy - p.y) >= 4.4)) || [0, -4.5];
      node.querySelector('.map-label').setAttribute('transform', `translate(${dx} ${dy})`);
      node.querySelector('.map-leader').setAttribute('d', `M0 0L${dx} ${dy}`);
      occupied.push({ x: anchor.x + dx, y: anchor.y + dy });
    }
    this.caption.textContent = `+Z ↑  +X → · floor ±19.2 u · view ±${extent.toFixed(1)} u`;
    const linkedLabel = sources.find(s => s.id === linked)?.label || 'none';
    const phase = brain.currentCommand?.phase;
    const connectionState = linked ? this.ui.playback.paused ? 'paused' : phase === 'absorb' ? 'absorbing' : phase === 'prepare' ? 'connecting' : phase === 'release' ? 'releasing' : 'linked' : 'idle';
    const connectionText = linked ? this.ui.playback.paused ? `Linked to ${linkedLabel} · paused` : phase === 'absorb' ? `Absorbing from ${linkedLabel}` : phase === 'prepare' ? `Connecting to ${linkedLabel}` : `Disconnecting from ${linkedLabel}` : 'Not absorbing';
    if (this.connection.dataset.state !== connectionState || this.connection.dataset.label !== connectionText) {
      this.connection.replaceChildren();
      const icon = svg('svg', { class: 'status-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
      icon.dataset.icon = connectionState;
      icon.innerHTML = STATUS_ICONS[connectionState];
      const label = document.createElement('span'); label.textContent = connectionText;
      this.connection.append(icon, label);
      this.connection.dataset.state = connectionState;
      this.connection.dataset.label = connectionText;
    }
    this.ids.textContent = `Editing ID: ${sourceEditor.selectedId || 'none'}\nLinked ID: ${linked || 'none'}\n${sources.map(s => `${s.label}: ${s.id}`).join('\n')}`;
    const row = brain.last;
    this.contributions.textContent = brain.status !== 'off' && row?.sense.contributions?.length
      ? `Last input at ${row.sense.time.toFixed(1)} s · concentration L / R\n${row.sense.contributions.map(s => `${s.label || s.id}: ${s.concentrations.left.toFixed(3)} / ${s.concentrations.right.toFixed(3)}`).join('\n')}` : 'No sampled source contribution';
  }
}
