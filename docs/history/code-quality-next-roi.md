# Plan · Code Quality Next ROI (post P1) — Detailed Execution

**Status:** executed N1–N5 (2026-07-16) — UI/Game/Combat extracts landed; integrity ×3 green  
**Captured:** 2026-07-16  
**Baseline commit:** `7660817` (P1 ROI landed)  
**Basis:**

- [code-quality-review-2026-07-16.md](./code-quality-review-2026-07-16.md) — cold review  
- [code-quality-review-2026-07-16-after-roi.md](./code-quality-review-2026-07-16-after-roi.md) — after P1 scores  
- [code-quality-roi-execution.md](./code-quality-roi-execution.md) — completed W1–W6  
- Live hotspot audit of `UI.js` / `Game.js` / `CombatSystem.js` (method sizes, `this.game` counts)

**Constraint (hard):** stay on the established refactoring direction.

| Allowed | Forbidden |
|---------|-----------|
| Extract bodies behind facades | Full rewrite / DI container / ECS |
| Plain-function panel helpers | DOM id renames, UI redesign, CSS overhaul |
| Incremental `(this.ctx ?? this.game)` on **touched** lines | Repo-wide `this.game` codemod |
| Integrity + optional Playwright smokes | Balance retune “while refactoring” |
| English player-facing strings only | Korean (or other) UI copy |
| Keep `file://` forbidden; local server | CDN / re-enable shake·hitStop |

Related locks:

- [architecture-template-boundary.md](../architecture-template-boundary.md)  
- [AGENTS.md](../../AGENTS.md)  
- [config-and-tuning.md](../config-and-tuning.md)  
- [ui-input.md](../ui-input.md)  

---

## 0. How to use this document

1. Read **§1 Direction** and **§7 Rejects** before coding.  
2. Execute **one** workstream (N1 → N2 → …).  
3. After each: integrity green; run the smoke list for that N-step.  
4. Commit with prefix `N1:` / `N2:` … (solo commits on `master` OK).  
5. Do **not** open N5 unless N1–N4 are done **or** a combat feature already forces those methods open.

Agents: prefer this plan over free-form “clean up UI.” If private fields block extraction, use the **proven plain-function pattern** (§5.0) — do not invent prototype private hacks.

---

## 1. Direction we are optimizing for

The recent refactoring is **not** “make the codebase small and pure.” It is:

| Principle | Meaning in this repo | Success signal |
|-----------|----------------------|----------------|
| **Review-unit shrink** | A class/panel/mode change should not force reading 1.4k LOC | Inventory edits touch `inventoryPanel.js`, not all of HUD |
| **Facade stays** | `Game` constructs `UI` / systems; public method names stable | UI still `new UI(game)`; `game.newGame()` still exists |
| **Data vs hit vs FX** | Numbers in content/config; hits in Combat; spectacle in Effects | No combat mults moved into UI panels |
| **Table-driven feel** | Growth / loco / hit / basic-attack feel in frozen tables | New feel numbers go to `config.js` / `runtimeConstants.js` |
| **`ctx` preference (incremental)** | Touched lines prefer `ctx` when key ∈ `GAME_CONTEXT_KEYS` | New helpers use `game.ctx.effects` not new system imports |
| **Integrity merge gate** | Cheap Node smokes always; Playwright optional | `node tests/integrity.mjs` exit 0 every N-step |
| **Parity first** | Behavior, copy language, DOM ids unchanged | Class smoke + skill-combat green |

Anything that fights these principles is **out of scope** even if “cleaner” in abstract.

---

## 2. Current state snapshot (post P1)

### 2.1 What already matches direction

| Area | Path / evidence |
|------|-----------------|
| Class skill kits | `js/systems/combat/skills/{knight,wizard,rogue,ranger}Skills.js` + `index.js` |
| Active attach re-export | `js/systems/combat/activeSkillMethods.js` (~5 LOC) |
| Enemy boss skills | `js/systems/combat/enemySkills.js` |
| Growth table | `PLAYER_GROWTH_CONFIG` in `js/config.js` → `Player.js` |
| Boot gate | `tests/boot-smoke.mjs` nested in `tests/integrity.mjs` |
| Free-use import guards | content + config + **LootSystem** + **skillCombat** |
| UI helpers started | `js/ui/uiShared.js`, `panels/deathOverlay.js`, `panels/debugHud.js` |
| Touched combat paths prefer ctx | skill kits / energy / enemySkills: `(this.ctx ?? this.game)` |

