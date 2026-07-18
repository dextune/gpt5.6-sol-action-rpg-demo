/**
 * Data-driven expectations for the hero/weapon static asset contract.
 *
 * This file holds only *data* (class/weapon identity mapping, required node
 * and clip names, numeric bounds) plus small manifest-resolution helpers.
 * The actual GLB parsing/validation engine lives in
 * `tools/assets/validate-hero-assets.mjs`; this module has no fs/GLB logic
 * so it can be imported by both the validator CLI and the test suite
 * without any binary parsing dependency.
 *
 * Scope note: schema-v2 hero outputs are now the shipping baseline. The static
 * contract therefore requires the full gameplay-facing socket/marker set used
 * by runtime layering, support-hand IK, foot grounding, and look diagnostics.
 * Legacy aliases remain accepted only for the stable primary weapon socket.
 */

export const HERO_CLASS_IDS = Object.freeze(['aerin', 'wizard', 'rogue', 'ranger', 'gunner']);
export const HERO_SCHEMA_VERSION = 2;
export const HERO_RIG_ID = 'sol_humanoid_v2';
export const HERO_REQUIRED_V2_NODES = Object.freeze([
  'weapon_socket_r',
  'weapon_socket_l',
  'hand_ik_r',
  'hand_ik_l',
  'foot_contact_r',
  'foot_contact_l',
  'head_look_target',
]);
export const HERO_CLASS_MARKERS = Object.freeze({
  aerin: 'knight_helm',
  wizard: 'wizard_hat',
  rogue: 'rogue_authored_hood',
  ranger: 'ranger_quiver',
  gunner: 'gunner_powered_cuirass',
});

/** Starter weapon kind per class (js/data/content.js HERO_CLASSES[*].starterWeapon → WEAPON_BASES[*].model). */
export const CLASS_WEAPON_KIND = Object.freeze({
  aerin: 'sword',
  wizard: 'staff',
  rogue: 'dagger',
  ranger: 'bow',
  gunner: 'rifle',
});

/** Per-weapon-kind socket/geometry requirements. */
export const WEAPON_KIND_INFO = Object.freeze({
  sword: Object.freeze({ requiresMuzzle: false, requiresGripSupport: false }),
  saber: Object.freeze({ requiresMuzzle: false, requiresGripSupport: false }),
  greatsword: Object.freeze({ requiresMuzzle: false, requiresGripSupport: false }),
  leaf: Object.freeze({ requiresMuzzle: false, requiresGripSupport: false }),
  relic: Object.freeze({ requiresMuzzle: false, requiresGripSupport: false }),
  katana: Object.freeze({ requiresMuzzle: false, requiresGripSupport: false }),
  dagger: Object.freeze({ requiresMuzzle: false, requiresGripSupport: false }),
  staff: Object.freeze({ requiresMuzzle: false, requiresGripSupport: false }),
  bow: Object.freeze({ requiresMuzzle: false, requiresGripSupport: false }),
  // Appendix C failure-injection item 4: "Rifle lacks grip_support or muzzle_socket."
  rifle: Object.freeze({ requiresMuzzle: true, requiresGripSupport: true }),
});

/** Placeholder/fallback tokens that must never appear as shipping identity metadata. */
export const FORBIDDEN_IDENTITY_TOKENS = Object.freeze(['fallback', 'placeholder', 'generic', 'unknown', 'proxy', 'test']);

/** Clips every hero LOD0 must ship with non-empty tracks (subset shared across all five classes). */
export const SHARED_REQUIRED_CLIPS = Object.freeze([
  'idle', 'walk', 'run', 'sprint',
  'locomotion_start', 'locomotion_stop', 'pivot_left', 'pivot_right', 'pivot_180',
  'aim_idle_add', 'breath_add', 'recoil_add', 'hit_add',
  'dodge', 'hit', 'hit_light', 'hit_heavy', 'death',
]);

/** Node-name aliases accepted for each required hero socket (v1 legacy name kept as compatibility alias). */
export const HERO_SOCKET_ALIASES = Object.freeze({
  weaponSocket: Object.freeze(['weapon_socket_r', 'weapon_socket']),
});

/** Node-name aliases accepted for each required weapon socket/anchor. */
export const WEAPON_SOCKET_ALIASES = Object.freeze({
  grip: Object.freeze(['grip_main', 'grip_anchor']),
  bladeBase: Object.freeze(['blade_base']),
  bladeTip: Object.freeze(['blade_tip']),
  muzzle: Object.freeze(['muzzle_socket']),
  gripSupport: Object.freeze(['grip_support']),
});

/** Material role tag that is allowed to legitimately use alpha-blend / low opacity. */
export const APPROVED_ALPHA_ROLE = 'approved_alpha';

/** Skin weight tolerance: |sum(weights) - 1| must stay within this. */
export const SKIN_WEIGHT_SUM_TOLERANCE = 0.02;

/**
 * Bounds/ratio guardrails. Ranges are generous multiples of the values
 * measured from the current committed GLBs (see docs/plan §15.5 stats table)
 * so legitimate authored variance passes while a wildly wrong-scale asset
 * (double-baked, unit mismatch, degenerate mesh) fails loudly.
 */
export const BOUNDS = Object.freeze({
  heroHeight: Object.freeze({ min: 0.8, max: 8 }),
  heroTrianglesMaxByLod: Object.freeze([70000, 30000, 12000]),
  weaponRatio: Object.freeze({
    sword: Object.freeze([0.08, 1.2]),
    saber: Object.freeze([0.08, 1.2]),
    greatsword: Object.freeze([0.08, 1.4]),
    leaf: Object.freeze([0.08, 1.2]),
    relic: Object.freeze([0.05, 1.0]),
    katana: Object.freeze([0.08, 1.2]),
    dagger: Object.freeze([0.03, 0.8]),
    staff: Object.freeze([0.1, 1.6]),
    bow: Object.freeze([0.08, 1.5]),
    rifle: Object.freeze([0.05, 1.4]),
  }),
});

/**
 * Resolve the manifest-registered GLB paths for a hero class and its
 * starter weapon kind. Returns absolute-relative (`./assets/...`) URLs as
 * stored in the manifest, unresolved to a filesystem path — callers decide
 * how to turn that into bytes.
 */
export function resolveManifestEntry(manifest, classId) {
  const weaponKind = CLASS_WEAPON_KIND[classId];
  if (!weaponKind) throw new Error(`unknown hero class id: ${classId}`);
  const heroEntry = manifest?.models?.[`hero.${classId}`];
  const weaponEntry = manifest?.models?.[`weapon.${weaponKind}`];
  if (!heroEntry) throw new Error(`manifest missing models["hero.${classId}"]`);
  if (!weaponEntry) throw new Error(`manifest missing models["weapon.${weaponKind}"]`);
  const lods = heroEntry.lods ?? {};
  return {
    classId,
    weaponKind,
    heroLodUrls: Object.freeze({
      high: lods.high ?? heroEntry.url,
      medium: lods.medium ?? heroEntry.url,
      low: lods.low ?? heroEntry.url,
    }),
    weaponUrl: weaponEntry.url,
  };
}
