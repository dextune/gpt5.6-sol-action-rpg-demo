# Short-Form Rift Rush

## 1. Product intent

Rift Rush is a self-contained, replayable action-RPG run that exposes the game's best combat systems within the first minute. It complements persistent Hunt and long-form Defense rather than replacing either mode.

The smallest complete loop is:

> Select a hero → enter combat within three seconds → clear two behavior-changing encounters → draft existing skill mutations → break and execute a boss → choose a trophy → receive a grade → retry or return to title.

The target run length is **75–90 seconds of active gameplay**, excluding asset loading and the result screen.

## 2. Why this mode exists

The project already has broad content: six zones, four hero classes, sixteen active skills, eighty-four enemies, role-aware spawning, elite affixes, bosses, skill forms, mutation branches, multikill spectacle, kill-chain growth, and synthesized combat audio. The short-form problem is therefore a sequencing problem rather than a catalog-size problem.

Current Hunt and Defense defer several payoffs:

- Hunt begins at level 1 with no active skill and places its initial roster outside the immediate camera frame.
- Hunt contracts require a multi-pack commitment and boss presence requires many normal kills.
- Defense provides immediate skill spectacle but has a 200-wave destination.
- Defense mutators mostly alter statistics instead of changing the player's immediate objective or movement decisions.
- Normal kill rewards are gold/potions and contracts resolve primarily into gold, so there is no concise end-of-run trophy moment.

Rift Rush reorders existing strengths so the player sees an active skill, a multikill, a gameplay twist, a mutation, a boss, and a meaningful reward in one short session.

## 3. Experience targets

| Moment | Target |
|---|---:|
| Run entry to controllable hero | ≤ 1.5 s after assets are ready |
| Run entry to visible enemy pressure | ≤ 3 s |
| First usable active skill | Immediate |
| First likely multikill | ≤ 12 s |
| First behavior-changing encounter rule | ≤ 15 s |
| First mutation draft | ≤ 30 s |
| Boss arrival | ≤ 60 s |
| Result screen | 75–90 s |
| Result to retry | ≤ 2 s |

## 4. Run structure

### 4.1 Opening

- The selected hero is reset into an isolated run and moved to the chosen zone center.
- Rift power temporarily raises the hero to the evolution-ready level used by the existing skill-form system.
- All four class actives are available at a useful rank from the start.
- Potions and resources are restored; Hunt continuation data is not overwritten.
- A compact enemy group spawns inside the readable camera radius after a short telegraph.

### 4.2 Act I: pressure encounter

- Duration budget: 15–22 seconds.
- Uses a data-authored encounter card with a target, time budget, role composition, and scoring condition.
- Completion opens a mutation draft for one class skill.

### 4.3 Act II: twist encounter

- Duration budget: 18–25 seconds.
- Uses a different encounter family and activates the current zone's combat hazard.
- Completion opens a second mutation draft, preferably at the other mutation tier or on another active skill.

### 4.4 Apex

- A zone champion or boss arrives with support appropriate to its encounter recipe.
- Damage and qualifying skill hits build Break.
- At full Break the boss is staggered, takes a bounded vulnerability window, and exposes an execution opportunity.
- Killing the boss completes the run. The boss may not be executed above a bounded threshold solely from Break; the normal damage model remains authoritative.

### 4.5 Result and one-more-run loop

- The run receives a grade from score, clear time, peak chain, multikills, damage avoided, encounter success, and Break execution.
- Three deterministic trophy offers are generated from the run seed; the player chooses one.
- The chosen trophy grants a small persistent reward without serializing the temporary Rush hero build into Hunt.
- The result screen presents Retry, Next Rift, and Return to Title.

## 5. Encounter cards

Encounter cards must change target priority, movement, or attack cadence. Pure HP/damage multipliers are supporting tuning, not an encounter identity.

### Blood Rush

- Clear a dense fodder pack before the blood clock expires.
- Chained kills extend the clock slightly.
- Primary score source: fast kills and multikills.

