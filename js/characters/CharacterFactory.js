import * as THREE from 'three';
import { CharacterAnimationController } from './CharacterAnimationController.js';
import { convertToStylized, inferMaterialRole } from '../graphics/StylizedMaterial.js';
import { outlinedMesh, toonMaterial } from '../graphics/Materials.js';

function ensureUv2(geometry) {
  if (!geometry?.getAttribute?.('uv2') && geometry?.getAttribute?.('uv')) geometry.setAttribute('uv2', geometry.getAttribute('uv').clone());
}

/** Rogue / assassin palette — deep violet hood, dark leather, teal-glow eyes. */
const ANIME = Object.freeze({
  skin: 0xf4cdb4,
  cloth: 0x4b3a7a,
  clothDark: 0x2e2350,
  leather: 0x241a2e,
  hair: 0x6a4f9c,
  hairDark: 0x4a376f,
  metal: 0x9fb2c4,
  eye: 0x49e0c4,
  outline: 0x141020,
});

// ~70% of previous overlong blades, with thicker girth for a solid blade read.
const WEAPON_LENGTH = Object.freeze({
  sword: 1.27,
  saber: 1.13,
  greatsword: 1.44,
  katana: 1.48,
  leaf: 1.08,
  relic: 1.25,
});
const WEAPON_GIRTH = Object.freeze({
  sword: 1.22,
  saber: 1.1,
  greatsword: 1.38,
  katana: 1.28,
  leaf: 1.15,
  relic: 1.25,
});

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

