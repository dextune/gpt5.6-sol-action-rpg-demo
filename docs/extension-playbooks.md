# Extension playbooks (applied)

Use these when the task is not a simple constant change but **a feature that crosses multiple files**. Each playbook can be followed top to bottom and its checklist reduces missed wiring.

---

## 1) Add a new zone end-to-end

Goal: one map region + monster pool + boss + (optional) decoration.

### Steps

1. **Data** `js/data/content.js` `ZONES`
   - `id`, `name`, `subtitle`, `center:[x,z]`, `radius`, `minLevel`/`maxLevel`
   - `fog`/`sky`/`accent`/`particle` colors
2. **Monsters** same file `ENEMY_TYPES` with `zone: 'newId'`, 6 normal + 1 `boss: true`
   - `ZONE_SPAWNS` / `ZONE_BOSSES` are auto-generated → no separate registration
3. **Zone detection** `TerrainSystem.zoneAt` is center/radius based → works from data alone
   - Terrain **visual blend** uses the shader `terrainWeights` hardcoding regions (canyon/frost…) → to match a new zone's "ground color" you must add a fragment weight term in `TerrainSystem.js`
4. **Decoration** (optional) `BiomeDecorator.js` tree/rock cluster coordinates near the new center
5. **Road** the decorator's `#roadDistance` draws roads toward non-verdant zone centers → auto-reflected
6. **Validate** integrity + move to those coordinates in-game and check the zone-name HUD

### Coordinate sense

- World radius ≈ `GAME_CONFIG.worldRadius` (172)
- Existing centers: forest `[-91,-24]`, canyon `[93,14]`, frost `[-28,-103]` …
- Overlapping centers make `zoneAt` flicker at borders → tune radius and spacing

### Failure patterns

- Zone added in content but monster `zone` string typo → empty spawn pool
- No boss → `ZONE_BOSSES[id]` undefined, boss gauge fails to spawn

---

## 2) New monster: "reuse existing shape" vs "new shape"

### A. Re-skin existing shape (safest)

Only `content.js`:

```js
enemy('sand_jackal', 'Sand Jackal', 'canyon', 'wolf', 17, ...)
```

- `shape: 'wolf'` → uses the GLB already pointed at by `MonsterFactory.SHAPE_ARCHETYPE`
- Differentiate via `color` / `accent` / `scale` / `ai` / `weight`

### B. New shape key

1. `MonsterFactory.js` `SHAPE_ARCHETYPE`: `'myshape': 'monster.xxx'`
2. `assets.json` model key + GLB file
3. Fallback mesh: `ModelFactory.js` `createEnemyModel` switch / builder
4. Confirm it is included in integrity's "model builder" list

### AI selection guide

| ai | Feel | Implementation |
|----|------|----------------|
| melee | approach then melee | default |
| skirmish / pack | in and out | Enemy branch |
| ranged / caster | keep distance + projectiles | `enemyProjectile` |
| charge | charge telegraph | `enemyCharge` |
| leap | landing AoE | `enemyLeap` |
| boss | special gauge | `special` + `enemyBossSpecial` |

New AI pattern: one **line** of branch in `Enemy.#combatAI` + a `CombatSystem` method.

---

## 3) New active skill full set

### Checklist

| # | File | Work |
|---|------|------|
| 1 | `content.js` `SKILLS` | id, key, unlockLevel, mp, cooldown, rankText |
| 2 | `CombatSystem.usePlayerSkill` | `else if (skillId === '...')` |
| 3 | `CombatSystem` private method | actual hit + VFX |
| 4 | `Player.trySkill` | animation `skill_<id>` (idle fallback if absent in GLB) |
| 5 | `index.html` | ability-slot + kbd (rearrange existing keys if no slot space) |
| 6 | `UI.#updateAbility` loop | add to skill id array |
| 7 | manifest animationMap | (when clips exist) |
| 8 | integrity HUD slot check | edit tests if needed |

### Copy-paste source patterns

- Radial AoE multi-hit: `#whirlwind`
- Projectile: `#crescent` + `projectiles[]`
- Jump landing: `#skyfall` + telegraph
- Delayed bursts: `#starburst` + `#delay`

### Balance levers (skill)

- content: mp, cooldown, unlockLevel
- CombatSystem: radius, damage mult (`player.attackPower * k`), knockback, delay timing
- rank: convention is linear radius/damage growth via the `rank` argument

---

## 4) New weapon base + drop wiring

1. `content.js` `WEAPON_BASES` entry
   `id, name, model, power, speed, crit, color`
2. `LootSystem.js` `BASE_LEVELS`: `baseId → min spawn level`
   **If missing, it may not appear in low-level pools or gets filtered out**
3. If `model` is a new mesh, `assets.json` + `weapon.<model>` GLB
4. Length / girth: add key in `CharacterFactory` `WEAPON_LENGTH` / `WEAPON_GIRTH`
5. (Optional) swap starting weapon `starterBlade()`

Armor / charms are the same: `ARMOR_BASES` / `CHARM_BASES` + `BASE_LEVELS`.

### Rarity · pity

`LootSystem.rollRarity` — luck, elite, boss, worldTier, `rarePity`.
"Legendaries too rare" → adjust legendary weight / pity factor.

---

## 5) Combat tempo profile (applied tuning)

Do not change a single axis — **tune the set together**.

| Profile | Where to touch |
|---------|---------------|
| Faster, more casual | Player combo cooldown↓, attackSpeed cap↑, ease enemy attackCooldown↓ |
| Heavier, soulslike | basic attack delay↑, enemy damage↑, check player invuln frames |
| AoE / ground meta | skill radius↑, basic range↓, maxEnemies↑ |
| Boss raid | bossCharge increment↓ (`HuntSystem.onKill`), boss HP content↑ |

