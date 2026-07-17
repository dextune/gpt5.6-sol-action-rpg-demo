# Quick edit recipes (small-model)

Request → **file to open** → **symbol to touch**.
For larger feature additions see [extension-playbooks.md](./extension-playbooks.md).

---

## A. Balance · density

### Too many / too few enemies
- `js/config.js` → `targetEnemies`, `maxEnemies`
- Spawn ring: `spawnInnerRadius`, `spawnOuterRadius`
- Despawn: `despawnRadius` (too small → enemies vanish and respawn repeatedly)

### Player too weak / too strong
- Base: `PLAYER_CONFIG` (`baseHp`, `baseAttack`, `baseDefense`, `baseCrit`)
- Growth: `Player.js` getters (`attackPower`, `maxHp`, `defense`, `xpNeeded`)
- Basic-attack multiplier: `CombatSystem.playerAttack` `multiplier`
- Damage reduction: defense coefficient in `Player.takeDamage`

### Enemy too tanky / too squishy
- `content.js` the `enemy(..., hp, damage, defense, ...)`
- Global defense formula: `Enemy.takeDamage` `defense * .37`
- Crit multiplier: `CombatSystem.#damageEnemy` `1.85`

### Gold · XP rate
- Monster `xp`, `gold:[min,max]` in content
- Player `xpBonus` / `goldBonus` (equipment · passives)
- World tier: `HuntSystem.worldTier` (level/10)

### Elite · boss frequency
- Elite chance: `EnemySystem.#spawnOne` eliteChance
- Boss gauge: in `HuntSystem.onKill`, `bossCharge += elite?9:2.35`
- Boss wait: `bossPendingTimer = 2.25`

### Hunt threat · on-level loop
- Bands / softcap / rewards: `HUNT_THREAT_CONFIG` in `js/config.js`
- Helpers: `js/systems/huntThreat.js` (`threatFromGap`, `receiveDamageMul`, `recommendedZoneId`, `clampHuntSpawnLevel`)
- Zone ribbon / toast / minimap threat: `hudCombat.js`, `UI.zoneEntered`, `minimap.js`
- Guided contracts + field marks: `HuntSystem`
- Enemy level nameplate: `Enemy.#createLevelLabel`

### Potion · dash feel
- `PLAYER_CONFIG` potionHealRatio, dash*
- Cooldown UI: ability-slot potion/dash

---

## B. Combat · presentation

### Blade reach
- Hit: `CombatSystem.playerAttack` `range`, `arc`
- Visual length: `CharacterFactory` `WEAPON_LENGTH` (separate from hit → align **both**)

### Blade length / girth
- `WEAPON_LENGTH`, `WEAPON_GIRTH`
- Starting weapon: `starterBlade().model` (`katana` etc.)

### Combo speed
- `Player.tryAttack` `attackCooldown`, `attackAnimDuration`, `comboWindow`
- Animation timeScale cap

### Hit effect more / less flashy
- Prefer skill **recipes** in `Effects.js` (`recipeSpinStorm`, `recipeFireBlast`, …)
- Basic hits: `Effects.impact`, `swingArc`
- Calls: `#damageEnemy`, skill handlers, `playerAttack`
- Themes: `js/data/fxThemes.js` (not scattered hex)
- Pool: `MAX_PARTICLES`, particles/slashes/decals/ghosts/beams
- Quality LOD: `Effects.setQuality` / `scaleCount`

### Screen shake / jitter
- Keep shake/hitStop no-op (`Game.js`)
- Keep body scale fixed (`Player.#animate`)
- Weak lunge (`tryAttack`)
- (Note) enemy knockback does not affect the camera directly; **only player movement** follows the camera

### Knockback strength
- Player→enemy: `playerAttack` / skill option `knockback`
- Enemy→player: `#damagePlayer` force argument
- Enemy mass feel: `Enemy.takeDamage` boss multiplier `.72`

