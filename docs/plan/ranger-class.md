# Plan · Ranger (Archer / Huntress) Hero Class

**Status:** implemented (v1 kit + bake + handlers; polish as needed)  
**Product name (working):** Ranger · display hero **Sable** · title **Wildshot**  
**`classId`:** `ranger`  
**Follows:** [../agent/add-hero-class.md](../agent/add-hero-class.md) · [../agent/wizard-reference.md](../agent/wizard-reference.md) · [../agent/multi-class-architecture.md](../agent/multi-class-architecture.md) · [skill-motion-spectacle.md](./skill-motion-spectacle.md)  
**Related:** [multi-class-wizard.md](./multi-class-wizard.md) · [../combat.md](../combat.md) · [../characters-visual.md](../characters-visual.md) · [../extension-playbooks.md](../extension-playbooks.md) §3  

**Constraint:** Hunt / Defense isolation · keyboard combat facing (no mouse aim) · no camera shake / hitStop · no CDN · pool-budget VFX · docs English · player UI English · no casual `saveVersion` bump unless schema changes.

---

## 1. Goal / Non-goal

### Goal

Add a fourth playable job that fills the **physical ranged** hole in the roster:

| Existing | Role |
|----------|------|
| Knight (`aerin`) | Melee frontline · Rage slam |
| Wizard | Magic ranged · staff bolts |
| Rogue | Melee glass cannon · dagger flurry |
| **Ranger (new)** | **Physical ranged · bow volleys · traps / mark** |

Ship a **full spectacle kit** (not look-only): identity, GLB, bow prop, basic attack, 4 actives, 5 passives, energy burst, title card, loot bias, integrity green.

### Non-goal (defer)

| Item | Why defer |
|------|-----------|
| True ballistic physics / gravity arcs | Facing rays + travel VFX are enough |
| Mouse / free aim reticle | Project combat lock |
| Pet companion / beast AI | Separate system (Beastcaller later) |
| Crossbow alternate weapon tree | One `bow` model + bias first |
| Mid-run class swap | Title / new run only |
| Separate Hunt vs Defense balance tables | Shared tuning first |
| Class-locked loot (cannot equip swords) | Keep open loot; bias only |

**Principle:** *Ranger reuses the multi-class pipeline and Wizard’s projectile basic-attack path; identity comes from physical bow fantasy, trap/mark utility, and unique clips/recipes — not a wizard recolor.*

---

## 2. Why this class (design brief)

1. **Roster gap** — no physical ranged; Wizard owns magic range only.  
2. **World fantasy** — hunting grounds, contracts, biomes align with a tracker / huntress.  
3. **Mode fit** — Defense waves reward kiting and zone control (traps).  
4. **Implementation path** — `attackStyle: 'magic'` already fires facing projectiles; Ranger can share that **code path** with a `ranged` profile / bow presentation, or extend `getClassBasicAttack` with a `ranged` style alias that maps to the same bolt pipeline.

### Combat fantasy (one sentence)

> Medium-range bow fighter who **marks** prey, **controls ground** with traps, **repositions** with a short dash-shot, and dumps **Focus** into a multi-arrow rain.

### Differentiation vs Wizard

| Axis | Wizard | Ranger |
|------|--------|--------|
| Damage type feel | Elemental skillPower | Physical attackPower (+ light pierce) |
| Basic | Mana orbs / cast poses | Arrows / draw poses |
| Control | Frost slow, blink | Trap zone, mark amp |
| Resource | MP heavy | MP medium + Focus on hits |
| Silhouette | Staff, hat, indigo | Bow, cloak, forest/amber |

---

## 2.5 GLB bake · load · render path (explicit)

Ranger does **not** add a new renderer. It plugs into the existing stylized-character path used by knight / wizard / rogue.

```text
tools/assets/generate_assets.mjs
  HERO_BAKE_PROFILES.ranger  →  createHero(res, 'ranger')
  heroSkeleton (shared bones) + heroBodyGeometry + profile colors
  heroAnimations(skeleton, 'ranger')  →  subset via HERO_CLASS_CLIPS.ranger
  exportGLB → assets/models/hero/ranger_lod0.glb / ranger_lod1.glb
  createBow() → assets/models/props/weapon_bow.glb
        │
        ▼
assets/manifests/assets.json
  "hero.ranger"  { type: character, lods high/medium/low, animationMap }
  "weapon.bow"   { type: prop, … }
        │
        ▼
AssetManager.preload (all model keys)
        │
        ▼
CharacterFactory.createHero({ classId: 'ranger' })
  cloneModel('hero.ranger')  →  quality LOD pick
  convertToStylized / material roles (skin, cloth, hair, metal, eye)
  CLASS_LOOKS.ranger palette tint + headKit: 'none' (hood baked if any)
  outline via OutlineSystem
  weapon_socket ← equipWeapon('bow')  (WEAPON_LENGTH / GIRTH / grip rotation)
  CharacterAnimationController(animationMap)
        │
        ▼
Player.group in scene → Game render loop (RenderPipeline unchanged)
  Shadows / toon / quality presets already global — no per-class shader
```

