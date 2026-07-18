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
const defaultClasses = ['aerin', 'wizard', 'rogue', 'ranger', 'gunner'];
const smokeScope = process.env.SMOKE_SCOPE ?? 'all';
if (!['all', 'desktop', 'mobile'].includes(smokeScope)) throw new Error(`Unknown SMOKE_SCOPE: ${smokeScope}`);
const expectedBindings = Object.freeze({
  aerin: Object.freeze({ name: 'Gareth', weaponKind: 'sword', heroRoot: 'Knight_Hero_Rig', socketParent: 'right_hand', marker: 'knight_helm', maxWeaponRatio: .9, expectBladeUp: true }),
  wizard: Object.freeze({ name: 'Lyra', weaponKind: 'staff', heroRoot: 'Wizard_Hero_Rig', socketParent: 'right_hand', marker: 'wizard_hat', maxWeaponRatio: 1.05, expectBladeUp: true }),
  rogue: Object.freeze({ name: 'Vex', weaponKind: 'dagger', heroRoot: 'Rogue_Hero_Rig', socketParent: 'right_hand', marker: 'rogue_authored_hood', expectOffhand: true, maxWeaponRatio: .55 }),
  ranger: Object.freeze({ name: 'Sable', weaponKind: 'bow', heroRoot: 'Ranger_Hero_Rig', socketParent: 'left_hand', marker: 'ranger_quiver', maxWeaponRatio: .85 }),
  gunner: Object.freeze({ name: 'Rook', weaponKind: 'rifle', heroRoot: 'Gunner_Hero_Rig', socketParent: 'right_hand', marker: 'gunner_powered_cuirass', maxWeaponRatio: 1.2, expectBladeUp: false }),
});
const classes = process.env.SMOKE_CLASSES?.split(',').map(value => value.trim()).filter(Boolean) ?? defaultClasses;
if (classes.some(classId => !expectedBindings[classId])) throw new Error(`Unknown SMOKE_CLASSES: ${classes.join(',')}`);
const failures = [];
const consoleErrors = [];
let server;
let browser;

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
    const weaponKind = player.weapon?.model ?? null;
    const weaponRoot = weaponKind ? `weapon_${weaponKind}` : null;
    const firstNamed = (root, names) => {
      for (const name of names) {
        const found = root?.getObjectByName?.(name);
        if (found) return found;
      }
      return null;
    };
    const negativeScale = root => {
      let found = false;
      root?.traverse?.(object => {
        if (found || !object.scale) return;
        if (object.scale.x < 0 || object.scale.y < 0 || object.scale.z < 0) found = true;
      });
      return found;
    };

    const mainScale = main.scale.clone();
    const offhandScale = offhand?.scale.clone();
    main.scale.setScalar(0);
    if (offhand) offhand.scale.setScalar(0);
    player.mesh.updateMatrixWorld(true);
    const heroSize = new THREE.Box3().setFromObject(player.mesh).getSize(new THREE.Vector3());
    main.scale.copy(mainScale);
    if (offhand && offhandScale) offhand.scale.copy(offhandScale);
    player.mesh.updateMatrixWorld(true);
    const weaponSize = new THREE.Box3().setFromObject(main).getSize(new THREE.Vector3());
    const longestWeaponSide = Math.max(weaponSize.x, weaponSize.y, weaponSize.z);
    const bladeBase = firstNamed(main, ['trail_base', 'blade_base']);
    const bladeTip = firstNamed(main, ['trail_tip', 'blade_tip']);
    const bladeAxisY = bladeBase && bladeTip
      ? bladeTip.getWorldPosition(new THREE.Vector3()).y - bladeBase.getWorldPosition(new THREE.Vector3()).y
      : null;

    const materials = player.refs.materials ?? [];
    const materialSample = materials.map(material => ({
      role: material?.userData?.materialRole ?? null,
      sourceMapsPreserved: Boolean(material?.userData?.sourceMapsPreserved),
      hasAnyMap: Boolean(material?.userData?.hasMap || material?.userData?.hasNormalMap
        || material?.userData?.hasRoughnessMap || material?.userData?.hasMetalnessMap
        || material?.userData?.hasAoMap || material?.userData?.hasEmissiveMap || material?.userData?.hasAlphaMap),
      isStylized: Boolean(material?.isStylizedMaterial),
    }));
    let heroMetadata = null;
    player.mesh.traverse(object => {
      if (!heroMetadata && object.userData?.assetType === 'hero') heroMetadata = object.userData;
    });
    const diagnostics = player.animation?.getDiagnostics?.() ?? null;
    const muzzle = firstNamed(main, ['muzzle_socket']);
    const stock = firstNamed(main, ['stock_anchor']);
    const rifleAxis = muzzle && stock
      ? muzzle.getWorldPosition(new THREE.Vector3()).sub(stock.getWorldPosition(new THREE.Vector3()))
      : null;

    return {
      classId: player.classId,
      name: player.name,
      fallback: player.refs.fallback,
      heroRoot: Boolean(player.mesh.getObjectByName(expectedClass.heroRoot)),
      weaponKind,
      weaponRoot: Boolean(weaponRoot && main.getObjectByName(weaponRoot)),
      socketParent: main.parent?.parent?.name ?? null,
      marker: Boolean(player.mesh.getObjectByName(expectedClass.marker)),
      offhandRoot: expectedClass.expectOffhand
        ? Boolean(weaponRoot && offhand?.getObjectByName(weaponRoot))
        : !offhand,
      weaponRatio: longestWeaponSide / Math.max(.001, heroSize.y),
      weaponLongest: longestWeaponSide,
      heroHeight: heroSize.y,
      weaponScale: mainScale.toArray(),
      bladeAxisY,
      // D7: generic asset-error/contract metadata must be visible and honest.
      assetError: Boolean(player.refs.assetError),
      contractOk: player.refs.contract?.ok !== false,
      contractIssues: player.refs.contract?.issues ?? [],
      weaponContractOk: player.refs.weaponContract?.ok !== false,
      weaponContractIssues: player.refs.weaponContract?.issues ?? [],
      // D9: no negative-scale ancestor anywhere under the equipped weapon(s).
      weaponNegativeScale: negativeScale(main),
      offhandNegativeScale: offhand ? negativeScale(offhand) : false,
      // D8: material conversion must not silently erase authored maps/roles.
      materialCount: materials.length,
      materialsAllStylized: materials.length > 0 && materialSample.every(m => m.isStylized),
      materialsAllPreserveFlagSet: materials.length > 0 && materialSample.every(m => m.sourceMapsPreserved),
      // v2-preferred socket naming with v1 aliases (docs/plan §7.3).
      socketNames: player.refs.socketNames ?? null,
      schemaVersion: heroMetadata?.schemaVersion ?? null,
      rigId: heroMetadata?.rigId ?? null,
      locomotionMode: diagnostics?.locomotionMode ?? null,
      supportHandError: diagnostics?.ik?.support_hand?.error ?? null,
      rifleVerticalRatio: rifleAxis ? Math.abs(rifleAxis.y) / Math.max(.001, rifleAxis.length()) : null,
    };
  }, expected);

  if (!actual) {
    failures.push(`${label}: render binding was unavailable`);
    return;
  }
  if (actual.classId !== classId) failures.push(`${label}: class id ${actual.classId} != ${classId}`);
  if (actual.name !== expected.name) failures.push(`${label}: hero name ${actual.name} != ${expected.name}`);
  if (actual.fallback) failures.push(`${label}: fallback hero rendered instead of GLB`);
  if (!actual.heroRoot) failures.push(`${label}: missing hero root ${expected.heroRoot}`);
  if (!actual.weaponRoot) failures.push(`${label}: missing equipped weapon root weapon_${actual.weaponKind ?? 'unknown'}`);
  if (actual.weaponKind !== expected.weaponKind) {
    failures.push(`${label}: equipped weapon kind ${actual.weaponKind ?? 'missing'} != signature ${expected.weaponKind}`);
  }
  if (actual.socketParent !== expected.socketParent) failures.push(`${label}: weapon mounted to ${actual.socketParent}, expected ${expected.socketParent}`);
  if (!actual.marker) failures.push(`${label}: missing class silhouette marker ${expected.marker}`);
  if (!actual.offhandRoot) failures.push(`${label}: offhand weapon binding mismatch`);
  if (actual.weaponRatio < .18 || actual.weaponRatio > expected.maxWeaponRatio) {
    failures.push(`${label}: weapon/hero ratio ${actual.weaponRatio.toFixed(3)} outside .18-${expected.maxWeaponRatio} (${JSON.stringify({ weapon: actual.weaponLongest, hero: actual.heroHeight, scale: actual.weaponScale })})`);
  }
  if (expected.expectBladeUp && !(actual.bladeAxisY > .1)) {
    failures.push(`${label}: ${expected.name} idle weapon tip points down (world axis ${actual.bladeAxisY?.toFixed(3) ?? 'missing'})`);
  }
  // D7: strict/debug mode must never silently substitute a bad asset — the contract must hold.
  if (actual.assetError) failures.push(`${label}: hero refs report assetError=true in debug mode (silent fallback)`);
  if (!actual.contractOk) failures.push(`${label}: hero asset contract failed: ${actual.contractIssues.join('; ')}`);
  if (!actual.weaponContractOk) failures.push(`${label}: weapon asset contract failed: ${actual.weaponContractIssues.join('; ')}`);
  // D9: negative-scale weapon mounts must be eliminated.
  if (actual.weaponNegativeScale) failures.push(`${label}: equipped weapon has a negative-scale ancestor`);
  if (actual.offhandNegativeScale) failures.push(`${label}: offhand weapon has a negative-scale ancestor`);
  // D8: material conversion must preserve maps, not erase them.
  if (!actual.materialsAllStylized) failures.push(`${label}: not every hero material converted to StylizedMaterial`);
  if (!actual.materialsAllPreserveFlagSet) failures.push(`${label}: hero materials did not run the map-preserving conversion path`);
  if (!actual.socketNames?.primary) failures.push(`${label}: refs.socketNames.primary missing (v2/v1 socket alias resolution failed)`);
  if (actual.schemaVersion !== 2 || actual.rigId !== 'sol_humanoid_v2') {
    failures.push(`${label}: expected schema-v2 sol_humanoid_v2 asset, got schema=${actual.schemaVersion} rig=${actual.rigId}`);
  }
  if (actual.locomotionMode !== 'blend') failures.push(`${label}: schema-v2 hero is not using blended locomotion`);
  if (classId === 'gunner') {
    if (!Number.isFinite(actual.supportHandError) || actual.supportHandError > .035) {
      failures.push(`${label}: Gunner support-hand error ${actual.supportHandError} exceeds .035`);
    }
    if (!Number.isFinite(actual.rifleVerticalRatio) || actual.rifleVerticalRatio > .45) {
      failures.push(`${label}: Gunner rifle is not held horizontally at the waist (vertical ratio ${actual.rifleVerticalRatio})`);
    }
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

async function sampleGunnerRiflePose(page) {
  return page.evaluate(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const player = window.__SOL_ARPG_DEMO__?.player;
    const rifle = player?.refs?.weapon;
    const muzzle = rifle?.getObjectByName('muzzle_socket');
    const stock = rifle?.getObjectByName('stock_anchor');
    if (!player || !muzzle || !stock) return null;
    player.mesh.updateMatrixWorld(true);
    const axis = muzzle.getWorldPosition(new THREE.Vector3())
      .sub(stock.getWorldPosition(new THREE.Vector3()))
      .normalize();
    const facing = player.facing.clone().setY(0).normalize();
    return {
      axis: axis.toArray(),
      forwardAlignment: axis.dot(facing),
      supportHandError: player.animation?.getDiagnostics?.()?.ik?.support_hand?.error ?? null,
    };
  });
}

