/**
 * Gunner class regression — pure targeting, content contract, profile routing.
 * Wired into integrity.mjs.
 */
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from '../vendor/three.module.min.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const ok = (cond, msg) => {
  if (cond) console.log(`✓ ${msg}`);
  else {
    failures.push(msg);
    console.error(`✗ ${msg}`);
  }
};

console.log('\n--- gunner-class ---\n');

const content = await import(pathToFileURL(join(root, 'js/data/content.js')).href);
const config = await import(pathToFileURL(join(root, 'js/config.js')).href);
const targeting = await import(pathToFileURL(join(root, 'js/systems/combat/gunnerTargeting.js')).href);
const registry = await import(pathToFileURL(join(root, 'js/systems/combat/skillEffectRegistry.js')).href);
const { attachBasicAttackMethods } = await import(pathToFileURL(join(root, 'js/systems/combat/basicAttacks.js')).href);
const { attachGunnerSkillMethods } = await import(pathToFileURL(join(root, 'js/systems/combat/skills/gunnerSkills.js')).href);
const { AudioManager } = await import(pathToFileURL(join(root, 'js/core/AudioManager.js')).href);

const {
  HERO_CLASSES, SKILLS, MAX_HUNT_CLASS_PRESETS, WEAPON_EVOLUTIONS, WEAPON_RESONANCES,
  getBasicAttackProfile, getClassBasicAttack, getHeroClass,
} = content;
const { GUNNER_CONFIG } = config;
const {
  selectSmartlinkTarget, queryFirstRifleHit, queryRifleLaneHits, queryFlameConeHits, getGunnerBasicAttackSpec,
  isValidGunnerTarget,
} = targeting;

ok(Boolean(HERO_CLASSES.gunner), 'HERO_CLASSES.gunner exists');
const gunner = HERO_CLASSES.gunner;
ok(gunner.name === 'Rook' && gunner.title === 'Ember Vanguard', 'player-facing identity');
ok(gunner.activeSkills?.length === 4, 'four active skills');
ok(gunner.passiveSkills?.length >= 5, 'five+ passives');
ok(gunner.basicAttack?.profile === 'rifle', 'basicAttack.profile rifle');
ok(getBasicAttackProfile('gunner') === 'rifle', 'getBasicAttackProfile gunner → rifle');
ok(getBasicAttackProfile('ranger') === 'bow', 'ranger stays bow');
ok(getBasicAttackProfile('wizard') === 'magic', 'wizard stays magic');
ok(getBasicAttackProfile('aerin') === 'melee', 'knight stays melee');
ok(getClassBasicAttack('gunner').range === 26, 'rifle range 26');

for (const id of gunner.activeSkills) {
  const skill = SKILLS[id];
  ok(Boolean(skill), `skill ${id} defined`);
  ok(skill.classId === 'gunner', `${id} classId gunner`);
  ok(registry.SKILL_EFFECT_HANDLER_KEYS.includes(skill.effect), `${id} effect registered`);
  ok(Boolean(skill.theme && skill.recipe && skill.combat), `${id} spectacle fields present`);
  ok(skill.anim?.includes(id), `${id} uses dedicated Gunner animation`);
}
for (const id of gunner.passiveSkills) {
  ok(SKILLS[id]?.passive === true, `passive ${id}`);
}
ok(SKILLS.smartlink?.unlockLevel === 5, 'smartlink unlocks at 5');
ok(SKILLS.smartlink?.unlockNotice?.title?.includes('SMARTLINK'), 'smartlink unlock notice metadata');
ok(SKILLS.suppressive_burst?.sfx === 'skill_rifle', 'Suppressive Burst uses rifle skill audio');
ok(SKILLS.stim_rush?.sfx === 'skill_rifle', 'Stim Rush uses rifle skill audio');
ok(SKILLS.flame_jet?.sfx === 'skill_fire' && SKILLS.inferno_sweep?.sfx === 'skill_fire', 'flame skills use fire audio');
ok(
  SKILLS.suppressive_burst.combat.mult[0] === 1.55
    && SKILLS.suppressive_burst.combat.mult[1] === 0.18
    && SKILLS.suppressive_burst.combat.armorPierce === 0.18,
  'Suppressive Burst keeps destructive three-round damage and armor penetration',
);
ok(
  SKILLS.flame_jet.combat.mult[0] === 2.15
    && SKILLS.flame_jet.combat.mult[1] === 0.23
    && SKILLS.flame_jet.combat.armorPierce === 0.14,
  'Flame Jet keeps upgraded direct damage against armored targets',
);
ok(
  SKILLS.stim_rush.combat.mult[0] === 0.35
    && SKILLS.stim_rush.combat.mult[1] === 0.035,
  'Stim Rush shockwave remains a meaningful damaging opener',
);
ok(
  SKILLS.inferno_sweep.combat.mult[0] === 2.9
    && SKILLS.inferno_sweep.combat.mult[1] === 0.32
    && SKILLS.inferno_sweep.combat.zoneMult === 0.34
    && SKILLS.inferno_sweep.combat.armorPierce === 0.12,
  'Inferno Sweep keeps upgraded impact, ground damage, and armor penetration',
);
ok(
  SKILLS.flame_jet.evolution.mutations[80].sticky_fuel.combat.status.dps
    > SKILLS.flame_jet.combat.status.dps
    && SKILLS.inferno_sweep.evolution.mutations[40].deep_burn.combat.zoneMult
      > SKILLS.inferno_sweep.combat.zoneMult,
  'Gunner damage mutations never downgrade their base damage-over-time values',
);