### Bake profile (visual identity)

| Token | Intent |
|-------|--------|
| Cloth / cape | Forest olive + warm leather (`0x4a6a48` / `0x3a4a30`) |
| Hair | Auburn / copper short crop (`hairStyle: 'knight'`) |
| Eyes | Amber gold |
| Head gear | `none` or light baked cowl — **no** runtime rogue hood (avoid double stack) |
| Body | `default` (not plate knight) |
| Scale | ~0.93 |

### Clip catalog (`HERO_CLASS_CLIPS.ranger`)

| Clip | Use |
|------|-----|
| `cast_1`…`cast_4` | Basic draw/release (attackStyle `ranged` / magic path) |
| `attack_1`…`attack_4` | Fallback if cast missing |
| `skill_pierce_shot` | Q |
| `skill_trap` | E |
| `skill_vault_shot` | R |
| `skill_hunter_mark` | C |
| Shared | `idle` `run` `sprint` `dodge` `hit` `death` |

### Weapon prop contracts

| Name | Role |
|------|------|
| `blade_mesh` | Primary mesh (bow body) |
| `blade_base` / `blade_tip` | Span markers (grip → upper limb) |
| `weapon_grip` / metal materials | Role tokens for stylized convert |
| Grip rotation | Bow is **not** a blade — `equipWeapon` may use a bow-specific rotation (held vertical/side) |

### Runtime quality

| Quality | Hero LOD | Notes |
|---------|----------|-------|
| high | lod0 | Full clips |
| medium / low | lod1 | Same animationMap; VFX recipes use `qualityParticleMul` |

### Non-goals (render)

- No new `RenderPipeline` passes  
- No unique skeleton  
- No mouse-aimed bow IK  

---

## 3. Identifiers (playbook §0)

| Item | Value |
|------|--------|
| `classId` | `ranger` |
| `modelKey` | `hero.ranger` |
| `lookId` | `ranger` |
| Display name | Sable |
| Title | Wildshot |
| Blurb | `Bow hunter · mark & trap` |
| Attack style | Prefer **`magic`** initially (reuse `#magicAttack` projectile path) **or** new alias `'ranged'` that branches to the same method with arrow VFX |
| Starter weapon model | `bow` → `weapon.bow` |
| Attack label | `Draw` |
| Skill panel title | `Hunt Arts & Tracker Instincts` |
| Energy label | `Focus` |
| Energy effect | `arrow_storm` (new `energyHandlers` entry) |
| Query param | `?class=ranger` |

---

## 4. Skill kit (spectacle-grade)

Unlock cadence mirrors other classes: **3 / 6 / 10 / 16**.  
Each active needs: unique `anim` clip · `combat` · `theme` · `sfx` · `recipe` · `effect` on `skillHandlers` · `rankText` synced to math.  
See [skill-motion-spectacle.md](./skill-motion-spectacle.md) and [extension-playbooks.md](../extension-playbooks.md) §3.

### 4.1 Actives

| Key | Skill id | Effect id | Role | Anim (unique) | Recipe / theme (proposed) | Unlock |
|-----|----------|-----------|------|---------------|---------------------------|--------|
| Q | `piercing_shot` | `piercing_shot` | Long line pierce, single-target focus | `skill_pierce_shot` | arrow streak / `hunt_amber` | 3 |
| E | `caltrop_trap` | `caltrop_trap` | Ground field: slow + chip (facing aim point) | `skill_trap` | trap ring / `thorn` | 6 |
| R | `vault_shot` | `vault_shot` | Short backstep + fan of arrows | `skill_vault_shot` | dash dust + volley / `wind` | 10 |
| C | `hunter_mark` | `hunter_mark` | Mark nearest / facing target; mark takes bonus damage briefly | `skill_hunter_mark` | mark glyph / `hunt_gold` | 16 |

**Identity bar (must not be recolors):**

- Q = **line pierce** (thin, long)  
- E = **ground zone** (persistent short duration)  
- R = **mobility + cone**  
- C = **debuff amplifier** (not pure damage ult — optional detonate on re-cast later)

