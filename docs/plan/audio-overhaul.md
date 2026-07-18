# Audio Overhaul — Full Refactoring and Content Plan

**Status:** ready for execution; implementation not started  
**Captured:** 2026-07-17  
**Baseline:** current working tree, including the in-flight Gunner/rifle audio additions  
**Language:** English (project docs policy)  
**Audience:** gameplay engineers, audio implementers, asset authors, QA, agents  

**One-line goal:** Replace the current short procedural sound set and single-bus playback path with a semantic, class-readable, spatially coherent, repetition-safe audio system that remains robust under dense Hunt and Defense combat.

---

## 1. Executive conclusion

The project does not sound inexpensive because of one bad sample. The low-cost impression is produced by several layers reinforcing one another:

1. Almost every shipped sound comes from the same small procedural synthesis vocabulary.
2. The runtime routes semantically different actions into a few shared banks.
3. The mix has almost no hierarchy beyond `sfx`, `ambient`, and `master`.
4. Combat is non-spatial, world ambience is effectively absent, and there is no music system.
5. Variation is random-with-replacement, while dense hits use one global 36 ms throttle.
6. Important events reuse unrelated cues: boss spawn/special/break, level/wave/upgrade, and kill-chain/hit.
7. Loading can make the first action use a different procedural fallback before samples finish decoding.

Replacing WAV files without changing event routing, mixing, concurrency, and lifecycle would improve timbre but preserve most of the cheapness. The recommended sequence is therefore:

```text
measure and freeze the baseline
  -> build event/mixer/voice foundations with legacy adapters
  -> prove one melee and one ranged golden slice
  -> replace all player combat content
  -> add enemy/world/UI sound and spatial rules
  -> add adaptive ambience/music
  -> harden settings, performance, and QA
```

---

## 2. Measured baseline

### 2.1 Asset inventory

The current `assets/audio/combat/` set contains:

| Metric | Current value | Consequence |
|--------|---------------|-------------|
| Physical files | 40 WAV files | Very small vocabulary for five classes, 20 active skills, enemies, six zones, two modes, and UI |
| Encoded format | 44.1 kHz, 16-bit, mono PCM | Valid for short SFX, but there are no stereo beds, loops, or music sources |
| Total program duration | ~7.96 seconds | Most events necessarily reuse the same tiny source palette |
| File bytes | ~687 KiB | Loading is cheap, but the content budget is far below the presentation scope |
| Clip duration | 0.05–0.50 seconds | No natural tails, multi-stage skills, long environment layers, or musical phrases |
| Manifest banks | 32 | Banks are broad semantic buckets rather than authored event recipes |
| Manifest URL references | 56 references to 40 files | Several banks are different names for the same sound |
| Peak level | every measured file peaks at ~0.767 | Per-file peak normalization erases authored loudness relationships |

The most important duplication is `skill_0.wav`: it is referenced by 11 banks. Every themed skill bank contains its dedicated sample and the generic sample in the same `urls` array, so random selection deliberately discards the theme roughly half the time.

### 2.2 Runtime inventory

`js/core/AudioManager.js` currently owns all of the following in one class:

- AudioContext unlock and node creation.
- Manifest fetch and sample decode.
- The entire bus graph.
- Runtime synthesis fallbacks.
- Random bank selection.
- Combat density throttling.
- Class/skill bank mapping.
- Public gameplay/UI methods.
- The ambient oscillator drone.

The graph is:

```text
sample / oscillator / generated noise
  -> per-voice low-pass
  -> per-voice gain
  -> sfx
  -> one compressor
  -> master
  -> destination

two sine oscillators
  -> ambient
  -> master
```

There are at least 46 direct `.audio.*` call matches across 11 JS files, with additional optional/context calls in `killFeedback`, `gameModes`, `DefenseSystem`, and `XpGemSystem`. This is already a cross-cutting service, but its event vocabulary is still a collection of method names rather than a stable semantic contract.

### 2.3 Current signal flows

```text
Player.tryAttack
  -> audio.basicAttack(profile, combo)
  -> rifle profile: rifle bank
  -> every other profile: sword-style swing bank

Player.trySkill
  -> audio.skill(skill.sfx or theme)
  -> one themed-or-generic cast sample

successful damage
  -> CombatSystem._damageEnemy
  -> audio.hit(critical, finisher, combo/material/multiHit)
  -> one exclusive hit bank or procedural dense-hit tick

level-100 skill
  -> CombatSystem-owned anticipate/impact/finisher authority
  -> audio.apex(skillId, phase)
  -> class-timbre oscillator plus noise
```

This gets the basic rule right—attack motion can sound on a miss, while impact only sounds after positive damage—but the palette and routing are too coarse to sell the game now built around it.

---

## 3. Root-cause findings

### 3.1 Critical: source palette and loudness are homogeneous

All current shipped assets are produced by `tools/audio/generate-combat-sfx.mjs` from variations of pink noise, sine/triangle/square/saw oscillators, one-pole filters, exponential envelopes, and the same normalize/soft-clip output stage.

This produces several audible signatures of inexpensive sound:

- Similar envelope shapes and noise texture across unrelated events.
- The same maximum peak on every file, even when one cue should sit behind another.
- Very short, dry sounds without environmental or mechanical tails.
- Little stereo information and no recorded micro-detail such as cloth, wood, bow string, steel handling, creature breath, debris, or room response.
- A synthetic family resemblance between UI, combat, loot, boss, and progression cues.

