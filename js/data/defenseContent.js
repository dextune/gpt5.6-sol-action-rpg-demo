/**
 * Defense mode encounter cards and decision mutators.
 * Hunt never imports this for gameplay paths.
 */

const freezeRows = rows => Object.freeze(rows.map(row => Object.freeze({ ...row })));

/** Behavioral wave identities — not pure stat multipliers. */
export const DEFENSE_ENCOUNTERS = freezeRows([
  {
    id: 'swarm_break',
    name: 'Swarm Break',
    kicker: 'DON\'T GET SURROUNDED',
    description: 'A dense fodder ring closes in. Carve space fast.',
    fodderBoost: 0.22,
    countBonus: 4,
    spawnInner: 7,
    spawnOuter: 16,
    speedBonus: 0.06,
  },
  {
    id: 'elite_hunt',
    name: 'Elite Hunt',
    kicker: 'MARKED PREY',
    description: 'Guaranteed elites stalk the field. Prioritize them.',
    guaranteedElites: 2,
    exposeElites: true,
    countBonus: 0,
    eliteChanceBonus: 0.12,
  },
  {
    id: 'gate_push',
    name: 'Gate Push',
    kicker: 'HOLD THE CIRCLE',
    description: 'Pressure comes from one arc. Stay near camp ground.',
    spawnArc: true,
    spawnInner: 9,
    spawnOuter: 18,
    countBonus: 2,
  },
  {
    id: 'boss_prelude',
    name: 'Boss Prelude',
    kicker: 'CHAMPION FOCUS',
    description: 'A champion leads the wave with a thin support pack.',
    forceChampion: true,
    countMul: 0.72,
  },
  {
    id: 'hazard_storm',
    name: 'Hazard Storm',
    kicker: 'MOVE OR DIE',
    description: 'Ground ruptures pulse across the arena.',
    hazard: true,
    hazardCadence: 4.2,
    hazardRadius: 3.4,
    hazardDamageRatio: 0.055,
    countBonus: 1,
  },
]);

/** Mutators that change decisions, not only numbers. */
export const DEFENSE_MUTATORS = freezeRows([
  { id: 'swift', label: 'Swift Tide', summary: 'Enemies move and attack faster.' },
  { id: 'armored', label: 'Iron Tide', summary: 'Enemies brace for more hits.' },
  { id: 'frenzy', label: 'Frenzy Tide', summary: 'More bodies, higher elite pressure.' },
  { id: 'scarce', label: 'Scarce Tide', summary: 'Fewer potions between waves.', minWave: 12 },
  { id: 'blood_tempo', label: 'Blood Tempo', summary: 'Kills grant a short haste stack.', minWave: 3 },
  { id: 'glass_cannon', label: 'Glass Cannon', summary: 'Enemies hit harder but die faster.', minWave: 6 },
  { id: 'no_potion', label: 'Dry Canteen', summary: 'Potions blocked this mutator window; clear restores one.', minWave: 9 },
  { id: 'dark_ring', label: 'Dark Ring', summary: 'Outer ring chips you — stay near camp.', minWave: 15 },
  { id: 'double_champ', label: 'Twin Champions', summary: 'Milestone waves may spawn two champions.', minWave: 20 },
]);

export function pickDefenseEncounter(wave, rng = Math.random) {
  if (wave < 2) return null;
  // Every wave from 2+ gets a light identity; weight toward set pieces every 3.
  const pool = DEFENSE_ENCOUNTERS.slice();
  if (wave % 5 === 0) {
    const boss = pool.find(row => row.id === 'boss_prelude');
    if (boss) return boss;
  }
  if (wave % 3 === 0) {
    const storm = pool.find(row => row.id === 'hazard_storm');
    if (storm && rng() < 0.55) return storm;
  }
  const index = Math.floor(rng() * pool.length) % pool.length;
  return pool[index] ?? null;
}

export function pickDefenseMutator(wave, rng = Math.random) {
  const pool = DEFENSE_MUTATORS.filter(row => wave >= (row.minWave ?? 1));
  if (!pool.length) return null;
  // Stable-ish rotation with a little noise so deep climbs feel varied.
  const base = Math.floor(wave / 3);
  const jitter = Math.floor(rng() * 2);
  return pool[(base + jitter) % pool.length];
}
