# Combat · Hit detection

## Owner files

| File | Role |
|------|------|
| `js/systems/CombatSystem.js` | Basic attack / skills / enemy attacks, hit detection, damage |
| `js/entities/Player.js` | Combo timing, attack / skill animation, cast timeline |
| `js/entities/Enemy.js` | AI, hit reaction, stagger, knockback, **statuses** (slow / burn / expose) |
| `js/data/skillCombat.js` | Pure combat helpers (`skillDamage`, `resolveSkillHitRaw`, status tick) |
| `js/data/fxThemes.js` | Skill color themes + quality particle multipliers |
| `js/graphics/Effects.js` | Pool VFX + **named recipes** |
| `js/core/AudioManager.js` | swing / hit / **themed skill** SFX |
| `js/core/Game.js` | keyboard input → `tryAttack` (**J only**, no mouse), **shake/hitStop no-op** |

Spectacle design plan (implemented): [history/skill-motion-spectacle.md](./history/skill-motion-spectacle.md).

## Player basic attack flow

```
Keyboard J only (not mouse)
  → Player.tryAttack(game)
      alignCombatFacing()   // move keys / body facing — not mouse
      comboIndex 0..(basicComboLength-1)  // level-scaled for melee
      animation:
        melee  → attack_1..7 (fallback attack_1..4)
        magic  → cast_1..4 (fallback attack_*)
      audio.swing
      combat.playerAttack(player, combo, comboLength)
  → delayed hit frame(s)
      melee: swingArc + cone hits
      magic: mana orbs / finisher fan
      #damageEnemy → enemy.takeDamage
      effects.impact (juice)
```

### Common basic-attack values (`CombatSystem.#meleeAttack` / `#magicAttack`)

| Value | Location | Effect |
|-------|----------|--------|
| pulse delays | `#meleeAttack` | multi-hit finishers |
| range / arc | cone hits | melee reach / width |
| combo mult | chain formula | scales with combo + level |
| knockback | hit options | finisher weight |
| criticalBonus | hit options | extra crit chance |

### Combo timing (`Player.tryAttack`)

- `comboWindow` — combo hold duration
- `attackCooldown` / `attackAnimDuration` — attack speed / animation length
- `attackLunge` / velocity add — **keep weak** (too strong shakes the camera follow)

## Damage formula (summary)

Authoritative outgoing skill/basic skill-hit path:

```
// content numbers
raw = skillDamage(player.attackPower, skillCombatAtRank(skill, rank))  // usually
// or projectile.damage already set at spawn

// #damageEnemy → resolveSkillHitRaw (js/data/skillCombat.js)
outgoing = raw * (critical ? 1.85 : 1) * skillMul
// skillMul = player.skillPower  when options.skill && !options.skillPowerApplied
// skillMul = 1                 when skillPowerApplied (damage already baked)

enemy.takeDamage → integer after armor: max(1, round(raw - defense * 0.37 * (1 - armorPierce)))
// expose status adds to armorPierce taken
```

**Do not double-apply `skillPower`.**

| Pattern | When | `skillPowerApplied` |
|---------|------|---------------------|
| AoE / radius / cone hits | Pass raw `skillDamage(...)` + `skill: true` | omit / `false` |
| Projectile without bake (crescent wave) | `damage: skillDamage(...)`, `skill: true` | **false** (default on spawn) |
| Projectile with bake (fireball) | `damage: skillDamage(...) * player.skillPower` | **true** on orb + explode |

Unit tests: `tests/skill-combat.mjs` (imported by `tests/integrity.mjs`).

Crit / lifesteal / floating text live in `CombatSystem`.

## Skill cast flow

```
Player.trySkill(skillId)
  → MP / CD / rank / classId gates
  → alignCombatFacing()
  → playOneShot(skill.anim)   // unique clip preferred; runtime fallbacks exist
  → audio.skill(skill.sfx || skill.theme)
  → if skill.timeline.hits[]:
       scheduleNormalized(t) → combat.usePlayerSkill(id, player, rank, phaseIndex)
     else:
       combat.usePlayerSkill(id, player, rank, null)
```

Handlers read balance via:

```js
const { skill, combat, theme } = this.#skillBundle(skillId, rank);
// combat = skillCombatAtRank(SKILLS[id], rank)
// theme  = getFxTheme(skill.theme)
```

Register effects on `this.skillHandlers[effectId]`.

### Active skill map (spectacle pass)

