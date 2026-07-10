import * as THREE from 'three';

const TMP_MATRIX = new THREE.Matrix4();
const TMP_LOCAL = new THREE.Matrix4();
const TMP_PLACEMENT = new THREE.Matrix4();
const TMP_QUAT = new THREE.Quaternion();
const TMP_EULER = new THREE.Euler();
const TMP_POS = new THREE.Vector3();
const TMP_SCALE = new THREE.Vector3();

export class EnvironmentFactory {
  constructor(assetManager, materials) {
    this.assets = assetManager;
    this.materials = materials;
    this.groups = [];
  }

  createInstanced(key, placements, options = {}) {
    if (!placements?.length) return new THREE.Group();
    const gltf = this.assets.getCachedModel(key, options.quality ?? 'high') ?? this.assets.getCachedModel(key, 'medium');
    if (!gltf?.scene) throw new Error(`Environment model was not preloaded: ${key}`);
    const sourceRoot = gltf.scene;
    sourceRoot.updateMatrixWorld(true);
    const inverseRoot = sourceRoot.matrixWorld.clone().invert();
    const group = new THREE.Group();
    group.name = `Instanced_${key}`;
    let partIndex = 0;

    sourceRoot.traverse(source => {
      if (!source.isMesh || source.isSkinnedMesh) return;
      this.materials.prepareGeometry(source.geometry);
      TMP_LOCAL.multiplyMatrices(inverseRoot, source.matrixWorld);
      const localMatrix = TMP_LOCAL.clone();
      const material = this.materials.environment(source.material, source.name);
      const mesh = new THREE.InstancedMesh(source.geometry, material, placements.length);
      mesh.name = `${key}_part_${partIndex++}`;
      mesh.castShadow = options.castShadow !== false;
      mesh.receiveShadow = options.receiveShadow !== false;
      mesh.frustumCulled = true;
      for (let i = 0; i < placements.length; i += 1) {
        const p = placements[i];
        TMP_POS.set(p.x, p.y ?? 0, p.z);
        TMP_EULER.set(p.pitch ?? 0, p.rotation ?? 0, p.roll ?? 0);
        TMP_QUAT.setFromEuler(TMP_EULER);
        const scale = p.scale ?? 1;
        if (Array.isArray(scale)) TMP_SCALE.fromArray(scale);
        else TMP_SCALE.setScalar(scale);
        TMP_PLACEMENT.compose(TMP_POS, TMP_QUAT, TMP_SCALE);
        TMP_MATRIX.multiplyMatrices(TMP_PLACEMENT, localMatrix);
        mesh.setMatrixAt(i, TMP_MATRIX);
        const tint = p.color ? new THREE.Color(p.color) : new THREE.Color(0xffffff);
        mesh.setColorAt(i, tint);
      }
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
    });
    this.groups.push(group);
    return group;
  }

  cloneDecor(key, options = {}) {
    const asset = this.assets.cloneModel(key, { quality: options.quality ?? 'high' });
    const root = asset.scene;
    root.traverse(object => {
      if (!object.isMesh) return;
      object.material = this.materials.environment(object.material, object.name);
      this.materials.prepareGeometry(object.geometry);
      object.castShadow = options.castShadow !== false;
      object.receiveShadow = true;
    });
    return root;
  }

  dispose() {
    for (const group of this.groups) {
      group.traverse(object => { if (object.isInstancedMesh) object.dispose?.(); });
    }
    this.groups.length = 0;
  }
}
