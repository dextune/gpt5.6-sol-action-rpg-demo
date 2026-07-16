/**
 * Combat skill / energy effect registry contract (game-layer).
 *
 * LOCKED — effect ids listed here must match CombatSystem.skillHandlers keys
 * and content SKILLS[].effect values for actives. Template cores must NOT import
 * this file; only Sol combat rules may.
 *
 * Handlers remain implemented on CombatSystem (private methods). This module
 * owns the *stable key list* and validation so content/integrity can audit the
 * surface without scraping a 3k-line file forever.
 */

/** Active skill effect ids dispatched by CombatSystem.skillHandlers */
export const SKILL_EFFECT_HANDLER_KEYS = Object.freeze([
  'whirlwind',
  'crescent',
  'skyfall',
  'starburst',
  'fireball',
  'frost_nova',
  'arcane_blink',
  'meteor_storm',
  'twin_fang',
  'fan_of_knives',
  'shadowstep',
  'death_lotus',
  'piercing_shot',
  'caltrop_trap',
  'vault_shot',
  'hunter_mark',
]);

/** Energy burst effect ids dispatched by CombatSystem.energyHandlers */
export const ENERGY_HANDLER_KEYS = Object.freeze([
  'dagger_rush',
  'wrath_slam',
  'arrow_storm',
]);

/**
 * Assert a handler map covers every registered effect key.
 * @param {Record<string, Function>} handlers
 * @param {readonly string[]} keys
 * @param {string} label
 */
export function assertHandlerKeys(handlers, keys = SKILL_EFFECT_HANDLER_KEYS, label = 'skillHandlers') {
  if (!handlers || typeof handlers !== 'object') {
    throw new Error(`${label}: missing handler map`);
  }
  const missing = [];
  const nonFn = [];
  for (const key of keys) {
    if (!(key in handlers)) missing.push(key);
    else if (typeof handlers[key] !== 'function') nonFn.push(key);
  }
  if (missing.length || nonFn.length) {
    throw new Error(
      `${label} incomplete: missing=[${missing.join(',')}] nonFunction=[${nonFn.join(',')}]`,
    );
  }
  return true;
}

/**
 * Extra keys on the map that are not in the locked registry (warn surface for agents).
 * @param {Record<string, unknown>} handlers
 * @param {readonly string[]} keys
 */
export function extraHandlerKeys(handlers, keys = SKILL_EFFECT_HANDLER_KEYS) {
  const allowed = new Set(keys);
  return Object.keys(handlers ?? {}).filter(k => !allowed.has(k));
}
