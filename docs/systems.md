# Gameplay systems

Owned by `Game` and called via `update(delta)` in the `playing` loop.

## EnemySystem

File: `js/systems/EnemySystem.js`

- Target count: `GAME_CONFIG.targetEnemies` / `maxEnemies` (+ level adjustment)
- Spawn: `world.randomSpawnAround` + `world.zoneAt` → `ZONE_SPAWNS`
- Boss: `spawnBoss(zoneId)` → `ZONE_BOSSES`
- Despawn: `despawnRadius` + no recent hit

## HuntSystem

File: `js/systems/HuntSystem.js`

- Kill streak, elite / boss counts
- Boss gauge / appearance
- World tier
- Random contracts
- Hunter titles (`HUNT_TITLES`)

UI bindings: kill / streak / boss charge / contract elements.

## LootSystem

File: `js/systems/LootSystem.js`

- Drop generation (legacy compatibility only)
- Gold and recovery-potion world pickup meshes
- Signature weapon enhancement cost and option growth

Legacy equipment tables remain in `content.js` for save migration and compatibility; live hunting no longer adds equipment to inventory.

## CombatSystem

→ [combat.md](./combat.md)

## SaveManager

File: `js/core/SaveManager.js`

- key: `GAME_CONFIG.saveKey`
- version: `GAME_CONFIG.saveVersion`
- Player / Hunt / settings serialization is on the `Game.saveGame` / `continueGame` path

If you bump the version, add old-save compatibility logic or document the loss.

## When adding a system

1. Create it in `Game.initialize`
2. Wire it into the update branch of the relevant state
3. Clean it up in `dispose` / `#clearRun`
4. If it needs saving, add a field to the save payload

## Application: kill-reward pipeline

```
Enemy dies
  → Game.onEnemyKilled(enemy)
      HuntSystem.onKill   // streak, boss gauge, contract, title milestone
      LootSystem drop     // one gold pickup + optional recovery potion
      XP grant            // XP gem path
```

Where to put reward logic:

- **Meta progress** → HuntSystem.onKill
- **Gold pickups** → LootSystem
- **Recovery potion pickups** → LootSystem (limited survival exception)
- **Weapon growth** → Player + LootSystem enhancement helpers
- **Instant stats** → Player method

Three systems overlap on one event, so watch for `ui.notify` spam.

## Application: boss gauge customization

`HuntSystem.onKill`:

- normal +2.35 / elite +9 → change only the numbers for "boss more/less often"
- `bossPendingTimer` presentation delay
- Per-zone boss uses `spawnBoss(currentZone.id)` — requires zone-data boss mapping

## Application: rare drop manipulation

`LootSystem.rollRarity` weights + `rarePity`.
On boss kill, `options.boss` boosts legendary weight.
A pity like "guaranteed first legendary" can force a floor at the rarePity threshold.

## Application: world tier linkage

Where `worldTier` is used:

- drop luck / weight
- enemy level adjustment (`EnemySystem` adaptive level)
- UI display

Changing the tier formula moves the whole mid/late difficulty.

## Related

- [extension-playbooks.md](./extension-playbooks.md)
- [combat.md](./combat.md)
- [content-data.md](./content-data.md)
