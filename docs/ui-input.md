# UI · Input · Camera controls

## Input `js/core/Input.js`

| Input | Action (Game) |
|-------|---------------|
| WASD / arrows | move (camera-relative) |
| **Virtual stick** (mobile) | move (camera-relative) |
| **J** / attack pad | basic attack (hold) |
| **Space** / dodge pad | dash |
| Q E R C / skill pads | skills (class actives) |
| 1 / potion pad | potion |
| I K Tab Esc / Menu btn | panels |
| Z X | camera yaw (desktop) |
| Middle-button drag | camera yaw (desktop) |
| One-finger drag on canvas | camera yaw (**mobile**) |
| Pinch on canvas | zoom (**mobile**) |
| Wheel | zoom (`cameraMin`–`cameraMax`) |
| **Mouse left** | **UI only** (menus, inventory, buttons) — not combat |
| F3 | debug HUD |

**Desktop combat is keyboard-only.** LMB/RMB are not attack/dodge.  
**Mobile** injects the same key codes via virtual buttons (`TouchControls` → `Input.setVirtualButton`).

Attack direction: movement / body facing (`alignCombatFacing`).  
`aimPoint` may still track the pointer for reticle code but **must not** drive player combat aim.

### Virtual API

```js
input.setVirtualAxes(x, y)      // -1..1, y = forward
input.setVirtualButton(code, down)
input.hasVirtualMove()
input.consumeLookDelta()        // touch orbit pixels
input.consumePinchZoom()
```

`isDown` / `consume` unify keyboard + virtual.

## Touch controls `js/ui/TouchControls.js`

Enabled when `body.touch-ui` is set (coarse pointer / touch + compact width).

| Region | Control |
|--------|---------|
| **Bottom-left** | `#touch-stick-zone` joystick |
| **Bottom-right** | `.ability-bar` repositioned as action pad (attack, dodge, Q/E/R/C, potion) |
| **Top-right** | `#touch-menu-btn` → pause / system panel |

Markup: `index.html` → `#touch-controls` + existing `.ability-bar` slots.  
CSS: `css/game.css` under `body.touch-ui` (safe-area, sizes, landscape).

## UI `js/ui/UI.js` + `index.html` + `css/game.css`

Key element ids:

- Loading / title: `loading-screen`, `title-screen`, `new-game-btn`, `continue-btn`
- HUD: hp/mp/xp, zone, hunt stats, abilities, minimap, boss-hud
- Touch: `touch-controls`, `touch-stick-zone`, `touch-menu-btn`
- Panels: `panel-layer`, `panel-content`
- Feedback: `notifications`, `float-layer`, `damage-flash`, `zone-toast`
- Debug: `debug-hud` (`setDebugVisible`, `updateDebug`)
- Fatal error: `fatal-error`

A new HUD field needs **3 places**: HTML id → UI.elements list → update binding.  
New combat pad slot: HTML `data-slot` + `TouchControls.#slotToCode` + Game input code.

## Floating damage

`UI.floatText(worldPos, text, type)`  
type: `damage` | `critical` | `hurt` | `heal`  
Style: `css/game.css` `.float-text*`

## Camera settings

`GAME_CONFIG` distance/height family + `Game.#updateCamera`.  
**No shake** (shake is a no-op).  
Mobile orbit sensitivity: `lookDx * 0.0048` in `Game.#handleInput`.

## Quality UI

System panel `data-action="quality"` → `Game.setQuality`.

## Mobile checklist (when editing HUD)

1. Keep `#hud { pointer-events: none }` — set `pointer-events: auto` only on interactive pads.  
2. Preserve safe-area insets (`env(safe-area-inset-*)`).  
3. Do not rely on `kbd` hints alone — touch-ui hides them.  
4. Test portrait + landscape (landscape hides minimap/hunt card density).  
5. `touch-action: none` on stick/slots/canvas to avoid browser scroll/zoom.  
6. Desktop keyboard path must remain unchanged when `body.touch-ui` is off.  
7. **iPhone mini (≤390px):** hunt card hidden; minimap top-right clear of menu; icon-only ability pad; compact HP strip.

### Layout QA (Playwright)

```bash
# server already on 8777, or BASE_URL=http://127.0.0.1:8080
node tests/mobile-iphone-layout.mjs
```

Checks: stick left, abilities right, no menu/minimap/stick overlaps, menu opens panel. Screenshots under `OUT_DIR` (default implementer scratch).