| skillId | Class | Recipe | Theme | SFX | Pattern / notes |
|---------|-------|--------|-------|-----|-----------------|
| whirlwind | aerin | `spinStorm` | windsteel | skill_blade | anim timeline 3 pulses |
| crescent | aerin | `groundWave` | bladewave | skill_blade | pierce wave; **expose** |
| skyfall | aerin | `leapImpact` | skyice | skill_leap | facing leap + land AoE |
| starburst | aerin | `starBlade` + finale | starlight | skill_star | **star** radial blades |
| fireball | wizard | `fireOrb` + blast | ember | skill_fire | projectile; **burn** |
| frost_nova | wizard | `iceNova` | frost | skill_ice | ring; **slow** |
| arcane_blink | wizard | `blinkBurst` | arcane | skill_arcane | afterimage teleport |
| meteor_storm | wizard | `meteorDrop` | meteor | skill_fire | **fallCone** (not star twin) |

MP / cooldown gating is `Player.trySkill` + `SKILLS` table.  
**Balance numbers live in `SKILLS[id].combat`** — do not hardcode mult/radius only inside handlers.

## Status effects (lightweight)

| Id | Source examples | Effect |
|----|-----------------|--------|
| `slow` | frost_nova | `statusMoveMul` reduces enemy move speed |
| `burn` | fireball, meteor | DoT ticks via `tickStatuses` in `Enemy.update` |
| `expose` | crescent pierce | extra armor pierce on subsequent hits |

API: `enemy.applyStatus(id, opts, game)` → pure merge in `skillCombat.applyStatus`.  
Presentation: trails / ground decals / hit-pulse tint — no buff bar required.

## VFX policy (current)

- **Prefer recipes** on skills: `recipeSpinStorm`, `recipeGroundWave`, `recipeLeapImpact`, `recipeStarBlade` / `recipeStarFinale`, `recipeFireOrb` / `recipeFireBlast`, `recipeIceNova`, `recipeBlinkBurst`, `recipeMeteorDrop` / `recipeMeteorFinale`
- **Primitives**: `burst`, `dust`, `slash`, `ring`, `pillar`, `trail`, `impact`, `swingArc`, plus `groundDecal`, `afterimage`, `verticalBeam`
- **Colors**: `getFxTheme(skill.theme)` — not scattered hex in handlers
- **Quality**: particle counts scaled via `scaleCount` / `Effects.setQuality` (wired from `Game.setQuality`)
- **Forbidden / disabled**: camera `shake`, simulation `hitStop`
- Hit feel: **VFX layers → particles → themed SFX → knockback → (last) weak lunge**

`impact(position, color, intensity, { direction })`  
`intensity`: `'light' | 'heavy' | 'critical' | 'finisher'`

## Enemy attacks

- `enemyMelee` / `enemyProjectile` / `enemyCharge` / `enemyLeap` / `enemyBossSpecial`
- Telegraphs: `#telegraphCircle`, `#lineTelegraph`
- AI branches: `Enemy.#combatAI` + `data.ai`

## Safely increasing only the juice

1. Prefer enriching an existing **recipe** (multi-layer) over raw particle spam
2. Keep pool budgets; raise pools only with quality LOD in mind
3. Do not re-enable camera / hit-stop

## Files to view alongside reach / weapon

- Weapon length scale: `js/characters/CharacterFactory.js` `WEAPON_LENGTH` / `WEAPON_GIRTH`
- Basic-attack range: `CombatSystem.#meleeAttack`

## Application: separate hit detection from visuals

| Layer | Changes | Does not change |
|-------|---------|-----------------|
| `WEAPON_LENGTH` | blade mesh length | hit range |
| melee range/arc | hit distance / width | blade mesh |
| `swingArc` / recipe size | slash size | damage |
| `SKILLS.combat` mult | damage | effect |

If the request is "blade looks long but misses", fix **range** first; if "hits but blade looks short", fix **WEAPON_*** first.

## Application: treat only the combo finisher specially

Where `finisher` flag branches:

- delay, range, arc, multiplier, knockback
- Extra VFX ring/pillar/burst
- `#damageEnemy` intensity `finisher`

When boosting only the finisher's presentation, do not touch early-combo multipliers.

## Application: multi-hit and invulnerable

`Enemy.takeDamage` `multiHit` option shortens hit-invulnerability (`0.045`).  
If a skill multi-hit "only lands once", check whether `multiHit` is missing.

## Related extension docs

- [content-data.md](./content-data.md) — `SKILLS` schema (`combat`, `theme`, `timeline`)
- [graphics-vfx.md](./graphics-vfx.md) — recipes, pools, quality
- [audio.md](./audio.md) — themed skill banks
- [characters-visual.md](./characters-visual.md) — clip names
- [extension-playbooks.md](./extension-playbooks.md) §3 skills, §5 tempo, §6 presentation
- [history/skill-motion-spectacle.md](./history/skill-motion-spectacle.md)
