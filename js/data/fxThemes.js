/**
 * Combat FX color tokens — single source for skill presentation.
 * Handlers and recipes pull themes by id; avoid scattered hex literals.
 */
export const FX_THEMES = Object.freeze({
  windsteel: Object.freeze({
    id: 'windsteel',
    primary: 0x8feaff,
    secondary: 0xf4ffff,
    core: 0xffffff,
    dust: 0xd7dbc4,
    accent: 0x6ad4ff,
  }),
  starlight: Object.freeze({
    id: 'starlight',
    primary: 0xe2b7ff,
    secondary: 0xf3d6ff,
    core: 0xffffff,
    dust: 0xd8c8f0,
    accent: 0xb98cff,
  }),
  skyice: Object.freeze({
    id: 'skyice',
    primary: 0x9eeeff,
    secondary: 0xdaf9ff,
    core: 0xffffff,
    dust: 0xc8e8f0,
    accent: 0x8edfff,
  }),
  bladewave: Object.freeze({
    id: 'bladewave',
    primary: 0x8fd8ff,
    secondary: 0xc6f1ff,
    core: 0xe8fbff,
    dust: 0xd0e4f0,
    accent: 0x6ec8ff,
  }),
  ember: Object.freeze({
    id: 'ember',
    primary: 0xff7a42,
    secondary: 0xffb080,
    core: 0xffe0a0,
    dust: 0xc87840,
    accent: 0xff9a50,
  }),
  frost: Object.freeze({
    id: 'frost',
    primary: 0x7ad8ff,
    secondary: 0xd8f4ff,
    core: 0xffffff,
    dust: 0xb8d8e8,
    accent: 0xa8ecff,
  }),
  arcane: Object.freeze({
    id: 'arcane',
    primary: 0xb06dff,
    secondary: 0xe8d4ff,
    core: 0xd4b8ff,
    dust: 0xc8b0e0,
    accent: 0x9a5cff,
  }),
  meteor: Object.freeze({
    id: 'meteor',
    primary: 0xff6a3a,
    secondary: 0xffd0a0,
    core: 0xffe0c0,
    dust: 0xa05030,
    accent: 0xff9040,
  }),
});

export function getFxTheme(themeId) {
  return FX_THEMES[themeId] ?? FX_THEMES.windsteel;
}

/** Particle / count multiplier by render quality (prevents pool thrash on low). */
export function qualityParticleMul(quality = 'medium') {
  if (quality === 'low') return 0.45;
  if (quality === 'high') return 1;
  return 0.75;
}

export function scaleCount(base, quality = 'medium', min = 1) {
  return Math.max(min, Math.round(base * qualityParticleMul(quality)));
}
