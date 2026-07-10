# Monster visuals · form

Guide to changing a monster's color/visual and mesh form. Unlike the hero, monsters have **two render paths** — the GLB body is what actually shows; the code fallback is only used when GLB is absent.

## Overview — two paths

| Path | Source | Form editable? |
|------|--------|----------------|
| **GLB body** | `monster.{archetype}` (`assets/manifests/assets.json`) | color/scale only. Mesh topology is fixed in the file (`vendor/` edits forbidden) |
| **Procedural fallback** | `ModelFactory.createEnemyModel` (`:660`) | geometry/form/detail **fully free to edit in code** |

Runtime: `MonsterFactory.create` → `cloneModel('monster.' + archetype)`. On GLB load failure the `asset.fallback` flag makes `ModelFactory` builders run. **Normal play is almost always the GLB body.**

Archetype mapping (`MonsterFactory.js` `SHAPE_ARCHETYPE`):

```
blob/plant/beetle/crab → slime
hare/raptor/harpy      → hare
boar/wolf/lizard/panther/stag → boar
wisp/imp               → wisp
raider/shaman/knight/cyclops  → humanoid
golem/colossus/drake/scorpion → colossus
```

## Quick visual change (data only, recommended)

Even on the GLB body, **material recoloring** is applied every frame in code (`MonsterFactory.create` `:100-117`). Just change the `content.js` `enemy(...)` fields.

| Field | Effect | Location |
|-------|--------|----------|
| `color` | body base color (`baseColor.lerp(accent, .04)`) | `content.js` `ENEMY_TYPES` |
| `accent` | eye/metal/leaf tint, elite horns/halo | same |
| `eye` | unused in `content.js` — eye color derives from `accent` | `MonsterFactory` `:105` |
| `scale` | whole-mesh scale (`baseScale`) | `MonsterFactory` `:89` |
| `boss` / `elite` option | horns / rune halo / aura added | `addEliteDetails` `:35` |

```js
// content.js — changing only color makes it look like a completely different monster
enemy('frost_wolf', 'Frost Wolf', 'canyon', 'wolf', 16, 420, 38, 22, 7.2, 2.4, 90, {
  color: 0xbfe6ff, accent: 0x6fd0ff, scale: 1.15,
});
```

> `color`/`accent` are **hex ints**. Name is free-form. Check shape against the archetype mapping.

## Elite / boss detail

`MonsterFactory.addEliteDetails` (`:35`) attaches automatically:

- **Horns** `elite_crest_*`: Catmull curve `TubeGeometry`, 5 for boss / 3 for elite.
- **Rune halo** `elite_rune_halo`: torus ring for `humanoid` archetype or bosses only.
- Color is `accent`, emissive intensity `boss ? .6 : .26`.

To add more detail, append meshes in this function (relative to the head bone `group.getObjectByName('head')`).

## Change form — fallback mesh (ModelFactory)

Only visible in GLB-less environments, but it is **the only code path that changes the form itself**.

### Builder structure

`createEnemyModel(data, elite)` (`:660`):

1. `createPalette(data, elite)` (`:103`) — builds `body/accent/dark/light/eye/white/metal` toon materials.
2. `builders[data.shape]` map (`:671`) → 22 builders like `buildWolf`/`buildDrake`.
3. Each `build*` assembles geometry via `addPart`/`cylinderBetween`/`coneBetween` helpers.

### Common helpers (`ModelFactory.js`)

```js
addPart(parent, geo, material, pos=[0,0,0], scale=[1,1,1], rot=[0,0,0], opts={})
cylinderBetween(parent, start, end, radius, material, opts={})
coneBetween(parent, start, end, radius, material, opts={})
addEyes(parent, palette, y, z, spacing=.16, size=.06, angry=false)
```

`opts`: `{ outline, thickness, castShadow }`. Geometry reuse goes through the `geometry(key, factory)` cache.

### Example: edit an existing monster form

Make `buildWolf` (`:357`) body chubbier:

```js
// before
refs.body = addPart(rig, geometry('wolf-body', () => new THREE.SphereGeometry(.58, 10, 8)), p.body, [0, .78, -.05], [1, .68, 1.45]);
// after — rounder
refs.body = addPart(rig, geometry('wolf-body', () => new THREE.SphereGeometry(.66, 10, 8)), p.body, [0, .74, -.05], [1.1, .8, 1.5]);
```

Add/remove heads, change leg count, `addEyes(..., angry=true)`, etc. Keep the pattern of pushing to `refs` (`body/head/arms/legs/wings/...`).

## Add a new shape

### A. Reuse an existing archetype (safest)

Only change `shape` in `content.js`. Both GLB and fallback use existing builders.

```js
enemy('shadow_stag', 'Shadow Stag', 'forest', 'stag', 12, 300, 30, 18, 6.0, 2.6, 70, { color: 0x2a2440, accent: 0x8a6bff });
```

### B. Add a new fallback form only (no GLB)

1. Write `buildMything(rig, p, refs)` in `ModelFactory.js` (copy an existing `build*` → modify).
2. Add `'mything': buildMything` to the `builders` map (`:671`).
3. Add `'mything': 'slime'` etc. to `MonsterFactory.SHAPE_ARCHETYPE` (`:5`) (used on GLB fallback).
4. `content.js` `enemy(..., 'mything', ...)`.

> Because it is the fallback path, it may not show in normal play (GLB body). Verifying requires an invasive workaround that forces GLB load failure → not recommended.

### C. New GLB archetype (not recommended)

Add `monster.mything` key + LOD to `assets/manifests/assets.json`, map in `SHAPE_ARCHETYPE`. **Creating/editing `vendor/`/GLB files directly violates AGENTS rules** — building a GLB via external tools is out of scope for this guide.

## Integrity / validation

- `node tests/integrity.mjs` — checks shape maps to `SHAPE_ARCHETYPE`, one boss per 6 zones, etc.
- If you added a fallback builder, keep `builders` keys and `SHAPE_ARCHETYPE` in sync to avoid fallback/errors.

## Edit checklist

- [ ] `shape` maps to `MonsterFactory.SHAPE_ARCHETYPE`
- [ ] New fallback builder: registered in both `builders` map and `SHAPE_ARCHETYPE`
- [ ] `color`/`accent` are hex ints
- [ ] Elite/boss detail follows the `addEliteDetails` pattern
- [ ] `node tests/integrity.mjs` passes
- [ ] Aware of the difference between the GLB body path (normal play) and the fallback path (editor/load failure)

## Applications

### 1) Same shape, different mood (data only)

With `color`/`accent`/`scale`/`boss` combos, flame-wolf → frost-wolf → ghost-wolf all use the `wolf` shape.

### 2) Major form change (fallback only)

`buildDrake` tail/wing geometry reshuffle, `addEyes` angle for expression. Fallback-only.

### 3) Elite-only parts

Add an `archetype === 'boar'` branch in `addEliteDetails` to attach tusk meshes only on boar elites.
