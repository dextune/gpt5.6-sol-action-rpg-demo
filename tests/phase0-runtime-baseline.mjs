/**
 * Runtime evidence for the Phase-0 skill baseline.
 *
 * Measures isolated medium/high pooled-effect peaks for each class C skill and
 * loads both Rogue hero LODs with paired weapon/socket assertions.
 *
 * Usage: node tests/phase0-runtime-baseline.mjs
 * Env: BASE_URL (default http://127.0.0.1:8777), OUT_DIR
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8777';
const OUT = resolve(process.env.OUT_DIR || '/tmp/sol-arpg-phase0-runtime');
mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));

async function waitServer(url, timeout = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Server unavailable at ${url}`);
}

await waitServer(BASE);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const browserErrors = [];
page.on('pageerror', error => browserErrors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error') browserErrors.push(message.text());
});

await page.goto(`${BASE}/?autostart=0&debug=1`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForFunction(() => document.getElementById('title-screen')?.classList.contains('active'), null, {
  timeout: 90_000,
});
await page.click('#new-game-btn');
await page.waitForSelector('#hud:not(.hidden)', { timeout: 30_000 });

const report = await page.evaluate(async () => {
  const { SKILLS } = await import('/js/data/content.js');
  const { resolveSkillForm } = await import('/js/data/skillCombat.js');
  const game = window.__SOL_ARPG_DEMO__;
  const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
  game.state = 'paused';
  const poolNames = ['particles', 'slashes', 'rings', 'pillars', 'trails', 'decals', 'ghosts', 'beams', 'stars', 'lightFlashes'];
  const capacity = Object.fromEntries(poolNames.map(name => [name, game.effects[name]?.items?.length ?? 0]));
  const active = () => Object.fromEntries(poolNames.map(name => [
    name,
    game.effects[name]?.items?.filter(item => item.active).length ?? 0,
  ]));
  const mergePeak = (peak, sample) => {
    for (const name of poolNames) peak[name] = Math.max(peak[name] ?? 0, sample[name] ?? 0);
  };
  const resetCombat = () => {
    game.combat.clear();
    game.effects.clear();
    game.player.alive = true;
    game.player.hp = game.player.maxHp;
    game.player.invulnerable = 999;
    game.player.skillCooldowns = Object.fromEntries(Object.keys(game.player.skillCooldowns).map(id => [id, 0]));
    game.player.mp = game.player.maxMp;
  };
  const setClass = classId => {
    if (game.player.classId === classId) {
      const alternate = classId === 'aerin' ? 'wizard' : 'aerin';
      game.player.setClass(alternate, { keepTransform: true });
    }
    game.player.setClass(classId, { keepTransform: true });
    game.player.level = 19;
  };
  const isolateTarget = () => {
    const living = game.enemies.enemies.filter(enemy => enemy.alive);
    const facing = game.player.facing.clone().setY(0).normalize();
    living.forEach((enemy, index) => {
      enemy.invulnerable = 0;
      enemy.stunTimer = 99;
      enemy.hp = enemy.maxHp = 1_000_000;
      enemy.position.copy(game.player.position)
        .addScaledVector(facing, index === 0 ? 8 : 100 + index * 2);
    });
    return living.length;
  };

  const cases = [
    ['aerin', 'starburst'],
    ['wizard', 'meteor_storm'],
    ['rogue', 'death_lotus'],
    ['ranger', 'hunter_mark'],
  ];
  const measurements = [];

  for (const quality of ['medium', 'high']) {
    game.setQuality(quality);
    game.player.quality = quality;
    game.assets?.setQuality?.(quality);
    for (const [classId, skillId] of cases) {
      setClass(classId);
      const targetCount = isolateTarget();
      game.player.skills[skillId] = 10;
      const peaks = [];
      for (let cast = 0; cast < 3; cast += 1) {
        resetCombat();
        const peak = Object.fromEntries(poolNames.map(name => [name, 0]));
        const bundle = resolveSkillForm(SKILLS[skillId], 10, 19, {});
        game.combat.usePlayerSkill(bundle, game.player, 'full');
        for (let frame = 0; frame < 240; frame += 1) {
          game.combat.update(1 / 60);
          game.effects.update(1 / 60);
          mergePeak(peak, active());
          if (frame % 30 === 0) await delay(0);
        }
        mergePeak(peak, active());
        peaks.push(peak);
      }
      const peak = Object.fromEntries(poolNames.map(name => [name, Math.max(...peaks.map(run => run[name]))]));
      measurements.push({
        classId,
        skillId,
        quality,
        targetCount,
        peak,
        atCapacity: poolNames.filter(name => peak[name] >= capacity[name] && capacity[name] > 0),
      });
    }
  }

  resetCombat();
  return { capacity, measurements };
});

// Release the measurement scene and its loaded medium-quality assets before
// opening isolated quality-specific pages for real GLB evidence.
await page.close();
await browser.close();
const lodBrowser = await chromium.launch({ headless: true });

const rogueLods = [];
for (const quality of ['high', 'medium']) {
  const lodPage = await lodBrowser.newPage({ viewport: { width: 1280, height: 720 } });
  lodPage.on('pageerror', error => browserErrors.push(String(error?.stack || error)));
  lodPage.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await lodPage.goto(`${BASE}/?autostart=0&debug=1&quality=${quality}`, {
    waitUntil: 'domcontentloaded', timeout: 60_000,
  });
  await lodPage.waitForFunction(() => document.getElementById('title-screen')?.classList.contains('active'), null, {
    timeout: 90_000,
  });
  // High-quality GLB setup can keep SwiftShader's main thread busy long enough
  // for Playwright's actionability click to time out after the event fires.
  // The button is already visible/enabled here, so dispatch its native click
  // and wait on the authoritative HUD-ready state instead.
  await lodPage.evaluate(() => document.getElementById('new-game-btn').click());
  await lodPage.waitForSelector('#hud:not(.hidden)', { timeout: 90_000 });
  const evidence = await lodPage.evaluate(async selectedQuality => {
    const { Vector3 } = await import('three');
    const game = window.__SOL_ARPG_DEMO__;
    if (game.player.classId === 'rogue') game.player.setClass('aerin', { keepTransform: true });
    game.player.setClass('rogue', { keepTransform: true });
    await new Promise(resolveDelay => setTimeout(resolveDelay, 350));
    const refs = game.player.refs;
    game.player.mesh.updateWorldMatrix(true, true);
    const world = object => {
      if (!object?.getWorldPosition) return null;
      const value = object.getWorldPosition(new Vector3());
      return { x: value.x, y: value.y, z: value.z };
    };
    return {
      requestedQuality: selectedQuality,
      heroQuality: refs.quality,
      weaponQuality: refs.weaponQuality,
      heroName: refs.group?.name,
      leftHandFound: Boolean(refs.group?.getObjectByName('left_hand')),
      mainSocket: refs.socket?.name,
      offhandSocket: refs.offhandSocket?.name,
      offhandParent: refs.offhandSocket?.parent?.name,
      mainMounted: refs.weapon?.parent === refs.socket,
      offhandMounted: refs.offhandWeapon?.parent === refs.offhandSocket,
      mainTip: world(refs.mainBladeTip),
      offhandTip: world(refs.offhandBladeTip),
      distinctTips: Boolean(refs.mainBladeTip && refs.offhandBladeTip && refs.mainBladeTip !== refs.offhandBladeTip),
    };
  }, quality);
  await lodPage.screenshot({ path: resolve(OUT, `rogue-${quality}.png`) });
  rogueLods.push(evidence);
  await lodPage.close();
}

await lodBrowser.close();

const failures = [];
for (const row of report.measurements) {
  if (row.targetCount < 1 && row.skillId === 'hunter_mark') failures.push('Hunter Mark had no real target');
  if (row.atCapacity.length) failures.push(`${row.skillId}/${row.quality} reached pool capacity: ${row.atCapacity.join(', ')}`);
}
for (const lod of rogueLods) {
  if (!lod.leftHandFound || lod.offhandParent !== 'left_hand') failures.push(`${lod.requestedQuality}: Rogue left-hand socket missing`);
  if (!lod.mainMounted || !lod.offhandMounted || !lod.distinctTips) failures.push(`${lod.requestedQuality}: paired weapon mount/tips invalid`);
  if (lod.heroQuality !== lod.requestedQuality || lod.weaponQuality !== lod.requestedQuality) {
    failures.push(`${lod.requestedQuality}: quality mismatch hero=${lod.heroQuality} weapon=${lod.weaponQuality}`);
  }
}
if (browserErrors.length) failures.push(...browserErrors.map(error => `Browser error: ${error}`));

const output = { ...report, rogueLods, browserErrors, failures, completed: failures.length === 0 };
writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (failures.length) process.exitCode = 1;