### Treasure Hunt

- A hasted golden target attempts to stay away while escorts screen it.
- Killing the target ends the card; killing escorts grants score but not completion.
- Primary score source: target kill time.

### Crossfire

- Ranged and artillery enemies spawn on an outer ring while a smaller frontline pins the player.
- Primary decision: break the ring or burst the center.

### Chain Reaction

- Fodder deaths detonate a bounded damage pulse against nearby enemies.
- The pulse never recursively triggers another pulse in the same chain generation.
- Primary score source: largest reaction chain.

### Collapse

- A visible arena radius contracts around the player.
- Standing outside the safe radius causes bounded periodic damage and a score penalty.
- Primary score source: clear while remaining inside the arena.

### Apex Escort

- A champion advances with support/controller units.
- The support layer meaningfully changes the boss approach and is removed when the champion dies.
- Primary score source: champion clear and support interruption.

## 6. Skill mutation draft

Rift Rush reuses the existing `SKILLS.*.evolution.mutations` data at gates 40 and 80. Each active already exposes two alternatives at each gate. This yields sixty-four authored options across the four classes without adding palette-only duplicate skills.

Draft rules:

- A draft shows exactly two choices from one skill and one mutation tier.
- The game pauses combat simulation during the draft while Effects/UI continue to render.
- Desktop keys `1` and `2`, pointer input, and touch input select a card.
- A selected mutation is applied through the existing Player mutation state and `resolveSkillForm` path.
- The same skill/tier is not drafted twice in one run.
- Draft order is deterministic from the run seed.
- Mutation names, summaries, and presentation icons come from content data.

## 7. Zone hazard identity

Each existing zone contributes one readable combat rule. Hazards use pooled Effects primitives and do not create per-frame geometry, materials, textures, or lights.

| Zone | Hazard | Readability rule |
|---|---|---|
| Emerald Meadow | Pollen Burst | Beneficial burst telegraphs near packs and damages enemies after a delay. |
| Whispering Grove | Root Snare | A circle tracks the player's prior position; leaving it avoids damage/slow pressure. |
| Sunscar Canyon | Fault Line | A long ground wave telegraphs across the arena before impact. |
| Frostcrown Plateau | Ice Ring | A moving ring rewards repositioning and grants a brief movement bonus inside. |
| Ember Wilds | Lava Bloom | Multiple delayed circles damage player and enemies; enemies take the larger share. |
| Starfall Ruins | Rift Collapse | Nearby enemies are pulled toward a marked point before a burst. |

Hazards begin in Act II, use a minimum warning window, and stop during drafts/results.

## 8. Break and execution

- Boss Break is a run-local meter, not a saved Enemy schema field.
- Skill damage contributes more Break than basic damage; control/stagger effects receive a bounded bonus.
- Break cannot increase while the boss is already broken.
- On full Break, the boss receives the existing stagger/break state, a strong ring/pillar/burst recipe, and a short vulnerability marker.
- Damage during the window receives a modest multiplier applied by the existing combat damage route or a Rush-owned bounded modifier.
- Killing the boss during this window marks an execution for score and presentation.
- The implementation must not restore camera shake or hit stop.

## 9. Score and grades

Suggested score events:

| Event | Score |
|---|---:|
| Normal/fodder kill | 100 |
| Elite kill | 350 |
| Champion/boss kill | 2,000 |
| Encounter clear | 1,000 + time bonus |
| Multikill | 250 × extra kills |
| Break achieved | 750 |
| Break execution | 1,250 |
| Damage taken | bounded penalty |
| Hazard failure/timed-out encounter | bounded penalty |

Grade thresholds are data-authored and may be tuned after deterministic smoke runs. Grades are `S`, `A`, `B`, and `C`; a completed run always receives at least `C`.

## 10. Daily seed and deterministic variation

- A normal run uses a fresh local seed.
- Daily Rift derives a stable seed from the UTC date and a content version token.
- The seed controls zone, encounter order, mutation draft order, and trophy offers.
- It does not attempt to make physics or every random enemy roll bit-identical.
- Daily best score, grade, and class are stored separately from Hunt save data.

