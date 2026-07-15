# Plan: Weapon Visual Scale (1.5×) + Detail Enhancement

**Status:** Phase 1 implemented (`WEAPON_VISUAL_SCALE = 1.5` in CharacterFactory); Phase 2+ optional after playtest  
**Goal:** Make equipped weapons readable at play camera distance (especially rogue daggers), then optionally improve mesh detail without changing combat balance.

## Goals

1. **Immediate:** Scale **all weapon kinds ~1.5×** for every class so weapons read clearly on-screen.
2. **Design:** Document how weapon meshes are built and equipped, and outline optional detail upgrades that do not break hit detection.

---

## Current architecture

| Layer | Where | Role |
|-------|--------|------|
| Procedural mesh bake | `tools/assets/generate_assets.mjs` → `createWeapon` / `createStaff` / `createBow` | Builds GLBs under `assets/models/props/weapon_*.glb` |
| Runtime equip | `js/characters/CharacterFactory.js` → `equipWeapon` | Clones `weapon.<kind>`, parents to `weapon_socket` (rogue dual-wield also `offhand_socket`) |
| Visual scale | `WEAPON_LENGTH[kind]` (Y), `WEAPON_GIRTH[kind]` (X/Z) | Applied as `weapon.scale.set(girth, length, girth)` |
| Character body scale | `CLASS_LOOKS[*].scale` (~0.92–0.96) | Multiplies the whole hero including socketed weapons |
| Combat range | `getMeleeProfile` / `HERO_CLASSES.meleeProfile` (`range`, `rangeMult`, etc.) | **Independent of mesh length** (by design) |
| Anchors | `blade_base` / `blade_tip` Object3Ds on weapon root | Used for FX origins; positions are in local mesh space (scale inherits from weapon) |

### Why rogue weapons disappear

| Factor | Dagger | e.g. Katana / sword |
|--------|--------|---------------------|
| Bake base length (`createWeapon` specs) | **0.98** | 1.55–1.72 |
| Runtime `WEAPON_LENGTH` | **0.78** | 1.27–1.48 |
| Runtime `WEAPON_GIRTH` | **1.0** | 1.22–1.28 |
| Body scale (rogue) | **0.92** | aerin 0.96 |
| Dual-wield | two small daggers, mirrored offhand | single larger blade |

Dagger length is already ~0.6× of a sword at bake time, then further reduced by `WEAPON_LENGTH` 0.78. Net effect: short, thin, low-contrast mint steel on dark leather — easy to miss at play camera distance.

The `WEAPON_LENGTH` block comment notes blades were reduced to ~70% of a previous overlong size.

### Detail level today

`createWeapon` is already more than a simple box: extruded blade silhouette, tube guard, grip, pommel, rune plate, fuller grooves, grip wrap rings, guard caps, pommel gem. Staff/bow have their own light detail passes.

**Limits:**

- Shared template for most blade kinds (same guard curve / handle length; only `bladeShape` + length/width/depth differ).
- No per-class ornament (rogue uses the same dagger mesh as loot daggers).
- Materials: stylized convert + rarity color on metal/rune; maps stripped (`material.map = null`).
- No LODs / normal maps; silhouette + cel shading only.

**Conclusion:** Runtime scale is the high-leverage fix. Deeper mesh detail is feasible in the bake pipeline but optional; it will not fix “can’t see the dagger” without scale first.

---

## Design principles

1. **Visual ≠ hit** — Do **not** auto-scale combat `range` / `rangeMult` with mesh size. Keep reach as balance data. If after 1.5× the blade looks longer than the hit cone, tune FX arc or profile only if playtest complains.
2. **One global knob** — Prefer a single `WEAPON_VISUAL_SCALE` so future tuning is one place (tables keep relative proportions).
3. **All classes / all kinds** — sword, saber, greatsword, katana, leaf, relic, staff, dagger, bow; main + rogue offhand use the same length/girth path.
4. **No `vendor/` edits.** Prefer runtime scale over re-baking unless silhouette/shape changes are desired.
5. **Scope discipline** — Phase 1 is scale only. Detail bake is Phase 2+ only if still wanted after scale.

---

## Phase 0 — Persist plan as repo doc (done when this file lands)

1. Create this document under `docs/plan/`.
2. Link from `docs/README.md` plan table.
3. Do not implement code until Phase 1 is requested.

---

## Phase 1 — Global 1.5× visual scale (implement when requested)

**Primary change:** `js/characters/CharacterFactory.js`

```js
// New constant next to WEAPON_LENGTH / WEAPON_GIRTH
const WEAPON_VISUAL_SCALE = 1.5;

// In equipWeapon (main + offhand):
const length = (WEAPON_LENGTH[kind] ?? 1.25) * WEAPON_VISUAL_SCALE;
const girth  = (WEAPON_GIRTH[kind]  ?? 1.2)  * WEAPON_VISUAL_SCALE;
weapon.scale.set(girth, length, girth);
// offhand keeps mirror: scale.set(-girth, length, girth)
```

