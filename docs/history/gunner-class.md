# Gunner Hero Class Implementation Plan

> Historical implementation specification. The shipped behavior is maintained by the living guides under `docs/` and `docs/agent/`.

| Metadata | Value |
|---|---|
| Status | **implemented** |
| Owner | unassigned |
| Scope | new rifle hero, level-5 Smartlink targeting, complete flame-combat class kit, UI, assets, audio, saves, tests, and release gates |
| Working class ID | `gunner` |
| Working hero | `Rook · Ember Vanguard` |

## 1. Product intent

Add a durable ranged assault hero that combines disciplined rifle fire with short-range incendiary area control. The class should evoke the gameplay contrast of a space infantry rifleman and a flame trooper without copying protected names, dialogue, shapes, sounds, animations, or assets.

The class progression promise is:

1. **Levels 1–4 — learn the rifle.** Basic attacks fire along the hero's movement/body facing. Positioning and manual facing matter.
2. **Level 5 — unlock Smartlink.** Pressing the existing attack input can acquire a valid enemy and correct the shot direction. Smartlink does not fire on its own.
3. **Later levels — add incendiary control.** Flame Jet and Inferno Sweep turn nearby groups into the Gunner's preferred engagement.
4. **Endgame — weave both ranges.** Rifle skills create or thin a lane; flame skills punish enemies that close the distance.

The public class card must not ship as a rifle-only placeholder. It becomes selectable only when the four active skills, passive progression, visuals, HUD treatment, presets, and test coverage meet the release gates in this document. A development-only rifle vertical slice may land earlier.

## 2. Non-goals and invariants

- Do not implement autonomous firing, an aim-bot loop, or attacks without J/touch attack input.
- Do not make rifle rounds visually or mechanically behave like Ranger arrows.
- Do not add camera shake or hit stop; the project contracts keep both as no-ops.
- Do not change mouse input from UI-only behavior.
- Do not add CDN dependencies or edit the locked `packages/template-3d` boundary.
- Do not copy recognizable IP-specific armor, weapons, insignia, voice lines, names, muzzle sounds, or flame effects.
- Do not add a Heat resource in the first release only to mirror another class's class-state UI. Add it later only if playtesting proves that flame uptime needs another decision layer.
- Do not expose the class through the title screen before all public-release checks pass.

## 3. Player-facing specification

### 3.1 Identity

| Field | Working value |
|---|---|
| Class ID | `gunner` |
| Hero name | `Rook` |
| Class title | `Ember Vanguard` |
| Role | mid-range sustained damage / close-range area denial |
| Weapon | compact assault rifle with underslung ignition assembly |
| Armor language | original industrial rescue/exo armor; slate, brass, and ember accents |
| Core strengths | safe lane damage, predictable target acquisition, clustered wave clear |
| Core weaknesses | lower burst at long range, must enter danger range for best flame value, no passive fire-and-forget attacks |

Use the identity above as production-safe working language. It may be renamed before implementation, but the stable class ID should not change after save data reaches players.

### 3.2 Basic rifle attack

The rifle uses the existing attack input and combo cadence. It is a distinct combat profile, not `attackStyle: 'ranged'` interpreted as a bow.

Proposed first tuning pass:

| Property | Value | Reason |
|---|---:|---|
| Attack profile | `rifle` | separates behavior, icon, audio, animation, and VFX from bow |
| Combo rounds | `1 / 1 / 1 / 3` | readable three-tap cadence with a burst finisher |
| Damage multipliers | `0.86 / 0.94 / 1.02 / 0.50 × 3` | finisher is strong without tripling proc value |
| Damage range | `26` | longer than flame reach; still requires screen awareness |
| Smartlink acquire range | `28` | small acquisition allowance around valid shot range |
| Smartlink retain range | `31` | hysteresis prevents target flicker at the edge |
| Preferred front dot | `0.15` | strongly prefers enemies in front without a narrow cone |
| Rear emergency radius | `9` | close threats remain attackable after level 5 |
| Target stick time | `0.65 s` | supports a combo without permanent lock-on |
| Hit model | authoritative hitscan/capsule query | avoids high-speed projectile tunneling |
| Presentation | short tracer plus muzzle flash | communicates a projectile without owning hit timing |

Final numbers belong in data/config tables and must be tuned in both New Hunt and Defense. The table above establishes behavior, not a balance lock.

#### Hit contract

For every trigger pull:

1. `Player.tryAttack()` confirms cooldown/input exactly as it does for existing classes.
2. Combat obtains an immutable shot origin and direction for that round.
3. The authoritative rifle query finds the nearest valid intersection along the shot segment/capsule.
4. Damage is applied once to that target.
5. A tracer renders from the muzzle socket to the hit point or maximum range.
6. Proc logic is evaluated per trigger pull unless a skill explicitly says otherwise. The three-round combo finisher must not accidentally triple on-hit refunds, ult charge, or kill feedback.

