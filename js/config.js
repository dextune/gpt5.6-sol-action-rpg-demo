export const GAME_CONFIG = Object.freeze({
  title: 'GPT-5.6: Sol / Action RPG DEMO',
  saveKey: 'gpt5.6-sol-arpg-demo-v1',
  saveVersion: 5,
  worldRadius: 172,
  terrainSize: 360,
  terrainSegments: 144,
  autoSaveSeconds: 24,
  maxDelta: 0.05,
  targetEnemies: 60,
  maxEnemies: 90,
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
  // Roster density (gentler early, denser late). Higher body count — per-mob HP curve softens below.
  baseCount: 10,
  countPerThreeWaves: 2,
  maxCount: 80,
  // Linear soft terms (Enemy multiplies with #defenseWaveHp / #defenseWaveDmg).
  // Slightly lower per-wave HP because fodder + higher roster counts keep total TTK similar.
  hpPerWave: 0.045,
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
  goldMilestoneEveryWaves: 2,
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
  spawnInner: 10,
  spawnOuter: 22,
});

/**
 * Horde density — fodder tier, pack spawn, animation skip budget.
 * Fodder is a soft tier (stat + UI + anim rate); no VAT/InstancedMesh in v1.
 */
export const HORDE_CONFIG = Object.freeze({
  fodderHpMul: 0.35,
  fodderXpMul: 0.3,
  fodderDmgMul: 0.7,
  /** Fraction of Hunt field spawns marked fodder (elites/bosses never fodder). */
  fodderRatio: 0.7,
  packMin: 4,
  packMax: 8,
  packTelegraphSec: 0.55,
  /** When field spawn fires, chance to spawn a pack instead of a single. */
  packChance: 0.55,
  /** Beyond this distance, fodder animation updates at half rate. */
  animSkipDistance: 35,
});

/**
 * Growth loop — kill CDR/MP refund, level-up nova, Hunt chain attack bumps.
 * Numbers only; hooks live on Game / Player.
 */
export const GROWTH_CONFIG = Object.freeze({
  killCdrFodder: 0.12,
  killCdrElite: 0.35,
  killCdrBoss: 2.0,
  /** Floor remaining CD after kill refund (prevents zero-CD spam). */
  killCdrFloor: 0.15,
  killMpFodder: 1.5,
  killMpElite: 4,
  killMpBoss: 12,
  levelNovaRadius: 4.5,
  levelNovaFodderDamage: 9999,
  levelNovaNonFodderHpFrac: 0.35,
  levelNovaInvuln: 1.2,
  levelNovaKnockback: 8.5,
  chainAttackEvery: 50,
  chainAttackBump: 0.02,
  chainAttackCap: 1.5,
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
  /** Sharp reverse / large-turn accel boost (Player.#move). */
  reverseAccel: 92,
  /** Dot threshold below which reverseAccel applies. */
  reverseDotThreshold: 0.25,
  dashSpeed: 23,
  dashDuration: 0.22,
  dashCooldown: 0.92,
  potionHealRatio: 0.42,
  potionCooldown: 2,
  // Fraction of defense subtracted from incoming damage.
  defenseSoak: 0.46,
  // Kept for save/UI compatibility; the live game has one signature weapon.
  inventoryLimit: 1,
  /** Soft control / debuff move multiplier while slowed. */
  debuffSlowMoveMul: 0.72,
  /** Move speed treated as sprint for setLocomotion (× moveSpeed). */
  sprintMoveRatio: 1.12,
  /** Crit chance hard cap; overflow converts to crit damage. */
  critChanceCap: 0.65,
  /** Base crit multiplier before overflow. */
  critMultiplierBase: 1.85,
  /** Crit damage per unit crit-chance overflow. */
  critOverflowToDamage: 1.5,
  /** Attack-speed hard cap; overflow feeds energy gain. */
  attackSpeedCap: 1.75,
  /** Energy gain mul per unit attack-speed overflow. */
  attackSpeedOverflowEnergy: 2,
  /** Pickup radius base + luck scale. */
  pickupRadiusBase: 2.2,
  pickupRadiusPerLuck: 0.5,
  /** Passive MP regen while exploring. */
  mpRegenPerSec: 5.2,
  /** Camp heal: distance + HP/MP rates. */
  campRadius: 14.2,
  campHpHealRatioPerSec: 0.065,
  campMpRegenPerSec: 12,
  /** On restore/respawn invulnerability. */
  restoreInvuln: 1.4,
  /** Hit reaction invulnerability window. */
  hitInvuln: 0.46,
  hitTimer: 0.19,
});

/**
 * Hit-reaction clip severity (static-resource motion S4).
 * Changing heavyRatio cascades clip choice without editing Player bodies.
 */
