/**
 * Minimal template-only consumer (Node ESM).
 * Imports ONLY @sol/template-3d package entry — not Sol content/systems.
 *
 * Run: node packages/template-3d/consumer-harness.mjs
 */
import {
  TEMPLATE_3D_PACKAGE_ID,
  TEMPLATE_3D_VERSION,
  createGameContext,
  GAME_CONTEXT_KEYS,
  CharacterAnimationController,
  clamp,
  Input,
  AssetManager,
} from './index.js';
import * as THREE from '../../vendor/three.module.min.js';

const failures = [];
const ok = (cond, msg) => {
  if (cond) console.log(`✓ ${msg}`);
  else {
    failures.push(msg);
    console.error(`✗ ${msg}`);
  }
};

console.log(`\n--- template-3d consumer harness (${TEMPLATE_3D_PACKAGE_ID}@${TEMPLATE_3D_VERSION}) ---\n`);

ok(TEMPLATE_3D_PACKAGE_ID === '@sol/template-3d', 'package id');
ok(typeof createGameContext === 'function', 'createGameContext export');
ok(Array.isArray(GAME_CONTEXT_KEYS) && GAME_CONTEXT_KEYS.includes('player'), 'GAME_CONTEXT_KEYS export');
ok(clamp(5, 0, 3) === 3, 'clamp from package');

const bag = {
  player: { ok: true },
  enemies: null,
  combat: null,
  effects: null,
  audio: null,
  world: null,
  ui: null,
  camera: null,
  assets: null,
  mode: 'template',
  state: 'boot',
  quality: 'low',
  debugEnabled: false,
  delta: 0,
  elapsed: 0,
  save: null,
  input: null,
};
const ctx = createGameContext(bag);
ok(Object.isFrozen(ctx) && ctx.player?.ok === true && ctx.mode === 'template',
  'createGameContext works without Sol Game class');

const root = new THREE.Object3D();
const idle = new THREE.AnimationClip('idle', 1, []);
const walk = new THREE.AnimationClip('walk', 1, []);
const run = new THREE.AnimationClip('run', 1, []);
const anim = new CharacterAnimationController(root, [idle, walk, run], { referenceRunSpeed: 6.4 });
anim.setLocomotion(1.2);
ok(anim.currentName === 'walk', `CharacterAnimationController walk band (got ${anim.currentName})`);
anim.setLocomotion(0);
ok(anim.currentName === 'idle', 'CharacterAnimationController idle band');
anim.dispose();

ok(typeof Input === 'function', 'Input class export');
ok(typeof AssetManager === 'function', 'AssetManager class export');
const assets = new AssetManager(null, { quality: 'low' });
ok(typeof assets.purgeUnused === 'function' && typeof assets.releaseModel === 'function',
  'AssetManager lifetime API present');
assets.dispose();

if (failures.length) {
  console.error(`\nconsumer-harness: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nconsumer-harness: all checks passed (template-only imports)');
