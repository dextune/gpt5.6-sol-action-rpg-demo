import * as THREE from 'three';
import { convertToStylized, inferMaterialRole } from './StylizedMaterial.js';

function uv2(geometry) {
  if (geometry?.getAttribute?.('uv') && !geometry.getAttribute('uv2')) geometry.setAttribute('uv2', geometry.getAttribute('uv').clone());
}

export class MaterialLibrary {
  constructor(assetManager) {
    this.assets = assetManager;
    this.cache = new Map();
  }

  texture(key) { return this.assets.getTexture(key); }

  terrain() {
    if (this.cache.has('terrain.world')) return this.cache.get('terrain.world');
    const material = new THREE.MeshStandardMaterial({
      name: 'WorldLayeredPBR',
      color: 0xffffff,
      map: this.texture('terrain.world.baseColor'),
      normalMap: this.texture('terrain.world.normal'),
      roughnessMap: this.texture('terrain.world.roughness'),
      aoMap: this.texture('terrain.world.ao'),
      roughness: .92,
      metalness: 0,
      aoMapIntensity: .72,
    });
    material.normalScale.set(.58, .58);
    this.cache.set('terrain.world', material);
    return material;
  }

  environment(source, meshName = '') {
    const role = inferMaterialRole(`${source?.name ?? ''} ${meshName}`);
    const cacheKey = `env:${source?.uuid ?? source?.name ?? meshName}:${role}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    const material = convertToStylized(source, {
      role,
      style: { bandStrength: role === 'leaf' ? .10 : .13, rimStrength: 0, bands: 4 },
    });
    if (role === 'bark') {
      material.map = this.texture('environment.bark.baseColor');
      material.normalMap = this.texture('environment.bark.normal');
      material.roughnessMap = this.texture('environment.bark.roughness');
      material.aoMap = this.texture('environment.bark.ao');
      material.normalScale.set(.28, .28);
    } else if (role === 'leaf') {
      material.map = this.texture('environment.leaves.baseColor');
      material.normalMap = this.texture('environment.leaves.normal');
      material.roughnessMap = this.texture('environment.leaves.roughness');
      material.aoMap = this.texture('environment.leaves.ao');
      material.normalScale.set(.18, .18);
      material.side = THREE.DoubleSide;
    } else {
      material.map = this.texture('environment.stone.baseColor');
      material.normalMap = this.texture('environment.stone.normal');
      material.roughnessMap = this.texture('environment.stone.roughness');
      material.aoMap = this.texture('environment.stone.ao');
      material.normalScale.set(.25, .25);
    }
    material.aoMapIntensity = .62;
    this.cache.set(cacheKey, material);
    return material;
  }

  paving() {
    if (this.cache.has('paving')) return this.cache.get('paving');
    const material = new THREE.MeshStandardMaterial({
      name: 'BeveledPavingStone',
      color: 0xc4a971,
      map: this.texture('terrain.path.baseColor'),
      normalMap: this.texture('terrain.path.normal'),
      roughnessMap: this.texture('terrain.path.roughness'),
      aoMap: this.texture('terrain.path.ao'),
      roughness: .84,
      metalness: 0,
    });
    material.normalScale.set(.32, .32);
    this.cache.set('paving', material);
    return material;
  }

  prepareGeometry(geometry) { uv2(geometry); return geometry; }

  dispose() {
    for (const material of this.cache.values()) material.dispose?.();
    this.cache.clear();
  }
}
