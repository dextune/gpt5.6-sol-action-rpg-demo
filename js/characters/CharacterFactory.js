import * as THREE from 'three';
import { CharacterAnimationController } from './CharacterAnimationController.js';
import { convertToStylized, inferMaterialRole } from '../graphics/StylizedMaterial.js';
import { outlinedMesh, toonMaterial } from '../graphics/Materials.js';
import { DEFAULT_HERO_CLASS_ID, getHeroClass, resolveHeroClassId } from '../data/content.js';

function ensureUv2(geometry) {
  if (!geometry?.getAttribute?.('uv2') && geometry?.getAttribute?.('uv')) geometry.setAttribute('uv2', geometry.getAttribute('uv').clone());
}

/** Per-look runtime palette + head kit. Add a kit when adding a new class. */
const CLASS_LOOKS = Object.freeze({
  aerin: Object.freeze({
    palette: Object.freeze({
      skin: 0xf4cdb4,
      cloth: 0x4b3a7a,
      clothDark: 0x2e2350,
      leather: 0x241a2e,
      hair: 0x6a4f9c,
      hairDark: 0x4a376f,
      metal: 0x9fb2c4,
      eye: 0x49e0c4,
      outline: 0x141020,
      shadowTintCloth: 0x5a2208,
      shadowTintHair: 0x6a4810,
      rimHair: 0xffe6a0,
      rimSkin: 0xffd8b8,
    }),
    headKit: 'rogue',
    scale: .94,
  }),
  wizard: Object.freeze({
    palette: Object.freeze({
      skin: 0xf0c8b8,
      cloth: 0x3a4f9c,
      clothDark: 0x1e2a5c,
      leather: 0x2a2440,
      hair: 0xe8e0f4,
      hairDark: 0xb0a0d0,
      metal: 0xd4b862,
      eye: 0xb06dff,
      outline: 0x121428,
      shadowTintCloth: 0x1a2048,
      shadowTintHair: 0x6a6088,
      rimHair: 0xf0e8ff,
      rimSkin: 0xffd8c8,
    }),
    // Hat + hair are baked into hero.wizard GLB.
    headKit: 'none',
    scale: .94,
  }),
});

// ~70% of previous overlong blades, with thicker girth for a solid blade read.
const WEAPON_LENGTH = Object.freeze({
  sword: 1.27,
  saber: 1.13,
  greatsword: 1.44,
  katana: 1.48,
  leaf: 1.08,
  relic: 1.25,
  staff: 1.35,
});
const WEAPON_GIRTH = Object.freeze({
  sword: 1.22,
  saber: 1.1,
  greatsword: 1.38,
  katana: 1.28,
  leaf: 1.15,
  relic: 1.25,
  staff: .95,
});

function resolveLook(lookId) {
  return CLASS_LOOKS[lookId] ?? CLASS_LOOKS.aerin;
}

function findHeadAnchor(group) {
  const preferred = [
    'Head', 'head', 'mixamorigHead', 'mixamorig:Head', 'HeadTop_End',
    'head_end', 'DEF-head', 'spine.head',
  ];
  for (const name of preferred) {
    const found = group.getObjectByName(name);
    if (found) return found;
  }
  let best = null;
  let bestY = -Infinity;
  group.traverse(object => {
    if (!object.isBone && !object.isMesh) return;
    object.updateWorldMatrix?.(true, false);
    const y = object.getWorldPosition(new THREE.Vector3()).y;
    const n = (object.name || '').toLowerCase();
    if (n.includes('head') || n.includes('hair') || n.includes('skull')) {
      if (y > bestY) { bestY = y; best = object; }
    }
  });
  if (best) return best;
  group.traverse(object => {
    if (!object.isBone) return;
    object.updateWorldMatrix?.(true, false);
    const y = object.getWorldPosition(new THREE.Vector3()).y;
    if (y > bestY) { bestY = y; best = object; }
  });
  return best;
}

