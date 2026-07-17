# Level 100 Skill Evolution Plan

**Status:** Complete for the explicitly scoped active-skill release; deferred milestones remain out of scope

**Scope:** All four playable classes (`aerin`, `wizard`, `rogue`, `ranger`)

**Control contract:** Basic attack plus fixed `Q` / `E` / `R` / `C` skill slots

**Combat loop:** input → evolved attack motion → authoritative hit/status change → readable feedback → kill/reward

## Objective

Keep the small keyboard layout while making every combat slot grow visibly and mechanically through level 100. A skill keeps its key and core identity, but its motion, hit pattern, effects, sound layers, and tactical use evolve at milestone levels.

All active skills remain attacks. Movement, buffs, marks, traps, and control effects must deal direct damage on activation, during the effect, or at the finisher. Utility must never replace the attack payload.

## Shipped release scope

- All 16 Q/E/R/C active skills have automatic forms at Levels 20, 60, and 100 plus two-option mutations at Levels 40 and 80.
- All 32 Level 60/100 motion values explicitly reuse clips already present in the owning hero animation map. This approved asset-free exception adds no GLB or manifest entry.
- All 64 mutations have globally unique `family.role` icon tokens rendered as sanitized text glyphs in the HUD and skill panel, with full English label/summary accessibility text.
- Four Level 100 offensive class keystones ship without adding combat bindings.

Deferred work is not part of this release: basic-attack or class-resource milestone evolution, the proposed Level 25/50/75 offensive keystones, newly baked per-form clips, external icon art, extra skill keys, and a larger tree. See [implementation-tasks.md](./implementation-tasks.md) for the tracked acceptance state.

## Documents

| Document | Purpose |
|---|---|
| [baseline-contracts.md](./baseline-contracts.md) | Current 16-skill behavior, animation fallback, control, LOD, and VFX measurement baseline |
| [growth-system.md](./growth-system.md) | Shared level gates, ranks, branches, save data, and balance rules |
| [knight.md](./knight.md) | Iron Knight skill and basic-combo evolution |
| [rogue.md](./rogue.md) | Dual-wield Night Fang identity, haste window, and skill evolution |
| [wizard.md](./wizard.md) | Element-reaction and space-distortion spell evolution |
| [ranger.md](./ranger.md) | Ballistics, terrain attacks, moving volleys, and hunt execution |
| [motion-vfx.md](./motion-vfx.md) | Animation, hit timing, VFX, SFX, readability, and performance budgets |
| [implementation-tasks.md](./implementation-tasks.md) | Progress tracker, phased task list, validation, and definition of done |

## Product pillars

1. **Same key, deeper move:** Q/E/R/C never need extra bindings.
2. **Mechanics before multipliers:** milestone growth changes attack behavior, not only damage.
3. **Three-act impact:** high-tier skills use anticipation, contact, and a distinct finisher.
4. **Class-readable silhouettes:** a skill should identify its class even with damage numbers hidden.
5. **Direct offense:** buffs and control are attached to damaging attacks.
6. **Facing-first combat:** attacks continue to follow movement/body facing, never mouse aim.
7. **Performance-scaled spectacle:** low, medium, and high quality retain the same hit information.

## Milestone summary

| Player level | Skill change |
|---|---|
| 1–16 | Basic combo and Q/E/R/C kit unlock |
| 20 | Form I: first visible motion and hit-pattern upgrade |
| 40 | Mutation I: choose area/tempo or concentrated damage |
| 60 | Form II: new phase or finisher; upgraded animation clip |
| 80 | Mutation II: choose control/chain behavior or elite/boss execution |
| 100 | Apex form: final motion, recipe, audio cadence, and attack structure |

## Non-negotiable project constraints

- Do not re-enable `Game.shake` or `Game.hitStop`.
- Do not add mouse combat aiming.
- Do not add CDN dependencies or edit `vendor/`.
- Keep Hunt and Defense behavior/save isolation intact.
- Keep player-facing strings in English.
- Run `node tests/integrity.mjs` after content, path, animation-map, or skill changes.
- Run through `node server.mjs`; never validate through `file://`.