ok(Boolean(WEAPON_EVOLUTIONS.gunner?.length >= 5), 'gunner weapon evolution stages');
ok(Boolean(WEAPON_RESONANCES.gunner?.milestones?.length === 7), 'gunner resonance milestones');
ok(Boolean(MAX_HUNT_CLASS_PRESETS.gunner), 'MAX HUNT gunner preset');
const preset = MAX_HUNT_CLASS_PRESETS.gunner;
for (const [skillId, choiceId] of Object.entries(preset.mutations)) {
  ok(Boolean(SKILLS[skillId]?.evolution?.mutations?.[40]?.[choiceId]), `preset mut ${skillId}/${choiceId}`);
}

// Smartlink pure selection
const enemies = [
  { alive: true, id: 'front', radius: 0.5, position: { x: 8, z: 1 } },
  { alive: true, id: 'rear', radius: 0.5, position: { x: -4, z: 0 } },
  { alive: true, id: 'side', radius: 0.5, position: { x: 1, z: 10 } },
  { alive: false, id: 'dead', radius: 0.5, position: { x: 3, z: 0 } },
];
const nearest = selectSmartlinkTarget(enemies, { x: 0, z: 0 }, { x: 1, z: 0 }, null);
ok(nearest?.id === 'rear', 'Smartlink selects the nearest eligible target');
const retained = selectSmartlinkTarget(enemies, { x: 0, z: 0 }, { x: 1, z: 0 }, 'front');
ok(retained?.id === 'rear', 'a farther retained target does not override nearest-target policy');
const onlyRear = selectSmartlinkTarget(
  [{ alive: true, id: 'close-rear', radius: 0.5, position: { x: -3, z: 0 } }],
  { x: 0, z: 0 }, { x: 1, z: 0 }, null,
  { rearEmergencyRadius: 9, frontDot: 0.15, acquireRange: 28 },
);
ok(onlyRear?.id === 'close-rear', 'rear emergency target when no front candidate');
const none = selectSmartlinkTarget([], { x: 0, z: 0 }, { x: 1, z: 0 }, null);
ok(none == null, 'no candidate returns null');
ok(!isValidGunnerTarget(enemies[3], { x: 0, z: 0 }), 'dead target invalid');
const tiedA = { alive: true, id: 'a-stable', radius: 0.5, position: { x: 8, z: 1 } };
const tiedB = { alive: true, id: 'b-stable', radius: 0.5, position: { x: 8, z: -1 } };
ok(
  selectSmartlinkTarget([tiedB, tiedA], { x: 0, z: 0 }, { x: 1, z: 0 })?.id === 'a-stable'
    && selectSmartlinkTarget([tiedA, tiedB], { x: 0, z: 0 }, { x: 1, z: 0 })?.id === 'a-stable',
  'equal Smartlink candidates use stable id independent of array order',
);
const nonHostile = { alive: true, hostile: false, id: 'friendly', radius: 0.5, position: { x: 2, z: 0 } };
ok(selectSmartlinkTarget([nonHostile], { x: 0, z: 0 }, { x: 1, z: 0 }) == null, 'Smartlink ignores non-hostile targets');
const priorityTargets = [
  { alive: true, id: 'normal-near', radius: 0.5, position: { x: 2, z: 0 } },
  { alive: true, elite: true, id: 'elite-mid', radius: 0.5, position: { x: 5, z: 0 } },
  { alive: true, boss: true, id: 'boss-far', radius: 0.5, position: { x: 12, z: 0 } },
];
ok(
  selectSmartlinkTarget(priorityTargets, { x: 0, z: 0 }, { x: 1, z: 0 }, 'normal-near')?.id === 'boss-far',
  'Smartlink prioritizes boss over retained normal and nearer elite',
);
priorityTargets[2].alive = false;
ok(
  selectSmartlinkTarget(priorityTargets, { x: 0, z: 0 }, { x: 1, z: 0 })?.id === 'elite-mid',
  'Smartlink falls back from dead boss to elite',
);

