# Plan · Defense Mode

Status: **implemented (V2 climb)** — title entry, wave FSM, scaling to **wave 200**, hero runMods + gear floors, death/meta save; Hunt isolation rules apply  
Goal: title-screen **Defense** entry under **New Hunt** — wave climb to **200** with rising monster power, parallel hero growth (XP, skills, gear, power shards), flashy combat.  
Non-goal: rewrite Hunt, shared progression bleed, mid-run Hunt save corruption.

---

## 1. Product summary

| | Hunt (existing) | Defense (new) |
|--|-----------------|---------------|
| Entry | New Hunt / Continue | Defense (title, under New Hunt) |
| Loop | Open-world field spawn, contracts, boss charge | Wave prep → spawn → clear → next wave |
| Monster power | Level + world tier + elite | **Wave multipliers** (+ level/elite) |
| Hero power | XP, gear, skills, world tier | Same systems **inside the run** + wave-clear rewards |
| Death | Hub revive + gold penalty | **Run ends** → summary → title (or retry Defense) |
| Save | Full autosave (`player` + `hunt`) | **Meta only** (best wave); no Hunt blob overwrite |

Player-facing UI tone: English notifications and HUD copy; button stays `Defense` with a short subtitle.

---

## 2. Hard rules — do not break Hunt

These are **mandatory architecture constraints** for every PR. If a change cannot satisfy them, redesign the change.

### 2.1 Mode isolation

1. Introduce a single explicit mode flag on `Game`:  
   `this.mode = 'hunt' | 'defense'` (default `'hunt'`).
2. **`newGame()` always sets `mode = 'hunt'`** and keeps today’s behavior byte-for-byte where practical.
3. **`startDefense()` is a separate entry** — never overload `newGame(true)` in a way that branches Hunt mid-function into Defense logic.
4. **`continueGame()` is Hunt-only.** Never load a Defense run into the Hunt continue path.
5. Any shared function that gains Defense behavior must use an **early, explicit branch**:

   ```js
   if (this.game.mode === 'defense') { /* defense path */ return; }
   // existing Hunt code unchanged below
   ```

6. Prefer **append-only** Defense paths over rewriting Hunt branches. Do not “simplify” Hunt spawn/contracts while adding Defense.

### 2.2 Systems ownership

| System | Hunt | Defense |
|--------|------|---------|
| `EnemySystem` continuous field spawn | ON | **OFF** (wave spawns only) |
| `HuntSystem` contracts / boss charge | ON | **OFF** (do not call `hunt.update` / do not advance contracts) |
| `DefenseSystem` (new) | not constructed or idle | owns wave FSM |
| `LootSystem` / combat / player stats | shared | shared (no Hunt-only assumptions that break Defense) |
| Death / respawn | `handlePlayerDeath` → hub revive | Defense branch → run end; **must not** call Hunt revive flow |

### 2.3 Save isolation

1. Do **not** change `saveKey` casually.
2. If new fields are required, prefer **optional** payload keys with load defaults; bump `saveVersion` only if schema is incompatible (merge defaults on load).
3. Defense **must not** write a mid-run player snapshot into the Hunt continue blob.
4. Allowed Defense persistence (V1):

   ```js
   defenseMeta: { bestWave: 0, runs: 0, lastWave: 0 }
   ```

5. Hunt `saveGame` path continues to write `player` + `hunt` only when `mode === 'hunt'` (or when state is a normal Hunt session). After a Defense death, updating `defenseMeta` is fine; wiping Hunt progress is not.

### 2.4 Shared entity scaling (Enemy)

- Wave multipliers live in **optional** `options.wave` (and maybe `options.waveHp` / factors).
- When `wave` is absent / `undefined`, Enemy math is **identical to today** (level + worldTier + elite only).
- Never retune base `ENEMY_TYPES` HP/damage “for Defense balance” without checking Hunt feel.

### 2.5 Content / config

- Put Defense tuning in `DEFENSE_CONFIG` (`js/config.js` or `js/data/content.js`), `Object.freeze`.
- Do not repurpose Hunt `GAME_CONFIG.targetEnemies` / contract tables as Defense’s only source of truth.
- Zone/monster tables stay shared read-only data; Defense **selects** from them, Hunt selection paths unchanged.

### 2.6 UI isolation

- New DOM ids for Defense (`defense-btn`, `wave-label`, …) — do not repurpose Hunt contract title nodes in a way that breaks Hunt HUD.
- Title **Continue** meta remains Hunt save summary.
- Hunt HUD fields that Defense does not use may be hidden via a single CSS/class branch on `body` or HUD root (`data-mode="defense"`), not by deleting Hunt markup.

### 2.7 Regression checklist (run after each PR)

- [ ] New Hunt still starts, field spawns, contracts, boss charge work  
- [ ] Continue still loads Hunt save  
- [ ] Hunt death still hub-revives with gold penalty  
- [ ] Defense button does not appear to mutate Hunt save on title  
- [ ] `node tests/integrity.mjs`  
- [ ] Manual: Hunt 2 minutes + Defense 2 minutes, no cross-contamination  