Do not use an ultra-fast physical projectile for authoritative collision. Current projectile collision tests a point each frame, so a rifle-speed object can tunnel through enemies at low frame rates.

### 3.3 Smartlink passive at level 5

**Player copy:** `SMARTLINK ONLINE — Basic rifle attacks now acquire a target near your aim direction.`

Smartlink changes aim assistance, not the attack control:

- Before level 5, J/touch attack fires along the current body-facing vector.
- At level 5 or later, each attack press/held cadence requests a target snapshot.
- If a valid target is found, the hero rotates toward that target before the shot direction is captured.
- If no target is found, the rifle fires along the current body-facing vector.
- A target that was recently selected receives a brief retention preference.
- Dead, despawned, non-hostile, out-of-zone, or out-of-retain-range entities are immediately invalid.
- Smartlink does not home after firing and does not redirect a tracer around obstacles.
- Smartlink must not steal targets behind the hero unless the target is inside the rear emergency radius.

#### Deterministic target priority

Use one allocation-conscious scan over active enemies. Score/compare candidates in this order:

1. retained valid target inside retain range;
2. valid target inside acquire range and preferred front arc;
3. nearest valid target inside the rear emergency radius;
4. no target.

For equal candidates, prefer higher facing alignment, then shorter distance, then a stable spawn/entity ID. Avoid `filter().map().sort()` in the per-shot path.

Smartlink is a derived feature of class ID plus level. It does not require a new save field. It does require a one-time level-up notification because current level-up feedback only announces active-skill unlocks.

### 3.4 Active skills

Every class must retain the project contract of exactly four active skills. Working bindings and unlock levels:

| Key | Skill ID | Unlock | Function | Initial combat contract |
|---|---|---:|---|---|
| Q | `suppressive_burst` | 3 | ranged lane clear | fire a controlled burst through a narrow capsule; limited pierce, brief slow/suppression |
| E | `flame_jet` | 6 | close cone damage | several short ticks in a forward cone; applies Burn once per cast per target |
| R | `stim_rush` | 10 | tempo steroid | temporary move/attack-speed gain with a visible duration; no permanent state mutation |
| C | `inferno_sweep` | 16 | ultimate area denial | sweep a wide near-field arc, heavy initial damage, then short burning-ground zones |

#### Q — Suppressive Burst

- Snapshot aim through Smartlink if unlocked; otherwise use body facing.
- Use a lane/capsule query rather than spawning many authoritative bullets.
- Cap the number of targets pierced in data.
- Apply its slow/suppression status once per cast per target.
- Render a small number of representative tracers so low quality does not create one effect per logical hit.
- It remains useful at long range but should not eclipse the Ranger's multi-target arrow identity.

#### E — Flame Jet

- Requires facing commitment and has much shorter reach than the rifle.
- Use a cone or stepped-capsule hit query with a per-cast hit ledger.
- Damage may tick, but Burn application and proc eligibility must be explicitly capped.
- Flame visuals must be clipped to the actual gameplay reach and degrade by particle quality.
- The skill should reward entering the edge of a group, not attacking safely from maximum rifle range.

#### R — Stim Rush

- Grants a temporary attack-speed and movement-speed modifier.
- May reduce recovery frames, but must not bypass the global attack cooldown contract.
- Must restore all modified values on expiration, hero death, mode transition, class reconstruction, and load.
- Show remaining duration in the HUD; do not add a permanent meter.
- Avoid health-cost tuning in the first implementation. It complicates accessibility and Defense balance before the class baseline is known.

#### C — Inferno Sweep

- Plays a broad close-range sweep authored as one skill recipe.
- Initial damage and burning ground are separate damage channels with explicit per-target tick limits.
- Burning ground must have a strict lifetime, zone count cap, and pooled/low-allocation visuals.
- The cast should remain readable at mobile resolution and low particle quality.
- Ultimate presentation must respect reduced-motion settings and the no-camera-shake rule.

### 3.5 Passive skills

Integrity requires at least four passives; ship five so progression supports both rifle and flame play:

| Passive ID | Unlock | Purpose |
|---|---:|---|
| `ballistic_drill` | 2 | modest rifle/basic damage or consistency bonus |
| `combat_plating` | 2 | defensive baseline for entering flame range |
| `smartlink` | 5 | target acquisition for basic rifle attacks |
| `scorched_earth` | 8 | improves Burn/ground-zone duration or damage within safe caps |
| `last_mag` | 12 | conditional tempo bonus after a combo finisher or low-health clutch window |

