import * as THREE from 'three';
import { outlinedMesh, shadowMaterial, sharedToonMaterial, spriteMaterial, toonMaterial } from './Materials.js';

const GEO = new Map();
const geometry = (key, factory) => {
  if (!GEO.has(key)) GEO.set(key, factory());
  return GEO.get(key);
};

function addPart(parent, geo, material, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0], options = {}) {
  const mesh = outlinedMesh(geo, material, options);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function addPlain(parent, geo, material, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function cylinderBetween(parent, start, end, radius, material, options = {}) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const midpoint = a.clone().add(b).multiplyScalar(.5);
  const length = a.distanceTo(b);
  const mesh = addPart(
    parent,
    geometry(`cyl-${options.segments ?? 7}`, () => new THREE.CylinderGeometry(1, 1, 1, options.segments ?? 7)),
    material,
    [midpoint.x, midpoint.y, midpoint.z],
    [radius, length, radius],
    [0, 0, 0],
    { outline: options.outline ?? true, thickness: options.thickness ?? 1.055 },
  );
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

function coneBetween(parent, start, end, radius, material, options = {}) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const midpoint = a.clone().add(b).multiplyScalar(.5);
  const length = a.distanceTo(b);
  const mesh = addPart(
    parent,
    geometry(`cone-${options.segments ?? 6}`, () => new THREE.ConeGeometry(1, 1, options.segments ?? 6)),
    material,
    [midpoint.x, midpoint.y, midpoint.z],
    [radius, length, radius],
    [0, 0, 0],
    { outline: options.outline ?? true, thickness: options.thickness ?? 1.055 },
  );
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

function createShadow(parent, radius = 1, opacity = .2) {
  const shadow = new THREE.Mesh(
    geometry('shadow-disc', () => new THREE.CircleGeometry(1, 28)),
    shadowMaterial(opacity),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(radius, radius * .68, 1);
  shadow.position.y = .025;
  shadow.renderOrder = -2;
  parent.add(shadow);
  return shadow;
}

function createHealthBar(parent, height, width = 1.5) {
  const group = new THREE.Group();
  group.position.y = height;
  group.visible = false;
  const back = new THREE.Mesh(
    geometry('health-back', () => new THREE.PlaneGeometry(1, .12)),
    new THREE.MeshBasicMaterial({ color: 0x18202b, transparent: true, opacity: .88, depthTest: false, depthWrite: false }),
  );
  back.scale.x = width + .12;
  back.renderOrder = 20;
  group.add(back);
  const fill = new THREE.Mesh(
    geometry('health-fill', () => new THREE.PlaneGeometry(1, .075)),
    new THREE.MeshBasicMaterial({ color: 0xff5f73, transparent: true, opacity: 1, depthTest: false, depthWrite: false }),
  );
  fill.position.z = .012;
  fill.scale.x = width;
  fill.renderOrder = 21;
  group.add(fill);
  group.renderOrder = 20;
  parent.add(group);
  return { group, back, fill, width };
}

function createPalette(data, elite = false) {
  const bodyColor = elite ? new THREE.Color(data.color).lerp(new THREE.Color(0xffd26f), .18).getHex() : data.color;
  return {
    body: toonMaterial(bodyColor, { name: `${data.id}-body` }),
    accent: toonMaterial(data.accent, { name: `${data.id}-accent`, emissive: data.accent, emissiveIntensity: data.boss ? .13 : .025 }),
    dark: toonMaterial(new THREE.Color(data.color).multiplyScalar(.52).getHex(), { name: `${data.id}-dark` }),
    light: toonMaterial(new THREE.Color(data.accent).lerp(new THREE.Color(0xffffff), .38).getHex(), { name: `${data.id}-light` }),
    eye: toonMaterial(data.eye ?? 0x15202c, { name: `${data.id}-eye`, emissive: data.eye ?? 0x15202c, emissiveIntensity: .08 }),
    white: toonMaterial(0xf7f0dc, { name: `${data.id}-white` }),
    metal: toonMaterial(elite ? 0xffd681 : 0x8899a5, { name: `${data.id}-metal` }),
  };
}

export function createHeroModel() {
  // Procedural anime / shonen hunter fallback (used when GLB is missing).
  const group = new THREE.Group();
  group.name = 'AnimeHunterHero';
  const rig = new THREE.Group();
  group.add(rig);
  createShadow(group, .72, .24);

  const skin = toonMaterial(0xffc39a, { name: 'hero-skin' });
  const tunic = toonMaterial(0xf26b1c, { name: 'hero-tunic' });
  const tunicLight = toonMaterial(0xff8a3a, { name: 'hero-tunic-light' });
  const cloth = toonMaterial(0x1c3358, { name: 'hero-cloth' });
  const leather = toonMaterial(0x243044, { name: 'hero-leather' });
  const hair = toonMaterial(0xf2c04a, { name: 'hero-hair', emissive: 0xd4922a, emissiveIntensity: .1 });
  const metal = toonMaterial(0xd7e4ec, { name: 'hero-metal' });
  const gold = toonMaterial(0xe9b956, { name: 'hero-gold', emissive: 0x7a4318, emissiveIntensity: .04 });
  const eye = toonMaterial(0x1b4f8c, { name: 'hero-eye', emissive: 0x1b4f8c, emissiveIntensity: .28 });
  const white = toonMaterial(0xfff6ea, { name: 'hero-eye-white' });

  const hips = new THREE.Group();
  hips.position.y = 1.05;
  rig.add(hips);
  addPart(hips, geometry('hero-hips', () => new THREE.CylinderGeometry(.36, .42, .48, 8)), cloth, [0, .08, 0], [1, 1, .82]);
  addPart(hips, geometry('hero-belt', () => new THREE.TorusGeometry(.4, .07, 5, 12)), leather, [0, .26, 0], [1, 1, .84], [Math.PI / 2, 0, 0], { thickness: 1.03 });
  addPart(hips, geometry('hero-buckle', () => new THREE.BoxGeometry(.18, .16, .08)), metal, [0, .26, .34], [1, 1, 1], [0, 0, 0], { thickness: 1.07 });

  const torso = new THREE.Group();
  torso.position.y = .55;
  hips.add(torso);
  addPart(torso, geometry('hero-torso', () => new THREE.CylinderGeometry(.4, .32, .82, 8)), tunic, [0, .15, 0], [1, 1, .76]);
  addPart(torso, geometry('hero-chest-panel', () => new THREE.BoxGeometry(.46, .5, .08)), tunicLight, [0, .14, .32], [1, 1, 1], [0, 0, 0], { thickness: 1.035 });
  addPart(torso, geometry('hero-collar', () => new THREE.TorusGeometry(.24, .06, 5, 10, Math.PI * 1.2)), leather, [0, .5, .02], [1, 1, 1], [Math.PI / 2, 0, -.35], { thickness: 1.035 });
  // Spiky shoulder plates for a more “battle anime” read.
  addPart(torso, geometry('hero-pad-l', () => new THREE.ConeGeometry(.16, .28, 5)), leather, [-.42, .42, 0], [1, 1, 1], [0, 0, .9], { thickness: 1.05 });
  addPart(torso, geometry('hero-pad-r', () => new THREE.ConeGeometry(.16, .28, 5)), leather, [.42, .42, 0], [1, 1, 1], [0, 0, -.9], { thickness: 1.05 });

  const capePivot = new THREE.Group();
  capePivot.position.set(0, .48, -.26);
  torso.add(capePivot);
  const capeShape = new THREE.Shape();
  capeShape.moveTo(-.34, .2); capeShape.lineTo(.34, .2); capeShape.lineTo(.26, -.7); capeShape.lineTo(0, -.88); capeShape.lineTo(-.26, -.7); capeShape.closePath();
  const cape = addPart(capePivot, geometry('hero-cape', () => new THREE.ShapeGeometry(capeShape)), toonMaterial(0x17304f), [0, -.22, 0], [1, 1, 1], [-.1, 0, 0], { thickness: 1.025, castShadow: true });

  const headPivot = new THREE.Group();
  headPivot.name = 'Head';
  headPivot.position.set(0, 1.18, 0);
  torso.add(headPivot);
  // Slightly oversized head for manga proportions.
  const head = addPart(headPivot, geometry('hero-head', () => new THREE.IcosahedronGeometry(.4, 2)), skin, [0, .04, .02], [1, 1.05, .9], [0, 0, 0], { thickness: 1.04 });
  addPart(headPivot, geometry('hero-hair-cap', () => new THREE.SphereGeometry(.42, 12, 8, 0, Math.PI * 2, 0, Math.PI * .58)), hair, [0, .16, -.02], [1.05, .88, .98], [0, 0, 0], { thickness: 1.05 });
  const spikeLayout = [
    [0, .34, 0, .14, .52, 0], [-.16, .28, .06, .11, .44, .4], [.16, .28, .06, .11, .44, -.4],
    [-.22, .18, -.04, .1, .48, .7], [.22, .18, -.04, .1, .48, -.7], [0, .22, -.18, .13, .5, 0],
    [-.1, .12, -.16, .09, .4, .3], [.1, .12, -.16, .09, .4, -.3], [0, .38, .1, .1, .36, 0],
  ];
  for (const [x, y, z, r, h, rz] of spikeLayout) {
    addPart(headPivot, geometry('hero-hair-spike', () => new THREE.ConeGeometry(r, h, 5)), hair, [x, y, z], [1, 1, 1], [.2, 0, rz], { thickness: 1.06 });
  }
  addPart(headPivot, geometry('hero-band', () => new THREE.BoxGeometry(.44, .08, .12)), leather, [0, .06, .3], [1, 1, 1], [0, 0, 0], { thickness: 1.04 });
  addPart(headPivot, geometry('hero-plate', () => new THREE.BoxGeometry(.15, .13, .04)), metal, [0, .06, .36], [1, 1, 1], [0, 0, 0], { thickness: 1.05 });
  // Big expressive eyes.
  addPart(headPivot, geometry('hero-eye-w', () => new THREE.SphereGeometry(.07, 8, 6)), white, [-.13, .04, .36], [1.15, 1.35, .5], [0, 0, 0], { outline: false, castShadow: false });
  addPart(headPivot, geometry('hero-eye-w', () => new THREE.SphereGeometry(.07, 8, 6)), white, [.13, .04, .36], [1.15, 1.35, .5], [0, 0, 0], { outline: false, castShadow: false });
  addPart(headPivot, geometry('hero-eye', () => new THREE.SphereGeometry(.045, 8, 6)), eye, [-.13, .04, .4], [1, 1.2, .55], [0, 0, 0], { outline: false, castShadow: false });
  addPart(headPivot, geometry('hero-eye', () => new THREE.SphereGeometry(.045, 8, 6)), eye, [.13, .04, .4], [1, 1.2, .55], [0, 0, 0], { outline: false, castShadow: false });

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * .46, .44, 0);
    torso.add(arm);
    addPart(arm, geometry('hero-shoulder', () => new THREE.SphereGeometry(.17, 9, 7)), tunicLight, [0, 0, 0], [1.15, .85, 1]);
    addPart(arm, geometry('hero-upper-arm', () => new THREE.CylinderGeometry(.11, .125, .48, 7)), skin, [0, -.25, 0], [1, 1, 1], [0, 0, side * .08]);
    addPart(arm, geometry('hero-bracer', () => new THREE.CylinderGeometry(.125, .105, .28, 7)), leather, [0, -.56, 0], [1, 1, 1]);
    addPart(arm, geometry('hero-hand', () => new THREE.SphereGeometry(.115, 8, 6)), skin, [0, -.73, 0], [1, .9, 1]);
    arms.push(arm);
  }

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * .2, -.13, 0);
    hips.add(leg);
    addPart(leg, geometry('hero-thigh', () => new THREE.CylinderGeometry(.14, .16, .55, 7)), cloth, [0, -.27, 0]);
    addPart(leg, geometry('hero-shin', () => new THREE.CylinderGeometry(.12, .14, .5, 7)), leather, [0, -.72, .01]);
    addPart(leg, geometry('hero-boot', () => new THREE.BoxGeometry(.26, .2, .4)), leather, [0, -1.0, .08], [1, 1, 1], [.05, 0, 0], { thickness: 1.045 });
    legs.push(leg);
  }

  // Mid-length thick blade held in the right hand (~70% of prior length, bulkier).
  const swordPivot = new THREE.Group();
  swordPivot.position.set(.47, -.68, 0);
  arms[1].add(swordPivot);
  swordPivot.rotation.set(-.15, 0, -.12);
  const grip = addPart(swordPivot, geometry('hero-grip', () => new THREE.CylinderGeometry(.05, .058, .48, 7)), leather, [0, -.05, 0], [1, 1, 1]);
  grip.rotation.z = Math.PI / 2;
  const guard = addPart(swordPivot, geometry('hero-guard', () => new THREE.BoxGeometry(.5, .09, .12)), gold, [.28, -.05, 0], [1, 1, 1], [0, 0, 0], { thickness: 1.045 });
  const bladeRoot = new THREE.Group();
  bladeRoot.position.set(.58, -.05, 0);
  swordPivot.add(bladeRoot);
  const blade = addPart(bladeRoot, geometry('hero-blade', () => new THREE.BoxGeometry(1.5, .16, .09)), metal, [.68, 0, 0], [1, 1, 1], [0, 0, 0], { thickness: 1.03 });
  const tip = addPart(bladeRoot, geometry('hero-blade-tip', () => new THREE.ConeGeometry(.15, .32, 4)), metal, [1.52, 0, 0], [1, 1, .75], [0, 0, -Math.PI / 2], { thickness: 1.03 });
  const rune = addPart(bladeRoot, geometry('hero-rune', () => new THREE.BoxGeometry(.65, .03, .1)), gold, [.65, .015, .055], [1, 1, 1], [0, 0, 0], { outline: false, castShadow: false });

  group.scale.setScalar(1.03);
  return {
    group, rig, hips, torso, headPivot, head, capePivot, cape, arms, legs, swordPivot,
    bladeRoot, blade, tip, rune, weaponMaterials: { blade: metal, rune: gold },
  };
}

