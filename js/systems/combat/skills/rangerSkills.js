/**
 * Active skill implementations — ranger (Sol combat, not template).
 * Attached onto CombatSystem.prototype; `this` is the CombatSystem instance.
 */
import * as THREE from 'three';
import { skillDamage } from '../../../data/skillCombat.js';
import { getFxTheme } from '../../../data/fxThemes.js';
import { getHeroClass } from '../../../data/content.js';
import { clamp } from '../../../core/Utils.js';

const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();

export function attachRangerSkillMethods(proto) {
  Object.assign(proto, {
_piercingShot(player, bundle, phase = null, apexAudio = null) {
  const fire = () => {
    if (!player.alive) return;
    const { combat, theme } = this._skillBundle(bundle);
    const direction = this._facingDir(player);
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    const points = [];
    let splinters = 0;
    let split = false;
    const apexBudget={targets:new Map(),casts:new Set()};
    const generations=this.rangerGeneration.get(player)??{};const generation=(generations.pierce??0)+1;generations.pierce=generation;this.rangerGeneration.set(player,generations);
    const current=()=>player.alive&&player.classId==='ranger'&&this.rangerGeneration.get(player)?.pierce===generation;
    const castId = `ranger-q-${++this.rangerSerial}`;
    (this.ctx ?? this.game).effects.recipeArrowStreak?.(player.position, direction, theme, Boolean(combat.railArrow));
    const start = player.position.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(direction, 1.0);
    this._spawnFriendlyOrb(start, direction, {
      style: 'heavy_arrow',
      color: theme.primary,
      damage: skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1),
      speed: (combat.speed ?? 18) * (combat.speedMult ?? 1),
      radius: (combat.radius ?? 0.95) * (combat.radiusMult ?? 1),
      life: combat.life ?? 1.15,
      pierce: Math.max(1, Math.round((combat.pierce ?? 3) + (combat.crowdPierce ?? 0))),
      knockback: combat.knockback ?? 3.2,
      skill: true,
      scale: combat.scale ?? 1.1,
      armorPierce: combat.armorPierce ?? 0.18,
      statusOnHit: combat.status ?? null,
      castId,
      ownerGuard:current,
      onHit: enemy => {
        this._apexAudioPhase(player,apexAudio,'impact');
        if (points.length < Math.min(6, combat.storedPierceCap ?? 6)) points.push(enemy.position.clone());
        if (combat.fishbone && splinters < Math.min(12, combat.splinterCap ?? 12)) {
          for (const sign of [-1, 1]) {
            if (splinters >= 12) break;
            const splinterDir = side.clone().multiplyScalar(sign);
            this._spawnFriendlyOrb(enemy.position.clone().add(new THREE.Vector3(0, .8, 0)).addScaledVector(splinterDir, enemy.radius + .7), splinterDir, {
              style: 'arrow', color: theme.secondary, damage: skillDamage(player.attackPower, combat) * combat.splinterMult,
              speed: 13, radius: .45, life: .34, pierce: 1, skill: true, reactionDepth: 1, castId,
            });
            splinters += 1;
          }
        }
        if (combat.splitArrow && !split) {
          split = true;
          for (const angle of [-.18, .18]) {
            const dir = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            this._spawnFriendlyOrb(enemy.position.clone().add(new THREE.Vector3(0, .8, 0)).addScaledVector(dir, enemy.radius + .7), dir, {
              style: 'arrow', color: theme.accent, damage: skillDamage(player.attackPower, combat) * combat.splitMult,
              speed: 16, radius: .5, life: .55, pierce: 1, skill: true, reactionDepth: 1, castId,
            });
          }
        }
        if (combat.dragonPiercer && (enemy.elite || enemy.boss)) enemy.addStagger?.(combat.bossStagger ?? 24);
      },
      onRetire: projectile => {
        if (projectile.suppressRetireAuthority || this._clearing || !current()) return;
        this._apexAudioPhase(player,apexAudio,'finisher');
        if (combat.backwardRelease && points.length) {
          const corridor = points.slice(0, 6);
          (this.ctx ?? this.game).effects.recipeRangerBackwardCorridor?.(corridor, direction, theme);
          for (const enemy of (this.ctx ?? this.game).enemies.enemies) {
            if (!enemy.alive) continue;
            const crossed = corridor.some(point => {
              const offset = enemy.position.clone().sub(point).setY(0);
              const along = offset.dot(direction.clone().negate());
              return along >= 0 && along <= 4.5 && offset.addScaledVector(direction, along).length() <= .7 + enemy.radius;
            });
            if (crossed) this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.backwardMult, {
              multiHit: true, skill: true, sameCastHit: { key: `${castId}:backward:${enemy.id}`, maxHits: 1 },
            });
          }
        }
        if (combat.horizonBreaker) {
          const ruptureHits = new Map();
          points.slice(0, Math.min(6, combat.ruptureCap ?? 6)).forEach((point, index) => this._delay(.08 + index * .05, () => {
          if(!current())return;
          (this.ctx ?? this.game).effects.recipeRangerRupture?.(point, direction, theme);
          for (const enemy of (this.ctx ?? this.game).enemies.enemies) {
            if (!enemy.alive || (ruptureHits.get(enemy.id) ?? 0) >= Math.min(2, combat.rupturePerEnemyCap ?? 2)
              || enemy.position.distanceTo(point) > 1.25 + enemy.radius) continue;
            const result = this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.ruptureMult, {
              multiHit: true, skill: true, sameCastHit: { key: `${castId}:rupture:${enemy.id}`, maxHits: 1 },
            });
            if(result.amount>0)this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat)*combat.ruptureMult,castKey:castId,budget:apexBudget});
            if (result.amount > 0) ruptureHits.set(enemy.id, (ruptureHits.get(enemy.id) ?? 0) + 1);
          }
        }));
        }
      },
    });
  };
  if (phase != null && phase !== 'full') fire();
  else fire();
},

