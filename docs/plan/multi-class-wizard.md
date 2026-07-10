# Plan · Multi-Class Heroes + Wizard GLB

**Status:** implemented (multi-class architecture + full wizard combat kit + facing-aligned attacks + import-integrity)  
**Agent guides:** [../agent/README.md](../agent/README.md)  
**Feasibility:** **Yes** — class registry, per-class skills/handlers, bake pipeline.  
**Constraint:** Keep Hunt / Defense isolation, shared combat geometry contracts, and local-only assets (`vendor/` untouched).

---

## 1. Goal / Non-goal

### Goal (this delivery)

1. Introduce a **class registry** so future jobs (rogue, knight, …) are additive data + asset + look kit.
2. Bake a new **wizard** hero GLB (LOD0/LOD1) via the existing script pipeline.
3. Wire runtime so the player can appear as wizard while Hunt/Defense/combat still run on the current architecture.
4. Preserve **Aerin / default hunter** as the safe default (no regression for existing save/continue when class missing).

### Non-goal (defer)

| Item | Why defer |
|------|-----------|
| Full unique skill trees / magic damage model | Combat is hard-coded to 4 sword skills; redesign is a second PR |
| Staff projectile combat | Hit cones stay position-based; staff can be visual-only first |
| Armor re-skinning body mesh | No pipeline today |
| Mid-run class swap UI | One player instance per session; rebuild only at run start |
| Replacing Aerin GLB | Keep `hero.aerin` paths stable |

**V1 principle:** *Class = identity + look + starter kit (+ optional later skill list). Combat API stays shared.*

---

## 2. Current architecture (why multi-class is possible)

```
tools/assets/generate_assets.mjs
  createHero() → aerin_lod0/1.glb  (SDF body + shared skeleton + heroAnimations)

assets/manifests/assets.json
  "hero.aerin" → lods + animationMap

Game.initialize
  preload ALL manifest models
  new Player → CharacterFactory.createHero()  // HARDCODED hero.aerin
  + ANIME palette + attachAnimeHair (rogue hood)

Hunt / Defense
  same Player mesh; modes only gate systems, not appearance
```

**Contracts already shared (must keep):**

| Contract | Detail |
|----------|--------|
| Bones | `heroSkeleton` names (`head`, `weapon_socket`, arm/leg chains, …) |
| Clips | `idle`, `run`, `sprint`, `attack_1`–`4`, `dodge`, `hit`, `death`, `skill_*` |
| Socket | object named `weapon_socket` for `equipWeapon` |
| Factory return | `{ group, refs, animation }` |
| Material roles | name tokens → `inferMaterialRole` (`hero_skin`, `hero_cloth`, …) |
| Fallback | any `hero.*` key → `createHeroModel()` |

**Hard locks today (must open):**

- `CharacterFactory.createHero` → always `hero.aerin`
- Single `ANIME` + always `attachAnimeHair` (hood stacks on baked hair)
- `Player` has no `classId`; starter always katana; name always `Kai`
- No title class pick; save has no class field

---

## 3. Target design

### 3.1 Class registry (data layer)

Add **`HERO_CLASSES`** in `js/data/content.js` (pure data, no Three.js):

```js
// Conceptual shape
HERO_CLASSES = {
  aerin: {
    id: 'aerin',
    name: 'Aerin',           // display name default
    title: 'Field Hunter',
    modelKey: 'hero.aerin',  // manifest key
    lookId: 'aerin',         // factory look kit id
    starterWeapon: { /* blade / katana starter */ },
    // Future hooks (optional in V1, may be unused):
    skillIds: null,          // null = use global SKILLS as today
    baseStatMods: null,      // null = PLAYER_CONFIG defaults
  },
  wizard: {
    id: 'wizard',
    name: 'Lyra',
    title: 'Arcane Adept',
    modelKey: 'hero.wizard',
    lookId: 'wizard',
    starterWeapon: { /* staff-like weapon using existing weapon.model or new 'relic' */ },
    skillIds: null,
    baseStatMods: null,
  },
};
DEFAULT_HERO_CLASS_ID = 'aerin';
```

**Extension rule for a future job:**

1. Add row to `HERO_CLASSES`
2. Bake `hero.<id>` GLB + manifest entry
3. Add `CLASS_LOOK[id]` (palette + head kit)
4. Optional later: skill list / combat strategy

No new system files required for another visual class.

### 3.2 Runtime factory (visual seam)

`CharacterFactory.createHero(options)`:

```
classId = options.classId ?? DEFAULT
def = HERO_CLASSES[classId] ?? HERO_CLASSES.aerin
cloneModel(def.modelKey)
apply CLASS_LOOK[def.lookId].palette by material role
attach head kit ONLY for that look (or skip if kit is 'none' / baked-in)
outlines + weapon_socket + AnimationController  // unchanged contract
```

**Look kits** live next to factory (or thin `js/characters/HeroLooks.js`):

