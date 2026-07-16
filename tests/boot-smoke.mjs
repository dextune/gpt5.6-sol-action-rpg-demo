/**
 * Cheap boot/import smoke — W5 of code-quality-roi-execution plan.
 * No Playwright; constructs real shipped modules.
 */
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three.module.min.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`✓ ${msg}`);
  else {
    failed += 1;
    console.error(`✗ ${msg}`);
  }
};

console.log('\n--- boot-smoke ---\n');

const { CombatSystem } = await import(pathToFileURL(join(root, 'js/systems/CombatSystem.js')).href);
const { SKILL_EFFECT_HANDLER_KEYS, ENERGY_HANDLER_KEYS } = await import(
  pathToFileURL(join(root, 'js/systems/combat/skillEffectRegistry.js')).href
);
const { CharacterAnimationController } = await import(
  pathToFileURL(join(root, 'js/characters/CharacterAnimationController.js')).href
);
const { LOCOMOTION_CONFIG } = await import(
  pathToFileURL(join(root, 'js/core/runtimeConstants.js')).href
);
const { resolveHitReactionClipName } = await import(
  pathToFileURL(join(root, 'js/entities/Player.js')).href
);
const { HIT_REACTION_CONFIG, PLAYER_GROWTH_CONFIG } = await import(
  pathToFileURL(join(root, 'js/config.js')).href
);
const pkg = await import(pathToFileURL(join(root, 'packages/template-3d/index.js')).href);

const game = {
  player: { position: new THREE.Vector3() },
  enemies: { enemies: [] },
  effects: { pillar() {}, ring() {}, burst() {}, dust() {}, trail() {} },
  audio: { boss() {}, swing() {}, skill() {}, apex() {} },
  world: { heightAt: () => 0, resolvePosition() {} },
  ui: { notify() {}, floatText() {} },
  camera: new THREE.Vector3(),
  assets: null,
  mode: 'hunt',
  state: 'playing',
  quality: 'medium',
  debugEnabled: false,
  delta: 0.016,
  elapsed: 0,
  save: null,
  input: null,
  scene: new THREE.Scene(),
};

const combat = new CombatSystem(game);
ok(combat.ctx, 'CombatSystem has ctx');
for (const key of SKILL_EFFECT_HANDLER_KEYS) {
  ok(typeof combat.skillHandlers[key] === 'function', `skill handler ${key}`);
}
for (const key of ENERGY_HANDLER_KEYS) {
  ok(typeof combat.energyHandlers[key] === 'function', `energy handler ${key}`);
}
ok(typeof combat._whirlwind === 'function' && typeof combat._fireball === 'function',
  'class skill methods attached');
ok(typeof combat._bossRoots === 'function' && typeof combat._spawnEnemyProjectile === 'function',
  'enemy skill methods attached');
combat.clear();
ok(true, 'combat.clear ok');

const rootObj = new THREE.Object3D();
const clips = ['idle', 'walk', 'run', 'sprint'].map((n) => new THREE.AnimationClip(n, 1, []));
const anim = new CharacterAnimationController(rootObj, clips, {
  referenceRunSpeed: LOCOMOTION_CONFIG.referenceRunSpeed,
  locoHysteresis: LOCOMOTION_CONFIG.hysteresis,
});
anim.setLocomotion(0);
ok(anim.currentName === 'idle', 'locomotion idle');
const walkMid = (LOCOMOTION_CONFIG.idleMaxSpeed
  + LOCOMOTION_CONFIG.referenceRunSpeed * LOCOMOTION_CONFIG.walkRunSpeedRatio) * 0.5;
anim.setLocomotion(walkMid);
ok(anim.currentName === 'walk', 'locomotion walk');
anim.dispose();

const has = (n) => ['hit', 'hit_light', 'hit_heavy', 'idle'].includes(n);
ok(resolveHitReactionClipName(HIT_REACTION_CONFIG.lightAmount, 100, has) === 'hit_light', 'hit light');
ok(resolveHitReactionClipName(15, 100, has) === 'hit', 'hit mid');
ok(resolveHitReactionClipName(HIT_REACTION_CONFIG.heavyAmount, 100, has) === 'hit_heavy', 'hit heavy');

ok(pkg.TEMPLATE_3D_PACKAGE_ID === '@sol/template-3d', 'template package id');
ok(pkg.LOCOMOTION_CONFIG?.referenceRunSpeed === LOCOMOTION_CONFIG.referenceRunSpeed,
  'template re-exports LOCOMOTION_CONFIG');

// Growth config parity anchors
ok(PLAYER_GROWTH_CONFIG.hpPerLevel === 12 && PLAYER_GROWTH_CONFIG.xpBase === 92,
  'PLAYER_GROWTH_CONFIG defaults (parity)');

ok(PLAYER_GROWTH_CONFIG.comboLengthGates[0].length === 7, 'combo gates present');

// W1 module surface
const deathPanel = await import(pathToFileURL(join(root, 'js/ui/panels/deathOverlay.js')).href);
ok(typeof deathPanel.showDeath === 'function' && typeof deathPanel.hideDeath === 'function',
  'death overlay panel helpers export');
const uiShared = await import(pathToFileURL(join(root, 'js/ui/uiShared.js')).href);
ok(typeof uiShared.escapeHtml === 'function' && uiShared.STAT_LABELS?.power === 'Attack',
  'uiShared helpers export');
const debugHud = await import(pathToFileURL(join(root, 'js/ui/panels/debugHud.js')).href);
ok(typeof debugHud.setDebugVisible === 'function' && typeof debugHud.updateDebug === 'function',
  'debugHud panel helpers export');


if (failed > 0) {
  console.error(`\nboot-smoke: ${failed} failure(s)`);
  process.exit(1);
}
console.log('\nboot-smoke: all checks passed');
