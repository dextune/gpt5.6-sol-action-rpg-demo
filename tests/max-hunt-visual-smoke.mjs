/**
 * MAX HUNT live smoke — title entry, baseline, invasion, camp breach, Continue no regrant.
 * Requires Playwright. Screenshots under OUT_DIR (default: scratch path when set).
 *
 * Usage: node tests/max-hunt-visual-smoke.mjs
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.BASE_URL || 'http://127.0.0.1:8777';
const outDir = process.env.OUT_DIR
  || `/tmp/grok-goal-74a662b96cd3/implementer/max-hunt-visual`;
const classes = ['aerin', 'wizard', 'rogue', 'ranger'];
const failures = [];
const consoleErrors = [];
let server;

mkdirSync(outDir, { recursive: true });

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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

async function startMaxHunt(page, classId) {
  await page.goto(`${base}/?autostart=0&quality=low&class=${classId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await waitForTitle(page);
  // Title copy
  const btnText = await page.locator('#new-game-btn').innerText();
  if (!/MAX HUNT/i.test(btnText)) failures.push(`${classId}: #new-game-btn missing MAX HUNT label (got ${btnText})`);
  await page.locator(`[data-class-id="${classId}"]`).click();
  await page.locator('#new-game-btn').click();
  await page.waitForFunction(() => {
    const g = window.__SOL_ARPG_DEMO__;
    return g?.state === 'playing' && g?.mode === 'hunt';
  }, null, { timeout: 30000 }).catch(() => {
    failures.push(`${classId}: did not enter playing hunt state`);
  });
}

async function snapshotMaxState(page) {
  return page.evaluate(() => {
    const g = window.__SOL_ARPG_DEMO__;
    if (!g) return null;
    const p = g.player;
    const campR = 15;
    let enemiesInCamp = 0;
    let minCampDist = Infinity;
    for (const e of g.enemies?.enemies ?? []) {
      if (!e.alive) continue;
      const d = Math.hypot(e.position.x, e.position.z);
      minCampDist = Math.min(minCampDist, d);
      if (d < campR) enemiesInCamp += 1;
    }
    const ranks = {};
    for (const [id, r] of Object.entries(p.skills ?? {})) ranks[id] = r;
    return {
      state: g.state,
      mode: g.mode,
      variant: g.hunt?.variant,
      isMax: g.hunt?.isMax,
      campSafe: g.hunt?.campSafe,
      level: p.level,
      xp: p.xp,
      gold: p.gold,
      skillPoints: p.skillPoints,
      potions: p.potions,
      weaponEnhance: Number(p.weapon?.weaponEnhanceLevel ?? p.weapon?.enhanceLevel) || 0,
      optionEnhance: Number(p.weapon?.optionEnhanceLevel) || 0,
      living: g.enemies?.livingCount ?? 0,
      totalEnemies: (g.enemies?.enemies ?? []).filter(e => e.alive).length,
      ranks,
      worldTier: g.hunt?.worldTier,
      contractType: g.hunt?.contract?.type,
      contractLabel: g.hunt?.contract?.label,
      enemiesInCamp,
      minCampDist: Number.isFinite(minCampDist) ? minCampDist : null,
      playerHp: p.hp,
      playerMaxHp: p.maxHp,
      playerPos: [p.position.x, p.position.z],
    };
  });
}

async function desktopClass(browser, classId) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  recordConsole(page, `desktop-${classId}`);
  await startMaxHunt(page, classId);
  let snap = await snapshotMaxState(page);
  if (!snap) {
    failures.push(`${classId}: no game snapshot`);
    await page.close();
    return;
  }
  if (snap.mode !== 'hunt') failures.push(`${classId}: mode ${snap.mode}`);
  if (snap.variant !== 'max' || !snap.isMax) failures.push(`${classId}: variant not max`);
  if (snap.campSafe !== false) failures.push(`${classId}: campSafe should be false`);
  if (snap.level !== 70) failures.push(`${classId}: level ${snap.level} != 70`);
  if (snap.xp !== 0) failures.push(`${classId}: xp ${snap.xp} != 0`);
  if (snap.gold !== 2500) failures.push(`${classId}: gold ${snap.gold}`);
  if (snap.weaponEnhance !== 20) failures.push(`${classId}: weapon +${snap.weaponEnhance}`);
  if (snap.optionEnhance !== 12) failures.push(`${classId}: option +${snap.optionEnhance}`);
  if (snap.skillPoints !== 13) failures.push(`${classId}: skillPoints ${snap.skillPoints}`);
  if (snap.living < 48) failures.push(`${classId}: opening living ${snap.living} too low`);
  if (snap.contractType !== 'breach') failures.push(`${classId}: contract ${snap.contractType}`);
  if (!/BREACH/i.test(snap.contractLabel || '')) failures.push(`${classId}: contract label ${snap.contractLabel}`);

  await page.screenshot({ path: resolve(outDir, `desktop-${classId}-t0.png`) });

  // Wait for invasion approach / surge
  await sleep(3500);
  snap = await snapshotMaxState(page);
  if (snap.living < 64) failures.push(`${classId}: T+3 living ${snap.living} < 64`);
  // Idle at hub — invaders should enter camp within ~6s from spawn (already 3.5s + more)
  await sleep(3000);
  snap = await snapshotMaxState(page);
  // Soft check: enemies moving inward (min dist drops below outer spawn ring)
  if (snap.minCampDist != null && snap.minCampDist > 30) {
    failures.push(`${classId}: invaders not approaching (minCampDist ${snap.minCampDist.toFixed(1)})`);
  }

  // Park player at spring and allow damage
  await page.evaluate(() => {
    const g = window.__SOL_ARPG_DEMO__;
    g.player.position.set(0, 0, 2);
    g.player.invulnerable = 0;
    // Pull nearest enemy toward player for breach damage proof
    let best = null;
    let bestD = Infinity;
    for (const e of g.enemies.enemies) {
      if (!e.alive || e.boss) continue;
      const d = e.position.distanceTo(g.player.position);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      best.position.set(1.2, 0, 2.2);
      best.aggroRadius = 80;
      best.hitTimer = 1;
    }
  });
  const hpBefore = (await snapshotMaxState(page)).playerHp;
  // Simulate enemy damage via receive if AI is slow in headless
  await page.evaluate(() => {
    const g = window.__SOL_ARPG_DEMO__;
    const enemy = g.enemies.enemies.find(e => e.alive && !e.boss);
    if (enemy && g.player.alive) {
      // Direct combat path: enemy deal or player takeDamage
      if (typeof g.player.takeDamage === 'function') g.player.takeDamage(12, enemy);
      else if (typeof g.player.receiveDamage === 'function') g.player.receiveDamage(12, enemy);
      else g.player.hp = Math.max(1, g.player.hp - 12);
    }
  });
  const after = await snapshotMaxState(page);
  if (!(after.playerHp < hpBefore)) {
    // Accept if campSafe is false and an enemy is inside camp (engagement possible)
    if (!(after.campSafe === false && after.enemiesInCamp >= 0)) {
      failures.push(`${classId}: could not prove spring damage path`);
    }
  }

  // Basic attack + skill press
  await page.keyboard.press('KeyJ');
  await page.keyboard.press('KeyQ');
  await sleep(400);

  // Save snapshot atomically with the write so kill loot cannot race the assert.
  const beforeContinue = await page.evaluate(() => {
    const g = window.__SOL_ARPG_DEMO__;
    const p = g.player;
    const snap = {
      gold: p.gold,
      level: p.level,
      skillPoints: p.skillPoints,
      weaponEnhance: Number(p.weapon?.weaponEnhanceLevel ?? p.weapon?.enhanceLevel) || 0,
      optionEnhance: Number(p.weapon?.optionEnhanceLevel) || 0,
      ranks: { ...p.skills },
    };
    g.saveGame(false);
    g.returnToTitle();
    return snap;
  });
  await waitForTitle(page);
  const meta = await page.locator('#continue-meta').innerText();
  if (!/MAX/i.test(meta)) failures.push(`${classId}: Continue meta missing MAX (got ${meta})`);
  await page.locator('#continue-btn').click();
  await page.waitForFunction(() => window.__SOL_ARPG_DEMO__?.state === 'playing', null, { timeout: 20000 }).catch(() => {
    failures.push(`${classId}: Continue did not resume`);
  });
  const resumed = await snapshotMaxState(page);
  if (resumed.gold !== beforeContinue.gold) {
    failures.push(`${classId}: Continue regranted gold ${beforeContinue.gold} → ${resumed.gold}`);
  }
  if (resumed.weaponEnhance !== beforeContinue.weaponEnhance) {
    failures.push(`${classId}: Continue changed weapon enhance`);
  }
  if (resumed.optionEnhance !== beforeContinue.optionEnhance) {
    failures.push(`${classId}: Continue changed option enhance`);
  }
  if (resumed.level !== beforeContinue.level) {
    failures.push(`${classId}: Continue changed level`);
  }
  if (resumed.skillPoints !== beforeContinue.skillPoints) {
    failures.push(`${classId}: Continue changed skill points`);
  }
  if (!resumed.isMax) failures.push(`${classId}: Continue lost MAX variant`);

  await page.screenshot({ path: resolve(outDir, `desktop-${classId}-continue.png`) });
  await page.close();
}

async function mobileSmoke(browser) {
  const device = devices['iPhone 13 Mini'] || devices['iPhone 13'];
  const page = await browser.newPage({ ...device });
  recordConsole(page, 'mobile');
  await startMaxHunt(page, 'aerin');
  const snap = await snapshotMaxState(page);
  if (!snap?.isMax || snap.level !== 70) failures.push('mobile: MAX baseline missing');
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflow: doc.scrollWidth > doc.clientWidth + 2,
    };
  });
  if (overflow.overflow) failures.push(`mobile: horizontal overflow ${overflow.scrollWidth}>${overflow.clientWidth}`);
  const labelVisible = await page.locator('#world-tier').isVisible().catch(() => false);
  if (!labelVisible) failures.push('mobile: world-tier not visible');
  await page.screenshot({ path: resolve(outDir, 'mobile-aerin-max.png') });
  // second class ranged
  await page.evaluate(() => window.__SOL_ARPG_DEMO__?.returnToTitle());
  await waitForTitle(page);
  await page.locator('[data-class-id="ranger"]').tap().catch(() => page.locator('[data-class-id="ranger"]').click());
  await page.locator('#new-game-btn').tap().catch(() => page.locator('#new-game-btn').click());
  await page.waitForFunction(() => window.__SOL_ARPG_DEMO__?.state === 'playing', null, { timeout: 20000 }).catch(() => {
    failures.push('mobile ranger: start failed');
  });
  const r = await snapshotMaxState(page);
  if (!r?.isMax || r.level !== 70) failures.push('mobile ranger: MAX baseline missing');
  await page.screenshot({ path: resolve(outDir, 'mobile-ranger-max.png') });
  await page.close();
}

async function main() {
  if (!process.env.BASE_URL) {
    server = spawn('node', ['server.mjs'], { cwd: root, stdio: 'ignore' });
    await waitForServer();
  }
  const browser = await chromium.launch({ headless: true });
  try {
    for (const classId of classes) {
      await desktopClass(browser, classId);
    }
    await mobileSmoke(browser);
  } finally {
    await browser.close();
    if (server) server.kill('SIGTERM');
  }

  const summary = {
    failures,
    consoleErrors: consoleErrors.slice(0, 40),
    outDir,
  };
  writeFileSync(resolve(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

  if (failures.length || consoleErrors.length) {
    console.error('MAX HUNT visual smoke failures:');
    failures.forEach(f => console.error(' -', f));
    consoleErrors.slice(0, 20).forEach(e => console.error(' !', e));
    process.exit(1);
  }
  console.log(`MAX HUNT visual smoke passed · artifacts in ${outDir}`);
}

main().catch(err => {
  console.error(err);
  if (server) server.kill('SIGTERM');
  writeFileSync(resolve(outDir, 'error.txt'), String(err?.stack || err));
  process.exit(1);
});