_caltropTrap(player, bundle, apexAudio = null) {
  const { combat, theme } = this._skillBundle(bundle);
  if (!combat.seedLanded) {
    const direction = this._facingDir(player);
    const distance = combat.aim ?? 7.5;
    const start = player.position.clone().add(new THREE.Vector3(0, 1, 0));
    this._spawnFriendlyOrb(start, direction, {
      style: 'arrow', color: theme.primary, damage: skillDamage(player.attackPower, combat) * .35,
      speed: 15, radius: .4, life: distance / 15, pierce: 1, skill: true,
      onRetire: projectile => {
        if (projectile.suppressRetireAuthority || this._clearing || !player.alive || player.classId !== 'ranger') return;
        const impactCenter = projectile.mesh.position.clone(); impactCenter.y = (this.ctx ?? this.game).world.heightAt(impactCenter.x, impactCenter.z);
        this._caltropTrap(player, { ...bundle, combat: { ...combat, seedLanded: 1, impactCenter, seedFacing: direction } }, apexAudio);
      },
    });
    return;
  }
  const center = combat.impactCenter.clone();
  const castFacing = combat.seedFacing.clone();
  const radius = (combat.radius ?? 3.2) * (combat.radiusMult ?? 1);
  const ticks = Math.max(1, Math.round(combat.ticks ?? 5));
  const interval = combat.tickInterval ?? 0.55;
  const generation = (this.rangerGeneration.get(player)?.thorn ?? 0) + 1;
  const apexBudget={targets:new Map(),casts:new Set()};
  const generations = this.rangerGeneration.get(player) ?? {};
  generations.thorn = generation; this.rangerGeneration.set(player, generations);
  player.thornField = { generation, remaining: .08 + ticks * interval + .2, contacts: 0, planted: 0 };
  const current = () => player.alive && player.classId === 'ranger' && player.thornField?.generation === generation;
  (this.ctx ?? this.game).effects.recipeTrapField?.(center, theme, radius);
  this._apexAudioPhase(player,apexAudio,'impact');
  this._hitEnemiesInRadius(center, 1.1, skillDamage(player.attackPower, combat) * (combat.seedMult ?? 1), {
    multiHit: true, skill: true, sameCastHit: { key: `thorn-${generation}:seed-impact`, maxHits: 1 },
  });
  if (combat.openClose) this._delay(.05, () => current() && this._hitEnemiesInRadius(center, radius,
    skillDamage(player.attackPower, combat) * combat.burstMult, { multiHit: true, skill: true,
      sameCastHit: { key: `thorn-${generation}:open`, maxHits: 1 } }));
  for (let i = 0; i < ticks; i += 1) {
    this._delay(0.08 + i * interval, () => {
      if (!current()) return;
      (this.ctx ?? this.game).effects.ring(center, i % 2 ? theme.secondary : theme.primary, radius * (0.55 + i * 0.08), {
        life: 0.32, startScale: 0.3, height: 0.06, opacity: 0.55,
      });
      this._hitEnemiesInRadius(center, radius, skillDamage(player.attackPower, combat), {
        knockback: combat.knockback ?? 1.1,
        multiHit: true,
        skill: true,
        status: combat.status ?? null,
        sameCastHit: { key: `thorn-${generation}:tick-${i}`, maxHits: 1 },
        onHit: enemy => {
          player.thornField.contacts += 1;
          if (combat.snareBloom && enemy.controlCategory === 'normal'
            && (player.thornField.snares ?? 0) < Math.min(4, combat.snareCap ?? 4)) {
            player.thornField.snares = (player.thornField.snares ?? 0) + 1;
            enemy.pullToward?.(center, 0, .45, (this.ctx ?? this.game).world, (this.ctx ?? this.game).enemies.enemies);
          }
          const fieldTime = i * interval;
          if (combat.mineGarden && (enemy.elite || enemy.boss)
            && fieldTime >= (player.thornField.mineReadyAt ?? 0)
            && (player.thornField.mines ?? 0) < Math.min(3, combat.mineCap ?? 3)) {
            player.thornField.mines = (player.thornField.mines ?? 0) + 1;
            player.thornField.mineReadyAt = fieldTime + (combat.mineCooldown ?? .55);
            this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.mineMult, {
              multiHit: true, skill: true, sameCastHit: { key: `thorn-${generation}:mine-${player.thornField.mines}`, maxHits: 1 },
            });
          }
          if (combat.plantedEvery && player.thornField.contacts % combat.plantedEvery === 0
            && player.thornField.planted < Math.min(4, combat.plantedCap ?? 4)) {
            player.thornField.planted += 1;
            const dir = castFacing;
            this._spawnFriendlyOrb(center.clone().add(new THREE.Vector3(0, .6, 0)), dir, {
              style: 'arrow', color: theme.secondary, damage: skillDamage(player.attackPower, combat) * combat.plantedMult,
              speed: 15, radius: .45, life: .5, pierce: 2, skill: true, reactionDepth: 1,
            });
          }
        },
      });
      if (combat.lineCount) {
        const side = new THREE.Vector3(-castFacing.z, 0, castFacing.x);
        const lineHits = new Map();
        for (let line = 0; line < Math.min(5, combat.lineCount); line += 1) {
          const lineCenter = center.clone().addScaledVector(side, (line - (combat.lineCount - 1) / 2) * 1.05);
          for (const enemy of (this.ctx ?? this.game).enemies.enemies) {
            if (!enemy.alive || (lineHits.get(enemy.id) ?? 0) >= 2) continue;
            const offset = enemy.position.clone().sub(lineCenter).setY(0);
            if (Math.abs(offset.dot(side)) > .42 + enemy.radius || Math.abs(offset.dot(castFacing)) > radius) continue;
            const result = this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * .32, {
              multiHit: true, skill: true, sameCastHit: { key: `thorn-${generation}:line-${i}-${line}:${enemy.id}`, maxHits: 1 },
            });
            if (result.amount > 0) lineHits.set(enemy.id, (lineHits.get(enemy.id) ?? 0) + 1);
          }
        }
      }
    });
  }
  this._delay(.1 + ticks * interval, () => {
    if (!current()) return;
    if (combat.openClose) this._hitEnemiesInRadius(center, radius, skillDamage(player.attackPower, combat) * combat.burstMult, {
      multiHit: true, skill: true, sameCastHit: { key: `thorn-${generation}:close`, maxHits: 1 },
    });
    if (combat.thornGrid) this._delay(.08, () => {
      if (!current()) return;
      this._apexAudioPhase(player,apexAudio,'finisher');
      (this.ctx ?? this.game).effects.recipeThornGrid?.(center, castFacing, theme, combat.gridLines ?? 0);
      const side = new THREE.Vector3(-castFacing.z, 0, castFacing.x);
      const axisHits = new Map();
      for (const enemy of (this.ctx ?? this.game).enemies.enemies) {
        if (!enemy.alive) continue;
        const offset = enemy.position.clone().sub(center).setY(0);
        const row = Math.abs(offset.dot(side)) <= .55 && Math.abs(offset.dot(castFacing)) <= radius;
        const column = Math.abs(offset.dot(castFacing)) <= .55 && Math.abs(offset.dot(side)) <= radius;
        for (const [axis, hit] of [['row', row], ['column', column]]) if (hit && (axisHits.get(enemy.id) ?? 0) < 2) {
          const result = this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.finaleMult * .5, {
            multiHit: true, skill: true, sameCastHit: { key: `thorn-${generation}:grid:${axis}:${enemy.id}`, maxHits: 1 },
          });
          if(result.amount>0)this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat)*combat.finaleMult*.5,castKey:`thorn-${generation}`,budget:apexBudget});
          if (result.amount > 0) axisHits.set(enemy.id, (axisHits.get(enemy.id) ?? 0) + 1);
        }
      }
      player.thornField = null;
    }); else player.thornField = null;
  });
},

