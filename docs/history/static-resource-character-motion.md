# Plan · Static-Resource Character Motion (Diablo-lite)

**Status:** S1–S4 implemented (2026-07-16) — walk locomotion, denser combat keys, idle polish, hit_light/hit_heavy + death densify  
**Captured:** 2026-07-16  
**Language:** English (project docs policy)  
**Audience:** content designers, motion authors, agents implementing bake + light wiring only  

**Related (implemented baseline):**

- [characters-visual.md](../characters-visual.md) — clip catalogs, bake entry points  
- [combat.md](../combat.md) — cast / attack flow, timeline hits  
- [skill-motion-spectacle.md](./skill-motion-spectacle.md) — skill identity + presentation standard  
- [presentation-and-motion-backlog.md](./presentation-and-motion-backlog.md) — shipped VFX / hit-feel / pose-bake pass  
- [level-100-skill-evolution/motion-vfx.md](./level-100-skill-evolution/motion-vfx.md) — motion tiers, asset-free clip reuse  

**Hard project constraints (unchanged):**

| Rule | Detail |
|------|--------|
| No camera shake / hitStop | `Game.shake` / `Game.hitStop` stay no-ops |
| No CDN | Three.js from `vendor/` only |
| Keyboard combat facing | No mouse free-aim reticle |
| English docs · English UI | Project policy |
| Combat authority | Hits stay in `CombatSystem`; motion sells timing |
| Validation | Content/path/clip work runs `node tests/integrity.mjs` |

---

## 1. Purpose

Make hero movement and combat **more varied and readable** in a Diablo-like ARPG sense—class posture, weighty attacks, distinct skill silhouettes—**using only static resources** the project already owns:

1. **Procedurally authored keyframe clips** baked into hero GLBs (`tools/assets/generate_assets.mjs` → `assets/models/hero/*`)  
2. **Manifest clip maps** (`assets/manifests/assets.json` `animationMap`)  
3. **Content fields** that name clips and timelines (`js/data/content.js` skills / class data)  
4. **Minimal runtime selection** that only *chooses* among baked clips (thresholds, fallbacks, recovery name)—not a new animation architecture  

This document is the **final filtered plan**: everything that depends on complex runtime systems is recorded as **out of scope**, so implementers do not accidentally scope-creep into blend trees, bone masks, or procedural physics.

---

## 2. What “static resource” means here

### 2.1 In scope (static or static-driven)

| Asset / data | Role |
|--------------|------|
| GLB `AnimationClip` tracks | Pose sequences for locomotion, attacks, skills, reactions |
| Bake source poses | `classWeaponHold`, `buildClassCombatClipSpecs`, `heroAnimations`, skill pose tables |
| `HERO_SHARED_CLIPS` / `HERO_CLASS_CLIPS` | Which clip names survive per-class filter |
| `assets.json` `animationMap` | Runtime name → clip binding |
| `SKILLS[].anim`, `animFallback`, form anim tiers | Which one-shot plays |
| `timeline.hits` (normalized) | When combat fires relative to the baked clip |
| Optional content motion metadata | e.g. recovery fallback clip name, discrete speed band names |
| Discrete locomotion **selection** | At runtime: pick `idle` / `walk` / `run` / `sprint` by speed thresholds and play one looping clip with existing `crossFade` |

“Static-driven” allows **small** controller edits that map numbers → clip names. It does **not** allow redesigning the mixer into multi-layer weighted systems.

### 2.2 Out of scope (explicitly excluded from this plan)

These ideas appeared in research and earlier design notes. They are **not** part of this delivery plan.

