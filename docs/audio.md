# Audio · Combat SFX

## Owner files

| File | Role |
|------|------|
| `js/core/AudioManager.js` | Buses, sample banks, public SFX API |
| `tools/audio/generate-combat-sfx.mjs` | Offline procedural WAV generator |
| `assets/audio/combat/` | Baked mono WAV banks |
| `assets/manifests/assets.json` → `audio` | Sample registry |
| `js/entities/Player.js` | `swing` on attack start |
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

Buses: `sfx` → compressor → `master`, plus quiet `ambient` drone. Mute always through master.

Public API (unchanged call sites):

| Method | Trigger |
|--------|---------|
| `swing(combo)` | attack starts |
| `hit(critical, finisher)` | positive damage |
| `hurt` / `dash` / `skill` / `pickup` / `boss` / `levelUp` / `legendary` | other events |
| `click` | UI |

## Rebuild samples

```bash
node tools/audio/generate-combat-sfx.mjs
node tests/integrity.mjs
node server.mjs   # http://127.0.0.1:8080
```

No CDN / external runtime audio URLs. Samples are original procedural assets.

## Validation

- Title click unlocks without autoplay error.
- Miss: swing only.
- Normal / crit / finisher audibly distinct (depth, not pitch sparkle).
- Multi-target stays clear.
- Mute silences SFX + ambient.