_vaultShot(player, bundle, apexAudio = null) {
  const { combat, theme } = this._skillBundle(bundle);
  const forward = this._facingDir(player);
  const back = forward.clone().multiplyScalar(-1);
  const from = player.position.clone();
  if (bundle.playerLevel < 20) {
    player.position.addScaledVector(back, combat.dash ?? 3.6);
    (this.ctx ?? this.game).world.resolvePosition(player.position, .48);
    player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? .4);
    (this.ctx ?? this.game).effects.recipeVaultVolley?.(from, player.position, forward, theme);
    const count = Math.min(12, Math.max(1, Math.round(combat.arrows ?? 4)));
    const yaw0 = Math.atan2(forward.x, forward.z);
    for (let i = 0; i < count; i += 1) {
      const yaw = yaw0 + (i - (count - 1) / 2) * (combat.spread ?? .14);
      const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      this._spawnFriendlyOrb(player.position.clone().add(new THREE.Vector3(0, 1.15, 0)), dir, {
        style: 'arrow', color: theme.primary, damage: skillDamage(player.attackPower, combat), speed: combat.speed,
        radius: combat.radius, life: combat.life, pierce: 1, skill: true, criticalBonus: combat.criticalBonus,
      });
    }
    return;
  }
  const generations = this.rangerGeneration.get(player) ?? {};
  const generation = (generations.vault ?? 0) + 1;
  generations.vault = generation; this.rangerGeneration.set(player, generations);
  const current = () => player.alive && player.classId === 'ranger' && this.rangerGeneration.get(player)?.vault === generation;
  const dash = (combat.dash ?? 3.6) * (combat.dashMult ?? 1);
  const landing = from.clone().addScaledVector(back, dash);
  (this.ctx ?? this.game).world.resolvePosition(landing, 0.48);
  player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.4);
  (this.ctx ?? this.game).effects.recipeVaultVolley?.(from, landing, forward, theme);
  (this.ctx ?? this.game).effects.recipeSkyHunterArc?.(from, landing, forward, theme, combat.volleyLayers ?? 1);
  const arrows = Math.min(12, Math.max(1, Math.round(combat.arrows ?? 4)));
  const baseYaw = Math.atan2(forward.x, forward.z);
  const spread = (combat.spread ?? 0.14) * (combat.spreadMult ?? 1);
  const usedRedirects = new Set();
  const apexBudget={targets:new Map(),casts:new Set()};
  const shootLayer = (origin, count, layer = 0, landingLayer = false) => { for (let i = 0; i < count; i += 1) {
    const yaw = baseYaw + (i - (count - 1) / 2) * spread;
    let dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    if (combat.redirect && usedRedirects.size < Math.min(combat.redirectCap ?? 6, 6)) {
      const target = (this.ctx ?? this.game).enemies.enemies.filter(enemy => enemy.alive && !usedRedirects.has(enemy.id))
        .map(enemy => ({ enemy, offset: enemy.position.clone().sub(origin).setY(0) }))
        .filter(entry => entry.offset.length() <= 12 && entry.offset.normalize().dot(dir) >= Math.cos(35 * Math.PI / 180))
        .sort((a, b) => a.enemy.position.distanceToSquared(origin) - b.enemy.position.distanceToSquared(origin))[0]?.enemy;
      if (target) { usedRedirects.add(target.id); dir = target.position.clone().sub(origin).setY(0).normalize(); }
    }
    const start = origin.clone().add(new THREE.Vector3(0, 1.15 + layer * .3, 0)).addScaledVector(dir, 0.55);
    this._spawnFriendlyOrb(start, dir, {
      style: 'arrow',
      color: i % 2 ? theme.secondary : theme.primary,
      damage: skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1),
      speed: combat.speed ?? 16.5,
      radius: combat.radius ?? 0.88,
      life: combat.life ?? 0.85,
      pierce: 1,
      knockback: combat.knockback ?? 2.6,
      skill: true,
      scale: 0.95,
      criticalBonus: combat.criticalBonus ?? 0.06,
      onHit: landingLayer ? enemy => {
        const distance = enemy.position.distanceTo(landing);
        if (combat.idealMin&&(enemy.elite || enemy.boss) && distance >= combat.idealMin && distance <= combat.idealMax) this._damageEnemy(enemy,
          skillDamage(player.attackPower, combat) * (combat.idealMult - 1), { multiHit: true, skill: true,
            sameCastHit: { key: `vault-${generation}:ideal:${enemy.id}`, maxHits: 1 } });
        if(combat.skyHunter)this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat)*(combat.damageMult??1),castKey:`vault-${generation}`,budget:apexBudget});
      } : null,
    });
  }};
  const landingCount = combat.landingShot ? (combat.skyHunter ? Math.min(4, arrows) : 1) : 0;
  const airCount = combat.airVolley ? Math.min(4, Math.max(0, arrows - landingCount - 1)) : 0;
  const launchCount = Math.max(1, arrows - airCount - landingCount);
  this._delay(.05, () => {
    if (!current()) return;
    this._apexAudioPhase(player,apexAudio,'impact');
    if (combat.launchBlast) this._hitEnemiesInRadius(from, 2.1, skillDamage(player.attackPower, combat) * .7, { multiHit: true, skill: true });
    shootLayer(from, launchCount, 0);
  });
  this._delay(.14, () => {
    if (!current()) return;
    player.position.copy(landing); // one authoritative movement
    if (airCount) shootLayer(from.clone().add(landing).multiplyScalar(.5), airCount, 1);
  });
  this._delay(.3, () => {
    if (!current()) return;
    if (landingCount) shootLayer(landing, landingCount, 2, true);
    this._apexAudioPhase(player,apexAudio,'finisher');
  });
},

