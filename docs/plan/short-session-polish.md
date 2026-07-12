# Plan · Short-Session Content & Visual Polish

**Status:** implemented (Tier A–B; 2026-07-12 multi-agent pass)  
**Product goal:** Make the **existing** demo denser, clearer, and more fun for **15–40 minute** sessions — not a content-expansion roadmap.  
**Out of scope (long-term / Tier C):** new zones, full skill trees, story quests, music beds per biome, day/night, hub crafting, mouse aim, camera shake/hitStop, new hero classes, large monster roster growth.

**Related:** [skill-motion-spectacle.md](./skill-motion-spectacle.md) · [character-improvements.md](./character-improvements.md) · [ranger-class.md](./ranger-class.md) · [defense-mode.md](./defense-mode.md) · [../extension-playbooks.md](../extension-playbooks.md)

**Hard constraints (never break):**

| Rule | Detail |
|------|--------|
| Hunt / Defense isolation | No Defense run into Hunt continue blob |
| Keyboard combat facing | Skills aim with movement facing, not mouse |
| No CDN | `vendor/` Three only |
| English UI | Player-facing strings English |
| Docs English | This file and other `docs/` files |
| Validation | After content/combat/path changes: `node tests/integrity.mjs` |
| Scope discipline | Prefer **reuse** (recolor, remap, data tables, recipe layers) over new systems |

---

## 0. Design thesis (why this plan exists)

The demo already has:

- 4 classes with full kits + energy finishers  
- 6 biomes · 42 monsters · contracts · loot · Defense waves  
- Content-driven skills, projectile styles, quality LOD  

Players still bounce off **sameness**: recycled enemy bodies, cube loot, quiet statuses, thin contracts, weak rogue/ranger audio, Defense as “number goes up.”

**Target feeling after this plan:**

> Drop in → pick a class → one clear Hunt or Defense run → readable combat juice → gear that *looks* like gear → leave wanting one more run.

**Session targets:**

| Mode | Target length | Success criteria |
|------|---------------|------------------|
| Hunt | 15–25 min | 1–2 contracts, 1 boss gauge event, 2–4 gear upgrades |
| Defense | 10–20 min | Best-wave chase with 2–3 mutators felt; clear end summary |
| Title → play | &lt; 30 s | Class identity readable before New Hunt |

---

## 1. Non-goals (explicit)

Do **not** implement in this plan:

| Non-goal | Why |
|----------|-----|
| New zone / new boss roster bulk | Expands content surface; terrain shader cost |
| Full skill tree / respec | Schema + UI churn |
| Player debuff status from enemies (unless tiny) | Design + telegraph load |
| Re-enable shake / hitStop | Project policy |
| Story chapters / multi-map travel | Scope |
| Mocap / new skeleton | Bake pipeline risk |
| Class-locked entire loot economy beyond weapons | Armor/charm stay shared |
| Perfect Diablo-scale uniques | At most a **handful** of special items if Tier B allows |

---

## 2. Work packages overview

Two tiers only. Each package is shippable alone with its own DoD.

```text
Tier A — Quick juice (reuse systems, data + FX + SFX + UI)
  A1 Status readability
  A2 Class SFX banks (rogue / ranger focus)
  A3 Loot drop presentation
  A4 Contract juice (same 5 types, better staging)
  A5 Title class cards denser
  A6 Skill residual / recipe micro-pass (no new skills)

Tier B — Short-run depth (light systems on existing loops)
  B1 Monster silhouette remap (minimal new GLB or heavy re-kit)
  B2 Biome landmark density (reuse meshes)
  B3 Elite affix lite
  B4 Boss phase-2 for flagship bosses only
  B5 One “rank layer” per class (existing skills)
  B6 Defense mutators + end summary
  B7 Inventory equip compare (numbers only)
```

---

# Tier A — Quick juice

**Goal:** Higher perceived quality in hours–days without new gameplay systems.  
**Risk:** Low. Prefer content/`Effects`/`UI`/`audio` only.

---

## A1 · Status readability

### Problem
Burn / slow / bleed / expose exist in combat math but barely read in the field. Without shake/hitStop, **status is free juice**.

### Scope

