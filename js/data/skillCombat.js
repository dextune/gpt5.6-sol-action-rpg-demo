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

/** Clamp an untrusted persisted rank without auto-unlocking rank-zero skills. */
export function normalizeSkillRank(skill, value) {
  const rank = Math.max(0, Math.floor(Number(value) || 0));
  const declaredMax = Number(skill?.maxRank);
  return Number.isFinite(declaredMax) && declaredMax >= 0
    ? Math.min(Math.floor(declaredMax), rank)
    : rank;
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

const EVOLUTION_FORM_LEVELS = Object.freeze([20, 60, 100]);
const EVOLUTION_MUTATION_LEVELS = Object.freeze([40, 80]);
const EVOLUTION_MILESTONES = Object.freeze([20, 40, 60, 80, 100]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, nested] of Object.entries(value)) out[key] = cloneValue(nested);
  return out;
}

function mergeValue(base, addition) {
  if (!isPlainObject(addition)) return cloneValue(addition);
  const out = isPlainObject(base) ? cloneValue(base) : {};
  for (const [key, value] of Object.entries(addition)) {
    out[key] = isPlainObject(value) ? mergeValue(out[key], value) : cloneValue(value);
  }
  return out;
}

function freezeValue(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeValue(nested);
  return Object.freeze(value);
}

function mutationChoiceKey(level) {
  return `tier${level}`;
}

/** Return the documented mutation ids for a milestone in stable declaration order. */
export function skillMutationOptions(skill, level) {
  const choices = skill?.evolution?.mutations?.[level];
  return isPlainObject(choices) ? Object.keys(choices) : [];
}

/** Resolve a choice id, falling back to the first documented option. */
export function resolveSkillMutationChoice(skill, level, choice) {
  const options = skillMutationOptions(skill, level);
  return options.includes(choice) ? choice : (options[0] ?? null);
}

/** Return a copied mutation selection with one valid tier replaced (respec-safe). */
export function updateSkillMutationChoices(skill, current, level, choice, context = null) {
  const gate = Number(level);
  if (context && (
    skill?.passive
    || skill?.classId !== context.classId
    || Number(context.playerLevel) < gate
  )) return null;
  const selected = resolveSkillMutationChoice(skill, gate, choice);
  if (!EVOLUTION_MUTATION_LEVELS.includes(gate) || !selected || selected !== choice) return null;
  if (isPlainObject(current) && current[mutationChoiceKey(gate)] === selected) return null;
  return { ...(isPlainObject(current) ? current : {}), [mutationChoiceKey(gate)]: selected };
}

/**
 * Normalize persisted mutation choices for the supplied skill catalog/scope.
 * Skills without mutation data are omitted, so old content and saves remain unchanged.
 */
export function normalizeSkillEvolutionState(raw, skillsById = {}, allowedSkillIds = Object.keys(skillsById)) {
  if (!isPlainObject(raw)) return {};
  const incoming = raw;
  const normalized = {};
  for (const skillId of allowedSkillIds) {
    const skill = skillsById[skillId];
    const incomingChoices = incoming[skillId];
    if (!skill || !isPlainObject(incomingChoices)) continue;
    const choices = {};
    for (const level of EVOLUTION_MUTATION_LEVELS) {
      const key = mutationChoiceKey(level);
      if (!Object.hasOwn(incomingChoices, key)) continue;
      const selected = resolveSkillMutationChoice(skill, level, incomingChoices[key]);
      if (selected) choices[mutationChoiceKey(level)] = selected;
    }
    if (Object.keys(choices).length) normalized[skillId] = choices;
  }
  return normalized;
}

function validateEvolutionOverlay(overlay, path, errors) {
  if (!isPlainObject(overlay)) {
    errors.push(`${path} must be an object`);
    return;
  }
  for (const key of ['combat', 'presentation', 'timeline']) {
    if (overlay[key] != null && !isPlainObject(overlay[key])) errors.push(`${path}.${key} must be an object`);
  }
  if (overlay.anim != null && (typeof overlay.anim !== 'string' || !overlay.anim.trim())) {
    errors.push(`${path}.anim must be a nonempty string`);
  }
  for (const key of ['label', 'summary']) {
    if (typeof overlay[key] !== 'string' || !overlay[key].trim()) {
      errors.push(`${path}.${key} must be a nonempty English string`);
    }
  }
}

