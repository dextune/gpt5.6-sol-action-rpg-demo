# Plan: Monster Variety Expansion (Hunt · Defense Waves)

**Status:** implemented (Phases 1–3 + light Phase 4/5 specials; deeper mesh GLBs optional later)  
**Goal:** Diversify **what** spawns in **Hunt** and **Defense (wave)** modes — more monster identities, combat roles, stat spreads, pack recipes, elite/champion modifiers, and readable visuals — without breaking the existing 6-zone scaffold or combat balance contracts.

**Scope modes**

| Mode | Spawn owner | Pool today | Notes |
|------|-------------|------------|--------|
| **Hunt** | `EnemySystem` continuous field + packs + zone bosses | `ZONE_SPAWNS` / `ZONE_BOSSES` from `ENEMY_TYPES` | Open-world density; despawn; contract bosses |
| **Defense** | `DefenseSystem.spawnWave` | Same `ZONE_SPAWNS` rotated by `DEFENSE_ZONE_ORDER` + mini-boss every N waves | Wave count, fodder/elite flags, mutators, level pressure |

Both modes **share** `ENEMY_TYPES` content. Diversity must land primarily in **data + AI + presentation**, with optional **composition recipes** so Defense feels like authored waves and Hunt feels like a living bestiary — not the same 6 faces forever.

---

## 1. Current inventory (baseline)

### 1.1 Content shape

- **6 zones** (`ZONES`): verdant → forest → canyon → frost → ember → astral.  
- **42 enemy rows** in `ENEMY_TYPES` (~6 normals + 1 boss per zone).  
- **22 body shapes** (procedural bake / GLB archetype map in `MonsterFactory` / `ModelFactory`).  
- Helper: `enemy(id, name, zone, shape, level, hp, damage, defense, speed, range, xp, options)`.  
- Pools auto-derived: `ZONE_SPAWNS`, `ZONE_BOSSES`.

### 1.2 Combat identity today

| Layer | What exists | Gap |
|-------|-------------|-----|
| **AI tags** | `melee`, `ranged`, `caster`, `charge`, `leap`, `pack`, `swarm`, `skirmish`, `tank`, `boss` | Few supports / debuffers / summoners; little “role vocabulary” in data |
| **Elite** | `shielded`, `enraged`, `volatile` (+ horns/halo mesh) | Small affix set vs ARPG champion packs |
| **Boss specials** | Per-boss `special` string → `CombatSystem.enemyBossSpecial` | Normals rarely have specials |
| **Fodder** | HP/dmg/xp mult + cheap anim | Visual same as full unit — only scale of threat differs |
| **Defense** | Zone band by wave, mutators every 3 waves, mini-boss cadence | No wave **composition** (tank wall + glass backline) authored |

### 1.3 Visual pipeline (must respect)

See [monster-visual.md](../monster-visual.md):

1. **GLB body** (`monster.{archetype}`) — primary path; recolor via `color` / `accent` / `scale`.  
2. **Procedural fallback** (`ModelFactory` builders) — form edits when GLB missing.  
3. **Elite ornaments** — `addEliteDetails` (horns, rune halo).  

**Implication:** Phase 1 variety can be **palette + scale + AI + stats + name** on existing shapes. Phase 2+ adds **new shapes / GLB detail / VFX recipes** for true silhouette novelty.

Integrity today expects ~6 normals + 1 boss per zone (validate after expanding counts).

---

## 2. Design research → principles

Drawing from ARPG bestiary practice (Diablo champion affixes, PoE rare mods, classic fantasy family design) and stylized game readability:

1. **Roles before reskins** — Each normal should answer: *blocker, rusher, glass damage, zoner, support, controller?*  
   Pure recolors of the same AI feel empty; roles create decisions (focus order, positioning).  
