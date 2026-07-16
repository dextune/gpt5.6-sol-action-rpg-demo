# LOCKED · Template vs Game Boundary

**Status: LOCKED (2026-07-16) · T0–T5 physical package shipped**  
**Enforcement:** `tests/template-boundary.mjs` (nested by `tests/integrity.mjs`)  
**Package entry:** `packages/template-3d/` (`@sol/template-3d`, import map in `index.html`)  
**Audience:** humans and agents  
**Supersedes informal “we might extract a 3D template later” chat.**  
Any change that blurs the layers below **must** update this file in the same PR and keep `tests/template-boundary.mjs` green.

---

## 1. Purpose

This project will eventually split into:

| Package (target name) | Role |
|-----------------------|------|
| **template-3d** (future) | Reusable browser Three.js runtime: assets, render, anim, VFX primitives, input, utils |
| **sol-arpg** (this repo body) | Game content, combat rules, modes, HUD, hero bake profiles |

Until a physical monorepo split lands, **logical ownership is frozen** by the tables in §3–§4.

---

## 2. Hard rules (do not violate)

1. **Template-candidate modules must not import Sol content.**  
   Forbidden imports inside template-candidate files: `js/data/content.js`, `skillCombat.js`, `rushContent.js`, `fxThemes.js` (theme tokens are game-facing), `HERO_CLASSES`, skill effect handlers.

2. **Game systems must not import other game systems for logic.**  
   Prefer `game.ctx` / `createGameContext(game)` (see `js/core/GameContext.js`). Cross-system calls go through the Game bag / context, not `import { CombatSystem } from …` inside HuntSystem.

3. **Do not widen `GAME_CONTEXT_KEYS` casually.**  
   Adding a key requires: this doc §5 update + integrity test update + justification (template need vs game convenience).

4. **Skill effect handler keys are locked in registry.**  
   `js/systems/combat/skillEffectRegistry.js` lists every `skillHandlers` / `energyHandlers` key.  
   New active skill effect → update registry + CombatSystem map + content in **one** change set.  
   `assertHandlerKeys` runs at CombatSystem construct time.

5. **Asset clone refcounts use `clones`, not a floor of 1.**  
   `AssetManager`: `loadModel` → `clones: 0`; `cloneModel` increments; `releaseModel` decrements to ≥0; `purgeUnused` only frees `clones === 0`.  
   Do not reintroduce `Math.max(1, refs - 1)`.

6. **No CDN / no vendor edits** for Three. Unchanged project policy.

7. **Camera shake / hitStop stay no-ops.** Unchanged project policy.

8. **English docs + English player UI.** Unchanged project policy.

---

## 3. Template-candidate modules (extractable core)

These may move to `packages/template-3d` later **with minimal API change**.  
Mark new shared utilities only if they stay game-content-free.

| Path | Responsibility | Public surface (keep stable) |
|------|----------------|------------------------------|
| `js/core/Utils.js` | math / pick / noise | pure functions |
| `js/core/Input.js` | keyboard / pointer | Input class |
| `js/core/GameContext.js` | narrow runtime facade factory | `createGameContext`, `GAME_CONTEXT_KEYS` |
| `js/assets/AssetManager.js` | GLTF load, clone, purge | load/clone/release/purge/dispose *(known coupling: fallback meshes import ModelFactory — inject at T3)* |
| `js/assets/AssetManifest.js` | manifest helpers | loadAssetManifest, modelUrl, animationMap |
| `js/assets/TextureCache.js` | texture refcount | acquire/release/dispose |
| `js/graphics/RenderPipeline.js` | WebGL + quality presets | RenderPipeline, QUALITY_PRESETS |
| `js/graphics/LightingSystem.js` | sun / hemi / fog hooks | LightingSystem |
| `js/graphics/PostProcessSystem.js` | composer passes | PostProcessSystem |
| `js/graphics/OutlineSystem.js` | outline pass helper | OutlineSystem |
| `js/graphics/Effects.js` | **primitive** VFX only | burst, ring, slash, trail, pillar, impact, pools, setQuality — **not** skill identity |
| `js/graphics/Materials.js` | shared material helpers | toon/sprite helpers |
| `js/graphics/StylizedMaterial.js` | cel material | convertToStylized, setMaterialHitPulse |
| `js/characters/CharacterAnimationController.js` | mixer + locomotion bands + one-shots | play, playOneShot, setLocomotion, scheduleNormalized, update, dispose |
| `server.mjs` | static file server | optional template tooling |
| `vendor/**` | Three r160 local | do not edit |

**Effects recipes** named `recipe*` that encode Sol skill silhouettes are **game presentation**, even if they live in `Effects.js` today. When extracting, either:

- move recipes to `sol-arpg` and keep primitives in template, or  
- pass recipe packs into Effects at construct time.

Until then: **do not add Sol skill names into AssetManager / GameContext / AnimationController.**

---

## 4. Game-owned modules (must stay in sol-arpg)