### Buff a single skill
- **First** `content.js` `SKILLS.<id>.combat` (`mult`, `radius`, hits, status…) + matching `rankText`
- mp / cooldown / unlockLevel on the same entry
- Handler should only read combat via `skillCombatAtRank` — do not re-hardcode mults
- Presentation: `theme` / `recipe` / `sfx` / `Effects.recipe…`
- skillPower rules: [combat.md](./combat.md) (no double-apply)
- Validate: `node tests/skill-combat.mjs`

---

## C. Visual · theme

### Hero outfit / hair color
- `CharacterFactory` `CLASS_LOOKS[lookId].palette` + createHero material branch

### Hero hair / hood / hat
- Runtime: head kit (`rogue` / `none`) in CharacterFactory
- Baked: `generate_assets.mjs` `HERO_BAKE_PROFILES` + hair/hat helpers

### Add playable class
- See extension-playbooks “Add a hero class”

### Cel-shading strength
- `convertToStylized` style `bandStrength`, `bands`
- `StylizedMaterial` defaults

### Zone mood color
- `ZONES.fog` / `sky` / `particle`
- Runtime interpolation: `LightingSystem.update` fog.color

### Whole palette (UI)
- `config.js` `COLORS`
- `css/game.css` hardcoded colors

### Monster re-skin (same mesh)
- change only content `color`, `accent`, `scale`

---

## D. Add content (short version)

### New monster (reuse shape)
1. `ENEMY_TYPES` + zone/shape/ai/weight
2. integrity

### New zone
→ [extension-playbooks.md §1](./extension-playbooks.md)

### New skill
→ [extension-playbooks.md §3](./extension-playbooks.md)

### New weapon base
1. `WEAPON_BASES`
2. `LootSystem.BASE_LEVELS`
3. (optional) GLB + WEAPON_* scale

### New affix
- `content.js` `AFFIXES` (`stat`, min/max, perLevel)
- `LootSystem` draws from the pool — almost no logic change needed

---

## E. World · camera · controls

### Camera zoom range
- `cameraMinDistance` / `cameraMaxDistance` / `cameraDistance`
- Height linkage: `cameraHeightPerDistance`

### Default view farther
- `cameraDistance` ↑ and raise max too

### Map edge
- `worldRadius`, `resolvePosition` clamp
- Terrain edge hill: `TerrainSystem.heightAt` edge term

### Hub size / respawn position
- `campRadius`, `respawnPosition`
- Forbid enemy camp entry: `Enemy.#keepOutOfCamp`

### Key bindings
- `Game.#handleInput` / `#handleMenus`
- Skill keys sometimes only sync with content `SKILLS.key` and the HTML kbd **display** (the real branch is in Game code)

---

## F. Performance · quality

### Graphics too heavy
- `?quality=low` or QUALITY_PRESETS
- vegetation / decorator multiplier
- `maxEnemies`
- shadow mapSize (`LightingSystem`)
- lower effect count

### Slow load
- AssetManager preload concurrency (`Game.initialize` arg 6/8)
- use LOD low model

### Specific zone FPS
- that coordinate's BiomeDecorator cluster count
- enemy density (zone-level spawn)

---

## G. Meta · progression

### World tier speed
- `HuntSystem.worldTier` = `1 + floor((level-1)/10)` change

### Skill point income
- Level up: `Player.addXp`
- 100-kill bonus: `HuntSystem.onKill` `% 100`

### Contract difficulty
- `HuntSystem.#makeContract` target values · reward

### Titles
- `HUNT_TITLES` kills threshold

---

## H. Save · debug

### Reset save
- delete localStorage `gpt5.6-sol-arpg-demo-v1`

### Save version
- before bumping `saveVersion`, review load merge

### Runtime cheat (console)
```js
const g = window.__SOL_ARPG_DEMO__;
g.player.level = 20; g.player.skillPoints = 10;
g.player.skills.whirlwind = 3;
g.enemies.populate(10);
```

### F3 stats
- `Game.getDebugSnapshot` / `UI.updateDebug`

---

## Minimum checks after editing

1. Load with `node server.mjs`
2. New game → land one basic attack
3. No console TypeError
4. After adding data, `node tests/integrity.mjs`
5. After changing save fields, continue once
