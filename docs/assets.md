# Assets · Loading

## Manifest

`assets/manifests/assets.json`

```json
{
  "models": {
    "hero.aerin": { "lods": { "high": "...", "medium": "...", "low": "..." }, "animationMap": {...} },
    "weapon.katana": { ... },
    "monster.boar": { ... }
  },
  "textures": {
    "hero.baseColor": { "url": "...", ... },
    "terrain.grass.baseColor": { ... }
  }
}
```

## Loading path

`AssetManager`

1. `initialize` → load manifest
2. `preload(modelKeys, textureKeys, progress)`
3. `cloneModel(key)` → skeleton clone or **fallback** `createFallback`
4. Textures: `TextureCache.acquire` / `getTexture`

Fallbacks:

- `hero.*` → `createHeroModel()`
- monsters → `createEnemyModel(data)`

## Add a new model

1. Place file `assets/models/...`
2. Register manifest key
3. Reference the key in code (CharacterFactory / MonsterFactory / content model field)
4. If it has animations, keep `animationMap` and controller call names in sync

## Textures

- Terrain layers: grass/dirt/sand/stone/path/cliff × baseColor (current shader is color-focused)
- Characters: the hero may disable maps for an anime tone (`CharacterFactory`)

## Tools

`tools/assets/` — generation / bake scripts (only when needed).
Runtime does not require `tools`.

## Validation

`tests/integrity.mjs` — manifest paths, local Three, license, etc.
