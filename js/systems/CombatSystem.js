import * as THREE from 'three';
import { getClassBasicAttack, getHeroClass, isRangedAttackStyle, SKILLS } from '../data/content.js';
import { getFxTheme } from '../data/fxThemes.js';
import { resolveSkillHitRaw, skillDamage } from '../data/skillCombat.js';
import {
  createProjectileVisual, disposeProjectileVisual, orientProjectile,
} from '../graphics/ProjectileMeshes.js';
import { clamp, rand } from '../core/Utils.js';
import { createGameContext } from '../core/GameContext.js';
import { attachActiveSkillMethods } from './combat/activeSkillMethods.js';
import { attachEnergyBurstMethods } from './combat/energyBurstMethods.js';
import { createEnergyHandlers, createSkillHandlers } from './combat/createSkillHandlers.js';

const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();

export class CombatSystem {
  constructor(game) {
    this.game = game;
    /** Prefer for new code — narrow facade (see architecture-template-boundary.md). */
    this.ctx = game?.ctx ?? createGameContext(game);
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
    /**
     * effect id → handler(player, immutable bundle, phase?)
     * Keys locked in combat/skillEffectRegistry.js; bodies in combat/activeSkillMethods.js.
     */
    this.skillHandlers = createSkillHandlers(this);
    this.energyHandlers = createEnergyHandlers(this);
  }

  _skillBundle(bundle) {
    return {
      skill: bundle,
      combat: bundle.combat,
      theme: getFxTheme(bundle.presentation?.theme),
    };
  }

  _beginOwnedCast(player, skillId) {
    const owned = this.ownedCastGenerations.get(player) ?? {};
    const generation = (owned[skillId] ?? 0) + 1;
    owned[skillId] = generation; this.ownedCastGenerations.set(player, owned);
    return Object.freeze({ skillId, generation, classId: player.classId });
  }

  _ownsCast(player, cast) {
    return player.alive && player.classId === cast.classId
      && this.ownedCastGenerations.get(player)?.[cast.skillId] === cast.generation;
  }

  _consumeHitBudget(budget, enemy, cap = 1) {
    const key = enemy.id;
    const used = budget.get(key) ?? 0;
    if (used >= cap) return false;
    budget.set(key, used + 1); return true;
  }

  _beginApexAudio(player, bundle) {
    if (!player?.alive || bundle?.playerLevel < 100 || !bundle?.combat?.apexFinisher
      || bundle?.classId !== player.classId || bundle?.presentation?.apexAudio !== bundle.id) return null;
    const states = this.apexAudioStates.get(player) ?? new Map();
    const state = { id: ++this.apexAudioSerial, bundle, classId: player.classId, phases: new Set(['anticipate']) };
    states.set(bundle.id, state); this.apexAudioStates.set(player, states);
    this.game.audio?.apex?.(bundle.id, 'anticipate');
    return state;
  }

  _apexAudioPhase(player, state, phase) {
    if (!state || (phase !== 'impact' && phase !== 'finisher') || !player?.alive
      || player.classId !== state.classId || state.bundle.classId !== player.classId
      || this.apexAudioStates.get(player)?.get(state.bundle.id) !== state || state.phases.has(phase)) return false;
    if (phase === 'finisher' && !state.phases.has('impact')) return false;
    state.phases.add(phase); this.game.audio?.apex?.(state.bundle.id, phase); return true;
  }

