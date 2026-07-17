/**
 * Signature weapon fast-progression and live resonance checks.
 * Run directly or through tests/integrity.mjs.
 */
import * as THREE from '../vendor/three.module.min.js';
import { WEAPON_ENHANCE, WEAPON_OPTION_ENHANCE } from '../js/config.js';
import {
  HERO_CLASSES,
  WEAPON_RESONANCE_LEVELS,
  createClassStarterWeapon,
  getWeaponEvolution,
  getWeaponResonance,
  weaponResonanceTier,
} from '../js/data/content.js';
import { CombatSystem } from '../js/systems/CombatSystem.js';
import {
  enhanceWeaponOptions,
  recomputeWeaponFromEnhance,
  weaponEnhanceCost,
  weaponEnhanceSuccessChance,
} from '../js/systems/LootSystem.js';

const failures = [];
const ok = (condition, message) => {
  if (condition) console.log(`✓ ${message}`);
  else {
    failures.push(message);
    console.error(`✗ ${message}`);
  }
};

const classIds = Object.keys(HERO_CLASSES);
ok(classIds.length === 4, 'all four playable classes are under weapon-progression test');
ok(WEAPON_RESONANCE_LEVELS.join(',') === '3,6,10,15,20,25,30', 'seven fast resonance milestones are fixed');

const totalCostThrough = (weapon, target) => {
  let total = 0;
  for (let level = 0; level < target; level += 1) {
    weapon.weaponEnhanceLevel = level;
    total += weaponEnhanceCost(weapon);
  }
  return total;
};

for (const classId of classIds) {
  const weapon = createClassStarterWeapon(classId);
  const basePower = weapon.power;
  const cost3 = totalCostThrough(weapon, 3);
  const cost6 = totalCostThrough(weapon, 6);
  ok(cost3 <= 150, `${classId} reaches first resonance for at most 150G (${cost3}G)`);
  ok(cost6 <= 560, `${classId} reaches tier two for at most 560G (${cost6}G)`);

  for (let target = 1; target <= 10; target += 1) {
    weapon.weaponEnhanceLevel = target - 1;
    ok(weaponEnhanceSuccessChance(weapon) === 1, `${classId} +${target} is guaranteed`);
  }
  weapon.weaponEnhanceLevel = 29;
  ok(weaponEnhanceSuccessChance(weapon) >= WEAPON_ENHANCE.successFloor, `${classId} late enhance keeps the success floor`);

  for (const [level, minimum] of [[3, 1.45], [10, 2.7], [30, 7]]) {
    weapon.weaponEnhanceLevel = level;
    recomputeWeaponFromEnhance(weapon);
    ok(weapon.power >= Math.floor(basePower * minimum), `${classId} +${level} power spikes to ${weapon.power} from ${basePower}`);
    ok(weaponResonanceTier(level) === WEAPON_RESONANCE_LEVELS.filter(value => value <= level).length,
      `${classId} +${level} resolves the expected resonance tier`);
  }
  ok(getWeaponEvolution(classId, 3).rarity === 'uncommon', `${classId} visually evolves at +3`);
  ok(getWeaponEvolution(classId, 30).rarity === 'legendary', `${classId} ends on a legendary evolution`);

  const resonance = getWeaponResonance(classId);
  ok(resonance.milestones.length === 7 && new Set(resonance.milestones.map(entry => entry.name)).size === 7,
    `${classId} owns seven named resonance upgrades`);

  const optionWeapon = createClassStarterWeapon(classId);
  for (let level = 0; level < WEAPON_OPTION_ENHANCE.optionSlots; level += 1) enhanceWeaponOptions(optionWeapon);
  for (const stat of ['crit', 'haste', 'skillPower', 'goldBonus', 'luck', 'leech']) {
    ok(optionWeapon.optionStats[stat] > 0, `${classId} first option cycle grants ${stat}`);
  }
}

const statsAt30 = Object.fromEntries(classIds.map(classId => {
  const weapon = createClassStarterWeapon(classId);
  weapon.weaponEnhanceLevel = 30;
  recomputeWeaponFromEnhance(weapon);
  return [classId, weapon];
}));
ok(statsAt30.wizard.skillPower > statsAt30.aerin.skillPower, 'wizard weapon emphasizes Skill Power');
ok(statsAt30.rogue.haste > statsAt30.wizard.haste, 'rogue weapon emphasizes Haste');
ok(statsAt30.ranger.luck > statsAt30.aerin.luck, 'ranger weapon emphasizes Luck');
ok(statsAt30.aerin.leech > statsAt30.wizard.leech, 'knight weapon emphasizes sustain');

