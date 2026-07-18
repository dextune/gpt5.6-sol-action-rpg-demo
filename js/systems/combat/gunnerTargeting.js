/**
 * Pure Gunner Smartlink + rifle hitscan helpers (no Three.js scene required).
 */
import { GUNNER_CONFIG } from '../../config.js';
import { clamp } from '../../core/Utils.js';
import { compareAutoTargets } from './targetPriority.js';

const isLiveHostile = enemy => Boolean(
  enemy?.alive
  && enemy.hostile !== false
  && enemy.removable !== true
  && enemy.active !== false,
);

/**
 * @param {object} enemy
 * @param {{ x: number, z: number }} origin
 * @param {{ acquireRange?: number, retainRange?: number }} limits
 */
export function isValidGunnerTarget(enemy, origin, limits = {}) {
  if (!isLiveHostile(enemy)) return false;
  const maxR = Math.max(
    Number(limits.acquireRange) || GUNNER_CONFIG.smartlink.acquireRange,
    Number(limits.retainRange) || GUNNER_CONFIG.smartlink.retainRange,
  );
  const dx = (enemy.position?.x ?? 0) - origin.x;
  const dz = (enemy.position?.z ?? 0) - origin.z;
  const r = (enemy.radius ?? 0.6);
  const dist = Math.hypot(dx, dz);
  return dist <= maxR + r;
}

/**
 * Single-pass Smartlink selection with shared hero priority.
 * Eligible targets rank boss → elite → normal, then nearest. The front cone is
 * the normal acquisition zone; the smaller rear radius remains an emergency
 * acquisition zone.
 *
 * @param {object[]} enemies
 * @param {{ x: number, z: number }} origin
 * @param {{ x: number, z: number }} facing unit-ish xz
 * @param {string|null} retainedId
 * @param {object} [limits]
 */
export function selectSmartlinkTarget(enemies, origin, facing, retainedId = null, limits = {}) {
  const cfg = GUNNER_CONFIG.smartlink;
  const acquire = Number(limits.acquireRange) || cfg.acquireRange;
  const retain = Number(limits.retainRange) || cfg.retainRange;
  const frontDot = Number(limits.frontDot ?? cfg.frontDot);
  const rearR = Number(limits.rearEmergencyRadius) || cfg.rearEmergencyRadius;
  const fx = facing?.x ?? 0;
  const fz = facing?.z ?? 1;
  const fLen = Math.hypot(fx, fz) || 1;
  const nx = fx / fLen;
  const nz = fz / fLen;

  let retained = null;
  let bestFront = null;
  let bestRear = null;

  const list = enemies ?? [];
  for (let i = 0; i < list.length; i += 1) {
    const enemy = list[i];
    if (!isLiveHostile(enemy)) continue;
    const dx = (enemy.position?.x ?? 0) - origin.x;
    const dz = (enemy.position?.z ?? 0) - origin.z;
    const dist = Math.hypot(dx, dz);
    const radius = enemy.radius ?? 0.6;
    const id = String(enemy.id ?? enemy.entityId ?? enemy.spawnId ?? enemy.typeId ?? i);

    if (retainedId != null && id === String(retainedId) && dist <= retain + radius) {
      retained = enemy;
    }

    const inv = dist > 1e-6 ? 1 / dist : 1;
    const dot = dx * nx * inv + dz * nz * inv;

    if (dist <= acquire + radius && dot >= frontDot) {
      if (!bestFront || compareAutoTargets(enemy, bestFront, origin, i) < 0) bestFront = enemy;
    } else if (dist <= rearR + radius) {
      if (!bestRear || compareAutoTargets(enemy, bestRear, origin, i) < 0) bestRear = enemy;
    }
  }

  let best = bestFront ?? bestRear;
  if (bestFront && bestRear && compareAutoTargets(bestRear, bestFront, origin) < 0) best = bestRear;
  if (retained && (!best || compareAutoTargets(retained, best, origin) < 0)) best = retained;
  return best;
}

/**
 * Nearest intersection along a segment/capsule (hitscan).
 * @returns {{ enemy: object, distance: number, point: { x: number, y: number, z: number } } | null}
 */
export function queryFirstRifleHit(enemies, origin, direction, range = GUNNER_CONFIG.rifleRange, radius = GUNNER_CONFIG.rifleRadius) {
  const dx = direction?.x ?? 0;
  const dz = direction?.z ?? 1;
  const len = Math.hypot(dx, dz) || 1;
  const nx = dx / len;
  const nz = dz / len;
  const maxRange = Math.max(1, Number(range) || GUNNER_CONFIG.rifleRange);
  const capsuleR = Math.max(0.1, Number(radius) || GUNNER_CONFIG.rifleRadius);

  let best = null;
  let bestT = Infinity;
  const list = enemies ?? [];
  for (let i = 0; i < list.length; i += 1) {
    const enemy = list[i];
    if (!isLiveHostile(enemy)) continue;
    const ex = (enemy.position?.x ?? 0) - origin.x;
    const ez = (enemy.position?.z ?? 0) - origin.z;
    const along = ex * nx + ez * nz;
    if (along < 0 || along > maxRange) continue;
    const closestX = origin.x + nx * along;
    const closestZ = origin.z + nz * along;
    const lat = Math.hypot((enemy.position?.x ?? 0) - closestX, (enemy.position?.z ?? 0) - closestZ);
    const hitR = capsuleR + (enemy.radius ?? 0.6);
    if (lat > hitR) continue;
    if (along < bestT) {
      bestT = along;
      best = {
        enemy,
        distance: along,
        point: {
          x: closestX,
          y: origin.y ?? 1.1,
          z: closestZ,
        },
      };
    }
  }
  return best;
}

