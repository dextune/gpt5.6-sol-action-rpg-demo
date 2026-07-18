export const GAME_CONFIG = Object.freeze({
  title: 'GPT-5.6: Sol / Action RPG DEMO',
  saveKey: 'gpt5.6-sol-arpg-demo-v1',
  saveVersion: 6,
  worldRadius: 172,
  terrainSize: 360,
  terrainSegments: 144,
  autoSaveSeconds: 24,
  maxDelta: 0.05,
  targetEnemies: 72,
  maxEnemies: 108,
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
  titleCameraDistance: 9.2,
  titleCameraHeight: 6.5,
  titleCameraForwardOffset: 1.0,
  titleCameraFocusHeight: 1.9,
  titleCameraFocusForward: .4,
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
  prepSeconds: 2.2,
  // Roster density (gentler early, denser late). Higher body count — per-mob HP curve softens below.
  baseCount: 12,
  countPerThreeWaves: 2,
  maxCount: 80,
  // Champion break (Defense-only spectacle).
  champBreakMax: 100,
  champBreakSkill: 9,
  champBreakBasic: 2.8,
  champBreakCritBonus: 2.2,
  champBreakWindow: 3.8,
  champBreakDamageMul: 1.2,
  // Dark Ring mutator: chip outside camp radius.
  darkRingRadius: 18,
  darkRingDpsRatio: 0.04,
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
  packMin: 5,
  packMax: 9,
  packTelegraphSec: 0.55,
  /** When field spawn fires, chance to spawn a pack instead of a single. */
  packChance: 0.68,
  /** Beyond this distance, fodder animation updates at half rate. */
  animSkipDistance: 35,
});

/** New Hunt field density and refill cadence. Defense owns a separate wave scheduler. */
export const HUNT_SPAWN_CONFIG = Object.freeze({
  initialEnemies: 64,
  respawnEnemies: 52,
  sparseLiving: 28,
  sparseInterval: 0.035,
  steadyInterval: 0.14,
  levelTargetDivisor: 6,
  capBuffer: 6,
  populatePackChance: 0.76,
});

/** New Hunt-only stat growth. Defense keeps its authored level + wave curves. */
export const HUNT_ENEMY_GROWTH_CONFIG = Object.freeze({
  hpPerLevel: 0.108,
  damagePerLevel: 0.068,
  defensePerLevel: 0.055,
  underLevelHpPerLevel: 0.092,
  underLevelDamagePerLevel: 0.055,
  underLevelDefensePerLevel: 0.045,
  worldTierHpPerTier: 0.09,
  hpFloor: 0.72,
});

export function huntEnemyStatMultipliers(extraLevels = 0, worldTier = 1) {
  const levels = Math.max(-4, Number(extraLevels) || 0);
  const hpPerLevel = levels >= 0
    ? HUNT_ENEMY_GROWTH_CONFIG.hpPerLevel
    : HUNT_ENEMY_GROWTH_CONFIG.underLevelHpPerLevel;
  const damagePerLevel = levels >= 0
    ? HUNT_ENEMY_GROWTH_CONFIG.damagePerLevel
    : HUNT_ENEMY_GROWTH_CONFIG.underLevelDamagePerLevel;
  const defensePerLevel = levels >= 0
    ? HUNT_ENEMY_GROWTH_CONFIG.defensePerLevel
    : HUNT_ENEMY_GROWTH_CONFIG.underLevelDefensePerLevel;
  const tierHp = 1 + Math.max(0, (Number(worldTier) || 1) - 1)
    * HUNT_ENEMY_GROWTH_CONFIG.worldTierHpPerTier;
  return {
    hp: Math.max(
      HUNT_ENEMY_GROWTH_CONFIG.hpFloor,
      1 + levels * hpPerLevel,
    ) * tierHp,
    damage: Math.max(0.65, 1 + levels * damagePerLevel)
      * Math.sqrt(tierHp),
    defense: Math.max(0.7, 1 + levels * defensePerLevel),
  };
}

/**
 * Hunt on-level loop — zone/unit threat bands, receive softcap, reward bias, field marks.
 * Pure helpers live in `js/systems/huntThreat.js`.
 */
