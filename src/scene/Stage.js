import {
  Scene, Color, FogExp2, WebGLRenderer, ACESFilmicToneMapping, Vector2,
  HemisphereLight, DirectionalLight, PointLight, InstancedMesh, BoxGeometry,
  MeshStandardMaterial, Object3D, WebGLRenderTarget, DepthTexture, UnsignedIntType,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CameraRig } from './CameraRig.js';

export class Stage {
  constructor(container) {
    this.scene = new Scene();
    this.scene.background = new Color('#03070c');
    this.scene.fog = new FogExp2('#03070c', 0.065);
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.setAttribute('aria-label', 'Live 3D view of a floating Archon');
    container.prepend(this.renderer.domElement);
    this.rig = new CameraRig(this.renderer.domElement);
    this.rig.camera.layers.enable(1);
    this.depthTarget = new WebGLRenderTarget(1, 1);
    this.depthTarget.depthTexture = new DepthTexture(1, 1, UnsignedIntType);
    this.scene.add(new HemisphereLight('#879fba', '#11151b', 1.35));
    const key = new DirectionalLight('#b2d7ff', 2.5);
    key.position.set(-4, 8, 5);
    this.scene.add(key);
    const rim = new DirectionalLight('#1769ff', 3.2);
    rim.position.set(4, 4, -4);
    this.scene.add(rim);
    this.groundLight = new PointLight('#29bdff', 12, 10, 2);
    this.groundLight.position.set(0, 1.4, 0);
    this.scene.add(this.groundLight);
    this.addFloor();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.rig.camera));
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.22, 0.32, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
  }
  addFloor() {
    const tiles = new InstancedMesh(new BoxGeometry(1.18, 0.12, 1.18), new MeshStandardMaterial({
      color: '#26323f', metalness: 0.48, roughness: 0.78,
    }), 32 * 32);
    const object = new Object3D();
    let index = 0;
    for (let x = -16; x < 16; x++) for (let z = -16; z < 16; z++) {
      object.position.set(x * 1.2 + 0.6, -0.07, z * 1.2 + 0.6);
      object.updateMatrix();
      tiles.setMatrixAt(index, object.matrix);
      const value = 0.62 + ((x * 31 + z * 17 + 10000) % 13) * 0.026;
      tiles.setColorAt(index++, new Color(value, value, value));
    }
    this.scene.add(tiles);
  }
  resize() {
    const width = Math.max(1, this.viewport?.clientWidth ?? window.innerWidth);
    const height = Math.max(1, this.viewport?.clientHeight ?? window.innerHeight);
    this.renderer.setSize(width, height, !this.viewport);
    this.composer.setSize(width, height);
    const pixelRatio = this.renderer.getPixelRatio();
    this.depthTarget.setSize(Math.round(width * pixelRatio), Math.round(height * pixelRatio));
    const area = this.safeArea;
    const insets = area ? { left: area.offsetLeft, top: area.offsetTop,
      right: width - area.offsetLeft - area.clientWidth,
      bottom: height - area.offsetTop - area.clientHeight } : {};
    this.rig.resize(width, height, insets);
  }
  observeViewport(viewport, safeArea) {
    this.viewport = viewport;
    this.safeArea = safeArea;
    Object.assign(this.renderer.domElement.style, { width: '100%', height: '100%' });
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(viewport);
    if (safeArea) this.resizeObserver.observe(safeArea);
    this.resize();
  }
  render() {
    this.renderer.info.reset();
    this.rig.camera.layers.set(0);
    this.renderer.setRenderTarget(this.depthTarget);
    this.renderer.render(this.scene, this.rig.camera);
    this.renderer.setRenderTarget(null);
    this.rig.camera.layers.enable(1);
    this.composer.render();
  }
}
