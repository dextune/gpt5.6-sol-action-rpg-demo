#!/usr/bin/env node
// Deterministic hero build orchestrator (docs/plan/character-graphics-animation-overhaul.md §12.2).
//
// Per requested class, in strict order of precedence:
//   1. Blender headless export -- used only when a Blender binary is resolvable AND the
//      class's authored `<classId>.blend` plus the shared `export_hero.py` script both
//      exist under assets/source/characters/ (see common/export-settings.json).
//   2. The repository-owned authored-recipe exporter (tools/assets/generate_assets.mjs) --
//      a deterministic, offline, versioned procedural build used whenever Blender source
//      authoring is unavailable. This is the current state of this workstation: Blender is
//      not installed and no .blend sources exist yet.
//
// Both paths are build-time tools. Neither is a "runtime primitive fallback" -- that term
// refers to AssetManager/CharacterFactory's fail-closed dev-time substitution, which this
// script never touches. Every build here stamps an explicit provenance.mode so the two
// paths are always distinguishable in the emitted report.
//
// Usage:
//   node tools/assets/build-heroes.mjs [--class=aerin,wizard,...] [--all] [--gunner ...]
//                                       [--no-lod2] [--blender-bin=<path>]
//                                       [--require-blender] [--report=<path>] [--dry-run]
// With no class selector, all five classes are built.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SOURCE_ROOT = resolve(ROOT, 'assets/source/characters');
const COMMON_DIR = resolve(SOURCE_ROOT, 'common');
const HERO_MODEL_DIR = resolve(ROOT, 'assets/models/hero');
const GENERATOR = resolve(HERE, 'generate_assets.mjs');

const HERO_CLASS_IDS = Object.freeze(['aerin', 'wizard', 'rogue', 'ranger', 'gunner']);
const CLASS_CLI_FLAG = Object.freeze({
  aerin: '--aerin-only',
  wizard: '--wizard-only',
  rogue: '--rogue-only',
  ranger: '--ranger-only',
  gunner: '--gunner-only',
});

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseArgs(argv) {
  const opts = {
    classes: [],
    lod2: true,
    blenderBin: process.env.BLENDER_BIN || 'blender',
    requireBlender: false,
    report: null,
    dryRun: false,
  };
  for (const raw of argv) {
    if (raw === '--all') {
      opts.classes.push(...HERO_CLASS_IDS);
    } else if (raw.startsWith('--class=')) {
      opts.classes.push(...raw.slice('--class='.length).split(',').map(s => s.trim()).filter(Boolean));
    } else if (raw === '--with-lod2' || raw === '--lod2') {
      opts.lod2 = true;
    } else if (raw === '--no-lod2') {
      opts.lod2 = false;
    } else if (raw.startsWith('--blender-bin=')) {
      opts.blenderBin = raw.slice('--blender-bin='.length);
    } else if (raw === '--require-blender') {
      opts.requireBlender = true;
    } else if (raw.startsWith('--report=')) {
      opts.report = raw.slice('--report='.length);
    } else if (raw === '--dry-run') {
      opts.dryRun = true;
    } else if (HERO_CLASS_IDS.includes(raw.replace(/^--/, ''))) {
      opts.classes.push(raw.replace(/^--/, ''));
    } else {
      throw new Error(`Unrecognized argument: ${raw}`);
    }
  }
  if (opts.classes.length === 0) opts.classes.push(...HERO_CLASS_IDS);
  opts.classes = [...new Set(opts.classes)];
  const unknown = opts.classes.filter(c => !HERO_CLASS_IDS.includes(c));
  if (unknown.length) {
    throw new Error(`Unknown hero class id(s): ${unknown.join(', ')}. Expected one of ${HERO_CLASS_IDS.join(', ')}.`);
  }
  return opts;
}

/** Resolve a usable Blender binary, or null. Never throws -- absence is an expected, handled state. */
function resolveBlender(blenderBin) {
  const probe = spawnSync(blenderBin, ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) return null;
  return { bin: blenderBin, version: (probe.stdout || '').split('\n')[0].trim() || 'unknown' };
}

