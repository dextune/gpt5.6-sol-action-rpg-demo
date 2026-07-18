# Wizard implementation reference

Concrete map of how **Wizard** (`classId: wizard`) was added. Use this as a worked example when adding another class.

## Product summary

| Aspect | Value |
|--------|--------|
| Display name | Lyra |
| Title | Arcane Adept |
| Model | `hero.wizard` → `assets/models/hero/wizard_lod{0,1}.glb` |
| Attack style | `magic` (staff mana bolts + finisher multi-orb) |
| Starter | Apprentice Staff (`model: 'staff'`, id `starter-apprentice-staff`) |
| Look kit | Baked hat/hair; runtime `headKit: 'none'`; indigo/violet palette |

## Skills (spectacle pass — unique clips + recipes)

| Key | Skill id | Effect | Anim clip (**unique**) | Theme / recipe | Status | Unlock |
|-----|----------|--------|------------------------|----------------|--------|--------|
| Q | `fireball` | `fireball` | `skill_fireball` | ember / fireOrb | burn | 3 |
| E | `frost_nova` | `frost_nova` | `skill_frost_nova` | frost / iceNova | slow | 6 |
| R | `arcane_blink` | `arcane_blink` | `skill_blink` | arcane / blinkBurst | — | 10 |
| C | `meteor_storm` | `meteor_storm` | `skill_meteor` | meteor / meteorDrop | burn | 16 |

Basic magic uses `cast_1`–`cast_4` (not sword swings).  
Passives: `arcane_might`, `mana_ward`, `mana_font`, `star_luck`.

Combat is **keyboard-only** (`J` / skills keys). Mouse is UI-only.  
Implementations live in `CombatSystem` (`#fireball`, `#frostNova`, `#arcaneBlink`, `#meteorStorm`). Ground-targeted spells place along **facing** (`#aimAlongFacing`), not mouse.  
Balance: `SKILLS.*.combat` + `skillCombatAtRank` — see [../combat.md](../combat.md).

## Files touched for Wizard (historical)

| Area | Path |
|------|------|
| Class + skills + staff bases | `js/data/content.js` |
| Magic attack + spell handlers | `js/systems/CombatSystem.js` |
| Class lifecycle, passives, facing | `js/entities/Player.js` |
| Look kit, weapon scale | `js/characters/CharacterFactory.js` |
| Input by class actives | `js/core/Game.js` |
| HUD class cards + skill slots | `index.html`, `js/ui/UI.js`, `css/game.css` |
| Staff loot levels | `js/systems/LootSystem.js` |
| Bake profiles + staff mesh | `tools/assets/generate_assets.mjs` |
| Manifest | `assets/manifests/assets.json` |
| Binaries | `assets/models/hero/wizard_*.glb`, `assets/models/props/weapon_staff.glb` |
| Icon | `assets/textures/ui/icon_staff.png` |
| Save version | `js/config.js` (`saveVersion: 4`) |
| Plan | `docs/history/multi-class-wizard.md` |
| Integrity | `tests/integrity.mjs`, `tests/import-integrity.mjs` |

## Bake commands used

```bash
# one-time for GLTFExporter in Node
npm install three@0.160.0 --no-save

node tools/assets/generate_assets.mjs --wizard-only
node tools/assets/generate_assets.mjs --staff-only
```

Shared with hunter bake: `heroSkeleton()`, `heroBodyGeometry()`, `heroAnimations()` (14 clips).  
Wizard-only visuals: indigo cloth/cape, pale hair SDF, `attachWizardHat`, sash, material colors via profile.

## Runtime look

`CLASS_LOOKS.wizard` in CharacterFactory:

- Cool cloth / gold trim / violet eyes  
- `headKit: 'none'` so baked hat is not covered by rogue hood  

Hunter (`aerin`) still uses runtime `headKit: 'rogue'`.

## Stat mods

```js
baseStatMods: { attack: 0.92, mp: 1.28, skillPower: 0.08 }
```

Applied in Player getters with passive aggregation.

## Title UX

- Card: Wizard / Lyra · Arcane focus  
- `?class=wizard` pre-select  
- MAX HUNT / Defense pass `selectedClassId`

## QA notes from implementation

1. **Facing bug** — magic previously snapped to mouse aim; fixed with `alignCombatFacing` + combat helpers.  
2. **`SKILLS is not defined`** — Game level-up notify used `SKILLS` after import was dropped; fixed + guarded by `tests/import-integrity.mjs`.  
3. Extension noise (`contentscript.js` ObjectMultiplex) is not game code.  

## What was deliberately not done for Wizard (historical V1)

- Separate Defense/Hunt balance tables per class  
- Class-locked loot (wizard can still equip swords if looted)  

## Later spectacle upgrades (now shipped)

- Unique cast/skill clips + `cast_*` basic attacks  
- Themed SFX, FX recipes, frost slow / fire burn  
- See [../history/skill-motion-spectacle.md](../history/skill-motion-spectacle.md)  
