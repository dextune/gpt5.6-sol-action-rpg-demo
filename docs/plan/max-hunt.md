# MAX HUNT — Full Mode Conversion Plan

**Status:** implemented  
**Captured:** 2026-07-17  
**Implemented:** 2026-07-17  
**Language:** English (project docs policy)  
**Audience:** gameplay, systems, balance, UI, save, and validation implementers  

**One-line goal:** Replace the player-facing **New Hunt** entry with **MAX HUNT**, a persistent high-pressure Hunt that starts every selected class at a coherent level-70 combat baseline, immediately drives a large invasion into the village, removes the village's enemy-safe boundary, and still leaves meaningful progression through level 80, level 100, skills, weapon resonance, options, contracts, bosses, and uncapped character levels.

**Smallest playable loop:** select a class → start at the level-70 baseline → fight the perimeter invasion as it enters the village → auto-loot gold and XP → upgrade the weapon and skills beyond the baseline → survive, die and restart the invasion, or continue the saved Hunt.

---

## Document map

| Section | Contents |
|---------|----------|
| §1 | Product intent and player promise |
| §2 | Current implementation findings |
| §3 | Locked architecture decisions |
| §4 | Level-70 player baseline |
| §5 | Opening invasion timeline and population |
| §6 | Enemy levels, roster, pressure, and bosses |
| §7 | Village breach and contested spring |
| §8 | Progression and reward loop after the strong start |
| §9 | Lifecycle, death, respawn, Continue, and save migration |
| §10 | HUD, title, minimap, and player-facing copy |
| §11 | Data and code ownership by file |
| §12 | Delivery phases and merge gates |
| §13 | Automated and browser validation matrix |
| §14 | Balance and performance budgets |
| §15 | Risks and mitigations |
| §16 | Non-goals |
| §17 | Definition of done |
| §18 | First implementation actions |

**Related living guides:** [config-and-tuning.md](../config-and-tuning.md) · [content-data.md](../content-data.md) · [systems.md](../systems.md) · [world.md](../world.md) · [save-and-run.md](../save-and-run.md) · [ui-input.md](../ui-input.md) · [combat.md](../combat.md)

---

## 1. Product intent and player promise

### 1.1 Player promise

MAX HUNT is not a conventional level-1 campaign start and is not a temporary arena wave mode. It is the new player-facing Hunt start:

1. The selected class enters with the power and build completeness of an experienced level-70 hunter.
2. The opening screen transitions directly into a visible, multi-direction village invasion.
3. The village is no longer an invulnerable refuge. Normal enemies, ranged enemies, elites, and bosses can cross the camp perimeter and fight around the spring.
4. The opening character is extremely strong, but the enemies are numerous and above the player's level.
5. Growth remains meaningful. The player has not received level-100 Apex forms, the second mutation tier, a +30 weapon, maxed options, or maxed skill ranks.
6. The Hunt remains persistent and saveable. It is not discarded after one wave.

### 1.2 Desired feel

The first ten seconds should communicate all of the mode:

- The hero is immediately capable of deleting fodder packs.
- More enemies are already arriving from several directions.
- Auto-targeting and class weapon resonance trigger frequently enough to create short-form spectacle.
- Standing still is fatal.
- The village layout remains recognizable, but its safe status is visibly gone.
- The player can see the next upgrades immediately: level 80 mutations, level 100 Apex forms, skill ranks, and weapon tiers.

### 1.3 Why this remains Hunt rather than Defense

MAX HUNT must retain the existing Hunt loop:

- free world movement and zones;
- Hunt contracts and records;
- boss charge;
- kill streaks and 100-kill skill-point awards;
- automatic gold and XP collection;
- signature weapon enhancement;
- persistent Continue saves.

Defense remains its authored 200-wave mode and must not inherit MAX HUNT population, camp, reward, or save rules.

---

## 2. Current implementation findings

This plan is based on the current runtime rather than only the title-screen concept.

### 2.1 Current New Hunt start

`startNewGame` in `js/core/gameModes.js` currently:

1. clears the prior run;
2. sets `game.mode = 'hunt'`;
3. calls `Player.reset(classId)`, which creates a level-1 hero with a level-1 signature weapon, zero gold, empty skill ranks, and three potions;
4. resets `HuntSystem`;
5. enters `playing` state;
6. synchronously calls `EnemySystem.populate(HUNT_SPAWN_CONFIG.initialEnemies)`;
7. writes a Continue save immediately.

The existing title button is `#new-game-btn`. Its stable ID should remain unchanged even when its visible label changes to MAX HUNT.

### 2.2 Current population

The current Hunt targets are already horde-oriented:

| Field | Current value |
|-------|--------------:|
| Initial population | 64 |
| Base target | 72 |
| Global maximum | 108 |
| Sparse refill interval | 0.035 s |
| Steady refill interval | 0.14 s |

At level 70, the existing level target formula raises the desired population above 72, but it is still bound by the global cap and uses local-zone spawn rules.

### 2.3 Current zone-level clamp blocks the intended difficulty

The existing Hunt spawn level is adaptive, but `clampHuntSpawnLevel` caps the result to the current zone's maximum level plus a small slack value. Because the village sits in the early zone, a level-70 hero can still receive low-level village-area enemies.

MAX HUNT therefore needs a dedicated spawn-level policy. Raising only `Player.level` is not enough.

