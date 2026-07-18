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
/** Snap non-boss prey near the flight corridor onto the arrow line (Harpoon Shot). */
_harpoonLineSnap(player, direction, combat, theme, castId) {
  const game = this.ctx ?? this.game;
  const width = combat.harpoonWidth ?? 3.4;
  const cap = Math.max(1, Math.round(combat.harpoonCap ?? 8));
  const spacing = combat.harpoonSpacing ?? 1.35;
  const maxAlong = (combat.speed ?? 18) * (combat.life ?? 5.75) * 0.55;
  const origin = player.position.clone();
  const dir = direction.clone().setY(0);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const candidates = [];
  for (const enemy of game.enemies?.enemies ?? []) {
    if (!enemy.alive) continue;
    if (enemy.controlCategory === 'boss' || enemy.boss) continue;
    const offset = enemy.position.clone().sub(origin).setY(0);
    const along = offset.dot(dir);
    if (along < 1.0 || along > maxAlong) continue;
    const lateral = offset.dot(side);
    if (Math.abs(lateral) > width + (enemy.radius ?? 0.5)) continue;
    candidates.push({ enemy, along, lateral: Math.abs(lateral) });
  }
  candidates.sort((a, b) => a.along - b.along || a.lateral - b.lateral);
  const taken = candidates.slice(0, cap);
  if (!taken.length) return;
  // Distinct harpoon silhouette — do not reuse Backward Release corridor recipe (test + identity).
  for (let i = 0; i < taken.length; i += 1) {
    const sample = origin.clone().addScaledVector(dir, 2 + i * spacing);
    game.effects?.slash?.(sample, dir, i % 2 ? theme.secondary : theme.primary, 2.4, {
      height: 0.2, life: 0.26, thickness: 0.04, opacity: 0.55,
    });
  }
  for (let i = 0; i < taken.length; i += 1) {
    const enemy = taken[i].enemy;
    const from = enemy.position.clone();
    const along = 2.2 + i * spacing + (enemy.radius ?? 0.55);
    const dest = origin.clone().addScaledVector(dir, along);
    dest.y = from.y;
    game.world?.resolvePosition?.(dest, enemy.radius ?? 0.55);
    game.effects?.trail?.(from.clone().add(new THREE.Vector3(0, 1, 0)), theme.secondary ?? theme.primary, 0.4, 0.16);
    game.effects?.afterimage?.(from, theme.accent ?? theme.primary, { life: 0.22, opacity: 0.4, scale: 0.9 });
    enemy.position.copy(dest);
    enemy.velocity?.set?.(0, 0, 0);
    enemy.knockback?.set?.(0, 0, 0);
    game.effects?.trail?.(dest.clone().add(new THREE.Vector3(0, 1, 0)), theme.core ?? theme.primary, 0.45, 0.18);
  }
  game.effects?.slash?.(origin.clone().addScaledVector(dir, 3), dir, theme.primary, 4.5, {
    height: 0.35, life: 0.28, thickness: 0.05, opacity: 0.7,
  });
  void castId;
},