If C feels weak for an “ultimate” slot, alternate C: **`sky_volley`** (AoE rain along facing) and move mark to a passive or E hybrid. Prefer **mark as C** for hunt fantasy, with strong amp numbers.

### 4.2 Passives (5)

| Skill id | Effect shape (Player `passiveEffects`) | Fantasy |
|----------|----------------------------------------|---------|
| `eagle_eye` | `{ crit: … }` or attack | Precision |
| `fleet_foot` | `{ haste: … }` or moveSpeed if supported | Kiting |
| `barbed_tips` | `{ skillPower }` or `dotPower` | Bleed on skills |
| `scavenger` | `{ gold: …, luck: … }` | Hunter loot |
| `predator` | `{ execute: … }` or statusCrit | Low-HP / marked bonus |

Use existing passive aggregation keys only ([agent/README.md](../agent/README.md)); do not invent new Player getters unless required.

### 4.3 Basic attack

| Item | Proposal |
|------|----------|
| Style path | Reuse `#magicAttack` (bolts along facing) with Ranger `basicAttack` / `meleeProfile`-style overrides: fewer bolts early, stronger single arrow, finisher volley |
| Clips | Prefer `cast_1`–`cast_4` renamed conceptually as **draw/release**; bake as `cast_*` for pipeline compatibility **or** add `draw_1`–`draw_4` and map in Player if clip API allows |
| VFX | Arrow mesh or elongated streak (not mana orbs); impact dust, not arcane ring |
| Range | Slightly **longer** travel / hit distance than wizard bolts; lower splash |

### 4.4 Energy: Focus → `arrow_storm`

Mirror rogue/knight energy pattern:

```text
perHit / perCrit charge Focus
Lv3+ full gauge: next J attack → arrow_storm (level-scaled multi-hit rain in facing cone)
```

Register on `CombatSystem.energyHandlers.arrow_storm`.  
Serialize energy via existing Player energy fields (no saveVersion bump).

### 4.5 Status usage

Prefer existing statuses (burn/slow/bleed if present) from [combat.md](../combat.md):

- Trap → **slow**  
- Pierce / barbed → **bleed** (if supported) or pure physical  
- Mark → damage taken amp (handler-local timer on enemy, or reuse a status flag)

Avoid inventing a second status engine.

---

## 5. Stats, loot, starter

### 5.1 `baseStatMods` (proposal)

```js
baseStatMods: Object.freeze({
  attack: 1.0,
  mp: 1.08,
  skillPower: 0.04,
  hp: 0.9,
  defense: 0.88,
}),
```

Slightly squishier than knight, tankier than rogue; MP for skills without wizard pools.

### 5.2 Starter weapon

```js
starterWeapon: Object.freeze({
  id: 'starter-yew-bow',
  baseId: 'yew_bow',       // new WEAPON_BASES row
  slot: 'weapon',
  name: 'Fledgling Bow',
  rarity: 'common',
  level: 1,
  itemLevel: 1,
  power: 10,
  speed: 1.12,
  crit: 0.05,
  model: 'bow',
  color: 0xc4a574,
  locked: true,
}),
```

### 5.3 Loot bias

```js
weaponBias: Object.freeze({
  preferred: Object.freeze(['bow' /* + leaf/relic optional */]),
  mult: 2.4,
  otherMult: 0.55,
}),
```

### 5.4 `WEAPON_BASES` + LootSystem

1. Add bow bases (common → rare ladder) in `WEAPON_BASES`.  
2. `LootSystem` `BASE_LEVELS` (or equivalent) for each base id.  
3. CharacterFactory `WEAPON_LENGTH` / `WEAPON_GIRTH` for `bow` (held diagonally; shorter “blade” length).  
4. UI icon `assets/textures/ui/icon_bow.png` (can clone/adapt an existing icon).

---

## 6. Implementation phases

Phased so each phase is shippable and testable. Follow [add-hero-class.md](../agent/add-hero-class.md) order: **data → combat → assets → look → UI → validate**.

### Phase A — Data skeleton (no new GLB yet)

| # | Work | Files |
|---|------|--------|
| A1 | `HERO_CLASSES.ranger` row (can point `modelKey` at `hero.rogue` or `hero.aerin` **temporarily** only if needed for boot; prefer full bake in B) | `js/data/content.js` |
| A2 | 4 actives + 5 passives in `SKILLS` with full spectacle schema | `content.js` |
| A3 | `FX_THEMES` entries (`hunt_amber`, `thorn`, …) if new | `js/data/fxThemes.js` |
| A4 | Optional `WEAPON_BASES` bow rows | `content.js` |
| A5 | Title card HTML | `index.html` |
| A6 | `CLASS_LOOKS.ranger` palette (works even if reusing a model briefly) | `CharacterFactory.js` |

