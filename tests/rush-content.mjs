import assert from 'node:assert/strict';
import {
  RUSH_CONFIG,
  RUSH_ENCOUNTERS,
  RUSH_GRADES,
  RUSH_HAZARDS,
  RUSH_TROPHIES,
  buildRushPlan,
  buildTrophyOffers,
  createRushRng,
  dailyRushSeed,
  hashRushSeed,
  rushGrade,
  rushShuffle,
} from '../js/data/rushContent.js';
import { RushSystem } from '../js/systems/RushSystem.js';

function ids(rows) {
  return rows.map(row => row.id);
}

assert.equal(RUSH_CONFIG.maxSeconds, 90, 'Rush keeps the promised 90-second ceiling');
assert.equal(RUSH_ENCOUNTERS.length, 6, 'six encounter cards are authored');
assert.equal(Object.keys(RUSH_HAZARDS).length, 6, 'every existing zone has a hazard');
assert.ok(RUSH_TROPHIES.length >= 4, 'trophy pool supports three distinct offers');
assert.deepEqual(ids(RUSH_GRADES), ['S', 'A', 'B', 'C'], 'grades stay in display order');

const seed = hashRushSeed('deterministic-rift');
const planA = buildRushPlan(seed);
const planB = buildRushPlan(seed);
assert.equal(planA.zoneId, planB.zoneId, 'same seed keeps the same zone');
assert.deepEqual(ids(planA.encounters), ids(planB.encounters), 'same seed keeps encounter order');
assert.equal(new Set(ids(planA.encounters)).size, RUSH_CONFIG.encounterCount, 'encounters do not repeat in one run');
assert.equal(planA.apex.id, 'apex_escort', 'every plan ends in the authored apex card');

const rngA = createRushRng(seed);
const rngB = createRushRng(seed);
assert.deepEqual(
  rushShuffle([1, 2, 3, 4, 5], rngA),
  rushShuffle([1, 2, 3, 4, 5], rngB),
  'seeded shuffle is stable',
);

const day = new Date('2026-07-15T23:59:59Z');
assert.equal(dailyRushSeed(day), dailyRushSeed(new Date('2026-07-15T00:00:01Z')), 'daily seed uses UTC date');
assert.notEqual(dailyRushSeed(day), dailyRushSeed(new Date('2026-07-16T00:00:01Z')), 'daily seed changes next UTC day');

assert.equal(rushGrade(12000, true).id, 'S');
assert.equal(rushGrade(9000, true).id, 'A');
assert.equal(rushGrade(6000, true).id, 'B');
assert.equal(rushGrade(1, true).id, 'C');
assert.equal(rushGrade(99999, false).id, 'C', 'failed runs cannot receive a success grade');

const offersA = buildTrophyOffers(seed, { executed: false });
const offersB = buildTrophyOffers(seed, { executed: false });
assert.equal(offersA.length, 3);
assert.equal(new Set(ids(offersA)).size, 3, 'trophy offers are unique');
assert.deepEqual(ids(offersA), ids(offersB), 'trophy offers are deterministic');
assert.ok(offersA.every(offer => !offer.executionPreferred), 'execution-only trophy is excluded without execution');

const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
    clear: () => storage.clear(),
  },
});

function rewardGame(saveState = null) {
  let currentSave = saveState ? structuredClone(saveState) : null;
  let saveCalls = 0;
  return {
    player: { runMods: {}, invalidateStats() {} },
    save: {
      load: () => currentSave && structuredClone(currentSave),
      save: value => {
        saveCalls += 1;
        currentSave = structuredClone(value);
        return true;
      },
    },
    ui: { hideRushOverlays() {}, showRushResult() {}, notify() {} },
    audio: { legendary() {} },
    readSave: () => currentSave,
    saveCalls: () => saveCalls,
  };
}

const huntState = { player: { level: 12, gold: 90, skillPoints: 2, skills: { whirlwind: 3 } } };
const directGame = rewardGame(huntState);
const directRush = new RushSystem(directGame);
const goldTrophy = RUSH_TROPHIES.find(trophy => trophy.id === 'gold_cache');
directRush.phase = 'result';
directRush.result = { runId: 'unit-direct', trophies: [goldTrophy], claimed: false };
assert.equal(directRush.claimTrophy(goldTrophy.id).ok, true, 'first trophy claim succeeds');
assert.equal(directRush.claimTrophy(goldTrophy.id).ok, false, 'second trophy claim is rejected');
assert.equal(directGame.saveCalls(), 1, 'duplicate claim cannot write the Hunt save twice');
assert.equal(directGame.readSave().player.gold, huntState.player.gold + goldTrophy.gold, 'direct reward reaches Hunt gold');
assert.equal(directGame.readSave().player.level, huntState.player.level, 'direct reward preserves Hunt progression');

storage.clear();
const pendingGame = rewardGame(null);
const pendingRush = new RushSystem(pendingGame);
const skillTrophy = RUSH_TROPHIES.find(trophy => trophy.id === 'skill_ember');
pendingRush.phase = 'result';
pendingRush.result = { runId: 'unit-pending', trophies: [skillTrophy], claimed: false };
assert.equal(pendingRush.claimTrophy(skillTrophy.id).ok, true, 'reward banks when no Hunt save exists');
const pendingPlayer = { gold: 0, skillPoints: 0 };
assert.deepEqual(
  pendingRush.consumePendingRewards(pendingPlayer),
  { gold: skillTrophy.gold, skillPoints: skillTrophy.skillPoints },
  'next Hunt consumes the pending reward',
);
assert.deepEqual(pendingRush.consumePendingRewards(pendingPlayer), { gold: 0, skillPoints: 0 }, 'pending reward is consumed once');
assert.equal(pendingPlayer.gold, skillTrophy.gold);
assert.equal(pendingPlayer.skillPoints, skillTrophy.skillPoints);

console.log('Rift Rush content/state tests passed.');
