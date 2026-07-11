/**
 * Pure skill combat helpers — unit-testable without WebGL / DOM.
 * CombatSystem handlers must read numbers through these APIs.
 */

/** Resolve [base, perRank] or plain number at skill rank (1+). */
export function resolveScaled(value, rank = 1) {
  const r = Math.max(0, Number(rank) || 0);
  if (Array.isArray(value)) {
    const base = Number(value[0]) || 0;
    const per = Number(value[1]) || 0;
    return base + per * r;
  }
  return Number(value) || 0;
}

/**
 * Build a plain combat snapshot from SKILLS[id].combat at rank.
 * Unknown keys pass through; scaled pairs become numbers.
 */
export function skillCombatAtRank(skill, rank = 1) {
  const combat = skill?.combat ?? {};
  const out = {};
  for (const [key, value] of Object.entries(combat)) {
    if (key === 'status') {
      out.status = value ? { ...value } : null;
      continue;
    }
    if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number') {
      out[key] = resolveScaled(value, rank);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Base skill damage from attack power + combat mult (skillPower applied later in hit resolution). */
export function skillDamage(attackPower, combat, multKey = 'mult') {
  const mult = combat?.[multKey] ?? 1;
  return (Number(attackPower) || 0) * mult;
}

/**
 * Final outgoing damage before enemy armor — single place for skillPower / crit.
 * Handlers must pass raw from skillDamage() and skill:true without pre-multiplying skillPower
 * unless skillPowerApplied is set (projectiles that already baked skillPower into damage).
 */
export function resolveSkillHitRaw(rawDamage, options = {}) {
  const skill = Boolean(options.skill);
  const skillPowerApplied = Boolean(options.skillPowerApplied);
  const skillPower = Number(options.skillPower) || 1;
  const critical = Boolean(options.critical);
  const critMultiplier = Number(options.critMultiplier) || 1.85;
  const skillMul = skill && !skillPowerApplied ? skillPower : 1;
  return (Number(rawDamage) || 0) * (critical ? critMultiplier : 1) * skillMul;
}

/**
 * Status application merge (pure).
 * @param {Record<string, object>} current
 * @param {string} id
 * @param {{ duration?: number, power?: number, tick?: number, dps?: number }} opts
 */
export function applyStatus(current, id, opts = {}) {
  const next = { ...(current || {}) };
  const prev = next[id] || {};
  const duration = Math.max(prev.remaining ?? 0, opts.duration ?? 1);
  next[id] = {
    id,
    remaining: duration,
    power: opts.power ?? prev.power ?? 1,
    tick: opts.tick ?? prev.tick ?? 0.5,
    tickAcc: prev.tickAcc ?? 0,
    dps: opts.dps ?? prev.dps ?? 0,
  };
  return next;
}

/**
 * Advance statuses by delta. Returns { statuses, dotDamage, expired[] }.
 * dotDamage is the frame's total damage-over-time (burn, bleed, …) — caller multiplies / rounds.
 */
export function tickStatuses(statuses, delta) {
  const next = {};
  const expired = [];
  let dotDamage = 0;
  for (const [id, st] of Object.entries(statuses || {})) {
    const remaining = (st.remaining ?? 0) - delta;
    if (remaining <= 0) {
      expired.push(id);
      continue;
    }
    const copy = { ...st, remaining };
    if ((id === 'burn' || id === 'bleed') && (copy.dps ?? 0) > 0) {
      copy.tickAcc = (copy.tickAcc ?? 0) + delta;
      const interval = Math.max(0.12, copy.tick ?? 0.5);
      while (copy.tickAcc >= interval) {
        copy.tickAcc -= interval;
        dotDamage += copy.dps * interval;
      }
    }
    next[id] = copy;
  }
  return { statuses: next, dotDamage, expired };
}

/** Movement multiplier from active statuses (slow stacks as strongest). */
export function statusMoveMul(statuses) {
  const slow = statuses?.slow;
  if (!slow || (slow.remaining ?? 0) <= 0) return 1;
  const power = Math.min(0.85, Math.max(0.1, slow.power ?? 0.4));
  return 1 - power;
}

/** Whether a skill uses animation-normalized hit phases. */
export function skillUsesAnimTimeline(skill) {
  return Boolean(skill?.timeline?.hits?.length);
}

/** Knight skill clip names that wizard must not alias. */
export const KNIGHT_SKILL_CLIPS = Object.freeze([
  'skill_whirlwind',
  'skill_crescent',
  'skill_skyfall',
  'skill_starburst',
]);
