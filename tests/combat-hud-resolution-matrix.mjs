/**
 * Combat HUD resolution matrix.
 *
 * Validates the Diablo-style HUD column, profile toggle, enlarged vitals, and
 * action-pad separation across desktop and touch breakpoints.
 *
 * Usage: node tests/combat-hud-resolution-matrix.mjs
 * Env: BASE_URL (default http://127.0.0.1:8777), OUT_DIR
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8777';
const OUT = process.env.OUT_DIR || '/tmp/sol-arpg-hud-resolution-matrix';
const failures = [];
const consoleErrors = [];
const results = [];
const evidenceViewports = new Set([
  'desktop-2560x1440', 'desktop-1280x720', 'desktop-768x600',
  'touch-320x568', 'touch-375x812', 'touch-812x375', 'touch-932x430',
]);
mkdirSync(OUT, { recursive: true });

const desktopViewports = [
  [2560, 1440],
  [1920, 1080],
  [1440, 900],
  [1280, 720],
  [1100, 700],
  [1024, 768],
  [800, 600],
  [768, 600],
  [640, 480],
];

const touchViewports = [
  [320, 568],
  [360, 640],
  [375, 667],
  [375, 812],
  [390, 844],
  [412, 915],
  [430, 932],
  [568, 320],
  [667, 375],
  [812, 375],
  [844, 390],
  [932, 430],
];

function sleep(ms) { return new Promise(resolveSleep => setTimeout(resolveSleep, ms)); }

async function waitServer(timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error(`Server not ready: ${BASE}`);
}

function overlaps(a, b, gap = 0) {
  if (!a || !b) return false;
  return !(a.right + gap <= b.left || b.right + gap <= a.left
    || a.bottom + gap <= b.top || b.bottom + gap <= a.top);
}

function inside(rect, viewport, inset = 1) {
  return Boolean(rect && rect.left >= -inset && rect.top >= -inset
    && rect.right <= viewport.width + inset && rect.bottom <= viewport.height + inset);
}

function centerY(rect) { return (rect.top + rect.bottom) / 2; }

async function startHunt(page, touch, label) {
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', error => consoleErrors.push(`${label}: ${error.stack ?? error.message}`));
  await page.goto(`${BASE}/?debug=1&autostart=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#title-screen.active', { timeout: 90000 });
  if (touch) {
    await page.evaluate(() => document.body.classList.add('touch-ui'));
  }
  await page.click('#new-game-btn');
  await page.waitForSelector('#hud:not(.hidden)', { timeout: 30000 });
  await page.evaluate(isTouch => {
    document.getElementById('debug-hud')?.classList.add('hidden');
    document.body.classList.toggle('touch-ui', isTouch);
    window.__SOL_ARPG_DEMO__?.touchControls?.setEnabled(isTouch);
    window.__SOL_ARPG_DEMO__?.debugSetSkillState({ classId: 'rogue', level: 20, rank: 3 });
  }, touch);
  await sleep(160);
}

async function collapseProfile(page) {
  await page.evaluate(() => {
    const toggle = document.getElementById('profile-toggle');
    if (toggle?.getAttribute('aria-expanded') === 'true') toggle.click();
  });
}

async function snapshot(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
      const box = element.getBoundingClientRect();
      return {
        left: box.left, top: box.top, right: box.right, bottom: box.bottom,
        width: box.width, height: box.height,
      };
    };
    const profile = document.querySelector('.hunter-profile');
    const resources = document.querySelector('.profile-gold-row');
    const hunt = document.getElementById('hunt-record-panel');
    const mapHeading = document.querySelector('.minimap-heading span');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      overflow: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      profile: rect('.hunter-profile'),
      profileToggle: rect('#profile-toggle'),
      hunt: rect('#hunt-record-panel'),
      weapon: rect('#combat-weapon-enhance'),
      option: rect('#combat-option-enhance'),
      zone: rect('.zone-ribbon'),
      minimap: rect('.minimap-shell'),
      resources: rect('.profile-gold-row'),
      resourcesNested: Boolean(profile?.contains(resources)),
      notifications: rect('#notifications'),
      ability: rect('.ability-bar'),
      health: rect('.combat-vitals-health'),
      power: rect('.combat-vitals-power'),
      mobileVitals: rect('.mobile-profile-vitals'),
      stick: rect('#touch-stick-zone'),
      menu: rect('#touch-menu-btn'),
      mapHeading: mapHeading?.textContent?.trim() ?? '',
      huntExpanded: document.getElementById('profile-toggle')?.getAttribute('aria-expanded') === 'true',
      huntHidden: hunt?.classList.contains('hidden') ?? false,
      profileClipped: Boolean(profile && profile.scrollHeight > profile.clientHeight + 1),
      profileOverflowY: profile ? getComputedStyle(profile).overflowY : '',
      zoneBeforeDisplay: getComputedStyle(document.querySelector('.zone-ribbon'), '::before').display,
      zoneAfterDisplay: getComputedStyle(document.querySelector('.zone-ribbon'), '::after').display,
      curvedGaugeCount: document.querySelectorAll('.character-vitals-overlay, .character-gauge, #hp-arc-fill, #mp-arc-fill, #energy-fill').length,
    };
  });
}

function auditLayout(label, layout, touch) {
  const required = ['profile', 'profileToggle', 'weapon', 'option', 'zone', 'minimap', 'resources', 'ability'];
  if (touch) required.push('stick', 'menu', 'mobileVitals');
  else required.push('health', 'power');
  for (const name of required) {
    if (!layout[name]) failures.push(`${label}: missing ${name}`);
    else if (!inside(layout[name], layout.viewport)) failures.push(`${label}: ${name} outside viewport ${JSON.stringify(layout[name])}`);
  }
  if (layout.overflow.width > layout.viewport.width + 1 || layout.overflow.height > layout.viewport.height + 1) {
    failures.push(`${label}: document overflow ${layout.overflow.width}x${layout.overflow.height}`);
  }
  if (layout.huntExpanded || !layout.huntHidden || layout.hunt) failures.push(`${label}: Hunt record is expanded by default`);
  if (layout.profileClipped) failures.push(`${label}: profile content is clipped`);
  if (!layout.resourcesNested) failures.push(`${label}: gold is not nested in the hunter profile`);
  if (layout.mapHeading !== 'TACTICAL MAP') failures.push(`${label}: minimap heading mismatch (${layout.mapHeading})`);
  if (layout.zoneBeforeDisplay !== 'none' || layout.zoneAfterDisplay !== 'none') failures.push(`${label}: center-title gradient lines returned`);
  if (layout.curvedGaugeCount !== 0) failures.push(`${label}: curved gauges remain in the HUD`);
  if (touch && (layout.health || layout.power)) failures.push(`${label}: desktop combat orbs remain visible on mobile`);
  if (!touch && layout.mobileVitals) failures.push(`${label}: mobile profile gauges are visible on desktop`);
  if (touch && layout.mobileVitals && layout.profile && layout.mobileVitals.width < layout.profile.width - 16) {
    failures.push(`${label}: mobile HP/MP gauges do not span the profile card`);
  }
  if (layout.zone && layout.minimap) {
    if (layout.zone.bottom > layout.minimap.top + 1) failures.push(`${label}: zone title is not above minimap`);
    if (Math.abs(layout.zone.width - layout.minimap.width) > 1) failures.push(`${label}: zone/minimap width mismatch`);
  }
  if (overlaps(layout.profile, layout.zone, 4) || overlaps(layout.profile, layout.minimap, 4)) {
    failures.push(`${label}: left profile overlaps right map column`);
  }
  const expectedVitalSize = layout.viewport.width <= 1100 ? 96 : 117;
  if (!touch && layout.health && (Math.abs(layout.health.width - expectedVitalSize) > 1 || Math.abs(layout.health.height - expectedVitalSize) > 1)) {
    failures.push(`${label}: HP orb is not 1.5x (${layout.health.width}x${layout.health.height}, expected ${expectedVitalSize})`);
  }
  if (!touch && layout.power && (Math.abs(layout.power.width - expectedVitalSize) > 1 || Math.abs(layout.power.height - expectedVitalSize) > 1)) {
    failures.push(`${label}: MP orb is not 1.5x (${layout.power.width}x${layout.power.height}, expected ${expectedVitalSize})`);
  }
  if (!touch) {
    if (Math.abs(centerY(layout.ability) - centerY(layout.health)) > 1.5) failures.push(`${label}: HP center does not match action pad`);
    if (Math.abs(centerY(layout.ability) - centerY(layout.power)) > 1.5) failures.push(`${label}: MP center does not match action pad`);
    if (overlaps(layout.health, layout.ability, 4)) failures.push(`${label}: HP overlaps action pad`);
    if (overlaps(layout.power, layout.ability, 4)) failures.push(`${label}: MP overlaps action pad`);
  }
  if (touch && overlaps(layout.menu, layout.minimap, 4)) failures.push(`${label}: menu overlaps minimap`);
}

async function auditToggle(page, label) {
  await page.click('#profile-toggle');
  await sleep(50);
  const expanded = await snapshot(page);
  if (!expanded.huntExpanded || expanded.huntHidden || !expanded.hunt) failures.push(`${label}: Hunt record did not expand`);
  if (!expanded.weapon || !expanded.option) failures.push(`${label}: WPN/OPT disappeared while Hunt record was open`);
  const scrollableProfile = expanded.profileOverflowY === 'auto' || expanded.profileOverflowY === 'scroll';
  if (!inside(expanded.profile, expanded.viewport) || (expanded.profileClipped && !scrollableProfile)) {
    failures.push(`${label}: expanded profile is clipped/outside viewport`);
  }
  await page.click('#profile-toggle');
  await sleep(50);
  const collapsed = await snapshot(page);
  if (collapsed.huntExpanded || !collapsed.huntHidden || collapsed.hunt) failures.push(`${label}: Hunt record did not collapse`);
}

async function auditOrbVitals(page, label) {
  const values = await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    game.player.hp = game.player.maxHp * .5;
    game.player.mp = game.player.maxMp * .25;
    game.ui.update(1);
    const mobileVitals = document.querySelector('.mobile-profile-vitals');
    const healthOrb = document.querySelector('.combat-vitals-health');
    return {
      hpTransform: document.getElementById('hp-fill').style.transform,
      mpTransform: document.getElementById('mp-fill').style.transform,
      mobileHpTransform: document.getElementById('mobile-hp-fill').style.transform,
      mobileMpTransform: document.getElementById('mobile-mp-fill').style.transform,
      touch: document.body.classList.contains('touch-ui'),
      mobileVitalsVisible: getComputedStyle(mobileVitals).display !== 'none',
      mobileVitalsText: mobileVitals.textContent.trim(),
      desktopOrbsVisible: getComputedStyle(healthOrb).display !== 'none',
      orbTextCount: document.querySelectorAll('.vital-orb small, .vital-orb b').length,
      curvedGaugeCount: document.querySelectorAll('.character-vitals-overlay, .character-gauge, #hp-arc-fill, #mp-arc-fill, #energy-fill').length,
    };
  });
  if (values.hpTransform !== 'scaleY(0.5)' || values.mpTransform !== 'scaleY(0.25)') failures.push(`${label}: orb liquid ratios mismatch ${JSON.stringify(values)}`);
  if (values.mobileHpTransform !== 'scaleX(0.5)' || values.mobileMpTransform !== 'scaleX(0.25)') failures.push(`${label}: mobile profile gauge ratios mismatch ${JSON.stringify(values)}`);
  if (values.orbTextCount !== 0) failures.push(`${label}: text remains inside the 3D orbs`);
  if (values.mobileVitalsText) failures.push(`${label}: text remains beside the mobile HP/MP gauges`);
  if (values.touch && (!values.mobileVitalsVisible || values.desktopOrbsVisible)) failures.push(`${label}: mobile vitals presentation mismatch ${JSON.stringify(values)}`);
  if (!values.touch && (values.mobileVitalsVisible || !values.desktopOrbsVisible)) failures.push(`${label}: desktop vitals presentation mismatch ${JSON.stringify(values)}`);
  if (values.curvedGaugeCount !== 0) failures.push(`${label}: curved gauges remain ${JSON.stringify(values)}`);
}

async function runMatrix(page, entries, touch, prefix) {
  for (const [width, height] of entries) {
    const label = `${prefix}-${width}x${height}`;
    await page.setViewportSize({ width, height });
    await page.evaluate(isTouch => {
      document.body.classList.toggle('touch-ui', isTouch);
      window.__SOL_ARPG_DEMO__?.touchControls?.setEnabled(isTouch);
    }, touch);
    await collapseProfile(page);
    await sleep(90);
    const layout = await snapshot(page);
    auditLayout(label, layout, touch);
    await auditToggle(page, label);
    if (results.length === 0 || (touch && width === 375 && height === 812)) await auditOrbVitals(page, label);
    if (evidenceViewports.has(label)) await page.screenshot({ path: resolve(OUT, `${label}.png`) });
    results.push({ label, touch, layout });
  }
}

async function main() {
  await waitServer();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--disable-dev-shm-usage'] });
  try {
    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
    const desktop = await desktopContext.newPage();
    await startHunt(desktop, false, 'desktop');
    await desktop.evaluate(() => window.__SOL_ARPG_DEMO__?.pauseRenderLoop?.());
    await runMatrix(desktop, desktopViewports, false, 'desktop');
    await desktopContext.close();

    const touchContext = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, locale: 'en-US' });
    const touch = await touchContext.newPage();
    await startHunt(touch, true, 'touch');
    await touch.evaluate(() => window.__SOL_ARPG_DEMO__?.pauseRenderLoop?.());
    await runMatrix(touch, touchViewports, true, 'touch');
    await touchContext.close();
  } finally {
    await browser.close();
  }

  if (consoleErrors.length) failures.push(...consoleErrors.map(error => `browser console error: ${error}`));
  const report = { completed: failures.length === 0, base: BASE, failures, consoleErrors, results };
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    completed: report.completed,
    tested: results.map(result => result.label),
    failures,
    consoleErrors,
    out: OUT,
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
