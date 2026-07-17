/**
 * MAX HUNT regression suite — pure helpers + shipped Player/Hunt/Save paths.
 * Wired into tests/integrity.mjs. Does not reimplement production formulas.
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from '../vendor/three.module.min.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const ok = (condition, message) => {
  if (condition) console.log(`✓ ${message}`);
  else {
    failures.push(message);
    console.error(`✗ ${message}`);
  }
};

const config = await import(pathToFileURL(join(root, 'js/config.js')).href);
const content = await import(pathToFileURL(join(root, 'js/data/content.js')).href);
const huntThreat = await import(pathToFileURL(join(root, 'js/systems/huntThreat.js')).href);
const { SaveManager, normalizeSaveData } = await import(pathToFileURL(join(root, 'js/core/SaveManager.js')).href);
const { HuntSystem } = await import(pathToFileURL(join(root, 'js/systems/HuntSystem.js')).href);
const { Player } = await import(pathToFileURL(join(root, 'js/entities/Player.js')).href);
const { enhanceWeaponOptions, recomputeWeaponFromEnhance } = await import(
  pathToFileURL(join(root, 'js/systems/LootSystem.js')).href
);

const {
  GAME_CONFIG, MAX_HUNT_CONFIG, HUNT_SPAWN_CONFIG, HUNT_THREAT_CONFIG,
} = config;
const {
  HERO_CLASSES, SKILLS, MAX_HUNT_CLASS_PRESETS, MAX_HUNT_INVASION_ROSTER, ZONES, ENEMY_TYPES,
  createClassStarterWeapon, getClassSkillIds,
} = content;
const {
  maxHuntSpawnLevel, maxHuntBossKillEstimate, composeHuntRewardMul, maxHuntRewardScale,
  huntPopulationProfile, clampHuntSpawnLevel, huntRewardMul,
} = huntThreat;

console.log('\n--- max-hunt ---\n');

// —— Config / content contract ——
ok(Boolean(MAX_HUNT_CONFIG), 'MAX_HUNT_CONFIG exported');
ok(GAME_CONFIG.saveVersion === 6, 'saveVersion is 6');
ok(MAX_HUNT_CONFIG.baseline.level === 70, 'baseline level 70');
ok(MAX_HUNT_CONFIG.baseline.weaponEnhance === 20, 'baseline weapon +20');
ok(MAX_HUNT_CONFIG.baseline.optionEnhance === 12, 'baseline option +12');
ok(MAX_HUNT_CONFIG.baseline.activeRank === 7, 'active rank 7');
ok(MAX_HUNT_CONFIG.baseline.passiveRank === 6, 'passive rank 6');
ok(MAX_HUNT_CONFIG.baseline.finalPassiveRank === 4, 'final passive rank 4');
ok(MAX_HUNT_CONFIG.baseline.unspentSkillPoints === 13, '13 unspent points');
ok(
  MAX_HUNT_CONFIG.baseline.spentSkillPoints + MAX_HUNT_CONFIG.baseline.unspentSkillPoints
    === MAX_HUNT_CONFIG.baseline.earnedSkillPoints,
  'skill-point accounting 56 spent + 13 unspent = 69',
);
ok(MAX_HUNT_CONFIG.openingPopulation === 64, 'T+0 opening population 64');
ok(MAX_HUNT_CONFIG.surgePopulation >= 96, 'T+3 surge at least 96');
ok(MAX_HUNT_CONFIG.steadyTarget === 104, 'steady target 104');
ok(MAX_HUNT_CONFIG.maxEnemies === 128, 'hard cap 128');
ok(MAX_HUNT_CONFIG.sectors === 8 && MAX_HUNT_CONFIG.enemiesPerSector === 8, '8×8 opening sectors');

const classIds = Object.keys(HERO_CLASSES);
ok(classIds.length === 5, 'five playable classes');
ok(classIds.includes('gunner'), 'gunner is a playable class');
ok(classIds.every(id => MAX_HUNT_CLASS_PRESETS[id]), 'presets for all playable classes');

for (const classId of classIds) {
  const preset = MAX_HUNT_CLASS_PRESETS[classId];
  const hero = HERO_CLASSES[classId];
  for (const [skillId, choiceId] of Object.entries(preset.mutations)) {
    ok(hero.activeSkills.includes(skillId), `${classId} preset skill ${skillId} is class active`);
    const mut = SKILLS[skillId]?.evolution?.mutations?.[40]?.[choiceId];
    ok(Boolean(mut), `${classId} mutation ${skillId}/${choiceId} is legal`);
  }
}

ok(MAX_HUNT_INVASION_ROSTER.length >= 12, 'invasion roster has multiple entries');
for (const entry of MAX_HUNT_INVASION_ROSTER) {
  const data = ENEMY_TYPES[entry.id];
  ok(Boolean(data) && !data.boss, `invasion roster ${entry.id} is non-boss enemy`);
}

// —— Pure spawn level policy ——
const normalMin = maxHuntSpawnLevel({ playerLevel: 70, role: 'frontline', rngOffset: 0 });
const normalMax = maxHuntSpawnLevel({ playerLevel: 70, role: 'frontline', rngOffset: 1 });
ok(normalMin >= 78 && normalMax <= 84, `MAX normal band at 70 is 78–84 (got ${normalMin}–${normalMax})`);
const fodderMin = maxHuntSpawnLevel({ playerLevel: 70, role: 'fodder_swarm', rngOffset: 0 });
const fodderMax = maxHuntSpawnLevel({ playerLevel: 70, role: 'fodder_swarm', rngOffset: 1 });
ok(fodderMin >= 76 && fodderMax <= 80, `MAX fodder band at 70 is 76–80 (got ${fodderMin}–${fodderMax})`);
const eliteMin = maxHuntSpawnLevel({ playerLevel: 70, elite: true, rngOffset: 0 });
const eliteMax = maxHuntSpawnLevel({ playerLevel: 70, elite: true, rngOffset: 1 });
ok(eliteMin >= 82 && eliteMax <= 86, `MAX elite band at 70 is 82–86 (got ${eliteMin}–${eliteMax})`);
const bossLv = maxHuntSpawnLevel({ playerLevel: 70, boss: true, rngOffset: 0.5 });
ok(bossLv >= 84 && bossLv <= 88, `MAX boss band ~84–88 (got ${bossLv})`);

// MAX bypasses early-zone clamp; legacy still clamps.
const rawHigh = 80;
const clamped = clampHuntSpawnLevel(rawHigh, ZONES.verdant);
ok(clamped <= ZONES.verdant.maxLevel + HUNT_THREAT_CONFIG.spawnMaxSlack,
  'legacy clamp respects verdant early-zone max');
ok(maxHuntSpawnLevel({ playerLevel: 70, role: 'normal', rngOffset: 1 }) > clamped,
  'MAX spawn level bypasses early-zone clamp for village');

// World tier is NOT folded into spawn level (apply once in Enemy stats only).
const lvNoWt = maxHuntSpawnLevel({ playerLevel: 70, role: 'normal', rngOffset: 0.5 });
ok(lvNoWt === 70 + Math.round(
  MAX_HUNT_CONFIG.levelOffsets.normal[0]
    + (MAX_HUNT_CONFIG.levelOffsets.normal[1] - MAX_HUNT_CONFIG.levelOffsets.normal[0]) * 0.5,
), 'spawn level is player + offset only (no double WT)');

// —— Population profile ——
const maxPop = huntPopulationProfile(true);
const legacyPop = huntPopulationProfile(false);
ok(maxPop.opening === 64 && maxPop.surge >= 96 && maxPop.maxEnemies === 128, 'MAX population profile');
ok(legacyPop.maxEnemies === GAME_CONFIG.maxEnemies, 'legacy population uses GAME_CONFIG cap');
ok(legacyPop.opening === HUNT_SPAWN_CONFIG.initialEnemies, 'legacy opening matches HUNT_SPAWN_CONFIG');

// —— Boss charge range ——
const ordinaryKills = maxHuntBossKillEstimate(MAX_HUNT_CONFIG.bossCharge);
ok(ordinaryKills >= 70 && ordinaryKills <= 80,
  `boss charge ~70–80 ordinary kills (got ${ordinaryKills})`);

// —— Reward compose once ——
const threatOnly = huntRewardMul(0);
const maxXp = composeHuntRewardMul(0, { isMax: true, kind: 'xp' });
ok(Math.abs(maxXp - threatOnly * maxHuntRewardScale('xp')) < 1e-9, 'MAX XP mul composes once with threat');
ok(composeHuntRewardMul(0, { isMax: false, kind: 'xp' }) === threatOnly, 'legacy reward unchanged');
ok(maxHuntRewardScale('gold') === MAX_HUNT_CONFIG.rewards.gold, 'gold reward scale from config');

// —— HuntSystem variant / campSafe ——
const huntGame = {
  player: {
    level: 70,
    luck: 0.1,
    skillPoints: 0,
    position: new THREE.Vector3(0, 0, 6),
  },
  mode: 'hunt',
  state: 'playing',
  enemies: { activeBoss: null, livingCount: 0, enemies: [], spawnBoss() { return null; }, spawnPack() { return []; }, spawn() { return null; } },
  world: {
    currentZone: ZONES.verdant,
    randomSpawnAround() { return new THREE.Vector3(20, 0, 0); },
    resolvePosition() {},
    zoneAt() { return ZONES.verdant; },
  },
  effects: { ring() {}, pillar() {}, burst() {} },
  ui: { notify() {}, floatText() {} },
  audio: { levelUp() {}, boss() {} },
  loot: { grantContractReward: () => ({ gold: 100 }) },
  requestSave() {},
  defer() {},
};
const hunt = new HuntSystem(huntGame);
huntGame.hunt = hunt;
hunt.reset({ variant: 'max' });
ok(hunt.variant === 'max' && hunt.isMax === true, 'MAX hunt.variant/isMax');
ok(hunt.campSafe === false, 'MAX campSafe === false');
ok(hunt.contract?.type === 'breach' && hunt.contract.target === 60, 'opening VILLAGE BREACH contract');
ok(hunt.contract.label === 'VILLAGE BREACH', 'breach contract label English');

hunt.reset({ variant: 'legacy' });
ok(hunt.variant === 'legacy' && !hunt.isMax, 'legacy variant');
ok(hunt.campSafe === true, 'legacy campSafe === true');

// Boss charge under MAX table
hunt.reset({ variant: 'max' });
let chargeKills = 0;
while (hunt.bossCharge < 100 && chargeKills < 200) {
  hunt.onKill({
    elite: false,
    boss: false,
    typeId: 'dew_blob',
    data: { zone: 'verdant' },
  });
  chargeKills += 1;
}
ok(chargeKills >= 70 && chargeKills <= 80, `HuntSystem MAX boss charge fills in ${chargeKills} ordinary kills`);

// —— Save migration v5 → legacy ——
const storage = new Map();
globalThis.localStorage = {
  getItem: key => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};
const v5Blob = {
  version: 5,
  savedAt: 1,
  player: { level: 32, classId: 'wizard', gold: 400, skillPoints: 2, skills: {}, inventory: [], equipped: {} },
  hunt: { totalKills: 410, elitesKilled: 12, bossesKilled: 1 },
  playTime: 120,
  defenseMeta: { bestWave: 40, lastWave: 22, runs: 3 },
};
const migrated = normalizeSaveData(v5Blob);
ok(migrated?.version === 6, 'v5 normalizes to version 6');
ok(migrated?.hunt?.variant === 'legacy', 'v5 without variant migrates to legacy');
ok(migrated?.player?.level === 32, 'migration does not raise player level');
ok(migrated?.defenseMeta?.bestWave === 40, 'Defense meta preserved on migration');
ok(migrated?.migrated === true, 'migrated flag set for v5');

const again = normalizeSaveData(migrated);
ok(again?.hunt?.variant === 'legacy' && again?.player?.level === 32, 'normalization is idempotent');

const maxSave = normalizeSaveData({
  version: 6,
  player: { level: 70, classId: 'aerin', gold: 2500 },
  hunt: { variant: 'max', maxBaselineVersion: 1, totalKills: 10 },
  defenseMeta: { bestWave: 5, lastWave: 5, runs: 1 },
});
ok(maxSave?.hunt?.variant === 'max', 'MAX save keeps max variant');
ok(maxSave?.defenseMeta?.runs === 1, 'Defense meta survives MAX save normalize');

const saveManager = new SaveManager();
ok(saveManager.save({
  player: maxSave.player,
  hunt: maxSave.hunt,
  playTime: 10,
  defenseMeta: maxSave.defenseMeta,
}), 'MAX save write');
const summary = saveManager.getSummary();
ok(summary?.variant === 'max' && summary?.level === 70, 'Continue summary carries MAX variant');
saveManager.clear();

// —— Player baseline (real applyMaxHuntBaseline) ——
const animStub = {
  play() {}, playOneShot() {}, setLocomotion() {}, update() {}, dispose() {}, has: () => true,
};
const factoryStub = {
  outlines: { unregister() {} },
  createHero({ classId }) {
    const group = new THREE.Group();
    return { group, classId, refs: { group, classId, modelHeight: 3 }, animation: animStub };
  },
  equipWeapon() {},
  clearWeapons() {},
};

for (const classId of classIds) {
  const scene = new THREE.Scene();
  const player = new Player(scene, factoryStub, 'low', classId);
  player.reset(classId);
  const goldBefore = player.gold;
  player.applyMaxHuntBaseline();
  ok(player.level === 70, `${classId} baseline level 70`);
  ok(player.xp === 0, `${classId} XP 0 toward 71`);
  ok(player.gold === MAX_HUNT_CONFIG.baseline.gold, `${classId} starting gold 2500`);
  ok(player.potions === 5 && player.maxPotions >= 5, `${classId} potions 5/5`);
  ok(player.hp === player.maxHp && player.mp === player.maxMp, `${classId} full HP/MP`);
  ok(Number.isFinite(player.attackPower) && player.attackPower > 0, `${classId} attackPower finite`);
  ok((Number(player.weapon?.weaponEnhanceLevel) || 0) === 20, `${classId} weapon +20`);
  ok((Number(player.weapon?.optionEnhanceLevel) || 0) === 12, `${classId} option +12`);
  ok(player.skillPoints === 13, `${classId} 13 unspent skill points`);

  const hero = HERO_CLASSES[classId];
  let spent = 0;
  for (const id of hero.activeSkills) {
    const rank = player.skills[id] ?? 0;
    ok(rank === 7, `${classId} active ${id} rank 7`);
    spent += rank;
  }
  const passives = hero.passiveSkills;
  for (let i = 0; i < passives.length; i += 1) {
    const id = passives[i];
    const expected = i === passives.length - 1 ? 4 : 6;
    const rank = player.skills[id] ?? 0;
    ok(rank === expected, `${classId} passive ${id} rank ${expected}`);
    spent += rank;
  }
  ok(spent === 56, `${classId} spent ranks total 56 (got ${spent})`);

  const preset = MAX_HUNT_CLASS_PRESETS[classId];
  for (const [skillId, choiceId] of Object.entries(preset.mutations)) {
    const evo = player.skillEvolution?.[skillId];
    ok(evo?.tier40 === choiceId, `${classId} mutation ${skillId} → ${choiceId}`);
  }

  // Class-distinct: different classes keep different starter weapon models/classIds
  ok(player.weapon?.classId === classId, `${classId} weapon classId matches`);

  // Level 71 still awards a point and increases stats
  const atk70 = player.attackPower;
  const sp70 = player.skillPoints;
  const result = player.addXp(player.xpNeeded);
  ok(result.levelUps?.includes(71), `${classId} can level to 71`);
  ok(player.level === 71, `${classId} level becomes 71`);
  ok(player.skillPoints === sp70 + 1, `${classId} level-up grants +1 skill point`);
  ok(player.attackPower >= atk70, `${classId} attack does not drop on level-up`);

  // Serialize / load does NOT re-grant baseline
  const snap = player.serialize();
  const goldSnap = snap.gold;
  const ranksSnap = { ...snap.skills };
  const optSnap = Number(snap.inventory?.[0]?.optionEnhanceLevel) || 0;
  const wSnap = Number(snap.inventory?.[0]?.weaponEnhanceLevel) || 0;
  player.load(snap, { resolvePosition() {} });
  ok(player.gold === goldSnap, `${classId} load does not regrant gold`);
  ok((Number(player.weapon?.weaponEnhanceLevel) || 0) === wSnap, `${classId} load weapon level stable`);
  ok((Number(player.weapon?.optionEnhanceLevel) || 0) === optSnap, `${classId} load option level stable`);
  for (const id of getClassSkillIds(classId)) {
    ok((player.skills[id] ?? 0) === (ranksSnap[id] ?? 0), `${classId} load rank ${id} stable`);
  }

  // Second apply after reset is intentional new-run (exactly one baseline)
  player.reset(classId);
  ok(player.level === 1 && player.gold === goldBefore, `${classId} reset returns to level-1 clean state`);
  player.applyMaxHuntBaseline();
  ok(player.gold === 2500 && player.level === 70, `${classId} re-apply baseline is exact once`);

  player.dispose?.();
}

// Hunt serialize / load no baseline grant
const huntMax = new HuntSystem(huntGame);
huntMax.reset({ variant: 'max' });
huntMax.totalKills = 50;
const huntBlob = huntMax.serialize();
ok(huntBlob.variant === 'max', 'hunt serialize variant max');
const huntLoaded = new HuntSystem(huntGame);
huntLoaded.load(huntBlob);
ok(huntLoaded.isMax && huntLoaded.totalKills === 50, 'hunt load preserves max + kills');
ok(huntLoaded.invasionPhase === 'steady', 'Continue resume uses steady pressure phase');
// Incomplete breach must survive Continue so progress is not wiped.
ok(
  huntLoaded.contract?.type === 'breach'
    && huntLoaded.contract.complete === false
    && huntLoaded.contract.progress === 0,
  'incomplete opening breach restores on load',
);

// Completed VILLAGE BREACH must not re-issue on load (Continue re-grant bug).
const huntBreachDone = new HuntSystem(huntGame);
huntBreachDone.reset({ variant: 'max' });
ok(huntBreachDone.contract?.type === 'breach', 'fresh MAX seeds breach contract');
// Drive real completion path via onKill (not hand-waved complete flag alone).
let rewardGrants = 0;
huntGame.loot.grantContractReward = () => {
  rewardGrants += 1;
  return { gold: 100 };
};
const breachTarget = huntBreachDone.contract.target;
for (let i = 0; i < breachTarget; i += 1) {
  huntBreachDone.onKill({
    elite: false,
    boss: false,
    typeId: 'dew_blob',
    data: { zone: 'verdant' },
  });
}
ok(huntBreachDone.contract?.complete === true, 'breach contract marked complete after target kills');
ok(huntBreachDone.completedContracts === 1, 'completedContracts is 1 after breach');
ok(rewardGrants === 1, 'opening breach reward granted exactly once');
const completedBlob = huntBreachDone.serialize();
ok(completedBlob.contract?.complete === true, 'serialize retains complete:true breach');
ok(completedBlob.completedContracts === 1, 'serialize completedContracts === 1');

const huntAfterContinue = new HuntSystem(huntGame);
rewardGrants = 0;
huntAfterContinue.load(completedBlob);
ok(huntAfterContinue.isMax, 'post-breach Continue stays MAX');
ok(huntAfterContinue.completedContracts === 1, 'completedContracts preserved on load');
ok(
  huntAfterContinue.contract === null,
  'completed breach does not reopen as a fresh incomplete contract on load',
);
// update would seed a normal contract — never a second VILLAGE BREACH opener.
huntAfterContinue.update(0);
ok(
  !huntAfterContinue.contract || huntAfterContinue.contract.type !== 'breach',
  'next contract after completed breach is not VILLAGE BREACH',
);
// Even if something left a phantom incomplete breach, filling it must not double-pay.
// (With the fix, contract is non-breach or null-then-replaced; completedContracts stays 1.)
const completedBeforePhantom = huntAfterContinue.completedContracts;
if (huntAfterContinue.contract?.type === 'breach' && !huntAfterContinue.contract.complete) {
  const t = huntAfterContinue.contract.target;
  for (let i = 0; i < t; i += 1) {
    huntAfterContinue.onKill({
      elite: false, boss: false, typeId: 'dew_blob', data: { zone: 'verdant' },
    });
  }
}
ok(
  huntAfterContinue.completedContracts === completedBeforePhantom
    || (huntAfterContinue.contract?.type !== 'breach'),
  'Continue after completed breach does not re-grant opening breach reward',
);
ok(rewardGrants === 0, 'no second breach reward grant on load/Continue path');

// Idempotent load of the completed save never re-seeds breach progress 0.
huntAfterContinue.load(completedBlob);
ok(huntAfterContinue.contract === null, 'second load of completed breach stays null');
ok(huntAfterContinue.completedContracts === 1, 'second load keeps completedContracts at 1');

// Defense isolation: MAX config must not rewrite defense wave tables
ok(config.DEFENSE_CONFIG.maxWave === 200, 'Defense maxWave unchanged');
ok(config.DEFENSE_CONFIG.baseCount === 12, 'Defense baseCount unchanged');
ok(MAX_HUNT_CONFIG.maxEnemies !== GAME_CONFIG.maxEnemies, 'MAX hard cap is distinct from legacy');

// Contested spring constants
ok(MAX_HUNT_CONFIG.contestedSpring.contestedHpMul === 0.25, 'contested HP mul 25%');
ok(MAX_HUNT_CONFIG.contestedSpring.enemyRadius === 12, 'contest radius 12m');

// Weapon rebuild path used by baseline (authoritative helpers)
const starter = createClassStarterWeapon('aerin');
starter.weaponEnhanceLevel = 20;
recomputeWeaponFromEnhance(starter);
ok(starter.weaponEnhanceLevel === 20 && starter.power > 0, 'recomputeWeaponFromEnhance +20 works');
for (let i = 0; i < 12; i += 1) enhanceWeaponOptions(starter);
ok(starter.optionEnhanceLevel === 12, 'option enhance loop to +12');

if (failures.length) {
  console.error(`\n${failures.length} max-hunt failure(s):`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}
console.log(`\nMAX HUNT checks passed · ${classIds.length} classes · pure + Player baseline\n`);