/**
 * Ordered intersections along one rifle lane. Keeps only the nearest `cap` hits,
 * so Suppressive Burst does not repeatedly rediscover the first target.
 */
export function queryRifleLaneHits(
  enemies,
  origin,
  direction,
  range = GUNNER_CONFIG.rifleRange,
  radius = GUNNER_CONFIG.rifleRadius,
  cap = 4,
) {
  const dx = direction?.x ?? 0;
  const dz = direction?.z ?? 1;
  const len = Math.hypot(dx, dz) || 1;
  const nx = dx / len;
  const nz = dz / len;
  const maxRange = Math.max(1, Number(range) || GUNNER_CONFIG.rifleRange);
  const capsuleR = Math.max(0.1, Number(radius) || GUNNER_CONFIG.rifleRadius);
  const maxHits = Math.max(1, Math.round(Number(cap) || 1));
  const hits = [];

  for (let i = 0; i < (enemies?.length ?? 0); i += 1) {
    const enemy = enemies[i];
    if (!isLiveHostile(enemy)) continue;
    const ex = (enemy.position?.x ?? 0) - origin.x;
    const ez = (enemy.position?.z ?? 0) - origin.z;
    const along = ex * nx + ez * nz;
    if (along < 0 || along > maxRange) continue;
    const lateral = Math.hypot(ex - nx * along, ez - nz * along);
    if (lateral > capsuleR + (enemy.radius ?? 0.6)) continue;

    const id = String(enemy.id ?? enemy.entityId ?? enemy.spawnId ?? enemy.typeId ?? i);
    const hit = {
      enemy,
      distance: along,
      id,
      point: {
        x: origin.x + nx * along,
        y: origin.y ?? 1.1,
        z: origin.z + nz * along,
      },
    };
    let insertAt = hits.length;
    while (insertAt > 0) {
      const previous = hits[insertAt - 1];
      if (previous.distance < along - 1e-9
        || (Math.abs(previous.distance - along) <= 1e-9 && previous.id <= id)) break;
      insertAt -= 1;
    }
    hits.splice(insertAt, 0, hit);
    if (hits.length > maxHits) hits.pop();
  }
  return hits.map(({ id: _id, ...hit }) => hit);
}

/**
 * Cone query for Flame Jet — returns up to `cap` living enemies in the cone.
 */
export function queryFlameConeHits(enemies, origin, direction, cone = {}) {
  const range = Number(cone.range) || GUNNER_CONFIG.flameJet.range;
  const halfAngle = Number(cone.halfAngle) || GUNNER_CONFIG.flameJet.halfAngle;
  const cosMin = Math.cos(halfAngle);
  const dx = direction?.x ?? 0;
  const dz = direction?.z ?? 1;
  const len = Math.hypot(dx, dz) || 1;
  const nx = dx / len;
  const nz = dz / len;
  const cap = Math.max(1, Math.round(Number(cone.cap) || 16));
  const hits = [];
  const list = enemies ?? [];
  for (let i = 0; i < list.length; i += 1) {
    const enemy = list[i];
    if (!isLiveHostile(enemy)) continue;
    const ex = (enemy.position?.x ?? 0) - origin.x;
    const ez = (enemy.position?.z ?? 0) - origin.z;
    const dist = Math.hypot(ex, ez);
    if (dist > range + (enemy.radius ?? 0.6)) continue;
    if (dist > 1e-4) {
      const dot = (ex * nx + ez * nz) / dist;
      if (dot < cosMin) continue;
    }
    const id = String(enemy.id ?? enemy.entityId ?? enemy.spawnId ?? enemy.typeId ?? i);
    let insertAt = hits.length;
    while (insertAt > 0) {
      const previous = hits[insertAt - 1];
      if (previous.distance < dist - 1e-9
        || (Math.abs(previous.distance - dist) <= 1e-9 && previous.id <= id)) break;
      insertAt -= 1;
    }
    hits.splice(insertAt, 0, { enemy, distance: dist, id });
    if (hits.length > cap) hits.pop();
  }
  return hits.map(h => h.enemy);
}

export function getGunnerBasicAttackSpec(comboStep = 0) {
  const rounds = GUNNER_CONFIG.comboRounds;
  const mults = GUNNER_CONFIG.comboMults;
  const step = clamp(Math.round(Number(comboStep) || 0), 0, rounds.length - 1);
  return Object.freeze({
    rounds: rounds[step] ?? 1,
    mult: mults[step] ?? 1,
    range: GUNNER_CONFIG.rifleRange,
    radius: GUNNER_CONFIG.rifleRadius,
    isFinisher: step >= rounds.length - 1,
  });
}
