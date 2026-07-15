# Content data (`js/data/content.js`)

**Single source** for balance and catalogs. Start here when adding new monsters/equipment.

## Zones `ZONES`

```js
id, name, subtitle, center: [x, z], radius,
minLevel, maxLevel,
ground, dark, accent, fog, sky,  // hex colors
detail, particle
```

- Runtime location → zone: `TerrainSystem.zoneAt(x,z)` (center distance / radius score)
- Spawn pool: `ZONE_SPAWNS[zoneId]`
- Boss id: `ZONE_BOSSES[zoneId]`

When adding a zone, you must:

1. `ZONES` entry
2. Monsters with that zone field
3. (Optional) `BiomeDecorator` decoration cluster

## Monsters `ENEMY_TYPES`

Helper `enemy(id, name, zone, shape, level, hp, damage, defense, speed, range, xp, options)`

| Field | Description |
|-------|-------------|
| `shape` | `MonsterFactory` / `ModelFactory` body key (blob, hare, boar, …) |
| `ai` | `melee` `ranged` `caster` `charge` `leap` `pack` `boss` etc. → `Enemy.#combatAI` |
| `role` | Taxonomy for Hunt packs / Defense recipes (`fodder_swarm`, `frontline`, `bruiser`, `rusher`, `skirmisher`, `glass_ranged`, `artillery`, `controller`, `support`, `zone_boss`) |
| `family` | Optional biome family tag for presentation grouping |
| `boss: true` | Zone boss, excluded from spawn pool |
| `weight` | Weighted spawn (Hunt) |
| `defenseWeight` | Optional extra weight bias for Defense picks |
| `special` | Boss special (`roots`, …) or light normal specials (`slow_bolt`, `aura_armor`) |
| `color` / `accent` / `eye` | Visuals |
| `scale` | Mesh scale |

`ZONE_SPAWNS` / `ZONE_BOSSES` are **auto-generated** from `ENEMY_TYPES`. Just set `boss: true` correctly for bosses.

**Defense composition:** `DEFENSE_WAVE_ROLE_RECIPES` + `defenseRecipeForWave(wave)` drive role quotas.  
**Elite affixes:** `ELITE_AFFIXES` (shielded, enraged, volatile, hasted, fortified, arcane, frostbitten, molten, vampiric, summoning).  
See [plan/monster-variety-hunt-defense.md](./plan/monster-variety-hunt-defense.md).

## Rarities `RARITIES`

`common` … `legendary` — `multiplier`, `affixes`, `color`, `salvage`.

## Equipment

- `WEAPON_BASES` — `model`: `sword|saber|greatsword|leaf|katana|relic` (asset key `weapon.*`)
- `ARMOR_BASES` / `CHARM_BASES`
- `AFFIXES` — Random option pool (`LootSystem`)

Drop/craft logic: `js/systems/LootSystem.js`.

## Skills `SKILLS`

Active skills are **content-first** (balance + identity + presentation hooks).  
Pure math helpers: `js/data/skillCombat.js`. Themes: `js/data/fxThemes.js`.

```js
{
  id, classId, name, key, unlockLevel, maxRank,
  mp, cooldown, castTime,          // active only
  anim,                            // GLB clip — class-unique preferred
  effect,                          // CombatSystem.skillHandlers key
  theme,                           // FX_THEMES id (windsteel, ember, frost, …)
  sfx,                             // AudioManager bank (skill_blade, skill_fire, …)
  recipe,                          // presentation identity label (spinStorm, iceNova, …)
  timeline: { hits: [0.22, 0.48] }, // optional normalized anim cues → phase index
  combat: {
    mult: [base, perRank],         // arrays scale with rank via skillCombatAtRank
    radius: [base, perRank],
    // … hits, knockback, armorPierce, leap, pattern, status, …
    status: { id: 'slow'|'burn'|'expose', duration, power?, dps?, tick? },
  },
  description,
  rankText(rank),                  // must match combat[] math (same bases)
  // passives:
  passive: true,
  effect: { attack?, hp?, skillPower?, … },
}
```