export function updateHeroWeapon(refs, item) {
  const model = item?.model ?? 'sword';
  const color = item?.color ?? 0xd9e4e8;
  const rarityColor = item?.rarityColor ?? color;
  refs.blade.material.color.setHex(color);
  refs.blade.material.emissive.setHex(rarityColor);
  refs.blade.material.emissiveIntensity = item?.rarity === 'legendary' ? .36 : item?.rarity === 'epic' ? .2 : .06;
  refs.tip.material = refs.blade.material;
  refs.rune.material.color.setHex(rarityColor);
  refs.rune.material.emissive.setHex(rarityColor);
  refs.rune.material.emissiveIntensity = item?.rarity === 'legendary' ? .75 : .22;
  // Thicker mid-length scales for the procedural blade base mesh.
  const scales = {
    sword: [1.0, 1.2, 1.2], saber: [.95, .95, .95], greatsword: [1.12, 1.45, 1.35],
    leaf: [.98, 1.15, 1.05], katana: [1.05, 1.15, 1.15], relic: [1.05, 1.25, 1.15],
  };
  const [sx, sy, sz] = scales[model] ?? scales.sword;
  refs.blade.scale.set(sx, sy, sz);
  refs.tip.scale.set(sy, sx, sz);
  refs.bladeRoot.rotation.x = model === 'saber' ? -.08 : model === 'katana' ? .06 : 0;
}

function addEyes(parent, palette, y, z, spacing = .16, size = .06, angry = false) {
  for (const side of [-1, 1]) {
    const eye = addPart(
      parent,
      geometry('enemy-eye', () => new THREE.SphereGeometry(1, 8, 6)),
      palette.eye,
      [side * spacing, y + (angry ? side * .015 : 0), z],
      [size * (angry ? 1.25 : 1), size * (angry ? .65 : 1), size * .55],
      [0, 0, angry ? side * .18 : 0],
      { outline: false, castShadow: false },
    );
    eye.renderOrder = 4;
  }
}

function buildBlob(rig, p, refs) {
  refs.body = addPart(rig, geometry('blob-body', () => new THREE.SphereGeometry(.72, 12, 9)), p.body, [0, .72, 0], [1.08, .9, 1.02], [0, 0, 0], { thickness: 1.045 });
  addPart(rig, geometry('blob-cap', () => new THREE.SphereGeometry(.48, 10, 7, 0, Math.PI * 2, 0, Math.PI * .55)), p.accent, [0, 1.08, -.03], [1, .7, 1], [0, 0, 0], { thickness: 1.04 });
  for (let i = -1; i <= 1; i += 1) addPart(rig, geometry('blob-spike', () => new THREE.ConeGeometry(.12, .35, 5)), p.accent, [i * .27, 1.27 - Math.abs(i) * .05, -.02], [1, 1, 1], [0, 0, i * .16], { thickness: 1.06 });
  addEyes(rig, p, .82, .64, .18, .075);
  addPlain(rig, geometry('blob-mouth', () => new THREE.TorusGeometry(.09, .016, 5, 12, Math.PI)), new THREE.MeshBasicMaterial({ color: 0x321e2b }), [0, .65, .65], [1, .72, 1], [0, 0, Math.PI]);
}

function buildHare(rig, p, refs) {
  refs.body = addPart(rig, geometry('hare-body', () => new THREE.SphereGeometry(.55, 10, 8)), p.body, [0, .68, -.06], [1, .92, 1.25]);
  const head = addPart(rig, geometry('hare-head', () => new THREE.SphereGeometry(.42, 10, 8)), p.light, [0, 1.22, .2], [1, 1, .92]);
  refs.head = head;
  for (const side of [-1, 1]) {
    addPart(rig, geometry('hare-ear', () => new THREE.ConeGeometry(.17, .75, 6)), p.body, [side * .2, 1.85, .11], [1, 1, .72], [side * .08, 0, side * .08], { thickness: 1.05 });
    addPart(rig, geometry('hare-foot', () => new THREE.SphereGeometry(.22, 8, 6)), p.dark, [side * .31, .22, .08], [1.3, .65, 1.65]);
  }
  addPart(rig, geometry('hare-horn', () => new THREE.ConeGeometry(.095, .55, 6)), p.accent, [0, 1.68, .28], [1, 1, 1], [-.25, 0, 0]);
  addEyes(rig, p, 1.3, .58, .15, .055, true);
  addPart(rig, geometry('hare-tail', () => new THREE.SphereGeometry(.2, 8, 6)), p.white, [0, .73, -.68], [1, 1, 1]);
}

