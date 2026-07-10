# Multi-class architecture

## Purpose

Playable identity is **not** hardcoded to a single swordsman. A class is a package of:

- **Look** — hero GLB key + runtime palette / head kit  
- **Combat style** — `melee` or `magic` basic attack  
- **Skill tree** — active (Q/E/R/C) + passives  
- **Starter gear** — locked weapon row  
- **Optional stat mods** — MP/attack/skillPower multipliers  

Hunt and Defense both use the same `Player` instance; modes gate systems, not appearance.

## Data flow

```
Title UI (class card / ?class=)
        │
        ▼
Game.newGame({ classId }) / startDefense({ classId }) / continueGame (saved classId)
        │
        ▼
Player.reset(classId)  →  setClass / createHero / starter / skill ranks
        │
        ├─ CharacterFactory.createHero({ classId, quality })
        │     cloneModel(HERO_CLASSES[id].modelKey)
        │     CLASS_LOOKS[lookId] palette + headKit
        │     weapon_socket + CharacterAnimationController
        │
        ├─ createClassStarterWeapon(classId) → inventory
        │
        └─ createEmptySkillRanks / createEmptySkillCooldowns(classId)

Input (keyboard only)
  J              →  Player.tryAttack  (not mouse)
  Space          →  dash
  Q/E/R/C        →  getClassActiveSkills(classId)  →  Player.trySkill
Basic attack     →  CombatSystem.playerAttack  →  melee | magic by attackStyle
Active skill     →  CombatSystem.skillHandlers[skill.effect]
Mouse            →  UI only (menus / inventory / buttons)
```

## Core tables (`js/data/content.js`)

### `HERO_CLASSES[classId]`

| Field | Role |
|-------|------|
| `id`, `name`, `title`, `blurb` | Identity / UI copy |
| `modelKey` | Manifest key, e.g. `hero.wizard` |
| `lookId` | Key into `CLASS_LOOKS` in CharacterFactory |
| `attackStyle` | `'melee'` \| `'magic'` |
| `activeSkills` | Ordered list of skill ids (Q/E/R/C via each skill’s `key`) |
| `passiveSkills` | Passive skill ids |
| `baseStatMods` | `{ attack, mp, skillPower }` multipliers/offsets |
| `starterWeapon` | Frozen starter item fields (`model`, power, etc.) |
| `skillPanelTitle`, `attackLabel` | Skills panel + HUD attack label |

Helpers:

- `resolveHeroClassId`, `getHeroClass`  
- `getClassSkillIds`, `getClassActiveSkills`, `getClassPassiveSkills`  
- `createEmptySkillRanks`, `createEmptySkillCooldowns`  
- `createClassStarterWeapon`, `skillKeyCode`  

### `SKILLS[skillId]`

| Field | Active | Passive |
|-------|--------|---------|
| `classId` | required | required |
| `key` | `Q`/`E`/`R`/`C` | — |
| `unlockLevel`, `maxRank`, `mp`, `cooldown` | yes | unlock/max only |
| `castTime`, `anim`, `effect` | yes | — |
| `theme`, `sfx`, `recipe` | presentation identity | — |
| `combat` | mult/radius/hits/status (rank-scaled) | — |
| `timeline.hits` | optional anim-normalized phases | — |
| `effect` | combat handler id | per-rank stat multipliers object |
| `name`, `description`, `rankText` | UI (sync to combat) | UI |

Active `effect` must exist on `CombatSystem.skillHandlers`.  
Active `anim` should be a **class-unique** clip on the hero GLB (not permanent aliases of another job).  
Handlers resolve numbers with `skillCombatAtRank` / `skillDamage` — see [../combat.md](../combat.md).

## Runtime layers

| Layer | File | Responsibility |
|-------|------|----------------|
| Factory | `js/characters/CharacterFactory.js` | `createHero({ classId })`, `CLASS_LOOKS`, `equipWeapon` |
| Entity | `js/entities/Player.js` | `classId`, mesh rebuild, skill ranks, passives, `alignCombatFacing` |
| Combat | `js/systems/CombatSystem.js` | Melee/magic basics + skill handlers + skillPower rules |
| Pure skill math | `js/data/skillCombat.js` | rank scale, hit raw, status tick |
| FX themes | `js/data/fxThemes.js` | color tokens + quality particle mul |
| VFX | `js/graphics/Effects.js` | recipes + pools + quality LOD |
| Input | `js/core/Game.js` | `#tryClassSkillKeys` from class actives |
| HUD | `js/ui/UI.js` + `index.html` | Dynamic skill slots by `data-key` Q/E/R/C |
| Loot | `js/systems/LootSystem.js` + `WEAPON_BASES` | Shared loot; staff bases optional |
| Save | `Player.serialize` / `load`, `saveVersion` | Persist `classId` (v4+) |

## Contracts (must keep when baking heroes)

| Contract | Detail |
|----------|--------|
| Bones | Shared `heroSkeleton` names (`head`, `weapon_socket`, arm/leg chains, …) |
| Clips | Shared locomotion/reaction; combat clips per class (`attack_*` / `cast_*` / unique `skill_*` per `SKILLS[].anim`) |
| Socket | Object named `weapon_socket` for equip |
| Factory return | `{ group, refs, animation, classId }` |
| Material roles | Names containing `skin` / `cloth` / `hair` / `metal` / `eye` for recolor |
| Fallback | Any `hero.*` key → `createHeroModel()` if GLB missing |

## What is intentionally shared

- Open-world loot tables (armor/charm; weapons include staff bases but all classes can equip weapons by slot)  
- Hunt contracts, world tier, Defense wave FSM  
- Save key string (only `saveVersion` bumps when schema changes)  

## What is per-class

- Model + look kit  
- Starter weapon  
- Active/passive skill lists and combat effects  
- Basic attack style  
- Base stat mods  

## Adding a third class (mental model)

Copy the Wizard path: **data → skills → handlers → bake → manifest → look kit → title card → integrity**.  
Do **not** fork Hunt/Defense systems per class.
