import { test, expect } from '@playwright/test';

for (const time of [3.11349999998212, 13.003400000011943]) test(`the actual scene stays finite through bloom at previously black idle time ${time}`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async time => {
    const url = performance.getEntriesByType('resource').find(entry => /\/src\/scene\/Stage\.js/.test(entry.name)).name;
    const { Stage } = await import(url);
    const render = Stage.prototype.render;
    window.archonDebug.setTime(time);
    return new Promise(resolve => {
      Stage.prototype.render = function () {
        Stage.prototype.render = render;
        render.call(this);
        const gl = this.renderer.getContext();
        const screen = new Uint8Array(4);
        gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, screen);
        this.renderer.setRenderTarget(this.composer.writeBuffer);
        const hdr = new Float32Array(4);
        gl.readPixels(Math.floor(this.composer.writeBuffer.width / 2), Math.floor(this.composer.writeBuffer.height / 2), 1, 1, gl.RGBA, gl.FLOAT, hdr);
        this.renderer.setRenderTarget(null);
        resolve({ finite: Array.from(hdr).every(Number.isFinite), screen: Array.from(screen), error: gl.getError() });
      };
    });
  }, time);
  expect(result.error).toBe(0);
  expect(result.finite, 'An invalid material value must not poison the whole bloom buffer').toBe(true);
  expect(result.screen[3], 'The completed scene must remain opaque').toBe(255);
  expect(Math.max(...result.screen.slice(0, 3))).toBeGreaterThan(100);
});

test('the body rim shader stays finite when normal rounding exceeds a unit dot product', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const finite = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/src\/scene\/Stage\.js/.test(entry.name)).name;
    const { Stage } = await import(url);
    const render = Stage.prototype.render;
    const stage = await new Promise(resolve => {
      Stage.prototype.render = function () { Stage.prototype.render = render; render.call(this); resolve(this); };
    });
    const { ShaderMaterial, WebGLRenderTarget, FloatType } = await import('/node_modules/three/build/three.module.js');
    const { FullScreenQuad } = await import('/node_modules/three/examples/jsm/postprocessing/Pass.js');
    let bodyMaterial;
    stage.scene.getObjectByName('BodyMesh').traverse(object => { if (object.isSkinnedMesh) bodyMaterial = object.material; });
    const shader = { uniforms: {}, fragmentShader: `
      void main() {
        vec3 normal = vec3(0.0, 0.0, 1.0000001192092896);
        vec3 vViewPosition = vec3(0.0, 0.0, 1.0);
        vec3 totalEmissiveRadiance = vec3(0.0);
        #include <emissivemap_fragment>
        gl_FragColor = vec4(totalEmissiveRadiance, 1.0);
      }` };
    bodyMaterial.onBeforeCompile(shader);
    const material = new ShaderMaterial({ uniforms: shader.uniforms,
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader: shader.fragmentShader });
    const quad = new FullScreenQuad(material);
    const target = new WebGLRenderTarget(2, 2, { type: FloatType });
    stage.renderer.setRenderTarget(target);
    quad.render(stage.renderer);
    const values = new Float32Array(16);
    stage.renderer.readRenderTargetPixels(target, 0, 0, 2, 2, values);
    stage.renderer.setRenderTarget(null);
    target.dispose(); material.dispose(); quad.dispose();
    return Array.from(values).every(Number.isFinite);
  });
  expect(finite, 'A one-ULP normal error must not produce NaN in the actual rim shader').toBe(true);
});

test('the real ribbon shader tolerates interpolated UVs just outside their endpoints', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const invalid = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/src\/scene\/Stage\.js/.test(entry.name)).name;
    const { Stage } = await import(url);
    const render = Stage.prototype.render;
    const stage = await new Promise(resolve => {
      Stage.prototype.render = function () { Stage.prototype.render = render; render.call(this); resolve(this); };
    });
    const { ShaderMaterial, WebGLRenderTarget, FloatType, Vector2 } = await import('/node_modules/three/build/three.module.js');
    const { FullScreenQuad } = await import('/node_modules/three/examples/jsm/postprocessing/Pass.js');
    const source = stage.scene.getObjectByName('RedSatelliteSystem').satellites[0].ribbon.material;
    const material = new ShaderMaterial({ uniforms: { ...source.uniforms, testUV: { value: new Vector2() } },
      vertexShader: `uniform vec2 testUV; varying vec2 vUv; varying vec3 vPosition;
        void main(){vUv=testUV;vPosition=vec3(0.0);gl_Position=vec4(position.xy,0.0,1.0);}`,
      fragmentShader: source.fragmentShader });
    const quad = new FullScreenQuad(material);
    const target = new WebGLRenderTarget(2, 2, { type: FloatType });
    const bad = [];
    for (const uv of [[.5, 1.0000001192092896], [1.0000001192092896, .5]]) {
      material.uniforms.testUV.value.set(...uv);
      stage.renderer.setRenderTarget(target); quad.render(stage.renderer);
      const values = new Float32Array(16);
      stage.renderer.readRenderTargetPixels(target, 0, 0, 2, 2, values);
      if (!Array.from(values).every(Number.isFinite)) bad.push(uv);
    }
    stage.renderer.setRenderTarget(null);
    target.dispose(); material.dispose(); quad.dispose();
    return bad;
  });
  expect(invalid, 'Ribbon edge rounding must not produce NaN alpha or color').toEqual([]);
});

test('the actual filament shader has finite opacity for face-on interpolated normals', async ({ page }) => {
  await page.goto('/?tools=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const invalid = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/src\/scene\/Stage\.js/.test(entry.name)).name;
    const { Stage } = await import(url);
    const render = Stage.prototype.render;
    const stage = await new Promise(resolve => {
      Stage.prototype.render = function () { Stage.prototype.render = render; render.call(this); resolve(this); };
    });
    const { ShaderMaterial, WebGLRenderTarget, FloatType } = await import('/node_modules/three/build/three.module.js');
    const { FullScreenQuad } = await import('/node_modules/three/examples/jsm/postprocessing/Pass.js');
    const source = stage.scene.getObjectByName('FilamentLayer').children[0].material;
    const material = new ShaderMaterial({ uniforms: source.uniforms,
      vertexShader: `varying vec3 vLocal; varying vec3 vNormal; varying vec3 vView;
        void main(){vLocal=position;vNormal=vec3(position.xy,1.0);vView=vNormal;gl_Position=vec4(position.xy,0.0,1.0);}`,
      fragmentShader: source.fragmentShader });
    const quad = new FullScreenQuad(material);
    const target = new WebGLRenderTarget(64, 64, { type: FloatType });
    const values = new Float32Array(64 * 64 * 4);
    stage.renderer.setRenderTarget(target); quad.render(stage.renderer);
    stage.renderer.readRenderTargetPixels(target, 0, 0, 64, 64, values);
    stage.renderer.setRenderTarget(null);
    target.dispose(); material.dispose(); quad.dispose();
    return values.filter(value => !Number.isFinite(value)).length;
  });
  expect(invalid, 'Normalized face-on vectors must not make fractional powers invalid').toBe(0);
});
