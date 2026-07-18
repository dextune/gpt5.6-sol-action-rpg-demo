import * as THREE from 'three';
import {
  GAME_CONFIG, HORDE_CONFIG, HUNT_SPAWN_CONFIG, HUNT_THREAT_CONFIG, MAX_HUNT_CONFIG,
} from '../config.js';
import {
  ELITE_AFFIXES, ENEMY_TYPES, MAX_HUNT_INVASION_ROSTER, ZONES, ZONE_BOSSES, ZONE_SPAWNS,
  enemiesByZoneRole,
} from '../data/content.js';
import { chance, clamp, rand, randInt, weightedPick } from '../core/Utils.js';
import { createGameContext } from '../core/GameContext.js';
import { Enemy } from '../entities/Enemy.js';
import {
  clampHuntSpawnLevel,
  maxHuntPopulationTarget,
  maxHuntSpawnLevel,
  zoneThreat,
} from './huntThreat.js';

const TMP = new THREE.Vector3();

/** Roles preferred as pack "alpha" vs fodder fill. */
const PACK_ALPHA_ROLES = Object.freeze(['frontline', 'bruiser', 'rusher']);
const PACK_FILL_ROLES = Object.freeze(['fodder_swarm', 'skirmisher', 'bruiser']);
const PACK_RANGED_ROLES = Object.freeze(['glass_ranged', 'artillery', 'controller']);
const HUNT_ARTILLERY_CAP = 3;

export class EnemySystem {
  constructor(game) {
    this.game = game;
    this.ctx = game?.ctx ?? createGameContext(game);
    this.enemies = [];
    this.spawnTimer = .2;
    this.separationTimer = 0;
    this.spawnedByZone = Object.fromEntries(Object.keys(ZONES).map(id => [id, 0]));
    /** Cap summoning-affix spawns per short window. */
    this.summonBudget = 0;
  }

  get activeBoss() {
    return this.enemies.find(enemy => enemy.boss && enemy.alive) ?? null;
  }

  get livingCount() {
    let count = 0;
    for (const enemy of this.enemies) if (enemy.alive && !enemy.boss) count += 1;
    return count;
  }

  /** Single authority for living hard cap (MAX vs legacy). Defense never uses this. */
  get activeEnemyCap() {
    return this.game.hunt?.isMax ? MAX_HUNT_CONFIG.maxEnemies : GAME_CONFIG.maxEnemies;
  }

  get activeCapBuffer() {
    return this.game.hunt?.isMax ? MAX_HUNT_CONFIG.capBuffer : HUNT_SPAWN_CONFIG.capBuffer;
  }

  get activeSpawnInner() {
    return this.game.hunt?.isMax ? MAX_HUNT_CONFIG.spawnInnerRadius : GAME_CONFIG.spawnInnerRadius;
  }

  get activeSpawnOuter() {
    return this.game.hunt?.isMax ? MAX_HUNT_CONFIG.spawnOuterRadius : GAME_CONFIG.spawnOuterRadius;
  }

  get activePackMin() {
    return this.game.hunt?.isMax ? MAX_HUNT_CONFIG.packMin : HORDE_CONFIG.packMin;
  }

  get activePackMax() {
    return this.game.hunt?.isMax ? MAX_HUNT_CONFIG.packMax : HORDE_CONFIG.packMax;
  }

