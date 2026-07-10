import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from '../../vendor/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from '../../vendor/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from '../../vendor/examples/jsm/utils/SkeletonUtils.js';
import { loadAssetManifest, modelUrl } from './AssetManifest.js';
import { TextureCache } from './TextureCache.js';
import { createHeroModel, createEnemyModel } from '../graphics/ModelFactory.js';

function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) if (value?.isTexture) value.dispose?.();
  material.dispose?.();
}

export class AssetManager extends EventTarget {
  constructor(renderer, options = {}) {
    super();
    this.renderer = renderer;
    this.quality = options.quality ?? 'high';
    this.manifest = null;
    this.models = new Map();
    this.pending = new Map();
    this.failed = new Set();
    this.textureCache = new TextureCache(renderer);
    this.progress = { loaded: 0, total: 0, ratio: 0, label: '' };

    this.draco = new DRACOLoader();
    this.draco.setDecoderPath('./vendor/examples/jsm/libs/draco/gltf/');
    this.ktx2 = new KTX2Loader();
    this.ktx2.setTranscoderPath('./vendor/examples/jsm/libs/basis/');
    if (renderer) this.ktx2.detectSupport(renderer);
    this.loader = new GLTFLoader();
    this.loader.setDRACOLoader(this.draco);
    this.loader.setKTX2Loader(this.ktx2);
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  async initialize(manifestUrl = './assets/manifests/assets.json') {
    this.manifest = await loadAssetManifest(manifestUrl);
    return this;
  }

  setQuality(quality) { this.quality = ['high', 'medium', 'low'].includes(quality) ? quality : 'medium'; }
  resolveModelUrl(key, quality = this.quality) { return modelUrl(this.manifest?.models?.[key], quality); }

  async preload(modelKeys = [], textureKeys = [], onProgress = null) {
    if (!this.manifest) await this.initialize();
    const jobs = [
      ...modelKeys.map(key => ({ type: 'model', key })),
      ...textureKeys.map(key => ({ type: 'texture', key })),
    ];
    this.progress = { loaded: 0, total: jobs.length, ratio: jobs.length ? 0 : 1, label: '' };
    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        try {
          if (job.type === 'model') await this.loadModel(job.key);
          else await this.loadTexture(job.key);
        } catch (error) {
          console.warn(`[AssetManager] fallback: ${job.key}`, error);
        }
        this.progress.loaded += 1;
        this.progress.label = job.key;
        this.progress.ratio = jobs.length ? this.progress.loaded / jobs.length : 1;
        onProgress?.({ ...this.progress });
        this.dispatchEvent(new CustomEvent('progress', { detail: { ...this.progress } }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, jobs.length || 1) }, () => worker()));
    return this.progress;
  }

  async loadModel(key, quality = this.quality) {
    if (!this.manifest) await this.initialize();
    const cacheKey = `${key}@${quality}`;
    const cached = this.models.get(cacheKey);
    if (cached) return cached.gltf;
    if (this.pending.has(cacheKey)) return this.pending.get(cacheKey);
    const url = this.resolveModelUrl(key, quality);
    if (!url) throw new Error(`Unknown model asset: ${key}`);
    const promise = this.loader.loadAsync(url).then(gltf => {
      gltf.scene.name ||= key;
      gltf.scene.userData.assetKey = key;
      const entry = { gltf, refs: 1, url, quality };
      this.models.set(cacheKey, entry);
      this.pending.delete(cacheKey);
      return gltf;
    }).catch(error => {
      this.pending.delete(cacheKey);
      this.failed.add(cacheKey);
      throw error;
    });
    this.pending.set(cacheKey, promise);
    return promise;
  }

  async loadTexture(key) {
    if (!this.manifest) await this.initialize();
    const descriptor = this.manifest.textures[key];
    if (!descriptor) throw new Error(`Unknown texture asset: ${key}`);
    return this.textureCache.acquire(key, descriptor);
  }

  getTexture(key) { return this.textureCache.peek(key); }
  getCachedModel(key, quality = this.quality) {
    return this.models.get(`${key}@${quality}`)?.gltf
      ?? this.models.get(`${key}@medium`)?.gltf
      ?? this.models.get(`${key}@high`)?.gltf
      ?? this.models.get(`${key}@low`)?.gltf
      ?? null;
  }

  cloneModel(key, options = {}) {
    const quality = options.quality ?? this.quality;
    const candidates = [`${key}@${quality}`, `${key}@medium`, `${key}@high`, `${key}@low`];
    const actualKey = candidates.find(candidate => this.models.has(candidate));
    const entry = actualKey ? this.models.get(actualKey) : null;
    if (!entry) return this.createFallback(key, options);
    entry.refs += 1;
    const scene = cloneSkeleton(entry.gltf.scene);
    scene.userData.assetKey = key;
    scene.userData.assetQuality = entry.quality;
    scene.userData.assetCacheKey = actualKey;
    return {
      scene,
      animations: entry.gltf.animations,
      fallback: false,
      release: () => this.releaseModel(scene),
    };
  }

  createFallback(key, options = {}) {
    const refs = key.startsWith('hero.') ? createHeroModel() : createEnemyModel(options.data ?? {
      shape: 'blob', color: 0x738a62, accent: 0xe2cd78, scale: 1,
    }, Boolean(options.elite), Boolean(options.boss));
    const scene = refs.group;
    scene.userData.fallback = true;
    return { scene, animations: [], fallback: true, refs, release: () => {} };
  }

  releaseModel(instanceOrKey, quality = this.quality) {
    const cacheKey = typeof instanceOrKey === 'string' ? `${instanceOrKey}@${quality}` : instanceOrKey?.userData?.assetCacheKey;
    const entry = cacheKey ? this.models.get(cacheKey) : null;
    if (entry) entry.refs = Math.max(1, entry.refs - 1);
  }

  getStats() {
    return {
      gltfEntries: this.models.size,
      pending: this.pending.size,
      failed: this.failed.size,
      liveReferences: [...this.models.values()].reduce((sum, entry) => sum + Math.max(0, entry.refs - 1), 0),
      textures: this.textureCache.entries.size,
    };
  }

  purgeUnused() {
    for (const [key, entry] of this.models) {
      if (entry.refs > 1) continue;
      entry.gltf.scene.traverse(object => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
        else disposeMaterial(object.material);
      });
      this.models.delete(key);
    }
  }

  dispose() {
    for (const entry of this.models.values()) {
      entry.gltf.scene.traverse(object => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
        else disposeMaterial(object.material);
      });
    }
    this.models.clear();
    this.pending.clear();
    this.textureCache.dispose();
    this.draco.dispose();
    this.ktx2.dispose();
  }
}
