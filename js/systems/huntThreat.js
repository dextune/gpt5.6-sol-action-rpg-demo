/**
 * Hunt threat / on-level helpers (pure + light data).
 * Zone floors stay authoritative; this only labels, clamps, softcaps, and rewards.
 * MAX HUNT spawn-level / reward pure helpers live here for integrity tests without Three.js.
 */
import {
  GAME_CONFIG,
  HUNT_SPAWN_CONFIG,
  HUNT_THREAT_CONFIG,
  MAX_HUNT_CONFIG,
} from '../config.js';
import { ZONES } from '../data/content.js';
import { clamp } from '../core/Utils.js';

const CFG = HUNT_THREAT_CONFIG;

/**
 * @param {number} gap enemy.level|zone.minLevel − player.level
 * @returns {{ id: string, label: string, color: number }}
 */
export function threatFromGap(gap) {
  const g = Number(gap) || 0;
  let id = 'onlevel';
  if (g <= CFG.safeMaxGap) id = 'safe';
  else if (g <= CFG.onLevelMaxGap) id = 'onlevel';
  else if (g <= CFG.challengeMaxGap) id = 'challenging';
  else if (g <= CFG.dangerMaxGap) id = 'danger';
  else id = 'lethal';
  return {
    id,
    label: CFG.labels[id] ?? id,
    color: CFG.colors[id] ?? CFG.colors.onlevel,
  };
}

/** Zone threat vs player: uses zone.minLevel as the band floor signal. */
export function zoneThreat(playerLevel, zone) {
  const min = Number(zone?.minLevel) || 1;
  return threatFromGap(min - (Number(playerLevel) || 1));
}

/** Unit threat vs player. */
export function unitThreat(playerLevel, enemyLevel) {
  return threatFromGap((Number(enemyLevel) || 1) - (Number(playerLevel) || 1));
}

/**
 * Incoming damage multiplier for positive unit level gaps (Hunt softcap).
 * Applied on player receive only.
 */
export function receiveDamageMul(levelGap) {
  const gap = Number(levelGap) || 0;
  if (gap <= 0) return 1;
  const table = CFG.receiveGapMul;
  if (!table?.length) return 1;
  if (gap <= table[0].gap) return table[0].mul;
  for (let i = 1; i < table.length; i += 1) {
    const a = table[i - 1];
    const b = table[i];
    if (gap <= b.gap) {
      const t = (gap - a.gap) / Math.max(0.001, b.gap - a.gap);
      return a.mul + (b.mul - a.mul) * t;
    }
  }
  return Math.max(CFG.receiveMulFloor ?? 0.3, table[table.length - 1].mul);
}

/** XP/gold mul from unit level gap (on-level bias, grey penalty, danger premium). */
export function huntRewardMul(levelGap) {
  const t = threatFromGap(levelGap);
  if (t.id === 'safe') return CFG.underLevelRewardMul;
  if (t.id === 'onlevel') return CFG.onLevelRewardMul;
  if (t.id === 'challenging') return CFG.challengeRewardMul;
  return CFG.dangerRewardMul;
}

/**
 * Clamp Hunt spawn level into zone band (+slack). Keeps floors; caps runaway adaptive.
 * @param {number} raw
 * @param {{ minLevel?: number, maxLevel?: number }} zone
 */
export function clampHuntSpawnLevel(raw, zone) {
  const min = Math.max(1, Number(zone?.minLevel) || 1);
  const max = Math.max(min, (Number(zone?.maxLevel) || min) + (CFG.spawnMaxSlack ?? 3));
  return clamp(Math.round(Number(raw) || min), min, max);
}

/**
 * Best on-level hunting zone for a player level.
 * Prefers true in-band zones (player inside min–max), then near-band, never lethal first.
 */
export function recommendedZoneId(playerLevel, zones = ZONES) {
  const level = Math.max(1, Math.round(Number(playerLevel) || 1));
  let bestId = 'verdant';
  let bestScore = -Infinity;
  for (const zone of Object.values(zones)) {
    if (!zone?.id) continue;
    const min = Number(zone.minLevel) || 1;
    const max = Number(zone.maxLevel) || min;
    const mid = (min + max) * 0.5;
    const distMid = Math.abs(level - mid);
    const inBand = level >= min && level <= max;
    const nearBand = level >= min - 2 && level <= max + 4;
    const gap = min - level;
    const threat = threatFromGap(gap);
    let score = 0;
    if (inBand) {
      // Strong preference for zones the player is already leveled into.
      score = 200 - distMid;
    } else if (nearBand) {
      score = 90 - distMid * 1.4;
    } else if (threat.id === 'safe') {
      // Greys: prefer the highest safe band still near the player.
      score = 50 + gap - distMid * 0.2;
    } else if (threat.id === 'challenging') {
      score = 40 - gap;
    } else if (threat.id === 'danger') {
      score = 10 - gap;
    } else {
      score = -30 - gap;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = zone.id;
    }
  }
  return bestId;
}

export function recommendedZone(playerLevel, zones = ZONES) {
  const id = recommendedZoneId(playerLevel, zones);
  return zones[id] ?? zones.verdant;
}

/** English ribbon line: `Lv.8–24 · On-level` */
export function zoneBandSubtitle(zone, playerLevel) {
  const min = zone?.minLevel ?? 1;
  const max = zone?.maxLevel ?? min;
  const threat = zoneThreat(playerLevel, zone);
  return `Lv.${min}–${max} · ${threat.label}`;
}

/** English toast line with player level. */
export function zoneToastDetail(zone, playerLevel) {
  const min = zone?.minLevel ?? 1;
  const max = zone?.maxLevel ?? min;
  const threat = zoneThreat(playerLevel, zone);
  const lv = Math.max(1, Math.round(Number(playerLevel) || 1));
  return `${zone?.subtitle ?? ''} · Recommended Lv.${min}–${max} · Your Lv.${lv} · ${threat.label}`;
}

