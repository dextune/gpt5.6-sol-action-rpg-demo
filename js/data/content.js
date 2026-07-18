export const ZONES = Object.freeze({
  verdant: {
    id: 'verdant', name: 'Emerald Meadow', subtitle: 'A hunting ground where the wind rests', center: [0, 0], radius: 64,
    minLevel: 1, maxLevel: 14, ground: 0x62a85f, dark: 0x315f3d, accent: 0xa8e36f,
    fog: 0xb9d8bd, sky: 0x88cbd0, detail: 'grass', particle: 0xb8ff9c,
  },
  forest: {
    id: 'forest', name: 'Whispering Grove', subtitle: 'Realm of shade and thorns', center: [-91, -24], radius: 58,
    minLevel: 8, maxLevel: 24, ground: 0x356e48, dark: 0x193c30, accent: 0x69d57d,
    fog: 0x8fb9a4, sky: 0x72a9a2, detail: 'forest', particle: 0x92ffc0,
  },
  canyon: {
    id: 'canyon', name: 'Sunscar Canyon', subtitle: 'Scorching winds of the red rocks', center: [93, 14], radius: 58,
    minLevel: 15, maxLevel: 32, ground: 0xb77c47, dark: 0x6d402c, accent: 0xffca69,
    fog: 0xd9b181, sky: 0xe0a871, detail: 'canyon', particle: 0xffd084,
  },
  frost: {
    id: 'frost', name: 'Frostcrown Plateau', subtitle: 'Snowfield where ice sings', center: [-28, -103], radius: 58,
    minLevel: 24, maxLevel: 44, ground: 0x83b8bd, dark: 0x496f80, accent: 0xd3f6ff,
    fog: 0xc6e1e7, sky: 0x8ab9d4, detail: 'frost', particle: 0xe8fbff,
  },
  ember: {
    id: 'ember', name: 'Ember Wilds', subtitle: 'Wasteland where lava veins breathe', center: [25, 105], radius: 59,
    minLevel: 34, maxLevel: 58, ground: 0x754438, dark: 0x3c2427, accent: 0xff8050,
    fog: 0xb36c58, sky: 0x8f5e60, detail: 'ember', particle: 0xff8a4d,
  },
  astral: {
    id: 'astral', name: 'Starfall Ruins', subtitle: 'Forbidden zone where void crystals rise', center: [103, -94], radius: 56,
    minLevel: 48, maxLevel: 78, ground: 0x5b5387, dark: 0x2d294f, accent: 0xc59aff,
    fog: 0x8e86ba, sky: 0x645f9b, detail: 'astral', particle: 0xd4b1ff,
  },
});


export const ENEMY_ROLES = Object.freeze([
  'fodder_swarm', 'frontline', 'bruiser', 'rusher', 'skirmisher',
  'glass_ranged', 'artillery', 'controller', 'support', 'mini_boss', 'zone_boss',
]);

const enemy = (id, name, zone, shape, level, hp, damage, defense, speed, range, xp, options = {}) => ({
  id, name, zone, shape, level, hp, damage, defense, speed, range, xp,
  gold: options.gold ?? [Math.max(1, Math.round(level * 0.8)), Math.max(3, Math.round(level * 1.5))],
  color: options.color ?? 0x82b876,
  accent: options.accent ?? 0xf5f0c8,
  eye: options.eye ?? 0x15202c,
  ai: options.ai ?? 'melee',
  scale: options.scale ?? 1,
  weight: options.weight ?? 1,
  ranged: ['ranged', 'caster', 'skirmish'].includes(options.ai),
  boss: Boolean(options.boss),
  eliteOnly: Boolean(options.eliteOnly),
  special: options.special ?? null,
  phase2Hp: options.phase2Hp ?? null,
  dropBias: options.dropBias ?? null,
  role: options.role ?? (options.boss ? 'zone_boss' : 'bruiser'),
  family: options.family ?? null,
  tags: Object.freeze(options.tags ?? []),
  eliteWeight: options.eliteWeight ?? 1,
  defenseWeight: options.defenseWeight ?? 1,
  miniBoss: Boolean(options.miniBoss),
});

/** Elite champion affixes — weights used by EnemySystem.rollEliteAffix. */
export const ELITE_AFFIXES = Object.freeze([
  Object.freeze({ id: 'shielded', label: 'Shielded', weight: 1 }),
  Object.freeze({ id: 'enraged', label: 'Enraged', weight: 1 }),
  Object.freeze({ id: 'volatile', label: 'Volatile', weight: 1 }),
  Object.freeze({ id: 'hasted', label: 'Hasted', weight: 0.9 }),
  Object.freeze({ id: 'fortified', label: 'Fortified', weight: 0.85 }),
  Object.freeze({ id: 'arcane', label: 'Arcane', weight: 0.75 }),
  Object.freeze({ id: 'frostbitten', label: 'Frostbitten', weight: 0.55, zones: Object.freeze(['frost', 'astral']) }),
  Object.freeze({ id: 'molten', label: 'Molten', weight: 0.55, zones: Object.freeze(['ember', 'canyon']) }),
  Object.freeze({ id: 'vampiric', label: 'Vampiric', weight: 0.5 }),
  Object.freeze({ id: 'summoning', label: 'Summoning', weight: 0.4 }),
]);

/**
 * Defense hybrid recipes by wave band (role fractions sum ~1).
 * Milestone waves use fixed recipes; other waves use band procedural fill.
 */
export const DEFENSE_WAVE_ROLE_RECIPES = Object.freeze({
  tutorial: Object.freeze([ // waves 1–3
    Object.freeze({ role: 'fodder_swarm', frac: 0.55 }),
    Object.freeze({ role: 'skirmisher', frac: 0.25 }),
    Object.freeze({ role: 'bruiser', frac: 0.2 }),
  ]),
  mixed: Object.freeze([ // 4–6
    Object.freeze({ role: 'fodder_swarm', frac: 0.45 }),
    Object.freeze({ role: 'bruiser', frac: 0.25 }),
    Object.freeze({ role: 'glass_ranged', frac: 0.15 }),
    Object.freeze({ role: 'frontline', frac: 0.15 }),
  ]),
  backline: Object.freeze([ // 7–9
    Object.freeze({ role: 'fodder_swarm', frac: 0.35 }),
    Object.freeze({ role: 'frontline', frac: 0.2 }),
    Object.freeze({ role: 'glass_ranged', frac: 0.25 }),
    Object.freeze({ role: 'rusher', frac: 0.2 }),
  ]),
  artillery: Object.freeze([ // 10–12
    Object.freeze({ role: 'fodder_swarm', frac: 0.3 }),
    Object.freeze({ role: 'frontline', frac: 0.2 }),
    Object.freeze({ role: 'artillery', frac: 0.2 }),
    Object.freeze({ role: 'glass_ranged', frac: 0.15 }),
    Object.freeze({ role: 'rusher', frac: 0.15 }),
  ]),
  support: Object.freeze([ // 13–15
    Object.freeze({ role: 'fodder_swarm', frac: 0.3 }),
    Object.freeze({ role: 'frontline', frac: 0.22 }),
    Object.freeze({ role: 'glass_ranged', frac: 0.2 }),
    Object.freeze({ role: 'support', frac: 0.12 }),
    Object.freeze({ role: 'controller', frac: 0.08 }),
    Object.freeze({ role: 'bruiser', frac: 0.08 }),
  ]),
  chaos: Object.freeze([ // 16+
    Object.freeze({ role: 'fodder_swarm', frac: 0.28 }),
    Object.freeze({ role: 'bruiser', frac: 0.14 }),
    Object.freeze({ role: 'frontline', frac: 0.14 }),
    Object.freeze({ role: 'rusher', frac: 0.12 }),
    Object.freeze({ role: 'glass_ranged', frac: 0.12 }),
    Object.freeze({ role: 'artillery', frac: 0.1 }),
    Object.freeze({ role: 'controller', frac: 0.05 }),
    Object.freeze({ role: 'support', frac: 0.05 }),
  ]),
});

export function defenseRecipeForWave(wave) {
  const w = Math.max(1, wave | 0);
  if (w <= 3) return DEFENSE_WAVE_ROLE_RECIPES.tutorial;
  if (w <= 6) return DEFENSE_WAVE_ROLE_RECIPES.mixed;
  if (w <= 9) return DEFENSE_WAVE_ROLE_RECIPES.backline;
  if (w <= 12) return DEFENSE_WAVE_ROLE_RECIPES.artillery;
  if (w <= 15) return DEFENSE_WAVE_ROLE_RECIPES.support;
  return DEFENSE_WAVE_ROLE_RECIPES.chaos;
}

export function enemiesByZoneRole(zoneId, role) {
  return Object.values(ENEMY_TYPES).filter(
    e => e.zone === zoneId && !e.boss && e.role === role,
  );
}

