# Character · Weapon visuals

## Hero classes

Playable looks are data-driven via `HERO_CLASSES` in `js/data/content.js`.

| Class id | Model key | Default name | Notes |
|----------|-----------|--------------|--------|
| `aerin` | `hero.aerin` | Gareth | Inverse-triangle heavy knight — broad plated chest/pauldrons, narrow armored waist, open helm, crimson crest |
| `wizard` | `hero.wizard` | Lyra | Elongated battlemage — slim torso, long split robe, refined mantles, arcane crystals and brooch |
| `rogue` | `hero.rogue` | Vex | Compact assassin — smallest runtime scale, lean limbs, baked hood/mask, asymmetric pad, refined twin daggers |
| `ranger` | `hero.ranger` | Sable | Agile archer — slim torso, long-reading arms, light laced vest, extended asymmetric cape and quiver |
| `gunner` | `hero.gunner` | Rook | Balanced mercenary — restrained cuirass, armored shoulders, long rifle, power pack and paired powder charges |

**Add a class:**

1. `HERO_CLASSES` row: `modelKey`, `lookId`, `attackStyle`, `activeSkills`, `passiveSkills`, `starterWeapon`, `baseStatMods`
2. Define skills in `SKILLS` with `classId`, `effect`, `anim`, `castTime` (actives) or passive `effect` multipliers
3. Register `CombatSystem.skillHandlers[effect]` for each new active effect
4. Bake hero GLB + optional weapon model; register in `assets.json`
5. `CLASS_LOOKS[lookId]` in `CharacterFactory.js`
6. Title card `data-class-id` in `index.html`

HUD/input bind from `activeSkills` keys (Q/E/R/C) automatically.

## Hero pipeline

| Stage | File |
|-------|------|
| Creation | `js/characters/CharacterFactory.js` → `createHero({ classId, quality })` |
| GLB key | `HERO_CLASSES[id].modelKey` |
| Fallback mesh | `js/graphics/ModelFactory.js` → `createHeroModel` (any `hero.*`) |
| Animation | `CharacterAnimationController` + GLB clips |
| Instance | `Player` mounts/rebuilds on class change |

### Runtime looks

`CLASS_LOOKS` per `lookId`:

- **palette** — cel recolor by material role (`skin` / `cloth` / `hair` / …)
- **headKit** — `rogue` (runtime hood/mask), `ranger` (runtime auburn hair), or `none` (use baked head gear). Gunner uses its baked industrial armor kit with no runtime head kit.

Maps are cleared for flat anime color priority.

### Bake tool

```bash
# Requires npm package `three` available for GLTFExporter imports (dev install once)
node tools/assets/generate_assets.mjs --wizard-only
node tools/assets/generate_assets.mjs --gunner-only
node tools/assets/generate_assets.mjs --rifle-only
node tools/assets/generate_assets.mjs --heroes-only
node tools/assets/generate_assets.mjs --weapons-only
node tools/assets/generate_assets.mjs   # full asset set
```

Profiles: `HERO_BAKE_PROFILES` defines class palettes/identity and `HERO_PHYSIQUE_PROFILES` defines recipe-v5 torso taper, limb mass, head scale, belt/collar fit, and muscle smoothing per class. The shared rig, class-shaped body SDF, and class-filtered `heroAnimations` clips keep stable animation APIs while producing distinct silhouettes.

## Weapons

| Item | Location |
|------|----------|
| Equip | `CharacterFactory.equipWeapon` |
| Grip alignment | Baked `grip_anchor` is aligned to the active hand socket |
| Length multiplier | `WEAPON_LENGTH` (final Y scale, relative per kind) |
| Girth multiplier | `WEAPON_GIRTH` (final X/Z scale, relative per kind) |
| Mount profile | `WEAPON_MOUNT_PROFILES` supplies per-kind rotation and hand offset |
| Model type | item.model → `weapon.sword` etc. in manifest |
| Starter | `HERO_CLASSES[*].starterWeapon` via `createClassStarterWeapon` |

Hunter starter: **Swift Field Blade** (`katana`).  
Wizard starter: **Apprentice Focus** (`relic`).
Ranger starter: **Fledgling Bow** (`bow`).
Gunner starter: **Service Rifle** (`rifle`) with `grip_anchor`, `muzzle_socket`, and `stock_anchor`.

Applied scale is `(WEAPON_GIRTH, WEAPON_LENGTH, WEAPON_GIRTH)`; rogue offhand uses the same magnitudes with mirrored X/Y. Ranger bows mount to a mirrored runtime socket on `left_hand`, matching the draw animation. Gunner rifles use the right-hand mount profile and expose a live muzzle socket for hitscan presentation. Hit detection `range` / `rangeMult` are independent of mesh length (see `docs/history/weapon-visual-scale-detail.md`).

## Animation clip names

**Shared locomotion / reaction:**  
`idle`, `walk`, `run`, `sprint`, `dodge`, `hit`, `hit_light`, `hit_heavy`, `death`

Runtime locomotion uses discrete speed bands (idle → walk → run → sprint) with hysteresis in `CharacterAnimationController.setLocomotion`. If `walk` is missing, selection falls back to `run`.

Hit reactions: `Player.takeDamage` picks `hit_light` / `hit` / `hit_heavy` from damage severity when those clips exist (falls back to `hit`).

