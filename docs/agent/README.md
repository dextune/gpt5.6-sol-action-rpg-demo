# Agent guides — hero classes & multi-class system

English-only playbooks for AI agents and humans who extend **playable hero classes** (knight `aerin`, wizard, rogue, planned ranger, future jobs).

These guides document the architecture and the work done to introduce multi-class heroes, a full wizard combat kit, facing-aligned combat, and import-integrity guards.

## Read first

| Doc | When to use |
|-----|-------------|
| [add-hero-class.md](./add-hero-class.md) | **Primary:** step-by-step checklist to add a new job |
| [multi-class-architecture.md](./multi-class-architecture.md) | Understand data flow, contracts, file ownership |
| [wizard-reference.md](./wizard-reference.md) | Concrete example: how Wizard was built end-to-end |
| [combat-facing.md](./combat-facing.md) | Attacks/skills must follow movement / body facing |
| [validation.md](./validation.md) | Tests and how to prevent `ReferenceError` regressions |

## Related project docs

- [../characters-visual.md](../characters-visual.md) — GLB bake, palettes, weapons, **clip catalogs**  
- [../extension-playbooks.md](../extension-playbooks.md) — **spectacle-grade new skill** checklist  
- [../content-data.md](../content-data.md) — `SKILLS` combat/theme/timeline schema  
- [../combat.md](../combat.md) — damage, statuses, skillPower rules, skill identity table  
- [../graphics-vfx.md](../graphics-vfx.md) — recipes + quality LOD  
- [../audio.md](../audio.md) — themed skill SFX banks  
- [../plan/multi-class-wizard.md](../plan/multi-class-wizard.md) — original multi-class plan  
- [../plan/skill-motion-spectacle.md](../plan/skill-motion-spectacle.md) — **implemented** skill/motion spectacle standard  
- [../save-and-run.md](../save-and-run.md) — run, save, verify  

## Hard constraints (do not break)

1. **Hunt / Defense isolation** — class work must not corrupt Hunt continue saves or Defense meta rules.  
2. **No CDN** — Three.js stays in `vendor/` only.  
3. **Shared skeleton** for hero GLBs; combat clips should stay class-distinct where possible (see characters-visual).  
4. **Combat is keyboard-only** (`J` / `Space` / skills). Mouse is UI-only. Aim along movement/facing, not mouse.  
5. **Validation** — after content/path/import/skill changes: `node tests/integrity.mjs` (includes skill-combat).  
6. **Docs language** — everything under `docs/` is English. Player-facing UI strings follow project UI rules.

## Existing classes

| `classId` | Role | Model | Attack style | Starter |
|-----------|------|-------|--------------|---------|
| `aerin` | Iron knight (default) | `hero.aerin` | `melee` | Knight Longsword (`sword`) — plate helm GLB |
| `wizard` | Arcane caster | `hero.wizard` | `magic` | Apprentice Staff (`staff`) |
| `rogue` | Night fang — short-reach crit flurry | `hero.rogue` | `melee` | Fledgling Dagger (`dagger`) — runtime hood kit |
| `ranger` | Wildshot — bow volleys, trap & mark | `hero.ranger` | `ranged` | Fledgling Bow (`bow`) — [../plan/ranger-class.md](../plan/ranger-class.md) |

Melee basic-attack combo length grows with player level (3→7); clips `attack_1`–`attack_7` when baked.  
Wizard basics use `cast_1`–`cast_4`. Ranger plan reuses projectile basics with bow presentation. See [combat-facing.md](./combat-facing.md) and Player `basicComboLength`.

Class mechanics are data on the `HERO_CLASSES` row (see [../plan/character-improvements.md](../plan/character-improvements.md)):

- **Basic attack** — `getClassBasicAttack(classId)` merges style defaults with `meleeProfile` / `basicAttack`
  overrides (`rangeMult`/`arcMult`/`flurry`, melee range/mult curves, magic `bolts`/`comboMults`).
- **Energy resource (Focus/Rage)** — `energy: { label, effect, max, perHit, perCrit, perDamageTaken?, … }`.
  Full gauge (Lv3+) turns the next attack click into the class burst dispatched via
  `CombatSystem.energyHandlers[energy.effect]` (rogue `dagger_rush`, knight `wrath_slam`). Serialized in saves.
- **Stat mods** — `baseStatMods` supports `attack`/`mp`/`skillPower` plus `hp`/`defense` multipliers (rogue glass cannon).
- **Passive keys** — `Player.passiveEffects` aggregates `attack/hp/defense/skillPower/mpRegen/mpFlat/luck/gold`
  plus `crit`, `haste`, `execute` (knight low-HP bonus), `dotPower` (DoT scale), `statusCrit` (crit vs bleeding/slowed).
- **Loot** — `weaponBias: { preferred: [models], mult, otherMult }` weights weapon-base drops.
- **Cap overflow** — attack speed past 1.75 accelerates energy gain; crit past 0.65 becomes crit damage.

Default when save/UI omit class: `DEFAULT_HERO_CLASS_ID = 'aerin'`.

### Skill spectacle baseline (both classes)

Actives must carry `combat` + `theme` + `sfx` + `recipe` + distinct `anim`.  
Handlers use `skillCombatAtRank` / Effects recipes / themed audio. Validate with `node tests/skill-combat.mjs`.
