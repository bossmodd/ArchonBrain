import fs from 'node:fs';
import { FlyBrain } from '../public/neural/flybrain/flybrain.js';
import { NeuralModel } from '../src/neural/NeuralModel.js';
import { NeuralWorld } from '../src/neural/NeuralWorld.js';
import { NeuralController } from '../src/neural/NeuralController.js';
const annotation = JSON.parse(fs.readFileSync('public/neural/flybrain/data/groups783.json'));
const brain = await FlyBrain.load({ graph: new URL('../public/neural/flybrain/data/flywire783.fbg.gz', import.meta.url), recordCapacity: 1024 });
const tame = JSON.parse(fs.readFileSync('third_party/hae/ningen/web/data/tame783.json')).silenced;
const types = ['DNa01', 'DNa02', 'DNg13', 'DNp09', 'MDN', 'DNa03', 'DNa13', 'DNa15', 'DNa16', 'DNp32'];
const groups = Object.fromEntries(types.flatMap(type => ['L','R'].map(side => [`${type}${side}`, annotation.groups[`dn:${type}:${side}`].idx])));
for (const side of ['L','R']) groups[`MN9${side}`] = annotation.groups[`motor:CB0701:${side}`].idx;
const totals = () => { const c = brain.counts(); return Object.fromEntries(Object.entries(groups).map(([k,idx]) => [k, idx.reduce((s,i)=>s+c[i],0)])); };
const difference = (before,after,seconds) => Object.fromEntries(Object.entries(groups).map(([k,idx])=>[k,(after[k]-before[k])/idx.length/seconds]));
const candidates = {
  lc11: ['LC11'], honey: ['DM1','DM2','DM4','VA2','DL1'],
  meat: ['DP1m','DC4','VL2a','VM7d','VM7v'], dung: ['VM1','V','VM7d','VM7v','VM6v'],
};
const file = process.argv[2] || 'baseline';
if (file === 'baseline') {
 const results=[];
 for (const trial of JSON.parse(fs.readFileSync('docs/neural/approach-trials.json')).filter(x=>x.split!=='held-out')) {
  const model=new NeuralModel(brain,annotation,trial.seed), world=new NeuralWorld(), controller=new NeuralController();
  world.pose={...trial.pose};world.setSources([trial.source]);const history=[];
  for(let i=0;i<trial.timeoutSeconds*10;i++) {
   const sense=world.sense(),before=totals(), response=model.step(sense.inputs), raw=difference(before,totals(),.1);
   const command=controller.step(response.outputs,sense,.1,{assist:false});world.advance(command,.1);
   history.push({sense,raw,response,command,next:world.sense()});
  }
  const last=history.at(-1);const summary={name:trial.name,seed:trial.seed,heading:trial.pose.heading,initialDistance:history[0].sense.target.distance,finalDistance:last.next.target.distance,finalBearing:last.next.target.bearing,pose:world.pose,contact:history.some(r=>r.next.inputs.contactSugar>0),absorption:history.some(r=>r.command.phase==='absorb'),meanRaw:Object.fromEntries(Object.keys(last.raw).map(k=>[k,history.reduce((s,r)=>s+r.raw[k],0)/history.length])),maxSpeed:Math.max(...history.map(r=>r.command.speed)),minSpeed:Math.min(...history.map(r=>r.command.speed)),meanYaw:history.reduce((s,r)=>s+r.command.yaw,0)/history.length};
  results.push({trial,summary,history});console.log(JSON.stringify(summary));
 }
 fs.writeFileSync('docs/neural/approach-baseline.json',JSON.stringify(results));
} else {
 const results=[];
 for (const stable of [false,true]) for (const [name,types] of Object.entries(candidates)) for(const hz of [5,20,48]) for (const side of ['L','R']) {
  brain.silence(tame,stable,{byIndex:true});brain.clearStimuli();brain.reset(1);
  const idx=types.flatMap(type=>annotation.groups[name==='lc11'?`vpn:${type}:${side}`:`olfactory:ORN_${type}:${side}`].idx);
  brain.stimulate(idx,hz,{byIndex:true});const before=totals();const started=performance.now();const r=brain.run(1000,{events:false});
  const out=difference(before,totals(),1);brain.clearStimuli();const quiet=brain.run(500,{events:false});
  const row={name,stable,hz,side,count:idx.length,spikesPerSecond:r.spikes,residualSpikesPerSecond:quiet.spikes*2,wallMs:performance.now()-started,out};results.push(row);console.log(JSON.stringify(row));
 }
 fs.writeFileSync('docs/neural/approach-candidates.json',JSON.stringify({tameCount:tame.length,candidates,results},null,2));
}
