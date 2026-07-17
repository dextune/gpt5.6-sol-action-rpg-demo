import * as THREE from 'three';

const DEFAULTS = Object.freeze({
  bands: 4,
  bandStrength: .26,
  wrap: .18,
  shadowTint: new THREE.Color(0x273a45),
  rimColor: new THREE.Color(0xb9dce2),
  rimStrength: .055,
});

function normalizeColor(value, fallback) {
  if (value?.isColor) return value.clone();
  return new THREE.Color(value ?? fallback);
}

export class StylizedMaterial extends THREE.MeshStandardMaterial {
  constructor(parameters = {}, style = {}) {
    super(parameters);
    // Keep the built-in type so Three.js resolves MeshStandardMaterial shader uniforms.
    this.userData.materialClass = 'StylizedMaterial';
    this.isStylizedMaterial = true;
    this.style = {
      bands: style.bands ?? DEFAULTS.bands,
      bandStrength: style.bandStrength ?? DEFAULTS.bandStrength,
      wrap: style.wrap ?? DEFAULTS.wrap,
      shadowTint: normalizeColor(style.shadowTint, DEFAULTS.shadowTint),
      rimColor: normalizeColor(style.rimColor, DEFAULTS.rimColor),
      rimStrength: style.rimStrength ?? DEFAULTS.rimStrength,
    };
    this.userData.hitPulse = 0;
    this.onBeforeCompile = shader => {
      shader.uniforms.uStyleBands = { value: this.style.bands };
      shader.uniforms.uStyleBandStrength = { value: this.style.bandStrength };
      shader.uniforms.uStyleWrap = { value: this.style.wrap };
      shader.uniforms.uStyleShadowTint = { value: this.style.shadowTint };
      shader.uniforms.uStyleRimColor = { value: this.style.rimColor };
      shader.uniforms.uStyleRimStrength = { value: this.style.rimStrength };
      shader.uniforms.uStyleHitPulse = { value: this.userData.hitPulse };
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform float uStyleBands;
        uniform float uStyleBandStrength;
        uniform float uStyleWrap;
        uniform vec3 uStyleShadowTint;
        uniform vec3 uStyleRimColor;
        uniform float uStyleRimStrength;
        uniform float uStyleHitPulse;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
        float styleLuma = max(0.0001, dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)));
        float styleWrapped = clamp(styleLuma * (1.0 - uStyleWrap) + uStyleWrap, 0.0, 4.0);
        float styleBand = floor(styleWrapped * uStyleBands + 0.5) / max(1.0, uStyleBands);
        styleBand = smoothstep(styleBand - 0.11, styleBand + 0.11, styleWrapped);
        float styleTarget = mix(styleWrapped, styleBand, uStyleBandStrength);
        outgoingLight *= styleTarget / max(styleWrapped, 0.045);
        float styleShadow = 1.0 - smoothstep(0.12, 0.52, styleLuma);
        outgoingLight = mix(outgoingLight, outgoingLight * 0.70 + uStyleShadowTint * 0.30, styleShadow * 0.18);
        float styleRim = pow(1.0 - saturate(dot(normal, geometryViewDir)), 3.2) * uStyleRimStrength;
        outgoingLight += uStyleRimColor * styleRim;
        outgoingLight = mix(outgoingLight, vec3(1.0, 0.34, 0.18), clamp(uStyleHitPulse, 0.0, 1.0) * 0.38);
        #include <opaque_fragment>`,
      );
      this.userData.shader = shader;
    };
    this.customProgramCacheKey = () => `sol-arpg-stylized-v4-${this.style.bands}`;
  }

  setHitPulse(value) {
    this.userData.hitPulse = THREE.MathUtils.clamp(value, 0, 1);
    if (this.userData.shader) this.userData.shader.uniforms.uStyleHitPulse.value = this.userData.hitPulse;
  }
}

