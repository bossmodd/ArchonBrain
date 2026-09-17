import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const phase = process.env.ARCHON_LAYOUT_PHASE || 'after';
async function setup(page) {
  await page.goto('/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(async () => {
    const b = window.archonDebug.brain;
    await b.start({ profile: 'olfactory', mode: 'interactive', realtime: false, seed: 7,
      sources: [{ id: 'a', label: 'A', position: { x: -3.464, y: 2.4, z: 2 }, strength: 1, remaining: .8 },
      { id: 'b', label: 'B', position: { x: 3, y: 2.4, z: 3 }, strength: .7, remaining: .6 }] });
    await b.steps(12); await b.saveExperiment('Equal observation');
  });
}
test('reference proportions preserve responsive ordering and document explanations', async ({ page }) => {
  test.setTimeout(90000); await setup(page);
  const measurements = [];
  for (const [width,height] of [[1280,900],[1440,900],[390,844]]) {
    await page.setViewportSize({width,height}); await page.evaluate(() => window.scrollTo(0,0));
    await page.locator('#view-archon').click();
    await expect(page.locator('#brain-atlas')).toHaveAttribute('data-state','ready');
    await page.screenshot({path:`docs/experience-ui/tools-regression/equal-observation/${phase}-${width}.png`});
    await page.screenshot({path:`docs/experience-ui/tools-regression/equal-observation/${phase}-${width}-full.png`,fullPage:true});
    measurements.push(await page.evaluate(() => {
      const box=id=>{const r=document.querySelector(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,neural:box('#neural-panel'),brain:box('#brain-atlas'),scene:box('#scene-viewport'),environment:box('#environment-panel'),footer:box('.viewer-footer')};
    }));
  }
  await fs.writeFile(`docs/experience-ui/tools-regression/equal-observation/${phase}-measurements.json`,JSON.stringify(measurements,null,2));
  for (const m of measurements.slice(0,2)) {
    expect((m.scene.width+2)/m.neural.width).toBeCloseTo(1.38,1);
    expect(m.neural.x+m.neural.width).toBeLessThan(m.scene.x);
    expect(m.scene.x+m.scene.width).toBeLessThan(m.environment.x);
    expect(m.brain.width/m.brain.height).toBeGreaterThan(1.5);
    expect(m.neural.y+m.neural.height).toBeCloseTo(m.scene.y+m.scene.height+1,0);
    expect(m.footer.y+m.footer.height).toBeLessThanOrEqual(900);
  }
  const small=measurements[2];
  expect(small.brain.y).toBeGreaterThan(small.scene.y+small.scene.height);
  expect(small.environment.y).toBeGreaterThan(small.brain.y+small.brain.height);
  for(const m of measurements) expect(m.scrollWidth).toBe(m.width);
});

test('Expand uses the same live neuron view, rerasterizes real coordinates and restores on Escape', async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({width:1280,height:900}); await setup(page);
  const before=await page.evaluate(()=>{window.originalBrainView=document.querySelector('#brain-atlas');return window.archonDebug.brain.snapshot();});
  const panelHeight = (await page.locator('#neural-panel').boundingBox()).height;
  const raster=await page.locator('#brain-atlas').getAttribute('data-raster-width');
  const bounds=await page.locator('#brain-atlas').getAttribute('viewBox');
  await page.getByRole('button',{name:'Expand',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Neural activity'})).toBeVisible();
  expect((await page.locator('#neural-panel').boundingBox()).height).toBeCloseTo(panelHeight, 0);
  await expect.poll(async()=>Number(await page.locator('#brain-atlas').getAttribute('data-raster-width'))).toBeGreaterThan(Number(raster));
  expect(await page.evaluate(()=>window.originalBrainView===document.querySelector('#brain-atlas'))).toBe(true);
  expect(await page.locator('#brain-atlas').getAttribute('viewBox')).toBe(bounds);
  const during=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  for(const key of ['last','pose','sources','initial','simulationTime','options'])expect(during[key]).toEqual(before[key]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('#brain-expand')).toBeFocused();
  await page.locator('#pause').click();
  await page.locator('#brain-expand').click();
  const running=await page.evaluate(async()=>{const b=window.archonDebug.brain;await b.steps(3);return b.snapshot();});
  await expect(page.locator('#brain-atlas')).toHaveAttribute('data-sample-time',String(running.last.response.modelTimeMs));
  await page.screenshot({path:'docs/experience-ui/tools-regression/equal-observation/expanded-live.png'});
  await page.getByRole('button',{name:'Close',exact:true}).click();
  const after=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  expect(after.last).toEqual(running.last); expect(after.simulationTime).toBe(running.simulationTime);
  await page.screenshot({path:'docs/experience-ui/tools-regression/equal-observation/interact-live.png'});
  expect(await page.locator('#brain-atlas').count()).toBe(1);
});

test('medium layout and scrolled canvas editing retain real world state and pointer alignment', async ({ page }) => {
  test.setTimeout(60000); await page.setViewportSize({width:1000,height:900}); await setup(page);
  const neural=await page.locator('#neural-panel').boundingBox(), scene=await page.locator('#scene-viewport').boundingBox(), environment=await page.locator('#environment-panel').boundingBox();
  expect(scene.width+2).toBeCloseTo(neural.width,0);
  expect(environment.y).toBeGreaterThan(scene.y+scene.height);
  await page.setViewportSize({width:1280,height:900});
  await page.locator('#view-menu > summary').click(); await page.locator('#view-all').click(); await page.locator('#view-menu > summary').click();
  await page.getByRole('button',{name:'Select source A',exact:true}).click();
  await page.evaluate(()=>window.scrollTo(0,120));
  expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(0);
  const before=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  const handle=await page.getByRole('button',{name:'Move source A',exact:true}).boundingBox();
  const x=handle.x+handle.width/2,y=handle.y+handle.height/2;
  await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+20,y+10,{steps:5}); await page.mouse.up();
  const after=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  expect(after.sources[0].position).not.toEqual(before.sources[0].position);
  expect(after.sources[0].remaining).toBe(before.sources[0].remaining);
  expect(after.sources[1]).toEqual(before.sources[1]); expect(after.pose).toEqual(before.pose);
  const moved=await page.getByRole('button',{name:'Move source A',exact:true}).boundingBox();
  expect(moved.x-handle.x).toBeCloseTo(20,0); expect(moved.y-handle.y).toBeCloseTo(10,0);
});