| Idea | Why excluded |
|------|----------------|
| Multi-action **BlendSpace1D** (simultaneous weighted idle+walk+run) | Runtime architecture; needs continuous weight graphs, debugging, edge cases |
| Upper / lower body **bone masks** or dual mixers | Three.js has no first-class Avatar Mask; high cost, flicker risk |
| `AdditiveAnimationBlendMode` breath / aim offsets | Needs rest-delta clips + layer policy; not “drop in a GLB clip” |
| Procedural cape / hair **springs** after mixer | Dynamic secondary motion, not a static resource |
| Foot IK, slope alignment, foot-phase retarget at blend | Dynamic / IK systems |
| 8-way strafe / directional blend spaces | Content + runtime explosion; facing contract is keyboard combat |
| External mocap packs / retarget pipeline | Production path, not static bake-only demo pipeline |
| Physics cloth, soft-body, blendshapes | Outside SDF hero topology |
| Re-enable shake / hitStop | Project hard policy |
| Mouse aim locomotion | Facing lock |

**Principle:** If the player cannot feel the upgrade after a **rebake + integrity** with only threshold-based clip selection, it does not belong in this plan.

---

## 3. Product definition (Diablo-lite, static-only)

### 3.1 Target feel

> Within half a second, the player should recognize **class posture** at rest, **walk vs run** without mistaking slow-mo run for walk, and **distinct attack / skill silhouettes**. Combat remains **committed** (full-body one-shots), not free-move third-person action.

This matches Diablo-genre emphasis: **readable skills and weapon holds**, not Souls-like free locomotion during every swing.

### 3.2 Success criteria (player-facing)

| # | Criterion | How static resources deliver it |
|---|-----------|----------------------------------|
| 1 | Class identity at rest | Denser / clearer `idle` hold per class (already partially shipped via `classWeaponHold`) |
| 2 | True walk gait | New baked `walk` clip + discrete speed band |
| 3 | Combo reads as chain, not clone | Denser `attack_*` / `cast_*` keys + settle → next attack start pose continuity in bake |
| 4 | Skills remain unique silhouettes | Existing unique `skill_*` clips; denser wind-up / settle keys only |
| 5 | Damage after pose wind-up | Keep / tighten `timeline.hits` vs bake contact keys (data + bake alignment) |
| 6 | Return to combat-ready rest | Recovery fallback clip name → `idle` hold that is combat-ready (no T-pose arms) |
| 7 | Optional hit variety | Extra baked reaction clips (`hit_light` / `hit_heavy`) selected by damage tier |

### 3.3 Non-goals (product)

- AAA Diablo IV mocap fidelity  
- Move-and-cast upper-body overlay as a system  
- Strafe / backpedal library  
- Living secondary cloth simulation  

---

## 4. Current baseline (As-Is)

### 4.1 Pipeline

```
tools/assets/generate_assets.mjs
  heroSkeleton() + classWeaponHold() + buildClassCombatClipSpecs() + heroAnimations()
        ↓ bake
assets/models/hero/{aerin,wizard,rogue,ranger}_lod*.glb
        ↓ animationMap
CharacterFactory → CharacterAnimationController (single current action + crossFade)
        ↓
Player.tryAttack / trySkill / setLocomotion
        ↓
CombatSystem (timeline via scheduleNormalized)
```

### 4.2 Runtime animation API (keep)

| API | Behavior relevant to this plan |
|-----|--------------------------------|
| `play` / `playOneShot` | Single primary action; cross-fade; one-shot blocks locomotion |
| `setLocomotion(speed, { sprint })` | Today: idle / run / sprint only; one-shot freezes locomotion |
| `scheduleNormalized` | Skill hit phases tied to clip progress |
| Distance tick throttle | Keep; do not invent new update graphs |

### 4.3 Shared clip inventory (today)

| Category | Clips |
|----------|--------|
| Locomotion | `idle`, `run`, `sprint` |
| Reaction | `dodge`, `hit`, `death` |
| Melee basic | `attack_1`–`attack_7` (knight, rogue) |
| Magic/ranged basic | `cast_1`–`cast_4` + `attack_*` fallbacks |
| Skills | Class-unique `skill_*` (4 actives each) |

### 4.4 Already shipped strengths (do not regress)

