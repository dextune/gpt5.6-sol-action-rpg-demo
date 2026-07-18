# GPT-5.6 Agent Docs

Guides for agents modifying the **GPT-5.6: Sol / Action RPG DEMO** (Three.js browser ARPG).

## Reading order

1. [Architecture](./architecture.md) — folders, runtime flow, layering  
2. [Architecture · template boundary](./architecture-template-boundary.md) — **LOCKED** template-3d vs sol-arpg  
3. [Quick edit recipes](./quick-edit-recipes.md) — constants / single-file edits  
4. [Extension playbooks](./extension-playbooks.md) — multi-file features  
5. Topic guides below  

**Hero classes:** [agent/README.md](./agent/README.md)

## Living guides (current contracts)

| Doc | Covers |
|-----|--------|
| [architecture.md](./architecture.md) | module structure, boot, dependency direction |
| [architecture-template-boundary.md](./architecture-template-boundary.md) | **LOCKED:** GameContext, asset refs, skill registry, `packages/template-3d` |
| [config-and-tuning.md](./config-and-tuning.md) | `GAME_CONFIG` / `PLAYER_CONFIG` / quality / growth tables |
| [content-data.md](./content-data.md) | zones · monsters · equipment · skills schema |
| [combat.md](./combat.md) | basic attack · skills · statuses · skillPower · recipes |
| [audio.md](./audio.md) | Web Audio SFX, themed banks |
| [characters-visual.md](./characters-visual.md) | hero/weapon visuals, clip catalogs |
| [monster-visual.md](./monster-visual.md) | monster styling / elite presentation |
| [graphics-vfx.md](./graphics-vfx.md) | render pipeline, Effects API, quality LOD |
| [world.md](./world.md) | terrain, zones, vegetation |
| [systems.md](./systems.md) | spawn · hunt · loot · modes pipeline |
| [assets.md](./assets.md) | GLB/texture manifest |
| [ui-input.md](./ui-input.md) | input, HUD, touch, panels, camera |
| [save-and-run.md](./save-and-run.md) | server, save, validation |
| [quick-edit-recipes.md](./quick-edit-recipes.md) | short request → file mapping |
| [extension-playbooks.md](./extension-playbooks.md) | zone/skill/theme/performance E2E |
| [agent/README.md](./agent/README.md) | multi-class pack, add-class playbook, facing, validation |

## Active plans

| Plan | Status |
|------|--------|
| [plan/audio-overhaul.md](./plan/audio-overhaul.md) | **ready** — full audio-system and content refactor: semantic events, mixer/voices, five-class combat, enemy/world/UI sound, ambience/music, and release gates |

See also [plan/README.md](./plan/README.md).

## History (shipped plans & reviews)

Index: **[history/README.md](./history/README.md)**

Hero graphics/animation overhaul: **[history/character-graphics-animation-overhaul.md](./history/character-graphics-animation-overhaul.md)**.

Includes code-quality P1 + N1–N5, Defense, MAX HUNT, multi-class/wizard/ranger/Gunner, skill spectacle, L100 evolution, motion bake, horde-clear V1, weapon progression, etc. (Rift Rush history only — removed from product.) Use for archaeology and “how did we ship X?”, not as open todo lists.

## Agent working rules (summary)

1. **Data first** — `js/data/content.js`, `js/config.js`, `js/data/skillCombat.js`, `js/data/fxThemes.js`.  
2. **Numbers ≠ hits ≠ FX** — content for numbers; `CombatSystem` (+ `js/systems/combat/*`) for hits; `Effects` recipes for spectacle.  
3. **Camera** — `Game.shake` / `Game.hitStop` stay no-ops.  
4. **No CDN** — Three.js from `vendor/` only.  
5. After content/path/skill edits: `node tests/integrity.mjs`.  
6. Edit only the requested scope. Docs under `docs/` are English; player UI is English.

## Core file map

```
js/main.js                      entry
js/core/Game.js                 loop, camera, input, thin mode/kill facades
js/core/gameModes.js            Hunt / Defense lifecycle helpers
js/core/killFeedback.js         multikill, chain, level-up nova, kill refund
js/core/GameContext.js          GAME_CONTEXT_KEYS (LOCKED)
js/config.js                    Sol tuning (growth, combat feel, …)
js/core/runtimeConstants.js     template-safe locomotion / feel scales
js/data/content.js              zone · enemy · equipment · skill tables
js/data/skillCombat.js          pure skill damage + status helpers
js/data/fxThemes.js             skill color themes + particle quality mul
js/data/defenseContent.js       Defense encounters + decision mutators
js/systems/CombatSystem.js      hit hub + orchestration
js/systems/combat/              skill kits, basicAttacks, projectiles, registry
js/systems/DefenseSystem.js     Defense wave climb FSM
js/ui/UI.js                     facade + bindEvents + thin panel delegates
js/ui/panels/                   inventory, skills, HUD, minimap, title, …
js/graphics/Effects.js          primitives + skill recipes + quality LOD
js/characters/*                 hero/monster visuals
js/world/*                      terrain · zone · environment
assets/manifests/assets.json    asset key → path
tests/integrity.mjs             merge gate (skill-combat, boot-smoke, …)
```
