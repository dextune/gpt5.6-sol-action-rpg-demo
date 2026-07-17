# Code Quality Review — Cold Assessment

**Date:** 2026-07-16  
**Subject:** `gpt5.6-sol-action-rpg-demo` (`master` at review time; integrity green)  
**Lens:** Can this browser ARPG demo keep growing without collapsing — not “ideal engine purity”.  
**Scope:** Only improvements that are realistic to review and ship. No full rewrite fantasy.

**Follow-on execution plan:** [code-quality-roi-execution.md](./code-quality-roi-execution.md)  
**After-ROI re-review:** [code-quality-review-2026-07-16-after-roi.md](./code-quality-review-2026-07-16-after-roi.md)

**Related:**

- [architecture-template-boundary.md](../architecture-template-boundary.md) — LOCKED template vs game  
- [architecture.md](../architecture.md) — layering  
- [config-and-tuning.md](../config-and-tuning.md) — frozen config tables  

---

## 1. Overall scores (out of 5)

| Axis | Score | One-liner |
|------|-------|-----------|
| Structural intent / layering | **3.5** | Folders and docs are clear; runtime coupling still centers on `Game`. |
| Tests / regression safety | **4.0** | integrity, skill-combat, template-boundary are strong for a demo. |
| Readability / module size | **2.5** | Core files still 1k–1.5k LOC; recent splits helped only somewhat. |
| Tunability | **3.5** | `config.js` / `runtimeConstants` direction is right; skill/UI magic remains. |
| Template-extract readiness | **3.0** | Package entry + boundary doc exist; body is still re-export monorepo. |
| Runtime quality (pools, LOD) | **3.5** | VFX pools, quality tiers, anim throttle are practical; asset lifetime improved. |

**Verdict in one line:**  
A **production-minded demo** designed so agents can keep stacking features without immediate collapse — **not** a small, clean codebase. Quality issues are mostly **size, implicit contracts, and mixed responsibilities**, not chaos or missing tests.

---

## 2. What is already good (do not underrate)

1. **Content vs hit authority vs presentation** contracts are mostly honored (`content` / Combat / Effects).  
2. **`tests/integrity.mjs` hub** — clip maps, skill handlers, template boundary, import paths in one gate.  
3. **Recent work points the right way** — combat skill modules, `GameContext`, `runtimeConstants` / `HIT_REACTION` / `BASIC_ATTACK_FEEL`, AssetManager `clones`.  
4. **Performance awareness** — Effects pools, quality LOD, distant anim throttle, per-class clip filter.  
5. **Hard product constraints** (no CDN, no shake/hitStop) are encoded and regression-tested.

---

## 3. Problems — severity order, only feasible fixes

### P1 — High ROI (about 1–3 days each)

#### 3.1 `UI.js` (~1554 LOC) / `Game.js` (~1187 LOC) overload

- **Issue:** Mode orchestration (Hunt / Defense / Rush), HUD, save flush, and loop sit in oversized surfaces; bugfixes radiate.  
- **Unrealistic fix:** Full DI, new UI framework.  
- **Realistic fix:**  
  - UI: split by panel under `js/ui/panels/*`; keep `export class UI` as facade for `Game`.  
  - Game: extract mode start/end helpers; leave the frame loop in place.  
- **Payoff:** Fewer merge conflicts and accidental breaks.

#### 3.2 Combat still huge after skill table modularization

- ~1.5k `CombatSystem.js` + ~1.4k `activeSkillMethods.js`.  
- **Issue:** Handler wiring is modular; shared helpers and skill bodies still form one mental type.  
- **Realistic fix:**  
  - Split actives by class (`combat/skills/knight.js`, …) using the existing mixin attach pattern.  
  - Move boss blocks to `combat/enemySkills.js`.  
- **Not recommended now:** Event bus / ECS rewrite.

#### 3.3 `this.game.*` service-locator habit

- Systems capture `this.ctx` but most call sites still use `this.game`.  
- **Issue:** Unit tests and template reuse require mocking the whole Game bag.  
- **Realistic fix:**  
  - Rule: **new code and touched lines prefer `this.ctx`**.  
  - Migrate only hot paths when already editing a file — no repo-wide codemod.  
