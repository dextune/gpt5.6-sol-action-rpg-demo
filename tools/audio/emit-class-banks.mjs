#!/usr/bin/env node
/**
 * Ensure class SFX bank wavs exist (skill_bow / skill_trap / skill_dagger).
 *
 * 1) Prefer full synth: node tools/audio/generate-combat-sfx.mjs  (unless --copy-only)
 * 2) If dedicated files still missing, copy distinct existing banks under the new names
 * 3) Point assets.json bank urls at the dedicated files
 *
 * Usage:
 *   node tools/audio/emit-class-banks.mjs
 *   node tools/audio/emit-class-banks.mjs --copy-only
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'assets/audio/combat');
const GEN = join(ROOT, 'tools/audio/generate-combat-sfx.mjs');
const MANIFEST = join(ROOT, 'assets/manifests/assets.json');
const copyOnly = process.argv.includes('--copy-only');

const needed = Object.freeze({
  skill_bow: { file: 'skill_bow_0.wav', fallback: 'skill_leap_0.wav' },
  skill_trap: { file: 'skill_trap_0.wav', fallback: 'skill_ice_0.wav' },
  skill_dagger: { file: 'skill_dagger_0.wav', fallback: 'skill_blade_0.wav' },
});

if (!copyOnly) {
  spawnSync(process.execPath, [GEN], { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' });
}

let missing = 0;
for (const [bank, { file, fallback }] of Object.entries(needed)) {
  const dest = join(OUT, file);
  if (existsSync(dest)) {
    console.log(`ok ${bank} → ${file}`);
    continue;
  }
  const src = join(OUT, fallback);
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`copied ${fallback} → ${file} (${bank})`);
  } else {
    console.error(`missing ${file} and fallback ${fallback}`);
    missing += 1;
  }
}

if (missing === 0 && existsSync(MANIFEST)) {
  let text = readFileSync(MANIFEST, 'utf8');
  const replacements = [
    [
      /"skill_bow"\s*:\s*\{[^}]*\}/,
      '"skill_bow": { "urls": ["./assets/audio/combat/skill_bow_0.wav", "./assets/audio/combat/skill_0.wav"] }',
    ],
    [
      /"skill_trap"\s*:\s*\{[^}]*\}/,
      '"skill_trap": { "urls": ["./assets/audio/combat/skill_trap_0.wav", "./assets/audio/combat/skill_0.wav"] }',
    ],
    [
      /"skill_dagger"\s*:\s*\{[^}]*\}/,
      '"skill_dagger": { "urls": ["./assets/audio/combat/skill_dagger_0.wav", "./assets/audio/combat/skill_0.wav"] }',
    ],
  ];
  for (const [re, rep] of replacements) {
    if (re.test(text)) text = text.replace(re, rep);
    else console.warn(`Could not patch bank entry for ${rep.slice(0, 20)}…`);
  }
  writeFileSync(MANIFEST, text);
  console.log('Patched assets.json class skill bank urls');
}

process.exit(missing === 0 ? 0 : 1);
