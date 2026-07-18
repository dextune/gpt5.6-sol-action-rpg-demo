# Combat Action Motion Upgrade — Full Specification

**Status:** executed (3 hardening passes complete; gates green)  
**Captured:** 2026-07-16  
**Language:** English (project docs policy)  
**Audience:** implementers, motion authors, agents  

**One-line goal:** Make **basic attacks and active skills** feel precise, weighty, class-distinct, and fun—using this project’s **bake-first Diablo-lite** pipeline—without rebuilding animation architecture or breaking combat authority.

---

## Document map

| Section | Contents |
|---------|----------|
| §1 | Product intent & problem statement |
| §2 | What already shipped (do not redo) |
| §3 | Industry research synthesis |
| §4 | Why previous “out of scope” items stay out (unless promoted) |
| §5 | Project locks & architecture |
| §6 | As-is pipeline & residual gaps |
| §7 | Goals / non-goals / success criteria |
| §8 | Design decisions (locked for this upgrade) |
| §9 | Motion quality bar (phases, timing, keys) |
| §10 | Class identity cards |
| §11 | Basic combo grammar |
| §12 | Skill motion grammar |
| §13 | Presentation lockstep (VFX / audio / hit react) |
| §14 | Workstreams & delivery slices |
| §15 | File map & rebake procedure |
| §16 | Validation matrix |
| §17 | Risks, stop rules, first actions |
| §18 | References |

**Related living guides:** [characters-visual.md](../characters-visual.md) · [combat.md](../combat.md) · [graphics-vfx.md](../graphics-vfx.md) · [audio.md](../audio.md) · [extension-playbooks.md](../extension-playbooks.md) §3  

**Related history (shipped):**  
[static-resource-character-motion.md](../history/static-resource-character-motion.md) ·  
[skill-motion-spectacle.md](../history/skill-motion-spectacle.md) ·  
[presentation-and-motion-backlog.md](../history/presentation-and-motion-backlog.md) ·  
[level-100-skill-evolution/](../history/level-100-skill-evolution/README.md)

---

## 1. Product intent & problem statement

### 1.1 Intent

This is a **browser Sol action RPG demo** with Hunt / Defense, four hero classes, keyboard combat facing, and pooled VFX. Combat must feel like a **Diablo-like ARPG**: readable skills, committed full-body actions, class fantasy in every click—not a Souls-like free-locomotion fighter and not a pure particle slideshow.

Players should feel:

1. **Weight** on knight finishers and heavy skills.  
2. **Speed and dual-line clarity** on rogue.  
3. **Cast / release** on wizard, not melee chops with a staff.  
4. **Draw / release** on ranger.  
5. **Skill body beats** that remain recognizable even when particle quality is medium/low.

### 1.2 Problem (player-facing)

Despite prior motion work, **strikes and skills can still feel simple and boring**:

- Basic combo steps look like reskins of the same arm arc.  
- Contact does not always coincide with the most extreme body silhouette.  
- Skills are sold more by **recipes** than by **body progression**.  
- Class mass differences are weak in **timing curves** (anticipation length, contact snap, recovery cost).  
- Recovery often returns to a generic ready pose without follow-through contrast.

### 1.3 Scope of this upgrade

| In | Out (see §4) |
|----|----------------|
| Densify / re-time **basic attack** and **skill** bake keys | Blend trees, bone masks, dual mixers |
| Class **motion timing profiles** | Mouse free-aim locomotion |
| Align `timeline.hits` / basic pulses to **contact** | Mocap pipeline, cloth, IK feet |
| Thin VFX/SFX lockstep after body work | Balance damage retune “while animating” |
| Rebake hero GLBs | Camera shake / hitStop re-enable |
| Docs + integrity gates | New hero class, new skill keys |

---

## 2. What already shipped (do not redo)

Treat these as **baseline**, not open todos.

### 2.1 Static-resource motion S1–S4 (history)