**Exit:** integrity may fail until handlers exist — land A+C together ideally.

### Phase B — Assets (bake)

| # | Work | Files / cmd |
|---|------|-------------|
| B1 | `HERO_BAKE_PROFILES.ranger` (cloak, earth/forest cloth, short hair or hood **baked**, no double hood) | `tools/assets/generate_assets.mjs` |
| B2 | Class-distinct combat clips: `cast_*` or `draw_*`, `skill_pierce_shot`, `skill_trap`, `skill_vault_shot`, `skill_hunter_mark` | same |
| B3 | Bake LOD0/LOD1 | `node tools/assets/generate_assets.mjs` (add `--ranger-only` flag like wizard) |
| B4 | Bake `weapon.bow` prop (`blade_base` / `blade_tip` or arrow-rest points if needed) | same + `--bow-only` optional |
| B5 | Manifest `hero.ranger`, `weapon.bow` | `assets/manifests/assets.json` |
| B6 | Icon | `assets/textures/ui/icon_bow.png` |

**Contracts (must keep):** shared `heroSkeleton` bone names · `weapon_socket` · material role tokens · locomotion clips shared.

### Phase C — Combat

| # | Work | Files |
|---|------|--------|
| C1 | `#piercingShot`, `#caltropTrap`, `#vaultShot`, `#hunterMark` | `CombatSystem.js` |
| C2 | Register `skillHandlers` | same |
| C3 | `energyHandlers.arrow_storm` | same |
| C4 | Basic attack presentation: arrow FX branch when class is ranger (or `attackStyle`/`projectileStyle` flag) | `CombatSystem.js` + `Effects.js` |
| C5 | New Effects recipes if none fit (e.g. `arrowStreak`, `trapField`, `markGlyph`) | `Effects.js` |
| C6 | Themed SFX banks (`skill_bow`, `skill_trap`, …) if samples exist or reuse with new banks | audio banks / `content` `sfx` |
| C7 | Facing only: `#facingDir` / `#aimAlongFacing` — **never** mouse `aimPoint` for player skills | [combat-facing.md](../agent/combat-facing.md) |

### Phase D — Runtime polish

| # | Work | Files |
|---|------|--------|
| D1 | Final `modelKey: 'hero.ranger'` | `content.js` |
| D2 | `WEAPON_LENGTH` / `WEAPON_GIRTH` for bow | `CharacterFactory.js` |
| D3 | Loot base levels for bow | `LootSystem.js` |
| D4 | Title CSS grid: **4 class cards** — update `.class-select` from `repeat(3, 1fr)` → `repeat(4, 1fr)` or 2×2 on narrow | `css/game.css` |
| D5 | Agent docs tables | `docs/agent/README.md`, `characters-visual.md` |

### Phase E — Validation & QA

```bash
node tests/integrity.mjs
# includes import-integrity + skill-combat expectations for handlers
```

**Manual QA checklist** (from add-hero-class §7):

1. Title → select Ranger → New Hunt  
2. Move + J: arrows follow **facing / move**, not mouse  
3. Skills unlock 3 / 6 / 10 / 16; each distinct silhouette  
4. Equip looted non-bow weapon (open loot still works)  
5. Defense start + death → title; Hunt continue blob not corrupted  
6. Hunt Continue restores `classId: 'ranger'`  
7. Focus full → J triggers `arrow_storm` at Lv3+  
8. Quality low/medium/high: trap + volley VFX stay within pools  

---

## 7. File touch map (expected)

| Area | Path |
|------|------|
| Class + skills + weapon bases | `js/data/content.js` |
| Themes | `js/data/fxThemes.js` |
| Skill math (if helpers needed) | `js/data/skillCombat.js` |
| Handlers + basic/energy | `js/systems/CombatSystem.js` |
| Recipes | `js/graphics/Effects.js` |
| Look + weapon scale | `js/characters/CharacterFactory.js` |
| Loot levels | `js/systems/LootSystem.js` |
| Bake | `tools/assets/generate_assets.mjs` |
| Manifest | `assets/manifests/assets.json` |
| Binaries | `assets/models/hero/ranger_lod*.glb`, `assets/models/props/weapon_bow.glb` |
| Icon | `assets/textures/ui/icon_bow.png` |
| Title | `index.html`, `css/game.css` |
| Docs | this plan · `docs/agent/README.md` · `docs/characters-visual.md` · `docs/README.md` |
| Tests | `tests/integrity.mjs` (auto coverage via class/skill scans) |

