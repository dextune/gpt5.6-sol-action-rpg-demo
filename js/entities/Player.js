import * as THREE from 'three';
import { GEAR_ENHANCE, PLAYER_CONFIG, WEAPON_ENHANCE, WEAPON_OPTION_ENHANCE } from '../config.js';
import {
  DEFAULT_HERO_CLASS_ID, RARITIES, SKILLS,
  canClassUseWeapon, createClassStarterWeapon, createEmptySkillCooldowns, createEmptySkillRanks,
  getClassSkillIds, getHeroClass, isRangedAttackStyle, resolveHeroClassId,
} from '../data/content.js';
import {
  normalizeSkillEvolutionState, normalizeSkillRank, resolveSkillForm, updateSkillMutationChoices,
} from '../data/skillCombat.js';
import { clamp, disposeObject } from '../core/Utils.js';
import { setMaterialHitPulse } from '../graphics/StylizedMaterial.js';
import {
  enhanceWeaponOptions, ensureGearBaseStats, gearSellValue, recomputeWeaponFromEnhance,
  weaponEnhanceCost, weaponEnhanceSuccessChance, weaponOptionEnhanceCost,
} from '../systems/LootSystem.js';

const NUMERIC_GEAR_STATS = Object.freeze([
  'power', 'defense', 'hp', 'crit', 'haste', 'leech', 'xpBonus', 'goldBonus',
  'skillPower', 'moveSpeed', 'luck',
]);

const TMP_VEL_DIR = new THREE.Vector3();

export class Player {
  constructor(scene, characterFactory, quality = 'medium', classId = DEFAULT_HERO_CLASS_ID) {
    this.scene = scene;
    this.characterFactory = characterFactory;
    this.quality = quality;
    this.classId = resolveHeroClassId(classId);
    this.#mountCharacter(this.classId);
    this.velocity = new THREE.Vector3();
    this.moveDirection = new THREE.Vector3();
    this.facing = new THREE.Vector3(0, 0, 1);
    this.dashDirection = new THREE.Vector3(0, 0, 1);
    this.knockback = new THREE.Vector3();
    this.reset(this.classId);
  }