_detonateVerdict(player, verdict) {
  if (!verdict || player.predatorVerdict !== verdict) return false;
  const capturedMarkedTarget=verdict.target;
  player.predatorVerdict = null; // atomic before any derived authority
  const enemy = verdict.target;
  if (!enemy?.alive) return false;
  const { combat, theme } = this._skillBundle(verdict.bundle);
  (this.ctx ?? this.game).effects.recipePredatorConvergence?.(enemy.position, this._facingDir(player), theme, Boolean(combat.apexVerdict));
  const detonationScale = verdict.detonationScale ?? 1;
  const raw = (skillDamage(player.attackPower, combat, 'detonateMult') + verdict.stored) * detonationScale;
  this._damageEnemy(enemy, raw, { multiHit: true, skill: true, armorPierce: combat.verdictPierce ? .5 : .25, verdictDerived: true,
    sameCastHit: { key: `verdict-${verdict.generation}:primary`, maxHits: 1 } });
  if (combat.bossStagger && enemy.boss) enemy.addStagger?.(combat.bossStagger);
  for (const linked of verdict.linked ?? []) if (linked.target?.alive) this._damageEnemy(linked.target,
    (skillDamage(player.attackPower, combat, 'detonateMult') + linked.stored) * linked.detonationScale, {
      multiHit: true, skill: true, verdictDerived: true,
      sameCastHit: { key: `verdict-${verdict.generation}:transfer:${linked.target.id}`, maxHits: 1 },
    });
  if (combat.verdictPierce) {
    const facing = this._facingDir(player);
    this._hitEnemiesInCone(enemy.position.clone().addScaledVector(facing, -.25), facing, 6, .7,
      raw * combat.verdictPierceMult, { multiHit: true, skill: true, verdictDerived: true,
        sameCastHit: { key: `verdict-${verdict.generation}:pierce`, maxHits: 1 } });
  }
  const chains = Math.min(2, combat.verdictChains ?? 0);
  if (chains) (this.ctx ?? this.game).enemies.enemies.filter(other => other.alive && other !== enemy)
    .sort((a, b) => a.position.distanceToSquared(enemy.position) - b.position.distanceToSquared(enemy.position))
    .slice(0, chains).forEach((other, index) => this._damageEnemy(other, raw * combat.chainMult, {
      multiHit: true, skill: true, verdictDerived: true, sameCastHit: { key: `verdict-${verdict.generation}:chain-${index}`, maxHits: 1 },
    }));
  if (combat.transferMarks && (verdict.depth ?? 0) < 1) {
    const transfers = (this.ctx ?? this.game).enemies.enemies.filter(other => other.alive && other !== enemy)
      .sort((a, b) => a.position.distanceToSquared(enemy.position) - b.position.distanceToSquared(enemy.position))
      .slice(0, Math.min(2, combat.transferMarks));
    if (transfers.length) {
      for (const transfer of transfers) transfer.applyStatus?.('expose', { duration: 2.2, power: .12, damageAmp: .08 }, this.game);
      const [primary, ...linked] = transfers.map(transfer => ({ target: transfer,
        stored: Math.min(verdict.cap * combat.transferMult, verdict.stored * combat.transferMult),
        detonationScale: combat.transferMult }));
      player.predatorVerdict = { ...verdict, generation: ++this.rangerSerial, target: primary.target, remaining: 2.2,
        stored: primary.stored, cap: verdict.cap * combat.transferMult, detonationScale: primary.detonationScale,
        linked, depth: 1 };
    }
  }
  if (combat.apexVerdict) this._hitEnemiesInRadius(enemy.position, 2.4, raw * combat.convergenceMult, {
    multiHit: true, skill: true, verdictDerived: true, sameCastHit: { key: `verdict-${verdict.generation}:convergence`, maxHits: 1 },
  });
  this._applyApexKeystone(player,enemy,{bundle:verdict.bundle,theme,rawDamage:raw,castKey:`verdict-${verdict.generation}`,budget:{targets:new Map(),casts:new Set()},capturedMarkedTarget});
  return true;
},

