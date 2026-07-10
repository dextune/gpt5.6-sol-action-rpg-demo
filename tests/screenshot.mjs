import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const shotDir = resolve(root, 'screenshots');

fs.mkdirSync(shotDir, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForServer(url, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('Server did not start');
}

async function main() {
  console.log('Starting server...');
  const server = spawn('node', ['server.mjs'], { cwd: root, stdio: 'pipe' });
  server.stdout.on('data', d => process.stdout.write(`[server] ${d}`));
  server.stderr.on('data', d => process.stderr.write(`[server-err] ${d}`));

  const BASE = 'http://127.0.0.1:8080';
  await waitForServer(BASE);

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // ── 1. Title Screen ──
  console.log('Navigating to game...');
  await page.goto(BASE + '/?debug=1', { waitUntil: 'networkidle' });
  await page.waitForSelector('#title-screen:not(.hidden)', { timeout: 30000 }).catch(() => {});
  await sleep(2000);
  await page.screenshot({ path: resolve(shotDir, '01-title-screen.png'), fullPage: false });
  console.log('✓ Title screen captured');

  // ── 2. Start game and go straight to combat ──
  await page.click('#new-game-btn');
  await page.waitForSelector('#hud:not(.hidden)', { timeout: 15000 }).catch(() => {});
  await sleep(2000);

  // ── 3. Combat — move forward and attack immediately ──
  console.log('Moving toward monsters and attacking...');

  // Phase 1: approach and first strikes
  await page.keyboard.down('w');
  await sleep(600);
  await page.keyboard.press('j');
  await sleep(300);
  await page.keyboard.press('j');
  await sleep(250);
  await page.keyboard.press('j');
  await sleep(250);
  await page.keyboard.press('j');
  await sleep(400);
  await page.screenshot({ path: resolve(shotDir, '03-combat-1.png'), fullPage: false });
  console.log('✓ Combat 1 captured');

  // Phase 2: keep charging and attacking
  await page.keyboard.press('j');
  await sleep(250);
  await page.keyboard.press('j');
  await sleep(300);
  await page.keyboard.press('j');
  await sleep(400);
  await page.screenshot({ path: resolve(shotDir, '03-combat-2.png'), fullPage: false });
  console.log('✓ Combat 2 captured');

  // Phase 3: more combat
  await page.keyboard.press('j');
  await sleep(200);
  await page.keyboard.press('j');
  await sleep(300);
  await page.keyboard.press('j');
  await sleep(200);
  await page.keyboard.press('j');
  await sleep(400);
  await page.screenshot({ path: resolve(shotDir, '03-combat-3.png'), fullPage: false });
  console.log('✓ Combat 3 captured');

  await page.keyboard.up('w');
  await browser.close();
  server.kill();
  console.log('Done. All screenshots saved.');
}

main().catch(err => { console.error(err); process.exit(1); });