### 2.2 Hotspot LOC (approx.)

| File | ~LOC | Role |
|------|-----:|------|
| `js/ui/UI.js` | **1408** | Largest remaining conflict surface |
| `js/systems/CombatSystem.js` | **1369** | Hit hub + basic attacks + projectiles |
| `js/data/content.js` | 1352 | Data dump (defer split) |
| `js/entities/Player.js` | 1191 | Stats + input + save mix (defer) |
| `js/core/Game.js` | **1187** | Loop + modes + kill feedback |
| `js/graphics/Effects.js` | 1152 | Recipes (defer) |
| `js/entities/Enemy.js` | 1007 | AI + status (defer) |
| `js/systems/RushSystem.js` | 944 | Mode system (opportunistic ctx only) |

### 2.3 Misalignment register

| ID | Issue | Why it fights the direction | Severity | Addressed by |
|----|--------|-----------------------------|----------|--------------|
| **A1** | UI still ~1408; only death/debug extracted | W1 incomplete; inventory/skills/HUD one merge blob | **High** | N1, N2 |
| **A2** | Game ~1187; mode ~248 + kill ~257 clusters | Agents still diff accidental mode/kill code together | **High** | N3, N4 |
| **A3** | CombatSystem ~128× `this.game.` / 1× `this.ctx` while kits use ctx-fallback | Dual service-locator style; highest-traffic surface | **Medium** | N5+N6 when open |
| **A4** | Rush/Defense/Enemy/Loot capture `ctx` then call `game.*` | “ctx ready” is cosmetic | **Medium** | N6 opportunistic only |
| **A5** | Shared combat pipeline still one mental type | Skill bodies modular; melee/projectile/damage not | **Medium** | N5 optional |
| **A6** | UI `#private` methods | Cannot move private methods across modules | **Process** | §5.0 pattern |
| **A7** | Local presentation magic in skills/attacks | OK unless retuned often | **Low** | feature-driven |
| **A8** | content / Player / Enemy / Effects bulk | Explicit P2 | **Defer** | — |

### 2.4 UI method inventory (extract map)

| ~LOC | Method | Wave | Target module |
|-----:|--------|:----:|---------------|
| 162 | `#updateHUD` | N2 | `panels/hudCombat.js` |
| 135 | `#handlePanelAction` | N1 | `panels/panelActions.js` (or stay until inventory stable) |
| 95 | `#bindEvents` | — | **Stay on UI** (wiring hub; last) |
| 87 | `#syncAbilityBar` | N2 | `panels/hudCombat.js` |
| 72 | `#drawMinimap` | N2 | `panels/minimap.js` or hudCombat |
| 56 | `#itemStats` | N1 | `panels/inventoryPanel.js` |
| 51 | `#renderInventory` | N1 | `panels/inventoryPanel.js` |
| 48 | `#syncCombatForge` | N2 | `panels/hudCombat.js` |
| 46 | `#skillEvolution` | N1 | `panels/skillsPanel.js` |
| 44 | `showRushResult` | N2b | `panels/rushOverlays.js` |
| 41 | `#itemCard` | N1 | `panels/inventoryPanel.js` |
| 28 | `#fillClassCards` | N1b | `panels/titleScreen.js` |
| 25 | `#renderHunter` | N1 | `panels/hunterPanel.js` |
| 25 | `#runCombatWeaponEnhance` | N2 | `panels/hudCombat.js` or inventory |
| 24 | `#updateBossHUD` | N2 | `panels/hudCombat.js` |
| 21 | `#skillCard` | N1 | `panels/skillsPanel.js` |
| 20 | `showTitle` | N1b | `panels/titleScreen.js` |
| 18 | `showRushDraft` | N2b | `panels/rushOverlays.js` |
| 17 | `#updateRushHUD` | N2b | `panels/rushOverlays.js` |
| 16 | `#renderSkills` | N1 | `panels/skillsPanel.js` |
| 14 | `#equipmentSlot` | N1 | `panels/inventoryPanel.js` |
| 10 | `#renderSystem` | N1 | `panels/systemPanel.js` |
| — | `showDeath` / debug | done | `deathOverlay.js` / `debugHud.js` |