function buildBoar(rig, p, refs) {
  refs.body = addPart(rig, geometry('boar-body', () => new THREE.SphereGeometry(.66, 11, 8)), p.body, [0, .78, 0], [1.05, .86, 1.46]);
  const head = addPart(rig, geometry('boar-head', () => new THREE.SphereGeometry(.48, 10, 8)), p.dark, [0, .88, .78], [1.05, .92, 1.08]);
  refs.head = head;
  addPart(rig, geometry('boar-snout', () => new THREE.CylinderGeometry(.23, .29, .34, 8)), p.light, [0, .76, 1.18], [1, 1, 1], [Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * .42, .32, side < 0 ? -.35 : .35);
    rig.add(leg);
    addPart(leg, geometry('boar-leg', () => new THREE.CylinderGeometry(.13, .16, .55, 7)), p.dark, [0, 0, 0]);
    refs.legs.push(leg);
    coneBetween(rig, [side * .28, .78, 1.2], [side * .45, .55, 1.34], .09, p.white, { segments: 6 });
    addPart(rig, geometry('boar-ear', () => new THREE.ConeGeometry(.16, .34, 5)), p.body, [side * .28, 1.25, .82], [1, 1, .75], [.05, 0, side * .35]);
  }
  for (let i = -2; i <= 2; i += 1) addPart(rig, geometry('boar-mane', () => new THREE.ConeGeometry(.12, .35, 5)), p.accent, [0, 1.33 - Math.abs(i) * .07, -.45 + i * .24], [1, 1, 1], [Math.PI / 2, 0, 0]);
  addEyes(rig, p, .98, 1.18, .2, .055, true);
}

function buildWisp(rig, p, refs) {
  refs.body = addPart(rig, geometry('wisp-core', () => new THREE.IcosahedronGeometry(.42, 2)), p.accent, [0, 1.05, 0], [1, 1, 1], [0, 0, 0], { thickness: 1.055 });
  const halo = addPlain(rig, geometry('wisp-halo', () => new THREE.TorusGeometry(.72, .035, 6, 24)), new THREE.MeshBasicMaterial({ color: p.accent.color, transparent: true, opacity: .65, depthWrite: false }), [0, 1.05, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  refs.orbits.push(halo);
  const halo2 = addPlain(rig, geometry('wisp-halo-small', () => new THREE.TorusGeometry(.52, .026, 6, 20)), new THREE.MeshBasicMaterial({ color: p.light.color, transparent: true, opacity: .55, depthWrite: false }), [0, 1.05, 0], [1, 1, 1], [.5, .3, 0]);
  refs.orbits.push(halo2);
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2;
    coneBetween(rig, [Math.cos(angle) * .22, .75, Math.sin(angle) * .22], [Math.cos(angle) * .36, .12, Math.sin(angle) * .36], .1, p.body, { segments: 6 });
  }
  addEyes(rig, p, 1.1, .39, .14, .052);
  const glow = new THREE.Sprite(spriteMaterial(p.accent.color.getHex(), .7));
  glow.scale.set(1.9, 1.9, 1);
  glow.position.y = 1.05;
  rig.add(glow);
  refs.glow = glow;
}

function buildRaider(rig, p, refs) {
  const torso = addPart(rig, geometry('raider-torso', () => new THREE.CylinderGeometry(.42, .48, .82, 7)), p.body, [0, 1.05, 0], [1, 1, .82]);
  refs.body = torso;
  const head = addPart(rig, geometry('raider-head', () => new THREE.SphereGeometry(.34, 9, 7)), p.light, [0, 1.66, .02], [1, 1.05, .92]);
  refs.head = head;
  addPart(rig, geometry('raider-mask', () => new THREE.BoxGeometry(.54, .29, .1)), p.dark, [0, 1.69, .3], [1, 1, 1], [0, 0, 0], { thickness: 1.04 });
  addEyes(rig, p, 1.72, .37, .14, .042, true);
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .5, 1.26, 0); rig.add(arm);
    addPart(arm, geometry('raider-arm', () => new THREE.CylinderGeometry(.12, .14, .65, 7)), p.light, [0, -.28, 0], [1, 1, 1], [0, 0, side * .12]);
    refs.arms.push(arm);
    const leg = new THREE.Group(); leg.position.set(side * .23, .65, 0); rig.add(leg);
    addPart(leg, geometry('raider-leg', () => new THREE.CylinderGeometry(.15, .18, .72, 7)), p.dark, [0, -.34, 0]);
    addPart(leg, geometry('raider-foot', () => new THREE.BoxGeometry(.28, .18, .42)), p.dark, [0, -.71, .1], [1, 1, 1], [.05, 0, 0]);
    refs.legs.push(leg);
  }
  const weaponPivot = new THREE.Group(); weaponPivot.position.set(.62, .97, .05); rig.add(weaponPivot); refs.weapon = weaponPivot;
  cylinderBetween(weaponPivot, [0, 0, 0], [.05, -.2, .95], .075, p.dark, { segments: 7 });
  addPart(weaponPivot, geometry('raider-club-head', () => new THREE.DodecahedronGeometry(.23, 0)), p.accent, [.05, -.22, 1.02], [1, 1.2, 1]);
  for (const side of [-1, 1]) addPart(rig, geometry('raider-ear', () => new THREE.ConeGeometry(.09, .28, 5)), p.light, [side * .36, 1.7, .02], [1, 1, .72], [0, 0, side * .75]);
}

function buildBeetle(rig, p, refs) {
  refs.body = addPart(rig, geometry('beetle-shell', () => new THREE.SphereGeometry(.63, 10, 8)), p.body, [0, .65, 0], [1, .72, 1.25]);
  addPart(rig, geometry('beetle-shell-line', () => new THREE.BoxGeometry(.07, .08, 1.1)), p.accent, [0, .85, -.05], [1, 1, 1], [0, 0, 0], { thickness: 1.04 });
  const head = addPart(rig, geometry('beetle-head', () => new THREE.SphereGeometry(.37, 9, 7)), p.dark, [0, .57, .72], [1, .8, 1.05]); refs.head = head;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const z = -.45 + i * .43;
      cylinderBetween(rig, [side * .45, .58, z], [side * .95, .19, z + (i - 1) * .12], .055, p.dark, { segments: 6 });
    }
    coneBetween(rig, [side * .12, .62, .98], [side * .22, .42, 1.36], .095, p.accent, { segments: 6 });
  }
  addEyes(rig, p, .65, 1.03, .15, .05, true);
}

function buildWolf(rig, p, refs) {
  refs.body = addPart(rig, geometry('wolf-body', () => new THREE.SphereGeometry(.58, 10, 8)), p.body, [0, .83, -.05], [1, .72, 1.45]);
  addPart(rig, geometry('wolf-chest', () => new THREE.SphereGeometry(.46, 10, 8)), p.light, [0, .84, .53], [1, .92, 1]);
  const head = addPart(rig, geometry('wolf-head', () => new THREE.SphereGeometry(.42, 10, 8)), p.dark, [0, 1.15, .88], [1, .92, 1.02]); refs.head = head;
  addPart(rig, geometry('wolf-muzzle', () => new THREE.CylinderGeometry(.18, .24, .42, 7)), p.light, [0, 1.02, 1.25], [1, 1, 1], [Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) {
    addPart(rig, geometry('wolf-ear', () => new THREE.ConeGeometry(.16, .42, 5)), p.body, [side * .25, 1.54, .8], [1, 1, .75], [0, 0, side * .12]);
    for (const z of [-.36, .48]) {
      const leg = new THREE.Group(); leg.position.set(side * .36, .48, z); rig.add(leg);
      addPart(leg, geometry('wolf-leg', () => new THREE.CylinderGeometry(.1, .13, .62, 6)), p.dark, [0, -.22, 0], [1, 1, 1], [z > 0 ? -.08 : .08, 0, 0]);
      refs.legs.push(leg);
    }
  }
  coneBetween(rig, [0, .92, -.72], [.12, 1.22, -1.46], .19, p.body, { segments: 7 });
  addEyes(rig, p, 1.21, 1.22, .15, .052, true);
}

function buildPlant(rig, p, refs) {
  refs.body = addPart(rig, geometry('plant-bulb', () => new THREE.SphereGeometry(.5, 10, 8)), p.body, [0, .72, 0], [1, 1.08, 1]);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const petal = addPart(rig, geometry('plant-petal', () => new THREE.SphereGeometry(.26, 8, 6)), p.accent, [Math.sin(angle) * .42, 1.15, Math.cos(angle) * .42], [1, .45, 1.5], [angle * .3, angle, 0]);
    refs.petals.push(petal);
  }
  const mouth = addPart(rig, geometry('plant-mouth', () => new THREE.CylinderGeometry(.28, .4, .4, 8)), p.dark, [0, 1.14, .08], [1, 1, 1], [0, 0, 0]); refs.head = mouth;
  addEyes(rig, p, 1.28, .38, .14, .05, true);
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + .4;
    coneBetween(rig, [0, .42, 0], [Math.cos(angle) * .55, .02, Math.sin(angle) * .55], .12, p.dark, { segments: 6 });
  }
}

function buildGolem(rig, p, refs) {
  refs.body = addPart(rig, geometry('golem-torso', () => new THREE.DodecahedronGeometry(.68, 0)), p.body, [0, 1.13, 0], [1.1, 1.18, .9], [0, .2, 0], { thickness: 1.055 });
  const core = addPart(rig, geometry('golem-core', () => new THREE.OctahedronGeometry(.22, 0)), p.accent, [0, 1.15, .62], [1, 1.3, .65], [0, 0, 0], { thickness: 1.07 }); refs.core = core;
  const head = addPart(rig, geometry('golem-head', () => new THREE.DodecahedronGeometry(.42, 0)), p.dark, [0, 1.85, .03], [1, .82, .88]); refs.head = head;
  addEyes(rig, p, 1.9, .37, .13, .048, true);
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .72, 1.35, 0); rig.add(arm);
    addPart(arm, geometry('golem-shoulder', () => new THREE.DodecahedronGeometry(.35, 0)), p.dark, [0, 0, 0]);
    addPart(arm, geometry('golem-fist', () => new THREE.DodecahedronGeometry(.4, 0)), p.body, [side * .1, -.68, .04], [1.15, 1.25, 1]);
    refs.arms.push(arm);
    const leg = new THREE.Group(); leg.position.set(side * .35, .65, 0); rig.add(leg);
    addPart(leg, geometry('golem-leg', () => new THREE.DodecahedronGeometry(.36, 0)), p.dark, [0, -.25, 0], [1, 1.35, 1]);
    refs.legs.push(leg);
  }
}

