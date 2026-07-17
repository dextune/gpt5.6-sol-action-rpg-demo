# Plan: Hunt On-Level Loop

**Status:** shipped (2026-07-16) — Waves 1–4 implemented; living guides updated  
**Mode scope:** Hunt only (Defense isolation preserved)  
**UI language:** English  
**Camera:** no shake / hitStop  

---

## 1. Problem statement

New Hunt currently asks the player to **self-navigate a continuous open field** without enough *power-band literacy*. Reported pain:

1. **Where do I hunt?** — Level-appropriate zones are not obvious during play.
2. **What is this enemy?** — Monster level is invisible; only HP bars exist.
3. **Instant death** — Walking into a high band feels like a soft-lock death, not a readable challenge.
4. **Boredom** — Time is spent walking and guessing more than fighting on-level packs.

This plan fixes Hunt **readability + fairness + guidance**, then lightly densifies the *on-level* loop. It does **not** turn Hunt into Defense waves.

---

## 2. Current game research (codebase facts)

Researched against the live Sol Hunt stack (`EnemySystem`, `HuntSystem`, `Enemy`, HUD, minimap, `ZONES`).

### 2.1 World bands already exist

| Zone id | Name | Band (`minLevel`–`maxLevel`) | Non-boss base levels | Boss |
|---------|------|------------------------------|----------------------|------|
| `verdant` | Emerald Meadow | 1–14 | 1–10 | Mosscrown Colossus |
| `forest` | Whispering Grove | 8–24 | 8–18 | Ancient Stag Lord |
| `canyon` | Sunscar Canyon | 15–32 | 15–25 | Dune Tyrant |
| `frost` | Frostcrown Plateau | 24–44 | 24–36 | Avalanche Yak |
| `ember` | Ember Wilds | 34–58 | 34–46 | Molten Colossus |
| `astral` | Starfall Ruins | 48–78 | 48–62 | Eclipse Drake |

Source: `js/data/content.js` → `ZONES`, `ENEMY_TYPES`, `ZONE_BOSSES`.

Bands **overlap** (e.g. forest starts at 8 while verdant max is 14). That is good for progression bridges, but only if the player can *see* the bridge.

### 2.2 Spawn formula (Hunt)

`EnemySystem.#spawnOne` / pack path (simplified):

```
position = random ring around player (spawnInner 18 … spawnOuter 46)
zone     = world.zoneAt(position)
type     = weighted ZONE_SPAWNS[zone]
levelFloor = max(type.level, zone.minLevel)
adaptive   = player.level + randInt(-3, 2) + (worldTier - 1) * 2
level      = max(levelFloor, adaptive)
```

Implications:

- **Inside a low band:** monsters mostly track the player (adaptive wins) → fights stay roughly on-level.
- **Inside a high band:** `zone.minLevel` / high `type.level` **floors** difficulty → underleveled entry is lethal.
- There is **no clamp** to `zone.maxLevel`.
- Boss spawn uses `max(data.level, player.level + 2 + tier bias)` in the current zone.

Spawn density config (`GAME_CONFIG`): target 60 / max 90, despawn 78, camp safe radius 15. Horde pack/fodder exists (`HORDE_CONFIG`) but does not solve *which band* to visit.

### 2.3 Combat scaling (why one-shots happen)

`Enemy` constructor:

- `extraLevels = max(-4, enemy.level - data.level)`
- HP ≈ `data.hp * (1 + extraLevels * 0.092) * tierScale * elite…`
- Damage ≈ `data.damage * (1 + extraLevels * 0.055) * sqrt(tierScale) * elite…`

Player receive path (`Player.takeDamage`):

```
amount = max(1, round(raw - defense * defenseSoak))
```

There is **no level-gap softcap**. A large positive `(enemy.level − player.level)` only increases raw damage; defense soak does not scale with gap. Combined with zone floors, underleveled astral/ember entry is effectively “one mistake = death.”

### 2.4 Information surfaces today