**Why a multiplier instead of editing every table cell:**

- Clear intent in code and docs.
- Easy to retune (1.4 / 1.6) without arithmetic on each row.
- Tables keep relative proportions (dagger still shorter than greatsword).

### Optional dagger readability boost

After global 1.5×, dagger can remain the smallest kind. If still unreadable in-game, raise dagger table bases **on top of** the global scale (example):

| Key | Current | After 1.5× only | Optional dagger boost |
|-----|---------|-----------------|------------------------|
| `WEAPON_LENGTH.dagger` | 0.78 | effective ~1.17 | raise base to ~0.95–1.05 then ×1.5 |
| `WEAPON_GIRTH.dagger` | 1.0 | effective 1.5 | raise base to ~1.15 then ×1.5 |

**Recommendation:** ship pure 1.5× first; add dagger bias only if still too small.

### Docs + validation

- Update `docs/characters-visual.md` Weapons section: document `WEAPON_VISUAL_SCALE` and that combat range is independent of mesh length.
- Run `node tests/integrity.mjs`.
- Manual: each class starter weapon; rogue dual daggers; greatsword / staff / bow if available.

### Out of scope for Phase 1

- Rebake GLBs
- `meleeProfile.rangeMult` / skill ranges
- Socket position/rotation (unless clipping after scale — see risks)
- `CLASS_LOOKS.scale` (body scale)

---

## Phase 2 — Optional mesh detail (after Phase 1 playtest)

Only if weapons still look blob-like or class identity is weak.

| Enhancement | Touch point | Cost | Notes |
|-------------|-------------|------|-------|
| Thicker dagger silhouette in bake | `createWeapon` dagger `length`/`width` + `bladeShape` | Low | Complements scale; better edge read |
| Per-kind guard / pommel kits | branch on `kind` in `createWeapon` | Medium | e.g. katana tsuba, short dagger crossguard |
| Class accent on equip | `equipWeapon` tint/emissive by `refs.classId` | Low | Rogue mint glow on runes without new mesh |
| Higher bevel / fuller | Extrude + fuller dims | Low–med | More tris; fine for 1–2 weapons |
| True high-poly / custom GLB | external art + manifest | High | Overkill for demo unless artist assets exist |

**Bake when mesh changes:**

```bash
node tools/assets/generate_assets.mjs --dagger-only   # or full weapons export
node tests/integrity.mjs
```

Do **not** rebake only to achieve 1.5× — runtime scale already multiplies the existing mesh.

---

## Phase 3 — Polish (optional)

- Slight socket offset if large blades clip hip/hand after scale.
- Outline: optional higher priority/distance for weapons only (`OutlineSystem`).
- Swing FX length uses combat `range`, not mesh — no fairness change required for Phase 1.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Blade clips body / camera | Watch greatsword/staff at 1.5×; lower only those kinds or nudge `weapon.position` |
| Offhand mirror scale wrong | Keep `(-girth, length, girth)`; only multiply magnitude |
| “Feels unfair” longer weapons | Combat range unchanged |
| 3D previews elsewhere | Confirm any UI path that clones weapons uses the same equip scale |
| Save / integrity | No save schema change |

---

## Implementation checklist

### Phase 0 (docs)

1. Write `docs/plan/weapon-visual-scale-detail.md`.
2. Add row in `docs/README.md` plan table.

### Phase 1 (code — later)

1. Add `WEAPON_VISUAL_SCALE = 1.5` next to `WEAPON_LENGTH` / `WEAPON_GIRTH` in `CharacterFactory.js`.
2. Apply multiplier when setting main and offhand `scale`.
3. Update `docs/characters-visual.md` Weapons section (1–2 sentences).
4. Run integrity; spot-check all four classes in browser (`node server.mjs` → `http://127.0.0.1:8777`).
5. If rogue still too small: raise dagger table bases slightly (not combat range).

---

## Non-goals

- Changing hitboxes / skill damage / energy systems.
- Replacing procedural weapons with third-party models.
- Editing `vendor/` Three.js.
- Auto commit/push.

---

## Success criteria

- Plan is discoverable under `docs/plan/` and linked from `docs/README.md`.
- (After Phase 1) Every class’s equipped weapon is clearly visible at default play camera distance.
- Relative kind proportions preserved (dagger &lt; sword &lt; greatsword).
- Rogue dual daggers readable without cartoon oversize vs body (optional dagger bias if needed).
- No combat balance regression from scale alone.
- Docs match the single scale knob.

---

## Suggested order

1. Phase 0: this document + README link.
2. Phase 1: code + `characters-visual` note when requested.
3. Playtest scale; optionally dagger-only table tweak.
4. Phase 2 bake detail only if still desired.
