import * as THREE from 'three';
import { clamp } from '../core/Utils.js';

const MAX_GEMS = 200;
const MERGE_RADIUS = 1.2;
const CONTACT_RADIUS = 0.55;
const TIER_COLOR = Object.freeze({
  small: 0x9ef0c4,
  medium: 0x6ec8ff,
  large: 0xffe06b,
});
const TIER_SCALE = Object.freeze({
  small: 0.22,
  medium: 0.32,
  large: 0.44,
});
/**
 * Floor XP gems with magnet vacuum pickup.
 * Kill XP is deferred until collection so the horde loop has tactile feedback.
 */
export class XpGemSystem {
  /**
   * @param {import('../core/Game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    /** @type {Array<{
     *   position: THREE.Vector3,
     *   xp: number,
     *   tier: 'small'|'medium'|'large',
     *   age: number,
     *   life: number,
     *   magnetized: boolean,
     *   velocity: THREE.Vector3,
     *   mesh: THREE.Mesh|null,
     *   active: boolean,
     * }>} */
    this.gems = [];
    this.pool = [];
    this.lastPickupTime = -999;
    this.pickupCombo = 0;
    this._sharedGeo = new THREE.OctahedronGeometry(1, 0);
    this.root = new THREE.Group();
    this.root.name = 'xp-gems';
    game.scene.add(this.root);
  }

  /**
   * Convert enemy.xpValue into floor gems. Does not grant XP.
   * @param {import('../entities/Enemy.js').Enemy} enemy
   */
  spawnFromKill(enemy) {
    if (!enemy) return;
    const totalXp = Math.max(1, Math.round(enemy.xpValue || 1));
    const origin = enemy.position.clone().add(new THREE.Vector3(0, 0.35, 0));

    if (enemy.boss) {
      this.spawnBurst(origin, totalXp, clamp(Math.round(14 + totalXp / 40), 12, 28));
      return;
    }
    if (enemy.elite) {
      const large = totalXp >= 80;
      const count = large ? 3 : 2;
      this.spawnBurst(origin, totalXp, count, large ? 'large' : 'medium');
      return;
    }
    if (enemy.fodder) {
      this.#spawnOne(origin, totalXp, 'small', this.#scatterVel(2.2));
      return;
    }
    // Normal: 1–2 small/medium
    const count = totalXp >= 40 ? 2 : 1;
    this.spawnBurst(origin, totalXp, count, totalXp >= 55 ? 'medium' : 'small');
  }

  /**
   * @param {THREE.Vector3} position
   * @param {number} totalXp
   * @param {number} count
   * @param {'small'|'medium'|'large'} [forceTier]
   */
  spawnBurst(position, totalXp, count, forceTier) {
    const n = Math.max(1, Math.round(count));
    const share = Math.max(1, Math.floor(totalXp / n));
    let remaining = Math.max(1, Math.round(totalXp));
    for (let i = 0; i < n; i += 1) {
      const last = i === n - 1;
      const xp = last ? remaining : share;
      remaining -= xp;
      const tier = forceTier ?? this.#tierForXp(xp, n > 8);
      const vel = this.#scatterVel(n > 10 ? 5.5 : 3.2);
      // Fountain arc for big bursts
      if (n >= 10) vel.y = 3.5 + Math.random() * 3.5;
      this.#spawnOne(position, Math.max(1, xp), tier, vel);
    }
    if (this.gems.length > MAX_GEMS * 0.85) this.#mergeNearby(MERGE_RADIUS);
  }

  /**
   * @param {number} delta
   */
  update(delta) {
    const player = this.game.player;
    if (!player) return;
    const magnetR = player.alive ? (player.pickupRadius ?? 2.2) : 0;
    const magnetRSq = magnetR * magnetR;
    const contactSq = CONTACT_RADIUS * CONTACT_RADIUS;

    for (let i = this.gems.length - 1; i >= 0; i -= 1) {
      const gem = this.gems[i];
      if (!gem.active) continue;
      gem.age += delta;
      gem.life -= delta;

      // Gravity while airborne (spawn scatter)
      if (!gem.magnetized) {
        gem.velocity.y -= 14 * delta;
        gem.position.addScaledVector(gem.velocity, delta);
        gem.velocity.x *= Math.pow(0.08, delta);
        gem.velocity.z *= Math.pow(0.08, delta);
        const ground = (this.game.world?.heightAt?.(gem.position.x, gem.position.z) ?? 0) + 0.28;
        if (gem.position.y < ground) {
          gem.position.y = ground;
          if (gem.velocity.y < 0) gem.velocity.y *= -0.35;
          if (Math.abs(gem.velocity.y) < 0.4) gem.velocity.y = 0;
        }
      }

      if (player.alive && magnetR > 0) {
        const dx = player.position.x - gem.position.x;
        const dy = (player.position.y + 0.9) - gem.position.y;
        const dz = player.position.z - gem.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < magnetRSq) {
          gem.magnetized = true;
          const dist = Math.sqrt(distSq) || 0.001;
          const pull = clamp(18 + (magnetR - dist) * 12, 14, 42);
          gem.velocity.x = (dx / dist) * pull;
          gem.velocity.y = (dy / dist) * pull * 0.85;
          gem.velocity.z = (dz / dist) * pull;
          gem.position.addScaledVector(gem.velocity, delta);
          if (distSq < contactSq || dist < CONTACT_RADIUS) {
            this.#collect(gem);
            this.#release(gem);
            this.gems.splice(i, 1);
            continue;
          }
        }
      }

      if (gem.life <= 0) {
        // Auto-collect expired gems so XP is not lost
        if (player.alive) this.#collect(gem, true);
        this.#release(gem);
        this.gems.splice(i, 1);
        continue;
      }

      if (gem.mesh) {
        const bob = Math.sin(gem.age * 5.5) * 0.04;
        gem.mesh.position.copy(gem.position);
        gem.mesh.position.y += bob;
        gem.mesh.rotation.y += delta * 3.2;
        gem.mesh.rotation.x += delta * 1.4;
        const mat = gem.mesh.material;
        if (mat) {
          mat.opacity = gem.magnetized
            ? 0.95
            : 0.72 + Math.sin(gem.age * 6) * 0.12;
        }
      }
    }

    if (this.gems.length > MAX_GEMS) this.#capMerge();
  }

  clear() {
    for (const gem of this.gems) this.#release(gem);
    this.gems.length = 0;
    this.lastPickupTime = -999;
    this.pickupCombo = 0;
  }

  dispose() {
    this.clear();
    this.game.scene?.remove(this.root);
    for (const gem of this.pool) {
      gem.mesh?.geometry?.dispose?.();
      gem.mesh?.material?.dispose?.();
    }
    this.pool.length = 0;
    this._sharedGeo?.dispose?.();
  }

  // --- internals ---

  #tierForXp(xp, burst) {
    if (xp >= 45 || burst && xp >= 20) return 'large';
    if (xp >= 18) return 'medium';
    return 'small';
  }

  #scatterVel(spread = 3) {
    const a = Math.random() * Math.PI * 2;
    const s = spread * (0.45 + Math.random() * 0.55);
    return new THREE.Vector3(Math.cos(a) * s, 1.8 + Math.random() * 2.4, Math.sin(a) * s);
  }

  #spawnOne(position, xp, tier, velocity) {
    if (this.gems.length >= MAX_GEMS) this.#capMerge();
    const gem = this.#acquire();
    gem.position.copy(position);
    gem.position.y += 0.2;
    gem.xp = Math.max(1, Math.round(xp));
    gem.tier = tier;
    gem.age = 0;
    gem.life = 28;
    gem.magnetized = false;
    gem.velocity.copy(velocity);
    gem.active = true;
    const scale = TIER_SCALE[tier] ?? TIER_SCALE.small;
    if (gem.mesh) {
      gem.mesh.visible = true;
      gem.mesh.scale.setScalar(scale);
      gem.mesh.material.color.setHex(TIER_COLOR[tier] ?? TIER_COLOR.small);
      gem.mesh.material.opacity = 0.85;
      gem.mesh.position.copy(gem.position);
    }
    this.gems.push(gem);
    return gem;
  }

  #acquire() {
    let gem = this.pool.pop();
    if (gem) return gem;
    const material = new THREE.MeshBasicMaterial({
      color: TIER_COLOR.small,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this._sharedGeo, material);
    mesh.frustumCulled = true;
    this.root.add(mesh);
    return {
      position: new THREE.Vector3(),
      xp: 1,
      tier: 'small',
      age: 0,
      life: 28,
      magnetized: false,
      velocity: new THREE.Vector3(),
      mesh,
      active: false,
    };
  }

  #release(gem) {
    gem.active = false;
    gem.magnetized = false;
    gem.xp = 0;
    if (gem.mesh) gem.mesh.visible = false;
    if (this.pool.length < MAX_GEMS) this.pool.push(gem);
    else if (gem.mesh) {
      this.root.remove(gem.mesh);
      gem.mesh.material?.dispose?.();
      gem.mesh = null;
    }
  }

  #collect(gem, silent = false) {
    const player = this.game.player;
    if (!player || gem.xp <= 0) return;
    const result = player.addXp(gem.xp);
    const pos = gem.position.clone().add(new THREE.Vector3(0, 0.6, 0));
    if (!silent && result.amount > 0) {
      this.game.ui?.floatText?.(pos, `+${result.amount}`, 'heal');
      this.#playPickup();
      this.game.effects?.burst?.(pos, TIER_COLOR[gem.tier] ?? TIER_COLOR.small, 4, {
        speed: 2.4, size: 0.12, life: 0.28, upward: 0.35, opacity: 0.85,
      });
    }
    if (result.levelUps?.length) this.game.onXpLevelUps?.(result.levelUps);
  }

  #playPickup() {
    const now = this.game.elapsed ?? 0;
    if (now - this.lastPickupTime <= 0.8) {
      this.pickupCombo = Math.min(12, this.pickupCombo + 1);
    } else {
      this.pickupCombo = 0;
    }
    this.lastPickupTime = now;
    // Semitone steps from base (~0.92) up to ~1.85
    const rate = 0.92 * Math.pow(2, this.pickupCombo / 12);
    this.game.audio?.pickup?.('common', { rate });
  }

  #mergeNearby(radius) {
    const rSq = radius * radius;
    for (let i = 0; i < this.gems.length; i += 1) {
      const a = this.gems[i];
      if (!a.active) continue;
      for (let j = i + 1; j < this.gems.length; j += 1) {
        const b = this.gems[j];
        if (!b.active) continue;
        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        if (dx * dx + dz * dz > rSq) continue;
        a.xp += b.xp;
        a.tier = this.#tierForXp(a.xp, false);
        if (a.mesh) {
          a.mesh.scale.setScalar(TIER_SCALE[a.tier]);
          a.mesh.material.color.setHex(TIER_COLOR[a.tier]);
        }
        this.#release(b);
        this.gems.splice(j, 1);
        j -= 1;
      }
    }
  }

  #capMerge() {
    // Merge oldest into nearest until under cap
    while (this.gems.length > MAX_GEMS) {
      let oldest = 0;
      for (let i = 1; i < this.gems.length; i += 1) {
        if (this.gems[i].age > this.gems[oldest].age) oldest = i;
      }
      const victim = this.gems[oldest];
      let nearest = -1;
      let best = Infinity;
      for (let i = 0; i < this.gems.length; i += 1) {
        if (i === oldest) continue;
        const d = victim.position.distanceToSquared(this.gems[i].position);
        if (d < best) { best = d; nearest = i; }
      }
      if (nearest < 0) {
        this.#release(victim);
        this.gems.splice(oldest, 1);
        continue;
      }
      const keep = this.gems[nearest];
      keep.xp += victim.xp;
      keep.tier = this.#tierForXp(keep.xp, false);
      if (keep.mesh) {
        keep.mesh.scale.setScalar(TIER_SCALE[keep.tier]);
        keep.mesh.material.color.setHex(TIER_COLOR[keep.tier]);
      }
      this.#release(victim);
      this.gems.splice(oldest, 1);
    }
  }
}
