import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const phase = process.env.ARCHON_EXPERIENCE_PHASE || 'after';
test.beforeAll(async () => {
  await fs.mkdir('docs/experience-ui', { recursive: true });
});

test('observation surface stays fixed and contained through intermediate window widths', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/'); await expect(page.locator('#brain-atlas')).toHaveAttribute('data-state','ready');
  const measurements=[];
  for(const width of [1536,1280,1251,1100,1000,900,760,759,600,390]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>window.scrollTo(0,0));
    const result=await page.evaluate(()=>{
      const box=id=>{const r=document.querySelector(id).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
      return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,root:box('.observation-ui'),neural:box('#neural-panel'),scene:box('#scene-viewport'),environment:box('#environment-panel'),camera:box('.camera-tools')};
    });
    measurements.push(result);
    if([1280,1100,900,390].includes(width)) await page.screenshot({path:`docs/experience-ui/${phase}-${width}.png`});
  }
  await fs.writeFile(`docs/experience-ui/${phase}-widths.json`,JSON.stringify(measurements,null,2));
  for(const row of measurements) {
    expect(row.root.width).toBe(1280);
    expect(row.scrollWidth).toBe(Math.max(row.width,1280));
    expect(row.neural.right).toBeLessThan(row.scene.x);
    expect(row.scene.right).toBeLessThan(row.environment.x);
    expect(row.camera.x).toBeGreaterThanOrEqual(row.scene.x);
    expect(row.camera.right).toBeLessThanOrEqual(row.scene.right);
  }
  expect(new Set(measurements.map(row=>row.scene.width)).size).toBe(1);
  expect(new Set(measurements.map(row=>row.scene.height)).size).toBe(1);
  await expect.poll(()=>page.evaluate(()=>window.archonDebug.brain.snapshot().status)).toBe('running');
  const state=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  expect(state.initial.profile).toBe('olfactory'); expect(state.sources).toHaveLength(2);
  expect(state.options).toMatchObject({outputsEnabled:true,directional:true,assist:false});
  for(const id of ['interact','interaction-preview','tune','experiment-files','source-editor','pause','learn-section','view-archon','keep-in-view','guide-start']) await expect(page.locator('#'+id)).toBeHidden();
  expect(await page.locator('details:visible').count()).toBe(0);
  await expect(page.locator('#experience-process')).toBeVisible();
  await expect(page.getByRole('button',{name:'View all',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Free view',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Start over',exact:true})).toBeVisible();
  await expect(page.locator('#environment-panel #restart')).toBeVisible();
  await expect(page.locator('#environment-panel #run-summary')).toBeVisible();
});

test('public observation explains the loop, exposes fresh signal values, and keeps the activity label stable', async ({ page }) => {
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>window.archonDebug?.brain.snapshot().simulationTime ?? 0)).toBeGreaterThan(.4);
  await expect(page.locator('#experience-explanation')).toBeVisible();
  await expect(page.locator('#experience-explanation')).toContainText('How it works');
  await expect(page.locator('#experience-explanation')).toContainText('fly brain');
  await expect(page.locator('#experience-action')).toHaveCount(0);
  await expect(page.locator('#source-connection .status-icon')).toBeVisible();
  await expect(page.locator('#experience-signal')).toContainText('Signal details');
  await expect(page.locator('#experience-signal-values')).toContainText(/Input L\/R .* Hz/);
  await expect(page.locator('#experience-signal-values')).toContainText(/Turn .* Hz/);
  await expect(page.locator('#activity-sample')).toHaveText('Latest completed sample');
  const sampleLabels = [];
  for (let i = 0; i < 4; i += 1) {
    sampleLabels.push(await page.locator('#activity-sample').textContent());
    await page.waitForTimeout(120);
  }
  expect(new Set(sampleLabels)).toEqual(new Set(['Latest completed sample']));
  expect(await page.getByRole('link',{name:'Experiment tools ↗',exact:true}).count()).toBe(0);
});

