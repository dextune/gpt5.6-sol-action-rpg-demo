import * as THREE from 'three';
import { GAME_CONFIG } from '../config.js';
import { ENEMY_TYPES, ZONES, ZONE_BOSSES, ZONE_SPAWNS } from '../data/content.js';
import { chance, clamp, rand, randInt, weightedPick } from '../core/Utils.js';
import { Enemy } from '../entities/Enemy.js';

const TMP = new THREE.Vector3();

export class EnemySystem {
  constructor(game) {
    this.game = game;
    this.enemies = [];
    this.spawnTimer = .2;
    this.separationTimer = 0;
    this.spawnedByZone = Object.fromEntries(Object.keys(ZONES).map(id => [id, 0]));
  }

  get activeBoss() {
    return this.enemies.find(enemy => enemy.boss && enemy.alive) ?? null;
  }

  get livingCount() {
    let count = 0;
    for (const enemy of this.enemies) if (enemy.alive && !enemy.boss) count += 1;
    return count;
  }

  update(delta) {
    this.spawnTimer -= delta;
    this.separationTimer -= delta;

    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      enemy.update(delta, this.game);
      const distance = enemy.position.distanceTo(this.game.player.position);
      const stale = this.game.elapsed - enemy.lastHitAt > 8;
      if (!enemy.boss && enemy.alive && distance > GAME_CONFIG.despawnRadius && stale) enemy.forceRemove();
      if (enemy.removable) this.enemies.splice(i, 1);
    }

    if (this.separationTimer <= 0) {
      this.separationTimer = .12;
      this.#separateCrowds();
    }

    if (this.spawnTimer <= 0 && this.game.state === 'playing' && this.game.player.alive) {
      this.spawnTimer = this.livingCount < 10 ? .07 : .26;
      const target = clamp(GAME_CONFIG.targetEnemies + Math.floor(this.game.player.level / 8), 32, GAME_CONFIG.maxEnemies);
      if (this.livingCount < target) this.#spawnOne();
    }
  }

  #spawnOne() {
    const player = this.game.player;
    const world = this.game.world;
    const position = world.randomSpawnAround(player.position, GAME_CONFIG.spawnInnerRadius, GAME_CONFIG.spawnOuterRadius);
    const zone = world.zoneAt(position.x, position.z);
    const entries = ZONE_SPAWNS[zone.id] ?? ZONE_SPAWNS.verdant;
    const typeId = weightedPick(entries);
    const data = ENEMY_TYPES[typeId];
    if (!data) return null;

    const levelFloor = Math.max(data.level, zone.minLevel);
    const adaptive = player.level + randInt(-3, 2) + Math.max(0, this.game.hunt.worldTier - 1) * 2;
    const level = Math.max(levelFloor, adaptive);
    const eliteChance = clamp(.045 + player.luck * .65 + this.game.hunt.worldTier * .006, .045, .26);
    const elite = chance(eliteChance) && this.enemies.filter(enemy => enemy.elite && enemy.alive).length < 7;
    return this.spawn(data, position, { level, elite });
  }

  populate(count = 24) {
    const target = Math.min(count, GAME_CONFIG.maxEnemies);
    for (let i = 0; i < target; i += 1) this.#spawnOne();
    this.spawnTimer = .35;
  }

  spawn(dataOrId, position, options = {}) {
    const data = typeof dataOrId === 'string' ? ENEMY_TYPES[dataOrId] : dataOrId;
    if (!data || this.enemies.length >= GAME_CONFIG.maxEnemies + 4) return null;
    const spawnPosition = position.clone();
    this.game.world.resolvePosition(spawnPosition, .7);
    const enemy = new Enemy(this.game.scene, data, spawnPosition, {
      ...options,
      worldTier: this.game.hunt.worldTier,
    }, this.game.monsterFactory, this.game.renderPipeline?.quality ?? 'medium');
    this.enemies.push(enemy);
    this.spawnedByZone[data.zone] = (this.spawnedByZone[data.zone] ?? 0) + 1;
    if (enemy.elite) {
      this.game.effects.pillar(enemy.position, 0xffd66b, 4.2, { life: .5, bottom: .55 });
      this.game.effects.ring(enemy.position, 0xffd66b, 2.3, { life: .48 });
    }
    return enemy;
  }

  spawnBoss(zoneId = this.game.world.currentZone.id) {
    if (this.activeBoss) return this.activeBoss;
    const bossId = ZONE_BOSSES[zoneId] ?? ZONE_BOSSES.verdant;
    const data = ENEMY_TYPES[bossId];
    if (!data) return null;
    const zone = ZONES[zoneId] ?? ZONES.verdant;
    const angle = Math.atan2(
      this.game.player.position.z - zone.center[1],
      this.game.player.position.x - zone.center[0],
    ) + Math.PI + rand(-.55, .55);
    const distance = 20;
    const position = new THREE.Vector3(
      this.game.player.position.x + Math.cos(angle) * distance,
      0,
      this.game.player.position.z + Math.sin(angle) * distance,
    );
    if (Math.hypot(position.x, position.z) < GAME_CONFIG.campRadius + 7) {
      position.set(zone.center[0] + 12, 0, zone.center[1] + 12);
    }
    this.game.world.resolvePosition(position, 1.6);
    const level = Math.max(data.level, this.game.player.level + 2 + (this.game.hunt.worldTier - 1) * 2);
    const boss = this.spawn(data, position, { level, elite: false });
    if (boss) {
      this.game.audio.boss();
      this.game.effects.pillar(position, data.accent, 12, { life: 1.25, bottom: 1.9 });
      this.game.effects.ring(position, data.accent, 7, { life: 1.05, startScale: .06 });
      this.game.ui.notify(`Area boss emerging · ${data.name}`, 'boss', 4.2);

    }
    return boss;
  }

  #separateCrowds() {
    const living = this.enemies.filter(enemy => enemy.alive);
    for (let i = 0; i < living.length; i += 1) {
      const a = living[i];
      for (let j = i + 1; j < living.length; j += 1) {
        const b = living[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const minDistance = (a.radius + b.radius) * .72;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq <= .0001 || distanceSq >= minDistance * minDistance) continue;
        const distance = Math.sqrt(distanceSq);
        const push = (minDistance - distance) * .16 / distance;
        const bossA = a.boss ? .18 : 1;
        const bossB = b.boss ? .18 : 1;
        a.position.x -= dx * push * bossA;
        a.position.z -= dz * push * bossA;
        b.position.x += dx * push * bossB;
        b.position.z += dz * push * bossB;
      }
    }
  }

  enemiesNear(position, radius) {
    const result = [];
    const radiusSq = radius * radius;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      TMP.copy(enemy.position).sub(position);
      TMP.y = 0;
      if (TMP.lengthSq() <= radiusSq) result.push(enemy);
    }
    return result;
  }

  clear() {
    for (const enemy of this.enemies) enemy.forceRemove();
    this.enemies.length = 0;
    this.spawnTimer = .15;
    this.spawnedByZone = Object.fromEntries(Object.keys(ZONES).map(id => [id, 0]));
  }
}
