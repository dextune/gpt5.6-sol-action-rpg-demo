# Config · Tuning (`js/config.js`)

All values are `Object.freeze`d. After you **add or modify** a field, keep the freeze structure intact.

## `GAME_CONFIG`

| Key | Meaning | Common reason to change |
|-----|---------|-------------------------|
| `worldRadius` | playable circle radius | map size |
| `terrainSize` | terrain plane size | terrain mesh |
| `campRadius` | safe hub radius | spawn / enemy AI |
| `targetEnemies` / `maxEnemies` | concurrent enemy target / cap | performance, density |
| `spawnInnerRadius` / `spawnOuterRadius` | spawn ring around player | combat pressure |
| `despawnRadius` | remove when far | performance |
| `cameraDistance` | default distance | default view |
| `cameraMinDistance` / `cameraMaxDistance` | wheel zoom range | zoom-out limit |
| `cameraHeight` / `cameraHeightPerDistance` | height / zoom-linked rise | diorama angle |
| `cameraLookHeight` | look-at height | gaze |
| `respawnPosition` | post-death position `[x,y,z]` | hub |
| `autoSaveSeconds` | autosave interval | UX |
| `saveKey` / `saveVersion` | save slot / version | **do not bump carelessly** |
| `maxDelta` | frame delta clamp | spike guard |

## `PLAYER_CONFIG`

| Key | Meaning |
|-----|---------|
| `baseHp` / `baseMp` / `baseAttack` / `baseDefense` / `baseCrit` | level-1 base stat skeleton |
| `moveSpeed` / `acceleration` / `friction` | movement feel |
| `dashSpeed` / `dashDuration` / `dashCooldown` | dodge |
| `potionHealRatio` | potion heal ratio (vs maxHp) |
| `inventoryLimit` | legacy save compatibility; live game keeps one signature weapon |

Level-up scaling lives in the getters of `js/entities/Player.js` (`maxHp`, `attackPower`, etc.). Changing `config` alone gives a strong feel change, but to alter the **growth curve** also read the `Player` getters.

## `COLORS`

Shared colors (hex numbers) used by UI, floating text, and some effects.

## Quality presets

File: `js/graphics/RenderPipeline.js`

```js
QUALITY_PRESETS = {
  high:   { renderScale, maxPixelRatio, shadows, post, vegetation, label },
  medium: { ... },
  low:    { ... },
}
```

- `post: false` → skip post-processing pipeline (low-end)
- Shadow map size: `js/graphics/LightingSystem.js` `applyQuality`
- Vegetation density: `VegetationSystem` / `BiomeDecorator` internal quality multiplier

## Camera stability (important)

Current policy:

- `Game.shake()` → **no-op**
- `Game.hitStop()` → **no-op**
- Camera random offset disabled

Re-enabling restores the "screen shake" the user rejected. Do not restore without request.

## Related files

- `js/config.js`
- `js/core/Game.js` (`#updateCamera`, `shake`, `hitStop`)
- `js/graphics/RenderPipeline.js`
- `js/graphics/LightingSystem.js`