export const ENEMY_TYPES = Object.freeze({
  dew_blob: enemy('dew_blob', 'Dewdrop Jelly', 'verdant', 'blob', 1, 42, 7, 0, 2.7, 1.45, 16, { color: 0x63d58b, accent: 0xb8ffd3, ai: 'swarm', weight: 1.35, role: 'fodder_swarm', family: 'verdant_slime', scale: 1 }),
  horn_hopper: enemy('horn_hopper', 'Hornbloom Hopper', 'verdant', 'hare', 2, 54, 8, 1, 4.5, 1.4, 20, { color: 0xc5c77a, accent: 0xf2efb2, ai: 'skirmish', weight: 1.15, role: 'skirmisher', family: 'verdant_fauna' }),
  brush_boar: enemy('brush_boar', 'Brush Boar', 'verdant', 'boar', 3, 82, 11, 2, 3.8, 1.7, 29, { color: 0x7c7d4e, accent: 0xdac991, ai: 'charge', weight: 1.05, role: 'bruiser', family: 'verdant_fauna' }),
  pollen_wisp: enemy('pollen_wisp', 'Pollen Wisp', 'verdant', 'wisp', 4, 58, 12, 1, 3.1, 8.5, 31, { color: 0xffdb74, accent: 0xfff6b7, ai: 'ranged', weight: 0.95, role: 'glass_ranged', family: 'verdant_spirit' }),
  leaf_raider: enemy('leaf_raider', 'Leafmask Raider', 'verdant', 'raider', 5, 105, 14, 3, 3.4, 1.8, 39, { color: 0x55955b, accent: 0xe7d07d, ai: 'melee', weight: 0.85, role: 'bruiser', family: 'verdant_humanoid' }),
  shellback: enemy('shellback', 'Bronzeshell', 'verdant', 'beetle', 7, 148, 17, 7, 2.8, 1.65, 54, { color: 0x607c4b, accent: 0xb7db6f, ai: 'tank', weight: 0.65, role: 'frontline', family: 'verdant_chitin' }),
  seed_mite: enemy('seed_mite', 'Seed Mite', 'verdant', 'beetle', 1, 28, 5, 0, 3.1, 1.2, 10, { color: 0x6a5a38, accent: 0xc9a86a, ai: 'swarm', weight: 1.5, role: 'fodder_swarm', family: 'verdant_chitin', scale: 0.52 }),
  clover_sprite: enemy('clover_sprite', 'Clover Sprite', 'verdant', 'wisp', 3, 48, 9, 1, 3.0, 7.8, 22, { color: 0x7ed99a, accent: 0xe8fff0, ai: 'ranged', weight: 0.9, role: 'controller', family: 'verdant_spirit', scale: 0.85, special: 'slow_bolt' }),
  meadow_buck: enemy('meadow_buck', 'Meadow Buck', 'verdant', 'stag', 4, 70, 12, 2, 4.8, 1.65, 28, { color: 0xb8a86a, accent: 0xf0e6b0, ai: 'charge', weight: 1.05, role: 'rusher', family: 'verdant_fauna', scale: 0.85 }),
  vine_sniper: enemy('vine_sniper', 'Vinebow Scout', 'verdant', 'raider', 6, 72, 16, 2, 3.2, 9.2, 36, { color: 0x3d7a4a, accent: 0xa8e070, ai: 'ranged', weight: 0.88, role: 'glass_ranged', family: 'verdant_humanoid', scale: 0.95 }),
  hive_tender: enemy('hive_tender', 'Hive Tender', 'verdant', 'beetle', 5, 95, 9, 4, 2.9, 1.7, 34, { color: 0xd4a84a, accent: 0xffe08a, ai: 'skirmish', weight: 0.6, role: 'support', family: 'verdant_chitin', scale: 1.05, special: 'aura_armor' }),
  thorn_toad: enemy('thorn_toad', 'Thorn Toad', 'verdant', 'toad', 6, 160, 11, 8, 2.2, 1.55, 48, { color: 0x4a7a40, accent: 0x9ccc6a, ai: 'tank', weight: 0.62, role: 'frontline', family: 'verdant_slime', scale: 1.18 }),
  snapjaw_bloom: enemy('snapjaw_bloom', 'Snapjaw Bloom', 'verdant', 'flytrap', 4, 96, 13, 3, 3.15, 1.8, 35, { color: 0x4d9f58, accent: 0xe87c72, ai: 'charge', weight: 0.82, role: 'rusher', family: 'verdant_flora', tags: ['carnivorous', 'snap_jaw'] }),
  nectar_urn: enemy('nectar_urn', 'Nectar Urn', 'verdant', 'pitcher', 5, 78, 14, 2, 2.7, 8.6, 38, { color: 0x7aaf4f, accent: 0xf0b45d, ai: 'caster', weight: 0.68, role: 'controller', family: 'verdant_flora', special: 'slow_bolt', tags: ['pitfall', 'lure'] }),
  grove_pangolin: enemy('grove_pangolin', 'Grove Pangolin', 'verdant', 'pangolin', 7, 198, 15, 10, 2.55, 1.75, 61, { color: 0x718256, accent: 0xd8c07a, ai: 'tank', weight: 0.58, role: 'frontline', family: 'verdant_fauna', special: 'aura_armor', tags: ['armor', 'curl'] }),
  briar_champion: enemy('briar_champion', 'Briar Champion', 'verdant', 'plant', 10, 620, 22, 12, 2.55, 2.4, 220, { color: 0x3a6038, accent: 0xb8f070, ai: 'leap', weight: 0.15, role: 'mini_boss', family: 'verdant_titan', scale: 1.35, miniBoss: true }),
  moss_crown: enemy('moss_crown', 'Mosscrown Colossus', 'verdant', 'colossus', 12, 1650, 27, 10, 2.1, 2.8, 650, { color: 0x456b45, accent: 0x9ce879, ai: 'boss', scale: 1.7, boss: true, special: 'roots', phase2Hp: 0.5, role: 'zone_boss', family: 'verdant_titan' }),

  dusk_wolf: enemy('dusk_wolf', 'Duskshade Wolf', 'forest', 'wolf', 8, 145, 19, 4, 4.8, 1.65, 63, { color: 0x4b5e52, accent: 0x9bd67b, ai: 'pack', weight: 1.2, role: 'rusher', family: 'forest_beast' }),
  thornling: enemy('thornling', 'Thornling Stalker', 'forest', 'plant', 9, 132, 21, 4, 2.6, 8.2, 66, { color: 0x4b8a58, accent: 0xe0807e, ai: 'ranged', weight: 1.0, role: 'glass_ranged', family: 'forest_flora' }),
  bark_guard: enemy('bark_guard', 'Barkguard', 'forest', 'golem', 11, 236, 24, 9, 2.35, 2, 91, { color: 0x6b5a3f, accent: 0x78d267, ai: 'tank', weight: 0.8, role: 'frontline', family: 'forest_construct' }),
  mask_scout: enemy('mask_scout', 'Grove Maskscout', 'forest', 'raider', 12, 175, 25, 5, 4.05, 2, 89, { color: 0x315c48, accent: 0xd5bb7a, ai: 'skirmish', weight: 0.95, role: 'skirmisher', family: 'forest_humanoid' }),
  branch_shaman: enemy('branch_shaman', 'Branch Shaman', 'forest', 'shaman', 13, 158, 28, 4, 2.75, 9.2, 101, { color: 0x47664c, accent: 0x8af0a0, ai: 'caster', weight: 0.72, role: 'artillery', family: 'forest_humanoid' }),
  canopy_harpy: enemy('canopy_harpy', 'Canopy Harpy', 'forest', 'harpy', 15, 186, 30, 5, 4.2, 7.8, 118, { color: 0x447567, accent: 0xd8f3ab, ai: 'ranged', weight: 0.65, role: 'glass_ranged', family: 'forest_beast' }),
  spore_puff: enemy('spore_puff', 'Spore Puff', 'forest', 'plant', 8, 88, 14, 2, 2.8, 1.5, 42, { color: 0xc8d8a8, accent: 0xf0ffe0, ai: 'swarm', weight: 1.4, role: 'fodder_swarm', family: 'forest_flora', scale: 0.7 }),
  night_panther: enemy('night_panther', 'Night Panther', 'forest', 'panther', 10, 120, 24, 3, 5.4, 1.75, 72, { color: 0x1a2420, accent: 0x6ad48a, ai: 'charge', weight: 1.0, role: 'rusher', family: 'forest_beast', scale: 0.95 }),
  mist_owlkin: enemy('mist_owlkin', 'Mist Owlkin', 'forest', 'owl', 11, 140, 20, 4, 4.0, 1.9, 78, { color: 0x8a9a88, accent: 0xd0e8c0, ai: 'skirmish', weight: 0.92, role: 'skirmisher', family: 'forest_beast' }),
  root_binder: enemy('root_binder', 'Rootbinder', 'forest', 'shaman', 12, 150, 22, 4, 2.6, 9.0, 88, { color: 0x3a5a40, accent: 0x70e090, ai: 'caster', weight: 0.7, role: 'controller', family: 'forest_humanoid', special: 'slow_bolt' }),
  sap_golem: enemy('sap_golem', 'Sap Golem', 'forest', 'golem', 13, 280, 22, 11, 2.2, 2.05, 110, { color: 0xc48a40, accent: 0xffc060, ai: 'tank', weight: 0.68, role: 'frontline', family: 'forest_construct', scale: 1.08 }),
  grove_duelist: enemy('grove_duelist', 'Grove Duelist', 'forest', 'raider', 14, 190, 28, 5, 3.9, 2.0, 105, { color: 0x2a4a38, accent: 0xc0e070, ai: 'melee', weight: 0.85, role: 'bruiser', family: 'forest_humanoid' }),
  razor_mantis: enemy('razor_mantis', 'Razor Mantis', 'forest', 'mantis', 10, 142, 25, 4, 4.65, 2.0, 79, { color: 0x4c7e4a, accent: 0xc8e66b, ai: 'charge', weight: 0.88, role: 'rusher', family: 'forest_chitin', tags: ['raptorial', 'ambush'] }),
  lantern_moth: enemy('lantern_moth', 'Lantern Moth', 'forest', 'moth', 11, 118, 23, 3, 3.75, 8.8, 82, { color: 0x6f7659, accent: 0xe8cf82, ai: 'ranged', weight: 0.74, role: 'controller', family: 'forest_chitin', special: 'slow_bolt', tags: ['winged', 'eyespots'] }),
  root_centipede: enemy('root_centipede', 'Root Centipede', 'forest', 'centipede', 13, 172, 29, 5, 4.35, 1.65, 103, { color: 0x5d4935, accent: 0xd79562, ai: 'swarm', weight: 0.92, role: 'fodder_swarm', family: 'forest_chitin', tags: ['segmented', 'venom_claws'] }),
  thorn_captain: enemy('thorn_captain', 'Thorn Captain', 'forest', 'raider', 18, 980, 34, 14, 3.2, 2.2, 380, { color: 0x284838, accent: 0x90e070, ai: 'melee', weight: 0.12, role: 'mini_boss', family: 'forest_humanoid', scale: 1.28, miniBoss: true }),
  ancient_stag: enemy('ancient_stag', 'Ancient Stag Lord', 'forest', 'stag', 21, 2700, 39, 14, 3.45, 3.1, 1050, { color: 0x4c5a3e, accent: 0xa8f087, ai: 'boss', scale: 1.68, boss: true, special: 'stampede', role: 'zone_boss', family: 'forest_titan' }),

  sand_crab: enemy('sand_crab', 'Duneskitter Crab', 'canyon', 'crab', 15, 205, 29, 8, 3.1, 1.8, 117, { color: 0xc47846, accent: 0xffc16b, ai: 'tank', weight: 1.05, role: 'frontline', family: 'canyon_chitin' }),
  amber_scarab: enemy('amber_scarab', 'Amber Scarab', 'canyon', 'beetle', 16, 194, 31, 10, 3.6, 1.7, 122, { color: 0xb87034, accent: 0xffd477, ai: 'charge', weight: 1.0, role: 'rusher', family: 'canyon_chitin' }),
  dune_raptor: enemy('dune_raptor', 'Sandclaw Raptor', 'canyon', 'raptor', 18, 245, 35, 6, 5.1, 1.8, 148, { color: 0xc49151, accent: 0xffe08c, ai: 'charge', weight: 0.95, role: 'rusher', family: 'canyon_beast' }),
  dust_bandit: enemy('dust_bandit', 'Dust Bandit', 'canyon', 'raider', 19, 252, 37, 7, 3.65, 2, 153, { color: 0x9c5f3d, accent: 0xf0d09a, ai: 'melee', weight: 0.92, role: 'bruiser', family: 'canyon_humanoid' }),
  sun_shaman: enemy('sun_shaman', 'Sunshaman', 'canyon', 'shaman', 20, 216, 41, 5, 2.9, 9.8, 166, { color: 0xb16d3f, accent: 0xffc45e, ai: 'caster', weight: 0.75, role: 'artillery', family: 'canyon_humanoid' }),
  stone_cyclops: enemy('stone_cyclops', 'Stone Cyclops', 'canyon', 'cyclops', 23, 438, 47, 13, 2.65, 2.5, 231, { color: 0x926149, accent: 0xf4b95e, ai: 'leap', scale: 1.12, weight: 0.58, role: 'bruiser', family: 'canyon_giant' }),
  dust_mite: enemy('dust_mite', 'Dustmite Swarmling', 'canyon', 'beetle', 15, 110, 20, 3, 3.8, 1.4, 70, { color: 0xd0a070, accent: 0xffe0a0, ai: 'swarm', weight: 1.45, role: 'fodder_swarm', family: 'canyon_chitin', scale: 0.55 }),
  sun_asp: enemy('sun_asp', 'Sun Asp', 'canyon', 'asp', 17, 180, 34, 5, 5.3, 1.75, 130, { color: 0xe09040, accent: 0xffd070, ai: 'charge', weight: 1.05, role: 'rusher', family: 'canyon_beast', scale: 0.9 }),
  cliff_archer: enemy('cliff_archer', 'Cliff Archer', 'canyon', 'raider', 18, 170, 38, 4, 3.5, 10.2, 140, { color: 0x8a5530, accent: 0xffc878, ai: 'ranged', weight: 0.85, role: 'glass_ranged', family: 'canyon_humanoid' }),
  mirage_wisp: enemy('mirage_wisp', 'Mirage Wisp', 'canyon', 'wisp', 19, 165, 32, 4, 3.1, 9.5, 135, { color: 0xffb060, accent: 0xfff0c0, ai: 'caster', weight: 0.72, role: 'controller', family: 'canyon_spirit', special: 'slow_bolt' }),
  caravan_brute: enemy('caravan_brute', 'Caravan Brute', 'canyon', 'cyclops', 21, 360, 42, 10, 2.9, 2.3, 200, { color: 0xa87850, accent: 0xe8c090, ai: 'leap', weight: 0.7, role: 'bruiser', family: 'canyon_giant', scale: 1.08 }),
  dune_shield: enemy('dune_shield', 'Dune Shieldbearer', 'canyon', 'knight', 21, 520, 34, 18, 2.55, 2.0, 190, { color: 0xb88955, accent: 0xffd27a, ai: 'tank', weight: 0.65, role: 'frontline', family: 'canyon_humanoid', scale: 1.08 }),
  thornback_devil: enemy('thornback_devil', 'Thornback Devil', 'canyon', 'thornback', 17, 286, 32, 13, 2.65, 1.75, 151, { color: 0xa86b3c, accent: 0xf0b75e, ai: 'tank', weight: 0.72, role: 'frontline', family: 'canyon_beast', tags: ['spined', 'false_head'] }),
  dune_fennec: enemy('dune_fennec', 'Dune Fennec', 'canyon', 'fennec', 18, 176, 36, 5, 5.45, 1.65, 146, { color: 0xd5a86a, accent: 0xffe0a3, ai: 'skirmish', weight: 0.9, role: 'skirmisher', family: 'canyon_beast', tags: ['heat_ears', 'burrow_hunter'] }),
  blasttail_beetle: enemy('blasttail_beetle', 'Blasttail Beetle', 'canyon', 'bombardier', 20, 224, 43, 9, 3.25, 9.4, 178, { color: 0x3b3028, accent: 0xffa348, ai: 'ranged', weight: 0.64, role: 'artillery', family: 'canyon_chitin', tags: ['chemical_pulse', 'rear_nozzle'] }),
  sunscar_warden: enemy('sunscar_warden', 'Sunscar Warden', 'canyon', 'knight', 25, 1400, 48, 20, 2.85, 2.35, 520, { color: 0xc07030, accent: 0xffd080, ai: 'tank', weight: 0.12, role: 'mini_boss', family: 'canyon_humanoid', scale: 1.32, miniBoss: true }),
  dune_tyrant: enemy('dune_tyrant', 'Dune Tyrant', 'canyon', 'scorpion', 29, 3850, 57, 17, 3.2, 3.4, 1550, { color: 0x9b543b, accent: 0xffb550, ai: 'boss', scale: 1.72, boss: true, special: 'sandstorm', phase2Hp: 0.5, role: 'zone_boss', family: 'canyon_titan' }),

  snow_hopper: enemy('snow_hopper', 'Snowspring Hopper', 'frost', 'hare', 24, 315, 45, 8, 4.7, 1.5, 218, { color: 0xc6dde0, accent: 0xf4ffff, ai: 'skirmish', weight: 1.15, role: 'skirmisher', family: 'frost_fauna' }),
  ice_wisp: enemy('ice_wisp', 'Ice Wisp', 'frost', 'wisp', 25, 272, 49, 7, 3.2, 10.2, 229, { color: 0x8edbec, accent: 0xe4fbff, ai: 'ranged', weight: 1.0, role: 'glass_ranged', family: 'frost_spirit' }),
  frost_wolf: enemy('frost_wolf', 'Frostmane Wolf', 'frost', 'wolf', 27, 365, 53, 9, 5.25, 1.8, 262, { color: 0x7895a7, accent: 0xd9f5ff, ai: 'pack', weight: 1.1, role: 'rusher', family: 'frost_beast' }),
  crystal_guard: enemy('crystal_guard', 'Crystalguard Knight', 'frost', 'knight', 29, 465, 58, 16, 3.05, 2.1, 323, { color: 0x639bb4, accent: 0xcff8ff, ai: 'tank', weight: 0.75, role: 'frontline', family: 'frost_construct' }),
  glacier_crab: enemy('glacier_crab', 'Glacier Crab', 'frost', 'crab', 31, 498, 62, 18, 3.2, 2, 348, { color: 0x6998aa, accent: 0xbdefff, ai: 'charge', weight: 0.7, role: 'frontline', family: 'frost_chitin' }),
  white_ogre: enemy('white_ogre', 'Snow Ogre', 'frost', 'cyclops', 34, 680, 70, 17, 2.7, 2.65, 442, { color: 0x91a9b4, accent: 0xe9fcff, ai: 'leap', scale: 1.18, weight: 0.52, role: 'bruiser', family: 'frost_giant' }),
  rime_slime: enemy('rime_slime', 'Rime Slime', 'frost', 'blob', 24, 180, 32, 4, 3.2, 1.5, 140, { color: 0xa8e0f0, accent: 0xe8ffff, ai: 'swarm', weight: 1.4, role: 'fodder_swarm', family: 'frost_slime', scale: 0.75 }),
  ice_fox: enemy('ice_fox', 'Icefox Runner', 'frost', 'fox', 26, 280, 48, 6, 5.2, 1.55, 230, { color: 0xd8eef8, accent: 0xffffff, ai: 'skirmish', weight: 1.1, role: 'skirmisher', family: 'frost_fauna', scale: 0.88 }),
  shard_imp: enemy('shard_imp', 'Shard Imp', 'frost', 'imp', 28, 250, 52, 6, 4.0, 9.5, 245, { color: 0x90c8e0, accent: 0xd0f8ff, ai: 'ranged', weight: 0.95, role: 'glass_ranged', family: 'frost_spirit' }),
  freeze_chanter: enemy('freeze_chanter', 'Freeze Chanter', 'frost', 'shaman', 30, 300, 58, 8, 2.7, 10.8, 310, { color: 0x70a8c0, accent: 0xc0f0ff, ai: 'caster', weight: 0.68, role: 'artillery', family: 'frost_humanoid' }),
  frost_sentinel: enemy('frost_sentinel', 'Frost Sentinel', 'frost', 'knight', 32, 540, 55, 20, 2.9, 2.15, 360, { color: 0x88b8d0, accent: 0xe0f8ff, ai: 'tank', weight: 0.72, role: 'frontline', family: 'frost_construct', scale: 1.05 }),
  snow_wight: enemy('snow_wight', 'Snow Wight', 'frost', 'raider', 30, 380, 56, 10, 3.5, 2.0, 300, { color: 0xa8c0d0, accent: 0xe8f4ff, ai: 'melee', weight: 0.88, role: 'bruiser', family: 'frost_humanoid' }),
  rime_muskox: enemy('rime_muskox', 'Rime Muskox', 'frost', 'muskox', 27, 548, 55, 18, 3.3, 2.15, 322, { color: 0x63747d, accent: 0xd8eef2, ai: 'charge', weight: 0.73, role: 'frontline', family: 'frost_fauna', tags: ['horn_boss', 'insulated'] }),
  snowtail_leopard: enemy('snowtail_leopard', 'Snowtail Leopard', 'frost', 'snow_leopard', 29, 372, 62, 10, 5.75, 1.85, 304, { color: 0xb7c6cf, accent: 0xf2fbff, ai: 'pack', weight: 0.84, role: 'rusher', family: 'frost_beast', tags: ['wide_paws', 'balance_tail'] }),
  glacier_walrus: enemy('glacier_walrus', 'Glacier Walrus', 'frost', 'walrus', 32, 715, 61, 23, 2.45, 2.2, 414, { color: 0x8da1aa, accent: 0xf4eadc, ai: 'tank', weight: 0.58, role: 'frontline', family: 'frost_fauna', tags: ['tusks', 'sensory_whiskers'] }),
  rime_marshal: enemy('rime_marshal', 'Rime Marshal', 'frost', 'knight', 36, 1800, 68, 24, 3.0, 2.4, 720, { color: 0x70a0b8, accent: 0xd8f8ff, ai: 'leap', weight: 0.12, role: 'mini_boss', family: 'frost_construct', scale: 1.3, miniBoss: true }),
  avalanche_yak: enemy('avalanche_yak', 'Avalanche Yak', 'frost', 'boar', 41, 5200, 82, 23, 3.65, 3.4, 2250, { color: 0x708899, accent: 0xe8fbff, ai: 'boss', scale: 1.9, boss: true, special: 'blizzard', role: 'zone_boss', family: 'frost_titan' }),

  coal_imp: enemy('coal_imp', 'Coal Imp', 'ember', 'imp', 34, 468, 67, 11, 4.35, 8.8, 392, { color: 0xb84332, accent: 0xffa047, ai: 'ranged', weight: 1.1, role: 'glass_ranged', family: 'ember_spirit' }),
  magma_lizard: enemy('magma_lizard', 'Magma Lizard', 'ember', 'lizard', 36, 590, 73, 14, 4.5, 1.95, 445, { color: 0x863b34, accent: 0xff7841, ai: 'charge', weight: 1.0, role: 'rusher', family: 'ember_beast' }),
  ash_raider: enemy('ash_raider', 'Ashmask Raider', 'ember', 'raider', 38, 565, 77, 14, 3.8, 2.05, 453, { color: 0x67373a, accent: 0xff9a55, ai: 'melee', weight: 0.95, role: 'bruiser', family: 'ember_humanoid' }),
  forge_knight: enemy('forge_knight', 'Forge Knight', 'ember', 'knight', 40, 765, 84, 23, 3.15, 2.25, 563, { color: 0x71333a, accent: 0xffb052, ai: 'tank', weight: 0.72, role: 'frontline', family: 'ember_construct' }),
  cinder_golem: enemy('cinder_golem', 'Cinder Golem', 'ember', 'golem', 42, 890, 91, 25, 2.7, 2.45, 645, { color: 0x563137, accent: 0xff6c3f, ai: 'leap', scale: 1.12, weight: 0.6, role: 'bruiser', family: 'ember_construct' }),
  flame_harpy: enemy('flame_harpy', 'Flame Harpy', 'ember', 'harpy', 44, 635, 96, 15, 4.65, 9.4, 606, { color: 0x8a3940, accent: 0xffb35e, ai: 'caster', weight: 0.62, role: 'artillery', family: 'ember_beast' }),
  cinder_mite: enemy('cinder_mite', 'Cinder Mite', 'ember', 'beetle', 34, 250, 42, 6, 4.0, 1.45, 220, { color: 0x503028, accent: 0xff8040, ai: 'swarm', weight: 1.4, role: 'fodder_swarm', family: 'ember_chitin', scale: 0.55 }),
  lava_hopper: enemy('lava_hopper', 'Lava Hopper', 'ember', 'hare', 36, 380, 70, 10, 5.0, 1.6, 380, { color: 0xa04030, accent: 0xff9050, ai: 'charge', weight: 1.05, role: 'rusher', family: 'ember_beast', scale: 0.9 }),
  ash_archer: enemy('ash_archer', 'Ashbow Raider', 'ember', 'raider', 38, 420, 82, 10, 3.6, 10.0, 420, { color: 0x5a3030, accent: 0xffa060, ai: 'ranged', weight: 0.85, role: 'glass_ranged', family: 'ember_humanoid' }),
  pyre_mender: enemy('pyre_mender', 'Pyre Mender', 'ember', 'shaman', 39, 450, 55, 12, 3.0, 8.5, 400, { color: 0x8a4030, accent: 0xffc070, ai: 'caster', weight: 0.55, role: 'support', family: 'ember_humanoid', special: 'aura_armor' }),
  slag_brute: enemy('slag_brute', 'Slag Brute', 'ember', 'cyclops', 42, 720, 88, 18, 2.85, 2.5, 580, { color: 0x603830, accent: 0xff7040, ai: 'leap', weight: 0.65, role: 'bruiser', family: 'ember_giant', scale: 1.12 }),
  spark_wisp: enemy('spark_wisp', 'Spark Wisp', 'ember', 'wisp', 37, 340, 68, 9, 3.4, 9.8, 360, { color: 0xff8040, accent: 0xffe080, ai: 'ranged', weight: 0.9, role: 'controller', family: 'ember_spirit', special: 'slow_bolt' }),
  cinder_salamander: enemy('cinder_salamander', 'Cinder Salamander', 'ember', 'salamander', 36, 536, 76, 14, 4.65, 1.95, 452, { color: 0x542f32, accent: 0xff6d38, ai: 'charge', weight: 0.9, role: 'rusher', family: 'ember_beast', tags: ['amphibian', 'dorsal_crest'] }),
  furnace_ant: enemy('furnace_ant', 'Furnace Ant', 'ember', 'fire_ant', 38, 292, 66, 8, 4.55, 1.55, 298, { color: 0x4b2020, accent: 0xff7b32, ai: 'swarm', weight: 1.18, role: 'fodder_swarm', family: 'ember_chitin', tags: ['mandibles', 'colony'] }),
  slagfoot_snail: enemy('slagfoot_snail', 'Slagfoot Snail', 'ember', 'slag_snail', 41, 915, 72, 31, 1.85, 1.9, 608, { color: 0x29272b, accent: 0xff8a45, ai: 'tank', weight: 0.52, role: 'frontline', family: 'ember_chitin', special: 'aura_armor', tags: ['iron_scales', 'vent_dweller'] }),
  pyre_phoenix: enemy('pyre_phoenix', 'Pyre Phoenix', 'ember', 'phoenix', 43, 612, 97, 15, 4.4, 10.2, 624, { color: 0x9b352b, accent: 0xffd05b, ai: 'caster', weight: 0.55, role: 'artillery', family: 'ember_spirit', tags: ['flame_wings', 'ash_rebirth'] }),
  ash_overseer: enemy('ash_overseer', 'Ash Overseer', 'ember', 'golem', 46, 2400, 92, 28, 2.75, 2.6, 900, { color: 0x5a2828, accent: 0xff7040, ai: 'leap', weight: 0.1, role: 'mini_boss', family: 'ember_construct', scale: 1.38, miniBoss: true }),
  molten_colossus: enemy('molten_colossus', 'Molten Colossus', 'ember', 'colossus', 52, 7200, 111, 31, 2.45, 3.6, 3200, { color: 0x4d2a31, accent: 0xff6c3d, ai: 'boss', scale: 2.05, boss: true, special: 'inferno', phase2Hp: 0.4, role: 'zone_boss', family: 'ember_titan' }),

  void_blob: enemy('void_blob', 'Void Blob', 'astral', 'blob', 48, 760, 94, 16, 3.35, 1.7, 665, { color: 0x7459ad, accent: 0xd1a5ff, ai: 'swarm', weight: 1.15, role: 'fodder_swarm', family: 'astral_slime' }),
  prism_wisp: enemy('prism_wisp', 'Prism Wisp', 'astral', 'wisp', 50, 690, 102, 15, 3.45, 11, 702, { color: 0x9e72d4, accent: 0xf2c5ff, ai: 'caster', weight: 1.0, role: 'artillery', family: 'astral_spirit' }),
  rift_hound: enemy('rift_hound', 'Rift Hound', 'astral', 'wolf', 52, 915, 108, 18, 5.65, 1.95, 765, { color: 0x514779, accent: 0xc68cff, ai: 'pack', weight: 1.0, role: 'rusher', family: 'astral_beast' }),
  star_knight: enemy('star_knight', 'Starforged Knight', 'astral', 'knight', 55, 1250, 119, 31, 3.35, 2.35, 941, { color: 0x4f4d78, accent: 0xd4b4ff, ai: 'tank', weight: 0.75, role: 'frontline', family: 'astral_construct' }),
  abyss_stalker: enemy('abyss_stalker', 'Abyss Stalker', 'astral', 'panther', 58, 1080, 128, 22, 6, 2.05, 936, { color: 0x393453, accent: 0xb580ff, ai: 'charge', weight: 0.85, role: 'rusher', family: 'astral_beast' }),
  orbit_mage: enemy('orbit_mage', 'Orbit Mage', 'astral', 'shaman', 60, 970, 136, 20, 3.15, 11.8, 984, { color: 0x67518e, accent: 0xe3b7ff, ai: 'caster', weight: 0.62, role: 'artillery', family: 'astral_humanoid' }),
  null_mite: enemy('null_mite', 'Null Mite', 'astral', 'beetle', 48, 420, 70, 10, 3.8, 1.5, 400, { color: 0x2a2040, accent: 0xa070ff, ai: 'swarm', weight: 1.35, role: 'fodder_swarm', family: 'astral_chitin', scale: 0.55 }),
  phase_hare: enemy('phase_hare', 'Phase Hare', 'astral', 'hare', 50, 520, 95, 12, 5.4, 1.55, 520, { color: 0xb8a0e8, accent: 0xf0e0ff, ai: 'skirmish', weight: 1.05, role: 'skirmisher', family: 'astral_fauna', scale: 0.9 }),
  void_archer: enemy('void_archer', 'Voidleaf Archer', 'astral', 'raider', 54, 680, 120, 14, 3.7, 11.2, 720, { color: 0x403858, accent: 0xc090ff, ai: 'ranged', weight: 0.82, role: 'glass_ranged', family: 'astral_humanoid' }),
  graviton_shaman: enemy('graviton_shaman', 'Graviton Shaman', 'astral', 'shaman', 56, 750, 105, 16, 3.0, 11.0, 780, { color: 0x584878, accent: 0xd0a0ff, ai: 'caster', weight: 0.65, role: 'controller', family: 'astral_humanoid', special: 'slow_bolt' }),
  prism_guard: enemy('prism_guard', 'Prism Guard', 'astral', 'golem', 57, 1400, 110, 34, 2.9, 2.4, 900, { color: 0x9080c0, accent: 0xe8d0ff, ai: 'tank', weight: 0.7, role: 'frontline', family: 'astral_construct', scale: 1.1 }),
  rift_imp: enemy('rift_imp', 'Rift Imp', 'astral', 'imp', 53, 620, 115, 14, 4.2, 11.5, 700, { color: 0x8050b0, accent: 0xff90d0, ai: 'caster', weight: 0.78, role: 'artillery', family: 'astral_spirit' }),
  lurestar_angler: enemy('lurestar_angler', 'Lurestar Angler', 'astral', 'angler', 50, 812, 108, 17, 3.1, 10.6, 735, { color: 0x273056, accent: 0x77e8ff, ai: 'caster', weight: 0.76, role: 'controller', family: 'astral_deep', special: 'slow_bolt', tags: ['bioluminescent_lure', 'gaping_maw'] }),
  veil_vampire: enemy('veil_vampire', 'Veil Vampire Squid', 'astral', 'vampire_squid', 52, 784, 116, 18, 3.7, 10.8, 778, { color: 0x3d284f, accent: 0xe067c8, ai: 'ranged', weight: 0.72, role: 'glass_ranged', family: 'astral_deep', tags: ['webbed_arms', 'photophores'] }),
  chainlight_colony: enemy('chainlight_colony', 'Chainlight Colony', 'astral', 'siphonophore', 55, 948, 104, 22, 2.75, 11.4, 862, { color: 0x4d5c92, accent: 0xff739f, ai: 'ranged', weight: 0.58, role: 'support', family: 'astral_deep', special: 'aura_armor', tags: ['colonial', 'glowing_zooids'] }),
  void_nautilus: enemy('void_nautilus', 'Void Nautilus', 'astral', 'nautilus', 58, 1460, 118, 38, 2.55, 2.35, 1015, { color: 0x5b527f, accent: 0xd9b0ff, ai: 'tank', weight: 0.55, role: 'frontline', family: 'astral_deep', special: 'aura_armor', tags: ['chambered_shell', 'many_arms'] }),
  void_herald: enemy('void_herald', 'Void Herald', 'astral', 'shaman', 62, 2800, 125, 26, 3.1, 3.0, 1100, { color: 0x403060, accent: 0xd090ff, ai: 'caster', weight: 0.1, role: 'mini_boss', family: 'astral_humanoid', scale: 1.34, miniBoss: true, special: 'slow_bolt' }),
  eclipse_drake: enemy('eclipse_drake', 'Eclipse Drake', 'astral', 'drake', 70, 9800, 158, 38, 4.1, 4.1, 4600, { color: 0x373251, accent: 0xc27cff, ai: 'boss', scale: 2.05, boss: true, special: 'eclipse', role: 'zone_boss', family: 'astral_titan' }),
});

