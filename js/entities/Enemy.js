import * as THREE from 'three';
import { DEFENSE_CONFIG, GAME_CONFIG } from '../config.js';
import { clamp, rand, uid } from '../core/Utils.js';
import { applyStatus, statusMoveMul, tickStatuses } from '../data/skillCombat.js';
import { setMaterialHitPulse } from '../graphics/StylizedMaterial.js';

const UP = new THREE.Vector3(0, 1, 0);
const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();

export class Enemy {
  constructor(scene, data, position, options = {}, monsterFactory, quality = 'medium') {
    this.scene = scene;
    this.data = data;
    this.id = uid('enemy');
    this.typeId = data.id;
    this.elite = Boolean(options.elite) && !data.boss;
    this.boss = Boolean(data.boss);
    this.level = Math.max(1, Math.round(options.level ?? data.level));
    this.monsterFactory = monsterFactory;
    const monster = monsterFactory.create(data, { elite: this.elite, boss: this.boss, quality });
    this.refs = monster.refs;
    this.animation = monster.animation;
    this.mesh = monster.group;
    this.mesh.position.copy(position);
    this.mesh.userData.enemy = this;
    this.scene.add(this.mesh);
    this.normalScale = this.mesh.scale.clone();

    const extraLevels = Math.max(-4, this.level - data.level);
    const levelScale = Math.max(.72, 1 + extraLevels * .092);
    const tierScale = 1 + Math.max(0, (options.worldTier ?? 1) - 1) * .075;
    const eliteHp = this.elite ? 2.45 : 1;
    const eliteDamage = this.elite ? 1.32 : 1;
    const eliteDefense = this.elite ? 1.28 : 1;
    // Wave mult only when Defense (or other callers) pass a positive options.wave.
    // Hunt spawns omit wave → multipliers stay 1 (byte-for-byte with prior Hunt math).
    const wave = Math.max(0, Number(options.wave) || 0);
    const waveHp = wave > 0 ? 1 + (wave - 1) * DEFENSE_CONFIG.hpPerWave : 1;
    const waveDmg = wave > 0 ? 1 + (wave - 1) * DEFENSE_CONFIG.dmgPerWave : 1;
    this.defenseWave = wave > 0 || Boolean(options.defenseWave);
    this.maxHp = Math.round(data.hp * levelScale * tierScale * eliteHp * waveHp);
    this.hp = this.maxHp;
    this.damage = data.damage * (1 + extraLevels * .055) * Math.sqrt(tierScale) * eliteDamage * waveDmg;
    this.defense = data.defense * (1 + extraLevels * .045) * eliteDefense;
    this.speed = data.speed * (this.elite ? 1.08 : 1);
    this.attackRange = data.range;
    this.radius = (this.boss ? 1.25 : this.elite ? .78 : .58) * (data.scale ?? 1);
    this.aggroRadius = this.boss ? 42 : data.ranged ? 29 : 25;
    this.xpValue = Math.round(data.xp * levelScale * (this.elite ? 2.65 : 1));
    this.goldRange = data.gold;

    this.alive = true;
    this.removable = false;
    this.deathHandled = false;
    this.deathTimer = 0;
    this.hitTimer = 0;
    this.invulnerable = 0;
    this.attackCooldown = rand(.35, 1.15);
    this.specialCooldown = rand(2.6, 5.2);
    this.wanderTimer = 0;
    this.wanderDirection = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize();
    this.velocity = new THREE.Vector3();
    this.knockback = new THREE.Vector3();
    this.facing = new THREE.Vector3(0, 0, 1);
    this.spawnPoint = position.clone();
    this.animTime = rand(0, 10);
    this.attackPulse = 0;
    this.state = 'idle';
    this.stateTimer = 0;
    this.strafeSign = Math.random() < .5 ? -1 : 1;
    this.lastHitAt = -999;
    this.enraged = false;
    /** @type {Record<string, { id: string, remaining: number, power?: number, dps?: number, tick?: number, tickAcc?: number }>} */
    this.statuses = {};

    this.#setHealthBar(1);
  }

