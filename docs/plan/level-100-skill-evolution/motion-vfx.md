# Motion, VFX, Audio, and Impact Plan

## 1. Motion tiers

Do not bake a unique clip for every milestone. Use three authored motion tiers per skill family and data-driven event layers between them.

| Tier | Typical gate | Purpose |
|---|---|---|
| Base | Unlock | Clear core pose and contact |
| Advanced | Lv.60 | New attack phase or finisher motion |
| Apex | Lv.100 | Full anticipation, contact, recovery silhouette |

Level 20, 40, and 80 variations should primarily use additional normalized events, trail orientation, projectile formation, effect recipes, and modest clip time-scale changes.

### Shipped asset-free motion exception

The current release deliberately adds no GLB, texture, icon image, manifest entry, or other external asset. Level 60 and Level 100 forms use explicit clips that already exist in each owning hero's `animationMap`. This is an approved shared-family exception to the original "new authored clip" target: combat geometry, normalized events, recipes, and audio cadence provide the form distinction while the clip remains asset-free.

| Class | Skill | Level 60 clip | Level 100 clip |
|---|---|---|---|
| Knight | Whirlwind Slash | `attack_5` | `skill_whirlwind` |
| Knight | Crescent Blade | `attack_6` | `skill_crescent` |
| Knight | Iron Judgment | `attack_7` | `skill_skyfall` |
| Knight | Starburst | `attack_7` | `skill_starburst` |
| Wizard | Fireball | `cast_2` | `skill_fireball` |
| Wizard | Frost Nova | `cast_3` | `skill_frost_nova` |
| Wizard | Arcane Blink | `dodge` | `skill_blink` |
| Wizard | Meteor Storm | `cast_4` | `skill_meteor` |
| Rogue | Twin Fang | `attack_6` | `skill_twin_fang` |
| Rogue | Fan of Knives | `attack_5` | `skill_fan_knives` |
| Rogue | Shadow Frenzy | `dodge` | `skill_shadowstep` |
| Rogue | Death Lotus | `attack_5` | `skill_death_lotus` |
| Ranger | Piercing Shot | `cast_2` | `skill_pierce_shot` |
| Ranger | Caltrop Trap | `cast_3` | `skill_trap` |
| Ranger | Vault Shot | `dodge` | `skill_vault_shot` |
| Ranger | Hunter Mark | `cast_4` | `skill_hunter_mark` |

The resolver contract is exact: Level 59 uses the base skill clip, Levels 60–99 use the Level 60 clip, and Level 100 uses the Level 100 clip. `tests/skill-combat.mjs` verifies all 32 values and their owning manifest maps. A future asset-production pass may replace a shared family clip, but it must keep the data key, normalized contact contract, fallback, and manifest validation intact.

## 2. Required class motion vocabulary

### Knight

- Weight transfer before release.
- Two-handed grip for heavy finishers.
- Low-to-high steel arcs and planted-sword ground impacts.
- Pull animation must visually precede the slam.

### Rogue

- Two separately readable hand contacts.
- Left/right alternating trails and paired recovery poses.
- Cross-cuts use both blades; never fake dual wield with a duplicated right-hand effect.
- Haste changes cadence while normalized hit events remain synchronized.

### Wizard

- Fire compresses inward before expanding.
- Frost moves outward then shatters inward.
- Arcane attacks draw lines and anchors through space.
- Meteor casting uses a sustained gravity-control pose, not a sword-skill alias.

### Ranger

- Bow draw weight and release must precede projectile creation.
- Vault shots distinguish launch, airborne, and landing releases.
- Projectile formations remain aligned to facing and terrain.
- Spectral arrow/hawk constructs support attacks but do not obscure the actual shot line.

## 3. Hit synchronization

Use `CharacterAnimationController.scheduleNormalized` for body-synced contacts. Keep absolute delayed jobs for falling barrages, field ticks, and mark expiry.

Example phase pattern:

```js
timeline: {
  windupFx: 0.08,
  hits: [0.31, 0.57, 0.78],
  finisher: 0.88,
  recovery: 0.96,
}
```

Requirements:

- Damage never appears before the corresponding weapon, hand, staff, or bow release.
- Haste recomputes timing through normalized clip progress, not independent fixed delays.
- A cancelled or dead actor cannot emit future scheduled body contacts.
- Multi-projectile visual counts may scale by quality, but authoritative hit counts do not.

