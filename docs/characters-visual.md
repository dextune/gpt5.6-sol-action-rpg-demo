# Character · Weapon visuals

## Hero

| Stage | File |
|-------|------|
| Creation | `js/characters/CharacterFactory.js` → `createHero` |
| GLB key | `hero.aerin` (`assets/manifests/assets.json`) |
| Fallback mesh | `js/graphics/ModelFactory.js` → `createHeroModel` |
| Animation | `CharacterAnimationController` + GLB clips |
| Instance | `Player` calls factory on creation |

### Current visual direction

- **Shonen/anime tone** palette (`ANIME` constants): orange jacket, navy pants, blonde spikes, forehead protector
- Keep GLB + enhance cel-shading materials + attach hair mesh
- PBR maps(`map/normal/roughness/ao`) disabled → flat color priority

### Color/style editing

`CharacterFactory.js` top:

```js
const ANIME = { skin, cloth, clothDark, leather, hair, hairDark, metal, eye, outline }
```

Adjust cel strength via `convertToStylized`'s `bandStrength` / `bands`.

### Hair/headband

`attachAnimeHair(group)` — finds head bone/mesh and attaches spikes + band.  
If head position is off, extend the `findHeadAnchor` name list.

## Weapons

| Item | Location |
|------|----------|
| Equip | `CharacterFactory.equipWeapon` |
| Length multiplier | `WEAPON_LENGTH` (Y scale) |
| Girth multiplier | `WEAPON_GIRTH` (X/Z scale) |
| Model type | item.model → `weapon.sword` etc. in manifest |
| Starting weapon | `Player.js` `starterBlade()` |

Current starting weapon: **Swift Field Blade** (`model: 'katana'`).  
Length reduced to **~70%** after overscale, cross-section adjusted to be **thicker**.

Fallback blade mesh dimensions: `ModelFactory.createHeroModel`'s blade BoxGeometry.

## Monsters

| File | Role |
|------|------|
| `MonsterFactory.js` | `shape` → archetype GLB key, elite/boss tint |
| `ModelFactory.js` | per-shape procedural fallback mesh |
| `content.js` | color/accent/scale/ai |

Putting a shape without a `SHAPE_ARCHETYPE` mapping into content may cause fallback/errors.  
The integrity test checks the body shape list.

## Animation clip names (hero)

Manifest `animationMap`:

`idle`, `run`, `sprint`, `attack_1`–`attack_4`, `dodge`, `hit`, `death`,  
`skill_whirlwind`, `skill_crescent`, `skill_skyfall`, `skill_starburst`

On `playOneShot` failure, fallback to idle. When adding a new animation, keep the map + Player/Combat call names in sync.

## Outlines

`OutlineSystem` + post OutlinePass may be disabled in quality settings.  
Silhouette color: `CharacterFactory` outlines.configure `color`.

## Application: match weapon types to presentation

| model | Presentation hint | Scale key |
|-------|-------------------|-----------|
| katana | Looks long and slender, but current setting compensates thicker | WEAPON_* |
| greatsword | Pairs with slow finisher presentation | multiplier[3] together |
| saber | Fast combos | Short attackCooldown |

Hit detection `range` is independent of the mesh → after changing weapon visuals, "looks like it hits but doesn't / vice versa" is a common issue.

## Application: GLB vs fallback switching

- On successful GLB load, skeletal animation is kept (recommended)
- Fallback `createHeroModel` has no animation clips → close to fixed idle
- To use fully custom procedural hero only, force preload failure or bypass clone path (invasive)

## Application: monster elite/boss look

`MonsterFactory` applies accent emissive, scale, and aura mesh for elite/boss.  
Overlapping content `scale` and factory boss scale may cause oversized meshes.