| Status | Visual (required) | Optional |
|--------|-------------------|----------|
| `burn` | Persistent ember particles on body (rate limited), orange ground spark every tick | Soft orange material pulse already partial |
| `slow` | Foot ice ring refresh while slowed; cyan trail sparseness | — |
| `bleed` | Short crimson drip burst on tick (not only on hit) | — |
| `expose` (Hunter Mark) | **Head glyph** or floating mark above target for full duration | Gold rim pulse |

### Implementation notes

| File | Work |
|------|------|
| `js/entities/Enemy.js` | Strengthen status tick VFX; throttle with timers (`statusFxAcc`) |
| `js/graphics/Effects.js` | Optional tiny helpers: `statusBurnEmber`, `statusSlowRing`, `statusBleedDrip`, `statusExposeMark` |
| `js/systems/CombatSystem.js` | On apply expose, spawn mark once; refresh duration on re-apply |
| `js/ui/UI.js` (optional A1.b) | Boss/elite only: tiny status dots near name — skip if timeboxed |

### Data
No save schema change. Use existing status ids in `skillCombat.js`.

### DoD
- [ ] Slowed enemy has visible ice cue while `statuses.slow.remaining > 0`  
- [ ] Marked enemy has continuous expose cue until expiry  
- [ ] Burn/bleed ticks produce VFX without spamming pools (respect `qualityParticleMul`)  
- [ ] `node tests/integrity.mjs` green  

### Balance
**Presentation only** — no damage formula changes in A1.

---

## A2 · Class SFX banks (Rogue / Ranger)

### Problem
Knight/wizard themes map to dedicated banks; rogue/ranger often fall back to `skill_blade` / generic `skill`.

### Scope (minimal new samples)

Prefer **generate or remix** via existing `tools/audio/generate-combat-sfx.mjs` if present; else duplicate + pitch-edit is acceptable for demo.

| Bank id | Used by | Feel |
|---------|---------|------|
| `skill_bow` | Ranger pierce, vault volley, arrow storm | string + whoosh |
| `skill_trap` | Caltrop trap place/tick | metal snap / thorn |
| `skill_dagger` | Twin fang, fan of knives, death lotus | short steel clicks |
| `skill_shadow` (optional) | Shadowstep | soft whoosh (or reuse arcane quieter) |

### Implementation

| File | Work |
|------|------|
| `js/data/content.js` | Point ranger/rogue `SKILLS[*].sfx` to new banks |
| `assets/audio/combat/` | Add `skill_bow_0.wav`, `skill_trap_0.wav`, `skill_dagger_0.wav` |
| `assets/manifests/assets.json` | Register if audio is manifest-driven |
| Audio manager | Ensure banks resolve like existing `skill_fire` |

### DoD
- [ ] Ranger Q/E/R/C no longer use only `skill_blade` for all four  
- [ ] Rogue Q/E/C use dagger bank  
- [ ] Integrity / audio path checks if any exist  

### Non-goal
Full music, footstep layers, voice lines.

---

## A3 · Loot drop presentation

### Problem
World pickups are abstract primitives (`createLootMesh`: box sword, cylinder armor, octa charm). Undermines gear fantasy even when stats are fine.

### Scope (reuse equip assets)

| Slot | Approach |
|------|----------|
| Weapon | Prefer **clone** `weapon.${item.model}` at small scale on ground; fallback to stylized mesh if clone fails |
| Armor | Keep simple body plate **but** rarity-colored trim + taller beam for rare+ |
| Charm | Keep octa + ring; add rarity glow tiers |
| Consumable | Slightly more bottle/crystal read (already partial in `LootSystem.spawnConsumable`) |

### Implementation

| File | Work |
|------|------|
| `js/graphics/ModelFactory.js` | `createLootMesh(item)` — weapon path via `AssetManager` if available, else keep primitive |
| `js/systems/LootSystem.js` | Legendary: longer pillar + ground ring; epic: medium beam |
| `js/characters/CharacterFactory.js` | Only if weapon clone needs length/girth constants |

### Caveats
- Loot meshes must **dispose** cleanly on pickup (no leaked clones).  
- Mobile/low quality: skip heavy outline on ground loot.

### DoD
- [ ] Sword drop reads as blade, staff as staff, bow as bow when model exists  
- [ ] Legendary still unmistakable (audio + pillar)  
- [ ] No console errors on 20 rapid pickups  

### Non-goal
3D inventory previews, set items.

---

## A4 · Contract juice (no new contract types required)

### Problem
Five types exist (`kills`, `zone`, `elite`, `streak`, `boss`) but feel like a silent counter.