| Surface | What it shows | Gap |
|---------|---------------|-----|
| Zone toast (`UI.zoneEntered`) | Name + subtitle + `Recommended Lv.min–max` | ~3.7s, easy to miss |
| Zone ribbon HUD | `WORLD TIER N` · zone name · poetic subtitle | **No level band, no danger vs player** |
| Enemy billboard | HP bar (boss/elite always; others situational) | **No monster level** |
| Minimap | Zone discs (current slightly brighter), enemy dots, camp ring | **No relative danger color** |
| Contracts (`HuntSystem`) | kills / zone / elite / streak / boss | Zone contract uses *current* zone, not *recommended* band |
| Hunt start notify | Flavor only | No “hunt here” tip |

### 2.5 What Hunt already does well

- Continuous open field (not empty instanced corridors).
- World tier ladder (`1 + floor((level−1)/10)`).
- Boss presence gauge + zone-mapped alphas.
- Contracts as lightweight bounties.
- Pack/fodder density infrastructure (horde-clear history).
- Clear split from Defense (wave climb / encounters).

### 2.6 Root-cause summary

| Symptom | Primary cause |
|---------|----------------|
| Don’t know where to go | Band data exists; **persistent UX does not surface it** |
| Don’t know enemy power | Level is computed but **never rendered** |
| One-shot deaths | Zone floors + **linear damage scale + no gap DR** |
| Boring wander | Guidance weak; reward does not bias **on-level** play |

---

## 3. Industry research — famous-game patterns

Patterns below are **design patterns** used by well-known live-service / ARPG / MMO titles, mapped to Sol’s constraints (browser demo, Hunt open field, no new modes).

### 3.1 Pattern catalog

| Pattern | What players learn | Famous examples |
|---------|-------------------|-----------------|
| **A. Zone level bands** | “This region is for levels X–Y.” | *World of Warcraft* zone charts; classic MMO zone plating |
| **B. Persistent danger readout** | Current area vs my power is always visible | WoW zone map / quest log colors; *Diablo IV* map / WT context; *Monster Hunter* quest rank stars |
| **C. Enemy level / threat mark** | This unit is safe / yellow / skull | WoW nameplate level + skull for large gaps; many MMOs; early D4 showed monster levels |
| **D. Hybrid scale + floor** | Content tracks you *until* a region floor | *Diablo IV*: player-relative scaling with area/content floors and World Tiers |
| **E. Underlevel XP / reward bias** | Farming greys is inefficient; on-level is optimal | *Path of Exile* map/area XP penalty vs character level; WoW grey/green/yellow/orange quest XP |
| **F. Overlevel soft fairness** | You can enter hard content but don’t hard-brick | *Destiny* power-delta damage resistance curves; modern ARPGs often blunt pure one-shots when far under |
| **G. Soft guidance / bounties** | “Do this next, here” without a railroad | D4 Whispers / bounties; *Monster Hunter* Investigations; Destiny bounties |
| **H. Map threat tint / icons** | Glance-read the world | WoW minimap quest marks; MH wildlife map + scoutfly danger color (green → red) |
| **I. Optional high-risk high-reward** | Hard areas stay meaningful | PoE map tiers; D4 Helltide / strongholds; WT climb |
| **J. Separate short-form challenge mode** | Open world ≠ all challenge density | D4 Nightmare Dungeons / pits vs open world; Sol already has **Defense** |

### 3.2 What famous games *avoid* for open-world hunt loops

- **Silent lethal bands** with no UI (classic hardcore trap; modern titles almost always telegraph).
- **Full free roam with zero on-level bias** and no XP penalty (players waste hours in wrong content).
- **Hard walls only** (“you cannot enter”) without readable alternatives — used sparingly (story gates), not for every high band.
- **Collapsing open world into pure instance** when the fantasy is hunting grounds (Sol Hunt should stay open field).

---

## 4. Intersection: our recommendation × industry

Recommended Sol philosophy (from prior design pass):

> **Open entry + always-readable power + receive-damage softcap + on-level reward bias + guided contracts.**  
> Keep zone identity (floors). Do **not** fully normalize every zone to player level.