function buildShaman(rig, p, refs) {
  refs.body = addPart(rig, geometry('shaman-robe', () => new THREE.ConeGeometry(.58, 1.25, 8)), p.body, [0, .75, 0], [1, 1, .86], [0, 0, 0], { thickness: 1.045 });
  const head = addPart(rig, geometry('shaman-mask', () => new THREE.CylinderGeometry(.31, .4, .48, 6)), p.light, [0, 1.55, .05], [1, 1, .72], [Math.PI / 2, 0, 0]); refs.head = head;
  addPart(rig, geometry('shaman-mask-mark', () => new THREE.BoxGeometry(.09, .34, .05)), p.accent, [0, 1.55, .39], [1, 1, 1], [0, 0, .25], { outline: false });
  addEyes(rig, p, 1.57, .41, .15, .045, true);
  for (const side of [-1, 1]) {
    addPart(rig, geometry('shaman-horn', () => new THREE.ConeGeometry(.09, .52, 5)), p.dark, [side * .28, 1.94, .02], [1, 1, 1], [0, 0, side * .45]);
    const orb = new THREE.Sprite(spriteMaterial(p.accent.color.getHex(), .8));
    orb.scale.set(.55, .55, 1);
    orb.position.set(side * .68, 1.24, .05);
    rig.add(orb); refs.orbs.push(orb);
  }
  const staff = new THREE.Group(); staff.position.set(.58, 1.14, 0); rig.add(staff); refs.weapon = staff;
  cylinderBetween(staff, [0, .2, 0], [.1, -1.0, .06], .065, p.dark, { segments: 7 });
  addPart(staff, geometry('shaman-staff-gem', () => new THREE.OctahedronGeometry(.2, 0)), p.accent, [0, .3, 0], [1, 1.4, 1]);
}

function buildHarpy(rig, p, refs) {
  refs.body = addPart(rig, geometry('harpy-body', () => new THREE.SphereGeometry(.45, 10, 8)), p.body, [0, 1.06, 0], [1, 1.25, .84]);
  const head = addPart(rig, geometry('harpy-head', () => new THREE.SphereGeometry(.31, 9, 7)), p.light, [0, 1.62, .18], [1, 1, .9]); refs.head = head;
  coneBetween(rig, [0, 1.59, .43], [0, 1.5, .72], .12, p.accent, { segments: 5 });
  addEyes(rig, p, 1.7, .43, .115, .043, true);
  for (const side of [-1, 1]) {
    const wing = new THREE.Group(); wing.position.set(side * .38, 1.22, -.02); rig.add(wing);
    for (let i = 0; i < 4; i += 1) {
      const feather = addPart(wing, geometry('harpy-feather', () => new THREE.ConeGeometry(.18, .95, 5)), i % 2 ? p.body : p.accent, [side * (.2 + i * .16), -.1 - i * .08, -.05], [1, 1, .55], [0, 0, side * (-.78 + i * .09)], { thickness: 1.04 });
      refs.feathers.push(feather);
    }
    refs.wings.push(wing);
    const leg = new THREE.Group(); leg.position.set(side * .18, .72, .02); rig.add(leg);
    addPart(leg, geometry('harpy-leg', () => new THREE.CylinderGeometry(.065, .09, .55, 6)), p.dark, [0, -.24, 0]);
    for (let c = -1; c <= 1; c += 1) coneBetween(leg, [0, -.51, .05], [c * .12, -.62, .26], .026, p.accent, { segments: 5, outline: false });
    refs.legs.push(leg);
  }
  addPart(rig, geometry('harpy-crest', () => new THREE.ConeGeometry(.12, .5, 5)), p.accent, [0, 1.98, -.02], [1, 1, 1], [.2, 0, 0]);
}

function buildStag(rig, p, refs) {
  refs.body = addPart(rig, geometry('stag-body', () => new THREE.SphereGeometry(.7, 11, 8)), p.body, [0, .95, -.15], [1, .9, 1.5]);
  const neck = addPart(rig, geometry('stag-neck', () => new THREE.CylinderGeometry(.27, .38, 1.05, 8)), p.light, [0, 1.45, .62], [1, 1, 1], [-.38, 0, 0]);
  const head = addPart(rig, geometry('stag-head', () => new THREE.SphereGeometry(.4, 10, 8)), p.dark, [0, 2.0, .95], [1, .88, 1.2]); refs.head = head;
  addPart(rig, geometry('stag-muzzle', () => new THREE.CylinderGeometry(.16, .22, .45, 7)), p.light, [0, 1.9, 1.32], [1, 1, 1], [Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) {
    for (const z of [-.55, .42]) {
      const leg = new THREE.Group(); leg.position.set(side * .43, .55, z); rig.add(leg);
      addPart(leg, geometry('stag-leg', () => new THREE.CylinderGeometry(.1, .14, .92, 7)), p.dark, [0, -.36, 0], [1, 1, 1], [z > 0 ? -.08 : .08, 0, 0]);
      refs.legs.push(leg);
    }
    const antler = new THREE.Group(); antler.position.set(side * .25, 2.28, .87); rig.add(antler);
    cylinderBetween(antler, [0, 0, 0], [side * .25, .55, -.05], .055, p.accent, { segments: 6 });
    cylinderBetween(antler, [side * .18, .37, -.03], [side * .5, .66, .08], .045, p.accent, { segments: 6 });
    cylinderBetween(antler, [side * .24, .48, -.04], [side * .18, .85, -.18], .045, p.accent, { segments: 6 });
    refs.horns.push(antler);
    addPart(rig, geometry('stag-ear', () => new THREE.ConeGeometry(.13, .38, 5)), p.body, [side * .36, 2.1, .88], [1, 1, .7], [0, 0, side * .65]);
  }
  addEyes(rig, p, 2.05, 1.27, .15, .05, true);
  coneBetween(rig, [0, 1.05, -.87], [0, 1.26, -1.25], .16, p.light, { segments: 6 });
}

function buildCrab(rig, p, refs) {
  refs.body = addPart(rig, geometry('crab-shell', () => new THREE.SphereGeometry(.7, 11, 8)), p.body, [0, .62, 0], [1.25, .56, 1]);
  addPart(rig, geometry('crab-shell-top', () => new THREE.SphereGeometry(.55, 10, 7, 0, Math.PI * 2, 0, Math.PI * .52)), p.accent, [0, .82, -.02], [1.25, .56, 1]);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const z = -.42 + i * .42;
      cylinderBetween(rig, [side * .55, .5, z], [side * (1.0 + i * .08), .15, z + (i - 1) * .18], .065, p.dark, { segments: 6 });
    }
    const claw = new THREE.Group(); claw.position.set(side * .78, .73, .48); rig.add(claw); refs.arms.push(claw);
    cylinderBetween(claw, [0, 0, 0], [side * .42, .05, .35], .11, p.dark, { segments: 7 });
    addPart(claw, geometry('crab-claw', () => new THREE.SphereGeometry(.27, 8, 6)), p.body, [side * .54, .05, .45], [1.25, .78, 1]);
    coneBetween(claw, [side * .55, .05, .51], [side * .8, .12, .74], .12, p.accent, { segments: 6 });
  }
  addEyes(rig, p, .9, .51, .25, .06, true);
}

function buildRaptor(rig, p, refs) {
  refs.body = addPart(rig, geometry('raptor-body', () => new THREE.SphereGeometry(.55, 10, 8)), p.body, [0, .9, -.05], [1, .92, 1.48]);
  const neck = addPart(rig, geometry('raptor-neck', () => new THREE.CylinderGeometry(.18, .28, .72, 7)), p.light, [0, 1.2, .68], [1, 1, 1], [-.55, 0, 0]);
  const head = addPart(rig, geometry('raptor-head', () => new THREE.SphereGeometry(.36, 9, 7)), p.dark, [0, 1.5, 1.0], [1, .78, 1.35]); refs.head = head;
  coneBetween(rig, [0, 1.48, 1.25], [0, 1.42, 1.68], .2, p.light, { segments: 6 });
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * .34, .62, -.02); rig.add(leg);
    addPart(leg, geometry('raptor-thigh', () => new THREE.SphereGeometry(.25, 8, 6)), p.body, [0, 0, 0], [1, 1.25, 1]);
    cylinderBetween(leg, [0, -.12, 0], [side * .03, -.66, .18], .09, p.dark, { segments: 6 });
    coneBetween(leg, [side * .02, -.64, .18], [side * .1, -.75, .6], .06, p.accent, { segments: 5 });
    refs.legs.push(leg);
    const arm = new THREE.Group(); arm.position.set(side * .33, 1.18, .58); rig.add(arm);
    cylinderBetween(arm, [0, 0, 0], [side * .18, -.28, .2], .055, p.light, { segments: 6 }); refs.arms.push(arm);
  }
  const tail = new THREE.Group(); tail.position.set(0, .93, -.78); rig.add(tail); refs.tail = tail;
  coneBetween(tail, [0, 0, 0], [0, .08, -1.58], .3, p.body, { segments: 7 });
  for (let i = 0; i < 4; i += 1) addPart(rig, geometry('raptor-spine', () => new THREE.ConeGeometry(.08, .28, 5)), p.accent, [0, 1.42 - i * .08, .6 - i * .42], [1, 1, 1], [Math.PI / 2, 0, 0]);
  addEyes(rig, p, 1.57, 1.34, .14, .047, true);
}