  get position() { return this.mesh.position; }
  get healthRatio() { return clamp(this.hp / Math.max(1, this.maxHp), 0, 1); }
  get displayName() { return `${this.elite ? 'Elite ' : ''}${this.data.name}`; }

  update(delta, game) {
    this.animTime += delta;
    this.hitTimer = Math.max(0, this.hitTimer - delta);
    this.invulnerable = Math.max(0, this.invulnerable - delta);
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.specialCooldown = Math.max(0, this.specialCooldown - delta);
    this.stateTimer = Math.max(0, this.stateTimer - delta);
    this.knockback.multiplyScalar(Math.pow(.012, delta));

    if (!this.alive) {
      this.#updateDeath(delta, game);
      return;
    }

    this.#tickStatuses(delta, game);

    const player = game.player;
    const toPlayer = TMP_A.copy(player.position).sub(this.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();
    // Hunt hub is a safe zone; Defense arena is not — waves must always engage.
    const playerSafe = game.mode !== 'defense'
      && Math.hypot(player.position.x, player.position.z) < GAME_CONFIG.campRadius;
    const engaged = player.alive && !playerSafe && (distance < this.aggroRadius || this.boss || this.hitTimer > 0 || this.defenseWave);

    if (engaged) {
      this.#combatAI(delta, game, toPlayer, distance);
    } else {
      this.#wander(delta, game.world);
    }

    this.position.addScaledVector(this.knockback, delta);
    this.#keepOutOfCamp();
    game.world.resolvePosition(this.position, this.radius);
    this.#animate(delta, game.elapsed, distance);
    this.#updateBillboard(game.camera);
  }

  #combatAI(delta, game, toPlayer, distance) {
    if (distance > .001) this.facing.lerp(toPlayer.normalize(), 1 - Math.exp(-10 * delta)).normalize();
    const ai = this.data.ai;

    // Recovery frames after attacks / hitstun — then re-engage.
    if (this.state === 'attacking' || this.state === 'casting' || this.state === 'hit') {
      this.#brake(delta, this.state === 'hit' ? 1.6 : .82);
      if (this.stateTimer <= 0) this.state = 'idle';
      return;
    }

    if (ai === 'ranged' || ai === 'caster') {
      const ideal = ai === 'caster' ? Math.min(9.2, this.attackRange * .76) : Math.min(7.5, this.attackRange * .72);
      if (distance < ideal * .65) {
        this.#move(TMP_B.copy(this.facing).multiplyScalar(-1), delta, 1.05, game.world);
      } else if (distance > ideal * 1.2) {
        this.#move(this.facing, delta, .86, game.world);
      } else {
        TMP_B.set(-this.facing.z * this.strafeSign, 0, this.facing.x * this.strafeSign);
        this.#move(TMP_B, delta, .58, game.world);
      }
      if (this.attackCooldown <= 0 && distance <= this.attackRange * 1.14) {
        this.state = 'casting';
        this.stateTimer = ai === 'caster' ? .78 : .58;
        this.attackCooldown = ai === 'caster' ? rand(2.2, 3.15) : rand(1.55, 2.35);
        this.#playAnimation('cast', ai === 'caster' ? .92 : 1.08);
        game.combat.enemyProjectile(this, { caster: ai === 'caster', count: ai === 'caster' && (this.elite || this.boss) ? 3 : 1 });
      }
      return;
    }

    if (ai === 'charge') {
      if (this.specialCooldown <= 0 && distance > 3.2 && distance < 13.5) {
        this.state = 'attacking';
        this.stateTimer = 1.05;
        this.specialCooldown = rand(4.8, 6.4);
        this.#playAnimation('special', 1.05);
        game.combat.enemyCharge(this);
      } else if (distance > this.attackRange * .88) {
        this.#move(this.facing, delta, 1.08, game.world);
      } else this.#tryMelee(game, distance, 1.1);
      return;
    }

    if (ai === 'leap') {
      if (this.specialCooldown <= 0 && distance < 12) {
        this.state = 'attacking';
        this.stateTimer = 1.2;
        this.specialCooldown = rand(5.4, 7.1);
        this.#playAnimation('special', .96);
        game.combat.enemyLeap(this);
      } else if (distance > this.attackRange * .9) {
        this.#move(this.facing, delta, .82, game.world);
      } else this.#tryMelee(game, distance, 1.2);
      return;
    }

    if (ai === 'boss') {
      if (!this.enraged && this.healthRatio < .42) {
        this.enraged = true;
        this.speed *= 1.14;
        this.damage *= 1.12;
        game.effects.pillar(this.position, this.data.accent, 7, { life: .72, bottom: 1.4 });
        game.effects.burst(this.position, this.data.accent, 34, { speed: 5.8, size: .42, life: .85 });
        game.ui.notify(`${this.data.name} has enraged!`, 'boss');
      }
      if (this.specialCooldown <= 0) {
        this.state = 'casting';
        this.stateTimer = 1.65;
        this.specialCooldown = this.enraged ? rand(4.1, 5.4) : rand(5.8, 7.3);
        this.#playAnimation('special', this.enraged ? 1.12 : .95);
        game.combat.enemyBossSpecial(this);
      } else if (distance > this.attackRange * .82) {
        this.#move(this.facing, delta, this.enraged ? 1.08 : .92, game.world);
      } else this.#tryMelee(game, distance, 1.4);
      return;
    }

    if (ai === 'skirmish') {
      if (distance > 4.1) this.#move(this.facing, delta, 1.12, game.world);
      else if (distance < 2.1) this.#move(TMP_B.copy(this.facing).multiplyScalar(-1), delta, 1.18, game.world);
      else {
        TMP_B.set(-this.facing.z * this.strafeSign, 0, this.facing.x * this.strafeSign);
        this.#move(TMP_B, delta, .95, game.world);
      }
      if (this.attackCooldown <= 0 && distance < Math.max(2.8, this.attackRange * 1.35)) this.#tryMelee(game, distance, .95);
      return;
    }

    const speedFactor = ai === 'pack' ? 1.12 : ai === 'swarm' ? 1.05 : ai === 'tank' ? .76 : 1;
    if (distance > this.attackRange * .82) this.#move(this.facing, delta, speedFactor, game.world);
    else this.#tryMelee(game, distance, ai === 'tank' ? 1.35 : 1);
  }