2. **Family + biome** — Players learn “this *looks* like a frost pack” via silhouette + palette; zones stay themed.  
3. **Champion/elite modifiers** multiply threat without exploding base type count (Diablo-style affixes).  
4. **Pack composition** > raw headcount — a wave of 12 identical melee is worse than 6 fodder + 2 tanks + 2 casters + 1 elite.  
5. **Silhouette first, material second** — New shapes when needed; otherwise exaggerated scale, appendages (horns/wings already partial), and FX telegraphs.  
6. **Hunt ≠ Defense pacing** — Hunt rewards exploration and zone identity; Defense rewards escalating **composition recipes** and mutators. Shared roster, different **mix rules**.  
7. **Fairness** — Do not auto-inflate hitboxes with mesh scale. Range/AI stay explicit on data.  
8. **Token budget** — Prefer data tables + small AI branches over per-monster bespoke systems until a special is proven fun.

---

## 3. Role taxonomy (content contract)

Add a **soft role** field for design and spawn recipes (optional runtime; can start as documentation-only then `role` on `enemy()`).

| Role id | Player-facing job | Typical stats bias | Typical AI | Wave use |
|---------|-------------------|--------------------|------------|----------|
| `fodder_swarm` | Fill screen, low threat | low HP/dmg, high weight, small scale | `swarm` / `pack` | Wave bulk |
| `frontline` | Soaks space, holds aggro lane | high HP/def, low–mid dmg, slow | `tank` / `melee` | Front wall |
| `bruiser` | Trades, medium threat | balanced | `melee` / `charge` | Mid pack |
| `rusher` | Closes gap, punish kiting | low def, high speed | `charge` / `skirmish` | Flank stress |
| `skirmisher` | Hit-and-run | mid HP, high speed | `skirmish` | Harassment |
| `glass_ranged` | High dmg, fragile | low HP, high dmg, long range | `ranged` | Priority target |
| `artillery` | Slow heavy projectile / cast | med HP, high range | `caster` | Backline |
| `controller` | Slow/root/expose telegraphs | med stats | new AI or special | Force movement |
| `support` | Buff allies / heal pulse (light) | low solo threat | new AI / aura | Break focus fire |
| `elite_champion` | Named pressure | mults + affix | any + elite | Spike wave |
| `mini_boss` | Defense cadence / Hunt event | boss-lite | `leap` / custom | Milestone |
| `zone_boss` | Zone apex | existing boss row | `boss` + `special` | Contract / every N |

**Stat template (relative to zone baseline level L)** — use when authoring new rows:

| Role | HP | Dmg | Def | Speed | Range | XP | Weight |
|------|----|-----|-----|-------|-------|-----|--------|
| fodder_swarm | 0.45–0.7× | 0.55–0.8× | 0–0.5× | 1.0–1.25× | short | 0.5–0.75× | 1.3–1.6 |
| frontline | 1.4–1.9× | 0.75–1.0× | 1.4–2.0× | 0.7–0.9× | short | 1.1–1.3× | 0.65–0.9 |
| bruiser | 1.0–1.2× | 1.0–1.15× | 0.9–1.1× | 0.95–1.1× | short | 1.0× | 1.0–1.15 |
| rusher | 0.75–1.0× | 1.05–1.25× | 0.4–0.8× | 1.2–1.45× | short | 1.0–1.15× | 1.0–1.25 |
| glass_ranged | 0.65–0.9× | 1.15–1.4× | 0.3–0.7× | 0.9–1.1× | long | 1.05–1.2× | 0.9–1.15 |
| artillery | 0.8–1.05× | 1.2–1.45× | 0.5–0.9× | 0.75–0.95× | longest | 1.15–1.35× | 0.7–0.9 |
| controller | 0.9–1.15× | 0.7–1.0× | 0.7–1.0× | 0.85–1.05× | mid–long | 1.1–1.25× | 0.75–0.95 |
| support | 0.85–1.1× | 0.5–0.8× | 0.6–0.9× | 0.9–1.05× | mid | 1.1–1.3× | 0.55–0.75 |
| mini_boss | 3.5–6× | 1.3–1.7× | 1.2–1.6× | 0.85–1.15× | varies | 4–8× | — (scripted) |
| zone_boss | existing curve | existing | existing | slow–mid | wide | high | boss |

Exact numbers stay authored per row; templates prevent “everything is a 200 HP melee.”