function buildCyclops(rig, p, refs) {
  refs.body = addPart(rig, geometry('cyclops-body', () => new THREE.SphereGeometry(.7, 11, 8)), p.body, [0, 1.2, 0], [1.05, 1.22, .9]);
  const head = addPart(rig, geometry('cyclops-head', () => new THREE.SphereGeometry(.48, 10, 8)), p.light, [0, 2.05, .08], [1, 1.03, .9]); refs.head = head;
  const eyeWhite = addPart(rig, geometry('cyclops-eye-white', () => new THREE.SphereGeometry(.18, 9, 7)), p.white, [0, 2.1, .47], [1.3, .88, .48], [0, 0, 0], { outline: false });
  addPart(rig, geometry('cyclops-pupil', () => new THREE.SphereGeometry(.075, 8, 6)), p.eye, [0, 2.1, .56], [1, 1.2, .45], [0, 0, 0], { outline: false });
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .72, 1.53, 0); rig.add(arm);
    addPart(arm, geometry('cyclops-arm', () => new THREE.CylinderGeometry(.18, .25, 1.0, 7)), p.light, [0, -.44, 0], [1, 1, 1], [0, 0, side * .18]);
    addPart(arm, geometry('cyclops-fist', () => new THREE.SphereGeometry(.26, 8, 6)), p.dark, [side * .08, -.96, .04], [1.15, 1, 1]);
    refs.arms.push(arm);
    const leg = new THREE.Group(); leg.position.set(side * .4, .65, 0); rig.add(leg);
    addPart(leg, geometry('cyclops-leg', () => new THREE.CylinderGeometry(.2, .27, .9, 7)), p.dark, [0, -.34, 0]); refs.legs.push(leg);
  }
  const club = new THREE.Group(); club.position.set(.86, 1.32, .05); rig.add(club); refs.weapon = club;
  cylinderBetween(club, [0, .2, 0], [.1, -.85, .18], .11, p.dark, { segments: 7 });
  addPart(club, geometry('cyclops-club', () => new THREE.DodecahedronGeometry(.38, 0)), p.accent, [.12, -.95, .2], [1, 1.35, 1]);
  addPart(rig, geometry('cyclops-horn', () => new THREE.ConeGeometry(.1, .45, 5)), p.accent, [0, 2.55, .02], [1, 1, 1], [0, 0, 0]);
}

function buildScorpion(rig, p, refs) {
  refs.body = addPart(rig, geometry('scorpion-body', () => new THREE.SphereGeometry(.65, 10, 8)), p.body, [0, .55, 0], [1.2, .6, 1.35]);
  const head = addPart(rig, geometry('scorpion-head', () => new THREE.SphereGeometry(.38, 9, 7)), p.dark, [0, .52, .82], [1.1, .72, 1]); refs.head = head;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      const z = -.55 + i * .38;
      cylinderBetween(rig, [side * .48, .48, z], [side * (1.05 + i * .05), .1, z + (i - 1.5) * .16], .055, p.dark, { segments: 6 });
    }
    const claw = new THREE.Group(); claw.position.set(side * .78, .61, .72); rig.add(claw); refs.arms.push(claw);
    cylinderBetween(claw, [0, 0, 0], [side * .45, .02, .38], .1, p.body, { segments: 7 });
    addPart(claw, geometry('scorpion-claw', () => new THREE.SphereGeometry(.26, 8, 6)), p.accent, [side * .56, .03, .5], [1.3, .75, 1]);
  }
  const tail = new THREE.Group(); tail.position.set(0, .62, -.76); rig.add(tail); refs.tail = tail;
  let last = new THREE.Vector3(0, 0, 0);
  for (let i = 1; i <= 5; i += 1) {
    const next = new THREE.Vector3(Math.sin(i * .45) * .08, i * .25, -.15 * i + i * i * .035);
    cylinderBetween(tail, [last.x, last.y, last.z], [next.x, next.y, next.z], .18 - i * .02, i % 2 ? p.body : p.dark, { segments: 7 });
    last = next;
  }
  coneBetween(tail, [last.x, last.y, last.z], [0, last.y + .36, last.z + .28], .16, p.accent, { segments: 6 });
  addEyes(rig, p, .64, 1.12, .15, .045, true);
}

function buildKnight(rig, p, refs) {
  refs.body = addPart(rig, geometry('knight-torso', () => new THREE.CylinderGeometry(.45, .52, .92, 8)), p.metal, [0, 1.1, 0], [1, 1, .86]);
  addPart(rig, geometry('knight-chest', () => new THREE.BoxGeometry(.62, .64, .13)), p.body, [0, 1.16, .37], [1, 1, 1], [0, 0, 0], { thickness: 1.035 });
  const head = addPart(rig, geometry('knight-helm', () => new THREE.SphereGeometry(.39, 10, 8)), p.metal, [0, 1.78, 0], [1, 1.05, .9]); refs.head = head;
  addPart(rig, geometry('knight-visor', () => new THREE.BoxGeometry(.58, .22, .12)), p.dark, [0, 1.78, .34], [1, 1, 1], [0, 0, 0], { thickness: 1.04 });
  for (let i = -2; i <= 2; i += 1) addPart(rig, geometry('knight-slot', () => new THREE.BoxGeometry(.035, .08, .03)), p.accent, [i * .1, 1.79, .412], [1, 1, 1], [0, 0, 0], { outline: false });
  addPart(rig, geometry('knight-plume', () => new THREE.ConeGeometry(.13, .68, 6)), p.accent, [0, 2.33, -.02], [1, 1, .7], [.15, 0, 0]);
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .55, 1.4, 0); rig.add(arm);
    addPart(arm, geometry('knight-shoulder', () => new THREE.SphereGeometry(.22, 8, 6)), p.body, [0, 0, 0], [1.2, .8, 1]);
    addPart(arm, geometry('knight-arm', () => new THREE.CylinderGeometry(.12, .15, .65, 7)), p.metal, [0, -.3, 0]); refs.arms.push(arm);
    const leg = new THREE.Group(); leg.position.set(side * .24, .65, 0); rig.add(leg);
    addPart(leg, geometry('knight-leg', () => new THREE.CylinderGeometry(.16, .19, .75, 7)), p.dark, [0, -.34, 0]);
    addPart(leg, geometry('knight-boot', () => new THREE.BoxGeometry(.3, .2, .43)), p.metal, [0, -.74, .08], [1, 1, 1], [.04, 0, 0]); refs.legs.push(leg);
  }
  const weapon = new THREE.Group(); weapon.position.set(.67, 1.14, .02); rig.add(weapon); refs.weapon = weapon;
  addPart(weapon, geometry('knight-sword', () => new THREE.BoxGeometry(.11, 1.28, .08)), p.accent, [0, -.38, .08], [1, 1, 1], [.2, 0, -.15]);
  addPart(weapon, geometry('knight-guard', () => new THREE.BoxGeometry(.5, .08, .1)), p.dark, [0, .16, 0]);
  const shield = new THREE.Group(); shield.position.set(-.7, 1.12, .08); rig.add(shield); refs.shield = shield;
  addPart(shield, geometry('knight-shield', () => new THREE.CylinderGeometry(.42, .42, .12, 6)), p.body, [0, 0, 0], [1, 1.18, 1], [Math.PI / 2, 0, 0]);
  addPart(shield, geometry('knight-shield-core', () => new THREE.OctahedronGeometry(.16, 0)), p.accent, [0, 0, .11], [1, 1.2, .55], [0, 0, 0], { thickness: 1.05 });
}

function buildImp(rig, p, refs) {
  refs.body = addPart(rig, geometry('imp-body', () => new THREE.SphereGeometry(.42, 9, 7)), p.body, [0, 1.02, 0], [1, 1.15, .85]);
  const head = addPart(rig, geometry('imp-head', () => new THREE.SphereGeometry(.36, 9, 7)), p.light, [0, 1.55, .15], [1, 1, .9]); refs.head = head;
  for (const side of [-1, 1]) {
    addPart(rig, geometry('imp-horn', () => new THREE.ConeGeometry(.1, .6, 5)), p.accent, [side * .24, 1.98, .08], [1, 1, 1], [.12, 0, side * .35]);
    const wing = new THREE.Group(); wing.position.set(side * .33, 1.28, -.18); rig.add(wing);
    for (let i = 0; i < 3; i += 1) addPart(wing, geometry('imp-wing', () => new THREE.ConeGeometry(.18, .76, 4)), p.dark, [side * (.22 + i * .13), -.08 - i * .08, -.1], [1, 1, .45], [0, 0, side * (-.85 + i * .08)]);
    refs.wings.push(wing);
    const arm = new THREE.Group(); arm.position.set(side * .42, 1.2, .08); rig.add(arm);
    cylinderBetween(arm, [0, 0, 0], [side * .18, -.35, .2], .07, p.light, { segments: 6 }); refs.arms.push(arm);
  }
  addEyes(rig, p, 1.6, .47, .13, .052, true);
  const tail = new THREE.Group(); tail.position.set(0, .92, -.34); rig.add(tail); refs.tail = tail;
  cylinderBetween(tail, [0, 0, 0], [.2, -.25, -.65], .07, p.dark, { segments: 6 });
  cylinderBetween(tail, [.2, -.25, -.65], [-.05, -.05, -1.0], .055, p.dark, { segments: 6 });
  coneBetween(tail, [-.05, -.05, -1.0], [-.05, .1, -1.28], .11, p.accent, { segments: 5 });
}

