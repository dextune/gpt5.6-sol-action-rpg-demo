Hero character source authoring
================================

This directory is the authored-source home for the five playable hero
classes described in docs/plan/character-graphics-animation-overhaul.md
(class ids: aerin, wizard, rogue, ranger, gunner).

Current state (2026-07-17)
---------------------------
Blender is not installed on this workstation and no Blender .blend source
files exist in this checkout yet. Shipping hero GLBs are produced today by
the repository-owned, deterministic, offline authored-recipe exporter:

  tools/assets/generate_assets.mjs

That script needs no Blender and no external dependency; it procedurally
builds each hero's skeleton, skin, materials, gear, and animation clips in
pure JS/Three.js and exports GLBs to assets/models/hero/. It is a real,
versioned, build-time source -- not a runtime placeholder or primitive
fallback. Every hero root it emits carries explicit schema v2 metadata
(assetType, schemaVersion, classId, rigId, lod, provenance, provenanceHash,
stats) so the origin and content are always inspectable.

How to (re)build heroes
------------------------
Use the orchestrator, which picks Blender when available and otherwise
uses the authored-recipe exporter automatically:

  node tools/assets/build-heroes.mjs --all
  node tools/assets/build-heroes.mjs --class=gunner
  node tools/assets/build-heroes.mjs --class=gunner --no-lod2
  node tools/assets/build-heroes.mjs --class=gunner --dry-run
  node tools/assets/build-heroes.mjs --class=gunner --report=build/gunner-provenance.json

The orchestrator prints a JSON provenance report (rig id, schema version,
build mode per class, output byte sizes and sha256 hashes) to stdout, and
writes it to --report=<path> when given.

You can still call the generator directly for the exact legacy CLI surface
(all existing flags keep working unchanged):

  node tools/assets/generate_assets.mjs --gunner-only
  node tools/assets/generate_assets.mjs --heroes-only
  node tools/assets/generate_assets.mjs            # heroes + weapons + monsters + world

Adding a Blender-authored class
--------------------------------
When an artist adds real Blender source, follow this layout:

  assets/source/characters/
    common/
      sol_humanoid_v2.blend       (shared rig/mannequin, when authored)
      rig-contract.json           (bone/socket/skinning/material contract -- source of truth)
      export-settings.json        (export rules, LOD/optimization/provenance settings)
      export_hero.py              (shared Blender headless export script -- not yet authored)
    <classId>/
      <classId>.blend
      <classId>-review.md

Once both assets/source/characters/<classId>/<classId>.blend and
assets/source/characters/common/export_hero.py exist, and a Blender binary
is resolvable (BLENDER_BIN env var, --blender-bin=<path>, or "blender" on
PATH), build-heroes.mjs automatically switches that class to the Blender
export path -- no other change required. Until then it keeps using the
authored-recipe exporter for that class.

Contracts
---------
rig-contract.json and export-settings.json are the single source of truth
for bone naming (including the legacy-name -> v2-name compatibility alias
table), sockets/markers, skinning limits, material role tags, coordinate
convention, LOD definitions, and provenance fields. Both the (future)
Blender path and the current authored-recipe exporter must agree with
these files; keep them in sync when either changes.

Do not add binary source assets with unclear license status. Prefer
original authored work; record third-party origin/license explicitly if
ever required.