export const HUNT_THREAT_CONFIG = Object.freeze({
  /** Zone/unit gap thresholds: gap = minLevel|enemy.level − player.level */
  safeMaxGap: -4,
  onLevelMaxGap: 3,
  challengeMaxGap: 7,
  dangerMaxGap: 11,
  /** Spawn level upper slack above zone.maxLevel */
  spawnMaxSlack: 3,
  /** Incoming damage mul by unit level gap (interpolate; floor at last step). */
  receiveGapMul: Object.freeze([
    Object.freeze({ gap: 0, mul: 1 }),
    Object.freeze({ gap: 4, mul: 0.9 }),
    Object.freeze({ gap: 8, mul: 0.7 }),
    Object.freeze({ gap: 12, mul: 0.5 }),
    Object.freeze({ gap: 18, mul: 0.35 }),
  ]),
  receiveMulFloor: 0.3,
  onLevelRewardMul: 1.15,
  underLevelRewardMul: 0.8,
  challengeRewardMul: 1.05,
  dangerRewardMul: 1.2,
  /** Field mark elite ping interval (seconds). */
  fieldMarkMinSec: 45,
  fieldMarkMaxSec: 75,
  /** Pack pressure: force packs when living below this in on-level zones. */
  packPressureLiving: 22,
  packPressureChance: 0.9,
  /** Player-facing threat labels (English). */
  labels: Object.freeze({
    safe: 'Safe',
    onlevel: 'On-level',
    challenging: 'Challenging',
    danger: 'Danger',
    lethal: 'Lethal',
  }),
  /** Hex colors for HUD / minimap / nameplates. */
  colors: Object.freeze({
    safe: 0x7ab89a,
    onlevel: 0x6dff9a,
    challenging: 0xffd56f,
    danger: 0xff9a4a,
    lethal: 0xff4d62,
  }),
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

/**
 * Level / XP / combo-length growth coefficients (parity-preserving extraction).
 * Player getters read only these tables — do not retune under the guise of refactor.
 */
export const PLAYER_GROWTH_CONFIG = Object.freeze({
  hpPerLevel: 12,
  mpPerLevel: 3.4,
  attackPerLevel: 2.15,
  defensePerLevel: 0.82,
  xpBase: 92,
  xpPow: 1.52,
  xpPowScale: 58,
  xpLinear: 22,
  /** Melee basic-combo length gates (first match wins, descending minLevel). */
  comboLengthGates: Object.freeze([
    Object.freeze({ minLevel: 20, length: 7 }),
    Object.freeze({ minLevel: 13, length: 6 }),
    Object.freeze({ minLevel: 8, length: 5 }),
    Object.freeze({ minLevel: 4, length: 4 }),
    Object.freeze({ minLevel: 1, length: 3 }),
  ]),
  /** Magic/ranged fixed combo length. */
  rangedComboLength: 4,
});

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
  attackFadeOutFinisher: 0.18,
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
  /** Linear gold growth shared by Hunt and Defense: Lv.1 = 1x, Lv.100 = 6.94x. */
  goldPerEnemyLevel: 0.06,
  potionDropChance: Object.freeze({
    normal: 0.12,
    elite: 0.30,
    boss: 1,
  }),
  potionDropAmount: 1,
});

export function enemyGoldLevelMul(level = 1) {
  const normalized = Math.max(1, Math.round(Number(level) || 1));
  return 1 + (normalized - 1) * LOOT_CONFIG.goldPerEnemyLevel;
}

/** Signature weapon growth. Every class uses the same progression rules. */
export const WEAPON_ENHANCE = Object.freeze({
  maxLevel: 30,
  /** Base-power growth is multiplied again at each resonance milestone. */
  powerStep: 0.12,
  powerMilestoneStep: 0.08,
  speedStep: 0.008,
  /** Always-on hit amp unlocked with resonance at +3. */
  damageAmpStep: 0.012,
  damageAmpTierStep: 0.025,
  /** +20 resonance turns low-health hits into direct finishers. */
  executeTier: 5,
  executeThreshold: 0.24,
  executeThresholdPerTier: 0.02,
  executeDamage: 0.35,
  executeDamagePerTier: 0.10,
  /** Intrinsic secondary stats granted by every weapon-enhance level. */
  intrinsicSteps: Object.freeze({
    crit: 0.004,
    haste: 0.004,
    leech: 0.0008,
    skillPower: 0.012,
    goldBonus: 0.003,
    luck: 0.003,
  }),
  costBase: 18,
  costPerLevel: 3,
  costPow: 1.14,
  /** Success chance when attempting to reach the next weapon level. */
  successByTarget: Object.freeze({
    1: 1,
    2: 1,
    3: 1,
    4: 1,
    5: 1,
    6: 1,
    7: 1,
    8: 1,
    9: 1,
    10: 1,
  }),
  successFloor: 0.70,
  successBase: 1.01,
  successFalloff: 0.01,
});

/** Weapon option growth. Options unlock and improve independently of evolution. */
export const WEAPON_OPTION_ENHANCE = Object.freeze({
  maxLevel: 20,
  optionSlots: 6,
  costBase: 25,
  costPerLevel: 4,
  costPow: 1.18,
  steps: Object.freeze({
    crit: 0.020,
    haste: 0.020,
    leech: 0.008,
    skillPower: 0.035,
    goldBonus: 0.040,
    luck: 0.030,
  }),
});