| Our proposal | Industry cousins | Intersection verdict |
|--------------|------------------|----------------------|
| Persistent HUD: `Recommended Lv.X–Y` + On-level / Danger | **A + B** (WoW, D4, MH rank) | **Ship** — highest ROI, lowest risk |
| Minimap zone tint by relative danger | **H** (map threat colors) | **Ship** — cheap, glanceable |
| Enemy level on billboard + color / ! for gap | **C** (WoW nameplates / skulls) | **Ship** |
| Keep zone `minLevel` floors; clamp toward `maxLevel` slack | **D** (D4 floors + scale) | **Ship** — matches current adaptive+floor hybrid |
| Receive damage softcap by `(enemy.level − player.level)` | **F** (Destiny-style delta DR) | **Ship** — primary anti-one-shot tool |
| Do **not** fully scale high zones down to player | Avoids D4 “world feels flat” complaints when scaling is total | **Ship** — floors stay |
| On-level XP/gold multiplier; mild underlevel penalty | **E** (PoE XP efficiency, WoW colors) | **Ship** (light numbers) |
| `guided` / recommended-zone contract | **G** (bounties / investigations) | **Ship** — extends existing contracts |
| Optional Danger zone reward bump | **I** (high-risk high-reward) | **Wave 4** — after fairness |
| Field events near player | D4 open-world events / whispers density | **Wave 4 optional** |
| Hard zone entry gates | Some story games | **Reject** for Hunt (feels bad in a small continuous map) |
| Always-on-level spawn everywhere | Full open-world scaling | **Reject** as sole solution (kills zone ladder) |
| Replace Hunt with Defense-style waves | Instanced climb | **Reject** — Defense already owns this (**J**) |

### 4.1 Locked product philosophy

1. **World remains a ladder** of six bands (identity + boss per zone).  
2. **Literacy first** — players always know zone band and unit threat.  
3. **Mistakes are survivable** — underleveled entry hurts and warns; it does not pure one-shot full HP from a single trash hit.  
4. **On-level is the smart default** — guided contract + reward bias.  
5. **Challenge remains voluntary** — Danger/Lethal zones still hit hard *after* softcap; bosses stay special.  
6. **Defense stays the short-form thrill climb** — Hunt does not absorb wave FSM / mutators.

---

## 5. Danger model (shared constants)

Introduce frozen thresholds (suggested home: `HUNT_THREAT_CONFIG` in `js/config.js`):

```
gap = zone.minLevel - player.level   // zone threat vs player
// or for units: enemy.level - player.level

Safe        : gap <= -4
OnLevel     : -3 <= gap <= 3
Challenging : 4 <= gap <= 7
Danger      : 8 <= gap <= 11
Lethal      : gap >= 12
```

English labels for HUD (player-facing):

| State | Label | Color intent |
|-------|-------|--------------|
| Safe | `Safe` | Cool green / muted |
| OnLevel | `On-level` | Bright green |
| Challenging | `Challenging` | Gold |
| Danger | `Danger` | Orange |
| Lethal | `Lethal` | Red |

Unit nameplate uses the **enemy gap**, not zone gap.

---

## 6. Implementation waves

### Wave 1 — Literacy (P0)

**Goal:** Player always knows where power sits.

| ID | Change | Files (primary) |
|----|--------|-----------------|
| W1.1 | Zone ribbon subtitle: `Lv.{min}–{max} · {Threat}` | `hudCombat.js`, CSS tokens |
| W1.2 | Zone toast: include `Your Lv.N` + threat word | `UI.js` |
| W1.3 | Minimap zone fill alpha/stroke by threat vs player | `minimap.js` |
| W1.4 | Enemy level digit on health billboard; orange/red/! by unit gap | `Enemy.js` / monster factory health UI |
| W1.5 | Hunt start + optional contract hint: recommended zone name + band | `gameModes.js`, `HuntSystem` helper |

**Acceptance**

- At any moment in Hunt, player can answer “is this zone OK for me?” without opening a panel.
- Walking verdant → forest → canyon shows threat label changes without combat.
- Elite/boss always show level; fodder shows when bar is visible.

**Industry intersection:** A, B, C, H.

---

### Wave 2 — Fairness (P0–P1)

**Goal:** Underleveled entry is a *retreat decision*, not a loading-screen death.

| ID | Change | Files |
|----|--------|-------|
| W2.1 | **Receive damage softcap** by unit level gap (after defense soak or on raw—pick one site and document) | `CombatSystem._damagePlayer` and/or `Player.takeDamage` |
| W2.2 | Spawn level clamp: `clamp(raw, zone.minLevel, zone.maxLevel + slack)` with small slack (e.g. 2–4) | `EnemySystem` |
| W2.3 | Boss spawn respects zone band + softcap path (no free “boss instagib” for underlevel) | `EnemySystem.spawnBoss` + W2.1 |
| W2.4 | Lethal entry notify once per zone visit: `This hunting ground far exceeds your level.` | `World` zone-change hook / `UI.zoneEntered` |

