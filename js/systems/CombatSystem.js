import * as THREE from 'three';
import { getClassBasicAttack, getHeroClass, isRangedAttackStyle, SKILLS } from '../data/content.js';
import { getFxTheme } from '../data/fxThemes.js';
import { resolveSkillHitRaw, skillDamage } from '../data/skillCombat.js';
import {
  createProjectileVisual, disposeProjectileVisual, orientProjectile,
} from '../graphics/ProjectileMeshes.js';
import { clamp, rand } from '../core/Utils.js';

const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.telegraphs = [];
    this.delayed = [];
    this.charges = [];
    this.skillCastState = new WeakMap();
    this.frenzyTerminalGeneration = new WeakMap();
    this.spellCastSerial = 0;
    this.wizardCastState = new WeakMap();
    this.wizardCastGeneration = new WeakMap();
    this.rangerGeneration = new WeakMap();
    this.rangerSerial = 0;
    this.apexAudioStates = new WeakMap();
    this.apexAudioSerial = 0;
    this.ownedCastGenerations = new WeakMap();
    this.whirlwindStates = new WeakMap();
    this.twinFangStates = new WeakMap();
    this.crescentStates = new WeakMap();
    this.fanStates = new WeakMap();
    this.starburstStates = new WeakMap();
    this.lotusStates = new WeakMap();
    /** effect id → handler(player, immutable bundle, phase?) */
    this.skillHandlers = {
      whirlwind: (p, bundle, phase, audio) => this.#whirlwind(p, bundle, phase, audio),
      crescent: (p, bundle, phase, audio) => this.#crescent(p, bundle, phase, audio),
      skyfall: (p, bundle, phase, audio) => this.#skyfall(p, bundle, phase, audio),
      starburst: (p, bundle, phase, audio) => this.#starburst(p, bundle, phase, audio),
      fireball: (p, bundle, phase, audio) => this.#fireball(p, bundle, phase, audio),
      frost_nova: (p, bundle, phase, audio) => this.#frostNova(p, bundle, phase, audio),
      arcane_blink: (p, bundle, _phase, audio) => this.#arcaneBlink(p, bundle, audio),
      meteor_storm: (p, bundle, _phase, audio) => this.#meteorStorm(p, bundle, audio),
      twin_fang: (p, bundle, phase, audio) => this.#twinFang(p, bundle, phase, audio),
      fan_of_knives: (p, bundle, phase, audio) => this.#fanOfKnives(p, bundle, phase, audio),
      shadowstep: (p, bundle, _phase, audio) => this.#shadowstep(p, bundle, audio),
      death_lotus: (p, bundle, phase, audio) => this.#deathLotus(p, bundle, phase, audio),
      piercing_shot: (p, bundle, phase, audio) => this.#piercingShot(p, bundle, phase, audio),
      caltrop_trap: (p, bundle, _phase, audio) => this.#caltropTrap(p, bundle, audio),
      vault_shot: (p, bundle, _phase, audio) => this.#vaultShot(p, bundle, audio),
      hunter_mark: (p, bundle, _phase, audio) => this.#hunterMark(p, bundle, audio),
    };
    /** Energy (Focus/Rage) burst id → handler(player, def) → { duration, anim, sfx, floatText } */
    this.energyHandlers = {
      dagger_rush: (p, def) => this.#daggerRushBurst(p, def),
      wrath_slam: (p, def) => this.#wrathSlamBurst(p, def),
      arrow_storm: (p, def) => this.#arrowStormBurst(p, def),
    };
  }

  #skillBundle(bundle) {
    return {
      skill: bundle,
      combat: bundle.combat,
      theme: getFxTheme(bundle.presentation?.theme),
    };
  }

  #beginOwnedCast(player, skillId) {
    const owned = this.ownedCastGenerations.get(player) ?? {};
    const generation = (owned[skillId] ?? 0) + 1;
    owned[skillId] = generation; this.ownedCastGenerations.set(player, owned);
    return Object.freeze({ skillId, generation, classId: player.classId });
  }

  #ownsCast(player, cast) {
    return player.alive && player.classId === cast.classId
      && this.ownedCastGenerations.get(player)?.[cast.skillId] === cast.generation;
  }

  #consumeHitBudget(budget, enemy, cap = 1) {
    const key = enemy.id;
    const used = budget.get(key) ?? 0;
    if (used >= cap) return false;
    budget.set(key, used + 1); return true;
  }

  #beginApexAudio(player, bundle) {
    if (!player?.alive || bundle?.playerLevel < 100 || !bundle?.combat?.apexFinisher
      || bundle?.classId !== player.classId || bundle?.presentation?.apexAudio !== bundle.id) return null;
    const states = this.apexAudioStates.get(player) ?? new Map();
    const state = { id: ++this.apexAudioSerial, bundle, classId: player.classId, phases: new Set(['anticipate']) };
    states.set(bundle.id, state); this.apexAudioStates.set(player, states);
    this.game.audio?.apex?.(bundle.id, 'anticipate');
    return state;
  }

  #apexAudioPhase(player, state, phase) {
    if (!state || (phase !== 'impact' && phase !== 'finisher') || !player?.alive
      || player.classId !== state.classId || state.bundle.classId !== player.classId
      || this.apexAudioStates.get(player)?.get(state.bundle.id) !== state || state.phases.has(phase)) return false;
    if (phase === 'finisher' && !state.phases.has('impact')) return false;
    state.phases.add(phase); this.game.audio?.apex?.(state.bundle.id, phase); return true;
  }

  #applyApexKeystone(player, enemy, context = {}) {
    const bundle = context.bundle;
    const keystone = getHeroClass(player.classId).apexKeystone;
    const expectedTrigger=player.classId==='wizard'?'apex_cast':'apex_finisher';
    if (!keystone || !bundle?.classId || bundle.classId!==player.classId || keystone.trigger!==expectedTrigger
      || bundle.playerLevel < keystone.unlockLevel || !bundle.combat?.apexFinisher
      || !player.alive || !enemy?.alive) return false;
    const budget = context.budget ?? (context.budget = { targets:new Map(), casts:new Set() });
    budget.targets ??= new Map(); budget.casts ??= new Set();
    const castKey = context.castKey ?? bundle.id;
    const theme = context.theme ?? getFxTheme(bundle.presentation?.theme);
    if (keystone.id === 'broken_crown') {
      const armorBreak=enemy.statuses?.armor_break;
      if (!armorBreak || armorBreak.remaining <= 0 || !this.#consumeHitBudget(budget.targets, enemy, keystone.perTargetCap)) return false;
      enemy.addStagger?.(keystone.staggerBonus);
      this.game.effects.recipeApexKeystone?.(enemy.position, player.classId, theme, 1); return true;
    }
    if (keystone.id === 'overflow_overcast') {
      if (!context.overcast || budget.casts.has(castKey)) return false;
      budget.casts.add(castKey);
      const result=this.#damageEnemy(enemy,(context.rawDamage??skillDamage(player.attackPower,bundle.combat))*bundle.combat.overcastMult,{multiHit:true,skill:true,cannotCrit:true,keystoneDerived:true,sameCastHit:{key:`${castKey}:overcast`,maxHits:1}});
      if(result.amount>0)this.game.effects.recipeApexKeystone?.(enemy.position,player.classId,theme,1);return result.amount>0;
    }
    if (keystone.id === 'blood_echo') {
      const tiers=Math.min(keystone.bleedTierCap,Math.max(0,enemy.statuses?.bleed?.stacks??0));
      if(!tiers||budget.targets.size>=keystone.targetCap||budget.targets.has(enemy.id))return false;
      budget.targets.set(enemy.id,tiers);let landed=0;
      for(let tier=0;tier<Math.min(tiers,keystone.perTargetCap);tier+=1){const result=this.#damageEnemy(enemy,(context.rawDamage??0)*keystone.duplicateMult,{multiHit:true,skill:true,cannotCrit:true,keystoneDerived:true,sameCastHit:{key:`${castKey}:blood-echo:${enemy.id}:${tier}`,maxHits:1}});if(result.amount>0)landed+=1;}
      if(landed)this.game.effects.recipeApexKeystone?.(enemy.position,player.classId,theme,landed);return landed>0;
    }
    if (keystone.id === 'marked_convergence') {
      if(budget.casts.has(castKey))return false;
      const marked=context.capturedMarkedTarget??player.predatorVerdict?.target;
      if(marked!==enemy||!marked.alive)return false;
      budget.casts.add(castKey);const result=this.#damageEnemy(marked,(context.rawDamage??0)*keystone.convergenceMult,{multiHit:true,skill:true,cannotCrit:true,keystoneDerived:true,verdictDerived:true,sameCastHit:{key:`${castKey}:marked-convergence`,maxHits:1}});
      if(result.amount>0)this.game.effects.recipeApexKeystone?.(marked.position,player.classId,theme,1);return result.amount>0;
    }
    return false;
  }

  #segmentDamage(from, to, width, rawDamage, options = {}, key = 'segment') {
    const segment = to.clone().sub(from).setY(0); const lengthSq = Math.max(1e-6, segment.lengthSq()); let hits = 0;
    for (const enemy of this.game.enemies.enemies) {
      if (!enemy.alive) continue;
      const relative = enemy.position.clone().sub(from).setY(0); const t = clamp(relative.dot(segment)/lengthSq,0,1);
      if (enemy.position.distanceTo(from.clone().addScaledVector(segment,t)) > width+enemy.radius) continue;
      const result=this.#damageEnemy(enemy,rawDamage,{...options,sameCastHit:{key:`${key}:${enemy.id}`,maxHits:1}});if(result.amount>0)hits+=1;
    }
    return hits;
  }

  #beginWizardCast(player, skillId, bundle = null) {
    const generations = this.wizardCastGeneration.get(player) ?? {};
    const generation = (generations[skillId] ?? 0) + 1;
    generations[skillId] = generation;
    this.wizardCastGeneration.set(player, generations);
    const casts = this.wizardCastState.get(player) ?? new Map();
    const keystone=getHeroClass(player.classId).apexKeystone;
    const overcast=Boolean(bundle?.playerLevel>=keystone?.unlockLevel&&bundle?.combat?.apexFinisher
      && player.consumeArcaneOverflow?.(keystone.overflowCost));
    const state = { skillId, generation, reactions: new Set(), terminal: false, overcast, apexBudget:{targets:new Map(),casts:new Set()} };
    casts.set(skillId, state);
    this.wizardCastState.set(player, casts);
    return state;
  }

  #endWizardCast(player, state) {
    if (!state || state.terminal) return false;
    const casts = this.wizardCastState.get(player);
    state.terminal = true;
    if (casts?.get(state.skillId) !== state) return false;
    casts.delete(state.skillId);
    if (casts && casts.size === 0) this.wizardCastState.delete(player);
    return true;
  }

  #isWizardCastCurrent(player, state) {
    return Boolean(state && !state.terminal && this.wizardCastState.get(player)?.get(state.skillId) === state);
  }

  #isWizardGenerationCurrent(player, state) {
    return this.wizardCastGeneration.get(player)?.[state?.skillId] === state?.generation;
  }

  #quality() {
    return this.game.renderPipeline?.quality ?? this.game.effects?.quality ?? 'medium';
  }

  playerAttack(player, combo, comboLength = 4) {
    if (isRangedAttackStyle(player.classId)) this.#magicAttack(player, combo, comboLength);
    else this.#meleeAttack(player, combo, comboLength);
  }

  /** Ground aim locked to facing — not mouse — so skills match movement direction. */
  #aimAlongFacing(player, distance) {
    const dir = this.#facingDir(player);
    const target = player.position.clone().addScaledVector(dir, distance);
    target.y = this.game.world.heightAt(target.x, target.z);
    return target;
  }

  #facingDir(player) {
    const dir = player.facing.clone().setY(0);
    if (dir.lengthSq() < .0001) dir.set(0, 0, 1);
    return dir.normalize();
  }

  #handContactOrigin(player, offhand, direction, forward = 0.12) {
    const refs = player.refs ?? {};
    const source = offhand
      ? (refs.offhandBladeTip ?? refs.offhandSocket)
      : (refs.mainBladeTip ?? refs.bladeTip ?? refs.socket);
    const origin = new THREE.Vector3();
    if (source?.getWorldPosition) {
      player.mesh?.updateWorldMatrix?.(true, true);
      source.getWorldPosition(origin);
    } else {
      origin.copy(player.position).add(new THREE.Vector3(0, 1.02, 0));
    }
    return origin.addScaledVector(direction, forward);
  }

  #meleeAttack(player, combo, comboLength = 4) {
    const direction = this.#facingDir(player);
    // Class basic-attack profile — reach/damage/flurry are data, not code.
    const profile = getClassBasicAttack(player.classId);
    const rangeMult = profile.rangeMult;
    const arcMult = profile.arcMult;
    const last = Math.max(0, comboLength - 1);
    const finisher = combo >= last;
    const color = player.weapon?.rarityColor ?? 0xeef8ff;
    const rogue = player.classId === 'rogue';
    const offhandColor = 0x9a6be8;
    const timingScale = rogue ? player.frenzyTimingScale : 1;
    // Level + chain depth push dust/trail read for heavier knight swings.
    const levelBoost = clamp((player.level - 1) * .04, 0, .8);
    const chain = combo / Math.max(1, last);
    this.game.effects.dust(player.position, 0xd7dbc4, finisher ? 14 + combo : 6 + combo * 2, finisher ? .42 : .28);
    this.game.effects.trail(
      player.position.clone().add(new THREE.Vector3(0, 1.05, 0)).addScaledVector(direction, .55),
      color, finisher ? .7 : .34 + chain * .2, finisher ? .24 : .12,
    );
    // Lite weapon swing ribbon (no bone sampling) — melee-only path.
    const swingRange = ((finisher ? profile.finisherRange : profile.range) + combo * profile.rangePerCombo + levelBoost * .25) * rangeMult;
    this.game.effects.swingTrail?.(
      player.position.clone().add(new THREE.Vector3(0, 1.05, 0)),
      direction,
      color,
      swingRange * (finisher ? 1.2 : 1),
      { heavy: finisher || combo >= 2, angleOffset: combo % 2 ? .45 : -.4 },
    );

    // High-level finishers and late chain steps land as multi-pulse hits for impact.
    let pulses = finisher
      ? 1 + Math.min(3, Math.floor((comboLength - 3) / 1.5) + Math.floor(player.level / 10))
      : combo >= 3 ? 1 + Math.min(1, Math.floor(player.level / 12)) : 1;
    // Flurry classes (rogue): every click bursts into multiple rapid strikes.
    const flurry = Math.max(1, Math.round(profile.flurry));
    if (flurry > 1) pulses = Math.max(pulses, flurry + (finisher ? 1 : 0));
    const baseMult = (profile.mult + combo * profile.multPerCombo + levelBoost * .12)
      * (finisher ? profile.finisherMult + (comboLength - 3) * .08 : 1);

    for (let pulse = 0; pulse < pulses; pulse += 1) {
      const delay = ((finisher ? .06 : .02 + combo * .005) + pulse * (finisher ? .07 : .05)) * timingScale;
      this.#delay(delay, () => {
        if (!player.alive) return;
        const range = ((finisher ? profile.finisherRange : profile.range) + combo * profile.rangePerCombo + levelBoost * .25) * rangeMult;
        const arc = (finisher ? Math.PI * (1.05 + chain * .12) : Math.PI * (.58 + combo * .05)) * arcMult;
        const offhand = rogue && (combo + pulse) % 2 === 1;
        const hitOrigin = rogue
          ? this.#handContactOrigin(player, offhand, direction, .12 + pulse * .03)
          : player.position.clone().addScaledVector(direction, .35 + pulse * .08);
        const pulseDamage = player.attackPower * baseMult * (pulses > 1 ? (.72 + pulse * .12) : 1);
        const handColor = offhand ? offhandColor : color;

        this.game.effects.swingArc(hitOrigin, direction, handColor, range * (finisher ? 1.35 : 1.15), {
          heavy: finisher || combo >= 2,
          height: finisher ? 1.3 : 1.02,
          spin: (combo + pulse) % 2 ? -3.1 : 2.9,
          angleOffset: (combo + pulse) % 2 ? .58 : -.5,
        });
        // Second delayed ribbon — brighter follow-through on the same swing.
        this.game.effects.swingTrail?.(
          hitOrigin.clone().add(new THREE.Vector3(0, 0.08, 0)),
          direction,
          handColor,
          range * (finisher ? 1.25 : 1.05),
          {
            heavy: finisher || combo >= 2,
            height: finisher ? 1.15 : 0.98,
            angleOffset: (combo + pulse) % 2 ? -.52 : .48,
          },
        );
        if (finisher && pulse === 0) {
          this.game.effects.ring(player.position, color, 3.4 + comboLength * .12, { life: .36, startScale: .12, height: .1, opacity: .75 });
          this.game.effects.ring(player.position, 0xffffff, 2.2, { life: .22, startScale: .2, height: .14, opacity: .88 });
          this.game.effects.pillar(
            player.position.clone().addScaledVector(direction, 1.15),
            color, 5.2 + comboLength * .15, { life: .4, bottom: .75, opacity: .5 },
          );
          this.game.effects.burst(
            player.position.clone().add(new THREE.Vector3(0, 1, 0)).addScaledVector(direction, 1.3),
            color, 24 + comboLength * 2, { speed: 6.5, size: .36, life: .48, upward: .32 },
          );
          this.game.effects.dust(player.position, 0xc9c8b4, 18, .48);
        } else if (combo >= 2 && pulse === 0) {
          this.game.effects.burst(
            player.position.clone().add(new THREE.Vector3(0, 1, 0)).addScaledVector(direction, .9),
            color, 8 + combo * 2, { speed: 3.8, size: .24, life: .32, upward: .2 },
          );
        }

        this.#hitEnemiesInCone(hitOrigin, direction, range, arc, pulseDamage, {
          knockback: finisher ? 6.8 + comboLength * .15 : 2.1 + combo * .5,
          criticalBonus: finisher ? .12 + levelBoost * .04 : combo * .02,
          combo,
          finisher: finisher && pulse === pulses - 1,
          multiHit: pulses > 1,
          onHit: rogue ? enemy => this.#applyFrenzyContact(player, enemy, pulseDamage, direction) : null,
        });
        if (rogue && finisher && pulse === pulses - 1) {
          const main = this.#handContactOrigin(player, false, direction, .1);
          const off = this.#handContactOrigin(player, true, direction, .1);
          this.game.effects.recipeDualBladeCross?.(main.add(off).multiplyScalar(.5), direction, color, offhandColor, swingRange);
        }
      });
    }
    if (rogue && player.frenzyActive && player.shadowFrenzy.offhandEcho > 0) {
      const echoDelay = ((finisher ? .09 : .055) + pulses * .045) * timingScale;
      this.#delay(echoDelay, () => {
        if (!player.alive || !player.frenzyActive) return;
        const range = ((finisher ? profile.finisherRange : profile.range) + combo * profile.rangePerCombo) * rangeMult;
        const origin = this.#handContactOrigin(player, true, direction, .16);
        this.game.effects.recipeShadowCuts?.(origin, direction, offhandColor, range);
        this.#hitEnemiesInCone(origin, direction, range, Math.PI * .7 * arcMult,
          player.attackPower * baseMult * player.shadowFrenzy.offhandEcho, {
            knockback: 0.8, multiHit: true,
            onHit: enemy => this.#applyFrenzyContact(player, enemy, player.attackPower * baseMult, direction),
          });
      });
    }
  }

  #applyFrenzyContact(player, enemy, rawDamage, direction) {
    const contact = player.registerFrenzyContact?.(enemy);
    if (!contact) return;
    const frenzy = player.shadowFrenzy;
    if (enemy.boss && contact.bossStacks > 1 && frenzy.bossRampStep > 0) {
      this.#damageEnemy(enemy, rawDamage * frenzy.bossRampStep * (contact.bossStacks - 1), {
        direction, knockback: 0, multiHit: true,
      });
    }
    if (contact.chainCap <= 0 || frenzy.chainMult <= 0) return;
    const nearby = this.game.enemies.enemies
      .filter(other => other.alive && other !== enemy && other.position.distanceTo(enemy.position) <= 4 + other.radius)
      .sort((a, b) => a.position.distanceToSquared(enemy.position) - b.position.distanceToSquared(enemy.position))
      .slice(0, contact.chainCap);
    for (const other of nearby) {
      const chainDirection = other.position.clone().sub(enemy.position).setY(0).normalize();
      this.game.effects.recipeShadowCuts?.(enemy.position, chainDirection, 0x9a6be8, 2.2);
      this.#damageEnemy(other, rawDamage * frenzy.chainMult, {
        direction: chainDirection, knockback: 0.4, multiHit: true,
      });
    }
  }

  /** Ranged basic attack — mana bolts (wizard) or arrows (ranger); combo → multi-shot finisher. */
  #magicAttack(player, combo, comboLength = 4) {
    const isBow = getHeroClass(player.classId).attackStyle === 'ranged';
    // Ranger L5+ Strafe passive: basic attacks become auto-aimed 10-arrow volleys.
    if (isBow && this.#rangerStrafeUnlocked(player)) {
      this.#rangerStrafeAttack(player, combo, comboLength);
      return;
    }
    // Capture facing at cast time so delayed bolts don't inherit a later turn/mouse aim.
    const direction = this.#facingDir(player);
    const profile = getClassBasicAttack(player.classId);
    const finisher = combo >= Math.max(0, comboLength - 1);
    const theme = getFxTheme(isBow ? 'hunt_amber' : 'arcane');
    const color = player.weapon?.rarityColor ?? theme.primary;
    const origin = player.position.clone().add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(direction, .7);
    if (isBow) this.game.effects.recipeArrowStreak?.(player.position, direction, theme);
    else {
      this.game.effects.trail(origin, color, finisher ? .75 : .42, .18);
      this.game.effects.burst(origin, color, finisher ? 18 : 8 + combo * 2, {
        speed: 3.4, size: .24, life: .34, upward: .22,
      });
      this.game.effects.slash(player.position, direction, theme.secondary, finisher ? 2.6 : 1.8 + combo * 0.15, {
        height: 1.05, life: 0.22, thickness: 0.05, spin: 1.8, opacity: 0.55,
      });
    }

    const bolts = finisher ? profile.bolts : 1;
    const baseDamage = player.attackPower * (profile.comboMults[combo] ?? 1) * (isBow ? 1 : player.skillPower);
    const bowMul = isBow ? 1 : 1;
    const bowSpeed = profile.arrowSpeed ?? 22;
    const bowLife = profile.arrowLife ?? 3.6;
    const baseYaw = Math.atan2(direction.x, direction.z);
    for (let i = 0; i < bolts; i += 1) {
      this.#delay(finisher ? i * .05 : .03, () => {
        if (!player.alive) return;
        const spread = finisher ? (i - (bolts - 1) / 2) * (isBow ? 0.1 : 0.12) : 0;
        const dir = new THREE.Vector3(Math.sin(baseYaw + spread), 0, Math.cos(baseYaw + spread));
        const start = player.position.clone().add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(dir, .65);
        this.#spawnFriendlyOrb(start, dir, {
          style: isBow ? 'arrow' : 'mana',
          color: finisher && i === Math.floor(bolts / 2) ? theme.core : color,
          damage: baseDamage * bowMul * (finisher ? (isBow ? .48 : .42) : 1),
          speed: finisher ? (isBow ? bowSpeed * 0.95 + i * 0.3 : 14 + i) : (isBow ? bowSpeed : 15.5),
          radius: finisher ? 1.05 : (isBow ? .85 : .9),
          life: isBow ? bowLife : 1.2,
          pierce: finisher ? 2 : 1,
          knockback: finisher ? 3.8 : 2.2,
          skill: false,
          skillPowerApplied: !isBow,
          scale: finisher ? (isBow ? 1.15 : 1.2) : (isBow ? 1.0 : 1.05),
        });
      });
    }
    if (finisher) {
      this.game.effects.ring(player.position, color, 2.8, { life: .38, startScale: .12, height: .12 });
      this.game.effects.ring(player.position, theme.core, 1.8, { life: .24, startScale: .2, height: .16, opacity: .8 });
      this.game.effects.pillar(player.position, theme.accent, 4.2, { life: .32, bottom: .5, opacity: .4 });
      this.game.effects.burst(origin, theme.secondary, 16, { speed: 4.5, size: .28, life: .4, upward: .4 });
    }
  }

  /** Strafe unlocks by ranger level (passive tree L5); ranks only scale power. */
  #rangerStrafeUnlocked(player) {
    if (player?.classId !== 'ranger') return false;
    const unlock = SKILLS.strafe?.unlockLevel ?? 5;
    return player.level >= unlock;
  }

  /**
   * Diablo Amazon-style Strafe: fire a fixed volley of auto-aimed arrows.
   * Targets nearest living enemies (round-robin); reacquires mid-volley if a target dies.
   */
  #rangerStrafeAttack(player, combo, comboLength = 4) {
    const skill = SKILLS.strafe;
    const combat = skill?.combat ?? {};
    const shots = Math.max(1, Math.round(combat.shots ?? 10));
    const interval = combat.interval ?? .042;
    const range = combat.range ?? 48.6;
    const profile = getClassBasicAttack(player.classId);
    const finisher = combo >= Math.max(0, comboLength - 1);
    // Rank 0 at L5 still fires; invested ranks add per-arrow power.
    const rank = Math.max(0, player.skillRank?.('strafe') ?? player.skills?.strafe ?? 0);
    const multBase = Array.isArray(combat.mult) ? Number(combat.mult[0]) || .18 : .18;
    const multPer = Array.isArray(combat.mult) ? Number(combat.mult[1]) || 0 : 0;
    const arrowMult = (multBase + multPer * rank)
      * (profile.comboMults?.[combo] ?? 1)
      * (finisher ? (combat.finisherMult ?? 1.12) : 1);
    const perArrow = player.attackPower * arrowMult;
    const arrowSpeed = combat.speed ?? profile.arrowSpeed ?? 24;
    const arrowLife = combat.life ?? profile.arrowLife ?? 2.6;
    const theme = getFxTheme('hunt_amber');
    const color = player.weapon?.rarityColor ?? theme.primary;
    const facing = this.#facingDir(player);
    this.game.effects.recipeArrowStreak?.(player.position, facing, theme);
    if (finisher) {
      this.game.effects.ring(player.position, color, 2.6, { life: .32, startScale: .14, height: .12, opacity: .7 });
      this.game.effects.burst(
        player.position.clone().add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(facing, .8),
        theme.secondary, 12, { speed: 4.2, size: .22, life: .34, upward: .28 },
      );
    }

    const pickTargets = () => this.game.enemies.enemies
      .filter(enemy => enemy.alive
        && enemy.position.distanceTo(player.position) <= range + (enemy.radius ?? 0.6))
      .sort((a, b) => a.position.distanceToSquared(player.position) - b.position.distanceToSquared(player.position));

    const initial = pickTargets();
    // Round-robin assignment across the pack (Strafe sprays many foes when available).
    const sequence = [];
    for (let i = 0; i < shots; i += 1) {
      sequence.push(initial.length ? initial[i % initial.length] : null);
    }

    const castId = `strafe-${++this.rangerSerial}`;
    for (let i = 0; i < shots; i += 1) {
      this.#delay(i * interval, () => {
        if (!player.alive) return;
        let target = sequence[i];
        if (!target?.alive) {
          const living = pickTargets();
          target = living.length ? living[i % living.length] : null;
        }
        let dir = this.#facingDir(player);
        if (target?.alive) {
          dir = target.position.clone().sub(player.position).setY(0);
          if (dir.lengthSq() < 1e-6) dir = this.#facingDir(player);
          else dir.normalize();
          // Nudge combat facing toward the current lock for readable aim.
          if (i === 0 || i % 3 === 0) {
            player.facing?.copy?.(dir);
          }
        }
        // Tiny lateral fan so a single-target dump doesn't look like a stacked laser.
        const yaw = Math.atan2(dir.x, dir.z) + Math.sin(i * 1.91) * 0.035;
        dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const start = player.position.clone()
          .add(new THREE.Vector3(0, 1.12 + (i % 3) * 0.02, 0))
          .addScaledVector(dir, .62);
        if (i === 0 || i === shots - 1) {
          this.game.effects.recipeArrowStreak?.(player.position, dir, theme);
        }
        this.#spawnFriendlyOrb(start, dir, {
          style: 'arrow',
          color: i === shots - 1 ? theme.core : color,
          damage: perArrow,
          speed: arrowSpeed + (i % 3) * 0.15,
          radius: .78,
          life: arrowLife,
          pierce: combat.pierce ?? 1,
          knockback: combat.knockback ?? 1.05,
          skill: false,
          skillPowerApplied: false,
          scale: finisher && i === shots - 1 ? 1.08 : .9,
          homingTarget: target?.alive ? target : null,
          castId,
          trailRate: .55,
        });
        if (i % 2 === 0) this.game.audio?.swing?.(Math.min(3, (i / 2) | 0));
      });
    }
  }

  /**
   * @param {Readonly<object>} bundle resolved once by Player.trySkill
   * @param {*} player
   * @param {number|null} [phase] anim-synced pulse index; null = full skill / non-phased
   */
  usePlayerSkill(bundle, player, phase = null) {
    const effectId = bundle?.effect ?? bundle?.id;
    const handler = this.skillHandlers[effectId];
    if (!handler) return;
    const starts = phase == null || phase === 'full' || Number(phase) === 0;
    const activeFrenzyRecast = bundle?.id === 'shadowstep' && player?.frenzyActive;
    const audio = starts ? (activeFrenzyRecast ? player.shadowFrenzy?.apexAudio ?? null : this.#beginApexAudio(player, bundle))
      : this.apexAudioStates.get(player)?.get(bundle.id) ?? null;
    handler(player, bundle, phase, audio);
  }

  #spawnFriendlyOrb(start, direction, options = {}) {
    const color = options.color ?? 0xc8b4ff;
    const style = options.style ?? (options.wave ? 'blade_wave' : 'mana');
    const dir = direction.clone().normalize();
    const visual = createProjectileVisual(style, color, { scale: options.scale ?? 1.1 });
    visual.root.position.copy(start);
    if (visual.orient) orientProjectile(visual.root, dir, 0);
    this.game.scene.add(visual.root);
    const projectile = {
      mesh: visual.root,
      materials: visual.materials,
      friendly: true,
      style,
      orient: visual.orient,
      spin: visual.spin,
      spinRoll: 0,
      trailRate: options.trailRate ?? visual.trailRate,
      trailSize: options.trailSize ?? visual.trailSize,
      velocity: dir.clone().multiplyScalar(options.speed ?? 15),
      damage: options.damage ?? 10,
      radius: options.radius ?? .9,
      life: options.life ?? 1.25,
      pierce: options.pierce ?? 1,
      hit: new Set(),
      wave: Boolean(options.wave) || style === 'blade_wave',
      color,
      direction: dir,
      knockback: options.knockback ?? 2.5,
      skill: Boolean(options.skill),
      // true only when damage already includes skillPower (e.g. fireball orb)
      skillPowerApplied: Boolean(options.skillPowerApplied),
      explode: options.explode ?? null,
      statusOnHit: options.statusOnHit ?? null,
      armorPierce: options.armorPierce ?? 0,
      criticalBonus: options.criticalBonus ?? 0,
      energyCombo: Boolean(options.energyCombo),
      onHit: typeof options.onHit === 'function' ? options.onHit : null,
      onRetire: typeof options.onRetire === 'function' ? options.onRetire : null,
      retired: false,
      retireCallbackFired: false,
      reactionDepth: Math.min(1, Math.max(0, Number(options.reactionDepth) || 0)),
      castId: options.castId ?? null,
      castMeta: options.castMeta ? Object.freeze({ ...options.castMeta }) : null,
      homingTarget: options.homingTarget ?? null,
      ownerGuard: typeof options.ownerGuard === 'function' ? options.ownerGuard : null,
    };
    this.projectiles.push(projectile);
    return projectile;
  }

  #applyHitStatus(enemy, status) {
    if (!status?.id || !enemy?.applyStatus) return;
    const rogueBleed = status.id === 'bleed' && this.game.player?.classId === 'rogue';
    enemy.applyStatus(status.id, {
      duration: status.duration ?? 2,
      power: status.power ?? 0.4,
      dps: status.dps ?? 0,
      tick: status.tick ?? 0.5,
      damageAmp: status.damageAmp ?? 0,
      stackDelta: rogueBleed ? 1 : status.stackDelta,
      stackCap: rogueBleed ? 3 : status.stackCap,
    }, this.game);
  }

  #reactSpellPrime(enemy, detonator, player, rawDamage, castMeta = {}) {
    const prime = enemy.spellPrime;
    if (!prime || (prime.depth ?? 0) >= 1) return false;
    const valid = (detonator === 'fire' && prime.id === 'deep_chill')
      || (detonator === 'frost' && prime.id === 'burn')
      || (detonator === 'arcane' && prime.id === 'crystal');
    if (!valid) return false;
    const consumed = enemy.consumeSpellPrime?.(prime.id);
    if (!consumed) return false;
    if (detonator === 'frost' && enemy.statuses?.burn) {
      enemy.statuses.burn.remaining = Math.max(0, enemy.statuses.burn.remaining * .5);
      if (enemy.statuses.burn.remaining <= .05) delete enemy.statuses.burn;
    }
    if (detonator === 'fire' && enemy.statuses?.slow) {
      enemy.statuses.slow.remaining = Math.max(0, enemy.statuses.slow.remaining * .5);
      if (enemy.statuses.slow.remaining <= .05) delete enemy.statuses.slow;
    }
    const facing = this.#facingDir(player);
    const reactionKind = detonator === 'frost' ? 'thermal_shock'
      : detonator === 'fire' ? 'steam'
        : 'crystal_shards';
    this.game.effects.recipeSpellReaction?.(enemy.position, reactionKind, facing);
    const castId = castMeta.castId ?? `spell-${++this.spellCastSerial}`;
    if (detonator === 'arcane') {
      const coneOrigin = enemy.position.clone().addScaledVector(facing, -.3);
      this.#hitEnemiesInCone(coneOrigin, facing, 4.2, 1.05, rawDamage * .28, {
        knockback: .6, multiHit: true, skill: true, reactionDepth: 1, castMeta,
        sameCastHit: { key: `${castId}:crystal-shards`, maxHits: 1 },
      });
    } else if (detonator === 'fire') {
      const steamTargets = this.game.enemies.enemies.filter(target => target.alive
        && target.position.distanceTo(enemy.position) <= 2.6 + target.radius)
        .sort((a, b) => a.position.distanceToSquared(enemy.position) - b.position.distanceToSquared(enemy.position))
        .slice(0, 4);
      for (const target of steamTargets) this.#damageEnemy(target, rawDamage * .28, {
        direction: target === enemy
          ? facing
          : target.position.clone().sub(enemy.position).setY(0).normalize(),
        knockback: .6, multiHit: true, skill: true, reactionDepth: 1, castMeta,
        sameCastHit: { key: `${castId}:steam:${target.id}`, maxHits: 1 },
      });
    } else {
      this.#damageEnemy(enemy, rawDamage * .28, {
        direction: facing, knockback: 0.6, multiHit: true, skill: true,
        reactionDepth: 1, castMeta,
        sameCastHit: { key: `${castId}:${reactionKind}`, maxHits: 1 },
      });
    }
    if (!castMeta.keystoneDerived && player.level >= 50) {
      const overflow = getHeroClass('wizard').apexKeystone;
      player.gainArcaneOverflow?.(overflow.reactionGain, overflow.overflowMax);
    }
    return true;
  }

  #whirlwindPulse(player, bundle, hitIndex, state = null) {
    const { combat, theme } = this.#skillBundle(bundle);
    const radius = combat.radius * (combat.radiusMult ?? 1);
    const hits = Math.max(1, Math.round(combat.hits ?? 3));
    const finale = hitIndex >= hits - 1;
    if (state && !this.#ownsCast(player, state.cast)) return;
    if (state && hitIndex === 0) this.#apexAudioPhase(player, state.apexAudio, 'impact');
    if (state && finale) this.#apexAudioPhase(player, state.apexAudio, 'finisher');
    if (hitIndex === 0) player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.34);
    this.game.effects.recipeSpinStorm(player.position, player.facing, theme, radius, hitIndex, finale);
    this.game.audio.swing?.(hitIndex % 4);
    this.#hitEnemiesInRadius(player.position, radius, skillDamage(player.attackPower, combat), {
      knockback: finale ? combat.knockbackFinale : combat.knockbackPulse,
      multiHit: true,
      criticalBonus: combat.criticalBonus ?? 0.03,
      skill: true,
      status: combat.bleedEvery && (hitIndex + 1) % combat.bleedEvery === 0 ? combat.bleed : null,
      onHit: enemy => {
        if(finale&&state)this.#applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat),castKey:`whirl-${state.cast.generation}`,budget:state.apexBudget});
        const dragAllowed = !combat.dragCap || state.dragTargets.has(enemy.id) || state.dragTargets.size < combat.dragCap;
        if ((combat.inwardDrag || combat.cageDrag) && enemy.controlCategory !== 'boss' && dragAllowed) {
          state.dragTargets.add(enemy.id);
          enemy.pullToward?.(player.position, 1.45, combat.cageDrag ?? combat.inwardDrag, this.game.world, this.game.enemies.enemies);
        }
        if (finale && combat.durableMult && (enemy.elite || enemy.boss)) {
          this.#damageEnemy(enemy, skillDamage(player.attackPower, combat) * (combat.durableMult - 1), {
            multiHit: true, skill: true, sameCastHit: { key: `whirl-${state.cast.generation}:durable`, maxHits: 1 },
          });
          enemy.addStagger?.(combat.durableStagger ?? 0);
        }
      },
    });
    if (finale && state && combat.rovingGale && !state.scarred) {
      state.scarred = true;
      const from = state.origin.clone(); const to = player.position.clone(); const scarFacing = state.facing.clone();
      this.#delay(.1, () => {
        if (!this.#ownsCast(player, state.cast)) return;
        this.game.effects.recipeWhirlwindScar?.(from, to, theme);
        const segment = to.clone().sub(from).setY(0); const lengthSq = Math.max(1e-6, segment.lengthSq());
        for (const enemy of this.game.enemies.enemies) {
          if (!enemy.alive) continue;
          const relative = enemy.position.clone().sub(from).setY(0);
          const t = clamp(relative.dot(segment) / lengthSq, 0, 1);
          const nearest = from.clone().addScaledVector(segment, t);
          if (enemy.position.distanceTo(nearest) > .75 + enemy.radius) continue;
          this.#damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.scarMult, {
            direction: scarFacing, multiHit: true, skill: true,
            sameCastHit: { key: `whirl-${state.cast.generation}:scar:${enemy.id}`, maxHits: 1 },
          });
        }
      });
    }
    if (finale && state && (combat.finalCross || combat.sovereign)) {
      const facing = this.#facingDir(player); const side = new THREE.Vector3(-facing.z, 0, facing.x);
      for (const enemy of this.game.enemies.enemies) {
        if (!enemy.alive) continue;
        const offset = enemy.position.clone().sub(player.position).setY(0);
        const axes = [
          Math.abs(offset.dot(side)) <= .65 && Math.abs(offset.dot(facing)) <= radius,
          Math.abs(offset.dot(facing)) <= .65 && Math.abs(offset.dot(side)) <= radius,
        ];
        axes.forEach((onAxis, axis) => {
          if (onAxis && this.#consumeHitBudget(state.crossBudget, enemy, Math.min(2, combat.crossBudget ?? 2))) this.#damageEnemy(enemy,
            skillDamage(player.attackPower, combat) * (combat.crossMult ?? .35), {
              multiHit: true, skill: true, sameCastHit: { key: `whirl-${state.cast.generation}:cross-${axis}:${enemy.id}`, maxHits: 1 },
            });
        });
      }
      this.game.effects.recipeSovereignCross?.(player.position, facing, theme, radius);
    }
  }

  #whirlwind(player, bundle, phase = null, apexAudio = null) {
    const { combat } = this.#skillBundle(bundle);
    const hits = Math.max(1, Math.round(combat.hits ?? 3));
    if (phase != null && phase !== 'full') {
      if (!player.alive) return;
      const index = Number(phase);
      if (!Number.isInteger(index) || index < 0 || index >= hits) return;
      let state = this.whirlwindStates.get(player);
      if (index === 0) {
        state = { cast: this.#beginOwnedCast(player, bundle.id), bundle, completed: new Set(), origin: player.position.clone(),
          facing: this.#facingDir(player), dragTargets: new Set(), crossBudget: new Map(), scarred: false, apexAudio, apexBudget:{targets:new Map(),casts:new Set()} };
        this.whirlwindStates.set(player, state);
      }
      if (!state || state.bundle !== bundle || !this.#ownsCast(player, state.cast) || state.completed.has(index)) return;
      state.completed.add(index);
      this.#whirlwindPulse(player, bundle, index, state);
      if (index >= hits - 1) this.whirlwindStates.delete(player);
      return;
    }
    const state = { cast: this.#beginOwnedCast(player, bundle.id), bundle, completed: new Set(), origin: player.position.clone(),
      facing: this.#facingDir(player), dragTargets: new Set(), crossBudget: new Map(), scarred: false, apexAudio, apexBudget:{targets:new Map(),casts:new Set()} };
    this.whirlwindStates.set(player, state);
    // Fallback absolute delays if anim timeline not used
    for (let hit = 0; hit < hits; hit += 1) {
      this.#delay(0.06 + hit * 0.15 * (combat.cadenceMult ?? 1), () => {
        if (!this.#ownsCast(player, state.cast)) return;
        if (state.completed.has(hit)) return;
        state.completed.add(hit);
        this.#whirlwindPulse(player, bundle, hit, state);
        if (hit === hits - 1) this.whirlwindStates.delete(player);
      });
    }
  }

  #crescent(player, bundle, phase = null, apexAudio = null) {
    const { combat, theme } = this.#skillBundle(bundle);
    const acts = bundle.playerLevel >= 100 ? 3 : bundle.playerLevel >= 20 ? 2 : 1;
    const execute = index => {
      let state = this.crescentStates.get(player);
      if (index === 0) {
        state = { cast:this.#beginOwnedCast(player,bundle.id), bundle, completed:new Set(), origin:player.position.clone(),
          facing:this.#facingDir(player), points:[], crossHits:new Map(), released:false, apexAudio, apexBudget:{targets:new Map(),casts:new Set()} };
        this.crescentStates.set(player,state);
      }
      if (!state || state.bundle !== bundle || !this.#ownsCast(player,state.cast) || index<0 || index>=acts || state.completed.has(index)) return;
      state.completed.add(index);
      if(index===0)this.#apexAudioPhase(player,state.apexAudio,'impact');
      if(index===acts-1)this.#apexAudioPhase(player,state.apexAudio,'finisher');
      if (index === 0 && !state.released) {
        this.game.audio.swing?.(0);
        state.released=true; const waves=Math.min(3,combat.waveCount??1); const yaw0=Math.atan2(state.facing.x,state.facing.z);
        this.game.effects.recipeWorldsplitterAct?.(state.origin,state.facing,theme,0,Boolean(combat.worldsplitter));
        for(let wave=0;wave<waves;wave+=1){const yaw=yaw0+(wave-(waves-1)/2)*(combat.spread??0);const dir=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
          const start=state.origin.clone().addScaledVector(dir,1.2).add(new THREE.Vector3(0,1,0));
          this.#spawnFriendlyOrb(start,dir,{style:'blade_wave',color:theme.primary,damage:skillDamage(player.attackPower,combat)*(combat.damageMult??combat.waveMult??1),speed:combat.speed,
            radius:(combat.radius??1.25)*(combat.radiusMult??1),life:1.35,pierce:Math.round(combat.pierce??3),knockback:combat.knockback??4.2,skill:true,wave:true,
            ownerGuard:()=>this.#ownsCast(player,state.cast),
            statusOnHit:combat.status??null,onHit:enemy=>{if(state.points.length<Math.min(6,combat.crossCap??6))state.points.push(enemy.position.clone());
              if(combat.crosscurrent&&!state.crossHits.has(enemy.id)&&state.crossHits.size<Math.min(6,combat.crossCap??6)){state.crossHits.set(enemy.id,1);const side=new THREE.Vector3(-dir.z,0,dir.x);
                this.#delay(.08,()=>{if(!this.#ownsCast(player,state.cast))return;this.#damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.crossMult,{multiHit:true,skill:true,sameCastHit:{key:`cres-${state.cast.generation}:cross:${enemy.id}`,maxHits:1}});this.game.effects.recipeCrosscurrent?.(enemy.position,side,theme);});}
              if(combat.severMult&&(enemy.elite||enemy.boss)){this.#damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.severMult,{multiHit:true,skill:true,sameCastHit:{key:`cres-${state.cast.generation}:sever:${enemy.id}`,maxHits:1}});enemy.applyStatus?.('armor_break',{duration:combat.armorBreakDuration,power:combat.armorBreakPower},this.game);}},
          });}
        if(bundle.playerLevel<20&&bundle.rank>=3&&combat.residualMult>0){const scarCenter=state.origin.clone().addScaledVector(state.facing,4.2);this.#delay(combat.residualDelay??.42,()=>{if(!this.#ownsCast(player,state.cast))return;this.game.effects.groundDecal?.(scarCenter,theme.accent,combat.residualRadius??1.5,{life:1.6,opacity:.45,startScale:.2});this.#hitEnemiesInRadius(scarCenter,combat.residualRadius??1.5,skillDamage(player.attackPower,combat,'residualMult'),{knockback:1.2,multiHit:true,skill:true});});}
      } else if(index===1){this.game.audio.swing?.(1);this.game.effects.recipeWorldsplitterAct?.(state.origin,state.facing,theme,1,Boolean(combat.worldsplitter));
        if(combat.moonScar||bundle.rank>=3)this.#delay(combat.residualDelay??.42,()=>{if(!this.#ownsCast(player,state.cast))return;this.#segmentDamage(state.origin,state.origin.clone().addScaledVector(state.facing,8),.8,skillDamage(player.attackPower,combat)*(combat.scarMult??combat.residualMult??.3),{multiHit:true,skill:true},`cres-${state.cast.generation}:scar`);});
        if(combat.riftTicks)for(let tick=0;tick<Math.min(3,combat.riftTicks);tick+=1)this.#delay(.18+tick*.16,()=>{if(!this.#ownsCast(player,state.cast))return;
          const to=state.origin.clone().addScaledVector(state.facing,8);const segment=to.clone().sub(state.origin);const lengthSq=segment.lengthSq();let targets=0;
          for(const enemy of this.game.enemies.enemies){if(!enemy.alive||targets>=Math.min(4,combat.riftCap??4))continue;const rel=enemy.position.clone().sub(state.origin).setY(0);const t=clamp(rel.dot(segment)/lengthSq,0,1);if(enemy.position.distanceTo(state.origin.clone().addScaledVector(segment,t))>.9+enemy.radius)continue;
            const result=this.#damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.riftMult,{multiHit:true,skill:true,sameCastHit:{key:`cres-${state.cast.generation}:rift-${tick}:${enemy.id}`,maxHits:1}});if(result.amount>0){targets+=1;if(enemy.boss)enemy.addStagger?.(4);else enemy.applyStun?.(.2);}}
        });
      } else if(index===2){this.game.audio.swing?.(2);this.game.effects.recipeWorldsplitterAct?.(state.origin,state.facing,theme,2,true);this.#delay(.16,()=>{if(!this.#ownsCast(player,state.cast))return;const raw=skillDamage(player.attackPower,combat)*combat.ruptureMult;this.#segmentDamage(state.origin,state.origin.clone().addScaledVector(state.facing,10),1,raw,{multiHit:true,skill:true,onHit:enemy=>this.#applyApexKeystone(player,enemy,{bundle,theme,rawDamage:raw,castKey:`cres-${state.cast.generation}`,budget:state.apexBudget})},`cres-${state.cast.generation}:rupture`);});}
      if(index===acts-1)this.crescentStates.delete(player);
    };
    if(phase!=null&&phase!=='full'){const index=Number(phase);if(Number.isInteger(index))execute(index);return;}
    const chain=index=>{execute(index);if(index+1<acts)this.#delay(.18,()=>chain(index+1));};chain(0);
  }

  #skyfallLegacy(player, bundle) {
    const { combat, theme } = this.#skillBundle(bundle);
    const target = this.#aimAlongFacing(player, combat.leap ?? 10.5);
    const direction = this.#facingDir(player);
    const radius = combat.radius;
    this.#telegraphCircle(target, radius, combat.telegraph ?? 0.46, theme.primary, () => {
      if (!player.alive) return;
      player.position.copy(target);
      this.game.world.resolvePosition(player.position, 0.48);
      player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.55);
      this.game.effects.recipeLeapImpact(target, direction, theme, radius);
      this.#hitEnemiesInRadius(target, radius, skillDamage(player.attackPower, combat), {
        knockback: combat.knockback ?? 7.2,
        armorPierce: combat.armorPierce ?? 0.25,
        criticalBonus: combat.criticalBonus ?? 0.06,
        skill: true,
      });
    }, { fillOpacity: 0.12 });
  }

  #skyfall(player, bundle, phase = null, apexAudio = null) {
    if (bundle.playerLevel < 20) {
      this.#skyfallLegacy(player, bundle);
      return;
    }
    const runPhase = index => {
      let cast = this.skillCastState.get(player);
      if (!cast || cast.bundle !== bundle) {
        if (index !== 0) return false;
        cast = {
          bundle,
          target: this.#aimAlongFacing(player, bundle.combat.leap ?? 10.5),
          direction: this.#facingDir(player),
          completed: new Set(),
          apexAudio,
          apexBudget: { targets:new Map(), casts:new Set() },
        };
        this.skillCastState.set(player, cast);
      }
      if (cast.completed.has(index)) return false;
      if (!player.alive) {
        if (index === 1) this.skillCastState.delete(player);
        return false;
      }
      cast.completed.add(index);
      if(index===0)this.#apexAudioPhase(player,cast.apexAudio,'impact');
      if(index===1)this.#apexAudioPhase(player,cast.apexAudio,'finisher');
      const { combat, theme } = this.#skillBundle(bundle);
      const enemies = this.game.enemies.enemies;
      const pullRadius = (combat.pullRadius ?? combat.radius) + (combat.apexPullBonus ?? 0);
      if (index === 0) {
        player.position.copy(cast.target);
        this.game.world.resolvePosition(player.position, 0.48);
        cast.target.copy(player.position);
        player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.55);
        this.game.effects.recipeVortexPull?.(cast.target, theme, pullRadius);
        for (const enemy of enemies) {
          if (!enemy.alive || enemy.position.distanceTo(cast.target) > pullRadius + enemy.radius) continue;
          const direction = enemy.position.clone().sub(cast.target).setY(0).normalize();
          this.#damageEnemy(enemy, skillDamage(player.attackPower, combat, 'plantMult'), {
            direction, knockback: 0, armorPierce: combat.armorPierce ?? 0.25, multiHit: true, skill: true,
          });
          if (enemy.controlCategory === 'boss') {
            this.game.effects.recipeBossPullResist?.(enemy.position, cast.target, theme);
          } else {
            enemy.pullToward?.(cast.target, combat.safeRing ?? 1.55, combat.pullStrength ?? 0.72, this.game.world, enemies);
          }
        }
        return true;
      }
      this.game.effects.recipeGroundFracture?.(cast.target, cast.direction, theme, combat.radius);
      for (const enemy of enemies) {
        if (!enemy.alive || enemy.position.distanceTo(cast.target) > combat.radius + enemy.radius) continue;
        const direction = enemy.position.clone().sub(cast.target).setY(0).normalize();
        const slamRaw=skillDamage(player.attackPower,combat);const slamResult=this.#damageEnemy(enemy, slamRaw, {
          direction,
          knockback: Math.min(3.2, combat.knockback ?? 7.2),
          armorPierce: combat.armorPierce ?? 0.25,
          criticalBonus: combat.criticalBonus ?? 0.06,
          multiHit: true,
          finisher: true,
          skill: true,
        });
        if(slamResult.amount>0)this.#applyApexKeystone(player,enemy,{bundle,theme,rawDamage:slamRaw,castKey:`judgment-${bundle.id}`,budget:cast.apexBudget});
        if (enemy.controlCategory === 'boss') {
          enemy.addStagger?.((combat.bossStagger ?? 28) + (combat.apexStaggerBonus ?? 0));
        }
        else enemy.applyStun?.(enemy.controlCategory === 'elite' ? combat.stunElite : combat.stunNormal);
      }
      if (combat.judgmentApex) this.game.effects.recipeJudgmentApex?.(cast.target, theme, combat.radius);
      this.skillCastState.delete(player);
      return true;
    };
    if (phase == null || phase === 'full') {
      runPhase(0);
      runPhase(1);
      return;
    }
    const index = Number(phase);
    if (index === 0 || index === 1) runPhase(index);
  }

  #starburst(player, bundle, phase = null, apexAudio = null) {
    const { combat, theme } = this.#skillBundle(bundle);
    const center = this.#aimAlongFacing(player, combat.aim ?? 9.5);
    const legacy = bundle.playerLevel < 20;
    const acts = legacy ? 1 : bundle.playerLevel >= 100 ? 3 : 2;
    const execute = index => {
      let state=this.starburstStates.get(player);
      if(index===0){state={cast:this.#beginOwnedCast(player,bundle.id),bundle,completed:new Set(),center:center.clone(),landed:[],controlled:new Set(),finale:false,apexAudio,apexBudget:{targets:new Map(),casts:new Set()}};this.starburstStates.set(player,state);}
      if(!state||state.bundle!==bundle||!this.#ownsCast(player,state.cast)||index<0||index>=acts||state.completed.has(index))return;state.completed.add(index);this.game.audio.swing?.(index);
      if(index===0)this.#apexAudioPhase(player,state.apexAudio,'impact');
      if(index===acts-1)this.#apexAudioPhase(player,state.apexAudio,'finisher');
      if(index===0){const hits=combat.arsenal?10:Math.min(Math.round(combat.hits??6),combat.distinctBladeCap??99);const field=combat.fieldRadius??5;
        const bladePoint=i=>{const arm=i%6,ring=Math.floor(i/6),angle=arm/6*Math.PI*2+ring*.22;const dist=i===0?0:legacy?Math.min(field,1.3+ring*1.4+(arm%2)*.5):field*(.38+.58*i/Math.max(1,hits-1));const point=state.center.clone().add(new THREE.Vector3(Math.cos(angle)*dist,0,Math.sin(angle)*dist));point.y=this.game.world.heightAt(point.x,point.z);return point;};
        const landBlade=(i,after=null)=>{if(!this.#ownsCast(player,state.cast))return;const point=bladePoint(i),warningTime=legacy?(combat.telegraph??.28):Math.min(.05,combat.telegraph??.05);this.#telegraphCircle(point,combat.hitRadius*.9,warningTime,theme.primary,()=>{if(!this.#ownsCast(player,state.cast))return;this.game.effects.recipeStarBlade(point,theme,i);this.#hitEnemiesInRadius(point,combat.hitRadius,skillDamage(player.attackPower,combat)*(combat.centerMult??1),{knockback:combat.knockback??2.5,multiHit:true,armorPierce:combat.armorPierce??.2,skill:true,onHit:enemy=>{if(!state.landed.includes(enemy)&&state.landed.length<(combat.targetCap??10))state.landed.push(enemy);}});after?.();},{fillOpacity:.12});};
        if(legacy){const finale=()=>{if(!this.#ownsCast(player,state.cast))return;this.game.effects.recipeStarFinale(state.center,theme,combat.finaleRadius??5.8);this.#hitEnemiesInRadius(state.center,combat.finaleRadius??5.8,skillDamage(player.attackPower,combat,'finaleMult'),{multiHit:true,skill:true,knockback:combat.finaleKnockback??6.2,armorPierce:combat.finaleArmorPierce??.35});};const launch=i=>{if(!this.#ownsCast(player,state.cast)||i>=hits)return;this.#delay(i===0?.1:.095,()=>{if(!this.#ownsCast(player,state.cast))return;if(i+1<hits)launch(i+1);landBlade(i,()=>{if(i===hits-1&&this.#ownsCast(player,state.cast))finale();});});};launch(0);}
        else for(let i=0;i<hits;i+=1)this.#delay(.01+i*.012,()=>landBlade(i));
      }else if(index===1){this.game.effects.recipeArsenalAct?.(state.center,theme,1,Boolean(combat.arsenal));const royal=state.landed.find(enemy=>enemy.alive&&(enemy.elite||enemy.boss))??state.landed[0];if(royal){this.#damageEnemy(royal,skillDamage(player.attackPower,combat)*(combat.sealMult??.5),{multiHit:true,skill:true,sameCastHit:{key:`star-${state.cast.generation}:royal`,maxHits:1}});if(combat.crownMult&&(royal.elite||royal.boss)){this.#damageEnemy(royal,skillDamage(player.attackPower,combat)*combat.crownMult,{multiHit:true,skill:true,sameCastHit:{key:`star-${state.cast.generation}:crown`,maxHits:1}});royal.addStagger?.(combat.crownStagger??0);}}
        state.landed.slice(0,Math.min(6,combat.embeddedCap??0)).forEach((enemy,i)=>this.#delay(.12+i*.04,()=>{if(this.#ownsCast(player,state.cast)&&enemy.alive)this.#damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.embeddedMult,{multiHit:true,skill:true,sameCastHit:{key:`star-${state.cast.generation}:embed:${enemy.id}`,maxHits:1}});}));
        if(combat.prisonCap)for(const enemy of state.landed.slice(0,combat.prisonCap)){if(enemy.boss)enemy.addStagger?.(combat.bossStagger);else enemy.applyStun?.(combat.prisonStun);}
      }else if(index===2&&!state.finale){state.finale=true;for(let ring=0;ring<3;ring+=1)this.game.effects.recipeArsenalAct?.(state.center,theme,2+ring,true);this.game.effects.recipeStarFinale(state.center, theme, combat.finaleRadius ?? 5.8);this.#hitEnemiesInRadius(state.center, combat.finaleRadius ?? 5.8, skillDamage(player.attackPower, combat)*(combat.arsenalFinaleMult??combat.finaleMult), {
        knockback: combat.finaleKnockback ?? 6.2,
        multiHit: true,
        armorPierce: combat.finaleArmorPierce ?? 0.35,
        skill: true,
        onHit:enemy=>this.#applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat)*(combat.arsenalFinaleMult??combat.finaleMult),castKey:`star-${state.cast.generation}`,budget:state.apexBudget}),
      });
      }if(index===acts-1)this.starburstStates.delete(player);
    };
    if(phase!=null&&phase!=='full'){const i=Number(phase);if(Number.isInteger(i))execute(i);return;}
    execute(0);
    if(acts>1)this.#delay(.42,()=>this.#delay(0,()=>{execute(1);if(acts>2)this.#delay(.2,()=>this.#delay(0,()=>execute(2)));}));
  }

  #fireball(player, bundle, phase = null, apexAudio = null) {
    const fire = () => {
      if (!player.alive) return;
      const { combat, theme } = this.#skillBundle(bundle);
      const direction = this.#facingDir(player);
      const start = player.position.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(direction, 1.05);
      const castState = this.#beginWizardCast(player, bundle.id, bundle);
      castState.apexAudio = apexAudio;
      const castId = `fire-${castState.generation}-${++this.spellCastSerial}`;
      const handleFireLanded = enemy => {
        this.#apexAudioPhase(player, castState.apexAudio, 'impact');
        if (castState.reactions.has(enemy.id)) return;
        castState.reactions.add(enemy.id);
        const reacted = this.#reactSpellPrime(enemy, 'fire', player, skillDamage(player.attackPower, combat), { castId });
        if (!reacted) enemy.setSpellPrime?.('burn', { depth: 0, castId, remaining: combat.status?.duration ?? 2.2 });
        if (combat.reaction === 'chain_ignition' && enemy.statuses?.burn) {
          const relays = this.game.enemies.enemies.filter(other => other.alive && other !== enemy && other.statuses?.burn)
            .sort((a, b) => a.position.distanceToSquared(enemy.position) - b.position.distanceToSquared(enemy.position))
            .slice(0, Math.min(3, combat.reactionCap ?? 3));
          for (const other of relays) this.#damageEnemy(other, skillDamage(player.attackPower, combat) * .18, {
            direction: other.position.clone().sub(enemy.position).setY(0).normalize(), knockback: .4, multiHit: true, skill: true,
          });
        }
        if (combat.bossBrandCap && enemy.boss) {
          enemy.solarBrandStacks = Math.min(combat.bossBrandCap, (enemy.solarBrandStacks ?? 0) + 1);
          if (enemy.solarBrandStacks >= combat.bossBrandCap) {
            const detonation = this.#damageEnemy(enemy,
              skillDamage(player.attackPower, combat) * combat.bossBrandMult * combat.bossBrandCap, {
              direction, knockback: 0, multiHit: true, skill: true,
              sameCastHit: { key: `${castId}:solar-brand-detonation`, maxHits: 1 },
            });
            if (detonation.amount > 0) enemy.solarBrandStacks = 0;
          }
        }
      };
      this.game.effects.recipeFireOrb(player.position, direction, theme);
      this.#spawnFriendlyOrb(start, direction, {
        style: 'fireball',
        color: theme.primary,
        damage: skillDamage(player.attackPower, combat) * player.skillPower,
        speed: combat.speed,
        radius: combat.radius ?? 1.15,
        life: 1.4,
        pierce: Math.min(3, Math.max(1, Math.round(combat.pierce ?? 1))),
        knockback: combat.knockback ?? 4.5,
        skill: true,
        skillPowerApplied: true,
        scale: combat.scale ?? 1.35,
        statusOnHit: combat.status ?? null,
        castId,
        castMeta: { skillId: bundle.id, playerLevel: bundle.playerLevel },
        onHit: handleFireLanded,
        onRetire: projectile => {
          if (!this.#endWizardCast(player, castState)) return;
          if (this._clearing || projectile.suppressRetireAuthority) return;
          this.#apexAudioPhase(player, castState.apexAudio, 'finisher');
          const at = projectile.mesh.position.clone();
          this.game.effects.recipeLivingStar?.(at, theme, combat.cinders ?? 0, Boolean(combat.prominence));
          const cinders = Math.min(3, Math.max(0, Math.round(combat.cinders ?? 0)));
          const targets = this.game.enemies.enemies.filter(enemy => enemy.alive)
            .sort((a, b) => a.position.distanceToSquared(at) - b.position.distanceToSquared(at)).slice(0, cinders);
          for (const target of targets) {
            const cinderDirection = target.position.clone().sub(at).setY(0).normalize();
            this.#spawnFriendlyOrb(at.clone().add(new THREE.Vector3(0, .65, 0)), cinderDirection, {
              style: 'fireball', color: theme.secondary,
              damage: skillDamage(player.attackPower, combat) * (combat.cinderMult ?? 0),
              speed: 11, radius: .55, life: .55, pierce: 1, skill: true,
              skillPowerApplied: false, reactionDepth: 1, castId, homingTarget: target,
            });
          }
          const ticks = Math.min(3, Math.max(0, Math.round(combat.vortexTicks ?? 0)));
          for (let tick = 0; tick < ticks; tick += 1) this.#delay(0.12 + tick * 0.16, () => {
            if (!this.#isWizardGenerationCurrent(player, castState)) return;
            this.#hitEnemiesInRadius(at, combat.blastRadius, skillDamage(player.attackPower, combat) * (combat.vortexMult ?? 0), {
              knockback: 0.4, multiHit: true, skill: true,
            });
          });
          if (combat.prominence) this.#hitEnemiesInRadius(at, combat.blastRadius * 1.35,
            skillDamage(player.attackPower, combat) * (combat.flareMult ?? 0), {
              knockback: 2.8, multiHit: true, armorPierce: .3, skill: true,
              sameCastHit: { key: `${castId}:prominence-flare`, maxHits: 1 },
            });
          const apexTarget=this.game.enemies.enemies.filter(enemy=>enemy.alive&&enemy.position.distanceTo(at)<=combat.blastRadius*1.35+enemy.radius)
            .sort((a,b)=>a.position.distanceToSquared(at)-b.position.distanceToSquared(at))[0];
          if(apexTarget)this.#applyApexKeystone(player,apexTarget,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat),castKey:castId,budget:castState.apexBudget,overcast:castState.overcast});
        },
        explode: {
          radius: combat.blastRadius,
          damage: skillDamage(player.attackPower, combat, 'blastMult') * player.skillPower,
          color: theme.accent,
          theme,
          status: combat.status ?? null,
          skillPowerApplied: true,
          onHit: handleFireLanded,
          sameCastHit: { key: `${castId}:blast`, maxHits: 1 },
        },
      });
    };
    if (phase != null && phase !== 'full') fire();
    else fire();
  }

  #frostNova(player, bundle, phase = null, apexAudio = null) {
    const fire = () => {
      if (!player.alive) return;
      const castState = this.#beginWizardCast(player, bundle.id, bundle);
      castState.apexAudio = apexAudio;
      const { combat, theme } = this.#skillBundle(bundle);
      const rank = bundle.rank;
      const radius = combat.radius;
      const center = player.position.clone();
      const castFacing = this.#facingDir(player);
      player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.28);
      this.game.effects.recipeIceNova(center, theme, radius);
      this.#apexAudioPhase(player, castState.apexAudio, 'impact');
      // Rank 3+: deepen chill on already-slowed targets (B5).
      for (const enemy of this.game.enemies.enemies) {
        if (!enemy.alive) continue;
        if (enemy.position.distanceTo(center) > radius + enemy.radius) continue;
        if (rank >= 3 && enemy.statuses?.slow?.remaining > 0) {
          enemy.applyStatus?.('slow', {
            duration: combat.deepChillDuration ?? 1.55,
            power: combat.deepChillPower ?? 0.58,
          }, this.game);
        }
      }
      const frostCastId = `frost-${++this.spellCastSerial}`;
      const executionCrystals = new Set(combat.crystalExecuteMult
        ? this.game.enemies.enemies.filter(enemy => enemy.alive
          && (enemy.elite || enemy.boss)
          && enemy.spellPrime?.id === 'crystal')
        : []);
      if (combat.lances) this.game.effects.recipeCrystalDominion?.(center, theme, radius, Math.min(6, combat.lances), Boolean(combat.dominion));
      this.#hitEnemiesInRadius(
        center,
        radius,
        skillDamage(player.attackPower, combat),
        {
          knockback: combat.knockback ?? 5.4,
          multiHit: true,
          criticalBonus: combat.criticalBonus ?? 0.04,
          skill: true,
          status: combat.status ?? null,
          onHit: enemy => {
            const reacted = this.#reactSpellPrime(enemy, 'frost', player, skillDamage(player.attackPower, combat), { castId: frostCastId });
            const executes = !reacted && executionCrystals.has(enemy)
              && enemy.consumeSpellPrime?.('crystal');
            if (executes) {
              executionCrystals.delete(enemy);
              this.game.effects.recipeSpellReaction?.(enemy.position, 'crystal_execution', castFacing);
              this.#damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.crystalExecuteMult, {
                direction: enemy.position.clone().sub(center).setY(0).normalize(),
                knockback: .8, armorPierce: .35, multiHit: true, skill: true,
                sameCastHit: { key: `${frostCastId}:crystal-execution`, maxHits: 1 },
              });
            } else if (!reacted) {
              if (combat.crystalPrime) enemy.setSpellPrime?.('crystal', { depth: 0, remaining: 4 });
              else if (rank >= 3 && enemy.statuses?.slow?.remaining > 0) enemy.setSpellPrime?.('deep_chill', { depth: 0, remaining: 3 });
            }
          },
        },
      );
      if (combat.lances) this.#delay(.18, () => {
        if (!this.#isWizardGenerationCurrent(player, castState)) return;
        const lanceHits = new Map();
        for (let lance = 0; lance < Math.min(6, combat.lances); lance += 1) {
          const angle = lance / 6 * Math.PI * 2;
          const lanceDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
          for (const enemy of this.game.enemies.enemies) {
            if (!enemy.alive || (lanceHits.get(enemy.id) ?? 0) >= Math.min(2, combat.lancePerEnemyCap ?? 2)) continue;
            const offset = enemy.position.clone().sub(center).setY(0);
            const along = offset.dot(lanceDir);
            const lateral = offset.addScaledVector(lanceDir, -along).length();
            if (along < 0 || along > radius + 2.4 || lateral > .62 + enemy.radius) continue;
            lanceHits.set(enemy.id, (lanceHits.get(enemy.id) ?? 0) + 1);
            this.#damageEnemy(enemy, skillDamage(player.attackPower, combat) * (combat.lanceMult ?? 0), {
              direction: lanceDir, knockback: 1, multiHit: true, skill: true,
            });
          }
        }
      });
      if (combat.freezeChainCap) {
        const targets = this.game.enemies.enemies.filter(enemy => enemy.alive && enemy.position.distanceTo(center) <= radius + enemy.radius)
          .slice(0, Math.min(3, combat.freezeChainCap));
        for (const enemy of targets) {
          if (enemy.controlCategory === 'normal') enemy.applyStun?.(.65);
          else enemy.addStagger?.(enemy.controlCategory === 'boss' ? 22 : 16);
        }
      }
      if (combat.dominion) this.#delay(.42, () => {
        if (!player.alive || !this.#isWizardCastCurrent(player, castState)) {
          this.#endWizardCast(player, castState);
          return;
        }
        const facing = castFacing;
        for (const enemy of this.game.enemies.enemies) {
          if (!enemy.alive) continue;
          const offset = enemy.position.clone().sub(center).setY(0);
          const along = offset.dot(facing);
          const lateral = offset.addScaledVector(facing, -along).length();
          if (along < -1 || along > radius || lateral > 1.05 + enemy.radius) continue;
          const inwardRaw=skillDamage(player.attackPower,combat)*combat.inwardMult;const inwardResult=this.#damageEnemy(enemy, inwardRaw, {
            direction: facing.clone().negate(), knockback: 1.4, multiHit: true, skill: true,
          });
          if(inwardResult.amount>0)this.#applyApexKeystone(player,enemy,{bundle,theme,rawDamage:inwardRaw,castKey:frostCastId,budget:castState.apexBudget,overcast:castState.overcast});
        }
        this.#apexAudioPhase(player, castState.apexAudio, 'finisher');
        this.#endWizardCast(player, castState);
      });
      for (let i = 0; i < 3; i += 1) {
        this.#delay(0.1 + i * 0.08, () => {
          if (!player.alive) return;
          this.game.effects.ring(center, theme.secondary, radius * (0.5 + i * 0.16), {
            life: 0.28, startScale: 0.35, height: 0.06, opacity: 0.5,
          });
        });
      }
      if (!combat.dominion) this.#endWizardCast(player, castState);
    };
    if (phase != null && phase !== 'full') fire();
    else fire();
  }

  #arcaneBlink(player, bundle, apexAudio = null) {
    const castState = this.#beginWizardCast(player, bundle.id, bundle);
    castState.apexAudio = apexAudio;
    const blinkCastId = `blink-${castState.generation}-${++this.spellCastSerial}`;
    const { combat, theme } = this.#skillBundle(bundle);
    const target = this.#aimAlongFacing(player, combat.leap ?? 11);
    const from = player.position.clone();
    const radius = combat.radius;
    this.#telegraphCircle(target, radius, combat.telegraph ?? 0.42, theme.primary, () => {
      if (!player.alive || !this.#isWizardCastCurrent(player, castState)) {
        this.#endWizardCast(player, castState);
        return;
      }
      player.position.copy(target);
      this.game.world.resolvePosition(player.position, 0.48);
      const to = player.position.clone();
      player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.55);
      this.game.effects.recipeBlinkBurst(from, to, theme, radius);
      this.#apexAudioPhase(player, castState.apexAudio, 'impact');
      if (combat.routeMult) {
        const route = to.clone().sub(from).setY(0);
        const length = Math.max(0.001, route.length());
        const routeDir = route.normalize();
        let anchors = 0;
        const anchored = [];
        this.game.effects.recipeSpaceSeam?.(from, to, theme, Boolean(combat.spaceRend));
        const crossed = [];
        for (const enemy of this.game.enemies.enemies) {
          if (!enemy.alive) continue;
          const offset = enemy.position.clone().sub(from).setY(0);
          const along = clamp(offset.dot(routeDir), 0, length);
          if (offset.addScaledVector(routeDir, -along).length() > 1.2 + enemy.radius) continue;
          crossed.push({ enemy, along });
        }
        crossed.sort((a, b) => a.along - b.along);
        this.#delay(.12, () => {
          if (!this.#isWizardGenerationCurrent(player, castState)) return;
          for (const { enemy } of crossed) {
            this.#damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.routeMult, {
              direction: routeDir, knockback: 0.5, multiHit: true, skill: true,
              onHit: landed => {
                if (!this.#reactSpellPrime(landed, 'arcane', player, skillDamage(player.attackPower, combat), { castId: blinkCastId })
                  && anchors < Math.min(6, combat.anchors ?? 0)) {
                  landed.setSpellPrime?.('rift_anchor', { depth: 0, order: anchors, remaining: 4 });
                  anchored.push(landed); anchors += 1;
                }
              },
            });
          }
          anchored.forEach((enemy, order) => this.#delay(.14 + order * .07, () => {
            if (!enemy.alive || !this.#isWizardGenerationCurrent(player, castState)) return;
            this.#damageEnemy(enemy, skillDamage(player.attackPower, combat) * (combat.anchorMult ?? 0), {
              direction: routeDir, knockback: 0.4,
              armorPierce: combat.anchorArmorPierce && (enemy.elite || enemy.boss) ? combat.anchorArmorPierce : .3,
              multiHit: true, skill: true,
            });
          }));
        });
        const echoes = Math.min(2, Math.max(1, combat.routeEchoes ?? 1));
        if (echoes > 1) this.#delay(.26, () => {
          if (!this.#isWizardGenerationCurrent(player, castState)) return;
          for (const { enemy } of crossed) this.#damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.routeMult * .65, {
            direction: routeDir, knockback: .3, multiHit: true, skill: true,
          });
        });
        if (combat.spaceRend) this.#delay(.42, () => {
          if (!this.#isWizardGenerationCurrent(player, castState)) return;
          let apexTarget=null;for (const { enemy } of crossed){const seamRaw=skillDamage(player.attackPower,combat)*combat.seamMult;const seamResult=this.#damageEnemy(enemy, seamRaw, {
            direction: routeDir, knockback: .6, armorPierce: .4, multiHit: true, skill: true,
          });if(seamResult.amount>0&&!apexTarget)apexTarget=enemy;}
          if(apexTarget)this.#applyApexKeystone(player,apexTarget,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat)*combat.seamMult,castKey:blinkCastId,budget:castState.apexBudget,overcast:castState.overcast});
          this.#apexAudioPhase(player, castState.apexAudio, 'finisher');
        });
      }
      if (combat.lanceMult) {
        for (const enemy of this.game.enemies.enemies) {
          const offset = enemy.position.clone().sub(to).setY(0);
          const along = offset.dot(this.#facingDir(player));
          if (enemy.alive && along >= 0 && along <= radius + 3 && offset.length() <= radius + 3) this.#damageEnemy(enemy,
            skillDamage(player.attackPower, combat) * combat.lanceMult, { direction: this.#facingDir(player), knockback: 2, armorPierce: .4, skill: true });
        }
      }
      if (combat.horizonMult) {
        const midpoint = from.clone().add(to).multiplyScalar(.5);
        this.#delay(.22, () => {
          if (!this.#isWizardGenerationCurrent(player, castState)) return;
          this.#hitEnemiesInRadius(midpoint, radius * .75,
            skillDamage(player.attackPower, combat) * combat.horizonMult, { knockback: 1.5, multiHit: true, skill: true });
        });
      }
      this.#hitEnemiesInRadius(
        to,
        radius,
        skillDamage(player.attackPower, combat),
        {
          knockback: combat.knockback ?? 6.8,
          armorPierce: combat.armorPierce ?? 0.22,
          criticalBonus: combat.criticalBonus ?? 0.05,
          skill: true,
        },
      );
      this.#endWizardCast(player, castState);
    }, { fillOpacity: 0.14 });
  }

  #meteorStorm(player, bundle, apexAudio = null) {
    const castState = this.#beginWizardCast(player, bundle.id, bundle);
    castState.apexAudio = apexAudio;
    const { combat, theme } = this.#skillBundle(bundle);
    const facing = this.#facingDir(player);
    const center = this.#aimAlongFacing(player, combat.aim ?? 10);
    if (combat.worldEnder) {
      const durable = this.game.enemies.enemies.filter(enemy => enemy.alive && (enemy.elite || enemy.boss))
        .sort((a, b) => a.position.distanceToSquared(center) - b.position.distanceToSquared(center))[0];
      if (durable) center.copy(durable.position);
    }
    const hits = Math.min(10, Math.max(1, Math.round(combat.hits ?? 6), Math.round(combat.impactsCap ?? 0)));
    const fallHeight = combat.fallHeight ?? 8.5;
    let gravityReactions = 0;
    const reservedRifts = new Set();
    castState.impactsResolved = 0;
    castState.authoritiesExpected = hits * (combat.fractures ? 2 : 1);
    const meteorCastId = `meteor-${castState.generation}-${++this.spellCastSerial}`;
    const orbitTargets = combat.orbitTargets
      ? this.game.enemies.enemies.filter(enemy => enemy.alive)
        .sort((a, b) => a.position.distanceToSquared(center) - b.position.distanceToSquared(center))
        .slice(0, Math.min(6, combat.orbitTargets)) : [];
    // Fall-cone pattern along facing (distinct from star radial blades)
    for (let i = 0; i < hits; i += 1) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const lateral = (col - 1) * (1.8 + row * 0.35);
      const forward = 0.6 + row * 2.1 + i * 0.15 + (combat.pattern === 'movingRain' ? row * .7 : 0);
      const side = new THREE.Vector3(-facing.z, 0, facing.x);
      const point = center.clone()
        .addScaledVector(facing, forward - 2.2)
        .addScaledVector(side, lateral);
      if (orbitTargets.length) {
        const targetEnemy = orbitTargets[i % orbitTargets.length];
        const spiralAngle = i * 1.37;
        point.copy(targetEnemy.position).add(new THREE.Vector3(Math.cos(spiralAngle) * .55, 0, Math.sin(spiralAngle) * .55));
      }
      point.y = this.game.world.heightAt(point.x, point.z);
      this.#delay(0.08 + i * 0.11, () => {
        if (!this.#isWizardGenerationCurrent(player, castState)) return;
        const impactPoint = point.clone();
        let riftTarget = null;
        if (gravityReactions < Math.min(3, combat.gravityReactionCap ?? 3)) {
          riftTarget = this.game.enemies.enemies.filter(enemy => enemy.alive
            && enemy.spellPrime?.id === 'rift_anchor' && !reservedRifts.has(enemy)
            && enemy.position.distanceTo(impactPoint) <= combat.hitRadius + enemy.radius + 1.25)
            .sort((a, b) => a.position.distanceToSquared(impactPoint) - b.position.distanceToSquared(impactPoint))[0] ?? null;
          if (riftTarget) {
            reservedRifts.add(riftTarget);
            const shift = riftTarget.position.clone().sub(impactPoint).setY(0);
            if (shift.lengthSq() > 1.25 * 1.25) shift.setLength(1.25);
            impactPoint.add(shift);
            impactPoint.y = this.game.world.heightAt(impactPoint.x, impactPoint.z);
          }
        }
        if (combat.gravityLens) {
          const fallStart = impactPoint.clone().add(new THREE.Vector3(0, fallHeight, 0));
          this.game.effects.recipeGravityLens?.(fallStart, impactPoint, theme, i, hits, Boolean(combat.astralCataclysm));
        }
        this.#telegraphCircle(impactPoint, combat.hitRadius * 0.95, combat.telegraph ?? 0.26, theme.primary, () => {
          if (!this.#isWizardGenerationCurrent(player, castState)) return;
          this.#apexAudioPhase(player, castState.apexAudio, 'impact');
          this.game.effects.recipeMeteorDrop(impactPoint, theme, fallHeight);
          if (combat.fractures && (this.#quality() === 'high' || i % 2 === 0)) {
            this.game.effects.recipeGroundFracture?.(impactPoint, facing, theme, combat.hitRadius * 1.15);
          }
          this.#hitEnemiesInRadius(
            impactPoint,
            combat.hitRadius,
            skillDamage(player.attackPower, combat),
            {
              knockback: combat.knockback ?? 2.8,
              multiHit: true,
              armorPierce: combat.armorPierce ?? 0.18,
              skill: true,
              status: combat.status ?? null,
              onHit: enemy => {
                if (enemy === riftTarget && gravityReactions < Math.min(3, combat.gravityReactionCap ?? 3)
                  && enemy.consumeSpellPrime?.('rift_anchor')) {
                  gravityReactions += 1;
                  this.game.effects.recipeSpellReaction?.(enemy.position, 'rift_impact', facing);
                }
              },
            },
          );
          if (riftTarget?.spellPrime?.id === 'rift_anchor') reservedRifts.delete(riftTarget);
          castState.impactsResolved += 1;
          if (combat.fractures) this.#delay(.16, () => {
            if (!this.#isWizardGenerationCurrent(player, castState)) return;
            this.#hitEnemiesInRadius(impactPoint, combat.hitRadius * .72, skillDamage(player.attackPower, combat) * .16, {
              knockback: .4, multiHit: true, skill: true,
              sameCastHit: { key: `${meteorCastId}:fracture-${i}`, maxHits: 1 },
            });
            castState.impactsResolved += 1;
          });
        }, { fillOpacity: 0.13 });
      });
    }
    const resolveFinale = () => {
      if (!this.#isWizardCastCurrent(player, castState)) {
        this.#endWizardCast(player, castState);
        return;
      }
      if (castState.impactsResolved < castState.authoritiesExpected) {
        this.#delay(.035, resolveFinale);
        return;
      }
      this.game.effects.recipeMeteorFinale(center, theme, combat.finaleRadius ?? 5.6);
      this.#apexAudioPhase(player, castState.apexAudio, 'finisher');
      this.#hitEnemiesInRadius(
        center,
        combat.finaleRadius ?? 5.6,
        skillDamage(player.attackPower, combat, 'finaleMult'),
        {
          knockback: combat.finaleKnockback ?? 6.4,
          multiHit: true,
          armorPierce: combat.finaleArmorPierce ?? 0.3,
          skill: true,
          status: combat.status ?? null,
          sameCastHit: { key: `${meteorCastId}:finale`, maxHits: 1 },
          onHit:enemy=>this.#applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat,'finaleMult'),castKey:meteorCastId,budget:castState.apexBudget,overcast:castState.overcast}),
        },
      );
      if (combat.astralCataclysm) {
        this.game.effects.recipeGroundFracture?.(center, facing, theme, combat.finaleRadius * 1.25);
        this.#hitEnemiesInRadius(center, combat.finaleRadius * 1.15, skillDamage(player.attackPower, combat) * .35, {
          knockback: 2, multiHit: true, armorPierce: .35, skill: true,
          sameCastHit: { key: `${meteorCastId}:apex-fracture`, maxHits: 1 },
        });
      }
      this.#endWizardCast(player, castState);
    };
    this.#delay(0.2 + hits * 0.11, resolveFinale);
  }

  /** Dispatch a class energy burst from a full Focus/Rage gauge. Returns presentation hints for Player. */
  releaseEnergyBurst(player, def) {
    const handler = this.energyHandlers[def?.effect ?? 'dagger_rush'];
    return handler ? handler(player, def ?? {}) : null;
  }

  /** Rogue Focus burst — level-scaled dagger rush released by a single attack click. */
  #daggerRushBurst(player, def) {
    const hits = player.energyComboHits;
    const theme = getFxTheme('venom');
    const interval = (def.comboInterval ?? .085) * player.frenzyTimingScale;
    const range = def.comboRange ?? 3.1;
    for (let i = 0; i < hits; i += 1) {
      const finale = i === hits - 1;
      this.#delay(.04 + i * interval, () => {
        if (!player.alive) return;
        const direction = this.#facingDir(player);
        const hand = i % 2;
        // Micro-lunge per strike keeps the rush surging into the pack.
        player.velocity.addScaledVector(direction, finale ? 2.4 : 1.2);
        const origin = this.#handContactOrigin(player, hand === 1, direction, .14);
        this.game.effects.recipeFangRush(origin, direction, theme, range * (finale ? 1.3 : 1), i, finale);
        this.game.effects.recipeShadowCuts?.(origin, direction, hand ? theme.secondary : theme.primary, range);
        if (finale) {
          this.game.effects.ring(player.position, theme.core, 3.8, { life: .4, startScale: .15, height: .12, opacity: .8 });
          this.game.effects.pillar(player.position.clone().addScaledVector(direction, 1.1), theme.primary, 4.6, { life: .34, bottom: .6, opacity: .45 });
          this.game.effects.burst(
            player.position.clone().add(new THREE.Vector3(0, 1, 0)).addScaledVector(direction, 1.2),
            theme.secondary, 26, { speed: 6.8, size: .3, life: .5, upward: .35 },
          );
          this.game.effects.dust(player.position, theme.dust, 16, .44);
        }
        this.#hitEnemiesInCone(origin, direction, range * (finale ? 1.3 : 1), (def.comboArc ?? 1.5) * (finale ? 1.35 : 1),
          player.attackPower * (def.comboMult ?? .62) * (finale ? 1.6 : 1), {
            knockback: finale ? 5.5 : 1.4,
            criticalBonus: def.comboCritBonus ?? .25,
            multiHit: true,
            finisher: finale,
            energyCombo: true,
            onHit: enemy => this.#applyFrenzyContact(player, enemy, player.attackPower * (def.comboMult ?? .62), direction),
          });
        if (finale) {
          const main = this.#handContactOrigin(player, false, direction, .1);
          const off = this.#handContactOrigin(player, true, direction, .1);
          this.game.effects.recipeDualBladeCross?.(main.add(off).multiplyScalar(.5), direction, theme.primary, theme.secondary, range * 1.35);
        }
        this.game.audio.swing(Math.min(3, i % 4));
      });
    }
    return {
      duration: interval * hits + .32,
      anim: 'skill_death_lotus',
      sfx: 'skill_blade',
      floatText: `COMBO ×${hits}`,
    };
  }

  /** Knight Rage burst — a single Wrath Slam heavy crush in front of the knight. */
  #wrathSlamBurst(player, def) {
    const theme = getFxTheme('wrath');
    const radius = def.slamRadius ?? 4.6;
    this.#delay(.16, () => {
      if (!player.alive) return;
      const direction = this.#facingDir(player);
      const center = player.position.clone().addScaledVector(direction, radius * .55);
      center.y = this.game.world.heightAt(center.x, center.z);
      player.velocity.addScaledVector(direction, 2.6);
      this.game.effects.ring(center, theme.primary, radius, { life: .5, startScale: .1 });
      this.game.effects.ring(center, theme.core, radius * .55, { life: .3, startScale: .18, height: .12, opacity: .85 });
      this.game.effects.pillar(center, theme.secondary, 6.5, { life: .5, bottom: 1, opacity: .5 });
      this.game.effects.slash(player.position, direction, theme.primary, radius * 1.05, {
        height: 1.35, thickness: .09, life: .3, spin: 3.4, opacity: .9,
      });
      this.game.effects.burst(center.clone().add(new THREE.Vector3(0, 1, 0)), theme.secondary, 30, {
        speed: 6.6, size: .36, life: .6, upward: .5,
      });
      this.game.effects.dust(center, theme.dust, 20, .5);
      this.game.effects.impact(center.clone().add(new THREE.Vector3(0, 1.1, 0)), theme.primary, 'finisher', { direction });
      this.#hitEnemiesInRadius(center, radius, player.attackPower * (def.slamMult ?? 2.6), {
        knockback: def.slamKnockback ?? 7.5,
        armorPierce: def.slamArmorPierce ?? .3,
        criticalBonus: def.slamCritBonus ?? .12,
        finisher: true,
        energyCombo: true,
      });
    });
    return { duration: .6, anim: 'skill_skyfall', sfx: 'skill_leap', floatText: 'WRATH!' };
  }

  /** Ranger Focus burst — multi-arrow storm along facing cone. */
  #arrowStormBurst(player, def) {
    const theme = getFxTheme('hunt_amber');
    const arrows = Math.max(4, Math.round(def.stormArrows ?? 8));
    const direction = this.#facingDir(player);
    const baseYaw = Math.atan2(direction.x, direction.z);
    this.game.effects.recipeArrowStreak?.(player.position, direction, theme);
    for (let i = 0; i < arrows; i += 1) {
      this.#delay(0.04 + i * 0.055, () => {
        if (!player.alive) return;
        const spread = (i - (arrows - 1) / 2) * (def.stormSpread ?? 0.11);
        const dir = new THREE.Vector3(Math.sin(baseYaw + spread), 0, Math.cos(baseYaw + spread));
        const start = player.position.clone().add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(dir, 0.7);
        const finale = i === arrows - 1;
        this.#spawnFriendlyOrb(start, dir, {
          style: 'arrow',
          color: finale ? theme.core : theme.primary,
          damage: player.attackPower * (def.stormMult ?? 0.55) * (finale ? 1.35 : 1),
          speed: (def.stormSpeed ?? 24) + i * 0.15,
          radius: 0.9,
          life: def.stormLife ?? 3.3,
          pierce: 2,
          knockback: finale ? 4.2 : 2.0,
          skill: false,
          energyCombo: true,
          scale: finale ? 1.2 : 1.0,
          criticalBonus: def.stormCritBonus ?? 0.1,
        });
        if (i % 2 === 0) this.game.audio.swing(Math.min(3, i % 4));
      });
    }
    return {
      duration: 0.08 + arrows * 0.055 + 0.28,
      anim: 'skill_pierce_shot',
      sfx: 'skill_blade',
      floatText: `STORM ×${arrows}`,
    };
  }

  #piercingShot(player, bundle, phase = null, apexAudio = null) {
    const fire = () => {
      if (!player.alive) return;
      const { combat, theme } = this.#skillBundle(bundle);
      const direction = this.#facingDir(player);
      const side = new THREE.Vector3(-direction.z, 0, direction.x);
      const points = [];
      let splinters = 0;
      let split = false;
      const apexBudget={targets:new Map(),casts:new Set()};
      const generations=this.rangerGeneration.get(player)??{};const generation=(generations.pierce??0)+1;generations.pierce=generation;this.rangerGeneration.set(player,generations);
      const current=()=>player.alive&&player.classId==='ranger'&&this.rangerGeneration.get(player)?.pierce===generation;
      const castId = `ranger-q-${++this.rangerSerial}`;
      this.game.effects.recipeArrowStreak?.(player.position, direction, theme, Boolean(combat.railArrow));
      const start = player.position.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(direction, 1.0);
      this.#spawnFriendlyOrb(start, direction, {
        style: 'heavy_arrow',
        color: theme.primary,
        damage: skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1),
        speed: (combat.speed ?? 18) * (combat.speedMult ?? 1),
        radius: (combat.radius ?? 0.95) * (combat.radiusMult ?? 1),
        life: combat.life ?? 1.15,
        pierce: Math.max(1, Math.round((combat.pierce ?? 3) + (combat.crowdPierce ?? 0))),
        knockback: combat.knockback ?? 3.2,
        skill: true,
        scale: combat.scale ?? 1.1,
        armorPierce: combat.armorPierce ?? 0.18,
        statusOnHit: combat.status ?? null,
        castId,
        ownerGuard:current,
        onHit: enemy => {
          this.#apexAudioPhase(player,apexAudio,'impact');
          if (points.length < Math.min(6, combat.storedPierceCap ?? 6)) points.push(enemy.position.clone());
          if (combat.fishbone && splinters < Math.min(12, combat.splinterCap ?? 12)) {
            for (const sign of [-1, 1]) {
              if (splinters >= 12) break;
              const splinterDir = side.clone().multiplyScalar(sign);
              this.#spawnFriendlyOrb(enemy.position.clone().add(new THREE.Vector3(0, .8, 0)).addScaledVector(splinterDir, enemy.radius + .7), splinterDir, {
                style: 'arrow', color: theme.secondary, damage: skillDamage(player.attackPower, combat) * combat.splinterMult,
                speed: 13, radius: .45, life: .34, pierce: 1, skill: true, reactionDepth: 1, castId,
              });
              splinters += 1;
            }
          }
          if (combat.splitArrow && !split) {
            split = true;
            for (const angle of [-.18, .18]) {
              const dir = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
              this.#spawnFriendlyOrb(enemy.position.clone().add(new THREE.Vector3(0, .8, 0)).addScaledVector(dir, enemy.radius + .7), dir, {
                style: 'arrow', color: theme.accent, damage: skillDamage(player.attackPower, combat) * combat.splitMult,
                speed: 16, radius: .5, life: .55, pierce: 1, skill: true, reactionDepth: 1, castId,
              });
            }
          }
          if (combat.dragonPiercer && (enemy.elite || enemy.boss)) enemy.addStagger?.(combat.bossStagger ?? 24);
        },
        onRetire: projectile => {
          if (projectile.suppressRetireAuthority || this._clearing || !current()) return;
          this.#apexAudioPhase(player,apexAudio,'finisher');
          if (combat.backwardRelease && points.length) {
            const corridor = points.slice(0, 6);
            this.game.effects.recipeRangerBackwardCorridor?.(corridor, direction, theme);
            for (const enemy of this.game.enemies.enemies) {
              if (!enemy.alive) continue;
              const crossed = corridor.some(point => {
                const offset = enemy.position.clone().sub(point).setY(0);
                const along = offset.dot(direction.clone().negate());
                return along >= 0 && along <= 4.5 && offset.addScaledVector(direction, along).length() <= .7 + enemy.radius;
              });
              if (crossed) this.#damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.backwardMult, {
                multiHit: true, skill: true, sameCastHit: { key: `${castId}:backward:${enemy.id}`, maxHits: 1 },
              });
            }
          }
          if (combat.horizonBreaker) {
            const ruptureHits = new Map();
            points.slice(0, Math.min(6, combat.ruptureCap ?? 6)).forEach((point, index) => this.#delay(.08 + index * .05, () => {
            if(!current())return;
            this.game.effects.recipeRangerRupture?.(point, direction, theme);
            for (const enemy of this.game.enemies.enemies) {
              if (!enemy.alive || (ruptureHits.get(enemy.id) ?? 0) >= Math.min(2, combat.rupturePerEnemyCap ?? 2)
                || enemy.position.distanceTo(point) > 1.25 + enemy.radius) continue;
              const result = this.#damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.ruptureMult, {
                multiHit: true, skill: true, sameCastHit: { key: `${castId}:rupture:${enemy.id}`, maxHits: 1 },
              });
              if(result.amount>0)this.#applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat)*combat.ruptureMult,castKey:castId,budget:apexBudget});
              if (result.amount > 0) ruptureHits.set(enemy.id, (ruptureHits.get(enemy.id) ?? 0) + 1);
            }
          }));
          }
        },
      });
    };
    if (phase != null && phase !== 'full') fire();
    else fire();
  }

  #caltropTrap(player, bundle, apexAudio = null) {
    const { combat, theme } = this.#skillBundle(bundle);
    if (!combat.seedLanded) {
      const direction = this.#facingDir(player);
      const distance = combat.aim ?? 7.5;
      const start = player.position.clone().add(new THREE.Vector3(0, 1, 0));
      this.#spawnFriendlyOrb(start, direction, {
        style: 'arrow', color: theme.primary, damage: skillDamage(player.attackPower, combat) * .35,
        speed: 15, radius: .4, life: distance / 15, pierce: 1, skill: true,
        onRetire: projectile => {
          if (projectile.suppressRetireAuthority || this._clearing || !player.alive || player.classId !== 'ranger') return;
          const impactCenter = projectile.mesh.position.clone(); impactCenter.y = this.game.world.heightAt(impactCenter.x, impactCenter.z);
          this.#caltropTrap(player, { ...bundle, combat: { ...combat, seedLanded: 1, impactCenter, seedFacing: direction } }, apexAudio);
        },
      });
      return;
    }
    const center = combat.impactCenter.clone();
    const castFacing = combat.seedFacing.clone();
    const radius = (combat.radius ?? 3.2) * (combat.radiusMult ?? 1);
    const ticks = Math.max(1, Math.round(combat.ticks ?? 5));
    const interval = combat.tickInterval ?? 0.55;
    const generation = (this.rangerGeneration.get(player)?.thorn ?? 0) + 1;
    const apexBudget={targets:new Map(),casts:new Set()};
    const generations = this.rangerGeneration.get(player) ?? {};
    generations.thorn = generation; this.rangerGeneration.set(player, generations);
    player.thornField = { generation, remaining: .08 + ticks * interval + .2, contacts: 0, planted: 0 };
    const current = () => player.alive && player.classId === 'ranger' && player.thornField?.generation === generation;
    this.game.effects.recipeTrapField?.(center, theme, radius);
    this.#apexAudioPhase(player,apexAudio,'impact');
    this.#hitEnemiesInRadius(center, 1.1, skillDamage(player.attackPower, combat) * (combat.seedMult ?? 1), {
      multiHit: true, skill: true, sameCastHit: { key: `thorn-${generation}:seed-impact`, maxHits: 1 },
    });
    if (combat.openClose) this.#delay(.05, () => current() && this.#hitEnemiesInRadius(center, radius,
      skillDamage(player.attackPower, combat) * combat.burstMult, { multiHit: true, skill: true,
        sameCastHit: { key: `thorn-${generation}:open`, maxHits: 1 } }));
    for (let i = 0; i < ticks; i += 1) {
      this.#delay(0.08 + i * interval, () => {
        if (!current()) return;
        this.game.effects.ring(center, i % 2 ? theme.secondary : theme.primary, radius * (0.55 + i * 0.08), {
          life: 0.32, startScale: 0.3, height: 0.06, opacity: 0.55,
        });
        this.#hitEnemiesInRadius(center, radius, skillDamage(player.attackPower, combat), {
          knockback: combat.knockback ?? 1.1,
          multiHit: true,
          skill: true,
          status: combat.status ?? null,
          sameCastHit: { key: `thorn-${generation}:tick-${i}`, maxHits: 1 },
          onHit: enemy => {
            player.thornField.contacts += 1;
            if (combat.snareBloom && enemy.controlCategory === 'normal'
              && (player.thornField.snares ?? 0) < Math.min(4, combat.snareCap ?? 4)) {
              player.thornField.snares = (player.thornField.snares ?? 0) + 1;
              enemy.pullToward?.(center, 0, .45, this.game.world, this.game.enemies.enemies);
            }
            const fieldTime = i * interval;
            if (combat.mineGarden && (enemy.elite || enemy.boss)
              && fieldTime >= (player.thornField.mineReadyAt ?? 0)
              && (player.thornField.mines ?? 0) < Math.min(3, combat.mineCap ?? 3)) {
              player.thornField.mines = (player.thornField.mines ?? 0) + 1;
              player.thornField.mineReadyAt = fieldTime + (combat.mineCooldown ?? .55);
              this.#damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.mineMult, {
                multiHit: true, skill: true, sameCastHit: { key: `thorn-${generation}:mine-${player.thornField.mines}`, maxHits: 1 },
              });
            }
            if (combat.plantedEvery && player.thornField.contacts % combat.plantedEvery === 0
              && player.thornField.planted < Math.min(4, combat.plantedCap ?? 4)) {
              player.thornField.planted += 1;
              const dir = castFacing;
              this.#spawnFriendlyOrb(center.clone().add(new THREE.Vector3(0, .6, 0)), dir, {
                style: 'arrow', color: theme.secondary, damage: skillDamage(player.attackPower, combat) * combat.plantedMult,
                speed: 15, radius: .45, life: .5, pierce: 2, skill: true, reactionDepth: 1,
              });
            }
          },
        });
        if (combat.lineCount) {
          const side = new THREE.Vector3(-castFacing.z, 0, castFacing.x);
          const lineHits = new Map();
          for (let line = 0; line < Math.min(5, combat.lineCount); line += 1) {
            const lineCenter = center.clone().addScaledVector(side, (line - (combat.lineCount - 1) / 2) * 1.05);
            for (const enemy of this.game.enemies.enemies) {
              if (!enemy.alive || (lineHits.get(enemy.id) ?? 0) >= 2) continue;
              const offset = enemy.position.clone().sub(lineCenter).setY(0);
              if (Math.abs(offset.dot(side)) > .42 + enemy.radius || Math.abs(offset.dot(castFacing)) > radius) continue;
              const result = this.#damageEnemy(enemy, skillDamage(player.attackPower, combat) * .32, {
                multiHit: true, skill: true, sameCastHit: { key: `thorn-${generation}:line-${i}-${line}:${enemy.id}`, maxHits: 1 },
              });
              if (result.amount > 0) lineHits.set(enemy.id, (lineHits.get(enemy.id) ?? 0) + 1);
            }
          }
        }
      });
    }
    this.#delay(.1 + ticks * interval, () => {
      if (!current()) return;
      if (combat.openClose) this.#hitEnemiesInRadius(center, radius, skillDamage(player.attackPower, combat) * combat.burstMult, {
        multiHit: true, skill: true, sameCastHit: { key: `thorn-${generation}:close`, maxHits: 1 },
      });
      if (combat.thornGrid) this.#delay(.08, () => {
        if (!current()) return;
        this.#apexAudioPhase(player,apexAudio,'finisher');
        this.game.effects.recipeThornGrid?.(center, castFacing, theme, combat.gridLines ?? 0);
        const side = new THREE.Vector3(-castFacing.z, 0, castFacing.x);
        const axisHits = new Map();
        for (const enemy of this.game.enemies.enemies) {
          if (!enemy.alive) continue;
          const offset = enemy.position.clone().sub(center).setY(0);
          const row = Math.abs(offset.dot(side)) <= .55 && Math.abs(offset.dot(castFacing)) <= radius;
          const column = Math.abs(offset.dot(castFacing)) <= .55 && Math.abs(offset.dot(side)) <= radius;
          for (const [axis, hit] of [['row', row], ['column', column]]) if (hit && (axisHits.get(enemy.id) ?? 0) < 2) {
            const result = this.#damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.finaleMult * .5, {
              multiHit: true, skill: true, sameCastHit: { key: `thorn-${generation}:grid:${axis}:${enemy.id}`, maxHits: 1 },
            });
            if(result.amount>0)this.#applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat)*combat.finaleMult*.5,castKey:`thorn-${generation}`,budget:apexBudget});
            if (result.amount > 0) axisHits.set(enemy.id, (axisHits.get(enemy.id) ?? 0) + 1);
          }
        }
        player.thornField = null;
      }); else player.thornField = null;
    });
  }

  #vaultShot(player, bundle, apexAudio = null) {
    const { combat, theme } = this.#skillBundle(bundle);
    const forward = this.#facingDir(player);
    const back = forward.clone().multiplyScalar(-1);
    const from = player.position.clone();
    if (bundle.playerLevel < 20) {
      player.position.addScaledVector(back, combat.dash ?? 3.6);
      this.game.world.resolvePosition(player.position, .48);
      player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? .4);
      this.game.effects.recipeVaultVolley?.(from, player.position, forward, theme);
      const count = Math.min(12, Math.max(1, Math.round(combat.arrows ?? 4)));
      const yaw0 = Math.atan2(forward.x, forward.z);
      for (let i = 0; i < count; i += 1) {
        const yaw = yaw0 + (i - (count - 1) / 2) * (combat.spread ?? .14);
        const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        this.#spawnFriendlyOrb(player.position.clone().add(new THREE.Vector3(0, 1.15, 0)), dir, {
          style: 'arrow', color: theme.primary, damage: skillDamage(player.attackPower, combat), speed: combat.speed,
          radius: combat.radius, life: combat.life, pierce: 1, skill: true, criticalBonus: combat.criticalBonus,
        });
      }
      return;
    }
    const generations = this.rangerGeneration.get(player) ?? {};
    const generation = (generations.vault ?? 0) + 1;
    generations.vault = generation; this.rangerGeneration.set(player, generations);
    const current = () => player.alive && player.classId === 'ranger' && this.rangerGeneration.get(player)?.vault === generation;
    const dash = (combat.dash ?? 3.6) * (combat.dashMult ?? 1);
    const landing = from.clone().addScaledVector(back, dash);
    this.game.world.resolvePosition(landing, 0.48);
    player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.4);
    this.game.effects.recipeVaultVolley?.(from, landing, forward, theme);
    this.game.effects.recipeSkyHunterArc?.(from, landing, forward, theme, combat.volleyLayers ?? 1);
    const arrows = Math.min(12, Math.max(1, Math.round(combat.arrows ?? 4)));
    const baseYaw = Math.atan2(forward.x, forward.z);
    const spread = (combat.spread ?? 0.14) * (combat.spreadMult ?? 1);
    const usedRedirects = new Set();
    const apexBudget={targets:new Map(),casts:new Set()};
    const shootLayer = (origin, count, layer = 0, landingLayer = false) => { for (let i = 0; i < count; i += 1) {
      const yaw = baseYaw + (i - (count - 1) / 2) * spread;
      let dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      if (combat.redirect && usedRedirects.size < Math.min(combat.redirectCap ?? 6, 6)) {
        const target = this.game.enemies.enemies.filter(enemy => enemy.alive && !usedRedirects.has(enemy.id))
          .map(enemy => ({ enemy, offset: enemy.position.clone().sub(origin).setY(0) }))
          .filter(entry => entry.offset.length() <= 12 && entry.offset.normalize().dot(dir) >= Math.cos(35 * Math.PI / 180))
          .sort((a, b) => a.enemy.position.distanceToSquared(origin) - b.enemy.position.distanceToSquared(origin))[0]?.enemy;
        if (target) { usedRedirects.add(target.id); dir = target.position.clone().sub(origin).setY(0).normalize(); }
      }
      const start = origin.clone().add(new THREE.Vector3(0, 1.15 + layer * .3, 0)).addScaledVector(dir, 0.55);
      this.#spawnFriendlyOrb(start, dir, {
        style: 'arrow',
        color: i % 2 ? theme.secondary : theme.primary,
        damage: skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1),
        speed: combat.speed ?? 16.5,
        radius: combat.radius ?? 0.88,
        life: combat.life ?? 0.85,
        pierce: 1,
        knockback: combat.knockback ?? 2.6,
        skill: true,
        scale: 0.95,
        criticalBonus: combat.criticalBonus ?? 0.06,
        onHit: landingLayer ? enemy => {
          const distance = enemy.position.distanceTo(landing);
          if (combat.idealMin&&(enemy.elite || enemy.boss) && distance >= combat.idealMin && distance <= combat.idealMax) this.#damageEnemy(enemy,
            skillDamage(player.attackPower, combat) * (combat.idealMult - 1), { multiHit: true, skill: true,
              sameCastHit: { key: `vault-${generation}:ideal:${enemy.id}`, maxHits: 1 } });
          if(combat.skyHunter)this.#applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat)*(combat.damageMult??1),castKey:`vault-${generation}`,budget:apexBudget});
        } : null,
      });
    }};
    const landingCount = combat.landingShot ? (combat.skyHunter ? Math.min(4, arrows) : 1) : 0;
    const airCount = combat.airVolley ? Math.min(4, Math.max(0, arrows - landingCount - 1)) : 0;
    const launchCount = Math.max(1, arrows - airCount - landingCount);
    this.#delay(.05, () => {
      if (!current()) return;
      this.#apexAudioPhase(player,apexAudio,'impact');
      if (combat.launchBlast) this.#hitEnemiesInRadius(from, 2.1, skillDamage(player.attackPower, combat) * .7, { multiHit: true, skill: true });
      shootLayer(from, launchCount, 0);
    });
    this.#delay(.14, () => {
      if (!current()) return;
      player.position.copy(landing); // one authoritative movement
      if (airCount) shootLayer(from.clone().add(landing).multiplyScalar(.5), airCount, 1);
    });
    this.#delay(.3, () => {
      if (!current()) return;
      if (landingCount) shootLayer(landing, landingCount, 2, true);
      this.#apexAudioPhase(player,apexAudio,'finisher');
    });
  }

  expirePredatorVerdict(player, generation) {
    const verdict = player.predatorVerdict;
    if (!verdict || verdict.generation !== generation) return false;
    return this.#detonateVerdict(player, verdict);
  }

  #detonateVerdict(player, verdict) {
    if (!verdict || player.predatorVerdict !== verdict) return false;
    const capturedMarkedTarget=verdict.target;
    player.predatorVerdict = null; // atomic before any derived authority
    const enemy = verdict.target;
    if (!enemy?.alive) return false;
    const { combat, theme } = this.#skillBundle(verdict.bundle);
    this.game.effects.recipePredatorConvergence?.(enemy.position, this.#facingDir(player), theme, Boolean(combat.apexVerdict));
    const detonationScale = verdict.detonationScale ?? 1;
    const raw = (skillDamage(player.attackPower, combat, 'detonateMult') + verdict.stored) * detonationScale;
    this.#damageEnemy(enemy, raw, { multiHit: true, skill: true, armorPierce: combat.verdictPierce ? .5 : .25, verdictDerived: true,
      sameCastHit: { key: `verdict-${verdict.generation}:primary`, maxHits: 1 } });
    if (combat.bossStagger && enemy.boss) enemy.addStagger?.(combat.bossStagger);
    for (const linked of verdict.linked ?? []) if (linked.target?.alive) this.#damageEnemy(linked.target,
      (skillDamage(player.attackPower, combat, 'detonateMult') + linked.stored) * linked.detonationScale, {
        multiHit: true, skill: true, verdictDerived: true,
        sameCastHit: { key: `verdict-${verdict.generation}:transfer:${linked.target.id}`, maxHits: 1 },
      });
    if (combat.verdictPierce) {
      const facing = this.#facingDir(player);
      this.#hitEnemiesInCone(enemy.position.clone().addScaledVector(facing, -.25), facing, 6, .7,
        raw * combat.verdictPierceMult, { multiHit: true, skill: true, verdictDerived: true,
          sameCastHit: { key: `verdict-${verdict.generation}:pierce`, maxHits: 1 } });
    }
    const chains = Math.min(2, combat.verdictChains ?? 0);
    if (chains) this.game.enemies.enemies.filter(other => other.alive && other !== enemy)
      .sort((a, b) => a.position.distanceToSquared(enemy.position) - b.position.distanceToSquared(enemy.position))
      .slice(0, chains).forEach((other, index) => this.#damageEnemy(other, raw * combat.chainMult, {
        multiHit: true, skill: true, verdictDerived: true, sameCastHit: { key: `verdict-${verdict.generation}:chain-${index}`, maxHits: 1 },
      }));
    if (combat.transferMarks && (verdict.depth ?? 0) < 1) {
      const transfers = this.game.enemies.enemies.filter(other => other.alive && other !== enemy)
        .sort((a, b) => a.position.distanceToSquared(enemy.position) - b.position.distanceToSquared(enemy.position))
        .slice(0, Math.min(2, combat.transferMarks));
      if (transfers.length) {
        for (const transfer of transfers) transfer.applyStatus?.('expose', { duration: 2.2, power: .12, damageAmp: .08 }, this.game);
        const [primary, ...linked] = transfers.map(transfer => ({ target: transfer,
          stored: Math.min(verdict.cap * combat.transferMult, verdict.stored * combat.transferMult),
          detonationScale: combat.transferMult }));
        player.predatorVerdict = { ...verdict, generation: ++this.rangerSerial, target: primary.target, remaining: 2.2,
          stored: primary.stored, cap: verdict.cap * combat.transferMult, detonationScale: primary.detonationScale,
          linked, depth: 1 };
      }
    }
    if (combat.apexVerdict) this.#hitEnemiesInRadius(enemy.position, 2.4, raw * combat.convergenceMult, {
      multiHit: true, skill: true, verdictDerived: true, sameCastHit: { key: `verdict-${verdict.generation}:convergence`, maxHits: 1 },
    });
    this.#applyApexKeystone(player,enemy,{bundle:verdict.bundle,theme,rawDamage:raw,castKey:`verdict-${verdict.generation}`,budget:{targets:new Map(),casts:new Set()},capturedMarkedTarget});
    return true;
  }

  #hunterMark(player, bundle, apexAudio = null) {
    const { combat, theme } = this.#skillBundle(bundle);
    const rank = bundle.rank;
    const direction = this.#facingDir(player);
    const range = combat.range ?? 14;
    const cosThreshold = Math.cos((combat.arc ?? 1.4) * 0.5);
    let best = null;
    let bestDist = Infinity;
    for (const enemy of this.game.enemies.enemies) {
      if (!enemy.alive) continue;
      const offset = TMP_A.copy(enemy.position).sub(player.position).setY(0);
      const dist = offset.length();
      if (dist > range + enemy.radius || dist < 0.001) continue;
      const dir = offset.clone().normalize();
      if (dir.dot(direction) < cosThreshold) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = enemy;
      }
    }
    if (!best) {
      // Fallback: nearest living enemy in world radius of aim
      for (const enemy of this.game.enemies.enemies) {
        if (!enemy.alive) continue;
        const dist = enemy.position.distanceTo(player.position);
        if (dist < bestDist && dist < range + 4) {
          bestDist = dist;
          best = enemy;
        }
      }
    }
    if (!best) {
      this.game.effects.recipeMarkGlyph?.(player.position.clone().addScaledVector(direction, 4), theme, 2.2);
      return;
    }
    if (player.predatorVerdict) {
      this.#apexAudioPhase(player,apexAudio,'impact');
      this.#detonateVerdict(player, player.predatorVerdict);
      this.#apexAudioPhase(player,apexAudio,'finisher');
      return;
    }
    this.game.effects.recipeMarkGlyph?.(best.position, theme, 2.8);
    const landed = this.#damageEnemy(best, skillDamage(player.attackPower, combat), {
      direction: TMP_B.copy(best.position).sub(player.position).setY(0).normalize(),
      knockback: combat.knockback ?? 2,
      criticalBonus: combat.criticalBonus ?? 0.08,
      skill: true,
    });
    if (landed.amount <= 0) return;
    this.#apexAudioPhase(player,apexAudio,'impact');
    best.applyStatus?.('expose', {
      duration: combat.markDuration ?? 5.2,
      power: (combat.exposePower ?? 0.22) * (combat.exposeMult ?? 1),
      damageAmp: (combat.damageAmp ?? 0.16) * (combat.exposeMult ?? 1),
    }, this.game);
    const generation = ++this.rangerSerial;
    const storeMult = (combat.verdictStore ?? 0) * (combat.storeMult ?? 1);
    const cap = skillDamage(player.attackPower, combat) * (combat.verdictCap ?? 0) * (combat.capMult ?? 1);
    player.predatorVerdict = { generation, target: best, bundle, remaining: combat.markDuration ?? 5.2, stored: 0, storeMult, cap };
    this.#apexAudioPhase(player,apexAudio,'finisher');
  }

  #twinFangStab(player, bundle, hitIndex, state = null) {
    const { combat, theme } = this.#skillBundle(bundle);
    const rank = bundle.rank;
    const direction = this.#facingDir(player);
    let hits = Math.max(1, Math.round(combat.hits ?? 2));
    if (rank >= 3) hits = Math.max(hits, Math.round(combat.hitsAtRank3 ?? 3));
    const finale = hitIndex >= hits - 1;
    if (state && !this.#ownsCast(player, state.cast)) return;
    if(state&&hitIndex===0)this.#apexAudioPhase(player,state.apexAudio,'impact');
    if(state&&finale)this.#apexAudioPhase(player,state.apexAudio,'finisher');
    const offhand = hitIndex % 2 === 1;
    let origin = this.#handContactOrigin(player, offhand, direction, .18);
    if (hitIndex === 2 && hits >= 3) {
      const other = this.#handContactOrigin(player, true, direction, .18);
      origin = origin.add(other).multiplyScalar(.5);
    }
    this.game.effects.recipeFangRush(origin, direction, theme, combat.range, hitIndex, finale, offhand);
    this.game.audio.swing?.(offhand ? 1 : 0);
    let status = combat.status ? { ...combat.status } : null;
    if (status && rank >= 3 && combat.bleedDurationBonus) {
      status = { ...status, duration: (status.duration ?? 2.6) + combat.bleedDurationBonus };
    }
    if (status && combat.bleedMult) status = { ...status, dps: (status.dps ?? .1) * combat.bleedMult };
    this.#hitEnemiesInCone(origin, direction, combat.range, combat.arc ?? 1.15, skillDamage(player.attackPower, combat), {
      knockback: combat.knockback ?? 1.6,
      criticalBonus: combat.criticalBonus ?? 0.15,
      multiHit: true,
      skill: true,
      status,
      onHit: enemy => {
        if(finale&&state)this.#applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat),castKey:`fang-${state.cast.generation}`,budget:state.apexBudget});
        if (state && combat.thousandFang && state.cutLines < Math.min(6, combat.cutLineCap ?? 6)) {
          state.cutLines += 1; state.targets.add(enemy);
          this.game.effects.recipeFangCutLine?.(origin, enemy.position, theme, state.cutLines);
        }
        if (finale && combat.consumeBleed && enemy.statuses?.bleed && !state.consumed.has(enemy.id)) {
          state.consumed.add(enemy.id); delete enemy.statuses.bleed;
          this.#damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.woundMult, {
            multiHit: true, skill: true, sameCastHit: { key: `fang-${state.cast.generation}:wound`, maxHits: 1 },
          });
        }
        if (finale && combat.durableMult && (enemy.elite || enemy.boss)) {
          this.#damageEnemy(enemy, skillDamage(player.attackPower, combat) * (combat.durableMult - 1), {
            multiHit: true, skill: true, sameCastHit: { key: `fang-${state.cast.generation}:heart`, maxHits: 1 },
          });
          enemy.addStagger?.(combat.durableStagger ?? 0);
        }
      },
    });
    if (finale && state && combat.backbite && !state.backbite) {
      state.backbite = true;
      this.#delay(.1, () => {
        if (!this.#ownsCast(player, state.cast)) return;
        const behind = player.position.clone().addScaledVector(direction, combat.range * .8);
        this.game.effects.recipeBackbite?.(behind, direction, theme);
        this.#hitEnemiesInCone(behind, direction.clone().negate(), combat.range, combat.arc ?? 1.15,
          skillDamage(player.attackPower, combat) * combat.backbiteMult, { multiHit: true, skill: true,
            sameCastHit: { key: `fang-${state.cast.generation}:backbite`, maxHits: 1 } });
      });
    }
    if (finale && state && combat.thousandFang) {
      for (const enemy of state.targets) if (enemy.alive) this.#damageEnemy(enemy,
        skillDamage(player.attackPower, combat) * combat.detonateMult, { multiHit: true, skill: true,
          sameCastHit: { key: `fang-${state.cast.generation}:detonate:${enemy.id}`, maxHits: 1 } });
      this.game.effects.recipeThousandFangFinale?.(player.position, direction, theme, state.cutLines);
    }
  }

  #twinFang(player, bundle, phase = null, apexAudio = null) {
    const { combat } = this.#skillBundle(bundle);
    const rank = bundle.rank;
    let hits = Math.max(1, Math.round(combat.hits ?? 2));
    if (rank >= 3) hits = Math.max(hits, Math.round(combat.hitsAtRank3 ?? 3));
    if (phase != null && phase !== 'full') {
      if (!player.alive) return;
      const index = Number(phase);
      if (!Number.isInteger(index) || index < 0 || index >= hits) return;
      let state = this.twinFangStates.get(player);
      if (index === 0) {
        state = { cast: this.#beginOwnedCast(player, bundle.id), bundle, completed: new Set(), backbite: false, cutLines: 0, targets: new Set(), consumed: new Set(), apexAudio, apexBudget:{targets:new Map(),casts:new Set()} };
        this.twinFangStates.set(player, state);
      }
      if (!state || state.bundle !== bundle || !this.#ownsCast(player, state.cast) || state.completed.has(index)) return;
      state.completed.add(index);
      this.#twinFangStab(player, bundle, index, state);
      if (index >= hits - 1) this.twinFangStates.delete(player);
      return;
    }
    const state = { cast: this.#beginOwnedCast(player, bundle.id), bundle, completed: new Set(), backbite: false, cutLines: 0, targets: new Set(), consumed: new Set(), apexAudio, apexBudget:{targets:new Map(),casts:new Set()} };
    this.twinFangStates.set(player, state);
    // Fallback absolute delays if anim timeline not used
    for (let hit = 0; hit < hits; hit += 1) {
      this.#delay(0.05 + hit * 0.12 * (combat.cadenceMult ?? 1), () => {
        if (!this.#ownsCast(player, state.cast)) return;
        if (state.completed.has(hit)) return;
        state.completed.add(hit);
        this.#twinFangStab(player, bundle, hit, state);
        if (hit === hits - 1) this.twinFangStates.delete(player);
      });
    }
  }

  #fanOfKnives(player, bundle, phase = null, apexAudio = null) {
    const {combat,theme}=this.#skillBundle(bundle);const acts=bundle.playerLevel>=100?3:bundle.playerLevel>=20?2:1;
    const daggerTrailRate=this.#quality()==='low'?6:this.#quality()==='medium'?10:16;
    const execute=index=>{let state=this.fanStates.get(player);if(index===0){state={cast:this.#beginOwnedCast(player,bundle.id),bundle,completed:new Set(),origin:player.position.clone(),facing:this.#facingDir(player),outbound:[],targets:[],bounced:new Set(),pinned:new Set(),finale:false,apexAudio,apexBudget:{targets:new Map(),casts:new Set()}};this.fanStates.set(player,state);}
      if(!state||state.bundle!==bundle||!this.#ownsCast(player,state.cast)||index<0||index>=acts||state.completed.has(index))return;state.completed.add(index);
      if(index===0)this.#apexAudioPhase(player,state.apexAudio,'impact');
      if(index===acts-1)this.#apexAudioPhase(player,state.apexAudio,'finisher');
      if(index===0){const knives=Math.min(combat.knifeCap??18,Math.max(1,Math.round(combat.knives??5)));const spread=(combat.spread??.16)*(combat.spreadMult??1);const yaw0=Math.atan2(state.facing.x,state.facing.z);this.game.effects.recipeNightPeacockAct?.(state.origin,state.facing,theme,0,Boolean(combat.nightPeacock));
        for(let i=0;i<knives;i+=1){const yaw=yaw0+(i-(knives-1)/2)*spread;const dir=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));const start=state.origin.clone().add(new THREE.Vector3(0,1.1,0)).addScaledVector(dir,.6);
          const projectile=this.#spawnFriendlyOrb(start,dir,{style:'dagger',color:i%2?theme.secondary:theme.primary,damage:skillDamage(player.attackPower,combat)*(combat.damageMult??1),speed:combat.speed,radius:combat.radius??.85,life:combat.life??.62,pierce:Math.round(combat.pierce??1),knockback:combat.knockback??2.4,skill:true,trailRate:daggerTrailRate,statusOnHit:combat.status??null,ownerGuard:()=>this.#ownsCast(player,state.cast),
            onHit:enemy=>{if(!state.targets.includes(enemy))state.targets.push(enemy);if(combat.pinnedMult&&(enemy.elite||enemy.boss)&&!state.pinned.has(enemy.id)){state.pinned.add(enemy.id);this.#damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.pinnedMult,{multiHit:true,skill:true,sameCastHit:{key:`fan-${state.cast.generation}:pinned:${enemy.id}`,maxHits:1}});enemy.addStagger?.(combat.pinnedStagger??0);}
              if(combat.bounceCap&&state.bounced.size<combat.bounceCap){const next=this.game.enemies.enemies.filter(other=>other.alive&&other!==enemy&&!state.bounced.has(other.id)).sort((a,b)=>a.position.distanceToSquared(enemy.position)-b.position.distanceToSquared(enemy.position))[0];if(next){state.bounced.add(next.id);this.#damageEnemy(next,skillDamage(player.attackPower,combat)*combat.bounceMult,{multiHit:true,skill:true,sameCastHit:{key:`fan-${state.cast.generation}:bounce:${next.id}`,maxHits:1}});}}},});state.outbound.push(projectile);}
      }else if(index===1){this.game.effects.recipeNightPeacockAct?.(state.origin,state.facing,theme,1,Boolean(combat.nightPeacock));if(combat.returnPass){const survivors=state.outbound.filter(projectile=>!projectile.retired&&projectile.life>0&&this.projectiles.includes(projectile)&&(!projectile.ownerGuard||projectile.ownerGuard())).map(projectile=>projectile.mesh.position.clone());for(const from of survivors){const dir=state.origin.clone().sub(from).setY(0).normalize();this.#spawnFriendlyOrb(from.addScaledVector(dir,.7),dir,{style:'dagger',color:theme.secondary,damage:skillDamage(player.attackPower,combat)*combat.returnMult,speed:combat.speed,radius:.65,life:.6,pierce:1,skill:true,trailRate:daggerTrailRate,reactionDepth:1,ownerGuard:()=>this.#ownsCast(player,state.cast)});}}
        for(const enemy of state.targets.slice(0,Math.min(6,combat.duplicateCap??0))){const dir=state.facing;this.#spawnFriendlyOrb(enemy.position.clone().add(new THREE.Vector3(0,.8,0)).addScaledVector(dir,enemy.radius+.7),dir,{style:'dagger',color:theme.core,damage:skillDamage(player.attackPower,combat)*combat.duplicateMult,speed:15,radius:.5,life:.45,pierce:1,skill:true,trailRate:daggerTrailRate,reactionDepth:1,ownerGuard:()=>this.#ownsCast(player,state.cast)});}
      }else if(index===2&&!state.finale){state.finale=true;this.game.effects.recipeNightPeacockAct?.(state.origin,state.facing,theme,2,true);const raw=skillDamage(player.attackPower,combat)*combat.finaleMult;this.#hitEnemiesInRadius(state.origin,combat.finaleRadius??3.2,raw,{multiHit:true,skill:true,sameCastHit:{key:`fan-${state.cast.generation}:finale`,maxHits:1},onHit:enemy=>this.#applyApexKeystone(player,enemy,{bundle,theme,rawDamage:raw,castKey:`fan-${state.cast.generation}`,budget:state.apexBudget})});}
      if(index===acts-1)this.fanStates.delete(player);};
    if(phase!=null&&phase!=='full'){const index=Number(phase);if(Number.isInteger(index))execute(index);return;}const chain=index=>{execute(index);if(index+1<acts)this.#delay(.18,()=>chain(index+1));};chain(0);
  }

  #shadowstep(player, bundle, apexAudio = null) {
    const { combat, theme } = this.#skillBundle(bundle);
    const direction = this.#facingDir(player);
    const from = player.position.clone();
    const target = this.#aimAlongFacing(player, combat.dash ?? 7.5);
    player.position.copy(target);
    this.game.world.resolvePosition(player.position, 0.48);
    player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.5);
    const to = player.position.clone();
    this.game.effects.recipeShadowDash(from, to, direction, theme);
    this.#apexAudioPhase(player,apexAudio,'impact');
    // Carve every enemy near the dash segment.
    const path = TMP_B.copy(to).sub(from).setY(0);
    const pathLength = Math.max(0.001, path.length());
    const pathDir = TMP_C.copy(path).normalize();
    const halfWidth = (combat.width ?? 2.2) * 0.5;
    const raw = skillDamage(player.attackPower, combat);
    for (const enemy of this.game.enemies.enemies) {
      if (!enemy.alive) continue;
      const offset = TMP_A.copy(enemy.position).sub(from).setY(0);
      const along = clamp(offset.dot(pathDir), 0, pathLength);
      const lateral = offset.addScaledVector(pathDir, -along).length();
      if (lateral > halfWidth + enemy.radius) continue;
      const side = enemy.position.clone().sub(from).setY(0).addScaledVector(pathDir, -along);
      const knockDir = side.lengthSq() > .001 ? side.normalize() : pathDir.clone();
      this.#damageEnemy(enemy, raw, {
        direction: knockDir,
        knockback: combat.knockback ?? 2.2,
        armorPierce: combat.armorPierce ?? 0.3,
        criticalBonus: combat.criticalBonus ?? 0.18,
        skill: true,
      });
    }
    this.game.effects.recipeDualBladeCross?.(to, direction, theme.primary, theme.secondary, combat.width * 1.4);
    if (bundle.playerLevel >= 20) {
      const frenzy=player.activateShadowFrenzy?.(combat,bundle);
      if(frenzy&&!frenzy.apexAudio)frenzy.apexAudio=apexAudio;
    }
  }

  endShadowFrenzy(player, state) {
    if (!player?.alive || !state?.exitMult || !state.contactCap) return 0;
    const generation = Math.max(0, Math.round(Number(state.generation) || 0));
    if (generation <= (this.frenzyTerminalGeneration.get(player) ?? -1)) return 0;
    this.frenzyTerminalGeneration.set(player, generation);
    this.#apexAudioPhase(player,state.apexAudio,'finisher');
    const contacts = Math.min(state.contactCap, Math.max(0, state.contactCount || 0));
    this.game.effects.recipeFrenzyExit?.(player.position, getFxTheme('shadow'), contacts, state.contactCap);
    if (contacts <= 0) return 0;
    const raw=player.attackPower*state.exitMult*contacts;const budget={targets:new Map(),casts:new Set()};
    this.#hitEnemiesInRadius(player.position, 4.4, raw, {
      knockback: 3.2, multiHit: true, finisher: true, skill: true,
      onHit:enemy=>state.apexBundle&&this.#applyApexKeystone(player,enemy,{bundle:state.apexBundle,theme:getFxTheme('shadow'),rawDamage:raw,castKey:`frenzy-${generation}`,budget}),
    });
    return contacts;
  }

  #deathLotus(player, bundle, phase = null, apexAudio = null) {
    const { combat, theme } = this.#skillBundle(bundle);
    const legacy=bundle.playerLevel<20,acts=legacy?1:bundle.playerLevel>=100?3:2;
    const execute=index=>{let state=this.lotusStates.get(player);if(index===0){state={cast:this.#beginOwnedCast(player,bundle.id),bundle,completed:new Set(),origin:player.position.clone(),targets:[],echoed:new Set(),finale:false,apexAudio,apexBudget:{targets:new Map(),casts:new Set()}};this.lotusStates.set(player,state);}
      if(!state||state.bundle!==bundle||!this.#ownsCast(player,state.cast)||index<0||index>=acts||state.completed.has(index))return;state.completed.add(index);this.game.audio.swing?.(index);player.invulnerable=Math.max(player.invulnerable,combat.invuln??.6);
      if(index===0)this.#apexAudioPhase(player,state.apexAudio,'impact');
      if(index===acts-1)this.#apexAudioPhase(player,state.apexAudio,'finisher');
      if(index===0){const lines=legacy?Math.max(1,Math.round(combat.hits??8)):8;const radius=(combat.radius??3)*(combat.radiusMult??1);
        const landLine=i=>{if(!this.#ownsCast(player,state.cast))return;const angle=i/lines*Math.PI*2,dir=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));this.game.effects.recipeMoonlessAct?.(state.origin,dir,theme,0,Boolean(combat.moonless));for(const enemy of this.game.enemies.enemies){if(!enemy.alive)continue;const offset=enemy.position.clone().sub(state.origin).setY(0),along=offset.dot(dir),lateral=offset.addScaledVector(dir,-along).length();if(along<0||along>radius||lateral>.42+enemy.radius)continue;const result=this.#damageEnemy(enemy,skillDamage(player.attackPower,combat)*(combat.damageMult??1),{multiHit:true,skill:true,status:combat.bleedEvery&&(i+1)%combat.bleedEvery===0?combat.status:null,sameCastHit:{key:`lotus-${state.cast.generation}:line-${i}:${enemy.id}`,maxHits:1}});if(result.amount>0&&!state.targets.includes(enemy))state.targets.push(enemy);}};
        if(legacy){this.#delay(.14+lines*.09,()=>{if(!this.#ownsCast(player,state.cast))return;this.game.effects.recipeLotusFlurry?.(state.origin,theme,combat.finaleRadius??3.9,lines,true);this.#hitEnemiesInRadius(state.origin,combat.finaleRadius??3.9,skillDamage(player.attackPower,combat,'finaleMult'),{multiHit:true,skill:true,status:combat.status});});for(let i=lines-1;i>=0;i-=1)this.#delay(.04+i*.07,()=>{if(this.#ownsCast(player,state.cast))landLine(i);});}
        else for(let i=0;i<lines;i+=1)this.#delay(.02+i*.03,()=>landLine(i));
      }else if(index===1){this.game.effects.recipeMoonlessAct?.(state.origin,this.#facingDir(player),theme,1,Boolean(combat.moonless));state.targets.slice(0,Math.min(6,combat.echoCap??0)).forEach((enemy,i)=>this.#delay(.1+i*.04,()=>{if(this.#ownsCast(player,state.cast)&&enemy.alive)this.#damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.echoMult,{multiHit:true,skill:true,sameCastHit:{key:`lotus-${state.cast.generation}:echo:${enemy.id}`,maxHits:1}});}));
        if(combat.executeThreshold)for(const enemy of state.targets){if(!enemy.boss&&enemy.hp/Math.max(1,enemy.maxHp)<=combat.executeThreshold)this.#damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.executeMult,{multiHit:true,skill:true,sameCastHit:{key:`lotus-${state.cast.generation}:harvest:${enemy.id}`,maxHits:1}});}
        const durable=state.targets.find(enemy=>enemy.alive&&(enemy.elite||enemy.boss));if(durable&&combat.redirectCap)for(let i=0;i<Math.min(4,combat.redirectCap);i+=1)this.#damageEnemy(durable,skillDamage(player.attackPower,combat)*combat.durableMult,{multiHit:true,skill:true,sameCastHit:{key:`lotus-${state.cast.generation}:redirect-${i}`,maxHits:1}});if(durable&&combat.durableStagger)durable.addStagger?.(combat.durableStagger);
      }else if(index===2&&!state.finale){state.finale=true;this.game.effects.recipeMoonlessAct?.(state.origin,this.#facingDir(player),theme,2,true);const raw=skillDamage(player.attackPower,combat)*combat.moonlessFinaleMult;this.#hitEnemiesInRadius(state.origin,combat.finaleRadius??3.9,raw,{multiHit:true,skill:true,sameCastHit:{key:`lotus-${state.cast.generation}:finale`,maxHits:1},onHit:enemy=>this.#applyApexKeystone(player,enemy,{bundle,theme,rawDamage:raw,castKey:`lotus-${state.cast.generation}`,budget:state.apexBudget})});}
      if(index===acts-1)this.lotusStates.delete(player);};if(phase!=null&&phase!=='full'){const i=Number(phase);if(Number.isInteger(i))execute(i);return;}
    execute(0);
    if(acts>1)this.#delay(.32,()=>this.#delay(0,()=>{execute(1);if(acts>2)this.#delay(.18,()=>this.#delay(0,()=>execute(2)));}));
  }

  enemyMelee(enemy, options = {}) {
    const delay = enemy.boss ? .58 : enemy.elite ? .46 : .38;
    const radius = enemy.attackRange + enemy.radius + .55;
    const color = enemy.boss ? enemy.data.accent : 0xff5c59;
    this.#telegraphCircle(enemy.position, radius, delay, color, () => {
      if (!enemy.alive) return;
      const player = this.game.player;
      const toPlayer = TMP_A.copy(player.position).sub(enemy.position).setY(0);
      const distance = toPlayer.length();
      const direction = distance > .001 ? toPlayer.normalize() : enemy.facing;
      const dot = enemy.facing.dot(direction);
      const threshold = options.wide ? -.15 : .15;
      if (distance <= radius + .4 && dot >= threshold) {
        this.#damagePlayer(enemy.damage * (options.power ?? 1), direction, enemy.boss ? 8 : 4.2);
      }
      this.game.effects.slash(enemy.position, enemy.facing, color, radius * 1.2, {
        arc: options.wide ? Math.PI * 1.55 : Math.PI * .82,
        height: enemy.refs.modelHeight * .48, thickness: enemy.boss ? .11 : .065,
      });
      this.game.effects.dust(enemy.position, enemy.data.color, enemy.boss ? 18 : 7, enemy.boss ? .55 : .32);
    }, { follows: enemy, fillOpacity: .11 });
  }

  enemyProjectile(enemy, options = {}) {
    const delay = options.caster ? .72 : .46;
    const color = enemy.data.accent;
    // Casters throw crystalline bolts; physical ranged spit acidic blobs / shards by zone tone.
    const style = options.style
      ?? (options.caster ? 'enemy_bolt' : this.#enemyProjectileStyle(enemy));
    this.#telegraphCircle(enemy.position, enemy.radius * 1.15 + .55, delay, color, () => {
      if (!enemy.alive || !this.game.player.alive) return;
      const count = options.count ?? 1;
      const baseDirection = this.game.player.position.clone().sub(enemy.position).setY(0).normalize();
      for (let i = 0; i < count; i += 1) {
        const spread = count === 1 ? 0 : (i - (count - 1) / 2) * .2;
        const direction = baseDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
        this.#spawnEnemyProjectile(enemy, direction, {
          style,
          color, speed: options.caster ? 8.3 : 10.2,
          damage: enemy.damage * (options.caster ? 1.04 : .86),
          size: options.caster ? .34 : .25,
          homing: options.caster ? .22 : 0,
          statusOnHit: options.statusOnHit ?? null,
        });
      }
      this.game.effects.burst(enemy.position, color, options.caster ? 14 : 8, { speed: 2.5, size: .24, life: .42 });
    }, { follows: enemy, fillOpacity: .08 });
  }

  /** Pick a readable enemy projectile silhouette from zone / shape / role / family. */
  #enemyProjectileStyle(enemy) {
    const zone = enemy.data?.zone ?? '';
    const shape = enemy.data?.shape ?? '';
    const role = enemy.data?.role ?? '';
    const family = enemy.data?.family ?? '';
    if (role === 'controller' || enemy.data?.special === 'slow_bolt') return 'enemy_frost';
    if (role === 'artillery' || family.includes('spirit')) return 'enemy_bolt';
    if (zone === 'frost' || shape === 'wisp' || shape === 'fox') return 'enemy_frost';
    if (zone === 'ember' || zone === 'canyon' || shape === 'asp') return 'enemy_ember';
    if (zone === 'astral' || family.includes('astral')) return 'enemy_void';
    if (shape === 'boar' || shape === 'colossus' || shape === 'toad') return 'enemy_shard';
    return 'enemy_spit';
  }

  enemyCharge(enemy) {
    const start = enemy.position.clone();
    const direction = this.game.player.position.clone().sub(start).setY(0).normalize();
    const distance = clamp(start.distanceTo(this.game.player.position) + 2.8, 6, 13.5);
    const end = start.clone().addScaledVector(direction, distance);
    end.y = this.game.world.heightAt(end.x, end.z);
    this.#lineTelegraph(start, direction, distance, enemy.radius * 2.2, .72, enemy.data.accent, () => {
      if (!enemy.alive) return;
      enemy.state = 'attacking';
      enemy.stateTimer = .55;
      this.charges.push({ enemy, start: enemy.position.clone(), end, direction, duration: .42, time: 0, hit: false, damage: enemy.damage * 1.22 });
    });
  }

  enemyLeap(enemy) {
    const target = this.game.player.position.clone();
    target.y = this.game.world.heightAt(target.x, target.z);
    const radius = enemy.boss ? 4.8 : 3.2;
    this.#telegraphCircle(target, radius, .86, enemy.data.accent, () => {
      if (!enemy.alive) return;
      const playerDistance = this.game.player.position.distanceTo(target);
      enemy.position.copy(target).addScaledVector(enemy.facing, -1.1);
      this.game.world.resolvePosition(enemy.position, enemy.radius);
      this.game.effects.ring(target, enemy.data.accent, radius, { life: .58, startScale: .08 });
      this.game.effects.burst(target, enemy.data.accent, enemy.boss ? 30 : 18, { speed: 5.2, size: .38, life: .72, additive: false });
      if (playerDistance < radius + .5) {
        const direction = this.game.player.position.clone().sub(target).setY(0).normalize();
        this.#damagePlayer(enemy.damage * 1.3, direction, enemy.boss ? 10 : 6.5);
      }

    }, { fillOpacity: .16 });
  }

  enemyBossSpecial(enemy) {
    const special = enemy.data.special;
    this.game.audio.boss();
    if (special === 'roots') this.#bossRoots(enemy);
    else if (special === 'stampede') this.#bossStampede(enemy);
    else if (special === 'sandstorm') this.#bossSandstorm(enemy);
    else if (special === 'blizzard') this.#bossBlizzard(enemy);
    else if (special === 'inferno') this.#bossInferno(enemy);
    else this.#bossEclipse(enemy);
  }

  #bossRoots(enemy) {
    const center = this.game.player.position.clone();
    for (let i = 0; i < 7; i += 1) {
      const angle = i / 7 * Math.PI * 2 + rand(-.22, .22);
      const radius = i === 0 ? 0 : rand(2, 6.8);
      const point = center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      point.y = this.game.world.heightAt(point.x, point.z);
      this.#delay(i * .09, () => this.#telegraphCircle(point, 1.55, .72, 0x7de57b, () => {
        this.game.effects.pillar(point, 0x73d26f, 4.5, { life: .62, bottom: .62 });
        if (this.game.player.position.distanceTo(point) < 1.85) this.#damagePlayer(enemy.damage * .88, this.game.player.position.clone().sub(point).setY(0).normalize(), 4.8);
      }, { fillOpacity: .14 }));
    }
  }

  #bossStampede(enemy) {
    const base = this.game.player.position.clone().sub(enemy.position).setY(0).normalize();
    for (let i = -1; i <= 1; i += 1) {
      this.#delay((i + 1) * 1.08, () => {
        const direction = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), i * .28);
        const distance = 16;
        this.#lineTelegraph(enemy.position, direction, distance, 2.4, .72, 0xb7ef8a, () => {
          if (!enemy.alive) return;
          this.charges.push({
            enemy, start: enemy.position.clone(), end: enemy.position.clone().addScaledVector(direction, distance),
            direction, duration: .52, time: 0, hit: false, damage: enemy.damage * 1.05,
          });
        });
      });
    }
  }

  #bossSandstorm(enemy) {
    this.#telegraphCircle(enemy.position, 7.2, .9, 0xffc266, () => {
      if (!enemy.alive) return;
      this.game.effects.ring(enemy.position, 0xffc266, 7.2, { life: .8, startScale: .1 });
      for (let i = 0; i < 18; i += 1) {
        const direction = new THREE.Vector3(Math.cos(i / 18 * Math.PI * 2), 0, Math.sin(i / 18 * Math.PI * 2));
        this.#spawnEnemyProjectile(enemy, direction, {
          style: 'enemy_ember', color: 0xffb95f, speed: 8.2, damage: enemy.damage * .62, size: .28,
        });
      }
      if (this.game.player.position.distanceTo(enemy.position) < 7.5) {
        const direction = this.game.player.position.clone().sub(enemy.position).setY(0).normalize();
        this.#damagePlayer(enemy.damage * 1.15, direction, 8);
      }
    }, { follows: enemy, fillOpacity: .15 });
  }

  #bossBlizzard(enemy) {
    const center = this.game.player.position.clone();
    for (let i = 0; i < 10; i += 1) {
      const point = center.clone().add(new THREE.Vector3(rand(-7, 7), 0, rand(-7, 7)));
      point.y = this.game.world.heightAt(point.x, point.z);
      this.#delay(i * .12, () => this.#telegraphCircle(point, 1.75, .62, 0xc9f6ff, () => {
        this.game.effects.pillar(point, 0xdffbff, 5.5, { life: .6, bottom: .48 });
        this.game.effects.burst(point, 0xe9fdff, 11, { speed: 3.8, size: .26, life: .65, gravity: 3 });
        if (this.game.player.position.distanceTo(point) < 2) this.#damagePlayer(enemy.damage * .78, this.game.player.position.clone().sub(point).setY(0).normalize(), 3.5);
      }, { fillOpacity: .12 }));
    }
  }

  #bossInferno(enemy) {
    const center = this.game.player.position.clone();
    const rings = [2.8, 5.4, 8];
    rings.forEach((ring, ringIndex) => {
      for (let i = 0; i < 7; i += 1) {
        const angle = i / 7 * Math.PI * 2 + ringIndex * .34;
        const point = center.clone().add(new THREE.Vector3(Math.cos(angle) * ring, 0, Math.sin(angle) * ring));
        point.y = this.game.world.heightAt(point.x, point.z);
        this.#delay(ringIndex * .22 + i * .035, () => this.#telegraphCircle(point, 1.35, .68, 0xff6b45, () => {
          this.game.effects.pillar(point, 0xff5e38, 5, { life: .68, bottom: .75 });
          if (this.game.player.position.distanceTo(point) < 1.65) this.#damagePlayer(enemy.damage * .74, this.game.player.position.clone().sub(point).setY(0).normalize(), 4.5);
        }, { fillOpacity: .16 }));
      }
    });
  }

  #bossEclipse(enemy) {
    const center = enemy.position.clone();
    this.#telegraphCircle(center, 9.2, 1.05, 0xc184ff, () => {
      if (!enemy.alive) return;
      this.game.effects.pillar(center, 0xc184ff, 11, { life: 1.1, bottom: 1.6 });
      for (let i = 0; i < 24; i += 1) {
        const angle = i / 24 * Math.PI * 2;
        const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        this.#spawnEnemyProjectile(enemy, direction, {
          style: i % 2 ? 'enemy_void' : 'enemy_bolt',
          color: i % 2 ? 0xc184ff : 0x7fcfff, speed: 7.2 + (i % 3) * .6,
          damage: enemy.damage * .56, size: .31, homing: i % 4 === 0 ? .18 : 0,
        });
      }
      const distance = this.game.player.position.distanceTo(center);
      if (distance < 9.4) this.#damagePlayer(enemy.damage * 1.2, this.game.player.position.clone().sub(center).setY(0).normalize(), 10);

    }, { follows: enemy, fillOpacity: .18 });
  }

  #spawnEnemyProjectile(enemy, direction, options = {}) {
    const color = options.color ?? enemy.data.accent;
    const style = options.style ?? 'enemy_spit';
    const dir = direction.clone().normalize();
    const sizeScale = options.size ? options.size / .25 : 1;
    const visual = createProjectileVisual(style, color, { scale: sizeScale });
    visual.root.position.copy(enemy.position);
    visual.root.position.y += Math.max(1, enemy.refs.modelHeight * (enemy.data.scale ?? 1) * .5);
    if (visual.orient) orientProjectile(visual.root, dir, 0);
    this.game.scene.add(visual.root);
    this.projectiles.push({
      mesh: visual.root,
      materials: visual.materials,
      friendly: false,
      style,
      orient: visual.orient,
      spin: visual.spin,
      spinRoll: 0,
      trailRate: visual.trailRate,
      trailSize: visual.trailSize,
      velocity: dir.clone().multiplyScalar(options.speed ?? 9),
      damage: options.damage ?? enemy.damage,
      radius: (options.size ?? .25) + .34,
      life: options.life ?? 3.4,
      source: enemy,
      homing: options.homing ?? 0,
      color,
      direction: dir,
      statusOnHit: options.statusOnHit ?? null,
    });
  }

  #hitEnemiesInCone(origin, direction, range, arc, rawDamage, options = {}) {
    const cosThreshold = Math.cos(arc * .5);
    const collected = [];
    for (const enemy of this.game.enemies.enemies) {
      if (!enemy.alive) continue;
      const offset = TMP_A.copy(enemy.position).sub(origin).setY(0);
      const distance = offset.length();
      if (distance > range + enemy.radius || distance < .001) continue;
      const dir = offset.normalize();
      const dot = dir.dot(direction);
      if (dot < cosThreshold) continue;
      collected.push({ enemy, direction: dir.clone() });
    }
    return this.#resolveMultiHits(collected, rawDamage, {
      ...options,
      direction: options.direction ?? direction,
    });
  }

  #hitEnemiesInRadius(origin, radius, rawDamage, options = {}) {
    const collected = [];
    for (const enemy of this.game.enemies.enemies) {
      if (!enemy.alive) continue;
      const offset = TMP_A.copy(enemy.position).sub(origin).setY(0);
      const distance = offset.length();
      if (distance > radius + enemy.radius) continue;
      const direction = distance > .001
        ? offset.normalize().clone()
        : new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize();
      collected.push({ enemy, direction });
    }
    return this.#resolveMultiHits(collected, rawDamage, options);
  }

  /**
   * Apply damage to collected hits; coalesce heavy impact VFX when 3+ land together.
   * options.coalesceVfx defaults true — set false to force per-enemy full impact().
   */
  #resolveMultiHits(collected, rawDamage, options = {}) {
    const hits = collected.length;
    if (hits <= 0) return 0;
    const coalesce = options.coalesceVfx !== false && hits >= 3;
    if (coalesce) {
      const centroid = new THREE.Vector3();
      let heightSum = 0;
      for (const entry of collected) {
        centroid.add(entry.enemy.position);
        heightSum += entry.enemy.refs.modelHeight * .48;
      }
      centroid.multiplyScalar(1 / hits);
      centroid.y += heightSum / hits;
      const weaponColor = this.game.player.weapon?.rarityColor ?? 0xeef8ff;
      // Scale 1.6 + 0.25×hits, cap ~4 (matches hit-feel roadmap).
      const scale = Math.min(4, 1.6 + 0.25 * hits);
      this.game.effects.impact(centroid, weaponColor, hits >= 5 ? 'finisher' : 'heavy', {
        direction: options.direction,
        scale,
      });
    }
    for (const entry of collected) {
      this.#damageEnemy(entry.enemy, rawDamage, {
        ...options,
        direction: entry.direction,
        liteImpact: coalesce,
      });
    }
    return hits;
  }

  #damageEnemy(enemy, rawDamage, options = {}) {
    const player = this.game.player;
    // Status synergy: slowed enemies are easier to crit (all classes);
    // rogue Opportunist adds crit vs bleeding/slowed prey.
    const statusAfflicted = enemy.statuses?.slow?.remaining > 0 || enemy.statuses?.bleed?.remaining > 0;
    const slowCritBonus = enemy.statuses?.slow?.remaining > 0 ? 0.04 : 0;
    const opportunistBonus = statusAfflicted ? player.passiveEffects.statusCrit : 0;
    const critical = !options.cannotCrit && Math.random() < clamp(player.critChance + (options.criticalBonus ?? 0) + slowCritBonus + opportunistBonus, 0, .8);
    const finisher = Boolean(options.finisher);
    let armorPierce = options.armorPierce ?? 0;
    if (enemy.statuses?.expose?.remaining > 0) {
      armorPierce = Math.min(0.85, armorPierce + (enemy.statuses.expose.power ?? 0.15));
    }
    // skillPower applied exactly once here unless skillPowerApplied (baked projectile damage).
    let damage = resolveSkillHitRaw(rawDamage, {
      skill: options.skill,
      skillPowerApplied: options.skillPowerApplied,
      skillPower: player.skillPower,
      critical,
      critMultiplier: player.critMultiplier,
    });
    // Knight Executioner / Ranger Predator: bonus damage vs enemies below 30% health.
    if (player.passiveEffects.execute > 0 && enemy.hp / Math.max(1, enemy.maxHp) < .3) {
      damage *= 1 + player.passiveEffects.execute;
    }
    // Hunter Mark (expose): flat damage amp while the mark lasts.
    if (enemy.statuses?.expose?.remaining > 0) {
      const amp = Number(enemy.statuses.expose.damageAmp) || 0;
      if (amp > 0) damage *= 1 + amp;
    }
    if (this.game.mode === 'rush') {
      damage *= this.game.rush?.damageMultiplierFor?.(enemy) ?? 1;
    }
    const result = enemy.takeDamage(damage, this.game, {
      direction: options.direction,
      knockback: (options.knockback ?? 2) * (critical ? 1.25 : 1),
      armorPierce,
      multiHit: options.multiHit,
      sameCastHit: options.sameCastHit,
      critical,
      finisher,
    });
    if (result.amount <= 0) return result;
    if (this.game.mode === 'rush') {
      this.game.rush?.onDamageEnemy?.(enemy, result, { skill: Boolean(options.skill), critical, finisher });
    }
    const verdict = player.predatorVerdict;
    if (!options.verdictDerived && verdict?.target === enemy && verdict.remaining > 0 && verdict.storeMult > 0) {
      verdict.stored = Math.min(verdict.cap, verdict.stored + result.amount * verdict.storeMult);
    }
    if (options.status) this.#applyHitStatus(enemy, options.status);
    options.onHit?.(enemy, result);
    // Focus builds only on landed rogue basic-attack hits, not skills or the combo itself.
    const energyDef = getHeroClass(player.classId).energy;
    if (energyDef && !options.skill && !options.energyCombo) {
      player.gainEnergy((energyDef.perHit ?? 0) + (critical ? energyDef.perCrit ?? 0 : 0));
    }
    const hitPoint = enemy.position.clone().add(new THREE.Vector3(0, enemy.refs.modelHeight * .48, 0));
    const weaponColor = player.weapon?.rarityColor ?? 0xeef8ff;
    const intensity = critical ? 'critical' : finisher ? 'finisher' : options.skill ? 'heavy' : 'light';

    // Multi-hit coalesce: small spark/trail only; heavy impact already fired at centroid.
    if (options.liteImpact) {
      this.game.effects.burst(hitPoint, critical ? 0xffe47a : weaponColor, 4, {
        speed: 3.6, size: .18, life: .28, gravity: 5, upward: .25, height: 0, opacity: .9,
      });
      this.game.effects.trail(hitPoint, critical ? 0xffe47a : weaponColor, critical ? .32 : .22, .16);
    } else {
      // Flashy contact VFX only — no camera shake. Defense slightly amps impact pop.
      const defenseHit = this.game.mode === 'defense' || this.game.mode === 'rush';
      this.game.effects.impact(hitPoint, critical ? 0xffe47a : weaponColor, intensity, {
        direction: options.direction,
      });
      if (defenseHit && (critical || finisher || options.skill)) {
        this.game.effects.trail(hitPoint, critical ? 0xffe47a : weaponColor, critical ? 0.42 : 0.3, 0.32);
      }
    }
    if (options.status?.id === 'slow') {
      this.game.effects.trail(hitPoint, 0x7ad8ff, 0.35, 0.35);
    } else if (options.status?.id === 'burn') {
      this.game.effects.trail(hitPoint, 0xff7a42, 0.32, 0.3);
    } else if (options.status?.id === 'bleed') {
      this.game.effects.trail(hitPoint, 0x4de8b8, 0.3, 0.28);
    }

    this.game.ui.floatText(hitPoint, `${critical ? 'CRIT ' : ''}${result.amount}`, critical ? 'critical' : 'damage');
    this.game.audio.hit(critical, finisher);

    if (player.leech > 0) player.heal(result.amount * player.leech);
    return result;
  }

  #damagePlayer(rawDamage, direction, force = 4) {
    const player = this.game.player;
    const knockback = direction?.clone?.().normalize().multiplyScalar(force) ?? null;
    const amount = player.takeDamage(rawDamage, knockback);
    if (amount <= 0) return;
    this.game.ui.floatText(player.position.clone().add(new THREE.Vector3(0, 1.8, 0)), `-${amount}`, 'hurt');
    this.game.effects.burst(player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff6b6b, 16, {
      speed: 4.6, size: .32, life: .52, upward: .45,
    });
    this.game.effects.ring(player.position, 0xff5c6a, 1.4, { life: .22, startScale: .2, height: .9, opacity: .55 });
    this.game.audio.hurt();
    if (!player.alive) this.game.handlePlayerDeath?.();
  }

  #telegraphCircle(position, radius, duration, color, callback, options = {}) {
    const group = new THREE.Group();
    const ringGeometry = new THREE.RingGeometry(.82, 1, 48);
    const fillGeometry = new THREE.CircleGeometry(1, 48);
    const ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .84, depthWrite: false, side: THREE.DoubleSide });
    const fillMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: options.fillOpacity ?? .09, depthWrite: false, side: THREE.DoubleSide });
    const fill = new THREE.Mesh(fillGeometry, fillMaterial);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    fill.rotation.x = ring.rotation.x = -Math.PI / 2;
    fill.position.y = .025; ring.position.y = .045;
    group.add(fill, ring);
    group.position.copy(position);
    group.position.y = this.game.world.heightAt(group.position.x, group.position.z) + .04;
    group.scale.setScalar(radius);
    this.game.scene.add(group);
    this.telegraphs.push({
      group, ring, fill, ringGeometry, fillGeometry, ringMaterial, fillMaterial,
      duration, time: 0, callback, follows: options.follows ?? null, radius,
    });
    return group;
  }

  #lineTelegraph(position, direction, length, width, duration, color, callback) {
    const geometry = new THREE.PlaneGeometry(width, length);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .2, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.atan2(direction.x, direction.z);
    mesh.position.copy(position).addScaledVector(direction, length * .5);
    mesh.position.y = this.game.world.heightAt(mesh.position.x, mesh.position.z) + .09;
    this.game.scene.add(mesh);
    this.telegraphs.push({
      group: mesh, ring: null, fill: mesh, ringGeometry: null, fillGeometry: geometry,
      ringMaterial: null, fillMaterial: material, duration, time: 0, callback, follows: null, line: true,
    });
  }

  #delay(time, callback) {
    this.delayed.push({ time, callback });
  }

  update(delta) {
    this.#updateDelayed(delta);
    this.#updateTelegraphs(delta);
    this.#updateCharges(delta);
    this.#updateProjectiles(delta);
  }

  #updateDelayed(delta) {
    for (let i = this.delayed.length - 1; i >= 0; i -= 1) {
      const action = this.delayed[i];
      if (!action) {
        this.delayed.splice(i, 1);
        continue;
      }
      action.time -= delta;
      if (action.time > 0) continue;
      this.delayed.splice(i, 1);
      try { action.callback(); } catch (error) { console.error('Delayed combat action failed:', error); }
      // Nested clear() emptied the queue — stop iterating stale indices.
      if (this._clearing || i > this.delayed.length) return;
    }
  }

  #updateTelegraphs(delta) {
    for (let i = this.telegraphs.length - 1; i >= 0; i -= 1) {
      const warning = this.telegraphs[i];
      // Nested clear() (e.g. player death mid-callback) can empty the list mid-loop.
      if (!warning || warning.time == null || !warning.duration) {
        if (i >= 0 && i < this.telegraphs.length) this.telegraphs.splice(i, 1);
        continue;
      }
      warning.time += delta;
      const t = clamp(warning.time / warning.duration, 0, 1);
      if (warning.follows?.alive) {
        warning.group.position.copy(warning.follows.position);
        warning.group.position.y = this.game.world.heightAt(warning.group.position.x, warning.group.position.z) + .04;
      }
      if (warning.ring) {
        warning.ring.scale.setScalar(.88 + Math.sin(t * Math.PI * 10) * .045);
        warning.ringMaterial.opacity = .38 + t * .55;
        warning.fillMaterial.opacity = (.06 + t * .16) * (.82 + Math.sin(t * Math.PI * 7) * .18);
      } else if (warning.fillMaterial) {
        warning.fillMaterial.opacity = .1 + t * .35 + Math.sin(t * Math.PI * 9) * .05;
      }
      if (t < 1) continue;
      if (warning.group) this.game.scene.remove(warning.group);
      warning.ringGeometry?.dispose(); warning.fillGeometry?.dispose();
      warning.ringMaterial?.dispose(); warning.fillMaterial?.dispose();
      // Only splice if this slot still holds the same entry (clear() may have wiped the array).
      if (this.telegraphs[i] === warning) this.telegraphs.splice(i, 1);
      try { warning.callback?.(); } catch (error) { console.error('Telegraph callback failed:', error); }
      // Nested clear() emptied the queue — stop iterating stale indices.
      if (this._clearing || i > this.telegraphs.length) return;
    }
  }

  #updateCharges(delta) {
    for (let i = this.charges.length - 1; i >= 0; i -= 1) {
      const charge = this.charges[i];
      if (!charge) {
        if (i >= 0 && i < this.charges.length) this.charges.splice(i, 1);
        continue;
      }
      const enemy = charge.enemy;
      if (!enemy?.alive) { this.charges.splice(i, 1); continue; }
      charge.time += delta;
      const t = clamp(charge.time / charge.duration, 0, 1);
      const eased = t * t * (3 - 2 * t);
      enemy.position.lerpVectors(charge.start, charge.end, eased);
      this.game.world.resolvePosition(enemy.position, enemy.radius);
      enemy.facing.copy(charge.direction);
      if (Math.random() < delta * 28) this.game.effects.dust(enemy.position, enemy.data.color, 3, .38);
      if (!charge.hit && enemy.position.distanceTo(this.game.player.position) < enemy.radius + .9) {
        charge.hit = true;
        this.#damagePlayer(charge.damage, charge.direction, enemy.boss ? 12 : 8);
        // Death mid-hit can clear() charges — abandon this pass.
        if (this._clearing || this.charges[i] !== charge) return;
      }
      if (t >= 1) {
        enemy.state = 'idle';
        enemy.stateTimer = 0;
        this.game.effects.ring(enemy.position, enemy.data.accent, enemy.radius * 2.1, { life: .35 });
        if (this.charges[i] === charge) this.charges.splice(i, 1);
      }
    }
  }

  #updateProjectiles(delta) {
    // Snapshot length so clear()/spawn re-entrancy cannot leave undefined holes mid-loop.
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      if (!projectile?.mesh || projectile.life == null) {
        if (i >= 0 && i < this.projectiles.length) this.projectiles.splice(i, 1);
        continue;
      }
      if (projectile.ownerGuard && !projectile.ownerGuard()) {
        const ground = this.game.world.heightAt(projectile.mesh.position.x, projectile.mesh.position.z);
        this.#retireProjectile(i, projectile, ground);
        continue;
      }

      projectile.life -= delta;
      if (projectile.friendly && projectile.homingTarget?.alive) {
        const desired = TMP_A.copy(projectile.homingTarget.position).sub(projectile.mesh.position).setY(0);
        if (desired.lengthSq() > 1e-6) {
          const speed = projectile.velocity.length();
          projectile.velocity.lerp(desired.normalize().multiplyScalar(speed), Math.min(1, delta * 8));
          projectile.direction.copy(projectile.velocity).setY(0).normalize();
        }
      }
      if (projectile.homing && !projectile.friendly && this.game.player.alive) {
        const targetDirection = TMP_A.copy(this.game.player.position).sub(projectile.mesh.position).setY(0);
        if (targetDirection.lengthSq() > 1e-6) {
          targetDirection.normalize();
          const speed = projectile.velocity.length();
          projectile.velocity.lerp(targetDirection.multiplyScalar(speed), Math.min(1, delta * projectile.homing * 3.2));
        }
        if (!projectile.direction) projectile.direction = new THREE.Vector3(0, 0, 1);
        projectile.direction.copy(projectile.velocity).setY(0);
        if (projectile.direction.lengthSq() > 1e-6) projectile.direction.normalize();
      }
      projectile.mesh.position.addScaledVector(projectile.velocity, delta);

      // Visual motion: orient arrows/knives along velocity; orbs tumble; waves hold yaw.
      const spin = projectile.spin ?? 'tumble';
      if (projectile.orient || projectile.wave) {
        if (spin === 'roll') projectile.spinRoll = (projectile.spinRoll ?? 0) + delta * (projectile.style === 'dagger' ? 18 : 10);
        else projectile.spinRoll = projectile.spinRoll ?? 0;
        const dir = projectile.velocity.lengthSq() > 1e-6
          ? projectile.velocity
          : (projectile.direction ?? TMP_A.set(0, 0, 1));
        orientProjectile(projectile.mesh, dir, projectile.spinRoll);
      } else if (spin === 'tumble') {
        projectile.mesh.rotation.x += delta * 5.5;
        projectile.mesh.rotation.y += delta * 8;
        projectile.mesh.rotation.z += delta * 3.2;
      }

      // Fade blade waves slightly as they travel
      if (projectile.wave && projectile.materials?.length) {
        const lifeFade = clamp(projectile.life * 1.2, 0.15, 1);
        for (const m of projectile.materials) {
          if (m) m.opacity = (m.userData.baseOpacity ?? 0.75) * lifeFade;
        }
      }

      const trailRate = projectile.trailRate ?? 16;
      const trailSize = projectile.trailSize ?? 0.18;
      if (projectile.wave) {
        this.game.effects.trail(projectile.mesh.position, projectile.color, 0.34, 0.13);
      } else if (Math.random() < delta * trailRate) {
        this.game.effects.trail(projectile.mesh.position, projectile.color, trailSize, trailSize * 0.9);
      }

      if (projectile.friendly) {
        const hitDir = projectile.direction?.clone?.()
          ?? projectile.velocity.clone().setY(0).normalize();
        for (const enemy of this.game.enemies.enemies) {
          if (!enemy.alive || projectile.hit.has(enemy.id)) continue;
          const distance = enemy.position.distanceTo(projectile.mesh.position);
          if (distance > projectile.radius + enemy.radius) continue;
          projectile.hit.add(enemy.id);
          this.#damageEnemy(enemy, projectile.damage, {
            direction: hitDir,
            knockback: projectile.knockback,
            armorPierce: projectile.armorPierce ?? .18,
            criticalBonus: projectile.criticalBonus ?? 0,
            skill: projectile.skill,
            skillPowerApplied: Boolean(projectile.skillPowerApplied),
            status: projectile.statusOnHit ?? null,
            energyCombo: projectile.energyCombo,
            onHit: (landedEnemy, result) => projectile.onHit?.(landedEnemy, projectile, result),
          });
          // clear() may have wiped the list (e.g. death mid-hit) — abandon this pass.
          if (!this.projectiles[i] || this.projectiles[i] !== projectile) return;
          projectile.pierce -= 1;
          if (projectile.pierce <= 0) projectile.life = 0;
        }
      } else if (this.game.player.alive && projectile.mesh.position.distanceTo(this.game.player.position.clone().add(new THREE.Vector3(0, .8, 0))) < projectile.radius + .55) {
        const direction = projectile.velocity.clone().setY(0);
        if (direction.lengthSq() > 1e-6) direction.normalize();
        else direction.set(0, 0, 1);
        this.#damagePlayer(projectile.damage, direction, 4.5);
        const status = projectile.statusOnHit;
        if (status?.id === 'player_slow' || status?.id === 'slow') {
          this.game.player.applySlow?.(status.duration ?? 1.2);
        } else if (status?.id === 'player_burn') {
          this.game.player.applySlow?.(0.45);
          const chip = Math.min(
            Math.round(this.game.player.maxHp * 0.03),
            Math.round(projectile.damage * (status.power ?? 0.08)),
          );
          if (chip > 0) this.game.player.takeDamage?.(chip, direction.clone().multiplyScalar(1.2));
        }
        // Vampiric source heals a little on projectile hit.
        if (projectile.source?.eliteAffix === 'vampiric' && projectile.source.alive) {
          const heal = Math.max(1, Math.round(projectile.source.maxHp * 0.02));
          projectile.source.hp = Math.min(projectile.source.maxHp, projectile.source.hp + heal);
        }
        if (!this.projectiles[i] || this.projectiles[i] !== projectile) return;
        projectile.life = 0;
      }

      // Bail if this entry was removed by a nested clear() during damage.
      if (!this.projectiles[i] || this.projectiles[i] !== projectile) return;

      const ground = this.game.world.heightAt(projectile.mesh.position.x, projectile.mesh.position.z);
      if (projectile.life <= 0 || projectile.mesh.position.y < ground + .05 || Math.hypot(projectile.mesh.position.x, projectile.mesh.position.z) > 180) {
        this.#retireProjectile(i, projectile, ground);
      }
    }
  }

  #retireProjectile(index, projectile, groundY) {
    if (!projectile || projectile.retired || this.projectiles[index] !== projectile) return;
    projectile.retired = true;
    try {
      if (projectile.explode && projectile.friendly && projectile.mesh) {
        const blast = projectile.explode;
        const at = projectile.mesh.position.clone();
        at.y = groundY;
        if (blast.theme && this.game.effects.recipeFireBlast) {
          this.game.effects.recipeFireBlast(at, blast.theme, blast.radius);
        } else {
          this.game.effects.ring(at, blast.color ?? projectile.color, blast.radius, { life: .42, startScale: .12 });
          this.game.effects.burst(at.clone().add(new THREE.Vector3(0, .8, 0)), blast.color ?? projectile.color, 18, {
            speed: 5.5, size: .32, life: .5, upward: .35,
          });
        }
        this.#hitEnemiesInRadius(at, blast.radius, blast.damage, {
          knockback: 4.2,
          multiHit: true,
          skill: true,
          skillPowerApplied: Boolean(blast.skillPowerApplied),
          armorPierce: .12,
          status: blast.status ?? null,
          onHit: blast.onHit ?? null,
          sameCastHit: blast.sameCastHit ?? null,
        });
      } else if (projectile.mesh) {
        this.game.effects.burst(projectile.mesh.position, projectile.color, 5, { speed: 2.2, size: .2, life: .3 });
      }
    } catch (error) {
      console.error('Projectile retire FX failed:', error);
    }
    // Terminal fire authority follows the base blast so its flare cannot claim
    // the Enemy iframe before the projectile's actual impact damage.
    if (!projectile.retireCallbackFired) {
      projectile.retireCallbackFired = true;
      projectile.suppressRetireAuthority = this.projectiles[index] !== projectile;
      projectile.onRetire?.(projectile, groundY);
    }
    // Nested clear may have already emptied the array.
    if (this.projectiles[index] !== projectile) return;
    if (projectile.mesh) {
      this.game.scene.remove(projectile.mesh);
      disposeProjectileVisual(projectile.mesh, projectile.materials);
    }
    this.projectiles.splice(index, 1);
  }

  clear() {
    if (this._clearing) return;
    this._clearing = true;
    if (this.game.player) {
      this.game.player.thornField = null;
      this.game.player.predatorVerdict = null;
      this.game.player.clearArcaneOverflow?.();
      this.rangerGeneration.delete(this.game.player);
      this.ownedCastGenerations.delete(this.game.player);
      this.whirlwindStates.delete(this.game.player);
      this.twinFangStates.delete(this.game.player);
      this.crescentStates.delete(this.game.player);
      this.fanStates.delete(this.game.player);
      this.starburstStates.delete(this.game.player);
      this.lotusStates.delete(this.game.player);
    }
    try {
      const projectiles = this.projectiles.splice(0, this.projectiles.length);
      for (const projectile of projectiles) {
        if (!projectile?.mesh) continue;
        if (!projectile.retired) {
          projectile.retired = true;
          if (!projectile.retireCallbackFired) {
            projectile.retireCallbackFired = true;
            projectile.suppressRetireAuthority = true;
            projectile.onRetire?.(projectile, this.game.world.heightAt(projectile.mesh.position.x, projectile.mesh.position.z));
          }
        }
        this.game.scene.remove(projectile.mesh);
        disposeProjectileVisual(projectile.mesh, projectile.materials ?? (projectile.material ? [projectile.material] : []));
      }
      const warnings = this.telegraphs.splice(0, this.telegraphs.length);
      for (const warning of warnings) {
        if (warning?.group) this.game.scene.remove(warning.group);
        warning?.ringGeometry?.dispose(); warning?.fillGeometry?.dispose();
        warning?.ringMaterial?.dispose(); warning?.fillMaterial?.dispose();
      }
      this.delayed.length = 0;
      this.charges.length = 0;
      this.wizardCastState = new WeakMap();
    } finally {
      this._clearing = false;
    }
  }
}