export const HIT_REACTION_CONFIG = Object.freeze({
  /** damage/maxHp ≥ this → hit_heavy (also amount ≥ heavyAmount). */
  heavyRatio: 0.18,
  heavyAmount: 42,
  /** damage/maxHp ≤ this → hit_light (also amount ≤ lightAmount). */
  lightRatio: 0.055,
  lightAmount: 10,
  /** Playback presentation. */
  lightFade: 0.055,
  lightFadeOut: 0.07,
  lightTimeScale: 1.08,
  heavyFade: 0.07,
  heavyFadeOut: 0.12,
  heavyTimeScale: 0.95,
});

/**
 * Basic-attack / cast presentation feel (not skill combat mults — those stay in content).
 * Scale combo timing, lunge, and anim fades from one place.
 */
export const BASIC_ATTACK_FEEL = Object.freeze({
  /** Cooldown base (sec) before / attackSpeed: [non-finisher, finisher] + perIndex. */
  cooldownBase: 0.25,
  cooldownFinisher: 0.44,
  cooldownPerCombo: 0.016,
  /** Attack anim duration base / attackSpeed (capped). */
  animBase: 0.17,
  animFinisher: 0.34,
  animPerCombo: 0.01,
  animSpeedCap: 1.7,
  /** Lunge impulse scale. */
  lungeBase: 1.35,
  lungePerCombo: 0.22,
  lungeFinisher: 2.4,
  lungeSpeedCap: 1.15,
  lungeVelocityFrac: 0.35,
  lungeTimer: 0.07,
  lungeTimerFinisher: 0.12,
  /** Clip timeScale. */
  timeScaleMul: 1.35,
  timeScaleFinisherMul: 1.02,
  timeScaleCap: 2.15,
  /** Late-chain visual speed boost from combo index ≥ lateComboFrom. */
  lateComboFrom: 4,
  lateBoostBase: 1.08,
  lateBoostPerStep: 0.04,
  /** Cross-fades into attack / skill / dodge. */
  attackFade: 0.09,
  attackFadeOut: 0.12,
  attackFadeOutFinisher: 0.16,
  skillFade: 0.12,
  skillFadeOut: 0.16,
  skillTimeScaleSlow: 0.92,
  skillTimeScaleFast: 1.05,
  skillCastSlowThreshold: 0.6,
  skillCadenceMin: 0.5,
  skillCadenceMax: 1.25,
  dodgeFade: 0.07,
  dodgeFadeOut: 0.09,
  dodgeTimeScale: 1.08,
  energyBurstFade: 0.1,
  energyBurstFadeOut: 0.14,
  energyBurstTimeScaleMin: 1.1,
  energyBurstTimeScaleRef: 1.3,
  deathFade: 0.12,
  deathFadeOut: 0.2,
  /** Combo window seconds. */
  comboWindow: 0.72,
  comboWindowFinisherExtra: 0.52,
  comboWindowPerLength: 0.02,
  /** Move slow while attacking / casting. */
  attackMoveMul: 0.42,
  attackLungeMoveMul: 0.72,
  castMoveMul: 0.28,
  /** Mesh yaw blend during attack. */
  attackYawBlend: 28,
});

/** Consumable drops are the one survival exception to gold-only enemy rewards. */
export const LOOT_CONFIG = Object.freeze({
  potionDropChance: Object.freeze({
    normal: 0.12,
    elite: 0.30,
    boss: 1,
  }),
  potionDropAmount: 1,
});

/** Signature weapon growth. Every class uses the same progression rules. */
export const WEAPON_ENHANCE = Object.freeze({
  maxLevel: 30,
  powerStep: 0.075,
  speedStep: 0.004,
  costBase: 42,
  costPerLevel: 8,
  costPow: 1.32,
  /** Success chance when attempting to reach the next weapon level. */
  successByTarget: Object.freeze({
    1: 0.95,
    2: 0.90,
    3: 0.82,
    4: 0.72,
    5: 0.60,
    6: 0.48,
    7: 0.38,
    8: 0.30,
    9: 0.24,
    10: 0.18,
  }),
});

/** Weapon option growth. Options unlock and improve independently of evolution. */
export const WEAPON_OPTION_ENHANCE = Object.freeze({
  maxLevel: 20,
  optionSlots: 4,
  costBase: 64,
  costPerLevel: 11,
  costPow: 1.38,
  steps: Object.freeze({
    crit: 0.012,
    haste: 0.012,
    leech: 0.006,
    skillPower: 0.016,
    goldBonus: 0.018,
    luck: 0.014,
  }),
});

/** Legacy inventory enhance tuning kept for save/UI compatibility. */
export const GEAR_ENHANCE = Object.freeze({
  maxLevel: 10,
  /** Flat stats (power/defense/hp/moveSpeed) scale from base by this per level. */
  flatStep: 0.08,
  /** Percentage stats scale from base by this per level. */
  pctStep: 0.05,
  costBase: 28,
  costPerItemLevel: 4,
  /** Multiplier on cost: (enhanceLevel + 1) ** costLevelPow */
  costLevelPow: 1.55,
  rarityCost: Object.freeze({
    common: 1,
    uncommon: 1.25,
    rare: 1.65,
    epic: 2.2,
    legendary: 3,
  }),
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
