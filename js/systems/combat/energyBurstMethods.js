/**
 * Energy burst implementations (Sol combat — not template).
 */
import * as THREE from 'three';
import { skillDamage } from '../../data/skillCombat.js';
import { getFxTheme } from '../../data/fxThemes.js';

const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();

export function attachEnergyBurstMethods(proto) {
  Object.assign(proto, {
_daggerRushBurst(player, def) {
  const hits = player.energyComboHits;
  const theme = getFxTheme('venom');
  const interval = (def.comboInterval ?? .085) * player.frenzyTimingScale;
  const range = def.comboRange ?? 3.1;
  for (let i = 0; i < hits; i += 1) {
    const finale = i === hits - 1;
    this._delay(.04 + i * interval, () => {
      if (!player.alive) return;
      const direction = this._facingDir(player);
      const hand = i % 2;
      // Micro-lunge per strike keeps the rush surging into the pack.
      player.velocity.addScaledVector(direction, finale ? 2.4 : 1.2);
      const origin = this._handContactOrigin(player, hand === 1, direction, .14);
      (this.ctx ?? this.game).effects.recipeFangRush(origin, direction, theme, range * (finale ? 1.3 : 1), i, finale);
      (this.ctx ?? this.game).effects.recipeShadowCuts?.(origin, direction, hand ? theme.secondary : theme.primary, range);
      if (finale) {
        (this.ctx ?? this.game).effects.ring(player.position, theme.core, 3.8, { life: .4, startScale: .15, height: .12, opacity: .8 });
        (this.ctx ?? this.game).effects.pillar(player.position.clone().addScaledVector(direction, 1.1), theme.primary, 4.6, { life: .34, bottom: .6, opacity: .45 });
        (this.ctx ?? this.game).effects.burst(
          player.position.clone().add(new THREE.Vector3(0, 1, 0)).addScaledVector(direction, 1.2),
          theme.secondary, 26, { speed: 6.8, size: .3, life: .5, upward: .35 },
        );
        (this.ctx ?? this.game).effects.dust(player.position, theme.dust, 16, .44);
      }
      this._hitEnemiesInCone(origin, direction, range * (finale ? 1.3 : 1), (def.comboArc ?? 1.5) * (finale ? 1.35 : 1),
        player.attackPower * (def.comboMult ?? .62) * (finale ? 1.6 : 1), {
          knockback: finale ? 5.5 : 1.4,
          criticalBonus: def.comboCritBonus ?? .25,
          multiHit: true,
          finisher: finale,
          energyCombo: true,
          onHit: enemy => this._applyFrenzyContact(player, enemy, player.attackPower * (def.comboMult ?? .62), direction),
        });
      if (finale) {
        const main = this._handContactOrigin(player, false, direction, .1);
        const off = this._handContactOrigin(player, true, direction, .1);
        (this.ctx ?? this.game).effects.recipeDualBladeCross?.(main.add(off).multiplyScalar(.5), direction, theme.primary, theme.secondary, range * 1.35);
      }
      (this.ctx ?? this.game).audio.swing(Math.min(3, i % 4));
    });
  }
  return {
    duration: interval * hits + .32,
    anim: 'skill_death_lotus',
    sfx: 'skill_blade',
    floatText: `COMBO ×${hits}`,
  };
},

_wrathSlamBurst(player, def) {
  const theme = getFxTheme('wrath');
  const radius = def.slamRadius ?? 4.6;
  this._delay(.16, () => {
    if (!player.alive) return;
    const direction = this._facingDir(player);
    const center = player.position.clone().addScaledVector(direction, radius * .55);
    center.y = (this.ctx ?? this.game).world.heightAt(center.x, center.z);
    player.velocity.addScaledVector(direction, 2.6);
    (this.ctx ?? this.game).effects.ring(center, theme.primary, radius, { life: .5, startScale: .1 });
    (this.ctx ?? this.game).effects.ring(center, theme.core, radius * .55, { life: .3, startScale: .18, height: .12, opacity: .85 });
    (this.ctx ?? this.game).effects.pillar(center, theme.secondary, 6.5, { life: .5, bottom: 1, opacity: .5 });
    (this.ctx ?? this.game).effects.slash(player.position, direction, theme.primary, radius * 1.05, {
      height: 1.35, thickness: .09, life: .3, spin: 3.4, opacity: .9,
    });
    (this.ctx ?? this.game).effects.burst(center.clone().add(new THREE.Vector3(0, 1, 0)), theme.secondary, 30, {
      speed: 6.6, size: .36, life: .6, upward: .5,
    });
    (this.ctx ?? this.game).effects.dust(center, theme.dust, 20, .5);
    (this.ctx ?? this.game).effects.impact(center.clone().add(new THREE.Vector3(0, 1.1, 0)), theme.primary, 'finisher', { direction });
    this._hitEnemiesInRadius(center, radius, player.attackPower * (def.slamMult ?? 2.6), {
      knockback: def.slamKnockback ?? 7.5,
      armorPierce: def.slamArmorPierce ?? .3,
      criticalBonus: def.slamCritBonus ?? .12,
      finisher: true,
      energyCombo: true,
    });
  });
  return { duration: .6, anim: 'skill_skyfall', sfx: 'skill_leap', floatText: 'WRATH!' };
},

_arrowStormBurst(player, def) {
  const theme = getFxTheme('hunt_amber');
  const arrows = Math.max(4, Math.round(def.stormArrows ?? 8));
  const direction = this._facingDir(player);
  const baseYaw = Math.atan2(direction.x, direction.z);
  (this.ctx ?? this.game).effects.recipeArrowStreak?.(player.position, direction, theme);
  for (let i = 0; i < arrows; i += 1) {
    this._delay(0.04 + i * 0.055, () => {
      if (!player.alive) return;
      const spread = (i - (arrows - 1) / 2) * (def.stormSpread ?? 0.11);
      const dir = new THREE.Vector3(Math.sin(baseYaw + spread), 0, Math.cos(baseYaw + spread));
      const start = player.position.clone().add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(dir, 0.7);
      const finale = i === arrows - 1;
      this._spawnFriendlyOrb(start, dir, {
        style: 'arrow',
        color: finale ? theme.core : theme.primary,
        damage: player.attackPower * (def.stormMult ?? 0.55) * (finale ? 1.35 : 1),
        speed: (def.stormSpeed ?? 24) + i * 0.15,
        radius: 0.9,
        life: def.stormLife ?? 16.5,
        pierce: 2,
        knockback: finale ? 4.2 : 2.0,
        skill: false,
        energyCombo: true,
        scale: finale ? 1.2 : 1.0,
        criticalBonus: def.stormCritBonus ?? 0.1,
      });
      if (i % 2 === 0) (this.ctx ?? this.game).audio.swing(Math.min(3, i % 4));
    });
  }
  return {
    duration: 0.08 + arrows * 0.055 + 0.28,
    anim: 'skill_pierce_shot',
    sfx: 'skill_blade',
    floatText: `STORM ×${arrows}`,
  };
},

  });
}
