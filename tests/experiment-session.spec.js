import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('saving settles the real pending window and preserves the original restart baseline', async ({ page }) => {
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  expect(await page.evaluate(() => typeof window.archonDebug.brain.saveExperiment)).toBe('function');
  const result = await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    await brain.start({ profile: 'olfactory', mode: 'interactive', realtime: false, seed: 7,
      sources: [{ id: 'keep-id', label: 'B', position: { x: 3, y: 2.4, z: 3 }, strength: 1, remaining: .63 }] });
    await brain.steps(25);
    const before = brain.snapshot();
    const step = brain.steps(1);
    const file = await brain.saveExperiment('Partial signal');
    await step;
    const after = brain.snapshot(), visual = window.archonDebug.snapshot({ measureEyes: false });
    await brain.restart();
    return { before, after, file, visual, restarted: brain.snapshot() };
  });
  expect(result.after.simulationTime).toBeCloseTo(2.6);
  expect(result.file.pose).toEqual(result.after.pose);
  expect(result.file.pose).not.toEqual(result.visual.renderedPose);
  expect(result.file.sources).toEqual(result.after.sources);
  expect(result.file.sources[0].remaining).toBe(.63);
  expect(result.file.seed).toBe(7);
  expect(result.visual.paused).toBe(true);
  expect(result.after.initial).toEqual(result.before.initial);
  expect(result.after.last.response.modelTimeMs).toBe(2600);
  expect(result.restarted.pose).toEqual(result.before.initial.pose);
  expect(result.restarted.sources).toEqual(result.before.initial.sources);
});

test('loading starts a paused fresh brain with saved energy and gates, then restart uses the loaded baseline', async ({ page }) => {
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  expect(await page.evaluate(() => typeof window.archonDebug.brain.loadExperiment)).toBe('function');
  const result = await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    await brain.start({ profile: 'olfactory', mode: 'interactive', realtime: false, seed: 11,
      pose: { x: 1, z: 2, heading: -.7 }, outputsEnabled: false, directional: false, assist: true,
      sources: [{ id: 'saved-a', label: 'A', position: { x: -3, y: 2.4, z: 3 }, strength: .8, remaining: .37 },
        { id: 'saved-b', label: 'B', position: { x: 3, y: 2.4, z: 0 }, strength: 1, remaining: .61 }] });
    const file = await brain.saveExperiment('Retained energy');
    window.archonDebug.setVisualState({ interaction: { phase: 'absorb', target: { x: 0, y: 2.4, z: 2 } } });
    window.archonDebug.setTime(3);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const oldVisual = window.archonDebug.snapshot({ measureEyes: false });
    await brain.loadExperiment(JSON.stringify(file));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const loaded = brain.snapshot(), visual = window.archonDebug.snapshot({ measureEyes: false });
    brain.editSource('saved-a', { strength: .1 });
    brain.removeSource('saved-b');
    await brain.restart();
    return { file, oldVisual, loaded, visual, restarted: brain.snapshot() };
  });
  expect(result.oldVisual.interaction.flow).toBeGreaterThan(0);
  expect(result.loaded.simulationTime).toBe(0);
  expect(result.loaded.last).toBeNull();
  expect(result.loaded.metadata.seed).toBe(11);
  expect(result.loaded.pose).toEqual(result.file.pose);
  expect(result.loaded.sources).toEqual(result.file.sources);
  expect(result.loaded.options).toEqual({ ...result.file.settings, realtime: true });
  expect(result.loaded.experimentName).toBe('Retained energy');
  expect(result.visual.paused).toBe(true);
  expect(result.visual.interaction.phase).toBe('idle');
  expect(result.visual.interaction.connection.strength).toBe(0);
  expect(result.visual.interaction.pose).toBe(0);
  expect(result.restarted.sources).toEqual(result.file.sources);
  expect(result.restarted.pose).toEqual(result.file.pose);
  expect(result.restarted.experimentName).toBe('Retained energy');
});

