# Plan · Skill Content, Motion & Spectacle Upgrade

**Status:** implemented (commercial-spectacle pass: themes, recipes, statuses, unique wizard clips, anim timelines, themed SFX)  
**Guides updated for future work:** [../combat.md](../combat.md) · [../content-data.md](../content-data.md) · [../graphics-vfx.md](../graphics-vfx.md) · [../audio.md](../audio.md) · [../extension-playbooks.md](../extension-playbooks.md) §3 · [../agent/add-hero-class.md](../agent/add-hero-class.md) · [../agent/wizard-reference.md](../agent/wizard-reference.md)  
**Related:** [../characters-visual.md](../characters-visual.md) · [../agent/README.md](../agent/README.md) · [multi-class-wizard.md](./multi-class-wizard.md)  
**Constraint:** Hunt / Defense isolation · keyboard combat facing · no camera shake / hitStop · no CDN · pool-budget VFX · docs English · player UI English.

> **Agents:** treat this plan’s identity rules as the **default quality bar** when adding or editing skills. Do not regress to hardcoded mults, knight-clip aliases for wizard, or palette-only ultimates.

---

## 1. Goal / Non-goal

### Goal

Make **hero combat kits feel class-distinct, skill-distinct, and spectacular** without breaking the demo’s performance and control contracts.

1. **Content depth** — skills stop being “radius + damage + ring/burst clone”; each active has a readable identity (role, timing, CC/utility, visual language).
2. **Motion diversity** — unique cast/attack poses per skill family and class; hit frames sync to animation; combo chain stops reusing only 4 clips visually.
3. **Spectacle** — richer multi-layer VFX recipes + skill-specific SFX, still within effect pools and quality LOD.
4. **Data-driven growth** — numbers, colors, timelines, and presentation presets live closer to `content.js` so agents can extend kits without rewriting CombatSystem each time.

### Non-goal (defer)

| Item | Why defer |
|------|-----------|
| Full ARPG skill tree / respec UI | Tree UX + save schema churn |
| Mouse aim / free target reticle | Explicit facing-keyboard combat lock |
| Re-enable camera shake / hitStop | Project policy |
| Skeletal mocap / external animation packs | Pipeline is procedural bake only |
| New hero classes in this plan | Use [add-hero-class](../agent/add-hero-class.md); this plan upgrades **existing** kits first |
| True physics cloth / soft-body | Out of scope for SDF heroes |
| Network multiplayer skill prediction | Single-player demo |

**Principle:** *Hit detection stays authoritative in CombatSystem; motion and VFX sell the fantasy; content owns balance and identity.*

---

## 2. Current state (gap analysis)

### 2.1 What already works

| Layer | Today |
|-------|--------|
| Class kits | `HERO_CLASSES` + per-class `activeSkills` / `passiveSkills` |
| Dispatch | `CombatSystem.skillHandlers[effect]` |
| Facing | `alignCombatFacing` + `#aimAlongFacing` |
| Animation API | `CharacterAnimationController` (one-shots, normalized events) |
| VFX pool | `burst` / `dust` / `slash` / `ring` / `pillar` / `trail` / `impact` / `swingArc` |
| Bake | Shared skeleton + 14 clips in `heroAnimations()` |
| Audio | swing / hit / skill sample banks |

### 2.2 Pain points (why kits feel samey)

```
┌─────────────────────────────────────────────────────────────────┐
│  CONTENT          MOTION              COMBAT              VFX   │
│  4 actives/class  4 attack clips      hardcode mults     same   │
│  passives=stats   wizard reuses       delay ≠ anim       ring+  │
│  rankText only    knight skill_*      no status          burst  │
│                   no event sync       starburst≈meteor          │
└─────────────────────────────────────────────────────────────────┘
```