  /** Room under hard cap + buffer. */
  #spawnRoom() {
    return this.activeEnemyCap + this.activeCapBuffer - this.enemies.length;
  }

  update(delta) {
    const ctx = this.ctx ?? this.game;
    const player = ctx.player;
    this.spawnTimer -= delta;
    this.separationTimer -= delta;
    this.summonBudget = Math.max(0, this.summonBudget - delta * 0.35);

    const defenseMode = this.game.mode === 'defense';
    const huntMode = this.game.mode === 'hunt';
    const isMax = Boolean(this.game.hunt?.isMax);

    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      enemy.update(delta, this.game);
      const distance = enemy.position.distanceTo(player.position);
      const stale = this.game.elapsed - enemy.lastHitAt > 8;
      // Never stale-despawn wave-tagged enemies (or anything in Defense) — soft-lock guard.
      const skipDespawn = defenseMode || enemy.defenseWave;
      if (!enemy.boss && enemy.alive && distance > GAME_CONFIG.despawnRadius && stale && !skipDespawn) {
        enemy.forceRemove();
      }
      if (enemy.removable) this.enemies.splice(i, 1);
    }

    if (this.separationTimer <= 0) {
      this.separationTimer = .12;
      this.#separateCrowds();
    }

    // Continuous field spawn is Hunt-only. Defense authors its own wave encounters.
    if (huntMode && this.spawnTimer <= 0 && this.game.state === 'playing' && player.alive) {
      const sparseLiving = isMax ? MAX_HUNT_CONFIG.sparseLiving : HUNT_SPAWN_CONFIG.sparseLiving;
      const sparseInterval = isMax ? MAX_HUNT_CONFIG.sparseInterval : HUNT_SPAWN_CONFIG.sparseInterval;
      const steadyInterval = isMax ? MAX_HUNT_CONFIG.steadyInterval : HUNT_SPAWN_CONFIG.steadyInterval;
      const rampingMax = isMax && ['opening', 'surge', 'respawn'].includes(this.game.hunt?.invasionPhase);
      this.spawnTimer = rampingMax
        ? MAX_HUNT_CONFIG.surgeInterval
        : this.livingCount < sparseLiving
          ? sparseInterval
          : steadyInterval;

      let target;
      if (isMax) {
        const phase = this.game.hunt.invasionPhase;
        const elapsed = this.game.hunt.invasionElapsed ?? 0;
        target = maxHuntPopulationTarget(phase, elapsed);
        if (phase === 'respawn' && elapsed >= 8) this.game.hunt.invasionPhase = 'steady';
        target = Math.min(target, this.activeEnemyCap);
      } else {
        target = clamp(
          GAME_CONFIG.targetEnemies
            + Math.floor(Math.max(0, player.level - 1) / HUNT_SPAWN_CONFIG.levelTargetDivisor),
          Math.min(HUNT_SPAWN_CONFIG.initialEnemies, GAME_CONFIG.targetEnemies),
          this.activeEnemyCap,
        );
      }

      if (this.livingCount < target) {
        const room = this.#spawnRoom();
        const targetRoom = Math.max(0, target - this.livingCount);
        const zone = ctx.world.currentZone;
        const threat = zoneThreat(player.level, zone);
        const pressure = this.livingCount < HUNT_THREAT_CONFIG.packPressureLiving
          && (threat.id === 'onlevel' || threat.id === 'challenging');
        const packRoll = isMax
          ? 0.82
          : pressure
            ? HUNT_THREAT_CONFIG.packPressureChance
            : HORDE_CONFIG.packChance;
        if (room >= this.activePackMin && chance(packRoll)) {
          const packCount = Math.min(room, targetRoom, this.activePackMax);
          if (packCount >= this.activePackMin) this.spawnPack(null, packCount);
          else this.#spawnOne();
        } else {
          this.#spawnOne();
        }
      }
    }
  }

  #huntSpawnLevel(data, zone, player, options = {}) {
    if (this.game.hunt?.isMax) {
      return maxHuntSpawnLevel({
        playerLevel: player.level,
        role: data?.role,
        elite: Boolean(options.elite),
        boss: Boolean(data?.boss || options.boss),
        rngOffset: Math.random(),
      });
    }
    const levelFloor = Math.max(data.level, zone.minLevel ?? 1);
    const adaptive = player.level + randInt(-3, 2) + Math.max(0, this.game.hunt.worldTier - 1) * 2;
    const raw = Math.max(levelFloor, adaptive);
    return clampHuntSpawnLevel(raw, zone);
  }

  #spawnOne() {
    const player = this.game.player;
    const world = this.game.world;
    const position = world.randomSpawnAround(player.position, this.activeSpawnInner, this.activeSpawnOuter);
    const zone = world.zoneAt(position.x, position.z);
    const entries = this.#huntSpawnEntries(zone.id);
    const typeId = weightedPick(entries);
    const data = ENEMY_TYPES[typeId];
    if (!data) return null;

    const eliteCap = this.game.hunt?.isMax ? MAX_HUNT_CONFIG.eliteLiveCap : 7;
    const eliteChance = clamp(.045 + player.luck * .65 + this.game.hunt.worldTier * .006, .045, .26);
    const elite = chance(eliteChance) && this.enemies.filter(enemy => enemy.elite && enemy.alive).length < eliteCap;
    const level = this.#huntSpawnLevel(data, zone, player, { elite });
    const eliteAffix = elite ? this.rollEliteAffix(zone.id) : null;
    // ~70% fodder; elites/bosses never fodder (enforced in Enemy + here).
    const fodder = !elite && !data.boss && chance(HORDE_CONFIG.fodderRatio);
    const enemy = this.spawn(data, position, { level, elite, eliteAffix, fodder });
    if (enemy && this.game.hunt?.isMax) {
      enemy.aggroRadius = Math.max(enemy.aggroRadius, MAX_HUNT_CONFIG.aggroRange);
    }
    return enemy;
  }

  /** Soft artillery/support cap so Hunt backline does not stack unfairly. */
  #huntSpawnEntries(zoneId) {
    const base = ZONE_SPAWNS[zoneId] ?? ZONE_SPAWNS.verdant;
    // MAX HUNT mixes invasion roster so the village is not only early-zone fodder.
    let pool = base;
    if (this.game.hunt?.isMax && MAX_HUNT_INVASION_ROSTER?.length) {
      const localW = MAX_HUNT_CONFIG.invasionRosterLocalWeight;
      const invW = MAX_HUNT_CONFIG.invasionRosterGlobalWeight;
      pool = [
        ...base.map(e => ({ id: e.id, weight: (e.weight ?? 1) * localW })),
        ...MAX_HUNT_INVASION_ROSTER.map(e => ({ id: e.id, weight: (e.weight ?? 1) * invW })),
      ];
    }
    const livingArtillery = this.enemies.filter(
      e => e.alive && !e.boss && (e.data.role === 'artillery' || e.data.role === 'controller'),
    ).length;
    if (livingArtillery < HUNT_ARTILLERY_CAP) return pool;
    const filtered = pool.filter(entry => {
      const data = ENEMY_TYPES[entry.id];
      return data && data.role !== 'artillery' && data.role !== 'controller';
    });
    return filtered.length ? filtered : pool;
  }

  #pickByRoles(zoneId, roles, fallbackEntries) {
    for (const role of roles) {
      const pool = enemiesByZoneRole(zoneId, role);
      if (!pool.length) continue;
      const weighted = pool.map(e => ({ id: e.id, weight: e.weight * (e.defenseWeight ?? 1) }));
      const id = weightedPick(weighted);
      if (id && ENEMY_TYPES[id]) return ENEMY_TYPES[id];
    }
    const typeId = weightedPick(fallbackEntries);
    return ENEMY_TYPES[typeId] ?? null;
  }

  /**
   * Spawn a clustered fodder pack near the player.
   * @param {string|object|null} typeOrData - enemy type id / data, or null for zone-weighted pick
   * @param {number|null} count - pack size (clamped to packMin..packMax and remaining cap)
   * @param {THREE.Vector3|null} origin - pack center; defaults to random ring around player
   */
  spawnPack(typeOrData = null, count = null, origin = null) {
    const player = this.game.player;
    const world = this.game.world;
    const packCap = this.#spawnRoom();
    if (packCap <= 0) return [];

    const size = Math.min(
      packCap,
      Math.max(
        1,
        count ?? randInt(this.activePackMin, this.activePackMax),
      ),
    );
    if (size < 1) return [];

    const center = origin?.clone?.()
      ?? world.randomSpawnAround(player.position, this.activeSpawnInner, this.activeSpawnOuter);
    world.resolvePosition(center, .7);

    const zone = world.zoneAt(center.x, center.z);
    const entries = this.#huntSpawnEntries(zone.id);
    let alpha = typeof typeOrData === 'string'
      ? ENEMY_TYPES[typeOrData]
      : typeOrData;
    // Role-aware pack: 1 alpha (frontline/bruiser/rusher) + fodder fills + optional ranged.
    if (!alpha) alpha = this.#pickByRoles(zone.id, PACK_ALPHA_ROLES, entries);
    if (!alpha || alpha.boss) return [];

    // Brief ring telegraph at pack origin.
    const accent = alpha.accent ?? 0xff5d72;
    this.game.effects?.ring?.(center, accent, 2.8, {
      life: HORDE_CONFIG.packTelegraphSec,
      startScale: 0.12,
      height: 0.06,
      opacity: 0.55,
    });

    const level = this.#huntSpawnLevel(alpha, zone, player);
    const includeRanged = size >= 4 && chance(0.45);
    const rangedData = includeRanged
      ? this.#pickByRoles(zone.id, PACK_RANGED_ROLES, entries)
      : null;

    const spawned = [];
    for (let i = 0; i < size; i += 1) {
      if (this.enemies.length >= this.activeEnemyCap + this.activeCapBuffer) break;
      const angle = (i / size) * Math.PI * 2 + rand(-0.25, 0.25);
      const dist = rand(0.4, 2.5);
      const pos = new THREE.Vector3(
        center.x + Math.cos(angle) * dist,
        0,
        center.z + Math.sin(angle) * dist,
      );
      world.resolvePosition(pos, .55);
      let data = alpha;
      if (i === 0) data = alpha;
      else if (rangedData && i === size - 1) data = rangedData;
      else data = this.#pickByRoles(zone.id, PACK_FILL_ROLES, entries) ?? alpha;
      // Packs are always fodder clusters (never elite); alpha may be non-fodder silhouette.
      const fodder = i > 0 || data.role === 'fodder_swarm';
      const unitLevel = this.game.hunt?.isMax
        ? this.#huntSpawnLevel(data, zone, player, { elite: false })
        : level;
      const enemy = this.spawn(data, pos, { level: unitLevel, elite: false, fodder });
      if (enemy) {
        if (this.game.hunt?.isMax) {
          enemy.aggroRadius = Math.max(enemy.aggroRadius, MAX_HUNT_CONFIG.aggroRange);
        }
        spawned.push(enemy);
      }
    }
    return spawned;
  }

  /**
   * MAX HUNT opening: eight perimeter sectors, telegraphs, role-aware packs, distributed elites.
   * Spawns outside camp (World.randomSpawnAround exclusion); AI immediately invades.
   */
  startMaxHuntInvasion() {
    if (!this.game.hunt?.isMax) {
      this.populate(HUNT_SPAWN_CONFIG.initialEnemies);
      return this.livingCount;
    }
    const player = this.game.player;
    const world = this.game.world;
    const sectors = MAX_HUNT_CONFIG.sectors;
    const perSector = MAX_HUNT_CONFIG.enemiesPerSector;
    const ringInner = MAX_HUNT_CONFIG.spawnInnerRadius;
    const ringOuter = MAX_HUNT_CONFIG.spawnOuterRadius;
    const openingElites = MAX_HUNT_CONFIG.openingElites;
    const eliteSectors = new Set();
    while (eliteSectors.size < Math.min(openingElites, sectors)) {
      eliteSectors.add(randInt(0, sectors - 1));
    }
    let rangedSectors = 0;

    for (let s = 0; s < sectors; s += 1) {
      const baseAngle = (s / sectors) * Math.PI * 2 + rand(-0.08, 0.08);
      const dist = rand(ringInner, ringOuter);
      const origin = new THREE.Vector3(
        Math.cos(baseAngle) * dist,
        0,
        Math.sin(baseAngle) * dist,
      );
      // Keep origin outside camp exclusion with a small radial nudge if needed.
      const campMin = GAME_CONFIG.campRadius + 4;
      const oh = Math.hypot(origin.x, origin.z);
      if (oh < campMin && oh > 0.001) {
        origin.x *= campMin / oh;
        origin.z *= campMin / oh;
      }
      world.resolvePosition(origin, 0.7);

      this.game.effects?.ring?.(origin, 0xff6a4a, 3.2, {
        life: 0.7,
        startScale: 0.1,
        height: 0.07,
        opacity: 0.62,
      });

      const zone = world.zoneAt(origin.x, origin.z);
      const entries = this.#huntSpawnEntries(zone.id);
      const alpha = this.#pickByRoles(zone.id, PACK_ALPHA_ROLES, entries)
        ?? ENEMY_TYPES[weightedPick(entries)];
      if (!alpha || alpha.boss) continue;

      const wantRanged = rangedSectors < 2 || chance(0.35);
      const rangedData = wantRanged
        ? this.#pickByRoles(zone.id, PACK_RANGED_ROLES, entries)
        : null;
      if (rangedData) rangedSectors += 1;

      const placeElite = eliteSectors.has(s);
      for (let i = 0; i < perSector; i += 1) {
        if (this.enemies.length >= this.activeEnemyCap + this.activeCapBuffer) break;
        const angle = baseAngle + (i / perSector) * 0.55 + rand(-0.1, 0.1);
        const d = dist + rand(-1.2, 1.2);
        const pos = new THREE.Vector3(Math.cos(angle) * d, 0, Math.sin(angle) * d);
        world.resolvePosition(pos, 0.55);
        let data = alpha;
        if (rangedData && i === perSector - 1) data = rangedData;
        else if (i > 0) data = this.#pickByRoles(zone.id, PACK_FILL_ROLES, entries) ?? alpha;
        const elite = placeElite && i === 0;
        const level = this.#huntSpawnLevel(data, zone, player, { elite });
        const fodder = !elite && (i > 0 || data.role === 'fodder_swarm');
        const enemy = this.spawn(data, pos, {
          level,
          elite,
          eliteAffix: elite ? this.rollEliteAffix(zone.id) : null,
          fodder,
        });
        if (enemy) {
          enemy.aggroRadius = Math.max(enemy.aggroRadius, MAX_HUNT_CONFIG.aggroRange);
        }
      }
    }

    this.game.hunt.invasionPhase = 'opening';
    this.game.hunt.invasionElapsed = 0;
    this.spawnTimer = MAX_HUNT_CONFIG.sparseInterval;
    return this.livingCount;
  }

  /** Post-death / Continue perimeter pressure (bounded; not a full opening grant). */
  startMaxHuntPressure(count = MAX_HUNT_CONFIG.respawn.immediate) {
    if (!this.game.hunt?.isMax) {
      this.populate(count);
      return this.livingCount;
    }
    this.game.hunt.invasionPhase = 'respawn';
    this.game.hunt.invasionElapsed = count >= MAX_HUNT_CONFIG.respawn.recovery8s
      ? 8
      : count >= MAX_HUNT_CONFIG.respawn.recovery3s
        ? 3
        : 0;
    this.populate(Math.min(count, this.activeEnemyCap));
    for (const enemy of this.enemies) {
      if (enemy.alive) enemy.aggroRadius = Math.max(enemy.aggroRadius, MAX_HUNT_CONFIG.aggroRange);
    }
    this.spawnTimer = MAX_HUNT_CONFIG.sparseInterval;
    return this.livingCount;
  }

  rollEliteAffix(zoneId = null) {
    const pool = ELITE_AFFIXES.filter(a => {
      if (!a.zones?.length) return true;
      return zoneId && a.zones.includes(zoneId);
    });
    const list = pool.length ? pool : ELITE_AFFIXES;
    const weighted = list.map(a => ({ id: a.id, weight: a.weight ?? 1 }));
    return weightedPick(weighted) ?? 'enraged';
  }

  /** Label helper for elite notifications / HUD. */
  eliteAffixLabel(affixId) {
    return ELITE_AFFIXES.find(a => a.id === affixId)?.label
      ?? (affixId ? affixId[0].toUpperCase() + affixId.slice(1) : '');
  }

  populate(count = HUNT_SPAWN_CONFIG.initialEnemies) {
    const target = Math.min(count, this.activeEnemyCap);
    // Fill denser with packs first, then singles to top off.
    while (this.livingCount < target) {
      const room = target - this.livingCount;
      if (room >= this.activePackMin && chance(HUNT_SPAWN_CONFIG.populatePackChance)) {
        const want = Math.min(room, randInt(this.activePackMin, this.activePackMax));
        const before = this.livingCount;
        this.spawnPack(null, want);
        if (this.livingCount <= before) this.#spawnOne();
      } else {
        const before = this.livingCount;
        this.#spawnOne();
        if (this.livingCount <= before) break;
      }
    }
    this.spawnTimer = this.game.hunt?.isMax
      ? MAX_HUNT_CONFIG.steadyInterval
      : HUNT_SPAWN_CONFIG.steadyInterval;
  }

  spawn(dataOrId, position, options = {}) {
    const data = typeof dataOrId === 'string' ? ENEMY_TYPES[dataOrId] : dataOrId;
    if (!data || this.enemies.length >= this.activeEnemyCap + this.activeCapBuffer) return null;
    const spawnPosition = position.clone();
    this.game.world.resolvePosition(spawnPosition, .7);
    const enemy = new Enemy(this.game.scene, data, spawnPosition, {
      ...options,
      worldTier: this.game.hunt.worldTier,
    }, this.game.monsterFactory, this.game.renderPipeline?.quality ?? 'medium');
    this.enemies.push(enemy);
    this.spawnedByZone[data.zone] = (this.spawnedByZone[data.zone] ?? 0) + 1;
    if (enemy.elite) {
      const accent = enemy.eliteAffix === 'shielded' || enemy.eliteAffix === 'frostbitten' ? 0x7ad8ff
        : enemy.eliteAffix === 'volatile' || enemy.eliteAffix === 'molten' ? 0xff9040
          : enemy.eliteAffix === 'arcane' || enemy.eliteAffix === 'summoning' ? 0xc184ff
            : enemy.eliteAffix === 'hasted' ? 0x7affc8
              : enemy.eliteAffix === 'fortified' ? 0xc0b090
                : enemy.eliteAffix === 'vampiric' ? 0xff6080
                  : 0xffd66b;
      this.game.effects.pillar(enemy.position, accent, 4.2, { life: .5, bottom: .55 });
      this.game.effects.ring(enemy.position, accent, 2.3, { life: .48 });
      if (enemy.eliteAffix) {
        this.game.ui?.notify?.(
          `Elite · ${this.eliteAffixLabel(enemy.eliteAffix)} ${enemy.data.name}`,
          'uncommon',
          2.4,
        );
      }
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
    let level;
    if (this.game.hunt?.isMax) {
      level = maxHuntSpawnLevel({
        playerLevel: this.game.player.level,
        boss: true,
        rngOffset: 0.5,
      });
      level = Math.max(data.level, level);
    } else {
      const rawBossLevel = Math.max(
        data.level,
        this.game.player.level + 2 + (this.game.hunt.worldTier - 1) * 2,
      );
      // Keep zone ladder; softcap on player receive still blunts underlevel boss spikes.
      level = Math.max(data.level, clampHuntSpawnLevel(rawBossLevel, zone));
    }
    const boss = this.spawn(data, position, { level, elite: false, fodder: false });
    if (boss) {
      if (this.game.hunt?.isMax) {
        boss.aggroRadius = Math.max(boss.aggroRadius, MAX_HUNT_CONFIG.aggroRange);
      }
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
