import * as THREE from 'three';
import { CharacterAnimationController, computeLocomotionWeights } from '../js/characters/CharacterAnimationController.js';
import { TwoBoneIK } from '../js/characters/TwoBoneIK.js';
import { SecondaryMotion } from '../js/characters/SecondaryMotion.js';

let failures = 0;
function ok(condition, message) {
  if (condition) console.log(`✓ ${message}`);
  else {
    failures += 1;
    console.error(`✗ ${message}`);
  }
}
function near(a, b, tolerance = 1e-5) {
  return Number.isFinite(a) && Math.abs(a - b) <= tolerance;
}
function finiteQuaternion(q) {
  return [q.x, q.y, q.z, q.w].every(Number.isFinite);
}

function createRig() {
  const root = new THREE.Group();
  root.name = 'hero_root';
  const chest = new THREE.Bone();
  chest.name = 'chest';
  chest.position.set(0, 1, 0);
  const upper = new THREE.Bone();
  upper.name = 'left_upper_arm';
  upper.position.set(.35, .2, 0);
  const lower = new THREE.Bone();
  lower.name = 'left_lower_arm';
  lower.position.set(.4, -.25, 0);
  const hand = new THREE.Bone();
  hand.name = 'left_hand';
  hand.position.set(.35, -.2, 0);
  root.add(chest);
  chest.add(upper);
  upper.add(lower);
  lower.add(hand);
  root.updateMatrixWorld(true);
  return { root, chest, upper, lower, hand };
}

function clip(name, duration, nodeNames) {
  const tracks = nodeNames.map((nodeName, index) => new THREE.QuaternionKeyframeTrack(
    `${nodeName}.quaternion`,
    [0, duration],
    [0, 0, 0, 1, 0, Math.sin((index + 1) * .04), 0, Math.cos((index + 1) * .04)],
  ));
  return new THREE.AnimationClip(name, duration, tracks);
}

console.log('--- locomotion blend math ---');
{
  const has = () => true;
  const weights = computeLocomotionWeights(3.6, 7.2, has);
  const sum = Object.values(weights).reduce((total, value) => total + value, 0);
  ok(near(sum, 1), 'speed blend weights sum to one');
  ok(Object.values(weights).every(value => value >= 0 && value <= 1), 'speed blend weights stay clamped');
  const invalid = computeLocomotionWeights(Number.NaN, 7.2, has);
  ok(near(invalid.idle, 1), 'non-finite speed resolves deterministically to idle');
}

console.log('\n--- one-mixer layered runtime ---');
{
  const rig = createRig();
  const clips = [
    clip('idle', 2, ['chest']),
    clip('walk', 1.2, ['chest']),
    clip('run', .8, ['chest']),
    clip('sprint', .65, ['chest']),
    clip('locomotion_start', .18, ['chest']),
    clip('locomotion_stop', .18, ['chest']),
    clip('pivot_left', .15, ['chest']),
    clip('pivot_right', .15, ['chest']),
    clip('pivot_180', .15, ['chest']),
    clip('fire', .6, ['chest', 'left_upper_arm', 'left_lower_arm', 'left_hand']),
    clip('recoil_add', .4, ['chest', 'left_upper_arm']),
  ];
  const controller = new CharacterAnimationController(rig.root, clips, {
    referenceRunSpeed: 7.2,
    locomotionMode: 'blend',
    strict: true,
  });
  controller.setLayerPolicy({
    upperBoneNames: ['chest', 'left_upper_arm', 'left_lower_arm', 'left_hand'],
    additiveBoneNames: ['chest', 'left_upper_arm'],
  });
  controller.setLocomotion(5.4, { turnDelta: Math.PI });
  controller.update(.1);
  const weights = controller.getLocomotionWeights();
  ok((weights.walk ?? 0) > 0 || (weights.run ?? 0) > 0 || (weights.sprint ?? 0) > 0, 'movement speed activates weighted locomotion actions');
  ok(controller.getDiagnostics().locomotionState === 'start', 'locomotion diagnostics report immediate start without delaying movement');
  ok(controller.getLayerWeights().transition > 0, 'locomotion start immediately layers a bounded transition pose');
  controller.update(.2);
  ok(controller.getLayerWeights().transition === 0, 'locomotion transition releases without delaying the base blend');
  controller.setLocomotion(0, { turnDelta: Math.PI });
  ok(controller.getDiagnostics().locomotionState === 'pivot_180' && controller.getLayerWeights().transition > 0, 'near-idle reversal selects the authored 180-degree pivot layer');
  controller.update(.2);
  controller.setLocomotion(5.4);

  let strictThrew = false;
  try { controller.playOneShot('missing_shipping_clip'); } catch { strictThrew = true; }
  ok(strictThrew, 'strict mode rejects a missing requested shipping clip');

  const fired = [];
  controller.playOneShot('fire', { layer: 'upper', timeScale: 1 });
  controller.scheduleNormalized(.2, () => fired.push('muzzle'));
  controller.scheduleNormalized(.8, () => fired.push('recover'));
  controller.setLocomotion(6.2);
  controller.update(.15);
  controller.update(.5);
  controller.update(.5);
  ok(fired.join(',') === 'muzzle,recover', 'coarse frames deliver normalized events once and in order');
  ok((controller.getLocomotionWeights().run ?? 0) > 0 || (controller.getLocomotionWeights().sprint ?? 0) > 0, 'upper-body action keeps locomotion blending active');
  ok(controller.oneShot === null, 'upper-body one-shot completes and releases its slot');

  controller.playAdditive('recoil_add', { weight: .75, fadeOut: .05 });
  ok(near(controller.getAdditiveWeight('recoil_add'), .75), 'one-shot recoil additive starts at its requested bounded weight');
  controller.update(.5);
  ok(near(controller.getAdditiveWeight('recoil_add'), 0), 'one-shot recoil additive releases after its clip duration');
  controller.setAdditive('recoil_add', 2);
  ok(near(controller.getAdditiveWeight('recoil_add'), 1), 'additive layer weight clamps to one');
  controller.setAdditive('recoil_add', -1);
  ok(near(controller.getAdditiveWeight('recoil_add'), 0), 'additive layer disables at zero weight');

  controller.dispose();
  ok(controller.disposed && controller.actions.size === 0, 'dispose releases actions and marks the controller disposed');
}