function buildLizard(rig, p, refs) {
  refs.body = addPart(rig, geometry('lizard-body', () => new THREE.SphereGeometry(.58, 10, 8)), p.body, [0, .64, -.05], [1, .7, 1.55]);
  const head = addPart(rig, geometry('lizard-head', () => new THREE.SphereGeometry(.4, 9, 7)), p.dark, [0, .68, .88], [1, .72, 1.25]); refs.head = head;
  coneBetween(rig, [0, .66, 1.08], [0, .61, 1.52], .22, p.light, { segments: 6 });
  for (const side of [-1, 1]) {
    for (const z of [-.38, .42]) {
      const leg = new THREE.Group(); leg.position.set(side * .4, .47, z); rig.add(leg);
      cylinderBetween(leg, [0, 0, 0], [side * .35, -.28, .18], .09, p.dark, { segments: 6 });
      coneBetween(leg, [side * .35, -.28, .18], [side * .52, -.34, .45], .055, p.accent, { segments: 5 }); refs.legs.push(leg);
    }
  }
  const tail = new THREE.Group(); tail.position.set(0, .64, -.8); rig.add(tail); refs.tail = tail;
  coneBetween(tail, [0, 0, 0], [.08, .02, -1.55], .27, p.body, { segments: 7 });
  for (let i = 0; i < 6; i += 1) addPart(rig, geometry('lizard-spike', () => new THREE.ConeGeometry(.08, .3, 5)), p.accent, [0, .96 - i * .035, .45 - i * .34], [1, 1, 1], [Math.PI / 2, 0, 0]);
  addEyes(rig, p, .76, 1.23, .15, .045, true);
}

function buildPanther(rig, p, refs) {
  refs.body = addPart(rig, geometry('panther-body', () => new THREE.SphereGeometry(.58, 11, 8)), p.body, [0, .78, -.08], [1, .68, 1.62]);
  addPart(rig, geometry('panther-chest', () => new THREE.SphereGeometry(.4, 9, 7)), p.accent, [0, .82, .58], [1, .9, 1]);
  const head = addPart(rig, geometry('panther-head', () => new THREE.SphereGeometry(.4, 10, 8)), p.dark, [0, 1.05, .93], [1, .85, 1.05]); refs.head = head;
  addPart(rig, geometry('panther-muzzle', () => new THREE.SphereGeometry(.22, 8, 6)), p.light, [0, .94, 1.26], [1.2, .65, 1]);
  for (const side of [-1, 1]) {
    addPart(rig, geometry('panther-ear', () => new THREE.ConeGeometry(.13, .36, 5)), p.body, [side * .25, 1.37, .9], [1, 1, .7]);
    for (const z of [-.45, .43]) {
      const leg = new THREE.Group(); leg.position.set(side * .34, .43, z); rig.add(leg);
      addPart(leg, geometry('panther-leg', () => new THREE.CylinderGeometry(.09, .13, .65, 6)), p.dark, [0, -.22, 0], [1, 1, 1], [z > 0 ? -.1 : .08, 0, 0]); refs.legs.push(leg);
    }
  }
  const tail = new THREE.Group(); tail.position.set(0, .82, -.88); rig.add(tail); refs.tail = tail;
  cylinderBetween(tail, [0, 0, 0], [.18, .15, -.82], .09, p.body, { segments: 7 });
  cylinderBetween(tail, [.18, .15, -.82], [-.12, .42, -1.42], .07, p.accent, { segments: 7 });
  addEyes(rig, p, 1.1, 1.29, .15, .052, true);
}

function buildColossus(rig, p, refs) {
  refs.body = addPart(rig, geometry('colossus-torso', () => new THREE.DodecahedronGeometry(.82, 0)), p.body, [0, 1.38, 0], [1.15, 1.3, .9], [0, .18, 0], { thickness: 1.06 });
  addPart(rig, geometry('colossus-chest-rock', () => new THREE.DodecahedronGeometry(.45, 0)), p.dark, [0, 1.52, .62], [1.1, .8, .55]);
  const core = addPart(rig, geometry('colossus-core', () => new THREE.IcosahedronGeometry(.28, 1)), p.accent, [0, 1.45, .88], [1, 1.25, .6], [0, 0, 0], { thickness: 1.06 }); refs.core = core;
  const head = addPart(rig, geometry('colossus-head', () => new THREE.DodecahedronGeometry(.48, 0)), p.dark, [0, 2.35, .02], [1.1, .82, .9]); refs.head = head;
  addEyes(rig, p, 2.39, .43, .16, .058, true);
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .98, 1.72, 0); rig.add(arm);
    addPart(arm, geometry('colossus-shoulder', () => new THREE.DodecahedronGeometry(.46, 0)), p.dark, [0, 0, 0]);
    cylinderBetween(arm, [0, -.15, 0], [side * .12, -.85, .08], .25, p.body, { segments: 7 });
    addPart(arm, geometry('colossus-fist', () => new THREE.DodecahedronGeometry(.52, 0)), p.accent, [side * .12, -1.08, .08], [1.05, 1.15, 1]); refs.arms.push(arm);
    const leg = new THREE.Group(); leg.position.set(side * .48, .82, 0); rig.add(leg);
    addPart(leg, geometry('colossus-leg', () => new THREE.DodecahedronGeometry(.44, 0)), p.dark, [0, -.35, 0], [1, 1.5, 1]); refs.legs.push(leg);
  }
  for (const side of [-1, 1]) addPart(rig, geometry('colossus-horn', () => new THREE.ConeGeometry(.16, .72, 6)), p.accent, [side * .38, 2.78, -.02], [1, 1, 1], [.1, 0, side * .55]);
}

function buildDrake(rig, p, refs) {
  refs.body = addPart(rig, geometry('drake-body', () => new THREE.SphereGeometry(.75, 12, 9)), p.body, [0, 1.05, -.18], [1, .82, 1.55]);
  const chest = addPart(rig, geometry('drake-chest', () => new THREE.SphereGeometry(.56, 10, 8)), p.accent, [0, 1.18, .62], [1, 1.15, .88]);
  const neck = addPart(rig, geometry('drake-neck', () => new THREE.CylinderGeometry(.25, .4, 1.2, 8)), p.dark, [0, 1.63, .75], [1, 1, 1], [-.42, 0, 0]);
  const head = addPart(rig, geometry('drake-head', () => new THREE.SphereGeometry(.46, 10, 8)), p.dark, [0, 2.15, 1.1], [1, .8, 1.3]); refs.head = head;
  coneBetween(rig, [0, 2.12, 1.32], [0, 2.04, 1.82], .26, p.light, { segments: 6 });
  for (const side of [-1, 1]) {
    const wing = new THREE.Group(); wing.position.set(side * .58, 1.48, -.15); rig.add(wing);
    cylinderBetween(wing, [0, 0, 0], [side * .9, .42, -.25], .1, p.dark, { segments: 7 });
    for (let i = 0; i < 4; i += 1) {
      const feather = addPart(wing, geometry('drake-wing-membrane', () => new THREE.ConeGeometry(.32, 1.65, 4)), i % 2 ? p.body : p.accent, [side * (.58 + i * .22), .05 - i * .12, -.34 - i * .12], [1, 1, .28], [.08, 0, side * (-.9 + i * .08)], { thickness: 1.035 });
      refs.feathers.push(feather);
    }
    refs.wings.push(wing);
    for (const z of [-.45, .5]) {
      const leg = new THREE.Group(); leg.position.set(side * .46, .62, z); rig.add(leg);
      addPart(leg, geometry('drake-leg', () => new THREE.CylinderGeometry(.13, .19, .85, 7)), p.dark, [0, -.27, 0], [1, 1, 1], [z > 0 ? -.12 : .1, 0, 0]); refs.legs.push(leg);
    }
    addPart(rig, geometry('drake-horn', () => new THREE.ConeGeometry(.12, .7, 6)), p.accent, [side * .3, 2.55, .92], [1, 1, 1], [.25, 0, side * .45]);
  }
  const tail = new THREE.Group(); tail.position.set(0, 1.0, -1.0); rig.add(tail); refs.tail = tail;
  coneBetween(tail, [0, 0, 0], [.12, .14, -2.1], .38, p.body, { segments: 8 });
  addEyes(rig, p, 2.22, 1.54, .17, .055, true);
}