Avoid opaque stacking rules. Passive descriptions must say whether a bonus is additive, multiplicative, conditional, or capped. Smartlink ranks, if the existing passive UI requires ranks, should improve small numeric parameters rather than change the fundamental input contract.

### 3.6 Mode-specific start behavior

- **New Hunt / MAX Hunt:** the current public flow applies the level-70 baseline. Gunner therefore starts with Smartlink, all four active skills, and the configured full-rank preset.
- **Defense:** the current bootstrap starts heroes at level 3. Gunner starts with Q but without Smartlink, then visibly transitions to assisted aim at level 5 and Flame Jet at level 6.
- **Loaded games:** class level and skills restore through existing serialization. Smartlink is recalculated from level during load.

The Defense start is a required acceptance path because it is the easiest place to verify that level-5 behavior actually changes rather than merely existing in endgame data.

## 4. Architecture changes

### 4.1 Replace bow-by-implication with explicit attack profiles

Current behavior sends both ranged and magic attacks through `_magicAttack()`, and treats every `attackStyle === 'ranged'` class as a bow user. Adding Gunner directly to that branch would create arrow visuals and Ranger-specific assumptions.

Introduce an explicit, backward-compatible profile:

```js
basicAttack: {
  profile: 'rifle',
  range: 26,
  comboRounds: [1, 1, 1, 3],
  attackIcon: 'rifle',
  audioKind: 'rifle'
}
```

Resolution rules:

1. Prefer `basicAttack.profile` when present.
2. Map existing magic classes to `magic` and Ranger to `bow` as compatibility defaults.
3. Keep melee classes on the existing melee path.
4. Route each explicit profile to a small handler rather than extending one bow/magic conditional indefinitely.

Recommended handler boundary under `js/systems/combat/basicAttacks/`:

- melee: existing implementation;
- magic: existing orb/cast implementation;
- bow: existing arrow and Ranger Strafe implementation;
- rifle: new hitscan query and tracer presentation.

Ranger's level-5 Strafe remains Ranger-only. Gunner Smartlink must not reuse the ten-arrow homing attack as its behavior.

### 4.2 Content and tuning data

Update `js/data/content.js` with:

- the `gunner` `HERO_CLASSES` row;
- explicit rifle basic-attack metadata;
- four active skills and at least five passives;
- class-facing display strings and unlock levels;
- numeric values that are currently expected by integrity checks.

Update supporting data modules as required:

- `js/data/skillCombat.js` for pure damage/status helpers;
- `js/data/fxThemes.js` for gunner skill colors and quality-scaled recipes;
- `js/config.js` for reusable targeting/timing constants only when they are true configuration rather than content;
- evolution and resonance tables with an explicit Gunner row;
- `MAX_HUNT_CLASS_PRESETS` with Gunner skill ranks/loadout.

Do not rely on existing Aerin fallbacks in weapon evolution/resonance. They would make a new class appear valid while silently receiving the wrong progression.

### 4.3 Combat implementation

Add `js/systems/combat/skills/gunnerSkills.js` and attach it from the skill-kit index in the same pattern as Knight, Wizard, Rogue, and Ranger.

Implementation responsibilities:

- rifle attack execution and Smartlink target selection;
- Q/E/R/C active skill handlers;
- per-cast hit ledgers for multi-tick flame skills;
- temporary Stim state and cleanup hooks;
- explicit damage/proc frequency;
- effect requests through registered effect IDs.

Register every new skill effect in `js/systems/combat/skillEffectRegistry.js` and its handler table. Do not bypass the registry or call new ad-hoc effect names from combat.

Suggested pure helpers:

- `isValidGunnerTarget(enemy, origin, limits)`;
- `selectSmartlinkTarget(enemies, origin, facing, retainedId, limits)`;
- `queryFirstRifleHit(enemies, origin, direction, range, radius)`;
- `queryFlameConeHits(enemies, origin, direction, cone)`;
- `getGunnerBasicAttackSpec(hero, comboStep)`.

Pure helpers should be unit-testable without Three.js scene construction wherever possible.

### 4.4 Player animation and attack flow

`Player.tryAttack()` currently aligns facing, chooses combo/cast animations, plays swing audio, and delegates damage to combat. Extend the data contract so the class can select:

- rifle-ready locomotion/idle stance;
- rifle fire combo clips;
- flame skill clips;
- attack audio kind;
- per-profile hand/weapon presentation.

Smartlink target selection must happen early enough to correct facing before the attack animation and shot snapshot, while damage remains owned by combat. Avoid putting enemy iteration or damage logic in `Player`.

Attack hold behavior remains the existing J/touch cadence. Verify that Stim Rush modifies intended timing without allowing multiple attacks in a single update or making animation state drift from actual shots.

### 4.5 Level-up unlock feedback