console.log('\n--- analytic IK boundaries ---');
{
  const solver = new TwoBoneIK();
  const solved = solver.solve(new THREE.Vector3(), new THREE.Vector3(10, 0, 0), 1, 1, new THREE.Vector3(0, 1, 0));
  ok(solved.clamped && solved.end.length() < 2.001, 'unreachable IK target clamps inside maximum reach');
  ok([solved.mid, solved.end].every(vector => vector.toArray().every(Number.isFinite)), 'IK solve returns finite joint positions');

  const rig = createRig();
  const before = rig.hand.getWorldPosition(new THREE.Vector3());
  const target = before.clone().add(new THREE.Vector3(-.15, .12, .2));
  const rootPos = rig.upper.getWorldPosition(new THREE.Vector3());
  const midPos = rig.lower.getWorldPosition(new THREE.Vector3());
  const handPos = rig.hand.getWorldPosition(new THREE.Vector3());
  const pose = solver.solve(rootPos, target, rootPos.distanceTo(midPos), midPos.distanceTo(handPos));
  solver.applyToBones(rig.upper, rig.lower, rig.hand, pose, 1);
  rig.root.updateMatrixWorld(true);
  const after = rig.hand.getWorldPosition(new THREE.Vector3());
  ok(after.distanceTo(target) < before.distanceTo(target), 'IK bone application moves the end effector closer to its target');
  ok(finiteQuaternion(rig.upper.quaternion) && finiteQuaternion(rig.lower.quaternion), 'IK application keeps bone rotations finite');
}

console.log('\n--- terrain grounding contact window ---');
{
  const root = new THREE.Group();
  const hip = new THREE.Bone();
  const knee = new THREE.Bone();
  const foot = new THREE.Bone();
  hip.name = 'left_upper_leg';
  knee.name = 'left_lower_leg';
  foot.name = 'left_foot';
  hip.position.set(0, 1, 0);
  knee.position.set(0, -.5, 0);
  foot.position.set(0, -.5, 0);
  root.add(hip);
  hip.add(knee);
  knee.add(foot);
  root.updateMatrixWorld(true);
  const controller = new CharacterAnimationController(root, []);
  controller.setGrounding({
    sampleGround: () => ({ height: .05 }),
    contacts: [{
      name: 'left_foot',
      root: hip,
      mid: knee,
      end: foot,
      offset: 0,
      maxCorrection: .1,
      weight: 1,
    }],
  });
  controller.update(1 / 60);
  const contact = controller.getDiagnostics().grounding.left_foot;
  ok(contact?.applied === true && Number.isFinite(contact.error), 'near-ground foot contact applies finite two-bone correction');
  controller.setGrounding({
    sampleGround: () => ({ height: 1 }),
    contacts: [{ name: 'left_foot', bone: foot, maxCorrection: .05 }],
  });
  controller.update(1 / 60);
  ok(controller.getDiagnostics().grounding.left_foot?.reason === 'outside_contact_window', 'airborne foot stays outside the grounding correction window');
  controller.dispose();
}

console.log('\n--- secondary motion reset and bounds ---');
{
  const parent = new THREE.Group();
  const bone = new THREE.Bone();
  bone.position.set(0, 1, 0);
  bone.quaternion.setFromEuler(new THREE.Euler(.2, -.1, .05));
  const authored = bone.quaternion.clone();
  const tip = new THREE.Bone();
  tip.position.set(0, -.5, 0);
  parent.add(bone);
  bone.add(tip);
  parent.updateMatrixWorld(true);
  const secondary = new SecondaryMotion([{ bone, maxAngle: .25 }], { teleportThreshold: .5 });
  parent.position.set(2, 0, 0);
  parent.updateMatrixWorld(true);
  secondary.update(.2, { teleport: true });
  ok(finiteQuaternion(bone.quaternion), 'teleport reset keeps secondary bone rotation finite');
  const animatedBase = new THREE.Quaternion().setFromEuler(new THREE.Euler(.35, .12, -.08));
  bone.quaternion.copy(animatedBase);
  secondary.update(1 / 60, { teleport: true });
  ok(bone.quaternion.angleTo(animatedBase) < 1e-5, 'secondary motion follows the current mixer-authored base pose');
  secondary.reset();
  ok(bone.quaternion.angleTo(authored) < 1e-6, 'secondary reset restores the authored local rotation');
  secondary.dispose();
  ok(secondary.disposed && secondary.chains.length === 0, 'secondary motion dispose releases chain state');
}

if (failures) {
  console.error(`\n${failures} hero-animation-runtime failure(s)`);
  process.exit(1);
}
console.log('\nAll hero-animation-runtime checks passed');