**Leave on UI facade (thin):** `constructor`, `update`, `openPanel`, `closePanel`, `renderPanel`, `notify`, `floatText`, `showHUD`/`hideHUD`, `setLoading`, `zoneEntered`, `fatal`, one-line delegates.

### 2.5 Game.js cluster inventory

| Cluster | ~LOC | Methods | Target | Wave |
|---------|-----:|---------|--------|:----:|
| **Mode lifecycle** | ~248 | `newGame`, `startDefense`, `startRush`, `retryRush`, `nextRush`, `chooseRushMutation`, `claimRushTrophy`, `#bootstrapDefenseHero`, `handleDefenseVictory`, `continueGame`, `#clearRun`, `returnToTitle`, `#endDefenseRun` | `js/core/gameModes.js` | N3 |
| **Kill / chain feedback** | ~257 | `onEnemyKilled`, `onXpLevelUps`, `#applyKillSkillRefund`, `#levelUpNova`, `#updateKillFeedback`, `#flushMultikill`, `#individualKillBurst`, `#checkChainMilestones`, `#applyChainAttackGrowth`, `#applyKillChainMods` | `js/core/killFeedback.js` | N4 |
| **Frame / camera / input** | ~159+ | `#frame`, `#updatePlaying`, `#handleInput`, `#updateCamera`, aim, menus, dead/paused | **Stay in Game.js** | — |
| **Save / defense meta** | ~60 | `saveGame`, `requestSave`, `#persistDefenseMeta`, `#mergeDefenseMeta`, `#loadDefenseMeta` | Optional later `gameSave.js`; **not in N3–N4** | defer |
| **Death / respawn** | ~40 | `handlePlayerDeath`, `#respawn` | Can stay on Game or follow N3 if tightly coupled to modes | N3 only if needed |

### 2.6 CombatSystem shared pipeline (N5 candidates)

| ~LOC | Method | Extract? | Notes |
|-----:|--------|:--------:|-------|
| 130 | `_meleeAttack` | Yes → basicAttacks | Presentation + hit |
| 126 | `_updateProjectiles` | Yes → projectiles | High risk; needs skill-combat |
| 96 | `_damageEnemy` | **No** | Hit authority hub — keep central |
| 96 | `_rangerStrafeAttack` | Yes → basicAttacks | |
| 61 | `_magicAttack` | Yes → basicAttacks | |
| 56 | `_reactSpellPrime` | Maybe | Wizard overflow; keep if coupled |
| 50 | `_spawnFriendlyOrb` | Yes → projectiles | skillPowerApplied flags audited |
| 48 | `_retireProjectile` | Yes → projectiles | |
| 40 | `_applyApexKeystone` | **No** (first pass) | Apex authority; leave unless forced |
| 31 | `_resolveMultiHits` | **No** | Core of hit coalesce |

### 2.7 Service-locator counts (direction gap)

| Module | `this.game.` (approx) | `this.ctx` | Policy |
|--------|----------------------:|-----------:|--------|
| `CombatSystem.js` | ~128 | 1 | N6 only when method open |
| `RushSystem.js` | ~91 | 1 | opportunistic |
| `DefenseSystem.js` | ~50 | 1 | opportunistic |
| `EnemySystem.js` | ~33 | 1 | opportunistic |
| `LootSystem.js` | ~31 | 1 | opportunistic |
| skill kits + energy + enemySkills | 0 bare service | high | **done** for P1 |

---

## 3. Goals and non-goals

### Goals

1. Finish **UI review-unit shrink** so inventory / skills / HUD / rush overlays are separate files.  
2. Peel **mode lifecycle** and **kill feedback** off `Game.js` without moving the frame loop.  
3. Keep public APIs stable (`UI` methods, `Game.newGame` / `startDefense` / `onEnemyKilled`, etc.).  
4. Apply **`ctx` preference only on lines already rewritten** for N3–N5.  
5. Every N-step: integrity green; UI/Game paths also class visual smoke when practical.

### Non-goals

- Smaller total line count for its own sake (moving lines is fine).  
- Full eradication of `this.game`.  
- Splitting `content.js` / `Effects.js` / `Player.js` / `Enemy.js` in this plan.  
- New UI framework, state store, or CSS redesign.  
- TypeScript, monorepo physical package body move.

