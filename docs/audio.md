# Audio · Combat SFX

## Owner files

| File | Role |
|------|------|
| `js/core/AudioManager.js` | Web Audio context, mixer buses, procedural SFX, mute state |
| `js/entities/Player.js` | basic-attack swing timing |
| `js/systems/CombatSystem.js` | successful-hit timing and hit classification |
| `js/core/Game.js` | creates `AudioManager` |
| `js/ui/UI.js` | unlocks audio from title-screen user actions |
| `assets/manifests/assets.json` | optional local audio-sample registry |
| `server.mjs` | local-server MIME types for audio files |

## Current runtime model

`AudioManager` uses the browser Web Audio API. Audio is unavailable until a user starts or continues a game because browsers block autoplay. The title-screen buttons call `audio.unlock()` before gameplay begins.

The manager exposes these public SFX methods:

| Method | Trigger |
|--------|---------|
| `swing(combo)` | player attack starts |
| `hit(critical, finisher)` | an enemy receives positive damage |
| `hurt()` | player receives damage |
| `dash()` | dodge starts |
| `skill()` | player casts a skill |
| `pickup(rarity)` | potion, essence, or gear is collected |
| `boss()` / `levelUp()` / `legendary()` | major progression events |

Use `swing` for weapon motion and `hit` only after damage has landed. Do not play a contact sound for a miss, an invulnerable target, or zero damage.

## Combat timing

Basic attack flow:

```text
Input
  -> Player.tryAttack
  -> animation and swing sound
  -> CombatSystem.playerAttack at the hit frame
  -> enemy.takeDamage
  -> effects.impact + audio.hit on a successful hit
```

Keep the three presentation beats distinct:

1. Wind-up: optional soft cloth or stance movement sound.
2. Swing: weapon whoosh slightly before the contact frame.
3. Contact: impact sound exactly with a successful damage result.

When changing timing, do not alter `range`, `arc`, `multiplier`, or knockback merely to align sound. Those are gameplay values; adjust animation events or visual/audio delay instead.

## Adding local sample playback

Procedural Web Audio is appropriate for lightweight UI and fallback sounds. For richer combat feedback, add local audio samples.

1. Place files under `assets/audio/`. Prefer short mono OGG or WAV files with clear ownership or a compatible license.
2. Register paths in an `audio` section of `assets/manifests/assets.json`.
3. Add asynchronous fetch/decode and buffer caching in `AudioManager` after `unlock()` creates an `AudioContext`.
4. Play a sample through the existing `sfx` gain node, with the procedural sound kept as a fallback until the buffer is ready.
5. Add the corresponding MIME type to `server.mjs` when the format is not already listed.
6. Run `node tests/integrity.mjs` and verify each registered path through `node server.mjs`.

Do not add external runtime audio URLs or CDN dependencies. The game must remain self-contained.

## Mixing policy

- Keep `master`, `sfx`, and `ambient` as separate buses. Do not connect individual sounds directly to `context.destination`.
- Preserve the mute toggle by routing every new effect through `sfx` or `ambient`.
- Use 2–4 small variations with slight playback-rate variation for repeated swings and hits.
- Limit contact SFX for multi-target attacks. A cleave should have one clear primary impact, not one full-volume impact per enemy in the same frame.
- Reserve the loudest and brightest sounds for critical hits, finishers, bosses, and legendary drops.
- Avoid sustained, high-frequency noise that competes with UI notifications or ambient audio.

## Validation checklist

- First title-screen click unlocks audio without an autoplay error.
- A miss plays a swing but no contact sound.
- A normal hit, critical hit, and finisher are audibly distinct.
- Multi-target hits remain clear rather than clipping or stacking.
- Mute silences every SFX and ambient source.
- The game runs from `http://127.0.0.1:8080`; do not use `file://`.
