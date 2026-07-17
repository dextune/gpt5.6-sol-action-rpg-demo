/**
 * Friendly projectile spawn / update / retire (N5).
 * Attached onto CombatSystem.prototype.
 */
import * as THREE from 'three';
import {
  createProjectileVisual, disposeProjectileVisual, orientProjectile,
} from '../../graphics/ProjectileMeshes.js';
import { clamp } from '../../core/Utils.js';

const TMP_A = new THREE.Vector3();

export function attachProjectileMethods(proto) {
  Object.assign(proto, {
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
  },

_updateProjectiles(delta) {
    // Snapshot length so clear()/spawn re-entrancy cannot leave undefined holes mid-loop.
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      if (!projectile?.mesh || projectile.life == null) {
        if (i >= 0 && i < this.projectiles.length) this.projectiles.splice(i, 1);
        continue;
      }
      if (projectile.ownerGuard && !projectile.ownerGuard()) {
        const ground = (this.ctx ?? this.game).world.heightAt(projectile.mesh.position.x, projectile.mesh.position.z);
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
      if (projectile.homing && !projectile.friendly && (this.ctx ?? this.game).player.alive) {
        const targetDirection = TMP_A.copy((this.ctx ?? this.game).player.position).sub(projectile.mesh.position).setY(0);
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
        (this.ctx ?? this.game).effects.trail(projectile.mesh.position, projectile.color, 0.34, 0.13);
      } else if (Math.random() < delta * trailRate) {
        (this.ctx ?? this.game).effects.trail(projectile.mesh.position, projectile.color, trailSize, trailSize * 0.9);
      }

      if (projectile.friendly) {
        const hitDir = projectile.direction?.clone?.()
          ?? projectile.velocity.clone().setY(0).normalize();
        for (const enemy of (this.ctx ?? this.game).enemies.enemies) {
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
      } else if ((this.ctx ?? this.game).player.alive && projectile.mesh.position.distanceTo((this.ctx ?? this.game).player.position.clone().add(new THREE.Vector3(0, .8, 0))) < projectile.radius + .55) {
        const direction = projectile.velocity.clone().setY(0);
        if (direction.lengthSq() > 1e-6) direction.normalize();
        else direction.set(0, 0, 1);
        this._damagePlayer(projectile.damage, direction, 4.5, projectile.source ?? null);
        const status = projectile.statusOnHit;
        if (status?.id === 'player_slow' || status?.id === 'slow') {
          (this.ctx ?? this.game).player.applySlow?.(status.duration ?? 1.2);
        } else if (status?.id === 'player_burn') {
          (this.ctx ?? this.game).player.applySlow?.(0.45);
          const chip = Math.min(
            Math.round((this.ctx ?? this.game).player.maxHp * 0.03),
            Math.round(projectile.damage * (status.power ?? 0.08)),
          );
          if (chip > 0) (this.ctx ?? this.game).player.takeDamage?.(chip, direction.clone().multiplyScalar(1.2));
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

      const ground = (this.ctx ?? this.game).world.heightAt(projectile.mesh.position.x, projectile.mesh.position.z);
      if (projectile.life <= 0 || projectile.mesh.position.y < ground + .05 || Math.hypot(projectile.mesh.position.x, projectile.mesh.position.z) > 180) {
        this._retireProjectile(i, projectile, ground);
      }
    }
  },

_retireProjectile(index, projectile, groundY) {
    if (!projectile || projectile.retired || this.projectiles[index] !== projectile) return;
    projectile.retired = true;
    try {
      if (projectile.explode && projectile.friendly && projectile.mesh) {
        const blast = projectile.explode;
        const at = projectile.mesh.position.clone();
        at.y = groundY;
        if (blast.theme && (this.ctx ?? this.game).effects.recipeFireBlast) {
          (this.ctx ?? this.game).effects.recipeFireBlast(at, blast.theme, blast.radius);
        } else {
          (this.ctx ?? this.game).effects.ring(at, blast.color ?? projectile.color, blast.radius, { life: .42, startScale: .12 });
          (this.ctx ?? this.game).effects.burst(at.clone().add(new THREE.Vector3(0, .8, 0)), blast.color ?? projectile.color, 18, {
            speed: 5.5, size: .32, life: .5, upward: .35,
          });
        }
        // Gravity Fireball: snap non-boss prey into the blast core before damage.
        if (blast.implosionRadius > 0) {
          this._implosionSnap?.(at, blast);
        }
        this._hitEnemiesInRadius(at, blast.radius, blast.damage, {
          knockback: blast.knockback ?? 4.2,
          multiHit: true,
          skill: true,
          skillPowerApplied: Boolean(blast.skillPowerApplied),
          armorPierce: .12,
          status: blast.status ?? null,
          onHit: blast.onHit ?? null,
          sameCastHit: blast.sameCastHit ?? null,
        });
      } else if (projectile.mesh) {
        (this.ctx ?? this.game).effects.burst(projectile.mesh.position, projectile.color, 5, { speed: 2.2, size: .2, life: .3 });
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
  },

/** Snap non-boss enemies around a blast core onto a tight ring (Gravity Fireball). */
_implosionSnap(at, blast) {
  const game = this.ctx ?? this.game;
  const theme = blast.theme ?? { primary: blast.color ?? 0xff9040, secondary: 0xffb15c, core: 0xfff0c0 };
  const pullR = blast.implosionRadius ?? 6.5;
  const ring = blast.implosionRing ?? 1.35;
  const cap = Math.max(1, Math.round(blast.implosionCap ?? 10));
  const enemies = game.enemies?.enemies ?? [];
  const candidates = [];
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const dist = enemy.position.distanceTo(at);
    if (dist > pullR + (enemy.radius ?? 0.5)) continue;
    if (enemy.controlCategory === 'boss' || enemy.boss) {
      game.effects?.recipeBossPullResist?.(enemy.position, at, theme);
      continue;
    }
    candidates.push({ enemy, dist });
  }
  candidates.sort((a, b) => a.dist - b.dist);
  const taken = candidates.slice(0, cap).map(entry => entry.enemy);
  if (!taken.length) return;
  game.effects?.recipeVortexPull?.(at, theme, pullR * 0.7);
  for (let i = 0; i < taken.length; i += 1) {
    const enemy = taken[i];
    const from = enemy.position.clone();
    if (from.distanceTo(at) <= ring + (enemy.radius ?? 0.55) * 0.5) {
      enemy.velocity?.set?.(0, 0, 0);
      enemy.knockback?.set?.(0, 0, 0);
      continue;
    }
    const angle = (i / taken.length) * Math.PI * 2;
    const dist = ring + (enemy.radius ?? 0.55) + (i % 2) * 0.25;
    const dest = new THREE.Vector3(
      at.x + Math.cos(angle) * dist,
      from.y,
      at.z + Math.sin(angle) * dist,
    );
    game.world?.resolvePosition?.(dest, enemy.radius ?? 0.55);
    game.effects?.trail?.(from.clone().add(new THREE.Vector3(0, 1, 0)), theme.primary, 0.4, 0.18);
    game.effects?.afterimage?.(from, theme.secondary ?? theme.primary, { life: 0.24, opacity: 0.45, scale: 0.9 });
    enemy.position.copy(dest);
    enemy.velocity?.set?.(0, 0, 0);
    enemy.knockback?.set?.(0, 0, 0);
  }
},
  });
}
