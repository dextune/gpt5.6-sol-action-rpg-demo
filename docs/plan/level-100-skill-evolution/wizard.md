# Arcane Adept Wizard — Level 100 Combat Plan

## Identity

The Wizard is not four differently colored projectiles. The class combines elemental reactions, delayed spatial geometry, and attacks that change the battlefield. Every spell has a distinct silhouette and a secondary rule that can interact with another spell.

## Arcane Overflow resource

The shipped release includes the transient reaction-charged Overflow meter used by the Level 100 Overcast keystone. Any broader resource-loop behavior described below remains a post-release proposal.

- Damaging enemies with different spell themes builds Overflow faster than repeating one theme.
- At full Overflow, the next spell gains an `overcast` attack phase without changing its key.
- Fire overcast adds ignition; frost adds shatter; arcane adds echo; meteor adds gravity compression.
- Overflow is a later phase and should not block the level-100 skill system.

## Q — Fireball / Living Star

| Gate | Evolution |
|---|---|
| Base | Fast fire orb with impact blast and burn |
| Lv.20 | Impact releases three cinder satellites that curve toward nearby enemies |
| Lv.40 | **Wildfire:** wider blast and spreading burn / **Comet Core:** narrow, fast, piercing orb with a dense final impact |
| Lv.60 | Orb becomes a miniature living star: it compresses on contact, then expands into a short fire vortex |
| Lv.80 | **Chain Ignition:** burning targets relay explosions / **Solar Brand:** repeated hits build a boss-only thermal detonation |
| Lv.100 | **Prominence:** orbiting cast sparks collapse into a sun orb, the orb tunnels forward, then produces a vertical flare and expanding fire ring |

Distinct motion: one-hand orbit draw → two-hand compression → forward staff thrust. The projectile should visibly pulse rather than remain a constant sphere.

## E — Frost Nova / Crystal Dominion

| Gate | Evolution |
|---|---|
| Base | Radial ice damage, slow, and rank-gated deep chill |
| Lv.20 | Six directional ice lances erupt after the ring reaches maximum size |
| Lv.40 | **Glacier Ring:** wide control field / **Shatter Crown:** tighter ring with strong shard damage |
| Lv.60 | Frozen or deeply chilled enemies grow a crystal proxy that shatters on the next heavy spell |
| Lv.80 | **Absolute Zero:** chained freeze logic for normal enemies / **Crystal Execution:** crystal proxies focus shard damage into durable targets |
| Lv.100 | **Frozen Dominion:** expanding lattice, rising crystal forest, and a delayed inward shatter wave that converges on the caster's facing line |

This spell attacks outward first and inward last, giving it a silhouette no other radial skill uses.

## R — Arcane Blink / Space Rend

| Gate | Evolution |
|---|---|
| Base | Damage at departure and arrival while teleporting along facing |
| Lv.20 | The travel path becomes a delayed arcane cut that damages enemies after the blink |
| Lv.40 | **Echo Step:** an afterimage repeats the route attack / **Rift Lance:** arrival compresses damage into a forward lance |
| Lv.60 | Enemies crossed by the route receive rift anchors that explode in travel order |
| Lv.80 | **Twin Horizon:** departure and arrival waves collide midway / **Void Break:** route anchors concentrate armor-piercing damage on elites and bosses |
| Lv.100 | **Space Rend:** blink cuts a visible seam through space; anchors pull light into the seam before the entire route fractures at once |

The level-100 pull is visual or very light displacement. It must not duplicate the Knight's physical grouping role.

## C — Meteor Storm / Astral Cataclysm

| Gate | Evolution |
|---|---|
| Base | Staggered falling meteors and a final area impact |
| Lv.20 | Impacts leave brief molten fractures; a larger final meteor targets the pattern center |
| Lv.40 | **Meteor Rain:** broad moving barrage / **Extinction:** fewer impacts feeding one enormous meteor |
| Lv.60 | The cast creates a visible gravity lens that bends meteor paths toward the aim area |
| Lv.80 | **Orbit Fall:** small meteors orbit once and hunt different enemies / **World Ender:** all trajectories compress onto an elite or boss zone |
| Lv.100 | **Astral Cataclysm:** gravity lens darkens, orbiting stones descend in spirals, the lens collapses into a massive meteor, and molten fault lines erupt outward |

The `Meteor Rain` branch should advance slowly along facing rather than scatter randomly, allowing skilled placement without mouse aim.

## Spell reactions

Keep reactions sparse and readable. A target can hold only one primed reaction from this table at a time.

| Primer | Detonator | Attack result |
|---|---|---|
| Burn | Frost Nova | Thermal shock: immediate shard burst; clears part of burn duration |
| Deep Chill | Fireball | Steam burst: short radial damage and reduced slow |
| Rift Anchor | Meteor | Gravity rupture: anchor pulls the meteor impact slightly toward itself |
| Crystal Proxy | Arcane Blink route | Arcane shatter: route cut launches proxy shards along facing |

## Offensive keystones

Only the Level 100 Overflow/Overcast Apex keystone is shipped. Levels 25, 50, and 75 remain post-release proposals; existing reaction charging does not imply those rows are complete.

| Level | Keystone |
|---|---|
| 25 | The fourth staff cast changes into a small elemental helix |
| 50 | Triggering a spell reaction grants capped Overflow |
| 75 | Hitting with three different themes releases one arcane echo bolt |
| 100 | An Apex spell consumes full Overflow to add its unique overcast finisher |
