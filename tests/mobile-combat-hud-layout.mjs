/**
 * Mobile combat-cockpit stress test.
 * Exercises the maximum real combat HUD combination at portrait/landscape:
 * boss + Defense + two notifications + class state + both touch controllers.
 *
 * Usage: node tests/mobile-combat-hud-layout.mjs
 * Env: BASE_URL (default http://127.0.0.1:8777), OUT_DIR
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8777';
const OUT = process.env.OUT_DIR || '/tmp/sol-arpg-mobile-combat-hud';
const failures = [];
const consoleErrors = [];
const layouts = {};
mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(done => setTimeout(done, ms));

async function waitServer(timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error(`Server not ready: ${BASE}`);
}

function overlaps(a, b, gap = 0) {
  if (!a || !b) return false;
  return !(a.right + gap <= b.left || b.right + gap <= a.left
    || a.bottom + gap <= b.top || b.bottom + gap <= a.top);
}

function assertLayout(label, layout) {
  const required = ['player', 'menu', 'boss', 'defense', 'notifications', 'state', 'ability', 'stick', 'mobileVitals'];
  if (layout.viewport.height >= layout.viewport.width) required.push('minimap');
  for (const name of required) {
    const box = layout[name];
    if (!box) {
      failures.push(`${label}: missing ${name}`);
      continue;
    }
    if (box.left < -1 || box.top < -1 || box.right > layout.viewport.width + 1 || box.bottom > layout.viewport.height + 1) {
      failures.push(`${label}: ${name} leaves viewport (${JSON.stringify(box)})`);
    }
  }
  const topLane = ['player', 'minimap', 'boss', 'defense', 'notifications'];
  const bottomLane = ['state', 'ability', 'stick'];
  for (const lane of [topLane, bottomLane]) {
    for (let a = 0; a < lane.length; a += 1) {
      for (let b = a + 1; b < lane.length; b += 1) {
        if (overlaps(layout[lane[a]], layout[lane[b]], 3)) {
          failures.push(`${label}: ${lane[a]} overlaps ${lane[b]}`);
        }
      }
    }
  }
  if (!layout.zoneHidden) failures.push(`${label}: low-priority zone chrome remains visible during boss priority mode`);
  if (!layout.currencyVisible) failures.push(`${label}: map resource lane is hidden during boss priority mode`);
  if (layout.minimap && layout.resources && Math.abs(layout.minimap.width - layout.resources.width) > 1) {
    failures.push(`${label}: minimap width does not match the combined Gold/Items card width`);
  }
  if (layout.minimap && layout.minimap.width < 90) failures.push(`${label}: map/status lane was not widened`);
  if (layout.zoneConfiguredWidth < 90) failures.push(`${label}: map name lane was not widened`);
  if (layout.menu && layout.player
    && (layout.menu.left < layout.player.left - 1 || layout.menu.top < layout.player.top - 1
      || layout.menu.right > layout.player.right + 1 || layout.menu.bottom > layout.player.bottom + 1)) {
    failures.push(`${label}: settings button is not contained by the profile card`);
  }
  if (layout.levelBadgeVisible) failures.push(`${label}: mobile profile level badge remains visible`);
  if (layout.menuLabel !== 'Open settings') failures.push(`${label}: profile settings button is not labelled correctly`);
  if (layout.vitalBarCount !== 0) failures.push(`${label}: legacy HP/MP bars remain beside the orbs`);
  if (layout.health || layout.power) failures.push(`${label}: desktop HP/MP orbs remain visible on mobile`);
  if (layout.mobileVitals && layout.player && layout.mobileVitals.width < layout.player.width - 16) {
    failures.push(`${label}: mobile HP/MP gauges do not span the profile card`);
  }
  if (layout.mobileVitalsText) failures.push(`${label}: mobile HP/MP gauges still contain text`);
  if (layout.minimumSkillTarget < layout.expectedMinimumTarget) {
    failures.push(`${label}: skill target ${layout.minimumSkillTarget}px < ${layout.expectedMinimumTarget}px`);
  }
  if (!layout.bossClass || !layout.defenseClass || !layout.stateClass) {
    failures.push(`${label}: UI priority classes were not synchronized by UI.update`);
  }
}

async function start(page) {
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(error.stack ?? error.message));
  await page.goto(`${BASE}/?debug=1&autostart=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('title-screen')?.classList.contains('active'), null, { timeout: 90000 });
  await page.evaluate(() => {
    document.body.classList.add('touch-ui');
    document.getElementById('debug-hud')?.style.setProperty('display', 'none');
    window.__SOL_ARPG_DEMO__?.touchControls?.setEnabled(true);
  });
  await page.click('#new-game-btn');
  await page.waitForSelector('#hud:not(.hidden)', { timeout: 30000 });
}

async function stageStress(page) {
  await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    const originalUpdate = game.ui.update;
    const priorMode = game.mode;
    const priorClass = game.player.classId;
    const priorThorns = game.player.thornField;
    const priorVerdict = game.player.predatorVerdict;
    game.debugSetSkillState({ classId: 'ranger', level: 100, rank: 10 });
    game.player.thornField = { generation: 991, remaining: 5, planted: 4 };
    game.player.predatorVerdict = { generation: 992, remaining: 5, stored: 75, cap: 100, target: { alive: true } };
    game.mode = 'defense';
        const fakeBoss = {
      boss: true, elite: false, alive: true,
      data: { name: 'HUD Stress Warden' }, level: 100, healthRatio: .63,
      position: { x: game.player.position.x + 8, z: game.player.position.z + 8 },
    };
    game.enemies.enemies.push(fakeBoss);
    const notifications = document.getElementById('notifications');
    for (const text of ['Armor broken', 'Apex ready']) {
      const item = document.createElement('div');
      item.className = 'notification';
      item.textContent = text;
      notifications.appendChild(item);
    }
    originalUpdate.call(game.ui, 1);
    game.ui.update = () => {};
    game.enemies.enemies.splice(game.enemies.enemies.indexOf(fakeBoss), 1);
    game.mode = priorMode;
    window.__restoreCombatHudStress = () => {
      game.ui.update = originalUpdate;
      game.player.classId = priorClass;
      game.player.thornField = priorThorns;
      game.player.predatorVerdict = priorVerdict;
            notifications.replaceChildren();
      originalUpdate.call(game.ui, 1);
    };
  });
  await sleep(80);
}

async function snapshot(page, expectedMinimumTarget) {
  return page.evaluate(minimum => {
    const pick = selector => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const vitalBarCount = document.querySelectorAll('.combat-vitals .resource-bar').length;
    const targets = [...document.querySelectorAll('.ability-slot[data-key]')]
      .map(node => Math.min(node.getBoundingClientRect().width, node.getBoundingClientRect().height));
    const hud = document.getElementById('hud');
    const visible = selector => {
      const node = document.querySelector(selector);
      const style = node ? getComputedStyle(node) : null;
      return Boolean(node && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0);
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      player: pick('.player-card'), minimap: pick('.minimap-shell'), menu: pick('#touch-menu-btn'),
      resources: pick('.profile-gold-row') || pick('#gold-count'),
      boss: pick('.boss-hud'), defense: pick('.zone-ribbon'), notifications: pick('#notifications'),
      state: pick('.class-state-row'), ability: pick('.ability-bar'), stick: pick('.touch-stick-zone'),
      health: pick('.combat-vitals-health'), power: pick('.combat-vitals-power'),
      mobileVitals: pick('.mobile-profile-vitals'),
      mobileVitalsText: document.querySelector('.mobile-profile-vitals')?.textContent?.trim() ?? '',
      levelBadgeVisible: visible('#player-level-text'),
      menuLabel: document.getElementById('touch-menu-btn')?.getAttribute('aria-label') ?? '',
      zoneConfiguredWidth: Number.parseFloat(getComputedStyle(document.querySelector('.zone-ribbon')).width),
      zoneHidden: !visible('.zone-ribbon'), currencyVisible: visible('.profile-gold-row') || visible('#gold-count'),
      vitalBarCount, minimumSkillTarget: Math.min(...targets), expectedMinimumTarget: minimum,
      bossClass: hud.classList.contains('boss-active'), defenseClass: hud.classList.contains('defense-active'),
      stateClass: hud.classList.contains('class-state-active'),
    };
  }, expectedMinimumTarget);
}

async function main() {
  await waitServer();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--disable-dev-shm-usage'] });
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await start(page);
    await stageStress(page);
    layouts.portrait = await snapshot(page, 40);
    assertLayout('portrait 375x812', layouts.portrait);
    await page.screenshot({ path: resolve(OUT, '01-combat-stress-375x812.png') });
    await page.evaluate(() => window.__restoreCombatHudStress?.());

    await page.setViewportSize({ width: 812, height: 375 });
    await stageStress(page);
    layouts.landscape = await snapshot(page, 42);
    assertLayout('landscape 812x375', layouts.landscape);
    await page.screenshot({ path: resolve(OUT, '02-combat-stress-812x375.png') });
    await page.evaluate(() => window.__restoreCombatHudStress?.());
    await page.click('#touch-menu-btn');
    await page.waitForSelector('#panel-layer:not(.hidden)', { timeout: 5000 });
    await page.click('#panel-close');
    await page.waitForFunction(() => document.getElementById('panel-layer')?.classList.contains('hidden'), null, { timeout: 5000 });
    await context.close();
  } finally {
    await browser.close();
  }
  if (consoleErrors.length) failures.push(`console errors: ${consoleErrors.join(' | ')}`);
  const report = { completed: failures.length === 0, failures, consoleErrors, layouts };
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  const report = { completed: false, failures: [...failures, error.stack ?? String(error)], consoleErrors, layouts };
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}
