/**
 * Playwright layout check for iPhone 13 mini viewport (375×812).
 * Forces touch-ui, starts hunt, screenshots HUD + menu panel.
 *
 * Usage: node tests/mobile-iphone-layout.mjs
 * Env: BASE_URL (default http://127.0.0.1:8777), OUT_DIR
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const OUT = process.env.OUT_DIR
  || resolve('/tmp/grok-goal-13814f4b23cd/implementer/mobile-iphone');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8777';

mkdirSync(OUT, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitServer(url, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* retry */ }
    await sleep(300);
  }
  throw new Error(`Server not ready: ${url}`);
}

function box(el) {
  if (!el) return null;
  return el.boundingBox();
}

function overlaps(a, b, pad = 2) {
  if (!a || !b) return false;
  return !(
    a.x + a.width + pad <= b.x
    || b.x + b.width + pad <= a.x
    || a.y + a.height + pad <= b.y
    || b.y + b.height + pad <= a.y
  );
}

function inViewport(b, vw, vh, inset = 0) {
  if (!b) return false;
  return b.x >= -inset
    && b.y >= -inset
    && b.x + b.width <= vw + inset
    && b.y + b.height <= vh + inset;
}

async function main() {
  await waitServer(BASE);
  const browser = await chromium.launch({ headless: true });
  // iPhone 13 mini-ish: Playwright has 'iPhone 13 Mini'
  const device = devices['iPhone 13 Mini'] || devices['iPhone 13'] || {
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  };
  const context = await browser.newContext({
    ...device,
    locale: 'en-US',
  });
  const page = await context.newPage();
  const failures = [];
  const log = [];

  const shot = async (name) => {
    const path = resolve(OUT, name);
    await page.screenshot({ path, fullPage: false });
    log.push(`shot ${name}`);
    return path;
  };

  console.log(`Open ${BASE} as iPhone 13 Mini…`);
  await page.goto(`${BASE}/?autostart=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for title (loading may take a bit for assets)
  await page.waitForFunction(() => {
    const t = document.getElementById('title-screen');
    return t && t.classList.contains('active');
  }, { timeout: 90000 }).catch(() => {});

  await page.evaluate(() => {
    document.body.classList.add('touch-ui');
    const tc = window.__SOL_ARPG_DEMO__?.touchControls;
    if (tc) tc.setEnabled(true);
  });
  await sleep(400);
  await shot('01-title-touch.png');

  // Start hunt
  await page.click('#new-game-btn');
  await page.waitForSelector('#hud:not(.hidden)', { timeout: 20000 });
  await page.evaluate(() => {
    document.body.classList.add('touch-ui');
    window.__SOL_ARPG_DEMO__?.touchControls?.setEnabled(true);
  });
  await sleep(1200);
  await shot('02-hud-play.png');

  const vw = device.viewport.width;
  const vh = device.viewport.height;

  const rects = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el || el.classList.contains('hidden') || getComputedStyle(el).display === 'none') return null;
      const r = el.getBoundingClientRect();
      return { sel, x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      player: pick('.player-card'),
      minimap: pick('.minimap-shell'),
      menu: pick('#touch-menu-btn'),
      stick: pick('#touch-stick-zone'),
      ability: pick('.ability-bar'),
      hunt: pick('.hunt-card'),
      zone: pick('.zone-ribbon'),
      bodyTouch: document.body.classList.contains('touch-ui'),
    };
  });

  log.push(JSON.stringify(rects, null, 2));
  writeFileSync(resolve(OUT, 'layout-rects.json'), JSON.stringify(rects, null, 2));

  if (!rects.bodyTouch) failures.push('body.touch-ui not active');
  if (!rects.stick) failures.push('stick missing');
  if (!rects.ability) failures.push('ability bar missing');
  if (!rects.menu) failures.push('menu button missing');
  if (!rects.minimap) failures.push('minimap missing');
  if (rects.hunt) failures.push('hunt-card should be hidden on mobile');

  // Geometry rules (iPhone mini)
  if (rects.stick && rects.stick.x > vw * 0.45) failures.push('stick not on left half');
  if (rects.ability && rects.ability.x < vw * 0.4) failures.push('ability bar not on right side');
  if (rects.menu && rects.minimap && overlaps(rects.menu, rects.minimap, 4)) {
    failures.push('menu overlaps minimap');
  }
  if (rects.stick && rects.ability && overlaps(rects.stick, rects.ability, 8)) {
    failures.push('stick overlaps ability bar');
  }
  if (rects.player && rects.minimap && overlaps(rects.player, rects.minimap, 4)) {
    failures.push('player card overlaps minimap');
  }
  for (const [name, b] of Object.entries({
    stick: rects.stick,
    ability: rects.ability,
    menu: rects.menu,
    minimap: rects.minimap,
    player: rects.player,
  })) {
    if (b && !inViewport(b, vw, vh, 4)) failures.push(`${name} outside viewport`);
  }

  // Menu panel open + tab/content geometry
  await page.click('#touch-menu-btn');
  await sleep(600);
  const panelOpen = await page.evaluate(() => {
    const p = document.getElementById('panel-layer');
    return p && !p.classList.contains('hidden');
  });
  if (!panelOpen) failures.push('menu button did not open panel');

  const panelGeom = await page.evaluate(() => {
    const header = document.querySelector('.panel-shell > header');
    const nav = document.querySelector('.panel-shell nav');
    const content = document.getElementById('panel-content');
    const skillsBtn = document.querySelector('[data-panel="skills"]');
    const hr = header?.getBoundingClientRect();
    const nr = nav?.getBoundingClientRect();
    const cr = content?.getBoundingClientRect();
    return {
      headerBottom: hr?.bottom ?? 0,
      navBottom: nr?.bottom ?? 0,
      contentTop: cr?.top ?? 0,
      navHeight: nr?.height ?? 0,
      skillsH: skillsBtn?.getBoundingClientRect().height ?? 0,
      contentOverflowsHeader: cr && hr ? cr.top < hr.bottom - 1 : true,
    };
  });
  log.push(`panelGeom ${JSON.stringify(panelGeom)}`);
  if (panelGeom.contentOverflowsHeader) {
    failures.push(`panel content overlaps header (contentTop=${panelGeom.contentTop} headerBottom=${panelGeom.headerBottom})`);
  }
  if (panelGeom.skillsH < 40) failures.push(`skills tab too short for touch (${panelGeom.skillsH})`);

  // Tap Skills tab — title should change
  await page.locator('[data-panel="skills"]').tap().catch(() => page.click('[data-panel="skills"]'));
  await sleep(400);
  const skillsTitle = await page.locator('#panel-title').textContent();
  if (!/skill/i.test(skillsTitle || '')) {
    failures.push(`skills tab click failed, title="${skillsTitle}"`);
  }
  await shot('03-menu-panel.png');

  // System tab
  await page.locator('[data-panel="pause"]').tap().catch(() => page.click('[data-panel="pause"]'));
  await sleep(350);
  const sysTitle = await page.locator('#panel-title').textContent();
  if (!/system/i.test(sysTitle || '')) {
    failures.push(`system tab click failed, title="${sysTitle}"`);
  }
  await shot('03b-menu-system.png');

  // Close and sample ability press (no crash)
  await page.click('#panel-close').catch(() => page.keyboard.press('Escape'));
  await sleep(300);

  // Inject combat toast and assert compact size
  await page.evaluate(() => {
    window.__SOL_ARPG_DEMO__?.ui?.notify('Hunt started · Gareth entered the meadow.', 'loot', 3);
  });
  await sleep(150);
  const noteBox = await page.evaluate(() => {
    const n = document.querySelector('#notifications .notification');
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { w: r.width, h: r.height, font: getComputedStyle(n).fontSize };
  });
  log.push(`notification ${JSON.stringify(noteBox)}`);
  if (!noteBox) failures.push('notification not rendered');
  else {
    if (noteBox.w > 240) failures.push(`notification too wide (${noteBox.w})`);
    if (noteBox.h > 48) failures.push(`notification too tall (${noteBox.h})`);
    if (parseFloat(noteBox.font) > 10) failures.push(`notification font too large (${noteBox.font})`);
  }
  await shot('04-notify-compact.png');

  const atk = page.locator('.ability-slot[data-slot="attack"]');
  if (await atk.count()) {
    await atk.tap().catch(() => atk.click());
    await sleep(200);
  }
  await shot('05-after-attack-tap.png');

  await browser.close();

  const report = {
    device: device.viewport || { width: vw, height: vh },
    base: BASE,
    failures,
    log,
  };
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) {
    console.error(`\n${failures.length} layout failure(s)`);
    process.exit(1);
  }
  console.log(`\nMobile layout OK → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