function attachRogueHood(group, palette) {
  const anchor = findHeadAnchor(group);
  if (!anchor || anchor.userData.animeHair) return;
  const hairRoot = new THREE.Group();
  hairRoot.name = 'RogueHood';
  hairRoot.userData.animeHair = true;
  const hoodMat = toonMaterial(palette.clothDark, { name: 'rogue-hood', emissive: 0x140d28, emissiveIntensity: .12 });
  const hairMat = toonMaterial(palette.hair, { name: 'anime-hair', emissive: palette.hairDark, emissiveIntensity: .08 });
  const tipMat = toonMaterial(palette.hairDark, { name: 'anime-hair-tip' });
  const maskMat = toonMaterial(0x2bd1b4, { name: 'rogue-mask', emissive: 0x1c9a86, emissiveIntensity: .2 });

  const hood = outlinedMesh(
    new THREE.SphereGeometry(.42, 18, 14, 0, Math.PI * 2, 0, Math.PI * .62),
    hoodMat,
    { thickness: 1.05, outlineColor: palette.outline },
  );
  hood.position.set(0, .16, -.06);
  hood.scale.set(1.08, 1.18, 1.12);
  hood.castShadow = true;
  hairRoot.add(hood);

  const collar = outlinedMesh(
    new THREE.CylinderGeometry(.3, .42, .5, 12, 1, true),
    hoodMat,
    { thickness: 1.04, outlineColor: palette.outline },
  );
  collar.position.set(0, -.12, -.24);
  collar.rotation.x = -.25;
  hairRoot.add(collar);

  const tail = outlinedMesh(
    new THREE.CylinderGeometry(.13, .08, .82, 12),
    hairMat,
    { thickness: 1.06, outlineColor: palette.outline },
  );
  tail.position.set(0, -.34, -.26);
  tail.rotation.x = .28;
  tail.castShadow = true;
  hairRoot.add(tail);
  const tailTip = new THREE.Mesh(new THREE.ConeGeometry(.08, .36, 12), tipMat);
  tailTip.position.set(0, -.78, -.42);
  tailTip.rotation.x = .28;
  hairRoot.add(tailTip);
  const tie = outlinedMesh(
    new THREE.TorusGeometry(.1, .03, 8, 16),
    toonMaterial(0x2bd1b4, { name: 'rogue-tie' }),
    { thickness: 1.05, outlineColor: palette.outline },
  );
  tie.position.set(0, .06, -.28);
  tie.rotation.x = Math.PI / 2 - .28;
  hairRoot.add(tie);

  const bang = outlinedMesh(
    new THREE.SphereGeometry(.3, 18, 14, 0, Math.PI * 2, 0, Math.PI * .5),
    hairMat,
    { thickness: 1.06, outlineColor: palette.outline },
  );
  bang.position.set(0, .1, .04);
  bang.scale.set(1, .55, .92);
  bang.castShadow = true;
  hairRoot.add(bang);

  const mask = outlinedMesh(
    new THREE.TorusGeometry(.22, .1, 8, 20, Math.PI * 1.1),
    maskMat,
    { thickness: 1.04, outlineColor: palette.outline },
  );
  mask.position.set(0, -.04, .26);
  mask.rotation.set(Math.PI / 2, 0, Math.PI * .45);
  hairRoot.add(mask);

  hairRoot.position.set(0, .06, 0);
  if (anchor.isBone || anchor.isObject3D) {
    hairRoot.scale.setScalar(1);
    anchor.add(hairRoot);
  } else {
    group.add(hairRoot);
    hairRoot.position.y = 2.45;
  }
  anchor.userData.animeHair = true;
  group.userData.animeHairRoot = hairRoot;
}

function applyHeadKit(group, look) {
  if (look.headKit === 'rogue') attachRogueHood(group, look.palette);
}

function boostAnimeProportions(group) {
  group.traverse(object => {
    if (!object.isBone) return;
    const n = object.name.toLowerCase();
    if (n.includes('head') && !n.includes('end')) {
      object.scale.multiplyScalar(1.12);
    }
  });
}

function applyPalette(material, role, palette) {
  material.map = null;
  material.normalMap = null;
  material.roughnessMap = null;
  material.aoMap = null;
  material.metalness = role === 'metal' ? .55 : 0;
  material.roughness = role === 'metal' ? .35 : role === 'skin' ? .62 : .88;
  if (role === 'skin') material.color.setHex(palette.skin);
  else if (role === 'cloth') material.color.setHex(palette.cloth);
  else if (role === 'leather') material.color.setHex(palette.leather);
  else if (role === 'hair') {
    material.color.setHex(palette.hair);
    material.emissive.setHex(palette.hairDark);
    material.emissiveIntensity = .12;
  } else if (role === 'metal') material.color.setHex(palette.metal);
  else if (role === 'eye') {
    material.color.setHex(palette.eye);
    material.emissive.setHex(palette.eye);
    material.emissiveIntensity = .35;
  } else {
    material.color.setHex(palette.clothDark);
  }
}

export class CharacterFactory {
  constructor(assetManager, outlineSystem) {
    this.assets = assetManager;
    this.outlines = outlineSystem;
    this.weaponInstances = new WeakMap();
  }