The generator is useful as a deterministic fallback and prototyping tool. It should not remain the primary final-content pipeline.

### 3.2 Critical: class identity collapses before the mix

`getBasicAttackProfile()` distinguishes `melee`, `magic`, `bow`, and `rifle`, but `AudioManager.basicAttack()` treats every profile except `rifle` as `swing()`.

Current result:

| Class | Visual/gameplay identity | Current basic-attack audio identity |
|-------|--------------------------|-------------------------------------|
| Knight | heavy sword combo | shared swing |
| Wizard | staff cast / mana projectile | shared swing |
| Rogue | fast alternating daggers | shared swing |
| Ranger | draw / release / arrow volley | shared swing |
| Gunner | rifle | rifle-specific bank |

The fifth class proves the data path can carry a profile, but the other four profiles do not yet have an audio implementation.

Skill identity also collapses because:

- `Player.trySkill()` passes an `sfx` bank or theme, not the authoritative `skillId` and phase context.
- Most skills sound only once at cast start; their release, travel, pulse, impact, loop, and finale are not generally authored.
- The themed bank randomly selects the generic fallback even when the themed file is loaded.
- Level-100 Apex phases use the same oscillator/noise grammar with only numeric profile changes.

### 3.3 Critical: events are exclusive samples instead of layered recipes

`hit()` chooses `hit_light`, `hit_crit`, or `hit_finisher`. Critical takes precedence over finisher, so a critical finisher loses the finisher sample identity instead of combining both properties.

A premium contact should be composed from independent semantic layers:

```text
target material body
  + weapon/contact transient
  + weight layer (light/heavy/finisher)
  + critical accent when applicable
  + bounded crowd/debris layer for grouped hits
  + optional environment send
```

This allows material, weapon, weight, criticality, and density to coexist instead of competing for one bank key.

### 3.4 High: important semantic cues are reused or missing

Examples of overloading:

- `boss()` is used for boss spawn, boss special, Defense champion break, and Defense champion/boss arrival.
- `levelUp()` is used for actual level-up, hunt milestone, contract completion, wave clear, skill upgrade, gear enhance, and weapon upgrade.
- `killSting()` reuses normal/finisher hit or level samples and can be affected by hit throttling.
- Every loot rarity uses the same pickup bank with pitch/volume changes.
- XP pickups rise chromatically by up to one octave, which emphasizes an arcade/synthetic quality during dense collection.
- UI success, failure, equip, sell, enhance, and mutation selection mostly reuse `click()`.

Major missing domains:

- Player footsteps and surface response.
- Bow, magic, and dagger basic-attack identities.
- Enemy movement, exertion, telegraph, attack release, projectile travel, impact, and death.
- Non-boss enemy audio of any kind.
- Six-zone ambient beds and local one-shots.
- Hunt/Defense state transitions beyond reward stings.
- Death/failure and respawn sound arcs.
- Title, exploration, combat, boss, and victory music.
- General panel open/close, focus, confirm, reject, warning, and destructive-action UI cues.

### 3.5 High: the mix cannot express hierarchy

The current graph has one SFX bus, one compressor, a master gain, and a very quiet two-frequency ambient drone. It has no:

- Player/enemy/impact/UI/world/music sub-buses.
- Mix snapshots for title, exploration, combat, boss, pause, death, or victory.
- Priority ducking for enemy telegraphs, player hurt, or major rewards.
- Reverb/space send.
- Master safety limiter distinct from combat glue.
- Runtime meter or clipping diagnostic.
- Per-category user controls.

The content is also filtered twice: many generated samples are already aggressively low-passed, then `playSample()` applies another low-pass. Skill calls default to roughly 1.2 kHz and impacts often sit below 1 kHz. The result may avoid harshness, but it also removes transient definition and makes different events collapse into the same dark mid/low band.

### 3.6 High: dense-combat control is global and order-dependent

`hit()` uses one global 36 ms window and one global burst count. Consequences:

- Unrelated contacts can suppress each other based on call order.
- A close player hit and a distant hit are treated as one cluster.
- The semantic source/cast/target group is lost.
- `killSting()` may land inside the same hit policy.
- Dense secondary ticks create fresh procedural buffers and oscillators instead of using prepared assets.

There is no per-event voice limit, priority, source ownership, distance policy, or voice stealing. `playSample()` does not track active voices and does not explicitly disconnect nodes on `ended`.

### 3.7 High: there is no spatial or environmental scene

All SFX feed the same non-spatial bus. The camera/listener is never updated. A boss special, distant projectile, nearby hit, UI click, and reward sting have no spatial-policy distinction.

The world has six visually distinct zones—Verdant, Forest, Canyon, Frost, Ember, and Astral—but the audio scene remains the same two low sine oscillators everywhere. This disconnect makes the environment feel like a visual diorama rather than a place.

### 3.8 Medium: first-use and lifecycle behavior are inconsistent

On the first title action, `unlock()` creates the context, starts the drone, and starts `#loadSamples()`, but it does not await sample loading. The game action continues immediately. Therefore the first attack/skill can use a procedural fallback while later actions use decoded WAVs.

Additional lifecycle gaps:

- `AudioManager` fetches `assets.json` again instead of consuming the manifest already loaded by `AssetManager`.
- Load/decode failures are swallowed without diagnostics or a per-bank status.
- `sampleReady` is written but not used as a readiness contract.
- There is no critical/secondary/lazy preload policy.
- There is no explicit visibility suspend/resume, scene teardown, or dispose path.
- The oscillator ambience does not change on title/mode/zone transitions.

### 3.9 Medium: settings and tests prove wiring, not output quality

The player has a single mute toggle. There are no master/music/SFX/ambience sliders, persisted preferences, dynamic-range mode, or output diagnostics.

Current tests correctly protect manifest paths, hit material mapping, Apex event authority, and method presence. They do not yet protect:

- Audio graph topology or bus gains.
- Variant no-repeat behavior.
- Per-event concurrency and priority.
- Voice cleanup and background suspend.
- Asset loudness, DC offset, silence, loop seams, or clipping.
- Class/skill/enemy/zone audio coverage.
- First-input readiness.
- Actual browser AudioContext behavior.

---

## 4. Goals, non-goals, and quality bar

### 4.1 Goals

1. Make all five classes recognizable from basic-attack audio alone.
2. Give every active skill an authored audio recipe aligned to its gameplay phases.
3. Preserve the correct miss/contact rule and the existing Apex ownership/cancellation authority.
4. Keep player actions and enemy telegraphs readable during dense Hunt and Defense waves.
5. Make each of the six zones recognizable with the screen hidden.
6. Establish stable loudness hierarchy, headroom, and device-safe dynamic range.
7. Eliminate obvious immediate repetition without unbounded voice counts.
8. Guarantee sample-backed critical cues after the user unlock gesture.
9. Add music and ambience without runtime CDN dependencies.
10. Keep audio data frozen, testable, and inside the Sol-owned boundary.

### 4.2 Non-goals

- No camera shake or hit-stop re-enable.
- No combat damage, cooldown, range, enemy AI, or reward-balance retune.
- No voice acting/dialogue system in this pass.
- No external runtime audio URLs or CDN.
- No `vendor/` edits.
- No move of Sol audio content into `packages/template-3d`.
- No widening of `GAME_CONTEXT_KEYS`; `audio` already exists.
- No requirement to spatialize every dense hit or projectile as an independent HRTF voice.

### 4.3 Player-facing acceptance criteria

| ID | Criterion | Proof |
|----|-----------|-------|
| Q1 | Five basic-attack families are identifiable without looking | Blind A/B test; target at least 80% correct classification |
| Q2 | Miss, contact, critical, heavy, and finisher have distinct functions | Controlled combat matrix |
| Q3 | Every active skill has a resolved recipe and valid phase coverage | Automated catalog/content test plus 20-skill manual pass |
| Q4 | Enemy telegraphs remain audible under dense player hits | Defense stress run |
| Q5 | No obvious immediate repeat where a bank has 3+ variants | Unit test and 60-second spam audition |
| Q6 | No major event is silently stolen by routine impacts | Priority/concurrency test plus stress run |
| Q7 | Zone and mode transitions crossfade without clicks | Six-zone traversal and mode matrix |
| Q8 | Critical pack is ready before gameplay begins after unlock | Browser readiness smoke test |
| Q9 | Background tab and pause behavior are controlled and leak-free | Browser lifecycle test |
| Q10 | Master output does not clip in the reference stress scene | Analyser capture and manual recording |

---

## 5. Target architecture

### 5.1 Dependency direction

```text
content / combat / modes / UI
  -> AudioManager stable facade
      -> semantic event resolver (game-owned catalog)
      -> asset loader
      -> voice manager
      -> mixer and snapshots
      -> listener / ambience / music scene
      -> Web Audio API
```

Audio remains game-owned. The template boundary is preserved:

- `js/core/AudioManager.js` stays the Game-facing service.
- New `js/audio/*` modules are Sol-owned unless a later boundary decision explicitly promotes a content-free primitive.
- `js/data/audioCatalog.js` does not enter template-candidate modules.
- Systems access audio through `(this.ctx ?? this.game).audio` on touched lines where practical.

### 5.2 Proposed files

| File | Responsibility |
|------|----------------|
| `js/core/AudioManager.js` | Stable public facade, lifecycle, legacy adapters, debug snapshot |
| `js/audio/AudioAssetLoader.js` | Manifest normalization, prefetch/decode, lazy groups, bank status |
| `js/audio/AudioMixer.js` | Buses, sends, snapshots, duck automation, master safety stage |
| `js/audio/AudioVoiceManager.js` | Variant selection, layering, spatial gain/pan, limits, priority, cleanup |
| `js/audio/AudioScene.js` | Listener transform, zone ambience, mode intensity, transition crossfades |
| `js/data/audioCatalog.js` | Frozen semantic events, layers, bank ids, priorities, concurrency, spatial policy |
| `js/data/audioMix.js` | Frozen bus gains, snapshot targets, voice budgets, attenuation curves |
| `tools/audio/build-audio.mjs` | Deterministic packaging/transcode/metadata step for authored assets |
| `tools/audio/analyze-audio.mjs` | Duration/peak/RMS/crest/DC/silence/loop validation |
| `tools/audio/audition.html` | Local served bank/event audition matrix; not player UI |
| `tests/audio-catalog.mjs` | Event/content/manifest coverage |
| `tests/audio-runtime.mjs` | Resolver, shuffle bag, voice limits, snapshots, cleanup with fakes |
| `tests/audio-browser-smoke.mjs` | Unlock, readiness, lifecycle, browser graph/debug assertions |