| Gap | Evidence | Player feel |
|-----|----------|-------------|
| Wizard skill anims are aliases | fireball→`skill_crescent`, frost→`skill_whirlwind`, … | Wizard casts “look like knight arts” |
| Only 4 attack clips | Level combo 5–7 reuses `attack_3`/`attack_4` | High-level melee looks identical |
| Hit frames not event-driven | Combat `#delay` independent of clip | Slash can fire before pose peaks |
| Skill isomorphism | `#starburst` ≈ `#meteorStorm` structure | Ultimate feels palette-swapped |
| Passives are pure multipliers | `effect: { attack: .03 }` | No combat personality |
| Single skill SFX | `AudioManager.skill()` for all | No elemental / role cue |
| FX colors hardcoded | hex inside handlers | Hard to theme / rank-tint |
| Damage vs `rankText` drift | mults in CombatSystem only | Rank card can lie |
| No statuses | no slow/burn/root on player skills | CC is knockback-only |
| Cast commits instantly | `usePlayerSkill` fires with anim start | No wind-up telegraph for self skills |

### 2.3 Existing clip inventory (shared)

`idle`, `run`, `sprint`, `attack_1`–`attack_4`, `dodge`, `hit`, `death`,  
`skill_whirlwind`, `skill_crescent`, `skill_skyfall`, `skill_starburst`

Wizard **must** stop mapping uniquely named spells onto these four forever if spectacle is the goal.

---

## 3. Target design

### 3.1 Skill identity matrix (product)

Each active should own a **role + silhouette + risk**.

#### Aerin (Iron Knight) — blade, space control, armor-breaking

| Slot | Skill | Role | Signature feel |
|------|-------|------|----------------|
| Q | Whirlwind | Clear / peel | 360 spin, multi-pulse, short i-frames |
| E | Crescent | Linear poke | Piercing ground wave, long silhouette |
| R | Skyfall | Gap close | Leap telegraph → landing shock |
| C | Starburst | Zone delete | Multi-blade rain + finale ring |

**Upgrade directions:** stance / guard-break on finisher, directional whirl variants, crescent ground scar trail, skyfall multi-landing dust cones, starburst star-shaped telegraphs (not pure circles).

#### Wizard (Arcane Adept) — range, zone denial, element contrast

| Slot | Skill | Role | Signature feel |
|------|-------|------|----------------|
| Q | Fireball | Skillshot explode | Projectile + blast sphere |
| E | Frost Nova | Panic peel | Expanding ice lattice, slow |
| R | Arcane Blink | Reposition | Afterimage + dual-burst (exit/enter) |
| C | Meteor Storm | Barrage | Falling orbs with vertical trails |

**Upgrade directions:** unique cast poses, element-tinted orbs, frost residual fields, blink afterimage meshes, meteors with arc paths (not ground teleports).

### 3.2 Skill definition schema (content-first)

Evolve `SKILLS` from flat metadata toward **presentation + combat parameters** (backward compatible fields kept).

```js
// Conceptual — additive fields; handlers may ignore unknown keys until wired
{
  id: 'fireball',
  classId: 'wizard',
  name: 'Fireball',
  key: 'Q',
  unlockLevel: 3,
  maxRank: 5,
  mp: 20,
  cooldown: 5.2,
  castTime: .34,
  anim: 'skill_fireball',          // unique clip name
  effect: 'fireball',              // handler key
  theme: 'ember',                  // FX token set
  sfx: 'skill_fire',               // audio bank id
  // combat parameters (single source for rankText + handler)
  combat: {
    mult: [1.55, .24],             // base + per rank
    blastRadius: [2.4, .12],
    speed: [13.5, .35],
    knockback: 4.5,
    status: { id: 'burn', chance: .25, duration: 2.0 },
  },
  // timeline (normalized 0–1 against cast/anim)
  timeline: {
    windupFx: 0.05,
    projectile: 0.35,
    recovery: 0.9,
  },
  presentation: {
    layers: ['muzzleFlash', 'orbTrail', 'blastRing', 'embers'],
  },
  description: '...',
  rankText: rank => `...`,         // can later derive from combat[]
}
```

**Rule:** if a number appears in `rankText`, it should come from the same table the handler reads.

### 3.3 Motion system upgrades

#### A. Clip catalog expansion (shared skeleton, class-specific clips)

Keep shared locomotion / hit / death. Split combat clips:

