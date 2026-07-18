import * as THREE from 'three';
import { CharacterAnimationController, SecondaryMotion } from '../../packages/template-3d/index.js';
import { convertToStylized, inferMaterialRole } from '../graphics/StylizedMaterial.js';
import { outlinedMesh, toonMaterial } from '../graphics/Materials.js';
import { DEFAULT_HERO_CLASS_ID, getHeroClass, resolveHeroClassId } from '../data/content.js';

function ensureUv2(geometry) {
  if (!geometry?.getAttribute?.('uv2') && geometry?.getAttribute?.('uv')) geometry.setAttribute('uv2', geometry.getAttribute('uv').clone());
}

/** First object found by name, tried in priority order. Used for v2-authored socket/grip names with v1 fallbacks. */
function findFirstNamed(root, names) {
  for (const name of names) {
    const found = root?.getObjectByName?.(name);
    if (found) return found;
  }
  return null;
}
function isAuthoredHeroV2(root) {
  let authored = false;
  root?.traverse?.(object => {
    if (Number(object.userData?.schemaVersion) >= 2 && object.userData?.assetType === 'hero') authored = true;
  });
  return authored;
}

/**
 * v2 rig sockets (preferred, authored) with v1 compatibility aliases (current baked GLBs).
 * See docs/plan/character-graphics-animation-overhaul.md §7.3.
 */
const SOCKET_ALIASES = Object.freeze({
  weaponR: Object.freeze(['weapon_socket_r', 'weapon_socket']),
  weaponL: Object.freeze(['weapon_socket_l', 'offhand_socket']),
  handR: Object.freeze(['hand_r', 'right_hand']),
  handL: Object.freeze(['hand_l', 'left_hand']),
});
const GRIP_ALIASES = Object.freeze(['grip_main', 'grip_anchor']);
const TRAIL_BASE_ALIASES = Object.freeze(['trail_base', 'blade_base']);
const TRAIL_TIP_ALIASES = Object.freeze(['trail_tip', 'blade_tip']);
const MUZZLE_ALIASES = Object.freeze(['muzzle_socket']);
const SUPPORT_GRIP_ALIASES = Object.freeze(['grip_support']);
const UPPER_BODY_BONES = Object.freeze([
  'chest', 'neck', 'head',
  'left_upper_arm', 'left_lower_arm', 'left_hand',
  'right_upper_arm', 'right_lower_arm', 'right_hand',
]);

/** True flip of a single mount axis (e.g. Y-only mirror) is a genuine reflection and cannot
 * be reproduced by rotation; a compound two-axis flip (X+Y or Y+Z) is a proper 180° rotation
 * and IS reproducible, so it never needs negative scale. */
const AXIS_FLIP_X = Object.freeze(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
const AXIS_FLIP_Z = Object.freeze(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI));

