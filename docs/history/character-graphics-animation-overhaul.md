# Hero Graphics & Animation Overhaul — Full Implementation Plan

**Status:** implemented and verified
**Captured:** 2026-07-17 · research hardening, implementation, and three cold review/fix passes completed the same day

**Language:** English (project docs policy)
**Audience:** character artists, technical animators, graphics/runtime implementers, reviewers, and agents

**One-line goal:** Replace all five playable heroes with authored, anatomically coherent, deformation-ready characters and a layered animation runtime; make Gunner read as an original powered expeditionary marine; and make missing, malformed, or incorrectly bound assets fail visibly in development instead of rendering as primitive shapes.

---

## Document map

| Section | Contents |
|---------|----------|
| §1 | Product mandate and scope |
| §2 | Executive decisions |
| §3 | Repository audit and evidence |
| §4 | Root-cause model for the visual failures |
| §5 | External research synthesis |
| §6 | Target art direction |
| §7 | Shared hero asset contract |
| §8 | Target animation architecture |
| §9 | Gunner golden slice |
| §10 | Other four class conversions |
| §11 | Rendering/material reliability |
| §12 | Authoring and export pipeline |
| §13 | Workstreams and delivery waves |
| §14 | File map and architecture boundary |
| §15 | Validation and acceptance matrix |
| §16 | Provisional performance budgets |
| §17 | Risks, rollback, and stop rules |
| §18 | Execution order |
| §19 | Research references |
| §20 | Implemented closeout and three-pass evidence |
| Appendices | Clip inventory, review sheets, asset schema, and decision log |

**Related living guides:** [characters-visual.md](../characters-visual.md) · [graphics-vfx.md](../graphics-vfx.md) · [combat.md](../combat.md) · [assets.md](../assets.md) · [architecture-template-boundary.md](../architecture-template-boundary.md)

**Prior shipped motion work:** [combat-motion-sophistication.md](../history/combat-motion-sophistication.md) · [static-resource-character-motion.md](../history/static-resource-character-motion.md) · [skill-motion-spectacle.md](../history/skill-motion-spectacle.md)

---

## 1. Product mandate and scope

### 1.1 Mandate

The current playable heroes must no longer read as rounded blocks, capsules, or primitive attachments moving as one rigid toy. The overhaul must deliver:

1. A Gunner with the silhouette, mass, equipment logic, and weapon handling of an **original sci-fi powered infantry / expeditionary marine**.
2. A permanent fix for weapons or objects that appear as missing, unrendered, fallback, inside-out, or placeholder geometry.
3. New authored bodies, rigs, materials, locomotion, combat actions, and skill motions for **all five playable heroes**:
   - Knight (`aerin`)
   - Wizard (`wizard`)
   - Rogue (`rogue`)
   - Ranger (`ranger`)
   - Gunner (`gunner`)
4. Natural weight transfer, joint deformation, weapon contact, follow-through, recovery, and transition motion during gameplay.

The old hero designs are not a visual constraint. Class gameplay identity, public class ids, combat authority, save compatibility, and stable clip/API names remain constraints.

### 1.2 In scope

| Area | Included |
|------|----------|
| Hero models | Complete replacement of all playable hero meshes and class gear |
| Gunner | New powered-marine silhouette, armor, backpack, helmet/head treatment, rifle, and motion set |
| Rigging | Shared production humanoid deformation rig plus class accessory bones |
| Materials | Authored PBR inputs preserved through the stylized shader path |
| Animation | Locomotion blending, transitions, upper/full-body layers, additive motion, two-bone IK, foot contact, secondary motion |
| Combat sync | Existing damage/timeline authority aligned with authored contact events |
| Reliability | Static GLB validation, runtime contracts, failure injection, visual diagnostics, strict playable-asset fallback policy |
| Pipeline | Blender source convention, deterministic headless export, optimization, manifest generation, tests |
| Performance | Hero LODs, atlases, compression, animation LOD, measured browser budgets |
| Documentation | Living contracts and this plan |

### 1.3 Explicitly out of scope

| Excluded | Reason |
|----------|--------|
| Monster redesign or monster motion changes | User explicitly keeps monsters as-is |
| Combat damage/range/balance retuning | Visual and motion authority must not alter balance silently |
| Mouse free-aim redesign | Current movement/combat-facing contract remains |
| Camera shake or hit stop | Project policy keeps both as no-ops |
| Physics cloth or ragdolls | Too costly and not required for the target read |
| Full motion matching / learned animation | Excessive runtime/content complexity for this static Three.js demo |
| Photoreal humans or cinematic facial rigs | Isometric action readability is the target |
| CDN or remote runtime assets | Project remains local/offline |
| `vendor/` edits | Existing local Three addons are consumed without modifying vendor code |

---

## 2. Executive decisions

| ID | Decision |
|----|----------|
| **D1** | Retire the undifferentiated chibi SDF body, duplicate outline proxy, and runtime primitive head kits as shipping sources. Shipping geometry must come from a versioned, class-authored offline source: Blender when available or the repository-owned authored-recipe exporter described in §12.6. Runtime fallback primitives remain failure assets only. |
| **D2** | Prefer Blender-authored source assets exported to glTF/GLB, while supporting the deterministic repository-owned authored-recipe path required by this build environment. Both are offline authoring inputs that emit the same schema-v2 GLB contract; runtime remains build-free static HTML/JS. |
| **D3** | Build Gunner first as the **golden vertical slice**, then prove the shared pipeline on Knight before converting Wizard, Rogue, and Ranger. |
| **D4** | Use a single shared humanoid bone naming contract and one Three.js `AnimationMixer` per hero. Layering uses weighted actions and filtered/additive clips, not competing mixers. |
| **D5** | Preserve gameplay authority in `Player` / `CombatSystem`. Animation events sell and synchronize hits; animation does not calculate damage. |
| **D6** | Keep root gameplay movement code-driven. Use authored root curves only for analysis and bounded visual warping; do not introduce authoritative root motion in this overhaul. |
| **D7** | Required playable hero and starter-weapon assets are fail-closed in development/tests. A primitive fallback may keep a production session alive, but it must set an explicit error state and can never pass release gates. |
| **D8** | Preserve PBR texture slots and material roles through `StylizedMaterial`; remove blanket texture deletion for production hero/weapon assets. |
| **D9** | Eliminate negative-scale production weapon mounts and ad-hoc class socket exceptions. Author explicit grip/support/muzzle/trail anchors and validated mount profiles. |
| **D10** | The former bake-only combat-motion plan is shipped history. This document supersedes its deferred architecture exclusions for playable heroes only. |

---

## 3. Repository audit and evidence

### 3.1 Current hero construction

The current asset path is:

```text
tools/assets/generate_assets.mjs
  heroSkeleton()                    24 bones
  heroBodyGeometry()                shared implicit/SDF body
  heroSkinRules()                   distance-based procedural weights
  attach*Kit()                      boxes, cylinders, toruses, rounded boxes
  heroAnimations()                  JS rotation/position tables
        ↓ GLB export
assets/models/hero/*_lod0|1.glb
        ↓ preload and clone
AssetManager → CharacterFactory → CharacterAnimationController → Player
```

All classes share the same short, rounded body basis. Most class identity comes from palette changes, head kits, and rigid primitive attachments. Adding more triangles or more attachment primitives does not solve anatomical proportion, garment construction, deformation loops, hand contact, or motion quality.

### 3.2 Current rig limitations

`heroSkeleton()` has 24 bones:

- one root, pelvis, two spine segments, neck, head;
- upper/lower arm and hand per side;
- upper/lower leg and foot per side;
- cape and hair chains;
- one right-hand weapon socket.

Missing production controls include clavicles, ball/toe joints, twist/deformation helpers, support-hand targets, pole targets, left/right weapon anchors, and a visual motion root. The current procedural weight solver selects bones by coarse position bands; it cannot deliberately preserve shoulder, elbow, hip, knee, wrist, or armor deformation.

### 3.3 Measured current GLB profile

Values below were read from the current GLB JSON chunks in the working tree. Triangle totals include body, duplicate outline proxy, and class attachments.

| Hero | LOD0 triangles | LOD1 triangles | LOD0 bytes | LOD1 bytes | Images/textures |
|------|---------------:|---------------:|-----------:|-----------:|----------------:|
| Knight | 76,658 | 39,714 | 3,045,812 | 1,864,480 | 0 / 0 |
| Wizard | 85,536 | 43,396 | 3,144,120 | 1,836,912 | 0 / 0 |
| Rogue | 82,216 | 40,900 | 3,026,244 | 1,736,744 | 0 / 0 |
| Ranger | 75,202 | 37,782 | 2,882,856 | 1,679,580 | 0 / 0 |
| Gunner | 76,786 | 39,366 | 3,073,148 | 1,869,872 | 0 / 0 |

Important conclusion: the problem is **not simply low polygon count**. The current heroes spend substantial geometry on implicit surfaces and duplicate proxy meshes while still presenting simplified forms, flat colors, coarse weights, and primitive accessories.

### 3.4 Material path findings

1. Generated hero GLBs have no images or textures.
2. `convertToStylized()` creates a new `StylizedMaterial` but currently does not copy base-color, normal, ORM, emissive, or alpha maps.
3. `CharacterFactory.equipWeapon()` explicitly sets `material.map = null`.
4. The bake adds a full skinned `outline_proxy` body with opacity `.001`; runtime hides it, but the asset still carries duplicate geometry and skin data.
5. Hero palette application assumes flat role colors rather than authored surface detail.

Without a material adapter change, better Blender assets would lose much of their authored appearance at runtime.

### 3.5 Animation runtime findings

`CharacterAnimationController` currently:

- owns one mixer and a map of actions;
- selects one current action;
- crossfades from the previous action;
- treats combat moves as full-body one-shots;
- returns to one fallback locomotion clip;
- uses discrete idle/walk/run/sprint bands;
- silently resolves a missing requested clip to `idle`.

It does not currently provide:

