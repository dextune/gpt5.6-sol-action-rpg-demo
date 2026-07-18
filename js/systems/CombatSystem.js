import * as THREE from 'three';
import { WEAPON_ENHANCE } from '../config.js';
import {
  getBasicAttackProfile, getHeroClass, getWeaponResonance, isRangedAttackStyle, SKILLS, weaponResonanceTier,
} from '../data/content.js';
import { getFxTheme } from '../data/fxThemes.js';
import { resolveSkillHitRaw, skillDamage } from '../data/skillCombat.js';
import { disposeProjectileVisual } from '../graphics/ProjectileMeshes.js';
import { clamp, rand } from '../core/Utils.js';
import { createGameContext } from '../core/GameContext.js';
import { attachActiveSkillMethods } from './combat/activeSkillMethods.js';
import { attachEnemySkillMethods } from './combat/enemySkills.js';
import { attachEnergyBurstMethods } from './combat/energyBurstMethods.js';
import { createEnergyHandlers, createSkillHandlers } from './combat/createSkillHandlers.js';
import { attachBasicAttackMethods } from './combat/basicAttacks.js';
import { attachProjectileMethods } from './combat/projectiles.js';
import { receiveDamageMul } from './huntThreat.js';
import { autoTargetTier, compareAutoTargets } from './combat/targetPriority.js';

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
    this.rangerBasicTargets = new WeakMap();
    this.rangerSerial = 0;
    this.weaponResonanceLastAt = new WeakMap();
    this.weaponResonanceSerial = 0;
    this.apexAudioStates = new WeakMap();
    this.apexAudioSerial = 0;
    this.ownedCastGenerations = new WeakMap();
    this.whirlwindStates = new WeakMap();
    this.twinFangStates = new WeakMap();
    this.crescentStates = new WeakMap();
    this.fanStates = new WeakMap();
    this.shadowstepStates = new WeakMap();
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
    const profile = getBasicAttackProfile(player.classId);
    if (profile === 'rifle') this._rifleAttack(player, combo, comboLength);
    else if (profile === 'magic' || profile === 'bow' || isRangedAttackStyle(player.classId)) {
      this._magicAttack(player, combo, comboLength);
    } else {
      this._meleeAttack(player, combo, comboLength);
    }
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

  /**
   * Shared hero auto-target selection.
   * Eligible enemies are ordered boss → elite → normal, nearest first inside
   * each tier. Area density only breaks otherwise equivalent target choices.
   */
  _autoTargetEnemies(player, range = 18, limit = 1, options = {}) {
    const origin = options.origin ?? player.position;
    const clusterRadius = Math.max(0, Number(options.clusterRadius) || 0);
    const enemies = (this.ctx ?? this.game).enemies?.enemies ?? [];
    const candidates = enemies.filter(enemy => enemy.alive
      && enemy.position.distanceTo(origin) <= range + (enemy.radius ?? 0.5));
    const scored = candidates.map(enemy => {
      const distanceSq = enemy.position.distanceToSquared(origin);
      let clusterScore = 0;
      if (clusterRadius > 0) {
        for (const other of candidates) {
          if (other.position.distanceTo(enemy.position) <= clusterRadius + (other.radius ?? 0.5)) {
            clusterScore += other.boss ? 2.5 : other.elite ? 1.6 : 1;
          }
        }
      }
      return { enemy, distanceSq, clusterScore, tierScore: autoTargetTier(enemy) };
    });
    scored.sort((a, b) => b.tierScore - a.tierScore
      || a.distanceSq - b.distanceSq
      || b.clusterScore - a.clusterScore
      || compareAutoTargets(a.enemy, b.enemy, origin));
    return scored.slice(0, Math.max(1, Math.round(limit) || 1)).map(entry => entry.enemy);
  }

  _autoTargetEnemy(player, range = 18, options = {}) {
    return this._autoTargetEnemies(player, range, 1, options)[0] ?? null;
  }

  _faceAutoTarget(player, enemy) {
    if (!enemy?.alive) return this._facingDir(player);
    const direction = enemy.position.clone().sub(player.position).setY(0);
    if (direction.lengthSq() < .0001) return this._facingDir(player);
    direction.normalize();
    player.facing.copy(direction);
    return direction;
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

  // Basic attacks: attachBasicAttackMethods (combat/basicAttacks.js)

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
    const audio = starts ? this._beginApexAudio(player, bundle)
      : this.apexAudioStates.get(player)?.get(bundle.id) ?? null;
    handler(player, bundle, phase, audio);
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
        this._damagePlayer(enemy.damage * (options.power ?? 1), direction, enemy.boss ? 8 : 4.2, enemy);
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
        this._damagePlayer(enemy.damage * 1.3, direction, enemy.boss ? 10 : 6.5, enemy);
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

  _triggerWeaponResonance(player, sourceEnemy, tier) {
    if (!player?.alive || tier <= 0) return false;
    const profile = getWeaponResonance(player.classId);
    const now = Math.max(0, Number(this.game.elapsed) || 0);
    const cooldown = Math.max(0.16, profile.cooldown - (tier - 1) * 0.055);
    const previous = this.weaponResonanceLastAt.get(player);
    if (previous != null && now >= previous && now - previous < cooldown) return false;
    this.weaponResonanceLastAt.set(player, now);

    const serial = ++this.weaponResonanceSerial;
    const anchor = sourceEnemy.position.clone();
    const effects = (this.ctx ?? this.game).effects;
    const damage = player.attackPower * (profile.procMult + (tier - 1) * profile.tierMult);
    const status = tier < 3 ? null
      : profile.id === 'star_chain'
        ? { id: 'slow', duration: 1.6 + tier * 0.08, power: 0.34 }
        : profile.id === 'aftercut'
          ? { id: 'bleed', duration: 2.5, dps: 0.08 + tier * 0.005, tick: 0.45, power: 1 }
          : { id: 'expose', duration: 2.1, power: 0.08 + tier * 0.015, damageAmp: 0.03 + tier * 0.01 };
    const hit = (target, index, scale = 1) => {
      const liveTarget = target?.alive ? target : this._autoTargetEnemy(player, 14 + tier);
      if (!liveTarget) return 0;
      const direction = liveTarget.position.clone().sub(anchor).setY(0);
      if (direction.lengthSq() < 0.001) direction.copy(this._facingDir(player));
      else direction.normalize();
      effects.slash?.(liveTarget.position, direction, profile.color, 1.5 + tier * 0.12, {
        height: liveTarget.refs.modelHeight * 0.46,
        thickness: 0.09 + tier * 0.006,
        life: 0.18,
      });
      const result = this._damageEnemy(liveTarget, damage * scale, {
        direction,
        knockback: 0.55 + tier * 0.12,
        armorPierce: tier >= 3 ? 0.08 + tier * 0.02 : 0,
        criticalBonus: tier * 0.02,
        multiHit: true,
        skill: true,
        weaponProcDerived: true,
        status,
        sameCastHit: { key: `weapon-${profile.id}-${serial}-${index}`, maxHits: 1 },
      });
      return result.amount;
    };

    effects.burst?.(anchor.clone().add(new THREE.Vector3(0, 0.7, 0)), profile.color, 8 + tier * 2, {
      speed: 4.5 + tier * 0.3,
      size: 0.17 + tier * 0.012,
      life: 0.32,
      gravity: 2,
      upward: 0.35,
      height: 0,
    });
    (this.ctx ?? this.game).ui?.floatText?.(
      anchor.clone().add(new THREE.Vector3(0, sourceEnemy.refs.modelHeight * 0.72, 0)),
      profile.name.toUpperCase(),
      'loot',
    );

    if (profile.proc === 'nova') {
      const pulses = tier >= 7 ? 3 : tier >= 4 ? 2 : 1;
      const radius = 2.4 + tier * 0.22;
      const pulse = index => {
        effects.ring?.(anchor, profile.color, radius + index * 0.35, {
          life: 0.34,
          startScale: 0.18,
          opacity: 0.78,
        });
        this._hitEnemiesInRadius(anchor, radius + index * 0.28, damage * (1 - index * 0.12), {
          knockback: 1.1 + tier * 0.18,
          armorPierce: tier >= 3 ? 0.1 + tier * 0.02 : 0,
          criticalBonus: tier * 0.02,
          multiHit: true,
          skill: true,
          weaponProcDerived: true,
          status,
          sameCastHit: { key: `weapon-${profile.id}-${serial}-pulse-${index}`, maxHits: 1 },
        });
      };
      pulse(0);
      for (let index = 1; index < pulses; index += 1) this._delay(index * 0.09, () => pulse(index));
      return true;
    }

    if (profile.proc === 'echo') {
      const strikes = 1 + Math.floor((tier - 1) / 2);
      const strike = index => hit(sourceEnemy, index, 1 - index * 0.08);
      strike(0);
      for (let index = 1; index < strikes; index += 1) this._delay(index * 0.075, () => strike(index));
      return true;
    }

    const cap = Math.min(6, 1 + Math.floor(tier / 2));
    const candidates = this._autoTargetEnemies(player, 10 + tier, cap + 1, { origin: anchor })
      .filter(target => target !== sourceEnemy)
      .slice(0, cap);
    if (!candidates.length && sourceEnemy.alive) candidates.push(sourceEnemy);
    if (profile.proc === 'ricochet' && candidates.length < cap && sourceEnemy.alive
      && !candidates.includes(sourceEnemy)) candidates.unshift(sourceEnemy);
    candidates.slice(0, cap).forEach((target, index) => hit(target, index, 1 - index * 0.06));
    return candidates.length > 0;
  }

  _damageEnemy(enemy, rawDamage, options = {}) {
    const player = (this.ctx ?? this.game).player;
    const weaponLevel = Math.max(0, Number(player.weapon?.weaponEnhanceLevel ?? player.weapon?.enhanceLevel) || 0);
    const resonanceTier = weaponResonanceTier(weaponLevel);
    // Status synergy: slowed enemies are easier to crit (all classes);
    // rogue Opportunist adds crit vs bleeding/slowed prey.
    const statusAfflicted = enemy.statuses?.slow?.remaining > 0 || enemy.statuses?.bleed?.remaining > 0;
    const slowCritBonus = enemy.statuses?.slow?.remaining > 0 ? 0.04 : 0;
    const opportunistBonus = statusAfflicted ? player.passiveEffects.statusCrit : 0;
    const critical = !options.cannotCrit && Math.random() < clamp(player.critChance + (options.criticalBonus ?? 0) + slowCritBonus + opportunistBonus, 0, .8);
    let finisher = Boolean(options.finisher);
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
    if (resonanceTier > 0) {
      damage *= 1 + weaponLevel * WEAPON_ENHANCE.damageAmpStep
        + resonanceTier * WEAPON_ENHANCE.damageAmpTierStep;
      if (resonanceTier >= WEAPON_ENHANCE.executeTier) {
        const executeThreshold = WEAPON_ENHANCE.executeThreshold
          + (resonanceTier - WEAPON_ENHANCE.executeTier) * WEAPON_ENHANCE.executeThresholdPerTier;
        if (enemy.hp / Math.max(1, enemy.maxHp) <= executeThreshold) {
          damage *= 1 + WEAPON_ENHANCE.executeDamage
            + (resonanceTier - WEAPON_ENHANCE.executeTier) * WEAPON_ENHANCE.executeDamagePerTier;
          finisher = true;
        }
      }
    }
    // Knight Executioner / Ranger Predator: bonus damage vs enemies below 30% health.
    if (player.passiveEffects.execute > 0 && enemy.hp / Math.max(1, enemy.maxHp) < .3) {
      damage *= 1 + player.passiveEffects.execute;
    }
    // Hunter Mark (expose): flat damage amp while the mark lasts.
    if (enemy.statuses?.expose?.remaining > 0) {
      const amp = Number(enemy.statuses.expose.damageAmp) || 0;
      if (amp > 0) damage *= 1 + amp;
    }
    // Defense champion break window — temporary vulnerability window only.
    if (this.game.mode === 'defense') {
      damage *= this.game.defense?.damageMultiplierFor?.(enemy) ?? 1;
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
    if (this.game.mode === 'defense') {
      this.game.defense?.onChampionHit?.(enemy, result, {
        skill: Boolean(options.skill),
        critical,
        finisher,
      });
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
      const defenseHit = this.game.mode === 'defense';
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
    if (!options.weaponProcDerived && resonanceTier > 0) {
      this._triggerWeaponResonance(player, enemy, resonanceTier);
    }
    return result;
  }

  /**
   * Damage the player. When `source` has a level and mode is Hunt, apply
   * level-gap receive softcap (HUNT_THREAT_CONFIG) before defense soak.
   * @param {number} rawDamage
   * @param {THREE.Vector3|null} direction
   * @param {number} force knockback strength
   * @param {{ level?: number }|null} source enemy (or level-bearing source)
   */
  _damagePlayer(rawDamage, direction, force = 4, source = null) {
    const player = this.game.player;
    let damage = rawDamage;
    if (this.game.mode === 'hunt' && source && Number.isFinite(source.level)) {
      damage *= receiveDamageMul(source.level - player.level);
    }
    const knockback = direction?.clone?.().normalize().multiplyScalar(force) ?? null;
    const amount = player.takeDamage(damage, knockback);
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
    this._tickGunnerGroundZones?.(delta);
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
        this._damagePlayer(charge.damage, charge.direction, enemy.boss ? 12 : 8, enemy);
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



  clear() {
    if (this._clearing) return;
    this._clearing = true;
    const player = (this.ctx ?? this.game).player;
    if (player) {
      player.thornField = null;
      player.predatorVerdict = null;
      player.clearArcaneOverflow?.();
      player.clearStimRush?.();
      player._smartlinkTargetId = null;
      player._smartlinkStickTimer = 0;
      player._smartlinkReticleEnemy = null;
      this.rangerGeneration.delete(player);
      this.rangerBasicTargets.delete(player);
      this.weaponResonanceLastAt.delete(player);
      this.ownedCastGenerations.delete(player);
      this.whirlwindStates.delete(player);
      this.twinFangStates.delete(player);
      this.crescentStates.delete(player);
      this.fanStates.delete(player);
      this.shadowstepStates.delete(player);
      this.starburstStates.delete(player);
      this.lotusStates.delete(player);
    }
    this._clearGunnerTransientState?.(player);
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
attachEnemySkillMethods(CombatSystem.prototype);
attachBasicAttackMethods(CombatSystem.prototype);
attachProjectileMethods(CombatSystem.prototype);
