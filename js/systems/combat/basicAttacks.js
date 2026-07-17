/**
 * Basic attack implementations (melee / magic / ranger strafe).
 * Attached onto CombatSystem.prototype (N5).
 */
import * as THREE from 'three';
import { getClassBasicAttack, getHeroClass, SKILLS } from '../../data/content.js';
import { getFxTheme } from '../../data/fxThemes.js';
import { clamp } from '../../core/Utils.js';

export function attachBasicAttackMethods(proto) {
  Object.assign(proto, {
_meleeAttack(player, combo, comboLength = 4) {
    const direction = this._facingDir(player);
    // Class basic-attack profile — reach/damage/flurry are data, not code.
    const profile = getClassBasicAttack(player.classId);
    const rangeMult = profile.rangeMult;
    const arcMult = profile.arcMult;
    const last = Math.max(0, comboLength - 1);
    const finisher = combo >= last;
    const color = player.weapon?.rarityColor ?? 0xeef8ff;
    const rogue = player.classId === 'rogue';
    const offhandColor = 0x9a6be8;
    const timingScale = rogue ? player.frenzyTimingScale : 1;
    // Level + chain depth push dust/trail read for heavier knight swings.
    const levelBoost = clamp((player.level - 1) * .04, 0, .8);
    const chain = combo / Math.max(1, last);
    (this.ctx ?? this.game).effects.dust(player.position, 0xd7dbc4, finisher ? 14 + combo : 6 + combo * 2, finisher ? .42 : .28);
    (this.ctx ?? this.game).effects.trail(
      player.position.clone().add(new THREE.Vector3(0, 1.05, 0)).addScaledVector(direction, .55),
      color, finisher ? .7 : .34 + chain * .2, finisher ? .24 : .12,
    );
    // Weapon swing ribbon — sample blade bones when equipped (melee path).
    const swingRange = ((finisher ? profile.finisherRange : profile.range) + combo * profile.rangePerCombo + levelBoost * .25) * rangeMult;
    const bladeSamples = this._bladeTrailSamples(player, false);
    (this.ctx ?? this.game).effects.swingTrail?.(
      player.position.clone().add(new THREE.Vector3(0, 1.05, 0)),
      direction,
      color,
      swingRange * (finisher ? 1.2 : 1),
      {
        heavy: finisher || combo >= 2,
        angleOffset: combo % 2 ? .45 : -.4,
        base: bladeSamples.base,
        tip: bladeSamples.tip,
      },
    );

    // High-level finishers and late chain steps land as multi-pulse hits for impact.
    let pulses = finisher
      ? 1 + Math.min(3, Math.floor((comboLength - 3) / 1.5) + Math.floor(player.level / 10))
      : combo >= 3 ? 1 + Math.min(1, Math.floor(player.level / 12)) : 1;
    // Flurry classes (rogue): every click bursts into multiple rapid strikes.
    const flurry = Math.max(1, Math.round(profile.flurry));
    if (flurry > 1) pulses = Math.max(pulses, flurry + (finisher ? 1 : 0));
    const baseMult = (profile.mult + combo * profile.multPerCombo + levelBoost * .12)
      * (finisher ? profile.finisherMult + (comboLength - 3) * .08 : 1);

    for (let pulse = 0; pulse < pulses; pulse += 1) {
      const delay = ((finisher ? .06 : .02 + combo * .005) + pulse * (finisher ? .07 : .05)) * timingScale;
      this._delay(delay, () => {
        if (!player.alive) return;
        const range = ((finisher ? profile.finisherRange : profile.range) + combo * profile.rangePerCombo + levelBoost * .25) * rangeMult;
        const arc = (finisher ? Math.PI * (1.05 + chain * .12) : Math.PI * (.58 + combo * .05)) * arcMult;
        const offhand = rogue && (combo + pulse) % 2 === 1;
        const hitOrigin = rogue
          ? this._handContactOrigin(player, offhand, direction, .12 + pulse * .03)
          : player.position.clone().addScaledVector(direction, .35 + pulse * .08);
        const pulseDamage = player.attackPower * baseMult * (pulses > 1 ? (.72 + pulse * .12) : 1);
        const handColor = offhand ? offhandColor : color;

        (this.ctx ?? this.game).effects.swingArc(hitOrigin, direction, handColor, range * (finisher ? 1.35 : 1.15), {
          heavy: finisher || combo >= 2,
          height: finisher ? 1.3 : 1.02,
          spin: (combo + pulse) % 2 ? -3.1 : 2.9,
          angleOffset: (combo + pulse) % 2 ? .58 : -.5,
        });
        // Second delayed ribbon — follow-through, prefer live blade samples.
        const pulseBlade = this._bladeTrailSamples(player, offhand);
        (this.ctx ?? this.game).effects.swingTrail?.(
          hitOrigin.clone().add(new THREE.Vector3(0, 0.08, 0)),
          direction,
          handColor,
          range * (finisher ? 1.25 : 1.05),
          {
            heavy: finisher || combo >= 2,
            height: finisher ? 1.15 : 0.98,
            angleOffset: (combo + pulse) % 2 ? -.52 : .48,
            base: pulseBlade.base,
            tip: pulseBlade.tip,
          },
        );
        if (finisher && pulse === 0) {
          (this.ctx ?? this.game).effects.ring(player.position, color, 3.4 + comboLength * .12, { life: .36, startScale: .12, height: .1, opacity: .75 });
          (this.ctx ?? this.game).effects.ring(player.position, 0xffffff, 2.2, { life: .22, startScale: .2, height: .14, opacity: .88 });
          (this.ctx ?? this.game).effects.pillar(
            player.position.clone().addScaledVector(direction, 1.15),
            color, 5.2 + comboLength * .15, { life: .4, bottom: .75, opacity: .5 },
          );
          (this.ctx ?? this.game).effects.burst(
            player.position.clone().add(new THREE.Vector3(0, 1, 0)).addScaledVector(direction, 1.3),
            color, 24 + comboLength * 2, { speed: 6.5, size: .36, life: .48, upward: .32 },
          );
          (this.ctx ?? this.game).effects.dust(player.position, 0xc9c8b4, 18, .48);
        } else if (combo >= 2 && pulse === 0) {
          (this.ctx ?? this.game).effects.burst(
            player.position.clone().add(new THREE.Vector3(0, 1, 0)).addScaledVector(direction, .9),
            color, 8 + combo * 2, { speed: 3.8, size: .24, life: .32, upward: .2 },
          );
        }

        this._hitEnemiesInCone(hitOrigin, direction, range, arc, pulseDamage, {
          knockback: finisher ? 6.8 + comboLength * .15 : 2.1 + combo * .5,
          criticalBonus: finisher ? .12 + levelBoost * .04 : combo * .02,
          combo,
          finisher: finisher && pulse === pulses - 1,
          multiHit: pulses > 1,
          onHit: rogue ? enemy => this._applyFrenzyContact(player, enemy, pulseDamage, direction) : null,
        });
        if (rogue && finisher && pulse === pulses - 1) {
          const main = this._handContactOrigin(player, false, direction, .1);
          const off = this._handContactOrigin(player, true, direction, .1);
          (this.ctx ?? this.game).effects.recipeDualBladeCross?.(main.add(off).multiplyScalar(.5), direction, color, offhandColor, swingRange);
        }
      });
    }
    if (rogue && player.frenzyActive && player.shadowFrenzy.offhandEcho > 0) {
      const echoDelay = ((finisher ? .09 : .055) + pulses * .045) * timingScale;
      this._delay(echoDelay, () => {
        if (!player.alive || !player.frenzyActive) return;
        const range = ((finisher ? profile.finisherRange : profile.range) + combo * profile.rangePerCombo) * rangeMult;
        const origin = this._handContactOrigin(player, true, direction, .16);
        (this.ctx ?? this.game).effects.recipeShadowCuts?.(origin, direction, offhandColor, range);
        this._hitEnemiesInCone(origin, direction, range, Math.PI * .7 * arcMult,
          player.attackPower * baseMult * player.shadowFrenzy.offhandEcho, {
            knockback: 0.8, multiHit: true,
            onHit: enemy => this._applyFrenzyContact(player, enemy, player.attackPower * baseMult, direction),
          });
      });
    }
  },

_applyFrenzyContact(player, enemy, rawDamage, direction) {
    const contact = player.registerFrenzyContact?.(enemy);
    if (!contact) return;
    const frenzy = player.shadowFrenzy;
    if (enemy.boss && contact.bossStacks > 1 && frenzy.bossRampStep > 0) {
      this._damageEnemy(enemy, rawDamage * frenzy.bossRampStep * (contact.bossStacks - 1), {
        direction, knockback: 0, multiHit: true,
      });
    }
    if (contact.chainCap <= 0 || frenzy.chainMult <= 0) return;
    const nearby = (this.ctx ?? this.game).enemies.enemies
      .filter(other => other.alive && other !== enemy && other.position.distanceTo(enemy.position) <= 4 + other.radius)
      .sort((a, b) => a.position.distanceToSquared(enemy.position) - b.position.distanceToSquared(enemy.position))
      .slice(0, contact.chainCap);
    for (const other of nearby) {
      const chainDirection = other.position.clone().sub(enemy.position).setY(0).normalize();
      (this.ctx ?? this.game).effects.recipeShadowCuts?.(enemy.position, chainDirection, 0x9a6be8, 2.2);
      this._damageEnemy(other, rawDamage * frenzy.chainMult, {
        direction: chainDirection, knockback: 0.4, multiHit: true,
      });
    }
  },

_magicAttack(player, combo, comboLength = 4) {
    const isBow = getHeroClass(player.classId).attackStyle === 'ranged';
    // Ranger L5+ Strafe passive: basic attacks become auto-aimed 10-arrow volleys.
    if (isBow && this._rangerStrafeUnlocked(player)) {
      this._rangerStrafeAttack(player, combo, comboLength);
      return;
    }
    // Capture facing at cast time so delayed bolts don't inherit a later turn/mouse aim.
    const direction = this._facingDir(player);
    const profile = getClassBasicAttack(player.classId);
    const finisher = combo >= Math.max(0, comboLength - 1);
    const theme = getFxTheme(isBow ? 'hunt_amber' : 'arcane');
    const color = player.weapon?.rarityColor ?? theme.primary;
    const origin = player.position.clone().add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(direction, .7);
    if (isBow) (this.ctx ?? this.game).effects.recipeArrowStreak?.(player.position, direction, theme);
    else {
      (this.ctx ?? this.game).effects.trail(origin, color, finisher ? .75 : .42, .18);
      (this.ctx ?? this.game).effects.burst(origin, color, finisher ? 18 : 8 + combo * 2, {
        speed: 3.4, size: .24, life: .34, upward: .22,
      });
      (this.ctx ?? this.game).effects.slash(player.position, direction, theme.secondary, finisher ? 2.6 : 1.8 + combo * 0.15, {
        height: 1.05, life: 0.22, thickness: 0.05, spin: 1.8, opacity: 0.55,
      });
    }

    const bolts = finisher ? profile.bolts : 1;
    const baseDamage = player.attackPower * (profile.comboMults[combo] ?? 1) * (isBow ? 1 : player.skillPower);
    const bowMul = isBow ? 1 : 1;
    const bowSpeed = profile.arrowSpeed ?? 22;
    const bowLife = profile.arrowLife ?? 18;
    const baseYaw = Math.atan2(direction.x, direction.z);
    for (let i = 0; i < bolts; i += 1) {
      this._delay(finisher ? i * .05 : .03, () => {
        if (!player.alive) return;
        const spread = finisher ? (i - (bolts - 1) / 2) * (isBow ? 0.1 : 0.12) : 0;
        const dir = new THREE.Vector3(Math.sin(baseYaw + spread), 0, Math.cos(baseYaw + spread));
        const start = player.position.clone().add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(dir, .65);
        this._spawnFriendlyOrb(start, dir, {
          style: isBow ? 'arrow' : 'mana',
          color: finisher && i === Math.floor(bolts / 2) ? theme.core : color,
          damage: baseDamage * bowMul * (finisher ? (isBow ? .48 : .42) : 1),
          speed: finisher ? (isBow ? bowSpeed * 0.95 + i * 0.3 : 14 + i) : (isBow ? bowSpeed : 15.5),
          radius: finisher ? 1.05 : (isBow ? .85 : .9),
          life: isBow ? bowLife : 1.2,
          pierce: finisher ? 2 : 1,
          knockback: finisher ? 3.8 : 2.2,
          skill: false,
          skillPowerApplied: !isBow,
          scale: finisher ? (isBow ? 1.15 : 1.2) : (isBow ? 1.0 : 1.05),
        });
      });
    }
    if (finisher) {
      (this.ctx ?? this.game).effects.ring(player.position, color, 2.8, { life: .38, startScale: .12, height: .12 });
      (this.ctx ?? this.game).effects.ring(player.position, theme.core, 1.8, { life: .24, startScale: .2, height: .16, opacity: .8 });
      (this.ctx ?? this.game).effects.pillar(player.position, theme.accent, 4.2, { life: .32, bottom: .5, opacity: .4 });
      (this.ctx ?? this.game).effects.burst(origin, theme.secondary, 16, { speed: 4.5, size: .28, life: .4, upward: .4 });
    }
  },

_rangerStrafeUnlocked(player) {
    if (player?.classId !== 'ranger') return false;
    const unlock = SKILLS.strafe?.unlockLevel ?? 5;
    return player.level >= unlock;
  },

_rangerStrafeAttack(player, combo, comboLength = 4) {
    const skill = SKILLS.strafe;
    const combat = skill?.combat ?? {};
    const shots = Math.max(1, Math.round(combat.shots ?? 10));
    const interval = combat.interval ?? .042;
    const range = combat.range ?? 243;
    const profile = getClassBasicAttack(player.classId);
    const finisher = combo >= Math.max(0, comboLength - 1);
    // Rank 0 at L5 still fires; invested ranks add per-arrow power.
    const rank = Math.max(0, player.skillRank?.('strafe') ?? player.skills?.strafe ?? 0);
    const multBase = Array.isArray(combat.mult) ? Number(combat.mult[0]) || .18 : .18;
    const multPer = Array.isArray(combat.mult) ? Number(combat.mult[1]) || 0 : 0;
    const arrowMult = (multBase + multPer * rank)
      * (profile.comboMults?.[combo] ?? 1)
      * (finisher ? (combat.finisherMult ?? 1.12) : 1);
    const perArrow = player.attackPower * arrowMult;
    const arrowSpeed = combat.speed ?? profile.arrowSpeed ?? 24;
    const arrowLife = combat.life ?? profile.arrowLife ?? 13;
    const theme = getFxTheme('hunt_amber');
    const color = player.weapon?.rarityColor ?? theme.primary;
    const facing = this._facingDir(player);
    (this.ctx ?? this.game).effects.recipeArrowStreak?.(player.position, facing, theme);
    if (finisher) {
      (this.ctx ?? this.game).effects.ring(player.position, color, 2.6, { life: .32, startScale: .14, height: .12, opacity: .7 });
      (this.ctx ?? this.game).effects.burst(
        player.position.clone().add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(facing, .8),
        theme.secondary, 12, { speed: 4.2, size: .22, life: .34, upward: .28 },
      );
    }

    const pickTargets = () => (this.ctx ?? this.game).enemies.enemies
      .filter(enemy => enemy.alive
        && enemy.position.distanceTo(player.position) <= range + (enemy.radius ?? 0.6))
      .sort((a, b) => a.position.distanceToSquared(player.position) - b.position.distanceToSquared(player.position));

    const initial = pickTargets();
    // Round-robin assignment across the pack (Strafe sprays many foes when available).
    const sequence = [];
    for (let i = 0; i < shots; i += 1) {
      sequence.push(initial.length ? initial[i % initial.length] : null);
    }

    const castId = `strafe-${++this.rangerSerial}`;
    for (let i = 0; i < shots; i += 1) {
      this._delay(i * interval, () => {
        if (!player.alive) return;
        let target = sequence[i];
        if (!target?.alive) {
          const living = pickTargets();
          target = living.length ? living[i % living.length] : null;
        }
        let dir = this._facingDir(player);
        if (target?.alive) {
          dir = target.position.clone().sub(player.position).setY(0);
          if (dir.lengthSq() < 1e-6) dir = this._facingDir(player);
          else dir.normalize();
          // Nudge combat facing toward the current lock for readable aim.
          if (i === 0 || i % 3 === 0) {
            player.facing?.copy?.(dir);
          }
        }
        // Tiny lateral fan so a single-target dump doesn't look like a stacked laser.
        const yaw = Math.atan2(dir.x, dir.z) + Math.sin(i * 1.91) * 0.035;
        dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const start = player.position.clone()
          .add(new THREE.Vector3(0, 1.12 + (i % 3) * 0.02, 0))
          .addScaledVector(dir, .62);
        if (i === 0 || i === shots - 1) {
          (this.ctx ?? this.game).effects.recipeArrowStreak?.(player.position, dir, theme);
        }
        this._spawnFriendlyOrb(start, dir, {
          style: 'arrow',
          color: i === shots - 1 ? theme.core : color,
          damage: perArrow,
          speed: arrowSpeed + (i % 3) * 0.15,
          radius: .78,
          life: arrowLife,
          pierce: combat.pierce ?? 1,
          knockback: combat.knockback ?? 1.05,
          skill: false,
          skillPowerApplied: false,
          scale: finisher && i === shots - 1 ? 1.08 : .9,
          homingTarget: target?.alive ? target : null,
          castId,
          trailRate: .55,
        });
        if (i % 2 === 0) (this.ctx ?? this.game).audio?.swing?.(Math.min(3, (i / 2) | 0));
      });
    }
  },
  });
}