---

## 4. Target roster size

| Tier | Normals / zone | Bosses / zone | Total normals | Total bosses |
|------|----------------|---------------|---------------|--------------|
| **Now** | ~6 | 1 | ~36 | 6 |
| **Phase A (data)** | **10–12** | 1 | **60–72** | 6 |
| **Phase B (shapes + mini)** | 12–14 + 1 mini_boss flag | 1 apex | 72–84 | 6 (+ optional mini rows) |
| **Phase C (families)** | 14–16 with 2–3 “signature” silhouettes | 1 apex + optional hunt rare elite | 84–96 | 6–8 |

**Do not** double HP globally when adding types — **redistribute** spawn weights so denser rosters keep average DPS pressure stable.

---

## 5. Per-zone expansion bible

Each zone lists **existing** rows + **proposed new** entries (id, working name, shape reuse, role, visual brief, combat note).  
Shapes must exist in `SHAPE_ARCHETYPE` unless Phase B adds builders.

### 5.1 Verdant — Emerald Meadow (L1–14)

**Theme:** soft fauna, pollen spirits, bronze bugs, green raiders. Soft tutorial + first “oh no pack.”

| Status | id (proposed) | Name | Shape | Role | AI | Visual brief | Combat note |
|--------|---------------|------|-------|------|-----|--------------|-------------|
| exist | dew_blob | Dewdrop Jelly | blob | fodder_swarm | swarm | translucent mint jelly | Core filler |
| exist | horn_hopper | Hornbloom Hopper | hare | skirmisher | skirmish | olive hop, pale belly | Kite tutor |
| exist | brush_boar | Brush Boar | boar | bruiser | charge | mossy hide | First charge |
| exist | pollen_wisp | Pollen Wisp | wisp | glass_ranged | ranged | yellow pollen glow | First ranged |
| exist | leaf_raider | Leafmask Raider | raider | bruiser | melee | leaf mask, tabard | Humanoid intro |
| exist | shellback | Bronzeshell | beetle | frontline | tank | bronze carapace | Armor teach |
| exist | moss_crown | Mosscrown Colossus | colossus | zone_boss | boss | moss titan | roots |
| **new** | seed_mite | Seed Mite | beetle | fodder_swarm | swarm | tiny brown, scale ~0.55 | Ultra-fodder packs |
| **new** | clover_sprite | Clover Sprite | wisp | controller | ranged | green–white pulse, small | Slow projectile / soft slow special later |
| **new** | meadow_buck | Meadow Buck | stag | rusher | charge | light antlers, scale ~0.85 | Fast antler rush (not boss) |
| **new** | vine_sniper | Vinebow Scout | raider | glass_ranged | ranged | leaf cloak, bow pose tint | Longer range than pollen |
| **new** | hive_tender | Hive Tender | beetle | support | skirmish | amber abdomen glow | Future: nearby +def aura; ship as mid HP melee first |
| **new** | thorn_toad | Thorn Toad | blob | frontline | tank | spiky green mass, scale 1.15 | Slow, fat HP sponge |

**Hunt:** open meadows favor hoppers + mites in packs; shellback rare.  
**Defense early waves:** 70% fodder/skirmish, rare tank; no double artillery.

### 5.2 Forest — Whispering Grove (L8–24)

**Theme:** shadow predators, plant life, bark constructs, grove cultists.

| Status | id | Name | Shape | Role | AI | Visual | Note |
|--------|-----|------|-------|------|-----|--------|------|
| exist | dusk_wolf … ancient_stag | (6+boss) | … | … | … | … | Keep |
| **new** | spore_puff | Spore Puff | plant | fodder_swarm | swarm | pale spores, low sat | Dies into tint pop only (VFX later) |
| **new** | night_panther | Night Panther | panther | rusher | charge | near-black, green eye accent | Forest glass melee |
| **new** | mist_owlkin | Mist Owlkin | harpy | skirmisher | skirmish | grey-green wings | Dive kite |
| **new** | root_binder | Rootbinder | shaman | controller | caster | bark staff, emerald runes | Priority caster |
| **new** | sap_golem | Sap Golem | golem | frontline | tank | amber resin veins | Second tank silhouette vs bark_guard |
| **new** | grove_duelist | Grove Duelist | raider | bruiser | melee | dual-leaf blades accent | Elite-feeling normal |