/** Hunt tip string for start / contract hint. */
export function recommendedHuntTip(playerLevel, zones = ZONES) {
  const zone = recommendedZone(playerLevel, zones);
  return `Hunt tip · ${zone.name} (Lv.${zone.minLevel}–${zone.maxLevel}) fits you`;
}

/**
 * MAX HUNT spawn level — player-relative only (no zone clamp, no world-tier add).
 * Enemy still multiplies WT into stats once; do not fold WT into this number.
 *
 * @param {{ playerLevel: number, role?: string, elite?: boolean, boss?: boolean, rngOffset?: number }} opts
 *   rngOffset in [0,1] selects within the role offset band (0 = min, 1 = max).
 */
export function maxHuntSpawnLevel({
  playerLevel = 1,
  role = 'normal',
  elite = false,
  boss = false,
  rngOffset = 0.5,
} = {}) {
  const pl = Math.max(1, Math.round(Number(playerLevel) || 1));
  const offsets = MAX_HUNT_CONFIG.levelOffsets;
  let band = offsets.normal;
  if (boss) band = offsets.boss;
  else if (elite) band = offsets.elite;
  else if (role === 'fodder_swarm' || role === 'fodder') band = offsets.fodder;
  const t = clamp(Number(rngOffset) || 0, 0, 1);
  const lo = Number(band[0]) || 0;
  const hi = Number(band[1]) || lo;
  const offset = Math.round(lo + (hi - lo) * t);
  return Math.max(1, pl + offset);
}

/**
 * Ordinary kills needed to fill boss charge under a charge table (no elites).
 * @param {{ normal?: number, elite?: number, threshold?: number }} table
 * @param {{ eliteEvery?: number }} [opts]
 */
export function maxHuntBossKillEstimate(table = MAX_HUNT_CONFIG.bossCharge, opts = {}) {
  const normal = Math.max(0.01, Number(table.normal) || 1.3);
  const elite = Math.max(0, Number(table.elite) || 0);
  const threshold = Math.max(1, Number(table.threshold) || 100);
  const eliteEvery = Math.max(0, Math.round(Number(opts.eliteEvery) || 0));
  if (!eliteEvery || elite <= 0) {
    return Math.ceil(threshold / normal);
  }
  // Approximate mixed field: one elite every N ordinary kills.
  let charge = 0;
  let kills = 0;
  while (charge < threshold && kills < 500) {
    kills += 1;
    charge += (kills % eliteEvery === 0) ? elite : normal;
  }
  return kills;
}

/** MAX HUNT reward scale for a reward kind (xp/gold/contract/boss). Composes once with threat mul. */
export function maxHuntRewardScale(kind = 'xp') {
  const key = kind === 'contract' || kind === 'boss' || kind === 'gold' || kind === 'xp' ? kind : 'xp';
  return Math.max(0, Number(MAX_HUNT_CONFIG.rewards[key]) || 1);
}

/**
 * Compose threat bias with optional MAX HUNT scale exactly once.
 * @param {number} levelGap enemy.level − player.level
 * @param {{ isMax?: boolean, kind?: string }} [opts]
 */
export function composeHuntRewardMul(levelGap, opts = {}) {
  const base = huntRewardMul(levelGap);
  if (!opts.isMax) return base;
  return base * maxHuntRewardScale(opts.kind ?? 'xp');
}

/** Population targets for MAX vs legacy (pure; systems read the same table). */
export function huntPopulationProfile(isMax) {
  if (isMax) {
    return Object.freeze({
      opening: MAX_HUNT_CONFIG.openingPopulation,
      surge: MAX_HUNT_CONFIG.surgePopulation,
      surgeSeconds: MAX_HUNT_CONFIG.surgeSeconds,
      steady: MAX_HUNT_CONFIG.steadyTarget,
      maxEnemies: MAX_HUNT_CONFIG.maxEnemies,
      capBuffer: MAX_HUNT_CONFIG.capBuffer,
      sparseLiving: MAX_HUNT_CONFIG.sparseLiving,
      sparseInterval: MAX_HUNT_CONFIG.sparseInterval,
      steadyInterval: MAX_HUNT_CONFIG.steadyInterval,
      spawnInner: MAX_HUNT_CONFIG.spawnInnerRadius,
      spawnOuter: MAX_HUNT_CONFIG.spawnOuterRadius,
      packMin: MAX_HUNT_CONFIG.packMin,
      packMax: MAX_HUNT_CONFIG.packMax,
      respawnImmediate: MAX_HUNT_CONFIG.respawn.immediate,
    });
  }
  return Object.freeze({
    opening: HUNT_SPAWN_CONFIG.initialEnemies,
    surge: HUNT_SPAWN_CONFIG.initialEnemies,
    surgeSeconds: 0,
    steady: GAME_CONFIG.targetEnemies,
    maxEnemies: GAME_CONFIG.maxEnemies,
    capBuffer: HUNT_SPAWN_CONFIG.capBuffer,
    sparseLiving: HUNT_SPAWN_CONFIG.sparseLiving,
    sparseInterval: HUNT_SPAWN_CONFIG.sparseInterval,
    steadyInterval: HUNT_SPAWN_CONFIG.steadyInterval,
    spawnInner: GAME_CONFIG.spawnInnerRadius,
    spawnOuter: GAME_CONFIG.spawnOuterRadius,
    packMin: 5,
    packMax: 9,
    respawnImmediate: HUNT_SPAWN_CONFIG.respawnEnemies,
  });
}
