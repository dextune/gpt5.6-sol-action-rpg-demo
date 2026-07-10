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
| `boss: true` | Zone boss, excluded from spawn pool |
| `weight` | Weighted spawn |
| `special` | Boss special skill id (`roots`, `stampede`, …) → `CombatSystem.enemyBossSpecial` |
| `color` / `accent` / `eye` | Visuals |
| `scale` | Mesh scale |

`ZONE_SPAWNS` / `ZONE_BOSSES` are **auto-generated** from `ENEMY_TYPES`. Just set `boss: true` correctly for bosses.

## Rarities `RARITIES`

`common` … `legendary` — `multiplier`, `affixes`, `color`, `salvage`.

## Equipment

- `WEAPON_BASES` — `model`: `sword|saber|greatsword|leaf|katana|relic` (asset key `weapon.*`)
- `ARMOR_BASES` / `CHARM_BASES`
- `AFFIXES` — Random option pool (`LootSystem`)

Drop/craft logic: `js/systems/LootSystem.js`.

## Skills `SKILLS`

```js
{
  id, name, key, unlockLevel, maxRank,
  mp, cooldown,  // active only
  passive: true, // passive
  description, rankText(rank)
}
```

- Unlock/rank: `Player.skills`, `Player.trySkill`
- Actual effect implementation: `CombatSystem.usePlayerSkill` / `#whirlwind` etc.
- HUD slots: `index.html` `.ability-slot[data-slot]` must match skill id

**Skill values are in content, but damage multipliers are often hardcoded in CombatSystem.**  
Check both when balancing.

## Hunt titles `HUNT_TITLES`

Kill count thresholds → display name. Used by `HuntSystem` / UI.

## Edit checklist

- [ ] No duplicate ids
- [ ] zone id matches `ZONES` key
- [ ] shape maps to `MonsterFactory` `SHAPE_ARCHETYPE`
- [ ] 1 boss per 6 zones (`tests/integrity.mjs` validates)
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

## Related files

- `js/data/content.js` ← main edit target
- `js/systems/LootSystem.js`, `EnemySystem.js`, `HuntSystem.js`
- `js/entities/Player.js`, `Enemy.js`
- `tests/integrity.mjs`
- [extension-playbooks.md](./extension-playbooks.md)
