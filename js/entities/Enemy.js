import * as THREE from 'three';
import { GAME_CONFIG, HORDE_CONFIG, defenseWaveDmgMul, defenseWaveHpMul } from '../config.js';
import { clamp, rand, uid } from '../core/Utils.js';
import { applyStatus, statusMoveMul, tickStatuses } from '../data/skillCombat.js';
import { setMaterialHitPulse } from '../graphics/StylizedMaterial.js';

const UP = new THREE.Vector3(0, 1, 0);
const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();

export const ENEMY_CONTROL_LIMITS = Object.freeze({
  normal: Object.freeze({ stun: 2.4, pull: 4.0, break: 1.45, stagger: 60 }),
  elite: Object.freeze({ stun: 1.2, pull: 2.2, break: 1.0, stagger: 85 }),
  boss: Object.freeze({ stun: 0, pull: 0, break: 0.72, stagger: 100 }),
});

export class Enemy {
  constructor(scene, data, position, options = {}, monsterFactory, quality = 'medium') {
    this.scene = scene;
    this.data = data;
    this.id = uid('enemy');
    this.typeId = data.id;
    this.elite = Boolean(options.elite) && !data.boss;
    this.boss = Boolean(data.boss);
    // Fodder tier: never elite/boss. Soft stats + cheaper UI/anim path.
    this.fodder = Boolean(options.fodder) && !this.elite && !this.boss;
    this.eliteAffix = this.elite ? (options.eliteAffix ?? null) : null;
    this.bossPhase = 1;
    this.level = Math.max(1, Math.round(options.level ?? data.level));
    this.monsterFactory = monsterFactory;
    const monster = monsterFactory.create(data, { elite: this.elite, boss: this.boss, quality });
    this.refs = monster.refs;
    this.animation = monster.animation;
    this.mesh = monster.group;
    this.mesh.position.copy(position);
    this.mesh.userData.enemy = this;
    this.scene.add(this.mesh);
    this.normalScale = this.mesh.scale.clone();

    const extraLevels = Math.max(-4, this.level - data.level);
    const levelScale = Math.max(.72, 1 + extraLevels * .092);
    const tierScale = 1 + Math.max(0, (options.worldTier ?? 1) - 1) * .075;
    const eliteHp = this.elite ? 2.45 : 1;
    const eliteDamage = this.elite ? 1.32 : 1;
    const eliteDefense = this.elite ? 1.28 : 1;
    // Wave mult only when Defense (or other callers) pass a positive options.wave.
    // Hunt spawns omit wave → multipliers stay 1 (byte-for-byte with prior Hunt math).
    const wave = Math.max(0, Number(options.wave) || 0);
    const waveHp = wave > 0 ? defenseWaveHpMul(wave) : 1;
    const waveDmg = wave > 0 ? defenseWaveDmgMul(wave) : 1;
    this.defenseWave = wave > 0 || Boolean(options.defenseWave);
    this.wave = wave > 0 ? wave : 0;
    this.maxHp = Math.round(data.hp * levelScale * tierScale * eliteHp * waveHp);
    this.hp = this.maxHp;
    this.damage = data.damage * (1 + extraLevels * .055) * Math.sqrt(tierScale) * eliteDamage * waveDmg;
    this.defense = data.defense * (1 + extraLevels * .045) * eliteDefense;
    this.speed = data.speed * (this.elite ? 1.08 : 1);
    // Elite affix lite (B3)
    this.shieldHitsLeft = 0;
    this.affixEnraged = false;
    if (this.eliteAffix === 'shielded') {
      this.shieldHitsLeft = 4;
      this.defense *= 1.15;
    } else if (this.eliteAffix === 'enraged') {
      this.damage *= 1.08;
    }
    this.attackRange = data.range;
    this.radius = (this.boss ? 1.25 : this.elite ? .78 : .58) * (data.scale ?? 1);
    this.aggroRadius = this.boss ? 42 : data.ranged ? 29 : 25;
    this.xpValue = Math.round(data.xp * levelScale * (this.elite ? 2.65 : 1));
    this.goldRange = data.gold;

    if (this.fodder) {
      const hpMul = HORDE_CONFIG.fodderHpMul;
      const dmgMul = HORDE_CONFIG.fodderDmgMul;
      const xpMul = HORDE_CONFIG.fodderXpMul;
      this.maxHp = Math.max(1, Math.round(this.maxHp * hpMul));
      this.hp = this.maxHp;
      this.damage *= dmgMul;
      this.xpValue = Math.max(1, Math.round(this.xpValue * xpMul));
    }

    this.alive = true;
    this.removable = false;
    this.deathHandled = false;
    this.deathTimer = 0;
    this.hitTimer = 0;
    /** Fodder health bar: seconds remaining visible after a hit (0 = hidden). */
    this.healthBarTimer = 0;
    /** Accumulator for half-rate far fodder animation. */
    this._animSkipAcc = 0;
    /** Horizontal hit direction for directional squash (XZ). */
    this.hitDir = new THREE.Vector3(0, 0, 1);
    this.invulnerable = 0;
    // Narrow same-cast authority bypasses (reactions/shards) may cross the short
    // hit iframe a bounded number of times without disabling it globally.
    this.sameCastHitIFrames = new Map();
    this.attackCooldown = rand(.35, 1.15);
    this.specialCooldown = rand(2.6, 5.2);
    this.wanderTimer = 0;
    this.wanderDirection = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize();
    this.velocity = new THREE.Vector3();
    this.knockback = new THREE.Vector3();
    this.facing = new THREE.Vector3(0, 0, 1);
    this.spawnPoint = position.clone();
    this.animTime = rand(0, 10);
    this.attackPulse = 0;
    this.state = 'idle';
    this.stateTimer = 0;
    this.strafeSign = Math.random() < .5 ? -1 : 1;
    this.lastHitAt = -999;
    this.enraged = false;
    this.controlCategory = this.boss ? 'boss' : this.elite ? 'elite' : 'normal';
    this.stunTimer = 0;
    this.stagger = 0;
    this.breakTimer = 0;
    /** @type {Record<string, { id: string, remaining: number, power?: number, dps?: number, tick?: number, tickAcc?: number }>} */
    this.statuses = {};
    this.spellPrime = null;

    this.#setHealthBar(1);
  }

