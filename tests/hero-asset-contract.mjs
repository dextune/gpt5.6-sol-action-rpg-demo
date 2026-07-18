/**
 * Static hero/weapon GLB contract test.
 *
 * Two independent sections:
 *   1. Self-test / failure-injection suite — builds small synthetic GLBs in
 *      memory (no dependency on the committed art) and proves the validator
 *      in tools/assets/validate-hero-assets.mjs both passes a fully
 *      compliant fixture and reports a *specific* failure code for each
 *      violation named in docs/plan/character-graphics-animation-overhaul.md
 *      Appendix C ("Asset failure-injection suite").
 *   2. Real-asset contract run — validates every committed hero LOD0 and
 *      starter weapon GLB against the same contract and reports whatever it
 *      finds. Current committed assets predate the v2 pipeline migration
 *      (docs/plan §3.6 "outline proxy", D9 sockets) so specific, expected
 *      violations here are a correct signal for the generator/pipeline
 *      migration to consume — not a bug in this test.
 *
 * Invocation: `node tests/hero-asset-contract.mjs`
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseGlb,
  writeGlb,
  computeContentHash,
  validateHeroGlb,
  validateWeaponGlb,
  checkUniquenessAcrossReports,
} from '../tools/assets/validate-hero-assets.mjs';
import {
  HERO_CLASS_IDS,
  HERO_CLASS_MARKERS,
  HERO_REQUIRED_V2_NODES,
  HERO_RIG_ID,
  HERO_SCHEMA_VERSION,
  CLASS_WEAPON_KIND,
  SHARED_REQUIRED_CLIPS,
  resolveManifestEntry,
} from '../tools/assets/hero-asset-contract.mjs';

const testsDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(testsDir, '..');
const failures = [];
const ok = (condition, message) => (condition ? console.log(`✓ ${message}`) : failures.push(message));

// ---------------------------------------------------------------------------
// Minimal glTF binary packer (accessor/bufferView bookkeeping only)
// ---------------------------------------------------------------------------

const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const COMPONENT_SIZE = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };

function encodeComponents(componentType, data) {
  switch (componentType) {
    case 5126: return Buffer.from(Float32Array.from(data).buffer);
    case 5123: return Buffer.from(Uint16Array.from(data).buffer);
    case 5121: return Buffer.from(Uint8Array.from(data).buffer);
    case 5125: return Buffer.from(Uint32Array.from(data).buffer);
    default: throw new Error(`unsupported componentType ${componentType}`);
  }
}

class Packer {
  constructor() { this.parts = []; this.byteLength = 0; this.bufferViews = []; this.accessors = []; }
  _align(n) { const rem = this.byteLength % n; if (rem) { const pad = n - rem; this.parts.push(Buffer.alloc(pad)); this.byteLength += pad; } }
  addAccessor({ type, componentType, data, target, withBounds = false }) {
    const numComponents = TYPE_COMPONENTS[type];
    const compSize = COMPONENT_SIZE[componentType];
    this._align(compSize);
    const byteOffset = this.byteLength;
    const buf = encodeComponents(componentType, data);
    this.parts.push(buf);
    this.byteLength += buf.length;
    const bufferViewIndex = this.bufferViews.length;
    this.bufferViews.push({ buffer: 0, byteOffset, byteLength: buf.length, ...(target ? { target } : {}) });
    const count = data.length / numComponents;
    const accessor = { bufferView: bufferViewIndex, componentType, count, type };
    if (withBounds) {
      const min = new Array(numComponents).fill(Infinity);
      const max = new Array(numComponents).fill(-Infinity);
      for (let i = 0; i < count; i++) for (let c = 0; c < numComponents; c++) { const v = data[i * numComponents + c]; if (v < min[c]) min[c] = v; if (v > max[c]) max[c] = v; }
      accessor.min = min; accessor.max = max;
    }
    this.accessors.push(accessor);
    return this.accessors.length - 1;
  }
  finish() { return Buffer.concat(this.parts); }
}

function boxGeometry(height, half) {
  const positions = [
    -half, 0, -half, half, 0, -half, half, height, -half, -half, height, -half,
    -half, 0, half, half, 0, half, half, height, half, -half, height, half,
  ];
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ];
  return { positions, indices };
}

// ---------------------------------------------------------------------------
// Hero fixture builder
// ---------------------------------------------------------------------------

/**
 * Build a small, self-contained hero GLB. Every option defaults to a fully
 * contract-compliant value; tests override exactly one thing per case.
 */