---

## 3. Current code hooks (implementation map)

| Location | Hunt today | Defense addition |
|----------|------------|------------------|
| `index.html` `.title-actions` | New Hunt, Continue | Insert Defense **between** them |
| `UI.js` `#bindEvents` | `newGame` / `continueGame` | `defense-btn` → `startDefense` |
| `Game.newGame` | reset player/hunt, populate enemies | untouched aside from `mode = 'hunt'` |
| `Game.continueGame` | load save | untouched; refuse Defense mode |
| `Game.#updatePlaying` | player, combat, enemies, hunt, loot… | `if (mode==='defense') defense.update` |
| `EnemySystem.update` | continuous `#spawnOne` | skip when `mode==='defense'` |
| `Enemy` constructor | level/tier/elite scales | optional `options.wave` mult |
| `Game.onEnemyKilled` | XP, hunt.onKill, loot | branch: defense.onKill; skip hunt contracts |
| `Game.handlePlayerDeath` | dead → respawn | defense end-run UI |
| `Game.saveGame` | player+hunt | + optional `defenseMeta`; no Defense run player write |

---

## 4. Architecture

```text
Title
  ├─ New Hunt ──► newGame()           mode = 'hunt'
  ├─ Defense  ──► startDefense()      mode = 'defense'
  └─ Continue ──► continueGame()      Hunt save only

playing (hunt)
  EnemySystem field spawn
  HuntSystem contracts / boss charge
  onKill → hunt.onKill

playing (defense)
  EnemySystem AI only (no field spawn)
  DefenseSystem wave FSM
  onKill → defense.onKill  (no hunt contract / boss charge)
```

### 4.1 New module: `js/systems/DefenseSystem.js`

**Owns** wave state only. Does not own combat damage or player inventory.

```text
phase: idle | prep | combat | clear | failed
wave: 1..∞
prepTimer
pendingSpawns / remainingLiving (or recount enemies tagged for wave)
```

Public API (suggested):

| Method | Role |
|--------|------|
| `reset()` | clear run state |
| `start()` | wave = 1, enter prep |
| `update(delta)` | timers, clear detect, advance |
| `onKill(enemy)` | optional bookkeeping; clear may also poll living count |
| `spawnWave()` | roster + `enemies.spawn(..., { wave, level, elite })` |
| `get hud()` | `{ wave, remaining, phase }` for UI |
| `serializeMeta()` | best-wave merge helper |

Construction: `Game` creates `this.defense = new DefenseSystem(this)` like other systems. When `mode !== 'defense'`, `update` is no-op.

### 4.2 Wave loop

```text
prep (banner + countdown)
  → spawnWave()
  → combat until living wave enemies == 0
  → clear rewards (XP/gold/loot chance)
  → wave += 1 → prep
player death → failed → summary → title (mode reset)
```

### 4.3 Monster scaling

```text
waveHp  = 1 + (wave - 1) * DEFENSE_CONFIG.hpPerWave
waveDmg = 1 + (wave - 1) * DEFENSE_CONFIG.dmgPerWave
level   = baseFromType/zone + floor((wave - 1) * levelBonusPerWave)
```

Applied **only** when Defense passes `options.wave`. Count:

```text
count = min(maxCount, baseCount + floor((wave - 1) / 2) * countPerTwoWaves)
```

Elites from `eliteStartWave`; mini-boss every `miniBossEvery` waves (reuse boss type or elite + flag — prefer existing `spawn` / boss data without new content if possible).

### 4.4 Hero scaling

Inside the Defense run only:

1. Kill XP → existing `Player.addXp` / level / skills  
2. Wave-clear XP/gold from `DEFENSE_CONFIG`  
3. Gold milestone every `goldMilestoneEveryWaves`; the player spends it in Weapon Forge
4. Optional short-lived run buffs on `DefenseSystem` (never written into Hunt save)

Hero “must get stronger” is satisfied by XP + clear rewards + weapon enhancement — not by permanently buffing `PLAYER_CONFIG`.

### 4.5 Arena (V1)

- Spawn annulus around player / hub (`spawnInner` / `spawnOuter` in `DEFENSE_CONFIG`).  
- Soft-lock variety: rotate `ZONE_SPAWNS` pools by wave band (read-only).  
- Disable or ignore far **stale despawn** for wave-tagged enemies so the wave cannot soft-lock.  
- Do not require new zones or meshes for V1.

---

## 5. Config sketch

```js
// js/config.js — Defense only (V2 climb → maxWave 200)
export const DEFENSE_CONFIG = Object.freeze({
  maxWave: 200,
  prepSeconds: 2.6,
  baseCount: 5,
  countPerThreeWaves: 1,
  maxCount: 36,
  hpPerWave: 0.055,       // soft linear; late ramp via defenseWaveHpMul()
  dmgPerWave: 0.032,
  // startLevel / runMods / power shards / gold milestone — see live config
  goldMilestoneEveryWaves: 2,
  spawnInner: 10,
  spawnOuter: 22,
});
// Helpers: defenseWaveHpMul, defenseWaveDmgMul, defenseRarityFloor
```