| Family | Knight | Wizard | Notes |
|--------|--------|--------|-------|
| Basic | `attack_1`–`attack_7` (or `atk_h/m/l` set) | `cast_1`–`cast_4` | Magic stops faking sword swings |
| Skills | keep + refine `skill_*` | `skill_fireball`, `skill_frost_nova`, `skill_blink`, `skill_meteor` | No aliasing |
| Optional | `guard_break`, `spin_loop` | `channel_loop`, `teleport_out/in` | Phase 2+ |

Bake path: extend `heroAnimations(skeletonInfo, profile)` so **profiles can override / append** clips without forking the whole skeleton.

#### B. Hit-frame sync via animation events

`CharacterAnimationController.scheduleNormalized` already exists but combat barely uses it.

Target flow:

```
trySkill / tryAttack
  → playOneShot(anim)
  → for each timeline cue at normalized t:
       scheduleNormalized(t, () => combat.fireSkillPhase(...))
  → castTimer still gates input; delayed[] remains for non-anim skills
```

Prefer **anim-driven cues** for body-synced hits (whirlwind pulses, crescent release). Keep **absolute delays** for multi-zone barrages (starburst / meteor).

#### C. Combo motion vocabulary (melee)

Instead of only lengthening combo count:

| Combo step | Motion idea | VFX accent |
|------------|-------------|------------|
| 1 | Horizontal cut | thin slash |
| 2 | Rising diagonal | dust kick |
| 3 | Thrust / shoulder | trail poke |
| 4 | Overhead | heavier arc |
| 5+ | Spin / cross / kick-in | multi-arc + finisher pillar |

Even with 4 clips, **angleOffset / height / spin / pulse count** already vary — push further **and** add clips when budget allows.

#### D. Cast locomotion rules

| State | Move? | Cancel? |
|-------|-------|---------|
| Light skill (cast ≤ .35s) | 70% move speed | dodge cancels recovery only |
| Heavy (cast ≥ .6s) | root or 30% | dodge cancels only after first hit phase |
| Blink / skyfall | scripted translate | invuln window already present |

(Policy detail tunable in config; document chosen defaults in PR.)

### 3.4 VFX architecture: recipes + themes

#### Theme tokens

```js
// e.g. js/data/fxThemes.js or content.js FX_THEMES
FX_THEMES = {
  windsteel: { primary: 0x8feaff, secondary: 0xf4ffff, dust: 0xd7dbc4 },
  starlight: { primary: 0xe2b7ff, secondary: 0xf3d6ff, core: 0xffffff },
  ember:     { primary: 0xff7a42, secondary: 0xffb080, core: 0xffe0a0 },
  frost:     { primary: 0x7ad8ff, secondary: 0xd8f4ff, core: 0xffffff },
  arcane:    { primary: 0xb06dff, secondary: 0xe8d4ff, core: 0xd4b8ff },
};
```

Handlers pull theme once; no scattered hex.

#### Recipe layer (composition over new primitives)

Prefer **named recipes** that compose existing pool primitives first:

| Recipe | Layers | Used by |
|--------|--------|---------|
| `bladeCleave` | swingArc ×N + dust + trail | basic melee |
| `spinStorm` | ring stack + full-arc slash + burst | whirlwind |
| `groundWave` | wave mesh + slash + ground dust | crescent |
| `leapImpact` | trail path + pillar + ring + impact | skyfall / blink land |
| `starRain` | multi telegraph + pillar + finale ring | starburst |
| `fireOrb` | orb + trail sparks + explode ring | fireball |
| `iceNova` | dual ring + shard burst + residual | frost |
| `meteorDrop` | vertical trail + pillar + scorched ring | meteor |

#### New primitives (only if recipes need them)

| Primitive | Why | Cost |
|-----------|-----|------|
| `beam` / ground scar ribbon | crescent / meteor path read | medium |
| `afterimage` (ghost mesh clone, short life) | blink / dash skill fantasy | medium |
| `orbitingSparks` (billboard ring) | cast charge, channel | low–med |
| `groundDecal` (fading disc) | residual burn/ice | low |

