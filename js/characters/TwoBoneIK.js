/**
 * Generic analytic two-bone IK solver (template-layer candidate).
 * No Sol content imports — keep game-free. See docs/architecture-template-boundary.md
 *
 * Solves the classic shoulder→elbow→hand (or hip→knee→foot) chain in world space using
 * the law of cosines. Every output is finite: unreachable targets are clamped to the
 * maximum/minimum reach along the root→target direction instead of producing NaN/complex
 * results, and the elbow bend plane always has a well-defined normal (falls back to an
 * arbitrary perpendicular when the pole target is degenerate/collinear).
 */
import * as THREE from 'three';

/** Smallest reach delta kept between fully extended/collapsed to avoid a singular elbow. */
const MIN_SLACK = 1e-4;

const _rootToTarget = new THREE.Vector3();
const _rootToPole = new THREE.Vector3();
const _bendAxis = new THREE.Vector3();
const _chainDir = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _fallbackUp = new THREE.Vector3(0, 1, 0);
const _fallbackRight = new THREE.Vector3(1, 0, 0);

function safeNormalize(v, fallback) {
  const lenSq = v.lengthSq();
  if (!Number.isFinite(lenSq) || lenSq < 1e-10) {
    v.copy(fallback);
    return v;
  }
  return v.normalize();
}

/** Arbitrary vector not parallel to `dir`, used when pole/bend data is degenerate. */
function anyPerpendicular(dir, out) {
  const useUp = Math.abs(dir.dot(_fallbackUp)) < 0.98;
  out.copy(useUp ? _fallbackUp : _fallbackRight);
  out.sub(dir.clone().multiplyScalar(out.dot(dir)));
  return safeNormalize(out, _fallbackRight);
}

export class TwoBoneIK {
  constructor(options = {}) {
    this.epsilon = options.epsilon ?? 1e-6;
  }

  /**
   * Analytic two-bone solve in world space.
   * @param {THREE.Vector3} root world position of the root joint (e.g. shoulder/hip)
   * @param {THREE.Vector3} target world position the end effector should reach
   * @param {number} upperLength root→mid bone length (finite, > 0)
   * @param {number} lowerLength mid→end bone length (finite, > 0)
   * @param {THREE.Vector3|null} poleTarget optional world point the elbow/knee bends toward
   * @returns {{root:THREE.Vector3, mid:THREE.Vector3, end:THREE.Vector3, reach:number,
   *   maxReach:number, clamped:boolean}} all vectors finite; `reach` is 0..1 fraction of maxReach.
   */
  solve(root, target, upperLength, lowerLength, poleTarget = null) {
    const upper = Math.max(this.epsilon, Number.isFinite(upperLength) ? Math.abs(upperLength) : this.epsilon);
    const lower = Math.max(this.epsilon, Number.isFinite(lowerLength) ? Math.abs(lowerLength) : this.epsilon);
    const maxReach = upper + lower;
    const minReach = Math.max(this.epsilon, Math.abs(upper - lower) + MIN_SLACK);

    _rootToTarget.copy(target).sub(root);
    if (!Number.isFinite(_rootToTarget.lengthSq())) _rootToTarget.set(0, 0, lower);
    let dist = _rootToTarget.length();
    let clamped = false;
    if (!(dist > this.epsilon)) {
      // Target coincides with root — pick an arbitrary forward direction so the chain stays finite.
      _rootToTarget.set(0, 0, 1);
      dist = 1;
    }
    const dir = _rootToTarget.clone().normalize();

    let effectiveDist = dist;
    if (dist >= maxReach - MIN_SLACK) {
      effectiveDist = maxReach - MIN_SLACK;
      clamped = true;
    } else if (dist <= minReach) {
      effectiveDist = minReach;
      clamped = true;
    }

    // Law of cosines: angle at root between the upper bone and the root→effector line.
    const cosA = THREE.MathUtils.clamp(
      (upper * upper + effectiveDist * effectiveDist - lower * lower) / (2 * upper * effectiveDist),
      -1, 1,
    );
    const angleA = Math.acos(cosA);

    // Bend-plane normal: prefer the pole target, else fall back to a stable perpendicular.
    if (poleTarget) {
      _rootToPole.copy(poleTarget).sub(root);
      const poleOnAxis = _rootToPole.dot(dir);
      _perp.copy(_rootToPole).sub(dir.clone().multiplyScalar(poleOnAxis));
      if (_perp.lengthSq() < 1e-8) anyPerpendicular(dir, _perp);
      else safeNormalize(_perp, anyPerpendicular(dir, _bendAxis));
    } else {
      anyPerpendicular(dir, _perp);
    }
    _chainDir.copy(dir).multiplyScalar(Math.cos(angleA)).addScaledVector(_perp, Math.sin(angleA));
    safeNormalize(_chainDir, dir);

    const midPos = root.clone().addScaledVector(_chainDir, upper);
    const endPos = root.clone().addScaledVector(dir, effectiveDist);

    return {
      root: root.clone(),
      mid: midPos,
      end: endPos,
      reach: THREE.MathUtils.clamp(dist / maxReach, 0, 1),
      maxReach,
      clamped,
    };
  }

