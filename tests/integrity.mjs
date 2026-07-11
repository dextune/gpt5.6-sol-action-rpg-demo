import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testsDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(testsDir, '..');
const failures = [];
const ok = (condition, message) => condition ? console.log(`✓ ${message}`) : failures.push(message);

async function filesUnder(dir) {
  const result = [];
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) result.push(...await filesUnder(path));
    else result.push(path);
  }
  return result;
}

const allFiles = await filesUnder(root);
const jsFiles = allFiles.filter(path => ['.js', '.mjs'].includes(extname(path)) && !path.includes('/vendor/') && !path.includes('/node_modules/'));
const importPattern = /(?:from\s+|import\s+)["']([^"']+)["']/g;
for (const file of jsFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const target = resolve(dirname(file), specifier);
    ok(allFiles.includes(target), `module path: ${target.slice(root.length + 1)}`);
  }
}

const content = await import(pathToFileURL(join(root, 'js/data/content.js')));
const config = await import(pathToFileURL(join(root, 'js/config.js')));
const zones = Object.keys(content.ZONES);
const enemies = Object.values(content.ENEMY_TYPES);
const bosses = enemies.filter(enemy => enemy.boss);
const shapes = new Set(enemies.map(enemy => enemy.shape));

ok(zones.length === 6, '6 ecological zones');
ok(enemies.length === 42, '42 monster types');
ok(bosses.length === 6, '6 zone bosses');
ok(shapes.size === 22, '22 monster body shapes');
ok(Object.keys(content.RARITIES).length === 5, '5 equipment rarities');
// Structural content checks — no magic totals; adding a class/base must not break these.
ok(Object.values(content.WEAPON_BASES).every(base => base.model && base.power > 0 && base.speed > 0), 'weapon bases valid (model/power/speed)');
ok(Object.keys(content.ARMOR_BASES).length >= 6, 'armor bases present');
ok(Object.keys(content.CHARM_BASES).length >= 6, 'charm bases present');
ok(content.AFFIXES.length >= 10, 'random equipment affixes present');
ok(Object.values(content.SKILLS).every(skill => content.HERO_CLASSES[skill.classId]), 'every skill belongs to a valid class');
for (const [classId, def] of Object.entries(content.HERO_CLASSES)) {
  ok(def.activeSkills.length === 4, `class ${classId} has exactly 4 actives`);
  ok(def.passiveSkills.length >= 4, `class ${classId} has 4+ passives`);
}
ok(content.HERO_CLASSES.rogue.activeSkills.includes('twin_fang'), 'rogue has twin_fang');
ok(content.HERO_CLASSES.rogue.attackStyle === 'melee', 'rogue attackStyle melee');
ok(Boolean(content.HERO_CLASSES.rogue.energy), 'rogue Focus resource defined');
ok((content.HERO_CLASSES.rogue.meleeProfile?.rangeMult ?? 1) < 1, 'rogue short melee reach');
ok(content.HERO_CLASSES.wizard.activeSkills.includes('fireball'), 'wizard has fireball');
ok(content.HERO_CLASSES.wizard.attackStyle === 'magic', 'wizard attackStyle magic');
ok(content.HERO_CLASSES.aerin.attackStyle === 'melee', 'knight (aerin) attackStyle melee');
ok(config.GAME_CONFIG.maxEnemies >= 42, 'max concurrent enemies setting');
ok(config.GAME_CONFIG.saveVersion === 4, 'save data version 4');

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};
const { SaveManager } = await import(pathToFileURL(join(root, 'js/core/SaveManager.js')));
const saveManager = new SaveManager();
ok(saveManager.save({ marker: 731, player: { level: 9 } }), 'save write');
ok(saveManager.hasSave(), 'save exists check');
ok(saveManager.load()?.marker === 731 && saveManager.load()?.player?.level === 9, 'save read and version check');
saveManager.clear();
ok(!saveManager.hasSave(), 'save delete');

for (const zone of zones) {
  ok(Boolean(content.ZONE_BOSSES[zone]), `${zone} boss mapping`);
  ok((content.ZONE_SPAWNS[zone] ?? []).length === 6, `${zone} normal monster pool 6`);
}

const modelSource = await readFile(join(root, 'js/graphics/ModelFactory.js'), 'utf8');
for (const shape of shapes) ok(new RegExp(`\\b${shape}:\\s*build`, 'm').test(modelSource), `model builder: ${shape}`);