### 2.4 Current village safety is enforced in multiple places

The current safe hub is not one switch:

1. `Enemy.update` treats the player as safe while the player is inside the camp radius, preventing combat engagement.
2. `Enemy.#keepOutOfCamp` pushes each enemy back outside the perimeter every update.
3. `World.randomSpawnAround` rejects spawn positions inside the camp plus a margin.
4. `Player.#regenerate` grants fast HP and MP recovery inside the camp.
5. Boss spawning avoids placing a boss inside the camp.

MAX HUNT should remove the engagement and movement barriers, but keep perimeter spawning. Enemies should visibly invade the village rather than materialize on top of the spring.

### 2.5 Current high-level progression already provides the right continuation arc

The current skill system has:

- active-skill forms at levels 20, 60, and 100;
- mutation choices at levels 40 and 80;
- class Apex keystones at level 100;
- active skill ranks up to 10;
- four normal passives up to 10 and one final passive up to 5 per class;
- uncapped player-level stat growth;
- signature weapon enhancement to +30 and option enhancement to +20.

Starting at actual level 70 therefore integrates more cleanly than inventing a fake level-1 stat multiplier.

---

## 3. Locked architecture decisions

### 3.1 Preserve the internal `hunt` mode ID

The player-facing mode becomes MAX HUNT, but the internal high-level mode remains:

```js
game.mode = 'hunt';
```

`HuntSystem` owns a serialized ruleset discriminator:

```js
hunt.variant = 'max' | 'legacy';
hunt.isMax;
hunt.campSafe;
```

This avoids duplicating every `game.mode === 'hunt'` path in loot, kill feedback, minimap, UI, contracts, and bosses.

### 3.2 Keep old Continue saves safe

The public New Hunt action is replaced. Old saved Hunts are not silently converted into high-pressure level-70 Hunts.

- New run from the MAX HUNT button: `variant = 'max'`.
- Migrated version-5 Continue save: `variant = 'legacy'`.
- Starting MAX HUNT intentionally overwrites the current Hunt save, just as New Hunt does today.
- Loading a MAX HUNT save never reapplies the starting loadout or grants starting gold again.

### 3.3 Keep rules in frozen data

Generic numeric tuning belongs in a frozen `MAX_HUNT_CONFIG` in `js/config.js`. Class-specific build selections and invasion rosters belong in `js/data/content.js`.

Do not scatter start levels, enemy counts, rank values, or reward multipliers through lifecycle and UI modules.

### 3.4 Do not widen the template boundary

- No new `GameContext` key is required.
- Do not import Sol content into template-candidate modules.
- Systems continue to use existing `game.ctx` keys where available.
- No new combat `effect` ID is required.
- No changes to `vendor/`.
- No camera shake or hit stop reactivation.

### 3.5 Stable public hooks

- Keep `Game.newGame()` and `#new-game-btn` stable.
- Add new helpers behind the existing lifecycle facade.
- Keep `mode = 'defense'` behavior byte-for-byte isolated from MAX HUNT decisions.

---

## 4. Level-70 player baseline

### 4.1 Baseline table

| Component | MAX HUNT start | Remaining growth |
|-----------|---------------:|------------------|
| Player level | 70 | Level 80 mutation, level 100 Apex, uncapped stats |
| XP | 0 toward level 71 | Normal XP loop |
| Weapon enhancement | +20 / +30 | +25 and +30 resonance milestones remain |
| Weapon option enhancement | +12 / +20 | Eight deterministic option levels remain |
| Four active skills | rank 7 / 10 each | 12 total ranks remain |
| Four normal passives | rank 6 / 10 each | 16 total ranks remain |
| Final passive | rank 4 / 5 | One rank remains |
| Unspent skill points | 13 | Levels and 100-kill milestones add more |
| Level-40 mutations | class preset selected | Player may respec |
| Level-80 mutations | locked | Major near-term milestone |
| Level-100 forms / keystone | locked | Long-term milestone |
| Starting gold | 2,500G | Hunt, contracts, elites, bosses |
| Potions | 5 / 5 | Existing potion-drop rules |
| HP / MP | full | Normal combat and regeneration |

### 4.2 Skill-point accounting

A level-70 character has earned 69 level-up points after level 1. The default build uses 56:

- active skills: `4 × 7 = 28`;
- normal passives: `4 × 6 = 24`;
- final passive: `1 × 4 = 4`;
- spent total: `56`;
- remaining: `69 - 56 = 13`.

This preserves an internally coherent build rather than granting arbitrary ranks. Reaching approximately level 100 supplies enough level-up points to finish the remaining skill ranks even without 100-kill bonuses.

### 4.3 Class-specific level-40 presets

The start must be combat-ready without opening the Skills panel while enemies arrive. Store explicit choices per skill; never rely on object insertion order.

| Class | Preset identity | Selection rule |
|-------|-----------------|----------------|
| Knight | Pack Breaker | Wider gathers, wider lanes, broad impacts, distributed arsenal |
| Wizard | Cataclysm Lock | Wider auto-lock blasts, prisons, chain coverage, meteor field breadth |
| Rogue | Relentless Flurry | More direct cuts, pack reacquisition, multi-target knife pressure |
| Ranger | Seeking Volley | Split/seek paths, wider trap coverage, multi-target volleys and barrage |

