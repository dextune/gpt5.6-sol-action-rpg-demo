# Implementation Task Tracker

**Overall status:** Done for the explicitly scoped active-skill release; deferred milestones remain listed below

**Last updated:** 2026-07-13

**Progress owner:** Sol (analysis), Tera (review), Luna (implementation), root (integration)

## How to update this document

- Use `[ ]` for pending and `[x]` for completed atomic tasks.
- Update the phase status table whenever work starts, completes, or becomes blocked.
- Add the PR/commit/reference in the Notes column when available.
- Do not mark a phase complete until its validation and manual acceptance tasks pass.
- When scope changes, add a dated entry to the Change log rather than silently rewriting completed criteria.

## Phase status

| Phase | Status | Owner | Notes |
|---|---|---|---|
| 0. Contracts and baseline | Done | Sol / root | 16-skill/clip/control/integrity baseline, isolated medium/high pool peaks, and real High/Medium Rogue LOD evidence are recorded |
| 1. Resolver, save, and UI data | Done | Luna / root | Resolver, save compatibility, cast snapshots, rank 10, balanced auto-spend, resolved current/next UI, mutation/respec, strict debug controls, and mobile persistence are green |
| 2. Knight/Rogue vertical slice | Done | Luna / root | Iron Judgment and Rogue dual wield/Shadow Frenzy are behavior-tested, mobile-verified, and Tera-approved |
| 3. Wizard/Ranger vertical slice | Done | Sol / Luna / root | All eight skills, bounded reactions/fields/chains, real-enemy behavior, and portrait/landscape mobile states are Tera-approved |
| 4. Level 20/40 forms for all classes | Done | Luna / root | All 16 Form I overlays and 32 Level 40 options ship with accessible asset-free icons |
| 5. Level 60 motion and finishers | Done (approved asset-free exception) | Sol / Luna / root | All 16 forms explicitly map to existing owning-class clips; no GLB or manifest change |
| 6. Level 80 branches | Done | Sol / Luna / root | 32 control/flow and execution options ship with bounded runtime tests |
| 7. Level 100 Apex forms | Done | Sol / Luna / root | Existing owning-class Apex clips are explicitly approved; motion/audio/keystone checks and low/medium in-cast sheets are green |
| 8. Skill-tree UI and polish | Done | Luna / root | All 64 mutation icons are audited in HUD and panel across target viewports |
| 9. Balance, performance, regression | Done | Luna / root | 64 resolver + 48 quality + 64 real-fixture behavior + 32 visual evidence rows are green with strict pool headroom |

## Current release scope decision

This release includes the 16 Q/E/R/C active-skill paths, automatic forms at Levels 20/60/100, two-option mutations at Levels 40/80, four Level 100 class keystones, explicit Level 60/100 motion mapping, and the asset-free mutation icon language. It does not add combat bindings, animation/image assets, or manifest entries.

The following remain deferred and must not be reported as complete:

- milestone evolution for basic attacks or new class-resource loops;
- the proposed offensive keystones at Levels 25, 50, and 75;
- newly baked per-form animation assets replacing the approved shared-family clips;
- a larger tree, extra active-skill keys, or external icon art.

Existing basic attacks, Rogue dual wield, Wizard Overflow, Ranger field/verdict state, and the four shipped Level 100 keystones remain supported; they are not evidence that the deferred milestone systems were implemented.

## Phase 0 — Contracts and baseline

- [x] Capture current Q/E/R/C behavior and combat output for all four classes.
- [x] Inventory current hero clip names and confirmed fallbacks.
- [x] Document current medium/high effect-pool usage during ultimates.
- [x] Define boss stagger behavior separately from normal-enemy stun.
- [x] Confirm Rogue off-hand mount availability on all hero LODs.
- [x] Add integrity expectations for evolution IDs and mutation choices.

Exit criteria:

- [x] Baseline notes exist for all 16 active skills.
- [x] No gameplay or save behavior changed.

## Phase 1 — Resolver, save, and UI data

- [x] Expand active skill rank support from 5 to 10.
- [x] Add `evolution.forms` and `evolution.mutations` schema validation.
- [x] Implement a pure `resolveSkillForm` merge function.
- [x] Add default-merged `skillEvolution` save loading.
- [x] Serialize valid level 40 and 80 choices.
- [x] Add invalid-choice fallback tests.
- [x] Expose resolved current/next values to the skill panel.
- [x] Ensure Defense auto-spend remains valid with new ranks.
- [x] Clamp untrusted saved ranks while preserving valid old ranks and locked rank zero.
- [x] Verify old saves serialize without synthesizing mutation choices.
- [x] Resolve one immutable skill bundle at cast start and reuse it for motion, timeline, audio, and every combat phase.

Exit criteria:

- [x] Old saves load with unchanged valid ranks and no errors.
- [x] A debug player can switch valid mutations without changing key bindings.
- [x] Rank text and handler values use the same resolved data.

## Phase 2 — Knight/Rogue vertical slice

### Knight