  #tryMelee(game, distance, power = 1) {
    if (this.attackCooldown > 0 || distance > this.attackRange * 1.28 + .7) {
      this.#brake(game.delta ?? .016, .7);
      return;
    }
    this.state = 'attacking';
    this.stateTimer = this.boss ? .82 : .58;
    this.attackPulse = 1;
    this.attackCooldown = this.boss ? rand(1.35, 1.75) : rand(1.05, 1.6);
    this.#playAnimation('attack', this.boss ? .88 : 1.08);
    game.combat.enemyMelee(this, { power, wide: this.boss || this.elite });
  }

  applyStatus(id, opts = {}, game = null) {
    this.statuses = applyStatus(this.statuses, id, opts);
    if (game?.effects) {
      if (id === 'slow') {
        game.effects.trail(this.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x7ad8ff, 0.4, 0.4);
        game.effects.groundDecal?.(this.position, 0xa8ecff, this.radius * 1.6, { life: 0.5, opacity: 0.35 });
      } else if (id === 'burn') {
        game.effects.trail(this.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff7a42, 0.38, 0.35);
      } else if (id === 'bleed') {
        game.effects.trail(this.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x4de8b8, 0.34, 0.3);
      } else if (id === 'expose') {
        game.effects.trail(this.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xc6f1ff, 0.3, 0.3);
      }
    }
  }

  #tickStatuses(delta, game) {
    const result = tickStatuses(this.statuses, delta);
    this.statuses = result.statuses;
    if (result.dotDamage > 0 && this.alive) {
      const dotPower = 1 + (game?.player?.passiveEffects?.dotPower ?? 0);
      const amount = Math.max(1, Math.round(result.dotDamage * dotPower * Math.max(8, this.maxHp * 0.02)));
      // Direct DoT tick (burn/bleed) — bypass short i-frames so multi-hit DoT lands.
      const prevInvuln = this.invulnerable;
      this.invulnerable = 0;
      const dmg = this.takeDamage(amount, game, { multiHit: true, knockback: 0 });
      this.invulnerable = Math.min(prevInvuln, this.invulnerable);
      if (dmg.amount > 0) {
        game.ui?.floatText?.(
          this.position.clone().add(new THREE.Vector3(0, this.refs.modelHeight * 0.55, 0)),
          `${dmg.amount}`,
          'damage',
        );
        game.effects?.trail?.(this.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff9040, 0.28, 0.22);
      }
    }
    if (this.statuses.burn && Math.random() < delta * 4) {
      game.effects?.burst?.(this.position.clone().add(new THREE.Vector3(0, 0.9, 0)), 0xff7a42, 3, {
        speed: 1.6, size: 0.16, life: 0.28, upward: 0.5,
      });
    }
    if (this.statuses.slow && Math.random() < delta * 3) {
      game.effects?.trail?.(this.position.clone().add(new THREE.Vector3(0, 0.7, 0)), 0xa8ecff, 0.18, 0.2);
    }
  }

  #move(direction, delta, factor, world) {
    const slowMul = statusMoveMul(this.statuses);
    const desired = TMP_B.copy(direction).normalize().multiplyScalar(this.speed * factor * slowMul);
    this.velocity.lerp(desired, 1 - Math.exp(-7.5 * delta));
    this.position.addScaledVector(this.velocity, delta);
    world.resolvePosition(this.position, this.radius);
  }

  #brake(delta, amount = 1) {
    this.velocity.multiplyScalar(Math.pow(.03, delta * amount));
  }

  #wander(delta, world) {
    this.state = 'idle';
    this.wanderTimer -= delta;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = rand(1.4, 4.4);
      const back = this.spawnPoint.clone().sub(this.position).setY(0);
      if (back.lengthSq() > 100) this.wanderDirection.copy(back.normalize());
      else this.wanderDirection.set(rand(-1, 1), 0, rand(-1, 1)).normalize();
    }
    if (Math.sin(this.animTime * .43 + this.level) > -.45) {
      this.facing.lerp(this.wanderDirection, 1 - Math.exp(-3.5 * delta)).normalize();
      this.#move(this.facing, delta, .25, world);
    } else this.#brake(delta, 1.4);
  }

  #keepOutOfCamp() {
    const distance = Math.hypot(this.position.x, this.position.z);
    const min = GAME_CONFIG.campRadius + this.radius + 1.2;
    if (distance > 0.001 && distance < min) {
      this.position.x *= min / distance;
      this.position.z *= min / distance;
    }
  }

  #playAnimation(name, timeScale = 1) {
    if (!this.animation?.has(name)) return;
    if (this.animation.oneShot?.name === name && this.animation.oneShot.elapsed < this.animation.oneShot.duration * .68) return;
    this.animation.playOneShot(name, { fade: .09, fadeOut: .12, timeScale, fallback: 'idle' });
  }

  #animate(delta, elapsed, playerDistance) {
    const speed = this.velocity.length();
    this.animation.setLocomotion(speed, { sprint: speed > this.speed * 1.12 });
    this.animation.update(delta, { distance: playerDistance, visible: this.mesh.visible });
    const statusPulse = this.statuses.burn ? 0.35 : this.statuses.slow ? 0.2 : 0;
    setMaterialHitPulse(this.mesh, Math.max(
      this.hitTimer > 0 ? Math.min(1, this.hitTimer / .15) : 0,
      statusPulse,
    ));
    const targetYaw = Math.atan2(this.facing.x, this.facing.z);
    let difference = targetYaw - this.mesh.rotation.y;
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));
    this.mesh.rotation.y += difference * Math.min(1, delta * (this.boss ? 5 : 9));
    this.refs.healthGroup.visible = this.boss || this.elite || this.healthRatio < .995 || playerDistance < 8;
    this.#setHealthBar(this.healthRatio);
  }

  #updateBillboard(camera) {
    if (!this.refs.healthGroup.visible) return;
    camera.getWorldQuaternion(this.refs.healthGroup.quaternion);
    const parentWorld = this.mesh.getWorldQuaternion(new THREE.Quaternion());
    this.refs.healthGroup.quaternion.premultiply(parentWorld.invert());
  }

  #setHealthBar(ratio) {
    const width = this.refs.healthWidth;
    this.refs.healthFill.scale.x = Math.max(.001, width * ratio);
    this.refs.healthFill.position.x = -(width - width * ratio) * .5;
    this.refs.healthFill.material.color.setHex(ratio < .25 ? 0xff355f : this.elite ? 0xffbf55 : 0xff5f73);
  }

  takeDamage(rawAmount, game, options = {}) {
    if (!this.alive || this.invulnerable > 0) return { amount: 0, killed: false };
    const armorPierce = clamp(options.armorPierce ?? 0, 0, .85);
    const reduction = this.defense * .37 * (1 - armorPierce);
    const amount = Math.max(1, Math.round(rawAmount - reduction));
    this.hp = Math.max(0, this.hp - amount);
    this.hitTimer = .28;
    this.#playAnimation('hit', 1.35);
    this.invulnerable = options.multiHit ? .045 : .09;
    this.lastHitAt = game.elapsed;
    if (options.direction) {
      const force = (options.knockback ?? (this.boss ? .9 : this.elite ? 1.8 : 2.6)) * (this.boss ? .72 : 1);
      this.knockback.addScaledVector(options.direction, force);
    }
    // Brief hitstun so the body "eats" the hit (bosses only flinch slightly).
    this.state = 'hit';
    this.stateTimer = Math.max(this.stateTimer, this.boss ? .06 : .16);
    this.#setHealthBar(this.healthRatio);
    if (this.hp <= 0) this.#die(game, options.direction);
    return { amount, killed: !this.alive };
  }

  #die(game, direction = null) {
    if (!this.alive) return;
    this.alive = false;
    this.deathTimer = this.boss ? 1.45 : .78;
    this.refs.healthGroup.visible = false;
    this.velocity.set(0, 0, 0);
    this.animation.playOneShot('death', { fade: .10, fadeOut: .18, timeScale: this.boss ? .82 : 1.06, fallback: null });
    if (direction) this.knockback.addScaledVector(direction, this.boss ? 2.2 : 4.8);
    game.onEnemyKilled(this);
  }

  #updateDeath(delta, game) {
    this.deathTimer -= delta;
    const duration = this.boss ? 1.45 : .78;
    const t = clamp(this.deathTimer / duration, 0, 1);
    this.position.addScaledVector(this.knockback, delta);
    game.world.resolvePosition(this.position, this.radius);
    this.animation.update(delta, { distance: game.camera.position.distanceTo(this.position), visible: this.mesh.visible });
    setMaterialHitPulse(this.mesh, 0);
    const collapse = this.boss ? THREE.MathUtils.lerp(.72, 1, t) : THREE.MathUtils.lerp(.22, 1, t);
    this.mesh.scale.copy(this.normalScale).multiplyScalar(collapse);
    this.mesh.position.y += (1 - t) * delta * (this.boss ? .25 : .55);
    this.mesh.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material || !('opacity' in material) || material === this.refs.healthFill?.material) continue;
        if (material.transparent) material.opacity = Math.min(material.opacity, Math.max(.04, t));
      }
    });
    if (this.deathTimer <= 0) {
      this.removable = true;
      this.monsterFactory?.outlines?.unregister(this.mesh);
      this.animation.dispose();
      this.scene.remove(this.mesh);
    }
  }

  forceRemove() {
    if (this.removable) return;
    this.removable = true;
    this.monsterFactory?.outlines?.unregister(this.mesh);
    this.animation?.dispose();
    this.scene.remove(this.mesh);
  }
}