The exact mutation IDs must be recorded in `MAX_HUNT_CLASS_PRESETS`. The player can respec through the existing mutation UI after starting.

### 4.4 Baseline application authority

Add a single `Player.applyMaxHuntBaseline()` path called only by a new MAX HUNT start. It should:

1. run after `Player.reset(classId)`;
2. set the actual player level to 70 before applying mutations;
3. set ranks only for the selected class's skill IDs and clamp them to each skill's `maxRank`;
4. apply explicit level-40 mutation selections through existing normalization/selection helpers;
5. set the signature weapon to +20 and rebuild it through `recomputeWeaponFromEnhance`;
6. advance weapon options deterministically to +12 without charging starting gold;
7. set skill points, gold, potions, HP, MP, and energy;
8. invalidate cached stats;
9. refresh the weapon visual once at the end.

Do not simulate 69 XP level-ups. That would fire level-up feedback, grant the wrong intermediate state, and complicate deterministic tests.

### 4.5 Starting strength is intentionally below maximum

At +20, the current weapon system already provides the fifth resonance tier, direct hit amplification, an execute ramp, evolved visuals, and class-specific bonus hits. Leaving +25 and +30 locked preserves two large spectacle upgrades.

Starting at +30 would contradict the mode's continuing-growth promise and remove the strongest short-form reward beats.

---

## 5. Opening invasion timeline and population

### 5.1 Proposed initial tuning

Add a frozen MAX HUNT population profile. Initial implementation targets:

| Parameter | Target |
|-----------|-------:|
| Perimeter sectors | 8 |
| Enemies per opening sector | 8 |
| T+0 opening population | 64 |
| T+3 surge population | at least 96 |
| Steady living target | 104 |
| Hard living cap | 128 |
| Extra cap buffer | 8 |
| Pack size | 6–10 |
| Spawn inner radius | 19 m |
| Spawn outer radius | 32 m |
| MAX HUNT aggro range | 64 m |
| Sparse refill interval | approximately 0.03–0.05 s |
| Steady refill interval | approximately 0.08–0.11 s |

These numbers are starting targets, not permission to bypass the performance gate in §14.

### 5.2 Opening sequence

1. Reset and apply the level-70 build.
2. Show the HUD and snap the camera.
3. Create eight evenly distributed perimeter origins around the village.
4. Fire one pooled ground-ring telegraph at each origin.
5. Spawn one eight-unit role-aware pack at each origin.
6. Mark the invasion as active and allow AI immediately; distance provides the natural approach time.
7. Over the next three seconds, add role-balanced packs until living population reaches 96.
8. Transition into the steady 104-enemy refill policy.

The existing initial population is already 64, so the new opening should not inherently add more synchronous model creation than the current New Hunt. The difference is spatial composition, immediate aggression, level policy, and the three-second surge.

### 5.3 Spawn outside; invade inside

Keep the camp exclusion in `World.randomSpawnAround`. MAX HUNT should not spawn enemies directly in the fountain or inside props.

The visible sequence should be:

> perimeter telegraph → clustered silhouettes appear → packs run through the village boundary → combat around the spring.

### 5.4 Dynamic cap authority

`GAME_CONFIG.maxEnemies` is currently read in several EnemySystem paths. MAX HUNT requires one internal authority such as:

```js
get activeEnemyCap() {
  return this.game.hunt?.isMax
    ? MAX_HUNT_CONFIG.maxEnemies
    : GAME_CONFIG.maxEnemies;
}
```

Use the same result in:

- steady refill;
- `populate`;
- `spawnPack`;
- `spawn`;
- room/cap-buffer calculations.

Missing even one hard-coded global-cap read would make the population targets inconsistent.

### 5.5 Respawn population

The death loop should remain punitive but not create an unavoidable spawn-kill chain.

| Stage | Target |
|-------|-------:|
| Immediate post-respawn population | 36 |
| Three-second recovery target | 64 |
| Eight-second recovery target | 80 |
| Return to steady target | after the player resumes combat |

The player receives the existing restore invulnerability, the village remains invadable, and the new perimeter wave approaches visibly.

---

## 6. Enemy levels, roster, pressure, and bosses

### 6.1 MAX HUNT level policy

Do not use the current local-zone max clamp for MAX HUNT invasion spawns.

Initial target at player level 70:

| Unit | Level target |
|------|--------------|
| Fodder | 76–80 |
| Normal / ranged | 78–84 |
| Elite | 82–86 |
| First boss | approximately 84–88 |

The general policy after level 70 should remain relative to the player:

- fodder: player level +4 to +10;
- normal: player level +6 to +12;
- elite: player level +10 to +16;
- bosses: authored boss base plus a bounded player-relative offset.

World-tier scaling remains authoritative in `Enemy`. At level 70, the existing Hunt formula produces World Tier 7, so avoid accidentally counting world tier twice in the spawn level itself.

### 6.2 Pure calculator

Put the level decision in a pure helper, for example:

```js
maxHuntSpawnLevel({ playerLevel, role, elite, boss, rngOffset })
```

The pure function must be testable without constructing Three.js meshes and must not read DOM or mutable global state.

### 6.3 Invasion roster

The village invasion cannot use only the early-zone roster. Add a curated, non-boss `MAX_HUNT_INVASION_ROSTER` that references existing enemy IDs and role weights.

Initial composition target:

| Role | Population share |
|------|-----------------:|
| Fodder swarm | 60–65% |
| Frontline / rusher | 15–20% |
| Ranged | 10–15% |
| Bruiser / support | 5–10% |

Rules:

- no bosses in ordinary packs;
- no elites in fodder packs;
- each opening sector contains a readable alpha silhouette;
- at least two opening sectors include a ranged unit;
- avoid stacking several support-control enemies in one pack;
- after the opening breach, use approximately 70% local-zone roster and 30% invasion roster so world travel still has zone identity.

### 6.4 Elite pressure

Suggested opening target:

- four elites distributed across separate sectors;
- hard live elite cap of 10;
- no two opening elites within the same small pack;
- retain existing affix presentation and labels;
- apply an elite spawn budget so horde kill speed cannot fill all elite slots at once.

### 6.5 Boss cadence

The current normal kill adds enough boss charge to summon a boss after roughly 43 ordinary kills. That is too fast for a 100-enemy field.

Suggested MAX HUNT charge values:

| Event | Charge |
|-------|-------:|
| Normal kill | approximately 1.3 |
| Elite kill | approximately 7 |
| Boss kill | reset |

Target the first boss near 70–80 effective kills. Maintain the existing single-active-boss guard.

Bosses should still spawn outside the camp and then be allowed to enter it. Do not spawn a large boss directly on the spring or inside decoration colliders.

### 6.6 Fairness under visual density

One hundred visible enemies must not mean one hundred simultaneous unavoidable attack commits.

First playtest target:

- no more than roughly 12–14 ordinary melee attack commitments at once;
- no more than roughly 5–6 overlapping ranged telegraphs;
- elites count as heavier pressure than fodder;
- bosses are exempt but must retain authored telegraphs;
- waiting enemies continue to flank, close distance, or reposition so the field remains visually alive.

If the existing AI naturally meets the survival targets in §14, do not add an attack-token subsystem. If it does not, add a bounded EnemySystem pressure budget rather than weakening the visible population.

---

## 7. Village breach and contested spring

### 7.1 Single ruleset predicate

Avoid independent magic checks in Player and Enemy. Expose one Hunt rule:

```js
game.hunt.campSafe
game.hunt.isMax
```

Expected modes:

| Runtime | Camp safe? | Enemy field spawn? |
|---------|------------|--------------------|
| MAX HUNT | No | Yes |
| Migrated legacy Hunt | Yes | Yes |
| Defense | No | Defense-owned waves |
| Title / loading | Not applicable | No |

### 7.2 Enemy engagement

In `Enemy.update`:

- legacy Hunt retains the current `playerSafe` behavior;
- MAX HUNT ignores player camp position when deciding engagement;
- Defense remains unchanged;
- MAX HUNT opening enemies use the larger invasion aggro distance so all eight perimeter sectors converge.

### 7.3 Boundary movement

Change `#keepOutOfCamp` to receive or derive the active ruleset. Skip its radial push only for MAX HUNT and Defense-compatible hostile modes.

All enemy categories must be covered:

- fodder;
- normal melee;
- ranged;
- elite;
- summoned units;
- bosses.

Do not special-case individual monster IDs.

### 7.4 World colliders remain active

Village decorations, the shrine, rocks, and other `World.colliders` still resolve enemy positions. The requested change is removal of the circular safe perimeter, not removal of physical collision.

Validate that simple enemy steering can navigate around the fountain and that crowd separation does not create a permanent ring jam at the former boundary.

### 7.5 Contested Spring

The spring remains a strategic resource rather than an invulnerability field.

Proposed rule:

| Condition | HP recovery | MP recovery |
|-----------|------------:|------------:|
| Legacy Hunt inside camp | existing 100% rate | existing 100% rate |
| MAX HUNT, no enemy within 12 m | existing 100% rate | existing 100% rate |
| MAX HUNT, enemy within 12 m | 25% of existing camp rate | existing 100% rate |

This lets the player fuel skill-heavy pack clearing without becoming immortal through full 6.5%-max-HP-per-second regeneration.

The HUD or zone ribbon should call the state `CONTESTED SPRING` while enemies are nearby.

### 7.6 Camp icon

The minimap's existing green camp ring implies safety. In MAX HUNT:

- use an amber/red ring;
- pulse when an enemy is within the camp radius;
- avoid drawing a permanent safe-zone disk;
- preserve the camp position marker for navigation.

---

## 8. Progression and reward loop after the strong start

### 8.1 Existing systems remain the backbone

MAX HUNT should continue to use:

- automatic gold pickup;
- XP gems / XP collection;
- Hunt threat reward multipliers;
- signature weapon enhancement;
- deterministic option enhancement;
- contracts;
- elite and boss rewards;
- 100-kill skill points;
- level 80 and 100 skill evolution.

Do not introduce a second inventory, a separate MAX currency, or disposable run-only gear in the first release.

### 8.2 Progression targets

Initial tuning targets:

| Reward beat | Desired time |
|-------------|-------------:|
| First option enhancement affordability | 30–60 seconds |
| First +21 weapon attempt | 60–90 seconds |
| Level 71 | 2–3 minutes |
| First 100-kill skill point | within the opening several minutes |
| Level 80 mutation | meaningful medium-term goal |
| +25 weapon resonance | medium-term spectacle goal |
| Level 100 / +30 weapon | long-term Hunt climax |

### 8.3 Initial reward multipliers