### 5.3 Canyon — Sunscar Canyon (L15–32)

**Theme:** heat, chitin, bandits, stone giants, scorpion apex.

| Status | id | Name | Shape | Role | AI | Visual | Note |
|--------|-----|------|-------|------|-----|--------|------|
| exist | sand_crab … dune_tyrant | … | … | … | … | … | Keep |
| **new** | dust_mite | Dustmite Swarmling | beetle | fodder_swarm | swarm | sand-flecked, tiny | Fodder |
| **new** | sun_asp | Sun Asp | lizard | rusher | charge | striped ochre | Side-flank speed |
| **new** | cliff_archer | Cliff Archer | raider | glass_ranged | ranged | wrap cloth, warm metal | Backline |
| **new** | mirage_wisp | Mirage Wisp | wisp | controller | caster | heat-haze orange | Soft misdirect / delayed shot later |
| **new** | caravan_brute | Caravan Brute | cyclops | bruiser | leap | tattered wraps | Mid leap without cyclops rarity monopoly |
| **new** | dune_shield | Dune Shieldbearer | knight | frontline | tank | sand-plate, kite shield tint | Blocks lanes in Defense |

### 5.4 Frost — Frostcrown Plateau (L24–44)

**Theme:** ice fauna, crystal soldiers, cold spirits.

| Status | id | Name | Shape | Role | AI | Visual | Note |
|--------|-----|------|-------|------|-----|--------|------|
| exist | snow_hopper … avalanche_yak | … | … | … | … | … | Keep |
| **new** | rime_slime | Rime Slime | blob | fodder_swarm | swarm | pale cyan translucent | Cold fodder |
| **new** | ice_fox | Icefox Runner | hare | skirmisher | skirmish | white-blue fluff | Fast kite |
| **new** | shard_imp | Shard Imp | imp | glass_ranged | ranged | crystal wings | First frost imp reuse from ember shape |
| **new** | freeze_chanter | Freeze Chanter | shaman | artillery | caster | ice staff, slow cast | Heavy zap |
| **new** | frost_sentinel | Frost Sentinel | knight | frontline | tank | ice plate (diff from crystal_guard palette) | Dual knight ok if palette split |
| **new** | snow_wight | Snow Wight | raider | bruiser | melee | tattered frost rags | Mid melee |

### 5.5 Ember — Ember Wilds (L34–58)

**Theme:** coal imps, magma fauna, forge constructs, ash cult.

| Status | id | Name | Shape | Role | AI | Visual | Note |
|--------|-----|------|-------|------|-----|--------|------|
| exist | coal_imp … molten_colossus | … | … | … | … | … | Keep |
| **new** | cinder_mite | Cinder Mite | beetle | fodder_swarm | swarm | coal shell, ember cracks | Pack fuel |
| **new** | lava_hopper | Lava Hopper | hare | rusher | charge | soot + orange belly | Hot skirmish |
| **new** | ash_archer | Ashbow Raider | raider | glass_ranged | ranged | scorched mask | Backline |
| **new** | pyre_mender | Pyre Mender | shaman | support | caster | forge-orange runes | Support first as weak caster |
| **new** | slag_brute | Slag Brute | cyclops | bruiser | leap | slag armor plates | Heavy leap |
| **new** | spark_wisp | Spark Wisp | wisp | controller | ranged | electric-orange sparks | Zap kite |

### 5.6 Astral — Starfall Ruins (L48–78)

**Theme:** void jelly, prism spirits, rift beasts, starforged, eclipse apex.