export const ZONE_SPAWNS = Object.freeze(Object.fromEntries(
  Object.keys(ZONES).map(zoneId => [zoneId, Object.values(ENEMY_TYPES)
    .filter(entry => entry.zone === zoneId && !entry.boss && !entry.miniBoss)
    .map(entry => ({ id: entry.id, weight: entry.weight }))]),
));

export const ZONE_BOSSES = Object.freeze(Object.fromEntries(
  Object.keys(ZONES).map(zoneId => [zoneId, Object.values(ENEMY_TYPES).find(entry => entry.zone === zoneId && entry.boss)?.id]),
));

/** Defense milestone champions (not in ambient Hunt pool). */
export const ZONE_MINI_BOSSES = Object.freeze(Object.fromEntries(
  Object.keys(ZONES).map(zoneId => [zoneId, Object.values(ENEMY_TYPES).find(entry => entry.zone === zoneId && entry.miniBoss)?.id]),
));

export const RARITIES = Object.freeze({
  common: { id: 'common', name: 'Common', color: 0xcbd4dc, multiplier: 1, affixes: 0, salvage: 1 },
  uncommon: { id: 'uncommon', name: 'Uncommon', color: 0x79e89d, multiplier: 1.13, affixes: 1, salvage: 1.5 },
  rare: { id: 'rare', name: 'Rare', color: 0x62b9ff, multiplier: 1.32, affixes: 2, salvage: 2.3 },
  epic: { id: 'epic', name: 'Epic', color: 0xb978ff, multiplier: 1.58, affixes: 3, salvage: 3.8 },
  legendary: { id: 'legendary', name: 'Legendary', color: 0xffc45d, multiplier: 1.95, affixes: 4, salvage: 6.5 },
});

export const WEAPON_BASES = Object.freeze({
  field_blade: { id: 'field_blade', name: 'Fieldwind Sword', model: 'sword', power: 10, speed: 1, crit: 0.02, color: 0xd9e4e8 },
  moon_saber: { id: 'moon_saber', name: 'Crescent Saber', model: 'saber', power: 9, speed: 1.16, crit: 0.05, color: 0xc9e8ff },
  stone_cleaver: { id: 'stone_cleaver', name: 'Stone Cleaver', model: 'greatsword', power: 15, speed: 0.84, crit: 0.01, color: 0xd8c6a4 },
  thorn_edge: { id: 'thorn_edge', name: 'Thornvine Blade', model: 'leaf', power: 12, speed: 1.05, crit: 0.035, color: 0x8ae59b },
  sun_fang: { id: 'sun_fang', name: 'Sunfang', model: 'saber', power: 13, speed: 1.08, crit: 0.045, color: 0xffb45b },
  glacier_brand: { id: 'glacier_brand', name: 'Glacier Brand', model: 'greatsword', power: 17, speed: 0.88, crit: 0.02, color: 0xbaf3ff },
  ember_katana: { id: 'ember_katana', name: 'Ember Katana', model: 'katana', power: 14, speed: 1.18, crit: 0.06, color: 0xff7a50 },
  astral_oath: { id: 'astral_oath', name: 'Astral Oath', model: 'relic', power: 18, speed: 1.06, crit: 0.065, color: 0xd9b4ff },
  night_fang: { id: 'night_fang', name: 'Nightfang Dagger', model: 'dagger', power: 8, speed: 1.42, crit: 0.085, color: 0xa8f0dc },
  viper_kris: { id: 'viper_kris', name: 'Viper Kris', model: 'dagger', power: 15, speed: 1.38, crit: 0.095, color: 0x7de5b8 },
  oak_staff: { id: 'oak_staff', name: 'Oak Staff', model: 'staff', power: 9, speed: 1.05, crit: 0.03, skillPower: 0.05, color: 0xc4a878 },
  crystal_rod: { id: 'crystal_rod', name: 'Crystal Rod', model: 'staff', power: 12, speed: 1.08, crit: 0.04, skillPower: 0.08, color: 0xb8d4ff },
  void_scepter: { id: 'void_scepter', name: 'Void Scepter', model: 'staff', power: 16, speed: 1.02, crit: 0.05, skillPower: 0.12, color: 0xd9b4ff },
  yew_bow: { id: 'yew_bow', name: 'Yew Recurve', model: 'bow', power: 10, speed: 1.12, crit: 0.05, color: 0xc4a574 },
  longbow_ash: { id: 'longbow_ash', name: 'Ash Longbow', model: 'bow', power: 13, speed: 1.06, crit: 0.055, color: 0xd8c090 },
  storm_recurve: { id: 'storm_recurve', name: 'Storm Recurve', model: 'bow', power: 16, speed: 1.14, crit: 0.07, color: 0x9ad0a8 },
  service_rifle: { id: 'service_rifle', name: 'Service Rifle', model: 'rifle', power: 11, speed: 1.08, crit: 0.04, color: 0xc8b090 },
  brass_carbine: { id: 'brass_carbine', name: 'Brass Carbine', model: 'rifle', power: 14, speed: 1.1, crit: 0.05, color: 0xe0a868 },
  ember_lance: { id: 'ember_lance', name: 'Ember Lance', model: 'rifle', power: 17, speed: 1.06, crit: 0.06, color: 0xff8a50 },
});

export const ARMOR_BASES = Object.freeze({
  hide_vest: { id: 'hide_vest', name: 'Hunter Hide Vest', defense: 8, hp: 18 },
  leaf_mail: { id: 'leaf_mail', name: 'Leafmail', defense: 10, hp: 14, haste: 0.02 },
  dune_plate: { id: 'dune_plate', name: 'Dune Plate', defense: 14, hp: 22 },
  frost_coat: { id: 'frost_coat', name: 'Frost Coat', defense: 12, hp: 32, crit: 0.015 },
  forge_shell: { id: 'forge_shell', name: 'Forge Shell', defense: 18, hp: 28 },
  starweave: { id: 'starweave', name: 'Starweave', defense: 14, hp: 24, skillPower: 0.06 },
});

export const CHARM_BASES = Object.freeze({
  fang_charm: { id: 'fang_charm', name: 'Fang Charm', power: 4, crit: 0.025 },
  breeze_knot: { id: 'breeze_knot', name: 'Breeze Knot', haste: 0.04, moveSpeed: 0.18 },
  heart_seed: { id: 'heart_seed', name: 'Heart Seed', hp: 28, leech: 0.012 },
  coin_eye: { id: 'coin_eye', name: 'Coin Eye', goldBonus: 0.12, luck: 0.04 },
  scholar_rune: { id: 'scholar_rune', name: 'Scholar Rune', xpBonus: 0.12, skillPower: 0.03 },
  eclipse_shard: { id: 'eclipse_shard', name: 'Eclipse Shard', power: 7, skillPower: 0.07, crit: 0.02 },
});

export const AFFIXES = Object.freeze([
  { id: 'power', prefix: 'Savage', stat: 'power', min: 2, max: 8, perLevel: 0.18 },
  { id: 'vitality', prefix: 'Vital', stat: 'hp', min: 12, max: 42, perLevel: 1.25 },
  { id: 'guard', prefix: 'Warding', stat: 'defense', min: 2, max: 7, perLevel: 0.16 },
  { id: 'keen', prefix: 'Keen', stat: 'crit', min: 0.012, max: 0.045, perLevel: 0.0004 },
  { id: 'swift', prefix: 'Swift', stat: 'haste', min: 0.02, max: 0.075, perLevel: 0.0005 },
  { id: 'drain', prefix: 'Leeching', stat: 'leech', min: 0.008, max: 0.03, perLevel: 0.00015 },
  { id: 'wisdom', prefix: 'Wise', stat: 'xpBonus', min: 0.04, max: 0.15, perLevel: 0.0006 },
  { id: 'fortune', prefix: 'Lucky', stat: 'goldBonus', min: 0.05, max: 0.18, perLevel: 0.0006 },
  { id: 'arcane', prefix: 'Arcane', stat: 'skillPower', min: 0.035, max: 0.13, perLevel: 0.0005 },
  { id: 'wind', prefix: 'Gale', stat: 'moveSpeed', min: 0.12, max: 0.42, perLevel: 0.002 },
]);

/**
 * Global skill catalog. Each skill belongs to a class via `classId`.
 * Active skills need `effect` (CombatSystem handler id), `anim` (clip name in GLB), `castTime`.
 * Passive skills use `effect` multipliers applied per rank in Player getters.
 */
/**
 * Active skill combat fields:
 * - combat: balance (arrays = [base, perRank])
 * - theme / sfx / recipe: presentation identity
 * - timeline.hits: normalized anim cues (0–1) for pose-synced phases
 * - anim: GLB clip name (wizard clips are unique — not knight aliases)
 */
