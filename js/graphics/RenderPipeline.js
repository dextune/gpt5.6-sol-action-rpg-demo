import * as THREE from 'three';
import { PostProcessSystem } from './PostProcessSystem.js';

export const QUALITY_PRESETS = Object.freeze({
  // Fixed scales — no mid-session buffer realloc (that caused occasional flashes).
  high: { renderScale: 1, minScale: 1, maxPixelRatio: 1.35, shadows: true, post: true, vegetation: .85, label: 'High' },
  medium: { renderScale: .85, minScale: .85, maxPixelRatio: 1.15, shadows: true, post: true, vegetation: .55, label: 'Medium' },
  low: { renderScale: .7, minScale: .7, maxPixelRatio: 1, shadows: false, post: false, vegetation: .32, label: 'Low' },
});

export class RenderPipeline {
  constructor(canvas, scene, camera, options = {}) {
    this.canvas = canvas;
    this.scene = scene;
    this.camera = camera;
    this.quality = options.quality ?? new URLSearchParams(location.search).get('quality') ?? localStorage.getItem('sol-arpg-quality') ?? 'medium';
    if (!QUALITY_PRESETS[this.quality]) this.quality = 'medium';
    this.preset = QUALITY_PRESETS[this.quality];
    this.dynamicScale = this.preset.renderScale;
    this.frameTimes = [];
    this.stats = { fps: 0, calls: 0, triangles: 0, geometries: 0, textures: 0, scale: this.dynamicScale, quality: this.quality };
    this._lastWidth = 0;
    this._lastHeight = 0;
    this._lastPixelRatio = 0;
    this._fpsSampleTimer = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.quality === 'low',
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      // Avoid a black flash when the drawing buffer is recreated on rare resizes.
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = this.preset.shadows;
    this.renderer.shadowMap.type = this.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.setClearColor(0xc2d1bd, 1);
    this.renderer.autoClear = true;
    this.renderer.info.autoReset = false;

    this.post = new PostProcessSystem(this.renderer, scene, camera, this.quality);
    this.resize(window.innerWidth, window.innerHeight);
  }

  setQuality(quality) {
    if (!QUALITY_PRESETS[quality]) return;
    this.quality = quality;
    this.preset = QUALITY_PRESETS[quality];
    this.dynamicScale = this.preset.renderScale;
    this.renderer.shadowMap.enabled = this.preset.shadows;
    this.renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.post.applyQuality(quality);
    this.stats.quality = quality;
    localStorage.setItem('sol-arpg-quality', quality);
    // Force buffer rebuild once on intentional quality change.
    this._lastWidth = 0;
    this._lastHeight = 0;
    this._lastPixelRatio = 0;
    this.resize(window.innerWidth, window.innerHeight);
  }

  resize(width, height) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    const deviceRatio = Math.min(window.devicePixelRatio || 1, this.preset.maxPixelRatio);
    const pixelRatio = Math.round(deviceRatio * this.dynamicScale * 100) / 100;
    // Skip no-op resizes — EffectComposer.setSize reallocates RTTs and flashes.
    if (
      this.width === this._lastWidth
      && this.height === this._lastHeight
      && Math.abs(pixelRatio - this._lastPixelRatio) < .001
    ) {
      return;
    }
    this.pixelRatio = pixelRatio;
    this._lastWidth = this.width;
    this._lastHeight = this.height;
    this._lastPixelRatio = pixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.post.resize(this.width, this.height, this.pixelRatio);
  }

  render(scene = this.scene, camera = this.camera, delta = 0) {
    this.renderer.info.reset();
    this.scene = scene;
    this.camera = camera;
    if (this.quality === 'low' || !this.preset.post) this.renderer.render(scene, camera);
    else this.post.render(delta);
    const info = this.renderer.info;
    this.stats.calls = info.render.calls;
    this.stats.triangles = info.render.triangles;
    this.stats.geometries = info.memory.geometries;
    this.stats.textures = info.memory.textures;
    this.stats.scale = this.dynamicScale;
    return this.stats;
  }

  /** Track FPS only — do not change resolution mid-session (prevents buffer-flash stutter). */
  monitorFrame(rawDelta) {
    if (!Number.isFinite(rawDelta) || rawDelta <= 0 || rawDelta > .25) return;
    this.frameTimes.push(rawDelta);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    this._fpsSampleTimer += rawDelta;
    if (this.frameTimes.length < 20 || this._fpsSampleTimer < 1) return;
    this._fpsSampleTimer = 0;
    const average = this.frameTimes.reduce((sum, value) => sum + value, 0) / this.frameTimes.length;
    this.stats.fps = 1 / average;
  }

  setFocusDistance(distance) { this.post.setFocusDistance(distance); }

  dispose() {
    this.post.dispose();
    this.renderer.dispose();
  }
}