function buildHeroGlb(options = {}) {
  const {
    classId = 'gunner',
    heroClassValue = classId,
    assetType = 'hero',
    schemaVersion = HERO_SCHEMA_VERSION,
    rigId = HERO_RIG_ID,
    lod = 0,
    physiqueProfile = classId,
    physiqueVersion = 1,
    modelHeight = 2,
    weaponSocketName = 'weapon_socket_r',
    missingV2Node = null,
    classMarkerName = HERO_CLASS_MARKERS[classId],
    clipNames = SHARED_REQUIRED_CLIPS,
    emptyClipNames = [],
    bodyScale = [1, 1, 1],
    vertexWeights = null, // override: array of 8 [w0,w1,w2,w3]
    materialAlpha = 1,
    materialAlphaMode = undefined,
    materialRole = 'skin',
    withNormalMapNoTangent = false,
  } = options;

  const packer = new Packer();
  const { positions, indices } = boxGeometry(modelHeight, 0.5);
  const posAcc = packer.addAccessor({ type: 'VEC3', componentType: 5126, data: positions, target: 34962, withBounds: true });
  const idxAcc = packer.addAccessor({ type: 'SCALAR', componentType: 5123, data: indices, target: 34963 });
  const joints = [];
  const weights = [];
  for (let i = 0; i < 8; i++) {
    joints.push(0, 0, 0, 0);
    const w = vertexWeights ? vertexWeights[i] : [1, 0, 0, 0];
    weights.push(...w);
  }
  const jointsAcc = packer.addAccessor({ type: 'VEC4', componentType: 5123, data: joints, target: 34962 });
  const weightsAcc = packer.addAccessor({ type: 'VEC4', componentType: 5126, data: weights, target: 34962 });
  const ibmAcc = packer.addAccessor({ type: 'MAT4', componentType: 5126, data: [...IDENTITY16, ...IDENTITY16] });

  const timeAcc = packer.addAccessor({ type: 'SCALAR', componentType: 5126, data: [0, 1] });
  const rotAcc = packer.addAccessor({ type: 'VEC4', componentType: 5126, data: [0, 0, 0, 1, 0, 0, 0.1, 0.995] });

  const material = {
    name: 'hero_skin',
    extras: materialRole ? { materialRole } : undefined,
    pbrMetallicRoughness: { baseColorFactor: [0.8, 0.6, 0.5, materialAlpha] },
    ...(materialAlphaMode ? { alphaMode: materialAlphaMode } : {}),
    ...(withNormalMapNoTangent ? { normalTexture: { index: 0 } } : {}),
  };

  const nodes = [
    { name: 'joint_root', translation: [0, 0, 0], children: [1] },
    { name: 'joint_pelvis', translation: [0, 1, 0] },
    { name: 'hero_body', mesh: 0, skin: 0, scale: bodyScale },
    { name: weaponSocketName, translation: [0.5, modelHeight * 0.7, 0], extras: { socket: 'weapon' } },
    ...HERO_REQUIRED_V2_NODES
      .filter(name => name !== 'weapon_socket_r' && name !== missingV2Node)
      .map(name => ({ name, translation: [0, 0, 0], extras: { socket: name } })),
    ...(classMarkerName ? [{ name: classMarkerName, translation: [0, 1, 0] }] : []),
  ];
  const rootIndex = nodes.length;
  nodes.push({
    name: 'Test_Hero_Rig',
    children: [0, 2, ...Array.from({ length: rootIndex - 3 }, (_, index) => index + 3)],
    extras: {
      ...(assetType !== null ? { assetType } : {}),
      ...(heroClassValue ? { heroClass: heroClassValue } : {}),
      schemaVersion,
      classId,
      rigId,
      lod,
      physiqueProfile,
      physiqueVersion,
      modelHeight,
    },
  });

  const animations = clipNames.map((name) => ({
    name,
    channels: emptyClipNames.includes(name) ? [] : [{ sampler: 0, target: { node: 1, path: 'rotation' } }],
    samplers: emptyClipNames.includes(name) ? [] : [{ input: timeAcc, output: rotAcc, interpolation: 'LINEAR' }],
  }));

  const json = {
    asset: { version: '2.0', generator: 'hero-asset-contract test fixture' },
    scene: 0,
    scenes: [{ nodes: [rootIndex] }],
    nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: posAcc, JOINTS_0: jointsAcc, WEIGHTS_0: weightsAcc }, indices: idxAcc, material: 0 }] }],
    materials: [material],
    skins: [{ joints: [0, 1], inverseBindMatrices: ibmAcc, skeleton: 0 }],
    animations,
    accessors: packer.accessors,
    bufferViews: packer.bufferViews,
    buffers: [{ byteLength: packer.byteLength }],
  };
  return { json, bin: packer.finish() };
}