`Player.addXp()` currently grants active skills at their unlock level, while `killFeedback.onXpLevelUps()` only announces active-skill unlocks. Add a generic passive/feature notification contract such as:

```js
unlockNotice: {
  level: 5,
  id: 'smartlink',
  title: 'SMARTLINK ONLINE',
  body: 'Basic rifle attacks now acquire targets near your aim direction.'
}
```

Requirements:

- fire once when crossing level 5 during play;
- do not replay every load;
- do not require a saved `smartlinkUnlocked` boolean;
- support future passive feature notices without class-specific UI conditionals;
- remain legible on mobile and not obscure the ability bar.

## 5. Character, weapon, and animation assets

### 5.1 Character factory

Extend the class maps in `js/characters/CharacterFactory.js`:

- original Gunner body/armor look;
- weapon length, girth, mount, and offsets;
- two-hand rifle grip placement;
- class accent colors matching the UI data;
- fallback geometry that remains usable if a generated GLB is absent.

The silhouette should read as a practical armored responder, not a direct reproduction of any well-known sci-fi infantry armor. Keep shoulder size, helmet shape, chest lights, weapon outline, and color blocking original.

### 5.2 Generated hero GLB pipeline

Extend the existing generator maps and clip builders:

- `HERO_CLASS_CLIPS`;
- `COMBAT_MOTION_PROFILE`;
- `HERO_BAKE_PROFILES`;
- class weapon-hold data;
- `buildClassCombatClipSpecs()`;
- attachment-kit generation;
- CLI class flags and validation.

Required authored/baked states:

- idle and locomotion with a shouldered rifle;
- four readable basic-fire beats, with the fourth supporting a three-round presentation;
- Q braced burst;
- E forward flame jet;
- R Stim activation;
- C wide inferno sweep;
- hit, death, and transition compatibility with common clips.

Animation clips should not encode damage timing as the sole source of truth. Combat timing remains explicit in data/code and animation events are presentation synchronization points.

### 5.3 Weapon sockets and references

The rifle asset needs named anchors:

- `grip_anchor` — primary hand/mount;
- `muzzle_socket` — tracer, flash, and flame origin;
- optional `stock_anchor` — authoring/alignment aid, not a required runtime dependency.

Expose `muzzleSocket` through the hero refs used by combat/effects. Clear or replace the reference when the weapon is removed or reconstructed so no effect can spawn from a stale object.

Add manifest entries to `assets/manifests/assets.json` only after local assets exist. Preserve the no-CDN rule and the current manifest validation path.

### 5.4 Visual fallback order

For every muzzle-origin effect:

1. use the live `muzzle_socket` world position;
2. fall back to a class-specific weapon-tip offset;
3. fall back to a safe point in front of the hero.

This lets placeholder/fallback geometry remain playable during staged development without hiding an asset integration bug.

## 6. VFX and audio

### 6.1 Rifle presentation

- small directional muzzle flash;
- thin tracer with a very short lifetime;
- compact hit spark appropriate to the target material/theme;
- optional shell presentation only at high quality and under a strict live-count cap;
- no arrow mesh, arc, or homing trail;
- no large explosion on normal rounds.

One logical rifle hit must not require one persistent scene object. Prefer pooled or recipe-owned short-lived primitives.

### 6.2 Flame presentation

- Flame Jet uses a tapered, turbulent cone whose visible end matches damage reach.
- Inferno Sweep uses a wider authored arc plus clearly bounded ground fire.
- Burn on enemies must remain readable without covering silhouettes or health bars.
- Low quality reduces particle count, secondary embers, distortion, and ground detail before reducing essential telegraph shape.
- Reduced motion removes unnecessary streaking/pulsing while retaining danger boundaries.

All new recipes must be registered through the existing effect registry and use class/skill theme data rather than hardcoded colors spread across combat handlers.

### 6.3 Audio contract

The attack flow currently calls a generic swing sound. Add a data-driven basic-attack audio route such as `audio.basicAttack(kind, comboStep)` or an equivalent existing-style facade.

Required sounds:

- rifle single shot with small combo variation;
- three-round finisher that remains distinct but not excessively louder;
- Q braced burst;
- flame ignition, loop/body, and cutoff designed as short bounded events;
- Stim activation and expiration cue;
- Smartlink unlock UI cue.

Use original/licensed local audio. Add concurrency limits for rapid rifle and flame events. If a specialized sound is missing, use a neutral safe fallback rather than the melee swing or Ranger bow sound.

## 7. UI and UX plan

### 7.1 Title/class selection

Add the Gunner card only at the full-kit release gate.

Card content:

