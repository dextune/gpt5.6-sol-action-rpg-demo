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
  dropBias: options.dropBias ?? null,
});

export const ENEMY_TYPES = Object.freeze({
  dew_blob: enemy('dew_blob', 'Dewdrop Jelly', 'verdant', 'blob', 1, 42, 7, 0, 2.7, 1.45, 16, { color: 0x63d58b, accent: 0xb8ffd3, ai: 'swarm', weight: 1.45 }),
  horn_hopper: enemy('horn_hopper', 'Hornbloom Hopper', 'verdant', 'hare', 2, 54, 8, 1, 4.5, 1.4, 20, { color: 0xc5c77a, accent: 0xf2efb2, ai: 'skirmish', weight: 1.25 }),
  brush_boar: enemy('brush_boar', 'Brush Boar', 'verdant', 'boar', 3, 82, 11, 2, 3.8, 1.7, 29, { color: 0x7c7d4e, accent: 0xdac991, ai: 'charge', weight: 1.15 }),
  pollen_wisp: enemy('pollen_wisp', 'Pollen Wisp', 'verdant', 'wisp', 4, 58, 12, 1, 3.1, 8.5, 31, { color: 0xffdb74, accent: 0xfff6b7, ai: 'ranged', weight: 1.05 }),
  leaf_raider: enemy('leaf_raider', 'Leafmask Raider', 'verdant', 'raider', 5, 105, 14, 3, 3.4, 1.8, 39, { color: 0x55955b, accent: 0xe7d07d, ai: 'melee', weight: 0.9 }),
  shellback: enemy('shellback', 'Bronzeshell', 'verdant', 'beetle', 7, 148, 17, 7, 2.8, 1.65, 54, { color: 0x607c4b, accent: 0xb7db6f, ai: 'tank', weight: 0.7 }),
  moss_crown: enemy('moss_crown', 'Mosscrown Colossus', 'verdant', 'colossus', 12, 1650, 27, 10, 2.1, 2.8, 650, { color: 0x456b45, accent: 0x9ce879, ai: 'boss', scale: 1.7, boss: true, special: 'roots' }),

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
  dune_tyrant: enemy('dune_tyrant', 'Dune Tyrant', 'canyon', 'scorpion', 29, 3850, 57, 17, 3.2, 3.4, 1550, { color: 0x9b543b, accent: 0xffb550, ai: 'boss', scale: 1.72, boss: true, special: 'sandstorm' }),

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
  molten_colossus: enemy('molten_colossus', 'Molten Colossus', 'ember', 'colossus', 52, 7200, 111, 31, 2.45, 3.6, 3200, { color: 0x4d2a31, accent: 0xff6c3d, ai: 'boss', scale: 2.05, boss: true, special: 'inferno' }),

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

export const SKILLS = Object.freeze({
  whirlwind: {
    id: 'whirlwind', name: 'Whirlwind Slash', key: 'Q', unlockLevel: 3, maxRank: 5, mp: 18, cooldown: 5.5,
    description: 'Cuts and knocks back nearby enemies in a flurry.', rankText: rank => `Damage ${Math.round(125 + rank * 18)}% · Range ${4.1 + rank * .18}`,
  },
  crescent: {
    id: 'crescent', name: 'Crescent Blade', key: 'E', unlockLevel: 6, maxRank: 5, mp: 22, cooldown: 6.8,
    description: 'Fires a piercing blade that rends the ground.', rankText: rank => `Damage ${Math.round(150 + rank * 22)}% · Pierce ${3 + rank}`,
  },
  skyfall: {
    id: 'skyfall', name: 'Skyfall', key: 'R', unlockLevel: 10, maxRank: 5, mp: 30, cooldown: 9.5,
    description: 'Leaps to the target point and unleashes a shockwave.', rankText: rank => `Damage ${Math.round(185 + rank * 28)}% · Radius ${4.5 + rank * .22}`,
  },
  starburst: {
    id: 'starburst', name: 'Starburst', key: 'C', unlockLevel: 16, maxRank: 5, mp: 42, cooldown: 15,
    description: 'Summons many starlight blades to purge a wide area.', rankText: rank => `Damage ${Math.round(230 + rank * 34)}% · Hits ${6 + rank}`,
  },
  might: {
    id: 'might', name: 'Beast Might', passive: true, unlockLevel: 2, maxRank: 10,
    description: 'Permanently increases attack power.', rankText: rank => `Attack +${rank * 3}%`,
  },
  vitality: {
    id: 'vitality', name: 'Survival Instinct', passive: true, unlockLevel: 2, maxRank: 10,
    description: 'Increases max HP and defense.', rankText: rank => `HP +${rank * 4}% · Defense +${rank * 2}%`,
  },
  focus: {
    id: 'focus', name: 'Blade Focus', passive: true, unlockLevel: 5, maxRank: 10,
    description: 'Increases skill power and mana recovery.', rankText: rank => `Skill Power +${rank * 3}% · MP Regen +${rank * 4}%`,
  },
  fortune: {
    id: 'fortune', name: 'Hunter Fortune', passive: true, unlockLevel: 8, maxRank: 10,
    description: 'Increases rare-gear and gold drop chance.', rankText: rank => `Luck +${rank * 2.5}% · Gold +${rank * 3}%`,
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
