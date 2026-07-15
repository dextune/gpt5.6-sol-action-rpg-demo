const freezeRows = rows => Object.freeze(rows.map(row => Object.freeze({ ...row })));

export const RUSH_CONFIG = Object.freeze({
  contentVersion: 1,
  metaKey: 'gpt5.6-sol-rift-rush-v1',
  runLevel: 80,
  activeSkillRank: 3,
  maxSeconds: 90,
  openingSeconds: 1.15,
  draftSeconds: 18,
  actTransitionSeconds: 0.7,
  resultDelaySeconds: 1.1,
  encounterCount: 2,
  maxLivingEnemies: 34,
  spawnInner: 5.5,
  spawnOuter: 10.5,
  bossSpawnDistance: 11,
  hazardFirstDelay: 3.4,
  hazardCadence: 5.2,
  hazardTelegraph: 0.85,
  hazardPlayerDamageRatio: 0.075,
  breakMax: 100,
  breakBasic: 2.2,
  breakSkill: 7.5,
  breakCriticalBonus: 2.5,
  breakBossHitCap: 14,
  breakWindow: 4.2,
  breakDamageMultiplier: 1.22,
  pendingRewardGoldCap: 5000,
  pendingRewardSkillPointCap: 5,
});

export const RUSH_ENCOUNTERS = freezeRows([
  {
    id: 'blood_rush',
    name: 'Blood Rush',
    kicker: 'CHAIN HUNT',
    description: 'Cut through the pack before the blood clock expires.',
    duration: 18,
    count: 16,
    target: 14,
    roles: Object.freeze(['fodder_swarm', 'skirmisher', 'rusher']),
    objective: 'kills',
    timeBonus: 35,
  },
  {
    id: 'treasure_hunt',
    name: 'Treasure Hunt',
    kicker: 'GOLDEN PREY',
    description: 'Bring down the hasted golden target through its escorts.',
    duration: 21,
    count: 10,
    target: 1,
    roles: Object.freeze(['skirmisher', 'rusher', 'frontline']),
    objective: 'target',
    timeBonus: 42,
  },
  {
    id: 'crossfire',
    name: 'Crossfire',
    kicker: 'BREAK THE RING',
    description: 'Ranged hunters surround the arena behind a frontline.',
    duration: 22,
    count: 14,
    target: 12,
    roles: Object.freeze(['glass_ranged', 'artillery', 'frontline']),
    objective: 'kills',
    timeBonus: 32,
  },
  {
    id: 'chain_reaction',
    name: 'Chain Reaction',
    kicker: 'DEATH CASCADE',
    description: 'Fodder deaths detonate against nearby enemies.',
    duration: 19,
    count: 18,
    target: 15,
    roles: Object.freeze(['fodder_swarm', 'skirmisher', 'bruiser']),
    objective: 'kills',
    timeBonus: 36,
  },
  {
    id: 'collapse',
    name: 'Collapse',
    kicker: 'HOLD THE CIRCLE',
    description: 'Clear the attack while the safe arena contracts.',
    duration: 22,
    count: 15,
    target: 13,
    roles: Object.freeze(['frontline', 'controller', 'rusher']),
    objective: 'kills',
    timeBonus: 30,
    safeRadiusStart: 10,
    safeRadiusEnd: 4.8,
  },
  {
    id: 'apex_escort',
    name: 'Apex Escort',
    kicker: 'BREAK THE GUARD',
    description: 'A champion advances behind support and controllers.',
    duration: 22,
    count: 11,
    target: 1,
    roles: Object.freeze(['support', 'controller', 'frontline']),
    objective: 'champion',
    timeBonus: 34,
  },
]);

export const RUSH_HAZARDS = Object.freeze({
  verdant: Object.freeze({ id: 'pollen_burst', name: 'Pollen Burst', color: 0xa8e36f, helpful: true }),
  forest: Object.freeze({ id: 'root_snare', name: 'Root Snare', color: 0x69d57d }),
  canyon: Object.freeze({ id: 'fault_line', name: 'Fault Line', color: 0xffca69 }),
  frost: Object.freeze({ id: 'ice_ring', name: 'Ice Ring', color: 0xd3f6ff, helpful: true }),
  ember: Object.freeze({ id: 'lava_bloom', name: 'Lava Bloom', color: 0xff8050 }),
  astral: Object.freeze({ id: 'rift_collapse', name: 'Rift Collapse', color: 0xc59aff }),
});