**Suggested softcap shape (tunable table, not magic hardcode only):**

| Unit gap | Incoming damage multiplier (example) |
|----------|--------------------------------------|
| ≤ 0 | 1.00 |
| +4 | 0.90 |
| +8 | 0.70 |
| +12 | 0.50 |
| +18 | 0.35 (floor ~0.30) |

Still painful; multi-hit and elites remain scary. Softcap applies to **player receive** only (enemy HP can stay hard so overlevel farming is slow).

**Acceptance**

- Level 10 hero standing in frost/ember takes heavy chip but does not routinely die to a single normal melee from full HP.
- On-level verdant/forest feel unchanged (gap ≤ 3 → mul ≈ 1).
- Zone ladder still “feels harder” as minLevel rises.

**Industry intersection:** D, F (not full normalize).

---

### Wave 3 — Guidance (P1)

**Goal:** Stop aimless wandering for on-level targets.

| ID | Change | Files |
|----|--------|-------|
| W3.1 | Helper `recommendedZoneId(playerLevel)` from `ZONES` bands (best fit / lowest Danger) | `HuntSystem` or small `huntThreat.js` |
| W3.2 | New contract type `guided` (weight high while level &lt; ~40): kill N in recommended zone | `HuntSystem.#makeContract` / `#pickContractType` |
| W3.3 | Contract label English: `On-level hunt · {Zone} · {N}` | content strings in HuntSystem |
| W3.4 | Optional light compass: contract zone center direction on minimap (dot or chevron) when `guided` / `zone` | `minimap.js` |
| W3.5 | Nearby pack pressure: if living count low in On-level zone, bias pack spawn (reuse horde path) | `EnemySystem` |

**Acceptance**

- Fresh Hunt run within 30s receives a contract or tip pointing at a fitting band.
- Completing guided contract does not require astral when player is level 12.
- Empty-field time in on-level band drops (subjective; track via playtest).

**Industry intersection:** G, H (+ existing Sol contracts).

---

### Wave 4 — Loop reward density (P1–P2)

**Goal:** On-level play feels *smart and busy*; Danger play feels *optional greed*.

| ID | Change | Notes |
|----|--------|-------|
| W4.1 | On-level kill XP/gold mul ~1.10–1.20 | When unit/zone threat is On-level |
| W4.2 | Mild underlevel mul ~0.75–0.85 XP when Safe (greys) | PoE/WoW-style efficiency, not a ban |
| W4.3 | Danger/Lethal kill gold/XP bump after softcap | Pays for voluntary risk |
| W4.4 | Optional field mark every 45–75s: elite pack ping near player in On-level zones | Keep rare; don’t spam Defense encounters |
| W4.5 | Contract weight polish: fewer pure “any kills” when a clear band exists | Reduces boredom |

**Acceptance**

- Optimal early progression path is recommended band, not greys, not suicide astral.
- Danger farming is a conscious greed choice.

**Industry intersection:** E, I, light open-world events.

---

## 7. Explicit non-goals

| Out of scope | Why |
|--------------|-----|
| Defense FSM / mutators / hazards in Hunt | Mode isolation (**J**) |
| Full per-tile player level normalize | Flattens zone ladder (D4 fatigue case) |
| Hard zone entry walls | Small continuous map; literacy + softcap enough |
| Camera shake / hitStop | Project lock |
| New game modes / Rush revival | Product surface is Hunt \| Defense only |
| Save version bump unless serializing new hunt fields | Prefer derived threat; no save need for W1–W2 |
| Vendor / GLB art pass for nameplates | Use existing billboard stack |

---

## 8. Tuning tables (implement as frozen config)