| Status | id | Name | Shape | Role | AI | Visual | Note |
|--------|-----|------|-------|------|-----|--------|------|
| exist | void_blob … eclipse_drake | … | … | … | … | … | Keep |
| **new** | null_mite | Null Mite | beetle | fodder_swarm | swarm | purple-black chitin | Endgame fodder |
| **new** | phase_hare | Phase Hare | hare | skirmisher | skirmish | translucent violet | Teleport-feel via speed only at first |
| **new** | void_archer | Voidleaf Archer | raider | glass_ranged | ranged | star-thread cloak | Long poke |
| **new** | graviton_shaman | Graviton Shaman | shaman | controller | caster | orbiting rune tint | Pull-feel later |
| **new** | prism_guard | Prism Guard | golem | frontline | tank | faceted crystal body | Tank wall |
| **new** | rift_imp | Rift Imp | imp | artillery | caster | dual-tone void/pink | Heavy cast |

### 5.7 Naming rules (UI English)

- Player-facing names: **English**, evocative, biome-consistent (already project rule).  
- Ids: `snake_case`, unique, stable for save/analytics (no renames of existing ids).  
- Avoid lore dumps; short names like “Rime Slime”, “Dune Shieldbearer”.

---

## 6. Graphic detail plan

### 6.1 Phase A — high leverage, no rebake required

| Technique | Where | Effect |
|-----------|--------|--------|
| Distinct `color` / `accent` pairs | `ENEMY_TYPES` | Instant family splits |
| `scale` bands | 0.5 fodder → 1.3 elite normals | Read hierarchy |
| Elite ornaments | existing `addEliteDetails` | Champions pop |
| Name + HUD bar | Enemy label | Cognitive variety |

**Palette discipline:** each zone keeps a **hue family**; within zone, roles use **value/saturation** splits (tanks darker/desaturated, casters brighter emissive accents).

### 6.2 Phase B — mesh / form detail

| Work | Touch | Cost |
|------|-------|------|
| New `ModelFactory` builders (e.g. `toad`, `fox`, `owl`, `asp`) | `ModelFactory.js` + `SHAPE_ARCHETYPE` + bake if GLB path | Med |
| Per-shape ornament kits (spines, frills, antlers, shoulder pads) | `addEliteDetails` + optional normal ornaments | Med |
| Bake `monster.*` GLBs with more surface reads | `tools/assets/generate_assets.mjs` monsters section | High |
| Projectile mesh variants by family | `ProjectileMeshes` / combat enemy projectile | Low–med |
| Death / hit tint per family | Effects | Low |

**Do not** edit `vendor/`. Prefer generate_assets + ModelFactory.

### 6.3 Phase C — spectacle telegraphs

| Feature | Purpose |
|---------|---------|
| Role-colored ground foreshadow (charge lane, cast ring) | Fairness + identity |
| Support pulse ring (heal/buff) | Make supports readable |
| Elite affix VFX (shield bubble, enrage steam, volatile sparks) | Extend beyond mesh horns |
| Mini-boss intro flash (UI + outline priority) | Defense milestones |

Camera shake stays **off** (project rule).

### 6.4 Silhouette checklist (new types)

Before shipping a “new” monster that only reuses a shape:

- [ ] Scale differs ≥ ~12% from closest sibling in zone  
- [ ] Accent hue clearly different under cel shading  
- [ ] Role / AI differs from sibling  
- [ ] Name not a palette synonym of an existing row  
- [ ] Optional: elite-only ornament set for champions  

If three fail, **require a new shape or ornament kit**.

---

## 7. Elite / champion affix expansion

### 7.1 Current

`shielded` · `enraged` · `volatile`

### 7.2 Proposed affix table (implement incrementally)

| Affix | Player read | Combat | Visual | Unlock wave / level |
|-------|-------------|--------|--------|---------------------|
| shielded | Damage gated | Existing block charges | Halo brighter | early |
| enraged | Low HP berserk | Existing | Red emissive pulse | mid |
| volatile | Death nova | Existing | Sparks on body | mid |
| **hasted** | Fast | +speed, shorter attack CD | Motion trail / cyan rim | mid |
| **vampiric** | Lifesteal on hit | Small heal on damage dealt | Crimson mist | late |
| **frostbitten** | Slow aura | Nearby player speed mul | Ice particles | frost+ |
| **molten** | Burn trail | Leave fire patches (bounded) | Ember feet | ember+ |
| **summoning** | Calls 2 fodder once | One-shot spawn | Portal ring | late |
| **arcane** | Extra projectile | +1 missile | Purple orbits | astral+ |
| **fortified** | High def | +def, −speed | Stone crust | any tank elite |