### Product rules for short sessions
- Always **one active contract** (already).  
- Completion must feel like a **mini-payoff** (notify + float + reward tier readable).  
- Prefer **tuning + copy + UI**, not a quest graph.

### Scope

| Change | Detail |
|--------|--------|
| Reward preview | Contract card / HUD line shows estimated gold tier or “Rare+ gear chance” text |
| Type weights | Early levels: more `kills`/`zone`; mid: `elite`/`streak`; late: `boss` slightly higher |
| Zone contracts | Always name the zone in label (already partial) — ensure English clarity |
| Complete FX | Small pillar/ring at player + distinct notify color (contract theme) |
| Optional A4.b | Second-line description on hunt panel only (not new types) |

### Implementation

| File | Work |
|------|------|
| `js/systems/HuntSystem.js` | Weight table by player level / worldTier; richer `label`/`description` |
| `js/systems/LootSystem.js` | `grantContractReward` — slightly better floor by tier (tuning only) |
| `js/ui/UI.js` | Contract HUD: progress + short reward hint |
| `js/data/content.js` | Optional `CONTRACT_REWARD_HINTS` freeze table |

### DoD
- [ ] Completing a contract always shows a clear English payoff notify  
- [ ] HUD shows progress and one reward hint line  
- [ ] No new save fields  

### Non-goal
Multi-stage contracts, lore boards, map pins.

---

## A5 · Title class cards denser

### Problem
Class cards are name + one-line blurb; kits are invisible until in-run.

### Scope (no 3D showcase — that is long-term)

Per card add:

- Class accent border (reuse look palette hex)  
- Energy resource name if any (`Rage` / `Focus` / none for wizard)  
- Four skill **names** in micro text (Q/E/R/C) — not full descriptions  
- Attack style tag: `Melee` / `Magic` / `Ranged`

### Implementation

| File | Work |
|------|------|
| `index.html` | Optional static structure OR keep data-driven fill from UI |
| `js/ui/UI.js` | On construct / showTitle: fill skill names from `getClassActiveSkills` |
| `css/game.css` | Compact 4-col cards; skill list 9–10px; no layout break on mobile 2×2 |

### DoD
- [ ] Each of 4 classes shows energy (if any) + 4 skill names  
- [ ] Mobile 2×2 still usable  
- [ ] No Korean UI strings  

### Non-goal
3D orbit preview, trailer video, class lore paragraphs.

---

## A6 · Skill residual / recipe micro-pass

### Problem
Recipes exist but residual ground presence is short; some ultimates still read as “ring spam.”

### Scope (existing skills only — no new skill ids)

| Class | Touch | Recipe intent |
|-------|-------|----------------|
| Knight | Crescent residual scar | Longer `groundDecal` trail along wave path |
| Wizard | Frost nova floor | Ice decal lasts 1.5–2s; optional second slow tick **only if already designed** — prefer VFX-only residual |
| Rogue | Bleed readability | Tie A1 bleed ticks to fang recipes (no formula change) |
| Ranger | Trap field | Clearer thorn ring pulses per tick; mark glyph larger |

### Implementation

| File | Work |
|------|------|
| `js/graphics/Effects.js` | Adjust life/opacity/decal size in existing recipes |
| `js/systems/CombatSystem.js` | Only if trap tick needs extra pulse VFX call |
| `js/data/fxThemes.js` | Optional contrast tweaks for hunt/venom themes |

### DoD
- [ ] Side-by-side: residual fields last long enough to read after cast  
- [ ] Quality low still within pools (no new unbounded particles)  
- [ ] Skill combat integrity still green  

### Non-goal
New skills, full rewrite of starburst/meteor structure (B5 handles layered ranks).

---

# Tier B — Short-run depth

**Goal:** Slightly deeper runs using **small systems** on existing loops.  
**Risk:** Medium. Each package must stay removable.

---

## B1 · Monster silhouette remap (minimal content)

### Problem
Many `shape` keys share ~6 GLBs → late zones feel recycled.

### Scope discipline
- Prefer **remap + palette + scale + accessory kits** over 10 new monsters.  
- At most **1–2 new GLB archetypes** if bake time allows (e.g. true quadruped wolf, flying wing).  
- **Do not** add a 7th zone.

### Work options (pick one track)

**Track B1-a (no new GLB — preferred first):**