---

## 4. Workstream order and stop rules

| # | Workstream | Est. | Risk | Depends on |
|---|------------|------|------|------------|
| **N1** | UI inventory + skills + hunter/system (+ optional title) | 1 d | Medium | — |
| **N2** | UI HUD combat + minimap + forge + (optional) rush overlays | 1 d | Medium | N1 preferred (shared import discipline) |
| **N3** | Game mode helpers | 0.5–1 d | Medium | N1–N2 not required but UI smoke easier after UI stable |
| **N4** | Game kill-feedback extract | 0.5–1 d | Medium | N3 optional; can parallel if different owners |
| **N5** | Combat basicAttacks / projectiles | 1 d | Medium–High | **N1–N4 done** OR combat feature already open |
| **N6** | ctx opportunistic | bundled | Low | rides on N3–N5 |

**Stop rules:**

1. After **each** N-step: `node tests/integrity.mjs` exit 0.  
2. After N1/N2/N3: prefer `node tests/class-mode-visual-smoke.mjs` (needs server + Playwright).  
3. After N5: `skill-combat` + `boot-smoke` + prefer `level100-runtime-matrix`.  
4. **Do not** batch N1–N5 into one PR/commit.  
5. If a step is blocked by private-field / circular import, stop, document in the plan checkbox notes, ship partial with facade one-liners only for completed panels.

**Target UI.js size after N1+N2:** roughly **≤ 700–900 LOC** (facade + bindEvents + thin wrappers).  
**Target Game.js after N3+N4:** roughly **≤ 750–900 LOC** (loop + camera + thin delegates).

---

## 5. Shared extraction patterns

### 5.0 UI: plain functions (mandatory)

Private class fields/methods **cannot** be moved to another file. Use:

```js
// js/ui/panels/inventoryPanel.js
export function renderInventory(ui) {
  const player = ui.game.player;
  const els = ui.elements;
  // ... former #renderInventory body; replace this.X with ui.X
  els['panel-content'].innerHTML = html;
}

export function itemStats(ui, item, limit = 6, options = {}) {
  // former #itemStats body
}
```

```js
// js/ui/UI.js — facade only
import { renderInventory, itemStats as itemStatsPanel } from './panels/inventoryPanel.js';

#renderInventory() {
  return renderInventory(this);
}

#itemStats(item, limit = 6, options = {}) {
  return itemStatsPanel(this, item, limit, options);
}
```

**Rules:**

- Inside panel modules, never use bare free identifiers that import-integrity tracks unless the **module** imports them (or only UI imports them and passes values in).  
  Prefer: panel imports `WEAPON_ENHANCE`, `weaponEnhanceCost`, etc. **itself** when it uses them.  
- UI.js may still import the same symbols if free-use scan of UI body still references them (safe redundancy).  
- Do **not** re-export Loot helpers only from `uiShared` without UI importing them — that caused `weaponEnhanceCost is not defined` in P1.

### 5.1 Game: helpers taking `game`

```js
// js/core/gameModes.js
export function startNewGame(game, options = {}) {
  // body of former Game.newGame
  const player = game.ctx?.player ?? game.player;
  // ...
}

// js/core/Game.js
import { startNewGame } from './gameModes.js';

newGame(options = {}) {
  return startNewGame(this, options);
}
```

Call sites in UI stay: `this.game.newGame()`, `this.game.startDefense()`, etc.

### 5.2 Combat: attach mixin (same as skills)

```js
// js/systems/combat/basicAttacks.js
export function attachBasicAttackMethods(proto) {
  Object.assign(proto, {
    _meleeAttack(player, combo, comboLength = 4) { /* moved */ },
    _magicAttack(player, combo, comboLength = 4) { /* moved */ },
    _rangerStrafeAttack(player, combo, comboLength = 4) { /* moved */ },
  });
}

// CombatSystem.js bottom
import { attachBasicAttackMethods } from './combat/basicAttacks.js';
attachBasicAttackMethods(CombatSystem.prototype);
```

Prefer `(this.ctx ?? this.game)` for effects/audio/world/enemies/player inside moved bodies (N6).

### 5.3 Import-integrity discipline (UI)

When extracting UI code:

