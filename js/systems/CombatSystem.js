import * as THREE from 'three';
import { SKILLS, getHeroClass } from '../data/content.js';
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
    this.projectileGeometry = new THREE.OctahedronGeometry(.28, 1);
    this.waveGeometry = new THREE.BoxGeometry(1.25, .18, .45);
    this.enemyOrbGeometry = new THREE.SphereGeometry(.25, 10, 8);
    this.orbGeometry = new THREE.SphereGeometry(.22, 12, 10);
    /** effect id → handler (class skills register here) */
    this.skillHandlers = {
      whirlwind: (p, r) => this.#whirlwind(p, r),
      crescent: (p, r) => this.#crescent(p, r),
      skyfall: (p, r) => this.#skyfall(p, r),
      starburst: (p, r) => this.#starburst(p, r),
      fireball: (p, r) => this.#fireball(p, r),
      frost_nova: (p, r) => this.#frostNova(p, r),
      arcane_blink: (p, r) => this.#arcaneBlink(p, r),
      meteor_storm: (p, r) => this.#meteorStorm(p, r),
    };
  }

  playerAttack(player, combo) {
    const style = getHeroClass(player.classId).attackStyle ?? 'melee';
    if (style === 'magic') this.#magicAttack(player, combo);
    else this.#meleeAttack(player, combo);
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

  #meleeAttack(player, combo) {
    const direction = this.#facingDir(player);
    const finisher = combo === 3;
    const color = player.weapon?.rarityColor ?? 0xeef8ff;
    this.game.effects.dust(player.position, 0xd7dbc4, finisher ? 12 : 6 + combo, finisher ? .4 : .28);
    this.game.effects.trail(
      player.position.clone().add(new THREE.Vector3(0, 1.05, 0)).addScaledVector(direction, .55),
      color, finisher ? .62 : .36, finisher ? .22 : .12,
    );

    const delay = finisher ? .072 : .022 + combo * .006;
    this.#delay(delay, () => {
      if (!player.alive) return;
      const range = (finisher ? 3.35 : 2.85) + combo * .18;
      const arc = finisher ? Math.PI * 1.08 : Math.PI * (.62 + combo * .04);
      const multiplier = [0.9, 1.0, 1.12, 1.55][combo] ?? .9;
      const hitOrigin = player.position.clone().addScaledVector(direction, .35);

      this.game.effects.swingArc(hitOrigin, direction, color, range * (finisher ? 1.32 : 1.18), {
        heavy: finisher || combo >= 2,
        height: finisher ? 1.25 : 1.05,
        spin: combo % 2 ? -2.8 : 2.6,
        angleOffset: combo % 2 ? .55 : -.48,
      });
      if (finisher) {
        this.game.effects.ring(player.position, color, 3.2, { life: .34, startScale: .12, height: .1, opacity: .7 });
        this.game.effects.ring(player.position, 0xffffff, 2.0, { life: .2, startScale: .2, height: .14, opacity: .85 });
        this.game.effects.pillar(
          player.position.clone().addScaledVector(direction, 1.1),
          color, 4.8, { life: .36, bottom: .7, opacity: .45 },
        );
        this.game.effects.burst(
          player.position.clone().add(new THREE.Vector3(0, 1, 0)).addScaledVector(direction, 1.25),
          color, 22, { speed: 6.2, size: .34, life: .45, upward: .3 },
        );
        this.game.effects.dust(player.position, 0xc9c8b4, 16, .45);
      }

      this.#hitEnemiesInCone(hitOrigin, direction, range, arc, player.attackPower * multiplier, {
        knockback: finisher ? 6.4 : 2.2 + combo * .55,
        criticalBonus: finisher ? .12 : combo * .02,
        combo,
        finisher,
      });
    });
  }

  /** Staff basic attack — ranged mana bolts (combo builds into a multi-orb finisher). */
  #magicAttack(player, combo) {
    // Capture facing at cast time so delayed bolts don't inherit a later turn/mouse aim.
    const direction = this.#facingDir(player);
    const finisher = combo === 3;
    const color = player.weapon?.rarityColor ?? 0xc8b4ff;
    const origin = player.position.clone().add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(direction, .7);
    this.game.effects.trail(origin, color, finisher ? .7 : .4, .16);
    this.game.effects.burst(origin, color, finisher ? 14 : 6 + combo * 2, {
      speed: 3.2, size: .22, life: .32, upward: .2,
    });

    const bolts = finisher ? 5 : 1;
    const baseDamage = player.attackPower * ([.95, 1.05, 1.15, 1.45][combo] ?? 1) * player.skillPower;
    const baseYaw = Math.atan2(direction.x, direction.z);
    for (let i = 0; i < bolts; i += 1) {
      this.#delay(finisher ? i * .05 : .03, () => {
        if (!player.alive) return;
        const spread = finisher ? (i - 2) * .12 : 0;
        const dir = new THREE.Vector3(Math.sin(baseYaw + spread), 0, Math.cos(baseYaw + spread));
        const start = player.position.clone().add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(dir, .65);
        this.#spawnFriendlyOrb(start, dir, {
          color: finisher && i === 2 ? 0xf0e0ff : color,
          damage: baseDamage * (finisher ? .42 : 1),
          speed: finisher ? 14 + i : 15.5,
          radius: finisher ? 1.05 : .9,
          life: 1.2,
          pierce: finisher ? 2 : 1,
          knockback: finisher ? 3.8 : 2.2,
          skill: false,
        });
      });
    }
    if (finisher) {
      this.game.effects.ring(player.position, color, 2.6, { life: .35, startScale: .15, height: .12 });
      this.game.effects.pillar(player.position, 0xb06dff, 3.5, { life: .28, bottom: .45, opacity: .35 });
    }
  }

  usePlayerSkill(skillId, player, rank) {
    const skill = SKILLS[skillId];
    const effectId = skill?.effect ?? skillId;
    const handler = this.skillHandlers[effectId];
    if (handler) handler(player, rank);
  }

  #spawnFriendlyOrb(start, direction, options = {}) {
    const color = options.color ?? 0xc8b4ff;
    const material = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: .92, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.orbGeometry, material);
    mesh.position.copy(start);
    mesh.scale.setScalar(options.scale ?? 1.15);
    this.game.scene.add(mesh);
    this.projectiles.push({
      mesh, material, friendly: true,
      velocity: direction.clone().normalize().multiplyScalar(options.speed ?? 15),
      damage: options.damage ?? 10,
      radius: options.radius ?? .9,
      life: options.life ?? 1.25,
      pierce: options.pierce ?? 1,
      hit: new Set(),
      wave: false,
      color,
      direction: direction.clone().normalize(),
      knockback: options.knockback ?? 2.5,
      skill: Boolean(options.skill),
      explode: options.explode ?? null,
    });
  }

  #whirlwind(player, rank) {
    const radius = 4.1 + rank * .18;
    const color = 0x8feaff;
    player.invulnerable = Math.max(player.invulnerable, .34);
    for (let hit = 0; hit < 3; hit += 1) {
      this.#delay(.06 + hit * .15, () => {
        if (!player.alive) return;
        this.game.effects.ring(player.position, color, radius * (.78 + hit * .11), { life: .36, startScale: .35 });
        this.game.effects.slash(player.position, player.facing, hit === 2 ? 0xf4ffff : color, radius * .98, {
          arc: Math.PI * 2, height: .72 + hit * .28, thickness: .065 + hit * .012,
          life: .28, spin: 5.2 + hit,
        });
        this.#hitEnemiesInRadius(player.position, radius, player.attackPower * (.46 + rank * .055), {
          knockback: hit === 2 ? 4.8 : 1.2, multiHit: true, criticalBonus: .03, skill: true,
        });
        this.game.effects.burst(player.position.clone().add(new THREE.Vector3(0, 1, 0)), color, 10 + hit * 4, {
          speed: 4 + hit, size: .26, life: .36, upward: .35,
        });
      });
    }
  }

  #crescent(player, rank) {
    const direction = this.#facingDir(player);
    const start = player.position.clone().addScaledVector(direction, 1.2);
    start.y += 1;
    const material = new THREE.MeshBasicMaterial({
      color: 0x8fd8ff, transparent: true, opacity: .9, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.waveGeometry, material);
    mesh.position.copy(start);
    mesh.rotation.y = Math.atan2(direction.x, direction.z);
    mesh.scale.set(1.25 + rank * .08, 1.2, 1.15);
    this.game.scene.add(mesh);
    this.projectiles.push({
      mesh, material, friendly: true, velocity: direction.clone().multiplyScalar(16.5 + rank * .5),
      damage: player.attackPower * (1.5 + rank * .22), radius: 1.25,
      life: 1.35, pierce: 3 + rank, hit: new Set(), wave: true, color: 0x8fd8ff,
      direction: direction.clone(), knockback: 4.2, skill: true,
    });
    this.game.effects.slash(player.position, direction, 0xc6f1ff, 3.4, { arc: Math.PI * .9, height: 1, life: .32 });
  }

  #skyfall(player, rank) {
    const target = this.#aimAlongFacing(player, 10.5);
    const from = player.position.clone();
    const radius = 4.5 + rank * .22;
    this.#telegraphCircle(target, radius, .46, 0x9eeeff, () => {
      if (!player.alive) return;
      this.game.effects.trail(player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x9eeeff, 1.15, .42);
      player.position.copy(target);
      this.game.world.resolvePosition(player.position, .48);
      player.invulnerable = Math.max(player.invulnerable, .55);
      this.game.effects.pillar(target, 0xdaf9ff, 8, { life: .72, bottom: 1.25 });
      this.game.effects.ring(target, 0x8edfff, radius, { life: .62, startScale: .08 });
      this.game.effects.burst(target, 0xbbefff, 28, { speed: 6.2, upward: .6, size: .38, life: .82 });
      this.#hitEnemiesInRadius(target, radius, player.attackPower * (1.85 + rank * .28), {
        knockback: 7.2, armorPierce: .25, criticalBonus: .06, skill: true,
      });
      this.game.effects.impact(target.clone().add(new THREE.Vector3(0, 1.1, 0)), 0x9eeeff, 'heavy');
    }, { fillOpacity: .12 });
  }

  #starburst(player, rank) {
    const center = this.#aimAlongFacing(player, 9.5);
    const hits = 6 + rank;
    const color = 0xe2b7ff;
    for (let i = 0; i < hits; i += 1) {
      const angle = (i / hits) * Math.PI * 2 + rand(-.25, .25);
      const radius = i === 0 ? 0 : rand(1.4, 5.3);
      const point = center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      point.y = this.game.world.heightAt(point.x, point.z);
      this.#delay(.12 + i * .105, () => {
        this.#telegraphCircle(point, 1.65 + rank * .07, .28, color, () => {
          this.game.effects.pillar(point, i % 2 ? 0xb98cff : 0xf3d6ff, 6.2, { life: .48, bottom: .68 });
          this.game.effects.burst(point, color, 12, { speed: 4.8, size: .3, life: .55 });
          this.#hitEnemiesInRadius(point, 1.8 + rank * .08, player.attackPower * (.63 + rank * .06), {
            knockback: 2.5, multiHit: true, armorPierce: .2, skill: true,
          });
        }, { fillOpacity: .12 });
      });
    }
    this.#delay(.24 + hits * .105, () => {
      this.game.effects.ring(center, 0xffffff, 6.4, { life: .75, startScale: .05 });
      this.#hitEnemiesInRadius(center, 5.8, player.attackPower * (.95 + rank * .1), {
        knockback: 6.2, multiHit: true, armorPierce: .35, skill: true,
      });
      this.game.effects.impact(center.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xe2b7ff, 'finisher');
      this.game.effects.pillar(center, 0xf3d6ff, 7.5, { life: .55, bottom: 1.1, opacity: .5 });
    });
  }

  #fireball(player, rank) {
    const direction = this.#facingDir(player);
    const start = player.position.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(direction, 1.05);
    const color = 0xff7a42;
    this.game.effects.slash(player.position, direction, 0xffb080, 2.8, { arc: Math.PI * .7, height: .9, life: .28 });
    this.#spawnFriendlyOrb(start, direction, {
      color,
      damage: player.attackPower * (1.55 + rank * .24) * player.skillPower,
      speed: 13.5 + rank * .35,
      radius: 1.15,
      life: 1.4,
      pierce: 1,
      knockback: 4.5,
      skill: true,
      scale: 1.45,
      explode: {
        radius: 2.4 + rank * .12,
        damage: player.attackPower * (.55 + rank * .08) * player.skillPower,
        color: 0xff9a50,
      },
    });
  }

  #frostNova(player, rank) {
    const radius = 4.4 + rank * .2;
    const color = 0x7ad8ff;
    player.invulnerable = Math.max(player.invulnerable, .28);
    this.game.effects.ring(player.position, color, radius, { life: .55, startScale: .12 });
    this.game.effects.ring(player.position, 0xd8f4ff, radius * .72, { life: .4, startScale: .2, height: .08 });
    this.game.effects.burst(player.position.clone().add(new THREE.Vector3(0, .8, 0)), color, 22, {
      speed: 5.2, size: .28, life: .5, upward: .15,
    });
    this.#hitEnemiesInRadius(player.position, radius, player.attackPower * (1.2 + rank * .16) * player.skillPower, {
      knockback: 5.4, multiHit: true, criticalBonus: .04, skill: true,
    });
    for (let i = 0; i < 3; i += 1) {
      this.#delay(.1 + i * .08, () => {
        if (!player.alive) return;
        this.game.effects.ring(player.position, color, radius * (.55 + i * .15), {
          life: .28, startScale: .4, height: .06, opacity: .55,
        });
      });
    }
  }

  #arcaneBlink(player, rank) {
    const target = this.#aimAlongFacing(player, 11);
    const from = player.position.clone();
    const radius = 4.2 + rank * .2;
    const color = 0xb06dff;
    this.#telegraphCircle(target, radius, .42, color, () => {
      if (!player.alive) return;
      this.game.effects.burst(from.clone().add(new THREE.Vector3(0, 1, 0)), color, 16, { speed: 4, size: .28, life: .4 });
      this.game.effects.ring(from, color, 2.2, { life: .3, startScale: .2 });
      player.position.copy(target);
      this.game.world.resolvePosition(player.position, .48);
      player.invulnerable = Math.max(player.invulnerable, .55);
      this.game.effects.pillar(target, 0xd4b8ff, 7.5, { life: .65, bottom: 1.1 });
      this.game.effects.ring(target, color, radius, { life: .58, startScale: .08 });
      this.game.effects.burst(target, 0xe8d4ff, 26, { speed: 5.8, upward: .55, size: .34, life: .75 });
      this.#hitEnemiesInRadius(target, radius, player.attackPower * (1.7 + rank * .26) * player.skillPower, {
        knockback: 6.8, armorPierce: .22, criticalBonus: .05, skill: true,
      });
      this.game.effects.impact(target.clone().add(new THREE.Vector3(0, 1.1, 0)), color, 'heavy');
    }, { fillOpacity: .14 });
  }

  #meteorStorm(player, rank) {
    const center = this.#aimAlongFacing(player, 10);
    const hits = 6 + rank;
    const color = 0xff6a3a;
    for (let i = 0; i < hits; i += 1) {
      const angle = (i / hits) * Math.PI * 2 + rand(-.3, .3);
      const radius = i === 0 ? 0 : rand(1.2, 5.5);
      const point = center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      point.y = this.game.world.heightAt(point.x, point.z);
      this.#delay(.1 + i * .1, () => {
        this.#telegraphCircle(point, 1.7 + rank * .06, .26, color, () => {
          this.game.effects.pillar(point, i % 2 ? 0xff9040 : 0xffd0a0, 6.8, { life: .5, bottom: .75 });
          this.game.effects.burst(point, color, 14, { speed: 5.2, size: .32, life: .55, upward: .4 });
          this.game.effects.ring(point, 0xffc090, 2.2, { life: .35, startScale: .15 });
          this.#hitEnemiesInRadius(point, 1.9 + rank * .07, player.attackPower * (.6 + rank * .055) * player.skillPower, {
            knockback: 2.8, multiHit: true, armorPierce: .18, skill: true,
          });
        }, { fillOpacity: .13 });
      });
    }
    this.#delay(.22 + hits * .1, () => {
      this.game.effects.ring(center, 0xffe0c0, 6.6, { life: .8, startScale: .05 });
      this.game.effects.pillar(center, 0xffb070, 8, { life: .6, bottom: 1.15, opacity: .55 });
      this.#hitEnemiesInRadius(center, 5.6, player.attackPower * (.9 + rank * .1) * player.skillPower, {
        knockback: 6.4, multiHit: true, armorPierce: .3, skill: true,
      });
      this.game.effects.impact(center.clone().add(new THREE.Vector3(0, 1.2, 0)), color, 'finisher');
    });
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
    this.#telegraphCircle(enemy.position, enemy.radius * 1.15 + .55, delay, color, () => {
      if (!enemy.alive || !this.game.player.alive) return;
      const count = options.count ?? 1;
      const baseDirection = this.game.player.position.clone().sub(enemy.position).setY(0).normalize();
      for (let i = 0; i < count; i += 1) {
        const spread = count === 1 ? 0 : (i - (count - 1) / 2) * .2;
        const direction = baseDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
        this.#spawnEnemyProjectile(enemy, direction, {
          color, speed: options.caster ? 8.3 : 10.2,
          damage: enemy.damage * (options.caster ? 1.04 : .86),
          size: options.caster ? .34 : .25,
          homing: options.caster ? .22 : 0,
        });
      }
      this.game.effects.burst(enemy.position, color, options.caster ? 14 : 8, { speed: 2.5, size: .24, life: .42 });
    }, { follows: enemy, fillOpacity: .08 });
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
        this.#spawnEnemyProjectile(enemy, direction, { color: 0xffb95f, speed: 8.2, damage: enemy.damage * .62, size: .28 });
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
          color: i % 2 ? 0xc184ff : 0x7fcfff, speed: 7.2 + (i % 3) * .6,
          damage: enemy.damage * .56, size: .31, homing: i % 4 === 0 ? .18 : 0,
        });
      }
      const distance = this.game.player.position.distanceTo(center);
      if (distance < 9.4) this.#damagePlayer(enemy.damage * 1.2, this.game.player.position.clone().sub(center).setY(0).normalize(), 10);

    }, { follows: enemy, fillOpacity: .18 });
  }

  #spawnEnemyProjectile(enemy, direction, options = {}) {
    const material = new THREE.MeshBasicMaterial({
      color: options.color ?? enemy.data.accent, transparent: true, opacity: .92, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.enemyOrbGeometry, material);
    mesh.scale.setScalar(options.size ? options.size / .25 : 1);
    mesh.position.copy(enemy.position);
    mesh.position.y += Math.max(1, enemy.refs.modelHeight * (enemy.data.scale ?? 1) * .5);
    this.game.scene.add(mesh);
    this.projectiles.push({
      mesh, material, friendly: false, velocity: direction.clone().normalize().multiplyScalar(options.speed ?? 9),
      damage: options.damage ?? enemy.damage, radius: (options.size ?? .25) + .34,
      life: options.life ?? 3.4, source: enemy, homing: options.homing ?? 0,
      color: options.color ?? enemy.data.accent,
    });
  }

  #hitEnemiesInCone(origin, direction, range, arc, rawDamage, options = {}) {
    const cosThreshold = Math.cos(arc * .5);
    let hits = 0;
    for (const enemy of this.game.enemies.enemies) {
      if (!enemy.alive) continue;
      const offset = TMP_A.copy(enemy.position).sub(origin).setY(0);
      const distance = offset.length();
      if (distance > range + enemy.radius || distance < .001) continue;
      const dir = offset.normalize();
      const dot = dir.dot(direction);
      if (dot < cosThreshold) continue;
      this.#damageEnemy(enemy, rawDamage, { ...options, direction: dir.clone() });
      hits += 1;
    }
    return hits;
  }

  #hitEnemiesInRadius(origin, radius, rawDamage, options = {}) {
    let hits = 0;
    for (const enemy of this.game.enemies.enemies) {
      if (!enemy.alive) continue;
      const offset = TMP_A.copy(enemy.position).sub(origin).setY(0);
      const distance = offset.length();
      if (distance > radius + enemy.radius) continue;
      const direction = distance > .001 ? offset.normalize().clone() : new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize();
      this.#damageEnemy(enemy, rawDamage, { ...options, direction });
      hits += 1;
    }
    return hits;
  }

  #damageEnemy(enemy, rawDamage, options = {}) {
    const player = this.game.player;
    const critical = Math.random() < clamp(player.critChance + (options.criticalBonus ?? 0), 0, .8);
    const finisher = Boolean(options.finisher);
    const damage = rawDamage * (critical ? 1.85 : 1) * (options.skill ? player.skillPower : 1);
    const result = enemy.takeDamage(damage, this.game, {
      direction: options.direction,
      knockback: (options.knockback ?? 2) * (critical ? 1.25 : 1),
      armorPierce: options.armorPierce,
      multiHit: options.multiHit,
    });
    if (result.amount <= 0) return;
    const hitPoint = enemy.position.clone().add(new THREE.Vector3(0, enemy.refs.modelHeight * .48, 0));
    const weaponColor = player.weapon?.rarityColor ?? 0xeef8ff;
    const intensity = critical ? 'critical' : finisher ? 'finisher' : options.skill ? 'heavy' : 'light';

    // Flashy contact VFX only — no camera shake.
    this.game.effects.impact(hitPoint, critical ? 0xffe47a : weaponColor, intensity, {
      direction: options.direction,
    });

    this.game.ui.floatText(hitPoint, `${critical ? 'CRIT ' : ''}${result.amount}`, critical ? 'critical' : 'damage');
    this.game.audio.hit(critical, finisher);

    if (player.leech > 0) player.heal(result.amount * player.leech);
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
      action.time -= delta;
      if (action.time > 0) continue;
      this.delayed.splice(i, 1);
      try { action.callback(); } catch (error) { console.error('Delayed combat action failed:', error); }
    }
  }

  #updateTelegraphs(delta) {
    for (let i = this.telegraphs.length - 1; i >= 0; i -= 1) {
      const warning = this.telegraphs[i];
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
      } else {
        warning.fillMaterial.opacity = .1 + t * .35 + Math.sin(t * Math.PI * 9) * .05;
      }
      if (t < 1) continue;
      this.game.scene.remove(warning.group);
      warning.ringGeometry?.dispose(); warning.fillGeometry?.dispose();
      warning.ringMaterial?.dispose(); warning.fillMaterial?.dispose();
      this.telegraphs.splice(i, 1);
      try { warning.callback?.(); } catch (error) { console.error('Telegraph callback failed:', error); }
    }
  }

  #updateCharges(delta) {
    for (let i = this.charges.length - 1; i >= 0; i -= 1) {
      const charge = this.charges[i];
      const enemy = charge.enemy;
      if (!enemy.alive) { this.charges.splice(i, 1); continue; }
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
      }
      if (t >= 1) {
        enemy.state = 'idle';
        enemy.stateTimer = 0;
        this.game.effects.ring(enemy.position, enemy.data.accent, enemy.radius * 2.1, { life: .35 });
        this.charges.splice(i, 1);
      }
    }
  }

  #updateProjectiles(delta) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.life -= delta;
      if (projectile.homing && !projectile.friendly && this.game.player.alive) {
        const targetDirection = TMP_A.copy(this.game.player.position).sub(projectile.mesh.position).setY(0).normalize();
        const speed = projectile.velocity.length();
        projectile.velocity.lerp(targetDirection.multiplyScalar(speed), Math.min(1, delta * projectile.homing * 3.2));
      }
      projectile.mesh.position.addScaledVector(projectile.velocity, delta);
      projectile.mesh.rotation.x += delta * 5.5;
      projectile.mesh.rotation.y += delta * 8;
      if (projectile.wave) {
        projectile.mesh.material.opacity = Math.min(.9, projectile.life * 1.5);
        this.game.effects.trail(projectile.mesh.position, projectile.color, .34, .13);
      } else if (Math.random() < delta * 16) {
        this.game.effects.trail(projectile.mesh.position, projectile.color, .18, .18);
      }

      if (projectile.friendly) {
        for (const enemy of this.game.enemies.enemies) {
          if (!enemy.alive || projectile.hit.has(enemy.id)) continue;
          const distance = enemy.position.distanceTo(projectile.mesh.position);
          if (distance > projectile.radius + enemy.radius) continue;
          projectile.hit.add(enemy.id);
          this.#damageEnemy(enemy, projectile.damage, {
            direction: projectile.direction.clone(), knockback: projectile.knockback, armorPierce: .18, skill: projectile.skill,
          });
          projectile.pierce -= 1;
          if (projectile.pierce <= 0) projectile.life = 0;
        }
      } else if (this.game.player.alive && projectile.mesh.position.distanceTo(this.game.player.position.clone().add(new THREE.Vector3(0, .8, 0))) < projectile.radius + .55) {
        const direction = projectile.velocity.clone().setY(0).normalize();
        this.#damagePlayer(projectile.damage, direction, 4.5);
        projectile.life = 0;
      }

      const ground = this.game.world.heightAt(projectile.mesh.position.x, projectile.mesh.position.z);
      if (projectile.life <= 0 || projectile.mesh.position.y < ground + .05 || Math.hypot(projectile.mesh.position.x, projectile.mesh.position.z) > 180) {
        if (projectile.explode && projectile.friendly) {
          const blast = projectile.explode;
          const at = projectile.mesh.position.clone();
          at.y = ground;
          this.game.effects.ring(at, blast.color ?? projectile.color, blast.radius, { life: .42, startScale: .12 });
          this.game.effects.burst(at.clone().add(new THREE.Vector3(0, .8, 0)), blast.color ?? projectile.color, 18, {
            speed: 5.5, size: .32, life: .5, upward: .35,
          });
          this.#hitEnemiesInRadius(at, blast.radius, blast.damage, {
            knockback: 4.2, multiHit: true, skill: true, armorPierce: .12,
          });
        } else {
          this.game.effects.burst(projectile.mesh.position, projectile.color, 5, { speed: 2.2, size: .2, life: .3 });
        }
        this.game.scene.remove(projectile.mesh);
        projectile.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  clear() {
    for (const projectile of this.projectiles) {
      this.game.scene.remove(projectile.mesh);
      projectile.material.dispose();
    }
    for (const warning of this.telegraphs) {
      this.game.scene.remove(warning.group);
      warning.ringGeometry?.dispose(); warning.fillGeometry?.dispose();
      warning.ringMaterial?.dispose(); warning.fillMaterial?.dispose();
    }
    this.projectiles.length = 0;
    this.telegraphs.length = 0;
    this.delayed.length = 0;
    this.charges.length = 0;
  }
}
