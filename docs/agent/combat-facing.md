# Combat facing (movement-aligned attacks)

## Rule

**Combat input is keyboard-only** (`J` attack, `Space` dodge, `Q E R C` skills).  
Mouse is for **UI only** (menus, inventory, title buttons) — never for attack/dodge.

Player **basic attacks** and **skills** fire along:

1. **Current movement input** if WASD/arrows are held, else  
2. **Current body facing** if standing still.

They must **not** re-aim to the mouse ground ray (`game.aimPoint`) for combat orientation.

This applies to **all classes** (melee knight and magic wizard).

## Why

Mouse aim mixed poorly with keyboard movement (bolts/swings firing the wrong way). Combat is fully keyboard-driven.

## Implementation map

| Piece | Location | Behavior |
|-------|----------|----------|
| `Player.alignCombatFacing()` | `js/entities/Player.js` | Sets `facing` from `moveDirection` or keeps facing; snaps mesh yaw |
| `tryAttack` / `trySkill` | same | Call `alignCombatFacing()` instead of `faceToward(aimPoint)` |
| `#facingDir` | `CombatSystem.js` | Normalized planar facing |
| `#aimAlongFacing` | `CombatSystem.js` | Ground point at distance along facing (blink, meteor, skyfall, …) |
| Melee / magic basics | `CombatSystem.js` | Capture direction at cast time for delayed hits/orbs |

## Input order (same frame)

```
Game.#handleInput
  setMoveDirection(from keys + camera)
  tryAttack / trySkill  → alignCombatFacing uses that moveDirection
Player.update → locomotion may also lerp facing while moving
```

## Agent rules when editing combat

1. Never bind LMB/RMB to `tryAttack` / `tryDash`.  
2. New player projectiles/cones: start from `#facingDir(player)` or a direction captured at skill start.  
3. Ground AoE for the player: `#aimAlongFacing(player, distance)`, not `this.game.aimPoint`.  
4. Enemy AI may still target the player position freely.  
5. `aimPoint` may remain for reticle / debug, but **player combat must not depend on it** for direction.  
6. Dash already prefers `moveDirection` when present — keep that.  

## Manual test

1. **LMB does not attack**; inventory/title buttons still click with mouse.  
2. Hold **D** and press **J** — projectiles/swings go right.  
3. Face left, stand still, **J** — goes left.  
4. **Space** dodges; RMB does not.  
5. Wizard Fireball + Meteor while moving — travel/placement match movement.  
6. Knight combos while moving — same.  
