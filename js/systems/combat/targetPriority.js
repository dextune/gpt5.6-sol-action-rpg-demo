/**
 * Shared auto-target ordering for player attacks and skills.
 * Validity/range/cone filtering stays with each attack; this module only ranks
 * eligible enemies as boss > elite > normal, nearest first within each tier.
 */

export function autoTargetTier(enemy) {
  if (enemy?.boss) return 2;
  if (enemy?.elite) return 1;
  return 0;
}

function distanceSquared(enemy, origin) {
  const dx = (enemy?.position?.x ?? 0) - (origin?.x ?? 0);
  const dz = (enemy?.position?.z ?? 0) - (origin?.z ?? 0);
  return dx * dx + dz * dz;
}

function stableTargetId(enemy, fallbackIndex) {
  return String(enemy?.id ?? enemy?.entityId ?? enemy?.spawnId ?? enemy?.typeId ?? fallbackIndex);
}

export function compareAutoTargets(a, b, origin, aIndex = 0, bIndex = 0) {
  const tierDifference = autoTargetTier(b) - autoTargetTier(a);
  if (tierDifference) return tierDifference;

  const distanceDifference = distanceSquared(a, origin) - distanceSquared(b, origin);
  if (Math.abs(distanceDifference) > 1e-9) return distanceDifference;

  return stableTargetId(a, aIndex).localeCompare(stableTargetId(b, bIndex));
}
