# Combat · Hit detection

## Owner files

| File | Role |
|------|------|
| `js/systems/CombatSystem.js` | Basic attack / skills / enemy attacks, hit detection, damage |
| `js/entities/Player.js` | Combo timing, attack animation trigger, stats |
| `js/entities/Enemy.js` | AI, hit reaction, stagger, knockback |
| `js/graphics/Effects.js` | Visual effect pool API |
| `js/core/AudioManager.js` | swing / hit / skill SFX |
| `js/core/Game.js` | keyboard input → `tryAttack` (**J only**, no mouse), **shake/hitStop no-op** |

## Player basic attack flow

```
Keyboard J only (not mouse)
  → Player.tryAttack(game)
      alignCombatFacing()   // move keys / body facing — not mouse
      comboIndex 0..(basicComboLength-1)  // level-scaled for melee
      animation attack_1..4
      audio.swing
      combat.playerAttack(player, combo, comboLength)
  → delayed hit frame(s)
      swingArc VFX
      #hitEnemiesInCone
      #damageEnemy → enemy.takeDamage
      effects.impact (juice)
```

### Common basic-attack values (`CombatSystem.playerAttack`)

| Value | Location | Effect |
|-------|----------|--------|
| `delay` | hit-frame delay | motion sync |
| `range` | cone length | melee reach |
| `arc` | cone angle | hit width |
| `multiplier[]` | combo multiplier | `[0.9,1.0,1.12,1.55]` |
| `knockback` | knockback strength | finisher weight |
| `criticalBonus` | extra crit chance | |

### Combo timing (`Player.tryAttack`)

- `comboWindow` — combo hold duration
- `attackCooldown` / `attackAnimDuration` — attack speed / animation length
- `attackLunge` / velocity add — **keep weak** (too strong shakes the camera follow)

## Damage formula (summary)

`#damageEnemy`:

```
critical = random < player.critChance + bonus
damage = raw * (critical ? 1.85 : 1) * (skill ? skillPower : 1)
enemy.takeDamage → integer damage after armor reduction
```

`Enemy.takeDamage`:

```
amount = max(1, round(raw - defense * 0.37 * (1 - armorPierce)))
```

Crit / lifesteal / floating text live in `CombatSystem`.

## Skill implementation location

| skillId | Method | content key |
|---------|--------|-------------|
| whirlwind | `#whirlwind` | `SKILLS.whirlwind` |
| crescent | `#crescent` | projectile wave |
| skyfall | `#skyfall` | jump-landing AoE |
| starburst | `#starburst` | multi-hit burst |

MP / cooldown gating is `Player.trySkill` + `SKILLS` table.

## VFX policy (current)

- **Use**: `effects.swingArc`, `effects.impact`, `burst`, `ring`, `slash`, `pillar`, `trail`, `dust`
- **Forbidden / disabled**: camera `shake`, simulation `hitStop`
- Hit feel comes from **effect + sound + (weak) knockback**

`impact(position, color, intensity, { direction })`
`intensity`: `'light' | 'heavy' | 'critical' | 'finisher'`

## Enemy attacks

- `enemyMelee` / `enemyProjectile` / `enemyCharge` / `enemyLeap` / `enemyBossSpecial`
- Telegraphs: `#telegraphCircle`, `#lineTelegraph`
- AI branches: `Enemy.#combatAI` + `data.ai`

## Safely increasing only the juice

1. Adjust only `Effects.impact` / `swingArc` parameters
2. Particle count / lifetime within `Effects` pool limits (`MAX_PARTICLES`, pool size)
3. Do not re-enable camera / hit-stop

## Files to view alongside reach / weapon

- Weapon length scale: `js/characters/CharacterFactory.js` `WEAPON_LENGTH` / `WEAPON_GIRTH`
- Basic-attack range: `CombatSystem.playerAttack`

## Application: separate hit detection from visuals

| Layer | Changes | Does not change |
|-------|---------|-----------------|
| `WEAPON_LENGTH` | blade mesh length | hit range |
| `playerAttack.range` | hit distance | blade mesh |
| `swingArc` size | slash size | damage |
| `multiplier` | damage | effect |

If the request is "blade looks long but misses", fix **range** first; if "hits but blade looks short", fix **WEAPON_*** first.

## Application: treat only the combo finisher specially

Where `combo === 3` / `finisher` flag branches:

- delay, range, arc, multiplier, knockback
- Extra VFX ring/pillar/burst
- `#damageEnemy` intensity `finisher`

When boosting only the finisher's presentation, do not touch combo 0–2 multipliers.

## Application: unify skill "element color"

Hardcoded hex examples: whirlwind `0x8feaff`, starburst `0xe2b7ff`.
To unify the theme, it is safe to collect skill color constants in one object at the top of `CombatSystem` (single file).

## Application: multi-hit and invulnerable

`Enemy.takeDamage` `multiHit` option shortens hit-invulnerability (`0.045`).
If a skill multi-hit "only lands once", check whether `multiHit` is missing.

## Related extension docs

- [extension-playbooks.md](./extension-playbooks.md) §3 skills, §5 tempo, §6 presentation policy
