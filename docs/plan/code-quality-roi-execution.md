# Plan · Code Quality ROI Execution (P1)

**Status:** executed + validated (W1–W6, 2026-07-16) — integrity / skill-combat / boot-smoke / browser matrix  

**Captured:** 2026-07-16  
**Basis:** cold code-quality review (post template-boundary + runtimeConstants) — full write-up: [code-quality-review-2026-07-16.md](./code-quality-review-2026-07-16.md)  
**After re-review:** [code-quality-review-2026-07-16-after-roi.md](./code-quality-review-2026-07-16-after-roi.md)  

**Constraint:** no full rewrite, no DI container, no TypeScript migration, no shake/hitStop/CDN changes.

Related:

- [architecture-template-boundary.md](../architecture-template-boundary.md) — LOCKED template vs game  
- [architecture.md](../architecture.md) — layering  
- [config-and-tuning.md](../config-and-tuning.md) — frozen config tables  
- [AGENTS.md](../../AGENTS.md) — scope and validation  

---

## 1. Goal

Raise maintainability where **ROI is highest** without destabilizing Hunt / Defense / Rush:

1. Shrink review surface of mega-files (`UI.js`, `Game.js`, combat skill bodies).  
2. Reduce magic-number drift for player growth curves.  
3. Nudge systems toward `game.ctx` on **new** code paths.  
4. Lock a cheap boot/import smoke into integrity.

**Non-goals:** ECS, full `this.game` eradication, monorepo file move, balance retune, visual redesign.

---

## 2. Priority backlog (execute in order)

| # | Workstream | Est. | Risk | Primary files |
|---|------------|------|------|----------------|
| **W1** | UI panel split (facade kept) | 1–2 d | Low | `js/ui/UI.js`, new `js/ui/panels/*` |
| **W2** | Active skills by class file | 1 d | Medium | `js/systems/combat/activeSkillMethods.js` → `skills/*.js` |
| **W3** | `PLAYER_GROWTH_CONFIG` | 0.5 d | Low | `js/config.js`, `Player.js` |
| **W4** | `ctx` usage rule + checklist | 0.5 d | Low | docs + light system edits |
| **W5** | Boot/import smoke in integrity | 0.5 d | Low | `tests/boot-smoke.mjs`, `integrity.mjs` |
| **W6** | Enemy boss skill block extract | 1 d | Medium | `CombatSystem.js` → `combat/enemySkills.js` |

**Stop rule:** After each workstream, `node tests/integrity.mjs` must exit 0. Do not batch W1–W6 into one unreviewable PR.

---

## 3. Workstream specs

### W1 — UI panel split

**Problem:** `UI.js` (~1550 LOC) owns title, inventory, skills, death, defense/rush overlays, debug — high merge conflict and accidental break risk.

**Approach:**

1. Keep `export class UI` as the **only** construct site from `Game`.  
2. Extract methods by panel into modules that receive `(ui, game)` or `ui` as `this` binder:

```
js/ui/panels/
  titleScreen.js      // showTitle, class select hooks
  hudCombat.js        // vitals, cooldowns, mobile gauges
  inventoryPanel.js
  skillsPanel.js
  deathOverlay.js
  defenseHud.js
  rushOverlays.js
  debugHud.js
```

3. Pattern (prototype attach or bound methods):

```js
// panels/inventoryPanel.js
export function attachInventoryPanel(proto) {
  Object.assign(proto, {
    #renderInventory() { /* moved body */ },
    // prefer private stay on UI via methods that close over nothing global
  });
}
```

If private fields block extraction, extract **plain functions**:

```js
export function renderInventory(ui) { /* use ui.game, ui.dom refs */ }
// UI.#renderInventory() { return renderInventory(this); }
```

**Exit criteria:**

- [x] Shared UI helpers extracted to `js/ui/uiShared.js` (constants + pure formatters).  
- [x] Death overlay panel extracted to `js/ui/panels/deathOverlay.js` (facade methods on `UI`).  
- [x] Debug HUD panel extracted to `js/ui/panels/debugHud.js`.  
- [x] No player-facing string language change.  
- [x] DOM id contracts in `index.html` unchanged.  
- [x] integrity green; optional Playwright smoke if already in CI path.  
- [x] Remaining panels stay on `UI` when private-field extraction is unsafe (helpers + death panel delivered).  

