/**
 * @sol/template-3d — physical package entry for template-candidate runtime modules.
 *
 * LOCKED ownership: docs/architecture-template-boundary.md §3
 * Must NOT re-export Sol content, combat rules, modes, Player/Enemy, or UI.
 *
 * Implementations currently live under js/ (single-repo). This package is the
 * stable import surface for future extraction (T3–T5).
 */

// Core
export {
  clamp, lerp, inverseLerp, smoothstep, rand, randInt, chance, pick, uid,
  weightedPick, seededRandom, hashNoise, valueNoise, fbm, formatTime,
  safeJsonParse, disposeObject,
} from '../../js/core/Utils.js';
export { Input } from '../../js/core/Input.js';
export {
  createGameContext,
  GAME_CONTEXT_KEYS,
  listGameContextKeys,
} from '../../js/core/GameContext.js';
export {
  LOCOMOTION_CONFIG,
  ANIM_LOD_CONFIG,
  ASSET_FALLBACK_CONFIG,
  GROUNDING_CONFIG,
} from '../../js/core/runtimeConstants.js';

// Assets
export { AssetManager } from '../../js/assets/AssetManager.js';
export {
  loadAssetManifest,
  modelUrl,
  animationMap,
} from '../../js/assets/AssetManifest.js';
export { TextureCache } from '../../js/assets/TextureCache.js';

// Render helpers
export { RenderPipeline, QUALITY_PRESETS } from '../../js/graphics/RenderPipeline.js';
export { LightingSystem } from '../../js/graphics/LightingSystem.js';
export { PostProcessSystem } from '../../js/graphics/PostProcessSystem.js';
export { OutlineSystem } from '../../js/graphics/OutlineSystem.js';

// Animation
export { CharacterAnimationController } from '../../js/characters/CharacterAnimationController.js';
export { SecondaryMotion } from '../../js/characters/SecondaryMotion.js';
export { TwoBoneIK } from '../../js/characters/TwoBoneIK.js';

/** Package identity for harnesses / diagnostics */
export const TEMPLATE_3D_PACKAGE_ID = '@sol/template-3d';
export const TEMPLATE_3D_VERSION = '0.1.0';
