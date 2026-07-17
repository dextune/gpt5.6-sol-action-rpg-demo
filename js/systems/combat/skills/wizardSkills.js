/**
 * Active skill implementations — wizard (Sol combat, not template).
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

export function attachWizardSkillMethods(proto) {
  Object.assign(proto, {
_fireball(player, bundle, phase = null, apexAudio = null) {
  const fire = () => {
    if (!player.alive) return;
    const { combat, theme } = this._skillBundle(bundle);
    const lockedTarget = this._autoTargetEnemy(player, combat.targetRange ?? 22);
    const direction = lockedTarget
      ? this._faceAutoTarget(player, lockedTarget)
      : this._facingDir(player);
    const start = player.position.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(direction, 1.05);
    const castState = this._beginWizardCast(player, bundle.id, bundle);
    castState.apexAudio = apexAudio;
    const castId = `fire-${castState.generation}-${++this.spellCastSerial}`;
    const handleFireLanded = enemy => {
      this._apexAudioPhase(player, castState.apexAudio, 'impact');
      if (castState.reactions.has(enemy.id)) return;
      castState.reactions.add(enemy.id);
      const reacted = this._reactSpellPrime(enemy, 'fire', player, skillDamage(player.attackPower, combat), { castId });
      if (!reacted) enemy.setSpellPrime?.('burn', { depth: 0, castId, remaining: combat.status?.duration ?? 2.2 });
      if (combat.reaction === 'chain_ignition' && enemy.statuses?.burn) {
        const relays = (this.ctx ?? this.game).enemies.enemies.filter(other => other.alive && other !== enemy && other.statuses?.burn)
          .sort((a, b) => a.position.distanceToSquared(enemy.position) - b.position.distanceToSquared(enemy.position))
          .slice(0, Math.min(3, combat.reactionCap ?? 3));
        for (const other of relays) this._damageEnemy(other, skillDamage(player.attackPower, combat) * .18, {
          direction: other.position.clone().sub(enemy.position).setY(0).normalize(), knockback: .4, multiHit: true, skill: true,
        });
      }
      if (combat.bossBrandCap && enemy.boss) {
        enemy.solarBrandStacks = Math.min(combat.bossBrandCap, (enemy.solarBrandStacks ?? 0) + 1);
        if (enemy.solarBrandStacks >= combat.bossBrandCap) {
          const detonation = this._damageEnemy(enemy,
            skillDamage(player.attackPower, combat) * combat.bossBrandMult * combat.bossBrandCap, {
            direction, knockback: 0, multiHit: true, skill: true,
            sameCastHit: { key: `${castId}:solar-brand-detonation`, maxHits: 1 },
          });
          if (detonation.amount > 0) enemy.solarBrandStacks = 0;
        }
      }
    };
    (this.ctx ?? this.game).effects.recipeFireOrb(player.position, direction, theme);
    this._spawnFriendlyOrb(start, direction, {
      style: 'fireball',
      color: theme.primary,
      damage: skillDamage(player.attackPower, combat) * player.skillPower,
      speed: combat.speed,
      radius: combat.radius ?? 1.15,
      life: 1.4,
      pierce: Math.min(3, Math.max(1, Math.round(combat.pierce ?? 1))),
      knockback: combat.knockback ?? 4.5,
      skill: true,
      skillPowerApplied: true,
      scale: combat.scale ?? 1.35,
      statusOnHit: combat.status ?? null,
      castId,
      homingTarget: lockedTarget,
      castMeta: { skillId: bundle.id, playerLevel: bundle.playerLevel },
      onHit: handleFireLanded,
      onRetire: projectile => {
        if (!this._endWizardCast(player, castState)) return;
        if (this._clearing || projectile.suppressRetireAuthority) return;
        this._apexAudioPhase(player, castState.apexAudio, 'finisher');
        const at = projectile.mesh.position.clone();
        (this.ctx ?? this.game).effects.recipeLivingStar?.(at, theme, combat.cinders ?? 0, Boolean(combat.prominence));
        const cinders = Math.min(3, Math.max(0, Math.round(combat.cinders ?? 0)));
        const targets = (this.ctx ?? this.game).enemies.enemies.filter(enemy => enemy.alive)
          .sort((a, b) => a.position.distanceToSquared(at) - b.position.distanceToSquared(at)).slice(0, cinders);
        for (const target of targets) {
          const cinderDirection = target.position.clone().sub(at).setY(0).normalize();
          this._spawnFriendlyOrb(at.clone().add(new THREE.Vector3(0, .65, 0)), cinderDirection, {
            style: 'fireball', color: theme.secondary,
            damage: skillDamage(player.attackPower, combat) * (combat.cinderMult ?? 0),
            speed: 11, radius: .55, life: .55, pierce: 1, skill: true,
            skillPowerApplied: false, reactionDepth: 1, castId, homingTarget: target,
          });
        }
        const ticks = Math.min(3, Math.max(0, Math.round(combat.vortexTicks ?? 0)));
        for (let tick = 0; tick < ticks; tick += 1) this._delay(0.12 + tick * 0.16, () => {
          if (!this._isWizardGenerationCurrent(player, castState)) return;
          this._hitEnemiesInRadius(at, combat.blastRadius, skillDamage(player.attackPower, combat) * (combat.vortexMult ?? 0), {
            knockback: 0.4, multiHit: true, skill: true,
          });
        });
        if (combat.prominence) this._hitEnemiesInRadius(at, combat.blastRadius * 1.35,
          skillDamage(player.attackPower, combat) * (combat.flareMult ?? 0), {
            knockback: 2.8, multiHit: true, armorPierce: .3, skill: true,
            sameCastHit: { key: `${castId}:prominence-flare`, maxHits: 1 },
          });
        const apexTarget=(this.ctx ?? this.game).enemies.enemies.filter(enemy=>enemy.alive&&enemy.position.distanceTo(at)<=combat.blastRadius*1.35+enemy.radius)
          .sort((a,b)=>a.position.distanceToSquared(at)-b.position.distanceToSquared(at))[0];
        if(apexTarget)this._applyApexKeystone(player,apexTarget,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat),castKey:castId,budget:castState.apexBudget,overcast:castState.overcast});
      },
      explode: {
        radius: combat.blastRadius,
        damage: skillDamage(player.attackPower, combat, 'blastMult') * player.skillPower,
        color: theme.accent,
        theme,
        status: combat.status ?? null,
        skillPowerApplied: true,
        onHit: handleFireLanded,
        sameCastHit: { key: `${castId}:blast`, maxHits: 1 },
        // Gravity Fireball identity — yank prey into the core before the blast lands.
        implosionRadius: combat.implosionRadius ?? 0,
        implosionRing: combat.implosionRing ?? 1.35,
        implosionCap: combat.implosionCap ?? 10,
        knockback: combat.knockback ?? 2.2,
      },
    });
  };
  if (phase != null && phase !== 'full') fire();
  else fire();
},

_frostNova(player, bundle, phase = null, apexAudio = null) {
  const fire = () => {
    if (!player.alive) return;
    const castState = this._beginWizardCast(player, bundle.id, bundle);
    castState.apexAudio = apexAudio;
    const { combat, theme } = this._skillBundle(bundle);
    const rank = bundle.rank;
    const radius = combat.radius;
    const lockedTarget = this._autoTargetEnemy(player, combat.targetRange ?? 20, {
      clusterRadius: combat.clusterRadius ?? radius,
    });
    const center = lockedTarget?.position.clone() ?? player.position.clone();
    const castFacing = lockedTarget
      ? this._faceAutoTarget(player, lockedTarget)
      : this._facingDir(player);
    player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.28);
    (this.ctx ?? this.game).effects.recipeIceNova(center, theme, radius);
    (this.ctx ?? this.game).effects.recipeGlacialPrison?.(center, theme, radius);
    this._apexAudioPhase(player, castState.apexAudio, 'impact');
    // Rank 3+: deepen chill on already-slowed targets (B5).
    for (const enemy of (this.ctx ?? this.game).enemies.enemies) {
      if (!enemy.alive) continue;
      if (enemy.position.distanceTo(center) > radius + enemy.radius) continue;
      if (rank >= 3 && enemy.statuses?.slow?.remaining > 0) {
        enemy.applyStatus?.('slow', {
          duration: combat.deepChillDuration ?? 1.8,
          power: combat.deepChillPower ?? 0.72,
        }, this.game);
      }
    }
    const frostCastId = `frost-${++this.spellCastSerial}`;
    const executionCrystals = new Set(combat.crystalExecuteMult
      ? (this.ctx ?? this.game).enemies.enemies.filter(enemy => enemy.alive
        && (enemy.elite || enemy.boss)
        && enemy.spellPrime?.id === 'crystal')
      : []);
    if (combat.lances) (this.ctx ?? this.game).effects.recipeCrystalDominion?.(center, theme, radius, Math.min(6, combat.lances), Boolean(combat.dominion));
    // Opening prison tick — light damage, no scatter, hard hold on non-bosses.
    this._hitEnemiesInRadius(
      center,
      radius,
      skillDamage(player.attackPower, combat),
      {
        knockback: combat.knockback ?? 0,
        multiHit: true,
        criticalBonus: combat.criticalBonus ?? 0.05,
        skill: true,
        status: combat.status ?? null,
        onHit: enemy => {
          if (enemy.controlCategory === 'boss' || enemy.boss) {
            (this.ctx ?? this.game).effects.recipeBossPullResist?.(enemy.position, center, theme);
            enemy.addStagger?.(8);
          } else {
            enemy.applyStun?.(combat.holdDuration ?? 1.2);
            enemy.velocity?.set?.(0, 0, 0);
            enemy.knockback?.set?.(0, 0, 0);
          }
          const reacted = this._reactSpellPrime(enemy, 'frost', player, skillDamage(player.attackPower, combat), { castId: frostCastId });
          const executes = !reacted && executionCrystals.has(enemy)
            && enemy.consumeSpellPrime?.('crystal');
          if (executes) {
            executionCrystals.delete(enemy);
            (this.ctx ?? this.game).effects.recipeSpellReaction?.(enemy.position, 'crystal_execution', castFacing);
            this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.crystalExecuteMult, {
              direction: enemy.position.clone().sub(center).setY(0).normalize(),
              knockback: .8, armorPierce: .35, multiHit: true, skill: true,
              sameCastHit: { key: `${frostCastId}:crystal-execution`, maxHits: 1 },
            });
          } else if (!reacted) {
            if (combat.crystalPrime) enemy.setSpellPrime?.('crystal', { depth: 0, remaining: 4 });
            else if (rank >= 3 && enemy.statuses?.slow?.remaining > 0) enemy.setSpellPrime?.('deep_chill', { depth: 0, remaining: 3 });
          }
        },
      },
    );
    // Shatter pulse — main damage identity of Glacial Prison.
    const shatterDelay = combat.shatterDelay ?? 0.55;
    this._delay(shatterDelay, () => {
      if (!player.alive || !this._isWizardGenerationCurrent(player, castState)) {
        if (!combat.dominion) this._endWizardCast(player, castState);
        return;
      }
      (this.ctx ?? this.game).effects.recipeGlacialShatter?.(center, theme, radius);
      const shatterRaw = skillDamage(player.attackPower, combat, 'shatterMult');
      this._hitEnemiesInRadius(center, radius * 1.05, shatterRaw, {
        knockback: combat.shatterKnockback ?? 2.4,
        multiHit: true,
        skill: true,
        sameCastHit: { key: `${frostCastId}:shatter`, maxHits: 1 },
        onHit: enemy => {
          if (combat.dominion) return;
          this._applyApexKeystone(player, enemy, {
            bundle, theme, rawDamage: shatterRaw, castKey: frostCastId,
            budget: castState.apexBudget, overcast: castState.overcast,
          });
        },
      });
      if (combat.lances) {
        const lanceHits = new Map();
        for (let lance = 0; lance < Math.min(6, combat.lances); lance += 1) {
          const angle = lance / 6 * Math.PI * 2;
          const lanceDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
          for (const enemy of (this.ctx ?? this.game).enemies.enemies) {
            if (!enemy.alive || (lanceHits.get(enemy.id) ?? 0) >= Math.min(2, combat.lancePerEnemyCap ?? 2)) continue;
            const offset = enemy.position.clone().sub(center).setY(0);
            const along = offset.dot(lanceDir);
            const lateral = offset.addScaledVector(lanceDir, -along).length();
            if (along < 0 || along > radius + 2.4 || lateral > .62 + enemy.radius) continue;
            lanceHits.set(enemy.id, (lanceHits.get(enemy.id) ?? 0) + 1);
            this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * (combat.lanceMult ?? 0), {
              direction: lanceDir, knockback: 1, multiHit: true, skill: true,
            });
          }
        }
      }
      if (!combat.dominion) {
        this._apexAudioPhase(player, castState.apexAudio, 'finisher');
        this._endWizardCast(player, castState);
      }
    });
    if (combat.freezeChainCap) {
      const targets = (this.ctx ?? this.game).enemies.enemies.filter(enemy => enemy.alive && enemy.position.distanceTo(center) <= radius + enemy.radius)
        .slice(0, Math.min(3, combat.freezeChainCap));
      for (const enemy of targets) {
        if (enemy.controlCategory === 'normal') enemy.applyStun?.(.65);
        else enemy.addStagger?.(enemy.controlCategory === 'boss' ? 22 : 16);
      }
    }
    if (combat.dominion) this._delay(.42 + shatterDelay, () => {
      if (!player.alive || !this._isWizardCastCurrent(player, castState)) {
        this._endWizardCast(player, castState);
        return;
      }
      const facing = castFacing;
      for (const enemy of (this.ctx ?? this.game).enemies.enemies) {
        if (!enemy.alive) continue;
        const offset = enemy.position.clone().sub(center).setY(0);
        const along = offset.dot(facing);
        const lateral = offset.addScaledVector(facing, -along).length();
        if (along < -1 || along > radius || lateral > 1.05 + enemy.radius) continue;
        const inwardRaw=skillDamage(player.attackPower,combat)*combat.inwardMult;const inwardResult=this._damageEnemy(enemy, inwardRaw, {
          direction: facing.clone().negate(), knockback: 1.4, multiHit: true, skill: true,
        });
        if(inwardResult.amount>0)this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:inwardRaw,castKey:frostCastId,budget:castState.apexBudget,overcast:castState.overcast});
      }
      this._apexAudioPhase(player, castState.apexAudio, 'finisher');
      this._endWizardCast(player, castState);
    });
    for (let i = 0; i < 3; i += 1) {
      this._delay(0.1 + i * 0.08, () => {
        if (!player.alive) return;
        (this.ctx ?? this.game).effects.ring(center, theme.secondary, radius * (0.5 + i * 0.16), {
          life: 0.28, startScale: 0.35, height: 0.06, opacity: 0.5,
        });
      });
    }
  };
  if (phase != null && phase !== 'full') fire();
  else fire();
},

_arcaneBlink(player, bundle, apexAudio = null) {
  const castState = this._beginWizardCast(player, bundle.id, bundle);
  castState.apexAudio = apexAudio;
  const blinkCastId = `blink-${castState.generation}-${++this.spellCastSerial}`;
  const { combat, theme } = this._skillBundle(bundle);
  const lockedTarget = this._autoTargetEnemy(player, combat.targetRange ?? 19, {
    clusterRadius: combat.clusterRadius ?? 5.2,
  });
  if (lockedTarget) this._faceAutoTarget(player, lockedTarget);
  const target = lockedTarget?.position.clone() ?? this._aimAlongFacing(player, 10);
  const from = player.position.clone();
  const radius = combat.radius;
  this._telegraphCircle(target, radius, combat.telegraph ?? 0.42, theme.primary, () => {
    if (!player.alive || !this._isWizardCastCurrent(player, castState)) {
      this._endWizardCast(player, castState);
      return;
    }
    const to = target.clone();
    to.y = (this.ctx ?? this.game).world.heightAt(to.x, to.z);
    (this.ctx ?? this.game).effects.recipeBlinkBurst(from, to, theme, radius);
    this._apexAudioPhase(player, castState.apexAudio, 'impact');
    if (combat.routeMult) {
      const route = to.clone().sub(from).setY(0);
      const length = Math.max(0.001, route.length());
      const routeDir = route.normalize();
      let anchors = 0;
      const anchored = [];
      (this.ctx ?? this.game).effects.recipeSpaceSeam?.(from, to, theme, Boolean(combat.spaceRend));
      const crossed = [];
      for (const enemy of (this.ctx ?? this.game).enemies.enemies) {
        if (!enemy.alive) continue;
        const offset = enemy.position.clone().sub(from).setY(0);
        const along = clamp(offset.dot(routeDir), 0, length);
        if (offset.addScaledVector(routeDir, -along).length() > 1.2 + enemy.radius) continue;
        crossed.push({ enemy, along });
      }
      crossed.sort((a, b) => a.along - b.along);
      this._delay(.12, () => {
        if (!this._isWizardGenerationCurrent(player, castState)) return;
        for (const { enemy } of crossed) {
          this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.routeMult, {
            direction: routeDir, knockback: 0.5, multiHit: true, skill: true,
            onHit: landed => {
              if (!this._reactSpellPrime(landed, 'arcane', player, skillDamage(player.attackPower, combat), { castId: blinkCastId })
                && anchors < Math.min(6, combat.anchors ?? 0)) {
                landed.setSpellPrime?.('rift_anchor', { depth: 0, order: anchors, remaining: 4 });
                anchored.push(landed); anchors += 1;
              }
            },
          });
        }
        anchored.forEach((enemy, order) => this._delay(.14 + order * .07, () => {
          if (!enemy.alive || !this._isWizardGenerationCurrent(player, castState)) return;
          this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * (combat.anchorMult ?? 0), {
            direction: routeDir, knockback: 0.4,
            armorPierce: combat.anchorArmorPierce && (enemy.elite || enemy.boss) ? combat.anchorArmorPierce : .3,
            multiHit: true, skill: true,
          });
        }));
      });
      const echoes = Math.min(2, Math.max(1, combat.routeEchoes ?? 1));
      if (echoes > 1) this._delay(.26, () => {
        if (!this._isWizardGenerationCurrent(player, castState)) return;
        for (const { enemy } of crossed) this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.routeMult * .65, {
          direction: routeDir, knockback: .3, multiHit: true, skill: true,
        });
      });
      if (combat.spaceRend) this._delay(.42, () => {
        if (!this._isWizardGenerationCurrent(player, castState)) return;
        let apexTarget=null;for (const { enemy } of crossed){const seamRaw=skillDamage(player.attackPower,combat)*combat.seamMult;const seamResult=this._damageEnemy(enemy, seamRaw, {
          direction: routeDir, knockback: .6, armorPierce: .4, multiHit: true, skill: true,
        });if(seamResult.amount>0&&!apexTarget)apexTarget=enemy;}
        if(apexTarget)this._applyApexKeystone(player,apexTarget,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat)*combat.seamMult,castKey:blinkCastId,budget:castState.apexBudget,overcast:castState.overcast});
        this._apexAudioPhase(player, castState.apexAudio, 'finisher');
      });
    }
    if (combat.lanceMult) {
      for (const enemy of (this.ctx ?? this.game).enemies.enemies) {
        const offset = enemy.position.clone().sub(to).setY(0);
        const along = offset.dot(this._facingDir(player));
        if (enemy.alive && along >= 0 && along <= radius + 3 && offset.length() <= radius + 3) this._damageEnemy(enemy,
          skillDamage(player.attackPower, combat) * combat.lanceMult, { direction: this._facingDir(player), knockback: 2, armorPierce: .4, skill: true });
      }
    }
    if (combat.horizonMult) {
      const midpoint = from.clone().add(to).multiplyScalar(.5);
      this._delay(.22, () => {
        if (!this._isWizardGenerationCurrent(player, castState)) return;
        this._hitEnemiesInRadius(midpoint, radius * .75,
          skillDamage(player.attackPower, combat) * combat.horizonMult, { knockback: 1.5, multiHit: true, skill: true });
      });
    }
    this._hitEnemiesInRadius(
      to,
      radius,
      skillDamage(player.attackPower, combat),
      {
        knockback: combat.knockback ?? 6.8,
        armorPierce: combat.armorPierce ?? 0.22,
        criticalBonus: combat.criticalBonus ?? 0.05,
        skill: true,
      },
    );
    this._endWizardCast(player, castState);
  }, { fillOpacity: 0.14 });
},

_meteorStorm(player, bundle, apexAudio = null) {
  const castState = this._beginWizardCast(player, bundle.id, bundle);
  castState.apexAudio = apexAudio;
  const { combat, theme } = this._skillBundle(bundle);
  const lockedTarget = this._autoTargetEnemy(player, combat.targetRange ?? 24, {
    clusterRadius: combat.clusterRadius ?? 6.2,
  });
  const center = lockedTarget?.position.clone() ?? this._aimAlongFacing(player, combat.aim ?? 10);
  if (combat.worldEnder) {
    const durable = this._autoTargetEnemy(player, combat.targetRange ?? 24, { durableFirst: true });
    if (durable) center.copy(durable.position);
  }
  const facing = center.clone().sub(player.position).setY(0);
  if (facing.lengthSq() < .0001) facing.copy(this._facingDir(player));
  else facing.normalize();
  player.facing.copy(facing);
  const hits = Math.min(10, Math.max(1, Math.round(combat.hits ?? 6), Math.round(combat.impactsCap ?? 0)));
  const fallHeight = combat.fallHeight ?? 8.5;
  let gravityReactions = 0;
  const reservedRifts = new Set();
  castState.impactsResolved = 0;
  castState.authoritiesExpected = hits * (combat.fractures ? 2 : 1);
  const meteorCastId = `meteor-${castState.generation}-${++this.spellCastSerial}`;
  const orbitTargets = combat.orbitTargets
    ? (this.ctx ?? this.game).enemies.enemies.filter(enemy => enemy.alive)
      .sort((a, b) => a.position.distanceToSquared(center) - b.position.distanceToSquared(center))
      .slice(0, Math.min(6, combat.orbitTargets)) : [];
  // Fall-cone pattern along facing (distinct from star radial blades)
  for (let i = 0; i < hits; i += 1) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const lateral = (col - 1) * (1.8 + row * 0.35);
    const forward = 0.6 + row * 2.1 + i * 0.15 + (combat.pattern === 'movingRain' ? row * .7 : 0);
    const side = new THREE.Vector3(-facing.z, 0, facing.x);
    const point = center.clone()
      .addScaledVector(facing, forward - 2.2)
      .addScaledVector(side, lateral);
    if (orbitTargets.length) {
      const targetEnemy = orbitTargets[i % orbitTargets.length];
      const spiralAngle = i * 1.37;
      point.copy(targetEnemy.position).add(new THREE.Vector3(Math.cos(spiralAngle) * .55, 0, Math.sin(spiralAngle) * .55));
    }
    point.y = (this.ctx ?? this.game).world.heightAt(point.x, point.z);
    this._delay(0.08 + i * 0.11, () => {
      if (!this._isWizardGenerationCurrent(player, castState)) return;
      const impactPoint = point.clone();
      let riftTarget = null;
      if (gravityReactions < Math.min(3, combat.gravityReactionCap ?? 3)) {
        riftTarget = (this.ctx ?? this.game).enemies.enemies.filter(enemy => enemy.alive
          && enemy.spellPrime?.id === 'rift_anchor' && !reservedRifts.has(enemy)
          && enemy.position.distanceTo(impactPoint) <= combat.hitRadius + enemy.radius + 1.25)
          .sort((a, b) => a.position.distanceToSquared(impactPoint) - b.position.distanceToSquared(impactPoint))[0] ?? null;
        if (riftTarget) {
          reservedRifts.add(riftTarget);
          const shift = riftTarget.position.clone().sub(impactPoint).setY(0);
          if (shift.lengthSq() > 1.25 * 1.25) shift.setLength(1.25);
          impactPoint.add(shift);
          impactPoint.y = (this.ctx ?? this.game).world.heightAt(impactPoint.x, impactPoint.z);
        }
      }
      if (combat.gravityLens) {
        const fallStart = impactPoint.clone().add(new THREE.Vector3(0, fallHeight, 0));
        (this.ctx ?? this.game).effects.recipeGravityLens?.(fallStart, impactPoint, theme, i, hits, Boolean(combat.astralCataclysm));
      }
      this._telegraphCircle(impactPoint, combat.hitRadius * 0.95, combat.telegraph ?? 0.26, theme.primary, () => {
        if (!this._isWizardGenerationCurrent(player, castState)) return;
        this._apexAudioPhase(player, castState.apexAudio, 'impact');
        (this.ctx ?? this.game).effects.recipeMeteorDrop(impactPoint, theme, fallHeight);
        // Authoritative fracture damage still lands on every impact; alternate only
        // the long-lived decorative decal so ten-meteor Apex casts do not fill the pool.
        if (combat.fractures && i % 2 === 0) {
          (this.ctx ?? this.game).effects.recipeGroundFracture?.(impactPoint, facing, theme, combat.hitRadius * 1.15);
        }
        this._hitEnemiesInRadius(
          impactPoint,
          combat.hitRadius,
          skillDamage(player.attackPower, combat),
          {
            knockback: combat.knockback ?? 2.8,
            multiHit: true,
            armorPierce: combat.armorPierce ?? 0.18,
            skill: true,
            status: combat.status ?? null,
            onHit: enemy => {
              if (enemy === riftTarget && gravityReactions < Math.min(3, combat.gravityReactionCap ?? 3)
                && enemy.consumeSpellPrime?.('rift_anchor')) {
                gravityReactions += 1;
                (this.ctx ?? this.game).effects.recipeSpellReaction?.(enemy.position, 'rift_impact', facing);
              }
            },
          },
        );
        if (riftTarget?.spellPrime?.id === 'rift_anchor') reservedRifts.delete(riftTarget);
        castState.impactsResolved += 1;
        if (combat.fractures) this._delay(.16, () => {
          if (!this._isWizardGenerationCurrent(player, castState)) return;
          this._hitEnemiesInRadius(impactPoint, combat.hitRadius * .72, skillDamage(player.attackPower, combat) * .16, {
            knockback: .4, multiHit: true, skill: true,
            sameCastHit: { key: `${meteorCastId}:fracture-${i}`, maxHits: 1 },
          });
          castState.impactsResolved += 1;
        });
      }, { fillOpacity: 0.13 });
    });
  }
  const resolveFinale = () => {
    if (!this._isWizardCastCurrent(player, castState)) {
      this._endWizardCast(player, castState);
      return;
    }
    if (castState.impactsResolved < castState.authoritiesExpected) {
      this._delay(.035, resolveFinale);
      return;
    }
    (this.ctx ?? this.game).effects.recipeMeteorFinale(center, theme, combat.finaleRadius ?? 5.6);
    this._apexAudioPhase(player, castState.apexAudio, 'finisher');
    this._hitEnemiesInRadius(
      center,
      combat.finaleRadius ?? 5.6,
      skillDamage(player.attackPower, combat, 'finaleMult'),
      {
        knockback: combat.finaleKnockback ?? 6.4,
        multiHit: true,
        armorPierce: combat.finaleArmorPierce ?? 0.3,
        skill: true,
        status: combat.status ?? null,
        sameCastHit: { key: `${meteorCastId}:finale`, maxHits: 1 },
        onHit:enemy=>this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat,'finaleMult'),castKey:meteorCastId,budget:castState.apexBudget,overcast:castState.overcast}),
      },
    );
    if (combat.astralCataclysm) {
      (this.ctx ?? this.game).effects.recipeGroundFracture?.(center, facing, theme, combat.finaleRadius * 1.25);
      this._hitEnemiesInRadius(center, combat.finaleRadius * 1.15, skillDamage(player.attackPower, combat) * .35, {
        knockback: 2, multiHit: true, armorPierce: .35, skill: true,
        sameCastHit: { key: `${meteorCastId}:apex-fracture`, maxHits: 1 },
      });
    }
    this._endWizardCast(player, castState);
  };
  this._delay(0.2 + hits * 0.11, resolveFinale);
},

  });
}