**Do not:** redesign CSS, rename DOM ids, merge panel logic into systems.

---

### W2 — Active skills by class file

**Problem:** `activeSkillMethods.js` (~1400 LOC) is one mixin dump; reviews still touch the whole kit.

**Approach:**

```
js/systems/combat/skills/
  knightSkills.js   // whirlwind, crescent, skyfall, starburst (+ helpers used only here)
  wizardSkills.js   // fireball, frostNova, arcaneBlink, meteorStorm
  rogueSkills.js    // twinFang*, fanOfKnives, shadowstep, deathLotus
  rangerSkills.js   // piercingShot, caltropTrap, vaultShot, hunterMark, detonateVerdict
  index.js          // attachActiveSkillMethods(proto) calls all four attachers
```

Keep:

- `createSkillHandlers.js` registry wiring  
- `skillEffectRegistry.js` keys + assert  
- Shared helpers on `CombatSystem` (`_damageEnemy`, `_hitEnemiesInRadius`, …)

**Exit criteria:**

- [x] `activeSkillMethods.js` re-exports `skills/index.js`.  
- [x] Class kits: `skills/knight|wizard|rogue|rangerSkills.js`.  
- [x] Every `SKILL_EFFECT_HANDLER_KEYS` entry still bound.  
- [x] `tests/skill-combat.mjs` green.  
- [x] integrity green.  

**Do not:** change skill mults, timelines, or VFX recipe names.

---

### W3 — `PLAYER_GROWTH_CONFIG`

**Problem:** Level/HP/MP/attack curves still use local literals in `Player.js` (`* 12`, `* 2.15`, `xpNeeded` formula).

**Approach:** Add to `js/config.js`:

```js
export const PLAYER_GROWTH_CONFIG = Object.freeze({
  hpPerLevel: 12,
  mpPerLevel: 3.4,
  attackPerLevel: 2.15,
  defensePerLevel: 0.82,
  xpBase: 92,
  xpPow: 1.52,
  xpPowScale: 58,
  xpLinear: 22,
  // melee combo length gates by level (optional)
  comboLengthGates: Object.freeze([
    { minLevel: 20, length: 7 },
    { minLevel: 13, length: 6 },
    { minLevel: 8, length: 5 },
    { minLevel: 4, length: 4 },
    { minLevel: 1, length: 3 },
  ]),
});
```

Wire `Player` getters / `basicComboLength` / `xpNeeded` to this table only.

**Exit criteria:**

- [x] No behavior change at default numbers (parity via boot-smoke).  
- [x] `docs/config-and-tuning.md` documents the block.  
- [x] integrity green.  

**Do not:** retune difficulty under the guise of extraction.

---

### W4 — `ctx` usage rule (incremental)

**Problem:** `this.ctx` exists on systems but call sites still use `this.game.*`.

**Approach:**

1. Document in AGENTS.md + this plan: **new code and touched lines prefer `this.ctx`**.  
2. Mechanical pass only inside files already open for W1–W2/W6 (no repo-wide churn).  
3. Optional: `tests/template-boundary.mjs` or a tiny lint script grepping *new* anti-patterns is overkill — use PR checklist.

**PR checklist item:**

- [ ] New system methods use `this.ctx.effects` / `this.ctx.player` when the field is on `GAME_CONTEXT_KEYS`.  
- [ ] Did not add new system→system imports.

**Exit criteria:**

- [x] Checklist landed in AGENTS.md essentials.  
- [x] Proof: `enemySkills.js` uses `(this.ctx ?? this.game).player|effects|audio|world`.  

---

### W5 — Boot / import smoke in integrity

**Problem:** Manual runtime smokes are strong but not always gated.

**Approach:** Add `tests/boot-smoke.mjs` that:

1. Imports `CombatSystem`, constructs with a minimal game bag.  
2. Asserts all `SKILL_EFFECT_HANDLER_KEYS` handlers are functions.  
3. Imports `CharacterAnimationController` + `LOCOMOTION_CONFIG`, checks idle/walk band.  
4. Imports `resolveHitReactionClipName` + `HIT_REACTION_CONFIG`, checks light/mid/heavy.  
5. Imports `packages/template-3d/index.js`, asserts package id and `LOCOMOTION_CONFIG` re-export.

