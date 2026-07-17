# Architecture

## Runtime stack

- **Engine**: Three.js r160 (`vendor/three.module.min.js`, import map)
- **Type**: Browser ES modules (`type="module"`)
- **Server**: `server.mjs` (Node) or Python `http.server`
- **Save**: `localStorage` (`SaveManager`)

## Boot sequence

```
index.html
  → js/main.js
    → new Game(canvas)
    → game.initialize()
         AssetManager.preload
         World / CharacterFactory / MonsterFactory
         Player, systems (Combat, Enemy, Loot, Hunt), UI
         state = 'title' → start loop
```

Entry point: `js/main.js`
Loop / states: `js/core/Game.js` (`title` | `playing` | `paused` | `dead` | `loading`)

## Directory roles

| Path | Role |
|------|------|
| `js/core/` | Game loop, input, audio, save, utils; **mode helpers** (`gameModes.js`), **kill feedback** (`killFeedback.js`), `GameContext` |
| `js/data/` | **Pure content tables** (balance, catalog) |
| `js/config.js` | **Global tuning constants** (world size, camera, player defaults, growth) |
| `js/entities/` | Player / Enemy runtime state |
| `js/systems/` | Per-frame gameplay systems; combat kits under `systems/combat/` |
| `js/characters/` | GLB cloning, material styling, animation controllers |
| `js/graphics/` | Render, lighting, post-processing, VFX pool |
| `js/world/` | Terrain height/zone, vegetation, water, decoration |
| `js/ui/` | DOM HUD facade (`UI.js`) + **panel modules** (`ui/panels/*`) |
| `js/assets/` | Manifest, texture cache, GLTF loading |
| `assets/` | GLB / webp / png binaries |
| `vendor/` | Three.js + jsm addons (avoid editing) |
| `docs/history/` | Shipped plans & reviews (not active todos) |
| `docs/plan/` | In-flight plans only (empty when none) |
| `tests/integrity.mjs` | Integrity check (nested skill-combat, boot-smoke, …) |

## Dependency direction (preserve)

```
content.js / config.js   ←  almost every system
entities  ← systems  ← Game
characters / graphics / world  ← Game.initialize
ui  ← Game (display only, logic in Game/systems)
```

- `content.js` does not import Three.js (keep it pure data).
- Do not put game logic inside `vendor/`.
- Systems prefer `game.ctx` (`createGameContext`) over inventing cross-system imports.

## Template vs game boundary (LOCKED)

Future extraction of a reusable **template-3d** core is constrained by:

**[architecture-template-boundary.md](./architecture-template-boundary.md)** (LOCKED)

That document owns:

- Which files are template-candidate vs sol-arpg-only  
- `GAME_CONTEXT_KEYS` / `GameContext` rules  
- AssetManager `clones` / `purgeUnused` lifetime  
- `skillEffectRegistry` effect id lock  
- Extraction roadmap T0–T5  

Do not blur those layers without updating the boundary doc and `tests/template-boundary.mjs`.

## Quality tiers

URL `?quality=low|medium|high` or localStorage `sol-arpg-quality`.
Default: `medium` (`Game` constructor, `RenderPipeline`).

Presets: `js/graphics/RenderPipeline.js` → `QUALITY_PRESETS`.

## Things agents must not touch

- Large edits to `vendor/**`
- Changing the import map `three` path to a CDN
- Shipping a `saveKey`/`saveVersion` change without a migration (breaks saves)

## Application: layering when adding a feature

Pick a layer for the request.

| Layer | Example | Where |
|-------|---------|-------|
| Pure data | New monster stats | `content.js` |
| Tuning constant | Concurrent enemy count | `config.js` |
| Rule / hit | New hit shape | `CombatSystem` / entities |
| Presentation | Particles | `Effects` + call site |
| Progression / meta | Contract reward | `HuntSystem` |
| Display | HUD number | `UI` + `index.html` |
| Persistence | Save field | `SaveManager` + Game save/load |

**If a lower layer solves it, do not touch the upper layers.**
Example: "make this monster hit harder" → only `content` hp/damage. No `CombatSystem` change needed.

## Application: avoid circular dependencies

Recommended:

```
Game → systems → entities / world / graphics
Minimize direct imports between systems (mediate via game reference)
```

Follow the `CombatSystem` pattern that uses `this.game.enemies`, `this.game.effects`.

## State machine application

`Game.state`:

- `title` — no combat input, orbit camera
- `playing` — full simulation
- `paused` — world slow update, menus
- `dead` — respawn after timer

State which `state` a new input is valid in. Blocking attack while paused is already split via `#handleMenus` / playing branches.