- Per-class weapon holds (`classWeaponHold`)  
- Full-body attack/cast structure with hold-forward omitted bones  
- Class-unique skill clip names (wizard must not permanently alias knight `skill_*`)  
- Pose-synced skill hits (`timeline.hits` + `scheduleNormalized`)  
- Presentation stack (trails, stagger, recipes)—see presentation backlog  

### 4.5 Residual gaps solvable with static resources

| Gap | Static fix |
|-----|------------|
| No true walk | Bake `walk`; discrete threshold in `setLocomotion` |
| Sparse keys on some skills / attacks | Add anticipation / mid / settle keys in bake tables |
| Combo steps may still feel samey at a glance | Strengthen weight shift + arc contrast per `attack_N` in bake |
| Single `hit` reaction | Bake `hit_light` / `hit_heavy` (or keep one `hit` and improve keys only) |
| Recovery always names `idle` | Ensure idle **is** combat hold; optional content field for fallback name |
| Walk period vs run period mismatch | Author walk cycle length as a clean ratio to run (authoring discipline, not runtime phase match) |

---

## 5. Design decisions (locked)

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | **Full-body commit combat stays** | Diablo-like; matches current controller; no bone masks |
| D2 | **Locomotion stays single looping clip** | Discrete bands with existing crossFade only |
| D3 | **All new poses live in bake tables** | Single source of truth; rebake heroes |
| D4 | **Clip name stability** | Renames require Player, content, animationMap, tests together |
| D5 | **Combat authority unchanged** | Never move hit resolution into animation code |
| D6 | **Prefer denser keys over more systems** | Sparse arm-only motion is the main “wooden” feel |
| D7 | **Clip budget per class stays lean** | Shared filter + per-class combat subset |
| D8 | **Level 60/100 may keep shared-family clips** | Asset-free evolution exception remains valid; optional later unique bakes |

---

## 6. Static deliverables

### 6.1 New / upgraded clip catalog

#### Shared locomotion & reaction (all heroes)

| Clip | Action | Priority | Notes |
|------|--------|----------|-------|
| `idle` | Upgrade density / hold clarity | P0 | Must equal class combat-ready rest (already the design intent) |
| `walk` | **New** | **P0** | Loop; weapon hold preserved; shorter stride than `run` |
| `run` | Polish keys if needed | P1 | Keep nominal energy; match hold arms |
| `sprint` | Polish keys if needed | P1 | Forward lean; hold arms |
| `dodge` | Optional polish | P2 | Existing dash one-shot |
| `hit` | Polish or split | P1 | Prefer denser single clip first; split only if selection is wired |
| `hit_light` | Optional new | P2 | Only if Player/Enemy select by severity |
| `hit_heavy` | Optional new | P2 | Same |
| `death` | Optional polish | P2 | Keep long settle |

#### Class combat (no new skill *names* required for P0)

| Class | Clips | Static work |
|-------|-------|-------------|
| Knight (`aerin`) | `attack_1`–`attack_7`, 4× `skill_*` | Key density + settle continuity |
| Rogue | `attack_1`–`attack_7`, 4× `skill_*` | L/R readability; return to crouch rest |
| Wizard | `cast_1`–`cast_4`, `attack_1`–`attack_4`, 4× `skill_*` | Cast compression/release; no knight skill aliases |
| Ranger | same pattern as wizard + ranger skills | Draw → release readable on `cast_*` / bow skills |

**Do not** add Level 60/100 unique clip *names* in this plan unless replacing asset-free reuse is explicitly requested later. The evolution table may keep mapping to existing family clips.

### 6.2 Clip budget target

| Stage | Approx. clips / hero GLB | Comment |
|-------|--------------------------|---------|
| Today | ~17–18 | Shared 6 + class combat |
| After P0 (`walk` only) | ~18–19 | +1 shared locomotion |
| After P2 (optional hit split) | ~20–21 | +1–2 reactions |
| Hard ceiling for this plan | **24** | Reject catalogs that push past without cutting dead clips |