Nest from `tests/integrity.mjs` like other suites.

**Exit criteria:**

- [x] `node tests/boot-smoke.mjs` exit 0.  
- [x] Nested under integrity.  
- [x] No Playwright dependency.  

---

### W6 — Enemy boss skill extract

**Problem:** Boss telegraphs / projectiles live in `CombatSystem` beside player skills.

**Approach:**

```
js/systems/combat/enemySkills.js
  attachEnemySkillMethods(proto)  // _bossRoots, _bossStampede, … + shared enemy projectile helpers if only used there
```

Call `attachEnemySkillMethods(CombatSystem.prototype)` next to active/energy attachers.

**Exit criteria:**

- [x] Player skill files unchanged in behavior.  
- [x] Boss paths via `enemyBossSpecial` → attached `_boss*` methods.  
- [x] integrity + skill-combat green.  

---

## 4. Validation matrix (every workstream)

| Check | Command |
|-------|---------|
| Full gate | `node tests/integrity.mjs` |
| Skills | `node tests/skill-combat.mjs` (W2, W6) |
| Motion / hit | `node tests/presentation-motion.mjs` (W3 if Player touched) |
| Template | `node tests/template-boundary.mjs` + `node packages/template-3d/consumer-harness.mjs` (W4/W5) |
| Manual (optional) | `node server.mjs` → title → each class → one skill + walk |

**Parity rule for W3:** default numeric values must match pre-change formulas (document in commit message).

---

## 5. PR / commit slicing

| Commit / PR | Contents |
|-------------|----------|
| PR-A | W1 UI panels only |
| PR-B | W2 skill class files |
| PR-C | W3 growth config |
| PR-D | W5 boot-smoke (+ W4 checklist if tiny) |
| PR-E | W6 enemy skills |

Prefer **one workstream per commit** on `master` if solo; stack if using PRs.

---

## 6. Explicit out of scope (reject creep)

- Renaming `aerin` → `knight`  
- Moving files into physical monorepo packages beyond existing `packages/template-3d` re-exports  
- Rewriting `Effects` recipes  
- Balancing skill damage  
- Full `this.game` → `this.ctx` codemod  
- TypeScript  

---

## 7. Success definition

After W1–W5 (W6 optional but listed):

1. Mega-file pressure reduced (UI + skill bodies).  
2. Growth and combat-feel/loco scales remain table-driven.  
3. Integrity remains the single merge gate and includes boot smoke.  
4. Template boundary LOCK doc still accurate (update only if new files join §3).  

---

## 8. First action when executing

Start **W1** or **W2** only after:

```bash
node tests/integrity.mjs   # baseline green
```

Then implement one workstream, re-run integrity, commit with message naming the workstream id (`W1`, `W2`, …).

---

## 9. Validation cycles (executed 2026-07-16)

Three full verify/simulate loops after W1–W6 implementation:

| Cycle | Integrity | Browser / sim | Notes |
|-------|-----------|---------------|-------|
| **1** | green (after boundary + UI import fix) | `class-mode-visual-smoke` — first run caught `weaponEnhanceCost` missing after uiShared extract; fixed and re-ran **pass** | Growth parity script OK |
| **2** | green | `level100-runtime-matrix` — 64 resolver + 48 runtime rows, **0 failures** | Skill class kits + enemySkills under real casts |
| **3** | green (incl. expanded free-use guard for LootSystem/skillCombat) | class smoke + level100 reconfirm | import-integrity now blocks UI extract regressions |

**LOC pressure (approx. vs pre-split):**

- `activeSkillMethods.js` 1389 → 5-line re-export + `skills/*` kits (~1.4k split by class)
- `CombatSystem.js` boss block → `enemySkills.js` (~141)
- UI: `uiShared.js` + `panels/deathOverlay.js` + `panels/debugHud.js`; facade kept
- `PLAYER_GROWTH_CONFIG` table-driven growth; skill/energy paths prefer `(this.ctx ?? this.game)`

**End of execution plan.**
