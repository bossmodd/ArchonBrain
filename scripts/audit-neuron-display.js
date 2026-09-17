import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parseNeuronAtlas } from '../src/ui/NeuronAtlas.js';
const asset = await readFile('public/neural/flybrain/data/pos783.bin.gz');
const atlas = parseNeuronAtlas(gunzipSync(asset));
const graph = gunzipSync(await readFile('public/neural/flybrain/data/flywire783.fbg.gz'));
const view = new DataView(graph.buffer, graph.byteOffset, graph.byteLength);
const ids = Array.from({length:view.getUint32(8,true)},(_,i)=>view.getBigUint64(16+i*8,true).toString());
const omitted = [], classes = {};
for(let i=0;i<atlas.count;i++){ const p=atlas.point(i); classes[p.classId]=(classes[p.classId]||0)+1; if(p.classId===255)omitted.push({index:i,id:ids[i]}); }
const record={asset:'public/neural/flybrain/data/pos783.bin.gz', sha256:createHash('sha256').update(asset).digest('hex'), graphNeurons:ids.length, uniqueGraphIDs:new Set(ids).size, atlasNeurons:atlas.count, placed:atlas.count-omitted.length, omitted, classes,
 projection:{columns:['pos_x','pos_y'],ignored:'pos_z',originalUnits:'4 × 4 × 40 nm voxels (annotation column documentation)',export:'each axis min/max normalized independently to uint16; x sign selected by mean annotated left/right',storedUnits:'dimensionless normalized positions',displayExtent:[488,288],physicalAspectRecovered:false,reason:'FLYP stores neither original extents nor annotation release ID; no physical aspect correction guessed'},
 mappingEvidence:'Pinned export_positions.py and export_graph.py use Completeness_783.csv index order; FLYP itself contains no IDs. Full source-table reconstruction cannot be verified from this binary alone.',
 spikeDefinition:'fb_run adds n_fired across all time steps in the 100 ms run; NeuralModel returns result.spikes; trace displays up to 80 UI-observed completed windows in last 8 model seconds, auto-scaled to displayed maximum; missing windows are not recovered.'};
await writeFile('docs/ui-purpose/atlas-audit.json',JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({count:record.atlasNeurons,placed:record.placed,omitted:omitted.length,classes}));