Start evaluation around:

| Reward | MAX HUNT multiplier |
|--------|--------------------:|
| XP | ×1.50 |
| Gold | ×1.35 |
| Contract reward | ×1.50 |
| Boss reward | ×1.40 |

These multiply or compose with existing threat and world-tier rules. Final values must come from simulation; do not blindly stack every multiplier if level 71 occurs in under one minute.

### 8.4 First contract

The opening contract is deterministic:

```text
VILLAGE BREACH
Defeat 60 invaders. The spring is no longer safe.
```

Suggested rewards:

- enough gold for a visible forge decision;
- one skill point or a meaningful XP burst, but not both if ordinary kill rewards already overperform;
- a dedicated completion notification and existing pooled level/contract effects.

After completion, the normal contract generator resumes with MAX-scaled targets and rewards.

### 8.5 No fake maximum

The UI should say `LV.70 POWER START`, not `MAX LEVEL`. The mode name describes the pressure and opening power fantasy, not an actual stat cap.

---

## 9. Lifecycle, death, Continue, and save migration

### 9.1 New MAX HUNT lifecycle

Conceptual order:

```js
clearRun(game);
game.mode = 'hunt';
game.defense.reset();
player.reset(classId);
player.applyMaxHuntBaseline();
game.hunt.reset({ variant: 'max' });
// camera / HUD / state
game.enemies.startMaxHuntInvasion();
game.saveGame(false);
```

The Hunt variant must be established before any spawn helper selects caps, rosters, camp rules, or enemy levels.

### 9.2 Continue lifecycle

Continue must:

1. load Player and Hunt state;
2. read `hunt.variant`;
3. never call `applyMaxHuntBaseline`;
4. for MAX HUNT, start a resume perimeter pressure profile rather than a full fresh reward grant;
5. for legacy Hunt, use the current population and camp-safe behavior;
6. save normalized version-6 data after successful entry.

Transient enemies are not serialized. Reconstructing a bounded perimeter population on Continue is consistent with the existing system.

### 9.3 Death and respawn

Keep the existing Hunt death loop:

- save the run on death;
- show the death overlay;
- apply the existing 4% gold repair cost;
- restore the same persistent player build;
- clear old enemies, combat schedules, XP gems, and kill-chain transient state;
- repopulate through the MAX HUNT respawn pressure profile;
- request another save.

Update player-facing copy from `Revived at hub` to language that does not imply safety, for example:

```text
Revived at the breached hub · Repair cost 120G
```

### 9.4 Save schema version 6

Add at minimum:

```js
hunt: {
  variant: 'max' | 'legacy',
  maxBaselineVersion: 1,
  // existing hunt fields
}
```

Do not serialize live enemy objects, spawn timers requiring exact wall-clock recovery, or Three.js values.

### 9.5 Version-5 migration

Migration policy:

- version 5 without `hunt.variant` → `legacy`;
- preserve class, level, skills, weapon, gold, kill records, contracts, and position;
- do not raise old characters to level 70;
- rewrite the normalized version-6 payload once;
- title Continue metadata identifies `Legacy Hunt` until the player starts MAX HUNT.

### 9.6 Duplicate-grant protection

The baseline is a new-run initializer, not a load migration. Tests must prove:

- refreshing after the first save does not add another 2,500G;
- Continue does not add ranks or option levels;
- death/respawn does not add ranks or option levels;
- calling save normalization repeatedly is idempotent;
- starting a new MAX HUNT intentionally resets and reapplies exactly one baseline.

---

## 10. HUD, title, minimap, and player-facing copy

All player-facing strings remain English per repository policy.

### 10.1 Title screen

Keep `#new-game-btn`; change visible content:

```text
MAX HUNT
LV.70 Power Start · Full-Map Invasion
```

Recommended class-card or nearby helper copy:

```text
Start with a complete Lv.70 combat build. The village is not safe.
```

The button should use a stronger danger accent than Continue and Defense without becoming larger than the existing aligned title controls.

### 10.2 Start notifications

Use a short stack that remains readable while the invasion begins:

1. `MAX HUNT STARTED · GARETH · LV.70`
2. `THE HUB IS NOT SAFE`
3. `VILLAGE BREACH · 60 INVADERS`

Do not display the current low-level recommended-zone tip during the opening breach.

### 10.3 HUD ribbon

Suggested presentation:

| Element | MAX HUNT content |
|---------|------------------|
| World tier | `MAX · WT 7` |
| Zone name | existing zone name |
| Zone subtitle in camp | `VILLAGE BREACH · 96 HOSTILES` |
| Hunter title | `MAX` badge plus existing Hunt title |
| Contract | opening breach progress, then normal contract |

Avoid adding a new permanent HUD panel if the zone ribbon and contract area can carry the information.

### 10.4 System panel

Replace assumptions that the hub rapidly and safely restores the player. Display:

- current Hunt variant;
- level and World Tier;
- living hostile count;
- total kills;
- breached/contested spring rule;
- Continue/save behavior.

Change `Resume Hunt` to `Resume MAX HUNT` only for MAX saves.

### 10.5 Continue metadata

Examples:

```text
MAX · Night Fang Lv.74 · 1,280 kills · 4m ago
Legacy Hunt · Arcane Adept Lv.32 · 410 kills · 2d ago
```

### 10.6 Death overlay