export const SKILLS = Object.freeze({
  // —— Knight actives ——
  whirlwind: {
    id: 'whirlwind', classId: 'aerin', name: 'Vortex Call', key: 'Q', unlockLevel: 3, maxRank: 10, mp: 18, cooldown: 5.5,
    castTime: .42, anim: 'skill_whirlwind', animFallback: 'attack_4', effect: 'whirlwind',
    theme: 'windsteel', sfx: 'skill_blade', recipe: 'spinStorm',
    timeline: Object.freeze({ hits: Object.freeze([0.22, 0.48, 0.74]) }),
    combat: Object.freeze({
      mult: Object.freeze([0.46, 0.055]),
      // Hit-pulse radius after the gather (tight ring around the knight).
      radius: Object.freeze([4.1, 0.18]),
      // Teleport-gather reach: non-boss enemies inside this ring snap to the knight.
      gatherRadius: Object.freeze([10.5, 0.28]),
      safeRing: 2.05,
      gatherCap: 12,
      hits: 3,
      // Keep packs clustered after the pull — no strong pulse knockback.
      knockbackPulse: 0,
      knockbackFinale: 1.8,
      invuln: 0.34,
      criticalBonus: 0.03,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Crosswind', summary: 'Adds a reverse cut and final cross.', timeline: Object.freeze({ hits: Object.freeze([.12,.3,.48,.66,.84]) }), combat: Object.freeze({ hits: 5, finalCross: 1 }) }),
        60: Object.freeze({ label: 'Roving Gale', summary: 'Movement leaves one travelled wind scar.', anim: 'attack_5', combat: Object.freeze({ rovingGale: 1, scarMult: .42 }) }),
        100: Object.freeze({ label: 'Sovereign Tempest', summary: 'Six pulses end in a bounded perpendicular cross.', anim: 'skill_whirlwind', timeline: Object.freeze({ hits: Object.freeze([.12,.24,.38,.52,.68,.84]) }), combat: Object.freeze({ hits: 6, sovereign: 1, crossBudget: 2, crossMult: .48, apexFinisher: 1 }), presentation: Object.freeze({ apexMarker: 'sovereign_cross', apexAudio: 'whirlwind' }) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          cyclone: Object.freeze({ label: 'Cyclone', summary: 'Widens gather reach and packs more prey around you.', icon: 'vortex.breadth', combat: Object.freeze({ radiusMult: 1.25, gatherCap: 16, inwardDrag: .55 }) }),
          blood_wheel: Object.freeze({ label: 'Blood Wheel', summary: 'Tightens six fast cuts with bleed cadence.', icon: 'vortex.focus', timeline: Object.freeze({ hits: Object.freeze([.12,.24,.38,.52,.68,.84]) }), combat: Object.freeze({ hits: 6, radiusMult: .82, cadenceMult: .72, bleedEvery: 2, bleed: Object.freeze({ id: 'bleed', duration: 2.4, dps: .08, tick: .45, power: 1 }) }) }),
        }),
        80: Object.freeze({
          storm_cage: Object.freeze({ label: 'Storm Cage', summary: 'Hard-caps how many foes snap into the ring.', icon: 'vortex.flow', combat: Object.freeze({ cageDrag: .85, dragCap: 5, gatherCap: 5 }) }),
          giant_slayer: Object.freeze({ label: 'Giant Slayer', summary: 'Finale pressures and staggers durable prey.', icon: 'vortex.execution', combat: Object.freeze({ durableMult: 1.65, durableStagger: 24 }) }),
        }),
      }),
    }),
    description: 'Pulls nearby foes to your side with a vortex, then carves the clustered pack.',
    rankText: rank => `Pull ${(10.5 + rank * 0.28).toFixed(1)} · Damage ${Math.round((0.46 + rank * 0.055) * 100)}% ×3`,
  },
  crescent: {
    id: 'crescent', classId: 'aerin', name: 'Blade Rift', key: 'E', unlockLevel: 6, maxRank: 10, mp: 22, cooldown: 6.8,
    castTime: .36, anim: 'skill_crescent', animFallback: 'skill_whirlwind', effect: 'crescent',
    theme: 'bladewave', sfx: 'skill_blade', recipe: 'groundWave',
    timeline: Object.freeze({ hits: Object.freeze([0.38]) }),
    combat: Object.freeze({
      mult: Object.freeze([1.9, 0.26]),
      speed: Object.freeze([15.5, 0.4]),
      pierce: Object.freeze([4, 1]),
      radius: 1.55,
      // Low KB so the rift can hold the corridor after Vortex Call.
      knockback: 1.1,
      holdDuration: 1.1,
      status: Object.freeze({ id: 'expose', duration: 2.6, power: 0.2 }),
      residualMult: Object.freeze([0.42, 0.09]),
      residualDelay: 0.42,
      residualRadius: 1.85,
    }),
    evolution: Object.freeze({ forms: Object.freeze({
      20: Object.freeze({ label:'Moon Scar', summary:'The rift path erupts in one delayed hold pulse.', timeline:Object.freeze({hits:Object.freeze([.28,.72])}), combat:Object.freeze({ moonScar:1, scarMult:.48 }) }),
      60: Object.freeze({ label:'Crosscurrent', summary:'Qualified pierces emit bounded perpendicular cuts.', anim:'attack_6', combat:Object.freeze({ crosscurrent:1, crossCap:6, crossPerEnemyCap:1, crossMult:.34 }) }),
      100:Object.freeze({ label:'Worldsplitter', summary:'Three-act presentation protects one release and one rupture.', anim:'skill_crescent', timeline:Object.freeze({hits:Object.freeze([.18,.5,.82])}), combat:Object.freeze({ worldsplitter:1, ruptureMult:.8, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'worldsplitter_rupture',apexAudio:'crescent'}) }),
    }), mutations:Object.freeze({
      40:Object.freeze({ wide_moon:Object.freeze({label:'Wide Moon',summary:'Three rifts cover a broad hold corridor.',icon:'moon.breadth',combat:Object.freeze({waveCount:3,spread:.22,waveMult:.62})}), full_moon:Object.freeze({label:'Full Moon',summary:'One narrow rift lands with high impact and longer hold.',icon:'moon.focus',combat:Object.freeze({waveCount:1,radiusMult:.78,damageMult:1.45,holdDuration:1.35})}) }),
      80:Object.freeze({ rift_trail:Object.freeze({label:'Rift Trail',summary:'Bounded residual line re-pins packs.',icon:'moon.flow',combat:Object.freeze({riftTicks:3,riftCap:4,riftMult:.24})}), armor_sever:Object.freeze({label:'Armor Sever',summary:'Durable prey take focused damage and armor break.',icon:'moon.execution',combat:Object.freeze({severMult:.7,armorBreakDuration:3.5,armorBreakPower:.24})}) }),
    }) }),
    description: 'Tears a holding rift along your facing — carves and pins non-boss prey in the corridor.',
    rankText: rank => `Damage ${Math.round((1.9 + rank * 0.26) * 100)}% · Hold 1.1s · Pierce ${4 + rank}`,
  },
  skyfall: {
    id: 'skyfall', classId: 'aerin', name: 'Iron Vanguard', key: 'R', unlockLevel: 10, maxRank: 10, mp: 30, cooldown: 9.5,
    castTime: .55, anim: 'skill_skyfall', animFallback: 'skill_whirlwind', effect: 'skyfall',
    theme: 'skyice', sfx: 'skill_leap', recipe: 'leapImpact',
    timeline: Object.freeze({ hits: Object.freeze([0.24, 0.72]) }),
    combat: Object.freeze({
      mult: Object.freeze([1.7, 0.25]),
      chargeMult: Object.freeze([0.72, 0.09]),
      radius: Object.freeze([4.5, 0.22]),
      chargeRange: Object.freeze([9.5, 0.25]),
      chargeArc: 1.5,
      chargeWidth: 1.45,
      chargeDuration: 0.18,
      stopDistance: 1.25,
      missDistance: 5.5,
      knockback: 4.8,
      armorPierce: 0.25,
      criticalBonus: 0.06,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({
          label: 'Breaker Charge', summary: 'The charge arrival adds a second direct area impact.',
          timeline: Object.freeze({ hits: Object.freeze([0.24, 0.72]) }),
          combat: Object.freeze({ arrivalMult: Object.freeze([0.62, 0.04]), stunNormal: 1.0, stunElite: 0.45, bossStagger: 24 }),
        }),
        60: Object.freeze({
          label: 'Hammered Onslaught', summary: 'Two expanding aftershocks follow the main impact.', anim: 'attack_7',
          combat: Object.freeze({ aftershockHits: 2, aftershockMult: .48, aftershockRadiusStep: .7, bossStagger: 38 }),
        }),
        100: Object.freeze({
          label: "Iron King's Onslaught", summary: 'A royal rupture adds one massive final area hit.', anim: 'skill_skyfall',
          combat: Object.freeze({ aftershockHits: 3, kingFinaleMult: 1.15, apexStaggerBonus: 19, judgmentApex: 1, apexFinisher: 1 }), presentation: Object.freeze({ apexMarker: 'iron_king_slam', apexAudio: 'skyfall' }),
        }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          iron_vortex: Object.freeze({ label: 'Iron Phalanx', summary: 'Widens the charge lane and impact coverage.', icon: 'hammer.breadth', combat: Object.freeze({ chargeWidth: 2.15, radiusMult: 1.25 }) }),
          meteor_hammer: Object.freeze({ label: 'Meteor Ram', summary: 'Narrows the impact into heavier direct damage.', icon: 'hammer.focus', combat: Object.freeze({ chargeWidth: 1.05, radiusMult: .82, mult: Object.freeze([2.2, 0.32]), chargeMult: Object.freeze([.9, .11]) }) }),
        }),
        80: Object.freeze({
          kings_command: Object.freeze({ label: "King's Advance", summary: 'Adds one more expanding aftershock.', icon: 'hammer.flow', combat: Object.freeze({ bonusAftershock: 1, aftershockMult: .42 }) }),
          earthbreaker: Object.freeze({ label: 'Earthbreaker', summary: 'Adds durable-target damage, armor pierce, and boss stagger.', icon: 'hammer.execution', combat: Object.freeze({ durableMult: 1.55, armorPierce: 0.42, bossStagger: 72 }) }),
        }),
      }),
    }),
    description: 'Charges toward enemies in your facing cone and delivers direct area impacts without warping.',
    rankText: rank => `Charge ${Math.round((0.72 + rank * 0.09) * 100)}% · Impact ${Math.round((1.7 + rank * 0.25) * 100)}% · Radius ${(4.5 + rank * 0.22).toFixed(1)}`,
  },
  starburst: {
    id: 'starburst', classId: 'aerin', name: 'Starburst', key: 'C', unlockLevel: 16, maxRank: 10, mp: 42, cooldown: 15,
    castTime: .72, anim: 'skill_starburst', animFallback: 'skill_whirlwind', effect: 'starburst',
    theme: 'starlight', sfx: 'skill_star', recipe: 'starBlade',
    combat: Object.freeze({
      mult: Object.freeze([0.63, 0.06]),
      finaleMult: Object.freeze([0.95, 0.1]),
      hits: Object.freeze([6, 1]),
      hitRadius: Object.freeze([1.8, 0.08]),
      telegraph: 0.28,
      aim: 9.5,
      finaleRadius: 5.8,
      knockback: 2.5,
      finaleKnockback: 6.2,
      armorPierce: 0.2,
      finaleArmorPierce: 0.35,
      pattern: 'star',
    }),
    evolution:Object.freeze({forms:Object.freeze({
      20:Object.freeze({label:'Greatblade Seal',summary:'Regular impacts end in one bounded royal seal.',timeline:Object.freeze({hits:Object.freeze([.2,.68])}),combat:Object.freeze({greatbladeSeal:1,sealMult:.65})}),
      60:Object.freeze({label:'Embedded Sky',summary:'Landed blades leave bounded delayed embedded strikes.',anim:'attack_7',combat:Object.freeze({embeddedCap:6,embeddedMult:.28})}),
      100:Object.freeze({label:"Heaven's Arsenal",summary:'Ten blades, one royal blade, and three ring acts converge.',anim:'skill_starburst',timeline:Object.freeze({hits:Object.freeze([.16,.48,.82])}),combat:Object.freeze({arsenal:1,regularBlades:10,royalBlades:1,ringActs:3,arsenalFinaleMult:.85,apexFinisher:1}),presentation:Object.freeze({apexMarker:'arsenal_finale',apexAudio:'starburst'})}),
    }),mutations:Object.freeze({
      40:Object.freeze({constellation:Object.freeze({label:'Constellation',summary:'Distributes blades across distinct pack geometry.',icon:'arsenal.breadth',combat:Object.freeze({fieldRadius:6,distinctBladeCap:10,targetCap:8})}),execution_field:Object.freeze({label:'Execution Field',summary:'Concentrates a smaller field with higher center output.',icon:'arsenal.focus',combat:Object.freeze({fieldRadius:3.2,centerMult:1.4})})}),
      80:Object.freeze({oath_prison:Object.freeze({label:'Oath Prison',summary:'Bounded prison control converts bosses to stagger.',icon:'arsenal.flow',combat:Object.freeze({prisonCap:6,prisonStun:.65,bossStagger:18})}),falling_crown:Object.freeze({label:'Falling Crown',summary:'A royal blade focuses durable prey.',icon:'arsenal.execution',combat:Object.freeze({crownMult:.7,crownStagger:24})})}),
    })}),
    description: 'Summons many starlight blades ahead to purge a wide area.',
    rankText: rank => `Damage ${Math.round((0.63 + rank * 0.06) * 100)}% · Blades ${6 + rank}`,
  },
  // —— Knight passives ——
  might: {
    id: 'might', classId: 'aerin', name: 'Beast Might', passive: true, unlockLevel: 2, maxRank: 10,
    effect: { attack: .03 },
    description: 'Permanently increases attack power.', rankText: rank => `Attack +${rank * 3}%`,
  },
  vitality: {
    id: 'vitality', classId: 'aerin', name: 'Survival Instinct', passive: true, unlockLevel: 2, maxRank: 10,
    effect: { hp: .04, defense: .02 },
    description: 'Increases max HP and defense.', rankText: rank => `HP +${rank * 4}% · Defense +${rank * 2}%`,
  },
  focus: {
    id: 'focus', classId: 'aerin', name: 'Blade Focus', passive: true, unlockLevel: 5, maxRank: 10,
    effect: { skillPower: .03, mpRegen: .04, mpFlat: 2 },
    description: 'Increases skill power and mana recovery.', rankText: rank => `Skill Power +${rank * 3}% · MP Regen +${rank * 4}%`,
  },
  fortune: {
    id: 'fortune', classId: 'aerin', name: 'Hunter Fortune', passive: true, unlockLevel: 8, maxRank: 10,
    effect: { luck: .025, gold: .03 },
    description: 'Increases rare-gear and gold drop chance.', rankText: rank => `Luck +${rank * 2.5}% · Gold +${rank * 3}%`,
  },
  executioner: {
    id: 'executioner', classId: 'aerin', name: 'Executioner', passive: true, unlockLevel: 12, maxRank: 5,
    effect: { execute: .04 },
    description: 'Deals bonus damage to enemies below 30% health.',
    rankText: rank => `Damage +${rank * 4}% vs enemies under 30% HP`,
  },
  // —— Wizard actives ——
  fireball: {
    id: 'fireball', classId: 'wizard', name: 'Gravity Fireball', key: 'Q', unlockLevel: 3, maxRank: 10, mp: 20, cooldown: 5.2,
    castTime: .38, anim: 'skill_fireball', animFallback: 'cast_2', effect: 'fireball',
    theme: 'ember', sfx: 'skill_fire', recipe: 'fireOrb',
    timeline: Object.freeze({ hits: Object.freeze([0.36]) }),
    combat: Object.freeze({
      mult: Object.freeze([1.9, 0.28]),
      blastMult: Object.freeze([0.75, 0.1]),
      blastRadius: Object.freeze([3.0, 0.14]),
      // Non-boss foes inside this radius snap toward the blast core on impact.
      implosionRadius: Object.freeze([6.5, 0.2]),
      implosionRing: 1.35,
      implosionCap: 10,
      targetRange: Object.freeze([22, 0.4]),
      speed: Object.freeze([13.5, 0.35]),
      radius: 1.15,
      knockback: 2.8,
      scale: 1.7,
      status: Object.freeze({ id: 'burn', duration: 2.2, dps: 0.12, tick: 0.45, power: 1 }),
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Cinder Orbit', summary: 'Impact releases up to three seeking cinders.', combat: Object.freeze({ cinders: 3, cinderMult: 0.22 }) }),
        60: Object.freeze({ label: 'Living Star', summary: 'Contact expands into a three-tick fire vortex.', anim: 'cast_2', combat: Object.freeze({ vortexTicks: 3, vortexMult: 0.18 }) }),
        100: Object.freeze({ label: 'Prominence', summary: 'The star tunnels forward and erupts in a vertical solar flare.', anim: 'skill_fireball', combat: Object.freeze({ prominence: 1, flareMult: 0.8, overcastMult:.35, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'prominence_flare',apexAudio:'fireball',overcastRecipe:'fire_overcast'}) }),
      }), mutations: Object.freeze({
        40: Object.freeze({ wildfire: Object.freeze({ label: 'Wildfire', summary: 'Widens the blast and spreads burning pressure.', icon: 'flame.breadth', combat: Object.freeze({ blastRadius: Object.freeze([3.1, 0.14]), cinderMult: 0.18 }) }), comet_core: Object.freeze({ label: 'Comet Core', summary: 'Narrows, accelerates, and pierces with a dense core.', icon: 'flame.focus', combat: Object.freeze({ speed: Object.freeze([17, 0.4]), pierce: 3, blastRadius: 2.2 }) }) }),
        80: Object.freeze({ chain_ignition: Object.freeze({ label: 'Chain Ignition', summary: 'Burning targets relay one bounded ignition.', icon: 'flame.flow', combat: Object.freeze({ reaction: 'chain_ignition', reactionCap: 3 }) }), solar_brand: Object.freeze({ label: 'Solar Brand', summary: 'Repeated boss hits build a capped thermal brand.', icon: 'flame.execution', combat: Object.freeze({ bossBrandCap: 4, bossBrandMult: 0.12 }) }) }),
      }),
    }),
    description: 'Auto-locks the nearest foe, then hurls a seeking orb that drags prey into its blast.',
    rankText: rank => `Damage ${Math.round((1.9 + rank * 0.28) * 100)}% · Pull ${(6.5 + rank * 0.2).toFixed(1)} · Blast ${(3.0 + rank * 0.14).toFixed(1)}`,
  },
  frost_nova: {
    id: 'frost_nova', classId: 'wizard', name: 'Glacial Prison', key: 'E', unlockLevel: 6, maxRank: 10, mp: 24, cooldown: 7.2,
    castTime: .36, anim: 'skill_frost_nova', animFallback: 'cast_3', effect: 'frost_nova',
    theme: 'frost', sfx: 'skill_ice', recipe: 'iceNova',
    timeline: Object.freeze({ hits: Object.freeze([0.28]) }),
    combat: Object.freeze({
      // Opening prison tick is lighter; shatter is the real spike.
      mult: Object.freeze([1.0, 0.12]),
      shatterMult: Object.freeze([2.15, 0.28]),
      radius: Object.freeze([5.2, 0.24]),
      knockback: 0,
      shatterKnockback: 3.2,
      shatterDelay: 0.55,
      targetRange: Object.freeze([20, 0.35]),
      clusterRadius: 5.5,
      holdDuration: 1.2,
      invuln: 0.3,
      criticalBonus: 0.05,
      status: Object.freeze({ id: 'slow', duration: 2.8, power: 0.55 }),
      deepChillPower: 0.72,
      deepChillDuration: 1.8,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({ 20: Object.freeze({ label: 'Ice Lances', summary: 'Six directional lances erupt with the shatter.', combat: Object.freeze({ lances: 6, lanceMult: 0.28, lancePerEnemyCap: 2 }) }), 60: Object.freeze({ label: 'Crystal Dominion', summary: 'Deep chill grows a crystal proxy for the next heavy spell.', anim: 'cast_3', combat: Object.freeze({ crystalPrime: 1 }) }), 100: Object.freeze({ label: 'Frozen Dominion', summary: 'A crystal forest converges inward in a delayed shatter.', anim: 'skill_frost_nova', combat: Object.freeze({ dominion: 1, inwardMult: 0.8, overcastMult:.32, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'frozen_shatter',apexAudio:'frost_nova',overcastRecipe:'frost_overcast'}) }) }),
      mutations: Object.freeze({ 40: Object.freeze({ glacier_ring: Object.freeze({ label: 'Glacier Ring', summary: 'Expands prison coverage.', icon: 'crystal.breadth', combat: Object.freeze({ radius: Object.freeze([5.8, 0.26]), lanceMult: 0.2 }) }), shatter_crown: Object.freeze({ label: 'Shatter Crown', summary: 'Tightens the ring for a stronger shatter.', icon: 'crystal.focus', combat: Object.freeze({ radius: Object.freeze([4.0, 0.16]), shatterMult: Object.freeze([2.05, 0.26]) }) }) }), 80: Object.freeze({ absolute_zero: Object.freeze({ label: 'Absolute Zero', summary: 'Chains bounded freeze pressure through normal enemies.', icon: 'crystal.flow', combat: Object.freeze({ freezeChainCap: 3 }) }), crystal_execution: Object.freeze({ label: 'Crystal Execution', summary: 'Focuses crystal shards into durable targets.', icon: 'crystal.execution', combat: Object.freeze({ crystalExecuteMult: 0.6 }) }) }) }),
    }),
    description: 'Auto-locks the highest-priority nearby foe, imprisons its pack in ice, then shatters it for heavy damage.',
    rankText: rank => `Prison hold · Shatter ${Math.round((2.15 + rank * 0.28) * 100)}% · Radius ${(5.2 + rank * 0.24).toFixed(1)}`,
  },
  arcane_blink: {
    id: 'arcane_blink', classId: 'wizard', name: 'Rift Barrage', key: 'R', unlockLevel: 10, maxRank: 10, mp: 28, cooldown: 9.2,
    castTime: .48, anim: 'skill_blink', animFallback: 'dodge', effect: 'arcane_blink',
    theme: 'arcane', sfx: 'skill_arcane', recipe: 'blinkBurst',
    combat: Object.freeze({
      mult: Object.freeze([2.05, 0.3]),
      radius: Object.freeze([4.8, 0.22]),
      targetRange: Object.freeze([19, 0.35]),
      clusterRadius: 5.2,
      telegraph: 0.42,
      knockback: 7.5,
      armorPierce: 0.3,
      criticalBonus: 0.05,
      status: Object.freeze({ id: 'expose', duration: 2.4, power: 0.18, damageAmp: 0.08 }),
    }),
    evolution: Object.freeze({
      forms: Object.freeze({ 20: Object.freeze({ label: 'Route Cut', summary: 'The crossed route becomes a delayed arcane cut.', combat: Object.freeze({ routeMult: 0.32 }) }), 60: Object.freeze({ label: 'Rift Anchors', summary: 'Crossed enemies gain ordered rift anchors.', anim: 'dodge', combat: Object.freeze({ anchors: 6, anchorMult: 0.24 }) }), 100: Object.freeze({ label: 'Space Rend', summary: 'All route anchors fracture along one visible seam.', anim: 'skill_blink', combat: Object.freeze({ spaceRend: 1, seamMult: 0.8, overcastMult:.38, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'space_seam',apexAudio:'arcane_blink',overcastRecipe:'arcane_overcast'}) }) }),
      mutations: Object.freeze({ 40: Object.freeze({ echo_step: Object.freeze({ label: 'Echo Rend', summary: 'An arcane echo repeats the route cut.', icon: 'rift.breadth', combat: Object.freeze({ routeEchoes: 2 }) }), rift_lance: Object.freeze({ label: 'Rift Lance', summary: 'The locked impact compresses damage into a forward lance.', icon: 'rift.focus', combat: Object.freeze({ lanceMult: 0.65 }) }) }), 80: Object.freeze({ twin_horizon: Object.freeze({ label: 'Twin Horizon', summary: 'Origin and target waves collide midway.', icon: 'rift.flow', combat: Object.freeze({ horizonMult: 0.55 }) }), void_break: Object.freeze({ label: 'Void Break', summary: 'Anchors focus armor-piercing damage on durable targets.', icon: 'rift.execution', combat: Object.freeze({ anchorArmorPierce: 0.55 }) }) }) }),
    }),
    description: 'Auto-locks a hostile pack, tears a damage seam through it, and exposes survivors.',
    rankText: rank => `Damage ${Math.round((2.05 + rank * 0.3) * 100)}% · Radius ${(4.8 + rank * 0.22).toFixed(1)}`,
  },
  meteor_storm: {
    id: 'meteor_storm', classId: 'wizard', name: 'Meteor Storm', key: 'C', unlockLevel: 16, maxRank: 10, mp: 46, cooldown: 15.5,
    castTime: .76, anim: 'skill_meteor', animFallback: 'cast_4', effect: 'meteor_storm',
    theme: 'meteor', sfx: 'skill_fire', recipe: 'meteorDrop',
    combat: Object.freeze({
      mult: Object.freeze([0.75, 0.07]),
      finaleMult: Object.freeze([1.25, 0.14]),
      hits: Object.freeze([6, 1]),
      hitRadius: Object.freeze([2.5, 0.1]),
      telegraph: 0.26,
      aim: 10,
      targetRange: Object.freeze([24, 0.45]),
      clusterRadius: 6.2,
      fallHeight: 8.5,
      finaleRadius: 6.4,
      knockback: 2.8,
      finaleKnockback: 7.5,
      armorPierce: 0.18,
      finaleArmorPierce: 0.3,
      pattern: 'fallCone',
      status: Object.freeze({ id: 'burn', duration: 2.2, dps: 0.12, tick: 0.45, power: 1 }),
    }),
    evolution: Object.freeze({
      forms: Object.freeze({ 20: Object.freeze({ label: 'Molten Fall', summary: 'Impacts leave fractures and feed a larger final meteor.', combat: Object.freeze({ fractures: 1 }) }), 60: Object.freeze({ label: 'Gravity Lens', summary: 'A visible lens bends trajectories toward the aim area.', anim: 'cast_4', combat: Object.freeze({ gravityLens: 1 }) }), 100: Object.freeze({ label: 'Astral Cataclysm', summary: 'The lens collapses into a capped spiral cataclysm.', anim: 'skill_meteor', combat: Object.freeze({ astralCataclysm: 1, gravityReactionCap: 3, overcastMult:.42, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'astral_collapse',apexAudio:'meteor_storm',overcastRecipe:'meteor_overcast'}) }) }),
      mutations: Object.freeze({ 40: Object.freeze({ meteor_rain: Object.freeze({ label: 'Meteor Rain', summary: 'A broad barrage advances along facing.', icon: 'meteor.breadth', combat: Object.freeze({ pattern: 'movingRain', impactsCap: 10 }) }), extinction: Object.freeze({ label: 'Extinction', summary: 'Fewer impacts feed one enormous meteor.', icon: 'meteor.focus', combat: Object.freeze({ hits: 4, finaleMult: Object.freeze([1.8, 0.14]), impactsCap: 5 }) }) }), 80: Object.freeze({ orbit_fall: Object.freeze({ label: 'Orbit Fall', summary: 'Orbiting stones hunt distinct enemies once.', icon: 'meteor.flow', combat: Object.freeze({ orbitTargets: 6 }) }), world_ender: Object.freeze({ label: 'World Ender', summary: 'Trajectories compress onto an elite or boss zone.', icon: 'meteor.execution', combat: Object.freeze({ worldEnder: 1, finaleArmorPierce: 0.55 }) }) }) }),
    }),
    description: 'Auto-locks a hostile pack and calls down a burning meteor barrage with a crater finale.',
    rankText: rank => `Damage ${Math.round((0.75 + rank * 0.07) * 100)}% · Meteors ${6 + rank}`,
  },
  // —— Wizard passives ——
  arcane_might: {
    id: 'arcane_might', classId: 'wizard', name: 'Arcane Might', passive: true, unlockLevel: 2, maxRank: 10,
    effect: { skillPower: .035, attack: .015 },
    description: 'Strengthens spell damage and staff strikes.',
    rankText: rank => `Skill Power +${rank * 3.5}% · Attack +${rank * 1.5}%`,
  },
  mana_ward: {
    id: 'mana_ward', classId: 'wizard', name: 'Mana Ward', passive: true, unlockLevel: 2, maxRank: 10,
    effect: { hp: .03, defense: .02, mpFlat: 3 },
    description: 'Wards the body with residual mana.',
    rankText: rank => `HP +${rank * 3}% · Defense +${rank * 2}% · MP +${rank * 3}`,
  },
  mana_font: {
    id: 'mana_font', classId: 'wizard', name: 'Mana Font', passive: true, unlockLevel: 5, maxRank: 10,
    effect: { skillPower: .03, mpRegen: .06, mpFlat: 2 },
    description: 'Deepens the mana well and recovery.',
    rankText: rank => `Skill Power +${rank * 3}% · MP Regen +${rank * 6}%`,
  },
  star_luck: {
    id: 'star_luck', classId: 'wizard', name: 'Star Luck', passive: true, unlockLevel: 8, maxRank: 10,
    effect: { luck: .03, gold: .03 },
    description: 'Fate bends slightly toward the caster.',
    rankText: rank => `Luck +${rank * 3}% · Gold +${rank * 3}%`,
  },
  pyromancer: {
    id: 'pyromancer', classId: 'wizard', name: 'Pyromancer', passive: true, unlockLevel: 12, maxRank: 5,
    effect: { dotPower: .08 },
    description: 'Burns (and all damage-over-time) tick harder.',
    rankText: rank => `DoT damage +${rank * 8}%`,
  },
  // —— Rogue actives —— short reach · high tempo · critical focus
  twin_fang: {
    id: 'twin_fang', classId: 'rogue', name: 'Predator Flurry', key: 'Q', unlockLevel: 3, maxRank: 10, mp: 14, cooldown: 4.2,
    castTime: .3, anim: 'skill_twin_fang', animFallback: 'attack_2', effect: 'twin_fang',
    theme: 'venom', sfx: 'skill_dagger', recipe: 'fangRush',
    timeline: Object.freeze({ hits: Object.freeze([.1, .24, .38, .52, .68, .84]) }),
    combat: Object.freeze({
      mult: Object.freeze([.44, .055]),
      targetRange: Object.freeze([11, .25]),
      hits: 6,
      knockback: .35,
      armorPierce: .18,
      criticalBonus: .18,
      status: Object.freeze({ id: 'bleed', duration: 2.6, dps: 0.1, tick: 0.4, power: 1 }),
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Relentless Fang', summary: 'Adds a seventh auto-targeted blade contact.', timeline: Object.freeze({ hits: Object.freeze([.08,.2,.32,.44,.56,.7,.84]) }), combat: Object.freeze({ hits: 7 }) }),
        60: Object.freeze({ label: 'Echo Fang', summary: 'The locked prey receives two additional echo cuts.', anim: 'attack_6', combat: Object.freeze({ echoHits: 2, echoMult: .38 }) }),
        100: Object.freeze({ label: 'Predator Sentence', summary: 'Ten direct contacts end in a focused execution hit.', anim: 'skill_twin_fang', timeline: Object.freeze({ hits: Object.freeze([.06,.14,.22,.3,.38,.46,.56,.66,.76,.88]) }), combat: Object.freeze({ hits: 10, echoHits: 2, echoMult: .42, finaleMult: .85, apexFinisher: 1 }), presentation: Object.freeze({ apexMarker: 'predator_sentence', apexAudio: 'twin_fang' }) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          viper: Object.freeze({ label: 'Viper', summary: 'Extends and strengthens bleed.', icon: 'fang.breadth', combat: Object.freeze({ bleedMult: 1.4, bleedDurationBonus: 1.6 }) }),
          raptor: Object.freeze({ label: 'Raptor', summary: 'Compresses the strike cadence and raises critical pressure.', icon: 'fang.focus', combat: Object.freeze({ cadenceMult: .72, criticalBonus: .3 }) }),
        }),
        80: Object.freeze({
          open_wound: Object.freeze({ label: 'Open Wound', summary: 'A bleeding target receives one extra wound strike.', icon: 'fang.flow', combat: Object.freeze({ woundMult: .72 }) }),
          heartseeker: Object.freeze({ label: 'Heartseeker', summary: 'Durable prey receive two additional heart strikes.', icon: 'fang.execution', combat: Object.freeze({ durableExtraHits: 2, durableMult: .5, durableStagger: 18 }) }),
        }),
      }),
    }),
    description: 'Instantly locks the nearest enemy and lands six direct dagger hits without moving.',
    rankText: rank => `Auto range ${(11 + rank * .25).toFixed(1)} · Damage ${Math.round((.44 + rank * .055) * 100)}% ×6`,
  },
  fan_of_knives: {
    id: 'fan_of_knives', classId: 'rogue', name: 'Blade Cyclone', key: 'E', unlockLevel: 5, maxRank: 10, mp: 20, cooldown: 6.4,
    castTime: .32, anim: 'skill_fan_knives', animFallback: 'skill_twin_fang', effect: 'fan_of_knives',
    theme: 'nightsteel', sfx: 'skill_dagger', recipe: 'daggerFan',
    timeline: Object.freeze({ hits: Object.freeze([.12, .29, .46, .64, .84]) }),
    combat: Object.freeze({
      mult: Object.freeze([.38, .045]),
      pulses: 5,
      radius: Object.freeze([5.2, .16]),
      knockback: .3,
      armorPierce: .1,
      criticalBonus: .14,
      status: Object.freeze({ id: 'bleed', duration: 2.2, dps: 0.08, tick: 0.45, power: 1 }),
    }),
    evolution: Object.freeze({ forms: Object.freeze({
      20: Object.freeze({ label: 'Sixfold Cyclone', summary: 'Adds a sixth surrounding blade pulse.', timeline: Object.freeze({ hits: Object.freeze([.1,.23,.36,.49,.64,.82]) }), combat: Object.freeze({ pulses: 6 }) }),
      60: Object.freeze({ label: 'Afterimage Ring', summary: 'Every second pulse repeats as an additional shadow cut.', anim: 'attack_5', combat: Object.freeze({ echoEvery: 2, echoMult: .34 }) }),
      100: Object.freeze({ label: 'Night Cyclone', summary: 'Nine surrounding hits end in one stronger circular cut.', anim: 'skill_fan_knives', timeline: Object.freeze({ hits: Object.freeze([.06,.15,.24,.33,.42,.51,.61,.72,.86]) }), combat: Object.freeze({ pulses: 9, echoEvery: 2, echoMult: .36, finaleMult: .92, apexFinisher: 1 }), presentation: Object.freeze({ apexMarker: 'night_cyclone', apexAudio: 'fan_of_knives' }) }),
    }), mutations: Object.freeze({
      40: Object.freeze({
        black_fan: Object.freeze({ label: 'Black Ring', summary: 'Widens every surrounding pulse.', icon: 'knives.breadth', combat: Object.freeze({ radiusMult: 1.25 }) }),
        needle_line: Object.freeze({ label: 'Razor Ring', summary: 'Tightens the ring for stronger repeated damage.', icon: 'knives.focus', combat: Object.freeze({ radiusMult: .78, damageMult: 1.35, criticalBonus: .22 }) }),
      }),
      80: Object.freeze({
        ricochet: Object.freeze({ label: 'Echo Ring', summary: 'Every second pulse gains an additional echo hit.', icon: 'knives.flow', combat: Object.freeze({ echoEvery: 2, echoMult: .42 }) }),
        pinned_prey: Object.freeze({ label: 'Breaker Ring', summary: 'Each final pulse adds two hits against durable prey.', icon: 'knives.execution', combat: Object.freeze({ durableExtraHits: 2, durableMult: .46, durableStagger: 18 }) }),
      }),
    }) }),
    description: 'Carves every nearby enemy with five player-centered area hits.',
    rankText: rank => `Radius ${(5.2 + rank * .16).toFixed(1)} · Damage ${Math.round((.38 + rank * .045) * 100)}% ×5`,
  },
  shadowstep: {
    id: 'shadowstep', classId: 'rogue', name: 'Execution Chain', key: 'R', unlockLevel: 9, maxRank: 10, mp: 26, cooldown: 8.6,
    castTime: .42, anim: 'skill_twin_fang', animFallback: 'attack_6', effect: 'shadowstep',
    theme: 'shadow', sfx: 'skill_dagger', recipe: 'fangRush',
    timeline: Object.freeze({ hits: Object.freeze([.1, .24, .38, .53, .68, .84]) }),
    combat: Object.freeze({
      mult: Object.freeze([.52, .065]),
      hits: 6,
      targetRange: Object.freeze([12, .3]),
      targetCap: 3,
      secondaryMult: .58,
      knockback: .45,
      armorPierce: .3,
      criticalBonus: .22,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Twin Execution', summary: 'Each primary target receives one additional off-hand hit.', combat: Object.freeze({ offhandEcho: .34 }) }),
        60: Object.freeze({ label: 'Feeding Blades', summary: 'Extends the chain to eight direct multi-target volleys.', anim: 'attack_6', timeline: Object.freeze({ hits: Object.freeze([.07,.17,.27,.37,.47,.58,.7,.84]) }), combat: Object.freeze({ hits: 8 }) }),
        100: Object.freeze({ label: 'Zero Mercy', summary: 'Twelve volleys hunt five targets and end in a final execution hit.', anim: 'skill_twin_fang', timeline: Object.freeze({ hits: Object.freeze([.04,.1,.16,.22,.28,.34,.4,.48,.56,.65,.75,.87]) }), combat: Object.freeze({ hits: 12, targetCap: 5, offhandEcho: .38, finaleMult: .78, apexFinisher: 1 }), presentation: Object.freeze({ apexMarker: 'zero_mercy', apexAudio: 'shadowstep' }) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          ghost_rush: Object.freeze({ label: 'Ghost Blades', summary: 'Expands auto-target range and strikes up to five enemies.', icon: 'shadow.breadth', combat: Object.freeze({ targetRange: Object.freeze([15, .35]), targetCap: 5 }) }),
          red_tempo: Object.freeze({ label: 'Red Tempo', summary: 'Focuses the chain into harder critical contacts.', icon: 'shadow.focus', combat: Object.freeze({ secondaryMult: .68, criticalBonus: .34 }) }),
        }),
        80: Object.freeze({
          predator_flow: Object.freeze({ label: 'Predator Flow', summary: 'Chains to six targets with stronger secondary hits.', icon: 'shadow.flow', combat: Object.freeze({ targetCap: 6, secondaryMult: .72 }) }),
          boss_killer: Object.freeze({ label: 'Boss Killer', summary: 'Durable prey receive three additional execution hits.', icon: 'shadow.execution', combat: Object.freeze({ durableExtraHits: 3, durableMult: .5, durableStagger: 24 }) }),
        }),
      }),
    }),
    description: 'Auto-selects nearby enemies and rains six chained blade volleys while standing still.',
    rankText: rank => `Auto range ${(12 + rank * .3).toFixed(1)} · Damage ${Math.round((.52 + rank * .065) * 100)}% ×6 · Targets 3`,
  },
  death_lotus: {
    id: 'death_lotus', classId: 'rogue', name: 'Death Lotus', key: 'C', unlockLevel: 14, maxRank: 10, mp: 38, cooldown: 14,
    castTime: .6, anim: 'skill_death_lotus', animFallback: 'attack_4', effect: 'death_lotus',
    theme: 'shadow', sfx: 'skill_dagger', recipe: 'lotusFlurry',
    combat: Object.freeze({
      mult: Object.freeze([0.42, 0.05]),
      finaleMult: Object.freeze([1.1, 0.12]),
      hits: Object.freeze([8, 1]),
      radius: Object.freeze([3, 0.14]),
      finaleRadius: 3.9,
      knockback: 1.2,
      finaleKnockback: 5,
      criticalBonus: 0.22,
      invuln: 0.6,
      status: Object.freeze({ id: 'bleed', duration: 3, dps: 0.09, tick: 0.4, power: 1 }),
    }),
    evolution:Object.freeze({forms:Object.freeze({
      20:Object.freeze({label:'Eight Petal',summary:'Eight exact radial petal lines strike directly.',timeline:Object.freeze({hits:Object.freeze([.18,.62])}),combat:Object.freeze({petalLines:8})}),
      60:Object.freeze({label:'Shadow Petals',summary:'Bounded delayed petals echo unique sources.',anim:'attack_5',combat:Object.freeze({echoCap:6,echoMult:.3})}),
      100:Object.freeze({label:'Moonless Lotus',summary:'Eight lines end in one direct detonation.',anim:'skill_death_lotus',timeline:Object.freeze({hits:Object.freeze([.16,.5,.84])}),combat:Object.freeze({moonless:1,petalLines:8,moonlessFinaleMult:.9,apexFinisher:1}),presentation:Object.freeze({apexMarker:'moonless_finale',apexAudio:'death_lotus'})}),
    }),mutations:Object.freeze({
      40:Object.freeze({crimson_lotus:Object.freeze({label:'Crimson Lotus',summary:'Widens pack petals with bleed cadence.',icon:'lotus.breadth',combat:Object.freeze({radiusMult:1.3,bleedEvery:2})}),phantom_lotus:Object.freeze({label:'Phantom Lotus',summary:'Tightens shadow petals for focused center output.',icon:'lotus.focus',combat:Object.freeze({radiusMult:.72,damageMult:1.35})})}),
      80:Object.freeze({harvest:Object.freeze({label:'Harvest',summary:'Executes weakened normal and elite prey, never bosses.',icon:'lotus.flow',combat:Object.freeze({executeThreshold:.28,executeMult:.65})}),one_target:Object.freeze({label:'One Target',summary:'Redirects bounded petals into durable prey.',icon:'lotus.execution',combat:Object.freeze({redirectCap:4,durableMult:.55,durableStagger:20})})}),
    })}),
    description: 'A whirling close-range blade flurry where every cut can crit.',
    rankText: rank => `Damage ${Math.round((0.42 + rank * 0.05) * 100)}% ×${8 + rank} · Crit +22%`,
  },
  // —— Rogue passives ——
  keen_edge: {
    id: 'keen_edge', classId: 'rogue', name: 'Keen Edge', passive: true, unlockLevel: 2, maxRank: 10,
    effect: { crit: .01, attack: .015 },
    description: 'Hones every blade toward the vitals.',
    rankText: rank => `Crit +${rank}% · Attack +${rank * 1.5}%`,
  },
  swift_hands: {
    id: 'swift_hands', classId: 'rogue', name: 'Swift Hands', passive: true, unlockLevel: 2, maxRank: 10,
    effect: { haste: .012 },
    description: 'Trains dagger tempo beyond mortal speed.',
    rankText: rank => `Attack Speed +${(rank * 1.2).toFixed(1)}%`,
  },
  shadow_veil: {
    id: 'shadow_veil', classId: 'rogue', name: 'Shadow Veil', passive: true, unlockLevel: 5, maxRank: 10,
    effect: { hp: .025, defense: .02, mpRegen: .04, mpFlat: 2 },
    description: 'Wraps the body in gloom that dulls incoming blows.',
    rankText: rank => `HP +${rank * 2.5}% · Defense +${rank * 2}% · MP Regen +${rank * 4}%`,
  },
  plunder: {
    id: 'plunder', classId: 'rogue', name: 'Plunder', passive: true, unlockLevel: 8, maxRank: 10,
    effect: { luck: .03, gold: .04 },
    description: 'A thief’s eye for rare spoils and coin.',
    rankText: rank => `Luck +${rank * 3}% · Gold +${rank * 4}%`,
  },
  opportunist: {
    id: 'opportunist', classId: 'rogue', name: 'Opportunist', passive: true, unlockLevel: 12, maxRank: 5,
    effect: { statusCrit: .015 },
    description: 'Strikes at weakness — extra crit chance against bleeding or slowed prey.',
    rankText: rank => `Crit +${(rank * 1.5).toFixed(1)}% vs bleeding/slowed`,
  },
  // —— Ranger actives —— physical bow · mark & trap
  piercing_shot: {
    id: 'piercing_shot', classId: 'ranger', name: 'Harpoon Shot', key: 'Q', unlockLevel: 3, maxRank: 10, mp: 16, cooldown: 4.8,
    castTime: .34, anim: 'skill_pierce_shot', animFallback: 'cast_2', effect: 'piercing_shot',
    theme: 'hunt_amber', sfx: 'skill_bow', recipe: 'arrowStreak',
    timeline: Object.freeze({ hits: Object.freeze([0.34]) }),
    combat: Object.freeze({
      mult: Object.freeze([1.65, 0.22]),
      targetRange: Object.freeze([24, 0.5]),
      speed: Object.freeze([18, 0.4]),
      radius: 0.95,
      pierce: Object.freeze([3, 0.4]),
      /** ×5 prior life 1.15 → 5× travel without collision tunneling. */
      life: 5.75,
      // Corridor yank: foes near the flight path snap onto the arrow line.
      harpoonWidth: Object.freeze([3.4, 0.08]),
      harpoonCap: 8,
      harpoonSpacing: 1.35,
      knockback: 2.4,
      scale: 1.05,
      armorPierce: 0.18,
      status: Object.freeze({ id: 'bleed', duration: 2.2, dps: 0.09, tick: 0.45, power: 1 }),
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Fishbone Flight', summary: 'Pierces release perpendicular splinters.', combat: Object.freeze({ fishbone: 1, splinterCap: 12, splinterMult: .22 }) }),
        60: Object.freeze({ label: 'Backward Release', summary: 'Stored pierce points fire backward once.', anim: 'cast_2', combat: Object.freeze({ backwardRelease: 1, storedPierceCap: 6, backwardMult: .3 }) }),
        100: Object.freeze({ label: 'Horizon Breaker', summary: 'Pierce points rupture with capped repeats.', anim: 'skill_pierce_shot', combat: Object.freeze({ horizonBreaker: 1, ruptureCap: 6, rupturePerEnemyCap: 2, ruptureMult: .36, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'horizon_rupture',apexAudio:'piercing_shot'}) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          rail_arrow: Object.freeze({ label: 'Rail Arrow', summary: 'Narrows and accelerates the pressure line.', icon: 'arrow.focus', combat: Object.freeze({ railArrow: 1, speedMult: 1.35, radiusMult: .72, damageMult: 1.22 }) }),
          split_arrow: Object.freeze({ label: 'Split Arrow', summary: 'First pierce divides into three paths.', icon: 'arrow.breadth', combat: Object.freeze({ splitArrow: 1, splitPaths: 3, splitMult: .48 }) }),
        }),
        80: Object.freeze({
          crowd_skewer: Object.freeze({ label: 'Crowd Skewer', summary: 'Extends bounded pack penetration.', icon: 'arrow.flow', combat: Object.freeze({ crowdPierce: 3 }) }),
          dragon_piercer: Object.freeze({ label: 'Dragon Piercer', summary: 'Converts the draw into durable-target pressure.', icon: 'arrow.execution', combat: Object.freeze({ dragonPiercer: 1, bossStagger: 24, armorPierce: .52 }) }),
        }),
      }),
    }),
    description: 'Auto-locks the nearest prey and drives a seeking harpoon through its line.',
    rankText: rank => `Damage ${Math.round((1.65 + rank * 0.22) * 100)}% · Line-pull ${(3.4 + rank * 0.08).toFixed(1)} · Pierce ${Math.round(3 + rank * 0.4)}`,
  },
  caltrop_trap: {
    id: 'caltrop_trap', classId: 'ranger', name: 'Thorn Pit', key: 'E', unlockLevel: 6, maxRank: 10, mp: 22, cooldown: 8.0,
    castTime: .32, anim: 'skill_trap', animFallback: 'cast_3', effect: 'caltrop_trap',
    theme: 'thorn', sfx: 'skill_trap', recipe: 'trapField',
    combat: Object.freeze({
      // Opening pit burst is the star; ticks are secondary chips.
      mult: Object.freeze([0.55, 0.07]),
      openMult: Object.freeze([1.55, 0.18]),
      radius: Object.freeze([3.6, 0.14]),
      /** Instant plant distance ahead of the hunter (readable kill-box, not 37m lob). */
      aim: 9.5,
      targetRange: Object.freeze([22, 0.45]),
      clusterRadius: 5.5,
      pitCap: 8,
      pitRing: 1.4,
      holdDuration: 1.0,
      ticks: Object.freeze([3, 0]),
      tickInterval: 0.5,
      knockback: 0.4,
      status: Object.freeze({ id: 'slow', duration: 1.8, power: 0.55 }),
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Thornburst', summary: 'Opening and closing spikes deal direct damage.', combat: Object.freeze({ openClose: 1, burstMult: .85 }) }),
        60: Object.freeze({ label: 'Planted Battery', summary: 'Every third contact fires a planted arrow.', anim: 'cast_3', combat: Object.freeze({ plantedEvery: 3, plantedCap: 4, plantedMult: .36 }) }),
        100: Object.freeze({ label: 'Thousand Thorn Garden', summary: 'Facing grid lines end in one eruption.', anim: 'skill_trap', combat: Object.freeze({ thornGrid: 1, gridLines: 5, finaleMult: 1.3, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'thorn_garden',apexAudio:'caltrop_trap'}) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          briar_field: Object.freeze({ label: 'Briar Field', summary: 'Expands pit coverage and stack cap.', icon: 'thorn.breadth', combat: Object.freeze({ radiusMult: 1.35, pitCap: 10, lineCount: 5 }) }),
          blast_seed: Object.freeze({ label: 'Blast Seed', summary: 'Compresses the pit into immediate force.', icon: 'thorn.focus', combat: Object.freeze({ radiusMult: .78, seedMult: 1.2, openMult: Object.freeze([1.85, 0.22]) }) }),
        }),
        80: Object.freeze({
          snare_bloom: Object.freeze({ label: 'Snare Bloom', summary: 'Bounded lines guide normal prey into the pit.', icon: 'thorn.flow', combat: Object.freeze({ snareBloom: 1, snareCap: 5 }) }),
          mine_garden: Object.freeze({ label: 'Mine Garden', summary: 'Durable prey trigger capped mines.', icon: 'thorn.execution', combat: Object.freeze({ mineGarden: 1, mineCap: 3, mineCooldown: .55, mineMult: .6 }) }),
        }),
      }),
    }),
    description: 'Auto-locks the highest-priority nearby foe, drops a thorn pit, and bursts it repeatedly.',
    rankText: rank => `Open ${Math.round((1.55 + rank * 0.18) * 100)}% · Pit ${(3.6 + rank * 0.14).toFixed(1)} · Hold`,
  },
  vault_shot: {
    id: 'vault_shot', classId: 'ranger', name: 'Hunter Volley', key: 'R', unlockLevel: 10, maxRank: 10, mp: 26, cooldown: 9.0,
    castTime: .42, anim: 'skill_vault_shot', animFallback: 'dodge', effect: 'vault_shot',
    theme: 'windleaf', sfx: 'skill_bow', recipe: 'vaultVolley',
    combat: Object.freeze({
      mult: Object.freeze([0.58, 0.07]),
      arrows: Object.freeze([4, 1]),
      targetRange: Object.freeze([21, 0.45]),
      targetCap: 4,
      speed: Object.freeze([16.5, 0.3]),
      spread: 0.14,
      radius: 0.88,
      /** ×5 prior life 0.85 → 5× volley reach. */
      life: 4.25,
      knockback: 2.6,
      criticalBonus: 0.06,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Seeking Salvo', summary: 'The locked target zone gains a direct opening burst.', combat: Object.freeze({ launchBlast: 1, landingShot: 1 }) }),
        60: Object.freeze({ label: 'Relentless Volley', summary: 'A second seeking arrow layer follows the first.', anim: 'dodge', combat: Object.freeze({ airVolley: 1, volleyLayers: 2 }) }),
        100: Object.freeze({ label: 'Sky Hunter', summary: 'Three seeking layers synchronize on hostile targets.', anim: 'skill_vault_shot', combat: Object.freeze({ skyHunter: 1, volleyLayers: 3, arrowCap: 12, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'sky_hunter',apexAudio:'vault_shot'}) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          gale_vault: Object.freeze({ label: 'Gale Barrage', summary: 'Seeking arrows spread across more distinct targets.', icon: 'vault.breadth', combat: Object.freeze({ targetCap: 7, spreadMult: 1.35 }) }),
          counter_volley: Object.freeze({ label: 'Focused Volley', summary: 'All arrows concentrate on one locked target.', icon: 'vault.focus', combat: Object.freeze({ targetCap: 1, spreadMult: .68, damageMult: 1.2 }) }),
        }),
        80: Object.freeze({
          escape_artist: Object.freeze({ label: 'Relentless Hunt', summary: 'Arrows reacquire living prey between volley layers.', icon: 'vault.flow', combat: Object.freeze({ redirect: 1, redirectCap: 6 }) }),
          perfect_distance: Object.freeze({ label: 'Trophy Volley', summary: 'Hits deal extra damage to elite and boss targets.', icon: 'vault.execution', combat: Object.freeze({ durableMult: 1.55 }) }),
        }),
      }),
    }),
    description: 'Remains in place and fires layered seeking arrows at nearby hostile targets.',
    rankText: rank => `Damage ${Math.round((0.58 + rank * 0.07) * 100)}% · Seeking arrows ${4 + rank}`,
  },
  hunter_mark: {
    id: 'hunter_mark', classId: 'ranger', name: 'Predator Barrage', key: 'C', unlockLevel: 16, maxRank: 10, mp: 34, cooldown: 13.5,
    castTime: .5, anim: 'skill_hunter_mark', animFallback: 'cast_4', effect: 'hunter_mark',
    theme: 'hunt_gold', sfx: 'skill_bow', recipe: 'markGlyph',
    combat: Object.freeze({
      mult: Object.freeze([0.42, 0.045]),
      hits: Object.freeze([6, 0.5]),
      targetRange: Object.freeze([24, 0.5]),
      targetCap: 2,
      markDuration: 2.8,
      exposePower: Object.freeze([0.22, 0.03]),
      damageAmp: Object.freeze([0.16, 0.025]),
      knockback: 0.65,
      criticalBonus: 0.08,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Raking Fire', summary: 'Two additional auto-targeted hits extend the barrage.', combat: Object.freeze({ bonusHits: 2 }) }),
        60: Object.freeze({ label: 'Piercing Verdict', summary: 'Each hit gains armor penetration.', anim: 'cast_4', combat: Object.freeze({ verdictPierce: 1 }) }),
        100: Object.freeze({ label: 'Apex Predator', summary: 'The final hit converges into one direct blast.', anim: 'skill_hunter_mark', combat: Object.freeze({ apexVerdict: 1, convergenceMult: .65, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'predator_verdict',apexAudio:'hunter_mark'}) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          pack_hunt: Object.freeze({ label: 'Pack Hunt', summary: 'The barrage rotates across four nearby targets.', icon: 'mark.breadth', combat: Object.freeze({ targetCap: 4, secondaryMult: .88 }) }),
          prime_target: Object.freeze({ label: 'Prime Target', summary: 'All hits focus one prey with increased damage.', icon: 'mark.focus', combat: Object.freeze({ targetCap: 1, damageMult: 1.3, exposeMult: 1.25 }) }),
        }),
        80: Object.freeze({
          chain_verdict: Object.freeze({ label: 'Chain Verdict', summary: 'Two echo hits reacquire surviving prey.', icon: 'mark.flow', combat: Object.freeze({ echoHits: 2, echoMult: .55 }) }),
          trophy_shot: Object.freeze({ label: 'Trophy Shot', summary: 'Durable prey take extra damage and boss stagger.', icon: 'mark.execution', combat: Object.freeze({ durableMult: 1.45, bossStagger: 26 }) }),
        }),
      }),
    }),
    description: 'Immediately auto-locks nearby prey and unloads a rapid multi-hit barrage.',
    rankText: rank => `${Math.round(6 + rank * 0.5)} seeking hits · ${Math.round((0.42 + rank * 0.045) * 100)}% each`,
  },
  // —— Ranger passives ——
  eagle_eye: {
    id: 'eagle_eye', classId: 'ranger', name: 'Eagle Eye', passive: true, unlockLevel: 2, maxRank: 10,
    effect: { crit: .01, attack: .015 },
    description: 'Sharpens aim for vital shots.',
    rankText: rank => `Crit +${rank}% · Attack +${rank * 1.5}%`,
  },
  fleet_foot: {
    id: 'fleet_foot', classId: 'ranger', name: 'Fleet Foot', passive: true, unlockLevel: 2, maxRank: 10,
    effect: { haste: .01, moveSpeed: .02 },
    description: 'Keeps distance while drawing the next arrow.',
    rankText: rank => `Attack Speed +${rank}% · Move +${(rank * 2).toFixed(0)}%`,
  },
  /**
   * Strafe — Diablo Amazon-style multi-shot basic attack conversion.
   * From level 5 the ranger basic attack becomes a 10-arrow auto-aimed volley.
   * Ranks improve per-arrow power (and light skill/haste bonuses); baseline fires at L5 even at rank 0.
   */
  strafe: {
    id: 'strafe', classId: 'ranger', name: 'Strafe', passive: true, unlockLevel: 5, maxRank: 10,
    effect: { skillPower: .015, haste: .008, dotPower: .02 },
    combat: Object.freeze({
      shots: 10,
      /**
       * Per-arrow mult of attackPower: base + perRank * rank.
       * 10×0.36 ≈ 3.6× a single basic on one target (strong multi-hit, Amazon Strafe feel).
       */
      mult: Object.freeze([.36, .022]),
      /** Auto-aim lock radius (×5 prior 48.6). */
      range: 243,
      interval: .038,
      speed: 24,
      /** ×5 prior life 2.6 so volleys cover the extended lock radius. */
      life: 13,
      pierce: 1,
      knockback: 1.35,
      finisherMult: 1.28,
    }),
    description: 'From level 5, basic attacks become a ten-arrow auto-aimed volley that locks onto distant foes.',
    rankText: rank => `Arrow power +${(rank * 2.2).toFixed(1)}% · Attack Speed +${(rank * .8).toFixed(1)}% · Skill Power +${(rank * 1.5).toFixed(1)}%`,
  },
  scavenger: {
    id: 'scavenger', classId: 'ranger', name: 'Scavenger', passive: true, unlockLevel: 8, maxRank: 10,
    effect: { luck: .03, gold: .035 },
    description: 'A tracker’s eye for hides, coin, and rare finds.',
    rankText: rank => `Luck +${rank * 3}% · Gold +${rank * 3.5}%`,
  },
  predator: {
    id: 'predator', classId: 'ranger', name: 'Predator', passive: true, unlockLevel: 12, maxRank: 5,
    effect: { execute: .035, statusCrit: .01 },
    description: 'Finishes wounded and marked prey with precision.',
    rankText: rank => `+${rank * 3.5}% vs under 30% HP · Crit vs afflicted +${rank}%`,
  },

  // —— Gunner actives ——
  suppressive_burst: {
    id: 'suppressive_burst', classId: 'gunner', name: 'Suppressive Burst', key: 'Q', unlockLevel: 3, maxRank: 10, mp: 16, cooldown: 5.2,
    castTime: .28, anim: 'skill_suppressive_burst', animFallback: 'cast_2', effect: 'suppressive_burst',
    theme: 'brassfire', sfx: 'skill_rifle', recipe: 'rifleBurst',
    timeline: Object.freeze({ hits: Object.freeze([0.22, 0.4, 0.58]) }),
    combat: Object.freeze({
      mult: Object.freeze([1.55, 0.18]),
      range: 24,
      pierce: 4,
      radius: 0.9,
      knockback: 2.1,
      status: Object.freeze({ id: 'slow', duration: 1.5, power: 0.3 }),
      armorPierce: 0.18,
      criticalBonus: 0.1,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Lane Drill', summary: 'Adds pierce and lane pressure.', combat: Object.freeze({ pierce: 5, radius: 0.85 }) }),
        60: Object.freeze({ label: 'Brass Storm', summary: 'Faster cadence with wider lane.', anim: 'cast_2', combat: Object.freeze({ pierce: 6, radiusMult: 1.15 }) }),
        100: Object.freeze({ label: 'Overwatch Barrage', summary: 'Maximum pierce and suppression.', anim: 'skill_suppressive_burst', combat: Object.freeze({ pierce: 8, apexFinisher: 1 }), presentation: Object.freeze({ apexMarker: 'overwatch', apexAudio: 'suppressive_burst' }) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          wide_lane: Object.freeze({ label: 'Wide Lane', summary: 'Broadens the suppression corridor.', icon: 'rifle.breadth', combat: Object.freeze({ radius: 1.05, pierce: 5 }) }),
          hard_pin: Object.freeze({ label: 'Hard Pin', summary: 'Tighter lane, stronger slow.', icon: 'rifle.focus', combat: Object.freeze({ radius: 0.55, damageMult: 1.2, status: Object.freeze({ id: 'slow', duration: 2.1, power: 0.4 }) }) }),
        }),
        80: Object.freeze({
          drum_fire: Object.freeze({ label: 'Drum Fire', summary: 'Extra pierce through packs.', icon: 'rifle.flow', combat: Object.freeze({ pierce: 7 }) }),
          armor_drill: Object.freeze({ label: 'Armor Drill', summary: 'Pierces durable armor.', icon: 'rifle.execution', combat: Object.freeze({ armorPierce: 0.35 }) }),
        }),
      }),
    }),
    description: 'Fires a controlled rifle burst through a narrow lane, slowing survivors.',
    rankText: rank => `Damage ${Math.round((1.55 + rank * 0.18) * 100)}% ×3 · Pierce ${4 + Math.floor(rank / 4)}`,
  },
  flame_jet: {
    id: 'flame_jet', classId: 'gunner', name: 'Flame Jet', key: 'E', unlockLevel: 6, maxRank: 10, mp: 22, cooldown: 7.4,
    castTime: .32, anim: 'skill_flame_jet', animFallback: 'cast_3', effect: 'flame_jet',
    theme: 'ember', sfx: 'skill_fire', recipe: 'flameJet',
    timeline: Object.freeze({ hits: Object.freeze([0.18, 0.36, 0.54, 0.72]) }),
    combat: Object.freeze({
      mult: Object.freeze([2.15, 0.23]),
      range: 8.2,
      halfAngle: 0.62,
      ticks: 4,
      tickInterval: 0.12,
      cap: 12,
      status: Object.freeze({ id: 'burn', duration: 2.5, dps: 0.14, tick: 0.4, power: 1 }),
      knockback: 0.55,
      armorPierce: 0.14,
      criticalBonus: 0.08,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Jet Fan', summary: 'Wider cone coverage.', combat: Object.freeze({ halfAngle: 0.68 }) }),
        60: Object.freeze({ label: 'Sustained Torch', summary: 'Extra flame ticks.', anim: 'cast_3', combat: Object.freeze({ ticks: 5 }) }),
        100: Object.freeze({ label: 'Plasma Jet', summary: 'Apex cone with denser burn.', anim: 'skill_flame_jet', combat: Object.freeze({ ticks: 6, apexFinisher: 1 }), presentation: Object.freeze({ apexMarker: 'plasma_jet', apexAudio: 'flame_jet' }) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          wide_jet: Object.freeze({ label: 'Wide Jet', summary: 'Broader cone for packs.', icon: 'jet.breadth', combat: Object.freeze({ halfAngle: 0.72, range: 7.0 }) }),
          needle_jet: Object.freeze({ label: 'Needle Jet', summary: 'Longer focused cone.', icon: 'jet.focus', combat: Object.freeze({ halfAngle: 0.38, range: 8.6, damageMult: 1.18 }) }),
        }),
        80: Object.freeze({
          sticky_fuel: Object.freeze({ label: 'Sticky Fuel', summary: 'Longer, stronger Burn.', icon: 'jet.flow', combat: Object.freeze({ status: Object.freeze({ id: 'burn', duration: 3.4, dps: 0.17, tick: 0.4, power: 1 }) }) }),
          flashover: Object.freeze({ label: 'Flashover', summary: 'Heavier direct jet damage.', icon: 'jet.execution', combat: Object.freeze({ damageMult: 1.35 }) }),
        }),
      }),
    }),
    description: 'Projects a short-range incendiary cone. Burn applies once per cast per target.',
    rankText: rank => `Damage ${Math.round((2.15 + rank * 0.23) * 100)}% · Cone 8.2m`,
  },
  stim_rush: {
    id: 'stim_rush', classId: 'gunner', name: 'Stim Rush', key: 'R', unlockLevel: 10, maxRank: 10, mp: 18, cooldown: 12,
    castTime: .18, anim: 'skill_stim_rush', animFallback: 'cast_1', effect: 'stim_rush',
    theme: 'brassfire', sfx: 'skill_rifle', recipe: 'stimPulse',
    timeline: Object.freeze({ hits: Object.freeze([0.2]) }),
    combat: Object.freeze({
      mult: Object.freeze([0.35, 0.035]),
      duration: Object.freeze([7, 0.2]),
      attackSpeed: Object.freeze([0.26, 0.014]),
      moveSpeed: Object.freeze([0.2, 0.012]),
      radius: 3.6,
      knockback: 3,
      criticalBonus: 0.08,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Field Stim', summary: 'Longer rush window.', combat: Object.freeze({ duration: Object.freeze([7.0, 0.2]) }) }),
        60: Object.freeze({ label: 'Combat Cocktail', summary: 'Stronger attack cadence.', anim: 'cast_1', combat: Object.freeze({ attackSpeed: Object.freeze([0.28, 0.014]) }) }),
        100: Object.freeze({ label: 'Overdrive', summary: 'Peak tempo and mobility.', anim: 'skill_stim_rush', combat: Object.freeze({ attackSpeed: Object.freeze([0.34, 0.016]), moveSpeed: Object.freeze([0.24, 0.012]), apexFinisher: 1 }), presentation: Object.freeze({ apexMarker: 'overdrive', apexAudio: 'stim_rush' }) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          long_stim: Object.freeze({ label: 'Long Stim', summary: 'Extends rush duration.', icon: 'stim.breadth', combat: Object.freeze({ duration: Object.freeze([7.4, 0.22]) }) }),
          spike_stim: Object.freeze({ label: 'Spike Stim', summary: 'Shorter, sharper haste.', icon: 'stim.focus', combat: Object.freeze({ duration: Object.freeze([5.0, 0.12]), attackSpeed: Object.freeze([0.32, 0.016]) }) }),
        }),
        80: Object.freeze({
          field_march: Object.freeze({ label: 'Field March', summary: 'More movement speed.', icon: 'stim.flow', combat: Object.freeze({ moveSpeed: Object.freeze([0.24, 0.014]) }) }),
          kill_tempo: Object.freeze({ label: 'Kill Tempo', summary: 'Haste-focused rush.', icon: 'stim.execution', combat: Object.freeze({ attackSpeed: Object.freeze([0.36, 0.018]) }) }),
        }),
      }),
    }),
    description: 'Detonates a close-range stimulant shockwave, then surges attack and movement speed.',
    rankText: rank => `Shockwave ${Math.round((0.35 + rank * 0.035) * 100)}% · Haste +${Math.round((0.26 + rank * 0.014) * 100)}% · ${ (7 + rank * 0.2).toFixed(1)}s`,
  },
  inferno_sweep: {
    id: 'inferno_sweep', classId: 'gunner', name: 'Inferno Sweep', key: 'C', unlockLevel: 16, maxRank: 10, mp: 34, cooldown: 14,
    castTime: .48, anim: 'skill_inferno_sweep', animFallback: 'cast_4', effect: 'inferno_sweep',
    theme: 'ember', sfx: 'skill_fire', recipe: 'infernoSweep',
    timeline: Object.freeze({ hits: Object.freeze([0.28, 0.55]) }),
    combat: Object.freeze({
      mult: Object.freeze([2.9, 0.32]),
      range: 9.5,
      arc: 2.4,
      knockback: 3.4,
      zoneCount: 3,
      zoneLife: 3.2,
      zoneRadius: 2.8,
      zoneMult: 0.34,
      armorPierce: 0.12,
      criticalBonus: 0.12,
      status: Object.freeze({ id: 'burn', duration: 2.8, dps: 0.12, tick: 0.4, power: 1 }),
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Wide Inferno', summary: 'Broader sweep arc.', combat: Object.freeze({ arc: 2.8 }) }),
        60: Object.freeze({ label: 'Napalm Lattice', summary: 'Extra ground zones.', anim: 'cast_4', combat: Object.freeze({ zoneCount: 4 }) }),
        100: Object.freeze({ label: 'Thermite Crown', summary: 'Apex sweep and denser ground fire.', anim: 'skill_inferno_sweep', combat: Object.freeze({ zoneCount: 5, zoneLife: 4.0, apexFinisher: 1 }), presentation: Object.freeze({ apexMarker: 'thermite', apexAudio: 'inferno_sweep' }) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          wide_sweep: Object.freeze({ label: 'Wide Sweep', summary: 'Covers more of the front arc.', icon: 'inferno.breadth', combat: Object.freeze({ arc: 2.9, range: 8.2 }) }),
          deep_burn: Object.freeze({ label: 'Deep Burn', summary: 'Longer, stronger ground fire.', icon: 'inferno.focus', combat: Object.freeze({ zoneLife: 4.2, zoneMult: 0.38 }) }),
        }),
        80: Object.freeze({
          zone_web: Object.freeze({ label: 'Zone Web', summary: 'More simultaneous ground zones.', icon: 'inferno.flow', combat: Object.freeze({ zoneCount: 5 }) }),
          blast_core: Object.freeze({ label: 'Blast Core', summary: 'Heavier initial sweep damage.', icon: 'inferno.execution', combat: Object.freeze({ damageMult: 1.3 }) }),
        }),
      }),
    }),
    description: 'Sweeps a wide near-field arc, then seeds short burning-ground zones.',
    rankText: rank => `Damage ${Math.round((2.9 + rank * 0.32) * 100)}% · Ground ${Math.round(0.34 * 100)}% · Zones 3`,
  },
  ballistic_drill: {
    id: 'ballistic_drill', classId: 'gunner', name: 'Ballistic Drill', passive: true, unlockLevel: 2, maxRank: 10,
    effect: { attack: 0.018, haste: 0.008 },
    description: 'Disciplined rifle drills raise basic damage and cadence (additive per rank).',
    rankText: rank => `Attack +${(rank * 1.8).toFixed(1)}% · Haste +${(rank * 0.8).toFixed(1)}%`,
  },
  combat_plating: {
    id: 'combat_plating', classId: 'gunner', name: 'Combat Plating', passive: true, unlockLevel: 2, maxRank: 10,
    effect: { defense: 0.02, hp: 0.015 },
    description: 'Industrial rescue plating for flame-range trades (additive per rank).',
    rankText: rank => `Defense +${(rank * 2).toFixed(1)}% · HP +${(rank * 1.5).toFixed(1)}%`,
  },
  smartlink: {
    id: 'smartlink', classId: 'gunner', name: 'Smartlink', passive: true, unlockLevel: 5, maxRank: 10,
    effect: { luck: 0.008 },
    unlockNotice: Object.freeze({
      level: 5,
      id: 'smartlink',
      title: 'SMARTLINK ONLINE',
      body: 'Basic rifle attacks now acquire targets near your aim direction.',
    }),
    description: 'At level 5+, each attack press can acquire a valid target near facing. Ranks slightly improve acquisition feel via luck (does not auto-fire).',
    rankText: rank => `Smartlink active at Lv.5 · Luck +${(rank * 0.8).toFixed(1)}%`,
  },
  scorched_earth: {
    id: 'scorched_earth', classId: 'gunner', name: 'Scorched Earth', passive: true, unlockLevel: 8, maxRank: 10,
    effect: { skillPower: 0.02, dotPower: 0.025 },
    description: 'Improves Burn and ground-zone damage (additive skillPower/dotPower per rank).',
    rankText: rank => `Skill Power +${(rank * 2).toFixed(1)}% · Burn power +${(rank * 2.5).toFixed(1)}%`,
  },
  last_mag: {
    id: 'last_mag', classId: 'gunner', name: 'Last Mag', passive: true, unlockLevel: 12, maxRank: 5,
    effect: { execute: 0.03, crit: 0.01 },
    description: 'Clutch tempo vs wounded prey after sustained fire (execute + crit, additive).',
    rankText: rank => `+${rank * 3}% vs low HP · Crit +${rank}%`,
  },
});