| lookId | Palette | Head kit |
|--------|---------|----------|
| `aerin` | Current rogue/hunter `ANIME` | Current hood OR bake-aligned hair only (decide: prefer **not double-stacking** if GLB already has hair) |
| `wizard` | Cool arcane blues / indigo cloth / pale gold trim / violet eyes | Wizard hat + longer hair / no face mask |

**Aerin default behavior:** if class missing or unknown → aerin (byte-stable for old saves).

### 3.3 Player lifecycle

| Point | Behavior |
|-------|----------|
| `Player` | `this.classId`; constructor / `applyClass(classId)` builds or rebuilds mesh via factory |
| `reset(classId?)` | Apply class defaults (name, title seed, starter from table) without losing architecture |
| `serialize` | Include `classId` |
| `load` | Merge `classId`; if mesh class ≠ saved class, **rebuild hero mesh once** |
| `Game.newGame({ classId })` / `startDefense({ classId })` | Pass selected class |
| `continueGame` | Use saved `classId` |

**Mesh rebuild:** dispose previous group (geometry/materials via existing `disposeObject` if available), factory-create new, re-add to scene, re-equip weapon. Only at title → play or load — not every frame.

### 3.4 Title selection (minimal)

- Title screen: class cards or segmented control under New Hunt / Defense  
  - e.g. **Hunter (Aerin)** · **Wizard**
- Selected `classId` stored on UI/Game until start
- Continue ignores selector (uses save)
- Optional debug: `?class=wizard` for QA

Player-facing strings: **English** (per recent project direction for this English game).

### 3.5 Save schema

- Add `player.classId` (string)
- Bump `saveVersion` **3 → 4**
- Load path: missing `classId` → `'aerin'` (no forced wipe)
- Do **not** change `saveKey` casually

### 3.6 Combat / skills in V1

**Keep shared skill IDs and CombatSystem paths.** Wizard plays the same hunt loop with a different look and starter weapon silhouette.

Rationale: architecture for jobs first; magic-specific combat is a deliberate second feature that would touch `CombatSystem`, HUD slots, and skill unlock tables.

**Hooks left open:**

- `HERO_CLASSES[id].skillIds` reserved
- HUD can later iterate skillIds instead of hard-coded four buttons

---

## 4. Wizard visual design (asset)

### 4.1 Bake approach (required architecture)

In `tools/assets/generate_assets.mjs`:

1. Extract shared pipeline from `createHero`:
   - `heroSkeleton`, `heroBodyGeometry` (optional slight proportion tweaks via params), `heroSkinRules`, `heroAnimations`, `exportGLB`
2. Introduce `createHeroVariant(visualSpec, resolution)` **or** `createWizard(resolution)` that:
   - **Reuses the same skeleton + same 14 clips** (non-negotiable for V1)
   - Changes materials, hair SDF, cape color/shape, optional hat as child of `head` / `hair_root`
3. Export:
   - `assets/models/hero/wizard_lod0.glb` (res ~52)
   - `assets/models/hero/wizard_lod1.glb` (res ~38)
4. Keep existing Aerin export paths unchanged

### 4.2 Wizard art direction (procedural SDF — consistent with Aerin)

| Element | Direction |
|---------|-----------|
| Silhouette | Same humanoid proportions; slightly fuller robe (cloth SDF / longer cape) |
| Colors (baked base) | Indigo / deep blue cloth, soft skin, silver-white or ash hair, gold trim |
| Head | Pointed hat or wide brim (mesh parented to `head`); longer hair SDF; **no** thief mask |
| Eyes | Brighter violet / cyan (role `eye`) |
| Cape | Longer / more draped; cooler color |
| Accessories | Collar amulet, sash (optional torus/box details) |
| Weapon socket | Still `weapon_socket` on `right_hand` |
| Starter weapon | Prefer existing `relic` or `leaf` model as “arcane focus,” or thin new `weapon.staff` if time allows (staff = prop only; hit range still from combat config) |

### 4.3 Runtime vs bake ownership

Avoid double hair:

- **Preferred:** bake hat + hair into wizard GLB; factory `look.hair = 'none'` for wizard (or only subtle glow accents).
- **Aerin:** either keep runtime hood kit as today, or gradually move hood into bake later — V1 can leave Aerin path as-is for regression safety.

### 4.4 Manifest

```json
"hero.wizard": {
  "type": "character",
  "lods": {
    "high": "./assets/models/hero/wizard_lod0.glb",
    "medium": "./assets/models/hero/wizard_lod1.glb",
    "low": "./assets/models/hero/wizard_lod1.glb"
  },
  "animationMap": { /* same keys as hero.aerin */ }
}
```

Preload already loads all model keys — no Game preload list change.

---

## 5. Implementation phases

### Phase A — Class data seam (no art yet)

| Step | Files |
|------|--------|
| A1 | Add `HERO_CLASSES`, `DEFAULT_HERO_CLASS_ID`, helpers in `content.js` |
| A2 | `CharacterFactory.createHero({ classId, quality })` uses `modelKey` + look kit map; default aerin |
| A3 | `Player` stores `classId`; `reset`/`serialize`/`load`; mesh rebuild helper |
| A4 | `Game.newGame` / `startDefense` accept classId; title UI selection |
| A5 | `saveVersion` 4 + load default merge |
| A6 | Docs: `characters-visual.md`, short note in `extension-playbooks` “add a hero class” |

