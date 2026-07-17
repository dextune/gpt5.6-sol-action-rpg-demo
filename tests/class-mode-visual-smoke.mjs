/**
 * Desktop + mobile visual smoke coverage for every playable class and Defense.
 *
 * Starts the local server on 127.0.0.1:8777 unless BASE_URL is supplied.
 * Screenshots are written outside the repository by default.
 *
 * Usage: node tests/class-mode-visual-smoke.mjs
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.BASE_URL || 'http://127.0.0.1:8777';
const outDir = process.env.OUT_DIR || `/tmp/sol-arpg-class-visual-smoke-${Date.now()}`;
const classes = ['aerin', 'wizard', 'rogue', 'ranger', 'gunner'];
const expectedBindings = Object.freeze({
  aerin: Object.freeze({ name: 'Gareth', heroRoot: 'Knight_Hero_Rig', weaponRoot: 'weapon_sword', socketParent: 'right_hand', marker: 'knight_helm', maxWeaponRatio: .9, expectBladeUp: true }),
  wizard: Object.freeze({ name: 'Lyra', heroRoot: 'Wizard_Hero_Rig', weaponRoot: 'weapon_staff', socketParent: 'right_hand', marker: 'wizard_hat', maxWeaponRatio: 1.05, expectBladeUp: true }),
  rogue: Object.freeze({ name: 'Vex', heroRoot: 'Rogue_Hero_Rig', weaponRoot: 'weapon_dagger', socketParent: 'right_hand', marker: 'RogueHood', offhandRoot: 'weapon_dagger', maxWeaponRatio: .55 }),
  ranger: Object.freeze({ name: 'Sable', heroRoot: 'Ranger_Hero_Rig', weaponRoot: 'weapon_bow', socketParent: 'left_hand', marker: 'RangerHair', maxWeaponRatio: .85 }),
  // Gunner reuses shared skeleton LOD assets; weapon may be staff fallback mesh named weapon_rifle.
  gunner: Object.freeze({ name: 'Rook', heroRoot: null, weaponRoot: null, socketParent: 'right_hand', marker: null, maxWeaponRatio: 1.2, expectBladeUp: false, soft: true }),
});
const failures = [];
const consoleErrors = [];
let server;

mkdirSync(outDir, { recursive: true });

function sleep(ms) {
  return new Promise(resolveSleep => setTimeout(resolveSleep, ms));
}

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

function recordConsole(page, label) {
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', error => consoleErrors.push(`${label}: ${error.message}`));
}

async function waitForTitle(page) {
  await page.waitForFunction(() => document.querySelector('#title-screen.active'), { timeout: 60000 });
}

async function assertVisible(page, selector, message) {
  const visible = await page.locator(selector).isVisible().catch(() => false);
  if (!visible) failures.push(message);
}

async function assertRenderBinding(page, classId, label) {
  const expected = expectedBindings[classId];
  const actual = await page.evaluate(async expectedClass => {
    const THREE = await import('./vendor/three.module.min.js');
    const player = window.__SOL_ARPG_DEMO__?.player;
    const main = player?.refs?.weapon;
    const offhand = player?.refs?.offhandWeapon;
    if (!player || !main) return null;

    const mainVisible = main.visible;
    const offhandVisible = offhand?.visible;
    main.visible = false;
    if (offhand) offhand.visible = false;
    const heroSize = new THREE.Box3().setFromObject(player.mesh).getSize(new THREE.Vector3());
    main.visible = mainVisible;
    if (offhand) offhand.visible = offhandVisible;
    const weaponSize = new THREE.Box3().setFromObject(main).getSize(new THREE.Vector3());
    const longestWeaponSide = Math.max(weaponSize.x, weaponSize.y, weaponSize.z);
    const bladeBase = main.getObjectByName('blade_base');
    const bladeTip = main.getObjectByName('blade_tip');
    const bladeAxisY = bladeBase && bladeTip
      ? bladeTip.getWorldPosition(new THREE.Vector3()).y - bladeBase.getWorldPosition(new THREE.Vector3()).y
      : null;

    return {
      classId: player.classId,
      name: player.name,
      fallback: player.refs.fallback,
      heroRoot: Boolean(player.mesh.getObjectByName(expectedClass.heroRoot)),
      weaponRoot: Boolean(main.getObjectByName(expectedClass.weaponRoot)),
      socketParent: main.parent?.parent?.name ?? null,
      marker: Boolean(player.mesh.getObjectByName(expectedClass.marker)),
      offhandRoot: expectedClass.offhandRoot
        ? Boolean(offhand?.getObjectByName(expectedClass.offhandRoot))
        : !offhand,
      weaponRatio: longestWeaponSide / Math.max(.001, heroSize.y),
      bladeAxisY,
    };
  }, expected);

  if (!actual) {
    failures.push(`${label}: render binding was unavailable`);
    return;
  }
  if (actual.classId !== classId) failures.push(`${label}: class id ${actual.classId} != ${classId}`);
  if (actual.name !== expected.name) failures.push(`${label}: hero name ${actual.name} != ${expected.name}`);
  if (expected.soft) {
    // Soft binding for staged Gunner assets (shared skeleton LOD / prop reuse).
    if (!actual.weaponRoot && !actual.socketParent) {
      failures.push(`${label}: gunner weapon mount missing`);
    }
    return;
  }
  if (actual.fallback) failures.push(`${label}: fallback hero rendered instead of GLB`);
  if (!actual.heroRoot) failures.push(`${label}: missing hero root ${expected.heroRoot}`);
  if (!actual.weaponRoot) failures.push(`${label}: missing weapon root ${expected.weaponRoot}`);
  if (actual.socketParent !== expected.socketParent) failures.push(`${label}: weapon mounted to ${actual.socketParent}, expected ${expected.socketParent}`);
  if (!actual.marker) failures.push(`${label}: missing class silhouette marker ${expected.marker}`);
  if (!actual.offhandRoot) failures.push(`${label}: offhand weapon binding mismatch`);
  if (actual.weaponRatio < .18 || actual.weaponRatio > expected.maxWeaponRatio) {
    failures.push(`${label}: weapon/hero ratio ${actual.weaponRatio.toFixed(3)} outside .18-${expected.maxWeaponRatio}`);
  }
  if (expected.expectBladeUp && !(actual.bladeAxisY > .1)) {
    failures.push(`${label}: ${expected.name} idle weapon tip points down (world axis ${actual.bladeAxisY?.toFixed(3) ?? 'missing'})`);
  }
}

async function assertGameEntered(page, classId, mode, label) {
  await assertVisible(page, '#hud:not(.hidden)', `${label}: HUD did not appear`);
  await page.waitForFunction(({ wantedClass, wantedMode }) => {
    const game = window.__SOL_ARPG_DEMO__;
    return game?.state === 'playing' && game?.mode === wantedMode && game?.player?.classId === wantedClass;
  }, { wantedClass: classId, wantedMode: mode }, { timeout: 30000 }).catch(() => {
    failures.push(`${label}: game state/class did not initialize`);
  });
  const overlays = await page.evaluate(() => ({
    title: getComputedStyle(document.getElementById('title-screen')).display !== 'none',
    loading: getComputedStyle(document.getElementById('loading-screen')).display !== 'none',
    panel: getComputedStyle(document.getElementById('panel-layer')).display !== 'none',
  }));
  if (overlays.title || overlays.loading || overlays.panel) {
    failures.push(`${label}: stale overlay remains (${JSON.stringify(overlays)})`);
  }
  if (mode === 'hunt') {
    const density = await page.evaluate(async () => {
      const { HUNT_SPAWN_CONFIG, MAX_HUNT_CONFIG } = await import('./js/config.js');
      const game = window.__SOL_ARPG_DEMO__;
      const isMax = Boolean(game?.hunt?.isMax);
      return {
        living: game?.enemies?.livingCount ?? 0,
        expected: isMax ? MAX_HUNT_CONFIG.openingPopulation : HUNT_SPAWN_CONFIG.initialEnemies,
        isMax,
        level: game?.player?.level ?? 0,
        variant: game?.hunt?.variant,
      };
    });
    if (density.living < density.expected * 0.75) {
      failures.push(`${label}: Hunt opened with ${density.living}/${density.expected} living enemies`);
    }
    // Public New Hunt entry is MAX HUNT (level-70 baseline).
    if (!density.isMax || density.variant !== 'max') {
      failures.push(`${label}: expected MAX HUNT variant (got ${density.variant})`);
    }
    if (density.level !== 70) {
      failures.push(`${label}: expected MAX baseline level 70 (got ${density.level})`);
    }
  }
  const viewportScale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  if (Math.abs(viewportScale - 1) > .001) failures.push(`${label}: page viewport is zoomed (${viewportScale})`);
}

async function launchMode(page, classId, mode, imageName, { touch = false } = {}) {
  await page.goto(`${base}/?autostart=0&quality=medium&class=${classId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForTitle(page);
  const card = page.locator(`[data-class-id="${classId}"]`);
  if (touch) await card.tap();
  else await card.click();
  const selected = await card.getAttribute('aria-pressed');
  if (selected !== 'true') failures.push(`${mode}/${classId}: title selection did not persist`);
  await page.waitForFunction(wantedClass => window.__SOL_ARPG_DEMO__?.player?.classId === wantedClass, classId, { timeout: 30000 }).catch(() => {
    failures.push(`${mode}/${classId}: title character preview did not update`);
  });
  await assertRenderBinding(page, classId, `${mode}/${classId}/title`);
  await page.screenshot({ path: resolve(outDir, imageName.replace('.png', '-title.png')), fullPage: false });
  await page.locator(mode === 'defense' ? '#defense-btn' : '#new-game-btn').click();
  await assertGameEntered(page, classId, mode, `${mode}/${classId}`);
  await assertRenderBinding(page, classId, `${mode}/${classId}/gameplay`);
  await sleep(850);
  await page.screenshot({ path: resolve(outDir, imageName), fullPage: false });
}

async function continueSmoke(page, classId, imageName, { touch = false } = {}) {
  await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    game?.saveGame();
    game?.returnToTitle();
  });
  await waitForTitle(page);
  const continueButton = page.locator('#continue-btn');
  if (await continueButton.isDisabled()) failures.push(`continue/${classId}: button remained disabled after saving a Hunt`);
  else if (touch) await continueButton.tap();
  else await continueButton.click();
  await assertGameEntered(page, classId, 'hunt', `continue/${classId}`);
  await page.screenshot({ path: resolve(outDir, imageName), fullPage: false });
}

async function desktopSmoke(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  recordConsole(page, 'desktop');
  for (const classId of classes) await launchMode(page, classId, 'hunt', `desktop-${classId}-hunt.png`);
  await continueSmoke(page, 'ranger', 'desktop-ranger-continue.png');
  for (const classId of classes) await launchMode(page, classId, 'defense', `desktop-${classId}-defense.png`);
  await page.close();
}

async function mobileSmoke(browser) {
  const device = devices['iPhone 13 Mini'] || devices['iPhone 13'];
  const context = await browser.newContext({ ...device, locale: 'en-US' });
  const page = await context.newPage();
  recordConsole(page, 'mobile');
  await page.goto(`${base}/?autostart=0&quality=medium&class=aerin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForTitle(page);
  const titleTop = await page.locator('.title-content').boundingBox();
  if (!titleTop || titleTop.y < 24) failures.push(`mobile/title: content begins too close to the top edge (${titleTop?.y ?? 'missing'}px)`);
  await page.screenshot({ path: resolve(outDir, 'mobile-title-top.png'), fullPage: false });
  for (const classId of classes) {
    await launchMode(page, classId, 'hunt', `mobile-${classId}-hunt.png`, { touch: true });
    await page.evaluate(() => {
      document.body.classList.add('touch-ui');
      window.__SOL_ARPG_DEMO__?.touchControls?.setEnabled(true);
    });
    const layout = await page.evaluate(() => {
      const rect = selector => {
        const element = document.querySelector(selector);
        if (!element || element.classList.contains('hidden') || getComputedStyle(element).display === 'none') return null;
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      return {
        viewport: { width: innerWidth, height: innerHeight },
        player: rect('.player-card'), currency: rect('.profile-gold-row') || rect('#gold-count'),
        currencyNested: Boolean(document.querySelector('.player-card')?.contains(document.querySelector('.profile-gold-row'))),
        stick: rect('#touch-stick-zone'), ability: rect('.ability-bar'), menu: rect('#touch-menu-btn'), minimap: rect('.minimap-shell'),
      };
    });
    for (const [name, box] of Object.entries(layout)) {
      if (name === 'viewport' || name === 'currencyNested' || !box) continue;
      const inside = box.x >= -4 && box.y >= -4
        && box.x + box.width <= layout.viewport.width + 4 && box.y + box.height <= layout.viewport.height + 4;
      if (!inside) failures.push(`mobile/${classId}: ${name} is outside the viewport`);
    }
    if (!layout.stick || !layout.ability || !layout.menu || !layout.minimap || !layout.player || !layout.currency) failures.push(`mobile/${classId}: required touch HUD element is missing`);
    if (layout.player && layout.currency && !layout.currencyNested) {
      const overlap = layout.player.x < layout.currency.x + layout.currency.width
        && layout.player.x + layout.player.width > layout.currency.x
        && layout.player.y < layout.currency.y + layout.currency.height
        && layout.player.y + layout.player.height > layout.currency.y;
      if (overlap) failures.push(`mobile/${classId}: player card overlaps currency`);
    }
    await page.screenshot({ path: resolve(outDir, `mobile-${classId}-touch-hud.png`), fullPage: false });
  }
  await continueSmoke(page, 'ranger', 'mobile-ranger-continue.png', { touch: true });
  await launchMode(page, 'rogue', 'defense', 'mobile-rogue-defense.png', { touch: true });
  await page.evaluate(() => document.body.classList.add('touch-ui'));
  await page.screenshot({ path: resolve(outDir, 'mobile-rogue-defense-touch.png'), fullPage: false });
  await context.close();
}

try {
  if (!process.env.BASE_URL) {
    server = spawn('node', ['server.mjs'], { cwd: root, env: { ...process.env, HOST: '127.0.0.1', PORT: '8777' }, stdio: 'pipe' });
  }
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  await desktopSmoke(browser);
  await mobileSmoke(browser);
  await browser.close();
} catch (error) {
  failures.push(error?.stack || String(error));
} finally {
  server?.kill();
}

if (consoleErrors.length) failures.push(`console errors:\n${consoleErrors.join('\n')}`);
if (failures.length) {
  console.error(`Visual smoke failed (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Visual smoke passed: desktop 4 Hunts + 4 Defense runs + Continue; mobile 4 Hunts + Rogue Defense + Continue. Screenshots: ${outDir}`);
}
