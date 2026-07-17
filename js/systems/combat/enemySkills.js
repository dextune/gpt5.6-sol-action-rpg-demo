/**
 * Enemy / boss special skill implementations (Sol combat).
 * Attached onto CombatSystem.prototype.
 */
import * as THREE from 'three';
import { createProjectileVisual, orientProjectile } from '../../graphics/ProjectileMeshes.js';
import { rand } from '../../core/Utils.js';

export function attachEnemySkillMethods(proto) {
  Object.assign(proto, {
_bossRoots(enemy) {
  const center = (this.ctx ?? this.game).player.position.clone();
  for (let i = 0; i < 7; i += 1) {
    const angle = i / 7 * Math.PI * 2 + rand(-.22, .22);
    const radius = i === 0 ? 0 : rand(2, 6.8);
    const point = center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    point.y = (this.ctx ?? this.game).world.heightAt(point.x, point.z);
    this._delay(i * .09, () => this._telegraphCircle(point, 1.55, .72, 0x7de57b, () => {
      (this.ctx ?? this.game).effects.pillar(point, 0x73d26f, 4.5, { life: .62, bottom: .62 });
      if ((this.ctx ?? this.game).player.position.distanceTo(point) < 1.85) this._damagePlayer(enemy.damage * .88, (this.ctx ?? this.game).player.position.clone().sub(point).setY(0).normalize(), 4.8, enemy);
    }, { fillOpacity: .14 }));
  }
},

_bossStampede(enemy) {
  // Ground trampling lanes — do NOT relocate the boss (old charge dashes felt like
  // teleport-flee and dragged zone-boss fights into long chase downtime).
  const game = this.ctx ?? this.game;
  const origin = enemy.position.clone();
  const toPlayer = game.player.position.clone().sub(origin).setY(0);
  const base = toPlayer.lengthSq() > 1e-6 ? toPlayer.normalize() : enemy.facing.clone().setY(0).normalize();
  const laneLength = 12;
  for (let i = -1; i <= 1; i += 1) {
    this._delay((i + 1) * 0.42, () => {
      if (!enemy.alive) return;
      const direction = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.32);
      this._lineTelegraph(origin, direction, laneLength, 2.6, 0.68, 0xb7ef8a, () => {
        if (!enemy.alive) return;
        game.effects.ring(origin, 0xb7ef8a, enemy.radius * 2.4, { life: 0.4, startScale: 0.12 });
        game.effects.burst(origin.clone().addScaledVector(direction, 4), 0xa8f087, 16, {
          speed: 4.2, size: 0.32, life: 0.55, gravity: 2,
        });
        // Sample a few points along the lane for player contact.
        const playerPos = game.player.position;
        let hit = false;
        for (let s = 0; s <= 6; s += 1) {
          const sample = origin.clone().addScaledVector(direction, (s / 6) * laneLength);
          sample.y = game.world.heightAt(sample.x, sample.z);
          if (playerPos.distanceTo(sample) < 1.55 + (enemy.radius ?? 1)) {
            hit = true;
            break;
          }
        }
        if (hit) {
          this._damagePlayer(enemy.damage * 1.05, direction, 8, enemy);
        }
      });
    });
  }
},

_bossSandstorm(enemy) {
  this._telegraphCircle(enemy.position, 7.2, .9, 0xffc266, () => {
    if (!enemy.alive) return;
    (this.ctx ?? this.game).effects.ring(enemy.position, 0xffc266, 7.2, { life: .8, startScale: .1 });
    for (let i = 0; i < 18; i += 1) {
      const direction = new THREE.Vector3(Math.cos(i / 18 * Math.PI * 2), 0, Math.sin(i / 18 * Math.PI * 2));
      this._spawnEnemyProjectile(enemy, direction, {
        style: 'enemy_ember', color: 0xffb95f, speed: 8.2, damage: enemy.damage * .62, size: .28,
      });
    }
    if ((this.ctx ?? this.game).player.position.distanceTo(enemy.position) < 7.5) {
      const direction = (this.ctx ?? this.game).player.position.clone().sub(enemy.position).setY(0).normalize();
      this._damagePlayer(enemy.damage * 1.15, direction, 8, enemy);
    }
  }, { follows: enemy, fillOpacity: .15 });
},

_bossBlizzard(enemy) {
  const center = (this.ctx ?? this.game).player.position.clone();
  for (let i = 0; i < 10; i += 1) {
    const point = center.clone().add(new THREE.Vector3(rand(-7, 7), 0, rand(-7, 7)));
    point.y = (this.ctx ?? this.game).world.heightAt(point.x, point.z);
    this._delay(i * .12, () => this._telegraphCircle(point, 1.75, .62, 0xc9f6ff, () => {
      (this.ctx ?? this.game).effects.pillar(point, 0xdffbff, 5.5, { life: .6, bottom: .48 });
      (this.ctx ?? this.game).effects.burst(point, 0xe9fdff, 11, { speed: 3.8, size: .26, life: .65, gravity: 3 });
      if ((this.ctx ?? this.game).player.position.distanceTo(point) < 2) this._damagePlayer(enemy.damage * .78, (this.ctx ?? this.game).player.position.clone().sub(point).setY(0).normalize(), 3.5, enemy);
    }, { fillOpacity: .12 }));
  }
},

_bossInferno(enemy) {
  const center = (this.ctx ?? this.game).player.position.clone();
  const rings = [2.8, 5.4, 8];
  rings.forEach((ring, ringIndex) => {
    for (let i = 0; i < 7; i += 1) {
      const angle = i / 7 * Math.PI * 2 + ringIndex * .34;
      const point = center.clone().add(new THREE.Vector3(Math.cos(angle) * ring, 0, Math.sin(angle) * ring));
      point.y = (this.ctx ?? this.game).world.heightAt(point.x, point.z);
      this._delay(ringIndex * .22 + i * .035, () => this._telegraphCircle(point, 1.35, .68, 0xff6b45, () => {
        (this.ctx ?? this.game).effects.pillar(point, 0xff5e38, 5, { life: .68, bottom: .75 });
        if ((this.ctx ?? this.game).player.position.distanceTo(point) < 1.65) this._damagePlayer(enemy.damage * .74, (this.ctx ?? this.game).player.position.clone().sub(point).setY(0).normalize(), 4.5, enemy);
      }, { fillOpacity: .16 }));
    }
  });
},

_bossEclipse(enemy) {
  const center = enemy.position.clone();
  this._telegraphCircle(center, 9.2, 1.05, 0xc184ff, () => {
    if (!enemy.alive) return;
    (this.ctx ?? this.game).effects.pillar(center, 0xc184ff, 11, { life: 1.1, bottom: 1.6 });
    for (let i = 0; i < 24; i += 1) {
      const angle = i / 24 * Math.PI * 2;
      const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      this._spawnEnemyProjectile(enemy, direction, {
        style: i % 2 ? 'enemy_void' : 'enemy_bolt',
        color: i % 2 ? 0xc184ff : 0x7fcfff, speed: 7.2 + (i % 3) * .6,
        damage: enemy.damage * .56, size: .31, homing: i % 4 === 0 ? .18 : 0,
      });
    }
    const distance = (this.ctx ?? this.game).player.position.distanceTo(center);
    if (distance < 9.4) this._damagePlayer(enemy.damage * 1.2, (this.ctx ?? this.game).player.position.clone().sub(center).setY(0).normalize(), 10, enemy);

  }, { follows: enemy, fillOpacity: .18 });
},

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
},

  });
}