- `ROOK`;
- `EMBER VANGUARD`;
- concise role copy: rifle control, Smartlink at level 5, close-range flame payoff;
- original class portrait/silhouette;
- class accent and selected state;
- keyboard/touch selection parity.

Layout changes:

- desktop: five equal class columns within the title panel, with card width and copy clamped to prevent overflow;
- portrait/mobile: use a six-column grid with each card spanning two columns, yielding a centered `3 + 2` arrangement, or use a tested five-row compact layout if the minimum touch target cannot be preserved;
- increase/rebalance `--title-panel` only after checking 1280×720, 1024×768, and phone portrait;
- keep every card's interactive area at least the project's current mobile target size;
- ensure the fifth card does not push the primary start action below the safe viewport.

Replace `CLASS_JOB_LABEL` in `titleScreen.js` with class data or a shared class presentation table. A fifth hardcoded branch is not acceptable.

### 7.2 Shared class presentation data

Replace/extend hardcoded class maps such as `CLASS_ACCENT` with one shared presentation record per class:

```js
presentation: {
  accent: '#e87838',
  jobLabel: 'EMBER VANGUARD',
  attackIcon: 'rifle',
  portraitKey: 'hero-gunner'
}
```

The title screen, HUD, skill panel, class badge, and any summary view should consume this record. Keep player-facing strings in English per repository policy.

### 7.3 Combat HUD and ability bar

Current HUD logic shows a sword icon for every non-magic basic attack. Make the attack slot icon data-driven:

- melee classes retain sword/weapon treatment;
- Wizard retains magic treatment;
- Ranger receives/retains an explicit bow icon;
- Gunner uses a rifle/crosshair icon.

Add skill icon metadata for Q/E/R/C rather than adding Gunner-only DOM branches. The ability bar must show lock level, cooldown, input key, and learned state consistently with other classes.

Smartlink HUD behavior:

- before level 5: no active Smartlink badge;
- at unlock: one-time toast/banner;
- after unlock: a small `SMARTLINK` or crosshair state mark attached to the basic-attack slot;
- when a target is acquired: subtle reticle feedback, color alone not required to understand lock state;
- when no target is available: do not show a false lock; the attack still fires forward.

Stim Rush HUD behavior:

- show a temporary status chip with remaining duration;
- remove it immediately on expiration/death/mode reset;
- do not reserve permanent class-state-row space when inactive.

Do not add a Heat meter for release one. The existing class-state row should remain compact and semantically useful.

### 7.4 World-space targeting feedback

The Smartlink reticle should be assistance feedback, not a promise that the game will attack automatically.

- Display only while Smartlink is unlocked and a valid target is selected/retained.
- Anchor to the target bounds with a stable screen-size clamp.
- Use shape plus color for accessibility.
- Fade promptly when invalidated.
- Avoid covering elite affixes, boss telegraphs, health bars, or damage numbers.
- On low quality or reduced motion, use a static bracket rather than pulsing/rotating elements.

### 7.5 Skill panel and level-up presentation

Because the skill panel is data-driven, Gunner entries should appear through content metadata with:

- four active skills in Q/E/R/C order;
- five passives and unlock requirements;
- numeric values rendered using the existing formatting rules;
- clear language distinguishing target acquisition from automatic attacks;
- Burn/tick/proc caps described where player decisions depend on them.

At level 5, the notification should be more prominent than a rank-up but shorter than a mode banner. If level 5 and another unlock occur in the same XP grant, queue notices rather than overlaying them.

### 7.6 Touch and responsive input

- The existing attack touch control remains the only trigger for basic rifle fire.
- Smartlink must behave identically for keyboard J and touch attack.
- Flame skills must show cooldown/lock state in the existing touch action cluster.
- The target reticle must not intercept pointer events.
- Validate safe-area insets and thumb reach in phone portrait and landscape.
- Do not add a virtual aim stick unless a later input project explicitly authorizes it.

### 7.7 Accessibility

- Do not communicate rifle/flame/lock state by color alone.
- Provide distinct icon silhouettes and concise text labels.
- Respect reduced-motion behavior for reticle, muzzle flash repetition, Stim pulse, and flame effects.
- Avoid sustained full-screen orange flashes.
- Keep rapid-fire audio peaks within the existing mix and concurrency limits.
- Verify focus order, selected-card semantics, and screen-reader labels for the fifth class card.

## 8. Save, progression, and compatibility

The existing save already persists `classId`, level, XP, learned skills, skill ranks, energy, and related hero state. Gunner uses those contracts.

Rules:

- derive Smartlink from `classId === 'gunner'` and level/unlock data;
- do not save target entity IDs, active tracers, flame zones, or Stim's transient timer;
- reconstruct/clear all temporary combat state on load and mode transitions;
- include explicit evolution, resonance, and MAX Hunt preset entries;
- do not bump `GAME_CONFIG.saveVersion` merely for a new derived passive;
- bump/migrate only if implementation introduces a persisted field that older saves cannot safely default.