  get position() { return this.mesh.position; }
  get healthRatio() { return clamp(this.hp / Math.max(1, this.maxHp), 0, 1); }
  get displayName() {
    const affix = this.eliteAffix === 'shielded' ? 'Shielded '
      : this.eliteAffix === 'enraged' ? 'Enraged '
        : this.eliteAffix === 'volatile' ? 'Volatile '
          : '';
    return `${this.elite ? 'Elite ' : ''}${affix}${this.data.name}`;
  }

  update(delta, game) {
    this.animTime += delta;
    this.hitTimer = Math.max(0, this.hitTimer - delta);
    if (this.fodder) this.healthBarTimer = Math.max(0, this.healthBarTimer - delta);
    this.invulnerable = Math.max(0, this.invulnerable - delta);
    for (const [key, entry] of this.sameCastHitIFrames) {
      entry.remaining -= delta;
      if (entry.remaining <= 0) this.sameCastHitIFrames.delete(key);
    }
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.specialCooldown = Math.max(0, this.specialCooldown - delta);
    this.stateTimer = Math.max(0, this.stateTimer - delta);
    this.stunTimer = Math.max(0, this.stunTimer - delta);
    this.breakTimer = Math.max(0, this.breakTimer - delta);
    this.tickSpellPrime(delta);
    this.knockback.multiplyScalar(Math.pow(.012, delta));

    if (!this.alive) {
      this.#updateDeath(delta, game);
      return;
    }

    this.#tickStatuses(delta, game);

    const player = game.player;
    const toPlayer = TMP_A.copy(player.position).sub(this.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();
    // Hunt hub is a safe zone; Defense arena is not — waves must always engage.
    const playerSafe = game.mode !== 'defense'
      && Math.hypot(player.position.x, player.position.z) < GAME_CONFIG.campRadius;
    const engaged = player.alive && !playerSafe && (distance < this.aggroRadius || this.boss || this.hitTimer > 0 || this.defenseWave);

    if (this.stunTimer > 0 || this.breakTimer > 0) {
      this.state = this.breakTimer > 0 ? 'broken' : 'stunned';
      this.#brake(delta, 2.2);
    } else if (engaged) {
      this.#combatAI(delta, game, toPlayer, distance);
    } else {
      this.#wander(delta, game.world);
    }

    this.position.addScaledVector(this.knockback, delta);
    this.#keepOutOfCamp();
    game.world.resolvePosition(this.position, this.radius);
    this.#animate(delta, game.elapsed, distance);
    this.#updateBillboard(game.camera);
  }

  #combatAI(delta, game, toPlayer, distance) {
    if (distance > .001) this.facing.lerp(toPlayer.normalize(), 1 - Math.exp(-10 * delta)).normalize();
    const ai = this.data.ai;

    // Recovery frames after attacks / hitstun — then re-engage.
    if (this.state === 'attacking' || this.state === 'casting' || this.state === 'hit') {
      this.#brake(delta, this.state === 'hit' ? 1.6 : .82);
      if (this.stateTimer <= 0) this.state = 'idle';
      return;
    }

    if (ai === 'ranged' || ai === 'caster') {
      const ideal = ai === 'caster' ? Math.min(9.2, this.attackRange * .76) : Math.min(7.5, this.attackRange * .72);
      if (distance < ideal * .65) {
        this.#move(TMP_B.copy(this.facing).multiplyScalar(-1), delta, 1.05, game.world);
      } else if (distance > ideal * 1.2) {
        this.#move(this.facing, delta, .86, game.world);
      } else {
        TMP_B.set(-this.facing.z * this.strafeSign, 0, this.facing.x * this.strafeSign);
        this.#move(TMP_B, delta, .58, game.world);
      }
      if (this.attackCooldown <= 0 && distance <= this.attackRange * 1.14) {
        this.state = 'casting';
        this.stateTimer = ai === 'caster' ? .78 : .58;
        this.attackCooldown = ai === 'caster' ? rand(2.2, 3.15) : rand(1.55, 2.35);
        this.#playAnimation('cast', ai === 'caster' ? .92 : 1.08);
        game.combat.enemyProjectile(this, { caster: ai === 'caster', count: ai === 'caster' && (this.elite || this.boss) ? 3 : 1 });
      }
      return;
    }

    if (ai === 'charge') {
      if (this.specialCooldown <= 0 && distance > 3.2 && distance < 13.5) {
        this.state = 'attacking';
        this.stateTimer = 1.05;
        this.specialCooldown = rand(4.8, 6.4);
        this.#playAnimation('special', 1.05);
        game.combat.enemyCharge(this);
      } else if (distance > this.attackRange * .88) {
        this.#move(this.facing, delta, 1.08, game.world);
      } else this.#tryMelee(game, distance, 1.1);
      return;
    }

    if (ai === 'leap') {
      if (this.specialCooldown <= 0 && distance < 12) {
        this.state = 'attacking';
        this.stateTimer = 1.2;
        this.specialCooldown = rand(5.4, 7.1);
        this.#playAnimation('special', .96);
        game.combat.enemyLeap(this);
      } else if (distance > this.attackRange * .9) {
        this.#move(this.facing, delta, .82, game.world);
      } else this.#tryMelee(game, distance, 1.2);
      return;
    }

    if (ai === 'boss') {
      if (!this.enraged && this.healthRatio < .42) {
        this.enraged = true;
        this.speed *= 1.14;
        this.damage *= 1.12;
        game.effects.pillar(this.position, this.data.accent, 7, { life: .72, bottom: 1.4 });
        game.effects.burst(this.position, this.data.accent, 34, { speed: 5.8, size: .42, life: .85 });
        game.ui.notify(`${this.data.name} has enraged!`, 'boss');
      }
      if (this.specialCooldown <= 0) {
        this.state = 'casting';
        this.stateTimer = 1.65;
        const phase2 = this.bossPhase >= 2;
        this.specialCooldown = (this.enraged || phase2) ? rand(3.4, 4.8) : rand(5.8, 7.3);
        this.#playAnimation('special', (this.enraged || phase2) ? 1.12 : .95);
        game.combat.enemyBossSpecial(this);
      } else if (distance > this.attackRange * .82) {
        this.#move(this.facing, delta, (this.enraged || this.bossPhase >= 2) ? 1.08 : .92, game.world);
      } else this.#tryMelee(game, distance, 1.4);
      return;
    }

    if (ai === 'skirmish') {
      if (distance > 4.1) this.#move(this.facing, delta, 1.12, game.world);
      else if (distance < 2.1) this.#move(TMP_B.copy(this.facing).multiplyScalar(-1), delta, 1.18, game.world);
      else {
        TMP_B.set(-this.facing.z * this.strafeSign, 0, this.facing.x * this.strafeSign);
        this.#move(TMP_B, delta, .95, game.world);
      }
      if (this.attackCooldown <= 0 && distance < Math.max(2.8, this.attackRange * 1.35)) this.#tryMelee(game, distance, .95);
      return;
    }

    const speedFactor = ai === 'pack' ? 1.12 : ai === 'swarm' ? 1.05 : ai === 'tank' ? .76 : 1;
    if (distance > this.attackRange * .82) this.#move(this.facing, delta, speedFactor, game.world);
    else this.#tryMelee(game, distance, ai === 'tank' ? 1.35 : 1);
  }

