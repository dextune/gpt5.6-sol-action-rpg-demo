# Validation & regression guards

## Commands

```bash
node tests/integrity.mjs          # full suite (skill-combat + import-integrity nested)
node tests/skill-combat.mjs       # skill params, themes, skillPower, status pure paths
node tests/import-integrity.mjs   # import/export + class/combat simulations
npm test                          # same as integrity.mjs
npm run test:imports              # import-integrity only
```

Run after changes to:

- `js/data/content.js`, `js/data/skillCombat.js`, `js/data/fxThemes.js`, `js/config.js`  
- imports in any `js/**/*.js`  
- hero/weapon paths or `assets/manifests/assets.json`  
- `CombatSystem` skill handlers / `Effects` recipes  
- skill SFX banks  

## What `import-integrity.mjs` catches

| Check | Example failure |
|-------|-----------------|
| Named import of non-existent export | Typo in import list |
| Free use of `content.js` / `config.js` symbol without import | `SKILLS is not defined` in Game.js |
| Class active/passive ids missing in `SKILLS` | Broken class row |
| Active skill missing `effect` / `anim` / `key` | Incomplete skill row |
| `effect` not registered in `CombatSystem.skillHandlers` | Skill does nothing / runtime miss |
| Level-up unlock simulation | Wrong class skills announced |
| Duplicate Q/E/R/C keys on a class | Ambiguous input |

Proven: removing `SKILLS` from Game’s content import makes the suite **fail** with:

```text
import required: SKILLS in js/core/Game.js
Game.js imports content symbol SKILLS
```

## What `skill-combat.mjs` covers

| Check | Why |
|-------|-----|
| Every active has `combat` / `theme` / `sfx` / `recipe` / `anim` | Spectacle identity bar |
| Wizard anims not knight skill aliases | Motion diversity |
| `skillDamage` + `resolveSkillHitRaw` skillPower once | No double/under apply |
| Crescent projectile path vs fireball baked path | `skillPowerApplied` flag |
| Frost/fire statuses present | slow / burn identity |
| Starburst ≠ meteor pattern | No palette-only twin |
| `Game.setQuality` → effects LOD | Particle budgets |

## What `integrity.mjs` still covers

- Relative module path existence  
- Zone/boss/shape counts  
- Save version  
- Defense UI hooks  
- Hero wizard GLB paths, class select UI  
- Audio sample paths (including themed skill banks)  
- Nested **skill-combat** + import-integrity  

## Agent workflow after a class PR

1. `node tests/integrity.mjs`  
2. Manual: MAX HUNT as the new class + Defense once
3. Kill enemies through a skill unlock level and confirm no console `ReferenceError`  
4. Do **not** auto-commit/push unless the user asks  

## Non-game console noise

| Message | Action |
|---------|--------|
| `contentscript.js` / ObjectMultiplex / liveness streams | Browser extension (e.g. wallet) — ignore |
| `[MODULE_TYPELESS_PACKAGE_JSON]` under Node tests | Harmless warning without `"type":"module"` |

## Save notes

- `saveVersion` is **4** (includes `player.classId`).  
- Old saves without `classId` load as `aerin`.  
- Defense still does not write Hunt continue mid-run.  