Compatibility tests must cover:

- old saves from all four existing classes;
- a new Gunner save and reload;
- Gunner at levels 4 and 5;
- invalid/missing class fallback behavior without silently converting Gunner progression to Aerin tables.

## 9. Performance budgets

The class should be safe in high-density MAX Hunt and Defense scenes.

- Smartlink target selection: one scan of active enemies per actual shot, no sort, no scene traversal.
- Basic rifle: no persistent authoritative bullet object; short-lived tracer is pooled or cheaply recipe-owned.
- Q: cap representative tracers independently from logical hits.
- Flame Jet: one cast ledger, bounded tick count, no per-particle collision.
- Inferno Sweep: strict maximum ground zones and ticks; cleanup guaranteed on mode transition.
- Reticle: reuse one UI/world marker; do not construct DOM nodes every frame.
- Audio: concurrency cap for rifle shots, flame bodies, and impact variants.
- Quality settings: scale cosmetic density, not damage queries or essential danger boundaries.

Profile worst cases at level 70 with full skill ranks, dense enemy packs, held attack, active Stim, and overlapping flame zones.

## 10. File-by-file implementation map

| Area | Files/modules | Required change |
|---|---|---|
| Class content | `js/data/content.js` | Gunner row, basic profile, four actives, five passives, unlock metadata |
| Pure combat data | `js/data/skillCombat.js` | damage/status specs and capped tick rules |
| FX themes | `js/data/fxThemes.js` | rifle/flame class and skill themes |
| Config | `js/config.js` | only reusable targeting/timing constants that belong in config |
| Basic attacks | `js/systems/CombatSystem.js`, `js/systems/combat/basicAttacks/*` | explicit profile routing, rifle hitscan, Smartlink snapshot |
| Active skills | `js/systems/combat/skills/gunnerSkills.js`, skill index | Q/E/R/C execution and cleanup |
| Effect dispatch | `js/systems/combat/skillEffectRegistry.js`, handler registry | register all new effect IDs |
| Player | `js/characters/Player.js` or current split modules | facing handoff, animation/audio profile, unlock lifecycle |
| Visual factory | `js/characters/CharacterFactory.js` | look, weapon mount, muzzle ref, fallback geometry |
| GLB generator | existing hero generation scripts/maps | clips, bake profile, rifle attachment kit and CLI support |
| Asset manifest | `assets/manifests/assets.json` | local Gunner model/weapon/portrait/audio entries |
| Effects | `js/graphics/Effects.js` and recipe modules | registered muzzle, tracer, flame cone/sweep/ground effects |
| Audio | current audio manager/data | profile-based shot/skill sounds and concurrency limits |
| Progression | evolution/resonance/preset modules | explicit Gunner entries, MAX Hunt full-rank preset |
| Level feedback | `js/core/killFeedback.js`, content metadata | generic level feature notice for Smartlink |
| Title UI | `js/ui/panels/titleScreen.js`, title CSS/HTML | fifth card, shared labels, responsive 5-card layout |
| HUD | `js/ui/panels/hudCombat.js`, shared UI data/CSS | rifle icon, reticle state, Stim duration, skill icons |
| Skill UI | current skills panel | data-driven Gunner actives/passives and lock levels |
| Tests | integrity, mode, visual, responsive suites | class count, module imports, presets, icons, level transition, layouts |
| Docs | this plan; relevant living docs after implementation | update shipped contracts, then move plan to history |

Exact filenames may differ where current modules are split, but ownership boundaries should remain as above.

## 11. Delivery waves

### G0 — Contract and test scaffolding

- [ ] Freeze production display name, class ID, palette, and original visual brief.
- [ ] Add failing/fixture-ready tests for five-class enumeration and required presets.
- [ ] Add the explicit basic-attack profile schema with compatibility defaults.
- [ ] Define deterministic Smartlink and rifle-hit pure helper contracts.
- [ ] Define four active/five passive content rows behind a development-only class flag.
- [ ] Confirm save-version decision and document any migration need.

**Exit:** the architecture can distinguish melee, magic, bow, and rifle without changing existing class behavior.

### G1 — Rifle vertical slice

- [ ] Add fallback Gunner body/rifle visuals and muzzle socket.
- [ ] Implement rifle hit query, tracer, muzzle flash, hit spark, and audio fallback.
- [ ] Implement four-step combo and finisher proc cap.
- [ ] Verify keyboard and touch attack cadence.
- [ ] Verify no arrow asset/effect appears on Gunner.
- [ ] Keep the public class card hidden.