| Action | Detail |
|--------|--------|
| Accessory kits | Horns, wings, shoulder plates as runtime groups in `MonsterFactory` by shape family |
| Scale bands | Elite/boss already scale; give mid-tier types distinct height |
| Emissive accents | Zone-matched glow (ember eyes, frost core) |
| Remap table | Document which content shapes share which GLB and why |

**Track B1-b (1–2 new GLBs):**

| New key | Replaces feel for |
|---------|-------------------|
| `wolf` true mesh | forest/frost pack hunters |
| `flyer` | harpy / wisp-adjacent air units |

Bake via existing monster pipeline in `generate_assets.mjs`.

### Implementation

| File | Work |
|------|------|
| `js/characters/MonsterFactory.js` | `SHAPE_ARCHETYPE` remap; optional kits |
| `js/graphics/ModelFactory.js` | Fallback builders if new shape |
| `assets/manifests/assets.json` | New model keys if B1-b |
| `tests/integrity.mjs` | Model builder list if required |

### DoD
- [ ] Player can distinguish at least 3 body silhouettes per two adjacent zones without reading names  
- [ ] Integrity green  
- [ ] No new enemy **types** required (reuse ids)  

---

## B2 · Biome landmark density (reuse meshes)

### Problem
Forest/verdant rely on trees; crystals only at sparse coords; mid-map bland.

### Scope
- **No new zone centers.**  
- Scatter existing rock/tree/ruin/crystal with zone rules.  
- 4–8 extra landmark clusters per biome max (performance).

### Implementation

| File | Work |
|------|------|
| `js/world/BiomeDecorator.js` | Data table of cluster recipes per zone id |
| `js/config.js` or content | Optional `LANDMARK_CLUSTERS` freeze if pure data preferred |
| Quality | Respect decoration density multipliers |

### DoD
- [ ] Each of 6 zones has at least one **memorable landmark cluster** near center  
- [ ] Low quality still playable (fewer instances)  

### Non-goal
New prop GLB packs (unless a single reused rock stack trick suffices).

---

## B3 · Elite affix lite

### Problem
Elites are gold aura + drop bias only.

### Scope (3 affixes max)

| Affix id | Gameplay | Visual |
|----------|----------|--------|
| `shielded` | Temporary damage reduction until broken by N hits or % max HP damage | Blue shell ring |
| `enraged` | +damage after 50% HP | Red pulse + slightly faster attack cooldown |
| `volatile` | On death small AoE chip (telegraphed 0.4s) | Orange radius |

### Rules
- One affix per elite (random from table).  
- Bosses: **no** random affix (keep specials).  
- Defense and Hunt both use the table.  
- Numbers in `content.js` or `config.js` freeze table.

### Implementation

| File | Work |
|------|------|
| `js/data/content.js` | `ELITE_AFFIXES` table |
| `js/entities/Enemy.js` | Affix state, modify damage taken / on death |
| `js/systems/EnemySystem.js` | Roll affix on elite spawn |
| `js/systems/CombatSystem.js` | Volatile death explosion if not pure Enemy-side |
| `js/ui/UI.js` | Optional notify “Elite · Enraged” once |

### DoD
- [ ] Elite fights feel different within 5 seconds of contact  
- [ ] Volatile never one-shots from full HP on normal difficulty (cap damage)  
- [ ] Save schema unchanged (affixes not persisted — elites are ephemeral)  

### Non-goal
Rare elite champions, affix stacking, UI codex.

---

## B4 · Boss phase-2 (flagship only)

### Problem
Bosses have one `special` pattern; fights are short and single-note.

### Scope
Only **three** bosses (one early / mid / late), not all six:

| Zone boss | Phase-2 trigger | Behavior |
|-----------|-----------------|----------|
| Early (e.g. Mosscrown) | HP ≤ 50% | Faster special cooldown + add 1 add spawn **or** denser roots |
| Mid (e.g. Dune Tyrant) | HP ≤ 50% | Second sandstorm ring pattern |
| Late (e.g. Molten Colossus) | HP ≤ 40% | Inferno rings denser + brief enrage |

### Implementation

| File | Work |
|------|------|
| `js/entities/Enemy.js` or boss AI | `phase` flag when HP crosses threshold; once |
| `js/systems/CombatSystem.js` | Branch specials if needed |
| `js/data/content.js` | Optional `phase2` block on those three enemy rows only |
| Notify | One English line: “The beast grows desperate…” |