### 6.3 Bake quality bar (authoring contract)

Every combat / skill clip must express:

```
anticipation → contact → follow-through → settle(to class rest)
```

| Metric | Minimum | Preferred |
|--------|---------|-----------|
| Keys on basic attack | 5 | 6–8 |
| Keys on skill | 5 | 6–8 |
| Pelvis / leg weight at contact | Present | Clear planted side |
| Arms-only mid frames | Forbidden as sole motion | Always include spine/chest |
| Final settle vs class rest | Visually continuous | Average bone error “small” (no T-pose arms) |
| `walk` cycle | ≥ 4 pose samples | L/R plants readable |
| First skill contact vs `timeline.hits[0]` | Contact on or after hit time | Align in bake review |

**Animation principles applied only via keys (no runtime):**

- **Anticipation:** short for basic attacks (~10–20% of clip); longer for skills  
- **Follow-through:** sell weapon weight after contact  
- **Staging:** top-down-readable arcs (tip height, torso twist)  
- **Overlap:** cape/hair keyed slightly lagging body on big motions (static keys, not springs)  

### 6.4 Class motion vocabulary (static pose language)

| Class | Idle / walk hold | Attack language | Skill language |
|-------|------------------|-----------------|----------------|
| Knight | Guard, wide base, shield-side readiness | Low-to-high steel, planted finishers | Spin / crescent / leap / rain—full body |
| Rogue | Dual crouch, narrow base | Alternating hands, short settle | Cross cuts, step skills—no fake single-blade dual |
| Wizard | Staff-forward, soft knees | Cast compress → release | Element silhouette (in / out / blink / overhead) |
| Ranger | Bow-ready, stable hips | Draw weight → release | Shot / trap / vault / mark—release before projectile fantasy |

### 6.5 Locomotion bands (discrete, static clips)

Runtime only **selects** one loop. Weights stay 0 or 1 (plus existing crossFade during transition).

| Band | Condition (guidance) | Clip |
|------|----------------------|------|
| Idle | `speed < ~0.18` | `idle` |
| Walk | `~0.18 ≤ speed < ~0.42 × referenceRun` | `walk` (fallback: `run` if missing) |
| Run | mid band | `run` |
| Sprint | existing sprint rule (`speed > ref × 1.22` or sprint flag) | `sprint` |

**Authoring for clean transitions without blend spaces:**

- Walk cycle duration chosen so crossFade (~0.12–0.18s) does not look like a foot teleport  
- Walk arm hold = class weapon hold (same as idle/run)  
- Prefer hysteresis constants in controller (~0.05–0.08 speed units) so bands do not chatter—**small logic, not a blend graph**

### 6.6 Content / data fields (static metadata only)

Allowed additive fields (names illustrative; implement when coding):

```js
// On skill form / SKILLS entry — optional
anim: 'skill_fireball',
animFallback: 'cast_2',
// Optional recovery clip name after one-shot (default 'idle')
animRecovery: 'idle',

// Timeline stays authoritative for hits
timeline: { hits: [0.34, 0.62], ... }
```

**Not in this plan:** `mask`, `replaceMode: 'upper'`, additive weights, move-while-cast bone policies.

Basic attack clip choice remains level/combo driven (`attack_N` / `cast_N`) as today.

### 6.7 Minimal runtime wiring (allowed)

Only the following controller / Player touches are in scope, and only to **consume** static clips:

| Change | File(s) | Limit |
|--------|---------|--------|
| Recognize `walk` in `setLocomotion` | `CharacterAnimationController.js` | Discrete band + hysteresis; no multi-weight |
| Fallback if `walk` missing | same | Use `run` |
| Recovery fallback name | `Player.js` one-shot options | Default `idle` |
| Optional hit clip pick | `Player.js` on damage | Map severity → `hit` / `hit_light` / `hit_heavy` if present |
| Register new names | `HERO_SHARED_CLIPS`, `assets.json` | Required for bake survival |
| Tests | `tests/presentation-motion.mjs`, integrity | Assert clip presence + map sync |

