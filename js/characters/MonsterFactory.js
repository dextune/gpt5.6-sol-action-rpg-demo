import * as THREE from 'three';
import { CharacterAnimationController } from '../../packages/template-3d/index.js';
import { convertToStylized, inferMaterialRole } from '../graphics/StylizedMaterial.js';
import { createEnemyModel } from '../graphics/ModelFactory.js';

const SHAPE_ARCHETYPE = Object.freeze({
  blob: 'slime', plant: 'slime', beetle: 'slime', crab: 'slime', toad: 'slime',
  // Hare stays light/skirmish; raptor/harpy/owl use taller lean read via scale in create().
  hare: 'hare', raptor: 'hare', harpy: 'hare', owl: 'hare', fox: 'hare',
  // Pack hunters use boar mesh but get longer scale + crest kits below.
  boar: 'boar', wolf: 'boar', lizard: 'boar', panther: 'boar', stag: 'boar', asp: 'boar',
  wisp: 'wisp', imp: 'wisp',
  raider: 'humanoid', shaman: 'humanoid', knight: 'humanoid', cyclops: 'humanoid',
  golem: 'colossus', colossus: 'colossus', drake: 'colossus', scorpion: 'colossus',
});

/**
 * Canonical shape that "owns" each baked GLB archetype.
 * Non-canonical shapes (beetle, wolf, toad, …) previously reused the same GLB and
 * read as plain colored blobs — they now use ModelFactory procedural silhouettes.
 */
const ARCHETYPE_CANONICAL_SHAPE = Object.freeze({
  slime: 'blob',
  hare: 'hare',
  boar: 'boar',
  wisp: 'wisp',
  humanoid: 'raider',
  colossus: 'colossus',
});

/** Shapes with dedicated ModelFactory builders (unique limb/prop silhouette). */
const PROCEDURAL_SHAPES = Object.freeze(new Set([
  'blob', 'hare', 'boar', 'wisp', 'raider',
  'beetle', 'wolf', 'plant', 'golem', 'shaman',
  'harpy', 'stag', 'crab', 'raptor', 'cyclops',
  'scorpion', 'knight', 'imp', 'lizard', 'panther',
  'colossus', 'drake', 'toad', 'fox', 'owl', 'asp',
]));

/** Per-shape silhouette multipliers so remapped bodies still read differently (B1-a). */
const SHAPE_SCALE = Object.freeze({
  wolf: 1.08, panther: 1.05, stag: 1.18, lizard: 0.95, raptor: 1.12,
  harpy: 0.92, plant: 0.88, beetle: 0.82, crab: 1.05, imp: 0.78,
  cyclops: 1.15, drake: 1.22, scorpion: 1.12, golem: 1.08,
  toad: 1.12, fox: 0.95, owl: 1.0, asp: 1.05,
});

function makeHealthBar(height, elite, boss) {
  const group = new THREE.Group();
  group.name = 'monster_health_billboard';
  group.position.y = height + (boss ? .75 : .42);
  const width = boss ? 2.8 : elite ? 1.65 : 1.35;
  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(width + .12, .18),
    new THREE.MeshBasicMaterial({ color: 0x172025, transparent: true, opacity: .76, depthTest: false, depthWrite: false }),
  );
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(1, .105),
    new THREE.MeshBasicMaterial({ color: elite ? 0xffc65a : 0xe85e68, depthTest: false, depthWrite: false }),
  );
  fill.scale.x = width;
  fill.position.z = .004;
  group.add(background, fill);
  group.renderOrder = 30;
  group.visible = boss || elite;
  return { group, fill, width };
}

