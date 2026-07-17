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
  brassfire: Object.freeze({
    id: 'brassfire',
    primary: 0xe87838,
    secondary: 0xffc078,
    core: 0xffe8c0,
    dust: 0xa86840,
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
  venom: Object.freeze({
    id: 'venom',
    primary: 0x5ff0c0,
    secondary: 0xb8ffe4,
    core: 0xeafff6,
    dust: 0x9ad8c0,
    accent: 0x2bd1b4,
  }),
  nightsteel: Object.freeze({
    id: 'nightsteel',
    primary: 0xa8c8d8,
    secondary: 0xe0f4fc,
    core: 0xffffff,
    dust: 0x8898a8,
    accent: 0x6aa8c8,
  }),
  shadow: Object.freeze({
    id: 'shadow',
    primary: 0x7a6cff,
    secondary: 0xc4b8ff,
    core: 0xf0eaff,
    dust: 0x554a78,
    accent: 0x4a3aa8,
  }),
  wrath: Object.freeze({
    id: 'wrath',
    primary: 0xff6a55,
    secondary: 0xffc9a0,
    core: 0xfff0d8,
    dust: 0xa05040,
    accent: 0xffb84d,
  }),
  hunt_amber: Object.freeze({
    id: 'hunt_amber',
    primary: 0xe8b060,
    secondary: 0xffe0a8,
    core: 0xfff6e0,
    dust: 0xb89060,
    accent: 0xd4a050,
  }),
  thorn: Object.freeze({
    id: 'thorn',
    primary: 0x6ab06a,
    secondary: 0xb8e0a8,
    core: 0xe8ffe0,
    dust: 0x6a8050,
    accent: 0x4a9048,
  }),
  windleaf: Object.freeze({
    id: 'windleaf',
    primary: 0x8fd0a0,
    secondary: 0xd8f4e0,
    core: 0xf0fff4,
    dust: 0xa0b898,
    accent: 0x70c090,
  }),
  hunt_gold: Object.freeze({
    id: 'hunt_gold',
    primary: 0xffd26b,
    secondary: 0xffeeb0,
    core: 0xfff8e0,
    dust: 0xc8a858,
    accent: 0xffc040,
  }),
});

export function getFxTheme(themeId) {
  return FX_THEMES[themeId] ?? FX_THEMES.windsteel;
}

/** Particle / count multiplier by render quality (prevents pool thrash on low). */
export function qualityParticleMul(quality = 'medium') {
  if (quality === 'low') return 0.55;
  if (quality === 'high') return 1;
  // Default session quality — keep skill spectacle readable without high-mode cost.
  return 0.9;
}

export function scaleCount(base, quality = 'medium', min = 1) {
  return Math.max(min, Math.round(base * qualityParticleMul(quality)));
}