No new animation subsystem class is required for this plan.

---

## 7. Implementation packages (static-only)

### Package S0 — Inventory & contracts (docs + tests stubs)

| Exit | Evidence |
|------|----------|
| This plan linked from docs hub | `docs/README.md` |
| Clip name list frozen for S1 | Section 6.1 |
| No regression of unique skill anim names | Existing skill-combat tests stay green |

### Package S1 — Walk + locomotion band (P0)

| Work | Where |
|------|--------|
| Author `walk` loop per class hold | `generate_assets.mjs` (`buildClassWalkClip` or equivalent) |
| Add `walk` to `HERO_SHARED_CLIPS` | bake filter |
| Rebake all hero LODs | `node tools/assets/generate_assets.mjs --heroes-only` |
| Update `animationMap` | `assets.json` (or generator output) |
| Discrete walk band in `setLocomotion` | `CharacterAnimationController.js` |
| Tests: every hero map has `walk` | integrity / presentation-motion |

**Player feel:** slow movement no longer looks like a slowed run cycle.

### Package S2 — Combat key density & settle continuity (P0–P1)

| Work | Where |
|------|--------|
| Raise key counts on weak attacks/skills | `buildClassCombatClipSpecs`, skill blocks in `heroAnimations` |
| Ensure attack_N end ≈ attack_(N+1) start rest | bake tables |
| Ensure skill end ≈ class idle rest | bake tables |
| Align first contact key with `timeline.hits[0]` per skill | content + bake review |
| Rebake heroes | assets |

**Player feel:** less wooden; combos and skills read weight without new systems.

### Package S3 — Idle / recovery polish (P1)

| Work | Where |
|------|--------|
| Idle breath-like A/B keys denser if flat | `buildClassIdleClip` / hold a–b |
| Confirm one-shot `fallback: 'idle'` lands on combat hold | already intended; verify after rebake |
| Optional `animRecovery` only if a second rest clip is introduced | content + Player; **default stay on single `idle`** |

**Note:** Introducing a separate `combat_idle` clip is **optional**. Prefer upgrading `idle` to combat-ready (current design) to avoid catalog bloat. Only split if non-combat idle is later required.

### Package S4 — Reaction variety (P2, optional)

| Work | Where |
|------|--------|
| Improve single `hit` keys (direction-neutral but stronger) | bake |
| **Or** add `hit_light` / `hit_heavy` | bake + shared list + Player selection |
| Death polish | bake only if free capacity |

Enemy directional *mesh* stagger already exists; hero reactions stay clip-based.

### Package S5 — Validation & docs sync (always with S1–S4)

| Work | Where |
|------|--------|
| `node tests/integrity.mjs` | CI habit |
| Update [characters-visual.md](../characters-visual.md) clip list when `walk` ships | docs |
| Keep English UI/notifications | no copy change required for motion |

---

## 8. File map (touch surface)

```
tools/assets/generate_assets.mjs   # primary authoring surface
assets/models/hero/*_lod0.glb      # baked output (commit with ship)
assets/models/hero/*_lod1.glb
assets/manifests/assets.json       # animationMap names
js/characters/CharacterAnimationController.js  # walk band only
js/entities/Player.js              # optional recovery / hit clip pick
js/data/content.js                 # timeline / anim names only if aligning hits
tests/presentation-motion.mjs      # assert walk / shared clips
tests/integrity.mjs                # nest checks
docs/characters-visual.md          # catalog
docs/history/static-resource-character-motion.md  # this file
```

**Do not touch for this plan:** `Effects.js` recipes (already shipped), terrain, camera shake, vendor Three, dual-mixer experiments, cloth systems.

---

## 9. Worked example — adding `walk` (agent checklist)

