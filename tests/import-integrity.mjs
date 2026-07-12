/**
 * Static + simulated guards against ReferenceError-style regressions
 * (e.g. Game.js using SKILLS after its import was dropped).
 *
 * Run: node tests/import-integrity.mjs
 * Also pulled in by tests/integrity.mjs
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testsDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(testsDir, '..');
const failures = [];
const ok = (condition, message) => {
  if (condition) console.log(`✓ ${message}`);
  else {
    failures.push(message);
    console.error(`✗ ${message}`);
  }
};

async function filesUnder(dir) {
  const result = [];
  for (const name of await readdir(dir)) {
    if (name === 'vendor' || name === 'node_modules' || name === '.git') continue;
    const path = join(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) result.push(...await filesUnder(path));
    else result.push(path);
  }
  return result;
}

function parseNamedExports(source) {
  const exports = new Set();
  for (const m of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) exports.add(m[1]);
  for (const m of source.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)/g)) exports.add(m[1]);
  for (const m of source.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)/g)) exports.add(m[1]);
  for (const m of source.matchAll(/export\s+let\s+([A-Za-z_$][\w$]*)/g)) exports.add(m[1]);
  for (const m of source.matchAll(/export\s+\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/);
      const name = (bits[1] || bits[0] || '').trim();
      if (name) exports.add(name);
    }
  }
  return exports;
}

function parseNamedImports(clause) {
  const names = [];
  const trimmed = clause.trim();
  if (!trimmed.startsWith('{')) return names;
  const inner = trimmed.replace(/^\{|\}$/g, '');
  for (const part of inner.split(',')) {
    const t = part.trim();
    if (!t || t === 'type') continue;
    const asMatch = t.match(/^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
    if (asMatch) names.push({ imported: asMatch[1], local: asMatch[2] || asMatch[1] });
  }
  return names;
}

function stripNoise(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function freeIdentifierUsed(body, name) {
  // Not preceded by . or word char (avoids MathUtils.clamp, obj.SKILLS)
  const re = new RegExp(`(?<![.\\w])\\b${name}\\b`);
  return re.test(body);
}

const allFiles = await filesUnder(root);
const jsFiles = allFiles.filter(path => (
  ['.js', '.mjs'].includes(extname(path))
  && !path.includes('/vendor/')
  && !path.includes('/node_modules/')
));

// Map absolute path -> exports
const exportCache = new Map();
async function getExports(absPath) {
  if (exportCache.has(absPath)) return exportCache.get(absPath);
  try {
    const source = await readFile(absPath, 'utf8');
    const exp = parseNamedExports(source);
    exportCache.set(absPath, exp);
    return exp;
  } catch {
    exportCache.set(absPath, null);
    return null;
  }
}

// --- A) Named relative imports must exist on the target module ---
let importChecks = 0;
for (const file of jsFiles) {
  const source = await readFile(file, 'utf8');
  const importRe = /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  let match;
  while ((match = importRe.exec(source))) {
    const clause = match[1];
    const spec = match[2];
    if (!spec.startsWith('.')) continue;
    const target = resolve(dirname(file), spec);
    // Skip vendor skeleton utils etc. that re-export oddly — still check if file exists
    if (!allFiles.includes(target) && !allFiles.includes(`${target}.js`)) {
      // integrity.mjs already path-checks; skip missing vendor-style
      continue;
    }
    const resolved = allFiles.includes(target) ? target : `${target}.js`;
    if (!resolved.endsWith('.js') && !resolved.endsWith('.mjs')) continue;
    const named = parseNamedImports(clause);
    if (!named.length) continue;
    const exports = await getExports(resolved);
    if (!exports) continue;
    // SkeletonUtils uses `export { clone }` — parseNamedExports handles export { }
    for (const { imported } of named) {
      importChecks += 1;
      ok(exports.has(imported), `export exists: ${imported} from ${resolved.slice(root.length + 1)} (used by ${file.slice(root.length + 1)})`);
    }
  }
}
ok(importChecks > 20, `named import checks ran (${importChecks})`);

// --- B) Free use of content.js / config.js exports requires an import ---
const contentPath = join(root, 'js/data/content.js');
const configPath = join(root, 'js/config.js');
const contentExports = await getExports(contentPath);
const configExports = await getExports(configPath);

const contentMod = await import(pathToFileURL(contentPath));
const configMod = await import(pathToFileURL(configPath));

// Prefer live module keys (includes all exports)
const contentNames = Object.keys(contentMod).filter(k => k !== 'default' && !k.startsWith('module'));
const configNames = Object.keys(configMod).filter(k => k !== 'default' && !k.startsWith('module'));

for (const file of jsFiles) {
  if (file === contentPath || file === configPath) continue;
  if (!file.includes('/js/')) continue;
  const source = await readFile(file, 'utf8');
  const body = stripNoise(source).replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?/g, '');

  const importedLocals = new Set();
  const importRe = /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  let match;
  while ((match = importRe.exec(source))) {
    const clause = match[1];
    const spec = match[2];
    const isContent = spec.includes('data/content.js');
    const isConfig = /(?:^|\/)config\.js$/.test(spec);
    if (!isContent && !isConfig) continue;
    for (const { local } of parseNamedImports(clause)) importedLocals.add(local);
    // namespace import
    const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) importedLocals.add(ns[1]);
  }

  const catalog = file.includes('/js/') ? [...contentNames, ...configNames] : [];
  for (const name of catalog) {
    if (!freeIdentifierUsed(body, name)) continue;
    // local declaration shadow
    if (new RegExp(`\\b(?:function|class|const|let|var)\\s+${name}\\b`).test(body)) continue;
    ok(importedLocals.has(name), `import required: ${name} in ${file.slice(root.length + 1)}`);
  }
}

// --- C) Class skill catalog consistency + combat handler registry ---
const {
  SKILLS, HERO_CLASSES, getClassSkillIds, getClassActiveSkills, getHeroClass,
} = contentMod;

const combatSrc = await readFile(join(root, 'js/systems/CombatSystem.js'), 'utf8');
const handlerBlock = combatSrc.match(/this\.skillHandlers\s*=\s*\{([\s\S]*?)\n\s*\};/);
ok(Boolean(handlerBlock), 'CombatSystem.skillHandlers block present');
const registeredHandlers = new Set(
  handlerBlock
    ? [...handlerBlock[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)].map(m => m[1])
    : [],
);

for (const [classId, def] of Object.entries(HERO_CLASSES)) {
  ok(Array.isArray(def.activeSkills) && def.activeSkills.length > 0, `class ${classId} has activeSkills`);
  ok(Array.isArray(def.passiveSkills), `class ${classId} has passiveSkills`);
  ok(def.attackStyle === 'melee' || def.attackStyle === 'magic' || def.attackStyle === 'ranged', `class ${classId} attackStyle valid`);
  ok(Boolean(def.starterWeapon?.model), `class ${classId} starterWeapon.model`);

  for (const id of getClassSkillIds(classId)) {
    const skill = SKILLS[id];
    ok(Boolean(skill), `SKILLS.${id} exists for class ${classId}`);
    if (!skill) continue;
    ok(skill.classId === classId, `SKILLS.${id}.classId matches ${classId}`);
    if (skill.passive) {
      ok(Boolean(skill.effect && typeof skill.effect === 'object'), `passive ${id} has effect object`);
    } else {
      ok(Boolean(skill.effect), `active ${id} has effect id`);
      ok(Boolean(skill.anim), `active ${id} has anim clip`);
      ok(Boolean(skill.key), `active ${id} has key`);
      ok(registeredHandlers.has(skill.effect), `combat handler registered for effect '${skill.effect}' (${id})`);
    }
  }
}

// --- D) Simulate level-up unlock notify path (Game.onEnemyKilled) ---
function simulateLevelUnlockNotices(classId, levels) {
  const notices = [];
  for (const level of levels) {
    for (const id of getClassSkillIds(classId)) {
      const skill = SKILLS[id];
      if (skill && !skill.passive && skill.unlockLevel === level) {
        notices.push({ level, name: skill.name, key: skill.key });
      }
    }
  }
  return notices;
}

const aerin3 = simulateLevelUnlockNotices('aerin', [3]);
const wizard3 = simulateLevelUnlockNotices('wizard', [3]);
ok(aerin3.some(n => n.name.includes('Whirlwind')), 'sim: knight (aerin) unlocks Whirlwind at 3');
ok(wizard3.some(n => n.name.includes('Fireball')), 'sim: wizard unlocks Fireball at 3');
ok(!aerin3.some(n => n.name.includes('Fireball')), 'sim: knight (aerin) does not unlock Fireball');
ok(!wizard3.some(n => n.name.includes('Whirlwind')), 'sim: wizard does not unlock Whirlwind');

// Skill key binding simulation
for (const classId of Object.keys(HERO_CLASSES)) {
  const actives = getClassActiveSkills(classId);
  const keys = actives.map(s => s.key);
  ok(new Set(keys).size === keys.length, `class ${classId} active skill keys unique`);
  ok(actives.every(s => ['Q', 'E', 'R', 'C'].includes(s.key)), `class ${classId} skills use Q/E/R/C`);
}

// --- E) Game.js must import every content symbol it free-uses ---
const gameSrc = await readFile(join(root, 'js/core/Game.js'), 'utf8');
const gameBody = stripNoise(gameSrc).replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?/g, '');
const gameImportLine = gameSrc.split('\n').find(line => line.includes('data/content.js')) || '';
const gameImported = new Set(parseNamedImports((gameImportLine.match(/import\s+([\s\S]*?)\s+from/) || [])[1] || '{}').map(x => x.local));
for (const name of contentNames) {
  if (!freeIdentifierUsed(gameBody, name)) continue;
  ok(gameImported.has(name), `Game.js imports content symbol ${name}`);
}

// Player skill tree init simulation
for (const classId of Object.keys(HERO_CLASSES)) {
  const ranks = contentMod.createEmptySkillRanks(classId);
  const cds = contentMod.createEmptySkillCooldowns(classId);
  ok(Object.keys(ranks).length === getClassSkillIds(classId).length, `empty ranks cover tree for ${classId}`);
  ok(Object.keys(cds).length === getHeroClass(classId).activeSkills.length, `empty cooldowns cover actives for ${classId}`);
}

if (failures.length) {
  console.error(`\n${failures.length} import-integrity failure(s):`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}
console.log(`\nimport-integrity: all checks passed`);
