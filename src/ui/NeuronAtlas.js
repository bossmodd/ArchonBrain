// hae export_positions.py reindexes root_id by Completeness_783.csv, the same
// row order export_graph.py uses for the graph's IDs. Coordinates are FlyWire
// representative points, projected with fly-left on the left and dorsal up.
export function parseNeuronAtlas(bytes) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 8 || new TextDecoder().decode(bytes.subarray(0, 4)) !== 'FLYP') throw new Error('Invalid neuron atlas');
  const count = data.getUint32(4, true);
  if (count !== 138639 || bytes.length !== 8 + count * 5) throw new Error('Incompatible neuron atlas');
  return { count, point(index) {
    if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error('Invalid neuron index');
    return { x: data.getUint16(8 + index * 2, true) / 65535,
      y: data.getUint16(8 + count * 2 + index * 2, true) / 65535,
      classId: bytes[8 + count * 4 + index] };
  } };
}