/**
 * Gunner Smartlink + rifle basic-attack targeting.
 * Combat owns hitscan; this table is pure numeric policy only.
 */
export const GUNNER_CONFIG = Object.freeze({
  rifleRange: 26,
  rifleRadius: 0.55,
  smartlink: Object.freeze({
    unlockLevel: 5,
    acquireRange: 28,
    retainRange: 31,
    frontDot: 0.15,
    rearEmergencyRadius: 9,
    stickTime: 0.65,
  }),
  comboRounds: Object.freeze([1, 1, 1, 3]),
  comboMults: Object.freeze([0.86, 0.94, 1.02, 0.5]),
  /** Finisher fires 3 visual rounds but procs once. */
  finisherProcCap: 1,
  stim: Object.freeze({
    duration: 6.5,
    attackSpeed: 0.22,
    moveSpeed: 0.18,
  }),
  flameJet: Object.freeze({
    range: 7.2,
    halfAngle: 0.55,
    ticks: 4,
    tickInterval: 0.12,
    burnPerTargetCap: 1,
  }),
  inferno: Object.freeze({
    range: 8.5,
    arc: 2.4,
    zoneCount: 3,
    zoneLife: 3.2,
    zoneRadius: 2.4,
    tickInterval: 0.45,
    maxZones: 6,
  }),
});

/**
 * MAX HUNT — high-pressure Hunt start at a coherent level-70 baseline.
 * World-tier enemy stats stay in Enemy; spawn level policy must not double-count WT.
 * Defense never reads this table.
 */
export const MAX_HUNT_CONFIG = Object.freeze({
  /** Player baseline (applied only on new MAX start). */
  baseline: Object.freeze({
    level: 70,
    xp: 0,
    weaponEnhance: 20,
    optionEnhance: 12,
    activeRank: 7,
    passiveRank: 6,
    finalPassiveRank: 4,
    unspentSkillPoints: 13,
    /** Earned skill points from levels 2..70 (one per level-up). */
    earnedSkillPoints: 69,
    spentSkillPoints: 56,
    gold: 2500,
    potions: 5,
    maxPotions: 5,
    maxBaselineVersion: 1,
  }),
  /** Population / spawn ring. */
  sectors: 8,
  enemiesPerSector: 8,
  openingPopulation: 64,
  surgePopulation: 96,
  surgeSeconds: 3,
  steadyTarget: 104,
  maxEnemies: 128,
  capBuffer: 8,
  packMin: 6,
  packMax: 10,
  spawnInnerRadius: 19,
  spawnOuterRadius: 32,
  aggroRange: 64,
  sparseLiving: 48,
  sparseInterval: 0.04,
  /** Opening/respawn ramps must sample the rising target often enough to keep pace. */
  surgeInterval: 0.04,
  steadyInterval: 0.095,
  /** Respawn pressure after death (not a full opening grant). */
  respawn: Object.freeze({
    immediate: 36,
    recovery3s: 64,
    recovery8s: 80,
  }),
  /**
   * Spawn level offsets vs player (applied once; Enemy still multiplies WT on stats).
   * At player 70 this lands village invaders in the high band (~76–88 by role).
   */
  levelOffsets: Object.freeze({
    fodder: Object.freeze([6, 10]),
    normal: Object.freeze([8, 14]),
    elite: Object.freeze([12, 16]),
    boss: Object.freeze([14, 18]),
  }),
  /** Boss Presence charge (first boss near 70–80 ordinary kills). */
  bossCharge: Object.freeze({
    normal: 1.3,
    elite: 7,
    threshold: 100,
  }),
  eliteLiveCap: 10,
  openingElites: 4,
  invasionRosterLocalWeight: 0.7,
  invasionRosterGlobalWeight: 0.3,
  /** Contested spring: full camp regen only when no enemy within radius. */
  contestedSpring: Object.freeze({
    enemyRadius: 12,
    contestedHpMul: 0.25,
  }),
  /** Reward multipliers compose once with hunt threat bias. */
  rewards: Object.freeze({
    xp: 1.5,
    gold: 1.35,
    contract: 1.5,
    boss: 1.4,
  }),
  openingContract: Object.freeze({
    type: 'breach',
    target: 60,
    rewardTier: 3,
    label: 'VILLAGE BREACH',
    description: 'Defeat 60 invaders. The spring is no longer safe.',
    rewardHint: 'Solid gold · Weapon forge fund · Breach bonus',
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