export const HUNT_TITLES = Object.freeze([
  { kills: 0, name: 'Novice Hunter' },
  { kills: 80, name: 'Meadow Stalker' },
  { kills: 250, name: 'Pack Breaker' },
  { kills: 600, name: 'Elite Hunter' },
  { kills: 1200, name: 'Wild Sovereign' },
  { kills: 2500, name: 'Starfall Conqueror' },
  { kills: 5000, name: 'Legendary Blade' },
]);

/** Default playable class when save/UI omit classId. */
export const DEFAULT_HERO_CLASS_ID = 'aerin';

const SKILL_KEY_CODES = Object.freeze({
  Q: 'KeyQ', E: 'KeyE', R: 'KeyR', C: 'KeyC',
});

/**
 * Playable hero classes.
 * Add a job: row here + hero.<id> GLB + CLASS_LOOKS + skills with matching classId + optional weapon model.
 */
export const HERO_CLASSES = Object.freeze({
  aerin: Object.freeze({
    id: 'aerin',
    name: 'Gareth',
    title: 'Iron Knight',
    blurb: 'Plate armor · heavy blade combos',
    modelKey: 'hero.aerin',
    lookId: 'aerin',
    attackStyle: 'melee',
    skillPanelTitle: 'Knight Arts & Oath Instincts',
    attackLabel: 'Strike',
    activeSkills: Object.freeze(['whirlwind', 'crescent', 'skyfall', 'starburst']),
    passiveSkills: Object.freeze(['might', 'vitality', 'focus', 'fortune', 'executioner']),
    baseStatMods: Object.freeze({ attack: 1.06, mp: 0.95, skillPower: 0 }),
    apexKeystone: Object.freeze({ id:'broken_crown', unlockLevel:100, trigger:'apex_finisher', requires:'armor_break', staggerBonus:22, perTargetCap:1 }),
    // Blades only — no staff/bow/dagger for the knight silhouette.
    weaponBias: Object.freeze({ preferred: Object.freeze(['sword', 'greatsword', 'saber', 'katana', 'leaf', 'relic']), mult: 1.8, otherMult: 0 }),
    // Rage charges mostly from damage taken and landed hits; the full gauge
    // (Lv3+) turns the next attack click into a Wrath Slam heavy crush.
    energy: Object.freeze({
      label: 'Rage',
      effect: 'wrath_slam',
      max: 100,
      perHit: 4,
      perCrit: 2,
      perDamageTaken: 9,
      comboUnlockLevel: 3,
      slamMult: 2.6,
      slamRadius: 4.6,
      slamKnockback: 7.5,
      slamArmorPierce: .3,
      slamCritBonus: .12,
    }),
    starterWeapon: Object.freeze({
      id: 'starter-field-blade',
      baseId: 'field_blade',
      slot: 'weapon',
      name: 'Knight Longsword',
      rarity: 'common',
      level: 1,
      itemLevel: 1,
      power: 12,
      speed: .94,
      crit: .025,
      model: 'sword',
      color: 0xd8e4f0,
      locked: true,
    }),
  }),
  wizard: Object.freeze({
    id: 'wizard',
    name: 'Lyra',
    title: 'Arcane Adept',
    blurb: 'Staff caster · elemental spells',
    modelKey: 'hero.wizard',
    lookId: 'wizard',
    attackStyle: 'magic',
    skillPanelTitle: 'Arcane Arts & Mana Lore',
    attackLabel: 'Cast',
    activeSkills: Object.freeze(['fireball', 'frost_nova', 'arcane_blink', 'meteor_storm']),
    passiveSkills: Object.freeze(['arcane_might', 'mana_ward', 'mana_font', 'star_luck', 'pyromancer']),
    baseStatMods: Object.freeze({ attack: .92, mp: 1.28, skillPower: .08 }),
    apexKeystone: Object.freeze({ id:'overflow_overcast', unlockLevel:100, trigger:'apex_cast', overflowMax:100, overflowCost:100, reactionGain:25, perCastCap:1 }),
    // Staves only for the wizard silhouette.
    weaponBias: Object.freeze({ preferred: Object.freeze(['staff', 'relic']), mult: 2.8, otherMult: 0 }),
    starterWeapon: Object.freeze({
      id: 'starter-apprentice-staff',
      baseId: 'oak_staff',
      slot: 'weapon',
      name: 'Apprentice Staff',
      rarity: 'common',
      level: 1,
      itemLevel: 1,
      power: 9,
      speed: 1.04,
      crit: .035,
      model: 'staff',
      color: 0xc8b4ff,
      skillPower: .08,
      locked: true,
    }),
  }),
  rogue: Object.freeze({
    id: 'rogue',
    name: 'Vex',
    title: 'Night Fang',
    blurb: 'Twin daggers · crit flurry',
    modelKey: 'hero.rogue',
    lookId: 'rogue',
    attackStyle: 'melee',
    skillPanelTitle: 'Shadow Arts & Killer Instinct',
    attackLabel: 'Slash',
    activeSkills: Object.freeze(['twin_fang', 'fan_of_knives', 'shadowstep', 'death_lotus']),
    passiveSkills: Object.freeze(['keen_edge', 'swift_hands', 'shadow_veil', 'plunder', 'opportunist']),
    // Glass cannon: hits harder than the knight but folds faster.
    baseStatMods: Object.freeze({ attack: 1.12, mp: 1.05, skillPower: 0, hp: .82, defense: .85 }),
    apexKeystone: Object.freeze({ id:'blood_echo', unlockLevel:100, trigger:'apex_finisher', bleedTierCap:3, duplicateMult:.22, targetCap:8, perTargetCap:3 }),
    // Daggers + light sabers only for the rogue.
    weaponBias: Object.freeze({ preferred: Object.freeze(['dagger', 'saber', 'relic']), mult: 2.5, otherMult: 0 }),
    // Short-reach fast blades: each click bursts into a 2-hit flurry (human click rate is the cap, not the blades).
    meleeProfile: Object.freeze({ rangeMult: .78, arcMult: 1.05, flurry: 2 }),
    // Focus charges on landed basic hits; when full, the next attack unleashes a level-scaled combo rush.
    energy: Object.freeze({
      label: 'Energy',
      effect: 'dagger_rush',
      max: 100,
      perHit: 7,
      perCrit: 4,
      comboUnlockLevel: 3,
      comboBaseHits: 4,
      comboHitsPerLevels: 4,
      comboMaxHits: 12,
      comboMult: .62,
      comboRange: 3.1,
      comboArc: 1.5,
      comboCritBonus: .25,
      comboInterval: .085,
    }),
    starterWeapon: Object.freeze({
      id: 'starter-night-dagger',
      baseId: 'night_fang',
      slot: 'weapon',
      name: 'Fledgling Dagger',
      rarity: 'common',
      level: 1,
      itemLevel: 1,
      power: 8,
      speed: 1.4,
      crit: .07,
      model: 'dagger',
      color: 0x9fe8d8,
      locked: true,
    }),
  }),
  ranger: Object.freeze({
    id: 'ranger',
    name: 'Sable',
    title: 'Wildshot',
    blurb: 'Bow hunter · mark & trap',
    modelKey: 'hero.ranger',
    lookId: 'ranger',
    attackStyle: 'ranged',
    skillPanelTitle: 'Hunt Arts & Tracker Instincts',
    attackLabel: 'Shot',
    activeSkills: Object.freeze(['piercing_shot', 'caltrop_trap', 'vault_shot', 'hunter_mark']),
    passiveSkills: Object.freeze(['eagle_eye', 'fleet_foot', 'strafe', 'scavenger', 'predator']),
    baseStatMods: Object.freeze({ attack: 1.0, mp: 1.08, skillPower: 0.04, hp: 0.9, defense: 0.88 }),
    apexKeystone: Object.freeze({ id:'marked_convergence', unlockLevel:100, trigger:'apex_finisher', convergenceMult:.35, markRequired:true, perCastCap:1 }),
    // Bows only — prevents ranger auto-equipping blades that break the hunt fantasy.
    weaponBias: Object.freeze({ preferred: Object.freeze(['bow', 'relic']), mult: 2.6, otherMult: 0 }),
    basicAttack: Object.freeze({
      bolts: 4,
      comboMults: Object.freeze([1.0, 1.08, 1.18, 1.42]),
      /** Bow projectile speed / lifetime (×5 prior life 3.6 → 5× travel). */
      arrowSpeed: 22,
      arrowLife: 18,
    }),
    energy: Object.freeze({
      label: 'Focus',
      effect: 'arrow_storm',
      max: 100,
      perHit: 6,
      perCrit: 3,
      comboUnlockLevel: 3,
      stormArrows: 8,
      stormMult: 0.55,
      stormSpread: 0.11,
      stormSpeed: 24,
      /** ×5 prior stormLife 3.3 so Focus burst matches extended bow reach. */
      stormLife: 16.5,
      stormCritBonus: 0.1,
    }),
    starterWeapon: Object.freeze({
      id: 'starter-yew-bow',
      baseId: 'yew_bow',
      slot: 'weapon',
      name: 'Fledgling Bow',
      rarity: 'common',
      level: 1,
      itemLevel: 1,
      power: 10,
      speed: 1.12,
      crit: .05,
      model: 'bow',
      color: 0xc4a574,
      locked: true,
    }),
  }),
  gunner: Object.freeze({
    id: 'gunner',
    name: 'Rook',
    title: 'Ember Vanguard',
    blurb: 'Rifle control · Smartlink · flame denial',
    modelKey: 'hero.gunner',
    lookId: 'gunner',
    attackStyle: 'ranged',
    skillPanelTitle: 'Ballistics & Incendiary Arts',
    attackLabel: 'Fire',
    presentation: Object.freeze({
      accent: '#e87838',
      jobLabel: 'EMBER VANGUARD',
      attackIcon: 'rifle',
      portraitKey: 'hero-gunner',
    }),
    activeSkills: Object.freeze(['suppressive_burst', 'flame_jet', 'stim_rush', 'inferno_sweep']),
    passiveSkills: Object.freeze(['ballistic_drill', 'combat_plating', 'smartlink', 'scorched_earth', 'last_mag']),
    baseStatMods: Object.freeze({ attack: 1.02, mp: 1.0, skillPower: 0.03, hp: 0.96, defense: 0.95 }),
    weaponBias: Object.freeze({ preferred: Object.freeze(['rifle', 'relic']), mult: 2.6, otherMult: 0 }),
    basicAttack: Object.freeze({
      profile: 'rifle',
      range: 26,
      comboRounds: Object.freeze([1, 1, 1, 3]),
      comboMults: Object.freeze([0.86, 0.94, 1.02, 0.5]),
      attackIcon: 'rifle',
      audioKind: 'rifle',
    }),
    starterWeapon: Object.freeze({
      id: 'starter-service-rifle',
      baseId: 'service_rifle',
      slot: 'weapon',
      name: 'Service Rifle',
      rarity: 'common',
      level: 1,
      itemLevel: 1,
      power: 11,
      speed: 1.08,
      crit: 0.04,
      model: 'rifle',
      color: 0xc8b090,
      locked: true,
    }),
  }),
});