### Chain side effects

- attackSpeed↑ → effect spawns↑ → pool exhaustion / frame drop
  → also review `Effects` pool size, `maxEnemies`
- knockback↑ → enemies pushed past cliff / despawn radius
  → `despawnRadius`, world edge

---

## 6) Strengthen presentation while keeping "fixed camera + hit feel"

**Allowed**

- `Effects.impact` / `swingArc` / particle / ring / pillar / slash
- Sound `AudioManager.hit/swing`
- Enemy knockback / hitstun (`Enemy.state = 'hit'`)
- Damage floating-text scale (CSS)

**Forbidden (current policy)**

- Restoring real `Game.shake`
- Freezing the world via `Game.hitStop`
- Player mesh scale punch, strong lunge (camera-follow jitter)

When increasing hit feel, lever priority: **VFX layer count → particles → sound → knockback → (last) very weak lunge**.

---

## 7) Performance budget playbook

Where to cut by symptom.

| Symptom | First priority | Second priority |
|---------|----------------|-----------------|
| Always low | quality medium/low, shadow mapSize | vegetation counts |
| Low only in combat | maxEnemies, effect count | enemy castShadow |
| Only specific zone | BiomeDecorator cluster count | zone-specific mesh |
| On zoom-out | camera far / vegetation | raise fog density to hide distance |
| Slow load | parallel preload, LOD low | texture resolution |

Quality preset one-liner: `RenderPipeline.QUALITY_PRESETS` + `LightingSystem.applyQuality` + world density.

---

## 8) Save-compatibility playbook

| Change | Save impact |
|--------|-------------|
| content monster stats | none (runtime table) |
| Add Player inventory schema field | need undefined guard on load |
| Add skill key | fill old saves with 0 |
| saveKey / saveVersion | old slot hidden / version check fails |

Recommendation: when adding a field, merge a default in the `Player` load path. When bumping version, `saveVersion` + migration or a "delete save" notice.

---

## 9) Add a new combat metric to the UI

Example: "combo hit count", "damage per second".

1. Decide where state lives: `Player` or `HuntSystem` or `CombatSystem`
2. Update it in `update`
3. `index.html` element id
4. `UI` constructor `elements` array + `#updateHUD`
5. CSS

Missing DOM id → `getElementById` null → click handler throws. **Keep the elements list in sync.**

---

## 10) Debug · cheat hooks (development)

Already exposed:

- `window.__SOL_ARPG_DEMO__`
- F3 debug HUD (`getDebugSnapshot`)

Applied example (when adding code):

```js
// in console
const g = window.__SOL_ARPG_DEMO__;
g.player.gold += 9999;
g.enemies.spawnBoss('verdant');
g.player.skills.whirlwind = 5;
```

When an agent adds a cheat key: `Input` + `Game` playing branch, **off by default in release** or guarded by `?debug=1`.

---

## 11) Match a sound theme

`AudioManager` is WebAudio synthesis (no sample files).

- Hit: `hit(critical, finisher)`
- Swing: `swing(combo)`
- Skill: `skill()` shared → to split per-skill tone, separate methods then change the `CombatSystem` call

Watch for peaking on high volume (small gain values).

---

## 12) Add a hero class (full kit)

1. `js/data/content.js`
   - `HERO_CLASSES.<id>`: `attackStyle` (`melee`|`magic`), `activeSkills`, `passiveSkills`, `starterWeapon`, `baseStatMods`, look/model keys
   - `SKILLS` entries with `classId`, and for actives: `effect`, `anim`, `castTime`, `key`
2. `CombatSystem.skillHandlers` — implement each new `effect` id; for magic basics use `attackStyle: 'magic'`
3. Bake: hero GLB (`exportHeroClass`) + weapon if needed (`--staff-only` pattern)
4. `assets.json` model keys; `CLASS_LOOKS` + title `data-class-id`
5. HUD/input auto-bind via class `activeSkills` — no hard-coded skill ids in Game
6. `node tests/integrity.mjs`

Keep Hunt/Defense mode isolation.

## 13) "Re-theme in one request" checklist

Example: whole Naruto tone → dark fantasy.

| Layer | File |
|-------|------|
| Hero palette | CharacterFactory `CLASS_LOOKS` |
| Weapon silhouette | WEAPON_* + class starterWeapon |
| UI gold/ink | config COLORS, game.css variable colors |
| Zone fog | content ZONES + LightingSystem |
| Effect base color | CombatSystem hardcoded hex |
| Title copy | index.html / UI strings |

Changing color alone may not match the tone → keep **hero + effects + fog** as one set.

---

## 14) Test · manual QA scenario (for applied features)

Minimum play pass after adding a feature:

1. Title → new game
2. Basic 4-combo + empty swing + enemy hit
3. One skill (unlock-level cheat allowed)
4. Death → respawn (hub)
5. Esc quality switch
6. F5 then continue (if you touched save fields)

Automated: `node tests/integrity.mjs`
(Integrity does not validate runtime balance — numbers are manual.)

---

## 14) Multi-system event hook locations

Where to attach side effects to game events:

| Event | Call site |
|-------|-----------|
| Enemy killed | `Game.onEnemyKilled` → Hunt + Loot |
| Player hit | `CombatSystem.#damagePlayer` |
| Level up | `Player.addXp` loop |
| Zone change | `UI.#updateHUD` lastZoneId / World.update currentZone |
| Boss spawn | `EnemySystem.spawnBoss`, Hunt bossCharge |

When plugging in a new system, keep a **thin facade on Game** so systems do not circular-import each other.
