# Audio · Combat SFX

## Owner files

| File | Role |
|------|------|
| `js/core/AudioManager.js` | Buses, sample banks, public SFX API |
| `tools/audio/generate-combat-sfx.mjs` | Offline procedural WAV generator |
| `assets/audio/combat/` | Baked mono WAV banks |
| `assets/manifests/assets.json` → `audio` | Sample registry |
| `js/entities/Player.js` | profile-aware **`basicAttack(kind, combo)`**; **`skill(sfx)`** on cast |
| `js/systems/CombatSystem.js` | `hit` on successful damage |
| `js/core/Game.js` | creates `AudioManager` |
| `js/ui/UI.js` | unlock on title actions |
| `server.mjs` | audio MIME types |

## Design (research-backed, game-tuned)

Combat feedback follows common action-game layering practice:

1. **Swing** (attack start) — air whoosh only. Misses still whoosh; no contact.
2. **Impact** (damage only) — mid-low dull thud. No metal ring, no chord/chime.
3. **Weight scale** — combo / finisher / crit get longer, lower body energy.
4. **HMLS stack** inside baked samples: Low body · Mid punch · soft High grit · Style enhancer.
5. **Variation** — multi-sample banks + slight playback-rate jitter.
6. **Multi-hit** — within ~36 ms only soft secondary ticks (cleave / skills).
7. **Skill identity** — themed banks so blade / fire / ice / arcane / rifle read differently.

Buses: `sfx` → compressor → `master`, plus quiet `ambient` drone. Mute always through master.

## Public API

| Method | Trigger |
|--------|---------|
| `basicAttack(kind, combo)` | class-profile attack; rifle uses its own crack bank, other profiles keep `swing` |
| `swing(combo)` | attack starts |
| `hit(critical, finisher)` | positive damage |
| `skill(themeOrKey)` | skill cast — resolves themed bank with fallbacks |
| `hurt` / `dash` / `pickup` / `boss` / `levelUp` / `legendary` | other events |
| `click` | UI |

### Themed skill banks

| Bank key | Use / content `sfx` | Also resolves from `theme` |
|----------|---------------------|----------------------------|
| `skill` | generic fallback | — |
| `skill_blade` | knight cuts (whirlwind, crescent) | windsteel, bladewave |
| `skill_leap` | skyfall land weight | skyice |
| `skill_star` | starburst | starlight |
| `skill_fire` | fireball, meteor | ember, meteor |
| `skill_ice` | frost nova | frost |
| `skill_arcane` | arcane blink | arcane |
| `skill_bow` / `skill_trap` | Ranger shot and trap skills | — |
| `skill_dagger` | Rogue dagger skills | — |
| `skill_rifle` | Gunner rifle skills | rifle |

`Player.trySkill` calls `audio.skill(skill.sfx ?? skill.theme ?? 'skill')`.  
Missing samples fall back to `skill` bank, then procedural tones.

Manifest entries live under `assets/manifests/assets.json` → `audio`.  
WAV files: `assets/audio/combat/skill_*_0.wav` (generated).

## Rebuild samples

```bash
node tools/audio/generate-combat-sfx.mjs
node tests/integrity.mjs
node server.mjs   # http://127.0.0.1:8777
```

Generator includes themed synths: `synthSkillTheme(seed, 'blade'|'fire'|'ice'|'rifle'|…)` and the `rifle_0`–`rifle_3` basic-attack bank.
No CDN / external runtime audio URLs.

## Adding SFX for a new skill

1. Pick or add a bank id (`skill_*`)
2. Generate WAV in `tools/audio/generate-combat-sfx.mjs` + register in `assets.json`
3. Set `SKILLS[id].sfx` (and matching `theme` if useful)
4. Keep player-facing silence-safe: procedural fallback already in `AudioManager.skill`

## Validation

- Title click unlocks without autoplay error.
- Miss: swing only.
- Normal / crit / finisher audibly distinct (depth, not pitch sparkle).
- Multi-target stays clear.
- Different skill themes are audible (blade vs fire vs ice vs arcane).
- Mute silences SFX + ambient.