  createHero(options = {}) {
    const classId = resolveHeroClassId(options.classId ?? DEFAULT_HERO_CLASS_ID);
    const heroDef = getHeroClass(classId);
    const look = resolveLook(heroDef.lookId);
    const palette = look.palette;
    const asset = this.assets.cloneModel(heroDef.modelKey, { quality: options.quality ?? 'high' });
    const group = asset.scene;
    group.name = `Hero_${classId}`;
    group.userData.classId = classId;
    group.scale.setScalar(options.scale ?? look.scale ?? .94);
    const materials = new Map();
    group.traverse(object => {
      if (!object.isMesh) return;
      if (object.userData?.outlineProxy || object.name.includes('outline_proxy')) { object.visible = false; return; }
      object.castShadow = true;
      object.receiveShadow = true;
      ensureUv2(object.geometry);
      const sources = Array.isArray(object.material) ? object.material : [object.material];
      const converted = sources.map(source => {
        const cacheKey = source.uuid;
        if (materials.has(cacheKey)) return materials.get(cacheKey);
        const role = inferMaterialRole(source.name);
        const material = convertToStylized(source, {
          role,
          style: {
            bands: role === 'skin' ? 3 : 4,
            bandStrength: role === 'skin' ? .42 : role === 'metal' ? .28 : .48,
            rimStrength: role === 'hair' ? .1 : role === 'skin' ? .07 : .05,
            wrap: role === 'skin' ? .24 : .16,
            shadowTint: role === 'cloth' ? palette.shadowTintCloth : role === 'hair' ? palette.shadowTintHair : 0x2a3540,
            rimColor: role === 'hair' ? palette.rimHair : palette.rimSkin,
          },
        });
        applyPalette(material, role, palette);
        materials.set(cacheKey, material);
        return material;
      });
      object.material = Array.isArray(object.material) ? converted : converted[0];
    });

    boostAnimeProportions(group);
    applyHeadKit(group, look);
    this.outlines.configure(group, { color: palette.outline, priority: 10, maxDistance: 48 });

    const socket = group.getObjectByName('weapon_socket');
    const refs = {
      group,
      socket,
      bladeBase: null,
      bladeTip: null,
      modelHeight: 3.05,
      materials: [...materials.values()],
      fallback: asset.fallback,
      classId,
    };
    const animation = new CharacterAnimationController(group, asset.animations, { referenceRunSpeed: 7.2, defaultFade: .13 });
    return { group, refs, animation, classId };
  }

  equipWeapon(character, item = {}) {
    const refs = character.refs ?? character;
    if (!refs.socket) return null;
    const previous = this.weaponInstances.get(refs);
    if (previous) {
      refs.socket.remove(previous);
      this.outlines.unregister(previous);
    }
    const kind = item.model ?? 'sword';
    const asset = this.assets.cloneModel(`weapon.${kind}`, { quality: 'high' });
    const weapon = asset.scene;
    weapon.name = `Equipped_${kind}`;
    weapon.position.set(.02, -.02, .01);
    weapon.rotation.set(0, Math.PI, .14);
    const length = WEAPON_LENGTH[kind] ?? 1.25;
    const girth = WEAPON_GIRTH[kind] ?? 1.2;
    weapon.scale.set(girth, length, girth);
    const rarityColor = new THREE.Color(item.rarityColor ?? item.color ?? 0xe8f4ff);
    const outlineColor = resolveLook(getHeroClass(refs.classId).lookId).palette.outline;
    weapon.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      ensureUv2(object.geometry);
      const source = object.material;
      const role = inferMaterialRole(source?.name ?? object.name);
      const material = convertToStylized(source, {
        role,
        style: { bandStrength: .22, rimStrength: role === 'metal' ? .12 : .04, bands: 3 },
      });
      material.map = null;
      if (role === 'metal' || object.name.toLowerCase().includes('blade')) {
        material.color.copy(rarityColor).lerp(new THREE.Color(0xffffff), .35);
        material.metalness = .72;
        material.roughness = .28;
        material.emissive.copy(rarityColor).multiplyScalar(.15);
        material.emissiveIntensity = .2;
      }
      if (object.name.includes('rune')) {
        material.color.copy(rarityColor).lerp(new THREE.Color(0xffffff), .18);
        material.emissive.copy(rarityColor);
        material.emissiveIntensity = item.rarity === 'legendary' ? 1.2 : item.rarity === 'epic' ? .8 : item.rarity === 'rare' ? .5 : .22;
      }
      object.material = material;
    });
    refs.socket.add(weapon);
    refs.bladeBase = weapon.getObjectByName('blade_base');
    refs.bladeTip = weapon.getObjectByName('blade_tip');
    refs.weapon = weapon;
    this.weaponInstances.set(refs, weapon);
    this.outlines.configure(weapon, { color: outlineColor, priority: 8, maxDistance: 36 });
    return weapon;
  }
}
