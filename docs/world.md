# World · Terrain · Zones

## Core classes

| Class | File | Role |
|-------|------|------|
| `World` | `js/world/World.js` | assembly, heightAt/zoneAt delegation, colliders, spawn points |
| `TerrainSystem` | `TerrainSystem.js` | height function, zoneAt, layered terrain mesh |
| `VegetationSystem` | grass/flower instances | quality density |
| `BiomeDecorator` | trees · rocks · camp · roads | collider generation |
| `WaterSystem` | ponds | |
| `EnvironmentFactory` | GLB instance placement | |

## Height `heightAt(x, z)`

Procedural fbm + camp flattening + biome undulation.
Used by movement / spawn / camera ground clamp.

When changing it, **confirm the mesh rebuild and the logic height function are the same code** (currently `#buildMesh` calls the same `heightAt`).

## Zone `zoneAt(x, z)`

Returns the zone with the smallest normalized distance vs each `ZONES` center/radius.
If missing or broken it can crash with `zoneAt is not a function` — **must stay in TerrainSystem**.

World proxy:

```js
heightAt(x,z) → terrainSystem.heightAt
zoneAt(x,z)   → terrainSystem.zoneAt
```

## Collision

`World.colliders`: `{ x, z, radius }[]`
`resolvePosition` pushes player / enemies out.
When adding decoration, BiomeDecorator pushes colliders.

## Vegetation · decoration density

quality multiplier:

- VegetationSystem counts: high/medium/low
- BiomeDecorator `multiplier`

Lower these first when facing performance issues.

## Sky · particles

`World` sky shader, `ambientParticles` — refer to zone particle colors.

## Related content

Zone metadata: `js/data/content.js` `ZONES`.

## Application: zone visual vs zone logic

| System | How it recognizes a zone |
|--------|--------------------------|
| Spawn / HUD / boss | `zoneAt` + content ZONES (data) |
| Terrain texture blend | shader hardcoded smoothstep (coordinate threshold) |
| Decoration density | BiomeDecorator manual cluster coordinates |

The reason **adding a data zone does not change ground color** is the shader side.
For full linkage, touch both. → [extension-playbooks.md §1](./extension-playbooks.md)

## Application: movement blocking / getting stuck

- collider radius too large → BiomeDecorator
- cannot leave camp circle → no, camp only forbids enemies and heals the player
- worldRadius clamp → config
- heightAt steep slope → movement logic is mostly planar, so instead of sliding you may see visual float (y snaps on resolve)

## Application: spawn position quality

`World.randomSpawnAround` filters colliders / camp / edges.
If spawning fails and only similar spots appear, the attempts (32) are exhausted — check decoration collider over-density.