async function assertGunnerSmartlinkReticle(page, label) {
  await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    const player = game.player;
    const candidates = game.enemies.enemies.filter(enemy => (
      enemy.alive && enemy.hostile !== false && !enemy._remove && enemy.active !== false
    ));
    const target = candidates.find(enemy => !enemy.boss) ?? candidates[0];
    player.attackCooldown = 0;
    player.castTimer = 0;
    player.facing.set(1, 0, 0);
    player.mesh.rotation.y = Math.PI / 2;
    for (const candidate of candidates) {
      candidate.hp = Math.max(candidate.hp, 1e8);
      candidate.maxHp = Math.max(candidate.maxHp, 1e8);
    }
    if (target) {
      target.position.copy(player.position).addScaledVector(player.facing, 6);
    }
  });
  const readyPose = await sampleGunnerRiflePose(page);
  await page.keyboard.down('KeyJ');
  await sleep(60);
  const bracedPose = await sampleGunnerRiflePose(page);
  await sleep(55);
  const recoilPose = await sampleGunnerRiflePose(page);
  await page.keyboard.up('KeyJ');
  await sleep(65);
  const followPose = await sampleGunnerRiflePose(page);
  const samples = [readyPose, bracedPose, recoilPose, followPose];
  if (samples.some(sample => !sample)) {
    failures.push(`${label}: Gunner rifle pose could not be sampled through the attack`);
  } else {
    const readyAxis = readyPose.axis;
    const dot = axis => readyAxis[0] * axis[0] + readyAxis[1] * axis[1] + readyAxis[2] * axis[2];
    const minimumAlignment = Math.min(...samples.slice(1).map(sample => dot(sample.axis)));
    const maximumVerticalRatio = Math.max(...samples.map(sample => Math.abs(sample.axis[1])));
    const maximumSupportError = Math.max(...samples.map(sample => sample.supportHandError ?? Infinity));
    const minimumForwardAlignment = Math.min(...samples.map(sample => sample.forwardAlignment));
    if (minimumAlignment < .78) {
      failures.push(`${label}: Gunner rifle swung out of its waist-fire lane (minimum alignment ${minimumAlignment})`);
    }
    if (minimumForwardAlignment < .75) {
      failures.push(`${label}: Gunner muzzle did not stay forward (minimum facing alignment ${minimumForwardAlignment})`);
    }
    if (maximumVerticalRatio > .45) {
      failures.push(`${label}: Gunner rifle left its horizontal firing lane (vertical ratio ${maximumVerticalRatio})`);
    }
    if (maximumSupportError > .035) {
      failures.push(`${label}: Gunner support hand detached during recoil (error ${maximumSupportError})`);
    }
  }
  await sleep(20);
  const locked = await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    const element = document.getElementById('smartlink-reticle');
    const box = element?.getBoundingClientRect();
    return {
      target: Boolean(game.player._smartlinkReticleEnemy?.alive),
      timer: game.player._smartlinkStickTimer ?? 0,
      visible: Boolean(element && !element.classList.contains('hidden') && getComputedStyle(element).display !== 'none'),
      inside: Boolean(box && box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight),
    };
  });
  if (!locked.target || locked.timer <= 0 || !locked.visible || !locked.inside) {
    failures.push(`${label}: Smartlink world reticle did not lock inside viewport (${JSON.stringify(locked)})`);
  }
  const cleared = await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    game.player._smartlinkStickTimer = 0;
    game.ui.update(1);
    return document.getElementById('smartlink-reticle')?.classList.contains('hidden');
  });
  if (!cleared) failures.push(`${label}: Smartlink reticle remained after stick expiry`);
}

