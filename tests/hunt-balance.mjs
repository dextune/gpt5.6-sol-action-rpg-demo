import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three.module.min.js';
import {
  GAME_CONFIG,
  HORDE_CONFIG,
  HUNT_SPAWN_CONFIG,
  defenseWaveDmgMul,
  defenseWaveHpMul,
  enemyGoldLevelMul,
  huntEnemyStatMultipliers,
} from '../js/config.js';
import { Enemy } from '../js/entities/Enemy.js';
import { LootSystem } from '../js/systems/LootSystem.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function makeMonsterFactory() {
  return {
    create() {
      const group = new THREE.Group();
      const healthGroup = new THREE.Group();
      group.add(healthGroup);
      return {
        group,
        refs: {
          healthGroup,
          healthWidth: 1,
          healthFill: {
            scale: new THREE.Vector3(1, 1, 1),
            position: new THREE.Vector3(),
            material: { color: new THREE.Color() },
          },
          modelHeight: 1.6,
        },
        animation: {
          has() { return false; },
          setLocomotion() {},
          update() {},
          dispose() {},
          playOneShot() {},
        },
      };
    },
  };
}

const enemyData = Object.freeze({
  id: 'balance-fixture',
  name: 'Balance Fixture',
  level: 1,
  hp: 100,
  damage: 10,
  defense: 5,
  speed: 2,
  range: 1.4,
  xp: 10,
  gold: [10, 10],
  scale: 1,
  boss: false,
  ranged: false,
});

const scene = new THREE.Scene();
const monsterFactory = makeMonsterFactory();
const huntEnemy = new Enemy(
  scene,
  enemyData,
  new THREE.Vector3(),
  { level: 11, worldTier: 1 },
  monsterFactory,
  'low',
);
const defenseEnemy = new Enemy(
  scene,
  enemyData,
  new THREE.Vector3(),
  { level: 11, worldTier: 1, wave: 1, defenseWave: true },
  monsterFactory,
  'low',
);

const huntGrowth = huntEnemyStatMultipliers(10, 1);
const underLevelGrowth = huntEnemyStatMultipliers(-4, 1);
assert.equal(huntEnemy.maxHp, Math.round(enemyData.hp * huntGrowth.hp));
assert.equal(huntEnemy.damage, enemyData.damage * huntGrowth.damage);
assert.equal(huntEnemy.defense, enemyData.defense * huntGrowth.defense);
assert.ok(huntEnemy.maxHp > defenseEnemy.maxHp, 'Hunt HP growth should be stronger than the preserved Defense level curve');
assert.ok(huntEnemy.damage > defenseEnemy.damage, 'Hunt damage growth should be stronger than the preserved Defense level curve');
assert.ok(huntEnemy.defense > defenseEnemy.defense, 'Hunt defense growth should be stronger than the preserved Defense level curve');
assert.ok(Math.abs(underLevelGrowth.hp - 0.72) < 1e-9);
assert.ok(Math.abs(underLevelGrowth.damage - 0.78) < 1e-9);
assert.ok(Math.abs(underLevelGrowth.defense - 0.82) < 1e-9);

const defenseLevelScale = 1 + 10 * 0.092;
assert.equal(defenseEnemy.maxHp, Math.round(enemyData.hp * defenseLevelScale * defenseWaveHpMul(1)));
assert.equal(defenseEnemy.damage, enemyData.damage * (1 + 10 * 0.055) * defenseWaveDmgMul(1));
assert.equal(defenseEnemy.defense, enemyData.defense * (1 + 10 * 0.045));

assert.equal(enemyGoldLevelMul(1), 1);
assert.ok(Math.abs(enemyGoldLevelMul(50) - 3.94) < 1e-9);
assert.ok(Math.abs(enemyGoldLevelMul(100) - 6.94) < 1e-9);
assert.ok(enemyGoldLevelMul(100) > enemyGoldLevelMul(50));

function goldFor(mode, level, wave = 1) {
  const player = {
    alive: true,
    level,
    luck: 0,
    position: new THREE.Vector3(),
    gold: 0,
    potions: 2,
    maxPotions: 2,
    addGold(amount) { this.gold += amount; return amount; },
  };
  const game = {
    mode,
    player,
    hunt: { worldTier: 1 },
    defense: { wave },
    ui: { floatText() {} },
    audio: { pickup() {} },
    effects: { burst() {} },
    requestSave() {},
  };
  const loot = new LootSystem(game);
  loot.dropFromEnemy({
    level,
    wave,
    goldRange: [10, 10],
    position: new THREE.Vector3(),
    refs: { modelHeight: 1.6 },
    elite: false,
    boss: false,
  });
  return player.gold;
}

assert.ok(goldFor('hunt', 50) > goldFor('hunt', 1) * 3.7, 'Hunt gold should scale with enemy level');
assert.ok(goldFor('defense', 50, 10) > goldFor('defense', 1, 10) * 3.7, 'Defense gold should share level scaling');

assert.ok(GAME_CONFIG.targetEnemies >= 72 && GAME_CONFIG.maxEnemies >= 108);
assert.ok(HUNT_SPAWN_CONFIG.initialEnemies >= 64);
assert.ok(HUNT_SPAWN_CONFIG.sparseInterval < 0.06 && HUNT_SPAWN_CONFIG.steadyInterval < 0.22);
assert.ok(HORDE_CONFIG.packMin >= 5 && HORDE_CONFIG.packMax >= 9 && HORDE_CONFIG.packChance >= 0.68);

const defenseSource = await readFile(join(root, 'js/systems/DefenseSystem.js'), 'utf8');
assert.ok(!defenseSource.includes('HUNT_SPAWN_CONFIG'), 'Defense wave scheduling must not consume Hunt density tuning');

huntEnemy.forceRemove();
defenseEnemy.forceRemove();

console.log('Hunt balance checks passed: denser Hunt, stronger Hunt growth, shared level-scaled gold.');