const IDENTITY16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Build a small, self-contained weapon GLB. */
function buildWeaponGlb(options = {}) {
  const {
    weaponKind = 'rifle',
    weaponKindValue = weaponKind,
    includeMuzzle = true,
    includeGripSupport = true,
    gripName = 'grip_anchor',
    materialAlpha = 1,
    materialAlphaMode = undefined,
    reuseBin = null, // { positions, indices } to force identical content-hash bytes
  } = options;

  const packer = new Packer();
  const geometry = reuseBin || boxGeometry(0.2, 0.05);
  const posAcc = packer.addAccessor({ type: 'VEC3', componentType: 5126, data: geometry.positions, target: 34962, withBounds: true });
  const idxAcc = packer.addAccessor({ type: 'SCALAR', componentType: 5123, data: geometry.indices, target: 34963 });

  const material = {
    name: 'weapon_metal',
    extras: { materialRole: 'bare_metal' },
    pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.55, materialAlpha] },
    ...(materialAlphaMode ? { alphaMode: materialAlphaMode } : {}),
  };

  const socketNodes = [
    { name: gripName, translation: [0, 0, 0] },
    { name: 'blade_base', translation: [0, 0.1, 0] },
    { name: 'blade_tip', translation: [0, 0.2, 0] },
  ];
  if (includeMuzzle) socketNodes.push({ name: 'muzzle_socket', translation: [0, 0.2, 0] });
  if (includeGripSupport) socketNodes.push({ name: 'grip_support', translation: [0, 0.05, 0] });

  const meshNode = { name: 'weapon_mesh', mesh: 0 };
  const children = [meshNode, ...socketNodes];
  const rootNode = {
    name: `weapon_${weaponKind}`,
    extras: weaponKindValue ? { weaponKind: weaponKindValue } : undefined,
    children: children.map((_, i) => i + 1),
  };
  const nodes = [rootNode, ...children];

  const json = {
    asset: { version: '2.0', generator: 'hero-asset-contract test fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: posAcc }, indices: idxAcc, material: 0 }] }],
    materials: [material],
    accessors: packer.accessors,
    bufferViews: packer.bufferViews,
    buffers: [{ byteLength: packer.byteLength }],
  };
  return { json, bin: packer.finish() };
}

function codes(list) { return new Set(list.map((f) => f.code)); }

// ---------------------------------------------------------------------------
// Section 1 — self-test / failure-injection suite
// ---------------------------------------------------------------------------

console.log('--- self-test: baseline fixtures must pass cleanly ---');
{
  const { json, bin } = buildHeroGlb({ classId: 'gunner' });
  const { failures: heroFailures } = validateHeroGlb(json, bin, { classId: 'gunner' });
  ok(heroFailures.length === 0, `baseline hero fixture has zero contract failures (got: ${heroFailures.map((f) => f.code).join(', ')})`);

  // round-trip through the real GLB container writer/parser to also exercise parseGlb/writeGlb.
  const glb = writeGlb(json, bin);
  const parsed = parseGlb(glb);
  const { failures: roundTripFailures } = validateHeroGlb(parsed.json, parsed.bin, { classId: 'gunner' });
  ok(roundTripFailures.length === 0, 'baseline hero fixture survives GLB write/parse round-trip with zero failures');
}
{
  const { json, bin } = buildWeaponGlb({ weaponKind: 'rifle' });
  const { failures: weaponFailures } = validateWeaponGlb(json, bin, { weaponKind: 'rifle', heroHeight: 2 });
  ok(weaponFailures.length === 0, `baseline weapon fixture has zero contract failures (got: ${weaponFailures.map((f) => f.code).join(', ')})`);
}