| Shipped | Result |
|---------|--------|
| Walk locomotion band | Discrete idle / walk / run / sprint with hysteresis |
| Denser idle / combat pose keys | Less wooden holds |
| `hit_light` / `hit_heavy` | Severity-based hit react selection |
| Death densify | Longer readable settle |
| `LOCOMOTION_CONFIG` | Template-safe scale table |

See [static-resource-character-motion.md](../history/static-resource-character-motion.md).

### 2.2 Skill spectacle & evolution (history)

| Shipped | Result |
|---------|--------|
| Class-unique skill anim names | Wizard must not alias knight `skill_*` permanently |
| Identity recipes + themes + SFX banks | Spectacle language per skill |
| L20/60/100 forms + 40/80 mutations | Evolution system complete for scoped release |
| Asset-free L60/100 clip mapping | Forms reuse family clips (optional unique bakes later) |
| `scheduleNormalized` + `timeline.hits` | Pose-synced skill phases |

See [skill-motion-spectacle.md](../history/skill-motion-spectacle.md) and L100 pack.

### 2.3 Presentation / hit-feel (history)

Swing trails, multihit coalesce, stagger direction, multikill bursts, kill-chain juice—already in the presentation backlog ship. This upgrade **does not replace** that stack; it makes **body motion** worthy of those effects.

### 2.4 Code-quality structure (current tree)

UI panels, `gameModes`, `killFeedback`, combat kits under `js/systems/combat/` are structural refactors. Motion work should not re-merge those files; touch only motion-related paths listed in §15.

---

## 3. Industry research synthesis

### 3.1 Anatomy of an attack (universal)

