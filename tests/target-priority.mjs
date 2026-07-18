/** Shared hero auto-target priority regression. */
import * as THREE from '../vendor/three.module.min.js';
import { CombatSystem } from '../js/systems/CombatSystem.js';
import { compareAutoTargets } from '../js/systems/combat/targetPriority.js';

const failures = [];
const ok = (condition, message) => {
  if (condition) console.log(`✓ ${message}`);
  else {
    failures.push(message);
    console.error(`✗ ${message}`);
  }
};

console.log('\n--- target-priority ---\n');

const origin = new THREE.Vector3(0, 0, 0);
const normalNear = { alive: true, id: 'normal-near', radius: 0.5, position: new THREE.Vector3(2, 0, 0) };
const normalFar = { alive: true, id: 'normal-far', radius: 0.5, position: new THREE.Vector3(7, 0, 0) };
const elite = { alive: true, elite: true, id: 'elite', radius: 0.7, position: new THREE.Vector3(9, 0, 0) };
const boss = { alive: true, boss: true, id: 'boss', radius: 1.2, position: new THREE.Vector3(15, 0, 0) };
const enemies = [normalFar, elite, normalNear, boss];
const combat = Object.create(CombatSystem.prototype);
combat.ctx = { enemies: { enemies } };
const player = { position: origin };

ok(combat._autoTargetEnemy(player, 30) === boss, 'shared auto-target selects boss before nearer elite and normal');
boss.alive = false;
ok(combat._autoTargetEnemy(player, 30) === elite, 'shared auto-target falls back from dead boss to elite');
elite.alive = false;
ok(combat._autoTargetEnemy(player, 30) === normalNear, 'shared auto-target selects nearest normal after durable tiers are gone');

boss.alive = true;
elite.alive = true;
const ordered = combat._autoTargetEnemies(player, 30, 4, { clusterRadius: 8 });
ok(
  ordered[0] === boss && ordered[1] === elite && ordered[2] === normalNear && ordered[3] === normalFar,
  'cluster-aware skills preserve boss, elite, then nearest-normal tier order',
);

const nearerBoss = { alive: true, boss: true, id: 'boss-near', radius: 1, position: new THREE.Vector3(8, 0, 0) };
ok(compareAutoTargets(nearerBoss, boss, origin) < 0, 'nearest boss wins inside the boss tier');

const rogueOrdered = combat._rogueTargets(player, 30, 4);
ok(
  rogueOrdered[0] === boss && rogueOrdered[1] === elite && rogueOrdered[2] === normalNear,
  'rogue auto-target path uses the shared boss and elite priority',
);

if (failures.length) {
  console.error(`\ntarget-priority: ${failures.length} failure(s)`);
  process.exitCode = 1;
} else {
  console.log('\ntarget-priority: all checks passed');
}