console.log('--- self-test: Appendix C failure-injection scenarios ---');
{
  // 1/3: manifest/root metadata says the wrong class (Ranger GLB served as Gunner).
  const { json, bin } = buildHeroGlb({ classId: 'gunner', heroClassValue: 'ranger' });
  const { failures } = validateHeroGlb(json, bin, { classId: 'gunner' });
  ok(codes(failures).has('CLASS_MARKER_MISMATCH'), 'wrong class marker (Ranger reported as Gunner) is caught');
}
{
  // 2: weapon manifest points to the wrong weapon kind (staff served as rifle).
  const { json, bin } = buildWeaponGlb({ weaponKind: 'staff' });
  const { failures } = validateWeaponGlb(json, bin, { weaponKind: 'rifle', heroHeight: 2 });
  ok(codes(failures).has('WEAPON_KIND_MISMATCH'), 'wrong weapon kind (staff reused as rifle) is caught');
}
{
  // fallback/placeholder metadata (covers scenario 11's asset-identity half: a fallback asset must not pass as real).
  const { json, bin } = buildHeroGlb({ classId: 'gunner', heroClassValue: 'placeholder' });
  const { failures } = validateHeroGlb(json, bin, { classId: 'gunner' });
  ok(codes(failures).has('FALLBACK_METADATA'), 'placeholder heroClass metadata is caught');

  const { json: json2, bin: bin2 } = buildHeroGlb({ classId: 'gunner', assetType: null });
  const { failures: failures2 } = validateHeroGlb(json2, bin2, { classId: 'gunner' });
  ok(codes(failures2).has('FALLBACK_METADATA'), 'missing assetType metadata is caught');
}
{
  // 4: rifle lacks grip_support / muzzle_socket.
  const noMuzzle = buildWeaponGlb({ weaponKind: 'rifle', includeMuzzle: false });
  const r1 = validateWeaponGlb(noMuzzle.json, noMuzzle.bin, { weaponKind: 'rifle', heroHeight: 2 });
  ok(codes(r1.failures).has('MISSING_SOCKET'), 'rifle missing muzzle_socket is caught');

  const noGripSupport = buildWeaponGlb({ weaponKind: 'rifle', includeGripSupport: false });
  const r2 = validateWeaponGlb(noGripSupport.json, noGripSupport.bin, { weaponKind: 'rifle', heroHeight: 2 });
  ok(codes(r2.failures).has('MISSING_SOCKET'), 'rifle missing grip_support is caught');
}
{
  // Hero missing its primary weapon socket entirely.
  const { json, bin } = buildHeroGlb({ classId: 'gunner', weaponSocketName: 'not_a_socket' });
  const { failures } = validateHeroGlb(json, bin, { classId: 'gunner' });
  ok(codes(failures).has('MISSING_SOCKET'), 'hero missing weapon_socket node is caught');
}
{
  const { json, bin } = buildHeroGlb({ classId: 'gunner', missingV2Node: 'foot_contact_l' });
  const { failures } = validateHeroGlb(json, bin, { classId: 'gunner' });
  ok(codes(failures).has('MISSING_V2_NODE'), 'hero missing a schema-v2 foot-contact node is caught');
}
{
  const { json, bin } = buildHeroGlb({ classId: 'gunner', schemaVersion: 1 });
  const { failures } = validateHeroGlb(json, bin, { classId: 'gunner' });
  ok(codes(failures).has('HERO_SCHEMA_MISMATCH'), 'stale hero schema metadata is caught');
}
{
  const { json, bin } = buildHeroGlb({ classId: 'gunner', physiqueProfile: 'aerin' });
  const { failures } = validateHeroGlb(json, bin, { classId: 'gunner' });
  ok(codes(failures).has('HERO_PHYSIQUE_MISMATCH'), 'wrong class physique metadata is caught');
}
{
  // 5: required Gunner skill clip is absent.
  const clipNames = SHARED_REQUIRED_CLIPS.filter((name) => name !== 'walk');
  const { json, bin } = buildHeroGlb({ classId: 'gunner', clipNames });
  const { failures } = validateHeroGlb(json, bin, { classId: 'gunner' });
  ok(codes(failures).has('MISSING_REQUIRED_CLIP'), 'missing required clip ("walk") is caught');
}
{
  // 6: clip name exists but contains zero tracks.
  const { json, bin } = buildHeroGlb({ classId: 'gunner', emptyClipNames: ['run'] });
  const { failures } = validateHeroGlb(json, bin, { classId: 'gunner' });
  ok(codes(failures).has('EMPTY_CLIP_TRACKS'), 'clip present with zero channels/tracks is caught');
}
{
  // 7: a skinned primitive has unnormalized weights.
  const unnormalized = Array.from({ length: 8 }, () => [2, 0, 0, 0]);
  const { json, bin } = buildHeroGlb({ classId: 'gunner', vertexWeights: unnormalized });
  const { failures } = validateHeroGlb(json, bin, { classId: 'gunner' });
  ok(codes(failures).has('SKIN_WEIGHT_NOT_NORMALIZED'), 'unnormalized skin weights are caught');

  // 7b: empty (all-zero) weights.
  const empty = Array.from({ length: 8 }, () => [0, 0, 0, 0]);
  const { json: json2, bin: bin2 } = buildHeroGlb({ classId: 'gunner', vertexWeights: empty });
  const { failures: failures2 } = validateHeroGlb(json2, bin2, { classId: 'gunner' });
  ok(codes(failures2).has('SKIN_WEIGHT_UNWEIGHTED'), 'all-zero (unweighted) skin weights are caught');
}
{
  // 8: a normal-mapped material lacks TANGENT.
  const { json, bin } = buildHeroGlb({ classId: 'gunner', withNormalMapNoTangent: true });
  const { failures } = validateHeroGlb(json, bin, { classId: 'gunner' });
  ok(codes(failures).has('MISSING_TANGENT_FOR_NORMAL_MAP'), 'normal-mapped material without TANGENT is caught');
}
{
  // 9: a visible ancestor has negative scale.
  const { json, bin } = buildHeroGlb({ classId: 'gunner', bodyScale: [-1, 1, 1] });
  const { failures } = validateHeroGlb(json, bin, { classId: 'gunner' });
  ok(codes(failures).has('NEGATIVE_SCALE_ANCESTRY'), 'negative-scale mesh ancestor is caught');
}
{
  // 10: an approved opaque material exports as alpha blend / near-zero opacity (outline-proxy pattern).
  const { json, bin } = buildHeroGlb({ classId: 'gunner', materialAlpha: 0.001, materialAlphaMode: 'BLEND' });
  const { failures } = validateHeroGlb(json, bin, { classId: 'gunner' });
  ok(codes(failures).has('FORBIDDEN_ALPHA_PROXY'), 'near-zero-opacity outline-proxy-like material is caught');

  const { json: json2, bin: bin2 } = buildHeroGlb({ classId: 'gunner', materialAlpha: 0.6, materialAlphaMode: 'BLEND', materialRole: 'skin' });
  const { failures: failures2 } = validateHeroGlb(json2, bin2, { classId: 'gunner' });
  ok(codes(failures2).has('FORBIDDEN_ALPHA_PROXY'), 'unapproved alpha-blend material (role != approved_alpha) is caught');
}
{
  // Uniqueness / anti-reuse: a renamed copy (identical geometry bytes under a different identity) must be caught.
  const sharedGeometry = boxGeometry(0.2, 0.05);
  const rifle = buildWeaponGlb({ weaponKind: 'rifle', reuseBin: sharedGeometry });
  const staff = buildWeaponGlb({ weaponKind: 'staff', reuseBin: sharedGeometry });
  const rifleHash = computeContentHash(rifle.json, rifle.bin);
  const staffHash = computeContentHash(staff.json, staff.bin);
  ok(rifleHash === staffHash, 'content hash is a pure function of mesh bytes (sanity check for the reuse fixture)');
  const uniquenessFailures = checkUniquenessAcrossReports([
    { hashes: [{ kind: 'weapon', weaponKind: 'rifle', hash: rifleHash }] },
    { hashes: [{ kind: 'weapon', weaponKind: 'staff', hash: staffHash }] },
  ]);
  ok(codes(uniquenessFailures).has('DUPLICATE_CONTENT_HASH'), 'renamed-copy reuse (identical geometry under a different weapon identity) is caught');

  const distinctHashes = checkUniquenessAcrossReports([
    { hashes: [{ kind: 'weapon', weaponKind: 'rifle', hash: 'aaa' }] },
    { hashes: [{ kind: 'weapon', weaponKind: 'staff', hash: 'bbb' }] },
  ]);
  ok(distinctHashes.length === 0, 'distinct geometry under distinct identities does not false-positive on uniqueness');
}