_hunterMark(player, bundle, apexAudio = null) {
  const { combat, theme } = this._skillBundle(bundle);
  const rank = bundle.rank;
  const direction = this._facingDir(player);
  const range = combat.range ?? 14;
  const cosThreshold = Math.cos((combat.arc ?? 1.4) * 0.5);
  let best = null;
  let bestDist = Infinity;
  for (const enemy of (this.ctx ?? this.game).enemies.enemies) {
    if (!enemy.alive) continue;
    const offset = TMP_A.copy(enemy.position).sub(player.position).setY(0);
    const dist = offset.length();
    if (dist > range + enemy.radius || dist < 0.001) continue;
    const dir = offset.clone().normalize();
    if (dir.dot(direction) < cosThreshold) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = enemy;
    }
  }
  if (!best) {
    // Fallback: nearest living enemy in world radius of aim
    for (const enemy of (this.ctx ?? this.game).enemies.enemies) {
      if (!enemy.alive) continue;
      const dist = enemy.position.distanceTo(player.position);
      if (dist < bestDist && dist < range + 4) {
        bestDist = dist;
        best = enemy;
      }
    }
  }
  if (!best) {
    (this.ctx ?? this.game).effects.recipeMarkGlyph?.(player.position.clone().addScaledVector(direction, 4), theme, 2.2);
    return;
  }
  if (player.predatorVerdict) {
    this._apexAudioPhase(player,apexAudio,'impact');
    this._detonateVerdict(player, player.predatorVerdict);
    this._apexAudioPhase(player,apexAudio,'finisher');
    return;
  }
  (this.ctx ?? this.game).effects.recipeMarkGlyph?.(best.position, theme, 2.8);
  const landed = this._damageEnemy(best, skillDamage(player.attackPower, combat), {
    direction: TMP_B.copy(best.position).sub(player.position).setY(0).normalize(),
    knockback: combat.knockback ?? 2,
    criticalBonus: combat.criticalBonus ?? 0.08,
    skill: true,
  });
  if (landed.amount <= 0) return;
  this._apexAudioPhase(player,apexAudio,'impact');
  best.applyStatus?.('expose', {
    duration: combat.markDuration ?? 5.2,
    power: (combat.exposePower ?? 0.22) * (combat.exposeMult ?? 1),
    damageAmp: (combat.damageAmp ?? 0.16) * (combat.exposeMult ?? 1),
  }, this.game);
  const generation = ++this.rangerSerial;
  const storeMult = (combat.verdictStore ?? 0) * (combat.storeMult ?? 1);
  const cap = skillDamage(player.attackPower, combat) * (combat.verdictCap ?? 0) * (combat.capMult ?? 1);
  player.predatorVerdict = { generation, target: best, bundle, remaining: combat.markDuration ?? 5.2, stored: 0, storeMult, cap };
  this._apexAudioPhase(player,apexAudio,'finisher');
},

  });
}