async function launchMode(page, classId, mode, imageName, { touch = false } = {}) {
  // debug=1: exercise the fail-closed dev/test asset-contract path (D7) instead
  // of the production-tolerant one, so a silent clip/asset substitution fails here.
  await page.goto(`${base}/?autostart=0&quality=medium&class=${classId}&debug=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
  if (classId === 'gunner' && mode === 'hunt') {
    await assertGunnerSmartlinkReticle(page, `${mode}/${classId}/gameplay`);
  }
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
  await (await page.context().newCDPSession(page)).send('Network.setCacheDisabled', { cacheDisabled: true });
  recordConsole(page, 'desktop');
  for (const classId of classes) await launchMode(page, classId, 'hunt', `desktop-${classId}-hunt.png`);
  await continueSmoke(page, classes.at(-1), 'desktop-gunner-continue.png');
  for (const classId of classes) await launchMode(page, classId, 'defense', `desktop-${classId}-defense.png`);
  await page.close();
}

async function mobileSmoke(browser) {
  const device = devices['iPhone 13 Mini'] || devices['iPhone 13'];
  const context = await browser.newContext({ ...device, locale: 'en-US' });
  const page = await context.newPage();
  await (await page.context().newCDPSession(page)).send('Network.setCacheDisabled', { cacheDisabled: true });
  recordConsole(page, 'mobile');
  await page.goto(`${base}/?autostart=0&quality=medium&class=aerin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForTitle(page);
  const titleTop = await page.locator('.title-content').boundingBox();
  if (!titleTop || titleTop.y < 24) failures.push(`mobile/title: content begins too close to the top edge (${titleTop?.y ?? 'missing'}px)`);
  const titleLayout = await page.evaluate(() => {
    document.body.classList.add('touch-ui');
    const cards = [...document.querySelectorAll('.class-card')].map(card => {
      const box = card.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    const start = document.getElementById('new-game-btn')?.getBoundingClientRect();
    return { cards, start: start ? { top: start.top, bottom: start.bottom } : null, width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth };
  });
  if (titleLayout.cards.length !== 5) failures.push(`mobile/title: expected five class cards, got ${titleLayout.cards.length}`);
  const [c1, c2, c3, c4, c5] = titleLayout.cards;
  if (!c1 || !c5 || Math.abs(c1.y - c2.y) > 2 || Math.abs(c1.y - c3.y) > 2 || Math.abs(c4.y - c5.y) > 2 || c4.y <= c1.y) {
    failures.push('mobile/title: class cards are not arranged as centered 3 + 2 rows');
  } else {
    const secondRowCenter = (c4.x + c5.x + c5.width) / 2;
    if (Math.abs(secondRowCenter - titleLayout.width / 2) > 3) failures.push(`mobile/title: second class row is not centered (${secondRowCenter}px)`);
  }
  if (!titleLayout.start || titleLayout.start.bottom > titleLayout.height + 1) failures.push('mobile/title: MAX HUNT action is outside the safe viewport');
  if (titleLayout.scrollWidth > titleLayout.width + 1) failures.push('mobile/title: class layout causes horizontal overflow');
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
  await continueSmoke(page, classes.at(-1), 'mobile-gunner-continue.png', { touch: true });
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
  browser = await chromium.launch({ headless: true });
  if (smokeScope !== 'mobile') await desktopSmoke(browser);
  if (smokeScope !== 'desktop') await mobileSmoke(browser);
  await browser.close();
  browser = null;
} catch (error) {
  failures.push(error?.stack || String(error));
} finally {
  await browser?.close().catch(() => {});
  server?.kill();
}

if (consoleErrors.length) failures.push(`console errors:\n${consoleErrors.join('\n')}`);
if (failures.length) {
  console.error(`Visual smoke failed (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  const desktopCoverage = `desktop ${classes.length} Hunts + ${classes.length} Defense runs + Continue`;
  const mobileCoverage = `mobile ${classes.length} Hunts + Rogue Defense + Continue`;
  const coverage = smokeScope === 'desktop' ? desktopCoverage
    : smokeScope === 'mobile' ? mobileCoverage
      : `${desktopCoverage}; ${mobileCoverage}`;
  console.log(`Visual smoke passed (${smokeScope}): ${coverage}. Screenshots: ${outDir}`);
}