The mode remains persistent rather than won/lost after one breach. Death feedback should say the breach overran the hunter, then count down to the existing respawn action.

---

## 11. Data and code ownership by file

| File | Planned ownership |
|------|-------------------|
| `js/config.js` | `MAX_HUNT_CONFIG`: baseline numbers, population, level offsets, reward multipliers, camp contest, boss cadence |
| `js/data/content.js` | `MAX_HUNT_CLASS_PRESETS`, explicit mutation selections, curated invasion roster |
| `js/entities/Player.js` | `applyMaxHuntBaseline`, mode-aware contested spring regeneration, save/load compatibility fields if player-owned |
| `js/systems/LootSystem.js` | Reuse authoritative weapon/option rebuild helpers; add a pure bootstrap helper only if needed |
| `js/core/gameModes.js` | New start, Continue, death/respawn orchestration based on Hunt variant |
| `js/systems/HuntSystem.js` | Variant, breach contract, invasion phase, boss charge values, reward profile, serialize/load |
| `js/systems/huntThreat.js` | Pure MAX HUNT spawn-level and reward calculators where appropriate |
| `js/systems/EnemySystem.js` | Dynamic caps, opening sectors, surge refill, mixed roster, role budgets, respawn pressure |
| `js/entities/Enemy.js` | Camp engagement and boundary rules; no class or content policy |
| `js/core/SaveManager.js` | Version-6 normalization and migration |
| `index.html` | Stable button ID with MAX HUNT visible copy |
| `js/ui/panels/titleScreen.js` | MAX/Legacy Continue summary |
| `js/ui/panels/hudCombat.js` | MAX badge, ribbon, hostile count, contract feedback |
| `js/ui/panels/minimap.js` | Breached camp marker |
| `js/ui/panels/systemPanel.js` | Mode-aware save and spring copy |
| `css/game.css` | Danger accents and responsive MAX labels; no unrelated redesign |
| `tests/max-hunt.mjs` | Pure and system-level contract |
| `tests/max-hunt-visual-smoke.mjs` | Desktop/mobile live invasion verification |
| `tests/integrity.mjs` | Import the pure MAX HUNT regression suite |

### 11.1 Files that should not change

- `vendor/`;
- hero or monster GLBs;
- template-safe runtime constants;
- Defense content and authored wave tables unless a shared regression demands a compatibility-only fix;
- camera shake/hit-stop policy.

---

## 12. Delivery phases and merge gates

### Phase M0 — Data contract and pure baseline

Deliver:

- frozen `MAX_HUNT_CONFIG`;
- explicit class presets;
- pure spawn-level/population/reward helpers;
- documentation comments explaining double-scaling risks.

Gate:

- all four presets reference only legal class skills and legal mutation IDs;
- calculated skill-point accounting equals the level-70 budget;
- no runtime behavior changes yet;
- integrity green.

### Phase M1 — Player bootstrap

Deliver:

- deterministic `applyMaxHuntBaseline`;
- +20 weapon and +12 options through authoritative rebuild paths;
- level-40 mutations and full resource restore;
- baseline serialization.

Gate:

- all four classes start at level 70;
- all stats are finite and class-distinct;
- expected skill ranks and 13 unspent points are exact;
- level 71 XP progression still works;
- no baseline duplication after save/load.

### Phase M2 — Lifecycle and save migration

Deliver:

- player-facing New Hunt replacement;
- `hunt.variant` state;
- version-6 migration;
- MAX/Legacy Continue routing;
- mode-aware respawn entry.

Gate:

- a version-5 fixture loads as legacy without stat mutation;
- a new MAX save resumes as MAX;
- Defense meta survives migration;
- button and Game public method names remain stable.

### Phase M3 — Opening invasion and level policy

Deliver:

- eight-sector opening ring;
- three-second surge;
- dynamic cap authority;
- curated roster and role mix;
- MAX spawn-level helper that bypasses early-zone caps;
- MAX boss cadence.

Gate:

- T+0 = 64 opening enemies;
- T+3 reaches at least 96 in a deterministic simulation with room available;
- no spawn exceeds hard cap + buffer;
- village-zone enemies are level 78–84 at level 70;
- Defense wave spawning remains unchanged.

### Phase M4 — Village breach rules

Deliver:

- camp engagement enabled;
- camp radial push disabled for MAX only;
- contested spring;
- breached minimap marker;
- pathing/crowd fixes if the perimeter jams.

Gate:

- an untouched invasion enemy crosses inside the camp radius within six seconds in the browser smoke;
- the enemy can damage a player standing by the spring;
- legacy Hunt still blocks the same enemy;
- physical village colliders remain active.

### Phase M5 — Rewards, contract, and HUD

Deliver:

- deterministic opening breach contract;
- reward multipliers;
- title/HUD/system/death copy;
- MAX/Legacy Continue metadata;
- forge and progression visibility.

Gate:

- first contract completes and transitions to normal contracts;
- automatic loot continues under horde load;
- reward timing falls within §8 targets;
- desktop and mobile copy does not overflow.

### Phase M6 — Performance and balance hardening

Deliver:

- 60-second and 10-minute soak results;
- VFX/animation/UI reductions if required;
- optional attack pressure budget only if unavoidable damage fails the playable target;
- final numbers and docs synchronization.

Gate:

- all automated suites green;
- browser console and page errors empty;
- no enemy population leak across death/title/Continue;
- no continuously growing VFX or scheduled-combat collections;
- target frame budgets met on the test matrix.

---

## 13. Automated and browser validation matrix

### 13.1 `tests/max-hunt.mjs`

Add the test to `tests/integrity.mjs`. It should cover:

#### Player baseline

- exactly four playable classes covered;
- level 70, XP 0, full HP/MP;
- weapon +20, option +12;
- active ranks 7, normal passives 6, final passive 4;
- 13 unspent points;
- legal class-only ranks and mutations;
- class-specific stats differ as expected;
- level 71 still increases stats and awards one point.

#### Spawn policy

- opening sector count and population;
- T+3 target;
- steady target and hard cap;
- role-weight bounds;
- no bosses in ordinary packs;
- MAX village levels ignore the early-zone max;
- legacy levels still use zone clamp;
- world tier is applied exactly once.

#### Camp rules

- MAX returns `campSafe === false`;
- legacy returns `campSafe === true`;
- Defense stays hostile without inheriting MAX spawn rules;
- contested HP regeneration changes only while enemies are nearby;
- MP regeneration matches the chosen contract.

#### Save and lifecycle

- v5 → v6 legacy migration;
- new MAX serialization;
- Continue does not regrant baseline;
- respawn does not regrant baseline;
- normalization is idempotent;
- Defense metadata preserved.

#### Rewards

- MAX reward multiplier composes once;
- opening contract reward is bounded;
- boss charge reaches the intended range near 70–80 effective kills.

### 13.2 `tests/max-hunt-visual-smoke.mjs`

Run through `node server.mjs`; never use `file://`.

Desktop matrix:

- Knight, Wizard, Rogue, Ranger at 1440×900;
- select class and click the unchanged `#new-game-btn`;
- verify `state === 'playing'`, `mode === 'hunt'`, `hunt.variant === 'max'`;
- verify actual level, weapon, options, skills, and World Tier;
- verify initial living population and three-second surge;
- leave the player idle and observe an enemy cross the camp boundary;
- observe player damage inside the village;
- cast Q/E/R/C and one basic attack;
- verify at least one kill, automatic reward, and continued refill;
- save, return to title, Continue, and verify no duplicate grant.

Mobile matrix:

- at least one melee and one ranged class;
- phone portrait HUD and panel layout;
- MAX label and breach contract visible;
- touch movement, basic attack, and one skill;
- no horizontal overflow;
- no title/HUD/panel overlap;
- living count remains bounded.

### 13.3 Existing suites to rerun

```bash
node tests/integrity.mjs
node tests/import-integrity.mjs
node tests/hunt-balance.mjs
node tests/skill-combat.mjs
node tests/weapon-progression.mjs
node tests/class-mode-visual-smoke.mjs
node tests/max-hunt-visual-smoke.mjs
```

Update existing visual smoke copy expectations from New Hunt to MAX HUNT while keeping button selectors stable.

### 13.4 Manual gameplay checks

For each class:

1. Survive the first breach for at least 30 seconds using normal controls.
2. Confirm the class preset feels powerful without being fully maxed.
3. Confirm ranged auto-targeting remains useful in the dense village geometry.
4. Confirm elites remain readable among fodder.
5. Confirm the spring is useful but not a permanent tanking exploit.
6. Confirm a weapon or option upgrade becomes affordable on schedule.
7. Die once, respawn, and resume the pressure loop.
8. Save and Continue once.

---

## 14. Balance and performance budgets

### 14.1 Combat acceptance targets

| Metric | Initial target |
|--------|----------------|
| Fodder time-to-kill | 0.3–1.0 s |
| Normal time-to-kill | 1.5–4.0 s |
| Elite time-to-kill | 5–10 s |
| First boss time-to-kill | 15–30 s |
| Idle player death | under 8 s |
| Active first-breach survival | 30–60 s minimum |
| First level-up | 2–3 min |
| First weapon attempt | 60–90 s |

Evaluate medians across all four classes. Do not balance only around the Knight's survivability or Ranger's ranged clearance.

### 14.2 Population acceptance targets

- 64 enemies after opening initialization;
- at least 96 after three seconds;
- approximately 104 during steady play;
- never more than configured cap + explicit pack buffer;
- at least one invader inside the camp radius within six seconds while the player remains at the hub;
- no permanent crowd ring at the old camp boundary.

### 14.3 Frame targets

| Device/profile | Target |
|----------------|-------:|
| Desktop medium | 45 FPS or better during steady breach |
| Desktop high | 40 FPS or better with full effects |
| Phone profile | 30 FPS target |

CI should record frame-time diagnostics but should not hard-fail on exact headless FPS. Functional caps, console errors, allocation growth, and population leaks are deterministic merge gates.

### 14.4 Performance fallback order

If the steady breach misses the frame target:

1. reduce per-enemy ambient VFX and elite notification spam;
2. increase far-fodder animation skipping;
3. keep fodder health bars hidden except after hit;
4. coalesce repeated hit and loot text;
5. stagger reinforcement creation across frames;
6. reduce decorative telegraph particles while retaining ground rings;
7. only then reduce the 128 hard cap toward 112 and re-evaluate difficulty.

Do not first reduce the logical population on low graphics quality. Graphics quality should primarily change presentation, not the rules of the Hunt.

### 14.5 Resource-allocation constraints