- **Not recommended:** Mechanical full replace PR.

#### 3.4 Constants centralization is only half-done

- Locomotion, hit reaction, basic-attack feel are table-driven.  
- **Still local:** level/XP curves, some clamp floors (e.g. attack-speed min `0.65`), UI timings, many in-skill presentation numbers.  
- **Realistic fix:**  
  - `PLAYER_GROWTH_CONFIG` for xp/level coefficients.  
  - New skills: numbers only in `content` combat tables; handlers read keys.  
- **Unrealistic:** Zero magic numbers repo-wide.

---

### P2 — Debt for spare cycles

| Issue | Honest take | Realistic move |
|-------|-------------|----------------|
| `content.js` ~1.3k | Fine as data dump; painful as “code” | Split by class/zone + re-export |
| `Player.js` ~1.1k | Stats + combat + move + save mixed | Extract stats / combat-input helpers |
| `Enemy.js` ~1k | AI + status + presentation | Split status tick / AI functions |
| `Effects.js` recipes | Skill identity kits are game content | Register recipes per class file |
| Template package re-exports only | Proves boundary; not physical extract | Keep until a dedicated extract sprint |
| Simpler AssetManager fallback | Intentional tradeoff | Document optional `createFallbackModel` inject |

---

### P3 — Know, do not fix now

- AAA animation layers / bone masks  
- Full DI container  
- Whole-repo TypeScript (high value, project-reset scope)  
- Full combat balance audit  

---

## 4. Test quality (cold)

**Strengths:** Contract tests often drive real modules or real source (low test theater).  

**Weaknesses:**

- Browser E2E is partial; no mandatory “title → 10s combat” gate.  
- Visual regression is limited.  

**Realistic add:** `tests/boot-smoke.mjs` — construct `CombatSystem`, assert handlers, locomotion band, hit-reaction resolver, template package export; nest under integrity. No Playwright required.

---

## 5. Architecture scoreboard (qualitative)

```
Intended layers          ████████░░  docs/folders solid
Actual coupling          █████░░░░░  Game god-bag
Module size              ████░░░░░░  mega-files remain
Tuning / constants       ███████░░░  recent gains, half-done
Test safety net          ████████░░  strong
Template reusability     █████░░░░░  entry only
```

| Question | Answer |
|----------|--------|
| Well-built demo? | **Yes** |
| High code quality? | **Structure-aware, size-taxed** |
| Immediate refactor hell? | **No** — integrity enables incremental work |

---

## 6. Recommended backlog order (mirrored in execution plan)

| Rank | Work | Est. | Why |
|------|------|------|-----|
| 1 | UI panel split (facade stays) | 1–2 d | Low risk, high conflict relief |
| 2 | Active skills by class file | 1 d | Pattern already exists |
| 3 | `PLAYER_GROWTH_CONFIG` | 0.5 d | Continues constants philosophy |
| 4 | `ctx` usage rule + checklist | 0.5 d | Coupling hygiene |
| 5 | Boot/import smoke in integrity | 0.5 d | Regression lock |
| 6 | Enemy boss skill extract | 1 d | Slims CombatSystem |

**Do not do soon:** second monorepo file move, full DI, TS conversion.

Detailed exit criteria and non-goals: **[code-quality-roi-execution.md](./code-quality-roi-execution.md)**.

---

## 7. Final line

Quality level is **“a mid/large demo held up by tests and conventions.”**  
Recent investments (boundary, constants, combat modules) are **correct quality spending**.  
The remaining core weakness is **file bulk + implicit Game mediation** — both shaveable without a rewrite, via the P1 backlog above.

---

## 8. Snapshot metrics (at review)

Approximate LOC (hotspots):

| File | ~LOC |
|------|------|
| `js/ui/UI.js` | 1554 |
| `js/systems/CombatSystem.js` | 1495 |
| `js/systems/combat/activeSkillMethods.js` | 1389 |
| `js/data/content.js` | 1352 |
| `js/core/Game.js` | 1187 |
| `js/entities/Player.js` | 1185 |
| `js/graphics/Effects.js` | 1152 |

Validation at review: `node tests/integrity.mjs` exit 0.

**End of review record.**
