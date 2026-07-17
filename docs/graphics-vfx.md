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
Enemy status pulse (burn/slow) also drives hit-pulse tint via `Enemy.#animate`.

## Effect API (`Effects.js`)

Pool-based. Call `effects.update(delta)` every frame.  
Constructor: `new Effects(scene, assets?, quality?)` — quality also via `effects.setQuality(q)` (`Game.setQuality` forwards).

### Primitives

| Method | Use |
|--------|-----|
| `burst(pos, color, count, opts)` | particle explosion (**count quality-scaled** unless `rawCount`) |
| `dust(pos, color, count, size)` | dust (non-additive) |
| `slash(pos, dir, color, size, opts)` | slash ribbon |
| `ring(pos, color, radius, opts)` | shockwave ring |
| `pillar(pos, color, height, opts)` | light pillar |
| `trail(pos, color, radius, life)` | afterglow sphere |
| `impact(pos, color, intensity, opts)` | **combined hit presentation** |
| `swingArc(pos, dir, color, size, opts)` | **multi-arc swing** |
| `groundDecal(pos, color, radius, opts)` | fading ground disc (ice residual / scorch) |
| `afterimage(pos, color, opts)` | short ghost capsule (blink) |
| `verticalBeam(pos, color, height, opts)` | meteor / sky column |

### Named skill recipes (prefer these over ad-hoc stacks)

| Recipe | Skill identity |
|--------|----------------|
| `recipeSpinStorm` | whirlwind multi-height spin |
| `recipeGroundWave` | crescent ground scar wave |
| `recipeLeapImpact` | skyfall landing (dual ring + dust cone) |
| `recipeStarBlade` / `recipeStarFinale` | starburst star blades + finale |
| `recipeFireOrb` / `recipeFireBlast` | fireball muzzle + explode |
| `recipeIceNova` | frost lattice rings + decal |
| `recipeBlinkBurst` | arcane blink from/to afterimages |
| `recipeMeteorDrop` / `recipeMeteorFinale` | falling meteors (vertical, not star twins) |

**Rule for new skills:** add a **new recipe** (or clearly different composition) so silhouettes stay distinct. Do not only recolor another skill’s stack.

### Impact intensity

`light` | `heavy` | `critical` | `finisher`

### Themes (`js/data/fxThemes.js`)

```js
import { getFxTheme, scaleCount } from '../data/fxThemes.js';
const theme = getFxTheme('ember'); // primary, secondary, core, dust, accent
```

Handlers should pull colors from themes — avoid new hardcoded hex in `CombatSystem`.

### Quality particle LOD

```js
// automatic inside burst() via Effects.quality
// low ≈ 0.45 · medium ≈ 0.75 · high = 1.0  (qualityParticleMul)
```

`Game.setQuality` → `effects.setQuality(quality)` so mid-session quality changes budgets.

### Pool limits

- `MAX_PARTICLES` (128)
- pools: particles, slashes, rings, pillars, trails, **decals**, **ghosts**, **beams**

If juice rises and effects cut off early → raise the relevant pool **and** keep quality scaling.

## Camera (graphics view)

- Distance: wheel → `Game` + `GAME_CONFIG` min/max
- **shake disabled** — do not re-add here

## Cautions when editing

- Adding a post pass is costly even on medium
- The terrain shader is already a texture-unit-saving version (`TerrainSystem` planar sample) — be careful reverting to triplanar
- Skill VFX density × `maxEnemies` can thrash pools — measure on medium quality

## Application: add a new skill recipe

1. Compose existing primitives in a `recipe…` method on `Effects`
2. Call it from the skill handler with `getFxTheme(skill.theme)`
3. Estimate concurrent spawns × pool size on low/medium/high
4. Document the recipe name on `SKILLS[id].recipe` in content

## Application: new primitive (only if recipes cannot differentiate)

1. New pool + update loop in `Effects`
2. Clear/dispose paths
3. Prefer 1–2 primitives per feature PR (`groundDecal`, `afterimage`, `verticalBeam` already ship)

## Related

- [combat.md](./combat.md) — when to call recipes
- [content-data.md](./content-data.md) — `theme` / `recipe` fields
- [history/skill-motion-spectacle.md](./history/skill-motion-spectacle.md)
