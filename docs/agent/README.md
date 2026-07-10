# Agent guides — hero classes & multi-class system

English-only playbooks for AI agents and humans who extend **playable hero classes** (hunter, wizard, future jobs).

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

Melee basic-attack combo length grows with player level (3→7); clips `attack_1`–`attack_7` when baked.  
Wizard basics use `cast_1`–`cast_4`. See [combat-facing.md](./combat-facing.md) and Player `basicComboLength`.

Default when save/UI omit class: `DEFAULT_HERO_CLASS_ID = 'aerin'`.

### Skill spectacle baseline (both classes)

Actives must carry `combat` + `theme` + `sfx` + `recipe` + distinct `anim`.  
Handlers use `skillCombatAtRank` / Effects recipes / themed audio. Validate with `node tests/skill-combat.mjs`.
