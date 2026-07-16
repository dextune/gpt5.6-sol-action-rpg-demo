# Plan · Presentation & Motion Backlog

**Status:** implemented (2026-07-15)  
**Captured:** 2026-07-15 — items from graphics-refinement review and combat-pose polish.  
**Shipped validation:** `tests/presentation-motion.mjs` nested by `tests/integrity.mjs`.  

**Related:**

- [graphics-vfx.md](../graphics-vfx.md) — Effects API, recipes, quality LOD  
- [extension-playbooks.md](../extension-playbooks.md) §3 · §6 — skill spectacle · hit-feel levers  
- [skill-motion-spectacle.md](./skill-motion-spectacle.md) — skill identity / recipe standard  
- [horde-clear-roadmap/04-hit-feel-polish.md](./horde-clear-roadmap/04-hit-feel-polish.md) — swing trail, stagger, multihit coalesce  
- [short-session-polish.md](./short-session-polish.md) — status residual / recipe micro-pass  
- [level-100-skill-evolution/motion-vfx.md](./level-100-skill-evolution/motion-vfx.md) — advanced recipes  
- [characters-visual.md](../characters-visual.md) — bake holds, combat clips  

**Hard constraints (still enforced):**

| Rule | Detail |
|------|--------|
| No camera shake / hitStop | `Game.shake` / `Game.hitStop` stay no-ops |
| No real PointLight for VFX | Additive sprites only |
| Pool + quality LOD | Particle counts quality-scaled |
| Architecture layering | content → combat → Effects / audio → renderer |
| English docs · English UI | Project policy |

---

## 0. Prior pose bake (prerequisite, already shipped)

| Item | Where |
|------|--------|
| Hold-forward for omitted animation bones | `tools/assets/generate_assets.mjs` `animationClip` |
| Per-class combat-ready idle / run holds | `classWeaponHold` |
| Full-body attack / cast key structure | `buildClassCombatClipSpecs` |
| Skill clip denser windup / peak / settle | `heroAnimations` |
| Hero GLB rebake (all classes) | `assets/models/hero/*` |
| Longer attack / skill crossfades | `js/entities/Player.js` |

---

## 1. Goal

Combat presentation (VFX, hit feel, status readability, motion identity) without reworking item meshes, character topology, or world/terrain.

Priority: **recipe layers → particles (LOD) → themed SFX → knockback/stagger → (last) weak lunge**. Never palette-only skill twins.

---

## 2. Packages — exit status

### P1 — Skill VFX recipe micro-pass · **done**

| Exit | Evidence |
|------|----------|
| Named recipes denser silhouettes | `Effects.recipeSpinStorm` extra mid slash + finale decal; `recipeFireBlast` dual ring + scorch; full recipe set on actives |
| Theme tokens, not palette-only twins | Every active has `theme` + `recipe`; `getFxTheme` resolves |
| Quality LOD | `scaleCount` / `Effects.setQuality` |

### P2 — Multihit coalesced impact · **done**

| Exit | Evidence |
|------|----------|
| ≥3 hits → centroid `impact` + lite sparks | `CombatSystem.#resolveMultiHits` (`coalesceVfx`, `liteImpact`, scale `1.6 + 0.25×hits` capped ~4) |

### P3 — Directional enemy stagger · **done**

| Exit | Evidence |
|------|----------|
| Hit axis squash differs L/R | `Enemy.hitDir` + `#animate` local projection |
| Stun stack cap ~0.4s | `hitTimer = Math.min(0.4, …)` |

### P4 — Weapon swing trail · **done**

| Exit | Evidence |
|------|----------|
| Blade base→tip sampling | `CombatSystem.#bladeTrailSamples` + `Effects.swingTrail({ base, tip })` |
| Fallback without bones | Facing ribbon when staff/magic |

### P5 — Status residual VFX · **done**

| Exit | Evidence |
|------|----------|
| Named helpers | `statusBurnEmber`, `statusSlowRing`, `statusBleedDrip`, `statusExposeMark` |
| Enemy tick wiring | `Enemy.#tickStatuses` / `applyStatus` |

### P6 — Anim-timeline / hit-frame sync · **done**

| Exit | Evidence |
|------|----------|
| Normalized hit cues | `Player.trySkill` → `scheduleNormalized` on `bundle.timeline.hits` |

### P7 — Class motion vocabulary · **done** (asset-free + holds)

| Exit | Evidence |
|------|----------|
| Class holds | `classWeaponHold` knight/wizard/ranger/rogue |
| Class combat clips | Rogue dual kit; shared full-body kit + unique skill clips; per-class GLBs |
| Note | Unique Level 60/100 mocap clips remain optional future production (asset-free exception stays) |

### P8 — Advanced named recipes · **done**

| Exit | Evidence |
|------|----------|
| Class-defining recipes | `recipeVortexPull`, `recipeGroundFracture`, `recipeDualBladeCross`, `recipeShadowCuts`, `recipeLivingStar`, `recipeCrystalDominion`, `recipeSpaceSeam`, `recipeGravityLens`, `recipeThornGrid`, ranger recipes, etc. |

### P9 — Audio layering · **done**

| Exit | Evidence |
|------|----------|
| Combo-weighted hit | `AudioManager.hit(..., { combo })` |
| Material gel/stone | `{ material }` + `CombatSystem.#hitMaterialFor` |
| Multihit smash | Burst window low-end layer |
| Themed skill / apex | `skill(theme)`, `APEX_AUDIO_PROFILES` |

### P10 — Post / lighting micro-tune · **done**

| Exit | Evidence |
|------|----------|
| Bloom / grade by quality | `PostProcessSystem.applyQuality` high bloom `.11`, warmth `.04`; SSAO high-only |

---

## 3. Explicit non-goals (unchanged)

- Re-enable shake / hitStop  
- Full-screen hit flash every hit  
- Real PointLight VFX  
- Terrain / item / character mesh overhaul  
- Full skill tree / mouse aim / mocap packs  

---

## 4. Acceptance checklist

- [x] P1 recipe micro-pass  
- [x] P2 multihit coalesce  
- [x] P3 directional stagger  
- [x] P4 swing trail (bone samples)  
- [x] P5 status residual helpers  
- [x] P6 timeline hit sync  
- [x] P7 class holds / clips / GLBs  
- [x] P8 advanced recipes  
- [x] P9 audio material/combo/multihit  
- [x] P10 post micro-tune  
- [x] Constraints (no shake/hitStop/PointLight)  
- [x] `tests/presentation-motion.mjs` + integrity nesting  

---

## 5. File map

```
js/graphics/Effects.js          recipes, swingTrail, status helpers, pools, LOD
js/data/fxThemes.js             theme tokens, particle mul
js/data/content.js              SKILLS combat / theme / recipe / timeline
js/systems/CombatSystem.js      coalesce, blade samples, material map, handlers
js/entities/Enemy.js            stagger, status residual ticks
js/entities/Player.js           cast/attack fade, timeline schedule
js/core/AudioManager.js         hit material/combo/multihit, skill banks
js/graphics/PostProcessSystem.js bloom/grade quality
tools/assets/generate_assets.mjs holds + combat clips
tests/presentation-motion.mjs   P1–P10 verification
```