**Usually no change:** `Game.js` skill input (already `getClassActiveSkills`), save key, `saveVersion` (classId already v4).

---

## 8. Balance sketch (starting points — tune in play)

Numbers are **starting seeds**; final pass after Phase E.

| Skill | combat sketch |
|-------|----------------|
| Basic arrow | mult ~0.9–1.2 per shot; finisher 3–5 arrows |
| Q pierce | mult high, thin radius, 1–2 pierces |
| E trap | low DPS, 2.5–3.5s, radius ~3.2, slow |
| R vault | dash 3–4m back along −facing + 3–5 cone arrows |
| C mark | 4–6s, +18–30% damage taken (rank scales) |
| arrow_storm | 6–10 hits, cone, mult ~0.45–0.7 each |

Compare to wizard MP costs: Ranger skills slightly **cheaper MP**, slightly **longer CD** on E/C to reward positioning.

---

## 9. Title UI note (4 classes)

Current title stack uses a **3-column** class grid sized to `--title-panel`. With Ranger:

- **Desktop:** `grid-template-columns: repeat(4, 1fr)` at same panel width, or widen `--title-panel` slightly (e.g. 400px) so labels stay readable.  
- **Touch:** 2×2 grid if 4-across is cramped.  
- Card copy:

```html
<button type="button" class="class-card" data-class-id="ranger" aria-pressed="false">
  <strong>Ranger</strong>
  <small>Sable · Wildshot</small>
</button>
```

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Feels like “wizard with arrows” | Unique recipes, physical copy, trap/mark roles, bow prop silhouette |
| Safe long-range camping | Medium projectile range; vault CD; trap requires setup; Defense elites close gaps |
| Hit detection ≠ bow mesh | Same as all classes: combat range separate from weapon length ([AGENTS.md](../../AGENTS.md)) |
| Clip aliasing other jobs | Bake unique `skill_*` / draw clips per spectacle standard |
| Title overcrowding | CSS 4-col or 2×2; keep compact title stack tokens |
| Performance on trap tick + volley | Pool recipes; quality LOD; no unbounded particles |
| Mark without good target | Fall back to nearest enemy in facing cone |

---

## 11. PR / work split suggestion

| PR | Scope | Depends |
|----|-------|---------|
| **PR1** | Data + handlers + themes + temporary model reuse + title card | — |
| **PR2** | Bake ranger GLB + bow + manifest + look polish | PR1 or parallel bake |
| **PR3** | Recipes / SFX spectacle pass + balance | PR1–2 |
| **PR4** | Docs + integrity green + manual QA notes | PR3 |

Single agent can do PR1–4 sequentially if preferred.

---

## 12. Definition of done

- [ ] `HERO_CLASSES.ranger` + full skill trees in `content.js`  
- [ ] All four `effect` ids registered and callable  
- [ ] `arrow_storm` energy path works  
- [ ] `hero.ranger` + `weapon.bow` in manifest and loadable  
- [ ] Title selectable; `?class=ranger` works  
- [ ] New Hunt / Defense / Continue preserve class  
- [ ] `node tests/integrity.mjs` passes  
- [ ] Manual QA checklist (§6 Phase E) signed off  
- [ ] Agent README + characters-visual class tables updated  

---

## 13. Open decisions (resolve before or during PR1)

1. **`attackStyle`:** pure `'magic'` reuse vs explicit `'ranged'` alias (recommend **`'ranged'` → same projectile path** for readability).  
2. **Ultimate:** `hunter_mark` vs `sky_volley` as C.  
3. **Head gear:** baked hood/cloak only vs runtime kit.  
4. **Hero name/title:** Sable / Wildshot vs alternate flavor.  
5. **Whether bow needs** special grip rotation in `equipWeapon` (likely yes — bow is not a blade).

---

## 14. Agent execution order (copy-paste)

When implementing, follow this exact order from [add-hero-class.md](../agent/add-hero-class.md):

1. Identifiers locked (§3)  
2. `content.js` class + skills + weapon bases  
3. `CombatSystem` handlers + energy + basic branch  
4. Effects recipes + fx themes + sfx  
5. Bake GLB + bow + manifest  
6. `CLASS_LOOKS` + weapon length/girth  
7. Loot levels + icon  
8. Title HTML/CSS  
9. `node tests/integrity.mjs`  
10. Manual QA + docs  

Do **not** edit `vendor/`. Do **not** auto-commit unless asked.