**Exit:** a developer can play levels 1–4 with a readable, deterministic rifle and no regressions to Ranger.

### G2 — Level-5 Smartlink

- [ ] Implement single-pass target selection and retention.
- [ ] Correct hero facing before shot snapshot.
- [ ] Add fallback forward shot when no candidate exists.
- [ ] Add generic level feature notification metadata and queue behavior.
- [ ] Add HUD attack-slot state and accessible target reticle.
- [ ] Test level 4 → 5 live transition in Defense.

**Exit:** Smartlink is visibly unlocked at level 5, assists only triggered attacks, and never creates autonomous or homing fire.

### G3 — Full active/passive kit

- [ ] Implement Q Suppressive Burst with target/pierce caps.
- [ ] Implement E Flame Jet with a per-cast ledger and Burn cap.
- [ ] Implement R Stim Rush with complete cleanup paths.
- [ ] Implement C Inferno Sweep with bounded ground zones.
- [ ] Register all effects and audio cues.
- [ ] Add five passives and rank descriptions.
- [ ] Tune New Hunt/MAX Hunt and Defense separately.

**Exit:** Gunner meets integrity's class-content contract and has a coherent rifle-to-flame progression.

### G4 — Production visuals and UI

- [ ] Generate/integrate original hero, rifle, portrait, and combat clips.
- [ ] Validate sockets and fallback order.
- [ ] Add shared presentation data and remove relevant hardcoded class labels/accents.
- [ ] Add fifth title card and responsive layouts.
- [ ] Add rifle/skill icons, Smartlink state, Stim timer, and skill panel content.
- [ ] Validate reduced motion, color-independent states, focus order, and touch targets.

**Exit:** the class is visually distinct, UI-complete, accessible, and readable at supported resolutions.

### G5 — Progression, saves, and release

- [ ] Add explicit weapon evolution and resonance rows.
- [ ] Add Gunner MAX Hunt preset and verify level-70/full-rank start.
- [ ] Test old saves, Gunner reload, and transient-state cleanup.
- [ ] Expand every hardcoded four-class test/fixture to five.
- [ ] Run full integrity, mode, visual, mobile, and performance gates.
- [ ] Remove the development-only visibility guard.
- [ ] Update living docs and move this plan to `docs/history/` after acceptance.

**Exit:** the public title card is enabled only after all acceptance criteria pass.

## 12. Validation plan

### 12.1 Automated tests

Update or add coverage for:

- `tests/integrity.mjs`: exactly four active skills, at least four passives, valid unlock levels, registered effects, valid assets/data paths;
- `tests/import-integrity.mjs`: import/read Gunner skill module with the existing four class modules;
- `tests/max-hunt.mjs`: replace the hardcoded expected class count of four and require a Gunner preset;
- `tests/class-mode-visual-smoke.mjs`: include Gunner bindings, look, weapon, clips, and both modes;
- basic attack profile compatibility for all five classes;
- Smartlink selection: retained target, front preference, rear emergency target, no candidate, dead target, equal-score tie breaker;
- rifle hit: nearest intersection, miss endpoint, multi-enemy lane, low-frame-rate independence;
- level-up: no Smartlink at 4, notice and behavior at 5, no duplicate notice on load;
- proc caps for three-round finisher and multi-tick flame skills;
- Stim cleanup on expiration, death, load, and mode switch;
- flame-zone lifetime and live-count caps;
- old-save compatibility and Gunner save reload.

Required project gate after implementation:

```bash
node tests/integrity.mjs
```

Also run the directly affected test scripts individually while developing so a broad integrity failure does not hide the responsible subsystem.

### 12.2 Responsive and visual tests

Extend the existing mobile/resolution coverage, including `mobile-iphone-layout` and `combat-hud-resolution-matrix`, for:

- five title cards at desktop 16:9, 1024×768, phone portrait, and phone landscape;
- class card selected/focus/disabled states;
- long skill names and lock-level labels;
- Smartlink toast plus ability bar without overlap;
- acquired-target reticle near every viewport edge;
- Stim chip with other temporary status chips;
- maximum flame effects at low/medium/high particle quality;
- reduced-motion reticle, Stim, and flame behavior.

Capture deterministic screenshots for title selection, levels 4 and 5, each active skill, MAX Hunt baseline, and Defense unlock progression.

### 12.3 Manual gameplay matrix

