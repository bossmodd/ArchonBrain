import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const phase=process.env.ARCHON_REFERENCE_PHASE||'after';
async function setup(page) {
  await page.setViewportSize({width:1536,height:1024}); await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(async()=>{
    const b=window.archonDebug.brain;
    await b.start({profile:'olfactory',mode:'interactive',realtime:false,seed:7,
      sources:[{id:'a',label:'A',position:{x:-3,y:2.4,z:1},strength:1,remaining:.8},
      {id:'b',label:'B',position:{x:3,y:2.4,z:-1},strength:.7,remaining:.6}]});
    await b.steps(80); await b.saveExperiment('Two signals');
  });
  await page.getByRole('button',{name:'Select source A',exact:true}).click();
  await page.locator('#view-archon').click(); await page.evaluate(()=>window.scrollTo(0,0));
}
test('reference composition gives the actual views readable scale, aligned panels and direct controls',async({page})=>{
  test.setTimeout(90000); await setup(page);
  await page.screenshot({path:`docs/experience-ui/tools-regression/reference-ui/${phase}-1536.png`});
  await page.screenshot({path:`docs/experience-ui/tools-regression/reference-ui/${phase}-1536-full.png`,fullPage:true});
  const boxes=await page.evaluate(()=>{
    const box=id=>{const r=document.querySelector(id).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
    return{neural:box('#neural-panel'),brain:box('#brain-atlas'),archon:box('#archon-panel'),scene:box('#scene-viewport'),environment:box('#environment-panel'),learn:box('#learn-section')};
  });
  await fs.writeFile(`docs/experience-ui/tools-regression/reference-ui/${phase}-boxes.json`,JSON.stringify(boxes,null,2));
  expect(boxes.brain.width/boxes.brain.height).toBeGreaterThan(1.5);
  expect(boxes.neural.height).toBeCloseTo(boxes.archon.height,0);
  expect(boxes.environment.height).toBeCloseTo(boxes.archon.height,0);
  expect(boxes.neural.bottom).toBeCloseTo(boxes.archon.bottom,0);
  expect(boxes.environment.bottom).toBeCloseTo(boxes.archon.bottom,0);
  expect(boxes.archon.width/boxes.neural.width).toBeCloseTo(1.38,1);
  expect(boxes.learn.y).toBeLessThan(780);
  await expect(page.locator('#save-experiment')).toBeInViewport();
  await expect(page.locator('#load-experiment')).toBeInViewport();
  await expect(page.locator('#open-advanced')).toBeHidden();
  const hint=await page.locator('#source-hint').boundingBox();
  expect(hint.y+hint.height).toBeLessThan(boxes.environment.bottom);
  for(const width of [1280,390]) {
    await page.setViewportSize({width,height:width===390?844:900});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`docs/experience-ui/tools-regression/reference-ui/selected-${width}.png`,fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    const panel=await page.locator('#environment-panel').boundingBox(), help=await page.locator('#source-hint').boundingBox();
    expect(help.y+help.height).toBeLessThan(panel.y+panel.height);
    await expect(page.locator('#source-strength')).toBeEnabled();
  }
});

test('Archon view uses the viewport without clipping its visual envelope or changing neural state',async({page})=>{
  test.setTimeout(90000); await setup(page);
  const before=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  await page.locator('#view-archon').click();
  const {camera,after}=await page.evaluate(()=>({camera:window.archonDebug.snapshot({measureEyes:false}).cameraPose,after:window.archonDebug.brain.snapshot()}));
  const envelope=3.15;
  const fill=envelope/Math.min(camera.halfWidth/camera.zoom,camera.halfHeight/camera.zoom);
  expect(fill).toBeGreaterThan(.9); expect(fill).toBeLessThan(1);
  for(const key of ['pose','sources','last','initial','simulationTime','options']) expect(after[key]).toEqual(before[key]);
});