// ---------------------------------------------------------------------------
// Section 2 — real committed hero/weapon assets
// ---------------------------------------------------------------------------

console.log('\n--- real-asset contract run (assets/models/hero + assets/models/props) ---');
const manifest = JSON.parse(await readFile(resolve(root, 'assets/manifests/assets.json'), 'utf8'));
const reports = [];
for (const classId of HERO_CLASS_IDS) {
  const entry = resolveManifestEntry(manifest, classId);
  const heroReports = [];
  for (const [lod, url] of Object.entries(entry.heroLodUrls)) {
    const heroPath = resolve(root, url.replace(/^\.\//, ''));
    const hero = parseGlb(await readFile(heroPath));
    const result = validateHeroGlb(hero.json, hero.bin, { classId });
    heroReports.push({ lod, hero, result });
  }

  const weaponPath = resolve(root, entry.weaponUrl.replace(/^\.\//, ''));
  const weapon = parseGlb(await readFile(weaponPath));
  const highHero = heroReports.find(({ lod }) => lod === 'high') ?? heroReports[0];
  const weaponResult = validateWeaponGlb(weapon.json, weapon.bin, {
    weaponKind: entry.weaponKind,
    heroHeight: highHero.result.stats.height,
  });

  console.log(`\n${classId} (weapon: ${entry.weaponKind})`);
  ok(entry.weaponKind === CLASS_WEAPON_KIND[classId], `manifest weapon kind for ${classId} matches content.js starterWeapon mapping`);
  for (const { lod, result } of heroReports) {
    if (result.failures.length === 0) console.log(`  ✓ hero.${classId} ${lod} contract OK`);
    for (const failure of result.failures) console.log(`  · [${failure.code}] hero.${classId} ${lod}: ${failure.message}`);
    ok(result.failures.length === 0, `hero.${classId} ${lod} passes the complete shipping contract (got: ${result.failures.map((failure) => failure.code).join(', ') || 'none'})`);
  }
  if (weaponResult.failures.length === 0) console.log(`  ✓ weapon.${entry.weaponKind} contract OK`);
  for (const failure of weaponResult.failures) console.log(`  · [${failure.code}] weapon.${entry.weaponKind}: ${failure.message}`);
  ok(weaponResult.failures.length === 0, `weapon.${entry.weaponKind} passes the complete shipping contract (got: ${weaponResult.failures.map((failure) => failure.code).join(', ') || 'none'})`);

  reports.push({
    classId,
    weaponKind: entry.weaponKind,
    hashes: [
      ...heroReports.map(({ lod, hero }) => ({
        kind: 'hero',
        classId: `${classId}:${lod}`,
        hash: computeContentHash(hero.json, hero.bin),
      })),
      { kind: 'weapon', weaponKind: entry.weaponKind, hash: computeContentHash(weapon.json, weapon.bin) },
    ],
  });
}

const realUniqueness = checkUniquenessAcrossReports(reports);
ok(realUniqueness.length === 0, `no duplicate mesh content across the five committed hero/weapon sets (got: ${realUniqueness.map((f) => f.message).join('; ') || 'none'})`);

if (failures.length) {
  console.error(`\n${failures.length} hero-asset-contract failure(s):`);
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}
console.log(`\nAll hero-asset-contract checks passed · ${reports.length} classes checked`);