- Unlock/rank: `Player.skills`, `Player.trySkill`
- Handler: `CombatSystem.skillHandlers[effect]` — must call `skillCombatAtRank` / `skillDamage`, not hardcode mults
- HUD: class `activeSkills` → Q/E/R/C slots (`UI.#syncAbilityBarForClass`)
- Integrity + unit tests: `tests/integrity.mjs`, `tests/skill-combat.mjs`

### Spectacle rules (required for new actives)

1. **Unique silhouette** — do not ship a palette-only twin of an existing skill (e.g. starburst = star radial; meteor = fallCone).
2. **Unique `theme` + `recipe` + `sfx`** (or clearly distinct recipe layers).
3. **Wizard `anim` must not alias knight clips** (`skill_whirlwind|crescent|skyfall|starburst`). See [characters-visual.md](./characters-visual.md).
4. Prefer `timeline.hits` for body-synced multi-pulse skills.
5. Rank text uses the same `[base, perRank]` pairs as `combat`.

Full identity matrix: [plan/skill-motion-spectacle.md](./plan/skill-motion-spectacle.md), [combat.md](./combat.md).

## Hunt titles `HUNT_TITLES`

Kill count thresholds → display name. Used by `HuntSystem` / UI.

## Edit checklist

- [ ] No duplicate ids
- [ ] zone id matches `ZONES` key
- [ ] shape maps to `MonsterFactory` `SHAPE_ARCHETYPE`
- [ ] 1 boss per zone; ≥10 normals per zone (`tests/integrity.mjs` validates)
- [ ] every row has `role` ∈ `ENEMY_ROLES`
- [ ] Skill unlockLevel matches HUD lock display

## Application: zone level curve design

Recommended pattern (similar to existing data):

| zone | minLevel | Role |
|------|----------|------|
| verdant | 1 | Tutorial · early |
| forest | ~8 | Transition |
| canyon | ~15 | Mid |
| frost | ~24 | Mid-late |
| ember | ~34 | Late |
| astral | ~48 | End |

`EnemySystem` spawn level uses `max(data.level, zone.minLevel)` mixed with player level scaling.  
Raising zone minLevel alone sharply increases entry difficulty for that zone.

## Application: tuning spawn tables with weight

Junk/elite candidate ratio in the same zone:

- Higher `weight` = more frequent (`weightedPick`)
- Boss/eliteOnly are excluded from the normal pool

"Only ranged enemies in this zone" → lower the weight of ranged ai in that zone.

## Application: dropBias / special

- `special`: Boss pattern id — must **match strings** with `CombatSystem.enemyBossSpecial` switch
- `dropBias`: Loot-side weight (check usage after searching LootSystem; reserved field if unused)

## Application: equipment power curve

`LootSystem.generateGear`:

- `multiplier = rarity.multiplier * (1 + itemLevel * .014)`
- Weapon power ≈ `(base.power + itemLevel * 1.34) * multiplier`

Raising base power scales the entire range.  
To strengthen a specific range only → delay appearance level with `BASE_LEVELS` or adjust itemLevel coefficient.

## Application: skill unlock pace

`unlockLevel` + `Player.addXp` auto grants rank 1 on level-up.  
Too many early skills → raise unlockLevel.  
Skill point scarcity → Hunt 100-kill bonus or points per level.

## Application: tune skill damage / radius only

1. Edit `SKILLS.<id>.combat` arrays (`mult`, `radius`, …) in `content.js`
2. Keep `rankText` in sync with those bases
3. Do **not** re-hardcode the same numbers inside `CombatSystem` handlers
4. Run `node tests/skill-combat.mjs` (or full `node tests/integrity.mjs`)

## Related files

- `js/data/content.js` ← main edit target
- `js/data/skillCombat.js`, `js/data/fxThemes.js`
- `js/systems/CombatSystem.js`, `js/graphics/Effects.js`
- `js/systems/LootSystem.js`, `EnemySystem.js`, `HuntSystem.js`
- `js/entities/Player.js`, `Enemy.js`
- `tests/integrity.mjs`, `tests/skill-combat.mjs`
- [extension-playbooks.md](./extension-playbooks.md)
- [combat.md](./combat.md), [plan/skill-motion-spectacle.md](./plan/skill-motion-spectacle.md)
