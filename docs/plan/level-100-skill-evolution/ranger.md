# Wildshot Ranger — Level 100 Combat Plan

## Identity

The Ranger controls trajectories, terrain, distance, and prey state. The class should not feel like a Wizard with arrow-shaped projectiles. Signature attacks use ballistic lines, ricochets, planted arrows, moving formations, and convergence on marked prey.

## Basic attack and Focus (post-release milestone proposal)

The active-skill release preserves the existing basic/Focus behavior. The Level 20/60/100 basic and Arrow Storm transformations below remain post-release work outside the shipped Q/E/R/C scope.

- Four-shot basic rhythm: quick shot, sidestep shot, heavy draw, split-arrow finisher.
- Level 20 adds a narrow wind wake to the heavy draw.
- Level 60 lets the split finisher ricochet once when it strikes marked prey.
- Level 100 plants a spectral arrow behind the target area; the next basic finisher pulls it back through enemies.
- `Arrow Storm` evolves from a loose volley into a facing-aligned arrow corridor with a final convergence shot.

## Q — Piercing Shot / Horizon Breaker

| Gate | Evolution |
|---|---|
| Base | Heavy linear arrow that pierces enemies and applies bleed |
| Lv.20 | Each successful pierce releases two short side splinters, creating a fishbone hit pattern |
| Lv.40 | **Rail Arrow:** narrow, fast, concentrated line / **Split Arrow:** projectile divides into three paths after its first pierce |
| Lv.60 | At maximum pierce or life, the arrow anchors into the ground and fires its stored splinters backward |
| Lv.80 | **Crowd Skewer:** pierce chains through packs / **Dragon Piercer:** draw time and armor pierce convert into boss stagger damage |
| Lv.100 | **Horizon Breaker:** long full-body draw, giant pressure arrow, visible vacuum corridor, then delayed rupture impacts along every pierced point |

## E — Thornburst Field

This replaces the passive feel of a simple caltrop field with an attacking planted-arrow engine.

| Gate | Evolution |
|---|---|
| Base | Fire a seed arrow into the ground; impact damages and opens a slowing thorn field |
| Lv.20 | Field opens with an outward spike burst and closes with an inward spike burst |
| Lv.40 | **Briar Field:** broad repeated thorn lines / **Blast Seed:** small field with a violent immediate eruption |
| Lv.60 | Every third enemy contact causes a planted arrow to rise and shoot across the field |
| Lv.80 | **Snare Bloom:** spike lines guide normal enemies toward the center / **Mine Garden:** repeat detonations concentrate beneath elites and bosses |
| Lv.100 | **Thousand Thorn Garden:** seed arrow splits in the sky, rains planted arrows into a grid, then all arrows connect with crossing thorn lines and erupt |

The final grid uses facing-aligned rows instead of random circles, making placement learnable on keyboard controls.

## R — Vault Shot / Sky Hunter

| Gate | Evolution |
|---|---|
| Base | Backward vault with a forward fan of arrows |
| Lv.20 | Leave a delayed blast arrow at the launch point and fire a second shot on landing |
| Lv.40 | **Gale Vault:** more displacement and broader coverage / **Counter Volley:** shorter vault and denser retaliatory shots |
| Lv.60 | Mid-vault body rotation fires a curved side volley before the landing shot |
| Lv.80 | **Escape Artist:** arrows redirect toward separate nearby enemies / **Perfect Distance:** landing shot gains force at ideal range against durable targets |
| Lv.100 | **Sky Hunter:** launch-point blast, slow-motion-style airborne pose without actual time scaling, three-layer aerial volley, and synchronized landing detonation |

The apparent airborne pause must be animation staging only; global time and enemy updates continue normally.

## C — Predator's Verdict

This keeps Hunter Mark's prey identity but turns every use into a direct execution attack.

| Gate | Evolution |
|---|---|
| Base | Fire a high-damage sigil arrow that marks the first prey hit and amplifies follow-up damage |
| Lv.20 | Store a capped share of damage dealt to the marked target; mark expiry detonates it |
| Lv.40 | **Pack Hunt:** detonation jumps a weaker mark to nearby enemies / **Prime Target:** stronger single-target storage and expose |
| Lv.60 | Recasting fires a verdict arrow that detonates the current mark immediately and punches through it |
| Lv.80 | **Chain Verdict:** each detonation launches a reduced verdict arrow at another target / **Trophy Shot:** higher storage cap and boss stagger on detonation |
| Lv.100 | **Apex Predator:** sigil arrow impact summons a spectral hawk path, light arrows appear around the prey, then every arrow converges from a different angle before the verdict shot pierces forward |

## Hunt combinations

| Setup | Payoff |
|---|---|
| Thorn field + Piercing Shot | Planted arrows copy reduced side splinters |
| Mark + Vault Shot | Landing shot bends toward marked prey within a limited angle |
| Mark + Thorn field | Final inward burst converges on the marked target's last valid field position |
| Piercing Shot + mark detonation | Verdict inherits one capped pierce rupture event |

These combinations should add one clear event, not multiply every projectile recursively.

## Offensive keystones

Only the Level 100 marked-convergence Apex keystone is shipped. Levels 25, 50, and 75 remain post-release proposals.

| Level | Keystone |
|---|---|
| 25 | Fourth basic shot plants one short-lived spectral arrow |
| 50 | Hitting from ideal range grants capped Focus |
| 75 | Detonating a mark commands all nearby planted arrows to fire once |
| 100 | Apex finishers gain one convergence event when a valid mark is present |