/**
 * Enhancement changes the weapon's name, finish, and rarity without changing its
 * class-defining silhouette. Title preview and gameplay therefore share one weapon family.
 */
export const WEAPON_EVOLUTIONS = Object.freeze({
  aerin: Object.freeze([
    Object.freeze({ level: 0, name: 'Knight Longsword', model: 'sword', color: 0xd8e4f0, rarity: 'common' }),
    Object.freeze({ level: 3, name: 'Oathbound Saber', model: 'sword', color: 0xf0d48a, rarity: 'uncommon' }),
    Object.freeze({ level: 7, name: 'Sunsteel Greatblade', model: 'sword', color: 0xffb95f, rarity: 'rare' }),
    Object.freeze({ level: 15, name: 'Crownbreaker', model: 'sword', color: 0xff805c, rarity: 'epic' }),
    Object.freeze({ level: 22, name: 'Apex Aegis', model: 'sword', color: 0xe1b4ff, rarity: 'legendary' }),
    Object.freeze({ level: 30, name: 'Worldbreaker Aegis', model: 'sword', color: 0xffe38b, rarity: 'legendary' }),
  ]),
  wizard: Object.freeze([
    Object.freeze({ level: 0, name: 'Apprentice Staff', model: 'staff', color: 0xc8b4ff, rarity: 'common' }),
    Object.freeze({ level: 3, name: 'Crystal Rod', model: 'staff', color: 0x9ed8ff, rarity: 'uncommon' }),
    Object.freeze({ level: 7, name: 'Astral Scepter', model: 'staff', color: 0xc09aff, rarity: 'rare' }),
    Object.freeze({ level: 15, name: 'Void Conduit', model: 'staff', color: 0xe18bff, rarity: 'epic' }),
    Object.freeze({ level: 22, name: 'Starforged Focus', model: 'staff', color: 0xf1c2ff, rarity: 'legendary' }),
    Object.freeze({ level: 30, name: 'Event Horizon Focus', model: 'staff', color: 0x9ff6ff, rarity: 'legendary' }),
  ]),
  rogue: Object.freeze([
    Object.freeze({ level: 0, name: 'Fledgling Dagger', model: 'dagger', color: 0x9fe8d8, rarity: 'common' }),
    Object.freeze({ level: 3, name: 'Viper Kris', model: 'dagger', color: 0x68e6b3, rarity: 'uncommon' }),
    Object.freeze({ level: 7, name: 'Moonfang', model: 'dagger', color: 0xa8f0dc, rarity: 'rare' }),
    Object.freeze({ level: 15, name: 'Night Lotus', model: 'dagger', color: 0xd86fff, rarity: 'epic' }),
    Object.freeze({ level: 22, name: 'Eclipse Fang', model: 'dagger', color: 0xff98d8, rarity: 'legendary' }),
    Object.freeze({ level: 30, name: 'Moonless Eclipse', model: 'dagger', color: 0xff6fcf, rarity: 'legendary' }),
  ]),
  ranger: Object.freeze([
    Object.freeze({ level: 0, name: 'Fledgling Bow', model: 'bow', color: 0xc4a574, rarity: 'common' }),
    Object.freeze({ level: 3, name: 'Ash Longbow', model: 'bow', color: 0xe0bf82, rarity: 'uncommon' }),
    Object.freeze({ level: 7, name: 'Storm Recurve', model: 'bow', color: 0x9ad0a8, rarity: 'rare' }),
    Object.freeze({ level: 15, name: 'Wildstar Bow', model: 'bow', color: 0xffc46b, rarity: 'epic' }),
    Object.freeze({ level: 22, name: 'Convergence Arc', model: 'bow', color: 0xf2dc9a, rarity: 'legendary' }),
    Object.freeze({ level: 30, name: 'Zenith Convergence', model: 'bow', color: 0xd9ff8a, rarity: 'legendary' }),
  ]),
  gunner: Object.freeze([
    Object.freeze({ level: 0, name: 'Service Rifle', model: 'rifle', color: 0xc8b090, rarity: 'common' }),
    Object.freeze({ level: 3, name: 'Brass Carbine', model: 'rifle', color: 0xe0a868, rarity: 'uncommon' }),
    Object.freeze({ level: 7, name: 'Ember Lance', model: 'rifle', color: 0xff8a50, rarity: 'rare' }),
    Object.freeze({ level: 15, name: 'Thermite Rail', model: 'rifle', color: 0xff7040, rarity: 'epic' }),
    Object.freeze({ level: 22, name: 'Vanguard Core', model: 'rifle', color: 0xffb070, rarity: 'legendary' }),
    Object.freeze({ level: 30, name: 'Apex Vanguard', model: 'rifle', color: 0xffe0a0, rarity: 'legendary' }),
  ]),
});

