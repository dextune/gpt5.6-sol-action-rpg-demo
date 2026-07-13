# 02 — Kill reward loop: pickups, multikill/streak, death FX, overkill (P0–P1)

## Current state (evidence)

- **Instant rewards**: `Game.onEnemyKilled()` (`js/core/Game.js`) immediately `addXp`/`addGold` with only `+N EXP · +NG` float text. No ground pickups.
- **Same death for all monsters**: `Enemy.#updateDeath` — shrink/sink 0.78s (boss 1.45s) + particle burst from `onEnemyKilled`. No archetype variance.
- **No overkill**: death knockback in `Enemy.#die` is fixed `direction × 4.8` (boss 2.2). Crit finishers look like normal kills.
- **Streak not presented**: `HuntSystem.streak` only feeds contracts. Multikill (many kills in one window) has no feedback.
- Audio: `audio.hit(critical, finisher)` two tiers + `audio.hurt/levelUp` only. No kill-sound escalation chain.

## Design proposal

### A. XP gem vacuum pickups (P0)

Core tactile reward of the horde genre: "kill → spill → walk near → vacuum in."

- On kill, do not grant XP immediately; drop **XP gem** entities. Keep gold instant (gems = XP only — keep the loop simple).
- Gem tiers: small (1 gem), medium (~5 fodder, blue), large (elite, yellow). Auto-merge gems within 1.2m to cap entity count.
- **Magnet radius** `player.pickupRadius` default 2.2m — grow via stats/gear ([03](03-growth-loop.md)).
- Rendering: one InstancedMesh for all gems (octahedron + additive glow). Cap 200; overflow merges oldest into nearest.
- On absorb: curved acceleration into the player, micro `+XP` float + pickup SFX (rising pitch on rapid pickups — solfege ramp, +semitone per pickup within 0.8s, max 12 steps).
- Boss/wave clear: gem fountain (dozens on arcs) then bulk vacuum.

### B. Multikill / kill-streak escalation (P0)

- **Multikill**: ≥3 kills within 0.35s suppress individual kill bursts and play **one coalesced FX** at the kill centroid — large starburst + shock ring + `TRIPLE!`/`QUAD!`/`MASSACRE!` float (3/4/6+). Saves performance and reads stronger.
- **Kill streak (chain)**: chain stays alive if kills are ≤2.5s apart. HUD right: chain counter (x12…) + gauge. Breaks at 25/50/100 show bottom banner + dedicated sting SFX.
- Light in-game chain rewards: chain 10+ grants +6% move speed, +10% XP — motivation to keep clearing.
- Audio escalation: layer kill SFX by chain step (base → metal ring → choir pad). Add 3-tier kill stings in `tools/audio/generate-combat-sfx.mjs`.

### C. Per-archetype death FX (P1)

Branch in `Enemy.#die` / `#updateDeath` by archetype. One signature motion each is enough:

| Archetype | Death presentation |
|---|---|
| slime | Flatten then **pop** into 4–6 gel shards (particles, no physics) + floor gel decal 1.5s |
| hare/boar | Overkill → launch (D below); normal kill → side flop + slide |
| wisp | Core contracts → flash pop + rising embers (reuse existing ember) |
| humanoid | Kneel and fall forward (keep death clip) + prop drop (weapon/horn) |
| colossus | Slow collapse: rune light dies → sequential part scale-down + rock debris + dust pillar |

- Implementation: `Effects.debris()` pool (6 small shared meshes, arc + one bounce, 0.9s fade). Honor no dynamic light / no shader thrash rules.

### D. Overkill launch (P1)

- Trigger: finishing hit `damage ≥ maxHp × 0.5` or critical finisher.
- Presentation: death knockback 4.8 → **9–12 + up vector (y 4–6)**; body arcs, lands with dust + bounce. Add vertical velocity/gravity in `#updateDeath` (today y only sinks).
- Fodder overkills often — wide random angle/distance for a "swept away" look.
- Float text `OVERKILL` style (large, orange).

## Acceptance criteria

1. Clearing a fodder pack with a skill: one coalesced explosion + gems spill + walking in vacuum-sucks them with rising pickup tones.
2. Chain counter is live on HUD; breaking 25 chain is distinct via banner + audio.
3. Slime death and colossus death read differently at a glance.
4. Strong finishing hits launch enemies.
5. 10 simultaneous kills in one frame do not tank FPS (coalesced FX + particle caps).
