# GPT-5.6 Agent Docs

Guides for small and large agents to safely modify the **GPT-5.6: Sol / Action RPG DEMO** project's design, combat, and content data.

## Recommended reading order

1. [Architecture](./architecture.md) — folders, runtime flow
2. [Quick edit recipes](./quick-edit-recipes.md) — constants, single-file edits
3. [Extension playbooks](./extension-playbooks.md) — features across multiple files
4. Topic-category docs

## Category list

| Doc | Covers |
|-----|--------|
| [architecture.md](./architecture.md) | module structure, boot order, dependency direction, layering |
| [config-and-tuning.md](./config-and-tuning.md) | `GAME_CONFIG` / `PLAYER_CONFIG` / quality presets |
| [content-data.md](./content-data.md) | zones · monsters · equipment · skills + curve design |
| [combat.md](./combat.md) | basic attack · skills · damage · hit/visual separation |
| [audio.md](./audio.md) | Web Audio SFX, sample playback, mixing, and combat timing |
| [characters-visual.md](./characters-visual.md) | hero/weapon visuals, animation palette |
| [monster-visual.md](./monster-visual.md) | monster color/form/elite detail, fallback builders |
| [graphics-vfx.md](./graphics-vfx.md) | render pipeline, effect API |
| [world.md](./world.md) | terrain, zone detection, vegetation, decoration |
| [systems.md](./systems.md) | spawn · hunt · loot · event pipeline |
| [assets.md](./assets.md) | GLB/texture manifest, loading |
| [ui-input.md](./ui-input.md) | input, HUD, panels, camera controls |
| [save-and-run.md](./save-and-run.md) | run, save, validate |
| [quick-edit-recipes.md](./quick-edit-recipes.md) | short request → file mapping |
| [extension-playbooks.md](./extension-playbooks.md) | **applied: zone/skill/theme/performance E2E** |
| [plan/defense-mode.md](./plan/defense-mode.md) | **plan: Defense mode (waves) — must not regress Hunt** |

## Agent working rules (summary)

1. **For data, look at `js/data/content.js` and `js/config.js` first.**
2. **Separate combat numbers from presentation**: numbers/skill definitions live in content/config, hitbox/effect calls live in `CombatSystem` / `Effects`.
3. **Camera shake / hit-stop are disabled.** Do not re-enable `Game.shake` / `Game.hitStop` (stable screen kept at user request).
4. **No external CDN.** Three.js uses `vendor/` local only.
5. After editing, run `node tests/integrity.mjs` when possible.
6. No unnecessary refactor or full reformat. Edit only the requested scope.

## Core file map (ultra-compact)

```
js/main.js                 entry
js/core/Game.js            loop, camera, state machine
js/config.js               world/player tuning constants
js/data/content.js         zone·enemy·equipment·skill tables
js/systems/CombatSystem.js attack/skill/hit detection
js/graphics/Effects.js     slash·burst·impact VFX
js/characters/*            hero/monster visuals
js/world/*                 terrain·zone·environment
assets/manifests/assets.json  asset key → path
```
