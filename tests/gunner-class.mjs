/**
 * Gunner class regression — pure targeting, content contract, profile routing.
 * Wired into integrity.mjs.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const {
  HERO_CLASSES, SKILLS, MAX_HUNT_CLASS_PRESETS, WEAPON_EVOLUTIONS, WEAPON_RESONANCES,
  getBasicAttackProfile, getClassBasicAttack, getHeroClass,
} = content;
const { GUNNER_CONFIG } = config;
const {
  selectSmartlinkTarget, queryFirstRifleHit, queryFlameConeHits, getGunnerBasicAttackSpec,
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
}
for (const id of gunner.passiveSkills) {
  ok(SKILLS[id]?.passive === true, `passive ${id}`);
}
ok(SKILLS.smartlink?.unlockLevel === 5, 'smartlink unlocks at 5');
ok(SKILLS.smartlink?.unlockNotice?.title?.includes('SMARTLINK'), 'smartlink unlock notice metadata');

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
const front = selectSmartlinkTarget(enemies, { x: 0, z: 0 }, { x: 1, z: 0 }, null);
ok(front?.id === 'front', 'prefers front acquire target');
const retained = selectSmartlinkTarget(enemies, { x: 0, z: 0 }, { x: 1, z: 0 }, 'rear');
ok(retained?.id === 'rear', 'retained valid target wins when in retain range');
const onlyRear = selectSmartlinkTarget(
  [{ alive: true, id: 'close-rear', radius: 0.5, position: { x: -3, z: 0 } }],
  { x: 0, z: 0 }, { x: 1, z: 0 }, null,
  { rearEmergencyRadius: 9, frontDot: 0.15, acquireRange: 28 },
);
ok(onlyRear?.id === 'close-rear', 'rear emergency target when no front candidate');
const none = selectSmartlinkTarget([], { x: 0, z: 0 }, { x: 1, z: 0 }, null);
ok(none == null, 'no candidate returns null');
ok(!isValidGunnerTarget(enemies[3], { x: 0, z: 0 }), 'dead target invalid');

// Hitscan
const lane = [
  { alive: true, id: 'near', radius: 0.5, position: { x: 4, z: 0 } },
  { alive: true, id: 'far', radius: 0.5, position: { x: 12, z: 0 } },
];
const hit = queryFirstRifleHit(lane, { x: 0, y: 0, z: 0 }, { x: 1, z: 0 }, 26, 0.55);
ok(hit?.enemy?.id === 'near', 'hitscan prefers nearest intersection');
const miss = queryFirstRifleHit(lane, { x: 0, y: 0, z: 0 }, { x: 0, z: 1 }, 26, 0.55);
ok(miss == null, 'hitscan miss returns null');

const cone = queryFlameConeHits(lane, { x: 0, z: 0 }, { x: 1, z: 0 }, { range: 8, halfAngle: 0.5, cap: 8 });
ok(cone.some(e => e.id === 'near'), 'flame cone hits forward enemy');

const finisher = getGunnerBasicAttackSpec(3);
ok(finisher.rounds === 3 && finisher.isFinisher, 'finisher is 3-round burst');
ok(GUNNER_CONFIG.smartlink.unlockLevel === 5, 'smartlink config unlock 5');
ok(getHeroClass('gunner').presentation?.attackIcon === 'rifle', 'presentation attackIcon rifle');

if (failures.length) {
  console.error(`\n${failures.length} gunner-class failure(s)`);
  failures.forEach(f => console.error('-', f));
  process.exit(1);
}
console.log('\nGunner class checks passed\n');
