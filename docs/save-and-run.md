# Run · Save · Verify

## Run

```bash
# Node.js (recommended)
node server.mjs
# → http://127.0.0.1:8080

# Python 3
python -m http.server 8080 --bind 127.0.0.1
# Windows: py -m http.server 8080 --bind 127.0.0.1

# Port change
PORT=3000 node server.mjs
```

Query params:

- `?quality=low|medium|high`
- `?debug=1` (show debug HUD on start)
- `?autostart=1` (auto start new game after title)
- `?class=aerin|wizard` (pre-select title class)

`server.mjs` uses `safePath` which accounts for Windows path separators. Watch for 403 when modifying the path guard.

## Save

- Key: `GAME_CONFIG.saveKey` (`gpt5.6-sol-arpg-demo-v1`)
- Version: `saveVersion: 4` (player `classId`; missing → `aerin`)
- Auto-save: `autoSaveSeconds`
- Continue: title `continue-btn`

When changing save schema:

1. Increment `saveVersion`
2. Handle old versions in load branch or show reset notice
3. Note in docs/README

## Verify

```bash
node tests/integrity.mjs          # full suite (includes import-integrity)
node tests/import-integrity.mjs   # import/export + class/combat simulation only
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