```js
// js/config.js — illustrative
export const HUNT_THREAT_CONFIG = Object.freeze({
  safeMaxGap: -4,
  onLevelMaxGap: 3,
  challengeMaxGap: 7,
  dangerMaxGap: 11,
  // lethal: above dangerMaxGap
  spawnMaxSlack: 3,
  receiveGapMul: Object.freeze([
    // [minGap, multiplier] ascending; interpolate or step
    Object.freeze({ gap: 0, mul: 1 }),
    Object.freeze({ gap: 4, mul: 0.9 }),
    Object.freeze({ gap: 8, mul: 0.7 }),
    Object.freeze({ gap: 12, mul: 0.5 }),
    Object.freeze({ gap: 18, mul: 0.35 }),
  ]),
  onLevelRewardMul: 1.15,
  underLevelRewardMul: 0.8,
  dangerRewardMul: 1.2,
});
```

Exact numbers are playtest knobs; structure is the contract.

---

## 9. File map

| Layer | Paths |
|-------|-------|
| Constants | `js/config.js` (`HUNT_THREAT_CONFIG`) |
| Pure helpers (optional) | `js/systems/huntThreat.js` — gap, label, recommended zone, spawn clamp |
| Spawn | `js/systems/EnemySystem.js` |
| Contracts / tips | `js/systems/HuntSystem.js` |
| Mode start tip | `js/core/gameModes.js` |
| Receive DR | `js/systems/CombatSystem.js`, `js/entities/Player.js` |
| Nameplate level | `js/entities/Enemy.js` (+ factory health group if needed) |
| HUD | `js/ui/panels/hudCombat.js`, `js/ui/UI.js` |
| Minimap | `js/ui/panels/minimap.js` |
| CSS | `css/game.css` (threat color tokens) |
| Docs after ship | `docs/systems.md`, `docs/ui-input.md`, `docs/quick-edit-recipes.md` |

Template boundary: keep game data/systems on Sol side; no template imports of `content` changes beyond existing patterns.

---

## 10. Validation

1. `node tests/integrity.mjs` after config/HUD/content/path edits.  
2. Manual Hunt checklist:
   - Level 1–5: verdant On-level; forest Challenging/Danger readable; no silent lethal.
   - Cross each zone boundary: toast + ribbon + minimap color agree.
   - Nameplates: level digits + color at gap thresholds.
   - Underlevel ember: chip damage, retreat possible, potion use meaningful.
   - On-level pack: damage feel unchanged vs pre-change baseline.
   - Guided contract points to fitting zone.
3. Defense smoke: start Defense → waves/HUD unchanged; no Hunt threat CSS leakage breaking Defense ribbon (Defense branch already overrides subtitle).
4. Optional unit tests: pure `threatFromGap(gap)` and `recommendedZoneId(level)` if extracted.

---

## 11. Rollout order (recommended)

```
W1 Literacy  →  W2 Fairness  →  W3 Guidance  →  W4 Reward density
     │               │                │
   playtest        playtest        playtest
```

**MVP if time-boxed to one session:** W1.1 + W1.4 + W2.1 + W3.1 tip string.  
That alone removes “blind one-shot wander” for most sessions.

---

## 12. Success metrics (qualitative + simple)

| Metric | Before (research) | Target after W1–W3 |
|--------|-------------------|--------------------|
| Time-to-understand zone power | Toast-only | Continuous HUD + map |
| Underlevel full-HP one-shot from trash melee | Common in high bands | Rare (softcap) |
| “Where should I hunt?” answerable | No | Yes within 2s glance |
| On-level combat time share | Low (wander-heavy) | Majority of session |
| Defense isolation regressions | n/a | Zero |

---

## 13. History / related docs

- Living systems: [systems.md](../systems.md), [content-data.md](../content-data.md), [ui-input.md](../ui-input.md), [world.md](../world.md)
- Density baseline: [horde-clear-roadmap/](./horde-clear-roadmap/)
- Do not reintroduce Rift Rush; short-form challenge remains Defense ([defense-mode.md](./defense-mode.md))

---

## 14. Decision log (locked for this plan)

| Decision | Choice |
|----------|--------|
| High-zone entry | Open + warn + softcap (not gated) |
| Spawn philosophy | Keep floors + clamp to band; no full normalize |
| One-shot fix | Player receive gap mul (primary) |
| Guidance | Extend contracts + recommended zone helper |
| Reward | On-level bias; optional Danger premium |
| Modes | Hunt only for this plan |

When integrity-green and product-accepted, move this file to `docs/history/` and clear the active plan row.