export function createEnemyModel(data, elite = false) {
  const group = new THREE.Group();
  group.name = `${data.name}${elite ? ' [Elite]' : ''}`;
  const rig = new THREE.Group();
  group.add(rig);
  const palette = createPalette(data, elite);
  const refs = {
    group, rig, palette, body: null, head: null, weapon: null, shield: null, core: null, glow: null, tail: null,
    arms: [], legs: [], wings: [], feathers: [], petals: [], horns: [], orbits: [], orbs: [],
  };

  const builders = {
    blob: buildBlob, hare: buildHare, boar: buildBoar, wisp: buildWisp, raider: buildRaider,
    beetle: buildBeetle, wolf: buildWolf, plant: buildPlant, golem: buildGolem, shaman: buildShaman,
    harpy: buildHarpy, stag: buildStag, crab: buildCrab, raptor: buildRaptor, cyclops: buildCyclops,
    scorpion: buildScorpion, knight: buildKnight, imp: buildImp, lizard: buildLizard, panther: buildPanther,
    colossus: buildColossus, drake: buildDrake,
  };
  (builders[data.shape] ?? buildBlob)(rig, palette, refs);

  const modelHeight = ({ blob: 1.45, hare: 2.15, boar: 1.6, wisp: 1.8, raider: 2.25, beetle: 1.25,
    wolf: 1.75, plant: 1.65, golem: 2.45, shaman: 2.25, harpy: 2.25, stag: 3.0,
    crab: 1.35, raptor: 2.0, cyclops: 2.75, scorpion: 2.5, knight: 2.7, imp: 2.35,
    lizard: 1.45, panther: 1.75, colossus: 3.3, drake: 3.4 })[data.shape] ?? 2;
  refs.shadow = createShadow(group, (data.boss ? 1.65 : elite ? 1.05 : .78) * (data.scale ?? 1), data.boss ? .3 : .2);
  const health = createHealthBar(group, modelHeight + .38, data.boss ? 2.7 : elite ? 2 : 1.45);
  Object.assign(refs, { healthGroup: health.group, healthBack: health.back, healthFill: health.fill, healthWidth: health.width, modelHeight });

  if (elite || data.boss) {
    const aura = addPlain(group, geometry(data.boss ? 'boss-aura' : 'elite-aura', () => new THREE.RingGeometry(data.boss ? .9 : .62, data.boss ? 1.18 : .82, data.boss ? 36 : 24)),
      new THREE.MeshBasicMaterial({ color: data.boss ? data.accent : 0xffd36a, transparent: true, opacity: data.boss ? .5 : .34, side: THREE.DoubleSide, depthWrite: false }),
      [0, .055, 0], [data.scale ?? 1, data.scale ?? 1, 1], [-Math.PI / 2, 0, 0]);
    refs.aura = aura;
  }

  group.scale.setScalar((data.scale ?? 1) * (elite ? 1.13 : 1));
  return refs;
}

export function createTree(style = 'verdant', scale = 1) {
  const palettes = {
    verdant: [0x6d4b32, 0x4d9d54, 0x7bcf62, 0xa5df72],
    forest: [0x4b362b, 0x285b3e, 0x3f8652, 0x6abf67],
    frost: [0x59636b, 0x6f9eaa, 0xa9d6d7, 0xd8f3ef],
    ember: [0x392a29, 0x5e3130, 0x8c3d31, 0xd35b38],
    astral: [0x3c354d, 0x4f4776, 0x7763a8, 0xb28ae3],
  };
  const [trunkColor, dark, mid, light] = palettes[style] ?? palettes.verdant;
  const group = new THREE.Group();
  const trunk = sharedToonMaterial(trunkColor);
  const mats = [sharedToonMaterial(dark), sharedToonMaterial(mid), sharedToonMaterial(light)];
  addPart(group, geometry('tree-trunk', () => new THREE.CylinderGeometry(.34, .48, 3.6, 8)), trunk, [0, 1.8, 0], [1, 1, 1], [0, 0, 0], { thickness: 1.035 });
  for (const side of [-1, 1]) cylinderBetween(group, [0, 2.45, 0], [side * .82, 3.12, .1], .18, trunk, { segments: 7, thickness: 1.04 });
  if (style === 'frost') {
    for (let i = 0; i < 4; i += 1) addPart(group, geometry(`pine-${i}`, () => new THREE.ConeGeometry(1.28 - i * .16, 2.2, 8)), mats[i % 3], [0, 2.35 + i * .7, 0], [1, 1, 1], [0, i * .35, 0], { thickness: 1.025, castShadow: i > 1 });
  } else if (style === 'ember') {
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2;
      addPart(group, geometry('ember-branch', () => new THREE.ConeGeometry(.28, 2.1, 6)), mats[i % 3], [Math.cos(angle) * .42, 3.55 + (i % 2) * .35, Math.sin(angle) * .42], [1, 1, .7], [.25, angle, Math.cos(angle) * .45], { thickness: 1.035 });
    }
  } else {
    const clusters = [[0, 3.65, 0, 1.15], [-.8, 3.35, .12, .84], [.82, 3.38, -.08, .88], [0, 4.38, -.05, .82]];
    clusters.forEach(([x, y, z, s], index) => addPart(group, geometry('tree-canopy', () => new THREE.IcosahedronGeometry(1, 1)), mats[index % 3], [x, y, z], [s, s * .86, s], [0, index * .65, 0], { thickness: 1.028, castShadow: index === 0 || index === 3 }));
  }
  group.scale.setScalar(scale);
  group.userData.colliderRadius = .62 * scale;
  return group;
}

export function createRockCluster(color = 0x65726b, scale = 1, glowing = false) {
  const group = new THREE.Group();
  const base = sharedToonMaterial(color);
  const light = sharedToonMaterial(new THREE.Color(color).lerp(new THREE.Color(0xffffff), .24).getHex(), glowing ? { emissive: color, emissiveIntensity: .08 } : {});
  const pieces = [[0, .42, 0, .8], [.52, .27, .1, .46], [-.46, .24, .12, .4], [.14, .22, -.42, .38]];
  pieces.forEach(([x, y, z, s], index) => addPart(group, geometry('rock-dodeca', () => new THREE.DodecahedronGeometry(1, 0)), index % 2 ? light : base, [x, y, z], [s, s * .72, s * .88], [index * .31, index * .48, index * .14], { thickness: 1.035, castShadow: index === 0 }));
  group.scale.setScalar(scale);
  group.userData.colliderRadius = .72 * scale;
  return group;
}

export function createCrystalCluster(color = 0x9ee8ff, scale = 1) {
  const group = new THREE.Group();
  const mat = sharedToonMaterial(color, { emissive: color, emissiveIntensity: .2 });
  const dark = sharedToonMaterial(new THREE.Color(color).multiplyScalar(.55).getHex(), { emissive: color, emissiveIntensity: .05 });
  const shards = [[0, .85, 0, .32, 1.7], [.42, .48, .08, .2, .95], [-.38, .55, .12, .22, 1.12], [.12, .38, -.38, .16, .72]];
  shards.forEach(([x, y, z, r, h], index) => addPart(group, geometry('crystal-shard', () => new THREE.ConeGeometry(1, 2, 5)), index % 2 ? dark : mat, [x, y, z], [r, h * .5, r], [index * .12, index * .7, index * .08], { thickness: 1.045, castShadow: index === 0 }));
  const glow = new THREE.Sprite(spriteMaterial(color, .42));
  glow.scale.set(2.4, 2.4, 1); glow.position.y = .75; group.add(glow);
  group.scale.setScalar(scale);
  group.userData.colliderRadius = .5 * scale;
  return group;
}

export function createCanyonPillar(scale = 1) {
  const group = new THREE.Group();
  const rock = sharedToonMaterial(0xa8663d);
  const light = sharedToonMaterial(0xd28c52);
  addPart(group, geometry('canyon-pillar', () => new THREE.CylinderGeometry(.72, .9, 3.6, 7)), rock, [0, 1.8, 0], [1, 1, 1], [0, .2, .05], { thickness: 1.035 });
  addPart(group, geometry('canyon-cap', () => new THREE.DodecahedronGeometry(.9, 0)), light, [0, 3.45, 0], [1.2, .45, 1.05], [.15, .25, 0], { thickness: 1.035 });
  group.scale.setScalar(scale);
  group.userData.colliderRadius = .8 * scale;
  return group;
}

export function createRuin(scale = 1, color = 0x6d7183) {
  const group = new THREE.Group();
  const stone = sharedToonMaterial(color);
  const trim = sharedToonMaterial(new THREE.Color(color).lerp(new THREE.Color(0xb5a8df), .25).getHex());
  for (const side of [-1, 1]) {
    addPart(group, geometry('ruin-column', () => new THREE.CylinderGeometry(.28, .36, 2.9, 8)), stone, [side * 1.25, 1.45, 0], [1, 1, 1], [0, side * .08, side * .025], { thickness: 1.03 });
    addPart(group, geometry('ruin-cap', () => new THREE.BoxGeometry(.78, .24, .72)), trim, [side * 1.25, 2.92, 0], [1, 1, 1], [0, side * .08, 0], { thickness: 1.03 });
  }
  addPart(group, geometry('ruin-beam', () => new THREE.BoxGeometry(3.2, .38, .62)), stone, [0, 3.12, 0], [1, 1, 1], [0, 0, .03], { thickness: 1.025 });
  group.scale.setScalar(scale);
  group.userData.colliderRadius = 1.45 * scale;
  return group;
}

export function createCampShrine() {
  const group = new THREE.Group();
  const stone = sharedToonMaterial(0x71808a);
  const trim = sharedToonMaterial(0xc7b26b, { emissive: 0x6d4b18, emissiveIntensity: .08 });
  const crystal = sharedToonMaterial(0x75e6ff, { emissive: 0x75e6ff, emissiveIntensity: .45 });
  addPart(group, geometry('shrine-base', () => new THREE.CylinderGeometry(3.4, 3.8, .55, 12)), stone, [0, .28, 0], [1, 1, 1], [0, .15, 0], { thickness: 1.02 });
  addPart(group, geometry('shrine-ring', () => new THREE.TorusGeometry(2.8, .16, 8, 32)), trim, [0, .61, 0], [1, 1, 1], [Math.PI / 2, 0, 0], { thickness: 1.025 });
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    addPart(group, geometry('shrine-rune', () => new THREE.BoxGeometry(.32, .08, .8)), trim, [Math.cos(angle) * 2.05, .64, Math.sin(angle) * 2.05], [1, 1, 1], [0, -angle, 0], { outline: false, castShadow: false });
  }
  addPart(group, geometry('shrine-pillar', () => new THREE.CylinderGeometry(.48, .7, 2.2, 8)), stone, [0, 1.55, 0], [1, 1, 1], [0, .2, 0], { thickness: 1.03 });
  addPart(group, geometry('shrine-crystal', () => new THREE.OctahedronGeometry(.65, 1)), crystal, [0, 3.05, 0], [1, 1.7, 1], [0, .4, 0], { thickness: 1.04 });
  const glow = new THREE.Sprite(spriteMaterial(0x75e6ff, .55));
  glow.scale.set(4.2, 4.2, 1); glow.position.y = 3.05; group.add(glow);
  group.userData.glow = glow;
  return group;
}

