/**
 * Active skill implementations — rogue (Sol combat, not template).
 *
 * Rogue actives intentionally never change player.position. Every button is a
 * direct or additional-hit skill: Q locks one target, E pulses around the
 * player, R chains across several targets, and C floods the nearby area.
 */
import * as THREE from 'three';
import { skillDamage } from '../../../data/skillCombat.js';
import { compareAutoTargets } from '../targetPriority.js';

export function attachRogueSkillMethods(proto) {
  Object.assign(proto, {
    _rogueTargets(player, range, cap = 1, origin = player.position) {
      const limit = Math.max(1, Math.round(cap));
      const maxRange = Math.max(0, Number(range) || 0);
      return ((this.ctx ?? this.game).enemies?.enemies ?? [])
        .filter(enemy => enemy.alive
          && enemy.position.distanceTo(origin) <= maxRange + (enemy.radius ?? .55))
        .sort((a, b) => compareAutoTargets(a, b, origin))
        .slice(0, limit);
    },

    _rogueFaceTarget(player, target) {
      if (!target?.alive) return new THREE.Vector3(0, 0, 1);
      const direction = target.position.clone().sub(player.position).setY(0);
      if (direction.lengthSq() < 1e-6) direction.copy(player.facing ?? new THREE.Vector3(0, 0, 1));
      direction.normalize();
      player.facing?.copy?.(direction);
      if (player.mesh?.rotation) player.mesh.rotation.y = Math.atan2(direction.x, direction.z);
      return direction;
    },

    _rogueBleed(combat) {
      if (!combat.status) return null;
      const status = { ...combat.status };
      if (combat.bleedMult) status.dps = (status.dps ?? .1) * combat.bleedMult;
      if (combat.bleedDurationBonus) status.duration = (status.duration ?? 2.4) + combat.bleedDurationBonus;
      return status;
    },

    _twinFangHit(player, bundle, hitIndex, state) {
      if (!this._ownsCast(player, state.cast)) return;
      const { combat, theme } = this._skillBundle(bundle);
      const hits = Math.max(1, Math.round(combat.hits ?? 6));
      const finale = hitIndex >= hits - 1;
      const range = combat.targetRange ?? 11;
      const lockedInRange = state.target?.alive
        && state.target.position.distanceTo(player.position) <= range + (state.target.radius ?? .55);
      const target = lockedInRange ? state.target : this._rogueTargets(player, range, 1)[0];

      if (hitIndex === 0) this._apexAudioPhase(player, state.apexAudio, 'impact');
      if (!target) {
        if (finale) this._apexAudioPhase(player, state.apexAudio, 'finisher');
        return;
      }

      state.target = target;
      const wasBleeding = Boolean(target.statuses?.bleed?.remaining > 0);
      const direction = this._rogueFaceTarget(player, target);
      const offhand = hitIndex % 2 === 1;
      const origin = this._handContactOrigin(player, offhand, direction, .18);
      const raw = skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1);
      (this.ctx ?? this.game).effects?.recipeFangRush?.(
        origin, direction, theme, Math.min(3.4, Math.max(2.2, origin.distanceTo(target.position))),
        hitIndex, finale, offhand,
      );
      (this.ctx ?? this.game).effects?.recipeFangCutLine?.(origin, target.position, theme, hitIndex);
      (this.ctx ?? this.game).audio?.swing?.(offhand ? 1 : 0);

      const result = this._damageEnemy(target, raw, {
        direction,
        knockback: combat.knockback ?? .35,
        armorPierce: combat.armorPierce ?? .18,
        criticalBonus: combat.criticalBonus ?? .18,
        multiHit: true,
        skill: true,
        liteImpact: !finale,
        status: this._rogueBleed(combat),
        sameCastHit: { key: `fang-${state.cast.generation}:hit-${hitIndex}`, maxHits: 1 },
        onHit: enemy => {
          state.targets.add(enemy);
          if (finale) this._applyApexKeystone(player, enemy, {
            bundle, theme, rawDamage: raw, castKey: `fang-${state.cast.generation}`,
            budget: state.apexBudget,
          });
        },
      });

      const extraHit = (mult, key, delay = 0) => this._delay(delay, () => {
        if (!this._ownsCast(player, state.cast) || !target.alive) return;
        this._damageEnemy(target, raw * mult, {
          direction,
          knockback: .15,
          armorPierce: combat.armorPierce ?? .18,
          criticalBonus: combat.criticalBonus ?? .18,
          multiHit: true,
          skill: true,
          liteImpact: true,
          sameCastHit: { key: `fang-${state.cast.generation}:${key}`, maxHits: 1 },
        });
      });

      if (finale && result.amount > 0) {
        if (wasBleeding && combat.woundMult) extraHit(combat.woundMult, 'open-wound');
        const echoHits = Math.max(0, Math.round(combat.echoHits ?? 0));
        for (let i = 0; i < echoHits; i += 1) {
          extraHit(combat.echoMult ?? .36, `echo-${i}`, .04 * (i + 1));
        }
        if ((target.elite || target.boss) && combat.durableExtraHits) {
          const durableHits = Math.max(0, Math.round(combat.durableExtraHits));
          for (let i = 0; i < durableHits; i += 1) {
            extraHit(combat.durableMult ?? .5, `heart-${i}`, .035 * i);
          }
          target.addStagger?.(combat.durableStagger ?? 0);
        }
        if (combat.finaleMult) extraHit(combat.finaleMult, 'finale');
      }
      if (finale) this._apexAudioPhase(player, state.apexAudio, 'finisher');
    },

    _twinFang(player, bundle, phase = null, apexAudio = null) {
      const { combat } = this._skillBundle(bundle);
      const hits = Math.max(1, Math.round(combat.hits ?? 6));
      const execute = index => {
        let state = this.twinFangStates.get(player);
        if (index === 0) {
          state = {
            cast: this._beginOwnedCast(player, bundle.id), bundle, completed: new Set(),
            target: null, targets: new Set(), apexAudio,
            apexBudget: { targets: new Map(), casts: new Set() },
          };
          this.twinFangStates.set(player, state);
        }
        if (!state || state.bundle !== bundle || !this._ownsCast(player, state.cast)
          || index < 0 || index >= hits || state.completed.has(index)) return;
        state.completed.add(index);
        this._twinFangHit(player, bundle, index, state);
        if (index === hits - 1) this.twinFangStates.delete(player);
      };
      if (phase != null && phase !== 'full') {
        const index = Number(phase);
        if (Number.isInteger(index)) execute(index);
        return;
      }
      const cadence = .09 * (combat.cadenceMult ?? 1);
      execute(0);
      const chain = index => this._delay(cadence, () => {
        execute(index);
        if (index + 1 < hits) chain(index + 1);
      });
      if (hits > 1) chain(1);
    },

    _fanPulse(player, bundle, pulseIndex, state) {
      if (!this._ownsCast(player, state.cast)) return;
      const { combat, theme } = this._skillBundle(bundle);
      const pulses = Math.max(1, Math.round(combat.pulses ?? 5));
      const finale = pulseIndex >= pulses - 1;
      const radius = (combat.radius ?? 5.2) * (combat.radiusMult ?? 1);
      const raw = skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1);
      const game = this.ctx ?? this.game;

      if (pulseIndex === 0) this._apexAudioPhase(player, state.apexAudio, 'impact');
      game.effects?.recipeLotusFlurry?.(state.origin, theme, radius, pulseIndex, finale);
      game.audio?.swing?.(pulseIndex % 3);
      this._hitEnemiesInRadius(state.origin, radius, raw, {
        knockback: combat.knockback ?? .3,
        armorPierce: combat.armorPierce ?? .1,
        criticalBonus: combat.criticalBonus ?? .14,
        multiHit: true,
        skill: true,
        liteImpact: !finale,
        status: this._rogueBleed(combat),
        sameCastHit: { key: `cyclone-${state.cast.generation}:pulse-${pulseIndex}`, maxHits: 1 },
        onHit: enemy => {
          state.targets.add(enemy);
          if (finale) this._applyApexKeystone(player, enemy, {
            bundle, theme, rawDamage: raw, castKey: `cyclone-${state.cast.generation}`,
            budget: state.apexBudget,
          });
        },
      });

      if (combat.echoEvery && (pulseIndex + 1) % Math.max(1, Math.round(combat.echoEvery)) === 0) {
        this._delay(.055, () => {
          if (!this._ownsCast(player, state.cast)) return;
          this._hitEnemiesInRadius(state.origin, radius, raw * (combat.echoMult ?? .34), {
            knockback: .12,
            armorPierce: combat.armorPierce ?? .1,
            criticalBonus: combat.criticalBonus ?? .14,
            multiHit: true,
            skill: true,
            liteImpact: true,
            sameCastHit: { key: `cyclone-${state.cast.generation}:echo-${pulseIndex}`, maxHits: 1 },
          });
        });
      }

      if (finale) {
        if (combat.finaleMult) {
          this._hitEnemiesInRadius(state.origin, radius, raw * combat.finaleMult, {
            knockback: .5,
            armorPierce: combat.armorPierce ?? .1,
            criticalBonus: combat.criticalBonus ?? .14,
            multiHit: true,
            skill: true,
            finisher: true,
            sameCastHit: { key: `cyclone-${state.cast.generation}:finale`, maxHits: 1 },
          });
        }
        if (combat.durableExtraHits) {
          const durable = [...state.targets].filter(enemy => enemy.alive && (enemy.elite || enemy.boss));
          for (const enemy of durable) {
            for (let i = 0; i < Math.round(combat.durableExtraHits); i += 1) {
              this._damageEnemy(enemy, raw * (combat.durableMult ?? .46), {
                knockback: .1,
                armorPierce: combat.armorPierce ?? .1,
                criticalBonus: combat.criticalBonus ?? .14,
                multiHit: true,
                skill: true,
                liteImpact: true,
                sameCastHit: { key: `cyclone-${state.cast.generation}:breaker-${enemy.id}-${i}`, maxHits: 1 },
              });
            }
            enemy.addStagger?.(combat.durableStagger ?? 0);
          }
        }
        this._apexAudioPhase(player, state.apexAudio, 'finisher');
      }
    },

    _fanOfKnives(player, bundle, phase = null, apexAudio = null) {
      const { combat } = this._skillBundle(bundle);
      const pulses = Math.max(1, Math.round(combat.pulses ?? 5));
      const execute = index => {
        let state = this.fanStates.get(player);
        if (index === 0) {
          state = {
            cast: this._beginOwnedCast(player, bundle.id), bundle, completed: new Set(),
            origin: player.position.clone(), targets: new Set(), apexAudio,
            apexBudget: { targets: new Map(), casts: new Set() },
          };
          this.fanStates.set(player, state);
        }
        if (!state || state.bundle !== bundle || !this._ownsCast(player, state.cast)
          || index < 0 || index >= pulses || state.completed.has(index)) return;
        state.completed.add(index);
        this._fanPulse(player, bundle, index, state);
        if (index === pulses - 1) this.fanStates.delete(player);
      };
      if (phase != null && phase !== 'full') {
        const index = Number(phase);
        if (Number.isInteger(index)) execute(index);
        return;
      }
      execute(0);
      const chain = index => this._delay(.105, () => {
        execute(index);
        if (index + 1 < pulses) chain(index + 1);
      });
      if (pulses > 1) chain(1);
    },

    _shadowstepVolley(player, bundle, hitIndex, state) {
      if (!this._ownsCast(player, state.cast)) return;
      const { combat, theme } = this._skillBundle(bundle);
      const hits = Math.max(1, Math.round(combat.hits ?? 6));
      const finale = hitIndex >= hits - 1;
      const targets = this._rogueTargets(
        player,
        combat.targetRange ?? 12,
        combat.targetCap ?? 3,
        player.position,
      );
      if (hitIndex === 0) this._apexAudioPhase(player, state.apexAudio, 'impact');
      if (!targets.length) {
        if (finale) this._apexAudioPhase(player, state.apexAudio, 'finisher');
        return;
      }

      const primary = targets[0];
      this._rogueFaceTarget(player, primary);
      const raw = skillDamage(player.attackPower, combat);
      for (let i = 0; i < targets.length; i += 1) {
        const enemy = targets[i];
        const direction = enemy.position.clone().sub(player.position).setY(0);
        if (direction.lengthSq() < 1e-6) direction.copy(player.facing);
        direction.normalize();
        const origin = this._handContactOrigin(player, (hitIndex + i) % 2 === 1, direction, .16);
        (this.ctx ?? this.game).effects?.recipeFangCutLine?.(origin, enemy.position, theme, hitIndex + i);
        (this.ctx ?? this.game).effects?.recipeDualBladeCross?.(
          enemy.position, direction, theme.primary, theme.secondary, finale ? 3 : 2.15,
        );
        const hitRaw = raw * (i === 0 ? 1 : (combat.secondaryMult ?? .58));
        this._damageEnemy(enemy, hitRaw, {
          direction,
          knockback: combat.knockback ?? .45,
          armorPierce: combat.armorPierce ?? .3,
          criticalBonus: combat.criticalBonus ?? .22,
          multiHit: true,
          skill: true,
          liteImpact: !finale,
          sameCastHit: { key: `execution-${state.cast.generation}:volley-${hitIndex}-${enemy.id}`, maxHits: 1 },
          onHit: landed => {
            state.targets.add(landed);
            if (finale) this._applyApexKeystone(player, landed, {
              bundle, theme, rawDamage: hitRaw, castKey: `execution-${state.cast.generation}`,
              budget: state.apexBudget,
            });
          },
        });
      }

      if (combat.offhandEcho && primary.alive) {
        this._damageEnemy(primary, raw * combat.offhandEcho, {
          knockback: .12,
          armorPierce: combat.armorPierce ?? .3,
          criticalBonus: combat.criticalBonus ?? .22,
          multiHit: true,
          skill: true,
          liteImpact: true,
          sameCastHit: { key: `execution-${state.cast.generation}:offhand-${hitIndex}`, maxHits: 1 },
        });
      }

      if (finale) {
        if (combat.finaleMult) {
          for (const enemy of targets) {
            if (!enemy.alive) continue;
            this._damageEnemy(enemy, raw * combat.finaleMult, {
              knockback: .6,
              armorPierce: combat.armorPierce ?? .3,
              criticalBonus: combat.criticalBonus ?? .22,
              multiHit: true,
              skill: true,
              finisher: true,
              sameCastHit: { key: `execution-${state.cast.generation}:finale-${enemy.id}`, maxHits: 1 },
            });
          }
        }
        const durable = targets.find(enemy => enemy.alive && (enemy.elite || enemy.boss));
        if (durable && combat.durableExtraHits) {
          for (let i = 0; i < Math.round(combat.durableExtraHits); i += 1) {
            this._damageEnemy(durable, raw * (combat.durableMult ?? .5), {
              knockback: .1,
              armorPierce: combat.armorPierce ?? .3,
              criticalBonus: combat.criticalBonus ?? .22,
              multiHit: true,
              skill: true,
              liteImpact: true,
              sameCastHit: { key: `execution-${state.cast.generation}:boss-${i}`, maxHits: 1 },
            });
          }
          durable.addStagger?.(combat.durableStagger ?? 0);
        }
        this._apexAudioPhase(player, state.apexAudio, 'finisher');
      }
      (this.ctx ?? this.game).audio?.swing?.(hitIndex % 3);
    },

    _shadowstep(player, bundle, phase = null, apexAudio = null) {
      const { combat } = this._skillBundle(bundle);
      const hits = Math.max(1, Math.round(combat.hits ?? 6));
      const execute = index => {
        let state = this.shadowstepStates.get(player);
        if (index === 0) {
          state = {
            cast: this._beginOwnedCast(player, bundle.id), bundle, completed: new Set(),
            targets: new Set(), apexAudio,
            apexBudget: { targets: new Map(), casts: new Set() },
          };
          this.shadowstepStates.set(player, state);
        }
        if (!state || state.bundle !== bundle || !this._ownsCast(player, state.cast)
          || index < 0 || index >= hits || state.completed.has(index)) return;
        state.completed.add(index);
        this._shadowstepVolley(player, bundle, index, state);
        if (index === hits - 1) this.shadowstepStates.delete(player);
      };
      if (phase != null && phase !== 'full') {
        const index = Number(phase);
        if (Number.isInteger(index)) execute(index);
        return;
      }
      execute(0);
      const chain = index => this._delay(.085, () => {
        execute(index);
        if (index + 1 < hits) chain(index + 1);
      });
      if (hits > 1) chain(1);
    },

    _deathLotus(player, bundle, phase = null, apexAudio = null) {
      // Evolved animation timelines may emit extra phase callbacks; phase zero owns
      // the whole eight-plus-hit sequence so no pulse can be duplicated.
      if (phase != null && phase !== 'full' && Number(phase) !== 0) return;
      const { combat, theme } = this._skillBundle(bundle);
      const hits = Math.max(1, Math.round(combat.hits ?? 8));
      const state = {
        cast: this._beginOwnedCast(player, bundle.id), bundle, origin: player.position.clone(),
        targets: new Set(), apexAudio, apexBudget: { targets: new Map(), casts: new Set() },
      };
      this.lotusStates.set(player, state);
      player.invulnerable = Math.max(player.invulnerable ?? 0, combat.invuln ?? .6);

      const radius = (combat.radius ?? 3) * (combat.radiusMult ?? 1);
      const raw = skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1);
      const land = i => {
          if (!this._ownsCast(player, state.cast)) return;
          const finale = i === hits - 1;
          if (i === 0) this._apexAudioPhase(player, state.apexAudio, 'impact');
          (this.ctx ?? this.game).effects?.recipeLotusFlurry?.(state.origin, theme, radius, i, finale);
          (this.ctx ?? this.game).audio?.swing?.(i % 3);
          this._hitEnemiesInRadius(state.origin, radius, raw, {
            knockback: finale ? combat.finaleKnockback ?? 1.4 : combat.knockback ?? .4,
            criticalBonus: combat.criticalBonus ?? .22,
            multiHit: true,
            skill: true,
            liteImpact: !finale,
            status: combat.bleedEvery && (i + 1) % combat.bleedEvery !== 0
              ? null : this._rogueBleed(combat),
            sameCastHit: { key: `lotus-${state.cast.generation}:pulse-${i}`, maxHits: 1 },
            onHit: enemy => {
              state.targets.add(enemy);
              if (finale) this._applyApexKeystone(player, enemy, {
                bundle, theme, rawDamage: raw, castKey: `lotus-${state.cast.generation}`,
                budget: state.apexBudget,
              });
            },
          });

          if (!finale) {
            this._delay(.065, () => land(i + 1));
            return;
          }
          this._hitEnemiesInRadius(state.origin, combat.finaleRadius ?? 3.9,
            skillDamage(player.attackPower, combat, 'finaleMult'), {
              knockback: combat.finaleKnockback ?? 2,
              criticalBonus: combat.criticalBonus ?? .22,
              multiHit: true,
              skill: true,
              finisher: true,
              sameCastHit: { key: `lotus-${state.cast.generation}:finale`, maxHits: 1 },
            });

          const targets = [...state.targets].filter(enemy => enemy.alive);
          for (const enemy of targets.slice(0, Math.max(0, Math.round(combat.echoCap ?? 0)))) {
            this._damageEnemy(enemy, raw * (combat.echoMult ?? .3), {
              multiHit: true,
              skill: true,
              liteImpact: true,
              sameCastHit: { key: `lotus-${state.cast.generation}:echo-${enemy.id}`, maxHits: 1 },
            });
          }
          if (combat.executeThreshold) {
            for (const enemy of targets) {
              if (!enemy.boss && enemy.hp / Math.max(1, enemy.maxHp) <= combat.executeThreshold) {
                this._damageEnemy(enemy, raw * (combat.executeMult ?? .65), {
                  multiHit: true,
                  skill: true,
                  liteImpact: true,
                  sameCastHit: { key: `lotus-${state.cast.generation}:harvest-${enemy.id}`, maxHits: 1 },
                });
              }
            }
          }
          const durable = targets.find(enemy => enemy.elite || enemy.boss);
          if (durable && combat.redirectCap) {
            for (let n = 0; n < Math.min(4, Math.round(combat.redirectCap)); n += 1) {
              this._damageEnemy(durable, raw * (combat.durableMult ?? .55), {
                multiHit: true,
                skill: true,
                liteImpact: true,
                sameCastHit: { key: `lotus-${state.cast.generation}:redirect-${n}`, maxHits: 1 },
              });
            }
            durable.addStagger?.(combat.durableStagger ?? 0);
          }
          this._apexAudioPhase(player, state.apexAudio, 'finisher');
          this.lotusStates.delete(player);
      };
      this._delay(.035, () => land(0));
    },
  });
}
