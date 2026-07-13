# Iron Knight — Level 100 Combat Plan

## Identity

The Iron Knight is a heavy blade controller: wide steel arcs, forced enemy grouping, armor breaking, and ground-shock finishers. The class should feel powerful through anticipation, enemy displacement, and decisive impact rather than camera shake or hit stop.

## Basic attack and Rage (post-release milestone proposal)

The active-skill release preserves the existing basic/Rage behavior. The Level 60/100 basic and resource transformations below are deferred; they are not part of the shipped Q/E/R/C evolution scope.

- Grow the basic chain from three to seven readable motions: horizontal, rising diagonal, thrust, overhead, shoulder turn, cross-cut, ground-cleaving finisher.
- Level 20 adds a heavier fourth-hit arc.
- Level 60 adds a short ground scar to the sixth hit.
- Level 100 makes the seventh hit release a compact forward shockwave.
- Evolved `Wrath Slam` gains a small pull at level 60 and armor-break pillars at level 100.

## Q — Whirlwind Slash

| Gate | Evolution |
|---|---|
| Base | Three circular cuts; final pulse knocks enemies outward |
| Lv.20 | Add a reverse fourth cut and a two-handed cross-slash finish |
| Lv.40 | **Cyclone:** larger radius and inward drag / **Blood Wheel:** tighter radius, faster hits, bleed |
| Lv.60 | Controlled movement during the spin; the travel line leaves one delayed wind cut |
| Lv.80 | **Storm Cage:** stronger pack grouping / **Giant Slayer:** final hit concentrates on elites and bosses |
| Lv.100 | **Sovereign Tempest:** five height-varied cuts followed by an exploding cross-shaped blade wave |

## E — Crescent Blade

| Gate | Evolution |
|---|---|
| Base | Piercing ground blade wave that applies expose |
| Lv.20 | The ground scar detonates once after the projectile passes |
| Lv.40 | **Wide Moon:** three shallow fan waves / **Full Moon:** one long, dense wave |
| Lv.60 | Each pierced enemy emits a small perpendicular cross-cut |
| Lv.80 | **Rift Trail:** several scar eruptions / **Armor Sever:** concentrated boss armor pierce |
| Lv.100 | **Worldsplitter:** long two-handed draw pose, giant crescent release, then a delayed rupture along the full path |

## R — Iron Judgment

This evolves the current forward leap into the class-defining gather, slam, and stun attack.

| Gate | Evolution |
|---|---|
| Base | Leap forward and damage the landing area |
| Lv.20 | Landing wind-up pulls nearby normal enemies toward a safe ring around the knight |
| Lv.40 | **Iron Vortex:** wider and stronger pull / **Meteor Hammer:** smaller pull and stronger slam |
| Lv.60 | Two-stage motion: plant sword for the pull, then hammer the hilt for the shockwave |
| Lv.80 | **King's Command:** reliable pack stun / **Earthbreaker:** armor break and boss stagger damage |
| Lv.100 | **Judgment of the Iron King:** vortex, two-handed ground strike, radial rock pillars, and category-scaled stun |

Implementation safety:

- Preserve a minimum radius around the player so pulled enemies do not overlap the hero.
- Bosses receive a readable tug and stagger damage, not forced teleportation.
- Apply damage on the sword plant and the slam so control never replaces offense.

## C — Starburst

| Gate | Evolution |
|---|---|
| Base | Starlight blades fall in a star pattern ahead |
| Lv.20 | A central greatblade lands after the small blades |
| Lv.40 | **Constellation:** broad patterned coverage / **Execution Field:** dense central barrage |
| Lv.60 | Embedded blades remain briefly and detonate together |
| Lv.80 | **Oath Prison:** outer hits push inward / **Falling Crown:** impacts concentrate on elite and boss targets |
| Lv.100 | **Heaven's Arsenal:** blade rain, royal greatblade impact, then three expanding steel-light rings |

## Offensive keystones

Only the Level 100 armor-break Apex stagger keystone is shipped. Levels 25, 50, and 75 remain post-release proposals.

| Level | Keystone |
|---|---|
| 25 | Fourth basic hit adds a small armor-crack arc |
| 50 | Striking three exposed enemies grants one empowered Rage gain event |
| 75 | Pulling an enemy causes the next ground impact to emit a secondary shockwave |
| 100 | Apex finishers deal bonus stagger to enemies already armor-broken |
