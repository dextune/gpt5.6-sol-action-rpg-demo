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
});

export const ENEMY_TYPES = Object.freeze({
  dew_blob: enemy('dew_blob', 'Dewdrop Jelly', 'verdant', 'blob', 1, 42, 7, 0, 2.7, 1.45, 16, { color: 0x63d58b, accent: 0xb8ffd3, ai: 'swarm', weight: 1.45 }),
  horn_hopper: enemy('horn_hopper', 'Hornbloom Hopper', 'verdant', 'hare', 2, 54, 8, 1, 4.5, 1.4, 20, { color: 0xc5c77a, accent: 0xf2efb2, ai: 'skirmish', weight: 1.25 }),
  brush_boar: enemy('brush_boar', 'Brush Boar', 'verdant', 'boar', 3, 82, 11, 2, 3.8, 1.7, 29, { color: 0x7c7d4e, accent: 0xdac991, ai: 'charge', weight: 1.15 }),
  pollen_wisp: enemy('pollen_wisp', 'Pollen Wisp', 'verdant', 'wisp', 4, 58, 12, 1, 3.1, 8.5, 31, { color: 0xffdb74, accent: 0xfff6b7, ai: 'ranged', weight: 1.05 }),
  leaf_raider: enemy('leaf_raider', 'Leafmask Raider', 'verdant', 'raider', 5, 105, 14, 3, 3.4, 1.8, 39, { color: 0x55955b, accent: 0xe7d07d, ai: 'melee', weight: 0.9 }),
  shellback: enemy('shellback', 'Bronzeshell', 'verdant', 'beetle', 7, 148, 17, 7, 2.8, 1.65, 54, { color: 0x607c4b, accent: 0xb7db6f, ai: 'tank', weight: 0.7 }),
  moss_crown: enemy('moss_crown', 'Mosscrown Colossus', 'verdant', 'colossus', 12, 1650, 27, 10, 2.1, 2.8, 650, { color: 0x456b45, accent: 0x9ce879, ai: 'boss', scale: 1.7, boss: true, special: 'roots', phase2Hp: 0.5 }),

  dusk_wolf: enemy('dusk_wolf', 'Duskshade Wolf', 'forest', 'wolf', 8, 145, 19, 4, 4.8, 1.65, 63, { color: 0x4b5e52, accent: 0x9bd67b, ai: 'pack', weight: 1.35 }),
  thornling: enemy('thornling', 'Thornling Stalker', 'forest', 'plant', 9, 132, 21, 4, 2.6, 8.2, 66, { color: 0x4b8a58, accent: 0xe0807e, ai: 'ranged', weight: 1.15 }),
  bark_guard: enemy('bark_guard', 'Barkguard', 'forest', 'golem', 11, 236, 24, 9, 2.35, 2, 91, { color: 0x6b5a3f, accent: 0x78d267, ai: 'tank', weight: 0.9 }),
  mask_scout: enemy('mask_scout', 'Grove Maskscout', 'forest', 'raider', 12, 175, 25, 5, 4.05, 2, 89, { color: 0x315c48, accent: 0xd5bb7a, ai: 'skirmish', weight: 1.05 }),
  branch_shaman: enemy('branch_shaman', 'Branch Shaman', 'forest', 'shaman', 13, 158, 28, 4, 2.75, 9.2, 101, { color: 0x47664c, accent: 0x8af0a0, ai: 'caster', weight: 0.8 }),
  canopy_harpy: enemy('canopy_harpy', 'Canopy Harpy', 'forest', 'harpy', 15, 186, 30, 5, 4.2, 7.8, 118, { color: 0x447567, accent: 0xd8f3ab, ai: 'ranged', weight: 0.72 }),
  ancient_stag: enemy('ancient_stag', 'Ancient Stag Lord', 'forest', 'stag', 21, 2700, 39, 14, 3.45, 3.1, 1050, { color: 0x4c5a3e, accent: 0xa8f087, ai: 'boss', scale: 1.68, boss: true, special: 'stampede' }),

  sand_crab: enemy('sand_crab', 'Duneskitter Crab', 'canyon', 'crab', 15, 205, 29, 8, 3.1, 1.8, 117, { color: 0xc47846, accent: 0xffc16b, ai: 'tank', weight: 1.2 }),
  amber_scarab: enemy('amber_scarab', 'Amber Scarab', 'canyon', 'beetle', 16, 194, 31, 10, 3.6, 1.7, 122, { color: 0xb87034, accent: 0xffd477, ai: 'charge', weight: 1.15 }),
  dune_raptor: enemy('dune_raptor', 'Sandclaw Raptor', 'canyon', 'raptor', 18, 245, 35, 6, 5.1, 1.8, 148, { color: 0xc49151, accent: 0xffe08c, ai: 'charge', weight: 1.1 }),
  dust_bandit: enemy('dust_bandit', 'Dust Bandit', 'canyon', 'raider', 19, 252, 37, 7, 3.65, 2, 153, { color: 0x9c5f3d, accent: 0xf0d09a, ai: 'melee', weight: 1.05 }),
  sun_shaman: enemy('sun_shaman', 'Sunshaman', 'canyon', 'shaman', 20, 216, 41, 5, 2.9, 9.8, 166, { color: 0xb16d3f, accent: 0xffc45e, ai: 'caster', weight: 0.85 }),
  stone_cyclops: enemy('stone_cyclops', 'Stone Cyclops', 'canyon', 'cyclops', 23, 438, 47, 13, 2.65, 2.5, 231, { color: 0x926149, accent: 0xf4b95e, ai: 'leap', scale: 1.12, weight: 0.65 }),
  dune_tyrant: enemy('dune_tyrant', 'Dune Tyrant', 'canyon', 'scorpion', 29, 3850, 57, 17, 3.2, 3.4, 1550, { color: 0x9b543b, accent: 0xffb550, ai: 'boss', scale: 1.72, boss: true, special: 'sandstorm', phase2Hp: 0.5 }),

  snow_hopper: enemy('snow_hopper', 'Snowspring Hopper', 'frost', 'hare', 24, 315, 45, 8, 4.7, 1.5, 218, { color: 0xc6dde0, accent: 0xf4ffff, ai: 'skirmish', weight: 1.25 }),
  ice_wisp: enemy('ice_wisp', 'Ice Wisp', 'frost', 'wisp', 25, 272, 49, 7, 3.2, 10.2, 229, { color: 0x8edbec, accent: 0xe4fbff, ai: 'ranged', weight: 1.1 }),
  frost_wolf: enemy('frost_wolf', 'Frostmane Wolf', 'frost', 'wolf', 27, 365, 53, 9, 5.25, 1.8, 262, { color: 0x7895a7, accent: 0xd9f5ff, ai: 'pack', weight: 1.2 }),
  crystal_guard: enemy('crystal_guard', 'Crystalguard Knight', 'frost', 'knight', 29, 465, 58, 16, 3.05, 2.1, 323, { color: 0x639bb4, accent: 0xcff8ff, ai: 'tank', weight: 0.85 }),
  glacier_crab: enemy('glacier_crab', 'Glacier Crab', 'frost', 'crab', 31, 498, 62, 18, 3.2, 2, 348, { color: 0x6998aa, accent: 0xbdefff, ai: 'charge', weight: 0.78 }),
  white_ogre: enemy('white_ogre', 'Snow Ogre', 'frost', 'cyclops', 34, 680, 70, 17, 2.7, 2.65, 442, { color: 0x91a9b4, accent: 0xe9fcff, ai: 'leap', scale: 1.18, weight: 0.58 }),
  avalanche_yak: enemy('avalanche_yak', 'Avalanche Yak', 'frost', 'boar', 41, 5200, 82, 23, 3.65, 3.4, 2250, { color: 0x708899, accent: 0xe8fbff, ai: 'boss', scale: 1.9, boss: true, special: 'blizzard' }),

  coal_imp: enemy('coal_imp', 'Coal Imp', 'ember', 'imp', 34, 468, 67, 11, 4.35, 8.8, 392, { color: 0xb84332, accent: 0xffa047, ai: 'ranged', weight: 1.2 }),
  magma_lizard: enemy('magma_lizard', 'Magma Lizard', 'ember', 'lizard', 36, 590, 73, 14, 4.5, 1.95, 445, { color: 0x863b34, accent: 0xff7841, ai: 'charge', weight: 1.15 }),
  ash_raider: enemy('ash_raider', 'Ashmask Raider', 'ember', 'raider', 38, 565, 77, 14, 3.8, 2.05, 453, { color: 0x67373a, accent: 0xff9a55, ai: 'melee', weight: 1.05 }),
  forge_knight: enemy('forge_knight', 'Forge Knight', 'ember', 'knight', 40, 765, 84, 23, 3.15, 2.25, 563, { color: 0x71333a, accent: 0xffb052, ai: 'tank', weight: 0.82 }),
  cinder_golem: enemy('cinder_golem', 'Cinder Golem', 'ember', 'golem', 42, 890, 91, 25, 2.7, 2.45, 645, { color: 0x563137, accent: 0xff6c3f, ai: 'leap', scale: 1.12, weight: 0.68 }),
  flame_harpy: enemy('flame_harpy', 'Flame Harpy', 'ember', 'harpy', 44, 635, 96, 15, 4.65, 9.4, 606, { color: 0x8a3940, accent: 0xffb35e, ai: 'caster', weight: 0.7 }),
  molten_colossus: enemy('molten_colossus', 'Molten Colossus', 'ember', 'colossus', 52, 7200, 111, 31, 2.45, 3.6, 3200, { color: 0x4d2a31, accent: 0xff6c3d, ai: 'boss', scale: 2.05, boss: true, special: 'inferno', phase2Hp: 0.4 }),

  void_blob: enemy('void_blob', 'Void Blob', 'astral', 'blob', 48, 760, 94, 16, 3.35, 1.7, 665, { color: 0x7459ad, accent: 0xd1a5ff, ai: 'swarm', weight: 1.25 }),
  prism_wisp: enemy('prism_wisp', 'Prism Wisp', 'astral', 'wisp', 50, 690, 102, 15, 3.45, 11, 702, { color: 0x9e72d4, accent: 0xf2c5ff, ai: 'caster', weight: 1.15 }),
  rift_hound: enemy('rift_hound', 'Rift Hound', 'astral', 'wolf', 52, 915, 108, 18, 5.65, 1.95, 765, { color: 0x514779, accent: 0xc68cff, ai: 'pack', weight: 1.1 }),
  star_knight: enemy('star_knight', 'Starforged Knight', 'astral', 'knight', 55, 1250, 119, 31, 3.35, 2.35, 941, { color: 0x4f4d78, accent: 0xd4b4ff, ai: 'tank', weight: 0.86 }),
  abyss_stalker: enemy('abyss_stalker', 'Abyss Stalker', 'astral', 'panther', 58, 1080, 128, 22, 6, 2.05, 936, { color: 0x393453, accent: 0xb580ff, ai: 'charge', weight: 0.92 }),
  orbit_mage: enemy('orbit_mage', 'Orbit Mage', 'astral', 'shaman', 60, 970, 136, 20, 3.15, 11.8, 984, { color: 0x67518e, accent: 0xe3b7ff, ai: 'caster', weight: 0.7 }),
  eclipse_drake: enemy('eclipse_drake', 'Eclipse Drake', 'astral', 'drake', 70, 9800, 158, 38, 4.1, 4.1, 4600, { color: 0x373251, accent: 0xc27cff, ai: 'boss', scale: 2.05, boss: true, special: 'eclipse' }),
});