_piercingShot(player, bundle, phase = null, apexAudio = null) {
  const fire = () => {
    if (!player.alive) return;
    const { combat, theme } = this._skillBundle(bundle);
    const lockedTarget = this._autoTargetEnemy(player, combat.targetRange ?? 24);
    const direction = lockedTarget
      ? this._faceAutoTarget(player, lockedTarget)
      : this._facingDir(player);
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    const points = [];
    let splinters = 0;
    let split = false;
    const apexBudget={targets:new Map(),casts:new Set()};
    const generations=this.rangerGeneration.get(player)??{};const generation=(generations.pierce??0)+1;generations.pierce=generation;this.rangerGeneration.set(player,generations);
    const current=()=>player.alive&&player.classId==='ranger'&&this.rangerGeneration.get(player)?.pierce===generation;
    const castId = `ranger-q-${++this.rangerSerial}`;
    // Harpoon identity: yank corridor prey onto the flight line, then fire.
    this._harpoonLineSnap(player, direction, combat, theme, castId);
    (this.ctx ?? this.game).effects.recipeArrowStreak?.(player.position, direction, theme, Boolean(combat.railArrow));
    // Keep the narrow Rail Arrow collision lane centered on ground-rooted enemy capsules.
    const start = player.position.clone().add(new THREE.Vector3(0, .8, 0)).addScaledVector(direction, 1.0);
    this._spawnFriendlyOrb(start, direction, {
      style: 'heavy_arrow',
      color: theme.primary,
      damage: skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1),
      speed: (combat.speed ?? 18) * (combat.speedMult ?? 1),
      radius: (combat.radius ?? 0.95) * (combat.radiusMult ?? 1),
      life: combat.life ?? 5.75,
      pierce: Math.max(1, Math.round((combat.pierce ?? 3) + (combat.crowdPierce ?? 0))),
      knockback: combat.knockback ?? 3.2,
      skill: true,
      scale: combat.scale ?? 1.1,
      armorPierce: combat.armorPierce ?? 0.18,
      statusOnHit: combat.status ?? null,
      castId,
      homingTarget: lockedTarget,
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
              speed: 13, radius: .45, life: 1.7, pierce: 1, skill: true, reactionDepth: 1, castId,
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
              speed: 16, radius: .5, life: 2.75, pierce: 1, skill: true, reactionDepth: 1, castId,
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
  const lockedTarget = combat.impactCenter ? null : this._autoTargetEnemy(player, combat.targetRange ?? 22, {
    clusterRadius: combat.clusterRadius ?? 5.5,
  });
  // Thorn Pit: instant plant by default. Optional seedFlight restores lob for special forms.
  if (!combat.seedLanded && combat.seedFlight) {
    const direction = lockedTarget
      ? this._faceAutoTarget(player, lockedTarget)
      : this._facingDir(player);
    const distance = combat.aim ?? 9.5;
    const start = player.position.clone().add(new THREE.Vector3(0, 1, 0));
    const seedSpeed = Math.max(15, distance / 0.5);
    this._spawnFriendlyOrb(start, direction, {
      style: 'arrow', color: theme.primary, damage: skillDamage(player.attackPower, combat) * .35,
      speed: seedSpeed, radius: .4, life: distance / seedSpeed, pierce: 1, skill: true,
      homingTarget: lockedTarget,
      onRetire: projectile => {
        if (projectile.suppressRetireAuthority || this._clearing || !player.alive || player.classId !== 'ranger') return;
        const impactCenter = projectile.mesh.position.clone(); impactCenter.y = (this.ctx ?? this.game).world.heightAt(impactCenter.x, impactCenter.z);
        this._caltropTrap(player, { ...bundle, combat: { ...combat, seedLanded: 1, impactCenter, seedFacing: direction } }, apexAudio);
      },
    });
    return;
  }
  const direction = lockedTarget
    ? this._faceAutoTarget(player, lockedTarget)
    : this._facingDir(player);
  const center = combat.impactCenter
    ? combat.impactCenter.clone()
    : lockedTarget?.position.clone() ?? player.position.clone().addScaledVector(direction, combat.aim ?? 9.5);
  center.y = (this.ctx ?? this.game).world?.heightAt?.(center.x, center.z) ?? 0;
  (this.ctx ?? this.game).world?.resolvePosition?.(center, 0.6);
  const castFacing = combat.seedFacing?.clone?.() ?? direction.clone();
  const radius = (combat.radius ?? 3.6) * (combat.radiusMult ?? 1);
  const ticks = Math.max(1, Math.round(combat.ticks ?? 3));
  const interval = combat.tickInterval ?? 0.5;
  const generation = (this.rangerGeneration.get(player)?.thorn ?? 0) + 1;
  const apexBudget={targets:new Map(),casts:new Set()};
  const generations = this.rangerGeneration.get(player) ?? {};
  generations.thorn = generation; this.rangerGeneration.set(player, generations);
  player.thornField = { generation, remaining: .08 + ticks * interval + .2, contacts: 0, planted: 0 };
  const current = () => player.alive && player.classId === 'ranger' && player.thornField?.generation === generation;
  const game = this.ctx ?? this.game;
  // Snap non-boss prey into the pit ring before the opening burst.
  const pitCap = Math.max(1, Math.round(combat.pitCap ?? 8));
  const pitRing = combat.pitRing ?? 1.4;
  const candidates = [];
  for (const enemy of game.enemies?.enemies ?? []) {
    if (!enemy.alive) continue;
    if (enemy.position.distanceTo(center) > radius + (enemy.radius ?? 0.5)) continue;
    if (enemy.controlCategory === 'boss' || enemy.boss) {
      game.effects?.recipeBossPullResist?.(enemy.position, center, theme);
      continue;
    }
    candidates.push(enemy);
  }
  candidates.sort((a, b) => a.position.distanceToSquared(center) - b.position.distanceToSquared(center));
  const taken = candidates.slice(0, pitCap);
  for (let i = 0; i < taken.length; i += 1) {
    const enemy = taken[i];
    const from = enemy.position.clone();
    const angle = (i / Math.max(1, taken.length)) * Math.PI * 2;
    const dest = center.clone().add(new THREE.Vector3(
      Math.cos(angle) * (pitRing + (enemy.radius ?? 0.55)),
      0,
      Math.sin(angle) * (pitRing + (enemy.radius ?? 0.55)),
    ));
    dest.y = from.y;
    game.world?.resolvePosition?.(dest, enemy.radius ?? 0.55);
    game.effects?.trail?.(from.clone().add(new THREE.Vector3(0, 1, 0)), theme.primary, 0.4, 0.16);
    game.effects?.afterimage?.(from, theme.secondary ?? theme.primary, { life: 0.22, opacity: 0.42, scale: 0.9 });
    enemy.position.copy(dest);
    enemy.velocity?.set?.(0, 0, 0);
    enemy.knockback?.set?.(0, 0, 0);
    enemy.applyStun?.(combat.holdDuration ?? 1.0);
  }
  game.effects?.recipeTrapField?.(center, theme, radius);
  game.effects?.recipeThornPit?.(center, theme, radius);
  this._apexAudioPhase(player,apexAudio,'impact');
  // Opening pit burst — primary damage identity.
  const openRaw = skillDamage(player.attackPower, combat, 'openMult') * (combat.seedMult ?? 1);
  this._hitEnemiesInRadius(center, radius, openRaw, {
    multiHit: true, skill: true, knockback: combat.knockback ?? 0.4,
    status: combat.status ?? null,
    sameCastHit: { key: `thorn-${generation}:seed-impact`, maxHits: 1 },
    onHit: enemy => {
      if (enemy.controlCategory !== 'boss' && !enemy.boss) enemy.applyStun?.(combat.holdDuration ?? 1.0);
    },
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
        knockback: combat.knockback ?? 0.4,
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
            const plantedTarget = this._autoTargetEnemy(player, combat.targetRange ?? 22, { origin: center });
            const dir = plantedTarget
              ? plantedTarget.position.clone().sub(center).setY(0).normalize()
              : castFacing;
            this._spawnFriendlyOrb(center.clone().add(new THREE.Vector3(0, .6, 0)), dir, {
              style: 'arrow', color: theme.secondary, damage: skillDamage(player.attackPower, combat) * combat.plantedMult,
              speed: 15, radius: .45, life: 2.5, pierce: 2, skill: true, reactionDepth: 1,
              homingTarget: plantedTarget,
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
  const from = player.position.clone();
  const generations = this.rangerGeneration.get(player) ?? {};
  const generation = (generations.vault ?? 0) + 1;
  generations.vault = generation; this.rangerGeneration.set(player, generations);
  const current = () => player.alive && player.classId === 'ranger' && this.rangerGeneration.get(player)?.vault === generation;
  const range = combat.targetRange ?? 21;
  const targetCap = Math.max(1, Math.round(combat.targetCap ?? 4));
  const acquireTargets = () => this._autoTargetEnemies(player, range, targetCap);
  const initialTargets = acquireTargets();
  const primary = initialTargets[0] ?? null;
  const forward = primary ? this._faceAutoTarget(player, primary) : this._facingDir(player);
  const targetPoint = primary?.position.clone() ?? from.clone().addScaledVector(forward, Math.min(10, range));
  (this.ctx ?? this.game).effects.recipeVaultVolley?.(from, targetPoint, forward, theme);
  (this.ctx ?? this.game).effects.recipeSkyHunterArc?.(from, targetPoint, forward, theme, combat.volleyLayers ?? 1);
  const arrows = Math.min(combat.arrowCap ?? 12, Math.max(1, Math.round(combat.arrows ?? 4)));
  const baseYaw = Math.atan2(forward.x, forward.z);
  const spread = (combat.spread ?? 0.14) * (combat.spreadMult ?? 1);
  const apexBudget={targets:new Map(),casts:new Set()};
  const castId = `vault-${generation}`;
  const layers = Math.max(1, Math.min(3, Math.round(combat.volleyLayers ?? (combat.airVolley ? 2 : 1))));
  const shootLayer = (layer, count) => {
    const targets = combat.redirect || layer > 0 ? acquireTargets() : initialTargets;
    for (let i = 0; i < count; i += 1) {
      const target = targets.length ? targets[(i + layer) % targets.length] : null;
      const yaw = baseYaw + (i - (count - 1) / 2) * spread;
      const direction = target
        ? target.position.clone().sub(player.position).setY(0).normalize()
        : new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const side = new THREE.Vector3(-forward.z, 0, forward.x);
      const start = player.position.clone().add(new THREE.Vector3(0, 1.15 + layer * .24, 0))
        .addScaledVector(side, (i - (count - 1) / 2) * .08).addScaledVector(direction, .55);
      this._spawnFriendlyOrb(start, direction, {
        style: 'arrow',
        color: i % 2 ? theme.secondary : theme.primary,
        damage: skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1),
        speed: combat.speed ?? 16.5,
        radius: combat.radius ?? 0.88,
        life: combat.life ?? 4.25,
        pierce: 1,
        knockback: combat.knockback ?? 2.6,
        skill: true,
        scale: 0.95,
        criticalBonus: combat.criticalBonus ?? 0.06,
        homingTarget: target,
        castId,
        onHit: enemy => {
          if (combat.durableMult && (enemy.elite || enemy.boss) && enemy.alive) this._damageEnemy(enemy,
            skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1) * (combat.durableMult - 1), {
              multiHit: true, skill: true, liteImpact: true,
              sameCastHit: { key: `${castId}:durable:${layer}:${i}:${enemy.id}`, maxHits: 1 },
            });
          if (combat.skyHunter) this._applyApexKeystone(player, enemy, {
            bundle, theme, rawDamage: skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1),
            castKey: castId, budget: apexBudget,
          });
        },
      });
    }
  };
  for (let layer = 0; layer < layers; layer += 1) {
    const count = Math.floor(arrows / layers) + (layer < arrows % layers ? 1 : 0);
    this._delay(.05 + layer * .13, () => {
      if (!current()) return;
      if (layer === 0) {
        this._apexAudioPhase(player, apexAudio, 'impact');
        if (combat.launchBlast) this._hitEnemiesInRadius(targetPoint, 2.1,
          skillDamage(player.attackPower, combat) * .7, { multiHit: true, skill: true });
      }
      shootLayer(layer, count);
      if (layer === layers - 1) this._apexAudioPhase(player, apexAudio, 'finisher');
    });
  }
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
  player.predatorVerdict = null;
  const generations = this.rangerGeneration.get(player) ?? {};
  const generation = (generations.predator ?? 0) + 1;
  generations.predator = generation; this.rangerGeneration.set(player, generations);
  const current = () => player.alive && player.classId === 'ranger'
    && this.rangerGeneration.get(player)?.predator === generation;
  const range = combat.targetRange ?? 24;
  const targetCap = Math.max(1, Math.round(combat.targetCap ?? 2));
  const acquireTargets = () => this._autoTargetEnemies(player, range, targetCap);
  const openingTargets = acquireTargets();
  const primary = openingTargets[0] ?? null;
  const direction = primary ? this._faceAutoTarget(player, primary) : this._facingDir(player);
  if (!primary) {
    (this.ctx ?? this.game).effects.recipeMarkGlyph?.(player.position.clone().addScaledVector(direction, 4), theme, 2.2);
    return;
  }
  for (const target of openingTargets) {
    (this.ctx ?? this.game).effects.recipeMarkGlyph?.(target.position, theme, 2.35);
  }
  const baseHits = Math.max(1, Math.round(combat.hits ?? 6)) + Math.max(0, Math.round(combat.bonusHits ?? 0));
  const echoHits = Math.max(0, Math.round(combat.echoHits ?? 0));
  const totalHits = Math.min(14, baseHits + echoHits);
  const apexBudget = { targets: new Map(), casts: new Set() };
  const exposed = new Set();
  const castId = `predator-${generation}`;
  for (let index = 0; index < totalHits; index += 1) this._delay(.04 + index * .075, () => {
    if (!current()) return;
    const targets = acquireTargets();
    const finale = index === totalHits - 1;
    const target = finale && primary.alive ? primary : targets[index % Math.max(1, targets.length)];
    if (!target?.alive) return;
    if (!exposed.has(target.id)) {
      exposed.add(target.id);
      target.applyStatus?.('expose', {
        duration: combat.markDuration ?? 2.8,
        power: (combat.exposePower ?? .22) * (combat.exposeMult ?? 1),
        damageAmp: (combat.damageAmp ?? .16) * (combat.exposeMult ?? 1),
      }, this.game);
    }
    let raw = skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1);
    if (target !== primary) raw *= combat.secondaryMult ?? 1;
    if (index >= baseHits) raw *= combat.echoMult ?? .55;
    if ((target.elite || target.boss) && combat.durableMult) raw *= combat.durableMult;
    if (index === 0) this._apexAudioPhase(player, apexAudio, 'impact');
    if (finale) {
      (this.ctx ?? this.game).effects.recipePredatorConvergence?.(target.position, direction, theme, Boolean(combat.apexVerdict));
      this._applyApexKeystone(player, target, {
        bundle, theme, rawDamage: raw, castKey: castId, budget: apexBudget,
        capturedMarkedTarget: target,
      });
    }
    const hitDirection = TMP_B.copy(target.position).sub(player.position).setY(0);
    if (hitDirection.lengthSq() < .0001) hitDirection.copy(direction);
    else hitDirection.normalize();
    this._damageEnemy(target, raw, {
      direction: hitDirection,
      knockback: finale ? combat.knockback ?? .65 : .15,
      criticalBonus: combat.criticalBonus ?? .08,
      armorPierce: combat.verdictPierce ? .5 : .18,
      multiHit: true,
      skill: true,
      liteImpact: !finale,
      sameCastHit: { key: `${castId}:hit-${index}:${target.id}`, maxHits: 1 },
    });
    if (finale) {
      if (combat.bossStagger && target.boss) target.addStagger?.(combat.bossStagger);
      if (combat.apexVerdict && target.alive) this._hitEnemiesInRadius(target.position, 2.4,
        raw * combat.convergenceMult, {
          multiHit: true, skill: true, liteImpact: true,
          sameCastHit: { key: `${castId}:convergence`, maxHits: 1 },
        });
      this._apexAudioPhase(player, apexAudio, 'finisher');
    }
  });
},

  });
}
