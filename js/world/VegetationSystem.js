import * as THREE from 'three';
import { seededRandom } from '../core/Utils.js';
import { GAME_CONFIG } from '../config.js';

function bladeGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const segments = 4;
  const planes = 3;
  for (let plane = 0; plane < planes; plane += 1) {
    const angle = plane / planes * Math.PI;
    const base = positions.length / 3;
    for (let y = 0; y <= segments; y += 1) {
      const t = y / segments;
      const width = .095 * (1 - t * .84);
      const bend = t * t * .20;
      for (const side of [-1, 1]) {
        const x = Math.cos(angle) * width * side + Math.sin(angle) * bend;
        const z = Math.sin(angle) * width * side - Math.cos(angle) * bend;
        positions.push(x, t * .82, z);
        uvs.push(side < 0 ? 0 : 1, t);
      }
    }
    for (let y = 0; y < segments; y += 1) {
      const i = base + y * 2;
      indices.push(i, i + 2, i + 1, i + 2, i + 3, i + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function flowerGeometry() {
  const geometry = new THREE.BufferGeometry();
  const pos = [];
  const uv = [];
  const idx = [];
  for (let p = 0; p < 5; p += 1) {
    const a = p / 5 * Math.PI * 2;
    const b = pos.length / 3;
    pos.push(0, .62, 0, Math.cos(a - .46) * .17, .65, Math.sin(a - .46) * .17, Math.cos(a + .46) * .17, .65, Math.sin(a + .46) * .17);
    uv.push(.5, 0, 0, 1, 1, 1); idx.push(b, b + 1, b + 2);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx); geometry.computeVertexNormals();
  return geometry;
}

export class VegetationSystem {
  constructor(root, terrain, quality = 'medium') {
    this.root = root;
    this.terrain = terrain;
    this.quality = quality;
    this.time = 0;
    this.player = new THREE.Vector3(999, 0, 999);
    this.rng = seededRandom(0x71A55EED);
    this.build();
  }

  build() {
    const counts = { high: 1100, medium: 650, low: 320 };
    const count = counts[this.quality] ?? counts.medium;
    // Lambert is much cheaper than full PBR for dense instanced grass.
    const material = new THREE.MeshLambertMaterial({ color: 0x5d9d52, side: THREE.DoubleSide });
    if (this.quality !== 'low') {
      material.onBeforeCompile = shader => {
        shader.uniforms.uGrassTime = { value: 0 };
        shader.uniforms.uGrassPlayer = { value: this.player };
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nuniform float uGrassTime; uniform vec3 uGrassPlayer;`);
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 grassWorld = vec3(instanceMatrix[3]);
            float grassPhase = grassWorld.x * .173 + grassWorld.z * .137;
            float grassHeight = clamp(position.y / .82, 0.0, 1.0);
            float grassWind = sin(uGrassTime * 1.55 + grassPhase) * .075 + sin(uGrassTime * .73 + grassPhase * 2.1) * .035;
            float grassNear = 1.0 - smoothstep(.45, 2.25, distance(grassWorld.xz, uGrassPlayer.xz));
            vec2 grassAway = normalize(grassWorld.xz - uGrassPlayer.xz + vec2(.001));
            transformed.xz += vec2(grassWind, grassWind * .42) * grassHeight * grassHeight;
            transformed.xz += grassAway * grassNear * .17 * grassHeight;
          #endif`);
        material.userData.shader = shader;
      };
    }
    const grass = new THREE.InstancedMesh(bladeGeometry(), material, count);
    grass.name = 'CurvedWindGrass';
    grass.receiveShadow = this.quality === 'high';
    grass.castShadow = false;
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();
    let placed = 0;
    while (placed < count) {
      const angle = this.rng() * Math.PI * 2;
      const radius = 17 + Math.sqrt(this.rng()) * (GAME_CONFIG.worldRadius - 25);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const zone = this.terrain.zoneAt(x, z);
      const lush = zone.id === 'verdant' || zone.id === 'forest';
      if (!lush && this.rng() > .08) continue;
      if (Math.hypot(x, z) < 17.5) continue;
      pos.set(x, this.terrain.heightAt(x, z) + .015, z);
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng() * Math.PI * 2);
      const s = (.65 + this.rng() * .95) * (zone.id === 'forest' ? 1.18 : 1);
      scale.set(s * (.75 + this.rng() * .35), s, s * (.75 + this.rng() * .35));
      matrix.compose(pos, quat, scale); grass.setMatrixAt(placed, matrix);
      const color = new THREE.Color(zone.id === 'forest' ? 0x3d7950 : 0x6da752);
      color.offsetHSL((this.rng() - .5) * .035, (this.rng() - .5) * .12, (this.rng() - .5) * .10);
      grass.setColorAt(placed, color); placed += 1;
    }
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    this.root.add(grass);
    this.grass = grass;

    const flowerCount = Math.round(count * .075);
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xffd6a0, roughness: .76, side: THREE.DoubleSide });
    const flowers = new THREE.InstancedMesh(flowerGeometry(), flowerMat, flowerCount);
    for (let i = 0; i < flowerCount; i += 1) {
      const angle = this.rng() * Math.PI * 2;
      const radius = 18 + Math.sqrt(this.rng()) * 78;
      const x = Math.cos(angle) * radius - 12;
      const z = Math.sin(angle) * radius + 4;
      pos.set(x, this.terrain.heightAt(x, z) + .02, z);
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng() * Math.PI * 2);
      const s = .72 + this.rng() * .65; scale.setScalar(s); matrix.compose(pos, quat, scale); flowers.setMatrixAt(i, matrix);
      const palette = [0xffd4a4, 0xf4a9bb, 0xe8d870, 0x9fd6ec];
      flowers.setColorAt(i, new THREE.Color(palette[i % palette.length]));
    }
    flowers.instanceMatrix.needsUpdate = true; if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
    flowers.castShadow = false; flowers.receiveShadow = true; flowers.name = 'MeadowFlowerClusters';
    this.root.add(flowers); this.flowers = flowers;
  }

  update(delta, playerPosition) {
    this.time += delta;
    if (playerPosition) this.player.lerp(playerPosition, Math.min(1, delta * 12));
    const shader = this.grass?.material?.userData?.shader;
    if (shader?.uniforms?.uGrassTime) shader.uniforms.uGrassTime.value = this.time;
  }

  setQuality() {}
  dispose() {
    for (const mesh of [this.grass, this.flowers]) { mesh?.geometry.dispose(); mesh?.material.dispose(); }
  }
}