// Hitscan
const lane = [
  { alive: true, id: 'near', radius: 0.5, position: { x: 4, z: 0 } },
  { alive: true, id: 'far', radius: 0.5, position: { x: 12, z: 0 } },
];
const hit = queryFirstRifleHit(lane, { x: 0, y: 0, z: 0 }, { x: 1, z: 0 }, 26, 0.55);
ok(hit?.enemy?.id === 'near', 'hitscan prefers nearest intersection');
ok(hit?.point?.y === 0, 'hitscan endpoint preserves muzzle height');
const miss = queryFirstRifleHit(lane, { x: 0, y: 0, z: 0 }, { x: 0, z: 1 }, 26, 0.55);
ok(miss == null, 'hitscan miss returns null');
const pierced = queryRifleLaneHits(lane, { x: 0, y: 1.1, z: 0 }, { x: 1, z: 0 }, 26, 0.55, 4);
ok(pierced.map(entry => entry.enemy.id).join(',') === 'near,far', 'lane query returns distinct hits in distance order');
ok(queryRifleLaneHits([...lane, nonHostile], { x: 0, z: 0 }, { x: 1, z: 0 }, 26, 0.55, 1)[0]?.enemy?.id === 'near', 'lane cap and hostile filter');

const cone = queryFlameConeHits(lane, { x: 0, z: 0 }, { x: 1, z: 0 }, { range: 8, halfAngle: 0.5, cap: 8 });
ok(cone.some(e => e.id === 'near'), 'flame cone hits forward enemy');

const finisher = getGunnerBasicAttackSpec(3);
ok(finisher.rounds === 3 && finisher.isFinisher, 'finisher is 3-round burst');
ok(GUNNER_CONFIG.smartlink.unlockLevel === 5, 'smartlink config unlock 5');
ok(getHeroClass('gunner').presentation?.attackIcon === 'rifle', 'presentation attackIcon rifle');
ok(typeof AudioManager.prototype.basicAttack === 'function', 'data-driven basic attack audio facade exists');

const glbJson = file => {
  const bytes = readFileSync(join(root, file));
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
};
const gunnerGlb = glbJson('assets/models/hero/gunner_lod0.glb');
const gunnerNodeNames = gunnerGlb.nodes?.map(node => node.name).filter(Boolean) ?? [];
const gunnerClipNames = gunnerGlb.animations?.map(clip => clip.name) ?? [];
ok(gunnerNodeNames.includes('gunner_powered_cuirass'), 'production Gunner GLB contains powered armor silhouette');
ok(!gunnerNodeNames.some(name => name.startsWith('ranger_')), 'production Gunner GLB is not a renamed Ranger copy');
ok(gunner.activeSkills.every(id => gunnerClipNames.includes(`skill_${id}`)), 'production Gunner GLB contains four dedicated skill clips');
const rifleGlb = glbJson('assets/models/props/weapon_rifle.glb');
const rifleNodeNames = rifleGlb.nodes?.map(node => node.name).filter(Boolean) ?? [];
ok(rifleNodeNames.includes('muzzle_socket') && rifleNodeNames.includes('stock_anchor'), 'rifle GLB exposes muzzle and stock anchors');
ok(rifleNodeNames.includes('rifle_barrel') && !rifleNodeNames.some(name => name.startsWith('staff_')), 'rifle GLB is a real rifle asset, not a renamed staff');
const generatorSource = readFileSync(join(root, 'tools/assets/generate_assets.mjs'), 'utf8');
ok(generatorSource.includes("args.has('--gunner-only')") && generatorSource.includes("args.has('--rifle-only')"), 'asset generator exposes Gunner and rifle CLI flags');

// Delayed three-round finisher must retain the trigger-time facing/origin.
const basicProto = {};
attachBasicAttackMethods(basicProto);
const delayed = [];
const damaged = [];
const shotEnemies = lane.map(enemy => ({
  ...enemy,
  position: new THREE.Vector3(enemy.position.x, 0, enemy.position.z),
}));
const runtime = {
  ctx: {
    enemies: { enemies: shotEnemies },
    effects: {
      recipeRifleMuzzle() {}, recipeRifleTracer() {}, burst() {}, ring() {},
    },
  },
  _facingDir: player => player.facing.clone(),
  _delay: (_seconds, fn) => delayed.push(fn),
  _damageEnemy: (enemy, _damage, options) => damaged.push({ enemy, direction: options.direction.clone() }),
  _magicAttack() {},
};
const riflePlayer = {
  alive: true,
  classId: 'gunner',
  level: 1,
  position: new THREE.Vector3(0, 0, 0),
  facing: new THREE.Vector3(1, 0, 0),
  attackPower: 10,
  refs: {},
  weapon: {},
};
basicProto._rifleAttack.call(runtime, riflePlayer, 3, 4);
riflePlayer.facing.set(0, 0, 1);
for (const fire of delayed) fire();
ok(damaged.length === 3, 'finisher resolves all three authored rounds');
ok(damaged.every(event => event.direction.x > 0.99 && Math.abs(event.direction.z) < 0.01), 'finisher rounds keep immutable trigger direction');