### DoD
- [ ] Each of the 3 bosses telegraphs phase change clearly once  
- [ ] Fight length still fits short session (not raid-long)  
- [ ] Other 3 bosses unchanged  

### Non-goal
Full raid mechanics, multi-platform arenas.

---

## B5 · One rank-layer per class (existing skills)

### Problem
Ranks mostly scale mults; little “new toy” at mid ranks.

### Scope — **exactly one layer per class**, using existing skill ids

| Class | Skill | Layer (at rank ≥ 3 **or** unlockLevel-gated rank) |
|-------|-------|-----------------------------------------------------|
| Knight | `crescent` | Residual damage zone (tiny DoT or second weak hit 0.4s later) along path |
| Wizard | `frost_nova` | Chill stacks: 2 stacks → brief **stronger slow** (not full root unless easy) |
| Rogue | `twin_fang` | Rank 3+: third micro-stab **or** bleed duration +30% |
| Ranger | `hunter_mark` | Re-cast on marked target detonates mark for bonus damage |

### Implementation rules
- All numbers in `SKILLS.*.combat` arrays; handlers read via `skillCombatAtRank`.  
- Update `rankText` / `description` to match.  
- No new skill keys on HUD.  
- Tests: skill-combat still validates handlers.

### DoD
- [ ] Each class has one mid-rank moment that changes **behavior**, not only DPS%  
- [ ] rankText accurate  
- [ ] integrity + skill-combat green  

### Non-goal
Full talent tree, item skill modifiers.

---

## B6 · Defense mutators + end summary

### Problem
Defense is clean FSM but meta is only best wave.

### Scope

**Mutators** (rotate every 3 waves starting wave 3):

| Id | Effect | Player-facing name |
|----|--------|--------------------|
| `swift` | Enemies +move / -attack CD slightly | Swift Tide |
| `armored` | Enemies +defense | Iron Tide |
| `frenzy` | More elites chance | Frenzy Tide |
| `scarce` | Potion drops disabled this wave band | Scarce Tide |

Show current mutator on Defense HUD panel.

**End summary** (death / fail already returns to title):
- Wave reached, kills, best wave, mutators seen  
- English notify already partial — extend death screen copy via `UI.showDeath` / post-fail notify  

### Implementation

| File | Work |
|------|------|
| `js/systems/DefenseSystem.js` | Mutator table, apply on spawnWave scaling |
| `js/ui/UI.js` | HUD line for mutator; death summary lines |
| `js/core/Game.js` | Optional pass summary fields into UI on `#endDefenseRun` |
| Meta save | Still only bestWave/runs — **no** full run blob |

### DoD
- [ ] Player can name the mutator mid-run from HUD  
- [ ] Death summary mentions wave + best  
- [ ] Hunt continue unaffected  

### Non-goal
Defense-only progression unlocks, cosmetics.

---

## B7 · Inventory equip compare

### Problem
Hard to know if a drop is an upgrade in a short run.

### Scope
When rendering item card for unequipped gear of same slot:

- Show **delta** vs currently equipped: `Power +12`, `Crit +1%`, etc.  
- Green for positive, muted for negative.  
- Weapons: still respect class equip rules (illegal = Wrong class).

### Implementation

| File | Work |
|------|------|
| `js/ui/UI.js` | `#itemStats` or `#itemCard` compare helper |
| CSS | `.stat-up` / `.stat-down` |

### DoD
- [ ] Comparing a better bow on ranger shows positive power delta  
- [ ] No equip of illegal weapons  

### Non-goal
DPS simulator, build planner.

---

## 3. Suggested implementation order (dependency-aware)

```text
Week-shaped order (adjust to taste):

1. A1 Status readability          ─┐
2. A2 SFX banks                   ├─ parallel OK
3. A5 Title cards                 ─┘
4. A3 Loot meshes
5. A4 Contract juice
6. A6 Recipe residuals
7. B7 Inventory compare           (quick after A3)
8. B6 Defense mutators
9. B3 Elite affix lite
10. B5 Rank layers (one class at a time if needed)
11. B2 Landmarks
12. B1 Silhouette remap
13. B4 Boss phase-2 (after B3 calm)
```

Parallelism: A1/A2/A5 can ship in one PR or three micro-PRs.  
B packages should be **separate commits** for easy revert.

