# Phase 0 — Current Combat Baseline and Contracts

**Snapshot date:** 2026-07-13

**Snapshot scope:** Current working tree after the Phase 1 foundation and Phase 2 Knight/Rogue vertical slice.

**Purpose:** Preserve below-gate behavior and make the contracts that later milestones must not silently break explicit.

## Reading combat values

A combat pair `[base, step]` resolves as `base + rank * step`. Skill rank is clamped to the supported integer range. The table describes the path below level 20 unless stated otherwise. Skill Power is applied exactly once by the authoritative damage path.

## Active-skill baseline

| Class | Key / stable id | Input and motion contract | Authoritative baseline output | Feedback contract |
|---|---|---|---|---|
| Knight | Q `whirlwind` | Radial spin with normalized contacts at `.22/.48/.74` | 3 pulses, mult `[.46,.055]`, radius `[4.1,.18]`; final knockback 4.8 | `spinStorm`, windsteel trail/rings, blade SFX |
| Knight | E `crescent` | Release along body facing at normalized `.38` | Piercing wave, mult `[1.5,.22]`, speed `[16.5,.5]`, pierce `[3,1]`, expose; rank 3+ delayed scar | `groundWave`, long ground silhouette, blade SFX |
| Knight | R `skyfall` / Iron Judgment | Below Lv20, one facing leap and landing telegraph | Mult `[1.85,.28]`, radius `[4.5,.22]`, leap 10.5, armor pierce .25, one landing hit | `leapImpact`, leap SFX; evolved pull/stun is outside this legacy baseline |
| Knight | C `starburst` | Delayed barrage centered 9.5 units along facing | Hits `[6,1]` at `[.63,.06]`, then finale `[.95,.1]`, star pattern | `starBlade` plus finale, starlight cadence |
| Wizard | Q `fireball` | Staff release at normalized `.36`; collision owns timing | Orb `[1.55,.24]`, blast `[.55,.08]`, radius `[2.4,.12]`, burn | `fireOrb`/`fireBlast`, orange projectile core and blast |
| Wizard | E `frost_nova` | Radial cast at normalized `.28` | Mult `[1.2,.16]`, radius `[4.4,.2]`, slow; rank 3+ strengthens existing slow | `iceNova`, expanding cold rings/lattice |
| Wizard | R `arcane_blink` | Facing teleport to a world-resolved point | One arrival hit, mult `[1.7,.26]`, radius `[4.2,.2]`, leap 11 | `blinkBurst`, departure/arrival afterimages |
| Wizard | C `meteor_storm` | Staggered fall-cone along facing | Hits `[6,1]` at `[.6,.055]`, finale `[.9,.1]`, burn | `meteorDrop`/finale, vertical fall trails distinct from Starburst |
| Rogue | Q `twin_fang` | Right/left normalized contacts `.22/.52/.72` | 2 hits, rank 3+ 3; mult `[.72,.09]`, range `[2.3,.08]`, bleed, crit +.15 | `fangRush`, distinct main/off-hand origins |
| Rogue | E `fan_of_knives` | Facing fan release at normalized `.34` | Knives `[5,1]`, mult `[.55,.07]`, speed `[17,.4]`, one pierce, bleed | `daggerFan`, teal/violet projectile fan |
| Rogue | R `shadowstep` / Shadow Frenzy | Below Lv20, one damaging facing dash | Mult `[1.55,.24]`, dash `[7.5,.28]`, width 2.2, armor pierce .3 | `shadowDash`; haste begins only at the Lv20 form |
| Rogue | C `death_lotus` | Close radial flurry followed by a finisher | Hits `[8,1]` at `[.42,.05]`, finale `[1.1,.12]`, bleed, crit +.22 | `lotusFlurry`, paired blade arcs and final knockback |
| Ranger | Q `piercing_shot` | Bow release along body facing at normalized `.34` | Mult `[1.65,.22]`, speed `[18,.4]`, pierce `[3,.4]`, bleed | `arrowStreak`, heavy ballistic line |
| Ranger | E `caltrop_trap` | Place a field 7.5 units along facing | 5 ticks at `[.38,.05]`, radius `[3.2,.12]`, interval .55, slow | `trapField`, ground field with no mouse placement |
| Ranger | R `vault_shot` | Backward world-resolved vault and forward fan | Arrows `[4,1]` at `[.58,.07]`, dash `[3.6,.12]`, spread .14 | `vaultVolley`, movement and arrows stay facing-aligned |
| Ranger | C `hunter_mark` | Select prey in the facing cone with a bounded nearest fallback | Direct tag `[1.1,.14]`, expose/amp, duration `[5.2,.35]`; rank 3+ re-mark detonation | `markGlyph`, persistent prey cue |

## Animation catalog and effective fallbacks

All current primary skill clips are present in the owning hero manifest.

| Class | Primary skill clips | Effective fallback if the primary disappears |
|---|---|---|
| Knight | `skill_whirlwind`, `skill_crescent`, `skill_skyfall`, `skill_starburst` | Generic `skill_whirlwind` where available; missing Whirlwind ends at `idle` |
| Wizard | `skill_fireball`, `skill_frost_nova`, `skill_blink`, `skill_meteor` | Explicit Knight fallback names are absent from the Wizard manifest, so the terminal fallback is `idle` |
| Rogue | `skill_twin_fang`, `skill_fan_knives`, `skill_shadowstep`, `skill_death_lotus` | Twin Fang → `attack_2`; Shadow Frenzy → `dodge`; missing Fan/Death primary clips end at `idle` |
| Ranger | `skill_pierce_shot`, `skill_trap`, `skill_vault_shot`, `skill_hunter_mark` | `cast_2`, `cast_3`, `dodge`, and `cast_4`; all are present |

