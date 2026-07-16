/**
 * Builds CombatSystem.skillHandlers / energyHandlers tables (Sol combat).
 * Implementations live on the instance via attach*Methods; this module owns wiring.
 */
import {
  ENERGY_HANDLER_KEYS,
  SKILL_EFFECT_HANDLER_KEYS,
  assertHandlerKeys,
} from './skillEffectRegistry.js';

export function createSkillHandlers(combat) {
  const table = {
    whirlwind: (p, bundle, phase, audio) => combat._whirlwind(p, bundle, phase, audio),
    crescent: (p, bundle, phase, audio) => combat._crescent(p, bundle, phase, audio),
    skyfall: (p, bundle, phase, audio) => combat._skyfall(p, bundle, phase, audio),
    starburst: (p, bundle, phase, audio) => combat._starburst(p, bundle, phase, audio),
    fireball: (p, bundle, phase, audio) => combat._fireball(p, bundle, phase, audio),
    frost_nova: (p, bundle, phase, audio) => combat._frostNova(p, bundle, phase, audio),
    arcane_blink: (p, bundle, _phase, audio) => combat._arcaneBlink(p, bundle, audio),
    meteor_storm: (p, bundle, _phase, audio) => combat._meteorStorm(p, bundle, audio),
    twin_fang: (p, bundle, phase, audio) => combat._twinFang(p, bundle, phase, audio),
    fan_of_knives: (p, bundle, phase, audio) => combat._fanOfKnives(p, bundle, phase, audio),
    shadowstep: (p, bundle, _phase, audio) => combat._shadowstep(p, bundle, audio),
    death_lotus: (p, bundle, phase, audio) => combat._deathLotus(p, bundle, phase, audio),
    piercing_shot: (p, bundle, phase, audio) => combat._piercingShot(p, bundle, phase, audio),
    caltrop_trap: (p, bundle, _phase, audio) => combat._caltropTrap(p, bundle, audio),
    vault_shot: (p, bundle, _phase, audio) => combat._vaultShot(p, bundle, audio),
    hunter_mark: (p, bundle, _phase, audio) => combat._hunterMark(p, bundle, audio),
  };
  assertHandlerKeys(table, SKILL_EFFECT_HANDLER_KEYS, 'CombatSystem.skillHandlers');
  // Mutable map: tests and runtime may replace handlers; keys still assert-locked.
  return table;
}

export function createEnergyHandlers(combat) {
  const table = {
    dagger_rush: (p, def) => combat._daggerRushBurst(p, def),
    wrath_slam: (p, def) => combat._wrathSlamBurst(p, def),
    arrow_storm: (p, def) => combat._arrowStormBurst(p, def),
  };
  assertHandlerKeys(table, ENERGY_HANDLER_KEYS, 'CombatSystem.energyHandlers');
  return table;
}