**Weapon holds:** every class has a soft combat-ready idle/run hold via `classWeaponHold(profileId)` (knight guard, wizard staff stance, ranger bow-ready, rogue dual crouch, Gunner shouldered rifle). Combat clips start from that rest so attacks/casts no longer snap out of T-pose arms.

### Basic attack poses

| Class | Clips | Notes |
|-------|-------|--------|
| `aerin` | `attack_1`–`attack_7` | Full-body sword chain (weight shift, follow-through) |
| `rogue` | `attack_1`–`attack_7` | Dual-dagger chain with settle back to crouch rest |
| `wizard` / `ranger` | `cast_1`–`cast_4` primary + `attack_1`–`attack_4` fallback | Body-weighted casts and bow releases |
| `gunner` | `cast_1`–`cast_4` primary + `attack_1`–`attack_4` fallback | Compact recoil beats; fourth pose supports the three-round finisher |

Runtime: melee plays `attack_N`; magic/ranged prefer `cast_N` (`Player.tryAttack`).

**Knight (aerin):**  
`attack_1`–`attack_7`,  
`skill_whirlwind`, `skill_crescent`, `skill_skyfall`, `skill_starburst`

**Wizard:**  
`attack_1`–`attack_4`, `cast_1`–`cast_4`,  
`skill_fireball`, `skill_frost_nova`, `skill_blink`, `skill_meteor`

Wizard actives must **not** alias knight skill clip names in `SKILLS.anim`.  
Do not rename without updating Player / Combat / `assets.json` animationMap.

**Gunner:**
`attack_1`–`attack_4`, `cast_1`–`cast_4`,
`skill_suppressive_burst`, `skill_flame_jet`, `skill_stim_rush`, `skill_inferno_sweep`

### Bake (after adding clips)

```bash
node tools/assets/generate_assets.mjs --heroes-only
# or --aerin-only / --wizard-only / --rogue-only / --ranger-only / --gunner-only
# weapons: --staff-only / --dagger-only / --bow-only / --rifle-only
node tests/integrity.mjs
```

Hold/attack tuning: `classWeaponHold(profileId)`, `buildClassCombatClipSpecs`, and skill poses in `heroAnimations()`. Per-class **`COMBAT_MOTION_PROFILE`** (antiRatio / contactRatio / finisher boosts / contactSnap / durationScale / mass) drives phase times via `combatPhaseTimes` + `strikePhases`. Prefer **anticipation → contact → follow-through → settle** keys with legs/spine/head — sparse arm-only keys look wooden. `animationClip` hold-forwards omitted bones (does not snap missing keys to identity).
Each GLB only ships shared locomotion/reaction clips plus its own class combat clips — register new clips in `HERO_CLASS_CLIPS` so they survive the per-class filter.
Runtime: `Player.trySkill` has limited anim fallbacks if a clip is missing — still bake unique names for shipping quality.

### Motion + combat sync

- Skills with `timeline.hits` fire combat phases via `CharacterAnimationController.scheduleNormalized`.  
- See [combat.md](./combat.md) cast flow and [history/skill-motion-spectacle.md](./history/skill-motion-spectacle.md).

### Hero graphics and motion architecture

The full five-class schema-v2 overhaul is implemented and release-verified: [history/character-graphics-animation-overhaul.md](./history/character-graphics-animation-overhaul.md) records the architecture, external research, measured budgets, and three cold review/fix passes.

- **Authored assets:** five distinct heroes ship at LOD0/1/2 with a shared 41-node schema-v2 rig, stable weapon/hand/foot/contact sockets, per-class markers, provenance hashes, and enforced ≤70k/30k/12k hero triangle ceilings.
- **Motion:** one `AnimationMixer` per hero drives phase-synchronized idle/walk/run/sprint blending; short additive `locomotion_start`, `locomotion_stop`, `pivot_*`, `breath_add`, `aim_idle_add`, `recoil_add`, and `hit_add` clips layer without delaying input or code-authoritative movement.
- **Procedural correction:** Gunner support-hand IK, planted-foot terrain correction, and bounded cape/hair secondary motion receive game-owned targets/settings while the generic solvers remain template-safe.
- **Materials:** `StylizedMaterial` preserves authored base-color, normal, roughness, metalness, AO, emissive, and alpha maps with the source color-space/channel semantics. The current authored-recipe style uses role-tagged PBR parameters/vertex color; future mapped Blender assets use the same adapter and contract.
- **Reliability:** every shipping hero/weapon carries a class/rig fingerprint and passes glTF structure, clip, socket, scale, skin, material, uniqueness, and budget validation. Debug/visual-smoke loads are strict and never silently replace a bad hero.
- **Responsiveness/accessibility:** attack and dodge remain code-authoritative; locomotion transitions are bounded additive poses, not preroll gates. Existing camera-shake/hit-stop bans remain unchanged.
- **Dual offline authoring:** `tools/assets/build-heroes.mjs` prefers approved Blender sources when present and otherwise selects the deterministic repository-owned authored recipe, recording the mode and source/output SHA-256 hashes. `--require-blender` is the explicit fail-closed DCC-only lane; runtime always consumes committed GLBs.

## Outlines

`OutlineSystem` silhouette color comes from the active look palette `outline`.

## Save

`player.classId` is persisted (`saveVersion` 4+; current schema is 6). Missing class → `aerin`.