| Path | Responsibility |
|------|----------------|
| `js/data/content.js` | zones, monsters, skills, classes, gear |
| `js/data/skillCombat.js` | skill math, forms, mutations |
| `js/data/fxThemes.js` | theme tokens |
| `js/data/rushContent.js` | Rift Rush tables |
| `js/config.js` | Sol tuning constants |
| `js/systems/CombatSystem.js` | hit authority + skill handlers |
| `js/systems/combat/skillEffectRegistry.js` | locked effect id list |
| `js/systems/*` (Hunt, Defense, Rush, Loot, Enemy, XpGem) | mode / spawn / progression |
| `js/entities/Player.js`, `Enemy.js` | Sol entity rules |
| `js/characters/CharacterFactory.js`, `MonsterFactory.js` | Sol looks / kits |
| `js/graphics/ModelFactory.js` | Sol fallback SDF heroes/props (game look) |
| `js/graphics/ProjectileMeshes.js` | Sol projectile styles |
| `js/ui/UI.js` | full HUD / panels (DOM ids in index.html) |
| `js/core/Game.js` | orchestration, modes, save flush |
| `js/core/SaveManager.js` | Sol save schema |
| `js/core/AudioManager.js` | Sol SFX banks (may later split thin wrapper) |
| `tools/assets/generate_assets.mjs` | Sol hero/monster bake |
| `index.html`, `css/game.css` | Sol shell |

---

## 5. GameContext contract

**File:** `js/core/GameContext.js`  
**Factory:** `createGameContext(game)` → frozen object with **live getters**.

### Allowed keys (`GAME_CONTEXT_KEYS`)

`player`, `enemies`, `combat`, `effects`, `audio`, `world`, `ui`, `camera`, `assets`, `mode`, `state`, `quality`, `debugEnabled`, `delta`, `elapsed`, `save`, `input`

### System constructor pattern (required for new systems)

```js
constructor(game) {
  this.game = game;                           // full bag (legacy + rare needs)
  this.ctx = game?.ctx ?? createGameContext(game); // prefer for service access
}
```

`Game` constructs `this.ctx = createGameContext(this)` in the constructor **before** systems are created.

### Forbidden

- Putting Sol-only fields on context without doc + test (`skillDraft`, `riftSeed`, …)  
- Systems importing each other to reach `player` / `effects`

---

## 6. Asset lifetime contract

| API | Semantics |
|-----|-----------|
| `loadModel(key)` | Cache source GLTF; `clones = 0` |
| `cloneModel(key)` | `clones += 1`; returns `{ scene, animations, release }` |
| `releaseModel(instance\|key)` | `clones = max(0, clones - 1)` |
| `purgeUnused()` | Dispose entries with `clones === 0`; returns removed count |
| `Game.purgeUnusedAssets()` | Calls `assets.purgeUnused` after run teardown (`returnToTitle`) |

Callers that `cloneModel` **must** eventually `release` (or equivalent dispose path that releases).  
Do not purge while live enemies/heroes still reference clones.

---

## 7. Combat registry contract

**File:** `js/systems/combat/skillEffectRegistry.js`

- `SKILL_EFFECT_HANDLER_KEYS` — must equal `Object.keys(combat.skillHandlers)`  
- `ENERGY_HANDLER_KEYS` — must equal `Object.keys(combat.energyHandlers)`  
- Active `SKILLS[].effect` for non-passives must be ∈ skill keys  

Handler **bodies** remain private methods on `CombatSystem` until a deliberate split.  
Registry owns **names only** so template extraction does not drag Sol skills into core.

---

## 8. Extraction roadmap (frozen sequence)

Do **not** skip steps.

| Step | Action | Exit |
|------|--------|------|
| **T0** | This document + `tests/template-boundary.mjs` | **done** |
| **T1** | Systems use `ctx` for new code; no new system↔system imports | **done** (constructors capture `this.ctx`) |
| **T2** | Split skill/energy **implementations** under `systems/combat/` | **done** (`activeSkillMethods`, `energyBurstMethods`, `createSkillHandlers`) |
| **T3** | Physical `packages/template-3d` entry re-exporting §3 candidates | **done** |
| **T4** | Sol imports template package (`Game`, factories); integrity green | **done** |
| **T5** | Minimal template-only consumer harness | **done** (`packages/template-3d/consumer-harness.mjs`) |

**Do not** move Sol content/modes/UI into `packages/template-3d`. Further extraction may relocate file bodies behind the same entry without changing import surface.

---

## 9. Agent / PR checklist

Before merging architecture-touching changes:

- [ ] Did not add `content.js` imports into §3 modules  
- [ ] New system has `this.ctx = game?.ctx ?? createGameContext(game)`  
- [ ] New skill effect updated `skillEffectRegistry.js` + CombatSystem + content  
- [ ] Asset release paths still balance clone/release  
- [ ] `node tests/integrity.mjs` (includes template-boundary) passes  
- [ ] This file updated if keys/layers changed  

---

## 10. Related docs

- [architecture.md](./architecture.md) — runtime folders and boot  
- [assets.md](./assets.md) — manifest loading  
- [combat.md](./combat.md) — hit authority  
- [characters-visual.md](./characters-visual.md) — clip catalogs  
- [plan/static-resource-character-motion.md](./plan/static-resource-character-motion.md) — bake-only motion  

**End of locked boundary.**
