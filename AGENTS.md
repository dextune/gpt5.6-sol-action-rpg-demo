# AGENTS.md — GPT-5.6: Sol / Action RPG DEMO

Three.js browser action RPG (hunting · farming · skills · world tiers). **No CDN** — Three uses `vendor/` local only.

Detailed guides: **`docs/`** hub [docs/README.md](./docs/README.md). Short edits: [docs/quick-edit-recipes.md](./docs/quick-edit-recipes.md). Multi-file features: [docs/extension-playbooks.md](./docs/extension-playbooks.md).  
**Hero classes:** [docs/agent/README.md](./docs/agent/README.md).  
**Shipped plans (history only):** [docs/history/README.md](./docs/history/README.md). **Active plans:** [docs/plan/README.md](./docs/plan/README.md) (empty unless in-flight work).

## Essentials

1. **Data location** — balance/catalog `js/data/content.js` · skill math `js/data/skillCombat.js` · FX themes `js/data/fxThemes.js` · Sol tuning `js/config.js` (`PLAYER_CONFIG`, `PLAYER_GROWTH_CONFIG`, `HIT_REACTION_CONFIG`, `BASIC_ATTACK_FEEL`, …) · template-safe scales `js/core/runtimeConstants.js` (`LOCOMOTION_CONFIG`, …) · hit hub `js/systems/CombatSystem.js` + `js/systems/combat/*` · VFX `js/graphics/Effects.js`. Prefer frozen tables over magic numbers.
2. **Camera** — `Game.shake` / `Game.hitStop` are no-ops. Do not re-enable without request.
3. **Scope** — only what was requested. No unrelated refactor, full reformat, or `vendor/` edits.
4. **Validation** — if you touch content/paths/skills/UI modules, run `node tests/integrity.mjs`.
5. **Run** — `file://` forbidden. `node server.mjs` → `http://127.0.0.1:8777`.
6. **Template boundary (LOCKED)** — [docs/architecture-template-boundary.md](./docs/architecture-template-boundary.md). Template-candidate modules must not import `content`/`skillCombat`/modes. Systems use `game.ctx`. New skill `effect` ids go through `js/systems/combat/skillEffectRegistry.js`. Do not reintroduce AssetManager `refs` floor-1.
7. **Systems `ctx` preference** — On **touched** lines prefer `(this.ctx ?? this.game).player` / `.effects` / … when the key is in `GAME_CONTEXT_KEYS` (`js/core/GameContext.js`). No repo-wide `this.game` codemod. Do not widen context keys without boundary doc + tests.
8. **UI / Game structure** — UI panels are plain functions under `js/ui/panels/` with thin facades on `UI.js`. Mode lifecycle is `js/core/gameModes.js`; kill feedback is `js/core/killFeedback.js`. Combat basic attacks / projectiles attach via `js/systems/combat/basicAttacks.js` and `projectiles.js`. Keep public method names stable.
9. **Git branch policy** — **Do not create new git branches** (no `git checkout -b`, `git switch -c`, stacked PR branches, or worktree branches) unless the user **explicitly** asks for a named branch. Work on the current branch (normally `master`). Do not leave agent-created throwaway branches behind.

## Common basics (save tokens)

- **Read docs first** — from the table below, open 1–2 living guides, then edit. Prefer `docs/history/` only for archaeology of shipped work.
- **Layers** — data → hit systems → presentation (Effects) → HUD (`js/ui/panels/*` + `index.html` ids).
- **Hit ≠ mesh** — blade length (`WEAPON_*`) and hit `range` are separate.
- **Frozen objects** — change fields / add entries; keep structure.
- **Save** — do not change `saveKey`/`saveVersion` casually. On schema add, merge load defaults.
- **Git** — never auto-commit or push. Commit/push only when the user asks. **Never create extra branches** without an explicit user request (see Essentials §9). Deploy includes all game assets (hero/monster/prop GLBs); do not re-add Cloudflare-style size exclusions for `assets/models/hero/*.glb`.
- **Docs language** — every file under `docs/` in **English**.
- **UI language** — player-facing strings/notifications/HUD in **English** only.
- **Debug** — `window.__SOL_ARPG_DEMO__`, F3 HUD. Cheats behind `?debug=1`.

## Task → doc

| Request | Read |
|---------|------|
| Numbers only | quick-edit-recipes, config-and-tuning |
| Add monster/zone/skill | content-data, extension-playbooks (§3 spectacle skill), combat |
| Skill spectacle / polish | combat, graphics-vfx, audio · history/skill-motion-spectacle (standard) |
| Hero locomotion / pose bake | characters-visual · history/static-resource-character-motion |
| Hero graphics / combat motion upgrade | history/character-graphics-animation-overhaul · characters-visual · combat · graphics-vfx |
| Hit / effects | combat, graphics-vfx · systems/combat/* |
| Sound / audio | audio, combat, assets |
| Character / blade visuals | characters-visual |
| **Add hero class / job** | **[agent/README.md](./docs/agent/README.md)**, agent/add-hero-class |
| Multi-class architecture | agent/multi-class-architecture |
| Combat facing (move aim) | agent/combat-facing |
| UI panel / HUD edit | ui-input · `js/ui/panels/*` (not whole HUD unless needed) |
| Mode start / continue / title | `js/core/gameModes.js` · save-and-run |
| Kill chain / multikill / level-up nova | `js/core/killFeedback.js` · combat |
| Performance | config-and-tuning, graphics-vfx, world |
| Run / save | save-and-run |
| Template vs game / GameContext | architecture-template-boundary (**LOCKED**) |
| Past ROI / shipped roadmaps | [history/README.md](./docs/history/README.md) |
| Full list | [docs/README.md](./docs/README.md) |

## Core paths

`js/core/Game.js` · `js/core/gameModes.js` · `js/core/killFeedback.js` · `js/core/GameContext.js` · `js/core/Input.js` · `js/ui/UI.js` · `js/ui/panels/*` · `js/ui/TouchControls.js` · `js/config.js` · `js/data/content.js` · `js/systems/CombatSystem.js` · `js/systems/combat/*` · `js/systems/*` · `js/entities/*` · `js/characters/CharacterFactory.js` · `js/graphics/Effects.js` · `js/world/TerrainSystem.js` · `assets/manifests/assets.json` · `tests/integrity.mjs` · `server.mjs`