1. Run `node tests/import-integrity.mjs` before claiming done.  
2. Free-use catalog includes: content, config, LootSystem, skillCombat.  
3. If a symbol is used in **panel file**, that panel must import it **or** receive it as argument.  
4. If a symbol remains free-used in `UI.js`, UI must import it.

### 5.4 DOM id contract (do not rename)

Panels must keep using existing `ui.elements[...]` keys and `index.html` ids, including at least:

- `panel-layer`, `panel-title`, `panel-content`, `panel-close`  
- HUD: vitals, ability slots, minimap, forge strip, boss bar, rush overlays  
- `title-screen`, `death-screen`, `debug-hud`, `loading-screen`, `fatal-error`  

If unsure, grep `index.html` and `UI` constructor element id list — **never invent new ids** in this plan.

---

## 6. Workstream specs (detailed)

### N1 — UI inventory + skills + hunter/system

**Problem:** Inventory forge, skill tree, hunter log, and system/pause still live in `UI.js`, so gear and skill work always risk HUD/title regressions.

**Deliverables:**

```
js/ui/panels/
  inventoryPanel.js   // renderInventory, itemCard, itemStats, equipmentSlot, sell/enhance HTML builders
  skillsPanel.js      // renderSkills, skillCard, skillEvolution
  hunterPanel.js      // renderHunter
  systemPanel.js      // renderSystem (pause/settings panel content)
  panelActions.js     // optional: handlePanelAction if still >80 LOC after moves
```

**Optional N1b (same day if green early):**

```
  titleScreen.js      // showTitle, fillClassCards, syncClassSelect, refreshContinueButton
```

**Step-by-step:**

1. Baseline: `node tests/integrity.mjs`.  
2. Create `inventoryPanel.js`; move `#renderInventory`, `#itemCard`, `#itemStats`, `#equipmentSlot` bodies; leave one-line privates on UI.  
3. Create `skillsPanel.js`; move `#renderSkills`, `#skillCard`, `#skillEvolution`.  
4. Create `hunterPanel.js` / `systemPanel.js`.  
5. Wire `renderPanel()` still on UI (switch stays).  
6. Run import-integrity; fix missing imports.  
7. integrity + class-mode-visual-smoke (open inventory/skills if smoke covers; at least hunt HUD).  
8. Commit `N1: extract UI inventory and skills panels`.

**Risks & mitigations:**

| Risk | Mitigation |
|------|------------|
| Free-use ReferenceError at runtime | import-integrity + class smoke (continue path hits forge) |
| `this.#itemStats` cross-calls | pass `ui` and call exported `itemStats(ui, …)` |
| `#handlePanelAction` still huge | leave for end of N1 or N1.1; do not block panel HTML extract |

**Exit criteria:**

- [ ] Inventory/skills/hunter/system bodies not inlined in `UI.js`  
- [ ] DOM ids + English copy unchanged  
- [ ] import-integrity green  
- [ ] integrity green  
- [ ] class visual smoke preferred pass  
- [ ] `UI.js` visibly thinner (inventory/skills methods are one-liners)

**Do not:** redesign forge UI; change enhance formulas; move `#bindEvents`.

---

### N2 — UI HUD combat + minimap + forge strip

**Problem:** `#updateHUD` (~162) + ability bar + minimap + forge strip are the hottest runtime path every frame (throttled) and still sit next to panel code.

**Deliverables:**

```
js/ui/panels/
  hudCombat.js    // updateHUD, syncAbilityBar, abilityBarSignature, updateAbility*, syncCombatForge,
                  // runCombatWeaponEnhance, runCombatOptionEnhance, updateBossHUD, updateReticle
  minimap.js      // drawMinimap (optional separate file if hudCombat grows >250 LOC)
  rushOverlays.js // show/hide rush draft/result, updateRushHUD (N2b if time)
```

**Step-by-step:**

1. Extract forge strip first (`#syncCombatForge` + enhance runners) — highest past regression value.  
2. Extract ability bar + signature.  
3. Extract `#updateHUD` last (orchestrator calling the above).  
4. Extract minimap.  
5. Optional: rush overlays.  
6. integrity + **class-mode-visual-smoke required** (desktop+mobile HUD).  
7. Commit `N2: extract UI combat HUD and minimap panels`.

**Risks:**

