/**
 * Active skill implementations — gunner (rifle lane + flame control).
 */
import * as THREE from 'three';
import { GUNNER_CONFIG } from '../../../config.js';
import { skillDamage } from '../../../data/skillCombat.js';
import { getFxTheme } from '../../../data/fxThemes.js';
import { clamp } from '../../../core/Utils.js';
import {
  queryFirstRifleHit,
  queryFlameConeHits,
  selectSmartlinkTarget,
} from '../gunnerTargeting.js';

function muzzleOrigin(player, direction, combat) {
  const fallback = player.position.clone()
    .add(new THREE.Vector3(0, 1.15, 0))
    .addScaledVector(direction, 0.75);
  const socket = player.refs?.muzzleSocket ?? player.refs?.weapon?.getObjectByName?.('muzzle_socket');
  if (socket?.getWorldPosition) {
    const p = socket.getWorldPosition(new THREE.Vector3());
    if (Number.isFinite(p.x)) return p;
  }
  return fallback;
}

export function attachGunnerSkillMethods(proto) {
  Object.assign(proto, {
_suppressiveBurst(player, bundle, phase = null, apexAudio = null) {
  const fire = () => {
    if (!player.alive || player.classId !== 'gunner') return;
    this._apexAudioPhase(player, apexAudio, 'impact');
    const { combat, theme } = this._skillBundle(bundle);
    const range = combat.range ?? 24;
    const pierce = Math.max(1, Math.round(combat.pierce ?? 4));
    const enemies = (this.ctx ?? this.game).enemies?.enemies ?? [];
    const facing = this._facingDir(player);
    const smart = player.level >= (GUNNER_CONFIG.smartlink.unlockLevel)
      ? selectSmartlinkTarget(enemies, player.position, facing, player._smartlinkTargetId ?? null)
      : null;
    const direction = smart
      ? this._faceAutoTarget(player, smart)
      : facing;
    if (smart) player._smartlinkTargetId = smart.id ?? smart.typeId ?? null;

    const origin = muzzleOrigin(player, direction, combat);
    const effects = (this.ctx ?? this.game).effects;
    effects?.recipeRifleBurst?.(origin, direction, theme);
    const damage = skillDamage(player.attackPower, combat);
    const hitLedger = new Set();
    let pierced = 0;
    // Sample several points along the lane for multi-pierce without many projectiles.
    const samples = Math.max(pierce, 6);
    for (let i = 0; i < samples && pierced < pierce; i += 1) {
      const t = (i + 1) / samples;
      const probeOrigin = origin.clone().addScaledVector(direction, range * t * 0.15);
      const hit = queryFirstRifleHit(enemies, probeOrigin, direction, range * (1 - t * 0.1), combat.radius ?? 0.7);
      if (!hit?.enemy || hitLedger.has(hit.enemy)) continue;
      hitLedger.add(hit.enemy);
      pierced += 1;
      const dir = hit.enemy.position.clone().sub(player.position).setY(0);
      if (dir.lengthSq() < 1e-6) dir.copy(direction);
      else dir.normalize();
      this._damageEnemy(hit.enemy, damage, {
        direction: dir,
        knockback: combat.knockback ?? 1.4,
        skill: true,
        status: combat.status ?? { id: 'slow', duration: 1.4, power: 0.28 },
        sameCastHit: { key: `suppress-${player.id ?? 'g'}-${i}`, maxHits: 1 },
      });
      effects?.burst?.(hit.point ? new THREE.Vector3(hit.point.x, 1.1, hit.point.z) : hit.enemy.position, theme.primary, 6, {
        speed: 2.8, size: 0.14, life: 0.28, upward: 0.2,
      });
    }
    // Cosmetic tracers (capped, independent of pierce count).
    const tracerCount = Math.min(3, pierce);
    for (let t = 0; t < tracerCount; t += 1) {
      effects?.recipeRifleTracer?.(
        origin.clone().addScaledVector(direction, 0.2 * t),
        direction,
        theme,
        range * (0.85 + t * 0.05),
      );
    }
    this._apexAudioPhase(player, apexAudio, 'finisher');
    void phase;
  };
  if ((bundle?.castTime ?? 0) > 0.05) this._delay(0.08, fire);
  else fire();
},

_flameJet(player, bundle, phase = null, apexAudio = null) {
  if (!player.alive || player.classId !== 'gunner') return;
  this._apexAudioPhase(player, apexAudio, 'impact');
  const { combat, theme } = this._skillBundle(bundle);
  const direction = this._facingDir(player);
  const range = combat.range ?? GUNNER_CONFIG.flameJet.range;
  const ticks = Math.max(1, Math.round(combat.ticks ?? GUNNER_CONFIG.flameJet.ticks));
  const interval = combat.tickInterval ?? GUNNER_CONFIG.flameJet.tickInterval;
  const halfAngle = combat.halfAngle ?? GUNNER_CONFIG.flameJet.halfAngle;
  const damage = skillDamage(player.attackPower, combat) / ticks;
  const burnOnce = new Set();
  this.gunnerSerial = (this.gunnerSerial ?? 0) + 1;
  const castId = `flamejet-${this.gunnerSerial}`;
  const effects = (this.ctx ?? this.game).effects;
  const origin = muzzleOrigin(player, direction, combat);
  effects?.recipeFlameJet?.(origin, direction, theme, range);

  for (let tick = 0; tick < ticks; tick += 1) {
    this._delay(tick * interval, () => {
      if (!player.alive || player.classId !== 'gunner') return;
      const enemies = (this.ctx ?? this.game).enemies?.enemies ?? [];
      const hits = queryFlameConeHits(enemies, player.position, this._facingDir(player), {
        range, halfAngle, cap: combat.cap ?? 12,
      });
      for (const enemy of hits) {
        const dir = enemy.position.clone().sub(player.position).setY(0);
        if (dir.lengthSq() < 1e-6) dir.copy(direction);
        else dir.normalize();
        const applyBurn = !burnOnce.has(enemy);
        if (applyBurn) burnOnce.add(enemy);
        this._damageEnemy(enemy, damage, {
          direction: dir,
          knockback: 0.35,
          skill: true,
          multiHit: true,
          status: applyBurn
            ? (combat.status ?? { id: 'burn', duration: 2.4, dps: 0.1, tick: 0.4, power: 1 })
            : null,
          sameCastHit: { key: `${castId}-${tick}`, maxHits: 1 },
        });
      }
      effects?.burst?.(
        player.position.clone().add(new THREE.Vector3(0, 1, 0)).addScaledVector(this._facingDir(player), 1.4 + tick * 0.4),
        theme.primary, 8, { speed: 2.4, size: 0.18, life: 0.28, upward: 0.35 },
      );
      if (tick === ticks - 1) this._apexAudioPhase(player, apexAudio, 'finisher');
    });
  }
  void phase;
},

_stimRush(player, bundle, phase = null, apexAudio = null) {
  if (!player.alive || player.classId !== 'gunner') return;
  this._apexAudioPhase(player, apexAudio, 'impact');
  const { combat, theme } = this._skillBundle(bundle);
  const resolve = (value, fallback) => {
    if (Array.isArray(value)) return Number(value[0]) || fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const duration = resolve(combat.duration, GUNNER_CONFIG.stim.duration);
  const atk = resolve(combat.attackSpeed, GUNNER_CONFIG.stim.attackSpeed);
  const move = resolve(combat.moveSpeed, GUNNER_CONFIG.stim.moveSpeed);
  player.clearStimRush?.();
  player.stimRush = {
    remaining: duration,
    attackSpeed: atk,
    moveSpeed: move,
  };
  player.invalidateStats?.();
  const effects = (this.ctx ?? this.game).effects;
  effects?.recipeStimPulse?.(player.position, theme);
  effects?.ring?.(player.position, theme.primary, 2.6, { life: 0.45, startScale: 0.12, opacity: 0.75 });
  effects?.burst?.(player.position.clone().add(new THREE.Vector3(0, 1.1, 0)), theme.secondary, 16, {
    speed: 4.2, size: 0.2, life: 0.4, upward: 0.45,
  });
  (this.ctx ?? this.game).ui?.notify?.('STIM RUSH', 'level', 2.2);
  this._apexAudioPhase(player, apexAudio, 'finisher');
  void phase;
},

_infernoSweep(player, bundle, phase = null, apexAudio = null) {
  if (!player.alive || player.classId !== 'gunner') return;
  this._apexAudioPhase(player, apexAudio, 'impact');
  const { combat, theme } = this._skillBundle(bundle);
  const direction = this._facingDir(player);
  const range = combat.range ?? GUNNER_CONFIG.inferno.range;
  const arc = combat.arc ?? GUNNER_CONFIG.inferno.arc;
  const damage = skillDamage(player.attackPower, combat);
  const effects = (this.ctx ?? this.game).effects;
  const origin = player.position.clone();
  effects?.recipeInfernoSweep?.(origin, direction, theme, range);

  // Initial arc damage.
  this._hitEnemiesInCone(origin, direction, range, arc, damage, {
    knockback: combat.knockback ?? 3.2,
    skill: true,
    criticalBonus: combat.criticalBonus ?? 0.06,
    status: combat.status ?? { id: 'burn', duration: 2.8, dps: 0.12, tick: 0.4, power: 1 },
  });

  // Bounded burning ground zones.
  this.gunnerGroundZones ??= [];
  const zoneCount = Math.min(
    Math.max(1, Math.round(combat.zoneCount ?? GUNNER_CONFIG.inferno.zoneCount)),
    GUNNER_CONFIG.inferno.maxZones,
  );
  const zoneLife = combat.zoneLife ?? GUNNER_CONFIG.inferno.zoneLife;
  const zoneR = combat.zoneRadius ?? GUNNER_CONFIG.inferno.zoneRadius;
  const tickDmg = damage * (combat.zoneMult ?? 0.22);
  while (this.gunnerGroundZones.length + zoneCount > GUNNER_CONFIG.inferno.maxZones) {
    this.gunnerGroundZones.shift();
  }
  for (let i = 0; i < zoneCount; i += 1) {
    const ang = (i - (zoneCount - 1) / 2) * 0.35;
    const dir = new THREE.Vector3(
      Math.sin(Math.atan2(direction.x, direction.z) + ang),
      0,
      Math.cos(Math.atan2(direction.x, direction.z) + ang),
    );
    const pos = origin.clone().addScaledVector(dir, 2.2 + i * 1.4);
    this.gunnerGroundZones.push({
      position: pos,
      remaining: zoneLife,
      radius: zoneR,
      tick: 0,
      damage: tickDmg,
      theme,
      owner: player,
    });
    effects?.ring?.(pos, theme.primary, zoneR, { life: 0.55, startScale: 0.15, opacity: 0.65 });
  }
  this._apexAudioPhase(player, apexAudio, 'finisher');
  void phase;
},

_tickGunnerGroundZones(delta) {
  if (!this.gunnerGroundZones?.length) return;
  const enemies = (this.ctx ?? this.game).enemies?.enemies ?? [];
  const interval = GUNNER_CONFIG.inferno.tickInterval;
  for (let i = this.gunnerGroundZones.length - 1; i >= 0; i -= 1) {
    const zone = this.gunnerGroundZones[i];
    zone.remaining -= delta;
    zone.tick -= delta;
    if (zone.remaining <= 0) {
      this.gunnerGroundZones.splice(i, 1);
      continue;
    }
    if (zone.tick > 0) continue;
    zone.tick = interval;
    const r2 = zone.radius * zone.radius;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - zone.position.x;
      const dz = enemy.position.z - zone.position.z;
      if (dx * dx + dz * dz > r2) continue;
      this._damageEnemy(enemy, zone.damage, {
        knockback: 0.2,
        skill: true,
        multiHit: true,
        status: { id: 'burn', duration: 1.2, dps: 0.08, tick: 0.4, power: 1 },
      });
    }
    (this.ctx ?? this.game).effects?.burst?.(
      zone.position.clone().add(new THREE.Vector3(0, 0.4, 0)),
      zone.theme?.primary ?? 0xff7a42,
      4,
      { speed: 1.6, size: 0.12, life: 0.28, upward: 0.5 },
    );
  }
},

_clearGunnerTransientState(player = null) {
  this.gunnerGroundZones = [];
  if (player) {
    player.clearStimRush?.();
    player._smartlinkTargetId = null;
    player._smartlinkStickTimer = 0;
  }
},
  });
}