  #mountCharacter(classId) {
    const character = this.characterFactory.createHero({ quality: this.quality, classId });
    this.classId = character.classId ?? resolveHeroClassId(classId);
    this.refs = character.refs;
    this.animation = character.animation;
    this.mesh = character.group;
    this.normalScale = this.mesh.scale.clone();
    this.scene.add(this.mesh);
  }

  /** Rebuild skeletal mesh when class changes (title start / continue). */
  setClass(classId, { keepTransform = false } = {}) {
    const next = resolveHeroClassId(classId);
    if (next === this.classId && this.mesh) return this.classId;
    this.arcaneOverflow = 0;
    const position = this.mesh?.position.clone() ?? new THREE.Vector3(0, 0, 6);
    const rotationY = this.mesh?.rotation.y ?? 0;
    const facing = this.facing?.clone() ?? new THREE.Vector3(0, 0, 1);
    this.#dismountCharacter();
    this.#mountCharacter(next);
    if (keepTransform) {
      this.mesh.position.copy(position);
      this.mesh.rotation.y = rotationY;
      this.facing.copy(facing);
      // Title preview: always show this class's starter weapon (never a leftover blade on ranger).
      const starter = createClassStarterWeapon(this.classId);
      this.inventory = [starter];
      this.equipped = { weapon: starter.id };
    } else {
      this.#sanitizeEquippedWeapon();
    }
    this.#updateWeaponVisual();
    return this.classId;
  }

  #dismountCharacter() {
    if (this.mesh) {
      this.animation?.dispose?.();
      this.characterFactory?.clearWeapons?.(this.refs);
      this.characterFactory?.outlines?.unregister(this.mesh);
      this.scene.remove(this.mesh);
      disposeObject(this.mesh);
    }
    this.mesh = null;
    this.refs = null;
    this.animation = null;
  }

  reset(classId = this.classId) {
    const next = resolveHeroClassId(classId);
    if (next !== this.classId || !this.mesh) this.setClass(next);
    const heroDef = getHeroClass(this.classId);
    const starter = createClassStarterWeapon(this.classId);
    this.name = heroDef.name;
    this.level = 1;
    this.xp = 0;
    this.gold = 0;
    this.essence = 0;
    this.skillPoints = 0;
    this.skills = createEmptySkillRanks(this.classId);
    this.skillEvolution = {};
    this.inventory = [starter];
    this.equipped = { weapon: starter.id };
    this.potions = 3;
    this.maxPotions = 5;
    this.hp = this.maxHp;
    this.mp = this.maxMp;
    this.alive = true;
    this.invulnerable = 0;
    this.attackCooldown = 0;
    this.attackAnim = 0;
    this.attackAnimDuration = .28;
    this.comboIndex = 0;
    this.comboWindow = 0;
    this.energy = 0;
    this.arcaneOverflow = 0;
    this.predatorVerdict = null;
    this.thornField = null;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.potionCooldown = 0;
    this.skillCooldowns = createEmptySkillCooldowns(this.classId);
    this.castTimer = 0;
    this.hitTimer = 0;
    this.runTime = 0;
    this.attackLunge = 0;
    // Run multipliers (Defense growth + temporary kill-chain bonuses). Cleared every reset.
    this.runMods = { attack: 1, defense: 1, skillPower: 0, haste: 0, xp: 0, moveSpeed: 0, killChainXp: 0 };
    this.clearShadowFrenzy();
    this.pickupRadiusBase = 2.2;
    this.mesh.position.set(0, 0, 6);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.scale.copy(this.normalScale);
    this.velocity.set(0, 0, 0);
    this.knockback.set(0, 0, 0);
    this.facing.set(0, 0, 1);
    this.animation.play('idle', { fade: 0, loop: true, restart: true });
    setMaterialHitPulse(this.mesh, 0);
    this.invalidateStats();
    this.#updateWeaponVisual();
  }

  get position() { return this.mesh.position; }
  get xpNeeded() { return Math.round(92 + Math.pow(this.level, 1.52) * 58 + this.level * 22); }
  get weapon() { return this.getItem(this.equipped.weapon) ?? this.inventory[0]; }
  get armor() { return null; }
  get charm() { return null; }
  get isDashing() { return this.dashTimer > 0; }
  get potionCount() { return this.potions; }

  /** Drop cached stat aggregates — call on equip / skill upgrade / class change / load. */
  invalidateStats() {
    this._equipmentStatsCache = null;
    this._passiveEffectsCache = null;
  }

  get equipmentStats() {
    if (this._equipmentStatsCache) return this._equipmentStatsCache;
    const stats = Object.fromEntries(NUMERIC_GEAR_STATS.map(key => [key, 0]));
    let weaponSpeed = 1;
    for (const item of [this.weapon]) {
      if (!item) continue;
      for (const key of NUMERIC_GEAR_STATS) stats[key] += Number(item[key]) || 0;
      if (item.slot === 'weapon') weaponSpeed = Number(item.speed) || 1;
    }
    stats.weaponSpeed = weaponSpeed;
    this._equipmentStatsCache = stats;
    return stats;
  }

  /** Aggregate passive effect ranks for the current class tree. */
  get passiveEffects() {
    if (this._passiveEffectsCache) return this._passiveEffectsCache;
    const out = {
      attack: 0, hp: 0, defense: 0, skillPower: 0, mpRegen: 0, mpFlat: 0, luck: 0, gold: 0,
      crit: 0, haste: 0, execute: 0, dotPower: 0, statusCrit: 0, moveSpeed: 0,
    };
    for (const id of getClassSkillIds(this.classId)) {
      const skill = SKILLS[id];
      const rank = this.skills[id] ?? 0;
      if (!skill?.passive || rank <= 0) continue;
      const effect = skill.effect ?? {};
      for (const key of Object.keys(out)) out[key] += (Number(effect[key]) || 0) * rank;
    }
    this._passiveEffectsCache = out;
    return out;
  }

  get classMods() {
    return getHeroClass(this.classId).baseStatMods ?? { attack: 1, mp: 1, skillPower: 0 };
  }

  get maxHp() {
    const stats = this.equipmentStats;
    const mods = this.classMods;
    const passive = 1 + this.passiveEffects.hp;
    return Math.round((PLAYER_CONFIG.baseHp * (mods.hp ?? 1) + (this.level - 1) * 12 + stats.hp) * passive);
  }
  get maxMp() {
    const mods = this.classMods;
    const base = PLAYER_CONFIG.baseMp * (mods.mp ?? 1);
    return Math.round(base + (this.level - 1) * 3.4 + this.passiveEffects.mpFlat);
  }
  get attackPower() {
    const stats = this.equipmentStats;
    const mods = this.classMods;
    const passive = 1 + this.passiveEffects.attack;
    const run = this.runMods?.attack ?? 1;
    return (PLAYER_CONFIG.baseAttack * (mods.attack ?? 1) + this.level * 2.15 + stats.power) * passive * run;
  }
  get defense() {
    const stats = this.equipmentStats;
    const mods = this.classMods;
    const run = this.runMods?.defense ?? 1;
    return (PLAYER_CONFIG.baseDefense * (mods.defense ?? 1) + this.level * .82 + stats.defense) * (1 + this.passiveEffects.defense) * run;
  }
  get critChance() { return clamp(PLAYER_CONFIG.baseCrit + this.equipmentStats.crit + this.passiveEffects.crit, 0, .65); }
  /** Crit chance past the 0.65 cap converts to crit damage instead of being wasted. */
  get critOverflow() {
    const raw = PLAYER_CONFIG.baseCrit + this.equipmentStats.crit + this.passiveEffects.crit;
    return Math.max(0, raw - .65);
  }
  get critMultiplier() { return 1.85 + this.critOverflow * 1.5; }
  get attackSpeed() {
    const runHaste = this.runMods?.haste ?? 0;
    const frenzyHaste = this.shadowFrenzy?.active ? this.shadowFrenzy.attackHaste : 0;
    return clamp(this.equipmentStats.weaponSpeed * (1 + this.equipmentStats.haste + this.passiveEffects.haste + runHaste + frenzyHaste), .65, 1.75);
  }
  /** Attack speed past the 1.75 cap accelerates Focus/Rage gain instead. */
  get attackSpeedOverflow() {
    const runHaste = this.runMods?.haste ?? 0;
    const raw = this.equipmentStats.weaponSpeed * (1 + this.equipmentStats.haste + this.passiveEffects.haste + runHaste);
    return Math.max(0, raw - 1.75);
  }
  get energyGainMul() { return 1 + this.attackSpeedOverflow * 2; }
  get moveSpeed() {
    const runMove = this.runMods?.moveSpeed ?? 0;
    const frenzyMove = this.shadowFrenzy?.active ? this.shadowFrenzy.moveHaste : 0;
    const slowMul = (this.debuffSlow ?? 0) > 0 ? 0.72 : 1;
    return (PLAYER_CONFIG.moveSpeed * (1 + this.passiveEffects.moveSpeed + runMove + frenzyMove) + this.equipmentStats.moveSpeed) * slowMul;
  }

  /** Soft crowd-control slow from enemy controllers / frostbitten elites. */
  applySlow(duration = 1.2) {
    this.debuffSlow = Math.max(this.debuffSlow ?? 0, duration);
  }
  get frenzyActive() { return Boolean(this.shadowFrenzy?.active && this.shadowFrenzy.remaining > 0); }
  get frenzyRatio() { return this.frenzyActive ? clamp(this.shadowFrenzy.remaining / this.shadowFrenzy.duration, 0, 1) : 0; }
  get frenzyTimingScale() { return this.frenzyActive ? clamp(1 / (1 + this.shadowFrenzy.attackHaste), .68, 1) : 1; }

  clearShadowFrenzy() {
    this.shadowFrenzy = {
      active: false, generation: 0, remaining: 0, duration: 0, attackHaste: 0, moveHaste: 0,
      extensionUsed: 0, extensionPerKill: 0, extensionCap: 0, contactCount: 0,
      contactCap: 0, exitMult: 0, offhandEcho: 0, chainCap: 0, bossRampCap: 0,
      chainMult: 0, bossRampStep: 0, bossTarget: null, bossStacks: 0,
      apexBundle: null, apexAudio: null,
    };
  }

  activateShadowFrenzy(combat = {}, bundle = null) {
    if (this.frenzyActive) return this.shadowFrenzy;
    const duration = clamp(Number(combat.frenzyDuration) || 4, 0, 5);
    this.shadowFrenzyGeneration = (this.shadowFrenzyGeneration ?? 0) + 1;
    this.shadowFrenzy = {
      active: duration > 0, generation: this.shadowFrenzyGeneration, remaining: duration, duration,
      attackHaste: clamp(Number(combat.frenzyAttackHaste) || 0, 0, .4),
      moveHaste: clamp(Number(combat.frenzyMoveHaste) || 0, 0, .35),
      extensionUsed: 0, extensionPerKill: Math.max(0, Number(combat.killExtension) || 0),
      extensionCap: clamp(Number(combat.killExtensionCap) || 0, 0, 2),
      contactCount: 0, contactCap: clamp(Math.round(Number(combat.contactCap) || 0), 0, 16),
      exitMult: Math.max(0, Number(combat.exitMult) || 0),
      offhandEcho: clamp(Number(combat.offhandEcho) || 0, 0, .35),
      chainCap: clamp(Math.round(Number(combat.chainCap) || 0), 0, 3),
      chainMult: clamp(Number(combat.chainMult) || 0, 0, .3),
      bossRampCap: clamp(Math.round(Number(combat.bossRampCap) || 0), 0, 6),
      bossRampStep: clamp(Number(combat.bossRampStep) || 0, 0, .05),
      bossTarget: null, bossStacks: 0,
      apexBundle: combat.apexFinisher ? bundle : null, apexAudio: null,
    };
    return this.shadowFrenzy;
  }

  registerFrenzyContact(enemy = null) {
    if (!this.frenzyActive) return null;
    const frenzy = this.shadowFrenzy;
    frenzy.contactCount = Math.min(frenzy.contactCap || 0, frenzy.contactCount + 1);
    if (enemy?.boss && frenzy.bossRampCap > 0) {
      if (frenzy.bossTarget !== enemy.id) { frenzy.bossTarget = enemy.id; frenzy.bossStacks = 0; }
      frenzy.bossStacks = Math.min(frenzy.bossRampCap, frenzy.bossStacks + 1);
    }
    return { contacts: frenzy.contactCount, chainCap: frenzy.chainCap, bossStacks: frenzy.bossStacks };
  }

  extendShadowFrenzyOnKill() {
    const frenzy = this.shadowFrenzy;
    if (!this.frenzyActive || frenzy.extensionPerKill <= 0) return 0;
    const added = Math.min(frenzy.extensionPerKill, frenzy.extensionCap - frenzy.extensionUsed);
    if (added <= 0) return 0;
    frenzy.extensionUsed += added;
    frenzy.remaining = Math.min(frenzy.duration + frenzy.extensionCap, frenzy.remaining + added);
    return added;
  }
  /** Magnet radius for XP gems (base + luck / run mods). */
  get pickupRadius() {
    const luck = this.luck ?? 0;
    const run = this.runMods?.pickupRadius ?? 0;
    return (this.pickupRadiusBase ?? 2.2) + luck * 0.5 + run;
  }
  get skillPower() {
    const mods = this.classMods;
    const run = this.runMods?.skillPower ?? 0;
    return 1 + this.equipmentStats.skillPower + this.passiveEffects.skillPower + (mods.skillPower ?? 0) + run;
  }
  get leech() { return clamp(this.equipmentStats.leech, 0, .12); }
  get xpBonus() {
    return this.equipmentStats.xpBonus + (this.runMods?.xp ?? 0) + (this.runMods?.killChainXp ?? 0);
  }
  get goldBonus() { return this.equipmentStats.goldBonus + this.passiveEffects.gold; }
  get luck() { return this.equipmentStats.luck + this.passiveEffects.luck; }
  get healthRatio() { return clamp(this.hp / Math.max(1, this.maxHp), 0, 1); }
  get manaRatio() { return clamp(this.mp / Math.max(1, this.maxMp), 0, 1); }

  /** Focus — rogue class energy resource definition; null for classes without one. */
  get energyDef() { return getHeroClass(this.classId).energy ?? null; }

  gainArcaneOverflow(amount, max = 100) {
    if (!this.alive || this.classId !== 'wizard' || this.level < 50) return 0;
    const before = Math.max(0, Number(this.arcaneOverflow) || 0);
    this.arcaneOverflow = Math.min(Math.max(0, Number(max) || 100), before + Math.max(0, Number(amount) || 0));
    return this.arcaneOverflow - before;
  }

  consumeArcaneOverflow(cost = 100) {
    const required = Math.max(0, Number(cost) || 0);
    const current = Math.max(0, Number(this.arcaneOverflow) || 0);
    if (!this.alive || this.classId !== 'wizard' || current < required) return false;
    this.arcaneOverflow = current - required;
    return true;
  }

  clearArcaneOverflow() { this.arcaneOverflow = 0; }
  get maxEnergy() { return this.energyDef?.max ?? 0; }
  get energyRatio() { return this.maxEnergy > 0 ? clamp(this.energy / this.maxEnergy, 0, 1) : 0; }
  get energyComboReady() {
    const def = this.energyDef;
    return Boolean(def && this.level >= def.comboUnlockLevel && this.energy >= def.max);
  }
  /** Combo length grows with level past the unlock (rush-type energy effects only). */
  get energyComboHits() {
    const def = this.energyDef;
    if (!def?.comboBaseHits) return 0;
    const bonus = Math.floor(Math.max(0, this.level - def.comboUnlockLevel) / def.comboHitsPerLevels);
    return Math.min(def.comboMaxHits, def.comboBaseHits + bonus);
  }

  gainEnergy(amount) {
    if (!this.energyDef || !this.alive) return;
    this.energy = clamp(this.energy + amount * this.energyGainMul, 0, this.maxEnergy);
  }

  getItem(itemId) {
    if (!itemId) return null;
    return this.inventory.find(item => item.id === itemId) ?? null;
  }

  skillRank(skillId) {
    const skill = SKILLS[skillId];
    if (!skill || this.level < skill.unlockLevel) return 0;
    if (skill.classId && skill.classId !== this.classId) return 0;
    if (skill.passive) return this.skills[skillId] ?? 0;
    return Math.max(1, this.skills[skillId] ?? 0);
  }

  setMoveDirection(direction) {
    this.moveDirection.copy(direction);
    if (this.moveDirection.lengthSq() > 1) this.moveDirection.normalize();
  }

  update(delta, game) {
    this.#updateTimers(delta, game);
    if (this.alive) {
      this.#regenerate(delta, game);
      this.#move(delta, game.world);
    }
    this.#animate(delta, game);
  }

  #updateTimers(delta, game) {
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.attackAnim = Math.max(0, this.attackAnim - delta);
    this.comboWindow = Math.max(0, this.comboWindow - delta);
    this.dashTimer = Math.max(0, this.dashTimer - delta);
    this.dashCooldown = Math.max(0, this.dashCooldown - delta);
    this.potionCooldown = Math.max(0, this.potionCooldown - delta);
    this.invulnerable = Math.max(0, this.invulnerable - delta);
    this.castTimer = Math.max(0, this.castTimer - delta);
    this.hitTimer = Math.max(0, this.hitTimer - delta);
    this.attackLunge = Math.max(0, this.attackLunge - delta);
    this.debuffSlow = Math.max(0, (this.debuffSlow ?? 0) - delta);
    if (this.shadowFrenzy?.active) {
      this.shadowFrenzy.remaining = Math.max(0, this.shadowFrenzy.remaining - delta);
      if (this.shadowFrenzy.remaining <= 0) {
        const ended = { ...this.shadowFrenzy };
        this.clearShadowFrenzy();
        game?.combat?.endShadowFrenzy?.(this, ended);
      }
    }
    if (this.predatorVerdict) {
      if (!this.predatorVerdict.target?.alive) {
        this.predatorVerdict = null;
      } else {
      this.predatorVerdict.remaining = Math.max(0, this.predatorVerdict.remaining - delta);
      if (this.predatorVerdict.remaining <= 0) game?.combat?.expirePredatorVerdict?.(this, this.predatorVerdict.generation);
      }
    }
    if (this.thornField) this.thornField.remaining = Math.max(0, this.thornField.remaining - delta);
    for (const key of Object.keys(this.skillCooldowns)) this.skillCooldowns[key] = Math.max(0, this.skillCooldowns[key] - delta);
    this.knockback.multiplyScalar(Math.pow(.004, delta));
  }

  #regenerate(delta, game) {
    const focusRegen = 1 + this.passiveEffects.mpRegen;
    this.mp = Math.min(this.maxMp, this.mp + delta * 5.2 * focusRegen);
    const campDistance = Math.hypot(this.position.x, this.position.z);
    if (campDistance < 14.2) {
      this.hp = Math.min(this.maxHp, this.hp + delta * this.maxHp * .065);
      this.mp = Math.min(this.maxMp, this.mp + delta * 12);
    }
  }

  #move(delta, world) {
    const desired = this.moveDirection.clone().multiplyScalar(this.moveSpeed);
    if (this.isDashing) {
      this.velocity.copy(this.dashDirection).multiplyScalar(PLAYER_CONFIG.dashSpeed + this.equipmentStats.moveSpeed * .6);
    } else {
      // Commit to the swing — slight slow, but keep forward bite during lunge.
      const slow = this.attackAnim > 0 ? (this.attackLunge > 0 ? .72 : .42) : this.castTimer > 0 ? .28 : 1;
      desired.multiplyScalar(slow);
      const hasInput = this.moveDirection.lengthSq() > .001;
      // 180° / sharp reverse: kill opposite momentum so the hero does not slide backward
      // while the body slowly turns (felt like long stepping arcs).
      if (hasInput && this.velocity.lengthSq() > 1e-4) {
        const inputDir = this.moveDirection;
        const along = this.velocity.dot(inputDir);
        if (along < 0) {
          this.velocity.addScaledVector(inputDir, -along);
        }
      }
      // Reverse / large turns use higher accel so direction changes feel instant.
      let acceleration = hasInput ? PLAYER_CONFIG.acceleration : PLAYER_CONFIG.friction;
      if (hasInput && this.velocity.lengthSq() > 1e-4) {
        const velDirDot = TMP_VEL_DIR.copy(this.velocity).normalize().dot(this.moveDirection);
        if (velDirDot < 0.25) acceleration = Math.max(acceleration, 92);
      }
      this.velocity.lerp(desired, 1 - Math.exp(-acceleration * delta));
      // Body facing: snap to move input immediately (action-RPG style). Soft lerp only
      // for tiny corrections was making 180° turns look like a long pivot step.
      if (hasInput && this.attackAnim <= 0 && this.castTimer <= 0) {
        this.facing.copy(this.moveDirection).setY(0);
        if (this.facing.lengthSq() > 1e-6) this.facing.normalize();
      }
    }

    this.position.addScaledVector(this.velocity, delta);
    this.position.addScaledVector(this.knockback, delta);
    world.resolvePosition(this.position, .48);
    // Mesh yaw always tracks facing; keep a tiny blend only mid-attack so the cut does not jitter.
    const targetYaw = Math.atan2(this.facing.x, this.facing.z);
    if (this.attackAnim > 0) {
      let dy = targetYaw - this.mesh.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.mesh.rotation.y += dy * (1 - Math.exp(-28 * delta));
    } else {
      this.mesh.rotation.y = targetYaw;
    }
  }

  #animate(delta, game) {
    const speed = this.alive ? this.velocity.length() : 0;
    if (this.alive) this.animation.setLocomotion(speed, { sprint: speed > this.moveSpeed * 1.12 });
    const distance = game?.camera ? game.camera.position.distanceTo(this.position) : 0;
    this.animation.update(delta, { distance, visible: this.mesh.visible });
    setMaterialHitPulse(this.mesh, this.hitTimer > 0 ? Math.min(1, this.hitTimer / .16) : 0);
    // Keep mesh scale stable so the follow camera never "jitters" with squash/stretch.
    this.mesh.scale.copy(this.normalScale);
  }

  registerHitImpact(_strength = 1) {
    // No body recoil — caused the camera (locked to the hero) to look like it was shaking.
  }

  faceToward(point) {
    if (!point) return;
    const direction = point.clone().sub(this.position);
    direction.y = 0;
    if (direction.lengthSq() < .01) return;
    this.facing.copy(direction.normalize());
  }

  /**
   * Combat aims along movement if keys are held, otherwise current body facing.
   * Never snap to mouse aim — that caused bolts/swings to fire “down” while running sideways.
   */
  alignCombatFacing() {
    if (this.moveDirection.lengthSq() > .01) {
      this.facing.copy(this.moveDirection).setY(0);
      if (this.facing.lengthSq() > .0001) this.facing.normalize();
    } else if (this.facing.lengthSq() < .0001) {
      this.facing.set(0, 0, 1);
    } else {
      this.facing.setY(0).normalize();
    }
    // Snap visual yaw immediately so mesh and projectiles match.
    this.mesh.rotation.y = Math.atan2(this.facing.x, this.facing.z);
  }

  /**
   * Basic-attack chain length grows with level (melee/knight especially).
   * Magic keeps a stable 4-step orb combo.
   */
  get basicComboLength() {
    if (isRangedAttackStyle(this.classId)) return 4;
    // Lv1–3: 3 · 4–7: 4 · 8–12: 5 · 13–19: 6 · 20+: 7
    if (this.level >= 20) return 7;
    if (this.level >= 13) return 6;
    if (this.level >= 8) return 5;
    if (this.level >= 4) return 4;
    return 3;
  }

  tryAttack(game) {
    if (this.attackCooldown > 0 || this.isDashing || this.castTimer > 0 || !this.alive) return false;
    if (this.energyComboReady) {
      this.#releaseEnergyCombo(game);
      return true;
    }
    this.alignCombatFacing();
    const comboLength = this.basicComboLength;
    this.comboIndex = this.comboWindow > 0 ? (this.comboIndex + 1) % comboLength : 0;
    const finisher = this.comboIndex === comboLength - 1;
    this.comboWindow = finisher ? .52 + comboLength * .02 : .72;
    // Snappier chain — finisher hangs a hair longer for weight.
    this.attackCooldown = ((finisher ? .44 : .25) + this.comboIndex * .016) / this.attackSpeed;
    this.attackAnimDuration = ((finisher ? .34 : .17) + this.comboIndex * .01) / Math.min(1.7, this.attackSpeed);
    this.attackAnim = this.attackAnimDuration;
    this.attackLunge = finisher ? .12 : .07;
    // Mild step-in only — strong lunge made the follow camera jerk with the hero.
    const lunge = (finisher ? 2.4 : 1.35 + this.comboIndex * .22) * Math.min(1.15, this.attackSpeed);
    this.velocity.addScaledVector(this.facing, lunge * .35);
    const timeScale = Math.min(2.15, this.attackSpeed * (finisher ? 1.02 : 1.35));
    // Melee: attack_1..7 when baked. Magic/ranged: prefer cast_1..4 draw/cast poses.
    let animName;
    if (isRangedAttackStyle(this.classId)) {
      const castSlot = (this.comboIndex % 4) + 1;
      animName = `cast_${castSlot}`;
      if (!this.animation.has(animName)) animName = `attack_${Math.min(4, castSlot)}`;
    } else {
      const preferred = Math.min(7, this.comboIndex + 1);
      animName = `attack_${preferred}`;
      if (!this.animation.has(animName)) {
        const fallbackSlot = this.comboIndex < 4
          ? this.comboIndex + 1
          : (this.comboIndex % 2 === 0 ? 3 : 4);
        animName = `attack_${fallbackSlot}`;
      }
    }
    // Late-chain steps without unique clips still read differently via speed + combat VFX.
    const lateBoost = this.comboIndex >= 4 ? 1.08 + (this.comboIndex - 3) * 0.04 : 1;
    this.animation.playOneShot(animName, {
      fade: .04, fadeOut: finisher ? .12 : .07, timeScale: timeScale * lateBoost, fallback: 'idle',
    });
    game.audio.swing(Math.min(3, this.comboIndex));
    game.combat.playerAttack(this, this.comboIndex, comboLength);
    return true;
  }

  /** A full Focus/Rage gauge releases the class energy burst on the next attack click. */
  #releaseEnergyCombo(game) {
    const def = this.energyDef;
    this.energy = 0;
    this.alignCombatFacing();
    this.comboIndex = 0;
    this.comboWindow = 0;
    const result = game.combat.releaseEnergyBurst(this, def) ?? {};
    const duration = result.duration ?? .5;
    this.attackCooldown = duration * .85;
    this.attackAnimDuration = duration;
    this.attackAnim = duration;
    this.attackLunge = .1;
    let anim = result.anim ?? 'attack_3';
    if (!this.animation.has(anim)) anim = this.animation.has('skill_whirlwind') ? 'skill_whirlwind' : 'attack_3';
    this.animation.playOneShot(anim, { fade: .05, fadeOut: .1, timeScale: Math.max(1.1, 1.3 / duration), fallback: 'idle' });
    game.audio.skill(result.sfx ?? 'skill_blade');
    if (result.floatText) {
      game.ui.floatText(this.position.clone().add(new THREE.Vector3(0, 2.1, 0)), result.floatText, 'critical');
    }
  }

  tryDash(game) {
    if (this.dashCooldown > 0 || this.isDashing || !this.alive) return false;
    this.dashDirection.copy(this.moveDirection.lengthSq() > .01 ? this.moveDirection : this.facing).normalize();
    this.dashTimer = PLAYER_CONFIG.dashDuration;
    this.dashCooldown = PLAYER_CONFIG.dashCooldown;
    this.invulnerable = Math.max(this.invulnerable, PLAYER_CONFIG.dashDuration + .12);
    this.velocity.copy(this.dashDirection).multiplyScalar(PLAYER_CONFIG.dashSpeed);
    this.animation.playOneShot('dodge', { fade: .07, fadeOut: .09, timeScale: 1.08, fallback: 'idle' });
    game.effects.dust(this.position, 0xdce5ce, 8, .36);
    game.effects.trail(this.position.clone().add(new THREE.Vector3(0, 1, 0)), this.weapon.rarityColor, .5, .24);
    game.audio.dash();
    return true;
  }

  trySkill(skillId, game) {
    const skill = SKILLS[skillId];
    const rank = this.skillRank(skillId);
    if (!skill || skill.passive) return false;
    if (skill.classId && skill.classId !== this.classId) return false;
    if (rank <= 0) {
      game.ui.notify(`${skill.name}: Unlocks at Lv.${skill.unlockLevel}`, 'danger');
      return false;
    }
    const bundle = resolveSkillForm(skill, rank, this.level, this.skillEvolution[skillId]);
    if ((this.skillCooldowns[skillId] ?? 0) > 0 || this.mp < bundle.mp || this.isDashing || !this.alive) return false;
    this.alignCombatFacing();
    this.mp -= bundle.mp;
    this.skillCooldowns[skillId] = bundle.cooldown;
    this.castTimer = bundle.castTime;
    this.attackAnimDuration = this.castTimer;
    this.attackAnim = this.castTimer;
    let anim = bundle.anim ?? `skill_${skillId}`;
    // Graceful data-driven fallback if the unique clip is not in the GLB.
    if (!this.animation.has(anim)) {
      anim = bundle.animFallback && this.animation.has(bundle.animFallback)
        ? bundle.animFallback
        : this.animation.has('skill_whirlwind') ? 'skill_whirlwind' : 'idle';
    }
    this.animation.playOneShot(anim, {
      fade: .09, fadeOut: .13,
      timeScale: bundle.castTime > .6 ? .92 : 1.05,
      fallback: 'idle',
    });
    if (typeof game.audio.skill === 'function') {
      game.audio.skill(bundle.presentation.sfx ?? bundle.presentation.theme ?? 'skill');
    }
    const hits = bundle.timeline?.hits;
    if (Array.isArray(hits) && hits.length && this.animation.oneShot) {
      // Pose-synced skill phases — combat fires on normalized clip times.
      for (let i = 0; i < hits.length; i += 1) {
        const phase = i;
        const cadence = Math.max(.5, Math.min(1.25, bundle.combat?.cadenceMult ?? 1));
        this.animation.scheduleNormalized(Math.min(.98, hits[i] * cadence), () => {
          if (!this.alive) return;
          game.combat.usePlayerSkill(bundle, this, phase);
        }, Symbol(`${skillId}-phase-${phase}`));
      }
    } else {
      game.combat.usePlayerSkill(bundle, this, null);
    }
    return true;
  }

  usePotion(game) {
    if (game?.mode === 'defense' && game.defense?.mutator?.id === 'scarce') {
      game.ui?.notify?.('Scarce Tide · potions sealed', 'danger', 2.2);
      return false;
    }
    if (this.potionCooldown > 0 || this.potions <= 0 || this.hp >= this.maxHp || !this.alive) return false;
    this.potions -= 1;
    this.potionCooldown = PLAYER_CONFIG.potionCooldown;
    const amount = Math.round(this.maxHp * PLAYER_CONFIG.potionHealRatio);
    this.heal(amount);
    game.effects.ring(this.position, 0x6bf0a0, 2.8, { life: .55 });
    game.effects.burst(this.position, 0x8fffc1, 18, { speed: 2.4, upward: .5, size: .3, gravity: 2.2 });
    game.audio.pickup('uncommon');
    game.ui.floatText(this.position, `+${amount}`, 'heal');
    return true;
  }

  takeDamage(rawAmount, knockback = null) {
    if (this.invulnerable > 0 || !this.alive) return 0;
    const amount = Math.max(1, Math.round(rawAmount - this.defense * PLAYER_CONFIG.defenseSoak));
    this.hp = Math.max(0, this.hp - amount);
    // Rage-style resources charge from taking hits.
    if (amount > 0 && this.energyDef?.perDamageTaken) this.gainEnergy(this.energyDef.perDamageTaken);
    this.invulnerable = .46;
    this.hitTimer = .19;
    if (knockback) this.knockback.add(knockback);
    if (this.hp <= 0) {
      this.alive = false;
      this.clearShadowFrenzy();
      this.clearArcaneOverflow();
      this.predatorVerdict = null;
      this.thornField = null;
      this.animation.playOneShot('death', { fade: .12, fadeOut: .2, timeScale: 1, fallback: null });
    } else this.animation.playOneShot('hit', { fade: .055, fadeOut: .07, timeScale: 1.08, fallback: 'idle' });
    return amount;
  }

  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, amount));
    return this.hp - before;
  }

  restore() {
    this.hp = this.maxHp;
    this.mp = this.maxMp;
    this.alive = true;
    this.clearShadowFrenzy();
    this.clearArcaneOverflow();
    this.predatorVerdict = null;
    this.thornField = null;
    this.invulnerable = 1.4;
    this.velocity.set(0, 0, 0);
    this.mesh.scale.copy(this.normalScale);
    this.animation.play('idle', { fade: .12, loop: true, restart: true });
  }

  addXp(rawAmount) {
    const amount = Math.round(rawAmount * (1 + this.xpBonus));
    const levelUps = [];
    this.xp += Math.max(0, amount);
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level += 1;
      this.skillPoints += 1;
      for (const id of getClassSkillIds(this.classId)) {
        const skill = SKILLS[id];
        if (!skill || skill.passive) continue;
        if (skill.unlockLevel === this.level && (this.skills[id] ?? 0) === 0) this.skills[id] = 1;
      }
      levelUps.push(this.level);
    }
    if (levelUps.length) {
      this.hp = this.maxHp;
      this.mp = this.maxMp;
    }
    return { amount, levelUps };
  }

  addGold(rawAmount) {
    const amount = Math.max(0, Math.round(rawAmount * (1 + this.goldBonus)));
    this.gold += amount;
    return amount;
  }

  addGear(item) {
    return { added: false, reason: 'weapon-only' };
  }

  /** Class weapon allow-list; non-weapon gear is no longer equipable. */
  canEquipItem(item) {
    return Boolean(item?.slot === 'weapon' && canClassUseWeapon(this.classId, item));
  }

  equip(itemId) {
    const item = this.getItem(itemId);
    if (!item || item.slot !== 'weapon') return false;
    if (!this.canEquipItem(item)) return false;
    this.equipped[item.slot] = item.id;
    this.invalidateStats();
    this.hp = Math.min(this.hp, this.maxHp);
    this.mp = Math.min(this.mp, this.maxMp);
    if (item.slot === 'weapon') this.#updateWeaponVisual();
    return true;
  }

  /** Ensure held weapon model matches class; used after load / class change. */
  #sanitizeEquippedWeapon() {
    const starter = createClassStarterWeapon(this.classId);
    const weapon = this.inventory.find(item => item?.slot === 'weapon' && this.canEquipItem(item)) ?? starter;
    weapon.classId = this.classId;
    this.inventory = [weapon];
    this.equipped = { weapon: weapon.id };
    recomputeWeaponFromEnhance(weapon);
  }

  weaponEnhanceCost() { return weaponEnhanceCost(this.weapon); }

  weaponOptionEnhanceCost() { return weaponOptionEnhanceCost(this.weapon); }

  /** Spend gold on a signature-weapon evolution attempt. Failure preserves all weapon state. */
  enhanceWeapon() {
    const weapon = this.weapon;
    const level = Number(weapon?.weaponEnhanceLevel ?? weapon?.enhanceLevel) || 0;
    if (!weapon) return { ok: false, reason: 'missing', level };
    if (level >= WEAPON_ENHANCE.maxLevel) return { ok: false, reason: 'max', level };
    const cost = weaponEnhanceCost(weapon);
    if (this.gold < cost) return { ok: false, reason: 'gold', cost, level };
    const chance = weaponEnhanceSuccessChance(weapon);
    this.gold -= cost;
    if (Math.random() >= chance) {
      return { ok: true, success: false, cost, level, chance };
    }
    weapon.weaponEnhanceLevel = level + 1;
    recomputeWeaponFromEnhance(weapon);
    this.invalidateStats();
    this.hp = Math.min(this.hp, this.maxHp);
    this.#updateWeaponVisual();
    return { ok: true, cost, level: weapon.weaponEnhanceLevel, stage: weapon.evolutionStage };
  }

  /** Spend gold on the weapon's deterministic option-growth track. */
  enhanceWeaponOptions() {
    const weapon = this.weapon;
    const level = Number(weapon?.optionEnhanceLevel) || 0;
    if (!weapon) return { ok: false, reason: 'missing', level };
    if (level >= WEAPON_OPTION_ENHANCE.maxLevel) return { ok: false, reason: 'max', level };
    const cost = weaponOptionEnhanceCost(weapon);
    if (this.gold < cost) return { ok: false, reason: 'gold', cost, level };
    this.gold -= cost;
    const result = enhanceWeaponOptions(weapon);
    this.invalidateStats();
    this.hp = Math.min(this.hp, this.maxHp);
    return { ...result, cost };
  }

  /** Gold value if sold (0 if not sellable). */
  sellValue(itemId) {
    const item = this.getItem(itemId);
    if (!item || item.locked || this.equipped[item.slot] === itemId) return 0;
    return gearSellValue(item);
  }

  /**
   * Sell one unequipped item for gold (+ essence on rare+).
   * @returns {number} gold gained
   */
  sell(itemId) {
    const item = this.getItem(itemId);
    if (!item || item.locked || this.equipped[item.slot] === itemId) return 0;
    const value = gearSellValue(item);
    this.inventory = this.inventory.filter(entry => entry.id !== itemId);
    this.gold += value;
    this.essence += item.rarity === 'epic' ? 2 : item.rarity === 'legendary' ? 5 : item.rarity === 'rare' ? 1 : 0;
    return value;
  }

  /** @deprecated Use sell() — kept for call-site compatibility. */
  salvage(itemId) {
    return this.sell(itemId);
  }

  /**
   * Sell all unequipped, unlocked gear (optional rarity filter).
   * @param {{ rarities?: string[] }} [options]
   * @returns {{ count: number, gold: number }}
   */
  sellAllUnequipped(options = {}) {
    const rarities = options.rarities ? new Set(options.rarities) : null;
    const ids = this.inventory
      .filter(item => {
        if (item.locked) return false;
        if (this.equipped[item.slot] === item.id) return false;
        if (rarities && !rarities.has(item.rarity)) return false;
        return true;
      })
      .map(item => item.id);
    let gold = 0;
    for (const id of ids) gold += this.sell(id);
    return { count: ids.length, gold };
  }

  enhanceCost(itemId) {
    return itemId === this.weapon?.id ? this.weaponEnhanceCost() : 0;
  }

  enhanceChance(itemId) {
    return itemId === this.weapon?.id ? weaponEnhanceSuccessChance(this.weapon) : 0;
  }

  /**
   * Spend gold to enhance the equipped weapon. Enhancement is deterministic;
   * an unsuccessful attempt never lowers the current enhancement level.
   * @returns {{ ok: boolean, success?: boolean, reason?: string, cost?: number, level?: number, chance?: number }}
   */
  enhance(itemId) {
    if (itemId !== this.weapon?.id) return { ok: false, reason: 'weapon-only' };
    return this.enhanceWeapon();
  }

  upgradeSkill(skillId) {
    const skill = SKILLS[skillId];
    if (!skill || this.level < skill.unlockLevel || this.skillPoints <= 0) return false;
    const current = this.skillRank(skillId);
    if (current >= skill.maxRank) return false;
    this.skills[skillId] = current + 1;
    this.skillPoints -= 1;
    this.invalidateStats();
    this.hp = Math.min(this.hp, this.maxHp);
    return true;
  }

  /** Select or respec one unlocked Lv40/Lv80 mutation without changing the skill binding. */
  setSkillMutation(skillId, milestone, choiceId) {
    const skill = SKILLS[skillId];
    const gate = Number(milestone);
    if (!skill || skill.passive || skill.classId !== this.classId || this.level < gate) return false;
    const next = updateSkillMutationChoices(skill, this.skillEvolution?.[skillId], gate, choiceId, {
      classId: this.classId,
      playerLevel: this.level,
    });
    if (!next) return false;
    this.skillEvolution = { ...this.skillEvolution, [skillId]: next };
    return true;
  }

  /**
   * Auto-spend skill points: balance unlocked actives first, then passives.
   * Shared by Defense wave clear and Hunt level-up growth (no draft UI in V1).
   * @param {{ onUnlock?: (skill: object) => void }} [hooks]
   * @returns {number} points spent
   */
  autoSpendSkillPoints(hooks = {}) {
    if (this.skillPoints <= 0) return 0;
    const ids = getClassSkillIds(this.classId);
    const actives = [];
    const passives = [];
    for (const id of ids) {
      const skill = SKILLS[id];
      if (!skill) continue;
      if (skill.passive) passives.push(id);
      else actives.push(id);
    }
    const keyOrder = { Q: 0, E: 1, R: 2, C: 3 };
    const stableOrder = (a, b) => (
      (SKILLS[a].unlockLevel ?? 99) - (SKILLS[b].unlockLevel ?? 99)
      || (keyOrder[SKILLS[a].key] ?? 99) - (keyOrder[SKILLS[b].key] ?? 99)
      || a.localeCompare(b)
    );
    actives.sort(stableOrder);
    passives.sort(stableOrder);
    const unlockedCapacity = ids.reduce((total, id) => {
      const skill = SKILLS[id];
      if (!skill || this.level < skill.unlockLevel) return total;
      return total + Math.max(0, skill.maxRank - this.skillRank(id));
    }, 0);
    let spent = 0;
    const spendLimit = Math.min(Math.max(0, Math.floor(this.skillPoints)), unlockedCapacity);
    while (spent < spendLimit && this.skillPoints > 0) {
      const activeId = actives
        .filter(id => this.level >= SKILLS[id].unlockLevel && this.skillRank(id) < SKILLS[id].maxRank)
        .sort((a, b) => this.skillRank(a) - this.skillRank(b) || stableOrder(a, b))[0];
      const passiveId = passives.find(
        id => this.level >= SKILLS[id].unlockLevel && this.skillRank(id) < SKILLS[id].maxRank,
      );
      const id = activeId ?? passiveId;
      if (!id || !this.upgradeSkill(id)) break;
      spent += 1;
      const skill = SKILLS[id];
      if (!skill.passive && (this.skills[id] ?? 0) === 1) {
        hooks.onUnlock?.(skill);
      }
    }
    return spent;
  }

  cooldownRatio(skillId) {
    if (skillId === 'dash') return this.dashCooldown / PLAYER_CONFIG.dashCooldown;
    if (skillId === 'potion') return this.potionCooldown / PLAYER_CONFIG.potionCooldown;
    const skill = SKILLS[skillId];
    return skill ? this.skillCooldowns[skillId] / skill.cooldown : 0;
  }

  #updateWeaponVisual() {
    // Hard guard: never mount a mesh this class cannot wield.
    if (this.weapon && !canClassUseWeapon(this.classId, this.weapon)) {
      this.#sanitizeEquippedWeapon();
    }
    const rarity = RARITIES[this.weapon?.rarity] ?? RARITIES.common;
    this.characterFactory.equipWeapon(this.refs, {
      ...this.weapon,
      rarityColor: this.weapon?.rarityColor ?? rarity.color,
    });
  }

  dispose() {
    this.#dismountCharacter();
  }

  serialize() {
    const skillEvolution = normalizeSkillEvolutionState(
      this.skillEvolution,
      SKILLS,
      getClassSkillIds(this.classId),
    );
    return {
      classId: this.classId,
      name: this.name,
      level: this.level,
      xp: this.xp,
      gold: this.gold,
      essence: this.essence,
      skillPoints: this.skillPoints,
      skills: { ...this.skills },
      skillEvolution,
      inventory: this.inventory.map(item => ({
        ...item,
        affixes: [...(item.affixes ?? [])],
        baseStats: item.baseStats ? { ...item.baseStats } : undefined,
        optionStats: item.optionStats ? { ...item.optionStats } : undefined,
        baseSpeed: Number(item.baseSpeed ?? item.speed) || 1,
        enhanceLevel: Number(item.enhanceLevel) || 0,
        weaponEnhanceLevel: Number(item.weaponEnhanceLevel ?? item.enhanceLevel) || 0,
        optionEnhanceLevel: Number(item.optionEnhanceLevel) || 0,
      })),
      equipped: { ...this.equipped },
      potions: this.potions,
      maxPotions: this.maxPotions,
      hp: this.hp,
      mp: this.mp,
      energy: this.energy,
      position: [this.position.x, this.position.y, this.position.z],
    };
  }

  load(state = {}, world = null) {
    const classId = resolveHeroClassId(state.classId);
    const starter = createClassStarterWeapon(classId);
    this.reset(classId);
    const heroDef = getHeroClass(classId);
    this.name = typeof state.name === 'string' ? state.name : heroDef.name;
    this.level = Math.max(1, Number(state.level) || 1);
    this.xp = Math.max(0, Number(state.xp) || 0);
    this.gold = Math.max(0, Number(state.gold) || 0);
    // Essence and equipment inventory were legacy systems; current progression is gold + one weapon.
    this.essence = 0;
    this.skillPoints = Math.max(0, Number(state.skillPoints) || 0);
    // Only merge ranks for this class tree (ignore leftover hunter keys on a wizard save, etc.).
    const ranks = createEmptySkillRanks(classId);
    const incoming = state.skills ?? {};
    for (const id of getClassSkillIds(classId)) {
      if (incoming[id] != null) {
        ranks[id] = normalizeSkillRank(SKILLS[id], incoming[id]);
      }
    }
    this.skills = ranks;
    this.skillEvolution = normalizeSkillEvolutionState(state.skillEvolution, SKILLS, getClassSkillIds(classId));
    const loadedInventory = Array.isArray(state.inventory)
      ? state.inventory.filter(item => item?.id && item?.slot)
      : [];
    const equippedId = state.equipped?.weapon;
    const legacyWeapon = loadedInventory.find(item => item.id === equippedId && item.slot === 'weapon')
      ?? loadedInventory
        .filter(item => item.slot === 'weapon')
        .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))[0];
    const weapon = legacyWeapon ? { ...legacyWeapon } : starter;
    weapon.classId = classId;
    weapon.slot = 'weapon';
    const oldLevel = Math.max(0, Number(weapon.weaponEnhanceLevel ?? weapon.enhanceLevel) || 0);
    if (!weapon.baseStats || typeof weapon.baseStats !== 'object') {
      ensureGearBaseStats(weapon);
      // Legacy gear stored post-enhance values without a base snapshot.
      if (oldLevel > 0) {
        const flatMul = 1 + oldLevel * GEAR_ENHANCE.flatStep;
        const pctMul = 1 + oldLevel * GEAR_ENHANCE.pctStep;
        for (const key of NUMERIC_GEAR_STATS) {
          const live = Number(weapon[key]) || 0;
          const mul = (key === 'power' || key === 'defense' || key === 'hp' || key === 'moveSpeed') ? flatMul : pctMul;
          weapon.baseStats[key] = mul > 0 ? live / mul : 0;
        }
      }
    }
    weapon.baseSpeed = Number(weapon.baseSpeed) || Number(weapon.speed) || 1;
    weapon.weaponEnhanceLevel = Math.min(WEAPON_ENHANCE.maxLevel, oldLevel);
    weapon.optionEnhanceLevel = Math.min(WEAPON_OPTION_ENHANCE.maxLevel, Number(weapon.optionEnhanceLevel) || 0);
    weapon.optionStats = weapon.optionStats && typeof weapon.optionStats === 'object' ? { ...weapon.optionStats } : {};
    for (const affix of weapon.affixes ?? []) {
      if (affix?.stat) weapon.optionStats[affix.stat] = Number(weapon.optionStats[affix.stat]) || Number(affix.value) || 0;
    }
    if (!weapon.optionEnhanceLevel && Object.keys(weapon.optionStats).length) {
      weapon.optionEnhanceLevel = Math.min(WEAPON_OPTION_ENHANCE.maxLevel, Object.keys(weapon.optionStats).length);
    }
    recomputeWeaponFromEnhance(weapon);
    const discarded = loadedInventory.filter(item => item !== legacyWeapon);
    this.gold += discarded.reduce((sum, item) => sum + gearSellValue(item), 0);
    this.inventory = [weapon];
    this.equipped = { weapon: weapon.id };
    this.potions = clamp(Number(state.potions) || 0, 0, Number(state.maxPotions) || 5);
    this.maxPotions = Math.max(5, Number(state.maxPotions) || 5);
    const position = Array.isArray(state.position) ? state.position : [0, 0, 6];
    this.position.set(Number(position[0]) || 0, 0, Number(position[2]) || 6);
    if (world) world.resolvePosition(this.position, .48);
    this.invalidateStats();
    this.hp = clamp(Number(state.hp) || this.maxHp, 1, this.maxHp);
    this.mp = clamp(Number(state.mp) || this.maxMp, 0, this.maxMp);
    this.energy = clamp(Number(state.energy) || 0, 0, this.maxEnergy);
    this.alive = true;
    this.#updateWeaponVisual();
  }
}