| Risk | Mitigation |
|------|------------|
| HUD desync / mobile gauges | class smoke; manual F3 if needed |
| Minimap canvas context null | keep `ui.minimapContext` ownership on UI constructor |
| Timer fields (`hudTimer`, `minimapTimer`) | stay on UI instance; panels read/write `ui.hudTimer` |

**Exit criteria:**

- [ ] `#updateHUD` body not in `UI.js`  
- [ ] Ability bar + forge strip + minimap extracted  
- [ ] class visual smoke pass  
- [ ] integrity green  

**Do not:** change HUD layout CSS; change update rates in `GAME_CONFIG` unless fixing a bug.

---

### N3 — Game mode helpers

**Problem:** Hunt / Defense / Rush start-continue-title share one file with the frame loop; mode bugs and loop bugs collide in review.

**Deliverables:**

```
js/core/gameModes.js
  export function startNewGame(game, options = {}) { ... }
  export function startDefenseMode(game, options = {}) { ... }
  export function startRushMode(game, options = {}) { ... }
  export function continueSavedGame(game) { ... }
  export function returnGameToTitle(game) { ... }
  export function clearRun(game) { ... }            // from #clearRun
  export function bootstrapDefenseHero(game) { ... }
  export function handleDefenseVictory(game) { ... }
  export function endDefenseRun(game) { ... }
  export function retryRush(game) { ... }
  export function nextRush(game) { ... }
  export function chooseRushMutation(game, choiceId) { ... }
  export function claimRushTrophy(game, trophyId) { ... }
```

**Game.js remains:**

```js
newGame(options) { return startNewGame(this, options); }
startDefense(options) { return startDefenseMode(this, options); }
// ... same for others
```

**ctx policy inside new helpers:** use `game.ctx?.player ?? game.player` (and effects/audio/world/ui) for `GAME_CONTEXT_KEYS` fields.

**Step-by-step:**

1. Move purest helpers first: `clearRun`, `returnToTitle`.  
2. Move `newGame` / `continueGame` (save path — high value).  
3. Move Defense/Rush starts and victory/end.  
4. integrity + class smoke (title → hunt, defense, continue).  
5. Commit `N3: extract Game mode lifecycle helpers`.

**Risks:**

| Risk | Mitigation |
|------|------------|
| Save continue breaks | continue path in class smoke; check `saveVersion` untouched |
| Order of init (systems before player) | preserve exact statement order from original methods |
| `this` binding for private helpers | convert `#clearRun` to exported `clearRun(game)` |

**Exit criteria:**

- [ ] Public `Game` method names unchanged  
- [ ] Mode bodies live in `gameModes.js`  
- [ ] integrity + class smoke pass  
- [ ] No saveKey/saveVersion changes |

**Do not:** move `#frame` / camera / input; change mode rules or wave counts.

---

### N4 — Kill feedback extract

**Problem:** Multikill, chain mods, level-up nova, skill refund-on-kill (~257 LOC) couple presentation feedback to the mode orchestrator.

**Deliverables:**

```
js/core/killFeedback.js
  export function onEnemyKilled(game, enemy) { ... }
  export function onXpLevelUps(game, levelUps = []) { ... }
  export function updateKillFeedback(game, delta) { ... }
  export function flushMultikill(game) { ... }
  export function individualKillBurst(game, k, defensePop = 1) { ... }
  export function checkChainMilestones(game) { ... }
  export function applyChainAttackGrowth(game) { ... }
  export function applyKillChainMods(game, active) { ... }
  export function applyKillSkillRefund(game, enemy) { ... }
  export function levelUpNova(game) { ... }
```

**Call sites:**

- `Game.onEnemyKilled(enemy)` → `onEnemyKilled(this, enemy)`  
- Frame path: `#updateKillFeedback` → `updateKillFeedback(this, delta)`  
- External systems that call `game.onEnemyKilled` keep working.

**Step-by-step:**

1. Move leaf helpers (`individualKillBurst`, chain apply) first.  
2. Move `onEnemyKilled` / `onXpLevelUps`.  
3. Wire update from `#frame` / `#updatePlaying`.  
4. integrity; if refund touches combat, skill-combat.  
5. Optional: short hunt smoke / level100 not required unless refund logic changed.  
6. Commit `N4: extract Game kill-feedback helpers`.

**Risks:**

