# Code Quality Review — After ROI Execution (P1)

**Date:** 2026-07-16 (post W1–W6 + three validation cycles)  
**Subject:** `gpt5.6-sol-action-rpg-demo` (working tree after ROI plan execution)  
**Baseline review:** [code-quality-review-2026-07-16.md](./code-quality-review-2026-07-16.md)  
**Execution plan (done):** [code-quality-roi-execution.md](./code-quality-roi-execution.md)  
**Next plan (executed N1–N5):** [code-quality-next-roi.md](./code-quality-next-roi.md)  
**Lens:** Same as the cold review — can this browser ARPG demo keep growing without collapsing, not “ideal engine purity”.  
**Scope:** Feasible improvements only. No rewrite fantasy.

**Related:**

- [architecture-template-boundary.md](../architecture-template-boundary.md) — LOCKED template vs game  
- [architecture.md](../architecture.md) — layering  
- [config-and-tuning.md](../config-and-tuning.md) — frozen config tables  

---

## 1. Overall scores (out of 5) — before vs after

| Axis | Before | After | Δ | One-liner (after) |
|------|-------:|------:|---:|-------------------|
| Structural intent / layering | **3.5** | **3.8** | +0.3 | Skill/boss modules + `ctx` rule; `Game` bag still central. |
| Tests / regression safety | **4.0** | **4.5** | +0.5 | boot-smoke nested; free-use guards include Loot/skillCombat. |
| Readability / module size | **2.5** | **3.3** | +0.8 | Class skill kits replace 1.4k dump; UI only partial. |
| Tunability | **3.5** | **4.0** | +0.5 | `PLAYER_GROWTH_CONFIG` joins loco/hit/feel tables. |
| Template-extract readiness | **3.0** | **3.2** | +0.2 | Docs/kit paths clearer; package still re-export monorepo. |
| Runtime quality (pools, LOD) | **3.5** | **3.5** | 0 | Out of ROI scope; unchanged. |
| **Simple average** | **3.33** | **3.72** | **+0.39** | P1 backlog largely done or partial. |

**Verdict (after):**  
Still a **production-minded mid/large demo**, held by tests and conventions — but **combat review units, growth tuning, and boot gates** are materially stronger. Remaining weakness is **UI/Game bulk + incomplete `this.game` migration**, not missing modular combat structure.

**Verdict (before, for comparison):**  
Size-taxed, structure-aware; core weakness **file bulk + implicit Game mediation**.

---

## 2. What improved (do not underrate)

1. **Active skills by class** — `activeSkillMethods.js` is a re-export; kits live under `js/systems/combat/skills/*`.  
2. **Enemy boss skills extracted** — `js/systems/combat/enemySkills.js` with `(this.ctx ?? this.game)` preference.  
3. **Growth curves table-driven** — `PLAYER_GROWTH_CONFIG` in `js/config.js`, wired in `Player.js` (parity-preserving).  
4. **Boot smoke locked** — `tests/boot-smoke.mjs` nested under `integrity.mjs`.  
5. **UI extraction started safely** — `uiShared.js`, `panels/deathOverlay.js`, `panels/debugHud.js`; facade `UI` kept.  
6. **Regression learning applied** — after a real browser failure (`weaponEnhanceCost` missing), `import-integrity` free-use catalog expanded to **LootSystem + skillCombat**.  
7. **Validation evidence** — three cycles: integrity green; class visual smoke pass; level-100 matrix 64 resolver + 48 runtime rows, 0 failures (twice).

---

## 3. P1 backlog status (from cold review §3 / ROI plan)

| # | Issue (before) | Status | After |
|---|----------------|:------:|-------|
| **3.1** | UI ~1554 / Game ~1187 overload | **Partial** | UI **1408** + shared/panels; **Game untouched** |
| **3.2** | Combat + monolithic active skills | **Done** | activeSkills **5-line re-export**; class kits; Combat **1369**; enemy extract |
| **3.3** | `this.game.*` habit | **Partial** | AGENTS rule + skill/energy/boss call-site preference; no repo-wide codemod |
| **3.4** | Constants half-done | **Growth done** | `PLAYER_GROWTH_CONFIG`; skill VFX magic / UI timings remain local |