**Rules**

- Max 1–2 affixes per elite (start with 1).  
- Defense mutators must not stack unfairly with the worst affix pairs (e.g. volatile + summoning needs caps).  
- Affix pick weighted by zone / wave band.

---

## 8. Hunt mode composition

### 8.1 Goals

- Zone feels like a **bestiary**, not a random bag of 6.  
- Packs have **internal roles** (alpha + minions).  
- Boss remains apex; optional **hunt rare elite** (named, 1 affix guaranteed) for spice.

### 8.2 Spawn recipe layers

| Layer | Description | Implementation sketch |
|-------|-------------|------------------------|
| **Ambient** | Weighted single spawns from `ZONE_SPAWNS` | Keep `EnemySystem.#spawnOne` |
| **Pack** | `spawnPack` uses **role-aware** picks: 1 frontline/bruiser + N fodder + 0–1 ranged | Extend pack picker in `EnemySystem.spawnPack` |
| **Pressure** | When livingCount low, prefer rushers | Existing soft logic + role bias |
| **Boss** | Zone boss / contracts | Unchanged ownership |
| **Rare elite** | Chance on ambient: elite + guaranteed affix + name prefix | Options on `spawn` |

### 8.3 Weight retune

When expanding to 10–12 normals:

- Fodder roles: high weight  
- Artillery / support: low weight  
- Cap simultaneous artillery living in Hunt (e.g. ≤3) if needed for fairness  

### 8.4 Hunt titles / UX (optional)

- Bestiary progress (kills per type) — **out of scope** unless requested.  
- Kill feed can show role color later — optional polish.

---

## 9. Defense wave composition

### 9.1 Goals

Waves should **teach then stress** role priority: kill glass → peel tanks → ignore pure fodder.

### 9.2 Wave recipe bands (example)

Assume `DEFENSE_ZONE_ORDER` still maps wave bands to zones.

| Wave band | Recipe name | Composition (relative) |
|-----------|-------------|------------------------|
| 1–3 | **Tutorial tide** | 80% fodder/skirmish, 20% bruiser |
| 4–6 | **Mixed patrol** | 50% fodder, 25% bruiser, 15% ranged, 10% tank |
| 7–9 | **Backline lesson** | 40% fodder, 20% tank, 25% glass_ranged, 15% rusher |
| 10–12 | **Artillery drill** | + artillery; elite chance up |
| 13–15 | **Support poke** | 1 support + tanks + glass (if support AI ready; else extra caster) |
| 16+ | **Chaos mix** | Full role table + dual elite chance soft cap |
| every miniBossEvery | **Champion crest** | Mini-boss row or scaled elite tank + pack |

### 9.3 Implementation options

| Option | Pros | Cons |
|--------|------|------|
| **A. Data recipes** `DEFENSE_WAVE_RECIPES[band] = [{role, countFrac}]` | Clear, tunable | New table |
| **B. Procedural role quotas** in `spawnWave` | Less data | Harder to author “set pieces” |
| **C. Hybrid** recipes for milestone waves, procedural fill | Best for demo | Medium code |

**Recommendation:** **C** — recipes for waves 1, 5, 10, 15, mini-boss; procedural role fill elsewhere using `role` on enemies.

### 9.4 Mutators vs roster

Mutators stay global modifiers; new monsters should **not** depend on mutators to feel different. Mutators amplify pressure after variety exists.

### 9.5 Soft-lock / performance

- Keep fodder flags on bulk.  
- Cap living count (existing).  
- Prefer low poly reuse; new shapes must stay stylized low-tri.  
- Defense never despawns wave-tagged enemies (already).

---

## 10. AI / special extensions (phased)

### 10.1 Phase A (reuse AI only)