Combat design literature and action-game practice converge on three phases ([Anatomy of an Attack](https://gdkeys.com/keys-to-combat-design-1-anatomy-of-an-attack/)):

| Phase | Job | Animation | If weak… |
|-------|-----|-----------|----------|
| **Anticipation** | Promise power + identity | Unique coil silhouette, weight shift | Flat spam, no weight |
| **Attack / contact** | Instant readable impact | Fast spacing into extreme contact pose; clear hit direction | Soft, mushy hits |
| **Recovery** | Cost + return to ready | Follow-through into combat-ready hold | Sticky, floaty, or T-pose arms |

Additional research takeaways:

1. **Player windups stay short**; enemy telegraphs stay longer (fairness vs responsiveness).  
2. **Contact may “cheat” physics**—snapping into impact pose often reads stronger than a long realistic arc.  
3. **Frequent actions must stay short** (ARPGs spam basics); lead-in consistency matters more than cinematic length.  
4. **Silhouette > finger detail**—shoulders, hips, weapon plane.  
5. **Motion and VFX share one beat**—body peak with impact recipe, not after.  
6. **Timing is spacing**, not only key count—slow-in on coil, fast into contact, slow-out on settle.

### 3.2 Genre positioning

| Reference pattern | Use? | Note |
|-------------------|------|------|
| Diablo-like committed full-body skills | **Yes** | Matches one-shot controller |
| Hades-like short responsive basics | **Partially** | Keep basics snappy; still full-body |
| Souls deliberate windups | **Enemy / finisher only** | Not every basic |
| Fighter frame data (startup/active/recovery) | **As authoring language** | Not as netcode |
| AAA mocap secondary motion | **No** | Pipeline is procedural bake |

**Target feel sentence:**

> Within ~0.15–0.25 s of a basic click, the player sees a class-specific coil; contact is a sharp silhouette change aligned with damage; recovery returns to a combat-ready hold that looks ready to act again.

### 3.3 Timing language (normalized clip 0–1)

| Role | Basic light | Basic heavy / finisher | Active skill | Apex / multi-phase |
|------|-------------|------------------------|--------------|--------------------|
| Anticipation | 15–25% | 22–32% | 18–30% | 20–35% per phase body peak |
| Contact window | 5–12% | 8–15% | 8–18% | per act |
| Recovery | remainder | remainder | remainder | remainder |

Class bias (relative):

| Class | Anti | Contact snap | Recovery |
|-------|------|--------------|----------|
| Knight | + | medium | + |
| Rogue | − | very fast | − |
| Wizard | medium (channel) | fast **release** | medium soft |
| Ranger | draw hold | fast **loose** | short re-nock |

---

## 4. Out of scope — what it means and why

These items appeared in earlier research and the static-resource plan. They remain **out of this upgrade** unless a **new dedicated plan** promotes them.

| Idea | Why excluded here |
|------|-------------------|
| BlendSpace1D (weighted idle+walk+run) | Runtime weight graph; not needed for better strikes |
| Upper/lower bone masks / dual mixers | High cost/flicker in Three.js; architecture project |
| Additive breath / aim offsets | Needs rest-delta clips + layer policy |
| Procedural cape/hair springs | Dynamic secondary motion, not bake |
| Foot IK / slope foot plant | Dynamic IK system |
| 8-way strafe blend spaces | Content explosion; keyboard facing contract |
| External mocap / retarget pipeline | Production path ≠ demo bake tables |
| Physics cloth / blendshapes | Outside SDF hero topology |
| Re-enable shake / hitStop | **Hard project policy** |
| Mouse-aim locomotion | **Facing lock** |
| Balance damage retune while animating | Separate commits only |

**Principle:** If the player cannot feel the upgrade after **rebake + integrity** with clip selection and denser keys, it does not belong in this document.

---

## 5. Project locks & architecture

| Lock | Detail |
|------|--------|
| Hit authority | `CombatSystem` + `js/systems/combat/*` only |
| Motion sells timing | Clips + `timeline.hits` / scheduleNormalized |
| Presentation | Effects recipes + audio banks; pool + quality LOD |
| Facing | Movement / combat facing; no free mouse aim |
| Camera | `Game.shake` / `Game.hitStop` no-ops |
| Git | No extra branches unless user explicitly requests |
| Docs / UI language | English |
| Template boundary | No combat motion in template packages that import content |

Dependency direction (preserve):

```
content timelines / anim names
        ↓
Player plays clip (CharacterAnimationController)
        ↓
scheduleNormalized / basic pulses
        ↓
CombatSystem damage
        ↓
Effects + audio (same beat)
```

---

## 6. As-is pipeline & residual gaps

### 6.1 Pipeline

```
tools/assets/generate_assets.mjs
  classWeaponHold()
  buildClassCombatClipSpecs()
  heroAnimations()  (+ skill pose tables)
        ↓ bake
assets/models/hero/{aerin,wizard,rogue,ranger}_lod0|1.glb
assets/manifests/assets.json  animationMap
        ↓
CharacterFactory → CharacterAnimationController
  play / playOneShot / setLocomotion / scheduleNormalized
        ↓
Player.tryAttack / trySkill
        ↓
CombatSystem (basics + skill kits + projectiles)
        ↓
Effects + AudioManager
```

### 6.2 Clip inventory (representative)

| Category | Names |
|----------|--------|
| Locomotion | `idle`, `walk`, `run`, `sprint` |
| Reaction | `dodge`, `hit`, `hit_light`, `hit_heavy`, `death` |
| Knight / rogue basics | `attack_1` … `attack_7` |
| Wizard / ranger | `cast_1` … `cast_4`, `attack_*` subset |
| Skills | 4 unique `skill_*` per class |

Clip **names stay stable** unless a coordinated rename across Player, content, manifest, tests is approved.

### 6.3 Residual gaps this upgrade owns

| Gap | Symptom | Fix layer |
|-----|---------|-----------|
| Combo homogeneity | Steps look cloned | Bake keys + class profiles |
| Weak anticipation | Arm flicks | Coil / weight keys |
| Soft contact | Damage without pose peak | Extreme contact key + timeline align |
| Same recovery | All swings end alike | Follow-through contrast |
| Skill = VFX puppet | Big FX, quiet body | Skill densify §12 |
| Class weight muddle | Same timing all classes | §10 profiles |
| Finisher weak | Last step not special | Finisher bias |
| Ranged unclear | Cast looks like melee | Draw/release grammar |

---

## 7. Goals, non-goals, success criteria

### 7.1 Goals

1. Class-readable basics without VFX.  
2. Phase-true strikes (anti → contact → recovery) on every combat one-shot.  
3. Timeline alignment: hits on contact peaks.  
4. Combo narrative: open → mid variety → finisher weight.  
5. Skill body identity for all 16 actives.  
6. Optional thin presentation lockstep after body.  
7. Integrity green; no architecture regressions.

### 7.2 Non-goals

See §4 and: new classes, new skill slots, balance retune, UI redesign, monorepo extraction.

### 7.3 Success criteria (player-facing)

| # | Criterion | Proof |
|---|-----------|--------|
| S1 | Knight feels heavier than rogue at same DPS spam rate | Side-by-side playtest |
| S2 | Rogue L/R + finisher obvious mute-VFX | Manual |
| S3 | Wizard/ranger read as cast/draw | Manual |
| S4 | Each active has a body beat at medium quality | Manual + skill list checklist |
| S5 | No damage-before-pose regressions | skill-combat + manual |
| S6 | Clip budget ≤ ~24 / hero | Bake inventory |
| S7 | `node tests/integrity.mjs` exit 0 | CI gate |

---

## 8. Design decisions (locked for this upgrade)

| ID | Decision |
|----|----------|
| **U1** | Bake-first sophistication |
| **U2** | Full-body commit combat remains |
| **U3** | Prefer denser / re-timed keys over new clip names |
| **U4** | Per-class `COMBAT_MOTION_PROFILE` timing tables in bake tooling |
| **U5** | Contact key = silhouette extreme |
| **U6** | Combat never moves into animation code |
| **U7** | Soft cap ~24 clips / hero GLB |
| **U8** | Body before VFX amplification |
| **U9** | Golden reference: **knight basics** first, then cascade |
| **U10** | L60/100 may keep asset-free family clip maps; deepen peaks on existing names |

---

## 9. Motion quality bar

### 9.1 Minimum keys per combat one-shot

| Key | Approx. t | Required content |
|-----|-----------|------------------|
| Ready | 0.0 | Class combat hold (`classWeaponHold`) |
| Anticipation peak | end of anti phase | Coil, weight shift, weapon prep |
| Contact | contact window start | Extreme pose; clear weapon/hand line |
| Follow-through | contact + small ε | Overshoot past hit |
| Settle | 0.85–1.0 | Combat-ready idle hold |

Sparse arm-only keys are **rejected** for shipping combat clips. Prefer legs / spine / head contribution.

### 9.2 Authoring helpers (to implement in bake)

Suggested tables in `generate_assets.mjs` (names illustrative):

```text
COMBAT_MOTION_PROFILE[classId] = {
  antiRatio, contactRatio, finisherAntiBoost, finisherRecoveryBoost,
  contactSnap, // relative spacing hint for key times
}
```

Shared pose builders reduce drift: `readyHold`, `coil`, `contactStrike`, `settleReady` per class.

### 9.3 Hold-forward

Keep `animationClip` hold-forward for omitted bones (do not snap missing channels to identity).

---

## 10. Class identity cards

### 10.1 Knight (`aerin`) — Iron weight

| Axis | Spec |
|------|------|
| Fantasy | Mass, wide arcs, grounded feet |
| Anti | Slow coil, high weapon, wide base |
| Contact | Heavy arc / crush line |
| Recovery | Longer; planted |
| Combo | Build into finisher (attack_7 energy) |
| Skills | Spin plane, crescent moon line, skyfall load→land, starburst open |

**Golden reference class for Wave B.**

### 10.2 Rogue — Dual haste

| Axis | Spec |
|------|------|
| Fantasy | Compact, mirrored hands, snappy |
| Anti | Short, opposite-hand prep |
| Contact | Fast blade snap; dual lines on finisher |
| Recovery | Short crouch-ready |
| Combo | Alternating main/offhand readability |
| Skills | Twin fang L/R, fan spray, shadow dash stretch, lotus multi-peak |

### 10.3 Wizard — Channel & release

| Axis | Spec |
|------|------|
| Fantasy | Gather energy → release (not sword chops) |
| Anti | Hands/orb channel, torso closed then open |
| Contact | Release snap + open chest |
| Recovery | Soft falloff to staff hold |
| Basics | `cast_1`–`4` grammar primary |
| Skills | Fireball throw line, frost open nova, blink crouch-out/rise-in, meteor overhead call |

### 10.4 Ranger — Draw & loose

| Axis | Spec |
|------|------|
| Fantasy | Bow torsion, string line, volley cadence |
| Anti | Draw / nock / shoulder set |
| Contact | Loose + slight recoil |
| Recovery | Quick re-nock ready |
| Skills | Pierce draw, trap plant, vault stretch, mark aim pose |

---

## 11. Basic combo grammar

### 11.1 Melee-like (knight, rogue)

| Step | Intent | Timing |
|------|--------|--------|
| `attack_1` | Fast entry | Short anti, crisp contact |
| `attack_2`–mid | Height / side / depth variety | Medium |
| Finisher last | Heaviest silhouette | +anti, +follow-through, +recovery |

### 11.2 Cast-like (wizard, ranger)

| Step | Intent |
|------|--------|
| `cast_1` | Short push / flick |
| `cast_2` | Side channel → release |
| `cast_3` | Dual palm / power prep |
| `cast_4` | Overhead / full power |

Map combo index to cast step per existing Player attack style rules; do not invent new clip names unless content already expects them.

### 11.3 Runtime alignment (presentation-only)

If bake contact times move:

- Basic pulse delays in combat feel config may shift slightly so FX match.  
- **Do not** change damage mults / ranges in the same change set without explicit request.

---

## 12. Skill motion grammar

### 12.1 All 16 actives

Each skill clip must satisfy §9.1. Multi-phase skills (Apex acts 0/1/2):

- One **body peak** per phase act.  
- `timeline.hits[i]` lands on that act’s contact peak.  
- Recipes for act *i* fire with or just after body peak *i*, not before anti of *i*.

### 12.2 Family emphasis

| Family | Body emphasis |
|--------|---------------|
| Spin / whirl | Torso yaw keys + weapon plane |
| Leap / skyfall | Crouch load → air stretch → land squash |
| Projectile | Shoulder/hand toward facing; release snap |
| Nova / AoE | Open torso + limbs at contact |
| Dash | Stretch into dash vector; settle ready |
| Trap / plant | Downward commitment + recover ready |
| Mark / aim | Stable aim pose; small release |

### 12.3 Evolution forms

- Prefer **deepen peaks** on existing clip names (asset-free L60/100 mapping remains valid).  
- Unique per-form clips only if a later plan authorizes budget and names.

### 12.4 Content fields to keep in sync

| Field | Owner |
|-------|--------|
| `SKILLS[].anim` / form anim maps | content |
| `timeline.hits` (normalized) | content / skillCombat resolve |
| Presentation theme / recipe / sfx | content + Effects + audio |

---

## 13. Presentation lockstep (after body)

Order is mandatory: **body first**, then:

| Layer | Action |
|-------|--------|
| Swing trail / swingArc | Offset start to contact if needed |
| Skill recipes | Act timing vs body peaks |
| Audio | Attack/skill accent near contact |
| Enemy react | Existing light/heavy selection; verify feel only |
| Float text / multikill | Unchanged systems |

Still forbidden: new PointLights for hits, shake, hitStop.

---

## 14. Workstreams & delivery slices

### Wave A — Authoring system

| ID | Task |
|----|------|
| A1 | `COMBAT_MOTION_PROFILE` per class in bake tool |
| A2 | Shared key builders (coil / contact / settle) |
| A3 | Document phase budgets next to `buildClassCombatClipSpecs` |
| A4 | Optional integrity: min key count / contact extremum smoke |

**Exit:** Profiles exist; knight can be rewritten cleanly.

### Wave B — Basic attacks

| ID | Task |
|----|------|
| B0 | **Knight** `attack_1`–`7` golden reference + rebake |
| B1 | Rogue basics (L/R + finisher) |
| B2 | Wizard `cast_*` / attack subset |
| B3 | Ranger draw/loose |
| B4 | Optional pulse delay align (presentation) |

**Exit:** Four classes distinguishable mute-VFX on basics.

### Wave C — Skills

| ID | Task |
|----|------|
| C1 | Densify all 16 skill clips to §9.1 |
| C2 | Align timelines to contact peaks |
| C3 | Form peak deepen (existing names) |
| C4 | skill-combat + presentation-motion green |

### Wave D — Presentation lockstep

| ID | Task |
|----|------|
| D1 | Trail/recipe offsets |
| D2 | Audio accents |
| D3 | Manual matrix pass |

### Wave E — Explicitly later

| Idea | Promote only with new plan |
|------|----------------------------|
| Bone mask move-and-cast | Architecture plan |
| Unique L60/100 bakes | Art budget + evolution plan amend |
| Extra attack clips beyond 7 | Content combo length change |
| Root motion steps | Locomotion plan |

### Delivery slices (recommended commits)

| Slice | Scope |
|-------|--------|
| **S0** | A + knight B0 |
| **S1** | Rogue B1 + knight polish |
| **S2** | Wizard + ranger B2–B3 |
| **S3** | Skills C1–C4 |
| **S4** | Presentation D |

Do not start S3 without S0 golden reference.

---

## 15. File map & rebake procedure

### 15.1 Primary touch set

| Path | Role |
|------|------|
| `tools/assets/generate_assets.mjs` | Profiles, combat/skill keys |
| `assets/models/hero/*_lod0.glb`, `*_lod1.glb` | Bake output |
| `assets/manifests/assets.json` | animationMap (stable names) |
| `js/data/content.js` | timelines / anim names if needed |
| `js/config.js` / `js/core/runtimeConstants.js` | Optional feel fades/pulses |
| `js/entities/Player.js` | Only if play/fallback timing needs tweak |
| `js/characters/CharacterAnimationController.js` | Prefer no API change |
| `js/systems/combat/skills/*` | Only if phase FX must match peaks |
| `js/graphics/Effects.js` | Optional recipe offsets |
| `tests/presentation-motion.mjs`, `skill-combat.mjs`, `integrity.mjs` | Gates |
| `docs/characters-visual.md`, `combat.md` | Living guide updates when shipped |

### 15.2 Rebake commands

```bash
# After authoring changes:
node tools/assets/generate_assets.mjs --heroes-only
# or class-scoped:
# node tools/assets/generate_assets.mjs --aerin-only
# node tools/assets/generate_assets.mjs --wizard-only
# node tools/assets/generate_assets.mjs --rogue-only
# node tools/assets/generate_assets.mjs --ranger-only

node tests/integrity.mjs
```

### 15.3 Clip registration

New clip **names** (if any) must enter `HERO_CLASS_CLIPS` / shared lists so per-class filter keeps them. Prefer avoiding new names in this upgrade.

---

## 16. Validation matrix

| Gate | When | Pass rule |
|------|------|-----------|
| `node tests/integrity.mjs` | Every slice | exit 0 |
| skill-combat | After C / timeline edits | exit 0 |
| presentation-motion | After bake / recipe | nested green |
| Manual mute-VFX basics | After B | class readable |
| Manual skill body beats | After C | 16 checklist |
| Perf | After full rebake | clip count + GLB sanity |
| Policy | Always | no shake/hitStop; no branch; no balance sneak |

**Mute-VFX test idea:** temporary quality low / recipe no-op not required if agent plays with eyes on body only at medium quality.

---

## 17. Risks, stop rules, first actions

### 17.1 Risks

| Risk | Mitigation |
|------|------------|
| Timeline desync (damage early) | Align hits to contact; skill-combat |
| All classes still same after densify | Enforce §10 profiles + golden knight first |
| GLB bloat | Clip budget; densify not clone |
| Scope creep into masks/IK | §4 stop rule |
| VFX-only “fake” upgrade | Body-first exit criteria |

### 17.2 Stop rules

1. If integrity red after rebake → fix bake/filter/map before continuing.  
2. If knight golden fails mute-VFX readability → do not cascade.  
3. If a task needs bone masks → stop and open a different plan; do not sneak it in.  
4. No auto-commit; no extra branches.

### 17.3 First actions when executing

1. Read this document end-to-end.  
2. Open `buildClassCombatClipSpecs` in `tools/assets/generate_assets.mjs`.  
3. Implement **Wave A** profiles.  
4. Rewrite **knight** `attack_1`–`7` as golden reference.  
5. `generate_assets.mjs --aerin-only` (or heroes-only) + integrity.  
6. Playtest; only then cascade.

---

## 18. References

### External

- [Keys to Combat Design: Anatomy of an Attack](https://gdkeys.com/keys-to-combat-design-1-anatomy-of-an-attack/) — anti / attack / recovery  
- Realtime combat design notes (lead-in / lead-out for frequent actions)  
- Animation timing principles (slow-in / slow-out, spacing vs key count)  
- Action-game player vs enemy telegraph timing conventions  

### Internal

- [static-resource-character-motion.md](../history/static-resource-character-motion.md)  
- [skill-motion-spectacle.md](../history/skill-motion-spectacle.md)  
- [presentation-and-motion-backlog.md](../history/presentation-and-motion-backlog.md)  
- [level-100-skill-evolution/README.md](../history/level-100-skill-evolution/README.md)  
- [characters-visual.md](../characters-visual.md) · [combat.md](../combat.md) · [graphics-vfx.md](../graphics-vfx.md)  
- [AGENTS.md](../../AGENTS.md)

---

## Appendix A — 16-skill body checklist (for Wave C)

Mark when densified + timeline aligned:

### Knight

- [x] whirlwind  
- [x] crescent  
- [x] skyfall  
- [x] starburst  

### Wizard

- [x] fireball  
- [x] frost_nova  
- [x] arcane_blink  
- [x] meteor_storm  

### Rogue

- [x] twin_fang  
- [x] fan_of_knives  
- [x] shadowstep  
- [x] death_lotus  

### Ranger

- [x] piercing_shot  
- [x] caltrop_trap  
- [x] vault_shot  
- [x] hunter_mark  

---

## Appendix B — Knight basic golden checklist (for Wave B0)

- [x] attack_1 entry crisp  
- [x] attack_2 distinct arc/height  
- [x] attack_3 distinct  
- [x] attack_4 distinct  
- [x] attack_5 distinct  
- [x] attack_6 distinct  
- [x] attack_7 finisher heavier + longer recovery  
- [x] all settle to combat-ready hold  
- [x] mute-VFX readable  

---

## Appendix C — Status log

| Date | Note |
|------|------|
| 2026-07-16 | Full upgrade specification written (research + prior history + execution). Implementation not started. |
| 2026-07-16 | **Shipped:** Wave A `COMBAT_MOTION_PROFILE` + phase helpers; B0–B3 class-distinct basics; C densified 16 skills + form peaks; D thin finisher fade; 3 hardening passes. Gates: integrity / skill-combat / presentation-motion green. Clip budget 20–21/hero. No blend trees / shake / hitStop. |

---

**End of Combat Action Motion Upgrade specification.**