function addEliteDetails(group, accent, boss, archetype) {
  const material = new THREE.MeshStandardMaterial({
    color: accent,
    roughness: .32,
    metalness: .55,
    emissive: accent,
    emissiveIntensity: boss ? .6 : .26,
  });
  const head = group.getObjectByName('head') ?? group;
  const count = boss ? 5 : 3;
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 ? -1 : 1;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * (.13 + i * .025), .18, .08),
      new THREE.Vector3(side * (.25 + i * .04), .43 + i * .03, .02),
      new THREE.Vector3(side * (.16 + i * .03), .68 + i * .04, -.08),
    ]);
    const horn = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, boss ? .052 : .038, 7, false), material);
    horn.name = `elite_crest_${i}`;
    horn.castShadow = true;
    head.add(horn);
  }
  if (boss || archetype === 'humanoid') {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(boss ? .72 : .48, .045, 8, 42),
      new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: boss ? .95 : .48, roughness: .25, metalness: .4, transparent: true, opacity: .78 }),
    );
    ring.name = 'elite_rune_halo';
    ring.rotation.x = Math.PI / 2;
    ring.position.y = boss ? .25 : .15;
    head.add(ring);
  }
  // Archetype ornament kits — extra silhouette for champions without new GLBs.
  if (archetype === 'colossus' || boss) {
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(boss ? .42 : .28, boss ? .18 : .12, boss ? .55 : .36),
        material,
      );
      pad.name = `elite_shoulder_${side > 0 ? 'r' : 'l'}`;
      pad.position.set(side * (boss ? .55 : .38), boss ? -.05 : -.12, 0.05);
      pad.rotation.z = side * 0.25;
      pad.castShadow = true;
      head.add(pad);
    }
  }
  if (archetype === 'boar' || archetype === 'hare') {
    for (let i = 0; i < (boss ? 4 : 2); i += 1) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(boss ? .07 : .05, boss ? .32 : .22, 5),
        material,
      );
      spike.name = `elite_backspike_${i}`;
      spike.position.set((i % 2 ? -1 : 1) * 0.12, -0.08 - i * 0.05, -0.15 - i * 0.08);
      spike.rotation.x = -0.9;
      spike.castShadow = true;
      head.add(spike);
    }
  }
  if (archetype === 'slime') {
    const frill = new THREE.Mesh(
      new THREE.TorusGeometry(boss ? .55 : .38, .04, 6, 20, Math.PI * 1.4),
      material,
    );
    frill.name = 'elite_slime_frill';
    frill.position.set(0, -0.05, 0.1);
    frill.rotation.x = 0.4;
    head.add(frill);
  }
}

export class MonsterFactory {
  constructor(assetManager, outlineSystem) {
    this.assets = assetManager;
    this.outlines = outlineSystem;
  }

  archetypeFor(data) {
    if (data.boss && ['verdant', 'forest'].includes(data.zone)) return 'colossus';
    return SHAPE_ARCHETYPE[data.shape] ?? 'humanoid';
  }