- [x] Implement `Iron Judgment` pull-safe-ring calculation.
- [x] Add normal/elite/boss displacement rules.
- [x] Add category-scaled stun and boss stagger damage.
- [x] Create plant-sword and ground-slam phases.
- [x] Implement level 20, 40, 60, 80, and 100 data for the skill.
- [x] Add `vortexPull` and `groundFracture` recipes.

### Rogue

- [x] Mount paired dagger visuals by default.
- [x] Confirm both hands retain correct weapon transforms at all LODs.
- [x] Implement alternating left/right basic attack contacts.
- [x] Convert `Dagger Rush` to paired hand events and a dual-blade finisher.
- [x] Implement `Shadow Frenzy` damaging dash and capped haste window.
- [x] Synchronize haste with normalized hit events.
- [x] Add `dualBladeCross` and `shadowCuts` recipes.

Exit criteria:

- [x] Knight can gather, damage, slam, and stun a mixed pack safely.
- [x] Rogue visibly and mechanically uses two daggers for basics and skills.
- [x] Haste expires and cannot extend indefinitely.

## Phase 3 — Wizard/Ranger vertical slice

### Wizard

- [x] Implement Living Star compression, satellite, and flare phases.
- [x] Implement Crystal Dominion outward and inward attack phases.
- [x] Implement Space Rend route anchors and ordered detonation.
- [x] Implement gravity-lens meteor trajectory presentation.
- [x] Add the four capped spell reactions.
- [x] Prevent recursive reaction chains.

### Ranger

- [x] Implement Piercing Shot fishbone splinters and backward release.
- [x] Replace passive caltrop presentation with damaging Thornburst seed impact.
- [x] Implement planted-arrow field contacts and hard active-field caps.
- [x] Add staged Vault Shot launch/air/landing releases.
- [x] Convert Hunter Mark into direct-damage `Predator's Verdict`.
- [x] Implement capped stored-damage detonation and chain limits.

Exit criteria:

- [x] Wizard skills have four distinct spatial silhouettes.
- [x] Ranger attacks read as ballistic/terrain attacks rather than recolored spells.
- [x] Reactions, splinters, and verdict chains respect hard caps.

## Phase 4 — Level 20/40 forms for all classes

- [x] Add Form I data for all 16 active skills.
- [x] Add both level 40 mutations for all 16 active skills.
- [x] Add mutation-specific English label/summary copy and globally unique asset-free icons.
- [x] Verify area branches trade away concentrated output.
- [x] Verify focus branches do not erase pack usability entirely.
- [x] Add debug commands for class, level, rank, and mutation selection behind `?debug=1`.

Exit criteria:

- [x] Every skill has a visible level 20 change.
- [x] Every level 40 choice changes attack geometry or timing, not only a multiplier.

## Phase 5 — Level 60 motion and finishers

- [x] Approve and map existing Knight family clips for every Level 60 form.
- [x] Approve and map existing dual-wield Rogue family clips for every Level 60 form.
- [x] Approve and map existing Wizard cast/dodge clips for every Level 60 form.
- [x] Approve and map existing Ranger cast/dodge clips for every Level 60 form.
- [x] Verify every mapped clip exists in the owning hero `animationMap`; no manifest edit is required.
- [x] Preserve normalized finisher/contact events for body-synced attacks.
- [x] Preserve residual path/ground recipe layers with quality scaling.

Exit criteria:

- [x] All level 60 forms contain a new phase or finisher.
- [x] Contact events match the mapped motion at normal and haste speeds.

Evidence: `tests/skill-combat.mjs` asserts the exact 16 Level 60 clips, owning animation maps, and resolver transitions at Levels 59/60/99/100. The approved mapping table is in [motion-vfx.md](./motion-vfx.md).

## Phase 6 — Level 80 branches

- [x] Implement chain/control branch rules for all active skills.
- [x] Implement elite/boss execution branch rules for all active skills.
- [x] Add boss stagger conversions for hard-control branches.
- [x] Add chain-depth and projectile-count caps.
- [x] Add branch comparison tests using representative pack and boss fixtures.

Exit criteria:

- [x] Level 80 choices create different combat decisions.
- [x] No chain or reaction can recurse without a hard bound.

## Phase 7 — Level 100 Apex forms

- [x] Author/bake 16 Apex motion clips or explicitly approve shared family clips.
- [x] Implement three-act Apex timelines for all 16 active skills.
- [x] Add one signature effect recipe/cadence per skill.
- [x] Add one signature audio cue per Apex skill.
- [x] Implement four class level-100 offensive keystones.
- [x] Verify Apex visuals retain telegraph and hit readability at medium quality.

Exit criteria:

- [x] Each Apex skill is identifiable from silhouette and audio without HUD text.
- [x] Apex forms do not require new combat keys.