This can be delivered incrementally. The first foundation slice may combine small modules if splitting them early adds no clarity, but responsibilities and tests must remain separate.

### 5.3 Stable facade and semantic event API

Keep current public methods during migration:

- `basicAttack(kind, combo, context?)`
- `swing(combo, context?)`
- `hit(critical, finisher, options?)`
- `skill(themeOrKey, context?)`
- `apex(skillId, phase, context?)`
- `hurt`, `dash`, `pickup`, `killSting`, `boss`, `levelUp`, `legendary`, `click`

Each becomes a compatibility adapter over one semantic entry point:

```js
audio.emit('combat.player.basic.release', {
  classId,
  weaponFamily,
  combo,
  finisher,
  position,
});

audio.emit('combat.contact', {
  source: 'player',
  weaponFamily,
  material,
  intensity,
  critical,
  crowdCount,
  position,
});

audio.emit('skill.phase', {
  skillId,
  theme,
  phase: 'anticipate' | 'release' | 'impact' | 'pulse' | 'finish',
  position,
});
```

Callers should progressively pass authoritative ids and context. The old bank-string path remains until all callers and tests migrate.

### 5.4 Frozen event recipe schema

Illustrative shape:

```js
Object.freeze({
  id: 'combat.contact',
  bus: 'impact',
  priority: 70,
  maxVoices: 10,
  cooldownMs: 18,
  coalesce: 'source-cast-position-cell',
  spatial: 'world-near',
  layers: Object.freeze([
    Object.freeze({ select: 'material', bankPrefix: 'impact.material', gainDb: -8 }),
    Object.freeze({ select: 'weaponFamily', bankPrefix: 'impact.weapon', gainDb: -10 }),
    Object.freeze({ when: 'finisher', bank: 'impact.weight.finisher', gainDb: -12 }),
    Object.freeze({ when: 'critical', bank: 'impact.accent.critical', gainDb: -14 }),
  ]),
});
```

Rules:

- No magic playback numbers scattered through gameplay systems.
- Selection context is plain data; it does not import combat logic into audio modules.
- Material, weapon, intensity, critical, and density layers can coexist.
- Missing optional layers degrade gracefully; missing critical banks are a test failure.

### 5.5 Manifest evolution

Normalize both the current flat format and a richer format during migration. A target bank entry needs:

- One or more local source variants.
- Preload group: `critical`, `secondary`, or `lazy`.
- Mono/stereo intent.
- Loop metadata where applicable.
- Optional codec alternatives selected by runtime capability.
- License/provenance id.
- Expected duration/loudness family for validation.

Do not make AudioManager fetch the manifest a second time. `Game.initialize()` should pass the already loaded manifest section into `audio.prepare(...)`. Raw critical bytes may be prefetched before unlock; decode happens after the user gesture creates/resumes the AudioContext.

### 5.6 Mixer topology

Recommended initial graph:

```text
player ----\
impact -----+-> combat glue ----\
enemy -----/                      \
world ----------------------------+-> master safety -> destination
ui -------------------------------+
ambience bed ---------------------+
ambience one-shots -> space send -+
music ----------------------------+
```

Required buses:

| Bus | Role | Priority rule |
|-----|------|---------------|
| `player` | attack releases, dash, hurt, class mechanics | Never stolen by routine world sounds |
| `impact` | contacts, criticals, finishers, grouped debris | Coalesce aggressively in hordes |
| `enemy` | telegraphs, attacks, boss states, deaths | Telegraphs outrank routine contact |
| `world` | footsteps, props, distant one-shots | Lowest combat priority |
| `ui` | navigation and decisions | Non-spatial, protected but low loudness |
| `ambience` | zone beds and local layers | Duck modestly in dense combat |
| `music` | adaptive score | Snapshot-driven, never through combat compressor |
| `spaceReturn` | short environment response | Bounded send; no per-event reverb nodes |

Snapshots:

- `title`
- `hunt_explore`
- `hunt_combat`
- `defense_prep`
- `defense_combat`
- `boss`
- `paused`
- `dead`
- `victory`

Snapshot transitions use scheduled gain ramps. Major player hurt, boss arrival, break, and victory may apply short priority duck envelopes; routine hits may not pump the whole mix.

### 5.7 Spatial policy

Use spatialization as a readability tool, not as a blanket effect:

| Source | Policy |
|--------|--------|
| UI, level-up, major reward | 2D |
| Player basic/skill release | mostly 2D or very narrow near-player placement |
| Player contact | near-world placement, bounded stereo movement |
| Enemy telegraph/attack | positional with protected minimum audibility |
| Distant enemy routine movement/death | positional and distance-limited |
| Dense grouped impacts | one clustered positional voice per source/cast/cell |
| Zone bed/music | stereo 2D |
| Ambient local one-shots | sparse positional voices |

Listener position should be a documented blend appropriate for the elevated third-person camera, not blindly the camera position. The listener and orientation update once per frame through `AudioScene`, using existing `camera` and `player` context without adding GameContext keys.

### 5.8 Voice and variation policy

Implement:

- Shuffle-bag bank selection with no immediate repeat when variants allow it.
- Narrow, event-specific pitch/gain variation; avoid pitching the entire event recipe together.
- Per-event and per-bus voice limits.
- Priority-based stealing with protected categories.
- `onended` cleanup and explicit disconnect.
- Coalescing keyed by semantic source/cast and position cell, not one global timestamp.
- Crowd layers driven by `crowdCount` rather than one voice per victim.
- Cached/prepared procedural fallback buffers; no fresh noise-buffer allocation on dense hits.

Initial total voice budgets should be tuned by quality/device profile, with a conservative reference range rather than an unlimited graph. Exact caps are set during the golden stress scene and live in `audioMix.js`, not call sites.

---

## 6. Content strategy

### 6.1 Production principle

Use hybrid authored assets:

- Recorded/foley or properly licensed source material for physical detail.
- Designed synthesis for magic, energy, and impossible materials.
- Layered processing for class identity.
- Offline renders for deterministic runtime playback.
- Runtime synthesis only as an emergency fallback or deliberately subtle procedural layer.

Every external source must be stored locally for runtime and have provenance recorded. No asset enters the manifest without a license/provenance entry.

### 6.2 Player basic-attack palettes

| Class | Required vocabulary |
|-------|---------------------|
| Knight | grip/cloth prep, broad steel air, blade transient, heavy body, finisher tail |
| Wizard | staff/gesture detail, mana gather, release pulse, orb travel, magical contact |
| Rogue | alternating left/right short swishes, dagger handling, puncture/cut transient, flurry tail |
| Ranger | draw tension, string release, bow body, arrow launch/flyby, target material impact |
| Gunner | trigger/mechanism, muzzle crack, pressure body, short tail, burst/finisher cadence |

Minimum target: multiple variants per frequent layer, separate light/mid/finisher grammar, and no sharing of a full attack event between classes. Shared material/body layers are acceptable below class-specific release layers.

### 6.3 Skill audio

All 20 active skills must map by `skillId`, not only theme. Reuse happens through compositional layers:

```text
class gesture/release
  + element/theme layer
  + skill signature
  + gameplay phase layer
  + target material on actual contact
```

Each skill receives an explicit phase map based on its real behavior:

- One-shot projectile: anticipate/release, travel if useful, impact or miss retire.
- Multi-hit: release, bounded pulse cadence, finale.
- Area field: deploy, loop start, sparse loop accents, expire/finale.
- Movement skill: depart, travel, arrive/contact.
- Buff: apply, active confirmation, expire only if it communicates gameplay.
- Apex: retain current authoritative anticipate/impact/finisher ordering and cancellation tests.

`timeline.hits` and combat authority stay unchanged unless a presentation-only alignment correction is explicitly proven necessary.

### 6.4 Contact and material palette

Replace regex-only shape inference over time with explicit frozen audio metadata on enemy content, for example:

```js
audio: Object.freeze({
  material: 'flesh' | 'hide' | 'plant' | 'gel' | 'chitin' | 'stone' | 'armor' | 'spectral',
  vocalFamily: 'beast-small',
  movementFamily: 'paw-light',
  size: 'small' | 'medium' | 'large' | 'boss',
})
```

Keep `_hitMaterialFor()` as a compatibility fallback until all `ENEMY_TYPES` rows have coverage. Material metadata affects presentation only.

### 6.5 Enemy and boss palette

Do not create a unique full library for every monster first. Build reusable audio archetypes, then add signature layers for elites and bosses:

- Small critter/swarm.
- Beast.
- Plant/root.
- Humanoid/raider.
- Armored/chitin/construct.
- Spectral/wisp/astral.
- Mini-boss and boss signatures.

Required event families:

- Awareness/engage, rate-limited.
- Movement/foley for nearby important enemies only.
- Telegraph.
- Attack release and projectile/charge motion.
- Hurt accents for elites/bosses only; routine mobs rely on impact/material.
- Death by archetype/size with crowd coalescing.
- Boss spawn, special telegraph, special release, stagger/break, death—each semantically distinct.

### 6.6 World and locomotion

Create one base bed plus sparse local one-shots for each zone:

| Zone | Bed identity | Local accents |
|------|--------------|---------------|
| Emerald Meadow | open wind, soft grass, distant life | birds/insects/leaf movement |
| Whispering Grove | enclosed canopy, wood movement | branch creaks, distant fauna, thorn rustle |
| Sunscar Canyon | dry wind and rock air | grit, stone ticks, distant rumbles |
| Frostcrown Plateau | cold wind and broad silence | ice stress, snow movement, crystal ticks |
| Ember Wilds | low furnace/lava bed | cracks, vents, ember bursts |
| Starfall Ruins | restrained void/crystal tone | crystal resonance, distant spatial anomalies |

Add player footsteps using movement speed/cadence and terrain/zone surface metadata. This pass does not require animation foot-marker architecture; a small locomotion audio controller can use distance traveled and locomotion state, with combat one-shots suppressing inappropriate step spam.

### 6.7 UI, loot, and progression

Define semantic UI events:

- Focus/hover where device input supports it.
- Confirm, cancel/back, open, close.
- Reject/error/insufficient currency.
- Equip, sell/salvage, enhance attempt, success, failure, resonance unlock.
- Skill upgrade and mutation select.
- Save confirmation and destructive-action warning.

Define reward events separately:

- Gold, potion, essence, XP batch.
- Gear pickup by rarity family.
- Legendary drop, legendary equip, and mode victory as different recipes.
- Level-up, wave clear, contract complete, hunt milestone, and weapon evolution as different stingers sharing motifs rather than one sample.

Replace the full-octave XP chromatic ramp with a subtler bounded progression or batched pickup phrase. Dense same-frame rewards should aggregate by type and value band.

### 6.8 Music

Music is part of the complete sound overhaul but follows combat/world foundations. Minimum score states:

- Title.
- Hunt exploration.
- Hunt combat escalation.
- Defense prep/combat.
- Boss escalation.
- Death/failure.
- Victory/major reward sting.

Prefer a small adaptive stem system over many unrelated full tracks. Long-form source format and fallback variants must be selected through a browser compatibility spike and local capability detection; do not hardcode a codec assumption into the plan. Music loads lazily after the critical SFX pack and crossfades through `AudioScene` snapshots.

---

## 7. Asset pipeline and quality control

### 7.1 Directory layout

```text
assets/audio/
  combat/player/{knight,wizard,rogue,ranger,gunner}/
  combat/impact/{material,weight,accent}/
  combat/enemy/{archetype,boss}/
  movement/{footstep,surface}/
  ui/
  rewards/
  ambience/{verdant,forest,canyon,frost,ember,astral}/
  music/
  licenses.json
```

Keep source/DAW material outside runtime-loaded folders or clearly mark it non-runtime. Do not make production source files part of the preload manifest.

### 7.2 Authoring rules

- Mono for positional one-shots; stereo only for deliberately non-spatial beds/UI/music.
- Preserve transient crest differences; do not peak-normalize every file to the same number.
- Trim leading silence while keeping authored anticipation where required.
- Add safe micro-fades and verify no boundary clicks.
- Keep layer stems frequency-complementary before runtime mixing.
- Author family-relative loudness; runtime gains are fine adjustment, not rescue.
- Export loop metadata and validate loop seams.
- Keep deterministic names: `<domain>_<family>_<event>_<weight>_<variant>`.
- Record source/license/editor/version in `licenses.json`.

### 7.3 Automated analyzer gates

`tools/audio/analyze-audio.mjs` should report and optionally fail on:

- Missing/invalid WAV or selected long-form source headers.
- Unexpected channel count or sample rate.
- Excess peak/true-peak proxy.
- DC offset.
- Long leading/trailing digital silence.
- Very low RMS indicating accidental silence.
- Suspiciously low crest factor on transient SFX.
- Duration outside the declared family range.
- Loop boundary discontinuity.
- Duplicate file hashes under different variant names.
- Missing license/provenance id.

Loudness targets must be family-relative and calibrated through the mixer; one universal normalization target would repeat the current mistake.

---

## 8. Delivery waves

### Wave A0 — Baseline, instrumentation, and contracts

Tasks:

- [ ] Add the asset analyzer and capture current metrics as a checked test fixture.
- [ ] Add an audio event/call-site inventory covering direct and optional context calls.
- [ ] Define `audioCatalog` and `audioMix` schemas with frozen validation.
- [ ] Add an `AudioManager.debugSnapshot()` contract: load states, buses, active voices, steals, coalesces, missing events.
- [ ] Protect current miss/contact and Apex ordering behavior before refactoring.
- [ ] Record that current procedural sounds are compatibility assets, not the quality reference.

Exit:

- Current behavior is measurable.
- Every existing public method has a named semantic target.
- No sound content changes yet.

### Wave A1 — Loader, mixer, and voice foundation

Tasks:

- [ ] Consume `AssetManager`'s loaded manifest instead of fetching it again.
- [ ] Add `prepare()` / `unlock()` / critical-decode readiness states.
- [ ] Build buses, master safety, snapshots, and scheduled transitions.
- [ ] Build tracked voices, cleanup, shuffle bags, limits, priorities, and semantic coalescing.
- [ ] Cache procedural fallbacks once; remove dense per-hit buffer generation.
- [ ] Add visibility suspend/resume and explicit dispose/scene reset.
- [ ] Keep all current AudioManager methods as adapters.
- [ ] Run old assets through the new engine for parity.

Exit:

- No caller migration required for parity.
- First gameplay starts only after the critical pack is decoded.
- Stress tests show bounded voices and clean teardown.

### Wave A2 — Golden combat slice

Use one melee and one ranged slice to prove the entire pipeline before producing all content.

Recommended slice:

1. Knight basic combo and finisher.
2. Gunner or Ranger basic release and contact.
3. One material set with normal/critical/finisher layering.
4. One simple skill and one multi-phase/Apex skill.

Tasks:

- [ ] Produce authored hybrid source variants.
- [ ] Pass `classId`, `weaponFamily`, position, and combo context from Player.
- [ ] Pass material, intensity, crowd count, and source/cast context from CombatSystem.
- [ ] Split critical and finisher into combinable recipe layers.
- [ ] Establish the reference loudness hierarchy and golden stress scene.
- [ ] Conduct blind class/readability and 60-second repetition auditions.

Exit:

- The slice sounds materially better than the current build in a level-matched A/B capture.
- If it does not, stop and revise content/mix before cascading.

### Wave A3 — All player combat

Tasks:

- [ ] Complete all five basic-attack palettes.
- [ ] Migrate `Player.trySkill` from bank-only context to `skillId` plus phase context.
- [ ] Author recipes for all 20 active skills.
- [ ] Preserve and extend Apex ordering/cancellation tests.
- [ ] Add dash, hurt, death, potion, energy/resource-ready, and weapon-resonance cues.
- [ ] Replace direct skill `swing()` calls with intentional phase events where appropriate.
- [ ] Remove `skill_0` from themed random pools; retain it only as an explicit fallback.
- [ ] Decide whether `hit_heavy` becomes a real layer or is removed as dead content.

Exit:

- All class/skill coverage tests pass.
- Five-class basic and 20-skill manual matrix accepted.

### Wave A4 — Enemy, Defense, and crowd readability

Tasks:

- [ ] Add explicit enemy audio metadata with regex fallback.
- [ ] Implement archetype telegraph/release/death families.
- [ ] Give bosses separate spawn/special/break/death events.
- [ ] Replace generic Defense `boss()`/`levelUp()` calls with wave prep/start/clear/break/champion/boss semantics.
- [ ] Add projectile/charge/ground-hazard cues where they improve fairness.
- [ ] Tune protected telegraph priority against impact coalescing.
- [ ] Validate dense waves at low/medium/high voice budgets.

Exit:

- Enemy threats are directional and readable without routine mob noise becoming a wall.
- Defense stress scene stays within voice/CPU/output limits.

### Wave A5 — World, locomotion, UI, and rewards

Tasks:

- [ ] Add listener update and the documented camera/player blend.
- [ ] Add player footsteps and six surface/zone mappings.
- [ ] Add six zone beds and sparse local one-shots.
- [ ] Add zone and Hunt/Defense snapshot transitions.
- [ ] Replace generic UI click routing with semantic UI events.
- [ ] Split loot/progression stingers and batch XP/reward spam.
- [ ] Add death, respawn, return-to-title, continue, and victory arcs.

Exit:

- Six zones and major mode states are recognizable by sound.
- UI/reward feedback communicates meaning without dominating combat.

### Wave A6 — Adaptive music

Tasks:

- [ ] Complete codec/browser capability spike and manifest source policy.
- [ ] Produce title, Hunt, Defense, boss, death, and victory material.
- [ ] Implement stem/section synchronization and snapshot crossfades.
- [ ] Lazy-load music after critical SFX.
- [ ] Duck/transition music for boss, pause, death, and victory without audible pumping.
- [ ] Validate loop seams and long-session memory behavior.

Exit:

- Music supports rather than masks combat hierarchy.
- Mobile and desktop lifecycle tests pass.

### Wave A7 — Settings, accessibility, cleanup, and release

Tasks:

- [ ] Add Master, Music, SFX, and Ambience controls in the System panel.
- [ ] Persist audio preferences separately from run balance/save progression.
- [ ] Add at least `Full` and `Reduced` dynamic-range profiles.
- [ ] Keep one-click mute and restore prior gains correctly.
- [ ] Surface debug-only missing-bank/voice/clip diagnostics under `?debug=1`.
- [ ] Remove unused legacy banks and procedural public helpers only after call-site proof.
- [ ] Update `docs/audio.md`, `docs/assets.md`, `docs/combat.md`, and relevant mode/UI docs.
- [ ] Move this plan to `docs/history/` only after product acceptance and integrity-green completion.

Exit:

- Release matrix accepted, obsolete paths removed, living docs match runtime.

---

## 9. File touch map

| Path | Planned change |
|------|----------------|
| `js/core/AudioManager.js` | Stable facade, prepare/unlock/update/dispose, compatibility methods, debug snapshot |
| `js/core/Game.js` | Pass manifest, update listener/scene, lifecycle hooks |
| `js/core/gameModes.js` | Semantic scene/snapshot/stinger transitions |
| `js/core/killFeedback.js` | Dedicated chain/multikill/level events |
| `js/data/content.js` | Skill/class/enemy/zone audio metadata only; no balance changes |
| `js/entities/Player.js` | Authoritative class/weapon/skill/position phase context |
| `js/entities/Enemy.js` | Nearby movement/telegraph/release/death emit points |
| `js/systems/CombatSystem.js` | Contact recipe context, enemy attack events, material fallback |
| `js/systems/combat/*` | Skill-specific phase emits only where generic timing cannot express intent |
| `js/systems/DefenseSystem.js` | Prep/start/clear/break/champion/boss/hazard semantics |
| `js/systems/LootSystem.js` | Typed/rarity reward events and batching context |
| `js/systems/XpGemSystem.js` | Bounded/batched XP pickup phrase |
| `js/ui/UI.js`, `js/ui/panels/*` | Semantic UI events and English settings controls |
| `assets/manifests/assets.json` | Rich banks/streams metadata and local paths |
| `assets/audio/**` | Authored SFX, ambience, music, provenance |
| `tools/audio/**` | Build, analysis, audition; generator retained as fallback tool |
| `server.mjs` | MIME additions only if the compatibility spike selects new local formats |
| `tests/integrity.mjs` | Nest new audio gates and manifest/license coverage |

Do not change the save schema unless persisted audio settings genuinely require it. Prefer a separate local preference key so save-game compatibility and progression remain untouched.

---

## 10. Validation matrix

### 10.1 Automated structural and unit gates