  /**
   * Orient real bone Object3D nodes (root/mid/end are parent-linked THREE.Object3D) toward a
   * solved pose, blending against each bone's current local rotation by `weight` (0..1).
   * Positions are not written (skeleton hierarchy owns translation); only rotations are set.
   */
  applyToBones(rootBone, midBone, endBone, solved, weight = 1) {
    const w = THREE.MathUtils.clamp(Number.isFinite(weight) ? weight : 0, 0, 1);
    if (w <= 0 || !rootBone || !midBone || !endBone) return;

    rootBone.updateWorldMatrix(true, true);
    const rootWorldPos = rootBone.getWorldPosition(new THREE.Vector3());
    const midWorldPos = midBone.getWorldPosition(new THREE.Vector3());
    const currentRootDir = midWorldPos.clone().sub(rootWorldPos).normalize();
    const desiredRootDir = solved.mid.clone().sub(solved.root).normalize();
    if (currentRootDir.lengthSq() > 1e-10 && desiredRootDir.lengthSq() > 1e-10) {
      const currentWorldQuat = rootBone.getWorldQuaternion(new THREE.Quaternion());
      const desiredWorldQuat = new THREE.Quaternion()
        .setFromUnitVectors(currentRootDir, desiredRootDir)
        .multiply(currentWorldQuat);
      const parentWorldQuat = rootBone.parent
        ? rootBone.parent.getWorldQuaternion(new THREE.Quaternion())
        : new THREE.Quaternion();
      const desiredLocalQuat = parentWorldQuat.invert().multiply(desiredWorldQuat);
      rootBone.quaternion.slerp(desiredLocalQuat, w);
      rootBone.updateMatrixWorld(true);
    }

    midBone.updateWorldMatrix(true, true);
    const updatedMidPos = midBone.getWorldPosition(new THREE.Vector3());
    const endWorldPos = endBone.getWorldPosition(new THREE.Vector3());
    const currentMidDir = endWorldPos.clone().sub(updatedMidPos).normalize();
    const desiredMidDir = solved.end.clone().sub(solved.mid).normalize();
    if (currentMidDir.lengthSq() > 1e-10 && desiredMidDir.lengthSq() > 1e-10) {
      const currentWorldQuat = midBone.getWorldQuaternion(new THREE.Quaternion());
      const desiredWorldQuat = new THREE.Quaternion()
        .setFromUnitVectors(currentMidDir, desiredMidDir)
        .multiply(currentWorldQuat);
      const parentWorldQuat = midBone.parent
        ? midBone.parent.getWorldQuaternion(new THREE.Quaternion())
        : new THREE.Quaternion();
      const desiredLocalQuat = parentWorldQuat.invert().multiply(desiredWorldQuat);
      midBone.quaternion.slerp(desiredLocalQuat, w);
      midBone.updateMatrixWorld(true);
    }
  }
}

export default TwoBoneIK;