**Pool policy:** raise `MAX_PARTICLES` / pool counts only with quality LOD:

```js
const q = game.renderPipeline.quality;
const mul = q === 'low' ? 0.45 : q === 'medium' ? 0.75 : 1;
```

### 3.5 Status & combat feel (lightweight)

Minimal status system — enough for skill identity, not a full DoT MMO:

| Status | Effect | Source examples |
|--------|--------|-----------------|
| `slow` | moveSpeed × 0.55–0.7 for N s | Frost Nova |
| `burn` | small DoT ticks + ember trail | Fireball splash |
| `expose` | +armorPierce taken | Crescent mark / finisher |
| `chill` stacks | 3 stacks → brief root | Frost rank 3+ |

Implement as `Enemy.statuses` map + tick in `Enemy.update` / CombatSystem; visual tint via existing hit pulse / trail.

**Do not** block player input with complex buff UI in v1 — optional small icon later.

### 3.6 Audio diversity

| Bank id | When |
|---------|------|
| `skill_blade` | knight Q/E |
| `skill_leap` | skyfall land |
| `skill_star` | starburst ticks + finale |
| `skill_fire` | fireball cast/explode |
| `skill_ice` | frost nova |
| `skill_arcane` | blink / meteor |

Extend `generate-combat-sfx.mjs` + `AudioManager` (`skill(id)` or `skillTheme(theme)`). Keep silent-safe fallbacks.

### 3.7 Passive personality (phase 2+)

Keep multiplier passives, add **1 combat-trigger passive per class** (max):

| Class | Idea | Hook |
|-------|------|------|
| Aerin | After 4th hit in 2s, next basic +arc | Player combo counter |
| Wizard | Skills refund 8% MP on kill | CombatSystem kill path |

Avoid full proc-storm; one readable rule each.

---

## 4. Architecture / file ownership

| Concern | Owner file | Notes |
|---------|------------|-------|
| Skill catalog + combat params | `js/data/content.js` | freeze tables; additive fields |
| FX themes / recipes | `js/data/fxThemes.js` **or** Effects presets | pure data preferred |
| Handlers + hit logic | `js/systems/CombatSystem.js` | read content combat[] |
| Status tick | `js/entities/Enemy.js` (+ thin helper) | keep simple |
| Cast / anim trigger | `js/entities/Player.js` | timeline scheduling |
| Clip bake | `tools/assets/generate_assets.mjs` | profile-aware animations |
| Manifest clips | `assets/manifests/assets.json` | animationMap |
| VFX primitives/recipes | `js/graphics/Effects.js` | pools + LOD |
| SFX banks | `AudioManager` + `tools/audio/*` | themed skill |
| Integrity | `tests/integrity.mjs` | skill keys, anim names, themes |
| Docs | this plan + combat / graphics / characters-visual updates | after each PR |

**Dependency direction (unchanged):** content → player/combat → effects/audio → renderer.

---

## 5. Phased delivery (PR plan)

### Phase 0 — Baseline audit & contracts (0.5–1 day)

- Inventory all skill handlers: damage, radius, delays, colors, SFX.
- Snapshot “feel” notes per skill (what reads well vs muddy).
- Define integrity rules to add: every active has `effect` in `skillHandlers`, `anim` present in GLB animationMap (or documented fallback), theme id valid.
- **Exit:** written checklist in this doc §8 acceptance; no gameplay change.

### Phase 1 — Presentation polish without new systems (1–2 days) · **highest juice / lowest risk**

**Knight**

- Whirlwind: staggered slash heights, finishing cross-slash, stronger dust ring.
- Crescent: longer ground dust wake, brighter leading edge, pierce spark on each enemy.
- Skyfall: exit trail + landing dual-ring (inner/outer) + dust cone along facing.
- Starburst: alternate pillar colors by index; star-shaped delay offsets; clearer finale.

**Wizard**

- Fireball: larger orb scale pulse, muzzle slash, explosion = ring+burst+ember dust.
- Frost Nova: crystalline multi-ring expand; residual small trails on hit enemies.
- Arcane Blink: burst at **from** and **to**; short trail line; distinct purple core.
- Meteor Storm: staggered height pillars (fake fall), scorch rings, finale heat pillar.