| Gate | Pass rule |
|------|-----------|
| Catalog schema | Frozen, valid ids/layers/buses/priorities; no dangling bank references |
| Content coverage | Five classes, all active skills, all enemy types, and six zones resolve |
| Manifest | Every local source exists; no runtime remote URLs; provenance present |
| Variant selection | No immediate repeat with 3+ variants; deterministic seeded test path |
| Concurrency | Event/bus/global caps hold; protected voice cannot be stolen by lower priority |
| Coalescing | Same cast/cell groups; unrelated sources do not suppress each other |
| Cleanup | Every ended/stolen voice disconnects and leaves counters balanced |
| Mixer | Snapshot ramps reach expected targets; mute/unmute restores configured gains |
| Lifecycle | prepare/unlock/visibility/dispose are idempotent and recover correctly |
| Legacy adapters | Existing public method names remain safe until explicit removal |
| Apex authority | Existing ordered, recast, miss, death, and class-switch tests remain green |
| Waveform analysis | Declared channel/duration/peak/DC/silence/loop/provenance rules pass |
| Template boundary | No Sol audio content enters template candidates; GameContext unchanged |

### 10.2 Browser gates

- Desktop Chromium, Firefox, and Safari reference runs.
- iOS Safari unlock/resume/background test.
- Android Chromium unlock/resume test.
- First title gesture produces no autoplay rejection and waits only for the critical pack.
- Backgrounding suspends/ducks as designed; return does not duplicate music/ambience nodes.
- Device output change or context interruption recovers without rebuilding duplicate graphs.

### 10.3 Manual listening matrix

1. Five classes × basic combo × miss/contact/critical/finisher.
2. Twenty active skills × normal/form/Apex phase behavior where applicable.
3. Material set × light/heavy/critical/finisher.
4. Enemy archetypes × telegraph/release/death.
5. Six zones × explore/combat/transition.
6. Hunt and Defense × prep/combat/boss/death/victory.
7. UI × confirm/reject/open/close/equip/sell/enhance/save/destructive warning.
8. Loot × gold/potion/essence/gear rarity/legendary/XP batch.
9. Full and Reduced dynamic-range profiles.
10. Speakers, headphones, and a small mobile speaker reference.

Level-match A/B comparisons. A louder version is not automatically a better version.

### 10.4 Performance gates

- Reference Defense stress scene records active voices, steals, coalesces, decode memory, and output peak.
- No per-frame or per-hit unbounded AudioBuffer allocation.
- Voice count returns to ambience/music baseline after combat.
- No audible clicks during voice stealing, snapshot change, loop, pause, or scene teardown.
- Critical player/telegraph cues survive the low-quality/device budget.

Run `node tests/integrity.mjs` for every slice that touches content, paths, skills, UI, manifest, or runtime modules.

---

## 11. Risks and stop rules

| Risk | Mitigation |
|------|------------|
| Producing many assets before the runtime grammar is proven | Golden melee+ranged slice before cascade |
| Louder mix mistaken for higher quality | Level-matched A/B and output/headroom gate |
| Hordes create an unreadable wall | Semantic clustering, priority, crowd layers, voice budgets |
| Spatial audio weakens player feedback | Mostly-2D player policy and protected minimum gain |
| Browser autoplay/codec variance | Critical prefetch + gesture decode + capability-tested local alternatives |
| Asset licensing ambiguity | Required provenance id and integrity failure |
| Audio refactor changes combat timing | Presentation-only events; preserve hit/Apex authority tests |
| New settings break save compatibility | Separate local preference storage by default |
| Module split violates template boundary | Keep all event/catalog content game-owned; no new context key |
| Existing in-flight Gunner work is overwritten | Re-audit the working tree before Wave A0 and preserve current additions |

Stop rules:

1. Do not cascade asset production if the golden slice fails the level-matched listening gate.
2. Do not start music implementation while combat hierarchy still clips or masks telegraphs.
3. Do not spatialize every horde contact; cluster first.
4. Do not change damage/balance to make audio feel heavier.
5. Do not re-enable camera shake or hit-stop.
6. Do not remove legacy methods until graph/search and tests prove all callers migrated.
7. Do not ship an asset with unknown provenance.

---

## 12. Recommended first execution slice

The highest-ROI first implementation is **A0 + A1 + the smallest A2 golden slice**:

1. Add catalog/mix schemas and runtime diagnostics.
2. Introduce the loader/mixer/voice manager behind the unchanged AudioManager API.
3. Run the existing assets through the new graph.
4. Produce Knight combo + finisher, one ranged family, and layered flesh/stone contacts.
5. Capture level-matched old/new gameplay.
6. Tune until class, contact, and hierarchy pass before producing the remaining library.

This sequence proves the architectural investment and the content direction together. It avoids spending a full asset budget on a routing/mix model that has not yet demonstrated a premium result.

---

## 13. Completion definition

The overhaul is complete only when:

- All acceptance criteria Q1–Q10 pass.
- All five basic families and 20 active skills have accepted recipes.
- All enemy types and zones resolve through explicit or approved fallback metadata.
- Hunt, Defense, boss, death, and victory states have coherent snapshots.
- UI/settings and audio preference persistence are shipped in English.
- Critical assets are sample-backed after unlock with no remote runtime dependency.
- Audio stress, browser, waveform, integrity, and template-boundary gates are green.
- The product owner accepts a level-matched A/B listening capture.
- Living docs are updated and this file is moved to history.

---

**End of Audio Overhaul specification.**