1. Implement `buildClassWalkClip(skeletonInfo, classId, F)` using `classWeaponHold` arm holds + leg cycle.  
2. Push into `heroAnimations` after idle/run builders.  
3. Append `'walk'` to `HERO_SHARED_CLIPS`.  
4. Run `node tools/assets/generate_assets.mjs --heroes-only`.  
5. Confirm each hero GLB lists `walk` (loader / integrity).  
6. In `setLocomotion`, insert walk band with hysteresis; if `!has('walk')` use `run`.  
7. Do **not** change combat one-shot lock behavior.  
8. `node tests/integrity.mjs`.  
9. Update `characters-visual.md` shared locomotion line to include `walk`.  

---

## 10. Risks & mitigations (static plan)

| Risk | Mitigation |
|------|------------|
| GLB size growth | +1 loop clip is small; avoid optional hit splits if budget tight |
| Walk looks like mini-run | Author shorter stride, lower arm pump, longer cycle |
| Threshold chatter idle↔walk | Hysteresis in `setLocomotion` |
| Settle pop after skill | Final skill keys must merge into class rest |
| Timeline vs pose desync after denser keys | Re-check `hits[0]` against contact key time |
| Accidental architecture creep | Reject PRs that add multi-weight locomotion or bone masks under this plan’s name |
| Class filter drops new shared clip | Always update `HERO_SHARED_CLIPS` |

---

## 11. Acceptance checklist (plan complete when…)

### S1 (must ship for “locomotion win”)

- [x] `walk` baked for aerin, wizard, rogue, ranger (all LODs used in play)  
- [x] `animationMap` / integrity see `walk`  
- [x] Discrete walk band active with fallback  
- [x] One-shot still suppresses locomotion  
- [x] No new VFX/audio requirements  

### S2 (must ship for “combat finesse win”)

- [x] Attack/skill clips meet key-count guidance for classes touched  
- [x] Visual review: no arms-only wooden mid-poses on flagship skills  
- [x] `timeline.hits` still valid; integrity/skill-combat green  

### S3–S4

- [x] Idle read as combat-ready (denser A/B idle keys)  
- [x] Optional hit variety: `hit_light` / `hit` / `hit_heavy` + Player severity pick + denser death  

### Global

- [x] Docs catalog updated  
- [x] No shake/hitStop/CDN/vendor edits  
- [x] Git commit includes hero GLBs when shipping  

---

## 12. Priority order (final)

| Order | Package | Why |
|-------|---------|-----|
| 1 | **S1 Walk** | Highest “alive character” gain per static clip |
| 2 | **S2 Key density + settle** | Highest combat weight gain without new systems |
| 3 | **S3 Idle polish** | Cheap if S2 already touches holds |
| 4 | **S4 Hit variants** | Optional; single improved `hit` is enough for many sessions |
| — | Everything in §2.2 | **Not this plan** |

---

## 13. Relationship to earlier broader designs

Earlier analysis discussed multi-weight BlendSpace1D, additive breath, procedural cape springs, and upper-body cast-while-move. Those remain **valid long-term research notes** but are **outside this document’s delivery scope**.

| Broader idea | Static substitute in this plan |
|--------------|--------------------------------|
| Weighted walk/run blend | Discrete `walk` + crossFade |
| Additive breath | Slightly larger idle A/B keys |
| Procedural cape | Extra lag keys on big combat frames only |
| Upper-body cast while moving | Keep full-body commit + existing move slow |
| Foot phase matching | Author walk/run periods carefully |
| Mocap | Future production path; not required |

If a future project revisits runtime layering, open a **new** plan; do not silently expand this one.

---

## 14. Summary

This plan upgrades Diablo-like character motion **only through baked clips, manifest maps, content clip/timeline fields, and minimal discrete clip selection**.

**Ship S1 + S2** to capture most of the perceived quality gain. Defer every runtime animation architecture topic. Preserve combat authority, class-unique skill clip names, and existing presentation systems.

**Implementation entry point:** `tools/assets/generate_assets.mjs` + `CharacterAnimationController.setLocomotion` walk band + rebake + integrity.