**Shared**

- Introduce `FX_THEMES` and replace hardcoded hex in handlers.
- Quality-scaled particle counts.
- Slightly raise pool sizes if high quality only.
- Optional: `AudioManager.skill(theme)` with 2–3 new banks.

**Exit:** side-by-side feel test at medium/high; integrity green; no save version bump.

### Phase 2 — Skill param centralization (1–2 days)

- Move mult/radius/hits/knockback into `SKILLS[id].combat`.
- Handlers become thin: `const c = skill.combat; damage = power * (c.mult[0] + rank * c.mult[1])`.
- Derive or validate `rankText` vs combat (integrity test preferred over auto-string if copy needs flavor).
- Document recipe in [content-data.md](../content-data.md) + extension playbook §3 update.

**Exit:** tuning whirlwind radius only in content; combat behavior matches.

### Phase 3 — Motion & anim-event sync (2–4 days)

1. Profile-aware `heroAnimations(profile)`:
   - Knight: refine existing skill clips; add `attack_5`–`attack_7` **or** distinct weight variants.
   - Wizard: add `cast_1`–`cast_4` + four unique skill clips; rebind `SKILLS.anim`.
2. Rebake `hero.aerin` / `hero.wizard` LOD0/1.
3. Wire `Player.tryAttack` / `trySkill` to schedule combat phases on normalized times from `timeline` or defaults.
4. Align `#meleeAttack` delays to attack clip peaks.
5. Update [characters-visual.md](../characters-visual.md) clip list.

**Exit:** wizard no longer uses `skill_crescent` etc.; hit frames match silhouettes in slow-mo observe (F3).

### Phase 4 — New VFX primitives + afterimage / residual (2–3 days)

- Implement 1–2 primitives max per PR (`afterimage`, `groundDecal` recommended first).
- Recipes: blink afterimage, frost residual disc, crescent scar.
- Meteor “fall”: delay telegraph → vertical trail from y+8 → impact (read as drop).

**Exit:** at least three skills use a primitive/recipe no other skill uses.

### Phase 5 — Lightweight statuses + passive triggers (2–3 days)

- `slow` + `burn` only for v1 of statuses.
- Wire Frost / Fireball; rank scales duration or chance.
- One passive combat trigger per class (optional if schedule slips).
- Enemy freeze-tint / ember trail presentation only (no new UI required).

**Exit:** frost feels like control; fire feels like pressure; knockback not the only CC.

### Phase 6 — Kit expansion & long-term (optional)

- Extra actives beyond Q/E/R/C (needs HUD redesign — **big** UX PR).
- Stance skills / hold-channel.
- Full skill tree.
- New class using upgraded pipeline (e.g. rogue) as proof of reuse.

---

## 6. Per-skill upgrade card (concrete backlog)

### Aerin

| Skill | Phase 1 (VFX) | Phase 3 (Motion) | Phase 5 (System) |
|-------|---------------|------------------|------------------|
| Whirlwind | 3 height-layered slashes + finale cross | true spin loop frames | brief armor / i-frame polish only |
| Crescent | pierce sparks + ground dust | heavier draw-cut pose | `expose` on pierce |
| Skyfall | dual ring + facing dust cone | airborne root pose already; polish land | land shock slow (short) optional |
| Starburst | asymmetric star delays | arms-up cast hold | multiHit already; finale `expose` |

### Wizard

| Skill | Phase 1 (VFX) | Phase 3 (Motion) | Phase 5 (System) |
|-------|---------------|------------------|------------------|
| Fireball | muzzle + bigger blast | overhead throw cast | burn DoT |
| Frost Nova | ice lattice rings | palms-down cast | slow |
| Arcane Blink | dual burst + trail | crouch-out / rise-in split if 2 clips | invuln window already |
| Meteor Storm | vertical trails | both-hands sky channel | ground residual burn optional |

### Basic attacks

