import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { OrthographicCamera, Vector3 } from 'three';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const profile = fs.mkdtempSync(os.tmpdir() + '/archon-quality-');
const child = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--window-size=1280,960', 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { at: new Date().toISOString(), url, environment: { os: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0].model,
  mode: 'Native headed Chrome; CDP noDefaults, no forced focus or background throttling override' }, actions: [], samples: [], errors: [] };
let browser;
try {
  for (let i = 0; !fs.existsSync(profile + '/DevToolsActivePort') && i < 100; i++) await wait(100);
  const port = fs.readFileSync(profile + '/DevToolsActivePort', 'utf8').split('\n')[0];
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { noDefaults: true });
  const context = browser.contexts()[0], page = context.pages()[0];
  await page.setViewportSize({ width: 1280, height: 900 });
  report.environment.chrome = browser.version();
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto(url); await page.locator('#status').filter({ hasText: 'Ready' }).waitFor();
  report.environment.gpu = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), dpr: devicePixelRatio };
  });
  const read = () => page.evaluate(() => {
    const s = window.archonDebug.brain.snapshot(), v = window.archonDebug.snapshot({ measureEyes: false });
    const rows = s.log.filter(r => r.sequence > (window.qualitySequence || 0));
    if (rows.length) window.qualitySequence = rows.at(-1).sequence;
    return { runtime: s.runtime, simulationTime: s.simulationTime, pose: s.pose, sources: s.sources, markerIds: s.markerIds,
      status: s.status, command: s.currentCommand, camera: v.cameraPose, renderedPose: v.renderedPose, paused: v.paused,
      visibility: document.visibilityState, edits: s.edits, handCount: v.interaction.connection.ends.length,
      beamStrength: v.interaction.connection.strength, visualPhase: v.interaction.phase,
      handAttachmentError: Math.max(...v.interaction.connection.ends.map((p, i) => Math.hypot(...p.map((value, j) => value - v.interaction.hands[i][j])))),
      rows: rows.map(r => ({ seq: r.sequence, simulationTime: r.next.time, inputs: r.response.inputs, outputs: r.response.outputs,
        command: r.command, pose: r.next.pose, sources: r.result.sources, timing: r.timing, roundTripMs: r.roundTripMs, modelWallMs: r.response.wallMs })) };
  });
  const click = name => page.getByRole('button', { name, exact: true }).click();
  const screenshot = name => page.screenshot({ path: 'docs/screenshots/view-quality-' + name + '.png' });
  const strength = async (label, steps) => {
    await click('Select source ' + label);
    await page.waitForFunction(label => document.querySelector('#source-detail').textContent.startsWith(label + ' ['), label);
    const slider = page.getByRole('slider', { name: 'Emission strength', exact: true });
    await slider.press('Home'); for (let i = 0; i < steps; i++) await slider.press('ArrowRight');
  };
  const drag = async label => {
    await click('View all'); await click('Keep in view');
    const box = await page.getByRole('button', { name: 'Move source ' + label, exact: true }).boundingBox();
    assert(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    const before = (await read()).camera;
    await page.mouse.move(box.x + box.width / 2 + 55, box.y + box.height / 2 + 20, { steps: 12 });
    await wait(200);
    assert.deepEqual((await read()).camera.position, before.position, 'Dragging must hold the camera');
    await page.mouse.up();
  };
  const replace = async label => {
    await click('Select source ' + label); await click('Delete selected'); await click('View all');
    const s = await read(), c = s.camera;
    const camera = new OrthographicCamera(-c.halfWidth, c.halfWidth, c.halfHeight, -c.halfHeight, c.near, c.far);
    camera.position.fromArray(c.position); camera.quaternion.fromArray(c.quaternion); camera.zoom = c.zoom;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    const other = s.sources[0].position;
    const candidates = [];
    for (const dx of [-3, 3, -1, 1]) for (const dz of [2, -2]) {
      const x = Math.max(-18, Math.min(18, other.x + dx)), z = Math.max(-18, Math.min(18, other.z + dz));
      const p = new Vector3(x, 0, z).project(camera);
      candidates.push({ x: (p.x + 1) * 640, y: (1 - p.y) * 450 });
    }
    const point = await page.evaluate(points => points.find(p => document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS'), candidates);
    assert(point, 'A visible floor point is needed for replacement');
    await page.mouse.click(point.x, point.y); await wait(100);
    const after = await read(); assert.equal(after.sources.length, 2);
    assert.deepEqual(after.markerIds.sort(), after.sources.map(s => s.id).sort());
  };
  await click('Interact'); await page.waitForFunction(() => window.archonDebug.brain.snapshot().status === 'running');
  await click('View all'); await screenshot('initial');
  await page.evaluate(() => {
    const started = performance.now(); window.motionProbe = [];
    const frame = now => {
      window.motionProbe.push({ now, display: window.archonDebug.snapshot({ measureEyes: false }).renderedPose, world: window.archonDebug.brain.snapshot().pose });
      if (now - started < 5000) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  const started = performance.now();
  const actions = [
    [5, 'Keep in view', () => click('Keep in view')],
    [20, 'Drag A with camera hold', () => drag('A')],
    [35, 'Change B emission', () => strength('B', 13)],
    [50, 'Delete A and floor placement', () => replace('A')],
    [70, 'Pause', () => click('Pause')],
    [75, 'Edit B while paused', () => strength('B', 8)],
    [85, 'Resume', () => click('Play')],
    [105, 'Restart same state', async () => {
      await click('Settings'); await page.getByRole('button', { name: /Neural control/ }).click();
      await click('Restart same state'); await page.waitForFunction(() => window.archonDebug.brain.snapshot().status === 'running');
      await click('Settings'); await click('View all');
      const s = await read(); assert.deepEqual(s.sources.map(s => s.id), ['initial-a', 'initial-b']);
      assert.equal(new Set(s.markerIds).size, 2); await screenshot('restart');
    }],
    [120, 'Orbit and return', async () => {
      await click('Orbit'); await page.mouse.move(740, 390); await page.mouse.down();
      await page.mouse.move(825, 435, { steps: 14 }); await page.mouse.up(); await wait(300);
      await click('Orbit'); assert.equal((await read()).camera.keepInView, false); await screenshot('orbit-return');
    }],
    [140, 'Archon framing and keeping', async () => { await click('Archon view'); await click('Keep in view'); }],
    [160, 'Actual tab away and back', async () => {
      const before = await read(), cdp = await browser.newBrowserCDPSession();
      const tab = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: false });
      await cdp.send('Target.activateTarget', { targetId: tab.targetId });
      await page.waitForFunction(() => document.hidden);
      await wait(10000);
      const hidden = await read(); assert.equal(hidden.visibility, 'hidden');
      assert(hidden.simulationTime - before.simulationTime <= .101, 'At most an already submitted window may complete');
      await page.bringToFront(); await page.waitForFunction(() => !document.hidden);
      await cdp.send('Target.closeTarget', { targetId: tab.targetId }); await wait(450);
      const returned = await read();
      assert(returned.simulationTime - hidden.simulationTime < .7, 'No catch-up burst');
      assert(returned.runtime.hiddenSeconds >= 9.5);
      report.tabTransition = { before, hidden, returned };
    }],
    [185, 'View all', async () => { await click('View all'); await screenshot('all'); }],
    [200, 'Drag B', () => drag('B')],
    [220, 'Delete B and floor placement', () => replace('B')],
    [245, 'Archon view then keeping', async () => { await click('Archon view'); await click('Keep in view'); await screenshot('archon'); }],
    [280, 'Pause and edit A', async () => { await click('Pause'); await strength('A', 16); }],
    [285, 'Resume', () => click('Play')],
  ];
  let index = 0;
  while (performance.now() - started < 300000) {
    const elapsed = (performance.now() - started) / 1000;
    if (index < actions.length && elapsed >= actions[index][0]) {
      const [scheduled, name, action] = actions[index++], before = await read();
      await action(); const after = await read();
      report.actions.push({ scheduled, elapsed, name, before, after });
      console.log(JSON.stringify({ elapsed, action: name, sim: after.simulationTime, status: after.status }));
    }
    const state = await read();
    assert.equal(state.status, 'running'); assert.equal(state.sources.length, 2);
    assert.deepEqual([...state.markerIds].sort(), state.sources.map(s => s.id).sort());
    assert(state.handAttachmentError < .001, 'Rendered connections must follow interpolated hands');
    report.samples.push({ elapsed: (performance.now() - started) / 1000, ...state });
    await wait(1000);
  }
  report.wallSeconds = (performance.now() - started) / 1000;
  report.motionProbe = await page.evaluate(() => window.motionProbe);
  await screenshot('final');
  await page.setViewportSize({ width: 390, height: 844 }); await click('View all'); await wait(250); await screenshot('mobile');
  assert.deepEqual(report.errors, []);
  assert.equal(index, actions.length);
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  fs.writeFileSync('docs/neural/view-quality-continuous.json', JSON.stringify(report));
  console.log(JSON.stringify({ wallSeconds: report.wallSeconds, actions: report.actions.length, samples: report.samples.length, errors: report.errors, failure: report.failure }));
  await browser?.close(); child.kill('SIGTERM');
}