| Scenario | What to verify |
|---|---|
| Level 3 Defense start | Q available, Smartlink locked, rifle follows body facing |
| Level 4 → 5 | single unlock notice, immediate assisted aim, no free shot |
| Level 5 no enemies | attack fires forward; no stale reticle |
| Target crosses rear arc | front preference remains stable; close rear threat can be selected |
| Held J / held touch | cadence matches attacks and audio; no duplicate round in a frame |
| Combo finisher | three visible rounds, intended total damage, proc cap respected |
| Flame Jet into a pack | cone matches damage, targets do not receive unintended extra Burn stacks |
| Stim then death/mode switch | speed and HUD state fully reset |
| Inferno Sweep at enemy cap | zone lifetime/caps hold and mobile readability remains acceptable |
| MAX Hunt new run | Lv70, Smartlink and all skills/ranks available, correct preset/evolution |
| Save/reload | class/skills persist; reticle, target, Stim, and flame zones do not |
| Ranger comparison | bow, arrows, and Strafe remain unchanged |

### 12.4 Performance checks

Profile at the supported low and high quality settings:

- CPU time for Smartlink selection during held attack;
- allocations per rifle shot and per Flame Jet cast;
- live tracer, particle, ground-zone, reticle, and audio-node counts;
- frame pacing during level-70 Stim + Q + E + C rotations in dense packs;
- cleanup counts after zone/mode transition.

Any logical hit count may exceed the cosmetic effect count. Gameplay must stay deterministic when cosmetic density is reduced.

## 13. Acceptance criteria

The class is ready to expose publicly only when all are true:

- [ ] Gunner can be selected as the fifth class in both supported modes.
- [ ] Levels 1–4 fire a rifle strictly from current body facing.
- [ ] Level 5 unlocks Smartlink with a clear one-time notification.
- [ ] Smartlink never fires without J/touch input and never creates homing rounds.
- [ ] Rifle damage uses a frame-rate-independent authoritative query and distinct rifle presentation.
- [ ] Q/E/R/C exist at the documented bindings and unlock levels.
- [ ] The class has at least five coherent passives including Smartlink.
- [ ] Multi-round/tick skills have tested damage, status, and proc caps.
- [ ] Stim and ground-fire transient state always cleans up.
- [ ] Gunner has explicit evolution, resonance, and MAX Hunt preset data.
- [ ] Save/load works without persisting targets or temporary combat effects.
- [ ] Production hero/rifle assets and all required animation clips are integrated with safe fallbacks.
- [ ] The title screen, HUD, ability bar, skill panel, unlock toast, reticle, and touch UI are complete.
- [ ] Five-class layouts pass supported desktop/mobile resolutions and accessibility checks.
- [ ] Existing Aerin, Wizard, Rogue, and Ranger behavior remains unchanged.
- [ ] `node tests/integrity.mjs` and all affected smoke/responsive tests pass.
- [ ] Performance stays within current class baselines in dense MAX Hunt and Defense cases.
- [ ] No protected names, copied assets, signature shapes, dialogue, or recognizable audio are shipped.

## 14. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Reusing `attackStyle: 'ranged'` produces bow behavior | wrong identity and Ranger coupling | explicit `basicAttack.profile` routing before Gunner combat lands |
| High-speed projectile tunnels | missed shots vary by frame rate | authoritative hitscan/capsule plus cosmetic tracer |
| Smartlink feels like auto-play | removes facing/target skill | input-triggered snapshot, front priority, narrow retention, no homing |
| Dense packs make selection expensive | held attack degrades frame time | one scan, stable comparator, no sorting/scene traversal |
| Flame ticks over-proc | balance and performance spikes | per-cast ledger and explicit status/proc caps |
| Fifth class breaks title/mobile layout | inaccessible selection/start button | responsive 5-card matrix and automated screenshots before exposure |
| Hardcoded class maps silently omit Gunner | wrong labels/icons/presets | shared presentation data and tests that enumerate `HERO_CLASSES` |
| Fallback progression resolves to Aerin | hidden endgame data bug | mandatory explicit evolution/resonance/preset rows |
| Temporary Stim/ground state survives transitions | persistent speed/damage bug | centralized cleanup and transition/death/load tests |
| Visual inspiration becomes too derivative | legal/brand risk | original naming, silhouette, palette, assets, animation, and sound review |

## 15. Decisions to confirm before G1 production art

These decisions do not block architecture/test scaffolding, but should be frozen before expensive assets and balance work:

1. Final public hero/class name and marketing copy.
2. Whether the fourth basic combo step visually fires three rounds or one heavier round; the combat contract currently assumes three visuals with capped procs.
3. Final rifle range relative to Ranger after side-by-side playtesting.
4. Exact Burn stacking model shared with future fire content.
5. Whether Stim Rush remains cost-free or gains a non-health tradeoff after initial tuning.
6. Portrait/mobile title layout choice (`3 + 2` centered grid versus five compact rows) after real-device screenshots.

Unless testing changes these, implementation should proceed with the defaults in this plan: three-round finisher, no Heat meter, no Stim health cost, input-triggered Smartlink, and a centered `3 + 2` mobile class grid.