| Style | Phase 1 | Phase 3 |
|-------|---------|---------|
| Melee | per-combo swingArc height/spin variety ↑ | clips 5–7 or mirrored variants |
| Magic | bolt size/color by combo; finisher helix | cast_1–4 staff poses |

---

## 7. Performance & safety budget

| Risk | Mitigation |
|------|------------|
| Particle pool thrash | quality multiplier; raise pools only for high |
| Many telegraphs (meteor/star) | cap concurrent delayed jobs; reuse telegraph pool |
| Afterimage meshes | hard max 4 ghosts; dispose materials |
| Status tick cost | max N statuses/enemy; simple number fields |
| Bake binary size | LOD1 fewer morphs already; avoid clip explosion (>+12 total carefully) |
| Save breakage | no `saveKey` change unless ranks/schema change; status not persisted |
| Hunt/Defense | skills shared; no mode-specific combat forks |

**Forbidden:** restoring `Game.shake` / `Game.hitStop`; strong attack lunge; CDN assets.

---

## 8. Acceptance criteria

### Phase 1

- [ ] Each active has a **unique visual silhouette** at a glance (screenshot test).
- [ ] Knight and wizard ultimates no longer look like recolors of the same pattern.
- [ ] Medium quality stays ≥ target FPS on reference machine (document number when measuring).
- [ ] `node tests/integrity.mjs` passes.

### Phase 2

- [ ] Changing rank radius/damage only in content updates gameplay + rank card consistently.
- [ ] No orphan hardcoded mults for migrated skills.

### Phase 3

- [ ] Wizard skill `anim` names are unique clips in GLB.
- [ ] At least one skill’s damage phase is fired via `scheduleNormalized`.
- [ ] Combo ≥5 does not feel identical to combo 3–4.

### Phase 4–5

- [ ] ≥1 new primitive used by ≥2 skills OR 3 exclusive recipes.
- [ ] Frost applies slow; fireball can apply burn.
- [ ] Audio banks differ for blade / fire / ice / arcane.

### Regression

- [ ] Default class aerin Hunt continue still loads.
- [ ] Facing-only aim preserved (no mouse combat aim).
- [ ] Defense mode waves unaffected by skill-only changes.

---

## 9. Implementation notes for agents

1. **Read first:** this plan + [combat.md](../combat.md) + [graphics-vfx.md](../graphics-vfx.md); for clips, [characters-visual.md](../characters-visual.md).
2. **Edit order:** content/theme → Effects recipe → CombatSystem handler → Player timeline → bake/manifest → audio → integrity → docs.
3. **Do not** rewrite all skills in one PR; ship phase slices.
4. **Validate:** `node tests/integrity.mjs` after content/path/anim map edits; manual skill fire Q/E/R/C both classes.
5. **Run:** `node server.mjs` → `http://127.0.0.1:8080` (`file://` forbidden).
6. **Commit:** only when user asks.

### Suggested first PR title

`feat(combat): skill FX themes + class-distinct presentation polish (phase 1)`

---

## 10. Open decisions (resolve before Phase 3+)

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Combo clips | A) bake attack_5–7 B) procedural timeScale/mirror only | **A** if bake cost OK; else B interim |
| Status UI | none / tiny icons | **none** until Phase 5 proves value |
| Skill param location | all in content vs combat config split | **all combat numbers in content** |
| Afterimage implementation | skinned clone vs transparent mesh ghost | **simple mesh ghost** first |
| Channel skills | hold R to charge | **defer** to Phase 6 |

---

## 11. Summary roadmap

```
Phase 0  audit
   ↓
Phase 1  spectacle polish (themes, recipes, SFX, pool LOD)     ← start here
   ↓
Phase 2  content-owned combat params
   ↓
Phase 3  unique motions + anim-event hit sync + rebake
   ↓
Phase 4  1–2 new VFX primitives (afterimage, decal, beam)
   ↓
Phase 5  slow/burn + optional combat passives
   ↓
Phase 6  kit expansion / new class on upgraded pipeline
```

**Success metric:** a player (or agent reviewing clips) can identify which skill was cast from silhouette and audio alone, and each class fantasy (blade knight vs elemental caster) is obvious within 10 seconds of combat.
