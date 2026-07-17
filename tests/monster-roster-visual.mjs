/**
 * Browser acceptance for the twenty new procedural monsters.
 * Writes desktop/narrow evidence outside the repository by default.
 *
 * Usage: node tests/monster-roster-visual.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8777';
const OUT = resolve(process.env.OUT_DIR || `/tmp/sol-arpg-monster-roster-${Date.now()}`);
const IDS = [
  'snapjaw_bloom', 'nectar_urn', 'grove_pangolin', 'razor_mantis', 'lantern_moth',
  'root_centipede', 'thornback_devil', 'dune_fennec', 'blasttail_beetle', 'rime_muskox',
  'snowtail_leopard', 'glacier_walrus', 'cinder_salamander', 'furnace_ant', 'slagfoot_snail',
  'pyre_phoenix', 'lurestar_angler', 'veil_vampire', 'chainlight_colony', 'void_nautilus',
];
const failures = [];
const browserErrors = [];
const sleep = ms => new Promise(done => setTimeout(done, ms));
let server;

mkdirSync(OUT, { recursive: true });

async function waitServer(timeout = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if ((await fetch(BASE)).ok) return; } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error(`Server unavailable at ${BASE}`);
}

try {
  if (!process.env.BASE_URL) {
    server = spawn(process.execPath, ['server.mjs'], { cwd: resolve(new URL('..', import.meta.url).pathname), stdio: 'ignore' });
  }
  await waitServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(() => window.__SOL_ARPG_DEMO__?.monsterFactory
    && document.querySelector('#title-screen.active'), { timeout: 60_000 });

  const runtime = await page.evaluate(async ids => {
    const THREE = await import('./vendor/three.module.min.js');
    const { ENEMY_TYPES } = await import('./js/data/content.js');
    const game = window.__SOL_ARPG_DEMO__;
    game.pauseRenderLoop?.();
    game.combat.clear(); game.effects.clear(); game.enemies.clear();
    const origin = game.player.position.clone();
    const spawned = ids.map((id, index) => {
      const angle = index * Math.PI * 2 / ids.length;
      const position = origin.clone().add(new THREE.Vector3(Math.cos(angle) * 12, 0, Math.sin(angle) * 12));
      return game.enemies.spawn(ENEMY_TYPES[id], position, { level: ENEMY_TYPES[id].level });
    });
    const rows = spawned.map((enemy, index) => ({
      id: ids[index],
      spawned: Boolean(enemy),
      shape: enemy?.refs?.shape ?? null,
      procedural: Boolean(enemy?.refs?.procedural),
      sceneMounted: Boolean(enemy?.mesh?.parent),
    }));
    game.enemies.clear();

    for (const element of document.querySelectorAll('#app > *:not(#game-canvas)')) {
      if (element instanceof HTMLElement) element.style.setProperty('display', 'none', 'important');
    }
    game.player.mesh.visible = false;
    const acceptanceScene = new THREE.Scene();
    acceptanceScene.background = new THREE.Color(0x071018);
    acceptanceScene.fog = new THREE.FogExp2(0x071018, .012);
    acceptanceScene.add(new THREE.HemisphereLight(0xb8e5ff, 0x18202a, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffe4b0, 3.1);
    keyLight.position.set(-8, 15, 12); acceptanceScene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x83bfff, 2.2);
    rimLight.position.set(12, 8, -10); acceptanceScene.add(rimLight);
    const gallery = new THREE.Group(); gallery.name = 'MonsterRosterAcceptance'; acceptanceScene.add(gallery);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 20),
      new THREE.MeshStandardMaterial({ color: 0x17222a, roughness: .92, metalness: .02 }),
    );
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.04; floor.receiveShadow = true; gallery.add(floor);

    const visualRows = [];
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      const data = ENEMY_TYPES[id];
      const created = game.monsterFactory.create(data, { quality: 'medium' });
      created.refs.healthGroup.visible = false;
      created.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(created.group);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const fit = 2.35 / Math.max(size.x, size.y, size.z);
      created.group.scale.multiplyScalar(fit);
      const col = index % 5;
      const row = Math.floor(index / 5);
      const x = (col - 2) * 4.0;
      const z = (row - 1.5) * 4.1;
      created.group.position.set(x - center.x * fit, -box.min.y * fit, z - center.z * fit);
      gallery.add(created.group);

      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 64;
      const context = canvas.getContext('2d');
      context.fillStyle = 'rgba(5, 10, 14, .82)'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = `#${data.accent.toString(16).padStart(6, '0')}`; context.lineWidth = 4; context.strokeRect(2, 2, 316, 60);
      context.fillStyle = '#f4fbff'; context.font = '700 24px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(data.name, 160, 32);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
      label.position.set(x, 2.85, z); label.scale.set(2.7, .54, 1); label.renderOrder = 100; gallery.add(label);
      visualRows.push({ id, shape: data.shape, fit, size: size.toArray() });
    }

    const acceptanceCamera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .1, 100);
    acceptanceCamera.position.set(0, 18.5, 24.5);
    acceptanceCamera.lookAt(0, 1.05, 0); acceptanceCamera.updateProjectionMatrix();
    game.renderPipeline.resize(innerWidth, innerHeight);
    game.renderer.render(acceptanceScene, acceptanceCamera);
    window.__monsterRosterAcceptance = { scene: acceptanceScene, camera: acceptanceCamera };
    return { rows, visualRows, ready: window.__gameReady === true, galleryChildren: gallery.children.length };
  }, IDS);

  if (!runtime.ready) failures.push('window.__gameReady was not true');
  if (runtime.rows.length !== 20 || runtime.rows.some(row => !row.spawned || !row.procedural || !row.sceneMounted)) {
    failures.push(`runtime spawn matrix failed: ${JSON.stringify(runtime.rows)}`);
  }
  if (new Set(runtime.rows.map(row => row.shape)).size !== 20) failures.push('runtime spawn matrix did not preserve 20 shapes');
  if (runtime.visualRows.length !== 20 || runtime.galleryChildren !== 41) failures.push(`gallery build mismatch: ${JSON.stringify(runtime)}`);

  await page.screenshot({ path: resolve(OUT, 'monster-roster-desktop.png') });
  await page.setViewportSize({ width: 900, height: 900 });
  await page.evaluate(() => {
    const game = window.__SOL_ARPG_DEMO__;
    const { scene, camera } = window.__monsterRosterAcceptance;
    camera.aspect = innerWidth / innerHeight;
    camera.position.set(0, 22, 29); camera.fov = 52;
    camera.lookAt(0, 1.05, 0); camera.updateProjectionMatrix();
    game.renderPipeline.resize(innerWidth, innerHeight);
    game.renderer.render(scene, camera);
  });
  await page.screenshot({ path: resolve(OUT, 'monster-roster-narrow.png') });
  await browser.close();

  if (browserErrors.length) failures.push(`browser errors: ${browserErrors.join(' | ')}`);
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({ outDir: OUT, spawned: runtime.rows.length, shapes: new Set(runtime.rows.map(row => row.shape)).size, browserErrors }, null, 2));
  console.log('monster-roster-visual: runtime spawn and desktop/narrow render passed');
} finally {
  server?.kill('SIGTERM');
}
