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

- [../characters-visual.md](../characters-visual.md) — GLB bake, palettes, weapons  
- [../extension-playbooks.md](../extension-playbooks.md) — short “add a hero class” section  
- [../plan/multi-class-wizard.md](../plan/multi-class-wizard.md) — original design plan  
- [../combat.md](../combat.md) — hit detection vs presentation  
- [../save-and-run.md](../save-and-run.md) — run, save, verify  

## Hard constraints (do not break)

1. **Hunt / Defense isolation** — class work must not corrupt Hunt continue saves or Defense meta rules.  
2. **No CDN** — Three.js stays in `vendor/` only.  
3. **Shared skeleton + clip names** for hero GLBs (see architecture doc).  
4. **Combat is keyboard-only** (`J` / `Space` / skills). Mouse is UI-only. Aim along movement/facing, not mouse.  
5. **Validation** — after content/path/import changes: `node tests/integrity.mjs`.  
6. **Docs language** — everything under `docs/` is English. Player-facing UI strings follow project UI rules.

## Existing classes

| `classId` | Role | Model | Attack style | Starter |
|-----------|------|-------|--------------|---------|
| `aerin` | Iron knight (default) | `hero.aerin` | `melee` | Knight Longsword (`sword`) — plate helm GLB |
| `wizard` | Arcane caster | `hero.wizard` | `magic` | Apprentice Staff (`staff`) |

Melee basic-attack combo length grows with player level (3→7). See [combat-facing.md](./combat-facing.md) and Player `basicComboLength`.

Default when save/UI omit class: `DEFAULT_HERO_CLASS_ID = 'aerin'`.