function makeEnemy(id, x, z) {
  return {
    id,
    alive: true,
    hp: 100000,
    maxHp: 100000,
    radius: 0.55,
    position: new THREE.Vector3(x, 0, z),
    refs: { modelHeight: 2 },
    statuses: {},
    hits: [],
    applyStatus(statusId, options) {
      this.statuses[statusId] = { id: statusId, remaining: options.duration ?? 1, ...options };
    },
    takeDamage(raw, _game, options = {}) {
      const amount = Math.max(1, Math.round(raw));
      this.hits.push({ amount, options });
      this.hp -= amount;
      return { amount, killed: false };
    },
  };
}

function makeCombat(classId, weaponLevel = 30) {
  const weapon = createClassStarterWeapon(classId);
  weapon.weaponEnhanceLevel = weaponLevel;
  recomputeWeaponFromEnhance(weapon);
  const player = {
    alive: true,
    classId,
    weapon,
    position: new THREE.Vector3(),
    facing: new THREE.Vector3(1, 0, 0),
    attackPower: 120,
    critChance: 0,
    critMultiplier: 1.85,
    skillPower: 1,
    leech: 0,
    passiveEffects: { statusCrit: 0, execute: 0 },
    predatorVerdict: null,
    gainEnergy() {},
    heal() {},
  };
  const enemies = [
    makeEnemy(`${classId}-source`, 2, 0),
    makeEnemy(`${classId}-near-a`, 3, 0.7),
    makeEnemy(`${classId}-near-b`, 3.4, -0.8),
    makeEnemy(`${classId}-near-c`, 4, 0.2),
  ];
  const fxEvents = [];
  const effects = new Proxy({}, {
    get(_target, key) {
      return (...args) => fxEvents.push({ key: String(key), args });
    },
  });
  const game = {
    player,
    enemies: { enemies },
    effects,
    ui: { floatText() {} },
    audio: { hit() {} },
    world: { heightAt() { return 0; } },
    mode: 'hunt',
    elapsed: 1,
  };
  return { combat: new CombatSystem(game), game, player, enemies, fxEvents };
}

for (const classId of classIds) {
  const { combat, game, enemies, fxEvents } = makeCombat(classId, 30);
  const source = enemies[0];
  combat._damageEnemy(source, 100, { cannotCrit: true });
  for (let i = 0; i < 6; i += 1) combat.update(0.1);
  const derived = enemies.flatMap(enemy => enemy.hits)
    .filter(hit => hit.options.sameCastHit?.key?.startsWith('weapon-'));
  ok(derived.length >= 3 && derived.length <= 16, `${classId} live resonance lands bounded bonus hits (${derived.length})`);
  ok(derived.every(hit => hit.amount > 0 && hit.options.multiHit), `${classId} resonance hits are positive bounded multi-hit damage`);
  ok(fxEvents.some(event => event.key === 'burst') && fxEvents.some(event => event.key === 'slash' || event.key === 'ring'),
    `${classId} resonance emits visible combat feedback`);
  const before = derived.length;
  combat._damageEnemy(source, 100, { cannotCrit: true });
  const after = enemies.flatMap(enemy => enemy.hits)
    .filter(hit => hit.options.sameCastHit?.key?.startsWith('weapon-')).length;
  ok(after === before, `${classId} resonance cooldown blocks same-frame proc spam`);
  game.elapsed += 1;
}

const baseProbe = makeCombat('aerin', 0);
const baseEnemy = baseProbe.enemies[0];
baseProbe.combat._damageEnemy(baseEnemy, 100, { cannotCrit: true, weaponProcDerived: true });
const baseAmount = baseEnemy.hits[0].amount;
const resonanceProbe = makeCombat('aerin', 3);
const resonanceEnemy = resonanceProbe.enemies[0];
resonanceProbe.combat._damageEnemy(resonanceEnemy, 100, { cannotCrit: true, weaponProcDerived: true });
ok(resonanceEnemy.hits[0].amount >= Math.round(baseAmount * 1.06), '+3 resonance immediately amplifies every landed hit');

const executeProbe = makeCombat('aerin', 20);
const executeEnemy = executeProbe.enemies[0];
executeEnemy.hp = executeEnemy.maxHp * 0.2;
executeProbe.combat._damageEnemy(executeEnemy, 100, { cannotCrit: true, weaponProcDerived: true });
ok(executeEnemy.hits[0].options.finisher === true, '+20 resonance turns low-health hits into finishers');

if (failures.length) {
  console.error(`\n${failures.length} weapon-progression failure(s):`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exitCode = 1;
  throw new Error('weapon progression validation failed');
}

console.log('\nweapon-progression: rapid stats, seven milestones, and four live class procs passed');