export const RUSH_SCORE = Object.freeze({
  normalKill: 100,
  eliteKill: 350,
  bossKill: 2000,
  encounterClear: 1000,
  encounterFail: -400,
  multikillExtra: 250,
  break: 750,
  execution: 1250,
  damagePointPenalty: 2,
  outsideArenaTick: -80,
  remainingSecond: 35,
});

export const RUSH_GRADES = freezeRows([
  { id: 'S', minScore: 11800, color: '#ffe38a' },
  { id: 'A', minScore: 8500, color: '#8ff0c4' },
  { id: 'B', minScore: 5600, color: '#8fd4ff' },
  { id: 'C', minScore: 0, color: '#d9dde2' },
]);

export const RUSH_TROPHIES = freezeRows([
  { id: 'gold_cache', name: 'Gold Cache', description: 'Bank 420G for Hunt.', gold: 420, skillPoints: 0, icon: '◆' },
  { id: 'forge_sigil', name: 'Forge Sigil', description: 'Bank 650G for weapon forging.', gold: 650, skillPoints: 0, icon: '◇' },
  { id: 'skill_ember', name: 'Skill Ember', description: 'Bank 1 Skill Point and 180G.', gold: 180, skillPoints: 1, icon: '✦' },
  { id: 'hunter_mark', name: 'Hunter Mark', description: 'Record a trophy and bank 300G.', gold: 300, skillPoints: 0, collectible: true, icon: '◈' },
  { id: 'apex_coffer', name: 'Apex Coffer', description: 'Bank 520G; executions add prestige.', gold: 520, skillPoints: 0, executionPreferred: true, icon: '♛' },
]);

export const RUSH_ZONE_IDS = Object.freeze(Object.keys(RUSH_HAZARDS));

export function hashRushSeed(value) {
  const text = String(value ?? 'rift');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRushRng(seed) {
  let state = (Number(seed) >>> 0) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function rushPick(rows, rng) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[Math.min(rows.length - 1, Math.floor(rng() * rows.length))];
}

export function rushShuffle(rows, rng) {
  const copy = [...rows];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function dailyRushSeed(date = new Date()) {
  const utc = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
  return hashRushSeed(`sol-rift-v${RUSH_CONFIG.contentVersion}:${utc}`);
}

export function buildRushPlan(seed, options = {}) {
  const normalizedSeed = Number(seed) >>> 0;
  const rng = createRushRng(normalizedSeed);
  const zoneIds = options.zoneIds?.length ? options.zoneIds : RUSH_ZONE_IDS;
  const zoneId = rushPick(zoneIds, rng) ?? 'verdant';
  const regular = RUSH_ENCOUNTERS.filter(row => row.id !== 'apex_escort');
  const encounters = rushShuffle(regular, rng).slice(0, RUSH_CONFIG.encounterCount);
  return Object.freeze({
    seed: normalizedSeed,
    zoneId,
    encounters: Object.freeze(encounters),
    apex: RUSH_ENCOUNTERS.find(row => row.id === 'apex_escort'),
  });
}

export function rushGrade(score, completed = true) {
  if (!completed) return Object.freeze({ id: 'C', minScore: 0, color: '#d9dde2' });
  const value = Math.max(0, Math.round(Number(score) || 0));
  return RUSH_GRADES.find(row => value >= row.minScore) ?? RUSH_GRADES.at(-1);
}

export function buildTrophyOffers(seed, options = {}) {
  const rng = createRushRng(hashRushSeed(`${Number(seed) >>> 0}:trophies`));
  let pool = [...RUSH_TROPHIES];
  if (!options.executed) pool = pool.filter(row => !row.executionPreferred);
  const offers = rushShuffle(pool, rng).slice(0, 3);
  return Object.freeze(offers);
}