function classSourcePaths(classId) {
  const classDir = resolve(SOURCE_ROOT, classId);
  return {
    classDir,
    blendFile: resolve(classDir, `${classId}.blend`),
    exportScript: resolve(COMMON_DIR, 'export_hero.py'),
  };
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sourceReceipts(paths) {
  return paths.map(path => ({
    path: toRepoRelative(path),
    sha256: sha256File(path),
  }));
}

function toRepoRelative(path) {
  return path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : path;
}

function buildViaBlender(classId, blender, paths, opts) {
  console.log(`[build-heroes] ${classId}: Blender source found -- exporting via ${blender.bin} (${blender.version}).`);
  const args = [
    '-b', paths.blendFile,
    '--python', paths.exportScript,
    '--',
    '--class', classId,
    '--rig-contract', resolve(COMMON_DIR, 'rig-contract.json'),
    '--export-settings', resolve(COMMON_DIR, 'export-settings.json'),
    '--out-dir', HERO_MODEL_DIR,
    ...(opts.lod2 ? [] : ['--no-lod2']),
  ];
  if (opts.dryRun) {
    console.log(`[build-heroes] dry-run: ${blender.bin} ${args.join(' ')}`);
    return {
      mode: 'blender',
      blenderVersion: blender.version,
      sourceFiles: [paths.blendFile, paths.exportScript, resolve(COMMON_DIR, 'rig-contract.json'), resolve(COMMON_DIR, 'export-settings.json')],
      dryRun: true,
    };
  }
  const result = spawnSync(blender.bin, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Blender export failed for class "${classId}" (exit ${result.status}).`);
  }
  return {
    mode: 'blender',
    blenderVersion: blender.version,
    sourceFiles: [paths.blendFile, paths.exportScript, resolve(COMMON_DIR, 'rig-contract.json'), resolve(COMMON_DIR, 'export-settings.json')],
  };
}

function buildViaAuthoredRecipe(classId, opts) {
  console.log(`[build-heroes] ${classId}: Blender source unavailable -- using repository-owned authored-recipe exporter (${toRepoRelative(GENERATOR)}).`);
  const args = [GENERATOR, CLASS_CLI_FLAG[classId], ...(opts.lod2 ? [] : ['--no-lod2'])];
  if (opts.dryRun) {
    console.log(`[build-heroes] dry-run: node ${args.map(toRepoRelative).join(' ')}`);
    return {
      mode: 'authored-recipe',
      sourceFiles: [GENERATOR, resolve(COMMON_DIR, 'rig-contract.json'), resolve(COMMON_DIR, 'export-settings.json')],
      dryRun: true,
    };
  }
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: ROOT });
  if (result.status !== 0) {
    throw new Error(`Authored-recipe export failed for class "${classId}" (exit ${result.status}).`);
  }
  return {
    mode: 'authored-recipe',
    sourceFiles: [GENERATOR, resolve(COMMON_DIR, 'rig-contract.json'), resolve(COMMON_DIR, 'export-settings.json')],
  };
}

function collectProvenance(classId, buildResult, opts) {
  if (buildResult.dryRun) {
    const sourceFiles = sourceReceipts(buildResult.sourceFiles ?? []);
    return {
      classId,
      rigId: 'sol_humanoid_v2',
      schemaVersion: 2,
      buildMode: buildResult.mode,
      dryRun: true,
      sourceFiles,
      sourceHash: createHash('sha256')
        .update(sourceFiles.map(entry => `${entry.path}:${entry.sha256}`).join('\n'))
        .digest('hex'),
      outputs: 'skipped (dry-run)',
    };
  }
  const lods = ['lod0', 'lod1', ...(opts.lod2 ? ['lod2'] : [])];
  const outputs = {};
  for (const lod of lods) {
    const path = resolve(HERO_MODEL_DIR, `${classId}_${lod}.glb`);
    if (!existsSync(path)) throw new Error(`Expected build output missing: ${toRepoRelative(path)}`);
    outputs[lod] = {
      path: toRepoRelative(path),
      byteSize: readFileSync(path).length,
      sha256: sha256File(path),
    };
  }
  return {
    classId,
    rigId: 'sol_humanoid_v2',
    schemaVersion: 2,
    buildMode: buildResult.mode,
    dryRun: false,
    sourceFiles: sourceReceipts(buildResult.sourceFiles ?? []),
    sourceHash: createHash('sha256')
      .update(sourceReceipts(buildResult.sourceFiles ?? []).map(entry => `${entry.path}:${entry.sha256}`).join('\n'))
      .digest('hex'),
    outputs,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(HERO_MODEL_DIR, { recursive: true });

  const rigContract = loadJson(resolve(COMMON_DIR, 'rig-contract.json'));
  const exportSettings = loadJson(resolve(COMMON_DIR, 'export-settings.json'));
  if (rigContract.rigId !== exportSettings.rigId || rigContract.schemaVersion !== exportSettings.schemaVersion) {
    throw new Error('rig-contract.json and export-settings.json disagree on rigId/schemaVersion.');
  }

  const blender = resolveBlender(opts.blenderBin);
  if (blender) {
    console.log(`[build-heroes] Blender resolved: ${blender.bin} (${blender.version}).`);
  } else {
    console.log(`[build-heroes] Blender not resolvable via "${opts.blenderBin}" -- the authored-recipe exporter will be used for every requested class.`);
  }
  if (opts.requireBlender && !blender) {
    throw new Error('--require-blender was set, but no compatible Blender binary was resolved.');
  }
  if (opts.requireBlender) {
    const missingSources = opts.classes.filter(classId => {
      const paths = classSourcePaths(classId);
      return !existsSync(paths.blendFile) || !existsSync(paths.exportScript);
    });
    if (missingSources.length > 0) {
      throw new Error(`--require-blender requires approved .blend/export_hero.py sources for: ${missingSources.join(', ')}.`);
    }
  }

  const report = {
    rigId: rigContract.rigId,
    schemaVersion: rigContract.schemaVersion,
    generatedBy: 'tools/assets/build-heroes.mjs',
    blender: blender ? { bin: blender.bin, version: blender.version } : null,
    classes: [],
  };

  for (const classId of opts.classes) {
    const paths = classSourcePaths(classId);
    const hasBlenderSource = Boolean(blender) && existsSync(paths.blendFile) && existsSync(paths.exportScript);
    const buildResult = hasBlenderSource
      ? buildViaBlender(classId, blender, paths, opts)
      : buildViaAuthoredRecipe(classId, opts);
    const provenance = collectProvenance(classId, buildResult, opts);
    report.classes.push(provenance);
    if (!opts.dryRun) {
      provenance.validation = {};
      const lodQuality = { lod0: 'high', lod1: 'medium', lod2: 'low' };
      for (const lod of Object.keys(provenance.outputs)) {
        const quality = lodQuality[lod];
        const args = [resolve(HERE, 'validate-hero-assets.mjs'), '--class', classId, '--lod', quality];
        const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
        provenance.validation[lod] = {
          status: result.status,
          command: `node tools/assets/validate-hero-assets.mjs --class ${classId} --lod ${quality}`,
        };
        if (result.status !== 0) {
          const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
          throw new Error(`Contract validation failed for ${classId} ${lod}: ${detail}`);
        }
      }
    }
    const outputSummary = provenance.dryRun ? '(dry-run)' : Object.keys(provenance.outputs).join(',');
    console.log(`[build-heroes] ${classId}: mode=${provenance.buildMode} outputs=${outputSummary}`);
  }

  const reportJson = JSON.stringify(report, null, 2);
  console.log(reportJson);
  if (opts.report) {
    const reportPath = resolve(ROOT, opts.report);
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, reportJson);
    console.log(`[build-heroes] provenance report written to ${toRepoRelative(reportPath)}`);
  }
}

main().catch(error => {
  console.error(`[build-heroes] ${error.message}`);
  process.exitCode = 1;
});
