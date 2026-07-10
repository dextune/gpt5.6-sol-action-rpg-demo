# AGENTS.md — GPT-5.6: Sol / Action RPG DEMO

Three.js browser action RPG (hunting · farming · skills · world tiers). **No CDN** — Three uses `vendor/` local only.

Detailed guides are in **`docs/`** — hub: [docs/README.md](./docs/README.md). Short edits: [docs/quick-edit-recipes.md](./docs/quick-edit-recipes.md). Large features: [docs/extension-playbooks.md](./docs/extension-playbooks.md).

## Essentials

1. **Data location** — balance/catalog `js/data/content.js` · tuning `js/config.js` · hit detection `js/systems/CombatSystem.js` · VFX `js/graphics/Effects.js`
2. **Camera** — `Game.shake` / `Game.hitStop` are no-ops. Do not re-enable without request.
3. **Scope** — only what was requested. No unrelated refactor, full reformat, or `vendor/` edits.
4. **Validation** — if you touch content/paths, run `node tests/integrity.mjs`.
5. **Run** — `file://` forbidden. `node server.mjs` → `http://127.0.0.1:8080`.

## Common basics (save tokens)

- **Read docs first, full-tree search later** — from the table below, read only 1–2 `docs/*.md`, then edit.
- **Layers** — if data suffices, only content/config. Hit detection is systems/entities. Presentation is Effects. HUD is UI + `index.html` id sync.
- **Hit ≠ mesh** — blade length (`WEAPON_*`) and hit `range` are separate. Often both must be aligned.
- **Frozen objects** — edit `Object.freeze` tables by changing fields / adding entries (keep structure).
- **Save** — do not change `saveKey`/`saveVersion` casually. On schema add, merge load defaults.
- **Git finalization** — never automatically commit or push after completing work. Commit or push only when the user explicitly asks.
- **Documentation language** — every file under `docs/` must be written in English. Keep player-facing UI strings in Korean.
- **UI language** — keep player-facing strings in a Korean tone.
- **Debug** — `window.__SOL_ARPG_DEMO__`, F3 HUD. Cheats should be guarded by `?debug=1`.

## Task → doc

| Request | Read |
|---------|------|
| Numbers only | quick-edit-recipes, config-and-tuning |
| Add monster/zone/skill | content-data, extension-playbooks |
| Hit / effects | combat, graphics-vfx |
| Sound / audio | audio, combat, assets |
| Character / blade visuals | characters-visual |
| Performance | config-and-tuning, graphics-vfx, world |
| Run / save | save-and-run |
| Full list | [docs/README.md](./docs/README.md) |

## Core paths

`js/core/Game.js` · `js/config.js` · `js/data/content.js` · `js/systems/*` · `js/entities/*` · `js/characters/CharacterFactory.js` · `js/graphics/Effects.js` · `js/world/TerrainSystem.js` · `assets/manifests/assets.json` · `tests/integrity.mjs` · `server.mjs`