  _applyApexKeystone(player, enemy, context = {}) {
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
      if (!armorBreak || armorBreak.remaining <= 0 || !this._consumeHitBudget(budget.targets, enemy, keystone.perTargetCap)) return false;
      enemy.addStagger?.(keystone.staggerBonus);
      this.game.effects.recipeApexKeystone?.(enemy.position, player.classId, theme, 1); return true;
    }
    if (keystone.id === 'overflow_overcast') {
      if (!context.overcast || budget.casts.has(castKey)) return false;
      budget.casts.add(castKey);
      const result=this._damageEnemy(enemy,(context.rawDamage??skillDamage(player.attackPower,bundle.combat))*bundle.combat.overcastMult,{multiHit:true,skill:true,cannotCrit:true,keystoneDerived:true,sameCastHit:{key:`${castKey}:overcast`,maxHits:1}});
      if(result.amount>0)this.game.effects.recipeApexKeystone?.(enemy.position,player.classId,theme,1);return result.amount>0;
    }
    if (keystone.id === 'blood_echo') {
      const tiers=Math.min(keystone.bleedTierCap,Math.max(0,enemy.statuses?.bleed?.stacks??0));
      if(!tiers||budget.targets.size>=keystone.targetCap||budget.targets.has(enemy.id))return false;
      budget.targets.set(enemy.id,tiers);let landed=0;
      for(let tier=0;tier<Math.min(tiers,keystone.perTargetCap);tier+=1){const result=this._damageEnemy(enemy,(context.rawDamage??0)*keystone.duplicateMult,{multiHit:true,skill:true,cannotCrit:true,keystoneDerived:true,sameCastHit:{key:`${castKey}:blood-echo:${enemy.id}:${tier}`,maxHits:1}});if(result.amount>0)landed+=1;}
      if(landed)this.game.effects.recipeApexKeystone?.(enemy.position,player.classId,theme,landed);return landed>0;
    }
    if (keystone.id === 'marked_convergence') {
      if(budget.casts.has(castKey))return false;
      const marked=context.capturedMarkedTarget??player.predatorVerdict?.target;
      if(marked!==enemy||!marked.alive)return false;
      budget.casts.add(castKey);const result=this._damageEnemy(marked,(context.rawDamage??0)*keystone.convergenceMult,{multiHit:true,skill:true,cannotCrit:true,keystoneDerived:true,verdictDerived:true,sameCastHit:{key:`${castKey}:marked-convergence`,maxHits:1}});
      if(result.amount>0)this.game.effects.recipeApexKeystone?.(marked.position,player.classId,theme,1);return result.amount>0;
    }
    return false;
  }

  _segmentDamage(from, to, width, rawDamage, options = {}, key = 'segment') {
    const segment = to.clone().sub(from).setY(0); const lengthSq = Math.max(1e-6, segment.lengthSq()); let hits = 0;
    for (const enemy of this.game.enemies.enemies) {
      if (!enemy.alive) continue;
      const relative = enemy.position.clone().sub(from).setY(0); const t = clamp(relative.dot(segment)/lengthSq,0,1);
      if (enemy.position.distanceTo(from.clone().addScaledVector(segment,t)) > width+enemy.radius) continue;
      const result=this._damageEnemy(enemy,rawDamage,{...options,sameCastHit:{key:`${key}:${enemy.id}`,maxHits:1}});if(result.amount>0)hits+=1;
    }
    return hits;
  }

  _beginWizardCast(player, skillId, bundle = null) {
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

  _endWizardCast(player, state) {
    if (!state || state.terminal) return false;
    const casts = this.wizardCastState.get(player);
    state.terminal = true;
    if (casts?.get(state.skillId) !== state) return false;
    casts.delete(state.skillId);
    if (casts && casts.size === 0) this.wizardCastState.delete(player);
    return true;
  }

  _isWizardCastCurrent(player, state) {
    return Boolean(state && !state.terminal && this.wizardCastState.get(player)?.get(state.skillId) === state);
  }

  _isWizardGenerationCurrent(player, state) {
    return this.wizardCastGeneration.get(player)?.[state?.skillId] === state?.generation;
  }

  _quality() {
    return this.game.renderPipeline?.quality ?? this.game.effects?.quality ?? 'medium';
  }

  playerAttack(player, combo, comboLength = 4) {
    if (isRangedAttackStyle(player.classId)) this._magicAttack(player, combo, comboLength);
    else this._meleeAttack(player, combo, comboLength);
  }

  /** Ground aim locked to facing — not mouse — so skills match movement direction. */
  _aimAlongFacing(player, distance) {
    const dir = this._facingDir(player);
    const target = player.position.clone().addScaledVector(dir, distance);
    target.y = this.game.world.heightAt(target.x, target.z);
    return target;
  }

  _facingDir(player) {
    const dir = player.facing.clone().setY(0);
    if (dir.lengthSq() < .0001) dir.set(0, 0, 1);
    return dir.normalize();
  }

  _handContactOrigin(player, offhand, direction, forward = 0.12) {
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

  _meleeAttack(player, combo, comboLength = 4) {
    const direction = this._facingDir(player);
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
    // Weapon swing ribbon — sample blade bones when equipped (melee path).
    const swingRange = ((finisher ? profile.finisherRange : profile.range) + combo * profile.rangePerCombo + levelBoost * .25) * rangeMult;
    const bladeSamples = this._bladeTrailSamples(player, false);
    this.game.effects.swingTrail?.(
      player.position.clone().add(new THREE.Vector3(0, 1.05, 0)),
      direction,
      color,
      swingRange * (finisher ? 1.2 : 1),
      {
        heavy: finisher || combo >= 2,
        angleOffset: combo % 2 ? .45 : -.4,
        base: bladeSamples.base,
        tip: bladeSamples.tip,
      },
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
      this._delay(delay, () => {
        if (!player.alive) return;
        const range = ((finisher ? profile.finisherRange : profile.range) + combo * profile.rangePerCombo + levelBoost * .25) * rangeMult;
        const arc = (finisher ? Math.PI * (1.05 + chain * .12) : Math.PI * (.58 + combo * .05)) * arcMult;
        const offhand = rogue && (combo + pulse) % 2 === 1;
        const hitOrigin = rogue
          ? this._handContactOrigin(player, offhand, direction, .12 + pulse * .03)
          : player.position.clone().addScaledVector(direction, .35 + pulse * .08);
        const pulseDamage = player.attackPower * baseMult * (pulses > 1 ? (.72 + pulse * .12) : 1);
        const handColor = offhand ? offhandColor : color;

        this.game.effects.swingArc(hitOrigin, direction, handColor, range * (finisher ? 1.35 : 1.15), {
          heavy: finisher || combo >= 2,
          height: finisher ? 1.3 : 1.02,
          spin: (combo + pulse) % 2 ? -3.1 : 2.9,
          angleOffset: (combo + pulse) % 2 ? .58 : -.5,
        });
        // Second delayed ribbon — follow-through, prefer live blade samples.
        const pulseBlade = this._bladeTrailSamples(player, offhand);
        this.game.effects.swingTrail?.(
          hitOrigin.clone().add(new THREE.Vector3(0, 0.08, 0)),
          direction,
          handColor,
          range * (finisher ? 1.25 : 1.05),
          {
            heavy: finisher || combo >= 2,
            height: finisher ? 1.15 : 0.98,
            angleOffset: (combo + pulse) % 2 ? -.52 : .48,
            base: pulseBlade.base,
            tip: pulseBlade.tip,
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

        this._hitEnemiesInCone(hitOrigin, direction, range, arc, pulseDamage, {
          knockback: finisher ? 6.8 + comboLength * .15 : 2.1 + combo * .5,
          criticalBonus: finisher ? .12 + levelBoost * .04 : combo * .02,
          combo,
          finisher: finisher && pulse === pulses - 1,
          multiHit: pulses > 1,
          onHit: rogue ? enemy => this._applyFrenzyContact(player, enemy, pulseDamage, direction) : null,
        });
        if (rogue && finisher && pulse === pulses - 1) {
          const main = this._handContactOrigin(player, false, direction, .1);
          const off = this._handContactOrigin(player, true, direction, .1);
          this.game.effects.recipeDualBladeCross?.(main.add(off).multiplyScalar(.5), direction, color, offhandColor, swingRange);
        }
      });
    }
    if (rogue && player.frenzyActive && player.shadowFrenzy.offhandEcho > 0) {
      const echoDelay = ((finisher ? .09 : .055) + pulses * .045) * timingScale;
      this._delay(echoDelay, () => {
        if (!player.alive || !player.frenzyActive) return;
        const range = ((finisher ? profile.finisherRange : profile.range) + combo * profile.rangePerCombo) * rangeMult;
        const origin = this._handContactOrigin(player, true, direction, .16);
        this.game.effects.recipeShadowCuts?.(origin, direction, offhandColor, range);
        this._hitEnemiesInCone(origin, direction, range, Math.PI * .7 * arcMult,
          player.attackPower * baseMult * player.shadowFrenzy.offhandEcho, {
            knockback: 0.8, multiHit: true,
            onHit: enemy => this._applyFrenzyContact(player, enemy, player.attackPower * baseMult, direction),
          });
      });
    }
  }

  _applyFrenzyContact(player, enemy, rawDamage, direction) {
    const contact = player.registerFrenzyContact?.(enemy);
    if (!contact) return;
    const frenzy = player.shadowFrenzy;
    if (enemy.boss && contact.bossStacks > 1 && frenzy.bossRampStep > 0) {
      this._damageEnemy(enemy, rawDamage * frenzy.bossRampStep * (contact.bossStacks - 1), {
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
      this._damageEnemy(other, rawDamage * frenzy.chainMult, {
        direction: chainDirection, knockback: 0.4, multiHit: true,
      });
    }
  }

  /** Ranged basic attack — mana bolts (wizard) or arrows (ranger); combo → multi-shot finisher. */
  _magicAttack(player, combo, comboLength = 4) {
    const isBow = getHeroClass(player.classId).attackStyle === 'ranged';
    // Ranger L5+ Strafe passive: basic attacks become auto-aimed 10-arrow volleys.
    if (isBow && this._rangerStrafeUnlocked(player)) {
      this._rangerStrafeAttack(player, combo, comboLength);
      return;
    }
    // Capture facing at cast time so delayed bolts don't inherit a later turn/mouse aim.
    const direction = this._facingDir(player);
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
      this._delay(finisher ? i * .05 : .03, () => {
        if (!player.alive) return;
        const spread = finisher ? (i - (bolts - 1) / 2) * (isBow ? 0.1 : 0.12) : 0;
        const dir = new THREE.Vector3(Math.sin(baseYaw + spread), 0, Math.cos(baseYaw + spread));
        const start = player.position.clone().add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(dir, .65);
        this._spawnFriendlyOrb(start, dir, {
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
  _rangerStrafeUnlocked(player) {
    if (player?.classId !== 'ranger') return false;
    const unlock = SKILLS.strafe?.unlockLevel ?? 5;
    return player.level >= unlock;
  }

  /**
   * Diablo Amazon-style Strafe: fire a fixed volley of auto-aimed arrows.
   * Targets nearest living enemies (round-robin); reacquires mid-volley if a target dies.
   */
  _rangerStrafeAttack(player, combo, comboLength = 4) {
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
    const facing = this._facingDir(player);
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
      this._delay(i * interval, () => {
        if (!player.alive) return;
        let target = sequence[i];
        if (!target?.alive) {
          const living = pickTargets();
          target = living.length ? living[i % living.length] : null;
        }
        let dir = this._facingDir(player);
        if (target?.alive) {
          dir = target.position.clone().sub(player.position).setY(0);
          if (dir.lengthSq() < 1e-6) dir = this._facingDir(player);
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
        this._spawnFriendlyOrb(start, dir, {
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
    const audio = starts ? (activeFrenzyRecast ? player.shadowFrenzy?.apexAudio ?? null : this._beginApexAudio(player, bundle))
      : this.apexAudioStates.get(player)?.get(bundle.id) ?? null;
    handler(player, bundle, phase, audio);
  }

  _spawnFriendlyOrb(start, direction, options = {}) {
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

  _applyHitStatus(enemy, status) {
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

  _reactSpellPrime(enemy, detonator, player, rawDamage, castMeta = {}) {
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
    const facing = this._facingDir(player);
    const reactionKind = detonator === 'frost' ? 'thermal_shock'
      : detonator === 'fire' ? 'steam'
        : 'crystal_shards';
    this.game.effects.recipeSpellReaction?.(enemy.position, reactionKind, facing);
    const castId = castMeta.castId ?? `spell-${++this.spellCastSerial}`;
    if (detonator === 'arcane') {
      const coneOrigin = enemy.position.clone().addScaledVector(facing, -.3);
      this._hitEnemiesInCone(coneOrigin, facing, 4.2, 1.05, rawDamage * .28, {
        knockback: .6, multiHit: true, skill: true, reactionDepth: 1, castMeta,
        sameCastHit: { key: `${castId}:crystal-shards`, maxHits: 1 },
      });
    } else if (detonator === 'fire') {
      const steamTargets = this.game.enemies.enemies.filter(target => target.alive
        && target.position.distanceTo(enemy.position) <= 2.6 + target.radius)
        .sort((a, b) => a.position.distanceToSquared(enemy.position) - b.position.distanceToSquared(enemy.position))
        .slice(0, 4);
      for (const target of steamTargets) this._damageEnemy(target, rawDamage * .28, {
        direction: target === enemy
          ? facing
          : target.position.clone().sub(enemy.position).setY(0).normalize(),
        knockback: .6, multiHit: true, skill: true, reactionDepth: 1, castMeta,
        sameCastHit: { key: `${castId}:steam:${target.id}`, maxHits: 1 },
      });
    } else {
      this._damageEnemy(enemy, rawDamage * .28, {
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

  /** Dispatch a class energy burst from a full Focus/Rage gauge. Returns presentation hints for Player. */
  releaseEnergyBurst(player, def) {
    const handler = this.energyHandlers[def?.effect ?? 'dagger_rush'];
    return handler ? handler(player, def ?? {}) : null;
  }

  /** Rogue Focus burst — level-scaled dagger rush released by a single attack click. */

  /** Knight Rage burst — a single Wrath Slam heavy crush in front of the knight. */

  /** Ranger Focus burst — multi-arrow storm along facing cone. */

  expirePredatorVerdict(player, generation) {
    const verdict = player.predatorVerdict;
    if (!verdict || verdict.generation !== generation) return false;
    return this._detonateVerdict(player, verdict);
  }

  endShadowFrenzy(player, state) {
    if (!player?.alive || !state?.exitMult || !state.contactCap) return 0;
    const generation = Math.max(0, Math.round(Number(state.generation) || 0));
    if (generation <= (this.frenzyTerminalGeneration.get(player) ?? -1)) return 0;
    this.frenzyTerminalGeneration.set(player, generation);
    this._apexAudioPhase(player,state.apexAudio,'finisher');
    const contacts = Math.min(state.contactCap, Math.max(0, state.contactCount || 0));
    this.game.effects.recipeFrenzyExit?.(player.position, getFxTheme('shadow'), contacts, state.contactCap);
    if (contacts <= 0) return 0;
    const raw=player.attackPower*state.exitMult*contacts;const budget={targets:new Map(),casts:new Set()};
    this._hitEnemiesInRadius(player.position, 4.4, raw, {
      knockback: 3.2, multiHit: true, finisher: true, skill: true,
      onHit:enemy=>state.apexBundle&&this._applyApexKeystone(player,enemy,{bundle:state.apexBundle,theme:getFxTheme('shadow'),rawDamage:raw,castKey:`frenzy-${generation}`,budget}),
    });
    return contacts;
  }

  enemyMelee(enemy, options = {}) {
    const delay = enemy.boss ? .58 : enemy.elite ? .46 : .38;
    const radius = enemy.attackRange + enemy.radius + .55;
    const color = enemy.boss ? enemy.data.accent : 0xff5c59;
    this._telegraphCircle(enemy.position, radius, delay, color, () => {
      if (!enemy.alive) return;
      const player = this.game.player;
      const toPlayer = TMP_A.copy(player.position).sub(enemy.position).setY(0);
      const distance = toPlayer.length();
      const direction = distance > .001 ? toPlayer.normalize() : enemy.facing;
      const dot = enemy.facing.dot(direction);
      const threshold = options.wide ? -.15 : .15;
      if (distance <= radius + .4 && dot >= threshold) {
        this._damagePlayer(enemy.damage * (options.power ?? 1), direction, enemy.boss ? 8 : 4.2);
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
      ?? (options.caster ? 'enemy_bolt' : this._enemyProjectileStyle(enemy));
    this._telegraphCircle(enemy.position, enemy.radius * 1.15 + .55, delay, color, () => {
      if (!enemy.alive || !this.game.player.alive) return;
      const count = options.count ?? 1;
      const baseDirection = this.game.player.position.clone().sub(enemy.position).setY(0).normalize();
      for (let i = 0; i < count; i += 1) {
        const spread = count === 1 ? 0 : (i - (count - 1) / 2) * .2;
        const direction = baseDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
        this._spawnEnemyProjectile(enemy, direction, {
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
  _enemyProjectileStyle(enemy) {
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
    this._lineTelegraph(start, direction, distance, enemy.radius * 2.2, .72, enemy.data.accent, () => {
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
    this._telegraphCircle(target, radius, .86, enemy.data.accent, () => {
      if (!enemy.alive) return;
      const playerDistance = this.game.player.position.distanceTo(target);
      enemy.position.copy(target).addScaledVector(enemy.facing, -1.1);
      this.game.world.resolvePosition(enemy.position, enemy.radius);
      this.game.effects.ring(target, enemy.data.accent, radius, { life: .58, startScale: .08 });
      this.game.effects.burst(target, enemy.data.accent, enemy.boss ? 30 : 18, { speed: 5.2, size: .38, life: .72, additive: false });
      if (playerDistance < radius + .5) {
        const direction = this.game.player.position.clone().sub(target).setY(0).normalize();
        this._damagePlayer(enemy.damage * 1.3, direction, enemy.boss ? 10 : 6.5);
      }

    }, { fillOpacity: .16 });
  }

  enemyBossSpecial(enemy) {
    const special = enemy.data.special;
    this.game.audio.boss();
    if (special === 'roots') this._bossRoots(enemy);
    else if (special === 'stampede') this._bossStampede(enemy);
    else if (special === 'sandstorm') this._bossSandstorm(enemy);
    else if (special === 'blizzard') this._bossBlizzard(enemy);
    else if (special === 'inferno') this._bossInferno(enemy);
    else this._bossEclipse(enemy);
  }

  _bossRoots(enemy) {
    const center = this.game.player.position.clone();
    for (let i = 0; i < 7; i += 1) {
      const angle = i / 7 * Math.PI * 2 + rand(-.22, .22);
      const radius = i === 0 ? 0 : rand(2, 6.8);
      const point = center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      point.y = this.game.world.heightAt(point.x, point.z);
      this._delay(i * .09, () => this._telegraphCircle(point, 1.55, .72, 0x7de57b, () => {
        this.game.effects.pillar(point, 0x73d26f, 4.5, { life: .62, bottom: .62 });
        if (this.game.player.position.distanceTo(point) < 1.85) this._damagePlayer(enemy.damage * .88, this.game.player.position.clone().sub(point).setY(0).normalize(), 4.8);
      }, { fillOpacity: .14 }));
    }
  }

  _bossStampede(enemy) {
    const base = this.game.player.position.clone().sub(enemy.position).setY(0).normalize();
    for (let i = -1; i <= 1; i += 1) {
      this._delay((i + 1) * 1.08, () => {
        const direction = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), i * .28);
        const distance = 16;
        this._lineTelegraph(enemy.position, direction, distance, 2.4, .72, 0xb7ef8a, () => {
          if (!enemy.alive) return;
          this.charges.push({
            enemy, start: enemy.position.clone(), end: enemy.position.clone().addScaledVector(direction, distance),
            direction, duration: .52, time: 0, hit: false, damage: enemy.damage * 1.05,
          });
        });
      });
    }
  }

  _bossSandstorm(enemy) {
    this._telegraphCircle(enemy.position, 7.2, .9, 0xffc266, () => {
      if (!enemy.alive) return;
      this.game.effects.ring(enemy.position, 0xffc266, 7.2, { life: .8, startScale: .1 });
      for (let i = 0; i < 18; i += 1) {
        const direction = new THREE.Vector3(Math.cos(i / 18 * Math.PI * 2), 0, Math.sin(i / 18 * Math.PI * 2));
        this._spawnEnemyProjectile(enemy, direction, {
          style: 'enemy_ember', color: 0xffb95f, speed: 8.2, damage: enemy.damage * .62, size: .28,
        });
      }
      if (this.game.player.position.distanceTo(enemy.position) < 7.5) {
        const direction = this.game.player.position.clone().sub(enemy.position).setY(0).normalize();
        this._damagePlayer(enemy.damage * 1.15, direction, 8);
      }
    }, { follows: enemy, fillOpacity: .15 });
  }

  _bossBlizzard(enemy) {
    const center = this.game.player.position.clone();
    for (let i = 0; i < 10; i += 1) {
      const point = center.clone().add(new THREE.Vector3(rand(-7, 7), 0, rand(-7, 7)));
      point.y = this.game.world.heightAt(point.x, point.z);
      this._delay(i * .12, () => this._telegraphCircle(point, 1.75, .62, 0xc9f6ff, () => {
        this.game.effects.pillar(point, 0xdffbff, 5.5, { life: .6, bottom: .48 });
        this.game.effects.burst(point, 0xe9fdff, 11, { speed: 3.8, size: .26, life: .65, gravity: 3 });
        if (this.game.player.position.distanceTo(point) < 2) this._damagePlayer(enemy.damage * .78, this.game.player.position.clone().sub(point).setY(0).normalize(), 3.5);
      }, { fillOpacity: .12 }));
    }
  }

  _bossInferno(enemy) {
    const center = this.game.player.position.clone();
    const rings = [2.8, 5.4, 8];
    rings.forEach((ring, ringIndex) => {
      for (let i = 0; i < 7; i += 1) {
        const angle = i / 7 * Math.PI * 2 + ringIndex * .34;
        const point = center.clone().add(new THREE.Vector3(Math.cos(angle) * ring, 0, Math.sin(angle) * ring));
        point.y = this.game.world.heightAt(point.x, point.z);
        this._delay(ringIndex * .22 + i * .035, () => this._telegraphCircle(point, 1.35, .68, 0xff6b45, () => {
          this.game.effects.pillar(point, 0xff5e38, 5, { life: .68, bottom: .75 });
          if (this.game.player.position.distanceTo(point) < 1.65) this._damagePlayer(enemy.damage * .74, this.game.player.position.clone().sub(point).setY(0).normalize(), 4.5);
        }, { fillOpacity: .16 }));
      }
    });
  }

  _bossEclipse(enemy) {
    const center = enemy.position.clone();
    this._telegraphCircle(center, 9.2, 1.05, 0xc184ff, () => {
      if (!enemy.alive) return;
      this.game.effects.pillar(center, 0xc184ff, 11, { life: 1.1, bottom: 1.6 });
      for (let i = 0; i < 24; i += 1) {
        const angle = i / 24 * Math.PI * 2;
        const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        this._spawnEnemyProjectile(enemy, direction, {
          style: i % 2 ? 'enemy_void' : 'enemy_bolt',
          color: i % 2 ? 0xc184ff : 0x7fcfff, speed: 7.2 + (i % 3) * .6,
          damage: enemy.damage * .56, size: .31, homing: i % 4 === 0 ? .18 : 0,
        });
      }
      const distance = this.game.player.position.distanceTo(center);
      if (distance < 9.4) this._damagePlayer(enemy.damage * 1.2, this.game.player.position.clone().sub(center).setY(0).normalize(), 10);

    }, { follows: enemy, fillOpacity: .18 });
  }

  _spawnEnemyProjectile(enemy, direction, options = {}) {
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

  /**
   * World-space blade base/tip samples for swing trails.
   * Returns nulls when markers missing (staff/magic) so Effects falls back to facing ribbon.
   */
  _bladeTrailSamples(player, offhand = false) {
    const refs = player?.refs;
    if (!refs) return { base: null, tip: null };
    const baseObj = offhand ? (refs.offhandBladeBase ?? refs.bladeBase) : (refs.mainBladeBase ?? refs.bladeBase);
    const tipObj = offhand ? (refs.offhandBladeTip ?? refs.bladeTip) : (refs.mainBladeTip ?? refs.bladeTip);
    if (!baseObj || !tipObj) return { base: null, tip: null };
    const base = new THREE.Vector3();
    const tip = new THREE.Vector3();
    baseObj.getWorldPosition?.(base);
    tipObj.getWorldPosition?.(tip);
    if (!Number.isFinite(base.x) || !Number.isFinite(tip.x)) return { base: null, tip: null };
    return { base, tip };
  }

  /** Map enemy shape/archetype to hit SFX material bucket. */
  _hitMaterialFor(enemy) {
    const shape = String(enemy?.data?.shape ?? enemy?.deathArchetype ?? '').toLowerCase();
    if (/slime|blob|toad|ooze|gel/.test(shape)) return 'gel';
    if (/golem|colossus|rock|stone|crab|beetle|knight/.test(shape)) return 'stone';
    return 'default';
  }

  _hitEnemiesInCone(origin, direction, range, arc, rawDamage, options = {}) {
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
    return this._resolveMultiHits(collected, rawDamage, {
      ...options,
      direction: options.direction ?? direction,
    });
  }

  _hitEnemiesInRadius(origin, radius, rawDamage, options = {}) {
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
    return this._resolveMultiHits(collected, rawDamage, options);
  }

  /**
   * Apply damage to collected hits; coalesce heavy impact VFX when 3+ land together.
   * options.coalesceVfx defaults true — set false to force per-enemy full impact().
   */
  _resolveMultiHits(collected, rawDamage, options = {}) {
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
      this._damageEnemy(entry.enemy, rawDamage, {
        ...options,
        direction: entry.direction,
        liteImpact: coalesce,
      });
    }
    return hits;
  }

  _damageEnemy(enemy, rawDamage, options = {}) {
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
    if (options.status) this._applyHitStatus(enemy, options.status);
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
    this.game.audio.hit(critical, finisher, {
      combo: options.combo ?? 0,
      multiHit: Boolean(options.liteImpact || options.multiHit),
      material: this._hitMaterialFor(enemy),
    });

    if (player.leech > 0) player.heal(result.amount * player.leech);
    return result;
  }

  _damagePlayer(rawDamage, direction, force = 4) {
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

  _telegraphCircle(position, radius, duration, color, callback, options = {}) {
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

  _lineTelegraph(position, direction, length, width, duration, color, callback) {
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

  _delay(time, callback) {
    this.delayed.push({ time, callback });
  }

  update(delta) {
    this._updateDelayed(delta);
    this._updateTelegraphs(delta);
    this._updateCharges(delta);
    this._updateProjectiles(delta);
  }

  _updateDelayed(delta) {
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

  _updateTelegraphs(delta) {
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

  _updateCharges(delta) {
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
        this._damagePlayer(charge.damage, charge.direction, enemy.boss ? 12 : 8);
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

  _updateProjectiles(delta) {
    // Snapshot length so clear()/spawn re-entrancy cannot leave undefined holes mid-loop.
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      if (!projectile?.mesh || projectile.life == null) {
        if (i >= 0 && i < this.projectiles.length) this.projectiles.splice(i, 1);
        continue;
      }
      if (projectile.ownerGuard && !projectile.ownerGuard()) {
        const ground = this.game.world.heightAt(projectile.mesh.position.x, projectile.mesh.position.z);
        this._retireProjectile(i, projectile, ground);
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
          this._damageEnemy(enemy, projectile.damage, {
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
        this._damagePlayer(projectile.damage, direction, 4.5);
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
        this._retireProjectile(i, projectile, ground);
      }
    }
  }

  _retireProjectile(index, projectile, groundY) {
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
        this._hitEnemiesInRadius(at, blast.radius, blast.damage, {
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

attachActiveSkillMethods(CombatSystem.prototype);
attachEnergyBurstMethods(CombatSystem.prototype);
