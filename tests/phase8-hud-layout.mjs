/**
 * Phase 8 combat HUD regression: evolved skill badges, class-state chips,
 * stable Q/E/R/C touch bindings, and portrait/landscape/desktop geometry.
 *
 * Usage: node tests/phase8-hud-layout.mjs
 * Env: BASE_URL (default http://127.0.0.1:8777), OUT_DIR
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT_DIR || resolve('/tmp/sol-arpg-phase8-hud');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8777';
const failures = [];
const log = [];
const consoleErrors = [];
mkdirSync(OUT, { recursive: true });

function sleep(ms) { return new Promise(resolveSleep => setTimeout(resolveSleep, ms)); }

async function waitServer(url, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error(`Server not ready: ${url}`);
}

function overlaps(a, b, pad = 0) {
  if (!a || !b) return false;
  return !(a.right + pad <= b.left || b.right + pad <= a.left
    || a.bottom + pad <= b.top || b.bottom + pad <= a.top);
}

function inViewport(rect, width, height, inset = 0) {
  return Boolean(rect && rect.left >= -inset && rect.top >= -inset
    && rect.right <= width + inset && rect.bottom <= height + inset);
}

async function startHunt(page, touch = false) {
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => consoleErrors.push(error.stack ?? error.message));
  await page.goto(`${BASE}/?debug=1&autostart=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => document.getElementById('title-screen')?.classList.contains('active'),
    null,
    { timeout: 90000 },
  );
  if (touch) {
    await page.evaluate(() => {
      document.body.classList.add('touch-ui');
      window.__SOL_ARPG_DEMO__?.touchControls?.setEnabled(true);
    });
  }
  await page.click('#new-game-btn');
  await page.waitForSelector('#hud:not(.hidden)', { timeout: 30000 });
  if (touch) {
    await page.evaluate(() => {
      document.body.classList.add('touch-ui');
      window.__SOL_ARPG_DEMO__?.touchControls?.setEnabled(true);
    });
  }
  await sleep(200);
}

async function configureApex(page, classId) {
  const expected = await page.evaluate(async nextClassId => {
    const game = window.__SOL_ARPG_DEMO__;
    const { getClassActiveSkills } = await import('/js/data/content.js');
    if (!game?.debugEnabled || !game.debugSetSkillState({ classId: nextClassId, level: 100, rank: 10 })) {
      throw new Error(`debugSetSkillState failed for ${nextClassId}`);
    }
    const skills = getClassActiveSkills(nextClassId);
    const result = [];
    for (const skill of skills) {
      const tier40 = Object.keys(skill.evolution?.mutations?.[40] ?? {}).at(-1);
      const tier80 = Object.keys(skill.evolution?.mutations?.[80] ?? {}).at(-1);
      if (tier40) game.player.setSkillMutation(skill.id, 40, tier40);
      if (tier80) game.player.setSkillMutation(skill.id, 80, tier80);
      result.push({
        id: skill.id,
        key: skill.key,
        form: skill.evolution?.forms?.[100]?.label ?? '',
        mutation40: skill.evolution?.mutations?.[40]?.[tier40]?.label ?? '',
        summary40: skill.evolution?.mutations?.[40]?.[tier40]?.summary ?? '',
        icon40: skill.evolution?.mutations?.[40]?.[tier40]?.icon ?? '',
        mutation80: skill.evolution?.mutations?.[80]?.[tier80]?.label ?? '',
        summary80: skill.evolution?.mutations?.[80]?.[tier80]?.summary ?? '',
        icon80: skill.evolution?.mutations?.[80]?.[tier80]?.icon ?? '',
      });
    }
    game.ui.update(1);
    return result;
  }, classId);
  await sleep(160);
  return expected;
}

async function readSkillSlots(page) {
  return page.evaluate(() => [...document.querySelectorAll('.ability-slot[data-key]')].map(slot => {
    const rect = slot.getBoundingClientRect();
    const tier = slot.querySelector('.skill-tier-badge');
    const mutationBadges = [...slot.querySelectorAll('.skill-mutation-badges em')]
      .filter(badge => getComputedStyle(badge).display !== 'none')
      .map(badge => {
        const badgeRect = badge.getBoundingClientRect();
        return {
          text: badge.textContent.trim(),
          title: badge.title,
          aria: badge.getAttribute('aria-label'),
          icon: badge.dataset.icon,
          rect: { left: badgeRect.left, top: badgeRect.top, right: badgeRect.right, bottom: badgeRect.bottom },
          overflowMode: getComputedStyle(badge).textOverflow,
        };
      });
    return {
      key: slot.dataset.key,
      stableSlot: slot.dataset.slot,
      skillId: slot.dataset.skillId,
      rank: slot.dataset.skillRank,
      formTier: slot.dataset.formTier,
      tierText: tier?.textContent?.trim() ?? '',
      tierHidden: !tier || getComputedStyle(tier).display === 'none',
      apexClass: slot.classList.contains('evolution-tier-apex'),
      aria: slot.getAttribute('aria-label') ?? '',
      title: slot.title,
      locked: slot.classList.contains('locked'),
      mutationBadges,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
    };
  }));
}

async function auditOrbVitals(page) {
  const values = await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    game.player.hp = game.player.maxHp * .5;
    game.player.mp = game.player.maxMp * .25;
    game.ui.update(1);
    return {
      hpTransform: document.getElementById('hp-fill').style.transform,
      mpTransform: document.getElementById('mp-fill').style.transform,
      mobileHpTransform: document.getElementById('mobile-hp-fill').style.transform,
      mobileMpTransform: document.getElementById('mobile-mp-fill').style.transform,
      mobileVitalsVisible: getComputedStyle(document.querySelector('.mobile-profile-vitals')).display !== 'none',
      mobileVitalsText: document.querySelector('.mobile-profile-vitals').textContent.trim(),
      desktopOrbsVisible: getComputedStyle(document.querySelector('.combat-vitals-health')).display !== 'none',
      orbTextCount: document.querySelectorAll('.vital-orb small, .vital-orb b').length,
      curvedGaugeCount: document.querySelectorAll('.character-vitals-overlay, .character-gauge, #hp-arc-fill, #mp-arc-fill, #energy-fill').length,
    };
  });
  if (values.hpTransform !== 'scaleY(0.5)' || values.mpTransform !== 'scaleY(0.25)') failures.push(`orb liquid ratios mismatch: ${JSON.stringify(values)}`);
  if (values.mobileHpTransform !== 'scaleX(0.5)' || values.mobileMpTransform !== 'scaleX(0.25)') failures.push(`mobile profile gauge ratios mismatch: ${JSON.stringify(values)}`);
  if (!values.mobileVitalsVisible || values.desktopOrbsVisible) failures.push(`mobile vitals presentation mismatch: ${JSON.stringify(values)}`);
  if (values.mobileVitalsText) failures.push(`mobile HP/MP gauges still contain text: ${JSON.stringify(values)}`);
  if (values.orbTextCount !== 0) failures.push(`text remains inside the 3D orbs: ${JSON.stringify(values)}`);
  if (values.curvedGaugeCount !== 0) failures.push(`curved gauges remain: ${JSON.stringify(values)}`);
  log.push(`orb vitals ${JSON.stringify(values)}`);
}

function assertApexSlots(classId, expected, actual) {
  if (actual.length !== 4) failures.push(`${classId}: expected four skill slots, got ${actual.length}`);
  for (const skill of expected) {
    const slot = actual.find(candidate => candidate.key === skill.key);
    if (!slot) {
      failures.push(`${classId}: missing ${skill.key} slot`);
      continue;
    }
    const stable = `skill-${skill.key.toLowerCase()}`;
    if (slot.stableSlot !== stable) failures.push(`${classId} ${skill.key}: data-slot changed to ${slot.stableSlot}`);
    if (slot.skillId !== skill.id) failures.push(`${classId} ${skill.key}: bound ${slot.skillId}, expected ${skill.id}`);
    if (slot.rank !== '10') failures.push(`${classId} ${skill.key}: cached rank is ${slot.rank}`);
    if (slot.locked || slot.tierHidden || !slot.apexClass || slot.formTier !== 'APEX' || slot.tierText !== 'APEX') {
      failures.push(`${classId} ${skill.key}: Apex tier presentation incomplete`);
    }
    if (slot.mutationBadges.length !== 2) failures.push(`${classId} ${skill.key}: expected two mutation badges`);
    for (const [index, label] of [skill.mutation40, skill.mutation80].entries()) {
      const gate = index === 0 ? 40 : 80;
      const summary = index === 0 ? skill.summary40 : skill.summary80;
      const icon = index === 0 ? skill.icon40 : skill.icon80;
      const badge = slot.mutationBadges[index];
      if (!badge?.text) failures.push(`${classId} ${skill.key}: Lv${gate} short badge is blank`);
      if (badge?.icon !== icon) failures.push(`${classId} ${skill.key}: Lv${gate} data-icon mismatch`);
      if (badge?.title !== `Level ${gate} mutation: ${label}. ${summary}`
        || badge?.aria !== `Level ${gate} mutation: ${label}. ${summary}`) {
        failures.push(`${classId} ${skill.key}: Lv${gate} full mutation title/aria mismatch`);
      }
      if (badge?.overflowMode !== 'ellipsis') failures.push(`${classId} ${skill.key}: mutation badge lacks ellipsis containment`);
      if (badge && !inViewport(badge.rect, 10000, 10000)
        || badge && (badge.rect.left < slot.rect.left - .5 || badge.rect.right > slot.rect.right + .5
          || badge.rect.top < slot.rect.top - .5 || badge.rect.bottom > slot.rect.bottom + .5)) {
        failures.push(`${classId} ${skill.key}: mutation badge escapes slot bounds`);
      }
    }
    if (!slot.aria.includes(skill.form) || !slot.aria.includes(skill.mutation40) || !slot.aria.includes(skill.mutation80)) {
      failures.push(`${classId} ${skill.key}: slot aria omits full form/mutation labels`);
    }
  }
}

async function auditAllMutationIcons(page, classId, viewportName) {
  const audit = await page.evaluate(async nextClassId => {
    const game = window.__SOL_ARPG_DEMO__;
    const { getClassActiveSkills } = await import('/js/data/content.js');
    const issues = [];
    const seen = [];
    game.debugSetSkillState({ classId: nextClassId, level: 100, rank: 10 });
    const skills = getClassActiveSkills(nextClassId);
    for (const skill of skills) {
      for (const gate of [40, 80]) {
        for (const [choice, option] of Object.entries(skill.evolution.mutations[gate])) {
          game.player.setSkillMutation(skill.id, gate, choice);
          game.ui.update(1);
          const slot = document.querySelector(`.ability-slot[data-key="${skill.key}"]`);
          const badge = slot?.querySelector(`[data-mutation-tier="${gate}"]`);
          const expectedText = `Level ${gate} mutation: ${option.label}. ${option.summary}`;
          if (!badge || !badge.textContent.trim() || badge.dataset.icon !== option.icon
            || badge.title !== expectedText || badge.getAttribute('aria-label') !== expectedText) {
            issues.push(`HUD ${skill.id}.${choice}`);
          } else {
            const badgeRect = badge.getBoundingClientRect();
            const slotRect = slot.getBoundingClientRect();
            if (badgeRect.left < slotRect.left - .5 || badgeRect.right > slotRect.right + .5
              || badgeRect.top < slotRect.top - .5 || badgeRect.bottom > slotRect.bottom + .5) {
              issues.push(`HUD overflow ${skill.id}.${choice}`);
            }
          }
          seen.push(`hud:${option.icon}`);
        }
      }
    }
    game.ui.openPanel('skills');
    const buttons = [...document.querySelectorAll('.mutation-options button[data-choice]')];
    for (const skill of skills) {
      for (const gate of [40, 80]) {
        for (const [choice, option] of Object.entries(skill.evolution.mutations[gate])) {
          const button = buttons.find(candidate => candidate.dataset.skill === skill.id
            && candidate.dataset.milestone === String(gate) && candidate.dataset.choice === choice);
          const expectedText = `${option.label}. ${option.summary}`;
          const glyph = button?.querySelector('.mutation-icon i')?.textContent.trim();
          const role = button?.querySelector('.mutation-icon em')?.textContent.trim();
          if (!button || button.dataset.icon !== option.icon || button.title !== expectedText
            || button.getAttribute('aria-label') !== expectedText || !glyph || !role) {
            issues.push(`panel ${skill.id}.${choice}`);
          } else if (button.scrollWidth > button.clientWidth + 1) {
            issues.push(`panel overflow ${skill.id}.${choice}`);
          }
          seen.push(`panel:${option.icon}`);
        }
      }
    }
    game.ui.closePanel();
    return { issues, panelButtons: buttons.length, seen };
  }, classId);
  if (audit.panelButtons !== 16) failures.push(`${viewportName} ${classId}: expected 16 mutation panel buttons, got ${audit.panelButtons}`);
  if (audit.seen.length !== 32 || new Set(audit.seen).size !== 32) {
    failures.push(`${viewportName} ${classId}: did not audit all 16 HUD and panel mutation icons`);
  }
  for (const issue of audit.issues) failures.push(`${viewportName} ${classId}: ${issue}`);
}

async function layoutSnapshot(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const element = document.querySelector(selector);
      if (!element || getComputedStyle(element).display === 'none') return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    const skillSlots = [...document.querySelectorAll('.ability-slot[data-key]')].map(element => {
      const value = element.getBoundingClientRect();
      return { left:value.left, top:value.top, right:value.right, bottom:value.bottom, width:value.width, height:value.height };
    });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      ability: rect('.ability-bar'),
      state: rect('#class-state-row'),
      frenzy: rect('#frenzy-chip'),
      overflow: rect('#overflow-chip'),
      ranger: rect('#ranger-state-row'),
      stick: rect('#touch-stick-zone'),
      menu: rect('#touch-menu-btn'),
      zone: rect('.zone-ribbon'),
      minimap: rect('.minimap-shell'),
      resources: rect('.resource-pills'),
      player: rect('.player-card'),
      hunt: rect('.hunt-card'),
      health: rect('.combat-vitals-health'),
      power: rect('.combat-vitals-power'),
      mobileVitals: rect('.mobile-profile-vitals'),
      skillSlots,
      stateInteractive: document.querySelectorAll('#class-state-row button, #class-state-row a, #class-state-row input, #class-state-row [tabindex]').length,
      abilityButtons: document.querySelectorAll('.ability-bar button, .ability-bar a, .ability-bar input').length,
      mappings: [...document.querySelectorAll('.ability-slot')].map(slot => slot.dataset.slot),
    };
  });
}

function assertLayout(name, snapshot, { touch, minimumSkillTarget }) {
  const { width, height } = snapshot.viewport;
  for (const [part, rect] of Object.entries({
    ability: snapshot.ability, state: snapshot.state, stick: touch ? snapshot.stick : null,
    menu: touch ? snapshot.menu : null, zone: snapshot.zone, minimap: snapshot.minimap,
    resources: snapshot.resources, player: snapshot.player,
    health: touch ? null : snapshot.health, power: touch ? null : snapshot.power,
    mobileVitals: touch ? snapshot.mobileVitals : null,
  })) {
    if (rect && !inViewport(rect, width, height, 4)) failures.push(`${name}: ${part} outside viewport`);
  }
  if (touch && overlaps(snapshot.stick, snapshot.ability, 4)) failures.push(`${name}: joystick overlaps action pad`);
  if (overlaps(snapshot.state, snapshot.ability, 2)) failures.push(`${name}: class state overlaps action pad`);
  if (touch && overlaps(snapshot.state, snapshot.stick, 2)) failures.push(`${name}: class state overlaps joystick`);
  if (touch && overlaps(snapshot.menu, snapshot.minimap, 2)) failures.push(`${name}: menu overlaps minimap`);
  if (snapshot.hunt) failures.push(`${name}: Hunt summary is expanded by default`);
  if (touch && (snapshot.health || snapshot.power)) failures.push(`${name}: desktop HP/MP orbs remain visible on mobile`);
  if (touch && !snapshot.mobileVitals) failures.push(`${name}: mobile profile HP/MP gauges are missing`);
  if (snapshot.health && snapshot.health.right > width * .55) failures.push(`${name}: HP display is not on the left`);
  if (snapshot.power && snapshot.power.left < width * .45) failures.push(`${name}: MP/energy display is not on the right`);
  if (snapshot.zone && snapshot.minimap && snapshot.zone.bottom > snapshot.minimap.top + 1) {
    failures.push(`${name}: zone title is not positioned above the minimap`);
  }
  if (snapshot.zone && snapshot.minimap && Math.abs(snapshot.zone.width - snapshot.minimap.width) > 1) {
    failures.push(`${name}: zone title width does not match the minimap`);
  }
  if (snapshot.minimap && snapshot.resources) {
    if (Math.abs(snapshot.minimap.width - snapshot.resources.width) > 1) {
      failures.push(`${name}: minimap width does not match the combined Gold/Items card width`);
    }
    if (snapshot.resources.top < snapshot.minimap.bottom) failures.push(`${name}: resources are not below the minimap`);
  }
  // Portrait touch uses a 3×3 action pad that consumes the right edge; desktop
  // and landscape have enough horizontal room to keep all three centers exact.
  if ((!touch || width > height) && snapshot.ability && snapshot.health && snapshot.power) {
    const abilityCenter = (snapshot.ability.top + snapshot.ability.bottom) / 2;
    const healthCenter = (snapshot.health.top + snapshot.health.bottom) / 2;
    const powerCenter = (snapshot.power.top + snapshot.power.bottom) / 2;
    if (Math.abs(abilityCenter - healthCenter) > 1.5) failures.push(`${name}: HP orb is not vertically centered on the skill pad`);
    if (Math.abs(abilityCenter - powerCenter) > 1.5) failures.push(`${name}: MP orb is not vertically centered on the skill pad`);
  }
  if (snapshot.skillSlots.some(rect => rect.width < minimumSkillTarget || rect.height < minimumSkillTarget)) {
    failures.push(`${name}: a skill hit target is below ${minimumSkillTarget}px`);
  }
  if (snapshot.skillSlots.some(rect => !inViewport(rect, width, height, 1))) failures.push(`${name}: skill slot outside viewport`);
  if (snapshot.stateInteractive !== 0 || snapshot.abilityButtons !== 0) failures.push(`${name}: evolution HUD added an interactive control`);
  const requiredMappings = ['attack', 'dash', 'skill-q', 'skill-e', 'skill-r', 'skill-c', 'potion'];
  if (requiredMappings.some(mapping => !snapshot.mappings.includes(mapping))) failures.push(`${name}: stable action mapping missing`);
  if (snapshot.documentOverflow.width > width + 1 || snapshot.documentOverflow.height > height + 1) {
    failures.push(`${name}: document overflows viewport`);
  }
}

async function main() {
  await waitServer(BASE);
  const browser = await chromium.launch({ headless: true });
  try {
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
      isMobile: true,
      locale: 'en-US',
    });
    const mobile = await mobileContext.newPage();
    await startHunt(mobile, true);

    for (const classId of ['aerin', 'wizard', 'rogue', 'ranger']) {
      const expected = await configureApex(mobile, classId);
      const actual = await readSkillSlots(mobile);
      assertApexSlots(classId, expected, actual);
      await auditAllMutationIcons(mobile, classId, 'portrait');
      if (classId === 'rogue') await auditOrbVitals(mobile);
      log.push(`${classId} badges ${JSON.stringify(actual.map(slot => ({ key:slot.key, skill:slot.skillId, tier:slot.formTier, mutations:slot.mutationBadges.map(badge => badge.title) })))}`);
    }

    // Cached signature must refresh after a same-class respec and after level/rank changes.
    const respec = await mobile.evaluate(async () => {
      const game = window.__SOL_ARPG_DEMO__;
      const { getClassActiveSkills } = await import('/js/data/content.js');
      game.debugSetSkillState({ classId: 'aerin', level: 100, rank: 10 });
      const skill = getClassActiveSkills('aerin')[0];
      const choices = Object.keys(skill.evolution.mutations[40]);
      game.player.setSkillMutation(skill.id, 40, choices.at(-1));
      const first = skill.evolution.mutations[40][choices[0]];
      return { key: skill.key, first: choices[0], firstLabel: first.label, firstSummary: first.summary };
    });
    await sleep(120);
    const beforeRespec = (await readSkillSlots(mobile)).find(slot => slot.key === respec.key)?.mutationBadges[0]?.title;
    await mobile.evaluate(({ key, choice }) => {
      const game = window.__SOL_ARPG_DEMO__;
      const slot = document.querySelector(`.ability-slot[data-key="${key}"]`);
      game.player.setSkillMutation(slot.dataset.skillId, 40, choice);
      game.ui.update(1);
    }, { key: respec.key, choice: respec.first });
    await sleep(120);
    const afterRespec = (await readSkillSlots(mobile)).find(slot => slot.key === respec.key)?.mutationBadges[0]?.title;
    if (beforeRespec === afterRespec || afterRespec !== `Level 40 mutation: ${respec.firstLabel}. ${respec.firstSummary}`) {
      failures.push(`same-class respec did not refresh cached HUD signature (${beforeRespec} -> ${afterRespec})`);
    }

    await mobile.evaluate(() => {
      const game = window.__SOL_ARPG_DEMO__;
      game.debugSetSkillState({ level: 1, rank: 0 });
      game.ui.update(1);
    });
    await sleep(120);
    const locked = await readSkillSlots(mobile);
    if (locked.some(slot => !slot.locked || !slot.tierHidden || slot.formTier || slot.mutationBadges.length)) {
      failures.push('locked/rank-0 skill slots expose evolution badges');
    }
    await mobile.evaluate(() => {
      const game = window.__SOL_ARPG_DEMO__;
      game.debugSetSkillState({ level: 10, rank: 5 });
      game.ui.update(1);
    });
    await sleep(120);
    const baseTier = await readSkillSlots(mobile);
    const unlockedBase = baseTier.filter(slot => !slot.locked);
    if (unlockedBase.length !== 3
      || unlockedBase.some(slot => !slot.tierHidden || slot.formTier || slot.mutationBadges.length)) {
      failures.push('below-Lv20 unlocked slots do not keep the blank/base evolution tier');
    }
    await mobile.evaluate(() => {
      const game = window.__SOL_ARPG_DEMO__;
      game.debugSetSkillState({ level: 20, rank: 6 });
      game.ui.update(1);
    });
    await sleep(120);
    const tierI = await readSkillSlots(mobile);
    if (tierI.some(slot => slot.formTier !== 'I' || slot.tierText !== 'I' || slot.mutationBadges.length)) {
      failures.push('Lv20/rank refresh did not resolve tier I without mutations');
    }
    await mobile.evaluate(() => {
      const game = window.__SOL_ARPG_DEMO__;
      game.debugSetSkillState({ level: 60, rank: 7 });
      game.ui.update(1);
    });
    await sleep(120);
    const tierII = await readSkillSlots(mobile);
    if (tierII.some(slot => slot.formTier !== 'II' || slot.rank !== '7' || slot.mutationBadges.length !== 1)) {
      failures.push('Lv60/rank refresh did not resolve tier II plus Lv40 mutation');
    }

    // Wizard Overflow has explicit empty, charging, and ready states.
    await configureApex(mobile, 'wizard');
    for (const value of [0, 75, 100]) {
      await mobile.evaluate(next => {
        const game = window.__SOL_ARPG_DEMO__;
        game.player.arcaneOverflow = next;
        game.ui.update(1);
      }, value);
      await sleep(100);
      const overflow = await mobile.evaluate(() => {
        const chip = document.getElementById('overflow-chip');
        return {
          hidden: chip.classList.contains('hidden'),
          text: chip.querySelector('span').textContent,
          ready: chip.classList.contains('is-ready'),
          aria: chip.getAttribute('aria-label'),
        };
      });
      const expectedText = value === 100 ? 'READY' : `${value}/100`;
      if (overflow.hidden || overflow.text !== expectedText || overflow.ready !== (value === 100)
        || !overflow.aria?.includes(value === 100 ? 'ready' : `${value} of 100`)) {
        failures.push(`Overflow ${value} state mismatch: ${JSON.stringify(overflow)}`);
      }
    }
    await mobile.screenshot({ path: resolve(OUT, '01-wizard-portrait-375x812.png') });
    const portrait = await layoutSnapshot(mobile);
    assertLayout('portrait 375x812', portrait, { touch: true, minimumSkillTarget: 40 });
    log.push(`portrait ${JSON.stringify(portrait)}`);

    // Exercise the real TouchControls pointer listeners, not only their DOM mapping metadata.
    const touchSkillEvents = await mobile.evaluate(() => {
      const game = window.__SOL_ARPG_DEMO__;
      const calls = [];
      const original = game.input.setVirtualButton;
      game.input.setVirtualButton = (code, down) => {
        calls.push(`${code}:${down ? 'down' : 'up'}`);
        return original.call(game.input, code, down);
      };
      let pointerId = 410;
      for (const slot of document.querySelectorAll('.ability-slot[data-key]')) {
        const init = { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', button: 0 };
        slot.dispatchEvent(new PointerEvent('pointerdown', init));
        slot.dispatchEvent(new PointerEvent('pointerup', init));
        pointerId += 1;
      }
      game.input.setVirtualButton = original;
      return calls;
    });
    for (const code of ['KeyQ', 'KeyE', 'KeyR', 'KeyC']) {
      if (!touchSkillEvents.includes(`${code}:down`) || !touchSkillEvents.includes(`${code}:up`)) {
        failures.push(`touch skill mapping did not emit ${code} down/up`);
      }
    }
    log.push(`touch skill events ${JSON.stringify(touchSkillEvents)}`);

    // Panel-open dimming must cover both the action pad and generic state row.
    await mobile.click('#touch-menu-btn');
    await mobile.waitForSelector('#panel-layer:not(.hidden)', { timeout: 5000 });
    const panelState = await mobile.evaluate(() => ({
      abilityOpacity: Number(getComputedStyle(document.querySelector('.ability-bar')).opacity),
      abilityPointer: getComputedStyle(document.querySelector('.ability-bar')).pointerEvents,
      stateOpacity: Number(getComputedStyle(document.getElementById('class-state-row')).opacity),
      statePointer: getComputedStyle(document.getElementById('class-state-row')).pointerEvents,
    }));
    if (panelState.abilityOpacity > .3 || panelState.stateOpacity > .3
      || panelState.abilityPointer !== 'none' || panelState.statePointer !== 'none') {
      failures.push(`panel-open combat HUD behavior mismatch: ${JSON.stringify(panelState)}`);
    }
    await mobile.screenshot({ path: resolve(OUT, '02-panel-open-375x812.png') });
    await mobile.evaluate(() => window.__SOL_ARPG_DEMO__.ui.closePanel());

    // Preserve the existing Rogue and Ranger state indicators in the generic row.
    await configureApex(mobile, 'rogue');
    await mobile.evaluate(() => {
      const game = window.__SOL_ARPG_DEMO__;
      game.player.activateShadowFrenzy({ frenzyDuration: 5, frenzyAttackHaste: .4, frenzyMoveHaste: .35 });
      game.ui.update(1);
    });
    await sleep(100);
    const frenzyVisible = await mobile.evaluate(() => !document.getElementById('frenzy-chip').classList.contains('hidden'));
    if (!frenzyVisible) failures.push('Rogue FRENZY chip was not preserved');
    await configureApex(mobile, 'ranger');
    await mobile.evaluate(() => {
      const game = window.__SOL_ARPG_DEMO__;
      const player = game.player;
      player.thornField = { planted: 3, remaining: 4 };
      player.predatorVerdict = { stored: 75, cap: 100, remaining: 4, target: { alive: true } };
      game.ui.update(1);
    });
    await sleep(100);
    const rangerStates = await mobile.evaluate(() => ({
      row: !document.getElementById('ranger-state-row').classList.contains('hidden'),
      thorns: document.querySelector('#thorns-chip span').textContent,
      verdict: document.querySelector('#verdict-chip span').textContent,
      overflowHidden: document.getElementById('overflow-chip').classList.contains('hidden'),
      primerChips: document.querySelectorAll('.primer-chip, [data-primer-chip]').length,
    }));
    if (!rangerStates.row || rangerStates.thorns !== '3/4' || rangerStates.verdict !== '75%'
      || !rangerStates.overflowHidden || rangerStates.primerChips !== 0) {
      failures.push(`Ranger/generic state row mismatch: ${JSON.stringify(rangerStates)}`);
    }

    await mobile.setViewportSize({ width: 812, height: 375 });
    await sleep(160);
    await auditAllMutationIcons(mobile, 'ranger', 'landscape');
    const landscape = await layoutSnapshot(mobile);
    assertLayout('landscape 812x375', landscape, { touch: true, minimumSkillTarget: 42 });
    log.push(`landscape ${JSON.stringify(landscape)}`);
    await mobile.screenshot({ path: resolve(OUT, '03-ranger-landscape-812x375.png') });
    await mobileContext.close();

    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
    const desktop = await desktopContext.newPage();
    await startHunt(desktop, false);
    for (const classId of ['aerin', 'wizard', 'rogue', 'ranger']) {
      await auditAllMutationIcons(desktop, classId, 'desktop');
    }
    const desktopExpected = await configureApex(desktop, 'aerin');
    assertApexSlots('desktop-aerin', desktopExpected, await readSkillSlots(desktop));
    const desktopLayout = await layoutSnapshot(desktop);
    assertLayout('desktop 1280x720', desktopLayout, { touch: false, minimumSkillTarget: 58 });
    if (overlaps(desktopLayout.ability, desktopLayout.minimap, 4)
      || overlaps(desktopLayout.state, desktopLayout.minimap, 4)) {
      failures.push('desktop combat HUD overlaps minimap');
    }
    log.push(`desktop ${JSON.stringify(desktopLayout)}`);
    await desktop.screenshot({ path: resolve(OUT, '04-knight-desktop-1280x720.png') });
    await desktopContext.close();
  } finally {
    await browser.close();
  }

  if (consoleErrors.length) failures.push(`browser console errors: ${consoleErrors.join(' | ')}`);
  const report = { completed: failures.length === 0, base: BASE, failures, consoleErrors, log };
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  const report = { completed: false, base: BASE, failures: [...failures, error.stack ?? String(error)], consoleErrors, log };
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}