function attachAnimeHair(group) {
  const anchor = findHeadAnchor(group);
  if (!anchor || anchor.userData.animeHair) return;
  const hairRoot = new THREE.Group();
  hairRoot.name = 'RogueHood';
  hairRoot.userData.animeHair = true;
  const hoodMat = toonMaterial(ANIME.clothDark, { name: 'rogue-hood', emissive: 0x140d28, emissiveIntensity: .12 });
  const hairMat = toonMaterial(ANIME.hair, { name: 'anime-hair', emissive: ANIME.hairDark, emissiveIntensity: .08 });
  const tipMat = toonMaterial(ANIME.hairDark, { name: 'anime-hair-tip' });
  const maskMat = toonMaterial(0x2bd1b4, { name: 'rogue-mask', emissive: 0x1c9a86, emissiveIntensity: .2 });

  // Hood dome pulled back over the crown, leaving the face open.
  const hood = outlinedMesh(
    new THREE.SphereGeometry(.42, 18, 14, 0, Math.PI * 2, 0, Math.PI * .62),
    hoodMat,
    { thickness: 1.05, outlineColor: ANIME.outline },
  );
  hood.position.set(0, .16, -.06);
  hood.scale.set(1.08, 1.18, 1.12);
  hood.castShadow = true;
  hairRoot.add(hood);

  // Hood collar falling down the back of the neck.
  const collar = outlinedMesh(
    new THREE.CylinderGeometry(.3, .42, .5, 12, 1, true),
    hoodMat,
    { thickness: 1.04, outlineColor: ANIME.outline },
  );
  collar.position.set(0, -.12, -.24);
  collar.rotation.x = -.25;
  hairRoot.add(collar);

  // Sleek low ponytail peeking from under the hood.
  const tail = outlinedMesh(
    new THREE.CylinderGeometry(.13, .08, .82, 12),
    hairMat,
    { thickness: 1.06, outlineColor: ANIME.outline },
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
    { thickness: 1.05, outlineColor: ANIME.outline },
  );
  tie.position.set(0, .06, -.28);
  tie.rotation.x = Math.PI / 2 - .28;
  hairRoot.add(tie);

  // Short fringe over the forehead.
  const bang = outlinedMesh(
    new THREE.SphereGeometry(.3, 18, 14, 0, Math.PI * 2, 0, Math.PI * .5),
    hairMat,
    { thickness: 1.06, outlineColor: ANIME.outline },
  );
  bang.position.set(0, .1, .04);
  bang.scale.set(1, .55, .92);
  bang.castShadow = true;
  hairRoot.add(bang);

  // Teal face mask over the lower face for a thief / assassin read.
  const mask = outlinedMesh(
    new THREE.TorusGeometry(.22, .1, 8, 20, Math.PI * 1.1),
    maskMat,
    { thickness: 1.04, outlineColor: ANIME.outline },
  );
  mask.position.set(0, -.04, .26);
  mask.rotation.set(Math.PI / 2, 0, Math.PI * .45);
  hairRoot.add(mask);

  hairRoot.position.set(0, .06, 0);
  if (anchor.isBone || anchor.isObject3D) {
    // Offset into local head space; bone orientation varies, so keep modest.
    hairRoot.scale.setScalar(1);
    anchor.add(hairRoot);
  } else {
    group.add(hairRoot);
    hairRoot.position.y = 2.45;
  }
  anchor.userData.animeHair = true;
  group.userData.animeHairRoot = hairRoot;
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

export class CharacterFactory {
  constructor(assetManager, outlineSystem) {
    this.assets = assetManager;
    this.outlines = outlineSystem;
    this.weaponInstances = new WeakMap();
  }

  createHero(options = {}) {
    const asset = this.assets.cloneModel('hero.aerin', { quality: options.quality ?? 'high' });
    const group = asset.scene;
    group.name = 'AnimeHunter_PlayerCharacter';
    group.scale.setScalar(options.scale ?? .94);
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
        // Stronger cel bands for a manga / shonen read.
        const material = convertToStylized(source, {
          role,
          style: {
            bands: role === 'skin' ? 3 : 4,
            bandStrength: role === 'skin' ? .42 : role === 'metal' ? .28 : .48,
            rimStrength: role === 'hair' ? .1 : role === 'skin' ? .07 : .05,
            wrap: role === 'skin' ? .24 : .16,
            shadowTint: role === 'cloth' ? 0x5a2208 : role === 'hair' ? 0x6a4810 : 0x2a3540,
            rimColor: role === 'hair' ? 0xffe6a0 : 0xffd8b8,
          },
        });
        // Prefer flat anime color over photo-realistic maps.
        material.map = null;
        material.normalMap = null;
        material.roughnessMap = null;
        material.aoMap = null;
        material.metalness = role === 'metal' ? .55 : 0;
        material.roughness = role === 'metal' ? .35 : role === 'skin' ? .62 : .88;
        if (role === 'skin') material.color.setHex(ANIME.skin);
        else if (role === 'cloth') material.color.setHex(ANIME.cloth);
        else if (role === 'leather') material.color.setHex(ANIME.leather);
        else if (role === 'hair') {
          material.color.setHex(ANIME.hair);
          material.emissive.setHex(ANIME.hairDark);
          material.emissiveIntensity = .12;
        } else if (role === 'metal') material.color.setHex(ANIME.metal);
        else if (role === 'eye') {
          material.color.setHex(ANIME.eye);
          material.emissive.setHex(ANIME.eye);
          material.emissiveIntensity = .35;
        } else {
          // Unknown meshes lean orange jacket so the silhouette reads as shonen hero.
          material.color.setHex(ANIME.clothDark);
        }
        materials.set(cacheKey, material);
        return material;
      });
      object.material = Array.isArray(object.material) ? converted : converted[0];
    });

    boostAnimeProportions(group);
    attachAnimeHair(group);
    this.outlines.configure(group, { color: ANIME.outline, priority: 10, maxDistance: 48 });

    const socket = group.getObjectByName('weapon_socket');
    const refs = {
      group,
      socket,
      bladeBase: null,
      bladeTip: null,
      modelHeight: 3.05,
      materials: [...materials.values()],
      fallback: asset.fallback,
    };
    const animation = new CharacterAnimationController(group, asset.animations, { referenceRunSpeed: 7.2, defaultFade: .13 });
    return { group, refs, animation };
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
    // Solid mid-length blade: shorter than before, thicker in the other axes.
    const length = WEAPON_LENGTH[kind] ?? 1.25;
    const girth = WEAPON_GIRTH[kind] ?? 1.2;
    weapon.scale.set(girth, length, girth);
    const rarityColor = new THREE.Color(item.rarityColor ?? item.color ?? 0xe8f4ff);
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
    this.outlines.configure(weapon, { color: ANIME.outline, priority: 8, maxDistance: 36 });
    return weapon;
  }
}
