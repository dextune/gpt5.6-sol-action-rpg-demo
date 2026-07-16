/**
 * LOCKED template vs game boundary tests.
 * Drives real shipped modules — see docs/architecture-template-boundary.md
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`✓ ${msg}`);
  else {
    failed += 1;
    console.error(`✗ ${msg}`);
  }
};

const {
  createGameContext,
  GAME_CONTEXT_KEYS,
  listGameContextKeys,
} = await import(pathToFileURL(join(root, 'js/core/GameContext.js')).href);

const {
  SKILL_EFFECT_HANDLER_KEYS,
  ENERGY_HANDLER_KEYS,
  assertHandlerKeys,
  extraHandlerKeys,
} = await import(pathToFileURL(join(root, 'js/systems/combat/skillEffectRegistry.js')).href);

const { AssetManager } = await import(pathToFileURL(join(root, 'js/assets/AssetManager.js')).href);
const content = await import(pathToFileURL(join(root, 'js/data/content.js')).href);

console.log('\n--- template-boundary (LOCKED) ---\n');

// —— GameContext surface ——
ok(Array.isArray(GAME_CONTEXT_KEYS) && GAME_CONTEXT_KEYS.length >= 15, 'GAME_CONTEXT_KEYS exported');
ok(listGameContextKeys().join(',') === GAME_CONTEXT_KEYS.join(','), 'listGameContextKeys matches GAME_CONTEXT_KEYS');
const fakeGame = {
  player: { id: 'p' },
  enemies: { n: 1 },
  combat: { c: 1 },
  effects: { e: 1 },
  audio: { a: 1 },
  world: { w: 1 },
  ui: { u: 1 },
  camera: { cam: 1 },
  assets: { as: 1 },
  mode: 'hunt',
  state: 'title',
  quality: 'medium',
  debugEnabled: false,
  delta: 0.016,
  elapsed: 1,
  save: { s: 1 },
  input: { i: 1 },
};
const ctx = createGameContext(fakeGame);
ok(Object.isFrozen(ctx), 'createGameContext returns frozen facade');
for (const key of GAME_CONTEXT_KEYS) {
  ok(ctx[key] === fakeGame[key], `ctx.${key} live-getter matches game`);
}
fakeGame.mode = 'rush';
ok(ctx.mode === 'rush', 'ctx getters stay live after game field mutation');
let threw = false;
try { createGameContext(null); } catch { threw = true; }
ok(threw, 'createGameContext rejects null game');

// —— Template candidates must not import game content ——
const TEMPLATE_CANDIDATES = [
  'js/core/Utils.js',
  'js/core/Input.js',
  'js/core/GameContext.js',
  'js/assets/AssetManager.js',
  'js/assets/AssetManifest.js',
  'js/assets/TextureCache.js',
  'js/graphics/RenderPipeline.js',
  'js/graphics/LightingSystem.js',
  'js/graphics/PostProcessSystem.js',
  'js/graphics/OutlineSystem.js',
  'js/characters/CharacterAnimationController.js',
];
const FORBIDDEN_IMPORT_SNIPPETS = [
  'data/content.js',
  'data/skillCombat.js',
  'data/rushContent.js',
  'data/fxThemes.js',
  'systems/CombatSystem',
  'systems/HuntSystem',
  'entities/Player',
  'entities/Enemy',
];
for (const rel of TEMPLATE_CANDIDATES) {
  const src = readFileSync(join(root, rel), 'utf8');
  const bad = FORBIDDEN_IMPORT_SNIPPETS.filter(s => src.includes(s));
  ok(bad.length === 0, `template-candidate ${rel} free of game imports (${bad.join(',') || 'ok'})`);
}

// —— AssetManager clone/release/purge semantics ——
const assets = new AssetManager(null, { quality: 'medium' });
// Inject a fake cache entry without network load
const fakeGltf = { scene: { name: 'fake', userData: {}, traverse() {} } };
assets.models.set('unit.test@medium', { gltf: fakeGltf, clones: 0, url: 'mem://', quality: 'medium' });
ok(assets.getStats().liveClones === 0, 'AssetManager: fresh entry has 0 live clones');
// Simulate cloneModel refpath without SkeletonUtils by manual increment + release API
const entry = assets.models.get('unit.test@medium');
entry.clones += 1;
const scene = { userData: { assetCacheKey: 'unit.test@medium' } };
ok(assets.releaseModel(scene) === 0, 'AssetManager: releaseModel floors at 0');
ok(assets.releaseModel(scene) === 0, 'AssetManager: over-release stays at 0');
entry.clones = 2;
ok(assets.purgeUnused() === 0, 'AssetManager: purge skips entries with live clones');
entry.clones = 0;
ok(assets.purgeUnused() === 1, 'AssetManager: purge removes zero-clone entries');
ok(!assets.models.has('unit.test@medium'), 'AssetManager: purged key gone');
// Legacy field must not exist
const amSrc = readFileSync(join(root, 'js/assets/AssetManager.js'), 'utf8');
ok(!/Math\.max\(1,\s*entry\.refs/.test(amSrc) && amSrc.includes('clones'),
  'AssetManager uses clones counter (no refs floor-1 bug)');
ok(amSrc.includes('purgeUnused'), 'AssetManager.purgeUnused present');

// —— Skill registry vs CombatSystem map vs content ——
const combatSrc = readFileSync(join(root, 'js/systems/CombatSystem.js'), 'utf8');
const createHandlersSrc = readFileSync(join(root, 'js/systems/combat/createSkillHandlers.js'), 'utf8');
ok(createHandlersSrc.includes('skillEffectRegistry') && createHandlersSrc.includes('assertHandlerKeys'),
  'createSkillHandlers binds skillEffectRegistry + assertHandlerKeys');
ok((combatSrc.includes('createGameContext') || combatSrc.includes('template-3d'))
  && combatSrc.includes('this.ctx'),
  'CombatSystem captures game.ctx');
const handlerBlock = createHandlersSrc.match(/const table = \{([\s\S]*?)\n\s*\};/);
ok(Boolean(handlerBlock) || createHandlersSrc.includes('createSkillHandlers'),
  'createSkillHandlers skill table present');
const registered = new Set(
  handlerBlock
    ? [...handlerBlock[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)].map(m => m[1])
    : [],
);
ok(combatSrc.includes('createSkillHandlers(this)'), 'CombatSystem wires createSkillHandlers');
for (const key of SKILL_EFFECT_HANDLER_KEYS) {
  ok(registered.has(key), `registry skill key '${key}' registered on CombatSystem`);
}
const extras = [...registered].filter(k => !SKILL_EFFECT_HANDLER_KEYS.includes(k));
ok(extras.length === 0, `no unregistered skillHandlers keys (${extras.join(',') || 'none'})`);

const energyBlock = createHandlersSrc.match(/createEnergyHandlers[\s\S]*?const table = \{([\s\S]*?)\n\s*\};/);
const energyRegistered = new Set(
  energyBlock
    ? [...energyBlock[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)].map(m => m[1])
    : [],
);
for (const key of ENERGY_HANDLER_KEYS) {
  ok(energyRegistered.has(key), `registry energy key '${key}' registered on CombatSystem`);
}

// assertHandlerKeys behavior
ok(assertHandlerKeys(
  Object.fromEntries(SKILL_EFFECT_HANDLER_KEYS.map(k => [k, () => {}])),
  SKILL_EFFECT_HANDLER_KEYS,
  'test',
) === true, 'assertHandlerKeys accepts complete map');
let assertThrew = false;
try {
  assertHandlerKeys({ whirlwind: () => {} }, SKILL_EFFECT_HANDLER_KEYS, 'test');
} catch {
  assertThrew = true;
}
ok(assertThrew, 'assertHandlerKeys rejects incomplete map');
ok(extraHandlerKeys({ whirlwind: 1, nope: 1 }, ['whirlwind']).includes('nope'),
  'extraHandlerKeys reports unknown keys');

// Content actives must map to registry
const actives = Object.values(content.SKILLS).filter(s => s && !s.passive && s.effect);
ok(actives.length >= 16, `active skills present (${actives.length})`);
for (const skill of actives) {
  ok(SKILL_EFFECT_HANDLER_KEYS.includes(skill.effect),
    `content active ${skill.id} effect '${skill.effect}' ∈ skill registry`);
}

// —— Game wires ctx + purge ——
const gameSrc = readFileSync(join(root, 'js/core/Game.js'), 'utf8');
ok(gameSrc.includes('createGameContext') && gameSrc.includes('this.ctx = createGameContext'),
  'Game constructs this.ctx early');
ok(gameSrc.includes('purgeUnusedAssets'), 'Game.purgeUnusedAssets helper present');

// —— Boundary doc present ——
const boundaryDoc = join(root, 'docs/architecture-template-boundary.md');
const doc = readFileSync(boundaryDoc, 'utf8');
ok(doc.includes('LOCKED') && doc.includes('GAME_CONTEXT_KEYS') && doc.includes('skillEffectRegistry'),
  'architecture-template-boundary.md LOCKED and complete');

// —— Physical package @sol/template-3d ——
const pkgRoot = join(root, 'packages/template-3d');
const pkgJson = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
ok(pkgJson.name === '@sol/template-3d', 'packages/template-3d package.json name');
const pkgIndex = readFileSync(join(pkgRoot, 'index.js'), 'utf8');
ok(pkgIndex.includes('TEMPLATE_3D_PACKAGE_ID') && pkgIndex.includes('createGameContext'),
  'template-3d index re-exports package identity + GameContext');
const forbiddenInPkg = ['data/content.js', 'skillCombat.js', 'rushContent.js', 'CombatSystem', 'entities/Player', 'systems/Hunt'];
const pkgBad = forbiddenInPkg.filter(s => pkgIndex.includes(s));
ok(pkgBad.length === 0, `template-3d index free of Sol game imports (${pkgBad.join(',') || 'ok'})`);
// AssetManager must not pull ModelFactory (game) into package graph
const amSrc2 = readFileSync(join(root, 'js/assets/AssetManager.js'), 'utf8');
ok(!/from\s+['\"].*ModelFactory/.test(amSrc2),
  'AssetManager is free of ModelFactory import (template-safe fallback)');
// Sol wires package
const gameSrc2 = readFileSync(join(root, 'js/core/Game.js'), 'utf8');
ok(gameSrc2.includes('packages/template-3d/index.js'), 'Game.js imports template-3d package entry');
const html = readFileSync(join(root, 'index.html'), 'utf8');
ok(html.includes('"@sol/template-3d"') && html.includes('packages/template-3d/index.js'),
  'index.html import map registers @sol/template-3d');
// Modular combat implementations
ok(existsSync(join(root, 'js/systems/combat/activeSkillMethods.js')), 'activeSkillMethods module exists');
ok(existsSync(join(root, 'js/systems/combat/energyBurstMethods.js')), 'energyBurstMethods module exists');
ok(existsSync(join(root, 'js/systems/combat/createSkillHandlers.js')), 'createSkillHandlers module exists');
const activeSrc = readFileSync(join(root, 'js/systems/combat/activeSkillMethods.js'), 'utf8');
ok(activeSrc.includes('attachActiveSkillMethods') && activeSrc.includes('_whirlwind'),
  'activeSkillMethods hosts whirlwind implementation');

if (failed > 0) {
  console.error(`\ntemplate-boundary: ${failed} failure(s)`);
  process.exit(1);
}
console.log('\ntemplate-boundary: all checks passed');
