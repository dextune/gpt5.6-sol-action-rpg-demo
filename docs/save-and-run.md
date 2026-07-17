# Run · Save · Verify

## Run

```bash
# Node.js (recommended)
node server.mjs
# → http://127.0.0.1:8777

# Do not use file://. The Node server supplies the intended asset MIME types.

# Port change
PORT=3000 node server.mjs
```

Query params:

- `?quality=low|medium|high`
- `?debug=1` (show debug HUD on start)
- `?autostart=1` (auto start after title; with `?mode=defense` starts Defense, else New Hunt)
- `?class=aerin|wizard|rogue|ranger` (pre-select title class)

Title modes: **New Hunt**, **Defense**, **Continue**. Rift Rush / Daily Rift were removed.

`server.mjs` uses `safePath` which accounts for Windows path separators. Watch for 403 when modifying the path guard.

## Save

- Key: `GAME_CONFIG.saveKey` (`gpt5.6-sol-arpg-demo-v1`)
- Version: `saveVersion: 5` (player `classId` plus one signature weapon; missing → `aerin`)
- Auto-save: `autoSaveSeconds`
- Continue: title `continue-btn`

When changing save schema:

1. Increment `saveVersion`
2. Handle old versions in load branch or show reset notice. Version 5 folds legacy equipment into one legal signature weapon and converts discarded legacy gear to gold.
3. Note in docs/README

## Verify

```bash
node tests/integrity.mjs          # full suite (includes import-integrity)
node tests/import-integrity.mjs   # import/export + class/combat simulation only
node tests/class-mode-visual-smoke.mjs  # desktop + mobile class/Defense visual smoke
# or: npm test
```

Checks: module paths, zone/boss mappings, skill HUD slots, local Three, license,  
**named import ↔ export consistency**, free use of `content.js`/`config.js` symbols without import,  
class skill catalog vs `CombatSystem.skillHandlers`, level-up unlock simulation.

## Browser debug

- `window.__SOL_ARPG_DEMO__` — Game instance
- F3 — FPS/draw call etc.

## Common runtime errors

| Symptom | Check |
|---------|-------|
| `SKILLS is not defined` / similar ReferenceError | Missing import; run `node tests/import-integrity.mjs` |
| `zoneAt is not a function` | `TerrainSystem.zoneAt` exists, World delegation |
| `setDebugVisible is not a function` | `UI` method |
| 403 before files | `server.mjs` safePath (Windows) |
| Shader texture units | Terrain sampler overload (current version uses color mostly) |
| Screen flicker | Dynamic resize thrash (currently kept disabled) |
| `contentscript.js` ObjectMultiplex | Browser extension noise (e.g. wallet) — ignore |
