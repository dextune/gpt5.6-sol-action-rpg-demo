/**
 * Active skill implementations — gunner (rifle lane + flame control).
 */
import * as THREE from 'three';
import { GUNNER_CONFIG } from '../../../config.js';
import { skillDamage } from '../../../data/skillCombat.js';
import { getFxTheme } from '../../../data/fxThemes.js';
import {
  queryFlameConeHits,
  queryRifleLaneHits,
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
    const stickOk = (player._smartlinkStickTimer ?? 0) > 0;
    const smart = player.level >= (GUNNER_CONFIG.smartlink.unlockLevel)
      ? selectSmartlinkTarget(enemies, player.position, facing, stickOk ? player._smartlinkTargetId : null)
      : null;
    const direction = smart
      ? this._faceAutoTarget(player, smart)
      : facing;
    if (smart) {
      player._smartlinkTargetId = smart.id ?? smart.typeId ?? null;
      player._smartlinkStickTimer = GUNNER_CONFIG.smartlink.stickTime;
      player._smartlinkReticleEnemy = smart;
    } else {
      player._smartlinkTargetId = null;
      player._smartlinkStickTimer = 0;
      player._smartlinkReticleEnemy = null;
    }

    const origin = muzzleOrigin(player, direction, combat);
    const effects = (this.ctx ?? this.game).effects;
    effects?.recipeRifleBurst?.(origin, direction, theme);
    const damage = skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1);
    this.gunnerSerial = (this.gunnerSerial ?? 0) + 1;
    const castId = `suppress-${this.gunnerSerial}`;
    const laneRadius = (combat.radius ?? 0.7) * (combat.radiusMult ?? 1);
    const hits = queryRifleLaneHits(enemies, origin, direction, range, laneRadius, pierce);
    for (const hit of hits) {
      const dir = hit.enemy.position.clone().sub(player.position).setY(0);
      if (dir.lengthSq() < 1e-6) dir.copy(direction);
      else dir.normalize();
      this._damageEnemy(hit.enemy, damage, {
        direction: dir,
        knockback: combat.knockback ?? 1.4,
        armorPierce: combat.armorPierce ?? 0,
        criticalBonus: combat.criticalBonus ?? 0,
        skill: true,
        status: combat.status ?? { id: 'slow', duration: 1.4, power: 0.28 },
        sameCastHit: { key: castId, maxHits: 1 },
      });
      const hitAt = hit.point
        ? new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z)
        : hit.enemy.position.clone();
      effects?.burst?.(hitAt, theme.primary, 14, {
        speed: 4.2, size: 0.2, life: 0.38, upward: 0.3,
      });
    }
    // Cosmetic tracers (capped, independent of pierce count).
    const tracerCount = Math.min(5, pierce);
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
  const damage = skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1) / ticks;
  const burnOnce = new Set();
  const procOnce = new Set();
  this.gunnerSerial = (this.gunnerSerial ?? 0) + 1;
  const castId = `flamejet-${this.gunnerSerial}`;
  const effects = (this.ctx ?? this.game).effects;
  const origin = muzzleOrigin(player, direction, combat);
  effects?.recipeFlameJet?.(origin, direction, theme, range);

  for (let tick = 0; tick < ticks; tick += 1) {
    this._delay(tick * interval, () => {
      if (!player.alive || player.classId !== 'gunner') return;
      const enemies = (this.ctx ?? this.game).enemies?.enemies ?? [];
      const hits = queryFlameConeHits(enemies, player.position, direction, {
        range, halfAngle, cap: combat.cap ?? 12,
      });
      for (const enemy of hits) {
        const dir = enemy.position.clone().sub(player.position).setY(0);
        if (dir.lengthSq() < 1e-6) dir.copy(direction);
        else dir.normalize();
        const applyBurn = !burnOnce.has(enemy);
        if (applyBurn) burnOnce.add(enemy);
        const allowProc = !procOnce.has(enemy);
        if (allowProc) procOnce.add(enemy);
        this._damageEnemy(enemy, damage, {
          direction: dir,
          knockback: combat.knockback ?? 0.35,
          skill: true,
          armorPierce: combat.armorPierce ?? 0,
          criticalBonus: combat.criticalBonus ?? 0,
          multiHit: true,
          weaponProcDerived: !allowProc,
          status: applyBurn
            ? (combat.status ?? { id: 'burn', duration: 2.4, dps: 0.1, tick: 0.4, power: 1 })
            : null,
          sameCastHit: { key: `${castId}-${tick}`, maxHits: 1 },
        });
      }
      effects?.burst?.(
        player.position.clone().add(new THREE.Vector3(0, 1, 0)).addScaledVector(direction, 1.4 + tick * 0.4),
        theme.primary, 8, { speed: 2.4, size: 0.18, life: 0.28, upward: 0.35 },
      );
      const pulseAt = player.position.clone().add(new THREE.Vector3(0, 0.55, 0))
        .addScaledVector(direction, Math.min(range * 0.85, 2.2 + tick * 1.05));
      effects?.ring?.(pulseAt, tick % 2 ? theme.secondary : theme.primary, 1.2 + tick * 0.22, {
        life: 0.3, startScale: 0.18, height: 0.2, opacity: 0.7,
      });
      effects?.trail?.(pulseAt.clone().add(new THREE.Vector3(0, 0.35, 0)), theme.core, 0.5 + tick * 0.08, 0.24);
      if (tick === ticks - 1) {
        effects?.impact?.(pulseAt.clone().add(new THREE.Vector3(0, 0.65, 0)), theme.primary, 'finisher', { direction });
      }
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
  this._hitEnemiesInRadius(
    player.position,
    combat.radius ?? 3.6,
    skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1),
    {
      knockback: combat.knockback ?? 3,
      criticalBonus: combat.criticalBonus ?? 0.08,
      skill: true,
    },
  );
  for (let pulse = 1; pulse <= 2; pulse += 1) {
    this._delay(pulse * 0.22, () => {
      if (!player.alive || !player.stimRush) return;
      effects?.ring?.(player.position, pulse === 2 ? theme.core : theme.secondary, 2.8 + pulse * 0.55, {
        life: 0.42, startScale: 0.18, height: 0.12 * pulse, opacity: 0.62,
      });
      effects?.burst?.(player.position.clone().add(new THREE.Vector3(0, 1.15, 0)), theme.primary, 10 + pulse * 4, {
        speed: 4.8 + pulse, size: 0.18, life: 0.38, upward: 0.55,
      });
    });
  }
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
  const damage = skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1);
  const effects = (this.ctx ?? this.game).effects;
  const origin = player.position.clone();
  effects?.recipeInfernoSweep?.(origin, direction, theme, range);

  // Initial arc damage.
  this._hitEnemiesInCone(origin, direction, range, arc, damage, {
    knockback: combat.knockback ?? 3.2,
    skill: true,
    armorPierce: combat.armorPierce ?? 0,
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
  const zoneR = (combat.zoneRadius ?? GUNNER_CONFIG.inferno.zoneRadius) * (combat.radiusMult ?? 1);
  const tickDmg = damage * (combat.zoneMult ?? 0.22);
  this.gunnerSerial = (this.gunnerSerial ?? 0) + 1;
  const castId = `inferno-${this.gunnerSerial}`;
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
      castId,
      tickIndex: 0,
    });
    effects?.recipeInfernoZone?.(pos, theme, zoneR, false);
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
    zone.tickIndex = (zone.tickIndex ?? 0) + 1;
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
        weaponProcDerived: true,
        sameCastHit: { key: `${zone.castId}-ground-${zone.tickIndex}`, maxHits: 1 },
        status: { id: 'burn', duration: 1.2, dps: 0.08, tick: 0.4, power: 1 },
      });
    }
    (this.ctx ?? this.game).effects?.burst?.(
      zone.position.clone().add(new THREE.Vector3(0, 0.4, 0)),
      zone.theme?.primary ?? 0xff7a42,
      4,
      { speed: 1.6, size: 0.12, life: 0.28, upward: 0.5 },
    );
    (this.ctx ?? this.game).effects?.recipeInfernoZone?.(
      zone.position,
      zone.theme ?? getFxTheme('ember'),
      zone.radius,
      true,
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