All new monsters map to existing `Enemy.#combatAI` branches. No new AI required to ship roster growth.

### 10.2 Phase B (light specials on normals)

| Special | Who | Behavior (bounded) |
|---------|-----|---------------------|
| `slow_bolt` | controller casters | Projectile applies short slow |
| `aura_armor` | support | Allies in radius +def for T seconds (cap) |
| `split_fodder` | select blobs | On death spawn 0–2 mites (cap/wave) |
| `leap_slam` | already leap AI | Telegraphs only polish |

Wire through small handlers next to boss specials; **hard caps** on summons per wave.

### 10.3 Phase C (new AI modes) — only if needed

`support`, `controller`, `artillery_mortar` — only after Phase A/B prove content thin.

---

## 11. Data model changes

### 11.1 Extend `enemy()` options (recommended)

```js
// Proposed optional fields (defaults keep old rows valid)
{
  role: 'bruiser',           // taxonomy id
  family: 'verdant_fauna',   // optional group for packs / VFX
  tags: ['beast', 'organic'],
  eliteWeight: 1,            // relative chance to be rolled elite
  defenseWeight: 1,          // optional separate weight for Defense vs Hunt
  special: null,             // allow non-boss specials carefully
  miniBoss: false,           // Defense cadence / Hunt event
}
```

### 11.2 Integrity / tests updates

- Relax or replace “exactly 6 normals per zone” with **≥6 normals, exactly 1 apex boss**.  
- Validate every `shape` maps to archetype.  
- Validate `role` ∈ known set if present.  
- Validate Defense recipes only reference existing roles/ids.  
- `node tests/integrity.mjs` after each content batch.

### 11.3 Config knobs

- `HORDE_CONFIG` fodder mults may need slight retune when fodder types proliferate.  
- `DEFENSE_CONFIG` elite chance / count curves — retune after composition recipes so pressure stays fair.

---

## 12. Implementation phases

### Phase 0 — Plan (this document)

- [x] Write plan under `docs/history/`.  
- [x] Link from `docs/README.md` plan table.  

### Phase 1 — Data diversity (primary ship)

1. [x] Add `role` / `family` to `enemy()` + document in `content-data.md`.  
2. [x] Tag existing rows with roles.  
3. [x] Expand to **12 normals per zone** (existing shapes, palettes/scales/AI).  
4. [x] Retune `weight` for fodder vs artillery.  
5. [x] Integrity tests updated for pool sizes.  
6. Manual smoke still recommended in browser.

**Success:** Players see new names, silhouettes-via-scale, and mixed AI without balance spike.

### Phase 2 — Composition (Hunt + Defense)

1. [x] Role-aware `spawnPack` for Hunt (alpha + fodder + optional ranged).  
2. [x] Defense hybrid recipes via `defenseRecipeForWave` + role queue.  
3. [x] Elite notify labels for expanded affixes.  
4. Manual playtest kill-order still recommended.

### Phase 3 — Affix expansion

1. [x] Affixes: hasted, fortified, arcane, frostbitten, molten, vampiric, summoning (+ original 3).  
2. [x] Zone-filtered affix weights (`ELITE_AFFIXES.zones`).  
3. [x] Summon budget + defense mutator compatibility (no hard conflicts).

### Phase 4 — Graphic depth

1. [x] New procedural shapes: `toad`, `fox`, `owl`, `asp` (+ archetype map / SHAPE_SCALE).  
2. [x] Elite ornament kits (shoulders, backspikes, slime frill) in `addEliteDetails`.  
3. [x] Projectile style by zone/role/family in `CombatSystem.#enemyProjectileStyle`.  
4. [x] Docs + integrity shape count ≥26.

### Phase 5 — Light specials / support

1. [x] `slow_bolt` controllers + player slow; `aura_armor` support pulse (cap 6 allies).  
2. [x] `miniBoss: true` rows per zone + `ZONE_MINI_BOSSES`; Defense cadence alternates champion / apex.  
3. [x] Docs + integrity.

---

## 13. File touch map