## 4. Impact without shake or hit stop

- Directional enemy recoil and short pose stagger.
- Emissive/contact flash with category-specific colors.
- Ground dust or shard direction matching attack force.
- Thin pre-contact trail followed by a thicker contact trail.
- Low-frequency finisher audio layered beneath material impact.
- Damage-number emphasis reserved for criticals, shatter, mark detonation, and Apex finishers.
- Controlled enemy compression/scale squash where model rigs allow it.

## 5. New effect recipes

| Recipe | Primary use |
|---|---|
| `vortexPull` | Knight inward force and safe-ring telegraph |
| `groundFracture` | Knight slam, meteor fault, thorn eruption variants |
| `dualBladeCross` | Rogue paired hand trails and X contacts |
| `shadowCuts` | Rogue delayed cut lines and haste echoes |
| `livingStar` | Wizard compressed orb, satellites, prominence flare |
| `crystalDominion` | Wizard lattice, pillars, inward shatter |
| `spaceSeam` | Wizard blink route anchors and delayed fracture |
| `gravityLens` | Wizard curved meteor trajectories |
| `arrowCorridor` | Ranger pierce points and delayed ruptures |
| `thornGrid` | Ranger planted arrow lines and grid eruption |
| `arrowConvergence` | Ranger mark/hawk execution finale |

Prefer recipes composed from existing pooled primitives. Add a primitive only when at least two recipes need it or when it creates a class-defining silhouette.

## 6. Visual evolution language

| Form | Visual change |
|---|---|
| Base | One primary color, one contact layer |
| Lv.20 | Secondary accent and clearer trail history |
| Lv.40 | Mutation-specific formation or geometry |
| Lv.60 | Persistent ground/path layer and unique finisher |
| Lv.80 | Control branch uses spatial guides; execution branch uses target focus cues |
| Lv.100 | Three-act recipe, core-white contact, unique audio cadence |

### Asset-free mutation icon language

Mutation icons are deterministic text glyphs, not image assets. Every option owns a globally unique `family.role` token. The HUD and skill panel sanitize the token against the shipped family and role tables; an unknown value renders the neutral `neutral.unknown` mark.

| Skill family token | Glyph | Skill family token | Glyph |
|---|---:|---|---:|
| `vortex` | ↻ | `moon` | ◒ |
| `hammer` | ◆ | `arsenal` | ✦ |
| `flame` | ▲ | `crystal` | ◇ |
| `rift` | ⌁ | `meteor` | ● |
| `fang` | ⋀ | `knives` | ✣ |
| `shadow` | ◩ | `lotus` | ✤ |
| `arrow` | ➤ | `thorn` | ⌗ |
| `vault` | ⌃ | `mark` | ◎ |

Roles are `breadth` (`•••`), `focus` (`•`), `flow` (`↝`), and `execution` (`▼`). The icon is supplemental: both UI surfaces retain the full English label and summary in `title` and `aria-label`.

## 7. Performance budgets

- Scale decorative particles to approximately 45%/75%/100% for low/medium/high.
- Preserve telegraphs, hit outlines, projectile cores, and status readability at every quality.
- Cap Rogue afterimages at four active ghosts.
- Cap Wizard gravity/meteor visual bodies independently from authoritative impacts.
- Pool Ranger planted-arrow visuals and enforce one active field per caster unless explicitly upgraded.
- Avoid temporary point lights per hit.
- Dispose removed cloned materials and geometries; reuse recipe resources where possible.
- Fan/Night Peacock dagger projectiles keep their projectile cores while decorative trail emission is capped at 6/10/16 for low/medium/high quality.
- Meteor fracture damage remains authoritative on every impact; low/medium renders the heavy ground-fracture decoration on alternating impacts, while high renders every impact.
- Runtime acceptance treats `peak >= capacity` as failure, so a passing pool has real headroom and cannot hide active-item overwrite at saturation.

## 8. Audio layers

Each major attack uses up to three semantic layers:

1. motion/release;
2. material or elemental contact;
3. low finisher or status confirmation.

Mutation branches may change layer selection, but should not require entirely separate banks for every rank. Apex forms receive one unique signature cue per skill.
