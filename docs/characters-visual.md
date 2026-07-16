# Character · Weapon visuals

## Hero classes

Playable looks are data-driven via `HERO_CLASSES` in `js/data/content.js`.

| Class id | Model key | Default name | Notes |
|----------|-----------|--------------|--------|
| `aerin` | `hero.aerin` | Gareth | Default **knight** — plate armor, open helm, crimson crest (baked) |
| `wizard` | `hero.wizard` | Lyra | Baked hat + long hair; arcane palette |
| `rogue` | `hero.rogue` | Vex | Runtime hood head kit (`headKit: 'rogue'`); dark leather + mint accents; dagger + Focus energy combo |

**Add a class:**

1. `HERO_CLASSES` row: `modelKey`, `lookId`, `attackStyle`, `activeSkills`, `passiveSkills`, `starterWeapon`, `baseStatMods`
2. Define skills in `SKILLS` with `classId`, `effect`, `anim`, `castTime` (actives) or passive `effect` multipliers
3. Register `CombatSystem.skillHandlers[effect]` for each new active effect
4. Bake hero GLB + optional weapon model; register in `assets.json`
5. `CLASS_LOOKS[lookId]` in `CharacterFactory.js`
6. Title card `data-class-id` in `index.html`

HUD/input bind from `activeSkills` keys (Q/E/R/C) automatically.

## Hero pipeline

| Stage | File |
|-------|------|
| Creation | `js/characters/CharacterFactory.js` → `createHero({ classId, quality })` |
| GLB key | `HERO_CLASSES[id].modelKey` |
| Fallback mesh | `js/graphics/ModelFactory.js` → `createHeroModel` (any `hero.*`) |
| Animation | `CharacterAnimationController` + GLB clips |
| Instance | `Player` mounts/rebuilds on class change |

### Runtime looks

`CLASS_LOOKS` per `lookId`:

- **palette** — cel recolor by material role (`skin` / `cloth` / `hair` / …)
- **headKit** — `rogue` (runtime hood/mask) or `none` (use baked head gear)

Maps are cleared for flat anime color priority.

### Bake tool

```bash
# Requires npm package `three` available for GLTFExporter imports (dev install once)
node tools/assets/generate_assets.mjs --wizard-only
node tools/assets/generate_assets.mjs --heroes-only
node tools/assets/generate_assets.mjs   # full asset set
```

Profiles: `HERO_BAKE_PROFILES` in `generate_assets.mjs`. Shared: skeleton, body SDF, `heroAnimations` (14 clips).

## Weapons

| Item | Location |
|------|----------|
| Equip | `CharacterFactory.equipWeapon` |
| Global visual scale | `WEAPON_VISUAL_SCALE` (1.5) multiplies length and girth |
| Length multiplier | `WEAPON_LENGTH` (Y scale, relative per kind) |
| Girth multiplier | `WEAPON_GIRTH` (X/Z scale, relative per kind) |
| Model type | item.model → `weapon.sword` etc. in manifest |
| Starter | `HERO_CLASSES[*].starterWeapon` via `createClassStarterWeapon` |

Hunter starter: **Swift Field Blade** (`katana`).  
Wizard starter: **Apprentice Focus** (`relic`).

Applied scale is `(WEAPON_GIRTH * WEAPON_VISUAL_SCALE, WEAPON_LENGTH * WEAPON_VISUAL_SCALE, …)`; rogue offhand uses the same magnitudes with mirrored X. Hit detection `range` / `rangeMult` are independent of mesh length (see `docs/plan/weapon-visual-scale-detail.md`).

## Animation clip names

**Shared locomotion / reaction:**  
`idle`, `walk`, `run`, `sprint`, `dodge`, `hit`, `death`

Runtime locomotion uses discrete speed bands (idle → walk → run → sprint) with hysteresis in `CharacterAnimationController.setLocomotion`. If `walk` is missing, selection falls back to `run`.

**Weapon holds:** every class has a soft combat-ready idle/run hold via `classWeaponHold(profileId)` (knight guard, wizard staff stance, ranger bow-ready, rogue dual crouch). Combat clips start from that rest so attacks/casts no longer snap out of T-pose arms.

### Basic attack poses

| Class | Clips | Notes |
|-------|-------|--------|
| `aerin` | `attack_1`–`attack_7` | Full-body sword chain (weight shift, follow-through) |
| `rogue` | `attack_1`–`attack_7` | Dual-dagger chain with settle back to crouch rest |
| `wizard` / `ranger` | `cast_1`–`cast_4` primary + `attack_1`–`attack_4` fallback | Body-weighted casts + shared attack fallbacks |

Runtime: melee plays `attack_N`; magic/ranged prefer `cast_N` (`Player.tryAttack`).

**Knight (aerin):**  
`attack_1`–`attack_7`,  
`skill_whirlwind`, `skill_crescent`, `skill_skyfall`, `skill_starburst`

**Wizard:**  
`attack_1`–`attack_4`, `cast_1`–`cast_4`,  
`skill_fireball`, `skill_frost_nova`, `skill_blink`, `skill_meteor`

Wizard actives must **not** alias knight skill clip names in `SKILLS.anim`.  
Do not rename without updating Player / Combat / `assets.json` animationMap.

### Bake (after adding clips)

```bash
node tools/assets/generate_assets.mjs --heroes-only
# or --aerin-only / --wizard-only / --rogue-only / --ranger-only (weapons: --staff-only / --dagger-only)
node tests/integrity.mjs
```

Hold/attack tuning: `classWeaponHold(profileId)`, `buildClassCombatClipSpecs`, and skill poses in `heroAnimations()`. Prefer **anticipation → contact → follow-through → settle** keys with legs/spine/head — sparse arm-only keys look wooden. `animationClip` hold-forwards omitted bones (does not snap missing keys to identity).
Each GLB only ships shared locomotion/reaction clips plus its own class combat clips — register new clips in `HERO_CLASS_CLIPS` so they survive the per-class filter.
Runtime: `Player.trySkill` has limited anim fallbacks if a clip is missing — still bake unique names for shipping quality.

### Motion + combat sync

- Skills with `timeline.hits` fire combat phases via `CharacterAnimationController.scheduleNormalized`.  
- See [combat.md](./combat.md) cast flow and [plan/skill-motion-spectacle.md](./plan/skill-motion-spectacle.md).

### Future motion (static resources only)

Planned next motion upgrades that stay inside the bake/manifest pipeline (new clips such as `walk`, denser combat keys, settle continuity)—**not** runtime blend trees, bone masks, or procedural secondary motion—are specified in [plan/static-resource-character-motion.md](./plan/static-resource-character-motion.md).

## Outlines

`OutlineSystem` silhouette color comes from the active look palette `outline`.

## Save

`player.classId` is persisted (`saveVersion` 4+). Missing class → `aerin`.
