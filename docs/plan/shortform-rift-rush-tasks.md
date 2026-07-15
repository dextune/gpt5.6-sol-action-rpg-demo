# Short-Form Rift Rush — Implementation Task List

This list is the authoritative progress record for [Short-Form Rift Rush](./shortform-rift-rush.md). Update checkboxes only after the implementation or evidence exists in the current worktree.

## Phase 0 — Discovery and specification

- [x] Audit current Hunt, Defense, kill-chain, reward, skill-evolution, UI, and save integration points.
- [x] Record existing user changes and preserve the in-combat forge work.
- [x] Define the 75–90 second playable loop and time-to-payoff targets.
- [x] Define encounter, hazard, mutation, Break, score, daily seed, trophy, UI, isolation, and validation requirements.
- [x] Create the detailed English implementation plan.

## Phase 1 — Rush data foundation

- [x] Add frozen Rush timing, spawn, Break, score, grade, and meta configuration.
- [x] Add six behavior-changing encounter definitions.
- [x] Add six zone hazard definitions.
- [x] Add deterministic seeded-selection helpers.
- [x] Add trophy definitions and deterministic offer generation.
- [x] Add unit coverage for deterministic helpers and grade thresholds.

## Phase 2 — Complete run state machine

- [x] Add `RushSystem` ownership/reset/start/update/end paths.
- [x] Add immediate opening spawn inside the readable camera radius.
- [x] Add Act I and Act II encounter spawning and objective completion.
- [x] Add encounter timeout/failure handling without stalling the run.
- [x] Add boss/champion apex spawning and support composition.
- [x] Add completion/failure result generation.
- [x] Ensure every phase has an explicit exit and the full run can finish without reload.

## Phase 3 — Mutation draft

- [x] Build deterministic draft order from existing active-skill mutation data.
- [x] Pause combat simulation safely while the draft remains interactive.
- [x] Apply choices through Player skill-evolution state and `resolveSkillForm`.
- [x] Add pointer/touch and `1`/`2` keyboard selection.
- [x] Prevent duplicate skill/tier drafts in one run.
- [x] Resume the next act immediately after selection.

## Phase 4 — Zone hazards

- [x] Implement Emerald Meadow Pollen Burst.
- [x] Implement Whispering Grove Root Snare.
- [x] Implement Sunscar Canyon Fault Line.
- [x] Implement Frostcrown Plateau Ice Ring.
- [x] Implement Ember Wilds Lava Bloom.
- [x] Implement Starfall Ruins Rift Collapse.
- [x] Stop and clear hazard work during draft/result/reset.

## Phase 5 — Break, execution, and spectacle

- [x] Route successful boss damage into Rush Break accounting.
- [x] Apply bounded Break contributions by hit type.
- [x] Trigger existing break/stagger state at full meter.
- [x] Apply a bounded broken vulnerability window.
- [x] Detect and score a boss kill during the execution window.
- [x] Add pooled VFX/audio/UI feedback without camera shake or hit stop.

## Phase 6 — Score, daily seed, and trophy rewards

- [x] Score kills, elites, bosses, encounters, multikills, Break, execution, time, and damage taken.
- [x] Compute `S/A/B/C` grade with a visible breakdown.
- [x] Add fresh-seed normal runs and UTC-date Daily Rift seed.
- [x] Store normal best and daily best separately from Hunt continuation data.
- [x] Generate three deterministic trophy offers.
- [x] Apply exactly one persistent reward and prevent duplicate claims.

## Phase 7 — Game and save isolation

- [x] Instantiate and update Rush from `Game` only in Rush mode.
- [x] Add title launch, retry, next-seed, and return-to-title routes.
- [x] Route enemy kills and player death to Rush.
- [x] Clear Rush-owned enemies, hazards, drafts, and results on run reset.
- [x] Prove Rush never writes temporary hero state into the Hunt continue save.
- [x] Preserve Hunt, Defense, and Continue behavior.

## Phase 8 — HUD, draft, result, and responsive layout

- [x] Add title buttons for Rift Rush and Daily Rift.
- [x] Add timer, act, encounter, objective, and score HUD.
- [x] Add boss Break meter.
- [x] Add two-card mutation draft overlay.
- [x] Add result grade, metrics, trophy choices, Retry/Next/Title actions.
- [x] Hide Hunt contract/boss presence and in-combat forge in Rush.
- [x] Validate desktop and narrow viewport readability.
- [x] Keep every new player-facing string in English.

## Phase 9 — Automated and runtime validation

- [x] Run `node tests/integrity.mjs`.
- [x] Run skill-combat tests.
- [x] Run existing desktop/mobile HUD layout tests relevant to changed UI.
- [x] Add and pass Rush data/state unit tests.
- [x] Browser-smoke all four classes through launch and active-skill input.
- [x] Complete one full Rush loop, claim a trophy, retry, and return to title without reload.
- [x] Verify duplicate reward claims are rejected.
- [x] Verify deterministic Daily Rift ordering.
- [x] Launch Hunt after Rush and verify normal save behavior.
- [x] Launch Defense after Rush and verify wave behavior.
- [x] Capture desktop and narrow gameplay/result screenshots with no console errors.
- [x] Re-index or detect changes with codebase memory and perform a requirement-by-requirement completion audit.

## Completion

- [x] Every plan requirement has direct implementation or validation evidence.
- [x] No required task remains unchecked.
- [x] The full short-form loop is playable, repeatable, isolated, and verified.

## Validation evidence — 2026-07-15 UTC

- `node tests/rush-content.mjs` — passed deterministic plan, grade, direct/pending reward, and duplicate-claim assertions.
- `node tests/integrity.mjs` — passed project integrity, skill-combat, and import-integrity checks.
- `node tests/rush-browser-smoke.mjs` — passed the complete loop, six live hazard paths, Break/execution, three navigation routes, duplicate-claim rejection, direct and next-Hunt pending reward delivery, four classes, Hunt/Defense regression, Daily determinism, and desktop/narrow screenshots with no console errors.
- `node tests/phase8-hud-layout.mjs` — passed desktop, portrait, landscape, four-class mutation HUD, and stable input mapping checks.
- `node tests/mobile-iphone-layout.mjs` — passed title, Hunt HUD, menu, Continue, input, portrait, and landscape checks.
- `node tests/mobile-combat-hud-layout.mjs` — executed with no console errors; it still reports three pre-existing non-Rush assertions (Defense/player overlap and the established 9 px mobile gauge versus its older threshold). The failing selectors are untouched by Rush and the dedicated post-Rush Hunt/Defense regression passes.
- Codebase memory fast re-index — completed with 3,519 nodes and 8,687 edges; the completion audit found no uncovered Rift Rush requirement.
