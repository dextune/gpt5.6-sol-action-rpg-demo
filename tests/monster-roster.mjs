/**
 * New 20-monster roster gate: catalog, unique procedural silhouettes, and spawn wiring.
 */
import * as THREE from 'three';
import { ENEMY_ROLES, ENEMY_TYPES, ZONE_SPAWNS } from '../js/data/content.js';
import { MonsterFactory } from '../js/characters/MonsterFactory.js';

const NEW_MONSTERS = Object.freeze({
  snapjaw_bloom: 'flytrap', nectar_urn: 'pitcher', grove_pangolin: 'pangolin',
  razor_mantis: 'mantis', lantern_moth: 'moth', root_centipede: 'centipede',
  thornback_devil: 'thornback', dune_fennec: 'fennec', blasttail_beetle: 'bombardier',
  rime_muskox: 'muskox', snowtail_leopard: 'snow_leopard', glacier_walrus: 'walrus',
  cinder_salamander: 'salamander', furnace_ant: 'fire_ant', slagfoot_snail: 'slag_snail',
  pyre_phoenix: 'phoenix', lurestar_angler: 'angler', veil_vampire: 'vampire_squid',
  chainlight_colony: 'siphonophore', void_nautilus: 'nautilus',
});

const failures = [];
const ok = (condition, message) => {
  if (condition) console.log(`✓ ${message}`);
  else failures.push(message);
};

const outlines = { configure() {} };
const assets = {
  cloneModel(key) { throw new Error(`Unexpected GLB path for new procedural monster: ${key}`); },
  getTexture() { return null; },
};
const factory = new MonsterFactory(assets, outlines);
const roles = new Set(ENEMY_ROLES);
const shapes = Object.values(NEW_MONSTERS);
const zoneCounts = {};
const signatures = new Map();

ok(Object.keys(NEW_MONSTERS).length === 20, 'exactly 20 new monster ids are under test');
ok(new Set(shapes).size === 20, 'all 20 new monsters own a distinct shape key');

for (const [id, shape] of Object.entries(NEW_MONSTERS)) {
  const data = ENEMY_TYPES[id];
  ok(Boolean(data), `${id} exists in ENEMY_TYPES`);
  if (!data) continue;
  ok(data.shape === shape, `${id} owns shape ${shape}`);
  ok(!data.boss && !data.miniBoss, `${id} is eligible for normal spawn pools`);
  ok(roles.has(data.role), `${id} has a valid Defense role`);
  ok(Array.isArray(data.tags) && data.tags.length >= 2, `${id} carries researched feature tags`);
  ok(ZONE_SPAWNS[data.zone]?.some(entry => entry.id === id), `${id} is wired into ${data.zone} Hunt/Defense pool`);
  zoneCounts[data.zone] = (zoneCounts[data.zone] ?? 0) + 1;

  const created = factory.create(data, { quality: 'low' });
  ok(created.refs.procedural && !created.refs.fallback, `${id} uses its procedural builder without GLB fallback`);
  ok(created.refs.shape === shape && created.group.userData.proceduralShape === shape,
    `${id} preserves shape identity through MonsterFactory`);

  const geometryCounts = {};
  let meshes = 0;
  created.group.traverse(object => {
    if (!object.isMesh || object === created.refs.healthFill) return;
    meshes += 1;
    const type = object.geometry?.type ?? 'unknown';
    geometryCounts[type] = (geometryCounts[type] ?? 0) + 1;
  });
  const box = new THREE.Box3().setFromObject(created.group);
  const size = box.getSize(new THREE.Vector3());
  ok(meshes >= 8, `${id} has a readable multi-part model (${meshes} meshes)`);
  ok([size.x, size.y, size.z].every(value => Number.isFinite(value) && value > .2 && value < 12),
    `${id} has finite playable bounds (${size.toArray().map(value => value.toFixed(2)).join('×')})`);
  const signature = `${Object.entries(geometryCounts).sort().map(([type, count]) => `${type}:${count}`).join('|')}`
    + `@${size.toArray().map(value => value.toFixed(2)).join('x')}`;
  if (signatures.has(signature)) failures.push(`${id} duplicates silhouette signature of ${signatures.get(signature)}`);
  else signatures.set(signature, id);
}

ok(signatures.size === 20, 'all 20 generated models have distinct geometry/bounds signatures');
ok(zoneCounts.verdant === 3 && zoneCounts.forest === 3 && zoneCounts.canyon === 3
  && zoneCounts.frost === 3 && zoneCounts.ember === 4 && zoneCounts.astral === 4,
  `new roster is distributed 3/3/3/3/4/4 across zones (${JSON.stringify(zoneCounts)})`);

if (failures.length) {
  console.error(`\n${failures.length} monster-roster failure(s):`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exitCode = 1;
  throw new Error('monster-roster validation failed');
}

console.log('\nmonster-roster: all 20 new monsters generate and spawn correctly');
