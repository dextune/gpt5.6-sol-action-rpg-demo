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
const classes = ['aerin', 'wizard', 'rogue'];
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
  const viewportScale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  if (Math.abs(viewportScale - 1) > .001) failures.push(`${label}: page viewport is zoomed (${viewportScale})`);
  if (mode === 'defense') }

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
  await page.screenshot({ path: resolve(outDir, imageName.replace('.png', '-title.png')), fullPage: false });
  await page.locator(mode === 'defense' ? '#defense-btn' : '#new-game-btn').click();
  await assertGameEntered(page, classId, mode, `${mode}/${classId}`);
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
  await continueSmoke(page, 'rogue', 'desktop-rogue-continue.png');
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
        stick: rect('#touch-stick-zone'), ability: rect('.ability-bar'), menu: rect('#touch-menu-btn'), minimap: rect('.minimap-shell'),
      };
    });
    for (const [name, box] of Object.entries(layout)) {
      if (name === 'viewport' || !box) continue;
      const inside = box.x >= -4 && box.y >= -4
        && box.x + box.width <= layout.viewport.width + 4 && box.y + box.height <= layout.viewport.height + 4;
      if (!inside) failures.push(`mobile/${classId}: ${name} is outside the viewport`);
    }
    if (!layout.stick || !layout.ability || !layout.menu || !layout.minimap || !layout.player || !layout.currency) failures.push(`mobile/${classId}: required touch HUD element is missing`);
    if (layout.player && layout.currency) {
      const overlap = layout.player.x < layout.currency.x + layout.currency.width
        && layout.player.x + layout.player.width > layout.currency.x
        && layout.player.y < layout.currency.y + layout.currency.height
        && layout.player.y + layout.player.height > layout.currency.y;
      if (overlap) failures.push(`mobile/${classId}: player card overlaps currency`);
    }
    await page.screenshot({ path: resolve(outDir, `mobile-${classId}-touch-hud.png`), fullPage: false });
  }
  await continueSmoke(page, 'rogue', 'mobile-rogue-continue.png', { touch: true });
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
  console.log(`Visual smoke passed: desktop 3 Hunts + 3 Defense runs + Continue; mobile 3 Hunts + Rogue Defense + Continue. Screenshots: ${outDir}`);
}