test('lower overview shows the signal path and the activity chart defines its unit', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#experience-process')).toBeVisible();
  await expect(page.locator('#experience-process')).toContainText('Source signals');
  await expect(page.locator('#experience-process')).toContainText('Neural activity');
  await expect(page.locator('#experience-process')).toContainText('Movement & absorption');
  await expect(page.locator('#experience-process')).toContainText('Simulated odor inputs');
  await expect(page.locator('#experience-process .lucide-radio-tower')).toHaveAttribute('viewBox', '0 0 24 24');
  await expect(page.locator('#experience-process .lucide-brain')).toHaveAttribute('viewBox', '0 0 24 24');
  await expect(page.locator('#experience-process .lucide-move-up-right')).toHaveAttribute('viewBox', '0 0 24 24');
  await expect(page.locator('#spike-definition')).toHaveText('Network spikes / 100 ms · last 8 s');
  await expect(page.locator('#experience-signal-input')).toContainText('Input L/R');
  await expect(page.locator('#experience-signal-output')).toContainText('Move L/R');
  await expect(page.locator('#experience-signal-output')).toContainText('Turn L/R');
  expect(await page.locator('#experience-instruction').textContent()).toBe('');
});

test('scrolled A/B dragging reaches the real model and the two camera controls leave the experiment intact', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>window.archonDebug?.brain.snapshot().simulationTime ?? 0)).toBeGreaterThan(.5);
  await page.evaluate(()=>window.archonDebug.brain.configure({realtime:false}));
  await expect.poll(()=>page.evaluate(()=>window.archonDebug.brain.snapshot().runtime.pendingMs)).toBeNull();
  // Configure can discard the already submitted window. Establish the next
  // completed real sample before measuring a single subsequent 100 ms step.
  await page.evaluate(()=>window.archonDebug.brain.steps(1));
  await page.setViewportSize({width:600,height:750});
  await page.evaluate(()=>window.scrollTo(435,40));
  expect(await page.evaluate(()=>scrollX)).toBe(435);
  const before=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  const handle=page.getByRole('button',{name:'Move source A',exact:true});
  const box=await handle.boundingBox();
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x-70,y-30,{steps:8}); await page.mouse.up();
  await expect.poll(async()=>(await handle.boundingBox()).x).toBeCloseTo(box.x-70,0);
  const moved=await handle.boundingBox(); expect(moved.y).toBeCloseTo(box.y-30,0);
  const edited=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  expect(edited.sources[0].position).not.toEqual(before.sources[0].position);
  expect(edited.sources[0].remaining).toBe(before.sources[0].remaining);
  expect(edited.sources[1]).toEqual(before.sources[1]); expect(edited.initial).toEqual(before.initial);
  expect(edited.simulationTime).toBe(before.simulationTime);
  const next=await page.evaluate(()=>window.archonDebug.brain.steps(1));
  expect(next.last.response.modelTimeMs).toBe(before.last.response.modelTimeMs+100);
  expect(next.last.response.inputs).not.toEqual(before.last.response.inputs);
  expect(next.last.sense.contributions).toHaveLength(2);
  expect(next.runtime.latestEdit.state).toBe('applied');
  expect(next.last.response.outputs).toHaveProperty('turnLeft');
  const free=page.getByRole('button',{name:'Free view',exact:true});
  await free.click(); await expect(free).toHaveAttribute('aria-pressed','true');
  await expect(handle).toBeDisabled();
  await expect(page.locator('#experience-instruction')).toBeHidden();
  const camera=await page.evaluate(()=>window.archonDebug.snapshot({measureEyes:false}).cameraPose);
  const canvas=await page.locator('#scene-viewport canvas').boundingBox();
  await page.mouse.move(canvas.x+canvas.width*.5,canvas.y+canvas.height*.5);
  await page.mouse.down(); await page.mouse.move(canvas.x+canvas.width*.5+60,canvas.y+canvas.height*.5+20,{steps:8}); await page.mouse.up();
  expect((await page.evaluate(()=>window.archonDebug.snapshot({measureEyes:false}).cameraPose)).quaternion).not.toEqual(camera.quaternion);
  const rotated=await page.evaluate(()=>window.archonDebug.snapshot({measureEyes:false}).cameraPose);
  await page.mouse.move(canvas.x+canvas.width*.5,canvas.y+canvas.height*.5);
  await page.mouse.down({button:'middle'});
  await page.mouse.move(canvas.x+canvas.width*.5+60,canvas.y+canvas.height*.5+20,{steps:8});
  await page.mouse.up({button:'middle'});
  const panned=await page.evaluate(()=>window.archonDebug.snapshot({measureEyes:false}).cameraPose);
  expect(panned.target).not.toEqual(rotated.target);
  expect(panned.zoom).toEqual(rotated.zoom);
  await page.getByRole('button',{name:'View all',exact:true}).click();
  await expect(free).toHaveAttribute('aria-pressed','false'); await expect(handle).toBeEnabled();
  const after=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  for(const key of ['last','pose','sources','initial','simulationTime','options']) expect(after[key]).toEqual(next[key]);
  await fs.writeFile('docs/experience-ui/drag-camera-response.json',JSON.stringify({before,edited,next,after},null,2));
  await page.screenshot({path:'docs/experience-ui/scrolled-drag.png'});
});