| Concern | Files |
|---------|--------|
| Roster / stats / roles | `js/data/content.js` |
| Hunt spawn / packs | `js/systems/EnemySystem.js` |
| Defense waves | `js/systems/DefenseSystem.js` |
| AI / affixes / specials | `js/entities/Enemy.js`, `js/systems/CombatSystem.js` |
| Visuals | `js/characters/MonsterFactory.js`, `js/graphics/ModelFactory.js`, `js/graphics/Effects.js` |
| Tuning | `js/config.js` (`HORDE_CONFIG`, `DEFENSE_CONFIG`) |
| Bake | `tools/assets/generate_assets.mjs` (monsters), manifests |
| Validation | `tests/integrity.mjs` |
| Docs | `docs/content-data.md`, `docs/monster-visual.md`, this plan |

---

## 14. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Power creep from more casters | Weight caps; living artillery cap; recipes |
| Visual sameness (palette-only) | Silhouette checklist §6.4; Phase 4 shapes |
| Integrity hard-coded counts | Update tests with structural rules |
| Defense too hard early | Recipe bands 1–3 fodder-heavy |
| Performance with more living types | Fodder path, no new heavy materials, LOD reuse |
| Specials soft-lock waves | Summon caps; Defense wave clear rules unchanged |
| Save schema | No save fields required for enemy catalog |

---

## 15. Non-goals

- New zones / world geometry expansion.  
- Player-facing bestiary codex UI (unless requested later).  
- Full PoE-scale rare mod explosion.  
- Replacing procedural style with photoreal or third-party marketplace packs.  
- `vendor/` edits.  
- Auto-commit/push.  
- Camera shake / hit-stop re-enable.

---

## 16. Success criteria

1. Plan discoverable from `docs/README.md`.  
2. After Phase 1: **≥10 normals per zone**, distinct roles/palettes, integrity green.  
3. Hunt packs often mix ≥2 roles; Defense waves 5+ show tanks + backline glass.  
4. Elite fights remain readable (affix VFX optional Phase 3).  
5. No combat regression from “bigger meshes = longer range.”  
6. Docs (`content-data`, `monster-visual`) match shipped fields.

---

## 17. Suggested execution order

1. Phase 0 link README (with this file).  
2. Phase 1 content batch (all 6 zones) + integrity.  
3. Phase 2 composition for Defense + Hunt packs.  
4. Playtest → Phase 3 affixes if champions feel bland.  
5. Phase 4 shapes only for zones that still look “same blob family.”  
6. Phase 5 specials only if roles lack teeth.

---

## 18. Appendix — example new row (Phase 1 style)

```js
// Verdant fodder — reuses beetle shape, tiny scale, swarm AI
seed_mite: enemy('seed_mite', 'Seed Mite', 'verdant', 'beetle', 1, 28, 5, 0, 3.1, 1.2, 10, {
  color: 0x6a5a38, accent: 0xc9a86a, ai: 'swarm', weight: 1.55, scale: 0.52,
  role: 'fodder_swarm', family: 'verdant_chitin',
}),
```

```js
// Canyon frontline — knight shape, sand plate, tank AI
dune_shield: enemy('dune_shield', 'Dune Shieldbearer', 'canyon', 'knight', 21, 520, 34, 18, 2.55, 2.0, 190, {
  color: 0xb88955, accent: 0xffd27a, ai: 'tank', weight: 0.72, scale: 1.08,
  role: 'frontline', family: 'canyon_humanoid',
}),
```

(Use real hex ints when implementing; comments are illustrative.)

---

## 19. References (design inspiration)

- ARPG **champion affixes** as threat multipliers without infinite base types (Diablo-family design).  
- Role-oriented encounter building (frontline / glass / controller) from tactical RPG bestiary practice.  
- Stylized readability: strong silhouettes + limited material complexity for mobile-friendly WebGL.  
- Project-local: [content-data.md](../content-data.md), [monster-visual.md](../monster-visual.md), [history/defense-mode.md](./defense-mode.md), [history/horde-clear-roadmap/README.md](./horde-clear-roadmap/README.md).