/** Dev/test/visual-smoke fail-closed switch (`?debug=1`). Never used inside template-candidate modules. */
function isDebugStrict() {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

/** No negative-scale ancestor anywhere in the (unscaled-by-runtime) authored subtree. */
function hasNegativeScale(root) {
  let found = false;
  root?.traverse?.(object => {
    if (found || !object.scale) return;
    if (object.scale.x < 0 || object.scale.y < 0 || object.scale.z < 0) found = true;
  });
  return found;
}

/** Per-look runtime palette + head kit. Add a kit when adding a new class. */
const CLASS_LOOKS = Object.freeze({
  // Steel knight — plate cloth role, dark iron leather, crimson accents. Helm baked in GLB.
  aerin: Object.freeze({
    palette: Object.freeze({
      skin: 0xd4a07a,
      cloth: 0x8a9db0,
      clothDark: 0x3a4658,
      cape: 0x8b1a28,
      leather: 0x1e2430,
      hair: 0x2a1f18,
      hairDark: 0x1a1410,
      metal: 0xd4b86a,
      eye: 0x2a4568,
      outline: 0x0c1018,
      shadowTintCloth: 0x1a2438,
      shadowTintHair: 0x1a1010,
      rimHair: 0xc8b090,
      rimSkin: 0xffd0b0,
    }),
    headKit: 'none',
    scale: .97,
  }),
  wizard: Object.freeze({
    palette: Object.freeze({
      skin: 0xf0c8b8,
      cloth: 0x3a4f9c,
      clothDark: 0x1e2a5c,
      cape: 0x24306e,
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
    scale: .96,
  }),
  // Night rogue — dark leather wrap, mint accents; hood comes from the runtime head kit.
  rogue: Object.freeze({
    palette: Object.freeze({
      skin: 0xdea482,
      cloth: 0x3c4e5a,
      clothDark: 0x222c38,
      cape: 0x28323e,
      leather: 0x161c24,
      hair: 0x9ef0d8,
      hairDark: 0x3aa890,
      metal: 0xb8c4c8,
      eye: 0x35e0b8,
      outline: 0x0a0e14,
      shadowTintCloth: 0x14202c,
      shadowTintHair: 0x1c4a40,
      rimHair: 0xd8fff2,
      rimSkin: 0xffd0b0,
    }),
    headKit: 'rogue',
    scale: .89,
  }),
  // Wildshot ranger — forest olive cloak, auburn crop, amber eyes; no runtime hood.
  ranger: Object.freeze({
    palette: Object.freeze({
      skin: 0xd8a882,
      cloth: 0x4a6a48,
      clothDark: 0x2a3a28,
      cape: 0x3a4a30,
      leather: 0x3a2a1c,
      hair: 0x8a4028,
      hairDark: 0x5a2818,
      metal: 0xc8b070,
      eye: 0xe8b040,
      outline: 0x101810,
      shadowTintCloth: 0x1a2818,
      shadowTintHair: 0x3a2010,
      rimHair: 0xf0c090,
      rimSkin: 0xffd0b0,
    }),
    headKit: 'ranger',
    scale: .94,
  }),
  // Ember Vanguard gunner — slate rescue plate, brass + ember accents.
  gunner: Object.freeze({
    palette: Object.freeze({
      skin: 0xd2a07a,
      cloth: 0x4a5560,
      clothDark: 0x2a323c,
      cape: 0x3a2a22,
      leather: 0x2a2420,
      hair: 0x3a3028,
      hairDark: 0x1e1814,
      metal: 0xc8a060,
      eye: 0xe87838,
      outline: 0x101418,
      shadowTintCloth: 0x1a222c,
      shadowTintHair: 0x201810,
      rimHair: 0xe0c090,
      rimSkin: 0xffd0b0,
    }),
    headKit: 'none',
    scale: .95,
  }),
});

// Authored GLBs already use hero-space units. These values are final visual
// multipliers only; combat range remains on meleeProfile / skills.
const WEAPON_LENGTH = Object.freeze({
  sword: .84,
  saber: .68,
  greatsword: 1.05,
  katana: 1.48,
  leaf: 1.08,
  relic: 1.25,
  staff: 1.08,
  /** Compact dual-dagger scale keeps both blades inside the rogue silhouette. */
  dagger: .53,
  bow: 1.05,
  rifle: 1.2,
});
const WEAPON_GIRTH = Object.freeze({
  sword: .92,
  saber: .72,
  greatsword: 1.1,
  katana: 1.28,
  leaf: 1.15,
  relic: 1.25,
  staff: .8,
  /** Slimmer than prior 1.0 so the rebaked sharp tip stays readable. */
  dagger: .78,
  bow: .9,
  rifle: 1.05,
});

const WEAPON_MOUNT_PROFILES = Object.freeze({
  default: Object.freeze({ offset: [0, 0, 0], rotation: [0, Math.PI, .14] }),
  sword: Object.freeze({ offset: [.01, -.01, .01], rotation: [-1.05, 0, 0], reverseBladeAxis: true }),
  staff: Object.freeze({ offset: [.01, -.02, .01], rotation: [-Math.PI / 2, -Math.PI / 2, 0], reverseBladeAxis: true }),
  dagger: Object.freeze({ offset: [0, 0, .01], rotation: [-.55, Math.PI, .05] }),
  bow: Object.freeze({ offset: [0, 0, .01], rotation: [-Math.PI / 2, Math.PI, 0] }),
  rifle: Object.freeze({ offset: [0.02, -0.02, 0.04], rotation: [-Math.PI, 1.23, -1.28] }),
});

function attachWeaponAtGrip(socket, weapon, offset = [0, 0, 0]) {
  socket.add(weapon);
  const grip = findFirstNamed(weapon, GRIP_ALIASES);
  if (!grip) {
    weapon.position.fromArray(offset);
    return;
  }
  weapon.position.set(0, 0, 0);
  socket.updateWorldMatrix(true, false);
  weapon.updateWorldMatrix(true, true);
  const gripInSocket = socket.worldToLocal(grip.getWorldPosition(new THREE.Vector3()));
  weapon.position.set(offset[0], offset[1], offset[2]).sub(gripInSocket);
  weapon.updateWorldMatrix(false, true);
}

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
  hood.position.set(0, .18, .02);
  hood.scale.set(1.14, 1.22, 1.12);
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
  bang.position.set(.03, .13, .22);
  bang.scale.set(1.04, .58, .78);
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

function attachRangerHair(group, palette) {
  const anchor = findHeadAnchor(group);
  if (!anchor || anchor.userData.animeHair) return;
  const hairRoot = new THREE.Group();
  hairRoot.name = 'RangerHair';
  hairRoot.userData.animeHair = true;
  const hairMat = toonMaterial(palette.hair, { name: 'ranger-hair', emissive: palette.hairDark, emissiveIntensity: .06 });
  const tieMat = toonMaterial(0xc8b070, { name: 'ranger-hair-tie' });

  const cap = outlinedMesh(
    new THREE.SphereGeometry(.42, 18, 14, 0, Math.PI * 2, 0, Math.PI * .62),
    hairMat,
    { thickness: 1.05, outlineColor: palette.outline },
  );
  cap.position.set(0, .17, .03);
  cap.scale.set(1.08, 1.12, 1.06);
  cap.castShadow = true;
  hairRoot.add(cap);

  const fringe = outlinedMesh(
    new THREE.SphereGeometry(.28, 16, 12, 0, Math.PI * 2, 0, Math.PI * .5),
    hairMat,
    { thickness: 1.05, outlineColor: palette.outline },
  );
  fringe.position.set(-.08, .12, .24);
  fringe.scale.set(1.25, .52, .72);
  fringe.rotation.z = -.18;
  hairRoot.add(fringe);

  const ponytail = outlinedMesh(
    new THREE.CylinderGeometry(.13, .075, .66, 12),
    hairMat,
    { thickness: 1.05, outlineColor: palette.outline },
  );
  ponytail.position.set(.12, -.28, -.28);
  ponytail.rotation.set(.28, 0, -.12);
  ponytail.castShadow = true;
  hairRoot.add(ponytail);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(.105, .025, 8, 16), tieMat);
  tie.position.set(.06, .02, -.24);
  tie.rotation.x = Math.PI / 2 - .28;
  hairRoot.add(tie);

  hairRoot.position.set(0, .05, 0);
  anchor.add(hairRoot);
  anchor.userData.animeHair = true;
  group.userData.animeHairRoot = hairRoot;
}

function applyHeadKit(group, look) {
  if (look.headKit === 'rogue') attachRogueHood(group, look.palette);
  else if (look.headKit === 'ranger') attachRangerHair(group, look.palette);
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

/**
 * D8: palette is a tint/grade policy, not a texture eraser. When the source
 * material carries authored maps (StylizedMaterial preserved them), `color`
 * and `metalness`/`roughness` still apply — they multiply/override the same
 * way they would on any MeshStandardMaterial with a populated `map` — so a
 * future textured asset keeps its detail instead of being flattened.
 */
function applyPalette(material, role, palette) {
  material.metalness = role === 'metal' ? .55 : 0;
  material.roughness = role === 'metal' ? .35 : role === 'skin' ? .62 : .88;
  if (role === 'skin') material.color.setHex(palette.skin);
  else if (role === 'cloth') material.color.setHex(palette.cloth);
  else if (role === 'cape') {
    // Prefer dedicated cape accent when present; else clothDark for contrast vs armor.
    material.color.setHex(palette.cape ?? palette.clothDark ?? palette.cloth);
  } else if (role === 'leather') material.color.setHex(palette.leather);
  else if (role === 'hair') {
    material.color.setHex(palette.hair);
    material.emissive.setHex(palette.hairDark);
    material.emissiveIntensity = .12;
  } else if (role === 'metal') material.color.setHex(palette.metal);
  else if (role === 'eye_white') {
    material.color.setHex(0xfff4e8);
    material.emissive.setHex(0x000000);
    material.emissiveIntensity = 0;
  } else if (role === 'eye') {
    material.color.setHex(palette.eye);
    material.emissive.setHex(palette.eye);
    material.emissiveIntensity = .35;
  } else {
    material.color.setHex(palette.clothDark);
  }
}

/**
 * Class/weapon contract expectations injected into `AssetManager.cloneModel`.
 * Catches wrong-file substitution (renamed class asset) and required-socket/
 * negative-scale regressions before they render silently. Returns the shape
 * `AssetManager` and `docs/agent` diagnostics expect: `{ ok, issues }`.
 */
function validateHeroContract(heroDef, scene) {
  const issues = [];
  if (scene.userData.assetKey && scene.userData.assetKey !== heroDef.modelKey) {
    issues.push(`assetKey ${scene.userData.assetKey} != expected ${heroDef.modelKey}`);
  }
  if (!findFirstNamed(scene, SOCKET_ALIASES.weaponR)) {
    issues.push(`missing weapon socket (${SOCKET_ALIASES.weaponR.join('/')})`);
  }
  if (hasNegativeScale(scene)) issues.push('negative scale in authored hero ancestry');
  return { ok: issues.length === 0, issues };
}

/** Same contract shape as `validateHeroContract`, scoped to an equipped weapon asset. */
function validateWeaponContract(kind, scene) {
  const issues = [];
  if (!findFirstNamed(scene, GRIP_ALIASES)) issues.push(`missing grip anchor (${GRIP_ALIASES.join('/')})`);
  if (hasNegativeScale(scene)) issues.push('negative scale in authored weapon ancestry');
  return { ok: issues.length === 0, issues };
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
    const quality = options.quality ?? 'high';
    const strict = isDebugStrict();
    const asset = this.assets.cloneModel(heroDef.modelKey, {
      quality,
      strict,
      debugFallback: strict,
      validate: scene => validateHeroContract(heroDef, scene),
    });
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

    const authoredV2 = isAuthoredHeroV2(group);
    if (!authoredV2) {
      boostAnimeProportions(group);
      applyHeadKit(group, look);
    }
    this.outlines.configure(group, { color: palette.outline, priority: 10, maxDistance: 48 });

    let socket = findFirstNamed(group, SOCKET_ALIASES.weaponR);
    let offhandSocket = findFirstNamed(group, SOCKET_ALIASES.weaponL);
    // Ranger animation poses the left arm as the bow hand and the right hand as
    // the string hand. Mounting the bow to the shared right-hand socket made the
    // correct asset look like it belonged to another class.
    if (classId === 'ranger') {
      const leftHand = findFirstNamed(group, SOCKET_ALIASES.handL);
      if (leftHand) {
        socket = new THREE.Group();
        socket.name = 'weapon_socket_ranger_runtime';
        socket.position.set(.03, -.11, .02);
        leftHand.add(socket);
      }
    }
    if (!offhandSocket && classId === 'rogue') {
      const leftHand = findFirstNamed(group, SOCKET_ALIASES.handL);
      if (leftHand) {
        offhandSocket = new THREE.Group();
        offhandSocket.name = 'offhand_socket_runtime';
        offhandSocket.position.set(.03, -.11, .02);
        leftHand.add(offhandSocket);
      }
    }
    group.updateMatrixWorld(true);
    const modelBounds = new THREE.Box3().setFromObject(group);
    const modelHeight = Math.max(.01, modelBounds.max.y - modelBounds.min.y);
    const refs = {
      group,
      socket,
      offhandSocket,
      bladeBase: null,
      bladeTip: null,
      mainBladeBase: null,
      mainBladeTip: null,
      offhandBladeBase: null,
      offhandBladeTip: null,
      modelHeight,
      materials: [...materials.values()],
      fallback: asset.fallback,
      classId,
      quality: group.userData.assetQuality ?? quality,
      assetError: Boolean(group.userData.assetError),
      assetErrorDetail: group.userData.assetErrorDetail ?? null,
      contract: asset.contract ?? null,
      socketNames: {
        primary: socket?.name ?? null,
        offhand: offhandSocket?.name ?? null,
        muzzle: null,
      },
    };
    const animation = new CharacterAnimationController(group, asset.animations, {
      referenceRunSpeed: 7.2,
      defaultFade: .13,
      locomotionMode: authoredV2 ? 'blend' : 'discrete',
      strict,
    });
    animation.setLayerPolicy({
      upperBoneNames: UPPER_BODY_BONES,
      additiveBoneNames: UPPER_BODY_BONES,
    });
    if (authoredV2) {
      animation.setAdditive('breath_add', classId === 'gunner' ? .12 : .16, { timeScale: .9 });
      if (classId === 'wizard' || classId === 'ranger' || classId === 'gunner') {
        animation.setAdditive('aim_idle_add', .08, { timeScale: .72 });
      }
    }
    const secondaryChains = ['cape_root', 'hair_root']
      .map(name => group.getObjectByName(name))
      .filter(Boolean)
      .map(bone => ({ bone }));
    if (secondaryChains.length > 0) {
      const secondaryMotion = new SecondaryMotion(secondaryChains, { quality });
      animation.setSecondaryMotion(secondaryMotion);
      refs.secondaryMotion = secondaryMotion;
    }
    refs.animation = animation;
    return { group, refs, animation, classId };
  }

  equipWeapon(character, item = {}) {
    const refs = character.refs ?? character;
    if (!refs.socket) return null;
    this.clearWeapons(refs);
    const kind = item.model ?? 'sword';
    const quality = item.quality ?? refs.quality ?? 'high';
    const strict = isDebugStrict();
    const asset = this.assets.cloneModel(`weapon.${kind}`, {
      quality,
      strict,
      debugFallback: strict,
      validate: scene => validateWeaponContract(kind, scene),
    });
    const weapon = asset.scene;
    refs.weaponQuality = weapon.userData.assetQuality ?? quality;
    weapon.name = `Equipped_${kind}`;
    const rogueDual = refs.classId === 'rogue' && (kind === 'dagger' || kind === 'saber');
    const mount = WEAPON_MOUNT_PROFILES[kind] ?? WEAPON_MOUNT_PROFILES.default;
    const length = WEAPON_LENGTH[kind] ?? 1;
    const girth = WEAPON_GIRTH[kind] ?? 1;
    // D9: some authored weapons point along the inverse hand axis in their idle
    // mount. A single-axis mirror (negative scale) cannot always be produced by
    // rotation alone, but this specific reversal (only the longitudinal axis)
    // composes with the base mount rotation as one proper 180° rotation about a
    // perpendicular axis — so no negative-scale ancestor is ever introduced here.
    const needsAxisFlip = rogueDual || mount.reverseBladeAxis;
    weapon.quaternion.setFromEuler(new THREE.Euler().fromArray(mount.rotation));
    if (needsAxisFlip) weapon.quaternion.multiply(AXIS_FLIP_X);
    weapon.scale.set(girth, length, girth);
    weapon.userData.mountAxisFlipped = needsAxisFlip;
    const rarityColor = new THREE.Color(item.rarityColor ?? item.color ?? 0xe8f4ff);
    const outlineColor = resolveLook(getHeroClass(refs.classId).lookId).palette.outline;
    const mainMaterials = new Set();
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
      mainMaterials.add(material);
    });
    attachWeaponAtGrip(refs.socket, weapon, mount.offset);
    refs.bladeBase = findFirstNamed(weapon, TRAIL_BASE_ALIASES);
    refs.bladeTip = findFirstNamed(weapon, TRAIL_TIP_ALIASES);
    refs.mainBladeBase = refs.bladeBase;
    refs.mainBladeTip = refs.bladeTip;
    refs.weapon = weapon;
    refs.weaponAssetError = Boolean(weapon.userData.assetError);
    refs.weaponAssetErrorDetail = weapon.userData.assetErrorDetail ?? null;
    refs.weaponContract = asset.contract ?? null;
    if (refs.weaponAssetError) {
      refs.assetError = true;
      refs.assetErrorDetail = refs.assetErrorDetail ?? refs.weaponAssetErrorDetail;
    }
    // Rifle muzzle origin for hitscan tracers (authored socket or tip fallback).
    let muzzle = findFirstNamed(weapon, MUZZLE_ALIASES);
    if (!muzzle && kind === 'rifle') {
      muzzle = new THREE.Object3D();
      muzzle.name = 'muzzle_socket';
      const tip = refs.bladeTip;
      if (tip) {
        tip.add(muzzle);
      } else {
        muzzle.position.set(0, 0.9, 0);
        weapon.add(muzzle);
      }
    }

    refs.muzzleSocket = muzzle ?? refs.bladeTip ?? null;
    this.outlines.configure(weapon, { color: outlineColor, priority: 8, maxDistance: 36 });
    let offhand = null;
    let offhandRelease = null;
    const offhandMaterials = new Set();
    if (refs.classId === 'rogue' && refs.offhandSocket && (kind === 'dagger' || kind === 'saber')) {
      const offhandAsset = this.assets.cloneModel(`weapon.${kind}`, {
        quality,
        strict,
        debugFallback: strict,
        validate: scene => validateWeaponContract(kind, scene),
      });
      offhandRelease = offhandAsset.release;
      offhand = offhandAsset.scene;
      offhand.name = `Equipped_${kind}_offhand`;
      // D9: mirroring left/right hand chirality AND reversing the tip axis is a
      // compound two-axis flip — mathematically identical to the equivalent
      // 180° rotation about the perpendicular axis, so this never needs
      // negative scale (see AXIS_FLIP_Z derivation note above).
      offhand.quaternion.setFromEuler(new THREE.Euler(-0.55, 0, -.05));
      offhand.quaternion.multiply(AXIS_FLIP_Z);
      offhand.scale.set(girth, length, girth);
      offhand.userData.mountAxisFlipped = true;
      refs.offhandAssetError = Boolean(offhand.userData.assetError);
      refs.offhandAssetErrorDetail = offhand.userData.assetErrorDetail ?? null;
      refs.offhandContract = offhandAsset.contract ?? null;
      if (refs.offhandAssetError) {
        refs.assetError = true;
        refs.assetErrorDetail = refs.assetErrorDetail ?? refs.offhandAssetErrorDetail;
      }
      offhand.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        ensureUv2(object.geometry);
        const source = object.material;
        const role = inferMaterialRole(source?.name ?? object.name);
        const material = convertToStylized(source, {
          role, style: { bandStrength: .22, rimStrength: role === 'metal' ? .12 : .04, bands: 3 },
        });

        if (role === 'metal' || object.name.toLowerCase().includes('blade')) {
          material.color.copy(rarityColor).lerp(new THREE.Color(0xd9c6ff), .42);
          material.metalness = .72;
          material.roughness = .28;
          material.emissive.setHex(0x6f43a8);
          material.emissiveIntensity = .2;
        }
        object.material = material;
        offhandMaterials.add(material);
      });
      attachWeaponAtGrip(refs.offhandSocket, offhand, [0, 0, .01]);
      refs.offhandBladeBase = findFirstNamed(offhand, TRAIL_BASE_ALIASES);
      refs.offhandBladeTip = findFirstNamed(offhand, TRAIL_TIP_ALIASES);
      refs.offhandWeapon = offhand;
      this.outlines.configure(offhand, { color: outlineColor, priority: 8, maxDistance: 36 });
    }
    refs.socketNames = {
      ...refs.socketNames,
      muzzle: refs.muzzleSocket?.name ?? null,
    };
    const supportGrip = findFirstNamed(weapon, SUPPORT_GRIP_ALIASES);
    const supportRoot = refs.group?.getObjectByName('left_upper_arm');
    const supportMid = refs.group?.getObjectByName('left_lower_arm');
    const supportEnd = refs.group?.getObjectByName('left_hand');
    if (kind === 'rifle' && supportGrip && refs.animation && supportRoot && supportMid && supportEnd) {
      refs.group.updateMatrixWorld(true);
      const rootPos = supportRoot.getWorldPosition(new THREE.Vector3());
      const midPos = supportMid.getWorldPosition(new THREE.Vector3());
      const endPos = supportEnd.getWorldPosition(new THREE.Vector3());
      refs.animation.setIK({
        chains: [{
          name: 'support_hand',
          root: supportRoot,
          mid: supportMid,
          end: supportEnd,
          target: supportGrip,
          upperLength: rootPos.distanceTo(midPos),
          lowerLength: midPos.distanceTo(endPos),
          weight: kind === 'rifle' ? 1 : .72,
        }],
      });
      refs.supportGrip = supportGrip;
    }
    this.weaponInstances.set(refs, {
      main: { scene: weapon, release: asset.release, materials: mainMaterials },
      offhand: offhand ? { scene: offhand, release: offhandRelease, materials: offhandMaterials } : null,
    });
    return weapon;
  }

  clearWeapons(character) {
    const refs = character?.refs ?? character;
    if (!refs) return;
    const instances = this.weaponInstances.get(refs);
    for (const handle of [instances?.main, instances?.offhand]) {
      if (!handle?.scene) continue;
      handle.scene.parent?.remove(handle.scene);
      this.outlines.unregister(handle.scene);
      for (const material of handle.materials ?? []) material.dispose?.();
      handle.materials?.clear?.();
      handle.release?.();
    }
    this.weaponInstances.delete(refs);
    refs.animation?.setIK?.({ chains: [] });
    refs.supportGrip = null;
    refs.weapon = null;
    refs.offhandWeapon = null;
    refs.bladeBase = refs.bladeTip = null;
    refs.mainBladeBase = refs.mainBladeTip = null;
    refs.offhandBladeBase = refs.offhandBladeTip = null;
  }
}
