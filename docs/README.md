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
| [content-data.md](./content-data.md) | zones · monsters · equipment · **skills combat/theme schema** |
| [combat.md](./combat.md) | basic attack · skills · statuses · skillPower · recipes |
| [audio.md](./audio.md) | Web Audio SFX, **themed skill banks**, mixing |
| [characters-visual.md](./characters-visual.md) | hero/weapon visuals, class clip catalogs |
| [agent/README.md](./agent/README.md) | **agent pack: multi-class heroes, add-class playbook, wizard reference** |
| [monster-visual.md](./monster-visual.md) | monster color/form/elite detail, fallback builders |
| [graphics-vfx.md](./graphics-vfx.md) | render pipeline, effect API, **skill recipes**, quality LOD |
| [world.md](./world.md) | terrain, zone detection, vegetation, decoration |
| [systems.md](./systems.md) | spawn · hunt · loot · event pipeline |
| [assets.md](./assets.md) | GLB/texture manifest, loading |
| [ui-input.md](./ui-input.md) | input, HUD, **mobile touch pad**, panels, camera |
| [save-and-run.md](./save-and-run.md) | run, save, validate |
| [quick-edit-recipes.md](./quick-edit-recipes.md) | short request → file mapping |
| [extension-playbooks.md](./extension-playbooks.md) | **applied: zone/skill/theme/performance E2E** |
| [plan/defense-mode.md](./plan/defense-mode.md) | **plan: Defense mode (waves) — must not regress Hunt** |
| [plan/multi-class-wizard.md](./plan/multi-class-wizard.md) | **plan: multi-class heroes + wizard GLB** |
| [plan/ranger-class.md](./plan/ranger-class.md) | **plan: Ranger (archer / huntress) 4th hero class** |
| [plan/short-session-polish.md](./plan/short-session-polish.md) | **plan: short-session content/visual polish (Tier A–B, no long-term sprawl)** |
| [plan/skill-motion-spectacle.md](./plan/skill-motion-spectacle.md) | **implemented standard: skill content, motion & spectacle** |
| [plan/level-100-skill-evolution/README.md](./plan/level-100-skill-evolution/README.md) | **implemented active-skill evolution and completed Phase 9 acceptance; deferred scope remains explicit** |
| [plan/weapon-enhancement-gold-progression.md](./plan/weapon-enhancement-gold-progression.md) | **implemented gold-primary loot with survival potions, one signature weapon, and two enhancement tracks** |

## Agent working rules (summary)

1. **For data, look at `js/data/content.js` and `js/config.js` first.** Skill balance lives in `SKILLS.combat` (+ `skillCombat.js` / `fxThemes.js`).
2. **Separate combat numbers from presentation**: numbers in content; hits in `CombatSystem`; spectacle via **Effects recipes** + themes — not palette-only twins.
3. **Camera shake / hit-stop are disabled.** Do not re-enable `Game.shake` / `Game.hitStop` (stable screen kept at user request).
4. **No external CDN.** Three.js uses `vendor/` local only.
5. After content/skill/path edits, run `node tests/integrity.mjs` (includes `tests/skill-combat.mjs`).
6. No unnecessary refactor or full reformat. Edit only the requested scope.

## Core file map (ultra-compact)

```
js/main.js                 entry
js/core/Game.js            loop, camera, state machine
js/config.js               world/player tuning constants
js/data/content.js         zone·enemy·equipment·skill tables (combat/theme/sfx)
js/data/skillCombat.js     pure skill damage + status helpers
js/data/fxThemes.js        skill color themes + particle quality mul
js/systems/CombatSystem.js attack/skill/hit detection + skillHandlers
js/graphics/Effects.js     primitives + skill recipes + quality LOD
js/characters/*            hero/monster visuals
js/world/*                 terrain·zone·environment
assets/manifests/assets.json  asset key → path
```
