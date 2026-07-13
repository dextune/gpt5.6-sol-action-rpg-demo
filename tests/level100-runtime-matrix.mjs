/**
 * Level-100 skill acceptance matrix.
 *
 * Fast gate:
 *   - shipped-data resolver: 16 actives x four (Lv40 x Lv80) choices = 64
 *   - real browser combat: all 16 actives at low/medium/high = 48 complete casts
 *     (low=normal, medium=elite, high=boss, so every skill hits every tier)
 *   - bounded control, pools/queues/scene cleanup, input parity, facing,
 *     stable-camera no-ops, and Hunt/Continue/Defense save isolation
 *
 * Usage: node tests/level100-runtime-matrix.mjs
 * Env: BASE_URL (default http://127.0.0.1:8777), OUT_DIR, VISUAL_ONLY=1
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8777';
const OUT = resolve(process.env.OUT_DIR || '/tmp/sol-arpg-level100-matrix');
mkdirSync(OUT, { recursive: true });

const failures = [];
const browserErrors = [];
const screenshots = { low: [], medium: [] };
const sleep = ms => new Promise(done => setTimeout(done, ms));

async function waitServer(url, timeout = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await sleep(200);
  }
  throw new Error(`Server unavailable at ${url}`);
}

function plain(value) {
  if (Array.isArray(value)) return value.map(plain);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, plain(child)]));
}

async function shippedDataMatrix() {
  const contentUrl = pathToFileURL(resolve(ROOT, 'js/data/content.js')).href;
  const combatUrl = pathToFileURL(resolve(ROOT, 'js/data/skillCombat.js')).href;
  const [{ HERO_CLASSES, getClassActiveSkills }, { resolveSkillForm, validateSkillEvolutionSchema }] = await Promise.all([
    import(contentUrl), import(combatUrl),
  ]);
  const classes = ['aerin', 'wizard', 'rogue', 'ranger'];
  const rows = [];
  for (const classId of classes) {
    if (!HERO_CLASSES[classId]) failures.push(`missing class ${classId}`);
    const skills = getClassActiveSkills(classId);
    if (skills.length !== 4) failures.push(`${classId}: expected four active skills, got ${skills.length}`);
    for (const skill of skills) {
      const schemaErrors = validateSkillEvolutionSchema(skill);
      if (schemaErrors.length) failures.push(`${skill.id}: evolution schema: ${schemaErrors.join(' | ')}`);
      const forms = Object.keys(skill.evolution?.forms ?? {}).sort().join(',');
      const tier40 = Object.keys(skill.evolution?.mutations?.[40] ?? {});
      const tier80 = Object.keys(skill.evolution?.mutations?.[80] ?? {});
      if (forms !== '100,20,60') failures.push(`${skill.id}: forms are ${forms}`);
      if (tier40.length !== 2 || tier80.length !== 2) failures.push(`${skill.id}: expected 2x2 mutations`);
      const signatures = new Set();
      for (const choice40 of tier40) for (const choice80 of tier80) {
        const bundle = resolveSkillForm(skill, 10, 100, { tier40: choice40, tier80: choice80 });
        const immutable = Object.isFrozen(bundle) && Object.isFrozen(bundle.combat)
          && Object.isFrozen(bundle.presentation) && Object.isFrozen(bundle.timeline);
        if (!immutable) failures.push(`${skill.id}/${choice40}/${choice80}: mutable resolved cast bundle`);
        if (bundle.rank !== 10 || bundle.playerLevel !== 100
          || bundle.activeForms?.join(',') !== '20,60,100'
          || bundle.mutations?.tier40 !== choice40 || bundle.mutations?.tier80 !== choice80) {
          failures.push(`${skill.id}/${choice40}/${choice80}: incorrect Lv100 resolution`);
        }
        signatures.add(JSON.stringify(plain({
          combat: bundle.combat, presentation: bundle.presentation,
          timeline: bundle.timeline, anim: bundle.anim,
        })));
        rows.push({ classId, skillId: skill.id, choice40, choice80, immutable });
      }
      if (signatures.size !== 4) failures.push(`${skill.id}: four mutation combinations resolve to only ${signatures.size} distinct bundles`);
    }
  }
  if (rows.length !== 64) failures.push(`resolver matrix expected 64 rows, got ${rows.length}`);
  return rows;
}

function watchPage(page) {
  page.on('pageerror', error => browserErrors.push(String(error?.stack || error)));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
}

async function startGame(page) {
  watchPage(page);
  await page.goto(`${BASE}/?debug=1&autostart=0`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => document.getElementById('title-screen')?.classList.contains('active'), null, { timeout: 90_000 });
  await page.click('#new-game-btn');
  await page.waitForSelector('#hud:not(.hidden)', { timeout: 30_000 });
  await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    game.state = 'paused';
    game.player.invulnerable = 999;
  });
}

async function runtimeMatrix(page) {
  return page.evaluate(async () => {
    const { ENEMY_TYPES, getClassActiveSkills } = await import('/js/data/content.js');
    const { resolveSkillForm } = await import('/js/data/skillCombat.js');
    const { ENEMY_CONTROL_LIMITS } = await import('/js/entities/Enemy.js');
    const game = window.__SOL_ARPG_DEMO__;
    const poolNames = ['particles', 'slashes', 'rings', 'pillars', 'trails', 'decals', 'ghosts', 'beams', 'stars', 'lightFlashes'];
    const capacity = Object.fromEntries(poolNames.map(name => [name, game.effects[name]?.items?.length ?? 0]));
    const poolLengths = () => Object.fromEntries(poolNames.map(name => [name, game.effects[name]?.items?.length ?? 0]));
    const activePools = () => Object.fromEntries(poolNames.map(name => [name, game.effects[name]?.items?.filter(item => item.active).length ?? 0]));
    const mergePeak = (peak, sample) => poolNames.forEach(name => { peak[name] = Math.max(peak[name] ?? 0, sample[name]); });
    const localFailures = [];
    const rows = [];
    const behaviorRows = [];
    game.state = 'paused';
    game.combat.clear(); game.effects.clear(); game.enemies.clear();
    const normalData = Object.values(ENEMY_TYPES).find(data => !data.boss);
    const bossData = Object.values(ENEMY_TYPES).find(data => data.boss);
    const origin = game.player.position.clone();
    const targets = {
      normal: game.enemies.spawn(normalData, origin.clone().add({ x: 0, y: 0, z: 3 }), { elite: false, level: 100 }),
      elite: game.enemies.spawn(normalData, origin.clone().add({ x: 0, y: 0, z: 4 }), { elite: true, level: 100 }),
      boss: game.enemies.spawn(bossData, origin.clone().add({ x: 0, y: 0, z: 5 }), { elite: false, level: 100 }),
    };
    if (Object.values(targets).some(target => !target)) throw new Error('Could not spawn real normal/elite/boss matrix targets');
    for (const target of Object.values(targets)) {
      target.maxHp = 1e12; target.hp = target.maxHp; target.stunTimer = 999;
    }

    const controls = {};
    for (const [category, target] of Object.entries(targets)) {
      const limits = ENEMY_CONTROL_LIMITS[category];
      target.alive = true; target.stunTimer = 0; target.stagger = 0; target.breakTimer = 0;
      const stun = target.applyStun(999);
      const stagger = target.addStagger(limits.stagger);
      target.position.copy(origin).add({ x: 12, y: 0, z: 0 });
      const pulled = target.pullToward(origin, 1.7, 1, game.world, []);
      controls[category] = { limits, stun, stagger, pulled, breakTimer: target.breakTimer };
      if (Math.abs(stun - limits.stun) > 1e-6 || !stagger.broken
        || Math.abs(target.breakTimer - limits.break) > 1e-6 || pulled > limits.pull + 1e-6
        || (category === 'boss' && pulled !== 0)) {
        localFailures.push(`${category}: control cap mismatch ${JSON.stringify(controls[category])}`);
      }
    }

    const targetDistance = (skillId, combat) => {
      if (skillId === 'skyfall' || skillId === 'arcane_blink') return combat.leap ?? 10;
      if (skillId === 'shadowstep') return combat.dash ?? 8;
      if (skillId === 'starburst' || skillId === 'meteor_storm' || skillId === 'caltrop_trap') return combat.aim ?? 8;
      return 2.4;
    };
    const categories = { low: 'normal', medium: 'elite', high: 'boss' };
    const classes = ['aerin', 'wizard', 'rogue', 'ranger'];
    for (const quality of ['low', 'medium', 'high']) {
      game.setQuality(quality);
      const qualityPeak = Object.fromEntries(poolNames.map(name => [name, 0]));
      for (const classId of classes) {
        game.debugSetSkillState({ classId, level: 100, rank: 10 });
        for (const skill of getClassActiveSkills(classId)) {
          game.combat.clear(); game.effects.clear(); game.player.clearShadowFrenzy?.();
          game.player.position.copy(origin); game.player.facing.set(0, 0, 1); game.player.moveDirection.set(0, 0, 1);
          game.player.alive = true; game.player.invulnerable = 999; game.player.level = 100;
          const choice40 = Object.keys(skill.evolution.mutations[40])[0];
          const choice80 = Object.keys(skill.evolution.mutations[80])[0];
          const bundle = resolveSkillForm(skill, 10, 100, { tier40: choice40, tier80: choice80 });
          const category = categories[quality];
          const target = targets[category];
          const distance = targetDistance(skill.id, bundle.combat);
          for (const [otherCategory, other] of Object.entries(targets)) {
            other.alive = true; other.maxHp = 1e12; other.hp = other.maxHp; other.invulnerable = 0;
            other.sameCastHitIFrames.clear(); other.statuses = {}; other.spellPrime = null;
            other.position.copy(origin).add({ x: 0, y: 0, z: otherCategory === category ? distance : 80 + Object.keys(targets).indexOf(otherCategory) * 5 });
          }
          game.enemies.enemies.splice(0, game.enemies.enemies.length, target, ...Object.values(targets).filter(other => other !== target));
          const beforeHp = target.hp;
          const beforeScene = game.scene.children.length;
          const peak = Object.fromEntries(poolNames.map(name => [name, 0]));
          game.combat.usePlayerSkill(bundle, game.player, 'full');
          let drainedAt = null;
          for (let frame = 0; frame < 600; frame += 1) {
            game.combat.update(1 / 60); game.effects.update(1 / 60);
            const sample = activePools(); mergePeak(peak, sample); mergePeak(qualityPeak, sample);
            if (frame > 180 && game.combat.projectiles.length === 0 && game.combat.telegraphs.length === 0
              && game.combat.delayed.length === 0 && game.combat.charges.length === 0
              && Object.values(sample).every(count => count === 0)) { drainedAt = frame; break; }
          }
          const damage = beforeHp - target.hp;
          const preClearQueues = {
            projectiles: game.combat.projectiles.length, telegraphs: game.combat.telegraphs.length,
            delayed: game.combat.delayed.length, charges: game.combat.charges.length,
          };
          game.combat.clear(); game.effects.clear();
          const afterActive = activePools();
          const afterQueues = {
            projectiles: game.combat.projectiles.length, telegraphs: game.combat.telegraphs.length,
            delayed: game.combat.delayed.length, charges: game.combat.charges.length,
          };
          const poolStable = JSON.stringify(poolLengths()) === JSON.stringify(capacity);
          const sceneStable = game.scene.children.length === beforeScene;
          if (!(damage > 0)) localFailures.push(`${quality}/${classId}/${skill.id}/${category}: direct damage=${damage}`);
          if (!poolStable || !sceneStable || Object.values(afterActive).some(Boolean) || Object.values(afterQueues).some(Boolean)) {
            localFailures.push(`${quality}/${skill.id}: cleanup leak pool=${poolStable} scene=${sceneStable} active=${JSON.stringify(afterActive)} queues=${JSON.stringify(afterQueues)}`);
          }
          if (poolNames.some(name => capacity[name] > 0 && peak[name] >= capacity[name])) {
            localFailures.push(`${quality}/${skill.id}: pool peak saturated capacity ${JSON.stringify(peak)}`);
          }
          rows.push({ quality, classId, skillId: skill.id, category, choice40, choice80, damage, peak, drainedAt, preClearQueues, poolStable, sceneStable });
        }
      }
    }

    // Medium-quality behavior gate: every 16 x 4 mutation combination must
    // damage a real normal, elite, and boss target without saturating pools.
    game.setQuality('medium');
    const behaviorCategories = ['normal', 'elite', 'boss'];
    const overlaySignals = (option, bundle) => ['combat', 'presentation', 'timeline'].flatMap(section =>
      Object.entries(option?.[section] ?? {}).filter(([key, value]) =>
        JSON.stringify(bundle?.[section]?.[key]) === JSON.stringify(value)).map(([key]) => `${section}.${key}`));
    for (const classId of classes) {
      game.debugSetSkillState({ classId, level: 100, rank: 10 });
      for (const skill of getClassActiveSkills(classId)) {
        const tier40 = Object.keys(skill.evolution.mutations[40]);
        const tier80 = Object.keys(skill.evolution.mutations[80]);
        for (const choice40 of tier40) for (const choice80 of tier80) {
          const bundle = resolveSkillForm(skill, 10, 100, { tier40: choice40, tier80: choice80 });
          const signals40 = overlaySignals(skill.evolution.mutations[40][choice40], bundle);
          const signals80 = overlaySignals(skill.evolution.mutations[80][choice80], bundle);
          if (!signals40.length || !signals80.length) {
            localFailures.push(`behavior/${skill.id}/${choice40}/${choice80}: missing applied branch signal ${JSON.stringify({ signals40, signals80 })}`);
          }
          const capValues = Object.fromEntries(Object.entries(bundle.combat).filter(([key, value]) => /Cap$/.test(key) && Number.isFinite(value)));
          if (Object.values(capValues).some(value => value < 0)) {
            localFailures.push(`behavior/${skill.id}/${choice40}/${choice80}: invalid cap ${JSON.stringify(capValues)}`);
          }
          const damage = {};
          const categoryState = {};
          const peak = Object.fromEntries(poolNames.map(name => [name, 0]));
          let cleanup = true;
          for (const category of behaviorCategories) {
            game.combat.clear(); game.effects.clear(); game.player.clearShadowFrenzy?.();
            game.player.thornField = null; game.player.predatorVerdict = null; game.player.arcaneOverflow = 0;
            game.player.position.copy(origin); game.player.facing.set(0, 0, 1); game.player.moveDirection.set(0, 0, 1);
            game.player.alive = true; game.player.invulnerable = 999; game.player.level = 100;
            const distance = targetDistance(skill.id, bundle.combat);
            const target = targets[category];
            for (const [otherCategory, other] of Object.entries(targets)) {
              other.alive = true; other.maxHp = 1e12; other.hp = other.maxHp; other.invulnerable = 0;
              other.sameCastHitIFrames.clear(); other.statuses = {}; other.spellPrime = null;
              other.stunTimer = 0; other.stagger = 0; other.breakTimer = 0;
              other.position.copy(origin).add({ x: 0, y: 0, z: otherCategory === category ? distance : 90 + behaviorCategories.indexOf(otherCategory) * 5 });
            }
            game.enemies.enemies.splice(0, game.enemies.enemies.length, target);
            const beforeHp = target.hp;
            const beforeScene = game.scene.children.length;
            game.combat.usePlayerSkill(bundle, game.player, 'full');
            let drainedAt = null;
            for (let frame = 0; frame < 600; frame += 1) {
              game.combat.update(1 / 60); game.effects.update(1 / 60);
              const sample = activePools(); mergePeak(peak, sample);
              if (frame > 180 && game.combat.projectiles.length === 0 && game.combat.telegraphs.length === 0
                && game.combat.delayed.length === 0 && game.combat.charges.length === 0
                && Object.values(sample).every(count => count === 0)) { drainedAt = frame; break; }
            }
            damage[category] = beforeHp - target.hp;
            const limits = ENEMY_CONTROL_LIMITS[category];
            categoryState[category] = {
              stun: target.stunTimer, stagger: target.stagger, breakTimer: target.breakTimer, drainedAt,
            };
            if (!(Number.isFinite(damage[category]) && damage[category] > 0)) {
              localFailures.push(`behavior/${skill.id}/${choice40}/${choice80}/${category}: authoritative damage=${damage[category]}`);
            }
            if (target.stunTimer > limits.stun + 1e-6 || target.stagger < 0 || target.stagger > limits.stagger + 1e-6
              || target.breakTimer > limits.break + 1e-6) {
              localFailures.push(`behavior/${skill.id}/${choice40}/${choice80}/${category}: control overflow ${JSON.stringify(categoryState[category])}`);
            }
            game.combat.clear(); game.effects.clear();
            const afterQueues = [game.combat.projectiles.length, game.combat.telegraphs.length, game.combat.delayed.length, game.combat.charges.length];
            const cleanCast = JSON.stringify(poolLengths()) === JSON.stringify(capacity)
              && game.scene.children.length === beforeScene
              && Object.values(activePools()).every(count => count === 0)
              && afterQueues.every(count => count === 0);
            cleanup &&= cleanCast;
            if (!cleanCast) localFailures.push(`behavior/${skill.id}/${choice40}/${choice80}/${category}: cleanup failure`);
          }
          const saturated = poolNames.filter(name => capacity[name] > 0 && peak[name] >= capacity[name]);
          if (saturated.length) {
            localFailures.push(`behavior/${skill.id}/${choice40}/${choice80}: pool saturation/overwrite risk ${saturated.map(name => `${name}:${peak[name]}/${capacity[name]}`).join(',')}`);
          }
          behaviorRows.push({
            classId, skillId: skill.id, choice40, choice80, damage, signals40, signals80,
            capValues, categoryState, peak,
            headroom: Object.fromEntries(poolNames.map(name => [name, capacity[name] - peak[name]])),
            cleanup, saturated,
          });
        }
      }
    }
    game.combat.clear(); game.effects.clear();
    return { rows, behaviorRows, capacity, controls, localFailures };
  });
}

async function quickContracts(page) {
  const facingAndCamera = await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    game.player.moveDirection.set(1, 0, 0); game.player.facing.set(0, 0, -1);
    game.input.pointer.set(-1, 1); game.player.alignCombatFacing();
    const facing = game.player.facing.toArray();
    game.cameraShakeAmount = 9; game.cameraShakeTime = 9; game.hitStopTimer = 9;
    game.shake(9, 9); game.hitStop(9);
    return { facing, cameraShakeAmount: game.cameraShakeAmount, cameraShakeTime: game.cameraShakeTime, hitStopTimer: game.hitStopTimer };
  });
  if (Math.abs(facingAndCamera.facing[0] - 1) > 1e-6 || facingAndCamera.cameraShakeAmount !== 0
    || facingAndCamera.cameraShakeTime !== 0 || facingAndCamera.hitStopTimer !== 0) failures.push(`facing/camera contract: ${JSON.stringify(facingAndCamera)}`);

  await page.evaluate(() => window.__SOL_ARPG_DEMO__.pauseRenderLoop());
  const keyboard = {};
  for (const code of ['KeyQ', 'KeyE', 'KeyR', 'KeyC']) {
    await page.keyboard.down(code);
    keyboard[code] = await page.evaluate(key => ({ down: window.__SOL_ARPG_DEMO__.input.isDown(key), pressed: window.__SOL_ARPG_DEMO__.input.consume(key) }), code);
    await page.keyboard.up(code);
  }
  const touch = await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    document.body.classList.add('touch-ui'); game.touchControls.setEnabled(true);
    const result = {};
    let pointerId = 700;
    for (const slot of document.querySelectorAll('.ability-slot[data-key]')) {
      const code = `Key${slot.dataset.key}`;
      slot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId, button: 0 }));
      result[code] = { down: game.input.isDown(code), pressed: game.input.consume(code) };
      slot.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId, button: 0 }));
      pointerId += 1;
    }
    return result;
  });
  for (const code of ['KeyQ', 'KeyE', 'KeyR', 'KeyC']) if (!keyboard[code]?.down || !keyboard[code]?.pressed || !touch[code]?.down || !touch[code]?.pressed) {
    failures.push(`${code}: keyboard/touch parity ${JSON.stringify({ keyboard: keyboard[code], touch: touch[code] })}`);
  }
  await page.evaluate(() => window.__SOL_ARPG_DEMO__.resumeRenderLoop());

  const saveSetup = await page.evaluate(async () => {
    const { GAME_CONFIG } = await import('/js/config.js');
    const { getClassActiveSkills } = await import('/js/data/content.js');
    const game = window.__SOL_ARPG_DEMO__;
    game.mode = 'hunt'; game.state = 'paused'; game.debugSetSkillState({ classId: 'ranger', level: 100, rank: 10 });
    for (const skill of getClassActiveSkills('ranger')) {
      game.player.setSkillMutation(skill.id, 40, Object.keys(skill.evolution.mutations[40]).at(-1));
      game.player.setSkillMutation(skill.id, 80, Object.keys(skill.evolution.mutations[80]).at(-1));
    }
    const saved = game.saveGame(false); const huntRaw = localStorage.getItem(GAME_CONFIG.saveKey);
    const expected = structuredClone(game.player.skillEvolution);
    game.mode = 'defense'; game.player.setSkillMutation('piercing_shot', 40, 'rail_arrow');
    const defenseSaved = game.saveGame(false); const defenseRaw = localStorage.getItem(GAME_CONFIG.saveKey);
    // Stay in Defense through reload so the beforeunload hook cannot serialize
    // the deliberately mutated Defense-only player over the Hunt snapshot.
    return { saved, expected, defenseSaved, defenseUnchanged: huntRaw === defenseRaw };
  });
  if (!saveSetup.saved || saveSetup.defenseSaved !== false || !saveSetup.defenseUnchanged) failures.push(`save isolation setup: ${JSON.stringify(saveSetup)}`);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => document.getElementById('title-screen')?.classList.contains('active'), null, { timeout: 90_000 });
  // DOM click avoids Playwright treating model/asset requests started by
  // Continue as a navigation that must become network-idle.
  await page.evaluate(() => document.getElementById('continue-btn')?.click());
  await page.waitForFunction(() => window.__SOL_ARPG_DEMO__?.state === 'playing', null, { timeout: 30_000 });
  const continued = await page.evaluate(() => ({ classId: window.__SOL_ARPG_DEMO__.player.classId, choices: window.__SOL_ARPG_DEMO__.player.skillEvolution }));
  if (continued.classId !== 'ranger' || JSON.stringify(continued.choices) !== JSON.stringify(saveSetup.expected)) failures.push(`Continue mutation restore: ${JSON.stringify(continued)}`);
  return { facingAndCamera, keyboard, touch, saveSetup, continued };
}

async function captureEvidence(browser) {
  const evidence = [];
  for (const quality of ['low', 'medium']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage(); await startGame(page);
    await page.evaluate(() => {
      document.getElementById('hud')?.style.setProperty('visibility', 'hidden');
      document.getElementById('debug-hud')?.style.setProperty('display', 'none');
      window.__SOL_ARPG_DEMO__?.pauseRenderLoop?.();
    });
    for (const classId of ['aerin', 'wizard', 'rogue', 'ranger']) {
      const skillIds = await page.evaluate(async nextClassId => {
        const { getClassActiveSkills } = await import('/js/data/content.js');
        return getClassActiveSkills(nextClassId).map(skill => skill.id);
      }, classId);
      for (const skillId of skillIds) {
        const signature = await page.evaluate(async ({ classId: nextClassId, skillId: nextSkillId, quality: nextQuality }) => {
          const { ENEMY_TYPES, SKILLS } = await import('/js/data/content.js');
          const { resolveSkillForm } = await import('/js/data/skillCombat.js');
          const game = window.__SOL_ARPG_DEMO__;
          const poolNames = ['particles', 'slashes', 'rings', 'pillars', 'trails', 'decals', 'ghosts', 'beams', 'stars', 'lightFlashes'];
          const origin = game.player.position.clone();
          game.setQuality(nextQuality);
          game.debugSetSkillState({ classId: nextClassId, level: 100, rank: 10 });
          const skill = SKILLS[nextSkillId];
          const choice40 = Object.keys(skill.evolution.mutations[40])[0];
          const choice80 = Object.keys(skill.evolution.mutations[80])[0];
          const bundle = resolveSkillForm(skill, 10, 100, { tier40: choice40, tier80: choice80 });
          const targetDistance = skill.id === 'skyfall' || skill.id === 'arcane_blink'
            ? bundle.combat.leap ?? 10
            : skill.id === 'shadowstep' ? bundle.combat.dash ?? 8
              : skill.id === 'starburst' || skill.id === 'meteor_storm' || skill.id === 'caltrop_trap'
                ? bundle.combat.aim ?? 8 : 2.4;
          const enemyData = Object.values(ENEMY_TYPES).find(data => !data.boss);
          const activePools = () => Object.fromEntries(poolNames.map(name => [name,
            game.effects[name]?.items?.filter(item => item.active).length ?? 0]));
          const queues = () => ({
            projectiles: game.combat.projectiles.length,
            telegraphs: game.combat.telegraphs.length,
            delayed: game.combat.delayed.length,
            charges: game.combat.charges.length,
          });
          const sample = (target, frame) => {
            const pools = activePools();
            const pending = queues();
            const core = Object.values(pools).reduce((sum, count) => sum + count, 0)
              + pending.projectiles + pending.telegraphs + pending.charges;
            const damage = target.maxHp - target.hp;
            return { frame, pools, queues: pending, core, damage, score: (damage > 0 ? 1000 : 0) + core };
          };
          const setup = () => {
            game.combat.clear(); game.effects.clear(); game.enemies.clear();
            game.player.clearShadowFrenzy?.();
            game.player.position.copy(origin); game.player.facing.set(0, 0, 1); game.player.moveDirection.set(0, 0, 1);
            game.player.alive = true; game.player.invulnerable = 999; game.player.mp = game.player.maxMp;
            const target = game.enemies.spawn(enemyData, origin.clone().add({ x: 0, y: 0, z: targetDistance }), { elite: true, level: 100 });
            if (!target) throw new Error(`Could not spawn capture target for ${nextSkillId}`);
            target.maxHp = 1e12; target.hp = target.maxHp; target.invulnerable = 0;
            target.sameCastHitIFrames.clear(); target.statuses = {};
            game.player.animation?.playOneShot(bundle.anim, { fade: 0, fadeOut: .05, timeScale: 1, fallback: 'idle' });
            game.combat.usePlayerSkill(bundle, game.player, 'full');
            return target;
          };
          let target = setup();
          let best = sample(target, 0);
          for (let frame = 1; frame <= 150; frame += 1) {
            game.player.animation?.update?.(1 / 60);
            game.combat.update(1 / 60); game.effects.update(1 / 60);
            const current = sample(target, frame);
            if (current.score > best.score || (current.score === best.score && current.damage > best.damage)) best = current;
          }
          target = setup();
          for (let frame = 1; frame <= best.frame; frame += 1) {
            game.player.animation?.update?.(1 / 60);
            game.combat.update(1 / 60); game.effects.update(1 / 60);
          }
          const captured = sample(target, best.frame);
          game.renderSingleFrame();
          return {
            classId: nextClassId, skillId: nextSkillId, quality: nextQuality,
            anim: bundle.anim, frame: best.frame, core: captured.core,
            damage: captured.damage, pools: captured.pools, queues: captured.queues,
            coreKinds: [
              ...Object.entries(captured.pools).filter(([, count]) => count > 0).map(([name]) => name),
              ...Object.entries(captured.queues).filter(([name, count]) => count > 0 && name !== 'delayed').map(([name]) => name),
            ],
          };
        }, { classId, skillId, quality });
        if (signature.core <= 0 || signature.coreKinds.length === 0) {
          failures.push(`${quality}/${classId}/${skillId}: capture has no active signature core`);
        }
        if (!(signature.damage > 0)) failures.push(`${quality}/${classId}/${skillId}: capture precedes authoritative impact`);
        const path = resolve(OUT, `${quality}-${classId}-${skillId}.png`);
        const buffer = await page.screenshot({ path });
        const row = { ...signature, path };
        evidence.push(row);
        screenshots[quality].push({ ...row, buffer });
      }
    }
    await context.close();
    const sheet = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await sheet.setContent(`<style>*{box-sizing:border-box}body{margin:0;width:1280px;height:720px;overflow:hidden;background:#071018;display:grid;grid-template-columns:repeat(4,320px);grid-template-rows:repeat(4,180px);gap:0}figure{margin:0;position:relative;width:320px;height:180px;overflow:hidden;border:1px solid #6b7f8d}img{width:320px;height:180px;object-fit:cover;display:block}figcaption{position:absolute;left:5px;top:5px;max-width:310px;color:#fff;background:#000c;border:1px solid #ffffff55;padding:3px 5px;font:700 10px/1.25 system-ui;text-shadow:0 1px #000}</style>${screenshots[quality].map(({ classId, skillId, frame, coreKinds, buffer }) => `<figure><img src="data:image/png;base64,${buffer.toString('base64')}"><figcaption>${quality.toUpperCase()} · ${classId} · ${skillId}<br>impact f${frame} · ${coreKinds.join('+')}</figcaption></figure>`).join('')}`);
    await sheet.screenshot({ path: resolve(OUT, `contact-${quality}.png`) }); await sheet.close();
  }
  if (evidence.length !== 32) failures.push(`visual evidence expected 32 in-cast rows, got ${evidence.length}`);
  return evidence;
}

let browser;
let report = {};
try {
  await waitServer(BASE);
  browser = await chromium.launch({ headless: true });
  const visualOnly = process.env.VISUAL_ONLY === '1';
  let resolverRows = [];
  let runtime = { rows: [], localFailures: [] };
  let contracts = null;
  if (!visualOnly) {
    resolverRows = await shippedDataMatrix();
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage(); await startGame(page);
    runtime = await runtimeMatrix(page);
    failures.push(...runtime.localFailures);
    contracts = await quickContracts(page);
    await context.close();
    if (runtime.rows.length !== 48) failures.push(`runtime matrix expected 48 rows, got ${runtime.rows.length}`);
    if (runtime.behaviorRows.length !== 64) failures.push(`behavior matrix expected 64 rows, got ${runtime.behaviorRows.length}`);
  }
  const evidence = await captureEvidence(browser);
  if (browserErrors.length) failures.push(...browserErrors.map(error => `Browser error: ${error}`));
  report = { completed: failures.length === 0, visualOnly, base: BASE, coverage: { resolverRows: resolverRows.length, runtimeRows: runtime.rows.length, behaviorRows: runtime.behaviorRows?.length ?? 0, evidenceRows: evidence.length }, resolverRows, runtime, contracts, evidence, browserErrors, failures };
} catch (error) {
  failures.push(error?.stack || String(error));
  report = { completed: false, base: BASE, browserErrors, failures };
} finally {
  await browser?.close().catch(() => {});
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
}

console.log(JSON.stringify({ completed: report.completed, coverage: report.coverage, failures, out: OUT }, null, 2));
if (failures.length) process.exitCode = 1;
