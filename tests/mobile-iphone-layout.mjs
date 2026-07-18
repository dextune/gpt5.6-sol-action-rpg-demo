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
let browserForCleanup = null;
let lastStage = 'bootstrap';
let cleanupInProgress = false;

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
  browserForCleanup = browser;
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
  let intentionalClose = false;

  const checkpoint = (stage, completed = false) => {
    lastStage = stage;
    const report = {
      stage,
      completed,
      device: device.viewport,
      base: BASE,
      failures: [...failures],
      log: [...log],
    };
    writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`[mobile-stage] ${stage}`);
  };
  const ensureConnected = stage => {
    if (page.isClosed()) throw new Error(`Page closed unexpectedly during ${stage}`);
    if (!browser.isConnected()) throw new Error(`Browser disconnected unexpectedly during ${stage}`);
  };
  page.on('close', () => {
    if (!intentionalClose && !cleanupInProgress) checkpoint('unexpected-page-close');
  });
  browser.on('disconnected', () => {
    if (!intentionalClose && !cleanupInProgress) checkpoint('unexpected-browser-disconnect');
  });
  checkpoint('browser-ready');

  const shot = async (name) => {
    const path = resolve(OUT, name);
    await page.screenshot({ path, fullPage: false });
    log.push(`shot ${name}`);
    return path;
  };

  console.log(`Open ${BASE} as iPhone 13 Mini…`);
  checkpoint('01-title-touch:before');
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
  checkpoint('01-title-touch:after');

  // Start hunt
  checkpoint('02-hud-play:before');
  await page.click('#new-game-btn');
  await page.waitForSelector('#hud:not(.hidden)', { timeout: 20000 });
  await page.evaluate(() => {
    document.body.classList.add('touch-ui');
    window.__SOL_ARPG_DEMO__?.touchControls?.setEnabled(true);
  });
  const whirlwindDefinition = await page.evaluate(async () => {
    const { SKILLS } = await import('/js/data/content.js');
    const evolution = SKILLS.whirlwind.evolution;
    window.__MOBILE_TEST_WHIRLWIND_EVOLUTION__ = evolution;
    const game = window.__SOL_ARPG_DEMO__;
    const playerState = game.player.serialize();
    playerState.level = 80;
    playerState.skills = { ...playerState.skills, whirlwind: 10 };
    playerState.skillEvolution = {};
    game.player.load(playerState, game.world);
    game.player.activateShadowFrenzy({ frenzyDuration: 5, frenzyAttackHaste: 0.4, frenzyMoveHaste: 0.35 });
    game.__requestSaveCalls = 0;
    const requestSave = game.requestSave.bind(game);
    game.requestSave = () => {
      game.__requestSaveCalls += 1;
      return requestSave();
    };
    game.ui.update(1);
    return {
      referenceStable: evolution === SKILLS.whirlwind.evolution,
      forms: [20, 60, 100].map(level => ({ level, label: evolution.forms?.[level]?.label ?? '' })),
      tier40: Object.entries(evolution.mutations?.[40] ?? {}).map(([id, value]) => ({ id, label: value.label, summary: value.summary })),
      tier80: Object.entries(evolution.mutations?.[80] ?? {}).map(([id, value]) => ({ id, label: value.label, summary: value.summary })),
    };
  });
  const expectedWhirlwindIdentity = {
    forms: [
      { level: 20, label: 'Crosswind' },
      { level: 60, label: 'Roving Gale' },
      { level: 100, label: 'Sovereign Tempest' },
    ],
    tier40: [
      { id: 'cyclone', label: 'Cyclone', summary: 'Widens gather reach and packs more prey around you.' },
      { id: 'blood_wheel', label: 'Blood Wheel', summary: 'Tightens six fast cuts with bleed cadence.' },
    ],
    tier80: [
      { id: 'storm_cage', label: 'Storm Cage', summary: 'Hard-caps how many foes snap into the ring.' },
      { id: 'giant_slayer', label: 'Giant Slayer', summary: 'Finale pressures and staggers durable prey.' },
    ],
  };
  const matchesExpectedWhirlwind = definition => definition.referenceStable
    && JSON.stringify(definition.forms) === JSON.stringify(expectedWhirlwindIdentity.forms)
    && JSON.stringify(definition.tier40) === JSON.stringify(expectedWhirlwindIdentity.tier40)
    && JSON.stringify(definition.tier80) === JSON.stringify(expectedWhirlwindIdentity.tier80);
  const whirlwindIdentityMatches = matchesExpectedWhirlwind(whirlwindDefinition);
  if (!whirlwindIdentityMatches) {
    failures.push(`shipped Whirlwind identity mismatch before UI test: ${JSON.stringify(whirlwindDefinition)}`);
  }
  const [whirlwindTier40First, whirlwindTier40Second] = whirlwindDefinition.tier40;
  const [whirlwindTier80First, whirlwindTier80Second] = whirlwindDefinition.tier80;
  await sleep(1200);
  await shot('02-hud-play.png');
  checkpoint('02-hud-play:after');
  await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    game.player.__mobilePriorClass = game.player.classId;
    game.player.classId = 'ranger';
    game.player.thornField = { generation: 999, remaining: 5, planted: 2 };
    game.player.predatorVerdict = { generation: 999, remaining: 5, stored: 50, cap: 100, target: { alive: true } };
    const row = document.getElementById('ranger-state-row');
    row?.classList.remove('hidden');
    document.getElementById('thorns-chip')?.classList.remove('hidden');
    document.getElementById('verdict-chip')?.classList.remove('hidden');
  });

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
      frenzy: pick('#frenzy-chip'),
      ranger: pick('#ranger-state-row'),
      thorns: pick('#thorns-chip'),
      verdict: pick('#verdict-chip'),
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
  if (!rects.frenzy) failures.push('FRENZY status chip missing');
  if (!rects.ranger) failures.push('simultaneous THORNS + VERDICT row missing');
  if (!rects.menu) failures.push('menu button missing');
  if (!rects.minimap) failures.push('minimap missing');
  if (!rects.zone) failures.push('zone ribbon missing');
  if (rects.hunt) failures.push('Hunt record should be collapsed by default');

  // Desktop parity: legacy threat text or MAX breach pressure must stay visible on touch-ui.
  const zoneSubtitle = await page.evaluate(() => {
    const el = document.getElementById('zone-subtitle');
    if (!el) return { missing: true };
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      text: (el.textContent || '').trim(),
      display: style.display,
      visibility: style.visibility,
      width: rect.width,
      height: rect.height,
    };
  });
  if (zoneSubtitle.missing) failures.push('zone-subtitle element missing');
  else if (zoneSubtitle.display === 'none' || zoneSubtitle.visibility === 'hidden' || zoneSubtitle.height < 2) {
    failures.push(`zone-subtitle not visible on mobile (${JSON.stringify(zoneSubtitle)})`);
  } else if (!/Lv\.|On-level|Safe|Danger|Lethal|Challenging|WAVE|VILLAGE BREACH|HOSTILES/i.test(zoneSubtitle.text)) {
    failures.push(`zone-subtitle missing threat/breach text: "${zoneSubtitle.text}"`);
  }

  const goldRow = await page.evaluate(() => {
    const el = document.querySelector('.profile-gold-row');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      display: style.display,
      width: r.width,
      height: r.height,
      text: (document.getElementById('gold-count')?.textContent || '').trim(),
    };
  });
  if (!goldRow || goldRow.display === 'none' || goldRow.height < 2) {
    failures.push('profile gold row not visible on mobile');
  }

  await page.click('#profile-toggle');
  await sleep(80);
  const huntToggle = await page.evaluate(() => {
    const pick = selector => {
      const node = document.querySelector(selector);
      if (!node || getComputedStyle(node).display === 'none') return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const visible = selector => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    };
    return {
      expanded: document.getElementById('profile-toggle')?.getAttribute('aria-expanded'),
      player: pick('.player-card'),
      hunt: pick('.hunt-card'),
      weapon: pick('#combat-weapon-enhance'),
      option: pick('#combat-option-enhance'),
      contract: visible('#contract-title'),
      bossCharge: visible('#boss-charge-text') || visible('.boss-charge-row'),
    };
  });
  if (huntToggle.expanded !== 'true' || !huntToggle.hunt) failures.push('profile click did not expand Hunt record');
  if (!huntToggle.weapon || !huntToggle.option) failures.push('WPN/OPT buttons disappeared while Hunt record was expanded');
  if (!huntToggle.contract) failures.push('contract not visible when Hunt record expanded (desktop parity)');
  if (!huntToggle.bossCharge) failures.push('boss presence not visible when Hunt record expanded');
  if (huntToggle.hunt && huntToggle.player
    && (huntToggle.hunt.x < huntToggle.player.x - 1 || huntToggle.hunt.y < huntToggle.player.y - 1
      || huntToggle.hunt.x + huntToggle.hunt.width > huntToggle.player.x + huntToggle.player.width + 1
      || huntToggle.hunt.y + huntToggle.hunt.height > huntToggle.player.y + huntToggle.player.height + 1)) {
    failures.push('expanded Hunt record is not contained by merged player profile');
  }
  await page.click('#profile-toggle');
  await sleep(80);
  const huntCollapsed = await page.evaluate(() => ({
    expanded: document.getElementById('profile-toggle')?.getAttribute('aria-expanded'),
    hidden: getComputedStyle(document.getElementById('hunt-record-panel')).display === 'none',
    weaponVisible: getComputedStyle(document.getElementById('combat-weapon-enhance')).display !== 'none',
    optionVisible: getComputedStyle(document.getElementById('combat-option-enhance')).display !== 'none',
  }));
  if (huntCollapsed.expanded !== 'false' || !huntCollapsed.hidden) failures.push('second profile click did not collapse Hunt record');
  if (!huntCollapsed.weaponVisible || !huntCollapsed.optionVisible) failures.push('WPN/OPT buttons disappeared after Hunt record collapsed');

  // Geometry rules (iPhone mini)
  if (rects.stick && rects.stick.x > vw * 0.45) failures.push('stick not on left half');
  if (rects.ability && rects.ability.x < vw * 0.4) failures.push('ability bar not on right side');
  if (rects.menu && rects.minimap && overlaps(rects.menu, rects.minimap, 4)) {
    failures.push('menu overlaps minimap');
  }
  if (rects.stick && rects.ability && overlaps(rects.stick, rects.ability, 8)) {
    failures.push('stick overlaps ability bar');
  }
  if (rects.frenzy && rects.ability) {
    if (overlaps(rects.frenzy, rects.ability, 2)) failures.push('FRENZY status chip overlaps ability bar');
    if (rects.frenzy.y + rects.frenzy.height > rects.ability.y + 1) failures.push('FRENZY status chip is not above ability bar');
  }
  if (rects.ranger && rects.ability && overlaps(rects.ranger, rects.ability, 2)) failures.push('Ranger state row overlaps ability bar');
  if (rects.ranger && rects.stick && overlaps(rects.ranger, rects.stick, 2)) failures.push('Ranger state row overlaps joystick');
  if (rects.ranger && rects.frenzy && overlaps(rects.ranger, rects.frenzy, 2)) failures.push('Ranger state row overlaps FRENZY');
  if (rects.thorns && rects.verdict && overlaps(rects.thorns, rects.verdict, 0)) failures.push('THORNS overlaps VERDICT');
  if (rects.frenzy && rects.player && overlaps(rects.frenzy, rects.player, 4)) {
    failures.push('FRENZY status chip overlaps player portrait');
  }
  if (rects.player && rects.minimap && overlaps(rects.player, rects.minimap, 4)) {
    failures.push('player card overlaps minimap');
  }
  for (const [name, b] of Object.entries({
    stick: rects.stick,
    ability: rects.ability,
    frenzy: rects.frenzy,
    ranger: rects.ranger,
    menu: rects.menu,
    minimap: rects.minimap,
    player: rects.player,
  })) {
    if (b && !inViewport(b, vw, vh, 4)) failures.push(`${name} outside viewport`);
  }
  await page.setViewportSize({ width: 812, height: 375 });
  await sleep(150);
  const landscape = await page.evaluate(() => {
    const box = id => { const r = document.getElementById(id)?.getBoundingClientRect(); return r ? { x:r.x,y:r.y,width:r.width,height:r.height } : null; };
    return { ranger: box('ranger-state-row'), thorns: box('thorns-chip'), verdict: box('verdict-chip'), frenzy: box('frenzy-chip'), stick: box('touch-stick-zone'), ability: document.querySelector('.ability-bar') ? (() => { const r=document.querySelector('.ability-bar').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })() : null };
  });
  log.push(`rangerLandscape ${JSON.stringify(landscape)}`);
  if (!landscape.ranger || !inViewport(landscape.ranger, 812, 375, 4)) failures.push('Ranger state row outside landscape viewport');
  if (landscape.ranger && landscape.stick && overlaps(landscape.ranger, landscape.stick, 2)) failures.push('Ranger row overlaps landscape joystick');
  if (landscape.ranger && landscape.ability && overlaps(landscape.ranger, landscape.ability, 2)) failures.push('Ranger row overlaps landscape ability bar');
  if (landscape.ranger && landscape.frenzy && overlaps(landscape.ranger, landscape.frenzy, 2)) failures.push('Ranger row overlaps landscape FRENZY');
  if (landscape.thorns && landscape.verdict && overlaps(landscape.thorns, landscape.verdict, 0)) failures.push('landscape THORNS overlaps VERDICT');
  await shot('02b-ranger-landscape.png');
  await page.setViewportSize({ width: vw, height: vh });
  await sleep(150);
  await page.evaluate(() => {
    const player = window.__SOL_ARPG_DEMO__?.player;
    if (!player) return;
    player.classId = player.__mobilePriorClass;
    player.thornField = null; player.predatorVerdict = null;
  });
  await sleep(100);

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
  const skillCardCount = await page.locator('.skill-card').count();
  if (!/skill|art|instinct/i.test(skillsTitle || '') || skillCardCount === 0) {
    failures.push(`skills tab click failed, title="${skillsTitle}"`);
  }
  const skillLayout = await page.evaluate(async () => {
    const { SKILLS } = await import('./js/data/content.js');
    const content = document.getElementById('panel-content');
    const banner = document.querySelector('.skill-points-banner');
    const cards = [...document.querySelectorAll('.skill-card')];
    const mutationButtons = [...document.querySelectorAll('.mutation-options button')];
    const br = banner?.getBoundingClientRect();
    const cr = content?.getBoundingClientRect();
    return {
      bannerInside: Boolean(br && cr && br.left >= cr.left - 1 && br.right <= cr.right + 1),
      cardsOverflow: cards.some(card => card.scrollWidth > card.clientWidth + 1),
      mutationTargetsSmall: mutationButtons.some(button => button.getBoundingClientRect().height < 44),
      productionDebugControls: document.querySelectorAll('.skill-debug').length,
      currentSummary: document.querySelector('.skill-card .current-summary')?.textContent?.trim() ?? '',
      nextSummary: document.querySelector('.skill-card .next-summary')?.textContent?.trim() ?? '',
      whirlwindCard: [...document.querySelectorAll('.skill-card')]
        .find(card => {
          const title = card.querySelector('h4')?.textContent ?? '';
          return title.includes('Vortex Call') || title.includes('Whirlwind');
        })?.textContent?.trim() ?? '',
      vanguardName: SKILLS.skyfall.name,
      vanguardCard: [...document.querySelectorAll('.skill-card')]
        .find(card => card.querySelector('h4')?.textContent?.includes(SKILLS.skyfall.name))?.textContent?.trim() ?? '',
    };
  });
  log.push(`skillLayout ${JSON.stringify(skillLayout)}`);
  if (!skillLayout.bannerInside) failures.push('skill points banner overflows 375px panel');
  if (skillLayout.cardsOverflow) failures.push('skill card content overflows horizontally');
  if (skillLayout.mutationTargetsSmall) failures.push('mutation touch target is below 44px');
  if (skillLayout.productionDebugControls) failures.push('debug skill controls exposed without ?debug=1');
  if (!skillLayout.currentSummary || !skillLayout.nextSummary || !skillLayout.nextSummary.includes('→')) {
    failures.push(`resolved current/next summaries missing: ${JSON.stringify(skillLayout)}`);
  }
  for (const label of [
    'Roving Gale', 'Sovereign Tempest',
    whirlwindTier40First.label, whirlwindTier40Second.label,
    whirlwindTier80First.label, whirlwindTier80Second.label,
  ]) {
    if (!skillLayout.whirlwindCard.includes(label)) {
      failures.push(`shipped Whirlwind card is missing ${label}: ${skillLayout.whirlwindCard}`);
    }
  }
  if (!skillLayout.vanguardCard.includes('Damage')
    || !skillLayout.vanguardCard.includes('Radius')
    || !skillLayout.vanguardCard.includes('Armor Pierce')) {
    failures.push(`shipped ${skillLayout.vanguardName} card is missing combat labels: ${skillLayout.vanguardCard}`);
  }
  const fallbackPressed = await page.locator(
    `button[data-action="select-mutation"][data-skill="whirlwind"][data-milestone="40"][data-choice="${whirlwindTier40First.id}"]`,
  ).getAttribute('aria-pressed');
  if (fallbackPressed !== 'true') {
    failures.push(`resolver fallback ${whirlwindTier40First.id} aria state is ${fallbackPressed}`);
  }
  await page.locator(
    `button[data-action="select-mutation"][data-skill="whirlwind"][data-milestone="40"][data-choice="${whirlwindTier40Second.id}"]`,
  ).tap();
  await sleep(150);
  const persistence = await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    const saveKey = 'gpt5.6-sol-arpg-demo-v1';
    const requestSaveCalls = game.__requestSaveCalls;
    const selected = game.player.skillEvolution.whirlwind?.tier40;
    game.saveGame(false);
    const huntRaw = localStorage.getItem(saveKey);
    const parsed = JSON.parse(huntRaw);
    const savedChoice = parsed.player.skillEvolution.whirlwind?.tier40;
    return { requestSaveCalls, selected, savedChoice, hasSave: Boolean(huntRaw) };
  });
  log.push(`mutationPersistence ${JSON.stringify(persistence)}`);
  if (persistence.requestSaveCalls < 1) failures.push('mutation UI did not call requestSave');
  if (!persistence.hasSave
    || persistence.selected !== whirlwindTier40Second.id
    || persistence.savedChoice !== whirlwindTier40Second.id) {
    failures.push(`mutation Hunt persistence failed: ${JSON.stringify(persistence)}`);
  }
  const preReloadGuard = await page.evaluate(async ({ secondId }) => {
    const { SKILLS } = await import('/js/data/content.js');
    const evolution = SKILLS.whirlwind.evolution;
    const game = window.__SOL_ARPG_DEMO__;
    game.ui.update(1);
    const selectedButton = document.querySelector(
      `button[data-action="select-mutation"][data-skill="whirlwind"][data-milestone="40"][data-choice="${secondId}"]`,
    );
    const skillSlot = document.querySelector('.ability-slot[data-skill-id="whirlwind"]');
    return {
      referenceStable: evolution === window.__MOBILE_TEST_WHIRLWIND_EVOLUTION__,
      forms: [20, 60, 100].map(level => ({ level, label: evolution.forms?.[level]?.label ?? '' })),
      tier40: Object.entries(evolution.mutations?.[40] ?? {}).map(([id, value]) => ({ id, label: value.label, summary: value.summary })),
      tier80: Object.entries(evolution.mutations?.[80] ?? {}).map(([id, value]) => ({ id, label: value.label, summary: value.summary })),
      secondPressed: selectedButton?.getAttribute('aria-pressed') ?? null,
      hudBadgeTitle: skillSlot?.querySelector('[data-mutation-tier="40"]')?.title ?? '',
    };
  }, { secondId: whirlwindTier40Second.id });
  if (!matchesExpectedWhirlwind(preReloadGuard)) {
    failures.push(`Whirlwind module identity changed before reload: ${JSON.stringify(preReloadGuard)}`);
  }
  if (preReloadGuard.secondPressed !== 'true'
    || preReloadGuard.hudBadgeTitle !== `Level 40 mutation: ${whirlwindTier40Second.label}. ${whirlwindTier40Second.summary}`) {
    failures.push(`real Whirlwind respec did not render: ${JSON.stringify(preReloadGuard)}`);
  }
  const finalCardInside = await page.evaluate(() => {
    const content = document.getElementById('panel-content');
    const cards = [...document.querySelectorAll('.skill-card')];
    const card = cards.at(-1);
    card?.scrollIntoView({ block: 'end' });
    const cr = content?.getBoundingClientRect();
    const r = card?.getBoundingClientRect();
    return Boolean(cr && r && r.left >= cr.left - 1 && r.right <= cr.right + 1 && r.bottom <= cr.bottom + 1);
  });
  if (!finalCardInside) failures.push('final skill card cannot be scrolled fully into the mobile panel');
  checkpoint('03-menu-panel:before');
  await shot('03-menu-panel.png');
  checkpoint('03-menu-panel:after');

  // System tab
  checkpoint('03b-menu-system:before');
  await Promise.race([
    page.evaluate(() => window.__SOL_ARPG_DEMO__?.ui?.openPanel('pause')),
    new Promise((_, reject) => setTimeout(() => reject(new Error('ui.openPanel(pause) timed out')), 5000)),
  ]);
  await page.waitForFunction(
    () => /^System$/i.test(document.getElementById('panel-title')?.textContent?.trim() ?? ''),
    null,
    { timeout: 5000 },
  );
  const sysTitle = await page.locator('#panel-title').textContent();
  if (!/system/i.test(sysTitle || '')) {
    failures.push(`system tab click failed, title="${sysTitle}"`);
  }
  await shot('03b-menu-system.png');
  checkpoint('03b-menu-system:after');

  // Core persistence runs before legacy notification/attack checks.
  checkpoint('reload-continue:before');
  ensureConnected('reload-continue:before');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  ensureConnected('reload-continue:after-reload');
  await page.waitForFunction(
    () => document.getElementById('title-screen')?.classList.contains('active'),
    null,
    { timeout: 90000 },
  );
  const freshWhirlwindDefinition = await page.evaluate(async () => {
    const firstModule = await import('/js/data/content.js');
    const secondModule = await import('/js/data/content.js');
    const evolution = firstModule.SKILLS.whirlwind.evolution;
    window.__MOBILE_TEST_WHIRLWIND_EVOLUTION__ = evolution;
    return {
      referenceStable: evolution === secondModule.SKILLS.whirlwind.evolution,
      forms: [20, 60, 100].map(level => ({ level, label: evolution.forms?.[level]?.label ?? '' })),
      tier40: Object.entries(evolution.mutations?.[40] ?? {}).map(([id, value]) => ({ id, label: value.label, summary: value.summary })),
      tier80: Object.entries(evolution.mutations?.[80] ?? {}).map(([id, value]) => ({ id, label: value.label, summary: value.summary })),
    };
  });
  if (!matchesExpectedWhirlwind(freshWhirlwindDefinition)) {
    failures.push(`fresh shipped Whirlwind identity mismatch after reload: ${JSON.stringify(freshWhirlwindDefinition)}`);
  }
  await page.click('#continue-btn', { timeout: 10000 });
  await page.waitForFunction(() => {
    const game = window.__SOL_ARPG_DEMO__;
    return game?.state === 'playing' && game?.mode === 'hunt';
  }, null, { timeout: 30000 });
  const reloadPersistence = await page.evaluate(({ firstId }) => {
    const game = window.__SOL_ARPG_DEMO__;
    const saveKey = 'gpt5.6-sol-arpg-demo-v1';
    const continuedChoice = game.player.skillEvolution.whirlwind?.tier40;
    game.ui.update(1);
    const continuedBadgeTitle = document.querySelector(
      '.ability-slot[data-skill-id="whirlwind"] [data-mutation-tier="40"]',
    )?.title ?? '';
    const huntRaw = localStorage.getItem(saveKey);
    const saved = game.save.load();
    const oldPlayer = { ...saved.player };
    delete oldPlayer.skillEvolution;
    game.player.load(oldPlayer, game.world);
    const oldSaveEmpty = Object.keys(game.player.skillEvolution).length === 0;
    game.player.load(saved.player, game.world);
    game.mode = 'defense';
    game.player.setSkillMutation('whirlwind', 40, firstId);
    game.requestSave();
    const defenseSaveResult = game.saveGame(false);
    const defenseRaw = localStorage.getItem(saveKey);
    game.mode = 'hunt';
    return {
      continuedChoice,
      continuedBadgeTitle,
      oldSaveEmpty,
      defenseSaveResult,
      defenseUnchanged: huntRaw === defenseRaw,
    };
  }, { firstId: whirlwindTier40First.id });
  log.push(`reloadPersistence ${JSON.stringify(reloadPersistence)}`);
  if (reloadPersistence.continuedChoice !== whirlwindTier40Second.id
    || reloadPersistence.continuedBadgeTitle !== `Level 40 mutation: ${whirlwindTier40Second.label}. ${whirlwindTier40Second.summary}`) {
    failures.push(`Continue did not restore real tier40 ${whirlwindTier40Second.id}: ${JSON.stringify(reloadPersistence)}`);
  }
  if (!reloadPersistence.oldSaveEmpty) failures.push('old save omission did not load as empty mutation state');
  if (reloadPersistence.defenseSaveResult !== false || !reloadPersistence.defenseUnchanged) {
    failures.push('Defense mutation selection changed the Hunt save blob');
  }
  checkpoint('reload-continue:after');
  ensureConnected('reload-continue:after');

  // Reload closes the old panel. Explicitly verify UI close remains bounded and deterministic.
  checkpoint('panel-close:before');
  await Promise.race([
    page.evaluate(() => window.__SOL_ARPG_DEMO__?.ui?.closePanel()),
    new Promise((_, reject) => setTimeout(() => reject(new Error('ui.closePanel timed out')), 5000)),
  ]);
  await page.waitForFunction(
    () => document.getElementById('panel-layer')?.classList.contains('hidden'),
    null,
    { timeout: 5000 },
  );
  checkpoint('panel-close:after');

  // Inject combat toast and assert compact size
  checkpoint('04-notify-compact:before');
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
  checkpoint('04-notify-compact:after');

  checkpoint('05-after-attack-tap:before');
  const atk = page.locator('.ability-slot[data-slot="attack"]');
  if (await atk.count()) {
    await atk.tap().catch(() => atk.click());
    await sleep(200);
  }
  await shot('05-after-attack-tap.png');
  checkpoint('05-after-attack-tap:after');

  intentionalClose = true;
  await browser.close();
  browserForCleanup = null;

  const report = {
    stage: 'complete',
    completed: true,
    device: device.viewport || { width: vw, height: vh },
    base: BASE,
    failures,
    log,
  };
  lastStage = 'complete';
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) {
    console.error(`\n${failures.length} layout failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nMobile layout OK → ${OUT}`);
}

try {
  await main();
} catch (error) {
  cleanupInProgress = true;
  await browserForCleanup?.close().catch(() => {});
  const report = {
    stage: lastStage,
    completed: false,
    base: BASE,
    failures: [`Unhandled mobile test error: ${error?.stack ?? error}`],
    log: [],
  };
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}