## 11. Trophy rewards

The result offers three deterministic choices:

- **Gold Cache** — immediate persistent gold.
- **Forge Sigil** — gold plus a stronger forge-oriented payout.
- **Skill Ember** — persistent skill point for the compatible Hunt hero save, when safe; otherwise converts to gold.
- **Hunter Mark** — record-only collectible plus gold.

The first implementation may ship a smaller safe pool, but the UI/data path must support three offers and one selection. Reward selection is idempotent per completed run.

## 12. UI requirements

### Title

- Add a prominent `Rift Rush` entry and a secondary `Daily Rift` entry.
- Keep Hunt, Defense, and Continue behavior unchanged.

### HUD

- Top-center timer, act label, encounter title, objective progress, and score.
- Boss Break meter near the existing boss health HUD.
- Hunt contract and boss-presence panels remain hidden in Rush.
- The in-combat forge remains preserved but is hidden in Rush to keep the run uninterrupted.

### Draft

- Two large choice cards with skill key/name, mutation name, concise summary, and `1`/`2` hints.
- Cards must fit narrow viewports and be pointer/touch accessible.

### Result

- Grade, score breakdown, clear time, peak chain, execution status, daily-best status.
- Three trophy cards, followed by Retry/Next/Title actions after selection.
- Failure uses the same result surface with a failure grade and retry option.

All player-facing copy remains English.

## 13. Architecture

### New modules

- `js/data/rushContent.js` — frozen configuration, encounter catalog, zone hazard catalog, score/grade/trophy data, deterministic helpers.
- `js/systems/RushSystem.js` — isolated run state machine, spawning, hazards, mutation draft, Break, scoring, rewards, serialization of Rush meta only.

### Existing integration points

- `Game` owns `rush`, routes mode updates/kills/death, starts/retries/ends runs, and keeps Hunt saves isolated.
- `UI` binds title/draft/result actions and renders Rush HUD state.
- `CombatSystem` reports successful boss damage to Rush for Break accounting and applies the bounded broken-vulnerability multiplier.
- `index.html` and `css/game.css` add static HUD/modal shells and responsive styling.
- `SaveManager` remains unchanged unless Rush meta cannot be safely kept in a dedicated local-storage key.

### Mode isolation invariants

- Hunt autosave is never written from a Rush frame.
- Temporary Rush levels, ranks, mutations, run mods, inventory changes, and position do not overwrite Hunt continuation state.
- Returning to title resets the temporary hero and all Rush-owned callbacks/hazards.
- Existing Hunt and Defense launch paths remain valid.

## 14. Performance and presentation constraints

- Reuse existing enemy models, themes, audio, and Effects pools.
- Avoid allocations in per-frame hazard paths where practical.
- Cap Rush living enemies below the global maximum.
- Use a Rush-only elevated arcade camera and an open arena origin so hazards and crowd silhouettes stay readable on narrow screens.
- Never add temporary lights for hits or hazards.
- Do not restore `Game.shake` or `Game.hitStop`.
- Maintain desktop and narrow viewport HUD readability.

## 15. Validation gates

1. `node tests/integrity.mjs`
2. Existing skill-combat and relevant HUD/layout tests.
3. Rush data/state unit test covering deterministic seed, grades, encounter selection, mutation draft uniqueness, and reward idempotence.
4. Browser smoke: launch every class into Rush, use all four actives, choose a mutation, reach/force boss, finish, choose reward, retry, return to title.
5. Daily run smoke: same UTC date produces the same zone/encounter/draft/trophy order.
6. Hunt/Defense regression smoke after a completed Rush.
7. Desktop and narrow viewport screenshots with no overlaps or console errors.

## 16. Completion definition

Rift Rush is complete only when the full loop can be played without reload, every item in the companion task list is checked with evidence, Hunt/Defense remain functional, the result reward cannot be claimed twice, and the validation gates pass.