---

## 4. Hotspot LOC snapshot

| File / surface | Before ~LOC | After ~LOC | Notes |
|----------------|------------:|-----------:|-------|
| `js/ui/UI.js` | 1554 | **1408** | Helpers + death/debug panels |
| `js/ui/uiShared.js` | — | 160 | New |
| `js/ui/panels/*` | — | ~75 | death + debug |
| `js/systems/CombatSystem.js` | 1495 | **1369** | Boss block out |
| `js/systems/combat/activeSkillMethods.js` | **1389** | **5** | Re-export only |
| `js/systems/combat/skills/*` | — | **~1437** sum | Review-by-class |
| `js/systems/combat/enemySkills.js` | (in Combat) | **141** | Extracted |
| `js/data/content.js` | 1352 | 1352 | Unchanged |
| `js/core/Game.js` | 1187 | 1187 | Unchanged |
| `js/entities/Player.js` | 1185 | 1191 | Growth wiring only |
| `js/config.js` | 375 | 400 | Growth table |

---

## 5. Test / regression net

| Check | Before | After |
|-------|--------|-------|
| integrity hub | skill-combat, presentation, template-boundary, import-integrity | **+ boot-smoke** |
| Free-use import guard | content + config | **+ LootSystem + skillCombat** |
| Skill source audit | single active file | **skills/* + enemySkills** |
| template-boundary skill layout | whirlwind body in active file | **class kits + re-export** |
| Mandatory Playwright gate | No | Still optional outside integrity |
| Browser evidence (this work) | Partial | class smoke pass; level100 matrix 0 failures ×2 |

---

## 6. Architecture scoreboard (qualitative)

```
                    Before           After
Intended layers     ████████░░       ████████░░
Actual coupling     █████░░░░░       ██████░░░░
Module size         ████░░░░░░       ██████░░░░
Tuning / constants  ███████░░░       ████████░░
Test safety net     ████████░░       █████████░
Template reuse      █████░░░░░       █████░░░░░
```

| Question | Before | After |
|----------|--------|-------|
| Well-built demo? | Yes | Yes |
| High code quality? | Structure-aware, size-taxed | Same, **less combat size-tax** |
| Immediate refactor hell? | No | No (thicker gates) |

---

## 7. Remaining debt (next ROI candidates)

### Still high ROI (ordered)

| Rank | Work | Est. | Why now |
|-----:|------|------|---------|
| **1** | Finish UI panel split (`inventory`, `skills`, `title`, HUD overlays) | 1–2 d | W1 only partial; largest remaining merge-conflict surface |
| **2** | `Game.js` mode start/end helpers (Hunt/Defense/Rush) | 1 d | Same overload class as UI; leave frame loop |
| **3** | Incremental `this.ctx` on other touched systems (not full codemod) | 0.5–1 d | Extend W4 pattern when files are open |
| **4** | Optional: nest a thin Playwright “title → one skill” under a non-blocking script | 0.5 d | Integrity stays free of Playwright cost |

### P2 (spare cycles) — unchanged honesty

| Issue | Take |
|-------|------|
| `content.js` size | Data dump OK; split by class/zone only if edit pain rises |
| `Player.js` / `Enemy.js` mix | Extract helpers when next feature touches them |
| Effects recipe registration by class | Nice; not blocking growth |
| Physical monorepo extract of template-3d | Dedicated sprint only |

### Still reject

- Full DI / ECS  
- Whole-repo TypeScript  
- Full `this.game` → `this.ctx` mechanical PR  
- Balance retune under “refactor”  

---

## 8. Final line

Quality level remains **“mid/large demo held by tests and conventions”**, with a clear step up on **combat modularity, growth tunability, and boot regression locks**.  
The cold review’s P1 list is **largely executed**; the next structural tax to shave is **UI (complete panels) then Game mode helpers**.

Validation at after-review: integrity green; boot-smoke / skill-combat / template-boundary green; class visual smoke and level-100 runtime matrix green (evidence under `/tmp/sol-roi-c*`).

**End of after-ROI review record.**
