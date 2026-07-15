/**
 * Rift Rush end-to-end browser regression.
 *
 * Covers every class, active-skill keyboard input, the complete encounter/draft/
 * apex/result loop, reward idempotence, Hunt save isolation, Continue, Defense,
 * Daily determinism, Retry/Next/Title routes, and desktop/narrow layouts.
 *
 * Usage: node tests/rush-browser-smoke.mjs
 * Env: BASE_URL (default http://127.0.0.1:8777), OUT_DIR
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.BASE_URL || 'http://127.0.0.1:8777';
const outDir = process.env.OUT_DIR || `/tmp/sol-arpg-rush-smoke-${Date.now()}`;
const classIds = ['aerin', 'wizard', 'rogue', 'ranger'];
const failures = [];
const consoleErrors = [];
let server;

mkdirSync(outDir, { recursive: true });

const sleep = milliseconds => new Promise(resolveSleep => setTimeout(resolveSleep, milliseconds));

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

function recordErrors(page, label) {
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', error => consoleErrors.push(`${label}: ${error.stack ?? error.message}`));
}

function fail(message) {
  failures.push(message);
}

async function hideDebugHud(page) {
  await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    game.debugVisible = false;
    game.ui?.setDebugVisible?.(false);
  });
}

async function waitForGame(page, predicate, argument, label, timeout = 30000) {
  try {
    await page.waitForFunction(predicate, argument, { timeout });
    return true;
  } catch (error) {
    fail(`${label}: ${error.message}`);
    return false;
  }
}

async function waitForTitle(page, label) {
  return waitForGame(
    page,
    () => window.__gameReady === true && document.querySelector('#title-screen.active'),
    null,
    `${label} title did not become ready`,
    90000,
  );
}

async function waitForRushPhase(page, phase, label, timeout = 30000) {
  return waitForGame(
    page,
    wanted => window.__SOL_ARPG_DEMO__?.mode === 'rush'
      && window.__SOL_ARPG_DEMO__?.rush?.phase === wanted,
    phase,
    `${label} did not reach Rush phase ${phase}`,
    timeout,
  );
}

async function pressAllActives(page, label) {
  const skillRows = await page.evaluate(async () => {
    const game = window.__SOL_ARPG_DEMO__;
    const { getClassActiveSkills } = await import('/js/data/content.js');
    return getClassActiveSkills(game.player.classId).map(skill => ({ id: skill.id, key: skill.key }));
  });
  if (skillRows.length !== 4) fail(`${label}: expected four active skills, got ${skillRows.length}`);
  for (const row of skillRows) {
    await page.evaluate(() => {
      const game = window.__SOL_ARPG_DEMO__;
      game.player.mp = game.player.maxMp;
      game.player.energy = 100;
      game.player.skillCooldowns = {};
    });
    await page.keyboard.press(row.key);
    await sleep(100);
    const activated = await page.evaluate(skillId => {
      const game = window.__SOL_ARPG_DEMO__;
      return Number(game.player.skillCooldowns?.[skillId]) > 0;
    }, row.id);
    if (!activated) fail(`${label}: ${row.key}/${row.id} did not activate from keyboard input`);
  }
}

async function chooseDraft(page, method, label) {
  if (!await waitForRushPhase(page, 'draft', label)) return null;
  const before = await page.evaluate(() => ({
    skillId: window.__SOL_ARPG_DEMO__.rush.draft.skillId,
    gate: window.__SOL_ARPG_DEMO__.rush.draft.gate,
  }));
  if (method === 'keyboard') await page.keyboard.press('Digit2');
  else await page.locator('[data-rush-mutation]').first().click();
  if (!await waitForGame(
    page,
    () => window.__SOL_ARPG_DEMO__?.rush?.phase === 'transition',
    null,
    `${label} draft did not resume combat`,
  )) return null;
  const applied = await page.evaluate(({ skillId, gate }) => {
    const evolution = window.__SOL_ARPG_DEMO__.player.skillEvolution?.[skillId];
    return Boolean(evolution?.[`tier${gate}`]);
  }, before);
  if (!applied) fail(`${label}: mutation was not persisted on the temporary Rush hero`);
  return `${before.skillId}:${before.gate}`;
}

async function completeRush(page, label, { captureApex = false } = {}) {
  if (!await waitForRushPhase(page, 'combat', `${label} Act I`)) return null;
  await page.evaluate(() => window.__SOL_ARPG_DEMO__.rush.debugAdvance());
  const firstDraft = await chooseDraft(page, 'keyboard', `${label} first`);
  if (!firstDraft) return null;

  if (!await waitForRushPhase(page, 'combat', `${label} Act II`)) return null;
  await page.evaluate(() => window.__SOL_ARPG_DEMO__.rush.debugAdvance());
  const secondDraft = await chooseDraft(page, 'pointer', `${label} second`);
  if (!secondDraft) return null;
  if (firstDraft === secondDraft) fail(`${label}: duplicate skill/tier mutation draft appeared`);

  if (!await waitForRushPhase(page, 'apex', `${label} Apex`)) return null;
  if (captureApex) await page.screenshot({ path: resolve(outDir, `${label}-apex.png`) });
  const bossReady = await page.evaluate(() => {
    const rush = window.__SOL_ARPG_DEMO__.rush;
    return Boolean(rush.boss?.alive && rush.boss.rushRunId === rush.runId);
  });
  if (!bossReady) fail(`${label}: authored Rush boss was not alive at the apex`);
  await page.evaluate(() => window.__SOL_ARPG_DEMO__.rush.debugAdvance());
  if (!await waitForRushPhase(page, 'result', `${label} result`)) return null;
  return page.evaluate(() => {
    const result = window.__SOL_ARPG_DEMO__.rush.result;
    return {
      completed: result.completed,
      executed: result.executed,
      breaks: result.breaks,
      score: result.score,
      grade: result.grade.id,
      seed: result.seed,
      trophyIds: result.trophies.map(trophy => trophy.id),
    };
  });
}

async function auditRushLayout(page, label) {
  const layout = await page.evaluate(() => {
    const visibleRect = selector => {
      const element = document.querySelector(selector);
      if (!element || element.classList.contains('hidden') || getComputedStyle(element).display === 'none') return null;
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      overflow: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      hud: visibleRect('#rush-hud'),
      result: visibleRect('#rush-result .rush-result-shell'),
      trophies: [...document.querySelectorAll('[data-rush-trophy]')].map(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      }),
      huntContractHidden: document.querySelector('#contract-card')?.classList.contains('hidden') ?? true,
      forgeHidden: document.querySelector('#combat-forge')?.classList.contains('hidden') ?? true,
    };
  });
  const inside = rect => rect && rect.left >= -2 && rect.top >= -2
    && rect.right <= layout.viewport.width + 2 && rect.bottom <= layout.viewport.height + 2;
  if (!inside(layout.result)) fail(`${label}: result shell is outside the viewport`);
  if (layout.trophies.some(rect => !inside(rect))) fail(`${label}: a trophy card is outside the viewport`);
  if (layout.overflow.width > layout.viewport.width + 1 || layout.overflow.height > layout.viewport.height + 1) {
    fail(`${label}: document overflows the viewport (${layout.overflow.width}x${layout.overflow.height})`);
  }
  if (!layout.huntContractHidden) fail(`${label}: Hunt contract remained visible in Rush`);
  if (!layout.forgeHidden) fail(`${label}: in-combat forge remained visible in Rush`);
}

async function claimFirstTrophy(page, label, huntBefore) {
  const reward = await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    const trophy = game.rush.result.trophies[0];
    return { id: trophy.id, gold: trophy.gold ?? 0, skillPoints: trophy.skillPoints ?? 0 };
  });
  await page.locator('[data-rush-trophy]').first().click();
  await waitForGame(
    page,
    () => Boolean(window.__SOL_ARPG_DEMO__?.rush?.result?.claimed),
    null,
    `${label} trophy claim did not complete`,
  );
  const check = await page.evaluate(({ id, before }) => {
    const game = window.__SOL_ARPG_DEMO__;
    const duplicate = game.claimRushTrophy(id);
    const after = game.save.load();
    return {
      duplicate,
      after,
      claimed: game.rush.result.claimed,
      buttonsEnabled: !document.querySelector('#rush-title-btn').disabled
        && !document.querySelector('#rush-retry-btn').disabled,
      huntStateStable: JSON.stringify({
        level: after.player.level,
        xp: after.player.xp,
        skills: after.player.skills,
        evolution: after.player.skillEvolution,
      }) === JSON.stringify({
        level: before.player.level,
        xp: before.player.xp,
        skills: before.player.skills,
        evolution: before.player.skillEvolution,
      }),
    };
  }, { id: reward.id, before: huntBefore });
  if (check.claimed !== reward.id) fail(`${label}: wrong trophy was recorded`);
  if (check.duplicate?.ok !== false) fail(`${label}: duplicate trophy claim was accepted`);
  if (!check.buttonsEnabled) fail(`${label}: result navigation stayed disabled after claim`);
  if (!check.huntStateStable) fail(`${label}: Rush temporary level/skills leaked into the Hunt save`);
  if (check.after.player.gold !== huntBefore.player.gold + reward.gold) {
    fail(`${label}: Hunt gold reward mismatch`);
  }
  if (check.after.player.skillPoints !== huntBefore.player.skillPoints + reward.skillPoints) {
    fail(`${label}: Hunt skill-point reward mismatch`);
  }
  return { save: check.after, reward };
}

async function mainFlow(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  recordErrors(page, 'main');
  await page.goto(`${base}/?debug=1&autostart=0&quality=low&class=aerin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForTitle(page, 'main initial');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForTitle(page, 'main clean');

  await page.click('#new-game-btn');
  await waitForGame(page, () => window.__SOL_ARPG_DEMO__?.mode === 'hunt' && window.__SOL_ARPG_DEMO__?.state === 'playing', null, 'Hunt setup');
  let huntBefore = await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    game.player.gold = 123;
    game.player.skillPoints = 2;
    game.saveGame(false);
    return game.save.load();
  });
  await page.evaluate(() => window.__SOL_ARPG_DEMO__.returnToTitle());
  await waitForTitle(page, 'before Rush');
  huntBefore = await page.evaluate(() => window.__SOL_ARPG_DEMO__.save.load());
  await page.click('#rush-btn');
  await waitForRushPhase(page, 'combat', 'main launch');

  const launch = await page.evaluate(before => {
    const game = window.__SOL_ARPG_DEMO__;
    const activeRanks = Object.values(game.player.skills).filter(rank => rank === 3).length;
    return {
      classId: game.player.classId,
      level: game.player.level,
      activeRanks,
      saveUnchanged: JSON.stringify(game.save.load()) === JSON.stringify(before),
      rushHudVisible: !document.querySelector('#rush-hud').classList.contains('hidden'),
    };
  }, huntBefore);
  if (launch.classId !== 'aerin' || launch.level !== 80 || launch.activeRanks < 4) fail(`main: temporary hero bootstrap mismatch (${JSON.stringify(launch)})`);
  if (!launch.saveUnchanged) fail('main: entering Rush changed the Hunt save');
  if (!launch.rushHudVisible) fail('main: Rush HUD did not appear');
  const hazards = ['verdant', 'forest', 'canyon', 'frost', 'ember', 'astral'];
  for (const zoneId of hazards) {
    const triggered = await page.evaluate(id => {
      const game = window.__SOL_ARPG_DEMO__;
      game.player.hp = game.player.maxHp;
      return game.rush.debugTriggerHazard(id);
    }, zoneId);
    if (!triggered) fail(`main: ${zoneId} hazard did not trigger in debug validation`);
    await sleep(950);
  }
  await page.evaluate(() => window.__SOL_ARPG_DEMO__.startRush({ classId: 'aerin', seed: 0x51f7a11 }));
  if (!await waitForRushPhase(page, 'combat', 'main post-hazard reset')) {
    await context.close();
    return;
  }
  await pressAllActives(page, 'aerin');
  await hideDebugHud(page);
  await page.screenshot({ path: resolve(outDir, 'desktop-rush-gameplay.png') });

  const firstResult = await completeRush(page, 'desktop-first', { captureApex: true });
  if (!firstResult) {
    await context.close();
    return;
  }
  if (!firstResult.completed || !firstResult.executed || firstResult.breaks < 1 || firstResult.trophyIds.length !== 3) {
    fail(`main: first result lacks completion/Break/execution/trophies (${JSON.stringify(firstResult)})`);
  }
  await auditRushLayout(page, 'desktop result');
  await page.screenshot({ path: resolve(outDir, 'desktop-rush-result.png') });
  let huntCurrent = (await claimFirstTrophy(page, 'first result', huntBefore)).save;

  await page.click('#rush-next-btn');
  await waitForRushPhase(page, 'combat', 'Next Rift');
  const nextSeed = await page.evaluate(() => window.__SOL_ARPG_DEMO__.rush.seed);
  if (nextSeed === firstResult.seed) fail('main: Next Rift reused the completed run seed');
  const secondResult = await completeRush(page, 'desktop-next');
  if (!secondResult) {
    await context.close();
    return;
  }
  huntCurrent = (await claimFirstTrophy(page, 'next result', huntCurrent)).save;

  await page.click('#rush-retry-btn');
  await waitForRushPhase(page, 'combat', 'Retry Rift');
  const retryClass = await page.evaluate(() => window.__SOL_ARPG_DEMO__.player.classId);
  if (retryClass !== 'aerin') fail(`main: Retry changed class to ${retryClass}`);
  if (!await completeRush(page, 'desktop-retry')) {
    await context.close();
    return;
  }
  huntCurrent = (await claimFirstTrophy(page, 'retry result', huntCurrent)).save;
  await page.click('#rush-title-btn');
  await waitForTitle(page, 'result Return to Title');

  const continueButton = page.locator('#continue-btn');
  if (await continueButton.isDisabled()) fail('main: Continue was disabled after Rush');
  else await continueButton.click();
  await waitForGame(page, () => window.__SOL_ARPG_DEMO__?.mode === 'hunt' && window.__SOL_ARPG_DEMO__?.state === 'playing', null, 'Continue after Rush');
  const continued = await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    return { level: game.player.level, gold: game.player.gold, skillPoints: game.player.skillPoints };
  });
  if (continued.level !== huntCurrent.player.level || continued.gold !== huntCurrent.player.gold
    || continued.skillPoints !== huntCurrent.player.skillPoints || continued.level === 80) {
    fail(`main: Continue did not restore the isolated Hunt save (${JSON.stringify(continued)})`);
  }

  await page.evaluate(() => window.__SOL_ARPG_DEMO__.returnToTitle());
  await waitForTitle(page, 'before Defense');
  await page.click('#defense-btn');
  await waitForGame(
    page,
    () => window.__SOL_ARPG_DEMO__?.mode === 'defense'
      && window.__SOL_ARPG_DEMO__?.defense?.phase !== 'idle',
    null,
    'Defense after Rush',
  );
  const defense = await page.evaluate(() => ({
    panel: !document.querySelector('#defense-wave-panel').classList.contains('hidden'),
    level: window.__SOL_ARPG_DEMO__.player.level,
  }));
  if (!defense.panel || defense.level === 80) fail(`main: Defense regression (${JSON.stringify(defense)})`);

  await page.evaluate(() => window.__SOL_ARPG_DEMO__.returnToTitle());
  await waitForTitle(page, 'before Daily');
  const daily = await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    const date = new Date('2026-07-15T12:00:00Z');
    game.startRush({ classId: 'aerin', daily: true, date });
    const first = JSON.stringify(game.rush.plan);
    const firstSeed = game.rush.seed;
    game.returnToTitle();
    game.startRush({ classId: 'aerin', daily: true, date });
    return { samePlan: first === JSON.stringify(game.rush.plan), sameSeed: firstSeed === game.rush.seed };
  });
  if (!daily.samePlan || !daily.sameSeed) fail(`main: Daily Rift was not deterministic (${JSON.stringify(daily)})`);
  await context.close();
}

async function classLaunchFlow(browser) {
  for (const classId of classIds) {
    const contextOptions = classId === 'ranger'
      ? { ...(devices['iPhone 13 Mini'] || devices['iPhone 13']), locale: 'en-US' }
      : { viewport: { width: 1120, height: 720 }, deviceScaleFactor: 1 };
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    recordErrors(page, `class/${classId}`);
    await page.goto(`${base}/?debug=1&autostart=1&mode=rush&quality=low&class=${classId}`, {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await waitForRushPhase(page, 'combat', `class/${classId}`, 90000);
    const state = await page.evaluate(wantedClass => {
      if (matchMedia('(pointer: coarse)').matches) {
        document.body.classList.add('touch-ui');
        window.__SOL_ARPG_DEMO__.touchControls?.setEnabled(true);
      }
      const game = window.__SOL_ARPG_DEMO__;
      return {
        classId: game.player.classId,
        level: game.player.level,
        hud: !document.querySelector('#rush-hud').classList.contains('hidden'),
        mode: game.mode,
        wantedClass,
      };
    }, classId);
    if (state.classId !== classId || state.mode !== 'rush' || state.level !== 80 || !state.hud) {
      fail(`class/${classId}: launch mismatch (${JSON.stringify(state)})`);
    }
    await pressAllActives(page, `class/${classId}`);
    if (classId === 'ranger') {
      await hideDebugHud(page);
      const gameplayLayout = await page.evaluate(() => {
        const rect = selector => {
          const element = document.querySelector(selector);
          if (!element || getComputedStyle(element).display === 'none') return null;
          const box = element.getBoundingClientRect();
          return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
        };
        return {
          viewport: { width: innerWidth, height: innerHeight },
          hud: rect('#rush-hud'),
          ability: rect('.ability-bar'),
          stick: rect('#touch-stick-zone'),
          overflow: document.documentElement.scrollWidth,
        };
      });
      const inside = rect => rect && rect.left >= -3 && rect.top >= -3
        && rect.right <= gameplayLayout.viewport.width + 3 && rect.bottom <= gameplayLayout.viewport.height + 3;
      if (!inside(gameplayLayout.hud) || !inside(gameplayLayout.ability) || !inside(gameplayLayout.stick)
        || gameplayLayout.overflow > gameplayLayout.viewport.width + 1) {
        fail(`class/ranger: narrow gameplay layout escaped viewport (${JSON.stringify(gameplayLayout)})`);
      }
      await page.screenshot({ path: resolve(outDir, 'narrow-rush-gameplay.png') });
      if (!await completeRush(page, 'narrow-ranger')) {
        await context.close();
        continue;
      }
      await auditRushLayout(page, 'narrow result');
      await page.screenshot({ path: resolve(outDir, 'narrow-rush-result.png') });
      const pendingReward = await page.evaluate(() => {
        const trophy = window.__SOL_ARPG_DEMO__.rush.result.trophies[0];
        return { gold: trophy.gold ?? 0, skillPoints: trophy.skillPoints ?? 0 };
      });
      await page.locator('[data-rush-trophy]').first().click();
      await waitForGame(page, () => Boolean(window.__SOL_ARPG_DEMO__?.rush?.result?.claimed), null, 'narrow trophy claim');
      await sleep(120);
      const actionsVisible = await page.evaluate(() => [...document.querySelectorAll('.rush-result-actions button')].every(button => {
        const rect = button.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight;
      }));
      if (!actionsVisible) fail('narrow result: navigation actions were not revealed after trophy claim');
      await page.screenshot({ path: resolve(outDir, 'narrow-rush-result-claimed.png') });
      const pendingConsumed = await page.evaluate(expected => {
        const game = window.__SOL_ARPG_DEMO__;
        const banked = {
          gold: game.rush.meta.pendingGold,
          skillPoints: game.rush.meta.pendingSkillPoints,
        };
        game.returnToTitle();
        game.newGame({ classId: 'ranger' });
        const save = game.save.load();
        return {
          banked,
          mode: game.mode,
          playerGold: game.player.gold,
          playerSkillPoints: game.player.skillPoints,
          savedGold: save?.player?.gold,
          savedSkillPoints: save?.player?.skillPoints,
          pendingGold: game.rush.meta.pendingGold,
          pendingSkillPoints: game.rush.meta.pendingSkillPoints,
          expected,
        };
      }, pendingReward);
      if (pendingConsumed.banked.gold !== pendingReward.gold
        || pendingConsumed.banked.skillPoints !== pendingReward.skillPoints
        || pendingConsumed.mode !== 'hunt'
        || pendingConsumed.playerGold !== pendingReward.gold
        || pendingConsumed.playerSkillPoints !== pendingReward.skillPoints
        || pendingConsumed.savedGold !== pendingReward.gold
        || pendingConsumed.savedSkillPoints !== pendingReward.skillPoints
        || pendingConsumed.pendingGold !== 0 || pendingConsumed.pendingSkillPoints !== 0) {
        fail(`narrow result: pending trophy was not consumed exactly once (${JSON.stringify(pendingConsumed)})`);
      }
    }
    await context.close();
  }
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
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--disable-dev-shm-usage'],
  });
  await mainFlow(browser);
  await classLaunchFlow(browser);
  await browser.close();
} catch (error) {
  fail(error?.stack || String(error));
} finally {
  server?.kill();
}

if (consoleErrors.length) fail(`console errors:\n${consoleErrors.join('\n')}`);
if (failures.length) {
  console.error(`Rift Rush browser smoke failed (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Rift Rush browser smoke passed: full loop, reward isolation, four classes, Hunt/Defense regression, and responsive screenshots at ${outDir}`);
}