test('Start over restores the two-source experiment, while hidden tool shortcuts cannot change the public run', async ({ page }) => {
  test.setTimeout(60000);
  const errors=[]; page.on('pageerror', error=>errors.push(error.message));
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>window.archonDebug?.brain.snapshot().simulationTime ?? 0)).toBeGreaterThan(.5);
  const initial=await page.evaluate(()=>window.archonDebug.brain.snapshot().initial);
  for(const key of ['g','h','Space']) await page.keyboard.press(key);
  expect(await page.evaluate(()=>window.archonDebug.snapshot({measureEyes:false}).paused)).toBe(false);
  await expect(page.locator('.experience-ui')).not.toHaveClass(/hidden-ui/);
  await expect(page.locator('#tuning-panel')).toBeHidden();
  await page.evaluate(()=>{
    const b=window.archonDebug.brain, a=b.snapshot().sources[0];
    b.editSource(a.id,{position:{x:6,y:2.4,z:-2}});
  });
  await page.getByRole('button',{name:'Free view',exact:true}).click();
  await page.getByRole('button',{name:'Start over',exact:true}).click();
  await expect(page.getByRole('button',{name:'Start over',exact:true})).toBeDisabled();
  await expect.poll(()=>page.evaluate(()=>window.archonDebug.brain.snapshot().status)).toBe('running');
  await expect.poll(()=>page.evaluate(()=>window.archonDebug.brain.snapshot().simulationTime)).toBeGreaterThan(.2);
  const restored=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  expect(restored.initial).toEqual(initial); expect(restored.sources).toEqual(initial.sources);
  expect(restored.simulationTime).toBeLessThan(1);
  expect(restored.options).toMatchObject({realtime:true,outputsEnabled:true,directional:true,assist:false});
  await expect(page.getByRole('button',{name:'Free view',exact:true})).toHaveAttribute('aria-pressed','false');
  expect(await page.locator('#scene-viewport canvas').count()).toBe(1);
  expect(await page.locator('.source-handle').count()).toBe(2);
  expect(page.workers()).toHaveLength(1); expect(errors).toEqual([]);
  await expect.poll(()=>page.evaluate(()=>window.archonDebug.brain.snapshot().simulationTime)).toBeGreaterThan(6);
  await page.setViewportSize({width:1280,height:900});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'docs/experience-ui/running-desktop.png'});
  await fs.writeFile('docs/experience-ui/running-response.json',JSON.stringify(await page.evaluate(()=>window.archonDebug.brain.snapshot()),null,2));
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.scrollTo(485,0));
  await page.screenshot({path:'docs/experience-ui/running-narrow-scrolled.png'});
});