// Multi-tick flame may proc once per target; later ticks and ground fire are derived.
const gunnerSkillProto = {};
attachGunnerSkillMethods(gunnerSkillProto);
const flameDelayed = [];
const flameDamage = [];
const radiusHits = [];
const flameEnemy = { alive: true, id: 'flame-target', radius: .5, position: new THREE.Vector3(3, 0, 0) };
const skillRuntime = {
  ctx: {
    enemies: { enemies: [flameEnemy] },
    effects: {
      recipeFlameJet() {}, recipeInfernoSweep() {}, ring() {}, burst() {},
    },
    ui: { notify() {} },
  },
  _facingDir: player => player.facing.clone(),
  _delay: (_seconds, fn) => flameDelayed.push(fn),
  _damageEnemy: (_enemy, damage, options) => flameDamage.push({ damage, ...options }),
  _skillBundle: bundle => bundle,
  _apexAudioPhase() {},
  _hitEnemiesInCone() {},
  _hitEnemiesInRadius: (...args) => radiusHits.push(args),
};
const skillPlayer = {
  alive: true, classId: 'gunner', attackPower: 10,
  position: new THREE.Vector3(), facing: new THREE.Vector3(1, 0, 0), refs: {},
};
gunnerSkillProto._flameJet.call(skillRuntime, skillPlayer, {
  combat: {
    range: 8, ticks: 3, tickInterval: .1, halfAngle: .5, cap: 8, mult: 1,
    damageMult: 1.5, knockback: .6, armorPierce: .2, criticalBonus: .1,
  },
  theme: { primary: 0xff7733, secondary: 0xffaa55 },
});
for (const tick of flameDelayed.splice(0)) tick();
ok(flameDamage.length === 3, 'Flame Jet resolves one damage event per authored tick');
ok(flameDamage[0]?.weaponProcDerived === false && flameDamage.slice(1).every(options => options.weaponProcDerived === true), 'Flame Jet allows one weapon proc per target per cast');
ok(Math.abs(flameDamage[0]?.damage - 5) < 1e-9
  && flameDamage[0]?.knockback === .6
  && flameDamage[0]?.armorPierce === .2
  && flameDamage[0]?.criticalBonus === .1,
'Flame Jet honors mutation damage and hit modifiers');

gunnerSkillProto._stimRush.call(skillRuntime, skillPlayer, {
  combat: {
    mult: .3, duration: 7.4, attackSpeed: .3, moveSpeed: .22,
    radius: 3.6, knockback: 3, criticalBonus: .08,
  },
  theme: { primary: 0xff7733, secondary: 0xffaa55 },
});
ok(radiusHits.length === 1
  && radiusHits[0][1] === 3.6
  && Math.abs(radiusHits[0][2] - 3) < 1e-9
  && radiusHits[0][3]?.knockback === 3,
'Stim Rush opens with an authored damaging shockwave');
ok(skillPlayer.stimRush?.attackSpeed === .3 && skillPlayer.stimRush?.moveSpeed === .22,
  'Stim Rush retains its haste and mobility buff');

flameDamage.length = 0;
gunnerSkillProto._infernoSweep.call(skillRuntime, skillPlayer, {
  combat: {
    range: 8, arc: Math.PI, mult: 1, damageMult: 1.5,
    zoneCount: 3, zoneLife: 2, zoneRadius: 10, zoneMult: .2,
  },
  theme: { primary: 0xff7733, secondary: 0xffaa55 },
});
gunnerSkillProto._tickGunnerGroundZones.call(skillRuntime, .1);
ok(flameDamage.length === 3 && flameDamage.every(options => options.weaponProcDerived === true), 'Inferno ground ticks never trigger weapon procs');
ok(new Set(flameDamage.map(options => options.sameCastHit?.key)).size === 1, 'overlapping Inferno zones share a per-cast tick cap key');
ok(flameDamage.every(event => Math.abs(event.damage - 3) < 1e-9),
  'Inferno ground damage inherits the initial damage multiplier');

if (failures.length) {
  console.error(`\n${failures.length} gunner-class failure(s)`);
  failures.forEach(f => console.error('-', f));
  process.exit(1);
}
console.log('\nGunner class checks passed\n');