  #tryMelee(game, distance, power = 1) {
    if (this.attackCooldown > 0 || distance > this.attackRange * 1.28 + .7) {
      this.#brake(game.delta ?? .016, .7);
      return;
    }
    this.state = 'attacking';
    this.stateTimer = this.boss ? .82 : .58;
    this.attackPulse = 1;
    this.attackCooldown = this.boss ? rand(1.35, 1.75) : rand(1.05, 1.6);
    this.#playAnimation('attack', this.boss ? .88 : 1.08);
    game.combat.enemyMelee(this, { power, wide: this.boss || this.elite });
  }

  applyStatus(id, opts = {}, game = null) {
    this.statuses = applyStatus(this.statuses, id, opts);
    if (game?.effects) {
      if (id === 'slow') {
        game.effects.trail(this.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x7ad8ff, 0.45, 0.42);
        game.effects.groundDecal?.(this.position, 0xa8ecff, this.radius * 1.85, { life: 0.85, opacity: 0.42 });
        game.effects.ring?.(this.position, 0x7ad8ff, this.radius * 1.4, { life: 0.35, startScale: 0.3, height: 0.08, opacity: 0.55 });
      } else if (id === 'burn') {
        game.effects.trail(this.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff7a42, 0.42, 0.38);
        game.effects.burst?.(this.position.clone().add(new THREE.Vector3(0, 0.9, 0)), 0xff9040, 6, {
          speed: 2.2, size: 0.18, life: 0.32, upward: 0.55,
        });
      } else if (id === 'bleed') {
        game.effects.trail(this.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff6a7a, 0.38, 0.32);
        game.effects.burst?.(this.position.clone().add(new THREE.Vector3(0, 1.05, 0)), 0xff4a5a, 4, {
          speed: 1.8, size: 0.14, life: 0.28, upward: 0.2,
        });
      } else if (id === 'expose') {
        // Persistent hunter mark cue (A1)
        const markH = this.refs.modelHeight * 0.95 + 0.35;
        game.effects.recipeMarkGlyph?.(this.position.clone().add(new THREE.Vector3(0, 0.05, 0)), {
          primary: 0xffd26b, secondary: 0xffeeb0, core: 0xfff8e0, dust: 0xc8a858, accent: 0xffc040,
        }, 2.4);
        game.effects.pillar?.(this.position, 0xffd26b, markH * 0.55, { life: 0.55, bottom: 0.35, opacity: 0.35 });
        game.effects.trail(this.position.clone().add(new THREE.Vector3(0, markH, 0)), 0xffe38a, 0.45, 0.4);
      }
    }
  }

  applyStun(duration = 0) {
    const cap = ENEMY_CONTROL_LIMITS[this.controlCategory].stun;
    if (!this.alive || cap <= 0) return 0;
    const applied = Math.min(cap, Math.max(0, Number(duration) || 0));
    this.stunTimer = Math.max(this.stunTimer, applied);
    if (applied > 0) {
      this.state = 'stunned';
      this.stateTimer = Math.max(this.stateTimer, applied);
      this.velocity.set(0, 0, 0);
      if (this.animation?.has?.('hit')) {
        this.animation.playOneShot('hit', { fade: .09, fadeOut: .12, timeScale: .82, fallback: 'idle' });
      }
    }
    return applied;
  }

  setSpellPrime(id, data = {}) {
    if (!this.alive || !id) return null;
    this.spellPrime = {
      ...data, id,
      depth: Math.min(1, Math.max(0, Number(data.depth) || 0)),
      remaining: Math.min(6, Math.max(.1, Number(data.remaining) || 3)),
    };
    return this.spellPrime;
  }

  consumeSpellPrime(expected = null) {
    if (!this.spellPrime || (expected && this.spellPrime.id !== expected)) return null;
    const consumed = this.spellPrime;
    this.spellPrime = null;
    return consumed;
  }

  tickSpellPrime(delta = 0) {
    if (!this.spellPrime) return null;
    this.spellPrime.remaining = Math.max(0, this.spellPrime.remaining - Math.max(0, delta));
    if (this.spellPrime.remaining <= 0) this.spellPrime = null;
    return this.spellPrime;
  }

  clearSpellPrime() { this.spellPrime = null; }

  addStagger(amount = 0) {
    if (!this.alive) return { added: 0, broken: false, stagger: this.stagger };
    const limits = ENEMY_CONTROL_LIMITS[this.controlCategory];
    const added = Math.max(0, Number(amount) || 0);
    this.stagger += added;
    let broken = false;
    if (this.stagger >= limits.stagger) {
      this.stagger %= limits.stagger;
      this.breakTimer = Math.max(this.breakTimer, limits.break);
      this.state = 'broken';
      this.stateTimer = Math.max(this.stateTimer, this.breakTimer);
      this.velocity.set(0, 0, 0);
      broken = true;
    }
    return { added, broken, stagger: this.stagger };
  }

  /** Pull toward a collision-safe ring. Bosses never receive authoritative displacement. */
  pullToward(target, safeRadius = 1.7, strength = 0.5, world = null, blockers = []) {
    if (!this.alive || !target) return 0;
    const limits = ENEMY_CONTROL_LIMITS[this.controlCategory];
    if (limits.pull <= 0) return 0;
    const dx = this.position.x - target.x;
    const dz = this.position.z - target.z;
    const distance = Math.hypot(dx, dz);
    const ring = Math.max(0, Number(safeRadius) || 0) + this.radius;
    const nx = distance > 1e-5 ? dx / distance : 1;
    const nz = distance > 1e-5 ? dz / distance : 0;
    const wanted = Math.min(limits.pull, Math.max(0, (distance - ring) * clamp(strength, 0, 1)));
    const original = this.position.clone();
    const intended = original.clone();
    intended.x -= nx * wanted;
    intended.z -= nz * wanted;
    const liveBlockers = blockers.filter(other => other?.alive && other !== this);
    const desiredDx = intended.x - target.x;
    const desiredDz = intended.z - target.z;
    const desiredRadius = Math.hypot(desiredDx, desiredDz);
    const baseAngle = desiredRadius > 1e-5 ? Math.atan2(desiredDz, desiredDx) : Math.atan2(nz, nx);
    const startRadius = Math.max(ring, desiredRadius);
    const maxBlockerRadius = liveBlockers.reduce((max, other) => Math.max(max, other.radius ?? 0), 0);
    const expansion = Math.max(4, limits.pull + this.radius, maxBlockerRadius * 4 + this.radius);
    const angleOffsets = [0, 1, -1, 2, -2, 3, -3, 4, -4, 6, -6, 8, -8, 10, -10, 12]
      .map(step => step * Math.PI / 12);
    const radialOffsets = [0, 0.35, 0.75, 1.25, 2, 3, expansion];
    let best = null;
    let fallback = null;
    let priority = 0;
    search: for (const radialOffset of radialOffsets) {
      const candidateRadius = startRadius + radialOffset;
      for (const angleOffset of angleOffsets) {
        const angle = baseAngle + angleOffset;
        const candidate = new THREE.Vector3(
          target.x + Math.cos(angle) * candidateRadius,
          intended.y,
          target.z + Math.sin(angle) * candidateRadius,
        );
        world?.resolvePosition?.(candidate, this.radius);
        const radial = Math.hypot(candidate.x - target.x, candidate.z - target.z);
        const inward = radial + 1e-5 < ring;
        let minClearance = Infinity;
        let blockersClear = true;
        for (const other of liveBlockers) {
          const clearance = Math.hypot(candidate.x - other.position.x, candidate.z - other.position.z)
            - (this.radius + other.radius + 0.05);
          minClearance = Math.min(minClearance, clearance);
          if (clearance < -1e-5) blockersClear = false;
        }
        const intendedDistance = Math.hypot(candidate.x - intended.x, candidate.z - intended.z);
        const entry = { candidate, intendedDistance, minClearance, priority };
        priority += 1;
        if (!inward && blockersClear
          && (!best || intendedDistance < best.intendedDistance - 1e-5
            || (Math.abs(intendedDistance - best.intendedDistance) <= 1e-5 && entry.priority < best.priority))) {
          best = entry;
          if (intendedDistance <= 1e-5) break search;
        }
        if (!inward && (!fallback || minClearance > fallback.minClearance + 1e-5
          || (Math.abs(minClearance - fallback.minClearance) <= 1e-5
            && (intendedDistance < fallback.intendedDistance - 1e-5
              || (Math.abs(intendedDistance - fallback.intendedDistance) <= 1e-5
                && entry.priority < fallback.priority))))) {
          fallback = entry;
        }
      }
    }
    if (!best && !fallback) {
      const candidate = original.clone();
      world?.resolvePosition?.(candidate, this.radius);
      fallback = { candidate };
    }
    this.position.copy((best ?? fallback).candidate);
    return Math.hypot(this.position.x - original.x, this.position.z - original.z);
  }

  #tickStatuses(delta, game) {
    const result = tickStatuses(this.statuses, delta);
    this.statuses = result.statuses;
    if (result.dotDamage > 0 && this.alive) {
      const dotPower = 1 + (game?.player?.passiveEffects?.dotPower ?? 0);
      const amount = Math.max(1, Math.round(result.dotDamage * dotPower * Math.max(8, this.maxHp * 0.02)));
      // Direct DoT tick (burn/bleed) — bypass short i-frames so multi-hit DoT lands.
      const prevInvuln = this.invulnerable;
      this.invulnerable = 0;
      const dmg = this.takeDamage(amount, game, { multiHit: true, knockback: 0, dot: true });
      this.invulnerable = Math.min(prevInvuln, this.invulnerable);
      if (dmg.amount > 0) {
        game.ui?.floatText?.(
          this.position.clone().add(new THREE.Vector3(0, this.refs.modelHeight * 0.55, 0)),
          `${dmg.amount}`,
          'damage',
        );
        const isBleed = this.statuses.bleed?.remaining > 0 && !(this.statuses.burn?.remaining > 0);
        game.effects?.trail?.(
          this.position.clone().add(new THREE.Vector3(0, 1, 0)),
          isBleed ? 0xff6a7a : 0xff9040,
          0.3,
          0.24,
        );
        if (isBleed && Math.random() < 0.55) {
          game.effects?.burst?.(this.position.clone().add(new THREE.Vector3(0, 1.05, 0)), 0xff4a5a, 3, {
            speed: 1.5, size: 0.12, life: 0.22, upward: 0.15,
          });
        }
      }
    }
    // Continuous status silhouettes while afflicted (throttled).
    if (this.statuses.burn && Math.random() < delta * 5.5) {
      game.effects?.burst?.(this.position.clone().add(new THREE.Vector3(0, 0.85, 0)), 0xff7a42, 4, {
        speed: 1.7, size: 0.15, life: 0.3, upward: 0.55,
      });
    }
    if (this.statuses.slow) {
      if (Math.random() < delta * 3.5) {
        game.effects?.trail?.(this.position.clone().add(new THREE.Vector3(0, 0.55, 0)), 0xa8ecff, 0.2, 0.22);
      }
      if (Math.random() < delta * 1.2) {
        game.effects?.groundDecal?.(this.position, 0xa8ecff, this.radius * 1.5, { life: 0.55, opacity: 0.28, startScale: 0.4 });
      }
    }
    if (this.statuses.expose && Math.random() < delta * 2.2) {
      const markH = this.refs.modelHeight * 0.92 + 0.3;
      game.effects?.ring?.(
        this.position.clone().add(new THREE.Vector3(0, markH, 0)),
        0xffd26b,
        0.55,
        { life: 0.28, startScale: 0.35, height: 0.9, opacity: 0.65 },
      );
    }
    if (this.eliteAffix === 'shielded' && this.shieldHitsLeft > 0 && Math.random() < delta * 2) {
      game.effects?.ring?.(this.position, 0x7ad8ff, this.radius * 1.8, {
        life: 0.25, startScale: 0.4, height: 0.2, opacity: 0.4,
      });
    }
  }

  #move(direction, delta, factor, world) {
    const slowMul = statusMoveMul(this.statuses);
    const desired = TMP_B.copy(direction).normalize().multiplyScalar(this.speed * factor * slowMul);
    this.velocity.lerp(desired, 1 - Math.exp(-7.5 * delta));
    this.position.addScaledVector(this.velocity, delta);
    world.resolvePosition(this.position, this.radius);
  }

  #brake(delta, amount = 1) {
    this.velocity.multiplyScalar(Math.pow(.03, delta * amount));
  }

  #wander(delta, world) {
    this.state = 'idle';
    this.wanderTimer -= delta;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = rand(1.4, 4.4);
      const back = this.spawnPoint.clone().sub(this.position).setY(0);
      if (back.lengthSq() > 100) this.wanderDirection.copy(back.normalize());
      else this.wanderDirection.set(rand(-1, 1), 0, rand(-1, 1)).normalize();
    }
    if (Math.sin(this.animTime * .43 + this.level) > -.45) {
      this.facing.lerp(this.wanderDirection, 1 - Math.exp(-3.5 * delta)).normalize();
      this.#move(this.facing, delta, .25, world);
    } else this.#brake(delta, 1.4);
  }

  #keepOutOfCamp() {
    const distance = Math.hypot(this.position.x, this.position.z);
    const min = GAME_CONFIG.campRadius + this.radius + 1.2;
    if (distance > 0.001 && distance < min) {
      this.position.x *= min / distance;
      this.position.z *= min / distance;
    }
  }

  #playAnimation(name, timeScale = 1) {
    if (!this.animation?.has(name)) return;
    if (this.animation.oneShot?.name === name && this.animation.oneShot.elapsed < this.animation.oneShot.duration * .68) return;
    this.animation.playOneShot(name, { fade: .09, fadeOut: .12, timeScale, fallback: 'idle' });
  }

  #animate(delta, elapsed, playerDistance) {
    const speed = this.velocity.length();
    this.animation.setLocomotion(speed, { sprint: speed > this.speed * 1.12 });
    // Far fodder: update animation at half rate to cut skinning cost.
    let animDelta = delta;
    if (this.fodder && playerDistance > HORDE_CONFIG.animSkipDistance) {
      this._animSkipAcc = (this._animSkipAcc + 1) % 2;
      if (this._animSkipAcc === 1) {
        animDelta = delta * 2;
        this.animation.update(animDelta, { distance: playerDistance, visible: this.mesh.visible });
      }
    } else {
      this._animSkipAcc = 0;
      this.animation.update(delta, { distance: playerDistance, visible: this.mesh.visible });
    }
    const statusPulse = this.statuses.burn ? 0.35 : this.statuses.slow ? 0.2 : 0;
    setMaterialHitPulse(this.mesh, Math.max(
      this.hitTimer > 0 ? Math.min(1, this.hitTimer / .15) : 0,
      statusPulse,
    ));
    // Directional squash-and-stretch: bias lateral squash along hit axis (not uniform).
    if (this.hitTimer > 0 && this.alive) {
      // Envelope over ~0.28s peak window; hitTimer may be capped higher for multi-hit.
      const ht = Math.min(1, this.hitTimer / .28);
      const punch = Math.sin(ht * Math.PI) * (this.boss ? .05 : .13);
      // Project hitDir into mesh-local XZ so left/right hits lean differently.
      const yaw = this.mesh.rotation.y;
      const cos = Math.cos(-yaw);
      const sin = Math.sin(-yaw);
      const lx = this.hitDir.x * cos - this.hitDir.z * sin;
      const lz = this.hitDir.x * sin + this.hitDir.z * cos;
      const ax = Math.abs(lx);
      const az = Math.abs(lz);
      // Compress along impact axis, expand on the perpendicular + slight Y squash.
      const along = 1 - punch * 1.15;
      const across = 1 + punch * .95;
      const sx = ax >= az ? along : across;
      const sz = az > ax ? along : across;
      this.mesh.scale.set(
        this.normalScale.x * sx,
        this.normalScale.y * (1 - punch * .85),
        this.normalScale.z * sz,
      );
    } else if (this.alive) {
      this.mesh.scale.lerp(this.normalScale, Math.min(1, delta * 14));
    }
    const targetYaw = Math.atan2(this.facing.x, this.facing.z);
    let difference = targetYaw - this.mesh.rotation.y;
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));
    this.mesh.rotation.y += difference * Math.min(1, delta * (this.boss ? 5 : 9));
    if (this.fodder) {
      // Fodder bars only after a hit (brief), never idle proximity spam.
      this.refs.healthGroup.visible = this.healthBarTimer > 0 || this.hitTimer > 0;
    } else {
      this.refs.healthGroup.visible = this.boss || this.elite || this.healthRatio < .995 || playerDistance < 8;
    }
    this.#setHealthBar(this.healthRatio);
  }

  #updateBillboard(camera) {
    if (!this.refs.healthGroup.visible) return;
    camera.getWorldQuaternion(this.refs.healthGroup.quaternion);
    const parentWorld = this.mesh.getWorldQuaternion(new THREE.Quaternion());
    this.refs.healthGroup.quaternion.premultiply(parentWorld.invert());
  }

  #setHealthBar(ratio) {
    const width = this.refs.healthWidth;
    this.refs.healthFill.scale.x = Math.max(.001, width * ratio);
    this.refs.healthFill.position.x = -(width - width * ratio) * .5;
    this.refs.healthFill.material.color.setHex(ratio < .25 ? 0xff355f : this.elite ? 0xffbf55 : 0xff5f73);
  }

  takeDamage(rawAmount, game, options = {}) {
    if (!this.alive) return { amount: 0, killed: false };
    if (this.invulnerable > 0) {
      const contract = options.sameCastHit;
      const key = typeof contract?.key === 'string' ? contract.key : '';
      const cap = clamp(Math.floor(Number(contract?.maxHits) || 0), 0, 8);
      const entry = key ? (this.sameCastHitIFrames.get(key) ?? { hits: 0, remaining: .75 }) : null;
      if (!entry || entry.hits >= cap) return { amount: 0, killed: false };
      entry.hits += 1;
      entry.remaining = .75;
      this.sameCastHitIFrames.set(key, entry);
    }
    let incoming = rawAmount;
    // Shielded elite: absorb first N hits (halved damage) until shield breaks.
    if (this.shieldHitsLeft > 0 && !options.dot) {
      this.shieldHitsLeft -= 1;
      incoming *= 0.45;
      game.effects?.ring?.(this.position, 0x7ad8ff, this.radius * 2, {
        life: 0.22, startScale: 0.35, height: 0.15, opacity: 0.7,
      });
      if (this.shieldHitsLeft <= 0) {
        game.effects?.burst?.(this.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xa8ecff, 12, {
          speed: 4, size: 0.22, life: 0.35, upward: 0.4,
        });
        game.ui?.floatText?.(this.position.clone().add(new THREE.Vector3(0, this.refs.modelHeight * 0.7, 0)), 'SHIELD BREAK', 'critical');
      }
    }
    const armorPierce = clamp(options.armorPierce ?? 0, 0, .85);
    const reduction = this.defense * .37 * (1 - armorPierce);
    const amount = Math.max(1, Math.round(incoming - reduction));
    this.hp = Math.max(0, this.hp - amount);
    // Cap hitstun accumulation so multi-hit flurries cannot lock forever.
    this.hitTimer = Math.min(0.4, this.hitTimer + 0.28);
    if (this.fodder) this.healthBarTimer = 2;
    if (options.direction) {
      const d = options.direction;
      const lenSq = d.x * d.x + d.z * d.z;
      if (lenSq > 1e-6) {
        const inv = 1 / Math.sqrt(lenSq);
        this.hitDir.set(d.x * inv, 0, d.z * inv);
      }
    }
    this.#playAnimation('hit', 1.35);
    this.invulnerable = options.multiHit ? .045 : .09;
    this.lastHitAt = game.elapsed;
    if (options.direction) {
      const force = (options.knockback ?? (this.boss ? .9 : this.elite ? 1.8 : 2.6)) * (this.boss ? .72 : 1);
      this.knockback.addScaledVector(options.direction, force);
    }
    // Elite enraged affix: power spike under half HP.
    if (this.eliteAffix === 'enraged' && !this.affixEnraged && this.healthRatio <= 0.5) {
      this.affixEnraged = true;
      this.damage *= 1.18;
      this.speed *= 1.1;
      this.attackCooldown = Math.min(this.attackCooldown, 0.35);
      game.effects?.pillar?.(this.position, 0xff6a55, 5, { life: 0.55, bottom: 0.8 });
      game.ui?.notify?.(`${this.data.name} enrages!`, 'danger', 2.4);
    }
    // Flagship boss phase-2 (B4) — once per fight.
    if (this.boss && this.bossPhase === 1) {
      const thr = this.data.phase2Hp ?? 0.5;
      if (this.healthRatio <= thr) {
        this.bossPhase = 2;
        this.speed *= 1.08;
        this.specialCooldown = Math.min(this.specialCooldown, 1.2);
        game.effects?.pillar?.(this.position, this.data.accent, 9, { life: 0.9, bottom: 1.5 });
        game.effects?.ring?.(this.position, this.data.accent, 6, { life: 0.7, startScale: 0.08 });
        game.ui?.notify?.('The beast grows desperate…', 'boss', 3.5);
      }
    }
    // Brief hitstun so the body "eats" the hit (bosses only flinch slightly).
    this.state = 'hit';
    this.stateTimer = Math.max(this.stateTimer, this.boss ? .06 : .16);
    this.#setHealthBar(this.healthRatio);
    if (this.hp <= 0) {
      const overkill = amount >= this.maxHp * 0.5
        || Boolean(options.critical && options.finisher)
        || Boolean(options.overkill);
      this.#die(game, options.direction, { overkill, critical: options.critical, finisher: options.finisher });
    }
    return { amount, killed: !this.alive };
  }

  #die(game, direction = null, deathOpts = {}) {
    if (!this.alive) return;
    this.alive = false;
    this.sameCastHitIFrames.clear();
    this.clearSpellPrime();
    this.overkill = Boolean(deathOpts.overkill);
    this.deathArchetype = this.#deathArchetype();
    // Slime/colossus need a bit more stage time for signature collapse.
    const baseDur = this.boss ? 1.45 : this.deathArchetype === 'colossus' ? 1.15 : this.deathArchetype === 'slime' ? 0.95 : .78;
    this.deathTimer = baseDur;
    this.deathDuration = baseDur;
    this.deathVelY = 0;
    this.deathBounced = false;
    this.slimeBurstDone = false;
    this.refs.healthGroup.visible = false;
    this.velocity.set(0, 0, 0);
    this.animation.playOneShot('death', {
      fade: .10,
      fadeOut: .18,
      timeScale: this.boss || this.deathArchetype === 'colossus' ? .72 : 1.06,
      fallback: null,
    });
    if (direction) {
      const force = this.overkill
        ? (this.boss ? 5.5 : 9 + Math.random() * 3)
        : (this.boss ? 2.2 : 4.8);
      this.knockback.addScaledVector(direction, force);
      // Random lateral spread so multikills don't stack perfectly.
      if (this.overkill && !this.boss) {
        this.knockback.x += (Math.random() - 0.5) * 3.5;
        this.knockback.z += (Math.random() - 0.5) * 3.5;
      }
    }
    if (this.overkill) {
      this.deathVelY = this.boss ? 3.2 : 4 + Math.random() * 2;
    }
    // Volatile elite: small death burst (capped vs player max HP).
    if (this.eliteAffix === 'volatile' && game.player?.alive) {
      const radius = 3.2;
      game.effects?.ring?.(this.position, 0xff9040, radius, { life: 0.45, startScale: 0.12 });
      game.effects?.burst?.(this.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xff6a40, 18, {
        speed: 5, size: 0.28, life: 0.45, upward: 0.4,
      });
      const dist = game.player.position.distanceTo(this.position);
      if (dist < radius + 0.5) {
        const cap = Math.round(game.player.maxHp * 0.12);
        const raw = Math.min(cap, Math.round(this.damage * 0.85));
        const dir = game.player.position.clone().sub(this.position).setY(0);
        if (dir.lengthSq() > 1e-6) dir.normalize();
        else dir.set(0, 0, 1);
        const dealt = game.player.takeDamage(raw, dir.clone().multiplyScalar(5.5));
        if (dealt > 0) {
          game.ui?.floatText?.(
            game.player.position.clone().add(new THREE.Vector3(0, 1.8, 0)),
            `-${dealt}`,
            'hurt',
          );
          game.effects?.burst?.(game.player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff6b6b, 10, {
            speed: 3.5, size: 0.24, life: 0.4, upward: 0.35,
          });
        }
      }
    }
    game.onEnemyKilled(this);
  }

  #deathArchetype() {
    const shape = String(this.data?.shape ?? '').toLowerCase();
    const id = String(this.typeId ?? this.data?.id ?? '').toLowerCase();
    if (shape === 'blob' || id.includes('slime') || id.includes('blob') || id.includes('jelly')) return 'slime';
    if (shape === 'colossus' || id.includes('colossus') || this.boss && (this.data?.scale ?? 1) >= 1.6) return 'colossus';
    return 'default';
  }

  #updateDeath(delta, game) {
    this.deathTimer -= delta;
    const duration = this.deathDuration || (this.boss ? 1.45 : .78);
    const t = clamp(this.deathTimer / duration, 0, 1);
    const progress = 1 - t;

    // Overkill launch: vertical parabola + single light bounce.
    if (this.deathVelY !== 0 || this.overkill) {
      this.deathVelY -= 18 * delta;
      this.mesh.position.y += this.deathVelY * delta;
      const groundY = 0;
      if (this.mesh.position.y < groundY) {
        this.mesh.position.y = groundY;
        if (!this.deathBounced && this.deathVelY < -1.2) {
          this.deathVelY *= -0.32;
          this.deathBounced = true;
          game.effects?.dust?.(this.position, 0xc4b89a, 8, 0.35);
          game.effects?.burst?.(this.position.clone().add(new THREE.Vector3(0, 0.2, 0)), 0xd8c8a0, 6, {
            speed: 2.2, size: 0.18, life: 0.35, upward: 0.2, gravity: 6,
          });
        } else {
          this.deathVelY = 0;
        }
      }
    }

    this.position.addScaledVector(this.knockback, delta);
    game.world.resolvePosition(this.position, this.radius);
    this.animation.update(delta, { distance: game.camera.position.distanceTo(this.position), visible: this.mesh.visible });
    setMaterialHitPulse(this.mesh, 0);

    const arch = this.deathArchetype || 'default';
    if (arch === 'slime') {
      // Flatten then burst particles once near mid death.
      const flatten = clamp(progress * 1.6, 0, 1);
      const sx = THREE.MathUtils.lerp(1, 1.55, flatten);
      const sy = THREE.MathUtils.lerp(1, 0.18, flatten);
      const sz = THREE.MathUtils.lerp(1, 1.55, flatten);
      this.mesh.scale.set(
        this.normalScale.x * sx,
        this.normalScale.y * sy,
        this.normalScale.z * sz,
      );
      if (!this.slimeBurstDone && progress > 0.55) {
        this.slimeBurstDone = true;
        const color = this.data?.accent ?? this.data?.color ?? 0x63d58b;
        game.effects?.burst?.(this.position.clone().add(new THREE.Vector3(0, 0.35, 0)), color, 14, {
          speed: 4.5, size: 0.28, life: 0.55, upward: 0.55, gravity: 5,
        });
        game.effects?.burst?.(this.position.clone().add(new THREE.Vector3(0, 0.2, 0)), color, 8, {
          speed: 2.8, size: 0.2, life: 0.7, upward: 0.15, gravity: 3, opacity: 0.55,
        });
      }
    } else if (arch === 'colossus') {
      // Slow sequential collapse.
      const collapse = THREE.MathUtils.lerp(1, 0.35, Math.pow(progress, 0.65));
      this.mesh.scale.copy(this.normalScale).multiplyScalar(collapse);
      if (!this.overkill) this.mesh.position.y += delta * 0.12 * progress;
    } else {
      const collapse = this.boss ? THREE.MathUtils.lerp(.72, 1, t) : THREE.MathUtils.lerp(.22, 1, t);
      this.mesh.scale.copy(this.normalScale).multiplyScalar(collapse);
      if (!this.overkill) this.mesh.position.y += (1 - t) * delta * (this.boss ? .25 : .55);
    }

    this.mesh.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material || !('opacity' in material) || material === this.refs.healthFill?.material) continue;
        if (material.transparent) material.opacity = Math.min(material.opacity, Math.max(.04, t));
      }
    });
    if (this.deathTimer <= 0) {
      this.removable = true;
      this.monsterFactory?.outlines?.unregister(this.mesh);
      this.animation.dispose();
      this.scene.remove(this.mesh);
    }
  }

  forceRemove() {
    if (this.removable) return;
    this.removable = true;
    this.monsterFactory?.outlines?.unregister(this.mesh);
    this.animation?.dispose();
    this.scene.remove(this.mesh);
  }
}