---

## 4. PR split recommendation

| PR | Packages | Validate |
|----|----------|----------|
| PR-A1 | A1 | integrity + manual burn/slow/mark |
| PR-A2 | A2 | audio paths + integrity |
| PR-A3 | A3 | loot pickup spam |
| PR-A4 | A4 | contract complete once |
| PR-A5 | A5 | title 4 classes + mobile |
| PR-A6 | A6 | skill cast residuals |
| PR-B7 | B7 | inventory compare |
| PR-B6 | B6 | Defense to wave 6+ |
| PR-B3 | B3 | elite spawn all affixes |
| PR-B5 | B5 | each class rank ≥ 3 skill |
| PR-B2 | B2 | fly each zone center |
| PR-B1 | B1 | visual smoke classes + zones |
| PR-B4 | B4 | three bosses to phase 2 |

---

## 5. Acceptance — whole plan “done enough”

Short-session polish is **accepted** when:

1. A new player can complete a Hunt contract and **feel** the reward.  
2. Statuses and marks are visible in a busy fight.  
3. Drops look like their weapon type for the active class.  
4. Defense runs show a mutator and a clear death summary.  
5. Elites are not pure gold paint.  
6. Each class has one mid-rank behavior layer.  
7. `node tests/integrity.mjs` passes.  
8. Hunt continue + Defense meta isolation still hold.  

Not required for acceptance: new zones, music, skill trees, 3D title showcase.

---

## 6. Tuning budget (keep runs short)

| Knob | Guidance |
|------|----------|
| Contract target counts | Prefer 8–20 kills, not 50+ early |
| Boss charge fill | Unchanged unless playtest says too slow |
| Defense prep | Keep ~3s; mutator text must fit HUD |
| Elite affix power | ±10–20% feel, not double HP walls |
| Volatile death AoE | Cap ≤ 12–15% player max HP equivalent |
| Rank layers | Noticeable but not mandatory for clear |

---

## 7. File ownership map

| Area | Primary paths |
|------|----------------|
| Data | `js/data/content.js`, `fxThemes.js`, `skillCombat.js`, `js/config.js` |
| Combat / VFX | `js/systems/CombatSystem.js`, `js/graphics/Effects.js`, `ProjectileMeshes.js` |
| Entities | `js/entities/Enemy.js`, `Player.js` |
| Loop | `HuntSystem.js`, `DefenseSystem.js`, `LootSystem.js`, `EnemySystem.js` |
| World | `BiomeDecorator.js`, `TerrainSystem.js` (B2 only if needed) |
| Characters | `MonsterFactory.js`, `CharacterFactory.js`, `ModelFactory.js` |
| UI | `js/ui/UI.js`, `index.html`, `css/game.css` |
| Audio | `AudioManager` path, `assets/audio/combat/`, tools audio generator |
| Assets | `assets/manifests/assets.json`, hero/monster/prop GLBs only if B1-b |
| Tests | `tests/integrity.mjs`, `tests/skill-combat.mjs` |

---

## 8. Agent execution checklist (copy when implementing a package)

1. Read **this package section only** + linked hard constraints.  
2. Prefer data/Effects/UI before new systems.  
3. Keep player UI English.  
4. Do not touch `vendor/`.  
5. Do not re-enable shake/hitStop.  
6. Run `node tests/integrity.mjs`.  
7. Manual smoke: one Hunt contract + one Defense death + one illegal weapon still blocked.  
8. Commit only when asked; include assets if any were baked.  

---

## 9. Tracking table

| ID | Package | Status |
|----|---------|--------|
| A1 | Status readability | done |
| A2 | Class SFX banks | done |
| A3 | Loot presentation | done |
| A4 | Contract juice | done |
| A5 | Title class cards | done |
| A6 | Recipe residuals | done |
| B1 | Monster silhouette | done (B1-a remap/scale/kits) |
| B2 | Biome landmarks | done |
| B3 | Elite affix lite | done |
| B4 | Boss phase-2 | done (3 flagship bosses) |
| B5 | Rank layers | done |
| B6 | Defense mutators | done |
| B7 | Inventory compare | done |

---

## 10. One-sentence summary for stakeholders

**Deepen juice, readability, and short-run variety on the systems you already have — no sprawling content map — so a single Hunt or Defense session feels complete and replayable.**
