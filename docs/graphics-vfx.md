# Graphics · VFX

## Render pipeline

`js/graphics/RenderPipeline.js`

- `WebGLRenderer` + optional `PostProcessSystem`
- Per-quality `renderScale`, `maxPixelRatio`, shadows, post
- **Dynamic-resolution thrashing disabled** (avoids buffer-rebuild flicker)
- Only FPS stats updated in `monitorFrame`

Post-processing: `PostProcessSystem.js`

| Pass | medium | high | low |
|------|--------|------|-----|
| SSAO | off | on (weak) | N/A (post off) |
| Outline | off | off | — |
| Bloom | on | on | — |
| Bokeh DOF | off | off | — |
| Grade + FXAA | on | on | — |

## Lighting

`LightingSystem.js` — sun shadow-map size per quality, fog, camp light.

## Stylized material

`StylizedMaterial.js` — cel bands, rim, hit pulse.
`convertToStylized` / `inferMaterialRole` set roughness etc. per role.

## Effect API (`Effects.js`)

Pool-based. Call `effects.update(delta)` every frame.

| Method | Use |
|--------|-----|
| `burst(pos, color, count, opts)` | particle explosion |
| `dust(pos, color, count, size)` | dust (non-additive) |
| `slash(pos, dir, color, size, opts)` | slash ribbon |
| `ring(pos, color, radius, opts)` | shockwave ring |
| `pillar(pos, color, height, opts)` | light pillar |
| `trail(pos, color, radius, life)` | afterglow sphere |
| `impact(pos, color, intensity, opts)` | **combined hit presentation** |
| `swingArc(pos, dir, color, size, opts)` | **multi-arc swing** |

### impact intensity

`light` | `heavy` | `critical` | `finisher`

### Pool limits

- `MAX_PARTICLES` (default 96)
- particles / slashes / rings / pillars / trails pool counts

If you raise the juice and the pool is exhausted, old effects are recycled and may cut off → raise pool size alongside.

## Camera (graphics view)

- Distance: wheel → `Game` + `GAME_CONFIG` min/max
- **shake disabled** — do not re-add here

## Cautions when editing

- Adding a post pass is costly even on medium
- The terrain shader is already a texture-unit-saving version (`TerrainSystem` planar sample) — be careful reverting to triplanar

## Application: add a new VFX preset

1. Add a method to `Effects` (reuse existing pools if possible)
2. Call it from CombatSystem / skills
3. Compute concurrent spawns × pool size
   Example: crit impact does burst ×3 of 40 particles → pool 40 can exhaust in one hit

## Application: color theme tokens

Hex values are scattered across CombatSystem / Effects.
Candidate for theme work:

```js
// example: top of CombatSystem
const FX = { slash: 0xeef8ff, crit: 0xffe47a, skillWind: 0x8feaff, skillStar: 0xe2b7ff };
```

Collecting them in one file before substituting makes re-theming safe.

## Application: per-quality effect LOD

Current effects barely look at quality. Low-end response:

```js
const q = game.renderPipeline.quality;
const count = q === 'low' ? 8 : q === 'medium' ? 16 : 28;
effects.burst(..., count, ...);
```

Inject the quality reference at `Game` / `Effects` creation.