**Exit criteria:** selecting class changes name/starter; still shows Aerin mesh until Phase B.

### Phase B — Wizard GLB bake + look kit

| Step | Files |
|------|--------|
| B1 | Refactor `generate_assets.mjs` shared hero core; add wizard visual variant |
| B2 | Run bake → write `wizard_lod0/1.glb` |
| B3 | Register `hero.wizard` in `assets.json` |
| B4 | `CLASS_LOOK.wizard` palette + head kit (if any runtime pieces) |
| B5 | Starter weapon choice for wizard (relic/staff visual) |
| B6 | Integrity: optional assert hero model paths exist; smoke run Hunt + Defense as wizard |

**Exit criteria:** New Hunt as Wizard shows distinct silhouette/hat/robe; weapons equip; anims play; Defense waves work; Continue with aerin still works.

### Phase C — Future (not this PR unless requested)

- Class-specific skills / HUD generation
- Staff cast VFX + combat branch
- `?class=` documented in save-and-run
- Procedural fallback `createHeroModel(classId)`

---

## 6. File touch list (expected)

| File | Change |
|------|--------|
| `js/data/content.js` | `HERO_CLASSES` + exports |
| `js/characters/CharacterFactory.js` | class-keyed createHero / looks |
| `js/entities/Player.js` | classId, starter from table, rebuild |
| `js/core/Game.js` | pass classId on newGame / startDefense |
| `js/ui/UI.js` + `index.html` | class select UI (English) |
| `js/config.js` | `saveVersion: 4` |
| `tools/assets/generate_assets.mjs` | wizard variant + export |
| `assets/models/hero/wizard_lod*.glb` | new binaries |
| `assets/manifests/assets.json` | `hero.wizard` |
| `docs/characters-visual.md` | multi-class + wizard notes |
| `docs/extension-playbooks.md` | “Add a hero class” recipe |
| `tests/integrity.mjs` | light checks for `hero.wizard` paths / HERO_CLASSES |

**Must not touch:** Hunt/Defense system ownership rules, `vendor/`, combat hit math (unless starter weapon range must match visual later).

---

## 7. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Hood + hat double stack on aerin/wizard | Per-look hair kit; wizard bake owns head gear |
| Runtime palette overrides bake colors poorly | Align `CLASS_LOOK.wizard` with bake materials; keep role names |
| Save without classId | Default `'aerin'`; version bump |
| Mesh rebuild leaks GPU resources | Use existing dispose helpers on old group |
| Animation missing on new GLB | **Reuse `heroAnimations` literally** — do not rename clips |
| Weapon floating on wizard hands | Keep socket bone path identical to aerin skeleton |
| Full `generate_assets.mjs` regenerates all assets | Prefer hero-only export path or run full bake once carefully; commit only wizard (+ aerin if unchanged hashes) |
| Scope creep into magic combat | Explicit V1 boundary in PR description |

---

## 8. Validation checklist

1. `node tools/assets/generate_assets.mjs` (or hero-only) produces wizard GLBs  
2. `node tests/integrity.mjs` passes (after any new assertions)  
3. `node server.mjs` → title  
4. New Hunt as **Aerin** — same as today  
5. New Hunt as **Wizard** — hat/robe/palette distinct; move/attack/skill clips fire  
6. Equip loot weapon — socket works  
7. Death / continue — class persists for Hunt save  
8. Defense mode as Wizard — waves, death → title, no Hunt blob corruption  
9. Old save without `classId` loads as Aerin  

---

## 9. Recommendation

| Question | Answer |
|----------|--------|
| Can we design a new character? | **Yes** |
| Can we bake a new wizard GLB with the existing script architecture? | **Yes** — fork visual layers, share skeleton + animations |
| Best multi-class shape for future jobs? | **`HERO_CLASSES` data + `hero.<id>` asset + look kit** (mirror monster archetype pattern) |
| V1 combat magic rewrite? | **No** — keep shared skills; open hooks only |

**Suggested delivery order after approval:** Phase A (seam) → Phase B (wizard GLB + look) → manual QA → commit (only when asked).

---

## 10. Open choices (defaults if not specified)

| Choice | Default for implementation |
|--------|----------------------------|
| Default class | `aerin` |
| Wizard display name | `Lyra` (easy to change in `HERO_CLASSES`) |
| Wizard starter weapon model | `relic` (existing GLB; “arcane focus”) unless staff prop is cheap |
| Title UX | Two class buttons / cards before New Hunt & Defense use selection |
| Aerin runtime hood | Keep as today for zero visual regression |
| Wizard head gear | Baked into GLB; runtime hair attach off |

---

## 11. Success definition

- Architecture supports **N classes** by adding data + GLB + look kit without rewriting Game/Hunt/Defense.
- Wizard is a **playable distinct hero look** with real baked GLBs, not only a palette swap on Aerin.
- Aerin path remains the default and continues to load old saves cleanly.
