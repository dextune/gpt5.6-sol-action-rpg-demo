# Playbook: add a hero class

Use this checklist to add a new playable job (example: `knight`, `rogue`) without breaking Hunt/Defense.

**Estimated touch set:** data, combat handlers, assets, factory look, title UI, tests.

---

## 0. Choose identifiers

| Item | Convention | Example |
|------|------------|---------|
| `classId` | lowercase id | `knight` |
| `modelKey` | `hero.<classId>` | `hero.knight` |
| `lookId` | usually same as classId | `knight` |
| Skill ids | snake or short tokens | `shield_bash`, `cleave` |
| Effect ids | match handler keys | `shield_bash` |
| Weapon model | optional new kind | `mace` → `weapon.mace` |

---

## 1. Data — `js/data/content.js`

### 1.1 `HERO_CLASSES.<classId>`

```js
knight: Object.freeze({
  id: 'knight',
  name: 'Rowan',
  title: 'Iron Vanguard',
  blurb: 'Heavy armor · shield line',
  modelKey: 'hero.knight',
  lookId: 'knight',
  attackStyle: 'melee', // or 'magic'
  skillPanelTitle: 'Oath Arts & Discipline',
  attackLabel: 'Strike',
  activeSkills: Object.freeze(['shield_bash', 'cleave', 'bulwark', 'judgment']),
  passiveSkills: Object.freeze(['iron_body', 'guard_stance', 'focus_line', 'war_spoils']),
  baseStatMods: Object.freeze({ attack: 1.05, mp: 0.9, skillPower: 0 }),
  starterWeapon: Object.freeze({
    id: 'starter-knight-blade',
    baseId: 'field_blade', // or a new WEAPON_BASES row
    slot: 'weapon',
    name: 'Recruit Blade',
    rarity: 'common',
    level: 1,
    itemLevel: 1,
    power: 12,
    speed: 0.92,
    crit: 0.02,
    model: 'sword', // must exist as weapon.<model> in manifest
    color: 0xd0d8e0,
    locked: true,
  }),
}),
```

### 1.2 `SKILLS` entries

For **each** active skill:

- `classId`, `key` (`Q`/`E`/`R`/`C`), `unlockLevel`, `maxRank`, `mp`, `cooldown`  
- `castTime`, `anim` (existing GLB clip name), `effect` (handler id)  
- `name`, `description`, `rankText`  

For **each** passive:

- `classId`, `passive: true`, `effect: { attack?, hp?, defense?, skillPower?, mpRegen?, mpFlat?, luck?, gold? }`  
- Player getters aggregate passives via `passiveEffects`  

Keys within a class’s four actives must be unique.

### 1.3 Optional weapon bases

If the starter uses a new `model`:

1. Add `WEAPON_BASES` row (if it should drop as loot).  
2. Add `LootSystem` `BASE_LEVELS` entry for that base id.  
3. Bake/register `weapon.<model>` (step 3).  

---

## 2. Combat — `js/systems/CombatSystem.js`

1. Implement methods for each new `effect` (e.g. `#shieldBash`).  
2. Register on `this.skillHandlers`:

```js
shield_bash: (p, r) => this.#shieldBash(p, r),
```

3. If `attackStyle: 'magic'`, basic attack already uses `#magicAttack` (orbs along facing).  
4. If `attackStyle: 'melee'`, `#meleeAttack` is used.  
5. Direction rules: use `#facingDir` / `#aimAlongFacing` — **do not** aim player skills at mouse `aimPoint`. See [combat-facing.md](./combat-facing.md).

---

## 3. Assets

### 3.1 Hero GLB (shared skeleton)

Edit `tools/assets/generate_assets.mjs`:

1. Add a profile under `HERO_BAKE_PROFILES` (colors, hair style, head gear).  
2. Export:

```bash
# Requires npm `three` for GLTFExporter (e.g. three@0.160.0) when baking
node tools/assets/generate_assets.mjs --heroes-only
# or extend CLI flags for a single class if you add them
```

