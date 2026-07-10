# Character · Weapon visuals

## Hero classes

Playable looks are data-driven via `HERO_CLASSES` in `js/data/content.js`.

| Class id | Model key | Default name | Notes |
|----------|-----------|--------------|--------|
| `aerin` | `hero.aerin` | Kai | Default hunter; runtime rogue hood kit |
| `wizard` | `hero.wizard` | Lyra | Baked hat + long hair; arcane palette |

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
| Length multiplier | `WEAPON_LENGTH` (Y scale) |
| Girth multiplier | `WEAPON_GIRTH` (X/Z scale) |
| Model type | item.model → `weapon.sword` etc. in manifest |
| Starter | `HERO_CLASSES[*].starterWeapon` via `createClassStarterWeapon` |

Hunter starter: **Swift Field Blade** (`katana`).  
Wizard starter: **Apprentice Focus** (`relic`).

Hit detection `range` is independent of mesh length.

## Animation clip names (all hero classes)

`idle`, `run`, `sprint`, `attack_1`–`attack_4`, `dodge`, `hit`, `death`,  
`skill_whirlwind`, `skill_crescent`, `skill_skyfall`, `skill_starburst`

Do not rename without updating Player / Combat callers.

## Outlines

`OutlineSystem` silhouette color comes from the active look palette `outline`.

## Save

`player.classId` is persisted (`saveVersion` 4+). Missing class → `aerin`.
