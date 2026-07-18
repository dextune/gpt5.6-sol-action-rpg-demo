/**
 * Generic bounded damped-spring secondary motion (template-layer candidate).
 * No Sol content imports — keep game-free. See docs/architecture-template-boundary.md
 *
 * Simulates lightweight "spring bone" sway for cape/coat/hair/quiver/hose-style chains
 * after the mixer and IK have run. Each entry names a `bone` (the joint whose local
 * rotation is owned/overwritten by this simulation) and an implicit or explicit tip
 * offset — the fixed-length point that physically swings. The simulated tip is
 * constrained to a fixed distance from the bone (no stretching), clamped to a maximum
 * angular displacement from its rest direction, delta-clamped per substep, and hard-reset
 * (no snap-back lag) whenever the bone's anchor (its parent) teleports beyond a
 * configurable threshold in a single update. Never touches weapon sockets, damage, or
 * collision — purely a visual local-rotation offset applied to `bone.quaternion`.
 */
import * as THREE from 'three';

export const SECONDARY_MOTION_DEFAULTS = Object.freeze({
  /** Spring pull-back strength (1/s^2-ish). Higher = snappier return to rest. */
  stiffness: 140,
  /** Velocity damping (critical-ish damping around stiffness ~140 is roughly 2*sqrt(140)). */
  damping: 18,
  /** Maximum angular displacement from the rest direction, radians. */
  maxAngle: THREE.MathUtils.degToRad(35),
  /** Per-substep integration clamp (seconds) — avoids explosion on long frame hitches. */
  maxSubstep: 1 / 30,
  /** Anchor movement beyond this in one update (world units) forces an instant reset. */
  teleportThreshold: 1.5,
  /** LOD floor: quality below this snaps straight to rest with zero simulation cost. */
  minQuality: 'low',
});

const QUALITY_RANK = Object.freeze({ off: 0, low: 1, medium: 2, high: 3 });

function qualityRank(q) {
  return QUALITY_RANK[q] ?? QUALITY_RANK.high;
}

const DEFAULT_TIP_OFFSET = Object.freeze(new THREE.Vector3(0, -0.3, 0));

export class SecondaryMotion {
  /**
   * @param {Array<{bone:THREE.Object3D, tipOffset?:THREE.Vector3, boneLength?:number,
   *   maxAngle?:number}>} chains `bone` is the joint this simulation rotates; `tipOffset`
   *   is the fixed local offset (in bone's own rest/un-rotated frame) to the dynamic tip —
   *   defaults to `bone.children[0].position` when present, else a downward offset.
   * @param {object} [options]
   */
  constructor(chains = [], options = {}) {
    this.stiffness = options.stiffness ?? SECONDARY_MOTION_DEFAULTS.stiffness;
    this.damping = options.damping ?? SECONDARY_MOTION_DEFAULTS.damping;
    this.maxAngle = options.maxAngle ?? SECONDARY_MOTION_DEFAULTS.maxAngle;
    this.maxSubstep = options.maxSubstep ?? SECONDARY_MOTION_DEFAULTS.maxSubstep;
    this.teleportThreshold = options.teleportThreshold ?? SECONDARY_MOTION_DEFAULTS.teleportThreshold;
    this.quality = options.quality ?? 'high';
    this.disposed = false;
    this.chains = chains.map(entry => this.#buildState(entry));
  }

  #buildState(entry) {
    const bone = entry.bone;
    const tipOffset = (entry.tipOffset ?? bone?.children?.[0]?.position ?? DEFAULT_TIP_OFFSET).clone();
    const tipLength = tipOffset.length();
    const boneLength = Number.isFinite(entry.boneLength) && entry.boneLength > 0 ? entry.boneLength : Math.max(1e-4, tipLength);
    const maxAngle = Number.isFinite(entry.maxAngle) ? Math.max(0, entry.maxAngle) : this.maxAngle;
    const authoredRestQuaternion = bone?.quaternion?.clone?.() ?? new THREE.Quaternion();
    const state = {
      bone,
      tipRestLocal: tipOffset,
      restDirLocal: tipLength > 1e-8 ? tipOffset.clone().normalize() : new THREE.Vector3(0, -1, 0),
      boneLength,
      maxAngle,
      authoredRestQuaternion,
      baseLocalQuaternion: authoredRestQuaternion.clone(),
      currentTipWorldPos: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      lastAnchorWorldPos: new THREE.Vector3(),
      initialized: false,
    };
    this.#snapToRest(state);
    return state;
  }

