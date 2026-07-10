import * as THREE from 'three';
import { SKILLS, getHeroClass } from '../data/content.js';
import { getFxTheme } from '../data/fxThemes.js';
import { resolveSkillHitRaw, skillCombatAtRank, skillDamage } from '../data/skillCombat.js';
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
    /** effect id → handler(player, rank, phase?) — phase for anim-synced skills */
    this.skillHandlers = {
      whirlwind: (p, r, phase) => this.#whirlwind(p, r, phase),
      crescent: (p, r, phase) => this.#crescent(p, r, phase),
      skyfall: (p, r) => this.#skyfall(p, r),
      starburst: (p, r) => this.#starburst(p, r),
      fireball: (p, r, phase) => this.#fireball(p, r, phase),
      frost_nova: (p, r, phase) => this.#frostNova(p, r, phase),
      arcane_blink: (p, r) => this.#arcaneBlink(p, r),
      meteor_storm: (p, r) => this.#meteorStorm(p, r),
    };
  }

  #skillBundle(skillId, rank) {
    const skill = SKILLS[skillId];
    const combat = skillCombatAtRank(skill, rank);
    const theme = getFxTheme(skill?.theme);
    return { skill, combat, theme };
  }

  #quality() {
    return this.game.renderPipeline?.quality ?? this.game.effects?.quality ?? 'medium';
  }

  playerAttack(player, combo, comboLength = 4) {
    const style = getHeroClass(player.classId).attackStyle ?? 'melee';
    if (style === 'magic') this.#magicAttack(player, combo, comboLength);
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

  #meleeAttack(player, combo, comboLength = 4) {
    const direction = this.#facingDir(player);
    const last = Math.max(0, comboLength - 1);
    const finisher = combo >= last;
    const color = player.weapon?.rarityColor ?? 0xeef8ff;
    // Level + chain depth push dust/trail read for heavier knight swings.
    const levelBoost = clamp((player.level - 1) * .04, 0, .8);
    const chain = combo / Math.max(1, last);
    this.game.effects.dust(player.position, 0xd7dbc4, finisher ? 14 + combo : 6 + combo * 2, finisher ? .42 : .28);
    this.game.effects.trail(
      player.position.clone().add(new THREE.Vector3(0, 1.05, 0)).addScaledVector(direction, .55),
      color, finisher ? .7 : .34 + chain * .2, finisher ? .24 : .12,
    );

    // High-level finishers and late chain steps land as multi-pulse hits for impact.
    const pulses = finisher
      ? 1 + Math.min(3, Math.floor((comboLength - 3) / 1.5) + Math.floor(player.level / 10))
      : combo >= 3 ? 1 + Math.min(1, Math.floor(player.level / 12)) : 1;
    const baseMult = (.88 + combo * .14 + levelBoost * .12) * (finisher ? 1.35 + (comboLength - 3) * .08 : 1);

    for (let pulse = 0; pulse < pulses; pulse += 1) {
      const delay = (finisher ? .06 : .02 + combo * .005) + pulse * (finisher ? .07 : .05);
      this.#delay(delay, () => {
        if (!player.alive) return;
        const range = (finisher ? 3.45 : 2.85) + combo * .16 + levelBoost * .25;
        const arc = finisher ? Math.PI * (1.05 + chain * .12) : Math.PI * (.58 + combo * .05);
        const hitOrigin = player.position.clone().addScaledVector(direction, .35 + pulse * .08);
        const pulseDamage = player.attackPower * baseMult * (pulses > 1 ? (.72 + pulse * .12) : 1);

        this.game.effects.swingArc(hitOrigin, direction, color, range * (finisher ? 1.35 : 1.15), {
          heavy: finisher || combo >= 2,
          height: finisher ? 1.3 : 1.02,
          spin: (combo + pulse) % 2 ? -3.1 : 2.9,
          angleOffset: (combo + pulse) % 2 ? .58 : -.5,
        });
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
        });
      });
    }
  }

  /** Staff basic attack — ranged mana bolts (combo builds into a multi-orb finisher). */
  #magicAttack(player, combo, comboLength = 4) {
    // Capture facing at cast time so delayed bolts don't inherit a later turn/mouse aim.
    const direction = this.#facingDir(player);
    const finisher = combo >= Math.max(0, comboLength - 1);
    const theme = getFxTheme('arcane');
    const color = player.weapon?.rarityColor ?? theme.primary;
    const origin = player.position.clone().add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(direction, .7);
    this.game.effects.trail(origin, color, finisher ? .75 : .42, .18);
    this.game.effects.burst(origin, color, finisher ? 18 : 8 + combo * 2, {
      speed: 3.4, size: .24, life: .34, upward: .22,
    });
    this.game.effects.slash(player.position, direction, theme.secondary, finisher ? 2.6 : 1.8 + combo * 0.15, {
      height: 1.05, life: 0.22, thickness: 0.05, spin: 1.8, opacity: 0.55,
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
          color: finisher && i === 2 ? theme.core : color,
          damage: baseDamage * (finisher ? .42 : 1),
          speed: finisher ? 14 + i : 15.5,
          radius: finisher ? 1.05 : .9,
          life: 1.2,
          pierce: finisher ? 2 : 1,
          knockback: finisher ? 3.8 : 2.2,
          skill: false,
          scale: finisher ? 1.25 : 1.05,
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

  /**
   * @param {string} skillId
   * @param {*} player
   * @param {number} rank
   * @param {number|null} [phase] anim-synced pulse index; null = full skill / non-phased
   */
  usePlayerSkill(skillId, player, rank, phase = null) {
    const skill = SKILLS[skillId];
    const effectId = skill?.effect ?? skillId;
    const handler = this.skillHandlers[effectId];
    if (handler) handler(player, rank, phase);
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
      wave: Boolean(options.wave),
      color,
      direction: direction.clone().normalize(),
      knockback: options.knockback ?? 2.5,
      skill: Boolean(options.skill),
      // true only when damage already includes skillPower (e.g. fireball orb)
      skillPowerApplied: Boolean(options.skillPowerApplied),
      explode: options.explode ?? null,
      statusOnHit: options.statusOnHit ?? null,
    });
  }

  #applyHitStatus(enemy, status) {
    if (!status?.id || !enemy?.applyStatus) return;
    enemy.applyStatus(status.id, {
      duration: status.duration ?? 2,
      power: status.power ?? 0.4,
      dps: status.dps ?? 0,
      tick: status.tick ?? 0.5,
    }, this.game);
  }

  #whirlwindPulse(player, rank, hitIndex) {
    const { combat, theme } = this.#skillBundle('whirlwind', rank);
    const radius = combat.radius;
    const hits = Math.max(1, Math.round(combat.hits ?? 3));
    const finale = hitIndex >= hits - 1;
    if (hitIndex === 0) player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.34);
    this.game.effects.recipeSpinStorm(player.position, player.facing, theme, radius, hitIndex, finale);
    this.#hitEnemiesInRadius(player.position, radius, skillDamage(player.attackPower, combat), {
      knockback: finale ? combat.knockbackFinale : combat.knockbackPulse,
      multiHit: true,
      criticalBonus: combat.criticalBonus ?? 0.03,
      skill: true,
    });
  }

  #whirlwind(player, rank, phase = null) {
    const { combat } = this.#skillBundle('whirlwind', rank);
    const hits = Math.max(1, Math.round(combat.hits ?? 3));
    if (phase != null && phase !== 'full') {
      if (!player.alive) return;
      this.#whirlwindPulse(player, rank, Number(phase) || 0);
      return;
    }
    // Fallback absolute delays if anim timeline not used
    for (let hit = 0; hit < hits; hit += 1) {
      this.#delay(0.06 + hit * 0.15, () => {
        if (!player.alive) return;
        this.#whirlwindPulse(player, rank, hit);
      });
    }
  }

  #crescent(player, rank, phase = null) {
    const fire = () => {
      if (!player.alive) return;
      const { combat, theme } = this.#skillBundle('crescent', rank);
      const direction = this.#facingDir(player);
      const start = player.position.clone().addScaledVector(direction, 1.2);
      start.y += 1;
      this.game.effects.recipeGroundWave(player.position, direction, theme, 3.6);
      this.#spawnFriendlyOrb(start, direction, {
        color: theme.primary,
        damage: skillDamage(player.attackPower, combat),
        speed: combat.speed,
        radius: combat.radius ?? 1.25,
        life: 1.35,
        pierce: Math.round(combat.pierce ?? 3),
        knockback: combat.knockback ?? 4.2,
        skill: true,
        wave: true,
        scale: 1.2 + rank * 0.04,
        statusOnHit: combat.status ?? null,
      });
      // Stretch wave mesh look
      const last = this.projectiles[this.projectiles.length - 1];
      if (last?.wave) {
        last.mesh.geometry = this.waveGeometry;
        last.mesh.scale.set(1.35 + rank * 0.08, 1.25, 1.2);
        last.mesh.rotation.y = Math.atan2(direction.x, direction.z);
      }
    };
    if (phase != null && phase !== 'full') fire();
    else fire();
  }

  #skyfall(player, rank) {
    const { combat, theme } = this.#skillBundle('skyfall', rank);
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

  #starburst(player, rank) {
    const { combat, theme } = this.#skillBundle('starburst', rank);
    const center = this.#aimAlongFacing(player, combat.aim ?? 9.5);
    const hits = Math.round(combat.hits ?? 6);
    // Star pattern: fixed radial arms (not random scatter like meteor)
    for (let i = 0; i < hits; i += 1) {
      const arm = i % 6;
      const ring = Math.floor(i / 6);
      const angle = (arm / 6) * Math.PI * 2 + ring * 0.22;
      const dist = i === 0 ? 0 : 1.6 + ring * 1.7 + (arm % 2) * 0.55;
      const point = center.clone().add(new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist));
      point.y = this.game.world.heightAt(point.x, point.z);
      this.#delay(0.1 + i * 0.095, () => {
        this.#telegraphCircle(point, combat.hitRadius * 0.9, combat.telegraph ?? 0.28, theme.primary, () => {
          this.game.effects.recipeStarBlade(point, theme, i);
          this.#hitEnemiesInRadius(point, combat.hitRadius, skillDamage(player.attackPower, combat), {
            knockback: combat.knockback ?? 2.5,
            multiHit: true,
            armorPierce: combat.armorPierce ?? 0.2,
            skill: true,
          });
        }, { fillOpacity: 0.12 });
      });
    }
    this.#delay(0.22 + hits * 0.095, () => {
      this.game.effects.recipeStarFinale(center, theme, combat.finaleRadius ?? 5.8);
      this.#hitEnemiesInRadius(center, combat.finaleRadius ?? 5.8, skillDamage(player.attackPower, combat, 'finaleMult'), {
        knockback: combat.finaleKnockback ?? 6.2,
        multiHit: true,
        armorPierce: combat.finaleArmorPierce ?? 0.35,
        skill: true,
      });
    });
  }

  #fireball(player, rank, phase = null) {
    const fire = () => {
      if (!player.alive) return;
      const { combat, theme } = this.#skillBundle('fireball', rank);
      const direction = this.#facingDir(player);
      const start = player.position.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(direction, 1.05);
      this.game.effects.recipeFireOrb(player.position, direction, theme);
      this.#spawnFriendlyOrb(start, direction, {
        color: theme.primary,
        damage: skillDamage(player.attackPower, combat) * player.skillPower,
        speed: combat.speed,
        radius: combat.radius ?? 1.15,
        life: 1.4,
        pierce: 1,
        knockback: combat.knockback ?? 4.5,
        skill: true,
        skillPowerApplied: true,
        scale: combat.scale ?? 1.45,
        statusOnHit: combat.status ?? null,
        explode: {
          radius: combat.blastRadius,
          damage: skillDamage(player.attackPower, combat, 'blastMult') * player.skillPower,
          color: theme.accent,
          theme,
          status: combat.status ?? null,
          skillPowerApplied: true,
        },
      });
    };
    if (phase != null && phase !== 'full') fire();
    else fire();
  }

  #frostNova(player, rank, phase = null) {
    const fire = () => {
      if (!player.alive) return;
      const { combat, theme } = this.#skillBundle('frost_nova', rank);
      const radius = combat.radius;
      player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.28);
      this.game.effects.recipeIceNova(player.position, theme, radius);
      this.#hitEnemiesInRadius(
        player.position,
        radius,
        skillDamage(player.attackPower, combat),
        {
          knockback: combat.knockback ?? 5.4,
          multiHit: true,
          criticalBonus: combat.criticalBonus ?? 0.04,
          skill: true,
          status: combat.status ?? null,
        },
      );
      for (let i = 0; i < 3; i += 1) {
        this.#delay(0.1 + i * 0.08, () => {
          if (!player.alive) return;
          this.game.effects.ring(player.position, theme.secondary, radius * (0.5 + i * 0.16), {
            life: 0.28, startScale: 0.35, height: 0.06, opacity: 0.5,
          });
        });
      }
    };
    if (phase != null && phase !== 'full') fire();
    else fire();
  }

  #arcaneBlink(player, rank) {
    const { combat, theme } = this.#skillBundle('arcane_blink', rank);
    const target = this.#aimAlongFacing(player, combat.leap ?? 11);
    const from = player.position.clone();
    const radius = combat.radius;
    this.#telegraphCircle(target, radius, combat.telegraph ?? 0.42, theme.primary, () => {
      if (!player.alive) return;
      player.position.copy(target);
      this.game.world.resolvePosition(player.position, 0.48);
      player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.55);
      this.game.effects.recipeBlinkBurst(from, target, theme, radius);
      this.#hitEnemiesInRadius(
        target,
        radius,
        skillDamage(player.attackPower, combat),
        {
          knockback: combat.knockback ?? 6.8,
          armorPierce: combat.armorPierce ?? 0.22,
          criticalBonus: combat.criticalBonus ?? 0.05,
          skill: true,
        },
      );
    }, { fillOpacity: 0.14 });
  }

  #meteorStorm(player, rank) {
    const { combat, theme } = this.#skillBundle('meteor_storm', rank);
    const facing = this.#facingDir(player);
    const center = this.#aimAlongFacing(player, combat.aim ?? 10);
    const hits = Math.round(combat.hits ?? 6);
    const fallHeight = combat.fallHeight ?? 8.5;
    // Fall-cone pattern along facing (distinct from star radial blades)
    for (let i = 0; i < hits; i += 1) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const lateral = (col - 1) * (1.8 + row * 0.35) + rand(-0.35, 0.35);
      const forward = 0.6 + row * 2.1 + (i * 0.15);
      const side = new THREE.Vector3(-facing.z, 0, facing.x);
      const point = center.clone()
        .addScaledVector(facing, forward - 2.2)
        .addScaledVector(side, lateral);
      point.y = this.game.world.heightAt(point.x, point.z);
      this.#delay(0.08 + i * 0.11, () => {
        this.#telegraphCircle(point, combat.hitRadius * 0.95, combat.telegraph ?? 0.26, theme.primary, () => {
          this.game.effects.recipeMeteorDrop(point, theme, fallHeight);
          this.#hitEnemiesInRadius(
            point,
            combat.hitRadius,
            skillDamage(player.attackPower, combat),
            {
              knockback: combat.knockback ?? 2.8,
              multiHit: true,
              armorPierce: combat.armorPierce ?? 0.18,
              skill: true,
              status: combat.status ?? null,
            },
          );
        }, { fillOpacity: 0.13 });
      });
    }
    this.#delay(0.2 + hits * 0.11, () => {
      this.game.effects.recipeMeteorFinale(center, theme, combat.finaleRadius ?? 5.6);
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
        },
      );
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
    let armorPierce = options.armorPierce ?? 0;
    if (enemy.statuses?.expose?.remaining > 0) {
      armorPierce = Math.min(0.85, armorPierce + (enemy.statuses.expose.power ?? 0.15));
    }
    // skillPower applied exactly once here unless skillPowerApplied (baked projectile damage).
    const damage = resolveSkillHitRaw(rawDamage, {
      skill: options.skill,
      skillPowerApplied: options.skillPowerApplied,
      skillPower: player.skillPower,
      critical,
    });
    const result = enemy.takeDamage(damage, this.game, {
      direction: options.direction,
      knockback: (options.knockback ?? 2) * (critical ? 1.25 : 1),
      armorPierce,
      multiHit: options.multiHit,
    });
    if (result.amount <= 0) return;
    if (options.status) this.#applyHitStatus(enemy, options.status);
    const hitPoint = enemy.position.clone().add(new THREE.Vector3(0, enemy.refs.modelHeight * .48, 0));
    const weaponColor = player.weapon?.rarityColor ?? 0xeef8ff;
    const intensity = critical ? 'critical' : finisher ? 'finisher' : options.skill ? 'heavy' : 'light';

    // Flashy contact VFX only — no camera shake.
    this.game.effects.impact(hitPoint, critical ? 0xffe47a : weaponColor, intensity, {
      direction: options.direction,
    });
    if (options.status?.id === 'slow') {
      this.game.effects.trail(hitPoint, 0x7ad8ff, 0.35, 0.35);
    } else if (options.status?.id === 'burn') {
      this.game.effects.trail(hitPoint, 0xff7a42, 0.32, 0.3);
    }

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
            direction: projectile.direction.clone(),
            knockback: projectile.knockback,
            armorPierce: .18,
            skill: projectile.skill,
            skillPowerApplied: Boolean(projectile.skillPowerApplied),
            status: projectile.statusOnHit ?? null,
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