- no new geometry/material/light creation per enemy update;
- reuse existing pooled Effects primitives;
- precompute invasion roster entries and sector directions;
- do not rebuild weighted role arrays every frame;
- dispose/clear enemy and scheduled combat state on death and title return;
- avoid a temporary PointLight for spawn or hit feedback.

---

## 15. Risks and mitigations

| Risk | Why it matters | Mitigation |
|------|----------------|------------|
| Double enemy scaling | Level offset plus WT7 can make every unit a sponge | Pure calculator tests; TTK matrix; apply world tier once |
| Village enemies remain weak | Early-zone clamp silently wins | MAX-specific level helper and explicit village test |
| Some enemies still cannot enter camp | Safety logic is split across engagement and radial push | Shared `campSafe` rule; test all control categories |
| Start loadout grants duplicate resources | Continue/respawn exploit | Apply baseline only on new start; idempotence tests |
| Old saves become unplayable | Low-level legacy hero loaded into MAX pressure | Version-5 migration defaults to legacy |
| Defense population changes | Shared EnemySystem hard cap edits leak | Mode-aware cap helper with Defense regression |
| Immediate 100-unit construction hitch | GLB clone and UI creation are synchronous | Keep initial 64; surge to 96 over three seconds |
| Visual horde becomes unavoidable damage | Too many simultaneous attacks | Validate first; add bounded attack pressure budget if needed |
| Spring creates immortality | Existing heal is 6.5% max HP/s | Contested rate at 25% while enemies are nearby |
| Boss spam | Existing boss charge assumes slower kill pace | MAX-specific 70–80-kill cadence |
| UI becomes noisy | Notifications, damage text, loot, elites overlap | Short start stack, coalescing, existing HUD surfaces |
| Mobile performance collapse | High actor and projectile density | Fodder LOD, effect budgets, staged reinforcements, soak test |
| Mutation preset mismatch | Object order or renamed IDs changes build | Explicit validated IDs in content data |

### Stop rules

Pause numerical escalation and fix structure when any of these occur:

- population exceeds cap after death/Continue;
- a MAX save receives baseline rewards twice;
- Defense loses wave enemies to Hunt despawn/cap logic;
- enemies remain stuck at the camp perimeter;
- all four classes cannot survive the first 30 seconds with active play;
- mobile repeatedly drops below playable input response even after presentation reductions.

---

## 16. Non-goals

This first MAX HUNT conversion does not include:

- a second new-game slot or multiple simultaneous Hunt saves;
- a new hero class;
- new monster GLBs or village assets;
- destruction of village buildings;
- NPC escort or village-defense health bars;
- a separate MAX currency;
- roguelike run-only gear;
- seasonal leaderboards or online services;
- a hard player-level cap;
- changes to Defense wave density;
- camera shake or hit-stop restoration;
- a full enemy navigation-mesh rewrite.

If village destruction, NPC defense, or infinite paragon progression becomes desired later, write separate plans after the core breach loop is stable.

---

## 17. Definition of done

MAX HUNT is complete only when all statements are true:

### Product

- The title presents MAX HUNT instead of New Hunt.
- Selecting any of the four classes starts an actual level-70 character.
- The character has the documented +20/+12 signature weapon and coherent rank allocation.
- The opening invasion visibly arrives from multiple directions.
- The village and spring are combat spaces, not safe boundaries.
- The player can continue progressing toward level 80, level 100, +25, +30, and max ranks.

### Combat and world

- At least 64 enemies exist at opening and at least 96 by T+3 under available cap.
- Village enemies at level 70 are in the intended high-level band rather than the early-zone band.
- Normal, ranged, elite, summoned, and boss units can cross the camp radius.
- The spring follows the contested rule.
- Death and respawn restart pressure without a spawn-kill loop.

### Save and isolation

- New MAX saves Continue as MAX.
- Version-5 saves Continue as legacy without stat mutation.
- No baseline duplicate grant is possible through save, reload, death, or title return.
- Defense starts, progresses, fails, and preserves meta exactly as before.

### UI

- MAX identity, World Tier, breach objective, and hostile count are readable.
- Desktop and mobile layouts do not overflow.
- The minimap no longer depicts the MAX camp as safe.
- All player-facing copy is English.

### Quality

- Full integrity and targeted suites pass.
- Browser console/page errors are empty.
- Performance targets are met or documented with an accepted fallback.
- No unbounded enemy, projectile, VFX, notification, or scheduled-action growth is observed in the soak run.

---

## 18. First implementation actions

When implementation is authorized, start in this exact order:

1. Add `MAX_HUNT_CONFIG` and pure tests without changing runtime behavior.
2. Add and validate four explicit class presets.
3. Implement `Player.applyMaxHuntBaseline` and its no-duplicate save fixture.
4. Add `HuntSystem.variant` and version-6 migration.
5. Route the existing new-game lifecycle into the MAX baseline while keeping IDs stable.
6. Add dynamic EnemySystem cap/level authorities before raising counts.
7. Build the eight-sector opening invasion.
8. Remove the camp engagement and radial barriers only under `hunt.isMax`.
9. Add the contested spring and breach HUD.
10. Tune rewards, boss cadence, attack pressure, and performance only after the full playable loop works.

Once implementation is integrity-green and product-accepted, move this document to `docs/history/` and update both plan indexes according to [plan/README.md](./README.md).
