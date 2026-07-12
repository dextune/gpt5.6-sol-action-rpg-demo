import * as THREE from 'three';
import { CharacterAnimationController } from './CharacterAnimationController.js';
import { convertToStylized, inferMaterialRole } from '../graphics/StylizedMaterial.js';

const SHAPE_ARCHETYPE = Object.freeze({
  blob: 'slime', plant: 'slime', beetle: 'slime', crab: 'slime',
  // Hare stays light/skirmish; raptor/harpy use taller lean read via scale in create().
  hare: 'hare', raptor: 'hare', harpy: 'hare',
  // Pack hunters use boar mesh but get longer scale + crest kits below.
  boar: 'boar', wolf: 'boar', lizard: 'boar', panther: 'boar', stag: 'boar',
  wisp: 'wisp', imp: 'wisp',
  raider: 'humanoid', shaman: 'humanoid', knight: 'humanoid', cyclops: 'humanoid',
  golem: 'colossus', colossus: 'colossus', drake: 'colossus', scorpion: 'colossus',
});

/** Per-shape silhouette multipliers so remapped bodies still read differently (B1-a). */
const SHAPE_SCALE = Object.freeze({
  wolf: 1.08, panther: 1.05, stag: 1.18, lizard: 0.95, raptor: 1.12,
  harpy: 0.92, plant: 0.88, beetle: 0.82, crab: 1.05, imp: 0.78,
  cyclops: 1.15, drake: 1.22, scorpion: 1.12, golem: 1.08,
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

  create(data, options = {}) {
    const elite = Boolean(options.elite);
    const boss = Boolean(options.boss ?? data.boss);
    const archetype = this.archetypeFor(data);
    const quality = boss ? 'high' : options.quality ?? 'medium';
    const asset = this.assets.cloneModel(`monster.${archetype}`, { quality, data, elite, boss });
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
      const role = inferMaterialRole(object.material?.name ?? object.name);
      const material = convertToStylized(object.material, {
        role: archetype === 'wisp' ? 'spirit' : role,
        style: { bandStrength: boss ? .18 : .24, rimStrength: boss ? .08 : .045 },
      });
      if (role === 'eye') {
        material.color.copy(accent).lerp(new THREE.Color(0xffffff), .18);
        material.emissive.copy(accent);
        material.emissiveIntensity = boss ? .9 : .36;
      } else if (role === 'metal' || role === 'leaf') material.color.copy(accent).multiplyScalar(.86);
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
        fallback: asset.fallback,
      },
    };
  }
}
