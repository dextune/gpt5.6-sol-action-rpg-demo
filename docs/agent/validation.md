# Validation & regression guards

## Commands

```bash
node tests/integrity.mjs          # full suite (runs import-integrity at the end)
node tests/import-integrity.mjs   # import/export + class/combat simulations
npm test                          # same as integrity.mjs
npm run test:imports              # import-integrity only
```

Run after changes to:

- `js/data/content.js`, `js/config.js`  
- imports in any `js/**/*.js`  
- hero/weapon paths or `assets/manifests/assets.json`  
- `CombatSystem` skill handlers  

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

## What `integrity.mjs` still covers

- Relative module path existence  
- Zone/boss/shape counts  
- Save version  
- Defense UI hooks  
- Hero wizard GLB paths, class select UI  
- Audio sample paths  
- Nested import-integrity  

## Agent workflow after a class PR

1. `node tests/integrity.mjs`  
2. Manual: New Hunt as new class + Defense once  
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
