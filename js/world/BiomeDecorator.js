import * as THREE from 'three';
import { RoundedBoxGeometry } from '../../vendor/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ZONES } from '../data/content.js';
import { seededRandom } from '../core/Utils.js';

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax; const abz = bz - az;
  const t = THREE.MathUtils.clamp(((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz + 1e-6), 0, 1);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

/**
 * Memorable landmark recipes near each ZONES center.
 * Reuses tree / rock / ruin / crystal meshes only — no new GLBs.
 * Offsets are relative to zone.center; keep 4–8 cluster entries per zone.
 */
const LANDMARK_RECIPES = Object.freeze({
  verdant: Object.freeze({
    crystalColor: 0xa8e36f,
    crystalOffset: [14, -16],
    trees: Object.freeze([
      { ox: 18, oz: 12, count: 10, sx: 7, sz: 6, color: 0xf4f0d6 },
      { ox: -16, oz: 20, count: 9, sx: 6.5, sz: 6, color: 0xe5ead0 },
      { ox: 22, oz: -8, count: 8, sx: 6, sz: 5.5, color: 0xffffff },
    ]),
    rocks: Object.freeze([
      { ox: -14, oz: -18, count: 7, sx: 5.5, sz: 5 },
      { ox: 10, oz: 24, count: 6, sx: 5, sz: 4.5 },
    ]),
    ruins: Object.freeze([
      { ox: 20, oz: -14, scale: 1.02, rot: .35 },
      { ox: -18, oz: 16, scale: .94, rot: -.55 },
    ]),
  }),
  forest: Object.freeze({
    crystalColor: 0x69d57d,
    crystalOffset: [10, 8],
    trees: Object.freeze([
      { ox: 12, oz: -10, count: 14, sx: 9, sz: 8, color: 0x9db59d },
      { ox: -14, oz: 12, count: 12, sx: 8, sz: 7.5, color: 0x8aa18f },
      { ox: 8, oz: 16, count: 11, sx: 7.5, sz: 7, color: 0x97ad8f },
    ]),
    rocks: Object.freeze([
      { ox: 16, oz: 6, count: 6, sx: 5, sz: 4.5 },
      { ox: -12, oz: -8, count: 5, sx: 4.5, sz: 4 },
    ]),
    ruins: Object.freeze([
      { ox: 6, oz: 4, scale: 1.08, rot: 1.35 },
      { ox: -8, oz: -6, scale: .96, rot: -.8 },
    ]),
  }),
  canyon: Object.freeze({
    crystalColor: 0xffbd63,
    crystalOffset: [-8, 10],
    trees: Object.freeze([
      { ox: -14, oz: -12, count: 5, sx: 5, sz: 4.5, color: 0xbc9b74 },
      { ox: 12, oz: 14, count: 4, sx: 4.5, sz: 4, color: 0xc4a67a },
    ]),
    rocks: Object.freeze([
      { ox: 10, oz: -8, count: 12, sx: 8, sz: 7 },
      { ox: -12, oz: 6, count: 11, sx: 7.5, sz: 7 },
      { ox: 6, oz: 14, count: 9, sx: 6.5, sz: 6 },
    ]),
    ruins: Object.freeze([
      { ox: 4, oz: -6, scale: 1.14, rot: -.55 },
      { ox: -10, oz: 8, scale: 1.0, rot: 1.2 },
    ]),
  }),
  frost: Object.freeze({
    crystalColor: 0xb8ecff,
    crystalOffset: [8, -6],
    trees: Object.freeze([
      { ox: -12, oz: 10, count: 6, sx: 5.5, sz: 5, color: 0xc7d6d5 },
      { ox: 14, oz: 8, count: 5, sx: 5, sz: 4.5, color: 0xd0ddd8 },
    ]),
    rocks: Object.freeze([
      { ox: 10, oz: 12, count: 11, sx: 7.5, sz: 7 },
      { ox: -10, oz: -8, count: 10, sx: 7, sz: 6.5 },
      { ox: 12, oz: -12, count: 8, sx: 6, sz: 5.5 },
    ]),
    ruins: Object.freeze([
      { ox: 0, oz: 8, scale: 1.06, rot: .55 },
      { ox: -8, oz: -10, scale: .98, rot: 1.7 },
    ]),
  }),
  ember: Object.freeze({
    crystalColor: 0xff7445,
    crystalOffset: [-6, -10],
    trees: Object.freeze([
      { ox: 12, oz: -8, count: 5, sx: 5, sz: 4.5, color: 0x80695e },
      { ox: -10, oz: 12, count: 4, sx: 4.5, sz: 4, color: 0x8a6f5c },
    ]),
    rocks: Object.freeze([
      { ox: 8, oz: 10, count: 12, sx: 8, sz: 7 },
      { ox: -12, oz: -6, count: 10, sx: 7, sz: 6.5 },
      { ox: 14, oz: -12, count: 9, sx: 6.5, sz: 6 },
    ]),
    ruins: Object.freeze([
      { ox: 6, oz: 4, scale: 1.08, rot: 1.95 },
      { ox: -10, oz: -8, scale: 1.0, rot: -.4 },
    ]),
  }),
  astral: Object.freeze({
    crystalColor: 0xc28cff,
    crystalOffset: [-8, 8],
    trees: Object.freeze([
      { ox: 10, oz: 12, count: 5, sx: 5, sz: 4.5, color: 0x8b7ba4 },
      { ox: -12, oz: -10, count: 4, sx: 4.5, sz: 4, color: 0x9a88b0 },
    ]),
    rocks: Object.freeze([
      { ox: 8, oz: -8, count: 10, sx: 7, sz: 6.5 },
      { ox: -10, oz: 10, count: 9, sx: 6.5, sz: 6 },
      { ox: 12, oz: 6, count: 8, sx: 6, sz: 5.5 },
    ]),
    ruins: Object.freeze([
      { ox: 0, oz: -6, scale: 1.16, rot: -.2 },
      { ox: -8, oz: 4, scale: 1.04, rot: 1.1 },
    ]),
  }),
});

export class BiomeDecorator {
  constructor(root, terrain, environmentFactory, materials, quality = 'medium') {
    this.root = root;
    this.terrain = terrain;
    this.factory = environmentFactory;
    this.materials = materials;
    this.quality = quality;
    this.colliders = [];
    this.rng = seededRandom(0xD10A4A);
    this.groups = [];
    this.flames = [];
    this.build();
  }

  #roadDistance(x, z) {
    let best = Math.abs(Math.hypot(x, z) - 12.8);
    for (const zone of Object.values(ZONES)) {
      if (zone.id === 'verdant') continue;
      const [cx, cz] = zone.center;
      const mx = cx * .43 - cz * .055;
      const mz = cz * .43 + cx * .045;
      best = Math.min(best, distanceToSegment(x, z, 0, 3.5, mx, mz), distanceToSegment(x, z, mx, mz, cx * .86, cz * .86));
    }
    return best;
  }

  #clearForLarge(x, z) {
    if (Math.hypot(x, z) < 18) return false;
    if (Math.hypot(x - 10.5, z - 14) < 6.3) return false;
    return this.#roadDistance(x, z) > 4.4;
  }

  #placement(x, z, scale = 1, rotation = 0, color = 0xffffff, extra = {}) {
    return { x, z, y: this.terrain.heightAt(x, z), scale, rotation, color, ...extra };
  }

  #addCluster(target, cx, cz, count, spreadX, spreadZ, options = {}) {
    let attempts = 0;
    while (count > 0 && attempts++ < count * 12 + 80) {
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng());
      const x = cx + Math.cos(a) * spreadX * r + (this.rng() - .5) * 1.8;
      const z = cz + Math.sin(a) * spreadZ * r + (this.rng() - .5) * 1.8;
      if (options.clear !== false && !this.#clearForLarge(x, z)) continue;
      const scale = (options.minScale ?? .78) + this.rng() * ((options.maxScale ?? 1.35) - (options.minScale ?? .78));
      target.push(this.#placement(x, z, scale, this.rng() * Math.PI * 2, options.color ?? 0xffffff, {
        pitch: (this.rng() - .5) * (options.tilt ?? .04),
        roll: (this.rng() - .5) * (options.tilt ?? .04),
      }));
      if (options.collider) this.colliders.push({ x, z, radius: (options.colliderRadius ?? .64) * scale });
      count -= 1;
    }
  }

  /**
   * Place tree/rock/ruin landmark clusters from LANDMARK_RECIPES near each zone center.
   * Mutates trees/rocks arrays and returns extra ruin placements.
   */
  #applyLandmarkRecipes(trees, rocks, multiplier) {
    const ruinExtras = [];
    let treeVariant = 0;
    let rockVariant = 0;
    for (const zone of Object.values(ZONES)) {
      const recipe = LANDMARK_RECIPES[zone.id];
      if (!recipe) continue;
      const [cx, cz] = zone.center;
      // Verdant center is the hunter camp — skip clear check only when far enough, else #clearForLarge already protects camp/roads.
      for (const t of recipe.trees) {
        const count = Math.max(2, Math.round(t.count * multiplier));
        this.#addCluster(trees[treeVariant++ % 4], cx + t.ox, cz + t.oz, count, t.sx, t.sz, {
          minScale: .78, maxScale: 1.42, color: t.color ?? 0xffffff, collider: true, colliderRadius: .55,
          clear: zone.id === 'verdant',
        });
      }
      for (const r of recipe.rocks) {
        const count = Math.max(2, Math.round(r.count * multiplier));
        this.#addCluster(rocks[rockVariant++ % 6], cx + r.ox, cz + r.oz, count, r.sx, r.sz, {
          minScale: .5, maxScale: 1.65, color: 0xffffff, collider: true, colliderRadius: .5, clear: false, tilt: .14,
        });
      }
      for (const ruin of recipe.ruins) {
        const x = cx + ruin.ox;
        const z = cz + ruin.oz;
        if (Math.hypot(x, z) < 16) continue;
        ruinExtras.push(this.#placement(x, z, ruin.scale ?? 1, ruin.rot ?? 0, 0xffffff));
      }
    }
    return ruinExtras;
  }

  build() {
    const multiplier = { high: 1, medium: .72, low: .44 }[this.quality] ?? .72;
    const trees = [[], [], [], []];
    const rocks = [[], [], [], [], [], []];
    const treeClusters = [
      [-29, -16, 18, 11, 8, 0xffffff], [30, -20, 17, 13, 9, 0xf2f1d5], [-23, 34, 20, 12, 10, 0xf4f0d6],
      [38, 29, 16, 10, 12, 0xf2e8c7], [-48, 8, 18, 12, 11, 0xe5ead0], [51, 1, 15, 10, 12, 0xf5e7c9],
      [-91, -24, 34, 31, 26, 0x9db59d], [-112, -48, 20, 18, 14, 0x8aa18f], [-72, -52, 18, 15, 14, 0x97ad8f],
      [74, 31, 7, 10, 8, 0xbc9b74], [-50, -90, 7, 10, 8, 0xc7d6d5], [18, 90, 6, 10, 8, 0x80695e], [92, -78, 7, 10, 8, 0x8b7ba4],
    ];
    let variant = 0;
    for (const [x, z, count, sx, sz, color] of treeClusters) {
      this.#addCluster(trees[variant++ % 4], x, z, Math.max(2, Math.round(count * multiplier)), sx, sz, {
        minScale: .72, maxScale: 1.34, color, collider: true, colliderRadius: .55,
      });
    }

    // Rock formations frame combat spaces and landmarks instead of uniform random scatter.
    const rockClusters = [
      [-42, -5, 15, 12, 5], [43, 10, 13, 10, 6], [-8, 49, 12, 16, 5], [7, -51, 11, 14, 6],
      [-123, -18, 19, 16, 9], [-74, -65, 17, 14, 10], [92, 14, 25, 30, 23], [118, 31, 17, 17, 12],
      [-28, -103, 21, 29, 22], [-4, -121, 14, 15, 10], [25, 105, 24, 28, 22], [2, 126, 15, 14, 10],
      [103, -94, 24, 28, 22], [127, -72, 14, 14, 10],
    ];
    variant = 0;
    for (const [x, z, count, sx, sz] of rockClusters) {
      this.#addCluster(rocks[variant++ % 6], x, z, Math.max(2, Math.round(count * multiplier)), sx, sz, {
        minScale: .45, maxScale: 1.55, color: 0xffffff, collider: true, colliderRadius: .5, clear: false, tilt: .12,
      });
    }

    // B2: zone-center landmark density (trees / rocks / ruins recipes).
    const landmarkRuins = this.#applyLandmarkRecipes(trees, rocks, multiplier);

    const treeShadows = this.quality === 'high';
    for (let i = 0; i < 4; i += 1) {
      const group = this.factory.createInstanced(`environment.tree.${i}`, trees[i], { castShadow: treeShadows });
      this.root.add(group); this.groups.push(group);
    }
    for (let i = 0; i < 6; i += 1) {
      const group = this.factory.createInstanced(`environment.rock.${i}`, rocks[i], { castShadow: false });
      this.root.add(group); this.groups.push(group);
    }

    const ruinLocations = [
      [0, -10, 1.1, 0], [35, -7, .88, -.32], [-39, 25, .82, .55], [-93, -24, 1.05, 1.1],
      [93, 14, 1.1, -.7], [-28, -103, 1.05, .4], [25, 105, 1.05, 1.9], [103, -94, 1.12, -.25],
    ].map(([x, z, scale, rotation]) => this.#placement(x, z, scale, rotation, 0xffffff));
    for (const p of landmarkRuins) ruinLocations.push(p);
    const ruins = this.factory.createInstanced('environment.ruin.arch', ruinLocations, { castShadow: this.quality === 'high' });
    this.root.add(ruins); this.groups.push(ruins);
    for (const p of ruinLocations) this.colliders.push({ x: p.x, z: p.z, radius: 2.05 * p.scale });

    const wells = [this.#placement(6.4, 2.4, .92, .15, 0xffffff)];
    const well = this.factory.createInstanced('prop.well', wells, { castShadow: this.quality !== 'low' });
    this.root.add(well); this.groups.push(well); this.colliders.push({ x: 6.4, z: 2.4, radius: 1.45 });

    this.#buildPaving(multiplier);
    this.#buildCampfire();
    this.#buildLandmarkCrystals(multiplier);
  }

  #buildPaving(multiplier) {
    const placements = [];
    const ringCount = Math.max(28, Math.round(72 * multiplier));
    for (let i = 0; i < ringCount; i += 1) {
      const a = i / ringCount * Math.PI * 2;
      const radius = 9.2 + (i % 3) * 1.22;
      placements.push(this.#placement(Math.cos(a) * radius, Math.sin(a) * radius, [.84 + (i % 4) * .045, 1, .82], -a + (this.rng() - .5) * .13, i % 5 === 0 ? 0xd0ba8b : 0xffffff));
    }
    for (let i = -8; i <= 8; i += 1) {
      placements.push(this.#placement(i * 1.28, -7.4 + Math.sin(i * .45) * .35, [.9, 1, .88], (this.rng() - .5) * .12, i % 4 === 0 ? 0xc6ad7b : 0xffffff));
    }
    const geometry = new RoundedBoxGeometry(1.34, .18, 1.06, 3, .09);
    geometry.translate(0, .085, 0); this.materials.prepareGeometry(geometry);
    const mesh = new THREE.InstancedMesh(geometry, this.materials.paving(), placements.length);
    mesh.name = 'HandLaidCampPaving'; mesh.castShadow = this.quality === 'high'; mesh.receiveShadow = true;
    const matrix = new THREE.Matrix4(); const pos = new THREE.Vector3(); const quat = new THREE.Quaternion(); const scale = new THREE.Vector3();
    for (let i = 0; i < placements.length; i += 1) {
      const p = placements[i]; pos.set(p.x, p.y + .02 + (i % 3) * .006, p.z); quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotation); scale.fromArray(p.scale); matrix.compose(pos, quat, scale); mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, new THREE.Color(p.color));
    }
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.root.add(mesh); this.paving = mesh;
  }

  #buildCampfire() {
    const group = new THREE.Group(); group.name = 'HunterCampfire'; group.position.set(-2.1, this.terrain.heightAt(-2.1, 7.4), 7.4);
    const wood = new THREE.MeshStandardMaterial({ color: 0x5d3826, roughness: .92 });
    for (let i = 0; i < 3; i += 1) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(.17, .19, 1.55, 12, 3), wood);
      log.rotation.set(Math.PI / 2, i / 3 * Math.PI, 0); log.position.y = .22; log.castShadow = true; group.add(log);
    }
    const flameMaterial = new THREE.MeshStandardMaterial({ color: 0xffb45b, emissive: 0xff6a2b, emissiveIntensity: 2.2, roughness: .22, transparent: true, opacity: .92 });
    for (let i = 0; i < 4; i += 1) {
      const flame = new THREE.Mesh(new THREE.SphereGeometry(.25 - i * .025, 12, 10), flameMaterial.clone());
      flame.scale.set(.68, 1.7 + i * .17, .68); flame.position.set((i - 1.5) * .13, .55 + i * .12, (i % 2 - .5) * .15); flame.userData.phase = i * 1.7; group.add(flame); this.flames.push(flame);
    }
    const light = new THREE.PointLight(0xff9b52, 9, 16, 1.8); light.position.y = 1.3; group.add(light); this.fireLight = light;
    this.root.add(group); this.campfire = group;
  }

  #buildLandmarkCrystals(multiplier = 1) {
    const group = new THREE.Group(); group.name = 'RegionalLandmarkCrystals';
    const geo = new THREE.OctahedronGeometry(.68, 2);
    // One crystal ring per zone center (offset so verdant/camp stay clear). Density scales with quality.
    const shardBase = this.quality === 'low' ? 4 : this.quality === 'high' ? 7 : 5;
    const shardCount = Math.max(3, Math.round(shardBase * Math.min(1, multiplier + .2)));
    for (const zone of Object.values(ZONES)) {
      const recipe = LANDMARK_RECIPES[zone.id];
      if (!recipe) continue;
      const [cx, cz] = zone.center;
      const [ox, oz] = recipe.crystalOffset;
      const x = cx + ox;
      const z = cz + oz;
      if (Math.hypot(x, z) < 14) continue;
      const color = recipe.crystalColor ?? zone.accent ?? 0xffffff;
      for (let i = 0; i < shardCount; i += 1) {
        const a = i / shardCount * Math.PI * 2;
        const radius = 1.45 + (i % 3) * .52;
        const material = new THREE.MeshStandardMaterial({
          color, emissive: color, emissiveIntensity: .25, roughness: .28, metalness: .12,
        });
        const mesh = new THREE.Mesh(geo, material);
        mesh.scale.set(.55 + i % 3 * .18, 1.3 + i % 4 * .35, .55 + i % 2 * .15);
        const px = x + Math.cos(a) * radius;
        const pz = z + Math.sin(a) * radius;
        mesh.position.set(px, this.terrain.heightAt(px, pz) + mesh.scale.y * .38, pz);
        mesh.rotation.set((this.rng() - .5) * .22, a, (this.rng() - .5) * .25);
        mesh.castShadow = this.quality === 'high';
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      // Optional center spire for stronger landmark read (skip on low quality).
      if (this.quality !== 'low') {
        const spireMat = new THREE.MeshStandardMaterial({
          color, emissive: color, emissiveIntensity: .38, roughness: .22, metalness: .18,
        });
        const spire = new THREE.Mesh(geo, spireMat);
        spire.scale.set(.85, 2.15, .85);
        spire.position.set(x, this.terrain.heightAt(x, z) + spire.scale.y * .38, z);
        spire.castShadow = this.quality === 'high';
        spire.receiveShadow = true;
        group.add(spire);
      }
    }
    this.root.add(group); this.crystals = group;
  }

  update(delta, elapsed) {
    for (let i = 0; i < this.flames.length; i += 1) {
      const flame = this.flames[i]; const pulse = .88 + Math.sin(elapsed * (7.4 + i * .45) + flame.userData.phase) * .13;
      flame.scale.y = (1.7 + i * .17) * pulse; flame.position.x += Math.sin(elapsed * 4.1 + i) * delta * .018;
    }
    if (this.fireLight) this.fireLight.intensity = 8.2 + Math.sin(elapsed * 8.1) * 1.1;
    if (this.crystals) this.crystals.rotation.y = Math.sin(elapsed * .08) * .008;
  }

  dispose() {
    this.paving?.geometry.dispose();
    this.campfire?.traverse(o => { o.geometry?.dispose?.(); if (o.material && !Array.isArray(o.material)) o.material.dispose?.(); });
  }
}
