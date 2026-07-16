# AGENTS.md — GPT-5.6: Sol / Action RPG DEMO

Three.js browser action RPG (hunting · farming · skills · world tiers). **No CDN** — Three uses `vendor/` local only.

Detailed guides are in **`docs/`** — hub: [docs/README.md](./docs/README.md). Short edits: [docs/quick-edit-recipes.md](./docs/quick-edit-recipes.md). Large features: [docs/extension-playbooks.md](./docs/extension-playbooks.md).  
**Hero classes / multi-class:** [docs/agent/README.md](./docs/agent/README.md) (add class playbook, wizard reference, facing, validation).

## Essentials

1. **Data location** — balance/catalog `js/data/content.js` · skill math `js/data/skillCombat.js` · FX themes `js/data/fxThemes.js` · tuning `js/config.js` · hit detection `js/systems/CombatSystem.js` · VFX recipes `js/graphics/Effects.js`
2. **Camera** — `Game.shake` / `Game.hitStop` are no-ops. Do not re-enable without request.
3. **Scope** — only what was requested. No unrelated refactor, full reformat, or `vendor/` edits.
4. **Validation** — if you touch content/paths, run `node tests/integrity.mjs`.
5. **Run** — `file://` forbidden. `node server.mjs` → `http://127.0.0.1:8777`.
6. **Template boundary (LOCKED)** — [docs/architecture-template-boundary.md](./docs/architecture-template-boundary.md). Template-candidate modules must not import `content`/`skillCombat`/modes. Systems use `game.ctx`. New skill `effect` ids go through `js/systems/combat/skillEffectRegistry.js`. Do not reintroduce AssetManager `refs` floor-1.

## Common basics (save tokens)

- **Read docs first, full-tree search later** — from the table below, read only 1–2 `docs/*.md`, then edit.
- **Layers** — if data suffices, only content/config. Hit detection is systems/entities. Presentation is Effects. HUD is UI + `index.html` id sync.
- **Hit ≠ mesh** — blade length (`WEAPON_*`) and hit `range` are separate. Often both must be aligned.
- **Frozen objects** — edit `Object.freeze` tables by changing fields / adding entries (keep structure).
- **Save** — do not change `saveKey`/`saveVersion` casually. On schema add, merge load defaults.
- **Git finalization** — never automatically commit or push after completing work. Commit or push only when the user explicitly asks. When committing for deploy, include **all** game assets (hero/monster/prop GLBs, etc.); this project ships to a personal server and does not exclude large models from git or deploy.
- **Deploy** — do not re-add Cloudflare-style asset size exclusions for `assets/models/hero/*.glb` (see `.assetsignore`).
- **Documentation language** — every file under `docs/` must be written in English.
- **UI language** — keep all player-facing UI strings, notifications, and HUD copy in **English**. Do not add Korean (or other non-English) player-facing text.
- **Debug** — `window.__SOL_ARPG_DEMO__`, F3 HUD. Cheats should be guarded by `?debug=1`.

## Task → doc

| Request | Read |
|---------|------|
| Numbers only | quick-edit-recipes, config-and-tuning |
| Add monster/zone/skill | content-data, extension-playbooks (§3 spectacle skill), combat |
| Skill spectacle / polish | plan/skill-motion-spectacle, combat, graphics-vfx, audio |
| Hero locomotion / pose bake only | plan/static-resource-character-motion, characters-visual |
| Hit / effects | combat, graphics-vfx |
| Sound / audio | audio, combat, assets |
| Character / blade visuals | characters-visual |
| **Add hero class / job** | **[agent/README.md](./docs/agent/README.md)**, agent/add-hero-class |
| Multi-class architecture | agent/multi-class-architecture |
| Combat facing (move aim) | agent/combat-facing |
| Performance | config-and-tuning, graphics-vfx, world |
| Run / save | save-and-run |
| Template vs game split / GameContext | architecture-template-boundary (**LOCKED**) |
| Full list | [docs/README.md](./docs/README.md) |

## Core paths

`js/core/Game.js` · `js/core/Input.js` · `js/ui/TouchControls.js` · `js/config.js` · `js/data/content.js` · `js/systems/*` · `js/entities/*` · `js/characters/CharacterFactory.js` · `js/graphics/Effects.js` · `js/world/TerrainSystem.js` · `assets/manifests/assets.json` · `tests/integrity.mjs` · `server.mjs`