test('a pending edit is saved from the current logical world after its stale neural reply is discarded', async ({ page }) => {
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    await brain.start({ profile: 'olfactory', mode: 'interactive', realtime: false,
      sources: [{ id: 'edit-me', label: 'A', position: { x: 3, y: 2.4, z: 3 }, strength: 1, remaining: .5 }] });
    const initial = brain.snapshot().initial;
    const pending = brain.steps(1);
    const saving = brain.saveExperiment('Edited while pending');
    brain.editSource('edit-me', { strength: .35, position: { x: -4, y: 2.4, z: 2 } });
    const file = await saving;
    await pending;
    return { file, initial, after: brain.snapshot() };
  });
  expect(result.after.discardedWindows).toBe(1);
  expect(result.after.simulationTime).toBe(0);
  expect(result.file.sources[0]).toEqual({ id: 'edit-me', label: 'A', position: { x: -4, y: 2.4, z: 2 }, strength: .35, remaining: .5 });
  expect(result.after.initial).toEqual(result.initial);
  expect(result.after.runtime.latestEdit.state).toBe('queued');
});

test('the same saved conditions reproduce real input, output, pose and energy at each simulation window', async ({ page, browser }, testInfo) => {
  test.setTimeout(90000);
  await page.goto(process.env.ARCHON_TEST_URL || '/?tools=1'); await expect(page.locator('#status')).toHaveText('Ready');
  const reports = await page.evaluate(async () => {
    const brain = window.archonDebug.brain;
    await brain.start({ profile: 'olfactory', mode: 'interactive', realtime: false, seed: 7, sources: [] });
    const template = await brain.saveExperiment('Repeatable conditions');
    const sources = [
      { id: 'repeat-a', label: 'A', position: { x: 0, y: 2.4, z: 2 }, strength: 1, remaining: .73 },
      { id: 'repeat-b', label: 'B', position: { x: 3, y: 2.4, z: -3 }, strength: .8, remaining: .51 },
    ];
    const cases = [
      { count: 0, outputsEnabled: true, directional: true },
      { count: 1, outputsEnabled: true, directional: true },
      { count: 2, outputsEnabled: true, directional: true },
      { count: 2, outputsEnabled: false, directional: true },
      { count: 2, outputsEnabled: true, directional: false },
    ];
    const reports = [];
    for (const condition of cases) {
      const file = { ...template, sources: sources.slice(0, condition.count), settings: {
        outputsEnabled: condition.outputsEnabled, directional: condition.directional, assist: false } };
      const runs = [];
      for (let repeat = 0; repeat < 2; repeat++) {
        await brain.loadExperiment(JSON.stringify(file));
        const loaded = brain.snapshot();
        if (loaded.simulationTime !== 0 || !window.archonDebug.snapshot({ measureEyes: false }).paused) throw new Error('Load must wait at time zero');
        brain.configure({ realtime: false });
        const result = await brain.steps(100);
        runs.push(result.log.map(row => ({ time: row.next.time, modelTime: row.response.modelTimeMs,
          inputs: row.response.inputs, outputs: row.response.outputs, command: row.command,
          pose: row.next.pose, sources: row.result.sources, nextInputs: row.next.inputs })));
      }
      reports.push({ condition, file, matches: JSON.stringify(runs[0]) === JSON.stringify(runs[1]), trace: runs[0] });
    }
    return reports;
  });
  expect(reports).toHaveLength(5);
  for (const report of reports) {
    expect(report.matches, JSON.stringify(report.condition)).toBe(true);
    expect(report.trace).toHaveLength(100);
    expect(report.trace.at(-1).time).toBeCloseTo(10);
    if (!report.condition.outputsEnabled) {
      expect(report.trace.every(row => row.command.reason === 'outputs-blocked')).toBe(true);
      expect(report.trace.at(-1).sources).toEqual(report.file.sources);
      expect(report.trace.at(-1).pose).toEqual(report.file.pose);
    }
    if (!report.condition.directional) for (const row of report.trace) expect(row.inputs.signalLeft).toBe(row.inputs.signalRight);
  }
  expect(reports[1].trace.some(row => row.sources[0].remaining < .73)).toBe(true);
  const path = testInfo.outputPath('reproducibility.json');
  await writeFile(path, JSON.stringify({ environment: { browser: browser.version(), platform: process.platform, arch: process.arch, url: page.url(), model: 'Actual local FlyWire v783 WASM', seed: 7, windowMs: 100, windowsPerRun: 100 }, reports }, null, 2));
  await testInfo.attach('experiment-reproducibility', { path, contentType: 'application/json' });
});