/**
 * Fast-loop signature effects. +3 unlocks the first visible proc; later tiers
 * increase its cadence, targets, repeats, control, and finally execution power.
 */
export const WEAPON_RESONANCE_LEVELS = Object.freeze([3, 6, 10, 15, 20, 25, 30]);

export const WEAPON_RESONANCES = Object.freeze({
  aerin: Object.freeze({
    id: 'oathquake', name: 'Oathquake', proc: 'nova', color: 0xffcf67,
    procMult: 0.42, tierMult: 0.08, cooldown: 0.62,
    statBias: Object.freeze({ leech: 1.5, skillPower: 0.9, haste: 0.9, goldBonus: 0.8, luck: 0.7 }),
    milestones: Object.freeze([
      Object.freeze({ level: 3, name: 'Oathwave', summary: 'Landed hits release a radial damage wave.' }),
      Object.freeze({ level: 6, name: 'Wide Oath', summary: 'The wave grows wider, faster, and stronger.' }),
      Object.freeze({ level: 10, name: 'Sundering Edge', summary: 'Waves expose enemy armor for follow-up hits.' }),
      Object.freeze({ level: 15, name: 'Twin Judgment', summary: 'Every trigger repeats with a second shockwave.' }),
      Object.freeze({ level: 20, name: 'Royal Execution', summary: 'Low-health prey take direct finisher damage.' }),
      Object.freeze({ level: 25, name: 'Crownstorm', summary: 'Judgment cadence and radius surge again.' }),
      Object.freeze({ level: 30, name: 'Worldbreaker', summary: 'Three massive waves crush the whole pack.' }),
    ]),
  }),
  wizard: Object.freeze({
    id: 'star_chain', name: 'Star Chain', proc: 'chain', color: 0xa98cff,
    procMult: 0.38, tierMult: 0.07, cooldown: 0.64,
    statBias: Object.freeze({ skillPower: 1.6, haste: 1.15, leech: 0.7 }),
    milestones: Object.freeze([
      Object.freeze({ level: 3, name: 'Star Spark', summary: 'Landed hits arc bonus damage to nearby prey.' }),
      Object.freeze({ level: 6, name: 'Forked Current', summary: 'The arc forks into additional auto-targets.' }),
      Object.freeze({ level: 10, name: 'Frost Circuit', summary: 'Arc targets are slowed and easier to finish.' }),
      Object.freeze({ level: 15, name: 'Astral Cascade', summary: 'More chains fire at a much faster cadence.' }),
      Object.freeze({ level: 20, name: 'Gravity Collapse', summary: 'Low-health prey take direct finisher damage.' }),
      Object.freeze({ level: 25, name: 'Constellation', summary: 'The current fills a wider hostile cluster.' }),
      Object.freeze({ level: 30, name: 'Supernova Circuit', summary: 'Maximum chains erupt on every trigger.' }),
    ]),
  }),
  rogue: Object.freeze({
    id: 'aftercut', name: 'Aftercut', proc: 'echo', color: 0xff70d0,
    procMult: 0.32, tierMult: 0.06, cooldown: 0.52,
    statBias: Object.freeze({ crit: 1.35, haste: 1.45, leech: 1.4, skillPower: 0.9, goldBonus: 1.1, luck: 1.2 }),
    milestones: Object.freeze([
      Object.freeze({ level: 3, name: 'Aftercut', summary: 'Every trigger adds a direct auto-targeted slash.' }),
      Object.freeze({ level: 6, name: 'Twin Echo', summary: 'Echo damage and trigger cadence rise sharply.' }),
      Object.freeze({ level: 10, name: 'Hemorrhage', summary: 'Echo cuts stack bleeding on their target.' }),
      Object.freeze({ level: 15, name: 'Lotus Rush', summary: 'Two echo cuts rapidly reacquire living prey.' }),
      Object.freeze({ level: 20, name: 'Reaper Instinct', summary: 'Low-health prey take direct finisher damage.' }),
      Object.freeze({ level: 25, name: 'Moonless Flurry', summary: 'Three echo cuts flood the nearest target.' }),
      Object.freeze({ level: 30, name: 'Eclipse Sequence', summary: 'Four lethal cuts retarget without downtime.' }),
    ]),
  }),
  ranger: Object.freeze({
    id: 'seeking_ricochet', name: 'Seeking Ricochet', proc: 'ricochet', color: 0xdfff72,
    procMult: 0.35, tierMult: 0.065, cooldown: 0.58,
    statBias: Object.freeze({ crit: 1.4, haste: 1.2, leech: 0.8, goldBonus: 1.2, luck: 1.45 }),
    milestones: Object.freeze([
      Object.freeze({ level: 3, name: 'Seeking Arrow', summary: 'Landed hits fire a bonus auto-targeted arrow.' }),
      Object.freeze({ level: 6, name: 'Split Hunt', summary: 'Ricochets seek additional nearby targets.' }),
      Object.freeze({ level: 10, name: 'Predator Mark', summary: 'Ricochets expose prey to follow-up damage.' }),
      Object.freeze({ level: 15, name: 'Relentless Volley', summary: 'More arrows fire at a much faster cadence.' }),
      Object.freeze({ level: 20, name: 'Trophy Execution', summary: 'Low-health prey take direct finisher damage.' }),
      Object.freeze({ level: 25, name: 'Pocket Arrowstorm', summary: 'Ricochets flood the local hostile pack.' }),
      Object.freeze({ level: 30, name: 'Zenith Convergence', summary: 'Maximum arrows focus or retarget instantly.' }),
    ]),
  }),
  gunner: Object.freeze({
    id: 'brass_ricochet', name: 'Brass Ricochet', proc: 'ricochet', color: 0xff9a50,
    procMult: 0.34, tierMult: 0.065, cooldown: 0.56,
    statBias: Object.freeze({ crit: 1.2, haste: 1.25, skillPower: 1.15, leech: 0.85, goldBonus: 1.0, luck: 1.1 }),
    milestones: Object.freeze([
      Object.freeze({ level: 3, name: 'Brass Spark', summary: 'Landed shots spark a bonus auto-target hit.' }),
      Object.freeze({ level: 6, name: 'Split Brass', summary: 'Sparks fork to additional nearby prey.' }),
      Object.freeze({ level: 10, name: 'Ember Pin', summary: 'Sparks expose targets for follow-ups.' }),
      Object.freeze({ level: 15, name: 'Drum Echo', summary: 'More sparks fire at a faster cadence.' }),
      Object.freeze({ level: 20, name: 'Thermite Edge', summary: 'Low-health prey take direct finisher damage.' }),
      Object.freeze({ level: 25, name: 'Mag Storm', summary: 'Sparks flood the local hostile pack.' }),
      Object.freeze({ level: 30, name: 'Vanguard Apex', summary: 'Maximum sparks focus or retarget instantly.' }),
    ]),
  }),
});

