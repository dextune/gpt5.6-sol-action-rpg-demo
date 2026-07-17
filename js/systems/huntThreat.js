/**
 * Hunt threat / on-level helpers (pure + light data).
 * Zone floors stay authoritative; this only labels, clamps, softcaps, and rewards.
 */
import { HUNT_THREAT_CONFIG } from '../config.js';
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