Balance only via this table after playtest — not by editing Hunt spawn rates.
Hero runMods (`player.runMods`) are Defense-run only and reset on title. Weapon enhancement is persistent and uses the shared gold economy.

---

## 6. UI / UX

### Title

```html
<button id="new-game-btn">New Hunt</button>
<button id="defense-btn" class="secondary-button">
  <span>Defense</span><small>Wave survival</small>
</button>
<button id="continue-btn">Continue</button>
```

### HUD (Defense)

- Wave chip: `WAVE N`  
- Optional: remaining enemies  
- Prep toast: English, e.g. wave rising / enemies stronger  
- Hide or de-emphasize contract panel while `data-mode="defense"`

### Death / result

- Reached wave N · best M  
- Retry Defense / return to title  
- Does **not** use Hunt revive timer as the only outcome

---

## 7. Implementation order (keep Hunt green each step)

### Step 1 — Shell (no balance yet)

1. Title button + styles  
2. `Game.mode`, `startDefense()` stub  
3. `mode = 'hunt'` in `newGame`  
4. HUD `data-mode` attribute  

**Hunt must still pass regression checklist.**

### Step 2 — Wave FSM

1. `DefenseSystem.js`  
2. Gate field spawn in `EnemySystem` when defense  
3. Prep → spawn → clear → next  
4. Wave HUD  

### Step 3 — Scaling + rewards + death

1. `Enemy` optional wave mult  
2. Clear XP/gold/gear  
3. Death ends run + `defenseMeta`  
4. Skip `HuntSystem` pressure in defense  

### Step 4 — Polish

1. Elite/mini-boss cadence  
2. Zone pool rotation  
3. VFX/SFX on clear  
4. Integrity assertions + this plan linked from docs hub  
5. Playtest waves 1–15  

---

## 8. Files to touch (scope fence)

| File | Allowed change |
|------|----------------|
| `index.html` | Defense button, optional wave nodes |
| `css/game.css` | title button / wave chip / mode HUD |
| `js/ui/UI.js` | bind Defense, HUD refresh, death summary branch |
| `js/core/Game.js` | mode, startDefense, update/death/save branches |
| `js/systems/DefenseSystem.js` | **new** |
| `js/systems/EnemySystem.js` | defense early-out on field spawn; optional despawn guard |
| `js/entities/Enemy.js` | optional `options.wave` only |
| `js/config.js` and/or `js/data/content.js` | `DEFENSE_CONFIG` |
| `js/core/SaveManager.js` / save payload | optional `defenseMeta` + defaults |
| `tests/integrity.mjs` | button + config smoke |
| `docs/plan/defense-mode.md` | this plan |
| `docs/README.md` | link to plan (optional) |

**Out of scope:** `vendor/`, camera shake/hit-stop re-enable, Hunt contract redesign, new monster shapes for V1.

---

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Double spawn (field + wave) | Field spawn disabled when `mode==='defense'` |
| Wave soft-lock via despawn | Tag wave enemies; skip stale despawn in defense |
| Hunt Continue broken | Never serialize Defense run as Hunt `player` |
| Enemy base stats retuned for Defense | Wave mult only; leave `ENEMY_TYPES` alone |
| Hunt contracts fire in Defense | Skip `hunt.update` / `hunt.onKill` side effects |
| Scope creep into open-world Defense | V1 arena only |

---

## 10. Validation

### Automated

- `node tests/integrity.mjs`  
- Assert `defense-btn` exists; `DEFENSE_CONFIG` exported if added  

### Manual Hunt (must not regress)

1. New Hunt → spawns in field → contract UI updates  
2. Kill until boss charge works  
3. Die → hub revive  
4. Continue from title restores position/progress  

### Manual Defense

1. Defense → wave 1 banner → enemies spawn near player  
2. Clear → wave 2 harder/more  
3. Level/gear still obtainable  
4. Death → summary, Hunt Continue still shows prior Hunt save if any  
5. New Hunt after Defense still normal Hunt  

### Run environment

`node server.mjs` → `http://127.0.0.1:8080` (never `file://`).

---

## 11. Defaults (locked for V1 unless product changes)

- Endless waves  
- No mid-run Defense save  
- No free revive  
- Arena around hub  
- Hunt and Defense fully mode-gated  

---

## 12. Agent implementation notes

1. Read this plan + [systems.md](../systems.md) + [save-and-run.md](../save-and-run.md) before coding.  
2. Land Step 1 with Hunt regression first.  
3. Keep diffs small; no drive-by Hunt refactors.  
4. Docs under `docs/` stay English; all player-facing strings English.  
5. Do not auto-commit unless the user asks.
