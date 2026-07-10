import * as THREE from 'three';

export class TextureCache {
  constructor(renderer = null) {
    this.renderer = renderer;
    this.loader = new THREE.TextureLoader();
    this.entries = new Map();
    this.maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
  }

  async acquire(key, descriptor) {
    const existing = this.entries.get(key);
    if (existing) {
      existing.refs += 1;
      return existing.promise;
    }
    const entry = { refs: 1, texture: null, promise: null };
    entry.promise = this.loader.loadAsync(descriptor.url).then(texture => {
      texture.name = key;
      texture.colorSpace = descriptor.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.anisotropy = Math.min(this.maxAnisotropy, descriptor.anisotropy ?? 8);
      texture.wrapS = descriptor.wrapS === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
      texture.wrapT = descriptor.wrapT === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
      if (descriptor.repeat) texture.repeat.fromArray(descriptor.repeat);
      texture.generateMipmaps = descriptor.generateMipmaps !== false;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      entry.texture = texture;
      return texture;
    }).catch(error => {
      this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, entry);
    return entry.promise;
  }

  peek(key) { return this.entries.get(key)?.texture ?? null; }

  release(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs <= 0) {
      entry.texture?.dispose();
      this.entries.delete(key);
    }
  }

  dispose() {
    for (const entry of this.entries.values()) entry.texture?.dispose();
    this.entries.clear();
  }
}
