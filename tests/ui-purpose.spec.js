import { test, expect } from '@playwright/test';

test('first visit explains the real connection and one-source entry confirms replacing a current experiment', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  await expect(page.getByText('A simulated fly brain drives this Archon.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Source signals to neural activity to movement and absorption', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try one source', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try one source', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.archonDebug.brain.snapshot().status)).toBe('running');
  const original = await page.evaluate(async () => { const b = window.archonDebug.brain; await b.saveExperiment('Keep me'); return b.snapshot(); });
  expect(original.initial.profile).toBe('olfactory'); expect(original.initial.sources).toHaveLength(1);
  expect(Math.hypot(original.initial.sources[0].position.x, original.initial.sources[0].position.z)).toBeCloseTo(4);
  expect(original.options.assist).toBe(false);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Try one source', exact: true }).click();
  const unchanged = await page.evaluate(() => window.archonDebug.brain.snapshot());
  expect(unchanged.initial).toEqual(original.initial); expect(unchanged.pose).toEqual(original.pose); expect(unchanged.sources).toEqual(original.sources);
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('new experiment'); await dialog.accept(); });
  await page.getByRole('button', { name: 'Try one source', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.archonDebug.brain.snapshot().status)).toBe('running');
  const result = await page.evaluate(async () => { const b = window.archonDebug.brain; await b.saveExperiment('Settled'); b.configure({ realtime: false }); return b.steps(100); });
  expect(result.log.some(row => row.result.absorbed > 0)).toBe(true);
  expect(result.log.every(row => row.command.assistYaw === 0)).toBe(true);
});

test('the map distinguishes anchor locations and applied inputs from measured motor spikes and defines its trace', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#brain-atlas')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#atlas-description')).toContainText('Neuron anchor locations');
  await expect(page.locator('.brain-legend')).toContainText('Applied inputs');
  await expect(page.locator('.brain-legend')).toContainText('Recorded motor spikes');
  await expect(page.locator('#spike-definition')).toHaveText('Network spikes / 100 ms · last 8 s');
  const row = await page.evaluate(async () => { const b = window.archonDebug.brain; await b.start({ profile:'olfactory', realtime:false, outputsEnabled:false }); await b.steps(4); await b.saveExperiment('Paused'); return b.snapshot().last; });
  await expect(page.locator('#spike-trace')).toHaveAttribute('data-last-count', String(row.response.spikes));
  await expect(page.locator('#activity-sample')).toHaveText('Paused sample');
  await page.locator('#neural-detail > summary').click();
  await expect(page.locator('#atlas-definition')).toContainText('independently normalized');
  await expect(page.locator('#atlas-definition')).toContainText('not soma locations');
});

test('experiment view and developer disclosures retain one set of controls and never restart on opening', async ({ page }) => {
  await page.goto('/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  const before = await page.evaluate(async () => { const b=window.archonDebug.brain; await b.start({profile:'olfactory',mode:'interactive',realtime:false,outputsEnabled:false,assist:true,directional:false}); await b.steps(3); await b.saveExperiment('\uba54\ubaa8 \uadf8\ub300\ub85c'); return b.snapshot(); });
  for(const id of ['experiment-name','save-experiment','interaction-preview']) await expect(page.locator(`#${id}`)).toBeVisible();
  for(const id of ['body','view-all']) await expect(page.locator(`#${id}`)).toBeHidden();
  await expect(page.locator('#exception-status')).toHaveText('Neural output disconnected · Directional signal removed · Steering assist enabled');
  await expect(page.locator('#experiment-name')).toBeVisible();
  await page.locator('#experiment-name').fill('\uc0ac\uc6a9\uc790\uac00 \uc4f4 \uc774\ub984');
  await page.locator('#view-menu > summary').click();
  await expect(page.locator('#view-all')).toBeVisible();
  await page.locator('#view-menu > summary').click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('#developer-tools > summary').click();
  for(const id of ['interaction-preview','body','runtime-details','environment-details']) await expect(page.locator(`#${id}`)).toBeVisible();
  await expect(page.locator('#body')).toHaveCount(1); await expect(page.locator('#experiment-name')).toHaveCount(1);
  const after=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  expect(after.last).toEqual(before.last); expect(after.initial).toEqual(before.initial); expect(after.pose).toEqual(before.pose); expect(after.sources).toEqual(before.sources);
  await page.locator('#developer-tools > summary').click();
  await expect(page.locator('#body')).toBeHidden();
});

test('first action stays visible before a model starts and small-screen menus preserve the paused state', async ({ page }, testInfo) => {
  await page.setViewportSize({width:1440,height:900}); await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  await expect(page.getByText('Move the energy sources and watch the brain and body respond.',{exact:false})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('first-screen.png')});
  await page.getByRole('button',{name:'Try one source',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.archonDebug.brain.snapshot().status)).toBe('running');
  await expect(page.locator('#guide-message')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>window.archonDebug.brain.snapshot().simulationTime)).toBeGreaterThan(1);
  await page.screenshot({path:testInfo.outputPath('one-source.png')});
  const before=await page.evaluate(async()=>{const b=window.archonDebug.brain;await b.saveExperiment('Screen check');return b.snapshot();});
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#guide-start')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  const scene=await page.locator('#scene-viewport').boundingBox(); expect(scene.height).toBeGreaterThan(350);
  await page.screenshot({path:testInfo.outputPath('small-screen.png')});
  await expect(page.locator('#experiment-name')).toBeVisible();
  await page.locator('#experiment-name').fill('\uadf8\ub300\ub85c \ubcf4\uc874');
  await page.locator('#view-menu > summary').click();
  await expect(page.locator('#view-all')).toBeVisible();
  await page.locator('#view-menu > summary').press('Escape');
  await expect(page.locator('#view-menu')).not.toHaveAttribute('open','');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('#developer-tools > summary').click();
  await expect(page.locator('#interaction-preview')).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('developer-small.png')});
  const after=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  expect(after.last).toEqual(before.last);expect(after.pose).toEqual(before.pose);expect(after.sources).toEqual(before.sources);
});

test('the first-experience entry stays locked while the real experiment file is still being read', async ({ page }) => {
  await page.goto('/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  const file=await page.evaluate(async()=>{
    const b=window.archonDebug.brain;await b.start({profile:'olfactory',mode:'interactive',realtime:false});
    const file=await b.saveExperiment('File boundary');
    const original=File.prototype.text;
    File.prototype.text=async function(){const text=await original.call(this);await new Promise(resolve=>{window.releaseFileRead=resolve;});return text;};
    return file;
  });
  try {
    await page.locator('#experiment-file').setInputFiles({name:'actual.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
    await expect(page.locator('#experiment-status')).toContainText('Loading experiment');
    await expect(page.locator('#guide-start')).toBeDisabled();
  } finally { await page.evaluate(()=>window.releaseFileRead?.()); }
  await expect(page.locator('#experiment-status')).toContainText('Press Play');
  const restored=await page.evaluate(()=>window.archonDebug.brain.snapshot());
  expect(restored.sources).toEqual(file.sources);expect(restored.pose).toEqual(file.pose);
});