const html = await readFile(join(root, 'index.html'), 'utf8');
for (const key of ['Q', 'E', 'R', 'C']) {
  ok(html.includes(`data-key="${key}"`), `HUD skill key slot: ${key}`);
}
ok(allFiles.includes(join(root, 'assets/models/props/weapon_staff.glb')), 'staff weapon glb exists');
ok(html.includes('./vendor/three.module.min.js'), 'local Three.js import map');
const externalRefs = [...html.matchAll(/(?:src|href)=[\"'](https?:\/\/[^\"']+)/gi)];
ok(externalRefs.length === 0, 'no external network dependency');
ok(allFiles.includes(join(root, 'vendor/three.module.min.js')), 'local Three.js file exists');
ok(allFiles.includes(join(root, 'THIRD_PARTY_LICENSES/three-LICENSE.txt')), 'Three.js license exists');
ok(html.includes('id="defense-btn"'), 'title Defense mode button');
ok(html.includes('id="defense-wave-panel"'), 'defense wave HUD panel');
ok(Boolean(config.DEFENSE_CONFIG), 'DEFENSE_CONFIG exported');
ok(allFiles.includes(join(root, 'js/systems/DefenseSystem.js')), 'DefenseSystem module exists');
ok(html.includes('id="class-select"'), 'title class select');
ok(html.includes('data-class-id="wizard"'), 'title wizard class card');
ok(Boolean(content.HERO_CLASSES?.aerin && content.HERO_CLASSES?.wizard), 'HERO_CLASSES aerin + wizard');
ok(content.DEFAULT_HERO_CLASS_ID === 'aerin', 'default hero class aerin');
ok(typeof content.resolveHeroClassId === 'function' && content.resolveHeroClassId('nope') === 'aerin', 'resolveHeroClassId fallback');
ok(allFiles.includes(join(root, 'assets/models/hero/wizard_lod0.glb')), 'wizard lod0 glb exists');
ok(allFiles.includes(join(root, 'assets/models/hero/wizard_lod1.glb')), 'wizard lod1 glb exists');
ok(html.includes('data-class-id="rogue"'), 'title rogue class card');
ok(html.includes('id="energy-bar"'), 'HUD energy gauge');
ok(Boolean(content.HERO_CLASSES?.rogue), 'HERO_CLASSES rogue');
ok(allFiles.includes(join(root, 'assets/models/hero/rogue_lod0.glb')), 'rogue lod0 glb exists');
ok(allFiles.includes(join(root, 'assets/models/hero/rogue_lod1.glb')), 'rogue lod1 glb exists');
ok(allFiles.includes(join(root, 'assets/models/props/weapon_dagger.glb')), 'dagger weapon glb exists');

const manifest = JSON.parse(await readFile(join(root, 'assets/manifests/assets.json'), 'utf8'));
ok(Boolean(manifest.models?.['hero.wizard']), 'manifest hero.wizard');
ok(Boolean(manifest.models?.['hero.aerin']), 'manifest hero.aerin');
ok(Boolean(manifest.models?.['weapon.staff']), 'manifest weapon.staff');
ok(Boolean(manifest.models?.['hero.rogue']), 'manifest hero.rogue');
ok(Boolean(manifest.models?.['weapon.dagger']), 'manifest weapon.dagger');
if (manifest.audio && typeof manifest.audio === 'object') {
  for (const [key, entry] of Object.entries(manifest.audio)) {
    const urls = Array.isArray(entry?.urls) ? entry.urls : entry?.url ? [entry.url] : [];
    ok(urls.length > 0, `audio bank has paths: ${key}`);
    for (const url of urls) {
      const relative = url.replace(/^\.\//, '');
      ok(allFiles.includes(join(root, relative)), `audio sample exists: ${relative}`);
    }
  }
}

if (failures.length) {
  console.error(`\n${failures.length} validation failure(s):`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}
console.log(`\nAll checks passed · ${allFiles.length} files · ${jsFiles.length} JS modules`);

// Skill combat params / presentation / status unit tests
console.log('\n--- skill-combat ---');
const skillCombat = await import(pathToFileURL(join(root, 'tests/skill-combat.mjs')));
void skillCombat;

// Nested import/reference integrity + combat/class simulations (prevents SKILLS-not-defined class bugs).
console.log('\n--- import-integrity ---');
const nested = await import(pathToFileURL(join(root, 'tests/import-integrity.mjs')));
void nested;
