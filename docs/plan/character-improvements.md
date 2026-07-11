# Character & shared-module improvement pass

Audit of the three hero classes (knight `aerin` / wizard / rogue) and the shared
character-control modules (Player, CombatSystem, CharacterAnimationController,
CharacterFactory, content data, tests, asset bake). Each item below is tracked as a
task and implemented in this pass.

## A. Architecture

| # | Item | Files | Status |
|---|------|-------|--------|
| A1 | **Stat getter recomputation** — `equipmentStats` / `passiveEffects` rebuilt on every access; HUD + combat read them dozens of times per frame. Cache with dirty invalidation on equip / skill upgrade / level / class change. | `js/entities/Player.js` | done |
| A2 | **Basic-attack tuning hardcoded** — melee range/mult/pulse constants and magic combo table live in `CombatSystem`; per-class values become `HERO_CLASSES[*].basicAttack` data (numbers unchanged). | `js/data/content.js`, `js/systems/CombatSystem.js` | done |
| A3 | **Anim fallback map hardcoded in Player** — replaced with `SKILLS[id].animFallback` data. | `js/data/content.js`, `js/entities/Player.js` | done |
| A4 | **`skill.recipe` unverified label** — handlers call recipes directly; test now asserts every active's `recipe` maps to an existing `Effects.recipe<PascalCase>` method. | `tests/skill-combat.mjs` | done |
| A5 | **Hero GLBs bake every class's clips** — `heroAnimations()` now filters combat clips per profile (shared locomotion/reactions stay); all three heroes rebaked smaller. | `tools/assets/generate_assets.mjs`, `assets/models/hero/*` | done |
| A6 | **Timeline phases lost when cast is interrupted** — replacing an active one-shot (e.g. `hit` on damage) silently dropped scheduled `timeline.hits` events; MP/cooldown were spent with no damage. Pending events now flush on one-shot replacement. | `js/characters/CharacterAnimationController.js` | done |
| A7 | **Magic-count test assertions** — fixed totals (24 skills / 13 weapons / 12 actives) replaced with structural checks (4 actives + 4 passives per class, valid classIds, valid weapon bases). | `tests/integrity.mjs`, `tests/skill-combat.mjs` | done |
| A8 | **DoT plumbing naming** — `tickStatuses` returns generic `dotDamage` (burn + bleed), not `burnDamage`. | `js/data/skillCombat.js`, `js/entities/Enemy.js`, tests | done |
| A9 | **Misc debt** — Focus/Rage energy serialized in saves; defense soak `.46` and potion cooldown moved to `PLAYER_CONFIG`; docs/tests wording unified on "knight (`aerin`)". | `js/config.js`, `js/entities/Player.js`, tests | done |

## B. Content

| # | Item | Files | Status |
|---|------|-------|--------|
| B1 | **Knight had no signature mechanic** — the energy resource is generalized (`energy.label` / `energy.effect` dispatched via `CombatSystem.energyHandlers`). Knight gains **Rage**: charges from damage taken + hits landed; at full (Lv3+) the next attack click releases **Wrath Slam**, a heavy AoE crush. | `js/data/content.js`, `js/systems/CombatSystem.js`, `js/entities/Player.js`, `js/ui/UI.js` | done |
| B2 | **Stat caps dead-end scaling** — attack-speed overflow past the 1.75 cap now accelerates energy gain (`energyGainMul`); crit overflow past the 0.65 cap converts to crit damage (`critMultiplier = 1.85 + overflow × 1.5`, threaded through `resolveSkillHitRaw`). | `js/entities/Player.js`, `js/data/skillCombat.js`, `js/systems/CombatSystem.js` | done |
| B3 | **Copy-paste passive trees** — one fantasy passive per class: knight `executioner` (bonus damage vs enemies under 30% HP), wizard `pyromancer` (DoT power), rogue `opportunist` (crit chance vs bleeding/slowed targets). New passive keys `execute` / `dotPower` / `statusCrit`. | `js/data/content.js`, `js/entities/Player.js`, `js/systems/CombatSystem.js`, `js/entities/Enemy.js` | done |
| B4 | **No status synergies** — global rule: slowed enemies take +4% crit chance from all sources (stacking with rogue `opportunist`). | `js/systems/CombatSystem.js` | done |
| B5 | **Shared weapon pool ignores class identity** — `HERO_CLASSES[*].weaponBias` weights loot weapon-base rolls toward class-appropriate models (daggers for rogue, staves for wizard, blades for knight). | `js/data/content.js`, `js/systems/LootSystem.js` | done |
| B6 | **Minor content polish** — dedicated dagger UI icon (was a saber copy); rogue unlock pacing differentiated to 3/5/9/14 (knight/wizard keep 3/6/10/16). | `assets/textures/ui/icon_dagger.png`, `js/data/content.js` | done |

## Explicitly deferred

- **Player-side status effects** (slow/burn on the hero): plumbing exists enemy-side only;
  applying statuses to the player is a combat-design decision (enemy kits need matching
  telegraphs) — out of scope for this pass.
- **classId rename `aerin` → `knight`**: save-compatibility risk outweighs the naming win;
  wording unified in docs/tests instead.
- **Defense-mode class balance tuning**: smoke-tested for stability here; numeric tuning
  needs playtest data.

## Validation

- `node tests/integrity.mjs` (import integrity + skill-combat + structural checks)
- `node tests/class-mode-visual-smoke.mjs` (Playwright: desktop and iPhone 13 Mini)
- Playwright smoke: title → each class → New Hunt, plus Rogue Defense mode load; zero console errors.

## Asset bake result

- Every hero GLB now contains the six shared locomotion/reaction clips plus only its own basic and skill clips: 17 clips for Knight and Rogue, 18 for Wizard.
- Re-baking reduced tracked hero payloads against the previous files: Knight LOD0/LOD1 by 24,060/24,064 bytes and Wizard LOD0/LOD1 by 27,116/27,112 bytes. Rogue is a new class asset.
- The final visual smoke generated and inspected desktop Hunt captures for Knight, Wizard, and Rogue, plus Rogue Defense; it also generated the same mobile coverage with the touch HUD. The mobile resource-card overlap found during inspection is covered by an automated layout assertion.