- synchronized weighted locomotion blending;
- transition states for start, stop, or pivot;
- an upper-body slot over continuing locomotion;
- additive aim, recoil, breathing, or hit layers;
- per-bone track masks;
- support-hand or foot IK;
- contact metadata beyond scheduled normalized callbacks;
- post-mixer secondary bone simulation.

This is why denser authored keys can improve poses but cannot fully remove the “whole block plays one clip” impression.

### 3.6 Rendering incident evidence

The recent Gunner incident demonstrates a pipeline failure, not only an art issue:

- The committed Gunner hero output initially matched the Ranger asset footprint, and the rifle output matched the staff footprint.
- The class visual smoke contained a Gunner-specific **soft** exception that allowed missing dedicated roots/markers to pass.
- The working tree now rebakes dedicated Gunner/rifle files and removes that exception, but the underlying pipeline still lacks a generic class/weapon asset contract.
- A prior weapon-binding fix added `grip_anchor` handling and ratio checks, proving that correct filenames alone do not guarantee correct rendering or mounting.

The overhaul must make wrong-file reuse, fallback substitution, missing sockets, malformed materials, and inside-out mounts impossible to ship silently.

### 3.7 Current test gap

The current runtime visual smoke verifies useful structural facts—class id, asset root, weapon root, socket parent, marker, ratio, and some blade direction—but it does not verify:

- correct material textures remain bound;
- normals/tangents are valid;
- skin weights deform cleanly;
- the asset is unique to its class rather than a renamed copy;
- support hand and weapon stock maintain contact;
- feet plant instead of sliding;
- front/back/side culling has no holes;
- a requested combat clip is real instead of the idle fallback;
- a primitive fallback is absent from weapons and non-hero objects;
- motion silhouettes meet a product quality bar.

---

## 4. Root-cause model for the visual failures

Treat the reported “unrendered shape” symptom as five distinct failure classes. Each needs a separate diagnostic and gate.

| Failure class | Typical symptom | Current exposure | Required prevention |
|---------------|-----------------|------------------|---------------------|
| Wrong asset / fallback | Capsule, generic hero, staff-shaped rifle, renamed class | Preload errors are caught; clone can fall back | Required-asset contract + class fingerprint + fail-closed tests |
| Geometry/culling | Missing faces, inside-out parts, disappearing mirrored weapon | Negative scale, front-side materials, weak static checks | No negative production ancestry; normal/winding audit; multi-angle render |
| Material conversion | White/flat/untextured object, invisible alpha, wrong emissive | Maps dropped; flat recolor | Texture-preserving adapter; approved alpha policy; material audit |
| Rig/skin | Exploded, detached, pinched, rigid parts during motion | Procedural weights and multiple skin objects | Normalized four-weight contract; deformation test poses; one shared armature |
| Mount/socket | Weapon floats, intersects body, points backward, support hand misses | Per-kind runtime rotations and exceptions | Authored anchors, two-hand IK, socket-distance tests |

### 4.1 Required debugging modes

Add debug-only views behind `?debug=1` / F3:

1. **Asset status:** asset key, actual quality/url, fallback flag, contract result.
2. **Normal view:** `MeshNormalMaterial` override for selected hero/weapon.
3. **Wireframe view:** selected hero only; no global performance cost.
4. **Skeleton/sockets:** bones plus grip, support grip, muzzle, blade base/tip, foot contacts.
5. **Material view:** material name/role, bound maps, alpha mode, side, draw-call group.
6. **Animation view:** base state, layer weights, clip names, normalized time, scheduled contact markers, IK errors.

These modes diagnose the actual layer instead of treating every visual problem as an art rebake.

---

## 5. External research synthesis

### 5.1 glTF is the right delivery format, but validation must be explicit

The glTF 2.0 specification defines linear blend skinning through joint hierarchies, inverse bind matrices, and `JOINTS_0` / `WEIGHTS_0` vertex attributes. A file that parses is not automatically a good game asset. The Khronos glTF Validator reports conformance errors and asset statistics; the Asset Auditor/guidelines cover practical concerns such as origins, PBR-safe materials, beveled edges, UVs, texture density, material counts, and animation practices.

**Project application:** every shipping hero and weapon passes both specification validation and a project-specific contract. Neither replaces the other.

### 5.2 Blender actions/NLA are a better motion source than JS Euler tables

Blender exports object transforms, pose-bone animation, and shape keys to glTF. Constraints, drivers, and control rigs must be baked to supported deformation-bone transforms. Actions/NLA provide named clips and repeatable export ranges. Weight-paint normalization, limited influences, adequate joint topology, and manual deformation review are required even when automatic weighting is used initially.

**Project application:** source controls may be sophisticated; exported GLBs remain simple sampled deformation bones and stable clip names.

### 5.3 Three.js already supports the required building blocks

Three.js `AnimationMixer` can run multiple `AnimationAction`s with weights, crossfades, synchronization, time scaling, and additive blend modes. `AnimationUtils.makeClipAdditive()` supports additive clips. `SkeletonUtils` supports correct skinned clones and optional retargeting.

Three.js does not provide an Unreal-style animation blueprint or blend mask asset. This project will implement a small deterministic graph over one mixer and create layer clips by filtering tracks against named bone sets.

### 5.4 Adopt proven animation concepts, not engine-specific machinery

Commercial engine documentation consistently separates:

- a state machine for locomotion states and transitions;
- blend spaces driven by speed/direction;
- upper/full-body slots;
- additive aim/recoil/secondary layers;
- per-bone masks;
- two-bone IK for hands and feet;
- distance/speed matching to reduce foot slide;
- bounded motion warping to align an authored move with a target.

**Project application:** implement the smallest useful subset:

1. one-dimensional speed blend plus explicit start/stop/pivot states;
2. full-body and upper-body action slots;
3. additive breathing/aim/recoil/hit layers;
4. analytic two-bone IK for support hand and feet;
5. play-rate/stride matching, not a full distance-matching database;
6. bounded visual warping only where a committed skill cannot align cleanly otherwise.

### 5.5 Perceptual priorities at isometric gameplay distance

The project's fixed isometric camera keeps the lens far from characters at all times, which changes what "quality" means for this specific game versus a third-person or cinematic camera. Isometric-RPG design analysis confirms the camera never moves close to characters, so readability is prioritized over detailed facial animation, and the standard ~30° isometric angle is chosen precisely because it gives a clear, undistorted view of characters and environment together ([Isometric RPGs Explained](https://polydin.com/isometric-rpg/), [Mastering Camera Angles for Isometric Game Design](https://lensviewing.com/camera-angle-for-isometric-game/)). Practitioner guidance for the genre converges on: characters need a clear, immediately identifiable silhouette from far away; gestures and movement are deliberately exaggerated to stay legible at distance; and outline/rim treatment separates characters from busy backgrounds ([Pixune — The Artistry of Isometric Games](https://pixune.com/blog/defining-isometric-games-art/), [Inlingo — Isometric Perspective](https://inlingogames.com/blog/what-is-isometric-perspective-and-how-does-it-help-create-games/)).

**Project application:** §6.4's Distance-1/2/3 hierarchy is confirmed, not merely a house style choice — it reflects how isometric ARPGs are actually read. Silhouette, material-role breakup (§7.5), and outline strength (§11.3) must be validated at the game's actual default camera distance/FOV, never at an art-review close-up. See §15.7 for the resulting silhouette spot-check metric.

### 5.6 Responsiveness vs. motion fidelity