const ROLE_STYLES = Object.freeze({
  skin: { roughness: .68, metalness: 0, shadowTint: 0x5b4240, rimStrength: .045 },
  cloth: { roughness: .9, metalness: 0, shadowTint: 0x263b48, rimStrength: .035 },
  cape: { roughness: .88, metalness: 0, shadowTint: 0x2a1820, rimStrength: .04 },
  leather: { roughness: .72, metalness: .02, shadowTint: 0x372c29, rimStrength: .035 },
  hair: { roughness: .48, metalness: 0, shadowTint: 0x1d2b3b, rimStrength: .06 },
  metal: { roughness: .32, metalness: .78, shadowTint: 0x394047, rimStrength: .085 },
  eye: { roughness: .28, metalness: 0, bandStrength: .12, rimStrength: .04 },
  eye_white: { roughness: .45, metalness: 0, bandStrength: .08, rimStrength: .02 },
  leaf: { roughness: .86, metalness: 0, shadowTint: 0x28442f, rimStrength: .025 },
  bark: { roughness: .94, metalness: 0, shadowTint: 0x49372d, rimStrength: 0 },
  stone: { roughness: .9, metalness: .01, shadowTint: 0x454740, rimStrength: 0 },
  spirit: { roughness: .28, metalness: .02, bandStrength: .18, rimStrength: .12 },
  default: { roughness: .78, metalness: 0, shadowTint: 0x2c3b41, rimStrength: .035 },
});

export function inferMaterialRole(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('skin')) return 'skin';
  // Cape is its own role so palette can restore crimson (not cloth steel).
  if (lower.includes('cape') || lower.includes('plume')) return 'cape';
  if (lower.includes('cloth')) return 'cloth';
  if (lower.includes('leather') || lower.includes('belt') || lower.includes('boot') || lower.includes('glove')) return 'leather';
  if (lower.includes('hair') || lower.includes('brow') || lower.includes('mouth')) return 'hair';
  if (lower.includes('metal') || lower.includes('trim') || lower.includes('buckle') || lower.includes('blade') || lower.includes('guard') || lower.includes('rune')) return 'metal';
  // eye_white / glint must not inherit pupil emissive eye role.
  if (lower.includes('eye_white') || lower.includes('glint') || lower.includes('eye-white')) return 'eye_white';
  if (lower.includes('eye')) return 'eye';
  if (lower.includes('leaf') || lower.includes('moss') || lower.includes('blossom')) return 'leaf';
  if (lower.includes('bark') || lower.includes('trunk')) return 'bark';
  if (lower.includes('stone') || lower.includes('rock') || lower.includes('ruin') || lower.includes('well')) return 'stone';
  if (lower.includes('wisp') || lower.includes('glow') || lower.includes('spirit')) return 'spirit';
  return 'default';
}

export function convertToStylized(source, options = {}) {
  const role = options.role ?? inferMaterialRole(source?.name ?? '');
  const style = { ...ROLE_STYLES[role], ...(options.style ?? {}) };
  const material = new StylizedMaterial({
    name: source?.name ?? `stylized_${role}`,
    color: source?.color?.clone?.() ?? new THREE.Color(options.color ?? 0xffffff),
    emissive: source?.emissive?.clone?.() ?? new THREE.Color(0x000000),
    emissiveIntensity: source?.emissiveIntensity ?? 0,
    roughness: options.roughness ?? style.roughness,
    metalness: options.metalness ?? style.metalness,
    transparent: source?.transparent ?? false,
    opacity: source?.opacity ?? 1,
    alphaTest: source?.alphaTest ?? 0,
    side: source?.side ?? THREE.FrontSide,
    depthWrite: source?.depthWrite ?? true,
    depthTest: source?.depthTest ?? true,
    vertexColors: source?.vertexColors ?? false,
  }, style);
  material.userData.materialRole = role;
  material.userData.baseColor = material.color.clone();
  material.userData.baseEmissive = material.emissive.clone();
  material.userData.baseEmissiveIntensity = material.emissiveIntensity;
  return material;
}

export function setMaterialHitPulse(root, value) {
  root?.traverse?.(object => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.setHitPulse?.(value);
  });
}