| Risk | Mitigation |
|------|------------|
| Multikill timer state on `game` | keep state fields on Game instance; helpers read/write `game.killFeed` (or existing field names — **do not rename**) |
| Chain attack mod desync | no formula edits; copy-paste move only |

**Exit criteria:**

- [ ] Kill cluster methods are thin delegates on Game  
- [ ] Field names for kill/chain state unchanged  
- [ ] integrity green  

**Do not:** retune multikill windows or chain bonuses.

---

### N5 — Combat basic attacks + projectiles (optional / gated)

**Gate:** Complete N1–N4 first, **or** you are already editing `_meleeAttack` / `_updateProjectiles` for a feature.

**Deliverables:**

```
js/systems/combat/basicAttacks.js
  attachBasicAttackMethods(proto)  // _meleeAttack, _magicAttack, _rangerStrafeAttack,
                                   // _applyFrenzyContact, _rangerStrafeUnlocked if only used there

js/systems/combat/projectiles.js
  attachProjectileMethods(proto)   // _spawnFriendlyOrb, _updateProjectiles, _retireProjectile
                                   // optional: enemy projectile entry if not in enemySkills
```

**Keep in CombatSystem:**

- `_damageEnemy`, `_resolveMultiHits`, `_hitEnemiesInRadius/Cone`  
- `_applyApexKeystone`, cast ownership helpers  
- `update` / `clear` orchestration  
- attach calls at bottom next to skill/enemy attachers  

**Tests (mandatory for N5):**

```bash
node tests/boot-smoke.mjs
node tests/skill-combat.mjs
node tests/integrity.mjs
# preferred:
node tests/level100-runtime-matrix.mjs
```

**Exit criteria:**

- [ ] Basic attack methods attached via mixin  
- [ ] Projectile skillPowerApplied paths still pass skill-combat audits  
- [ ] integrity + skill-combat + boot-smoke green  
- [ ] No mult/timeline changes  

**Do not:** move `_damageEnemy` “for size”; do not change hit ranges.

---

### N6 — ctx opportunistic (policy, not a solo commit)

When a method body is already being moved:

| From | To |
|------|-----|
| `this.game.effects` | `(this.ctx ?? this.game).effects` |
| `this.game.audio` | `(this.ctx ?? this.game).audio` |
| `this.game.player` | `(this.ctx ?? this.game).player` |
| `this.game.enemies` | `(this.ctx ?? this.game).enemies` |
| `this.game.world` | `(this.ctx ?? this.game).world` |
| `this.game.ui` | `(this.ctx ?? this.game).ui` |
| `game.effects` (in helpers) | `game.ctx?.effects ?? game.effects` |

**Do not** open `RushSystem.js` solely to rename 91 call sites.

Keys must stay within `GAME_CONTEXT_KEYS` (`js/core/GameContext.js`). Do not widen keys without boundary doc + template-boundary tests.

---

## 7. Explicit rejects

| Temptation | Why reject |
|------------|------------|
| Full `this.game` → `this.ctx` codemod | Noise PR; dual style temporary OK |
| Split `content.js` by zone for size | Data dump; no edit-pain trigger |
| Effects recipes per class file | Spectacle stable; not blocking |
| Physical monorepo extract | Dedicated sprint + LOCK freeze |
| UI framework / reactive store | Outside demo ROI |
| TypeScript migration | Project-reset scope |
| Extract `#bindEvents` first | Highest wiring risk; do last or never in this plan |
| Rename DOM ids / CSS classes | Breaks index.html contracts and smokes |
| Balance or drop-table tweaks | Not refactor |

---

## 8. Validation matrix (detailed)

| Check | Command | N1 | N2 | N3 | N4 | N5 |
|-------|---------|:--:|:--:|:--:|:--:|:--:|
| Full gate | `node tests/integrity.mjs` | ✓ | ✓ | ✓ | ✓ | ✓ |
| Import free-use | `node tests/import-integrity.mjs` | ✓ | ✓ | · | · | · |
| Boot | `node tests/boot-smoke.mjs` | · | · | · | · | ✓ |
| Skills | `node tests/skill-combat.mjs` | · | · | · | if refund | ✓ |
| Motion | `node tests/presentation-motion.mjs` | · | · | · | · | if Player |
| Template | `node tests/template-boundary.mjs` | · | · | · | · | if combat layout |
| Consumer | `node packages/template-3d/consumer-harness.mjs` | · | · | · | · | · |
| Class smoke | `node tests/class-mode-visual-smoke.mjs` | pref | **req** | **req** | pref | · |
| Level100 matrix | `node tests/level100-runtime-matrix.mjs` | · | · | · | · | pref |