Evidence: the asset-free exception maps all 16 Level 100 forms to existing owning-class skill clips. `tests/skill-combat.mjs` checks the exact maps, all three ordered Apex audio phases, unique skill profiles, keystone authority, and zero Level 99 Apex leakage. `VISUAL_ONLY=1 node tests/level100-runtime-matrix.mjs` captures HUD-free 4×4 contact sheets for all 16 skills at low and medium quality on deterministic authoritative-impact frames, and rejects captures without an active effect/projectile/telegraph core.

## Phase 8 — Skill-tree UI and polish

- [x] Add level-track presentation to existing skill cards.
- [x] Add level 40/80 mutation selection and respec flow.
- [x] Add compact current-form and mutation badges to HUD slots.
- [x] Add class-state indicators for Shadow Frenzy, Arcane Overflow, Thorns, and Verdict without global enemy-primer chips.
- [x] Keep all player-facing copy in English.
- [x] Verify desktop and narrow viewport layouts.
- [x] Verify keyboard-only combat and touch-control mappings remain intact.

Exit criteria:

- [x] A player can understand current form, next gate, and mutation effect without external documentation.
- [x] Combat HUD remains compact and does not add bindings.

Evidence: `tests/phase8-hud-layout.mjs` validates all four classes at Apex, iterates all 64 mutation options through both HUD and panel, checks exact icon/title/ARIA data, cached respec and level/rank refresh, base-tier and locked-slot suppression, Overflow 0/75/100 states, real Q/E/R/C touch pointer events, panel-open behavior, and exact 375×812, 812×375, and 1280×720 layouts. `tests/mobile-iphone-layout.mjs` covers the existing touch HUD, management panels, persistence, and Defense isolation.

## Phase 9 — Balance, performance, and regression

- [x] Run `node tests/integrity.mjs`.
- [x] Run skill-combat and import-integrity coverage.
- [x] Test all four classes at levels 20, 40, 60, 80, and 100.
- [x] Test all 32 level-40 mutation selections across 16 skills.
- [x] Test all 32 level-80 mutation selections across 16 skills.
- [x] Test mixed normal/elite/boss responses to pull, stun, freeze, mark, and reactions.
- [x] Test old-save load and new-save round trip.
- [x] Test Hunt continue and Defense mode isolation.
- [x] Profile low/medium/high quality during each ultimate/Apex skill.
- [x] Check effect pools for steady-state allocation growth and reject peak saturation (`peak >= capacity`).
- [x] Confirm `Game.shake` and `Game.hitStop` remain no-ops.
- [x] Confirm combat remains facing-based and mouse-independent.

Evidence: `tests/level100-runtime-matrix.mjs` resolves all 64 mutation combinations, executes 48 complete low/medium/high casts, then executes all 64 combinations against real normal, elite, and boss fixtures at medium quality. It requires finite positive authoritative damage for every fixture, applied branch signals (including `rift_lance` and `void_break`), category control/stagger limits, finite caps, complete queue/scene/pool cleanup, and strictly positive pool headroom. The same test produces 32 HUD-free low/medium in-cast evidence frames. `tests/skill-combat.mjs`, `tests/phase8-hud-layout.mjs`, `tests/mobile-iphone-layout.mjs`, `tests/import-integrity.mjs`, and `tests/integrity.mjs` provide the remaining gates.

Final definition of done:

- [x] All automated validation passes.
- [x] Every active deals direct damage in every shipped mutation combination.
- [x] Rogue uses two visible and event-synchronized daggers by default.
- [x] Wizard and Ranger have distinct, non-isomorphic attack kits.
- [x] Level 100 forms are readable at medium quality and stable at low quality.
- [x] Documentation matches shipped values and behavior.

## Change log

| Date | Change | Reason |
|---|---|---|
| 2026-07-12 | Initial multi-document plan created | Establish level-100 evolution, expanded Wizard/Ranger identity, and default Rogue dual wield |
| 2026-07-12 | Phase 1 foundation started | Added immutable chronological evolution resolver, schema validation, save normalization, and regression tests |
| 2026-07-12 | Phase 1 runtime and rank capacity integrated | Wired one cast snapshot through all 16 handlers, raised actives to rank 10, balanced auto-spend, and added compact rank pips |
| 2026-07-12 | Phase 1 completed | Added resolved current/next values, mutation/respec persistence, strict debug controls, and end-to-end 375px reload/Defense-isolation coverage |
| 2026-07-12 | Phase 2A Iron Judgment completed | Added safe-ring pull search, normal/elite stun, boss stagger, phase lifecycle, branch-preserving Apex data, pooled VFX, and mobile values |
| 2026-07-13 | Asset-free P0 motion and mutation icon scope approved | Reused existing owning-class clips for all 32 Level 60/100 mappings, added 64 unique `family.role` tokens, and explicitly deferred new assets, basic/resource milestones, and Level 25/50/75 keystones |
| 2026-07-13 | Phase 9 strict runtime matrix completed | Added 64 mutation-combination behavior rows over real normal/elite/boss fixtures, 48 quality casts, 32 in-cast evidence frames, and strict no-saturation pool assertions; reduced low/medium decorative trail/fracture pressure without changing authoritative hits |
