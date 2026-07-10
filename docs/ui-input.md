# UI · Input · Camera controls

## Input `js/core/Input.js`

| Input | Action (Game) |
|-------|---------------|
| WASD / arrows | move (camera-relative) |
| **J** | basic attack (**keyboard only**) |
| **Space** | dash (**keyboard only**) |
| Q E R C | skills (class actives) |
| 1 | potion |
| I K Tab Esc | panels |
| Z X | camera yaw |
| Middle-button drag | camera yaw (optional) |
| Wheel | zoom (`cameraMin`–`cameraMax`) |
| **Mouse left** | **UI only** (menus, inventory, buttons) — not combat |
| F3 | debug HUD |

**Combat is keyboard-only.** Do not bind LMB/RMB to attack or dodge.

Attack direction: movement keys / body facing (`alignCombatFacing`).  
`aimPoint` may still track the cursor for legacy reticle code but **must not** drive player combat aim.

## UI `js/ui/UI.js` + `index.html` + `css/game.css`

Key element ids:

- Loading / title: `loading-screen`, `title-screen`, `new-game-btn`, `continue-btn`
- HUD: hp/mp/xp, zone, hunt stats, abilities, minimap, boss-hud
- Panels: `panel-layer`, `panel-content`
- Feedback: `notifications`, `float-layer`, `damage-flash`, `zone-toast`
- Debug: `debug-hud` (`setDebugVisible`, `updateDebug`)
- Fatal error: `fatal-error`

A new HUD field needs **3 places**: HTML id → UI.elements list → update binding.

## Floating damage

`UI.floatText(worldPos, text, type)`
type: `damage` | `critical` | `hurt` | `heal`
Style: `css/game.css` `.float-text*`

## Camera settings

`GAME_CONFIG` distance/height family + `Game.#updateCamera`.
**No shake** (shake is a no-op).

## Quality UI

System panel `data-action="quality"` → `Game.setQuality`.