Server: `node server.mjs` → `http://127.0.0.1:8777` (never `file://`).

**Parity rules:**

- No skill mult / timeline / recipe name changes  
- No `saveKey` / `saveVersion` changes  
- No player-facing language change  
- No DOM id renames  

---

## 9. Commit / PR slicing

| Commit | Contents |
|--------|----------|
| `N1:` | inventory/skills/hunter/system panels only |
| `N2:` | hudCombat + minimap (+ rush overlays if included) |
| `N3:` | `gameModes.js` + Game delegates |
| `N4:` | `killFeedback.js` + Game delegates |
| `N5:` | basicAttacks + projectiles attach (if any) |

Message style (match repo): imperative English, what + why.

Example:

```
N1: extract UI inventory and skills panels behind facade.

Move forge inventory and skill-tree render bodies into js/ui/panels
so gear and skill edits no longer touch the full HUD surface.
```

---

## 10. Agent checklist (copy into PR)

- [ ] Only one N-step in this change  
- [ ] Facade public APIs unchanged (`UI` / `Game` method names)  
- [ ] Plain functions for UI (no private methods across files)  
- [ ] Free-use imports satisfied (Loot/skillCombat/content/config)  
- [ ] No DOM id / copy language / balance edits  
- [ ] `node tests/integrity.mjs` exit 0  
- [ ] Smokes required for this N-step (see §8)  
- [ ] `ctx` only on touched lines  
- [ ] Did not widen `GAME_CONTEXT_KEYS` without boundary doc  

---

## 11. Success definition

After **N1–N4** (N5 optional):

1. **`UI.js`** is mostly constructor, `bindEvents`, thin panel switches, and one-line delegates; panel bodies under `js/ui/panels/`.  
2. **`Game.js`** owns frame loop, camera, input; mode lifecycle and kill feedback are importable helpers.  
3. Direction consistency: facades + helpers/attach + integrity + incremental ctx.  
4. Quality score expectation (same cold-review axes): **Readability / module size** from ~**3.3 → ~3.7+** without test score regression.  
5. After-ROI doc can be amended with a short “post N1–N4” note when done.

---

## 12. First action when executing

```bash
cd /path/to/gpt5.6-sol-action-rpg-demo
node tests/integrity.mjs    # must be green on current master
```

Then implement **N1 only** per §6 N1 step-by-step.

If blocked: write a one-line note under the failed exit checkbox in this file (or PR) and ship partial N1 rather than inventing a new architecture.

---

## 13. Target tree (end state sketch)

```
js/ui/
  UI.js                 # facade + bindEvents + thin wrappers
  uiShared.js           # pure formatters/constants (exists)
  panels/
    deathOverlay.js     # exists
    debugHud.js         # exists
    inventoryPanel.js   # N1
    skillsPanel.js      # N1
    hunterPanel.js      # N1
    systemPanel.js      # N1
    panelActions.js     # N1 optional
    titleScreen.js      # N1b optional
    hudCombat.js        # N2
    minimap.js          # N2 optional split
    rushOverlays.js     # N2b optional

js/core/
  Game.js               # loop + camera + input + delegates
  gameModes.js          # N3
  killFeedback.js       # N4
  GameContext.js        # unchanged contract
  ...

js/systems/combat/
  skills/*              # exists (P1)
  enemySkills.js        # exists (P1)
  basicAttacks.js       # N5 optional
  projectiles.js        # N5 optional
  ...
```

---

## 14. Out of order / emergency guidance

| Situation | Do |
|-----------|-----|
| Combat bug in `_updateProjectiles` before N1 | Fix bug with minimal diff; optional tiny extract of **that method only** if it reduces risk; do not start full N5 |
| UI bug in inventory only | May do N1 inventory file early without skills |
| Need balance change | Separate commit **after** refactor; never mix |
| integrity red mid-extract | Revert file under edit or fix imports; do not push red |

---

**End of detailed next-ROI plan.**
