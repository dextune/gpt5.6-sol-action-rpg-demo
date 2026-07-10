import * as THREE from 'three';
import { PLAYER_CONFIG } from '../config.js';
import {
  DEFAULT_HERO_CLASS_ID, RARITIES, SKILLS,
  createClassStarterWeapon, createEmptySkillCooldowns, createEmptySkillRanks,
  getClassSkillIds, getHeroClass, resolveHeroClassId,
} from '../data/content.js';
import { clamp, disposeObject } from '../core/Utils.js';
import { setMaterialHitPulse } from '../graphics/StylizedMaterial.js';

const NUMERIC_GEAR_STATS = Object.freeze([
  'power', 'defense', 'hp', 'crit', 'haste', 'leech', 'xpBonus', 'goldBonus',
  'skillPower', 'moveSpeed', 'luck',
]);

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
    const position = this.mesh?.position.clone() ?? new THREE.Vector3(0, 0, 6);
    const rotationY = this.mesh?.rotation.y ?? 0;
    const facing = this.facing?.clone() ?? new THREE.Vector3(0, 0, 1);
    this.#dismountCharacter();
    this.#mountCharacter(next);
    if (keepTransform) {
      this.mesh.position.copy(position);
      this.mesh.rotation.y = rotationY;
      this.facing.copy(facing);
    }
    return this.classId;
  }

  #dismountCharacter() {
    if (this.mesh) {
      this.animation?.dispose?.();
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
    this.inventory = [starter];
    this.equipped = { weapon: starter.id, armor: null, charm: null };
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
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.potionCooldown = 0;
    this.skillCooldowns = createEmptySkillCooldowns(this.classId);
    this.castTimer = 0;
    this.hitTimer = 0;
    this.runTime = 0;
    this.attackLunge = 0;
    this.mesh.position.set(0, 0, 6);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.scale.copy(this.normalScale);
    this.velocity.set(0, 0, 0);
    this.knockback.set(0, 0, 0);
    this.facing.set(0, 0, 1);
    this.animation.play('idle', { fade: 0, loop: true, restart: true });
    setMaterialHitPulse(this.mesh, 0);
    this.#updateWeaponVisual();
  }

  get position() { return this.mesh.position; }
  get xpNeeded() { return Math.round(92 + Math.pow(this.level, 1.52) * 58 + this.level * 22); }
  get weapon() { return this.getItem(this.equipped.weapon) ?? this.inventory[0]; }
  get armor() { return this.getItem(this.equipped.armor); }
  get charm() { return this.getItem(this.equipped.charm); }
  get isDashing() { return this.dashTimer > 0; }
  get potionCount() { return this.potions; }

  get equipmentStats() {
    const stats = Object.fromEntries(NUMERIC_GEAR_STATS.map(key => [key, 0]));
    let weaponSpeed = 1;
    for (const item of [this.weapon, this.armor, this.charm]) {
      if (!item) continue;
      for (const key of NUMERIC_GEAR_STATS) stats[key] += Number(item[key]) || 0;
      if (item.slot === 'weapon') weaponSpeed = Number(item.speed) || 1;
    }
    stats.weaponSpeed = weaponSpeed;
    return stats;
  }

  /** Aggregate passive effect ranks for the current class tree. */
  get passiveEffects() {
    const out = {
      attack: 0, hp: 0, defense: 0, skillPower: 0, mpRegen: 0, mpFlat: 0, luck: 0, gold: 0,
    };
    for (const id of getClassSkillIds(this.classId)) {
      const skill = SKILLS[id];
      const rank = this.skills[id] ?? 0;
      if (!skill?.passive || rank <= 0) continue;
      const effect = skill.effect ?? {};
      for (const key of Object.keys(out)) out[key] += (Number(effect[key]) || 0) * rank;
    }
    return out;
  }

  get classMods() {
    return getHeroClass(this.classId).baseStatMods ?? { attack: 1, mp: 1, skillPower: 0 };
  }

  get maxHp() {
    const stats = this.equipmentStats;
    const passive = 1 + this.passiveEffects.hp;
    return Math.round((PLAYER_CONFIG.baseHp + (this.level - 1) * 12 + stats.hp) * passive);
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
    return (PLAYER_CONFIG.baseAttack * (mods.attack ?? 1) + this.level * 2.15 + stats.power) * passive;
  }
  get defense() {
    const stats = this.equipmentStats;
    return (PLAYER_CONFIG.baseDefense + this.level * .82 + stats.defense) * (1 + this.passiveEffects.defense);
  }
  get critChance() { return clamp(PLAYER_CONFIG.baseCrit + this.equipmentStats.crit, 0, .65); }
  get attackSpeed() { return clamp(this.equipmentStats.weaponSpeed * (1 + this.equipmentStats.haste), .65, 1.75); }
  get moveSpeed() { return PLAYER_CONFIG.moveSpeed + this.equipmentStats.moveSpeed; }
  get skillPower() {
    const mods = this.classMods;
    return 1 + this.equipmentStats.skillPower + this.passiveEffects.skillPower + (mods.skillPower ?? 0);
  }
  get leech() { return clamp(this.equipmentStats.leech, 0, .12); }
  get xpBonus() { return this.equipmentStats.xpBonus; }
  get goldBonus() { return this.equipmentStats.goldBonus + this.passiveEffects.gold; }
  get luck() { return this.equipmentStats.luck + this.passiveEffects.luck; }
  get healthRatio() { return clamp(this.hp / Math.max(1, this.maxHp), 0, 1); }
  get manaRatio() { return clamp(this.mp / Math.max(1, this.maxMp), 0, 1); }

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
    this.#updateTimers(delta);
    if (this.alive) {
      this.#regenerate(delta, game);
      this.#move(delta, game.world);
    }
    this.#animate(delta, game);
  }

  #updateTimers(delta) {
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
      const acceleration = this.moveDirection.lengthSq() > .001 ? PLAYER_CONFIG.acceleration : PLAYER_CONFIG.friction;
      this.velocity.lerp(desired, 1 - Math.exp(-acceleration * delta));
      if (this.moveDirection.lengthSq() > .01 && this.attackAnim <= 0 && this.castTimer <= 0) {
        this.facing.lerp(this.moveDirection, 1 - Math.exp(-13 * delta)).normalize();
      }
    }

    this.position.addScaledVector(this.velocity, delta);
    this.position.addScaledVector(this.knockback, delta);
    world.resolvePosition(this.position, .48);
    // Snap yaw hard during attacks so the cut faces body facing / move dir.
    const yawSnap = this.attackAnim > 0 ? 1 - Math.exp(-28 * delta) : 1;
    const targetYaw = Math.atan2(this.facing.x, this.facing.z);
    if (this.attackAnim > 0) {
      let dy = targetYaw - this.mesh.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.mesh.rotation.y += dy * yawSnap;
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
    const style = getHeroClass(this.classId).attackStyle ?? 'melee';
    if (style === 'magic') return 4;
    // Lv1–3: 3 · 4–7: 4 · 8–12: 5 · 13–19: 6 · 20+: 7
    if (this.level >= 20) return 7;
    if (this.level >= 13) return 6;
    if (this.level >= 8) return 5;
    if (this.level >= 4) return 4;
    return 3;
  }

  tryAttack(game) {
    if (this.attackCooldown > 0 || this.isDashing || this.castTimer > 0 || !this.alive) return false;
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
    // Melee: attack_1..7 when baked. Magic: prefer cast_1..4 staff poses.
    const style = getHeroClass(this.classId).attackStyle ?? 'melee';
    let animName;
    if (style === 'magic') {
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
    if ((this.skillCooldowns[skillId] ?? 0) > 0 || this.mp < skill.mp || this.isDashing || !this.alive) return false;
    this.alignCombatFacing();
    this.mp -= skill.mp;
    this.skillCooldowns[skillId] = skill.cooldown;
    this.castTimer = skill.castTime ?? .3;
    this.attackAnimDuration = this.castTimer;
    this.attackAnim = this.castTimer;
    let anim = skill.anim ?? `skill_${skillId}`;
    // Graceful fallback if unique wizard clip not yet in GLB.
    if (!this.animation.has(anim)) {
      const fallbacks = {
        skill_fireball: 'skill_crescent',
        skill_frost_nova: 'skill_whirlwind',
        skill_blink: 'skill_skyfall',
        skill_meteor: 'skill_starburst',
        cast_1: 'attack_1',
        cast_2: 'attack_2',
        cast_3: 'attack_3',
        cast_4: 'attack_4',
      };
      anim = fallbacks[anim] ?? (this.animation.has('skill_whirlwind') ? 'skill_whirlwind' : 'idle');
    }
    this.animation.playOneShot(anim, {
      fade: .09, fadeOut: .13,
      timeScale: (skill.castTime ?? .3) > .6 ? .92 : 1.05,
      fallback: 'idle',
    });
    if (typeof game.audio.skill === 'function') {
      game.audio.skill(skill.sfx ?? skill.theme ?? 'skill');
    }
    const hits = skill.timeline?.hits;
    if (Array.isArray(hits) && hits.length && this.animation.oneShot) {
      // Pose-synced skill phases — combat fires on normalized clip times.
      for (let i = 0; i < hits.length; i += 1) {
        const phase = i;
        this.animation.scheduleNormalized(hits[i], () => {
          if (!this.alive) return;
          game.combat.usePlayerSkill(skillId, this, rank, phase);
        }, Symbol(`${skillId}-phase-${phase}`));
      }
    } else {
      game.combat.usePlayerSkill(skillId, this, rank, null);
    }
    return true;
  }

  usePotion(game) {
    if (this.potionCooldown > 0 || this.potions <= 0 || this.hp >= this.maxHp || !this.alive) return false;
    this.potions -= 1;
    this.potionCooldown = 2;
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
    const amount = Math.max(1, Math.round(rawAmount - this.defense * .46));
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerable = .46;
    this.hitTimer = .19;
    if (knockback) this.knockback.add(knockback);
    if (this.hp <= 0) {
      this.alive = false;
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
    if (!item?.id || !item.slot) return { added: false, reason: 'invalid' };
    if (this.inventory.length >= PLAYER_CONFIG.inventoryLimit) return { added: false, reason: 'full' };
    this.inventory.push(item);
    const current = this.getItem(this.equipped[item.slot]);
    const autoEquip = !current || (item.score ?? 0) > (current.score ?? 0) * 1.08;
    if (autoEquip) this.equip(item.id);
    return { added: true, equipped: autoEquip };
  }

  equip(itemId) {
    const item = this.getItem(itemId);
    if (!item || !['weapon', 'armor', 'charm'].includes(item.slot)) return false;
    this.equipped[item.slot] = item.id;
    this.hp = Math.min(this.hp, this.maxHp);
    this.mp = Math.min(this.mp, this.maxMp);
    if (item.slot === 'weapon') this.#updateWeaponVisual();
    return true;
  }

  salvage(itemId) {
    const item = this.getItem(itemId);
    if (!item || item.locked || this.equipped[item.slot] === itemId) return 0;
    const rarity = RARITIES[item.rarity] ?? RARITIES.common;
    const value = Math.max(2, Math.round((item.itemLevel + (item.score ?? 0) * .35) * rarity.salvage));
    this.inventory = this.inventory.filter(entry => entry.id !== itemId);
    this.gold += value;
    this.essence += item.rarity === 'epic' ? 2 : item.rarity === 'legendary' ? 5 : item.rarity === 'rare' ? 1 : 0;
    return value;
  }

  upgradeSkill(skillId) {
    const skill = SKILLS[skillId];
    if (!skill || this.level < skill.unlockLevel || this.skillPoints <= 0) return false;
    const current = this.skillRank(skillId);
    if (current >= skill.maxRank) return false;
    this.skills[skillId] = current + 1;
    this.skillPoints -= 1;
    this.hp = Math.min(this.hp, this.maxHp);
    return true;
  }

  cooldownRatio(skillId) {
    if (skillId === 'dash') return this.dashCooldown / PLAYER_CONFIG.dashCooldown;
    if (skillId === 'potion') return this.potionCooldown / 2;
    const skill = SKILLS[skillId];
    return skill ? this.skillCooldowns[skillId] / skill.cooldown : 0;
  }

  #updateWeaponVisual() {
    const rarity = RARITIES[this.weapon?.rarity] ?? RARITIES.common;
    this.characterFactory.equipWeapon(this.refs, { ...this.weapon, rarityColor: rarity.color });
  }

  dispose() {
    this.#dismountCharacter();
  }

  serialize() {
    return {
      classId: this.classId,
      name: this.name,
      level: this.level,
      xp: this.xp,
      gold: this.gold,
      essence: this.essence,
      skillPoints: this.skillPoints,
      skills: { ...this.skills },
      inventory: this.inventory.map(item => ({ ...item, affixes: [...(item.affixes ?? [])] })),
      equipped: { ...this.equipped },
      potions: this.potions,
      maxPotions: this.maxPotions,
      hp: this.hp,
      mp: this.mp,
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
    this.essence = Math.max(0, Number(state.essence) || 0);
    this.skillPoints = Math.max(0, Number(state.skillPoints) || 0);
    // Only merge ranks for this class tree (ignore leftover hunter keys on a wizard save, etc.).
    const ranks = createEmptySkillRanks(classId);
    const incoming = state.skills ?? {};
    for (const id of getClassSkillIds(classId)) {
      if (incoming[id] != null) ranks[id] = Math.max(0, Number(incoming[id]) || 0);
    }
    this.skills = ranks;
    const loadedInventory = Array.isArray(state.inventory) ? state.inventory.filter(item => item?.id && item?.slot) : [];
    if (!loadedInventory.some(item => item.id === starter.id)) loadedInventory.unshift(starter);
    this.inventory = loadedInventory.length ? loadedInventory.slice(0, PLAYER_CONFIG.inventoryLimit) : [starter];
    this.equipped = { weapon: starter.id, armor: null, charm: null, ...(state.equipped ?? {}) };
    for (const slot of ['weapon', 'armor', 'charm']) {
      const item = this.getItem(this.equipped[slot]);
      if (!item || item.slot !== slot) this.equipped[slot] = slot === 'weapon' ? starter.id : null;
    }
    this.potions = clamp(Number(state.potions) || 0, 0, Number(state.maxPotions) || 5);
    this.maxPotions = Math.max(5, Number(state.maxPotions) || 5);
    const position = Array.isArray(state.position) ? state.position : [0, 0, 6];
    this.position.set(Number(position[0]) || 0, 0, Number(position[2]) || 6);
    if (world) world.resolvePosition(this.position, .48);
    this.hp = clamp(Number(state.hp) || this.maxHp, 1, this.maxHp);
    this.mp = clamp(Number(state.mp) || this.maxMp, 0, this.maxMp);
    this.alive = true;
    this.#updateWeaponVisual();
  }
}