/** Validate the additive evolution schema without requiring evolution data on existing skills. */
export function validateSkillEvolutionSchema(skill) {
  const evolution = skill?.evolution;
  if (evolution == null) return [];
  const errors = [];
  if (!isPlainObject(evolution)) return ['evolution must be an object'];

  if (evolution.forms != null) {
    if (!isPlainObject(evolution.forms)) errors.push('evolution.forms must be an object');
    else for (const [gate, overlay] of Object.entries(evolution.forms)) {
      if (!EVOLUTION_FORM_LEVELS.includes(Number(gate))) errors.push(`unsupported form gate ${gate}`);
      validateEvolutionOverlay(overlay, `evolution.forms.${gate}`, errors);
    }
  }

  if (evolution.mutations != null) {
    if (!isPlainObject(evolution.mutations)) errors.push('evolution.mutations must be an object');
    else for (const [gate, options] of Object.entries(evolution.mutations)) {
      if (!EVOLUTION_MUTATION_LEVELS.includes(Number(gate))) errors.push(`unsupported mutation gate ${gate}`);
      if (!isPlainObject(options) || Object.keys(options).length !== 2) {
        errors.push(`evolution.mutations.${gate} must contain exactly two options`);
        continue;
      }
      for (const [optionId, overlay] of Object.entries(options)) {
        if (!optionId.trim()) errors.push(`evolution.mutations.${gate} option id must be nonempty`);
        validateEvolutionOverlay(overlay, `evolution.mutations.${gate}.${optionId}`, errors);
      }
    }
  }
  return errors;
}

/**
 * Build the immutable runtime bundle for a skill at rank/player level.
 * Forms and unlocked mutations are additive overlays applied chronologically.
 * Presentation contains the existing theme/recipe/sfx identity plus any explicit
 * presentation block. Existing skills without evolution data keep those values.
 */
export function resolveSkillForm(skill, rank = 1, playerLevel = 1, choices = {}) {
  const level = Math.max(1, Number(playerLevel) || 1);
  const resolvedRank = normalizeSkillRank(skill, rank);
  const evolution = skill?.evolution ?? {};
  const activeForms = [];
  const activeMutations = {};
  let combat = cloneValue(skill?.combat ?? {});
  let presentation = cloneValue({
    theme: skill?.theme ?? null,
    recipe: skill?.recipe ?? null,
    sfx: skill?.sfx ?? null,
    ...(skill?.presentation ?? {}),
  });
  let timeline = cloneValue(skill?.timeline ?? {});
  let anim = skill?.anim ?? null;

  const applyOverlay = overlay => {
    if (!isPlainObject(overlay)) return;
    if (overlay.combat) combat = mergeValue(combat, overlay.combat);
    if (overlay.presentation) presentation = mergeValue(presentation, overlay.presentation);
    if (overlay.timeline) timeline = mergeValue(timeline, overlay.timeline);
    if (typeof overlay.anim === 'string' && overlay.anim) anim = overlay.anim;
  };

  for (const gate of EVOLUTION_MILESTONES) {
    if (level < gate) continue;
    if (EVOLUTION_FORM_LEVELS.includes(gate)) {
      const form = evolution.forms?.[gate];
      if (!form) continue;
      applyOverlay(form);
      activeForms.push(gate);
      continue;
    }
    const choiceId = resolveSkillMutationChoice(skill, gate, choices?.[mutationChoiceKey(gate)]);
    const mutation = choiceId ? evolution.mutations?.[gate]?.[choiceId] : null;
    if (!mutation) continue;
    applyOverlay(mutation);
    activeMutations[mutationChoiceKey(gate)] = choiceId;
  }

  const resolvedCombat = skillCombatAtRank({ combat }, resolvedRank);
  return freezeValue({
    id: skill?.id ?? null,
    classId: skill?.classId ?? null,
    effect: skill?.effect ?? skill?.id ?? null,
    rank: resolvedRank,
    playerLevel: level,
    mp: Math.max(0, Number(skill?.mp) || 0),
    cooldown: Math.max(0, Number(skill?.cooldown) || 0),
    castTime: Number.isFinite(Number(skill?.castTime))
      ? Math.max(0, Number(skill.castTime))
      : 0.3,
    combat: resolvedCombat,
    presentation,
    timeline,
    anim,
    animFallback: skill?.animFallback ?? null,
    activeForms,
    mutations: activeMutations,
  });
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
  const status = {
    id,
    remaining: duration,
    power: opts.power ?? prev.power ?? 1,
    tick: opts.tick ?? prev.tick ?? 0.5,
    tickAcc: prev.tickAcc ?? 0,
    dps: opts.dps ?? prev.dps ?? 0,
    // Optional mark amp (hunter_mark expose) — preserved across re-apply.
    damageAmp: opts.damageAmp ?? prev.damageAmp ?? 0,
  };
  if (opts.stackDelta != null || prev.stacks != null) {
    const cap = Math.max(1, Number(opts.stackCap) || Number(prev.stackCap) || Infinity);
    status.stacks = Math.min(cap, Math.max(0, (Number(prev.stacks) || 0) + (Number(opts.stackDelta) || 0)));
    if (Number.isFinite(cap)) status.stackCap = cap;
  }
  next[id] = status;
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