Output pattern:

- `assets/models/hero/<stem>_lod0.glb`  
- `assets/models/hero/<stem>_lod1.glb`  

Keep **identical bone names** and **animation clip names** as Aerin/Wizard (reuse `heroAnimations`).

### 3.2 Manifest — `assets/manifests/assets.json`

```json
"hero.knight": {
  "type": "character",
  "lods": {
    "high": "./assets/models/hero/knight_lod0.glb",
    "medium": "./assets/models/hero/knight_lod1.glb",
    "low": "./assets/models/hero/knight_lod1.glb"
  },
  "animationMap": { /* same keys as hero.aerin */ }
}
```

Preload loads **all** model keys automatically.

### 3.3 Weapon prop (optional)

- Add bake function or branch in `createWeapon` (see `staff` / `--staff-only`).  
- Register `weapon.<kind>` URL.  
- Add `WEAPON_LENGTH` / `WEAPON_GIRTH` in CharacterFactory.  
- UI icon: `assets/textures/ui/icon_<model>.png` (can copy an existing icon).  

---

## 4. Runtime look — `CharacterFactory.js`

Add `CLASS_LOOKS[lookId]`:

```js
knight: Object.freeze({
  palette: Object.freeze({
    skin, cloth, clothDark, leather, hair, hairDark, metal, eye, outline,
    shadowTintCloth, shadowTintHair, rimHair, rimSkin,
  }),
  headKit: 'none', // or 'rogue' for runtime hood kit
  scale: 0.94,
}),
```

Prefer **either** baked head gear **or** runtime head kit — avoid double stacking.

---

## 5. Title UI

1. `index.html` — add a class card:

```html
<button type="button" class="class-card" data-class-id="knight" aria-pressed="false">
  <strong>Knight</strong>
  <small>Rowan · Iron line</small>
</button>
```

2. Styles already cover `.class-select` / `.class-card` in `css/game.css`.  
3. Optional QA: `?class=knight` pre-selects on title.  

HUD skill slots use `data-key="Q|E|R|C"`; labels sync from class actives in `UI.#syncAbilityBarForClass`.

---

## 6. Save

- `Player.serialize` already stores `classId`.  
- Load merges ranks only for the loaded class tree.  
- Missing `classId` → `aerin`.  
- If you change save shape further, bump `GAME_CONFIG.saveVersion` and merge defaults on load.  

---

## 7. Validation

```bash
node tests/integrity.mjs
# or only:
node tests/import-integrity.mjs
```

Must pass:

- Named imports match exports  
- Every class active `effect` registered in CombatSystem  
- Skill catalog consistency (`classId`, anim, keys)  

Manual QA:

1. Title → select class → New Hunt  
2. Move + attack: direction matches movement  
3. Unlock skills at 3 / 6 / 10 / 16  
4. Equip loot weapon  
5. Defense mode start + death → title (no Hunt blob corruption)  
6. Continue Hunt save restores `classId`  

---

## 8. Docs to update

- [characters-visual.md](../characters-visual.md) class table  
- [wizard-reference.md](./wizard-reference.md) if useful as parallel example  
- This folder’s [README.md](./README.md) “Existing classes” table  

---

## Anti-patterns

| Don’t | Do instead |
|-------|------------|
| Hardcode skill ids in `Game.js` input | `getClassActiveSkills` + `skillKeyCode` |
| Hardcode four skill ids in HUD update | Sync slots from class actives |
| Aim player combat at mouse `aimPoint` | `alignCombatFacing` + facing helpers |
| Bind LMB/RMB to attack or dodge | Keyboard only (`J` / `Space`); mouse = UI |
| New skeleton with different bone names | Share `heroSkeleton` + `heroAnimations` |
| Overwrite Hunt save during Defense | Mode isolation rules in Game/Save |
| Edit `vendor/` | Local tools only |
