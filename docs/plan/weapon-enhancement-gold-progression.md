# Gold-only loot and signature weapon progression

Status: implemented in save schema version 5.

This document defines the progression change in which hunting rewards are gold and each hero owns one permanent signature weapon. The weapon can only become stronger through the two enhancement tracks below.

## Design goals

1. Remove replacement-equipment friction from the hunting loop.
2. Make every hero's weapon identity persistent and readable.
3. Give gold a clear sink without requiring inventory management.
4. Keep the same progression rules for Knight, Wizard, Rogue, and Ranger while preserving class-specific weapon silhouettes.
5. Keep old browser saves playable through a deterministic migration.

## Runtime flow

```text
Enemy defeated
  └─ LootSystem.dropFromEnemy()
       └─ one gold pickup (enemy / elite / boss / wave-scaled amount)

Contract or Defense milestone
  └─ direct gold reward

Player opens Weapon Forge
  ├─ Weapon Enhance          → signature weapon level, stats, model, name, rarity color
  └─ Weapon Option Enhance   → secondary option slots and option values
```

XP gems remain a separate XP system. Potions remain a starting/Defense supply and are not enemy loot. No gear, potion, essence, or salvage pickup is spawned from enemy loot.

## Enhancement tracks

### Weapon Enhance

- Stored as `weaponEnhanceLevel` on the single weapon.
- Range: `0..30`, configured by `WEAPON_ENHANCE` in `js/config.js`.
- Uses a gold enhancement attempt. Failure consumes the attempt cost but preserves the current level, stats, options, model, name, and rarity; it never downgrades the weapon.
- Attack power scales from the weapon's immutable `baseStats.power` by `1 + level * powerStep`.
- Attack speed receives a small linear step from `baseSpeed`.
- Evolution milestones are levels `0, 6, 12, 20, 30`.
- At a milestone, the weapon name, model, color, and rarity presentation change.

### Weapon Option Enhance

- Stored as `optionEnhanceLevel` and `optionStats`.
- Range: `0..20`, configured by `WEAPON_OPTION_ENHANCE`.
- Uses a separate gold cost curve.
- Adds one deterministic option in a repeating order: Crit, Haste, Skill Power, Gold Bonus, Luck, Lifesteal.
- Existing options increase rather than being rerolled, so saves and outcomes are reproducible.
- Option enhancement does not change the weapon model; it is the secondary stat track.

Costs and growth are intentionally data-driven. Edit `WEAPON_ENHANCE` and `WEAPON_OPTION_ENHANCE` for balance changes; edit `WEAPON_EVOLUTIONS` in `js/data/content.js` for class presentation and milestone names.

## Class application

`WEAPON_EVOLUTIONS` contains a five-stage path for every hero:

| Hero | Base silhouette | Final stage |
|------|-----------------|-------------|
| Knight | sword | relic-style Apex Aegis |
| Wizard | staff | relic-style Starforged Focus |
| Rogue | dagger/saber | relic-style Eclipse Fang |
| Ranger | bow | relic-style Convergence Arc |

The final relic model is included in each class weapon allow-list so the visual guard in `Player` cannot silently replace a valid evolved weapon with a starter weapon.

## Save migration

`GAME_CONFIG.saveVersion` is now `5`.

On load:

- The loader selects the saved equipped legal weapon, or the highest-scoring legal weapon in a legacy inventory.
- Armor, charms, duplicate weapons, and other legacy inventory entries are removed and converted to gold using their legacy sell value.
- Legacy `enhanceLevel` becomes `weaponEnhanceLevel`.
- Legacy affixes become `optionStats` when possible.
- The resulting save always contains exactly one weapon in `inventory` and `{ weapon: id }` in `equipped`.
- Essence is no longer restored as a progression currency.

The save key remains unchanged, so an existing player can continue without manually clearing browser storage.

## UI behavior

The old Equipment & Loot panel is now `Weapon Forge`:

- One signature-weapon card shows the current name, model, rarity color, combat stats, and option values.
- The evolution track shows all five weapon milestones and the current level.
- `Weapon Enhance` and `Weapon Option Enhance` have separate cost buttons and disabled states when unaffordable or maxed.
- HUD resource pills show Gold and the current weapon enhancement level (`WPN +N`). Essence and bag capacity are removed.
- All visible reward hints use gold/forge language; no player-facing loot text promises gear.
- English remains the only player-facing UI language.

## Implementation map

- `js/config.js` — save version and both enhancement tuning tables.
- `js/data/content.js` — class weapon evolution stages and starter weapon fields.
- `js/systems/LootSystem.js` — gold-only drops, cost helpers, weapon recomputation, option growth.
- `js/entities/Player.js` — one-weapon invariant, enhancement methods, serialization, legacy migration.
- `js/systems/HuntSystem.js` — contract reward copy and gold-only completion reward.
- `js/systems/DefenseSystem.js` — Defense milestone gold reward and gold VFX.
- `js/core/Game.js` — remove legacy Defense starter gear and immediate duplicate enemy gold grant.
- `js/ui/UI.js`, `index.html`, `css/game.css` — Weapon Forge panel, HUD weapon level, responsive layout.
- `tests/integrity.mjs` — expected save schema version 5.

## Acceptance checklist

- [x] Kill normal, elite, and boss enemies: only gold pickup is created.
- [x] Complete a contract: gold is granted and no gear pickup appears.
- [x] Clear Defense milestones: gold is granted and no gear is added.
- [x] Open Weapon Forge for each hero class: exactly one weapon is shown.
- [x] Weapon Enhance spends gold, increases attack, and updates the model/name at milestones.
- [x] Weapon Enhance failure consumes no enhancement level; the weapon remains unchanged.
- [x] Weapon Option Enhance spends gold and increases a visible option.
- [x] Save, reload, and continue: weapon levels/options remain unchanged.
- [x] Load a pre-version-5 save: one legal weapon remains and legacy equipment is converted to gold.
- [x] Run `node tests/integrity.mjs` and the browser HUD smoke checks.
