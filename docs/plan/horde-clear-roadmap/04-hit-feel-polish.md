# 04 — Hit-feel polish: swing trail, stagger, multihit coalesce, audio (P2)

## Current state (evidence)

2026-07 pass established the basics:
- `Effects.impact()` — starburst sprite + fake light (additive glow) + ring/slash/particle stack, stronger on crit/finisher (`js/graphics/Effects.js`).
- Enemy squash-and-stretch stun (`Enemy.#animate`), hit pulse (StylizedMaterial), knockback.

Remaining gaps:
- **No weight during the swing**: no motion trail along the weapon path — only hit-point slash sprites.
- **No hit directionality**: single `hit` clip + uniform squash; left and right hits look identical.
- **Multihit noise**: one swing hitting 6 enemies fires `impact()` six times — visual clutter and particle budget waste.
- **Flat audio**: `audio.hit(critical, finisher)` two tiers only. No variation by combo step, simultaneous hit count, or material (slime vs golem).

## Design proposal

### A. Weapon swing trail (P2)

- Sample `blade_base`→`blade_tip` on the `weapon_socket` bone each frame; build a ribbon mesh (last 8–10 samples, triangle strip, additive blend, weapon rarity color).
- Active only while attack animation plays (`CharacterAnimationController` state); 0.15s fade-out.
- One pool (player only) is enough — magic/bow classes use fingertip glow particles instead of a blade ribbon.
- Read bone world matrices **after** skin update (avoid one-frame lag).

### B. Directional stagger (P2)

- In `Enemy.takeDamage`, classify 4 directions from hit direction · enemy facing; tilt squash axis toward the hit (uniform y-squash → asymmetric squash along the hit vector).
- Fully procedural — no new animation clips / generator work.
- Cap stacked stun duration (0.4s) to prevent infinite lock.

### C. Multihit coalesced FX (P2, also performance)

- Batch hits from one swing/skill tick: if ≥3 hits, replace per-target `impact()` with
  - **one large impact** at the hit centroid (starburst scale = 1.6 + 0.25×hit count, cap 4),
  - small sparks only on each enemy (~4 particles).
- `CombatSystem.#hitEnemiesInCone` already has the hit list — clear insertion point.
- Share window logic with multikill coalesce in [02-kill-reward-loop.md](02-kill-reward-loop.md).

### D. Sound layering (P2)

Add generation in `tools/audio/generate-combat-sfx.mjs`:
- 4-tier combo hit sounds (combo 0→3, heavier and brighter) — extend current 2-tier.
- On simultaneous hits ≥3: "multihit smash" variant (low-end emphasis + debris).
- Two material variants: gel (slime — wet punch), stone (colossus — rock crack). Map archetype→variant via extended `AudioManager.hit()` args.
- Pickup/chain audio per doc 02 (solfege ramp, chain stings).

### E. Explicit non-goals (settled)

- Camera shake, hit-stop — intentionally disabled in `Game.js`. Do not re-enable.
- Real PointLight for VFX — shader recompile freeze (fixed in `841a698`). Additive sprites only.
- Full-screen post hit flash — dozens of hits/sec in hordes become seizure-prone. Full-screen effects only for level-up / boss kill class events.

## Acceptance criteria

1. A sword swing leaves a weapon-colored trail; trails are invisible while idle.
2. Hitting the same enemy from left vs right tilts it differently.
3. A 6-hit swing reads as one large impact; total particles drop vs per-hit impacts.
4. Hitting a slime sounds different from hitting a colossus.
