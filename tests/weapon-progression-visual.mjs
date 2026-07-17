/**
 * Browser smoke for +30 signature weapons and the responsive Weapon Forge.
 * Screenshots are written to /tmp unless OUT_DIR is supplied.
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.BASE_URL || 'http://127.0.0.1:8777';
const outDir = process.env.OUT_DIR || `/tmp/sol-arpg-weapon-progression-${Date.now()}`;
const classIds = ['aerin', 'wizard', 'rogue', 'ranger'];
const failures = [];
const consoleErrors = [];
let server;

mkdirSync(outDir, { recursive: true });

const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));

async function waitForServer(timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if ((await fetch(base)).ok) return;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error(`Server did not respond at ${base}`);
}

function captureErrors(page, label) {
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', error => consoleErrors.push(`${label}: ${error.message}`));
}

async function launchHunt(page, classId) {
  await page.goto(`${base}/?autostart=0&quality=medium&class=${classId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForFunction(() => document.querySelector('#title-screen.active'), { timeout: 60000 });
  await page.locator(`[data-class-id="${classId}"]`).click();
  await page.locator('#new-game-btn').click();
  await page.waitForFunction(wanted => {
    const game = window.__SOL_ARPG_DEMO__;
    return game?.state === 'playing' && game?.mode === 'hunt' && game?.player?.classId === wanted;
  }, classId, { timeout: 30000 });
}

async function maximizeWeaponAndOpenForge(page, { touch = false } = {}) {
  return page.evaluate(async forceTouch => {
    const { recomputeWeaponFromEnhance } = await import('./js/systems/LootSystem.js');
    const game = window.__SOL_ARPG_DEMO__;
    const player = game.player;
    const attackBefore = player.attackPower;
    player.gold = 999999;
    for (let index = 0; index < 30; index += 1) player.enhanceWeaponOptions();
    player.weapon.weaponEnhanceLevel = 30;
    recomputeWeaponFromEnhance(player.weapon);
    player.invalidateStats();

    game.elapsed = Math.max(100, Number(game.elapsed) || 0);
    const source = game.enemies.enemies.find(enemy => enemy.alive);
    const procBefore = game.combat.weaponResonanceSerial;
    if (source) game.combat._damageEnemy(source, 1, { cannotCrit: true });
    const procAfter = game.combat.weaponResonanceSerial;
    if (forceTouch) document.body.classList.add('touch-ui');
    game.ui.openPanel('inventory');
    return {
      attackBefore,
      attackAfter: player.attackPower,
      procBefore,
      procAfter,
      sourceFound: Boolean(source),
    };
  }, touch);
}

async function verifyFirstMilestoneAction(page) {
  await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    game.player.gold = 10000;
    game.ui.openPanel('inventory');
  });
  for (let index = 0; index < 3; index += 1) {
    await page.locator('[data-action="weapon-enhance"]').click();
  }
  const result = await page.evaluate(() => ({
    level: window.__SOL_ARPG_DEMO__.player.weapon.weaponEnhanceLevel,
    notice: document.querySelector('.notification.level')?.textContent ?? '',
  }));
  if (result.level !== 3 || !result.notice.includes('RESONANCE UNLOCKED · Oathwave')) {
    failures.push(`desktop/aerin: first live forge milestone failed (${JSON.stringify(result)})`);
  }
}

async function inspectForge(page, label, metrics, screenshotName) {
  await page.locator('.weapon-resonance-card').waitFor({ state: 'visible', timeout: 10000 });
  const layout = await page.evaluate(() => {
    const content = document.querySelector('.panel-content');
    const shell = document.querySelector('.panel-shell');
    const nodes = [...document.querySelectorAll('.weapon-resonance-node')];
    const contentBox = content.getBoundingClientRect();
    const shellBox = shell.getBoundingClientRect();
    return {
      title: document.querySelector('#panel-title')?.textContent,
      heading: document.querySelector('.weapon-resonance-heading h3')?.textContent,
      evolution: document.querySelector('.weapon-enhancement-card h3')?.textContent,
      nodes: nodes.length,
      unlocked: nodes.filter(node => node.classList.contains('is-unlocked')).length,
      horizontalOverflow: content.scrollWidth - content.clientWidth,
      shellInsideViewport: shellBox.left >= -1 && shellBox.right <= innerWidth + 1
        && shellBox.top >= -1 && shellBox.bottom <= innerHeight + 1,
      nodesInsideContent: nodes.every(node => {
        const box = node.getBoundingClientRect();
        return box.left >= contentBox.left - 1 && box.right <= contentBox.right + 1;
      }),
    };
  });
  if (!metrics.sourceFound || metrics.procAfter !== metrics.procBefore + 1) {
    failures.push(`${label}: a real enemy hit did not fire exactly one weapon resonance`);
  }
  if (metrics.attackAfter < metrics.attackBefore * 3) {
    failures.push(`${label}: +30 attack growth was only ${metrics.attackAfter / metrics.attackBefore}x`);
  }
  if (layout.title !== 'Weapon Forge' || layout.evolution !== 'Evolution 30 / 30') {
    failures.push(`${label}: max-level forge copy is missing (${JSON.stringify(layout)})`);
  }
  if (layout.nodes !== 7 || layout.unlocked !== 7 || !/Tier 7\/7/.test(layout.heading ?? '')) {
    failures.push(`${label}: seven resonance milestones are not visibly unlocked`);
  }
  if (layout.horizontalOverflow > 2 || !layout.shellInsideViewport || !layout.nodesInsideContent) {
    failures.push(`${label}: responsive forge overflow (${JSON.stringify(layout)})`);
  }
  await page.screenshot({ path: resolve(outDir, screenshotName), fullPage: false });
}

try {
  if (!process.env.BASE_URL) {
    server = spawn('node', ['server.mjs'], {
      cwd: root,
      env: { ...process.env, HOST: '127.0.0.1', PORT: '8777' },
      stdio: 'pipe',
    });
  }
  await waitForServer();
  const browser = await chromium.launch({ headless: true });

  for (const classId of classIds) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
    const page = await context.newPage();
    captureErrors(page, `desktop/${classId}`);
    await launchHunt(page, classId);
    if (classId === 'aerin') await verifyFirstMilestoneAction(page);
    const metrics = await maximizeWeaponAndOpenForge(page);
    await inspectForge(page, `desktop/${classId}`, metrics, `desktop-${classId}-forge.png`);
    await context.close();
  }

  const device = devices['iPhone 13 Mini'] || devices['iPhone 13'];
  const mobileContext = await browser.newContext({ ...device, locale: 'en-US' });
  const mobilePage = await mobileContext.newPage();
  captureErrors(mobilePage, 'mobile/ranger');
  await launchHunt(mobilePage, 'ranger');
  const mobileMetrics = await maximizeWeaponAndOpenForge(mobilePage, { touch: true });
  await inspectForge(mobilePage, 'mobile/ranger', mobileMetrics, 'mobile-ranger-forge.png');
  await mobileContext.close();
  await browser.close();
} catch (error) {
  failures.push(error?.stack || String(error));
} finally {
  server?.kill();
}

if (consoleErrors.length) failures.push(`console errors:\n${consoleErrors.join('\n')}`);
if (failures.length) {
  console.error(`Weapon progression visual smoke failed (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Weapon progression visual smoke passed for four live class procs and responsive forge layouts. Screenshots: ${outDir}`);
}