  /** World position of `bone` itself (translation-only; unaffected by the spring rotation). */
  #boneWorldPos(state, out) {
    if (!state.bone) return out.set(0, 0, 0);
    state.bone.updateWorldMatrix(true, false);
    return state.bone.getWorldPosition(out);
  }

  /** World quaternion of `bone.parent` — the frame `bone.quaternion` operates within. */
  #boneParentWorldQuat(state, out) {
    if (!state.bone?.parent) return out.identity();
    return state.bone.parent.getWorldQuaternion(out);
  }

  #restTipWorldPos(state, out) {
    const boneWorldPos = this.#boneWorldPos(state, new THREE.Vector3());
    const parentQuat = this.#boneParentWorldQuat(state, new THREE.Quaternion());
    const baseWorldQuat = parentQuat.multiply(state.baseLocalQuaternion);
    return out.copy(state.tipRestLocal).applyQuaternion(baseWorldQuat).add(boneWorldPos);
  }

  #snapToRest(state, authored = false) {
    if (!state.bone) return;
    if (authored) {
      state.baseLocalQuaternion.copy(state.authoredRestQuaternion);
      state.bone.quaternion.copy(state.authoredRestQuaternion);
    } else {
      state.bone.quaternion.copy(state.baseLocalQuaternion);
    }
    state.bone.updateMatrixWorld(true);
    const restTip = this.#restTipWorldPos(state, new THREE.Vector3());
    state.currentTipWorldPos.copy(restTip);
    state.velocity.set(0, 0, 0);
    if (state.bone.parent) {
      state.bone.parent.updateWorldMatrix(true, false);
      state.bone.parent.getWorldPosition(state.lastAnchorWorldPos);
    } else {
      state.lastAnchorWorldPos.set(0, 0, 0);
    }
    state.initialized = true;
  }

  /** Rotate `bone` relative to the current mixer-authored base pose. */
  #writeBoneRotation(state, tipWorldPos) {
    const bone = state.bone;
    if (!bone) return;
    const boneWorldPos = this.#boneWorldPos(state, new THREE.Vector3());
    const parentQuat = this.#boneParentWorldQuat(state, new THREE.Quaternion());
    const baseWorldQuat = parentQuat.clone().multiply(state.baseLocalQuaternion);
    const restWorldDir = state.restDirLocal.clone().applyQuaternion(baseWorldQuat).normalize();
    const desiredWorldDir = tipWorldPos.clone().sub(boneWorldPos);
    if (desiredWorldDir.lengthSq() < 1e-10) return;
    desiredWorldDir.normalize();
    const desiredWorldQuat = new THREE.Quaternion()
      .setFromUnitVectors(restWorldDir, desiredWorldDir)
      .multiply(baseWorldQuat);
    bone.quaternion.copy(parentQuat.invert().multiply(desiredWorldQuat));
  }

  /** Clear spring state and restore the authored local rest rotation. */
  reset() {
    for (const state of this.chains) this.#snapToRest(state, true);
  }

  setQuality(quality) {
    this.quality = quality;
  }

  /**
   * @param {number} delta seconds since last update
   * @param {object} [options]
   * @param {boolean} [options.teleport] force an instant reset regardless of measured movement
   * @param {string} [options.quality] per-call quality override
   */
  update(delta, options = {}) {
    if (this.disposed || !Number.isFinite(delta) || delta <= 0) return;
    const quality = options.quality ?? this.quality;
    const active = qualityRank(quality) >= qualityRank(SECONDARY_MOTION_DEFAULTS.minQuality);
    const forceTeleport = Boolean(options.teleport);

    for (const state of this.chains) {
      if (!state.bone) continue;
      // AnimationMixer has just evaluated this frame. Treat that authored pose as the spring's
      // moving base instead of accumulating the previous frame's secondary offset.
      state.baseLocalQuaternion.copy(state.bone.quaternion);
      if (!active) {
        // LOD: skip simulation entirely, hold rest pose (bounded, zero jitter cost).
        this.#snapToRest(state);
        continue;
      }

      const anchorWorldPos = new THREE.Vector3();
      if (state.bone.parent) state.bone.parent.getWorldPosition(anchorWorldPos);
      const anchorMoved = state.initialized ? anchorWorldPos.distanceTo(state.lastAnchorWorldPos) : 0;
      const goal = this.#restTipWorldPos(state, new THREE.Vector3());

      if (forceTeleport || !state.initialized || anchorMoved > this.teleportThreshold) {
        state.currentTipWorldPos.copy(goal);
        state.velocity.set(0, 0, 0);
      } else {
        let remaining = delta;
        while (remaining > 1e-9) {
          const dt = Math.min(this.maxSubstep, remaining);
          remaining -= dt;
          const force = goal.clone().sub(state.currentTipWorldPos).multiplyScalar(this.stiffness)
            .addScaledVector(state.velocity, -this.damping);
          state.velocity.addScaledVector(force, dt).clampLength(0, Math.max(state.boneLength, 1e-3) * 60);
          state.currentTipWorldPos.addScaledVector(state.velocity, dt);
        }
      }

      // Constrain the tip to a fixed length from the bone (rigid, no stretching).
      const boneWorldPos = this.#boneWorldPos(state, new THREE.Vector3());
      const dir = state.currentTipWorldPos.clone().sub(boneWorldPos);
      if (dir.lengthSq() < 1e-10) dir.copy(state.restDirLocal);
      dir.normalize();

      // Clamp angular displacement from the rest direction (bone-parent-local, world-aligned).
      if (state.maxAngle < Math.PI) {
        const parentQuat = this.#boneParentWorldQuat(state, new THREE.Quaternion());
        const baseWorldQuat = parentQuat.multiply(state.baseLocalQuaternion);
        const restWorldDir = state.restDirLocal.clone().applyQuaternion(baseWorldQuat).normalize();
        const angle = restWorldDir.angleTo(dir);
        if (angle > state.maxAngle) {
          const axis = new THREE.Vector3().crossVectors(restWorldDir, dir);
          if (axis.lengthSq() < 1e-10) {
            axis.crossVectors(restWorldDir, new THREE.Vector3(1, 0, 0));
            if (axis.lengthSq() < 1e-10) axis.crossVectors(restWorldDir, new THREE.Vector3(0, 1, 0));
          }
          axis.normalize();
          const clampQuat = new THREE.Quaternion().setFromAxisAngle(axis, state.maxAngle);
          dir.copy(restWorldDir).applyQuaternion(clampQuat);
        }
      }
      state.currentTipWorldPos.copy(boneWorldPos).addScaledVector(dir, state.boneLength);

      this.#writeBoneRotation(state, state.currentTipWorldPos);
      state.lastAnchorWorldPos.copy(anchorWorldPos);
      state.initialized = true;
    }
  }

  dispose() {
    this.disposed = true;
    this.chains.length = 0;
  }
}

export default SecondaryMotion;
