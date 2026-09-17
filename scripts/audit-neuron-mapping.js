import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { parseNeuronAtlas } from '../src/ui/NeuronAtlas.js';
const atlas=parseNeuronAtlas(gunzipSync(await readFile('public/neural/flybrain/data/pos783.bin.gz')));
const bytes=gunzipSync(await readFile('public/neural/flybrain/data/flywire783.fbg.gz'));
const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173/');await page.locator('#status').filter({hasText:'Ready'}).waitFor({state:'attached'});
 const metadata=await page.evaluate(async()=>{const b=window.archonDebug.brain;await b.start({profile:'olfactory',realtime:false});return b.snapshot().metadata;});
 const report={browser:browser.version(),profile:'olfactory',groups:{}};
 for(const kind of ['inputs','outputs'])for(const [channel,g]of Object.entries(metadata[kind])){
  const mismatches=g.indices.filter((index,i)=>g.ids[i]!==view.getBigUint64(16+index*8,true).toString());
  report.groups[kind+'.'+channel]={count:g.indices.length,matched:g.indices.length-mismatches.length,missingCoordinates:g.indices.filter(i=>atlas.point(i).classId===255).length};
  if(mismatches.length)throw new Error('Graph ID mismatch: '+channel);
 }
 await writeFile('docs/ui-purpose/live-mapping.json',JSON.stringify(report,null,2)+'\n');console.log(report);
} finally {await browser.close();}
