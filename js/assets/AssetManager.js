import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from '../../vendor/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from '../../vendor/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from '../../vendor/examples/jsm/utils/SkeletonUtils.js';
import { loadAssetManifest, modelUrl } from './AssetManifest.js';
import { TextureCache } from './TextureCache.js';
import { ASSET_FALLBACK_CONFIG } from '../core/runtimeConstants.js';

/**
 * Minimal geometry fallback when a GLB is missing.
 * Template-safe — does not import Sol ModelFactory / content.
 * Games may pass `options.createFallbackModel` to cloneModel for richer fallbacks.
 * Proportions from ASSET_FALLBACK_CONFIG (runtimeConstants).
 */
function createMinimalFallback(key, options = {}) {
  const F = ASSET_FALLBACK_CONFIG;
  const group = new THREE.Group();
  group.name = `fallback:${key}`;
  const color = options.data?.color ?? (key.startsWith('hero.') ? F.heroColor : F.enemyColor);
  const scale = options.data?.scale ?? 1;
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(
      F.capsuleRadius * scale,
      F.capsuleHeight * scale,
      F.radialSegments,
      F.heightSegments,
    ),
    new THREE.MeshStandardMaterial({
      color, roughness: F.roughness, metalness: F.metalness,
    }),
  );
  body.position.y = F.bodyY * scale;
  group.add(body);
  group.userData.fallback = true;
  group.userData.refs = { group };
  return { group, refs: { group } };
}

function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) if (value?.isTexture) value.dispose?.();
  material.dispose?.();
}

function disposeObjectTree(root) {
  root?.traverse?.(object => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
    else disposeMaterial(object.material);
  });
}

/**
 * GLTF / texture loading with explicit clone refcounts.
 *
 * Template-layer candidate — see docs/architecture-template-boundary.md
 *
 * Semantics:
 * - `loadModel` caches the source GLTF with `clones = 0` (cache hold only).
 * - `cloneModel` increments `clones` for each live skeletal instance.
 * - `releaseModel` decrements `clones` (floor 0); does not dispose source until purge.
 * - `purgeUnused` disposes cache entries whose `clones === 0`.
 */
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
      // clones = live skeleton instances; 0 means cache-only (purgeable).
      const entry = { gltf, clones: 0, url, quality };
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

  /** @returns {{ clones: number } | null} */
  getModelEntry(key, quality = this.quality) {
    const candidates = [`${key}@${quality}`, `${key}@medium`, `${key}@high`, `${key}@low`];
    const actualKey = candidates.find(candidate => this.models.has(candidate));
    return actualKey ? this.models.get(actualKey) : null;
  }

  cloneModel(key, options = {}) {
    const quality = options.quality ?? this.quality;
    const candidates = [`${key}@${quality}`, `${key}@medium`, `${key}@high`, `${key}@low`];
    const actualKey = candidates.find(candidate => this.models.has(candidate));
    const entry = actualKey ? this.models.get(actualKey) : null;
    if (!entry) return this.createFallback(key, options);
    entry.clones += 1;
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
    const factory = options.createFallbackModel ?? this.createFallbackModel ?? createMinimalFallback;
    const refs = factory(key, options);
    const scene = refs.group ?? refs.scene ?? refs;
    scene.userData.fallback = true;
    return {
      scene,
      animations: [],
      fallback: true,
      refs: refs.refs ?? refs,
      release: () => {},
    };
  }

  /**
   * Drop one live clone reference. Source GLTF stays cached until purgeUnused().
   * @returns {number} remaining clone count for that entry (−1 if unknown)
   */
  releaseModel(instanceOrKey, quality = this.quality) {
    const cacheKey = typeof instanceOrKey === 'string'
      ? `${instanceOrKey}@${quality}`
      : instanceOrKey?.userData?.assetCacheKey;
    const entry = cacheKey ? this.models.get(cacheKey) : null;
    if (!entry) return -1;
    entry.clones = Math.max(0, (entry.clones ?? 0) - 1);
    return entry.clones;
  }

  getStats() {
    let liveClones = 0;
    let purgeable = 0;
    for (const entry of this.models.values()) {
      const c = entry.clones ?? 0;
      liveClones += c;
      if (c === 0) purgeable += 1;
    }
    return {
      gltfEntries: this.models.size,
      pending: this.pending.size,
      failed: this.failed.size,
      liveReferences: liveClones,
      liveClones,
      purgeableEntries: purgeable,
      textures: this.textureCache.entries.size,
    };
  }

  /**
   * Dispose cached models that have no live clones.
   * @returns {number} number of entries removed
   */
  purgeUnused() {
    let removed = 0;
    for (const [key, entry] of this.models) {
      if ((entry.clones ?? 0) > 0) continue;
      disposeObjectTree(entry.gltf?.scene);
      this.models.delete(key);
      removed += 1;
    }
    return removed;
  }

  dispose() {
    for (const entry of this.models.values()) {
      disposeObjectTree(entry.gltf?.scene);
    }
    this.models.clear();
    this.pending.clear();
    this.textureCache.dispose();
    this.draco.dispose();
    this.ktx2.dispose();
  }
}
