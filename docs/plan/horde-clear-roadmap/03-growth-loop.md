# 03 — Growth loop: kill CDR, level-up draft, in-run growth, skill evolution (P1)

## Current state (evidence)

- XP curve: `xpNeeded = 92 + level^1.52 × 58 + level × 22` (`js/entities/Player.js`). Curve itself is fine.
- **Weak level-up beat**: `Game.onEnemyKilled` levelUps path — pillar + ring FX, toast, full heal only. Not a combat-changing moment.
- **Skill points only in K menu** — growth completes only after pausing into a panel.
- **Fixed skill uptime**: cooldowns 4.2–15.5s + MP cost (`js/data/content.js` SKILLS). Kill count does not feed skill frequency → horde and power do not amplify each other.
- **No Hunt in-run growth**: only Defense has `runMods` (per-wave attack/defense/skillPower/haste compounding) and power shards (every 5 waves). Hunt is level + gear only.
- **No qualitative growth**: skill ranks 1–5 are pure numbers. No evolution/synergy that changes the build.

## Design proposal

### A. Kill → skill uptime feedback (P1, highest effect per effort)

Minimal loop for "more kills → skills fire more often":

- **Kill CDR**: per kill, reduce all active skill cooldowns by `-0.12s` (fodder) / `-0.35s` (elite) / `-2s` (boss). Multikills stack. One-line subtract on the combat kill hook.
- **Kill MP regain**: +1.5 MP per fodder kill so MP does not hard-gate skills in dense packs.
- Balance guard: per-skill internal min recast 1.2s (no infinite machine-gun).
- Expected feel with P0 density: 40–80 kills/min → effective cooldowns roughly half — the game becomes about cycling skills.

### B. Level-up as an in-combat event (P1)

- **Level-up nova**: on level-up, 4.5m knockback + fodder execute (elites take large damage) + 1.2s invuln + gold edge vignette pulse. Level-up in a pack becomes a rescue.
- **Instant draft (optional)**: three cards at screen bottom (keys 1/2/3, movement stays free) — auto skill-point spend *or* small run buff. Keep K menu, but growth completes without opening it.
  - Example pool: `Q skill +1 rank`, `Attack +6%`, `Pickup radius +25%`, `Move +5%`, `Kill CDR +0.04s`.
- Minimum viable: nova + "auto recommend skill-point spend (toggle)" without full draft UI.

### C. Hunt in-run growth — Relic drops (P1–P2)

Give Hunt a layer analogous to Defense `runMods`:

- Elites/bosses/contract rewards drop **relics** (run-only, not saved): instant passives on pickup. Examples: "+8% attack while kill chain ≥10", "5% chance small nova on gem pickup", "flame trail along dash path".
- 3 slots; on overflow, float UI to swap.
- Reuse `player.runMods` already used by Defense — fill it in Hunt too.

### D. Skill evolution / synergy (P2)

- At **rank 5**, each skill offers **two evolutions** that change *shape*, not only numbers.
  - e.g. Whirlwind → `storm sustained (cast while moving)` or `pull vortex (group fodder — horde synergy)`.
  - e.g. Fireball → `triple shot` or `impact fire zone`.
- Data: `SKILLS[id].evolutions = [{id, name, desc, apply}]`, `player.skills[id] = {rank, evolution}` — save format v5 migration (`saveVersion` 4 → 5; old saves `evolution: null`).
- Each skill must include at least one evolution aimed at clearing packs (pull, pierce, chain, zone).

### E. Pacing targets

- Levels 1→10: 8–10 minutes (current estimate 12–15; remeasure with density + XP gems).
- First skill (level 3): within 90 seconds.
- Gear swaps: ~0.5–1 per minute in Hunt (existing `gearChance` 10.5–34% rises naturally with more kills — lower fodder drop rate separately, e.g. fodder 0.02; elite/normal unchanged).

## Acceptance criteria

1. In dense combat at ~50 kills/min, skills feel "almost always ready".
2. Level-up turns the fight in your favor without opening a menu to finish growth.
3. A 15–20 minute Hunt run ends with a clearly different build/power than start.
4. Save/load restores evolutions correctly; relics are run-only and not persisted.