/**
 * Ground pickup visual. Weapons prefer a cloned equip model when AssetManager has it.
 * @param {object} item gear item
 * @param {{ assets?: import('../assets/AssetManager.js').AssetManager, quality?: string }} [options]
 */
export function createLootMesh(item, options = {}) {
  const group = new THREE.Group();
  const color = item.rarityColor ?? item.color ?? 0xffffff;
  const rarity = item.rarity ?? 'common';
  const rarityBoost = rarity === 'legendary' ? 1 : rarity === 'epic' ? .72 : rarity === 'rare' ? .45 : .28;
  let release = null;

  if (item.slot === 'weapon') {
    const weaponMesh = tryCreateWeaponLootMesh(item, options);
    if (weaponMesh) {
      group.add(weaponMesh.root);
      release = weaponMesh.release;
    } else {
      const mat = toonMaterial(item.color ?? color, { emissive: color, emissiveIntensity: .28 + rarityBoost * .22 });
      const dark = toonMaterial(new THREE.Color(color).multiplyScalar(.55).getHex(), { emissive: color, emissiveIntensity: .06 + rarityBoost * .08 });
      // Stylized fallback: silhouette reads as bow / staff / dagger / blade.
      const kind = item.model ?? 'sword';
      const isBow = kind === 'bow';
      const isStaff = kind === 'staff';
      const isDagger = kind === 'dagger';
      if (isBow) {
        addPart(group, geometry('loot-bow-arc', () => new THREE.TorusGeometry(.55, .05, 6, 18, Math.PI * 1.15)), mat, [0, .7, 0], [1, 1.15, .55], [0, 0, Math.PI * .5], { thickness: 1.04 });
        addPart(group, geometry('loot-bow-string', () => new THREE.BoxGeometry(.04, 1.05, .03)), dark, [0, .7, 0], [1, 1, 1], [0, 0, 0], { thickness: 1.03 });
      } else if (isStaff) {
        addPart(group, geometry('loot-staff', () => new THREE.CylinderGeometry(.06, .08, 1.35, 7)), mat, [0, .78, 0], [1, 1, 1], [0, 0, -.2], { thickness: 1.04 });
        addPart(group, geometry('loot-staff-head', () => new THREE.OctahedronGeometry(.22, 0)), dark, [0, 1.42, 0], [1, 1.15, 1], [0, 0, 0], { thickness: 1.05 });
      } else {
        const bladeH = isDagger ? .72 : 1.15;
        const guardW = isDagger ? .36 : .58;
        addPart(group, geometry('loot-weapon', () => new THREE.BoxGeometry(.16, 1.15, .1)), mat, [0, .35 + bladeH * .5, 0], [1, bladeH / 1.15, isDagger ? .85 : 1], [0, 0, -.35], { thickness: 1.05 });
        addPart(group, geometry('loot-guard', () => new THREE.BoxGeometry(.58, .09, .12)), dark, [0, .16, 0], [guardW / .58, 1, 1], [0, 0, -.35], { thickness: 1.04 });
      }
    }
  } else if (item.slot === 'armor') {
    const mat = toonMaterial(item.color ?? color, { emissive: color, emissiveIntensity: .28 + rarityBoost * .22 });
    const dark = toonMaterial(new THREE.Color(color).multiplyScalar(.55).getHex(), { emissive: color, emissiveIntensity: .06 + rarityBoost * .08 });
    addPart(group, geometry('loot-armor', () => new THREE.CylinderGeometry(.45, .58, .9, 8)), mat, [0, .62, 0], [1, 1, .7], [0, .2, 0], { thickness: 1.045 });
    addPart(group, geometry('loot-armor-core', () => new THREE.OctahedronGeometry(.18, 0)), dark, [0, .7, .48], [1, 1.2, .55], [0, 0, 0], { thickness: 1.05 });
    // Rarity trim ring on armor
    if (rarity !== 'common') {
      const trim = addPlain(
        group,
        geometry('loot-armor-trim', () => new THREE.TorusGeometry(.52, .03, 5, 18)),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .35 + rarityBoost * .35, depthWrite: false, blending: THREE.AdditiveBlending }),
        [0, .95, 0], [1, 1, 1], [Math.PI / 2, 0, 0],
      );
      trim.renderOrder = 2;
    }
  } else {
    const mat = toonMaterial(item.color ?? color, { emissive: color, emissiveIntensity: .28 + rarityBoost * .22 });
    addPart(group, geometry('loot-charm', () => new THREE.OctahedronGeometry(.38, 1)), mat, [0, .65, 0], [1, 1.35, .65], [0, .4, 0], { thickness: 1.055 });
    addPlain(group, geometry('loot-ring', () => new THREE.TorusGeometry(.55, .035, 6, 22)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .55 + rarityBoost * .25, depthWrite: false }), [0, .65, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  }

  // Beam height / opacity scale with rarity (legendary & epic read from a distance).
  const beamH = rarity === 'legendary' ? 7.2 : rarity === 'epic' ? 5.6 : rarity === 'rare' ? 4.6 : 4;
  const beamOp = rarity === 'legendary' ? .34 : rarity === 'epic' ? .28 : .2;
  const beamTop = rarity === 'legendary' ? .12 : .08;
  const beamBot = rarity === 'legendary' ? .32 : rarity === 'epic' ? .26 : .22;
  const beamGeoKey = `loot-beam-${rarity}`;
  const beam = addPlain(
    group,
    geometry(beamGeoKey, () => new THREE.CylinderGeometry(beamTop, beamBot, beamH, 10, 1, true)),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: beamOp, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }),
    [0, beamH * .52, 0],
  );

  let ring = null;
  if (rarity === 'legendary' || rarity === 'epic') {
    ring = addPlain(
      group,
      geometry(`loot-ground-ring-${rarity}`, () => new THREE.TorusGeometry(rarity === 'legendary' ? .85 : .62, .04, 6, 28)),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: rarity === 'legendary' ? .55 : .38,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }),
      [0, .05, 0], [1, 1, 1], [Math.PI / 2, 0, 0],
    );
  }

  const glowScale = rarity === 'legendary' ? 3.4 : rarity === 'epic' ? 2.9 : 2.3;
  const glow = new THREE.Sprite(spriteMaterial(color, .6 + rarityBoost * .25));
  glow.scale.set(glowScale, glowScale, 1); glow.position.y = .7; group.add(glow);
  const shadow = createShadow(group, rarity === 'legendary' ? .72 : .55, .18);
  return { group, beam, glow, shadow, ring, release };
}

/** Clone equip weapon for ground loot; returns null on miss/fallback. */
function tryCreateWeaponLootMesh(item, options = {}) {
  const assets = options.assets;
  if (!assets?.cloneModel) return null;
  const kind = item.model ?? 'sword';
  let asset;
  try {
    asset = assets.cloneModel(`weapon.${kind}`, { quality: options.quality ?? 'low' });
  } catch {
    return null;
  }
  if (!asset || asset.fallback) {
    asset?.release?.();
    return null;
  }
  const root = asset.scene;
  root.name = `LootWeapon_${kind}`;
  // Compact ground pose — bows upright, blades slightly tilted.
  if (kind === 'bow') {
    root.scale.setScalar(.42);
    root.rotation.set(0, 0, Math.PI * .08);
    root.position.set(0, .55, 0);
  } else if (kind === 'staff') {
    root.scale.setScalar(.38);
    root.rotation.set(0, 0, -.25);
    root.position.set(0, .7, 0);
  } else if (kind === 'dagger') {
    root.scale.setScalar(.48);
    root.rotation.set(0, 0, -.4);
    root.position.set(0, .45, 0);
  } else {
    root.scale.setScalar(.4);
    root.rotation.set(0, 0, -.35);
    root.position.set(0, .55, 0);
  }

  const rarityColor = new THREE.Color(item.rarityColor ?? item.color ?? 0xe8f4ff);
  const rarity = item.rarity ?? 'common';
  const emissiveMul = rarity === 'legendary' ? .28 : rarity === 'epic' ? .18 : rarity === 'rare' ? .1 : .05;
  root.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    const source = object.material;
    const materials = Array.isArray(source) ? source : [source];
    const cloned = materials.map(m => {
      const mat = m?.clone?.() ?? m;
      if (mat?.color) {
        mat.color.lerp(rarityColor, .35);
      }
      if (mat?.emissive) {
        mat.emissive.copy(rarityColor);
        mat.emissiveIntensity = (mat.emissiveIntensity ?? .1) + emissiveMul;
      }
      if (object.name?.toLowerCase?.().includes('rune') && mat?.emissive) {
        mat.emissiveIntensity = rarity === 'legendary' ? 1.1 : rarity === 'epic' ? .75 : .4;
      }
      return mat;
    });
    object.material = Array.isArray(source) ? cloned : cloned[0];
  });

  return {
    root,
    release: () => {
      // Dispose only cloned materials; leave shared GLB geometry in AssetManager cache.
      root.traverse(object => {
        if (!object.material) return;
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) material?.dispose?.();
      });
      asset.release?.();
    },
  };
}