export function weaponResonanceTier(enhanceLevel = 0) {
  const level = Math.max(0, Number(enhanceLevel) || 0);
  let tier = 0;
  for (const unlock of WEAPON_RESONANCE_LEVELS) {
    if (level < unlock) break;
    tier += 1;
  }
  return tier;
}

export function getWeaponResonance(classId) {
  return WEAPON_RESONANCES[resolveHeroClassId(classId)] ?? WEAPON_RESONANCES.aerin;
}

export function getWeaponResonanceUnlock(classId, enhanceLevel = 0) {
  const level = Math.max(0, Number(enhanceLevel) || 0);
  return getWeaponResonance(classId).milestones.find(entry => entry.level === level) ?? null;
}

export function getWeaponEvolution(classId, enhanceLevel = 0) {
  const stages = WEAPON_EVOLUTIONS[resolveHeroClassId(classId)] ?? WEAPON_EVOLUTIONS.aerin;
  const level = Math.max(0, Number(enhanceLevel) || 0);
  return stages.reduce((current, stage) => (stage.level <= level ? stage : current), stages[0]);
}

export function resolveHeroClassId(classId) {
  if (classId && HERO_CLASSES[classId]) return classId;
  return DEFAULT_HERO_CLASS_ID;
}

/**
 * Basic-attack tuning defaults (knight-calibrated — values unchanged from the
 * original hardcoded CombatSystem constants). Classes override via `meleeProfile`
 * (legacy name) or `basicAttack` on their HERO_CLASSES row.
 */
const MELEE_BASIC_DEFAULTS = Object.freeze({
  rangeMult: 1,
  arcMult: 1,
  flurry: 1,          // strikes per attack click
  range: 2.85,
  finisherRange: 3.45,
  rangePerCombo: .16,
  mult: .88,
  multPerCombo: .14,
  finisherMult: 1.35,
});
const MAGIC_BASIC_DEFAULTS = Object.freeze({
  bolts: 5,           // finisher volley size
  comboMults: Object.freeze([.95, 1.05, 1.15, 1.45]),
});

const RIFLE_BASIC_DEFAULTS = Object.freeze({
  profile: 'rifle',
  range: 26,
  comboRounds: Object.freeze([1, 1, 1, 3]),
  comboMults: Object.freeze([0.86, 0.94, 1.02, 0.5]),
  attackIcon: 'rifle',
  audioKind: 'rifle',
});

/**
 * Explicit basic-attack profile: melee | magic | bow | rifle.
 * Prefer basicAttack.profile; fall back to attackStyle compatibility.
 */
export function getBasicAttackProfile(classId) {
  const def = getHeroClass(classId);
  const explicit = def.basicAttack?.profile;
  if (explicit === 'rifle' || explicit === 'bow' || explicit === 'magic' || explicit === 'melee') {
    return explicit;
  }
  if (def.attackStyle === 'magic') return 'magic';
  if (def.attackStyle === 'ranged') return 'bow';
  return 'melee';
}

/** Merged basic-attack profile for a class (style defaults + class overrides). */
export function getClassBasicAttack(classId) {
  const def = getHeroClass(classId);
  const profile = getBasicAttackProfile(classId);
  let base = MELEE_BASIC_DEFAULTS;
  if (profile === 'magic' || profile === 'bow') base = MAGIC_BASIC_DEFAULTS;
  else if (profile === 'rifle') base = RIFLE_BASIC_DEFAULTS;
  return { ...base, ...(def.meleeProfile ?? {}), ...(def.basicAttack ?? {}), profile };
}

/** True for staff/bow/rifle basics (cast/fire clips rather than melee swings). */
export function isRangedAttackStyle(classId) {
  const profile = getBasicAttackProfile(classId);
  return profile === 'magic' || profile === 'bow' || profile === 'rifle';
}

/**
 * Weapon models this class may equip / hold.
 * When weaponBias.preferred is set, only those models are allowed (strict).
 * Empty preferred → all models allowed.
 */
export function getClassWeaponModels(classId) {
  const preferred = getHeroClass(classId).weaponBias?.preferred;
  if (!preferred?.length) return null;
  return preferred;
}

/** Whether a weapon item/model is legal for the class visual + equip rules. */
export function canClassUseWeapon(classId, itemOrModel) {
  const model = typeof itemOrModel === 'string'
    ? itemOrModel
    : itemOrModel?.model;
  if (!model) return false;
  if (itemOrModel && typeof itemOrModel === 'object' && itemOrModel.slot && itemOrModel.slot !== 'weapon') {
    return true;
  }
  const allowed = getClassWeaponModels(classId);
  if (!allowed) return true;
  return allowed.includes(model);
}

export function getHeroClass(classId) {
  return HERO_CLASSES[resolveHeroClassId(classId)];
}

/** All skill ids owned by a class (active + passive). */
export function getClassSkillIds(classId) {
  const def = getHeroClass(classId);
  return [...(def.activeSkills ?? []), ...(def.passiveSkills ?? [])];
}

export function getClassActiveSkills(classId) {
  return (getHeroClass(classId).activeSkills ?? []).map(id => SKILLS[id]).filter(Boolean);
}

export function getClassPassiveSkills(classId) {
  return (getHeroClass(classId).passiveSkills ?? []).map(id => SKILLS[id]).filter(Boolean);
}

export function skillKeyCode(key) {
  return SKILL_KEY_CODES[key] ?? null;
}

/** Empty rank map for a class skill tree. */
export function createEmptySkillRanks(classId) {
  const ranks = {};
  for (const id of getClassSkillIds(classId)) ranks[id] = 0;
  return ranks;
}

/** Empty cooldown map for class actives. */
export function createEmptySkillCooldowns(classId) {
  const cds = {};
  for (const id of getHeroClass(classId).activeSkills ?? []) cds[id] = 0;
  return cds;
}

/** Build a mutable starter gear item from a class definition. */
export function createClassStarterWeapon(classId = DEFAULT_HERO_CLASS_ID) {
  const def = getHeroClass(classId);
  const base = def.starterWeapon;
  const rarity = RARITIES[base.rarity] ?? RARITIES.common;
  const item = {
    defense: 0, hp: 0, haste: 0, leech: 0, xpBonus: 0, goldBonus: 0,
    skillPower: 0, moveSpeed: 0, luck: 0, score: 20, affixes: [],
    classId: def.id, weaponEnhanceLevel: 0, optionEnhanceLevel: 0,
    enhanceLevel: 0, locked: true,
    ...base,
    rarityColor: rarity.color,
  };
  const baseStats = {};
  for (const key of ['power', 'defense', 'hp', 'crit', 'haste', 'leech', 'xpBonus', 'goldBonus', 'skillPower', 'moveSpeed', 'luck']) {
    baseStats[key] = Number(item[key]) || 0;
  }
  item.baseStats = baseStats;
  item.baseSpeed = Number(item.speed) || 1;
  item.evolutionStage = getWeaponEvolution(def.id, 0).level;
  item.optionStats = {};
  return item;
}

/**
 * MAX HUNT class level-40 mutation presets (explicit skill → choice id).
 * Identity names match the plan; IDs are legal mutation keys only.
 */
export const MAX_HUNT_CLASS_PRESETS = Object.freeze({
  aerin: Object.freeze({
    identity: 'Pack Breaker',
    mutations: Object.freeze({
      whirlwind: 'cyclone',
      crescent: 'wide_moon',
      skyfall: 'iron_vortex',
      starburst: 'constellation',
    }),
  }),
  wizard: Object.freeze({
    identity: 'Cataclysm Lock',
    mutations: Object.freeze({
      fireball: 'wildfire',
      frost_nova: 'glacier_ring',
      arcane_blink: 'echo_step',
      meteor_storm: 'meteor_rain',
    }),
  }),
  rogue: Object.freeze({
    identity: 'Relentless Flurry',
    mutations: Object.freeze({
      twin_fang: 'raptor',
      fan_of_knives: 'black_fan',
      shadowstep: 'ghost_rush',
      death_lotus: 'crimson_lotus',
    }),
  }),
  ranger: Object.freeze({
    identity: 'Seeking Volley',
    mutations: Object.freeze({
      piercing_shot: 'split_arrow',
      caltrop_trap: 'briar_field',
      vault_shot: 'gale_vault',
      hunter_mark: 'pack_hunt',
    }),
  }),
  gunner: Object.freeze({
    identity: 'Ember Overwatch',
    mutations: Object.freeze({
      suppressive_burst: 'wide_lane',
      flame_jet: 'wide_jet',
      stim_rush: 'long_stim',
      inferno_sweep: 'wide_sweep',
    }),
  }),
});

/**
 * Curated non-boss invasion roster for the village breach.
 * Weights target ~60% fodder, 15–20% frontline/rusher, 10–15% ranged, 5–10% bruiser/support.
 */
export const MAX_HUNT_INVASION_ROSTER = Object.freeze([
  Object.freeze({ id: 'dew_blob', weight: 14 }),
  Object.freeze({ id: 'seed_mite', weight: 12 }),
  Object.freeze({ id: 'spore_puff', weight: 11 }),
  Object.freeze({ id: 'root_centipede', weight: 10 }),
  Object.freeze({ id: 'meadow_buck', weight: 6 }),
  Object.freeze({ id: 'dusk_wolf', weight: 6 }),
  Object.freeze({ id: 'snapjaw_bloom', weight: 5 }),
  Object.freeze({ id: 'shellback', weight: 5 }),
  Object.freeze({ id: 'thorn_toad', weight: 4 }),
  Object.freeze({ id: 'bark_guard', weight: 4 }),
  Object.freeze({ id: 'pollen_wisp', weight: 5 }),
  Object.freeze({ id: 'vine_sniper', weight: 4 }),
  Object.freeze({ id: 'thornling', weight: 3 }),
  Object.freeze({ id: 'brush_boar', weight: 3 }),
  Object.freeze({ id: 'leaf_raider', weight: 2 }),
  Object.freeze({ id: 'hive_tender', weight: 2 }),
  Object.freeze({ id: 'clover_sprite', weight: 2 }),
  Object.freeze({ id: 'branch_shaman', weight: 2 }),
]);