Shared locomotion/reaction clips are `idle`, `run`, `sprint`, `dodge`, `hit`, and `death`. Knight and Rogue ship `attack_1`–`attack_7`. Wizard and Ranger ship `attack_1`–`attack_4` plus `cast_1`–`cast_4`.

Validation rule: an active's primary `anim` must exist in its owning animation map, or its missing-primary and effective-fallback outcome must be documented. A fallback absent from that manifest is not a confirmed clip.

## Effect-pool baseline

| Pool | Capacity |
|---|---:|
| Particle emitters | 48, each with `MAX_PARTICLES = 128` |
| Slashes | 36 |
| Rings | 44 |
| Pillars | 24 |
| Trails | 40 |
| Decals | 20 |
| Ghosts | 8 |
| Beams | 16 |
| Impact stars | 18 |
| Additive light flashes | 10 |

Decorative particle counts scale to approximately 75% on medium and 100% on high. Telegraph cores, authoritative projectile cores, hit outlines, and status readability must survive quality scaling. Temporary PointLights per hit are forbidden.

### Measured ultimate usage

Record peak simultaneously active pool entries over one isolated full cast. Run three casts per row and retain the maximum. Capacity alone is not usage evidence.

| Skill | Quality | Particle | Slash | Ring | Pillar | Trail | Decal | Ghost | Beam | Star / flash | Overflow |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Starburst | Medium | 9 | 10 | 8 | 7 | 2 | 0 | 0 | 0 | 2 / 1 | None |
| Starburst | High | 9 | 10 | 8 | 7 | 2 | 0 | 0 | 0 | 2 / 1 | None |
| Meteor Storm | Medium | 19 | 5 | 10 | 7 | 11 | 10 | 0 | 4 | 6 / 4 | None |
| Meteor Storm | High | 19 | 5 | 10 | 7 | 11 | 10 | 0 | 4 | 6 / 4 | None |
| Death Lotus | Medium | 5 | 3 | 5 | 2 | 2 | 0 | 0 | 0 | 2 / 1 | None |
| Death Lotus | High | 5 | 3 | 5 | 2 | 2 | 0 | 0 | 0 | 2 / 1 | None |
| Hunter Mark | Medium | 11 | 6 | 13 | 3 | 4 | 2 | 0 | 0 | 6 / 3 | None |
| Hunter Mark | High | 11 | 6 | 13 | 3 | 4 | 2 | 0 | 0 | 6 / 3 | None |

These are peak active pool-entry counts, not decorative particle totals. `tests/phase0-runtime-baseline.mjs` runs three isolated four-second casts per row on a deterministic 60 Hz combat/effect clock and retains the maximum. No measured pool reached capacity.

## Enemy control and boss stagger contract

| Category | Hard stun cap | Pull cap | Stagger threshold | Break duration |
|---|---:|---:|---:|---:|
| Normal | 2.4 s | 4.0 | 60 | 1.45 s |
| Elite | 1.2 s | 2.2 | 85 | 1.0 s |
| Boss | 0 s | 0 | 100 | 0.72 s |

Normal and elite hard control uses `applyStun`. Bosses never receive authoritative hard stun or pull; control skills call `addStagger` and may show a visual tug. Reaching the threshold creates one bounded break and keeps overflow by modulo. Repeated stuns use the greater remaining duration and remain category-capped instead of stacking additively.

## Rogue off-hand and LOD contract

Rogue equipment remains one gameplay item. `CharacterFactory` mounts the main dagger on `weapon_socket`, creates `offhand_socket` under `left_hand`, and clones the same asset for the off hand. Blade-base/tip references are independent, contacts alternate origins, and lifecycle cleanup releases both clone handles and owned runtime materials exactly once without disposing cache-shared geometry or textures.

| Runtime quality | Rogue asset |
|---|---|
| High | `assets/models/hero/rogue_lod0.glb` |
| Medium | `assets/models/hero/rogue_lod1.glb` |
| Low | `assets/models/hero/rogue_lod1.glb` |

Completion evidence: `tests/phase0-runtime-baseline.mjs` loads High and Medium in separate fresh browsers. Both runs confirm requested hero/weapon quality, `left_hand`, both mounted sockets, and distinct world-space blade tips. The report and `rogue-high.png` / `rogue-medium.png` screenshots are written to `/tmp/sol-arpg-phase0-runtime` by default.

## Evolution and mutation integrity expectations

1. Stable `id`, `effect`, class ownership, and Q/E/R/C key never change across forms.
2. Automatic forms may exist only at levels 20, 60, and 100.
3. Mutation gates may exist only at levels 40 and 80.
4. Each mutation gate contains exactly two nonempty, unique option IDs.
5. Forms and mutations provide English `label` and `summary` text.
6. Overlays use valid `combat`, `presentation`, `timeline`, and nonempty `anim` shapes.
7. Invalid saved choices fall back deterministically; normalization rejects foreign-class choices.
8. Missing old-save `skillEvolution` remains empty and does not synthesize saved choices.
9. The immutable bundle applies milestones in order: 20 form → 40 mutation → 60 form → 80 mutation → 100 form.
10. Every effect has a handler and each class owns one unique Q/E/R/C mapping.
11. Tests cover both choices, invalid fallback, respec, save round trip, and below-gate legacy behavior.

## Baseline validation evidence

- `node tests/skill-combat.mjs`
- `node tests/import-integrity.mjs`
- `node tests/integrity.mjs`
- `node tests/phase0-runtime-baseline.mjs`

All four commands pass at snapshot time. The runtime probe records isolated pool peaks and real Rogue LOD evidence without changing gameplay or save data.