  /**
   * Use unique procedural silhouette when shape is not the GLB owner.
   * Keeps 6 baked archetypes for the canonical forms (blob/hare/boar/…) and
   * avoids plant/beetle/wolf/etc. all reading as the same colored capsule/blob.
   */
  #shouldUseProcedural(shape, archetype) {
    if (!shape || !PROCEDURAL_SHAPES.has(shape)) return false;
    const canonical = ARCHETYPE_CANONICAL_SHAPE[archetype];
    return shape !== canonical;
  }

  #createProcedural(data, options = {}) {
    const elite = Boolean(options.elite);
    const boss = Boolean(options.boss ?? data.boss);
    const archetype = this.archetypeFor(data);
    const shapeMul = SHAPE_SCALE[data.shape] ?? 1;
    const scaleMul = shapeMul * (boss ? 1.05 : elite ? 1.06 : 1);
    const procedural = createEnemyModel({
      ...data,
      name: data.name ?? data.id ?? data.shape,
      scale: (data.scale ?? 1) * scaleMul,
      boss,
    }, elite || boss);
    const group = procedural.group;
    group.name = `Enemy_${data.id}`;
    group.userData.proceduralShape = data.shape;
    group.userData.modelHeight = procedural.modelHeight;

    // Hide ModelFactory's own health bar — MonsterFactory attaches the combat HUD bar.
    if (procedural.healthGroup) procedural.healthGroup.visible = false;

    const materials = [];
    group.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      if (object.material) materials.push(object.material);
    });
    this.outlines.configure(group, {
      color: 0x1e2d36,
      priority: boss ? 8 : elite ? 4 : 2,
      maxDistance: boss ? 52 : elite ? 38 : 30,
    });
    const modelHeight = procedural.modelHeight || (archetype === 'colossus' ? 4 : 2);
    const health = makeHealthBar(modelHeight * (group.scale.x || 1), elite, boss);
    group.add(health.group);
    // Procedural builds have no skeletal clips — controller stays inert (no capsule).
    const animation = new CharacterAnimationController(group, [], {
      referenceRunSpeed: archetype === 'hare' ? 6.4 : archetype === 'boar' ? 5.6 : 4.8,
      defaultFade: .14,
    });
    return {
      group,
      animation,
      refs: {
        group,
        rig: procedural.rig ?? group,
        modelHeight,
        healthGroup: health.group,
        healthFill: health.fill,
        healthWidth: health.width,
        materials,
        archetype,
        shape: data.shape,
        fallback: false,
        procedural: true,
      },
    };
  }

  create(data, options = {}) {
    const elite = Boolean(options.elite);
    const boss = Boolean(options.boss ?? data.boss);
    const archetype = this.archetypeFor(data);
    const shape = data.shape ?? ARCHETYPE_CANONICAL_SHAPE[archetype] ?? 'blob';

    if (this.#shouldUseProcedural(shape, archetype)) {
      return this.#createProcedural({ ...data, shape }, options);
    }

    const quality = boss ? 'high' : options.quality ?? 'medium';
    const asset = this.assets.cloneModel(`monster.${archetype}`, { quality, data, elite, boss });
    // If GLB path collapsed to capsule, rebuild with procedural silhouette instead.
    if (asset.fallback) {
      console.warn(`[MonsterFactory] GLB fallback for monster.${archetype}; using procedural ${shape}`);
      return this.#createProcedural({ ...data, shape }, options);
    }

    const group = asset.scene;
    group.name = `Enemy_${data.id}`;
    const modelHeight = Number(group.userData.modelHeight) || (archetype === 'colossus' ? 4 : 2);
    const shapeMul = SHAPE_SCALE[data.shape] ?? 1;
    const baseScale = (data.scale ?? 1) * shapeMul * (boss ? 1.05 : elite ? 1.06 : 1);
    group.scale.setScalar(baseScale);
    // Zone-tinted emissive eyes for clearer silhouette family (B1-a).
    if (['wolf', 'panther', 'stag', 'raptor'].includes(data.shape)) {
      // Slight stretch along forward axis for pack-hunter read on boar body.
      group.scale.z *= 1.08;
      group.scale.x *= 0.96;
    }
    const baseColor = new THREE.Color(data.color ?? 0x71816a);
    const accent = new THREE.Color(data.accent ?? 0xe3c771);
    const materials = [];
    group.traverse(object => {
      if (!object.isMesh) return;
      if (object.userData?.outlineProxy || object.name.includes('outline_proxy')) { object.visible = false; return; }
      object.castShadow = true;
      object.receiveShadow = true;
      if (!object.geometry.getAttribute('uv2') && object.geometry.getAttribute('uv')) object.geometry.setAttribute('uv2', object.geometry.getAttribute('uv').clone());
      const sourceName = (object.material?.name ?? object.name ?? '').toLowerCase();
      const role = inferMaterialRole(sourceName);
      const material = convertToStylized(object.material, {
        role: archetype === 'wisp' ? 'spirit' : role,
        style: { bandStrength: boss ? .18 : .24, rimStrength: boss ? .08 : .045 },
      });
      // Baked accent details (tusks, horns, hooves, crystals) keep their authored color.
      const keepBakedColor = sourceName.includes('accent') || sourceName.includes('crystal') || sourceName.includes('bubble');
      if (role === 'eye') {
        material.color.copy(accent).lerp(new THREE.Color(0xffffff), .18);
        material.emissive.copy(accent);
        material.emissiveIntensity = boss ? .9 : .36;
      } else if (keepBakedColor) {
        // no-op: authored GLB color already copied by convertToStylized
      } else if (role === 'metal' || role === 'leaf') material.color.copy(accent).multiplyScalar(.86);
      else if (role === 'cloth' || role === 'stone') material.color.copy(baseColor).multiplyScalar(.62).lerp(new THREE.Color(0x8a8f88), role === 'stone' ? .4 : .12);
      else material.color.copy(baseColor).lerp(accent, role === 'spirit' ? .22 : .04);
      const normal = this.assets.getTexture(`monster.${archetype}.normal`);
      const roughness = this.assets.getTexture(`monster.${archetype}.roughness`);
      const ao = this.assets.getTexture(`monster.${archetype}.ao`);
      if (normal && role !== 'eye') { material.normalMap = normal; material.normalScale.set(.22, .22); }
      if (roughness) material.roughnessMap = roughness;
      if (ao) { material.aoMap = ao; material.aoMapIntensity = .5; }
      object.material = material;
      materials.push(material);
    });
    this.outlines.configure(group, { color: 0x1e2d36, priority: boss ? 8 : elite ? 4 : 2, maxDistance: boss ? 52 : elite ? 38 : 30 });
    if (elite || boss) addEliteDetails(group, accent, boss, archetype);
    const health = makeHealthBar(modelHeight * baseScale, elite, boss);
    group.add(health.group);
    const animation = new CharacterAnimationController(group, asset.animations, {
      referenceRunSpeed: archetype === 'hare' ? 6.4 : archetype === 'boar' ? 5.6 : 4.8,
      defaultFade: .14,
    });
    return {
      group,
      animation,
      refs: {
        group,
        rig: group,
        modelHeight,
        healthGroup: health.group,
        healthFill: health.fill,
        healthWidth: health.width,
        materials,
        archetype,
        shape,
        fallback: asset.fallback,
        procedural: false,
      },
    };
  }
}
