# Horde-Clear Roadmap — Overview

> Written: 2026-07-12. Analysis against the codebase after the graphics upgrade pass (commits `2e541a9`, `841a698`).  
> **V1 implementation status (2026-07-12, plan `61d603d3`):** Practical scope of docs 01–04 complete — fodder/pack spawn and density, XP gems/multikill/streak/overkill, kill CDR / level-up nova / auto skills, multihit coalesce / directional stagger / swing trail. LOD2/VAT/full draft UI/skill evolution remain follow-ups.

## Goal definition

**"Grow quickly while clearing dense packs of enemies with satisfying hit feedback."**

Broken into three axes:

1. **Horde density** — Many enemies on screen, approaching in packs.
2. **Hit feel** — Each strike feels strong visually, sonically, and physically.
3. **Fast growth** — Killing makes you stronger, and that strength is felt immediately. The three axes reinforce each other (more kills → faster growth → more kills, more satisfying clears).

## Current diagnosis (one-line)

The hit *moment* already has basics (starburst/glow/squash in `js/graphics/Effects.js`), but  
**(a) density is too low** (Hunt cap 42, Defense 5–36 per wave), and  
**(b) the kill → growth feedback loop is weak** (instant XP, fixed cooldowns, skill points only in the menu).

## Document map

| Doc | Category | Priority |
|---|---|---|
| [01-horde-density.md](01-horde-density.md) | Horde infrastructure — fodder tier, pack spawn, performance budget | **P0** |
| [02-kill-reward-loop.md](02-kill-reward-loop.md) | Kill reward loop — pickups, multikill/streak, death FX, overkill | **P0–P1** |
| [03-growth-loop.md](03-growth-loop.md) | Growth loop — kill CDR, level-up draft, in-run growth, skill evolution | **P1** |
| [04-hit-feel-polish.md](04-hit-feel-polish.md) | Hit-feel polish — swing trail, stagger, multihit coalesce, audio | **P2** |

## Priority roadmap

| Priority | Item | Rationale |
|---|---|---|
| P0 | Fodder tier (cheap rendering) + density up + pack spawn | Required for the "horde" fantasy; prerequisite for everything else |
| P0 | XP gem vacuum pickups + multikill/streak escalation | Kill → reward tactile loop; max synergy when shipped with density |
| P1 | Per-archetype death FX + overkill launch | "One big hit" satisfaction |
| P1 | On-kill cooldown refund / resource regain | Horde ↔ skill uptime amplification loop |
| P1 | Level-up nova + instant pick draft | Put growth moments inside combat |
| P2 | Weapon swing trail, multihit coalesced FX, skill evolution | Finish quality |

## Hard rules (settled for this codebase)

- **No camera shake / hit-stop** — intentionally no-ops in `js/core/Game.js` (around 186, 385). Hit feel must come from in-world presentation.
- **No dynamic scene lights for VFX** — changing light counts forces three.js to recompile all visible material shaders and freezes frames (fixed in commit `841a698`). Use fake lights (additive sprites) instead.
- **Do not edit GLBs by hand** — all baked by `tools/assets/generate_assets.mjs`. Geometry changes go through the generator, then regenerate.