export const ZONE_SPAWNS = Object.freeze(Object.fromEntries(
  Object.keys(ZONES).map(zoneId => [zoneId, Object.values(ENEMY_TYPES)
    .filter(entry => entry.zone === zoneId && !entry.boss)
    .map(entry => ({ id: entry.id, weight: entry.weight }))]),
));

export const ZONE_BOSSES = Object.freeze(Object.fromEntries(
  Object.keys(ZONES).map(zoneId => [zoneId, Object.values(ENEMY_TYPES).find(entry => entry.zone === zoneId && entry.boss)?.id]),
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
    id: 'whirlwind', classId: 'aerin', name: 'Whirlwind Slash', key: 'Q', unlockLevel: 3, maxRank: 10, mp: 18, cooldown: 5.5,
    castTime: .42, anim: 'skill_whirlwind', animFallback: 'attack_4', effect: 'whirlwind',
    theme: 'windsteel', sfx: 'skill_blade', recipe: 'spinStorm',
    timeline: Object.freeze({ hits: Object.freeze([0.22, 0.48, 0.74]) }),
    combat: Object.freeze({
      mult: Object.freeze([0.46, 0.055]),
      radius: Object.freeze([4.1, 0.18]),
      hits: 3,
      knockbackPulse: 1.2,
      knockbackFinale: 4.8,
      invuln: 0.34,
      criticalBonus: 0.03,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Crosswind', summary: 'Adds a reverse cut and final cross.', timeline: Object.freeze({ hits: Object.freeze([.12,.3,.48,.66,.84]) }), combat: Object.freeze({ hits: 5, finalCross: 1 }) }),
        60: Object.freeze({ label: 'Roving Gale', summary: 'Movement leaves one travelled wind scar.', anim: 'attack_5', combat: Object.freeze({ rovingGale: 1, scarMult: .42 }) }),
        100: Object.freeze({ label: 'Sovereign Tempest', summary: 'Six pulses end in a bounded perpendicular cross.', anim: 'skill_whirlwind', timeline: Object.freeze({ hits: Object.freeze([.1,.24,.38,.52,.68,.84]) }), combat: Object.freeze({ hits: 6, sovereign: 1, crossBudget: 2, crossMult: .48, apexFinisher: 1 }), presentation: Object.freeze({ apexMarker: 'sovereign_cross', apexAudio: 'whirlwind' }) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          cyclone: Object.freeze({ label: 'Cyclone', summary: 'Widens the storm and drags non-boss prey inward.', icon: 'vortex.breadth', combat: Object.freeze({ radiusMult: 1.25, inwardDrag: .55 }) }),
          blood_wheel: Object.freeze({ label: 'Blood Wheel', summary: 'Tightens six fast cuts with bleed cadence.', icon: 'vortex.focus', timeline: Object.freeze({ hits: Object.freeze([.1,.24,.38,.52,.68,.84]) }), combat: Object.freeze({ hits: 6, radiusMult: .82, cadenceMult: .72, bleedEvery: 2, bleed: Object.freeze({ id: 'bleed', duration: 2.4, dps: .08, tick: .45, power: 1 }) }) }),
        }),
        80: Object.freeze({
          storm_cage: Object.freeze({ label: 'Storm Cage', summary: 'Caps stronger pack grouping.', icon: 'vortex.flow', combat: Object.freeze({ cageDrag: .85, dragCap: 5 }) }),
          giant_slayer: Object.freeze({ label: 'Giant Slayer', summary: 'Finale pressures and staggers durable prey.', icon: 'vortex.execution', combat: Object.freeze({ durableMult: 1.65, durableStagger: 24 }) }),
        }),
      }),
    }),
    description: 'Cuts and knocks back nearby enemies in a flurry.',
    rankText: rank => `Damage ${Math.round((0.46 + rank * 0.055) * 100)}% ×3 · Range ${(4.1 + rank * 0.18).toFixed(1)}`,
  },
  crescent: {
    id: 'crescent', classId: 'aerin', name: 'Crescent Blade', key: 'E', unlockLevel: 6, maxRank: 10, mp: 22, cooldown: 6.8,
    castTime: .36, anim: 'skill_crescent', animFallback: 'skill_whirlwind', effect: 'crescent',
    theme: 'bladewave', sfx: 'skill_blade', recipe: 'groundWave',
    timeline: Object.freeze({ hits: Object.freeze([0.38]) }),
    combat: Object.freeze({
      mult: Object.freeze([1.5, 0.22]),
      speed: Object.freeze([16.5, 0.5]),
      pierce: Object.freeze([3, 1]),
      radius: 1.25,
      knockback: 4.2,
      status: Object.freeze({ id: 'expose', duration: 2.4, power: 0.18 }),
      // Rank 3+: residual scar DoT along the wave path (B5).
      // Applied only when rank >= 3 (handler gates).
      residualMult: Object.freeze([0.35, 0.08]),
      residualDelay: 0.42,
      residualRadius: 1.5,
    }),
    evolution: Object.freeze({ forms: Object.freeze({
      20: Object.freeze({ label:'Moon Scar', summary:'The visible path erupts in one delayed aftercut.', timeline:Object.freeze({hits:Object.freeze([.28,.72])}), combat:Object.freeze({ moonScar:1, scarMult:.42 }) }),
      60: Object.freeze({ label:'Crosscurrent', summary:'Qualified pierces emit bounded perpendicular cuts.', anim:'attack_6', combat:Object.freeze({ crosscurrent:1, crossCap:6, crossPerEnemyCap:1, crossMult:.3 }) }),
      100:Object.freeze({ label:'Worldsplitter', summary:'Three-act presentation protects one release and one rupture.', anim:'skill_crescent', timeline:Object.freeze({hits:Object.freeze([.18,.5,.82])}), combat:Object.freeze({ worldsplitter:1, ruptureMult:.75, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'worldsplitter_rupture',apexAudio:'crescent'}) }),
    }), mutations:Object.freeze({
      40:Object.freeze({ wide_moon:Object.freeze({label:'Wide Moon',summary:'Three lower-focus waves cover a broad fan.',icon:'moon.breadth',combat:Object.freeze({waveCount:3,spread:.22,waveMult:.58})}), full_moon:Object.freeze({label:'Full Moon',summary:'One narrow focused wave lands with high impact.',icon:'moon.focus',combat:Object.freeze({waveCount:1,radiusMult:.72,damageMult:1.4})}) }),
      80:Object.freeze({ rift_trail:Object.freeze({label:'Rift Trail',summary:'Bounded residual line ticks control packs.',icon:'moon.flow',combat:Object.freeze({riftTicks:3,riftCap:4,riftMult:.2})}), armor_sever:Object.freeze({label:'Armor Sever',summary:'Durable prey take focused damage and armor break.',icon:'moon.execution',combat:Object.freeze({severMult:.65,armorBreakDuration:3.5,armorBreakPower:.22})}) }),
    }) }),
    description: 'Fires a piercing blade that rends the ground. Higher ranks leave a cutting scar.',
    rankText: rank => `Damage ${Math.round((1.5 + rank * 0.22) * 100)}% · Pierce ${3 + rank}${rank >= 3 ? ' · Scar residual' : ''}`,
  },
  skyfall: {
    id: 'skyfall', classId: 'aerin', name: 'Iron Judgment', key: 'R', unlockLevel: 10, maxRank: 10, mp: 30, cooldown: 9.5,
    castTime: .55, anim: 'skill_skyfall', animFallback: 'skill_whirlwind', effect: 'skyfall',
    theme: 'skyice', sfx: 'skill_leap', recipe: 'leapImpact',
    combat: Object.freeze({
      mult: Object.freeze([1.85, 0.28]),
      radius: Object.freeze([4.5, 0.22]),
      leap: 10.5,
      telegraph: 0.46,
      knockback: 7.2,
      armorPierce: 0.25,
      criticalBonus: 0.06,
      invuln: 0.55,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({
          label: 'Iron Judgment', summary: 'Plants the sword, gathers foes, then slams the safe ring.',
          timeline: Object.freeze({ hits: Object.freeze([0.24, 0.72]) }),
          combat: Object.freeze({ plantMult: Object.freeze([0.34, 0.025]), pullRadius: 7.2, pullStrength: 0.72, safeRing: 1.55, stunNormal: 1.8, stunElite: 0.8, bossStagger: 28 }),
        }),
        60: Object.freeze({
          label: 'Hammered Oath', summary: 'Separates the sword plant and hilt slam into two heavy contacts.', anim: 'attack_7',
          combat: Object.freeze({ plantMult: Object.freeze([0.42, 0.03]), stunNormal: 2.05, stunElite: 0.95, bossStagger: 36 }),
        }),
        100: Object.freeze({
          label: 'Judgment of the Iron King', summary: 'Crowns the single slam with radial royal stone pillars.', anim: 'skill_skyfall',
          combat: Object.freeze({ apexPullBonus: 1.2, apexStaggerBonus: 19, judgmentApex: 1, apexFinisher: 1 }), presentation: Object.freeze({ apexMarker: 'iron_king_slam', apexAudio: 'skyfall' }),
        }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          iron_vortex: Object.freeze({ label: 'Iron Vortex', summary: 'Widens the pull and strengthens enemy gathering.', icon: 'hammer.breadth', combat: Object.freeze({ pullRadius: 9, pullStrength: 0.95 }) }),
          meteor_hammer: Object.freeze({ label: 'Meteor Hammer', summary: 'Tightens the pull for a more damaging slam.', icon: 'hammer.focus', combat: Object.freeze({ pullRadius: 6.2, pullStrength: 0.62, mult: Object.freeze([2.2, 0.32]) }) }),
        }),
        80: Object.freeze({
          kings_command: Object.freeze({ label: "King's Command", summary: 'Maximizes reliable pack stun duration.', icon: 'hammer.flow', combat: Object.freeze({ stunNormal: 2.4, stunElite: 1.2 }) }),
          earthbreaker: Object.freeze({ label: 'Earthbreaker', summary: 'Trades control duration for armor pierce and boss stagger.', icon: 'hammer.execution', combat: Object.freeze({ stunNormal: 1.7, stunElite: 0.7, armorPierce: 0.42, bossStagger: 72 }) }),
        }),
      }),
    }),
    description: 'Leaps forward; evolved forms plant the blade, gather foes, and deliver a stunning ground judgment.',
    rankText: rank => `Damage ${Math.round((1.85 + rank * 0.28) * 100)}% · Radius ${(4.5 + rank * 0.22).toFixed(1)}`,
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
    id: 'fireball', classId: 'wizard', name: 'Fireball', key: 'Q', unlockLevel: 3, maxRank: 10, mp: 20, cooldown: 5.2,
    castTime: .38, anim: 'skill_fireball', animFallback: 'cast_2', effect: 'fireball',
    theme: 'ember', sfx: 'skill_fire', recipe: 'fireOrb',
    timeline: Object.freeze({ hits: Object.freeze([0.36]) }),
    combat: Object.freeze({
      mult: Object.freeze([1.55, 0.24]),
      blastMult: Object.freeze([0.55, 0.08]),
      blastRadius: Object.freeze([2.4, 0.12]),
      speed: Object.freeze([13.5, 0.35]),
      radius: 1.15,
      knockback: 4.5,
      scale: 1.45,
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
    description: 'Hurls a searing orb that explodes on impact.',
    rankText: rank => `Damage ${Math.round((1.55 + rank * 0.24) * 100)}% · Blast ${(2.4 + rank * 0.12).toFixed(1)}`,
  },
  frost_nova: {
    id: 'frost_nova', classId: 'wizard', name: 'Frost Nova', key: 'E', unlockLevel: 6, maxRank: 10, mp: 24, cooldown: 7.2,
    castTime: .36, anim: 'skill_frost_nova', animFallback: 'cast_3', effect: 'frost_nova',
    theme: 'frost', sfx: 'skill_ice', recipe: 'iceNova',
    timeline: Object.freeze({ hits: Object.freeze([0.28]) }),
    combat: Object.freeze({
      mult: Object.freeze([1.2, 0.16]),
      radius: Object.freeze([4.4, 0.2]),
      knockback: 5.4,
      invuln: 0.28,
      criticalBonus: 0.04,
      status: Object.freeze({ id: 'slow', duration: 2.6, power: 0.42 }),
      // Applied when rank >= 3 (handler gates).
      deepChillPower: 0.58,
      deepChillDuration: 1.55,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({ 20: Object.freeze({ label: 'Ice Lances', summary: 'Six directional lances erupt after the outward ring.', combat: Object.freeze({ lances: 6, lanceMult: 0.24, lancePerEnemyCap: 2 }) }), 60: Object.freeze({ label: 'Crystal Dominion', summary: 'Deep chill grows a crystal proxy for the next heavy spell.', anim: 'cast_3', combat: Object.freeze({ crystalPrime: 1 }) }), 100: Object.freeze({ label: 'Frozen Dominion', summary: 'A crystal forest converges inward in a delayed shatter.', anim: 'skill_frost_nova', combat: Object.freeze({ dominion: 1, inwardMult: 0.75, overcastMult:.32, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'frozen_shatter',apexAudio:'frost_nova',overcastRecipe:'frost_overcast'}) }) }),
      mutations: Object.freeze({ 40: Object.freeze({ glacier_ring: Object.freeze({ label: 'Glacier Ring', summary: 'Expands control coverage.', icon: 'crystal.breadth', combat: Object.freeze({ radius: Object.freeze([5.4, 0.24]), lanceMult: 0.18 }) }), shatter_crown: Object.freeze({ label: 'Shatter Crown', summary: 'Tightens the ring for stronger shards.', icon: 'crystal.focus', combat: Object.freeze({ radius: Object.freeze([3.8, 0.16]), lanceMult: 0.38 }) }) }), 80: Object.freeze({ absolute_zero: Object.freeze({ label: 'Absolute Zero', summary: 'Chains bounded freeze pressure through normal enemies.', icon: 'crystal.flow', combat: Object.freeze({ freezeChainCap: 3 }) }), crystal_execution: Object.freeze({ label: 'Crystal Execution', summary: 'Focuses crystal shards into durable targets.', icon: 'crystal.execution', combat: Object.freeze({ crystalExecuteMult: 0.55 }) }) }) }),
    }),
    description: 'Freezes the ground in a ring and slows foes outward. Higher ranks deepen chill.',
    rankText: rank => `Damage ${Math.round((1.2 + rank * 0.16) * 100)}% · Radius ${(4.4 + rank * 0.2).toFixed(1)} · Slow${rank >= 3 ? ' · Deep Chill' : ''}`,
  },
  arcane_blink: {
    id: 'arcane_blink', classId: 'wizard', name: 'Arcane Blink', key: 'R', unlockLevel: 10, maxRank: 10, mp: 28, cooldown: 9.2,
    castTime: .48, anim: 'skill_blink', animFallback: 'dodge', effect: 'arcane_blink',
    theme: 'arcane', sfx: 'skill_arcane', recipe: 'blinkBurst',
    combat: Object.freeze({
      mult: Object.freeze([1.7, 0.26]),
      radius: Object.freeze([4.2, 0.2]),
      leap: 11,
      telegraph: 0.42,
      knockback: 6.8,
      armorPierce: 0.22,
      criticalBonus: 0.05,
      invuln: 0.55,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({ 20: Object.freeze({ label: 'Route Cut', summary: 'The crossed route becomes a delayed arcane cut.', combat: Object.freeze({ routeMult: 0.32 }) }), 60: Object.freeze({ label: 'Rift Anchors', summary: 'Crossed enemies gain ordered rift anchors.', anim: 'dodge', combat: Object.freeze({ anchors: 6, anchorMult: 0.24 }) }), 100: Object.freeze({ label: 'Space Rend', summary: 'All route anchors fracture along one visible seam.', anim: 'skill_blink', combat: Object.freeze({ spaceRend: 1, seamMult: 0.8, overcastMult:.38, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'space_seam',apexAudio:'arcane_blink',overcastRecipe:'arcane_overcast'}) }) }),
      mutations: Object.freeze({ 40: Object.freeze({ echo_step: Object.freeze({ label: 'Echo Step', summary: 'An afterimage repeats the route cut.', icon: 'rift.breadth', combat: Object.freeze({ routeEchoes: 2 }) }), rift_lance: Object.freeze({ label: 'Rift Lance', summary: 'Arrival compresses damage into a forward lance.', icon: 'rift.focus', combat: Object.freeze({ lanceMult: 0.65 }) }) }), 80: Object.freeze({ twin_horizon: Object.freeze({ label: 'Twin Horizon', summary: 'Departure and arrival waves collide midway.', icon: 'rift.flow', combat: Object.freeze({ horizonMult: 0.55 }) }), void_break: Object.freeze({ label: 'Void Break', summary: 'Anchors focus armor-piercing damage on durable targets.', icon: 'rift.execution', combat: Object.freeze({ anchorArmorPierce: 0.55 }) }) }) }),
    }),
    description: 'Teleport forward along facing and detonate a mana shock.',
    rankText: rank => `Damage ${Math.round((1.7 + rank * 0.26) * 100)}% · Radius ${(4.2 + rank * 0.2).toFixed(1)}`,
  },
  meteor_storm: {
    id: 'meteor_storm', classId: 'wizard', name: 'Meteor Storm', key: 'C', unlockLevel: 16, maxRank: 10, mp: 46, cooldown: 15.5,
    castTime: .76, anim: 'skill_meteor', animFallback: 'cast_4', effect: 'meteor_storm',
    theme: 'meteor', sfx: 'skill_fire', recipe: 'meteorDrop',
    combat: Object.freeze({
      mult: Object.freeze([0.6, 0.055]),
      finaleMult: Object.freeze([0.9, 0.1]),
      hits: Object.freeze([6, 1]),
      hitRadius: Object.freeze([1.9, 0.07]),
      telegraph: 0.26,
      aim: 10,
      fallHeight: 8.5,
      finaleRadius: 5.6,
      knockback: 2.8,
      finaleKnockback: 6.4,
      armorPierce: 0.18,
      finaleArmorPierce: 0.3,
      pattern: 'fallCone',
      status: Object.freeze({ id: 'burn', duration: 1.4, dps: 0.08, tick: 0.5, power: 1 }),
    }),
    evolution: Object.freeze({
      forms: Object.freeze({ 20: Object.freeze({ label: 'Molten Fall', summary: 'Impacts leave fractures and feed a larger final meteor.', combat: Object.freeze({ fractures: 1 }) }), 60: Object.freeze({ label: 'Gravity Lens', summary: 'A visible lens bends trajectories toward the aim area.', anim: 'cast_4', combat: Object.freeze({ gravityLens: 1 }) }), 100: Object.freeze({ label: 'Astral Cataclysm', summary: 'The lens collapses into a capped spiral cataclysm.', anim: 'skill_meteor', combat: Object.freeze({ astralCataclysm: 1, gravityReactionCap: 3, overcastMult:.42, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'astral_collapse',apexAudio:'meteor_storm',overcastRecipe:'meteor_overcast'}) }) }),
      mutations: Object.freeze({ 40: Object.freeze({ meteor_rain: Object.freeze({ label: 'Meteor Rain', summary: 'A broad barrage advances along facing.', icon: 'meteor.breadth', combat: Object.freeze({ pattern: 'movingRain', impactsCap: 10 }) }), extinction: Object.freeze({ label: 'Extinction', summary: 'Fewer impacts feed one enormous meteor.', icon: 'meteor.focus', combat: Object.freeze({ hits: 4, finaleMult: Object.freeze([1.8, 0.14]), impactsCap: 5 }) }) }), 80: Object.freeze({ orbit_fall: Object.freeze({ label: 'Orbit Fall', summary: 'Orbiting stones hunt distinct enemies once.', icon: 'meteor.flow', combat: Object.freeze({ orbitTargets: 6 }) }), world_ender: Object.freeze({ label: 'World Ender', summary: 'Trajectories compress onto an elite or boss zone.', icon: 'meteor.execution', combat: Object.freeze({ worldEnder: 1, finaleArmorPierce: 0.55 }) }) }) }),
    }),
    description: 'Calls a barrage of falling meteors onto the field ahead.',
    rankText: rank => `Damage ${Math.round((0.6 + rank * 0.055) * 100)}% · Meteors ${6 + rank}`,
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
    id: 'twin_fang', classId: 'rogue', name: 'Twin Fang', key: 'Q', unlockLevel: 3, maxRank: 10, mp: 14, cooldown: 4.2,
    castTime: .3, anim: 'skill_twin_fang', animFallback: 'attack_2', effect: 'twin_fang',
    theme: 'venom', sfx: 'skill_dagger', recipe: 'fangRush',
    timeline: Object.freeze({ hits: Object.freeze([0.22, 0.52, 0.72]) }),
    combat: Object.freeze({
      mult: Object.freeze([0.72, 0.09]),
      range: Object.freeze([2.3, 0.08]),
      hits: 2,
      // Rank 3+: third micro-stab (B5).
      hitsAtRank3: 3,
      arc: 1.15,
      knockback: 1.6,
      criticalBonus: 0.15,
      status: Object.freeze({ id: 'bleed', duration: 2.6, dps: 0.1, tick: 0.4, power: 1 }),
      bleedDurationBonus: 0.9,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Cross Fang', summary: 'Main, off-hand, then simultaneous cross contact.', timeline: Object.freeze({ hits: Object.freeze([.18,.46,.74]) }), combat: Object.freeze({ hits: 3 }) }),
        60: Object.freeze({ label: 'Backbite', summary: 'One nonrecursive echo repeats the cross from behind.', anim: 'attack_6', combat: Object.freeze({ backbite: 1, backbiteMult: .42 }) }),
        100: Object.freeze({ label: 'Thousand Fang', summary: 'Eight contacts end in capped crossing detonation.', anim: 'skill_twin_fang', timeline: Object.freeze({ hits: Object.freeze([.08,.18,.28,.38,.48,.58,.7,.84]) }), combat: Object.freeze({ hits: 8, thousandFang: 1, cutLineCap: 6, detonateMult: .65, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'thousand_fang',apexAudio:'twin_fang'}) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          viper: Object.freeze({ label: 'Viper', summary: 'Extends and strengthens bleed.', icon: 'fang.breadth', combat: Object.freeze({ bleedMult: 1.4, bleedDurationBonus: 1.6 }) }),
          raptor: Object.freeze({ label: 'Raptor', summary: 'Compresses cadence and focuses critical hits.', icon: 'fang.focus', combat: Object.freeze({ cadenceMult: .72, criticalBonus: .28 }) }),
        }),
        80: Object.freeze({
          open_wound: Object.freeze({ label: 'Open Wound', summary: 'Consumes bleed once for a bounded burst.', icon: 'fang.flow', combat: Object.freeze({ consumeBleed: 1, woundMult: .8 }) }),
          heartseeker: Object.freeze({ label: 'Heartseeker', summary: 'Concentrates bonus damage on durable prey.', icon: 'fang.execution', combat: Object.freeze({ durableMult: 1.55, durableStagger: 18 }) }),
        }),
      }),
    }),
    description: 'Two lightning-fast dagger stabs that rend the target open. Higher ranks add a third cut.',
    rankText: rank => `Damage ${Math.round((0.72 + rank * 0.09) * 100)}% ×${rank >= 3 ? 3 : 2} · Crit +15% · Bleed`,
  },
  fan_of_knives: {
    id: 'fan_of_knives', classId: 'rogue', name: 'Fan of Knives', key: 'E', unlockLevel: 5, maxRank: 10, mp: 20, cooldown: 6.4,
    castTime: .32, anim: 'skill_fan_knives', animFallback: 'skill_twin_fang', effect: 'fan_of_knives',
    theme: 'nightsteel', sfx: 'skill_dagger', recipe: 'daggerFan',
    timeline: Object.freeze({ hits: Object.freeze([0.34]) }),
    combat: Object.freeze({
      mult: Object.freeze([0.55, 0.07]),
      knives: Object.freeze([5, 1]),
      speed: Object.freeze([17, 0.4]),
      spread: 0.16,
      radius: 0.85,
      life: 0.62,
      pierce: 1,
      knockback: 2.4,
      criticalBonus: 0.08,
      status: Object.freeze({ id: 'bleed', duration: 2, dps: 0.07, tick: 0.45, power: 1 }),
    }),
    evolution:Object.freeze({ forms:Object.freeze({
      20:Object.freeze({label:'Returning Steel',summary:'Outbound knives return once without recursion.',timeline:Object.freeze({hits:Object.freeze([.24,.68])}),combat:Object.freeze({returnPass:1,returnMult:.45})}),
      60:Object.freeze({label:'Shadow Volley',summary:'Controlled source-excluded duplicates follow.',anim:'attack_5',combat:Object.freeze({duplicateCap:6,duplicateMult:.32})}),
      100:Object.freeze({label:'Night Peacock',summary:'Spread, return, and one final direct detonation.',anim:'skill_fan_knives',timeline:Object.freeze({hits:Object.freeze([.18,.5,.82])}),combat:Object.freeze({nightPeacock:1,finaleMult:.8,finaleRadius:3.2,apexFinisher:1}),presentation:Object.freeze({apexMarker:'night_peacock',apexAudio:'fan_of_knives'})}),
    }),mutations:Object.freeze({
      40:Object.freeze({black_fan:Object.freeze({label:'Black Fan',summary:'A wide bounded fan covers packs.',icon:'knives.breadth',combat:Object.freeze({spreadMult:1.45,knifeCap:12})}),needle_line:Object.freeze({label:'Needle Line',summary:'A narrow piercing line focuses damage.',icon:'knives.focus',combat:Object.freeze({spreadMult:.38,pierce:3,damageMult:1.3})})}),
      80:Object.freeze({ricochet:Object.freeze({label:'Ricochet',summary:'Knives bounce to unique targets without recursion.',icon:'knives.flow',combat:Object.freeze({bounceCap:3,bounceMult:.3})}),pinned_prey:Object.freeze({label:'Pinned Prey',summary:'Durable prey receive focused stagger while packs remain viable.',icon:'knives.execution',combat:Object.freeze({pinnedMult:.55,pinnedStagger:16})})}),
    })}),
    description: 'Flings a fan of short-range knives that shred everything ahead.',
    rankText: rank => `Damage ${Math.round((0.55 + rank * 0.07) * 100)}% · Knives ${5 + rank}`,
  },
  shadowstep: {
    id: 'shadowstep', classId: 'rogue', name: 'Shadow Frenzy', key: 'R', unlockLevel: 9, maxRank: 10, mp: 26, cooldown: 8.6,
    castTime: .42, anim: 'skill_shadowstep', animFallback: 'dodge', effect: 'shadowstep',
    theme: 'shadow', sfx: 'skill_arcane', recipe: 'shadowDash',
    combat: Object.freeze({
      mult: Object.freeze([1.55, 0.24]),
      dash: Object.freeze([7.5, 0.28]),
      width: 2.2,
      knockback: 2.2,
      armorPierce: 0.3,
      criticalBonus: 0.18,
      invuln: 0.5,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({
          label: 'Shadow Frenzy', summary: 'The damaging dash opens a four-second dual-blade overdrive.',
          combat: Object.freeze({ frenzyDuration: 4, frenzyAttackHaste: 0.25, frenzyMoveHaste: 0.2, offhandEcho: 0.2 }),
        }),
        60: Object.freeze({
          label: 'Feeding Tempo', summary: 'Kills extend the frenzy by half a second, up to two seconds.', anim: 'dodge',
          combat: Object.freeze({ killExtension: 0.5, killExtensionCap: 2 }),
        }),
        100: Object.freeze({
          label: 'Beyond the Eye', summary: 'A five-second overdrive ends in a contact-capped shadow explosion.', anim: 'skill_shadowstep',
          combat: Object.freeze({ frenzyDuration: 5, contactCap: 12, exitMult: 0.12, frenzyExit: 1, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'frenzy_exit',apexAudio:'shadowstep'}),
        }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          ghost_rush: Object.freeze({ label: 'Ghost Rush', summary: 'Maximizes movement and repositioning speed.', icon: 'shadow.breadth', combat: Object.freeze({ frenzyMoveHaste: 0.35, frenzyAttackHaste: 0.25, dash: Object.freeze([8.4, 0.3]) }) }),
          red_tempo: Object.freeze({ label: 'Red Tempo', summary: 'Maximizes attack tempo and critical pressure.', icon: 'shadow.focus', combat: Object.freeze({ frenzyAttackHaste: 0.4, frenzyMoveHaste: 0.2, criticalBonus: 0.28 }) }),
        }),
        80: Object.freeze({
          predator_flow: Object.freeze({ label: 'Predator Flow', summary: 'Frenzy contacts chain to up to two nearby enemies.', icon: 'shadow.flow', combat: Object.freeze({ chainCap: 2, chainMult: 0.22 }) }),
          boss_killer: Object.freeze({ label: 'Boss Killer', summary: 'Repeated boss contacts build a capped damage ramp.', icon: 'shadow.execution', combat: Object.freeze({ bossRampCap: 5, bossRampStep: 0.04 }) }),
        }),
      }),
    }),
    description: 'Dashes through enemies with both blades, then accelerates attacks and movement.',
    rankText: rank => `Damage ${Math.round((1.55 + rank * 0.24) * 100)}% · Dash ${(7.5 + rank * 0.28).toFixed(1)} · Crit +18%`,
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
    id: 'piercing_shot', classId: 'ranger', name: 'Piercing Shot', key: 'Q', unlockLevel: 3, maxRank: 10, mp: 16, cooldown: 4.8,
    castTime: .34, anim: 'skill_pierce_shot', animFallback: 'cast_2', effect: 'piercing_shot',
    theme: 'hunt_amber', sfx: 'skill_bow', recipe: 'arrowStreak',
    timeline: Object.freeze({ hits: Object.freeze([0.34]) }),
    combat: Object.freeze({
      mult: Object.freeze([1.65, 0.22]),
      speed: Object.freeze([18, 0.4]),
      radius: 0.95,
      pierce: Object.freeze([3, 0.4]),
      life: 1.15,
      knockback: 3.2,
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
    description: 'Looses a heavy arrow that punches through a line of foes.',
    rankText: rank => `Damage ${Math.round((1.65 + rank * 0.22) * 100)}% · Pierce ${Math.round(3 + rank * 0.4)}`,
  },
  caltrop_trap: {
    id: 'caltrop_trap', classId: 'ranger', name: 'Caltrop Trap', key: 'E', unlockLevel: 6, maxRank: 10, mp: 22, cooldown: 8.2,
    castTime: .4, anim: 'skill_trap', animFallback: 'cast_3', effect: 'caltrop_trap',
    theme: 'thorn', sfx: 'skill_trap', recipe: 'trapField',
    combat: Object.freeze({
      mult: Object.freeze([0.38, 0.05]),
      radius: Object.freeze([3.2, 0.12]),
      aim: 7.5,
      ticks: Object.freeze([5, 0]),
      tickInterval: 0.55,
      knockback: 1.1,
      status: Object.freeze({ id: 'slow', duration: 1.4, power: 0.4 }),
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Thornburst', summary: 'Opening and closing spikes deal direct damage.', combat: Object.freeze({ openClose: 1, burstMult: .7 }) }),
        60: Object.freeze({ label: 'Planted Battery', summary: 'Every third contact fires a planted arrow.', anim: 'cast_3', combat: Object.freeze({ plantedEvery: 3, plantedCap: 4, plantedMult: .34 }) }),
        100: Object.freeze({ label: 'Thousand Thorn Garden', summary: 'Facing grid lines end in one eruption.', anim: 'skill_trap', combat: Object.freeze({ thornGrid: 1, gridLines: 5, finaleMult: 1.25, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'thorn_garden',apexAudio:'caltrop_trap'}) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          briar_field: Object.freeze({ label: 'Briar Field', summary: 'Expands repeated line coverage.', icon: 'thorn.breadth', combat: Object.freeze({ radiusMult: 1.35, lineCount: 5 }) }),
          blast_seed: Object.freeze({ label: 'Blast Seed', summary: 'Compresses the field into immediate force.', icon: 'thorn.focus', combat: Object.freeze({ radiusMult: .72, seedMult: 1.35 }) }),
        }),
        80: Object.freeze({
          snare_bloom: Object.freeze({ label: 'Snare Bloom', summary: 'Bounded lines guide normal prey inward.', icon: 'thorn.flow', combat: Object.freeze({ snareBloom: 1, snareCap: 4 }) }),
          mine_garden: Object.freeze({ label: 'Mine Garden', summary: 'Durable prey trigger capped mines.', icon: 'thorn.execution', combat: Object.freeze({ mineGarden: 1, mineCap: 3, mineCooldown: .55, mineMult: .55 }) }),
        }),
      }),
    }),
    description: 'Seeds a thorn field ahead that chips and slows everything inside.',
    rankText: rank => `Damage ${Math.round((0.38 + rank * 0.05) * 100)}% ×5 · Radius ${(3.2 + rank * 0.12).toFixed(1)} · Slow`,
  },
  vault_shot: {
    id: 'vault_shot', classId: 'ranger', name: 'Vault Shot', key: 'R', unlockLevel: 10, maxRank: 10, mp: 26, cooldown: 9.0,
    castTime: .42, anim: 'skill_vault_shot', animFallback: 'dodge', effect: 'vault_shot',
    theme: 'windleaf', sfx: 'skill_bow', recipe: 'vaultVolley',
    combat: Object.freeze({
      mult: Object.freeze([0.58, 0.07]),
      dash: Object.freeze([3.6, 0.12]),
      arrows: Object.freeze([4, 1]),
      speed: Object.freeze([16.5, 0.3]),
      spread: 0.14,
      radius: 0.88,
      life: 0.85,
      knockback: 2.6,
      invuln: 0.4,
      criticalBonus: 0.06,
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Staged Vault', summary: 'Launch and landing gain direct shots.', combat: Object.freeze({ launchBlast: 1, landingShot: 1 }) }),
        60: Object.freeze({ label: 'Air Volley', summary: 'A curved volley fires during the staged arc.', anim: 'dodge', combat: Object.freeze({ airVolley: 1, airArrows: 4 }) }),
        100: Object.freeze({ label: 'Sky Hunter', summary: 'Three airborne layers synchronize at landing.', anim: 'skill_vault_shot', combat: Object.freeze({ skyHunter: 1, volleyLayers: 3, arrowCap: 12, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'sky_hunter',apexAudio:'vault_shot'}) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          gale_vault: Object.freeze({ label: 'Gale Vault', summary: 'Longer movement and broader coverage.', icon: 'vault.breadth', combat: Object.freeze({ dashMult: 1.35, spreadMult: 1.35 }) }),
          counter_volley: Object.freeze({ label: 'Counter Volley', summary: 'Shorter movement concentrates retaliation.', icon: 'vault.focus', combat: Object.freeze({ dashMult: .72, spreadMult: .68, damageMult: 1.2 }) }),
        }),
        80: Object.freeze({
          escape_artist: Object.freeze({ label: 'Escape Artist', summary: 'Arrows redirect to distinct nearby prey.', icon: 'vault.flow', combat: Object.freeze({ redirect: 1, redirectCap: 6 }) }),
          perfect_distance: Object.freeze({ label: 'Perfect Distance', summary: 'Seven to eleven meters pressures durable prey.', icon: 'vault.execution', combat: Object.freeze({ idealMin: 7, idealMax: 11, idealMult: 1.55 }) }),
        }),
      }),
    }),
    description: 'Vaults backward along facing and fans arrows into the gap.',
    rankText: rank => `Damage ${Math.round((0.58 + rank * 0.07) * 100)}% · Arrows ${4 + rank} · Vault ${(3.6 + rank * 0.12).toFixed(1)}`,
  },
  hunter_mark: {
    id: 'hunter_mark', classId: 'ranger', name: 'Hunter Mark', key: 'C', unlockLevel: 16, maxRank: 10, mp: 34, cooldown: 13.5,
    castTime: .5, anim: 'skill_hunter_mark', animFallback: 'cast_4', effect: 'hunter_mark',
    theme: 'hunt_gold', sfx: 'skill_bow', recipe: 'markGlyph',
    combat: Object.freeze({
      mult: Object.freeze([1.1, 0.14]),
      range: Object.freeze([14, 0.4]),
      arc: 1.4,
      markDuration: Object.freeze([5.2, 0.35]),
      exposePower: Object.freeze([0.22, 0.03]),
      damageAmp: Object.freeze([0.16, 0.025]),
      knockback: 2.0,
      criticalBonus: 0.08,
      // Rank 3+: re-mark detonates (B5).
      detonateMult: Object.freeze([1.35, 0.15]),
    }),
    evolution: Object.freeze({
      forms: Object.freeze({
        20: Object.freeze({ label: 'Stored Verdict', summary: 'Follow-up damage is stored to a capped detonation.', combat: Object.freeze({ verdictStore: .22, verdictCap: 2.2 }) }),
        60: Object.freeze({ label: 'Piercing Verdict', summary: 'Recast atomically detonates and pierces.', anim: 'cast_4', combat: Object.freeze({ verdictPierce: 1, verdictPierceMult: .55 }) }),
        100: Object.freeze({ label: 'Apex Predator', summary: 'Decorative convergence precedes one verdict event.', anim: 'skill_hunter_mark', combat: Object.freeze({ apexVerdict: 1, convergenceMult: .45, apexFinisher:1 }), presentation:Object.freeze({apexMarker:'predator_verdict',apexAudio:'hunter_mark'}) }),
      }),
      mutations: Object.freeze({
        40: Object.freeze({
          pack_hunt: Object.freeze({ label: 'Pack Hunt', summary: 'Detonation transfers weaker marks nearby.', icon: 'mark.breadth', combat: Object.freeze({ transferMarks: 2, transferMult: .45 }) }),
          prime_target: Object.freeze({ label: 'Prime Target', summary: 'Raises storage and expose on one prey.', icon: 'mark.focus', combat: Object.freeze({ storeMult: 1.35, exposeMult: 1.25 }) }),
        }),
        80: Object.freeze({
          chain_verdict: Object.freeze({ label: 'Chain Verdict', summary: 'Verdict chains twice without recursion.', icon: 'mark.flow', combat: Object.freeze({ verdictChains: 2, chainMult: .38 }) }),
          trophy_shot: Object.freeze({ label: 'Trophy Shot', summary: 'Raises cap and staggers bosses on detonation.', icon: 'mark.execution', combat: Object.freeze({ capMult: 1.45, bossStagger: 26 }) }),
        }),
      }),
    }),
    description: 'Marks the nearest prey ahead — exposed and takes bonus damage. Higher ranks detonate on re-mark.',
    rankText: rank => `Tag ${Math.round((1.1 + rank * 0.14) * 100)}% · Amp +${Math.round((16 + rank * 2.5))}% · ${(5.2 + rank * 0.35).toFixed(1)}s${rank >= 3 ? ' · Detonate' : ''}`,
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
  barbed_tips: {
    id: 'barbed_tips', classId: 'ranger', name: 'Barbed Tips', passive: true, unlockLevel: 5, maxRank: 10,
    effect: { skillPower: .025, dotPower: .05 },
    description: 'Barbs make skills and bleeds bite harder.',
    rankText: rank => `Skill Power +${rank * 2.5}% · DoT +${rank * 5}%`,
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
    weaponBias: Object.freeze({ preferred: Object.freeze(['staff']), mult: 2.8, otherMult: 0 }),
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
    weaponBias: Object.freeze({ preferred: Object.freeze(['dagger', 'saber']), mult: 2.5, otherMult: 0 }),
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
    attackLabel: 'Draw',
    activeSkills: Object.freeze(['piercing_shot', 'caltrop_trap', 'vault_shot', 'hunter_mark']),
    passiveSkills: Object.freeze(['eagle_eye', 'fleet_foot', 'barbed_tips', 'scavenger', 'predator']),
    baseStatMods: Object.freeze({ attack: 1.0, mp: 1.08, skillPower: 0.04, hp: 0.9, defense: 0.88 }),
    apexKeystone: Object.freeze({ id:'marked_convergence', unlockLevel:100, trigger:'apex_finisher', convergenceMult:.35, markRequired:true, perCastCap:1 }),
    // Bows only — prevents ranger auto-equipping blades that break the hunt fantasy.
    weaponBias: Object.freeze({ preferred: Object.freeze(['bow']), mult: 2.6, otherMult: 0 }),
    basicAttack: Object.freeze({
      bolts: 4,
      comboMults: Object.freeze([1.0, 1.08, 1.18, 1.42]),
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
      stormSpeed: 17,
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
});

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

/** Merged basic-attack profile for a class (style defaults + class overrides). */
export function getClassBasicAttack(classId) {
  const def = getHeroClass(classId);
  const ranged = def.attackStyle === 'magic' || def.attackStyle === 'ranged';
  const base = ranged ? MAGIC_BASIC_DEFAULTS : MELEE_BASIC_DEFAULTS;
  return { ...base, ...(def.meleeProfile ?? {}), ...(def.basicAttack ?? {}) };
}

/** True for staff/bow projectile basics (cast clips + orb path). */
export function isRangedAttackStyle(classId) {
  const style = getHeroClass(classId).attackStyle ?? 'melee';
  return style === 'magic' || style === 'ranged';
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
    enhanceLevel: 0, locked: false,
    ...base,
    rarityColor: rarity.color,
  };
  const baseStats = {};
  for (const key of ['power', 'defense', 'hp', 'crit', 'haste', 'leech', 'xpBonus', 'goldBonus', 'skillPower', 'moveSpeed', 'luck']) {
    baseStats[key] = Number(item[key]) || 0;
  }
  item.baseStats = baseStats;
  return item;
}