test('reduced motion waits for an explicit Start and retains edits made before starting', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>window.archonDebug?.brain.snapshot().status)).toBe('running');
  expect(await page.evaluate(()=>window.archonDebug.snapshot({measureEyes:false}).paused)).toBe(true);
  expect((await page.evaluate(()=>window.archonDebug.brain.snapshot())).simulationTime).toBe(0);
  await page.evaluate(()=>{
    const b=window.archonDebug.brain;
    b.editSource(b.snapshot().sources[0].id,{position:{x:5,y:2.4,z:3}});
  });
  await page.getByRole('button',{name:'Start',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.archonDebug.brain.snapshot().simulationTime)).toBeGreaterThan(.2);
  expect((await page.evaluate(()=>window.archonDebug.brain.snapshot())).sources[0].position).toEqual({x:5,y:2.4,z:3});
  await expect(page.getByRole('button',{name:'Start over',exact:true})).toBeVisible();
});

test('model failure stays visible, and Start over retries the actual model rather than a preview', async ({ page }) => {
  await page.route('**/data/groups783.json',route=>route.abort('failed'));
  await page.goto('/');
  await expect(page.locator('#run-summary')).toHaveAttribute('role','alert');
  await expect(page.locator('#experience-instruction')).toContainText('Start over to retry');
  const failed=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  expect(failed.status).toBe('error'); expect(failed.simulationTime).toBe(0);
  expect(failed.last).toBeNull();
  await expect(page.getByRole('button',{name:'Move source A',exact:true})).toBeDisabled();
  await page.screenshot({path:'docs/experience-ui/model-error.png'});
  await page.unroute('**/data/groups783.json');
  await page.getByRole('button',{name:'Start over',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.archonDebug.brain.snapshot().simulationTime)).toBeGreaterThan(.2);
  const recovered=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  expect(recovered.metadata).toBeTruthy(); expect(recovered.last.response.outputs).toHaveProperty('goLeft');
  expect(recovered.initial).toEqual(failed.initial); expect(recovered.status).toBe('running');
  expect((await page.evaluate(()=>window.archonDebug.snapshot({measureEyes:false}))).previewVisible).toBe(false);
  await fs.writeFile('docs/experience-ui/error-retry.json',JSON.stringify({failed,recovered},null,2));
});

test('experiment tools remain a direct technical route without resetting the public run or exposing hidden controls to Tab', async ({ page }) => {
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>window.archonDebug?.brain.snapshot().simulationTime ?? 0)).toBeGreaterThan(.2);
  await page.evaluate(()=>window.archonDebug.brain.configure({realtime:false}));
  await expect.poll(()=>page.evaluate(()=>window.archonDebug.brain.snapshot().runtime.pendingMs)).toBeNull();
  const before=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  for(let i=0;i<16;i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(()=>Boolean(document.activeElement.closest('#experiment-internals')))).toBe(false);
  }
  expect(await page.getByRole('link',{name:'Experiment tools ↗',exact:true}).count()).toBe(0);
  const tools=await page.context().newPage();
  await tools.goto('/?tools=1');
  await expect(tools.locator('#status')).toHaveText('Ready');
  for(const id of ['interact','interaction-preview','save-experiment','load-experiment','tune','pause','restart']) await expect(tools.locator('#'+id)).toBeVisible();
  expect((await tools.evaluate(()=>window.archonDebug.brain.snapshot())).status).toBe('off');
  expect(await tools.locator('canvas').count()).toBe(1);
  await tools.close();
  const after=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  for(const key of ['last','pose','sources','initial','simulationTime','options']) expect(after[key]).toEqual(before[key]);
});
