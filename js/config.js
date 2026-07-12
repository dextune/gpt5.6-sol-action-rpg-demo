export const GAME_CONFIG = Object.freeze({
  title: 'GPT-5.6: Sol / Action RPG DEMO',
  saveKey: 'gpt5.6-sol-arpg-demo-v1',
  saveVersion: 4,
  worldRadius: 172,
  terrainSize: 360,
  terrainSegments: 144,
  autoSaveSeconds: 24,
  maxDelta: 0.05,
  targetEnemies: 28,
  maxEnemies: 42,
  spawnInnerRadius: 18,
  spawnOuterRadius: 46,
  despawnRadius: 78,
  cameraDistance: 14.8,
  cameraMinDistance: 8.5,
  // Wide scroll zoom so the full diorama / hunting field is readable.
  cameraMaxDistance: 52,
  cameraHeight: 15.4,
  cameraHeightPerDistance: .42,
  cameraLookHeight: 1.25,
  campRadius: 15,
  respawnPosition: [0, 0, 6],
});

/**
 * Defense mode tuning — endless climb capped at maxWave.
 * Enemy curves stay soft early (waves 1–15) then ramp for the deep climb to 200.
 * Hero runMods + gear floors are owned by DefenseSystem / LootSystem (Hunt untouched).
 */
export const DEFENSE_CONFIG = Object.freeze({
  maxWave: 200,
  prepSeconds: 2.6,
  // Roster density (gentler early, denser late).
  baseCount: 5,
  countPerThreeWaves: 1,
  maxCount: 36,
  // Linear soft terms (Enemy multiplies with #defenseWaveHp / #defenseWaveDmg).
  hpPerWave: 0.055,
  dmgPerWave: 0.032,
  // Extra late-game ramp after softStartWave (keeps wave 200 dangerous).
  hpLatePow: 1.28,
  dmgLatePow: 1.18,
  hpLateScale: 0.72,
  dmgLateScale: 0.42,
  lateDivisor: 48,
  softStartWave: 12,
  levelBonusPerWave: 0.28,
  eliteStartWave: 5,
  eliteChanceBase: 0.04,
  eliteChancePerWave: 0.008,
  eliteChanceCap: 0.48,
  miniBossEvery: 5,
  // Clear rewards — hero must outpace monsters.
  clearXpBase: 70,
  clearXpPerWave: 28,
  clearGoldBase: 18,
  clearGoldPerWave: 9,
  gearEveryWaves: 2,
  // Start-of-run hero pad (Defense only; applied in Game.startDefense).
  startLevel: 3,
  startPotions: 5,
  startSkillPoints: 2,
  startAttackMul: 1.18,
  startDefenseMul: 1.14,
  startSkillPower: 0.12,
  // Per cleared wave runMods growth (compounded on player.runMods).
  runAttackPerWave: 0.018,
  runDefensePerWave: 0.012,
  runSkillPowerPerWave: 0.014,
  runHastePerWave: 0.004,
  // Milestone power shards every N waves.
  powerShardEvery: 5,
  powerShardAttack: 0.055,
  powerShardSkill: 0.05,
  powerShardDefense: 0.04,
  // Between-wave recovery.
  clearHealRatio: 0.38,
  clearMpRatio: 0.55,
  // Gear item-level / stat scale vs wave.
  gearLevelPerWave: 0.55,
  gearPowerPerWave: 0.009,
  spawnInner: 10,
  spawnOuter: 22,
});

/** Defense-only HP multiplier for a wave index (1-based). Hunt never calls this. */
export function defenseWaveHpMul(wave) {
  const w = Math.max(0, Number(wave) || 0);
  if (w <= 0) return 1;
  const cfg = DEFENSE_CONFIG;
  const linear = 1 + (w - 1) * cfg.hpPerWave;
  const late = Math.pow(Math.max(0, w - cfg.softStartWave) / cfg.lateDivisor, cfg.hpLatePow) * cfg.hpLateScale;
  return linear + late;
}

/** Defense-only damage multiplier for a wave index (1-based). */
export function defenseWaveDmgMul(wave) {
  const w = Math.max(0, Number(wave) || 0);
  if (w <= 0) return 1;
  const cfg = DEFENSE_CONFIG;
  const linear = 1 + (w - 1) * cfg.dmgPerWave;
  const late = Math.pow(Math.max(0, w - cfg.softStartWave) / cfg.lateDivisor, cfg.dmgLatePow) * cfg.dmgLateScale;
  return linear + late;
}

/** Rarity floor for Defense gear drip / drops at a wave. */
export function defenseRarityFloor(wave) {
  const w = Math.max(1, Number(wave) || 1);
  if (w >= 140) return 'legendary';
  if (w >= 70) return 'epic';
  if (w >= 35) return 'epic';
  if (w >= 18) return 'rare';
  if (w >= 8) return 'uncommon';
  if (w >= 3) return 'uncommon';
  return 'common';
}

export const PLAYER_CONFIG = Object.freeze({
  baseHp: 140,
  baseMp: 80,
  baseAttack: 12,
  baseDefense: 4,
  baseCrit: 0.06,
  moveSpeed: 7.8,
  acceleration: 32,
  friction: 18,
  dashSpeed: 23,
  dashDuration: 0.22,
  dashCooldown: 0.92,
  potionHealRatio: 0.42,
  potionCooldown: 2,
  // Fraction of defense subtracted from incoming damage.
  defenseSoak: 0.46,
  inventoryLimit: 48,
});

export const COLORS = Object.freeze({
  ink: 0x172130,
  gold: 0xffd36d,
  cyan: 0x67dcff,
  danger: 0xff5d72,
  heal: 0x67ef9b,
  arcane: 0xb283ff,
  common: 0xcbd4dc,
  uncommon: 0x7de89c,
  rare: 0x61baff,
  epic: 0xbb79ff,
  legendary: 0xffc45c,
});
