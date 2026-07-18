/**
 * Template-safe runtime tuning (game-content free).
 *
 * Like a C header of shared #defines for locomotion / animation playback.
 * Change scales here so CharacterAnimationController, harnesses, and tests
 * stay in lockstep. Do NOT put Sol skill/monster balance here — use config.js.
 *
 * Re-exported from packages/template-3d.
 */

/** Discrete locomotion bands + cross-fade / timeScale (world units ≈ m/s). */
export const LOCOMOTION_CONFIG = Object.freeze({
  /** Nominal run speed used as the reference for walk/run/sprint ratios. */
  referenceRunSpeed: 6.4,
  /** Absolute speed hysteresis between walk ↔ run (prevents chatter). */
  hysteresis: 0.12,
  /** Speed below this → idle. */
  idleMaxSpeed: 0.18,
  /** walk/run split as fraction of referenceRunSpeed. */
  walkRunSpeedRatio: 0.42,
  /** Sprint enters when speed > referenceRunSpeed * this (or options.sprint). */
  sprintSpeedRatio: 1.22,
  /** Nominal clip speed for timeScale: walk uses ref * this. */
  walkNominalRatio: 0.38,
  /** Nominal clip speed for timeScale: sprint uses ref * this. */
  sprintNominalRatio: 1.38,
  /** Locomotion timeScale clamp while moving. */
  timeScaleMin: 0.7,
  timeScaleMax: 1.65,
  /** Cross-fade seconds by band. */
  fadeIdle: 0.18,
  fadeWalk: 0.16,
  fadeRun: 0.12,
  /** Default cross-fade when not specified. */
  defaultFade: 0.14,
  /** One-shot default fade-out fraction of duration (capped). */
  oneShotFadeOutFrac: 0.25,
  oneShotFadeOutCap: 0.16,
  /** Minimum fade when cross-fading. */
  minFade: 0.01,
});

/** Distance-based animation update throttle (CharacterAnimationController.update). */
export const ANIM_LOD_CONFIG = Object.freeze({
  /** When not visible, update at this interval (seconds). */
  hiddenInterval: 0.18,
  /** Distance > this → interval mid. */
  farDistance: 34,
  farInterval: 0.10,
  /** Distance > this → interval near-far. */
  midDistance: 22,
  midInterval: 0.055,
});
/** Generic near-ground contact window and visual IK blend defaults. */
export const GROUNDING_CONFIG = Object.freeze({
  /** Foot-end target height above the sampled ground plane, in world units. */
  footOffset: 0.08,
  /** Only solve while the animated foot is inside this contact window. */
  maxCorrection: 0.16,
  /** Partial blend avoids snapping the authored leg pose on uneven terrain. */
  weight: 0.72,
});

/** Minimal AssetManager fallback mesh proportions (template-safe). */
export const ASSET_FALLBACK_CONFIG = Object.freeze({
  heroColor: 0xc4a484,
  enemyColor: 0x738a62,
  capsuleRadius: 0.28,
  capsuleHeight: 0.9,
  bodyY: 0.9,
  roughness: 0.75,
  metalness: 0.05,
  radialSegments: 4,
  heightSegments: 8,
});