Latency-perception research across game genres shows expert/competitive players notice added latency as low as ~15 ms, casual players commonly notice it past ~40–50 ms, and total input-to-response delay above roughly 100 ms is broadly considered unplayable, with ~200 ms being clearly distracting regardless of genre ([Raaen — Latency Thresholds for Usability in Games: A Survey](https://scispace.com/pdf/latency-thresholds-for-usability-in-games-a-survey-2z25v3c4p7.pdf); [Wikipedia — Input lag](https://en.wikipedia.org/wiki/Input_lag)). Gameplay-animation practitioners are explicit that when smoothness and responsiveness conflict, responsiveness wins: "for most games, choose responsiveness — players will forgive stylized timing far faster than sluggish controls," and the start of a move is "the precise moment where a game's responsiveness is decided" ([Animotionx — Gameplay Animation Start](https://www.animotionx.com/en/post/gameplay-animation-start-where-responsiveness-happens)).

**Project application:** denser, more authored motion (§8) must never be allowed to add perceptible input lag. Attack/dodge input must produce a visible pose change well inside the ~50 ms casual-noticeable threshold, and locomotion start must begin weighting toward the new action within 1–2 frames rather than waiting for a wind-up read. This resolves an implicit tension between "richer authored motion" (§6, §9, §10) and "the existing movement/combat-facing contract remains" (§1.3): richness is achieved through blend quality and layering, never through added reaction latency. See §15.7 for numeric budgets.

### 5.7 Animation transition and blend-timing budgets

Blend-tree literature is explicit that blend duration is a tuned parameter, not a default: "too short and the blend is barely smoother than a snap, too long and the transition feels sluggish or muddy," and clips should share normalized time so a walk at 25% completion only ever blends with the run cycle's own 25% point, keeping foot contacts in sync ([Bugnet — How to Blend Animations Smoothly](https://bugnet.io/blog/how-to-blend-animations-smoothly); [MoCap Online — Blend Trees in Game Engines](https://mocaponline.com/blogs/mocap-news/animation-blend-tree-guide)). The same sources note that discrete state changes (weapon draw, death, a committed roll) are usually better served by a short explicit cross-fade than by continuous blend-tree interpolation, and that state/parameter names should be self-documenting so review and tuning stay legible as the graph grows ([MoCap Online — Animation State Machines: Patterns for 200+ States](https://mocaponline.com/blogs/mocap-news/animation-state-machine-design-patterns)).

**Project application:** §8.2/§8.3 already require normalized-phase sync and speed-driven blending; this section supplies the missing numeric targets, published in §15.7. Locomotion-band blends stay in the smooth range; state-machine transitions into committed actions (dodge, big skills) stay short and near-immediate so responsiveness (§5.6) is never sacrificed for blend elegance.

### 5.8 Accessibility and readability

WCAG 2.2 sets a normal-text/UI contrast floor of 4.5:1 and a large-text/UI-component-state floor of 3:1 ([W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/); [WebAIM — Contrast and Color Accessibility](https://webaim.org/articles/contrast/)), requires that any content moving, blinking, or auto-updating for more than 5 seconds be pauseable/stoppable/hideable, and treats flashing content above roughly three times per second as a seizure risk. Game-accessibility guidance built on the same baseline extends these rules to HUDs and interactive game elements directly ([Filament Games — Accessibility Terms for Game Developers](https://www.filamentgames.com/blog/accessibility-terms-for-game-developers-a-wcag-2-1-aa-glossary)).

**Project application:** this does not add a general accessibility-settings workstream (out of scope), but it does set hard floors that the visual overhaul must not violate while adding new emissive/status VFX (§6.2, §9.3) and debug HUD content (§4.1): flash/pulse rate stays under 3 Hz, and F3/debug status text meets WCAG 2.2 AA contrast. These floors are independent of, and do not reopen, the existing shake/hit-stop ban (§1.3, §17.3).

### 5.9 Shader/material reliability checklist

Cross-pipeline PBR troubleshooting sources converge on a small set of failure modes that account for most "flat/washed-out/black material" incidents: sRGB-vs-linear color-space mismatches between base-color (sRGB) and normal/metallic-roughness/AO (Non-Color/linear) textures; metallic-roughness channel packing where metalness must read from blue and roughness from green; normal maps that must stay in tangent space with correct channel-to-axis mapping; and emissive intensities above 1.0 requiring the `KHR_materials_emissive_strength` extension instead of silently clamping ([Khronos — PBR in glTF](https://www.khronos.org/gltf/pbr/); [Blender Manual — glTF 2.0](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html)).

**Project application:** extends §7.5/§11.1's texture-preserving contract with specific, testable rules rather than a general "preserve maps" instruction. Added to the static gate table in §15.1: correct color space per map role, correct metallic/roughness/AO channel packing, and correct emissive-strength handling for restrained emissive status details (§9.3, §6.3).

### 5.10 Measurable art-review heuristics

Animation-pipeline guidance stresses replacing subjective "does it look right" review with fixed, repeatable capture protocols and explicit, data-driven thresholds rather than tribal-knowledge judgment calls ([Pixune — Animation Blending and Layering Pipeline](https://pixune.com/blog/animation-blending-and-layering-pipeline/); [GameDeveloper.com — Animation Blending](https://www.gamedeveloper.com/programming/animation-blending-achieving-inverse-kinematics-and-more)).

**Project application:** Appendix B's yes/no review sheet gets a small number of measurable companions in §15.7 (e.g. a silhouette class-identification spot check) so "reads as a designed character" and "class recognizable in black silhouette" are not left to a single reviewer's unaided judgment.

### 5.11 Rejected research paths

| Path | Decision |
|------|----------|
| Full motion matching | Reject for this project; content, search, memory, and debugging cost are disproportionate |
| Multiple animation mixers on one skeleton | Reject; one mixer with action weights/filtering is easier to reason about |
| Runtime retarget every frame | Reject; retarget offline/exported clips when possible |
| Alpha-blended hair cards everywhere | Reject; prefer solid stylized hair or alpha-test cards to avoid sorting artifacts |
| More procedural primitive detail | Reject as the shipping hero solution; does not address topology or motion |
| Authoritative root motion | Reject in this wave; would couple animation and combat movement/balance |

---

## 6. Target art direction

### 6.1 Shared visual language

The new heroes should be **stylized heroic characters**, not photoreal and not chibi:

- roughly 6.75–7.25 heads tall;
- readable hands, elbows, knees, feet, neck, and shoulder line;
- clear torso/pelvis separation for weight shift;
- bevels and material breakup that catch the current isometric lighting;
- controlled exaggeration in silhouette, weapons, cloth, and hair;
- facial detail limited to what survives the gameplay camera;
- coherent scale and material language across all five classes.

The title camera may show more detail, but every major shape must remain readable at gameplay distance and medium quality.

### 6.2 Originality boundary for Gunner

“Marine-like” means the functional fantasy of powered sci-fi infantry, not a reproduction of an identifiable franchise character.

Use:

- broad armored triangle from shoulders to waist;
- enclosed collar and compact helmet/visor option;
- layered chest cuirass and abdominal flex plates;
- reinforced forearms, thighs, shins, and boots;
- compact back power/air unit;
- clear utility/ammunition modules;
- a two-hand service rifle with stock, receiver, magazine, barrel, muzzle, and support grip;
- heavy but mobile stance and recoil control.

Avoid:

- copied insignia, helmet face, exact color blocking, named faction marks, or signature armor geometry from a known IP;
- implausibly large spherical shoulder shells that swallow the head/arms;
- a rifle assembled from visible box/cylinder primitives without an intentional continuous silhouette.

### 6.3 Class silhouette cards

| Class | Body language | Primary shape | Material language | Motion identity |
|-------|---------------|---------------|-------------------|-----------------|
| Knight | Broad, grounded, stable | Layered plate + cloth breaks | Brushed plate, leather, cloth | Planted steps, torque, heavy follow-through |
| Wizard | Tall, open, flowing | Long coat/robe, mantle, staff | Cloth, leather, arcane inlays | Gather, channel, expand, release |
| Rogue | Lean, compressed, asymmetric | Hood, fitted layers, twin blades | Dark cloth/leather, small metal accents | Low center, alternating hands, quick direction changes |
| Ranger | Athletic, mobile, diagonal | Short coat, quiver, bow line | Weathered cloth/leather/wood | Nock, draw, loose, re-center |
| Gunner | Heaviest upper body, braced lower body | Powered cuirass, collar, backpack, rifle | Painted armor, dark composite, metal, emissive status details | Shoulder weapon, controlled recoil, brace, sweep |

### 6.4 Detail hierarchy

1. **Distance 1 — gameplay:** silhouette, class, weapon, facing, action phase.
2. **Distance 2 — title/close:** armor layering, garment construction, face/hair, material response.
3. **Distance 3 — inspection:** small decals, fasteners, seams, micro-normal detail.

Do not spend topology or textures on Distance 3 until Distance 1 and deformation pass.
Isometric-genre readability research backs this ordering directly: at the project's fixed camera distance, silhouette and material-role breakup carry class identity, and gestures must be legibly exaggerated — see §5.5.

---

## 7. Shared hero asset contract

### 7.1 Coordinate and scale contract

| Property | Contract |
|----------|----------|
| Up | `+Y` |
| Forward | `+Z` |
| Origin | Ground under the midpoint between feet in reference pose |
| Units | Blender meters; export scale 1.0 |
| Root scale | Positive, uniform, ideally `[1,1,1]` |
| Runtime height | Derived from validated bounds and normalized to a data-driven target; no hardcoded `3.05` assumption |
| Rest pose | Neutral A-pose suitable for shoulders and weapon animation |
| Root motion | Authored on `motion_root`, stripped/ignored for gameplay unless an explicitly approved visual window consumes it |

### 7.2 Proposed deformation skeleton v2

Exact names are locked during Wave 1. Target approximately 50–64 deformation bones and no more than 80 total exported nodes.

```text
root
└─ motion_root
   └─ pelvis
      ├─ spine_01 → spine_02 → spine_03 → neck → head
      │  ├─ clavicle_l → upperarm_l → upperarm_twist_l → lowerarm_l → lowerarm_twist_l → hand_l
      │  └─ clavicle_r → upperarm_r → upperarm_twist_r → lowerarm_r → lowerarm_twist_r → hand_r
      ├─ thigh_l → thigh_twist_l → calf_l → foot_l → ball_l
      └─ thigh_r → thigh_twist_r → calf_r → foot_r → ball_r
```

Optional exported class bones:

- three compact finger chains per hand (thumb, index, grouped curl) where visible;
- `cape_*`, `coat_*`, `hair_*`, `quiver_*`, armor hose/accessory chains;
- non-deforming sockets/targets listed below.

### 7.3 Socket and marker contract

Hero nodes:

- `weapon_socket_r`
- `weapon_socket_l`
- `hand_ik_l`
- `hand_ik_r`
- `foot_contact_l`
- `foot_contact_r`
- `head_look_target`
- optional `back_socket`, `hip_socket_l`, `hip_socket_r`

Weapon nodes:

- `grip_main`
- `grip_support` for two-hand weapons
- `muzzle_socket` for ranged weapons
- `trail_base` / `trail_tip` for melee weapons
- optional `stock_anchor`, `string_anchor`, `projectile_socket`

Compatibility aliases may expose old `weapon_socket`, `blade_base`, and `blade_tip` names during migration. New authored assets use the v2 names.

### 7.4 Skinning contract

1. Maximum four joint influences per vertex.
2. Weights finite, non-negative, and normalized within tolerance.
3. No unweighted vertices on deforming meshes.
4. No scale animation on deformation bones unless explicitly approved.
5. One logical armature; skinned body/garments reference the same joint hierarchy.
6. Rigid armor may be bone-parented or weighted rigidly, but must not float or interpenetrate during the deformation pose suite.
7. Shoulder, elbow, wrist, hip, knee, ankle, crouch, overhead, and twist poses are reviewed before animation production.
8. Corrective shape keys are optional and only introduced for visible high-value failures after base topology/weights are correct.

### 7.5 Material role contract

Approved role tags live in glTF `extras` or stable material names:

```text
skin | hair | cloth | leather | painted_metal | bare_metal |
composite | wood | emissive | eye | decal | approved_alpha
```

Each role defines stylized banding, rim, roughness constraints, palette tint policy, and hit-pulse behavior. Runtime may tint or grade a role; it must not erase authored texture information by default.

### 7.6 Required metadata/fingerprint

Each hero root exports:

```json
{
  "assetType": "hero",
  "schemaVersion": 2,
  "classId": "gunner",
  "rigId": "sol_humanoid_v2",
  "modelHeight": 1.9,
  "lod": 0
}
```

Each weapon exports `assetType`, `schemaVersion`, and `weaponKind`. Tests verify that the class id, rig id, required markers, clip inventory, hashes, and bounds match the manifest row. Renaming another GLB cannot satisfy this contract.

---

## 8. Target animation architecture

### 8.1 Runtime graph

```text
movement speed / acceleration / turn delta / combat state
                         │
                         ▼
             Locomotion state machine
        idle ↔ start ↔ move ↔ stop / pivot
                         │
              speed-weighted base actions
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
  upper-body action slot        full-body action slot
  shots/casts/reload flavor     melee/dodge/leap/death
          └──────────────┬──────────────┘
                         ▼
             additive aim/recoil/hit/breath
                         ▼
            support-hand IK + foot IK
                         ▼
              hair/cloth spring bones
                         ▼
                    final pose
```

One `AnimationMixer` owns all actions. Layer clips are cloned/filtered once at character construction, cached, and reused. Per-frame code changes weights and parameters; it does not allocate new clips or tracks.

### 8.2 Locomotion state machine

Required states:

- `idle`
- `start`
- `move`
- `stop`
- `pivot_left`
- `pivot_right`
- `pivot_180`
- `dodge`
- `dead`

The existing public `setLocomotion(speed, options)` name remains. Internally it drives state and weights.

### 8.3 Speed blend

Blend idle/walk/run/sprint actions by speed rather than selecting exactly one band. Requirements:

1. Adjacent actions share normalized phase when blending.
2. Play rate follows actual world speed / authored reference speed within bounded limits.
3. Stop/start clips are skipped when rapid input reversal would harm responsiveness.
4. Logical facing may snap per gameplay rules, but a child visual-yaw offset and short pivot pose absorb the visual pop.
5. No long turn arc is allowed to delay combat facing.

### 8.4 Action slots

| Slot | Bone scope | Use |
|------|------------|-----|
| Base | Full skeleton | Locomotion and transitions |
| Upper | `spine_02` through head/arms | Gunner fire, selected casts, reload flavor, aim |
| Full | Full skeleton | Knight/Rogue committed attacks, dodge, leaps, death, selected skills |
| Additive | Named filtered sets | Breath, recoil, hit tick, aim offset, head look |

Class/action data decides which slot a stable clip uses. The generic controller must not import `content.js` or class ids; `CharacterFactory` / player-facing game code injects the layer policy.

### 8.5 Additive clips

Use reference-pose deltas for:

- breathing/idle life;
- Gunner recoil and controlled recovery;
- small horizontal aim offset;
- head/eye target attention;
- light hit reaction that should not cancel locomotion;
- class-specific secondary stance tension.

Large attacks, heavy hits, dodge, and death remain normal full-body actions.

### 8.6 Support-hand IK

For two-hand weapons:

1. Attach the weapon to `grip_main` / the owning hand.
2. Resolve `grip_support` in hero-local space after mixer evaluation.
3. Solve shoulder–elbow–hand with an analytic two-bone solver and a class/clip pole target.
4. Blend IK weight from clip metadata; release or reduce it for motions that intentionally separate the hand.
5. Disable stretching by default; flag unreachable anchors in validation.

This is mandatory for Gunner rifle stock/support contact and useful for Knight two-hand weapons, Ranger bow handling, and Wizard staff poses.

### 8.7 Foot contact and slide control

The first implementation is deliberately smaller than full distance matching:

- author contact intervals for walk/run/start/stop/pivot;
- phase-sync locomotion actions;
- scale play rate to actual speed;
- while a foot is in contact, preserve its horizontal plant within a small correction budget;
- sample terrain height/normal through an injected callback and solve leg IK after the mixer;
- fade IK by distance/quality and during airborne/teleport phases.

No world or Sol content import enters `CharacterAnimationController`; terrain/contact inputs are passed through options.

### 8.8 Motion warping policy

Only use motion warping for a short visual alignment window where the existing code-driven movement creates an obvious mismatch. Rules:

- combat target/damage remains authoritative;
- warp visual root, never hidden damage volumes;
- translation and yaw correction are clamped;
- no vertical warp unless the skill already owns vertical movement;
- contact event stays at the authored pose peak;
- every warp has a no-target fallback.

### 8.9 Secondary motion

Use bounded damped spring bones after IK for cape, coat, hair, quiver straps, and Gunner hoses/accessories. Requirements:

- fixed maximum angular displacement;
- delta clamp and teleport reset;
- quality/distance LOD;
- no effect on weapon sockets, damage, collision, or required silhouette;
- no dynamic geometry or physics engine dependency.

### 8.10 Event metadata

Animation event metadata is authored beside the clip export or in a generated sidecar table:

```text
contact, release, muzzle, foot_l_down, foot_r_down,
ik_support_on/off, root_warp_on/off, recover, complete
```

Existing `scheduleNormalized` remains the compatible callback mechanism during migration. Events are validated against `timeline.hits`; they do not become combat rules.

---

## 9. Gunner golden slice

### 9.1 Product target

Gunner must be recognizable with VFX disabled and without reading UI:

- the heaviest armored upper-body silhouette among the five classes;
- rifle clearly shouldered, stocked, and controlled by two hands;
- head remains visible within the collar/helmet silhouette;
- legs and pelvis visibly brace recoil rather than the entire model rocking as one object;
- armor plates feel constructed around an articulated body;
- no box-on-chest, cylinder-on-hip, or staff-like rifle read.

### 9.2 Model deliverables

- original Gunner concept sheet: front, side, back, 3/4, material callouts;
- production body/armor mesh with clean deformation topology;
- helmet or open-head variant chosen before texturing;
- compact backpack/power unit;
- service rifle with coherent continuous silhouette;
- LOD0, LOD1, and LOD2;
- texture set and material-role tags;
- validated v2 rig and sockets;
- title and gameplay camera review turntable.

### 9.3 Rifle contract

Required visual parts:

- receiver/body;
- stock seated toward shoulder;
- main grip and trigger area;
- support grip/fore-end;
- magazine/ammunition unit;
- barrel and muzzle device;
- small sights/optic silhouette;
- restrained emissive status element, not a glowing stick.

Required anchors:

- `grip_main`
- `grip_support`
- `stock_anchor`
- `muzzle_socket`
- `trail_base` / `trail_tip` compatibility only if shared code requires them

### 9.4 Gunner motion set

| Motion | Acceptance intent |
|--------|-------------------|
| Idle | Asymmetric braced stance; living chest/head; rifle supported and shouldered |
| Start/stop | Weight initiates at pelvis; weapon lags subtly then stabilizes |
| Walk/run/sprint | Distinct cadence and weapon carriage; no frozen torso over cycling legs |
| Pivot 90/180 | Foot plant and hip turn absorb direction change |
| Basic 1–3 | Local recoil, stock contact, support-hand lock, immediate sight recovery |
| Basic 4 | Stronger burst/finisher with progressive recoil and planted lower body |
| Suppressive burst | Cadenced recoil peaks; legs keep base pose; muzzle events align |
| Flame jet | Forward brace and controlled sustained push |
| Stim rush | One-hand action with intentional temporary IK release and regrip |
| Inferno sweep | Full-body step/pivot, shoulder-led sweep, lower-body counterbalance |
| Dodge | Heavy armor momentum, compressed takeoff, stable recovery |
| Hit/death | Armor mass and center-of-gravity response, not a generic puppet collapse |

### 9.5 Gunner exit gate

Do not start mass conversion of the other classes until Gunner passes all of these:

1. Product review accepts the original marine/powered-infantry silhouette.
2. Front/side/back/3/4 normal and material renders show no holes or fallback shapes.
3. Rifle support-hand error stays within the agreed tolerance during idle, movement, basics, and three relevant skills.
4. Stock does not visibly detach from the shoulder in shouldered phases.
5. Muzzle events originate from `muzzle_socket` for every shot.
6. Locomotion remains natural with the upper-body fire layer active.
7. Low/medium/high quality all use real Gunner/rifle assets.
8. GLB validator, custom asset contract, integrity, runtime visual, and performance gates are green.

---

## 10. Other four class conversions

### 10.1 Knight — second proof of the shared rig

Knight is the second conversion because it tests the opposite animation policy from Gunner: committed full-body melee rather than ranged upper-body layering.

Required improvements:

- anatomically coherent plate/cloth body;
- shoulder armor that permits overhead and cross-body arcs;
- two-hand/one-hand grip policy based on weapon;
- seven attacks with distinct footwork, height, direction, and recovery;
- heavy class mass without slow input response;
- four skills aligned to their existing timelines;
- clean knee/hip/shoulder deformation in wide stances and leaps.

**Exit:** Gunner upper-layer and Knight full-layer paths both work on the same generic controller.

### 10.2 Wizard

Required improvements:

- tall readable silhouette with constructed coat/robe rather than one body shell;
- hand/staff contact and deliberate spell-channel shapes;
- coat/hair secondary bones;
- cast locomotion policy: selected casts upper-body, major skills full-body;
- hands, chest, head, and pelvis all contribute to gather/release;
- blink/meteor motions use bounded visual root handling without changing combat authority.

### 10.3 Rogue

Required improvements:

- lean asymmetric silhouette with usable shoulders/hips;
- two independent weapon sockets without negative root scale;
- alternating main/offhand strike readability;
- low center of gravity, quick stop/pivot, compact recovery;
- weapon trails from authored anchors;
- hood/coat secondary motion that never hides blade lines;
- dual-hand contact tests and no blade/body intersection at ready pose.

### 10.4 Ranger

Required improvements:

- athletic body and quiver/bow silhouette;
- bow owned by the correct hand through authored sockets rather than a runtime-created exception;
- draw hand/string contact strategy;
- nock/draw/loose/recover phases with shoulder/scapula motion;
- vault and trap full-body actions with planted/airborne foot policies;
- hair, coat, and quiver secondary motion.

### 10.5 Cross-class consistency gate

After all five conversions:

- no shipping hero uses the SDF body or runtime head-geometry kit;
- each class is recognizable in a flat silhouette capture;
- all share scale, coordinate, rig, role, and socket contracts;
- body proportions are heroic, not chibi;
- action timing remains class-distinct;
- no class-specific exception weakens the generic asset test.

---

## 11. Rendering and material reliability

### 11.1 Texture-preserving stylized conversion

Extend `convertToStylized()` to preserve supported source fields:

- `map` and its color space;
- `normalMap`, scale, and tangents where required;
- `roughnessMap`, `metalnessMap`, `aoMap` and UV channel;
- `emissiveMap` and intensity;
- `alphaMap`, alpha test, opacity, side, depth flags only when approved;
- vertex colors and skinning behavior;
- role/extras metadata.

Palette logic becomes a tint/grade policy, not a texture eraser. `material.map = null` is removed for production weapons.

### 11.2 Alpha/culling policy

- Opaque is the default.
- Hair and cloth prefer geometry or `MASK`/alpha-test.
- `BLEND` is allowed only for an explicit approved material role.
- No opacity `.001` proxy meshes in shipping hero GLBs.
- No negative scale in the ancestry of production hero/weapon meshes.
- Every material receives a deliberate `FrontSide` / `DoubleSide` decision; double-sided is not a blanket fix for bad normals.

### 11.3 Outline policy

Use `OutlineSystem` selection/post-processing on the real mesh. Do not ship duplicate inflated body proxies. Validate the silhouette at gameplay distance and reduce outline strength/detail where armor seams become noisy.

### 11.4 Required-asset failure policy

| Environment | Behavior |
|-------------|----------|
| Unit/static test | Throw/fail immediately on contract mismatch |
| Visual smoke/dev | Render a conspicuous debug error material/label and fail the test; never silently accept primitive fallback |
| Production | Session may continue with fallback for resilience, but set `userData.assetError`, F3 status, and a console error; release test still fails |

Do not change AssetManager clone refcount semantics. Validation hooks remain generic/injected so the locked template boundary is preserved.

### 11.5 Asset uniqueness/fingerprint checks

For every hero and starter weapon:

- root metadata matches manifest key;
- required role/material set matches class contract;
- required class marker(s) exist;
- expected clips exist and have nonzero tracks/duration;
- content hash is not identical to another class/weapon unless explicitly allowlisted;
- required socket transforms are finite and within bounds;
- bounds/height/weapon ratio are within per-asset limits.

This directly prevents a renamed Ranger or staff asset from passing as Gunner/rifle.

---

## 12. Authoring and export pipeline

### 12.1 Source layout

The Blender tree below remains the preferred DCC layout when approved binary sources are available. The implemented Blender-free lane keeps the shared `rig-contract.json` and `export-settings.json` under `assets/source/characters/common/`, with class-authored geometry, motion, and LOD recipes versioned in `tools/assets/generate_assets.mjs`; its exact committed source layout is therefore smaller but governed by the same contract.

```text
assets/source/characters/
  common/
    sol_humanoid_v2.blend
    rig-contract.json
    export-settings.json
  gunner/
    gunner.blend
    gunner-review.md
  knight/
  wizard/
  rogue/
  ranger/

assets/source/weapons/
  rifle/
  sword/
  staff/
  dagger/
  bow/

assets/textures/hero/<class>/
assets/textures/weapons/<kind>/
```

Binary source assets are intentional production inputs. Record third-party origin/license if any; prefer original work. Do not add untracked externally licensed models without a license manifest.

### 12.2 Tooling split

| Tool | Responsibility |
|------|----------------|
| Blender headless exporter | Apply/bake allowed modifiers and constraints; export named actions, armature, meshes, extras |
| `tools/assets/build-heroes.mjs` | Orchestrate Blender exports, optimization, naming, output placement, manifest update |
| `tools/assets/validate-hero-assets.mjs` | glTF Validator + project asset contracts + stats report |
| `tools/assets/generate_assets.mjs` | Supported repository-owned authored-recipe source for class-specific hero, weapon, rig, motion, material-role, and LOD outputs when Blender sources are unavailable |
 
`build-heroes.mjs` is the single orchestrator and provenance surface for both authoring modes. The generator is not a runtime DCC or fallback: it is an offline, versioned source that emits the same committed schema-v2 GLBs and passes the same validator as Blender exports.

### 12.3 Export rules

1. Apply object transforms; positive uniform scale.
2. Triangulate deterministically at export.
3. Export normals; export tangents when normal maps are used.
4. Export UV0; UV1 only where AO/lightmap policy requires it.
5. Export deformation bones and required socket nodes; bake constraints/control rig.
6. Limit influences to four and normalize.
7. Export named actions from explicit frame ranges, starting at zero.
8. Reset pose between actions to avoid cross-clip leakage.
9. Strip cameras, lights, control widgets, debug geometry, and proxy outlines.
10. Preserve approved custom properties/extras.
11. Run glTF validation before optimization and after final output.

### 12.4 Optimization

The existing loader already supports local DRACO, KTX2/Basis, and Meshopt. Choose compression after the Gunner golden asset is stable:

- Meshopt or DRACO for mesh payloads after visual comparison;
- KTX2 for texture delivery with platform-tested settings;
- animation key reduction with contact/foot/weapon error checks;
- material atlasing to reduce draw calls;
- LODs authored or generated then manually reviewed;
- no compression setting is accepted if it creates visible skin or normal artifacts.

### 12.5 Determinism and provenance

The build emits a report containing:

- source file and source hash;
- Blender/exporter/tool versions;
- output hash and byte size;
- triangles, vertices, draw groups, materials, textures, bones, skins, clips, key counts;
- validator messages;
- contract results;
- optimization settings.

Generated GLBs remain committed local assets, consistent with the current repository model.

### 12.6 Blender-unavailable deterministic authored-recipe strategy

Not every contributor or automation session has Blender installed; this plan's execution environment is one such case. The implementation therefore supports two explicit offline authoring modes behind one schema-v2 contract. Neither mode is a runtime fallback, and neither may emit the old chibi body, duplicate outline proxy, or runtime head-kit geometry.

1. **Blender remains the preferred DCC path.** When an approved `.blend` source and compatible Blender binary exist, `tools/assets/build-heroes.mjs` invokes the pinned headless export path. Runtime, the dev server, and release tests never depend on Blender.
2. **The repository-owned authored recipe is a supported source, not silent substitution.** `tools/assets/generate_assets.mjs` contains versioned, class-specific body, armor, garment, hair/headgear, weapon, rig, animation, material-role, and LOD recipes. It emits committed GLBs directly through the local Three.js exporter. The build report records `buildMode: "authored-recipe"` so review can never confuse it with a Blender export.
3. **Capability and mode are always visible.** `build-heroes.mjs` probes Blender before writing, logs the selected mode per class, and records it in the provenance report. `--require-blender` remains the fail-closed option for a DCC-only release lane; normal repository builds remain reproducible on Blender-free workstations.
4. **Determinism is source-bound.** Each GLB root records schema/rig/class/LOD metadata, recipe version, generator source hash, provenance hash, and geometry/clip statistics. The orchestrator records output SHA-256 and byte size for every LOD. A source edit without a changed output/provenance receipt is a release failure.
5. **One validation surface for both modes.** Static GLB contracts, runtime strict loading, material preservation, socket/IK checks, visual smoke, and performance budgets apply identically. No mode receives a soft exception.
6. **No on-the-fly runtime generation.** `node server.mjs` only serves committed assets. A missing production GLB is an asset error, never permission to generate or silently display a primitive.

This strategy preserves original DCC work as the long-term art path while making the current fully local implementation reproducible, inspectable, and releasable without pretending Blender exists on the machine.

---

## 13. Workstreams and delivery waves

### Wave 0 — Reliability harness before new art

| ID | Task |
|----|------|
| R0.1 | Add static GLB stats/contract runner for all heroes and weapons |
| R0.2 | Pin and integrate Khronos glTF Validator for local test use |
| R0.3 | Add class/weapon metadata and uniqueness checks |
| R0.4 | Strengthen runtime visual smoke: no fallback, no soft class exception, texture/material/socket checks |
| R0.5 | Add failure-injection fixtures: missing file, Ranger-as-Gunner, staff-as-rifle, missing clip, bad socket |
| R0.6 | Add debug asset/normal/wireframe/skeleton/material/animation views |
| R0.7 | Capture current five-class title/gameplay baselines and performance stats |

**Exit:** every known wrong/fallback substitution fails automatically. The current valid assets still load.

### Wave 1 — Shared source, rig, exporter, and material foundation

| ID | Task |
|----|------|
| P1.1 | Lock `sol_humanoid_v2` rig and socket names |
| P1.2 | Create neutral deformation mannequin and pose suite |
| P1.3 | Establish Blender action/NLA/export convention |
| P1.4 | Build deterministic hero export/validation orchestration |
| P1.5 | Make `StylizedMaterial` preserve approved PBR maps/roles |
| P1.6 | Add v1 compatibility aliases for stable runtime names |
| P1.7 | Prototype one-mixer locomotion weights and filtered clip cache |

**Exit:** a textured mannequin deforms, exports, validates, loads, clones, outlines, and blends locomotion correctly without content imports in template-candidate code.

### Wave 2 — Gunner golden vertical slice

| ID | Task |
|----|------|
| G2.1 | Approve original powered-marine concept and proportions |
| G2.2 | Model/retopologize/UV/texture/rig Gunner LOD0 |
| G2.3 | Model and anchor the service rifle |
| G2.4 | Author idle, start/stop, walk/run/sprint, pivots, dodge, hit, death |
| G2.5 | Implement upper-body slot, additive recoil, support-hand IK |
| G2.6 | Author basics and four skills with events/IK windows |
| G2.7 | Produce LOD1/LOD2 and compressed outputs |
| G2.8 | Pass Gunner exit gate (§9.5) |

**Exit:** Gunner alone proves the target visual and motion quality in title, Hunt, and Defense.

### Wave 3 — Generic animation sophistication

| ID | Task |
|----|------|
| A3.1 | Complete locomotion state transitions and phase synchronization |
| A3.2 | Add visual yaw offset/pivot response without changing combat facing |
| A3.3 | Add full-body/upper-body/additive layer arbitration |
| A3.4 | Add foot contact metadata, stride matching, and foot IK |
| A3.5 | Add bounded spring-bone secondary motion and LOD |
| A3.6 | Add optional bounded visual warp windows |
| A3.7 | Add animation state/IK/contact diagnostics and numeric tests |

**Exit:** the generic controller supports both ranged layered and committed full-body action policies with stable public methods.

### Wave 4 — Knight second proof

| ID | Task |
|----|------|
| K4.1 | New Knight model/material/LODs |
| K4.2 | Locomotion/transitions/secondary motion |
| K4.3 | Seven basics and four skills |
| K4.4 | Two-hand weapon contact and trail anchors |
| K4.5 | Cross-check full-body action arbitration and timelines |

**Exit:** shared architecture is proven on the two most different action policies.

### Wave 5 — Wizard, Rogue, Ranger conversion

Deliver one class at a time; do not rebake three classes in one unreviewable change.

| Slice | Class | Special proof |
|-------|-------|---------------|
| W5.1 | Wizard | cast layers, robe/hair secondary motion, staff contact |
| W5.2 | Rogue | dual weapon sockets without negative scale, rapid pivots |
| W5.3 | Ranger | authored bow ownership, draw/string/support contact, vault |

**Exit per slice:** model, LODs, full shared motion set, all basic/skill actions, static/runtime/visual/perf gates.

### Wave 6 — Cross-class polish and release

| ID | Task |
|----|------|
| X6.1 | Full five-class silhouette and material consistency review |
| X6.2 | All basics/skills mute-VFX review and timeline alignment |
| X6.3 | Startup/memory/draw-call optimization and optional background hero preload |
| X6.4 | Low/medium/high and desktop/mobile matrix |
| X6.5 | Remove shipping references to SDF hero/head kits/proxy outline assets |
| X6.6 | Update living docs and move this plan to history after product acceptance |

---

## 14. File map and architecture boundary

### 14.1 Expected primary touch set

| Path | Responsibility |
|------|----------------|
| `assets/source/characters/**` | New DCC character/rig source |
| `assets/source/weapons/**` | New DCC weapon source |
| `assets/models/hero/**` | Shipping hero GLBs |
| `assets/models/props/weapon_*.glb` | Shipping weapon GLBs |
| `assets/textures/hero/**`, `assets/textures/weapons/**` | Authored texture outputs |
| `assets/manifests/assets.json` | Quality/LOD/model/texture registration |
| `tools/assets/*hero*` | Export, optimize, stats, contract validation |
| `tools/assets/generate_assets.mjs` | Supported Blender-free authored-recipe source for shipping hero/weapon GLBs |
| `js/assets/AssetManager.js` | Generic validation/error metadata hook only; refcount unchanged |
| `js/graphics/StylizedMaterial.js` | PBR-map-preserving stylized conversion |
| `js/characters/CharacterFactory.js` | Game-owned class material/mount/layer profiles |
| `js/characters/CharacterAnimationController.js` | Generic mixer/state/layer/event orchestration |
| `js/characters/TwoBoneIK.js` | Generic analytic solver, if separated |
| `js/characters/SecondaryMotion.js` | Generic bounded spring solver, if separated |
| `js/entities/Player.js` | Pass movement/turn/visibility/ground inputs; preserve combat authority |
| `js/data/content.js` | Stable anim names/timelines only when alignment requires it |
| `js/config.js` / `js/core/runtimeConstants.js` | Game tuning vs template-safe generic thresholds |
| `tests/hero-asset-contract.mjs` | Static hero/weapon contract |
| `tests/hero-animation-runtime.mjs` | State/layer/IK/event numeric checks |
| `tests/class-mode-visual-smoke.mjs` | Browser render/mount/material gates |
| `tests/integrity.mjs` | Nest mandatory release checks |

### 14.2 Locked template boundary

`AssetManager`, `StylizedMaterial`, and `CharacterAnimationController` are template-candidate modules. Changes there must remain generic:

- no `content.js`, class ids, skill ids, or Sol mode imports;
- no `GAME_CONTEXT_KEYS` expansion unless the locked boundary doc and tests are updated with justification;
- layer/mask/contract data is injected by game-owned code;
- AssetManager `clones` refcount semantics remain unchanged;
- new skill effects are unrelated and must not enter this workstream;
- no `vendor/` edits.

### 14.3 Stable runtime surface

Keep these public names operational during migration:

- `CharacterFactory.createHero`
- `CharacterFactory.equipWeapon`
- `CharacterAnimationController.play`
- `playOneShot`
- `setLocomotion`
- `scheduleNormalized`
- `update`
- `dispose`

New generic methods may be added (`setLayerPolicy`, `setAim`, `setGrounding`, etc.), but existing call sites must continue to function while classes migrate.

---

## 15. Validation and acceptance matrix

### 15.1 Static asset gates

| Gate | Pass rule |
|------|-----------|
| glTF conformance | Zero validator errors; warnings explicitly reviewed/allowlisted |
| Metadata | Correct asset type, schema, class/weapon id, rig id, LOD |
| Coordinate | Finite transforms, positive scale, correct forward/up, grounded origin |
| Skeleton | Required bones/sockets, one logical armature, stable hierarchy |
| Skin | ≤4 influences, normalized, finite, no unweighted vertices |
| Geometry | Valid bounds, no degenerate/empty primitives, normals present, tangents when required |
| Materials | Approved roles, maps present as expected, alpha policy, no hidden outline proxy |
| Animation | Required clips, duration/tracks, no cross-action pose leakage |
| Uniqueness | No accidental duplicate hero/weapon output hash |
| Budget | Triangle/material/draw/texture/bone/byte report within approved guardrails |
| Color space & packing | baseColor/emissive sRGB; normal/metallicRoughness/AO Non-Color linear; metalness in blue, roughness in green, occlusion in red; emissive > 1.0 uses `KHR_materials_emissive_strength` (§5.9) |

### 15.2 Deformation pose suite

Every class passes captured renders for:

- neutral A-pose;
- deep crouch;
- wide stride;
- knee lift;
- toe/ball bend;
- arms overhead;
- cross-body reach;
- elbow 120°;
- wrist/weapon grip;
- torso twist ±60°;
- head turn/tilt;
- class-specific extreme skill pose.

Reject visible candy-wrapper twist, collapsing shoulder volume, pinched hips, detached armor, body penetration, or weight leakage.

### 15.3 Runtime structural gates

- required assets report `fallback === false` at title and gameplay;
- actual asset class/weapon metadata matches selected class/equipment;
- requested shipping clip name equals the action's real clip name, never idle fallback;
- all material maps survive conversion;
- hero/weapon bounds and socket parents are valid;
- no negative scale in visible production ancestry;
- release/dispose keeps AssetManager refcounts correct;
- class swap leaves exactly one active hero/weapon instance.

### 15.4 Motion numeric gates

Provisional metrics, calibrated on the Gunner slice:

| Metric | Initial target |
|--------|----------------|
| Support-hand anchor error | ≤ 0.035 world units at required contact samples |
| Stock/shoulder error | No visible separation; numeric target set from golden asset |
| Planted-foot horizontal drift | ≤ 0.04 world units during tagged contact on flat test ground |
| Muzzle event error | Event world point equals authored socket within float tolerance |
| Locomotion phase discontinuity | No action phase jump > 0.12 normalized during adjacent blend |
| Layer weight | Finite, clamped 0–1, deterministic arbitration |
| Event delivery | Exactly once and ordered, including coarse/dropped frame simulation |
| Teleport reset | IK/springs reset in one update; no long snap-back |

### 15.5 Visual review matrix

For each class, capture deterministic high and medium images/video:

| View | Required |
|------|----------|
| Title idle | front 3/4, side, back 3/4 |
| Gameplay idle/move | normal VFX and mute-VFX |
| Normal debug | front/side/back |
| Wireframe | front/side and extreme pose |
| Skeleton/socket | ready pose and primary attack |
| Basics | every combo step at anticipation/contact/follow-through |
| Skills | all four at phase peaks |
| Reactions | dodge, light/heavy hit, death |
| Quality | low, medium, high |

Product acceptance rejects:

- chibi/block/capsule read;
- rigid torso with limb-only motion;
- skating feet;
- floating/intersecting weapons;
- missing/flat/white materials;
- disappearing faces from culling;
- class identity carried only by color;
- skill identity carried only by VFX.

### 15.6 Automated commands

Final exact commands are established in Wave 0. Expected shape:

```bash
node tools/assets/build-heroes.mjs --class gunner
node tools/assets/validate-hero-assets.mjs --class gunner
node tests/hero-asset-contract.mjs
node tests/hero-animation-runtime.mjs
node tests/class-mode-visual-smoke.mjs
node tests/integrity.mjs
```

The current required server remains:

```bash
node server.mjs
# http://127.0.0.1:8777 — never file://
```

### 15.7 Responsiveness and accessibility gates

Numeric targets from §5.6–§5.10, calibrated on the Gunner slice alongside §15.4:

| Metric | Target |
|--------|--------|
| Input-to-first-visible-pose-change (attack/dodge) | ≤ 50 ms (≤ 3 frames at 60 FPS, ≤ 2 frames at the 30 FPS mobile floor); never gated behind a full clip preroll |
| Locomotion start blend weight ramp | Non-zero weight toward the target action within 1–2 frames of input |
| Adjacent locomotion-band cross-fade (idle/walk/run/sprint) | 120–220 ms |
| Start/stop/pivot cross-fade | ≤ 150 ms |
| Committed full-body action entry cross-fade (dodge, big skills) | ≤ 80 ms |
| Emissive/status pulse and muzzle-flash rate | < 3 Hz (seizure-safety guardrail; independent of the existing shake/hit-stop ban, §1.3/§17.3) |
| Debug/F3 HUD text and status-label contrast | ≥ 4.5:1 body text, ≥ 3:1 large text/icons (WCAG 2.2 AA) |
| Silhouette class-identification spot check | ≥ 90% correct class ID from a black-silhouette-only capture at the default gameplay camera distance |

These are responsiveness/accessibility floors, not replacements for §15.4's motion-fidelity gates; both must pass.

---

## 16. Provisional performance budgets

These are guardrails to calibrate on Gunner, not permission to sacrifice the product bar. Any change requires measured evidence and a documented amendment.

### 16.1 Per active hero, excluding VFX/monsters

| Resource | High / LOD0 | Medium / LOD1 | Low / LOD2 |
|----------|-------------|---------------|------------|
| Hero triangles | ≤70k | ≤30k | ≤12k |
| Weapon triangles | ≤15k | ≤7k | ≤3k |
| Deformation bones | ≤64 | ≤64 | ≤48 active/evaluated |
| Total exported nodes | ≤80 | ≤80 | ≤80 |
| Hero + weapon draw calls | ≤12 | ≤8 | ≤6 |
| Visible material groups | ≤8 | ≤6 | ≤4 |
| Active hero texture GPU budget | ≤32 MB | ≤20 MB | ≤12 MB |

Current heroes already spend roughly 75k–85k LOD0 triangles without authored textures. Better topology, atlases, and removal of the duplicate outline proxy should improve visible quality without an uncontrolled triangle increase.

### 16.2 Frame/load gates

- Preserve the existing current-scene desktop target and a stable 30 FPS mobile floor under the project’s stress scenario.
- Measure animation/IK/spring CPU time separately; LOD expensive post-processing by distance/quality.
- No per-frame clip creation, track filtering, material cloning, or skeleton traversal cache rebuild.
- If five textured heroes make initial preload unacceptable, preload the selected/default hero and background-load other class assets; never display a primitive while switching.
- Compare startup bytes, decode time, first title frame, class-swap latency, GPU memory, draw calls, and triangles before/after each class slice.

### 16.3 Implemented authored-recipe measurements

The repository-owned authored recipe now emits three reviewed LODs for every hero. These triangle ceilings are enforced by `validate-hero-assets.mjs`; a build cannot silently exceed the table in §16.1.

| Hero | LOD0 triangles | LOD1 triangles | LOD2 triangles |
|------|---------------:|---------------:|---------------:|
| Knight (`aerin`) | 41,748 | 22,030 | 10,934 |
| Wizard | 49,602 | 24,342 | 11,634 |
| Rogue | 47,392 | 23,084 | 10,744 |
| Ranger | 39,268 | 19,640 | 8,560 |
| Gunner | 46,204 | 26,576 | 8,652 |

LOD2 deliberately drops small Gunner modules and reduces rounded-surface subdivisions while retaining the powered cuirass, collar, pack, pauldrons, limb plates, class marker, rig, clips, sockets, and material roles. This is a reviewed distance LOD, not a fallback mesh.

---

## 17. Risks, rollback, and stop rules

### 17.1 Major risks

| Risk | Mitigation |
|------|------------|
| DCC pipeline expands scope | Gunner golden slice locks rig/export/material conventions before mass production |
| New model looks better but moves poorly | Deformation pose gate precedes animation; IK/contact tests follow |
| Animation graph breaks combat timing | Keep combat authority; event/timeline parity tests; class-by-class migration |
| Textures vanish under stylized conversion | Material adapter and map-binding tests land before textured art |
| Foot IK jitters on terrain | Clamp, fade, teleport reset, quality/distance LOD, flat-ground golden first |
| Support IK over-constrains attacks | Per-clip weight windows and pole targets; allow intentional releases |
| Startup/load bloat | Compression, atlases, LODs, measured background preload if needed |
| Generic modules absorb Sol content | Injection policy + template-boundary integrity |
| Existing dirty work is overwritten | Change only planned files per slice; inspect status/diff before every edit |
| Art review becomes subjective | Fixed silhouette, material, motion, and camera acceptance sheets |

### 17.2 Rollback strategy

Migration is per class behind asset schema/profile selection. Until a class passes its exit gate:

- keep its current GLB as the production manifest target;
- load the v2 asset only through a debug/query flag or isolated test manifest;
- do not mix v1 and v2 skeleton clips on one instance;
- keep stable class ids, saves, skills, and equipment data;
- revert a class manifest row without reverting shared validated runtime improvements.

After all five pass and product acceptance is recorded, remove shipping v1 procedural hero paths in Wave 6.

### 17.3 Stop rules

1. Do not start class production before Wave 0 catches intentionally swapped/missing assets.
2. Do not texture a class before its silhouette, topology, rig, and deformation poses pass.
3. Do not convert the other four classes before Gunner passes §9.5.
4. Do not mass-convert classes before Knight proves the full-body policy.
5. Do not hide a contract failure with a class-specific soft exception.
6. Do not fix bad normals with blanket `DoubleSide` or missing textures with flat recolor.
7. Do not fix weapon direction with negative production scale.
8. Do not move damage/range into animation or retune balance inside an art slice.
9. Do not re-enable shake/hitStop.
10. Do not edit `vendor/`, create branches, auto-commit, or push unless explicitly requested.

---

## 18. Execution order

Recommended reviewable slices:

| Slice | Scope | Product proof |
|-------|-------|---------------|
| **S0** | Wave 0 reliability harness | Wrong/fallback assets cannot pass |
| **S1** | Rig/export/material mannequin | Authored textured skinned GLB works end to end |
| **S2** | Gunner static model + rifle | Marine silhouette and rendering accepted |
| **S3** | Gunner locomotion/layers/IK | Natural move-and-fire accepted |
| **S4** | Gunner basics/skills/reactions/LODs | Complete golden class accepted |
| **S5** | Generic runtime hardening + Knight | Ranged and melee policies proven |
| **S6** | Wizard | Cast/cloth path proven |
| **S7** | Rogue | Dual-weapon/pivot path proven |
| **S8** | Ranger | Bow/draw/vault path proven |
| **S9** | Cross-class optimization, cleanup, docs | Release matrix accepted |

Every slice includes its generated assets, contract report, focused tests, deterministic captures, and the relevant living-doc update. Do not combine multiple unreviewed class conversions into one commit.

### 18.1 First actions when implementation begins

1. Read this plan and the linked living guides end to end.
2. Capture/record the current five-class visual and performance baseline.
3. Implement Wave 0 failure injection and contracts.
4. Draft `sol_humanoid_v2` and the deformation pose suite.
5. Produce a gray/textured mannequin export and prove material map preservation.
6. Create and approve the Gunner concept before production modeling.
7. Execute only through the Gunner exit gate; reassess budgets/architecture before cascading.

---

## 19. Research references

### Primary external sources

- [Khronos glTF 2.0 Specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) — skinning, materials, animation, accessors, validation rules
- [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator) — specification conformance and asset statistics
- [Khronos Real-time Asset Creation Guidelines](https://github.com/KhronosGroup/3DC-Asset-Creation/blob/main/asset-creation-guidelines/RealtimeAssetCreationGuidelines.md) — real-time modeling, materials, UVs, origins, optimization, review
- [Khronos glTF Asset Auditor](https://www.khronos.org/gltf/gltf-asset-auditor/) — profile-based practical asset checks
- [Blender Manual — glTF 2.0](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html) — materials, skinning, actions/NLA, sampling, export limitations
- [Blender Manual — Actions / Bake Action](https://docs.blender.org/manual/en/latest/animation/actions.html) — actions and baking constraints/drivers
- [Blender Manual — Weight Paint](https://docs.blender.org/manual/en/latest/sculpt_paint/weight_paint/introduction.html) — normalized weight workflow
- [Three.js Animation System](https://threejs.org/manual/en/animation-system.html) — mixers, clips, actions, blending
- [Three.js AnimationAction](https://threejs.org/docs/#api/en/animation/AnimationAction) — weights, crossfades, sync, time scaling, additive mode
- [Three.js AnimationUtils](https://threejs.org/docs/#api/en/animation/AnimationUtils) — additive clip conversion and subclips
- [Three.js SkeletonUtils](https://threejs.org/docs/#examples/en/utils/SkeletonUtils) — skinned clone and retarget helpers
- [Epic — State Machines](https://dev.epicgames.com/documentation/en-us/unreal-engine/state-machines-in-unreal-engine) — locomotion state/transition organization
- [Epic — Blend Spaces](https://dev.epicgames.com/documentation/en-us/unreal-engine/blend-spaces-in-unreal-engine) — parameter-driven locomotion/aim blending concepts
- [Epic — Animation Blend Nodes](https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-blueprint-blend-nodes-in-unreal-engine) — additive and per-bone layer concepts
- [Epic — Two Bone IK](https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-blueprint-two-bone-ik-in-unreal-engine) — limb effector and pole target model
- [Epic — Motion Warping](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-warping-in-unreal-engine) — bounded target alignment windows
- [Epic — Distance Matching](https://dev.epicgames.com/documentation/en-us/unreal-engine/distance-matching-in-unreal-engine) — speed/distance-driven pose timing concepts
- [Khronos — PBR in glTF](https://www.khronos.org/gltf/pbr/) — official channel packing, color-space, and emissive-strength rules for glTF PBR materials
- [Blender Manual — Command Line Interface](https://docs.blender.org/manual/en/latest/advanced/command_line/index.html) — headless `--background`/`--python` invocation for deterministic, GUI-free authoring runs
- [W3C — Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) — contrast, pause/stop/hide, and flashing-content thresholds
- [WebAIM — Contrast and Color Accessibility](https://webaim.org/articles/contrast/) — practical contrast-ratio application
- [Filament Games — Accessibility Terms for Game Developers](https://www.filamentgames.com/blog/accessibility-terms-for-game-developers-a-wcag-2-1-aa-glossary) — WCAG baseline applied to game HUD/character elements
- [Raaen — Latency Thresholds for Usability in Games: A Survey](https://scispace.com/pdf/latency-thresholds-for-usability-in-games-a-survey-2z25v3c4p7.pdf) — genre-calibrated input-latency perception thresholds
- [Wikipedia — Input lag](https://en.wikipedia.org/wiki/Input_lag) — synthesized playability/distraction latency thresholds across measured studies
- [Polydin — Isometric RPGs Explained](https://polydin.com/isometric-rpg/) — camera-distance readability priorities specific to the isometric ARPG genre
- [MoCap Online — Blend Trees in Game Engines](https://mocaponline.com/blogs/mocap-news/animation-blend-tree-guide) — normalized-time sync and blend-duration tuning practice
- [MoCap Online — Animation State Machines: Patterns for 200+ States](https://mocaponline.com/blogs/mocap-news/animation-state-machine-design-patterns) — legible state/parameter naming and layering conventions
- [Animotionx — Gameplay Animation Start: Where Responsiveness Happens](https://www.animotionx.com/en/post/gameplay-animation-start-where-responsiveness-happens) — responsiveness-first framing for the start of a gameplay action

### Internal sources audited

- `tools/assets/generate_assets.mjs`
- `js/assets/AssetManager.js`
- `js/characters/CharacterFactory.js`
- `js/characters/CharacterAnimationController.js`
- `js/graphics/StylizedMaterial.js`
- `js/graphics/OutlineSystem.js`
- `js/graphics/RenderPipeline.js`
- `js/entities/Player.js`
- `tests/class-mode-visual-smoke.mjs`
- current hero/weapon GLB JSON chunks and current title renders
- recent Gunner and render-binding commit history

## 20. Implemented closeout and three-pass evidence

### 20.1 Shipped result

- All five playable classes now ship distinct schema-v2 authored heroes at high, medium, and low quality: 15 committed GLBs with class/rig/LOD provenance, required sockets/contact markers, class silhouette markers, 41-node shared rigs, and enforced triangle budgets.
- The shipping authored-recipe source is deterministic and class-specific. `build-heroes.mjs` records source/output SHA-256 receipts and selects Blender only when an approved source and compatible binary exist; `--require-blender` fails before writes on this workstation.
- Every hero ships idle/walk/run/sprint, start/stop/pivot, breath/aim/recoil/hit additive helpers, dodge/reactions/death, class basics, and four class skill clips. The static contract treats the shared helper inventory as required.
- Runtime uses one mixer, phase-synchronized locomotion weights, non-blocking additive start/stop/pivot poses, upper/full/additive arbitration, ordered normalized events, rifle support-hand two-bone IK, planted-foot terrain correction, and bounded cape/hair secondary motion.
- CharacterFactory removes runtime head-kit geometry from schema-v2 heroes, preserves PBR source maps through stylized conversion, validates hero/weapon identity and sockets, and keeps the preload cache resident for synchronous title class swaps and equipment changes.
- F3 diagnostics expose asset URL/quality/contract status, sockets, locomotion band/weights/state, active layers, IK/grounding contacts, and material-map state without affecting release HUD behavior.
- The current stylized authored-recipe baseline intentionally uses material-role PBR parameters and vertex color rather than mandatory image textures. The runtime adapter and tests preserve and report every supported glTF map when a Blender or future authored source supplies one; absence is not replaced with a flat white material or hidden fallback.

### 20.2 Cold review pass 1 — integration and live-surface review

Commands included `node tests/integrity.mjs`, Gunner/presentation suites, and split desktop/mobile Playwright visual matrices. The cold run exposed oversized evolved greatsword/saber silhouettes, unreliable zero-hold Smartlink input replay, and title-return cache purging that could invalidate later synchronous asset swaps. Weapon profiles, input replay, asset residency, and the visual bounds measurement were corrected; the desktop and mobile matrices then passed.

### 20.3 Cold review pass 2 — adversarial asset/motion review

The asset failure-injection suite, runtime numeric suite, validator, Gunner contract, and focused Rogue/Gunner live renders were rerun. The review rejected the Rogue evolved saber as too sword-like and identified the planned transition/additive inventory as diagnostics-only. The saber was shortened; start/stop/pivot, breath, aim, recoil, and hit additive clips were authored; transient additive playback and non-blocking transition layers were implemented; all 15 hero GLBs were rebuilt and revalidated.

### 20.4 Cold review pass 3 — final release matrix

The clean final matrix passed:

```bash
node tests/integrity.mjs
node tests/hero-asset-contract.mjs
node tests/hero-animation-runtime.mjs
node tests/gunner-class.mjs
node tests/presentation-motion.mjs
node tools/assets/validate-hero-assets.mjs
node tools/assets/build-heroes.mjs --all --dry-run --report=.gjc/hero-build-dry-run-final.json
node tools/assets/build-heroes.mjs --all --dry-run --require-blender  # expected fail-closed
BASE_URL=http://127.0.0.1:8777 SMOKE_SCOPE=desktop node tests/class-mode-visual-smoke.mjs
BASE_URL=http://127.0.0.1:8777 SMOKE_SCOPE=mobile node tests/class-mode-visual-smoke.mjs
git diff --check
```

The final live surface covers five desktop Hunts, five desktop Defense runs, Continue, five mobile Hunts, mobile Rogue Defense, class/weapon bindings, schema/marker identity, material preservation, positive-scale ancestry, locomotion blending, Gunner IK/mount error, Smartlink, and touch-HUD containment. Evidence is retained in `artifacts/hero-overhaul/verification-report.json`, `artifacts/hero-overhaul/web-transcript.json`, and the accompanying non-uniform screenshots.

---

## Appendix A — Stable and new clip inventory

### A.1 Stable shipping names to preserve

| Category | Names |
|----------|-------|
| Shared | `idle`, `walk`, `run`, `sprint`, `dodge`, `hit`, `hit_light`, `hit_heavy`, `death` |
| Knight/Rogue basics | `attack_1` … `attack_7` |
| Wizard/Ranger/Gunner basics | `cast_1` … `cast_4` plus current `attack_*` fallbacks |
| Skills | Existing class-specific `skill_*` names in content/manifest |

### A.2 Implemented helper clips

These schema-v2 helper clips are shipping graph inputs and do not replace stable combat names:

```text
locomotion_start
locomotion_stop
pivot_left
pivot_right
pivot_180
aim_idle_add
breath_add
recoil_add
hit_add
```

The names are enforced by the static hero asset contract.

---

## Appendix B — Per-class product review sheet

For every class, reviewers answer yes/no with fixed captures:

### Shape

- [ ] Reads as a designed character, not assembled primitives
- [ ] Heroic/anatomical proportions; not chibi/block-like
- [ ] Class recognizable in black silhouette
- [ ] Weapon recognizable and correctly scaled
- [ ] Hands, feet, elbows, knees, neck, and pelvis are readable

### Surface

- [ ] Material roles remain distinct under current lighting
- [ ] Texture maps survive stylized conversion
- [ ] No unexplained white/black/transparent parts
- [ ] No outline proxy or noisy double silhouette
- [ ] No culling holes from any required camera

### Motion

- [ ] Idle contains life without excessive bobbing
- [ ] Start/stop/pivot transfer weight
- [ ] Feet do not visibly skate
- [ ] Torso/pelvis/legs contribute to combat actions
- [ ] Weapon contacts stay intentional
- [ ] Anticipation, contact/release, follow-through, recovery are readable
- [ ] Skill body identity survives mute-VFX review

### Technical

- [ ] Static asset contract green
- [ ] Runtime structural/motion tests green
- [ ] Low/medium/high renders real assets
- [ ] Performance within calibrated budget
- [ ] No class-specific soft exception

---

## Appendix C — Asset failure-injection suite

Wave 0 must deliberately prove that each failure is caught:

1. Manifest points `hero.gunner` to Ranger GLB.
2. Manifest points `weapon.rifle` to staff GLB.
3. Gunner root metadata says `ranger`.
4. Rifle lacks `grip_support` or `muzzle_socket`.
5. Required Gunner skill clip is absent.
6. Clip name exists but contains zero tracks.
7. A skinned primitive has unnormalized or empty weights.
8. A normal-mapped material lacks required tangent support after final pipeline decision.
9. A visible ancestor has negative scale.
10. An approved opaque material exports as alpha blend/near-zero opacity.
11. Asset load fails and a primitive fallback is returned.
12. Class switch leaks the previous hero/weapon instance.

All twelve must produce a specific failing message, not a generic screenshot timeout.

---

## Appendix D — Decision log

| Date | Decision |
|------|----------|
| 2026-07-17 | Broadened the completed bake-only motion work into a full hero asset/material/runtime overhaul. |
| 2026-07-17 | Chose versioned, class-authored offline GLB sources: Blender is the preferred DCC path and the repository-owned deterministic authored recipe is the supported Blender-free build path. |
| 2026-07-17 | Chose Gunner as the visual/upper-body golden slice and Knight as the full-body architecture proof. |
| 2026-07-17 | Chose one mixer with filtered/additive layers, analytic IK, and code-authoritative movement. |
| 2026-07-17 | Made asset-contract/failure-injection work a prerequisite, directly addressing the repeated placeholder-render incident. |
| 2026-07-17 | Research-hardening pass: added evidence-based responsiveness, animation-transition, accessibility, and material-reliability targets (§5.5–§5.11, §12.6, §15.7) from current primary/industry sources; scope and stable-API contract unchanged. |
| 2026-07-17 | Reconciled the "richer authored motion" mandate (§1.1, §6, §9, §10) with the pre-existing responsiveness constraint (§1.3, §8.3) by codifying explicit input-latency and blend-timing budgets in §15.7 — fidelity work must never add perceptible input lag. |
| 2026-07-17 | Made Blender capability explicit: normal local builds report `authored-recipe`; `--require-blender` fails before writing unless Blender and approved `.blend`/export sources exist. Runtime and tests consume only committed GLBs. |
| 2026-07-17 | Implemented the schema-v2 static contract for all 15 hero LOD outputs and starter weapons, including rig/class/LOD metadata, required IK/contact/socket nodes, per-class silhouette markers, uniqueness checks, strict triangle budgets, and source/output SHA-256 receipts. |
| 2026-07-17 | Implemented one-mixer locomotion blending, upper/full/additive layers, ordered normalized events, support-hand two-bone IK, planted-foot terrain correction, bounded cape/hair secondary motion, runtime diagnostics, and fail-visible asset handling. |
| 2026-07-17 | Closed execution after three cold review/fix passes; the second pass rejected diagnostics-only transitions and overlong Rogue sabers, added the shipping transition/additive inventory, rebuilt all hero LODs, and the third pass cleared the full automated and browser matrices. |

---

**End of Hero Graphics & Animation Overhaul plan.**
