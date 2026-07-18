#!/usr/bin/env node
/**
 * Deterministic static GLB contract/stats validator for the five hero
 * classes and their starter weapons.
 *
 * Parses GLB JSON/binary chunks directly (no glTF loader, no network,
 * no vendor Three.js dependency) and checks:
 *   - container validity (magic/version/chunk framing);
 *   - finite, positive-scale transforms and no negative scale anywhere in
 *     the ancestry of a visible mesh;
 *   - required identity metadata (hero classId / weapon weaponKind) and
 *     rejection of fallback/placeholder markers;
 *   - required socket/marker nodes per docs/plan §7.3;
 *   - content-hash uniqueness across the validated set (catches a renamed
 *     copy of another class/weapon);
 *   - bounding-box height / weapon-length ratio guardrails;
 *   - non-empty required animation clips with real tracks;
 *   - skin weight finiteness/normalization/influence-count where present;
 *   - material role/alpha policy, forbidding outline-proxy / near-zero
 *     opacity meshes and unapproved alpha-blend materials;
 *   - tangent presence when a material carries a normal map.
 *
 * Usage:
 *   node tools/assets/validate-hero-assets.mjs                 # all 5 classes + weapons
 *   node tools/assets/validate-hero-assets.mjs --class gunner   # one class + its weapon
 *   node tools/assets/validate-hero-assets.mjs --lod low        # validate low-quality LOD path too
 *
 * Exit code is non-zero when any contract violation is found. This module
 * is also imported (not just run as a CLI) by tests/hero-asset-contract.mjs
 * and by tools/assets/hero-asset-contract.mjs consumers.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPROVED_ALPHA_ROLE,
  CLASS_WEAPON_KIND,
  FORBIDDEN_IDENTITY_TOKENS,
  HERO_CLASS_IDS,
  HERO_SOCKET_ALIASES,
  HERO_CLASS_MARKERS,
  HERO_REQUIRED_V2_NODES,
  HERO_RIG_ID,
  HERO_SCHEMA_VERSION,
  SHARED_REQUIRED_CLIPS,
  SKIN_WEIGHT_SUM_TOLERANCE,
  WEAPON_KIND_INFO,
  WEAPON_SOCKET_ALIASES,
  BOUNDS,
  resolveManifestEntry,
} from './hero-asset-contract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'

const COMPONENT_TYPE_ARRAY = {
  5120: Int8Array, // BYTE
  5121: Uint8Array, // UNSIGNED_BYTE
  5122: Int16Array, // SHORT
  5123: Uint16Array, // UNSIGNED_SHORT
  5125: Uint32Array, // UNSIGNED_INT
  5126: Float32Array, // FLOAT
};
const COMPONENT_TYPE_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const NORMALIZED_MAX = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

// ---------------------------------------------------------------------------
// GLB container parse / write
// ---------------------------------------------------------------------------

/** Parse a GLB Buffer into { json, bin } (bin may be null if no BIN chunk). */
export function parseGlb(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.length < 12) throw new Error('GLB too short for header');
  const magic = buffer.readUInt32LE(0);
  const version = buffer.readUInt32LE(4);
  const length = buffer.readUInt32LE(8);
  if (magic !== GLB_MAGIC) throw new Error(`not a GLB file (bad magic 0x${magic.toString(16)})`);
  if (version !== 2) throw new Error(`unsupported GLB version ${version}`);
  if (length > buffer.length) throw new Error(`GLB declares length ${length} but file is ${buffer.length} bytes`);

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkStart + chunkLength > buffer.length) throw new Error('GLB chunk overruns file bounds');
    const chunkData = buffer.subarray(chunkStart, chunkStart + chunkLength);
    if (chunkType === CHUNK_JSON) json = JSON.parse(chunkData.toString('utf8'));
    else if (chunkType === CHUNK_BIN) bin = chunkData;
    offset = chunkStart + chunkLength;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

function pad4(buf, fill) {
  const remainder = buf.length % 4;
  if (remainder === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(4 - remainder, fill)]);
}

/** Assemble a GLB Buffer from a glTF JSON object and an optional binary buffer. */
export function writeGlb(json, bin = Buffer.alloc(0)) {
  const jsonChunk = pad4(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const binChunk = pad4(Buffer.isBuffer(bin) ? bin : Buffer.from(bin), 0);
  const totalLength = 12 + 8 + jsonChunk.length + (binChunk.length ? 8 + binChunk.length : 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(CHUNK_JSON, 4);
  const parts = [header, jsonHeader, jsonChunk];
  if (binChunk.length) {
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binChunk.length, 0);
    binHeader.writeUInt32LE(CHUNK_BIN, 4);
    parts.push(binHeader, binChunk);
  }
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// Accessor reading
// ---------------------------------------------------------------------------

/** Read a glTF accessor into a flat array of component arrays (one per element), normalized to [0,1] ranges applied. */
function readAccessor(json, bin, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`missing accessor ${accessorIndex}`);
  const numComponents = TYPE_COMPONENTS[accessor.type];
  if (!numComponents) throw new Error(`unsupported accessor type ${accessor.type}`);
  const ArrayCtor = COMPONENT_TYPE_ARRAY[accessor.componentType];
  if (!ArrayCtor) throw new Error(`unsupported componentType ${accessor.componentType}`);
  const count = accessor.count;
  const out = new Float64Array(count * numComponents);
  if (accessor.bufferView === undefined) return { count, numComponents, values: out }; // sparse-only / all-zero accessor
  const bufferView = json.bufferViews?.[accessor.bufferView];
  if (!bufferView) throw new Error(`missing bufferView ${accessor.bufferView}`);
  if (!bin) throw new Error('accessor references a bufferView but GLB has no BIN chunk');
  const componentSize = COMPONENT_TYPE_SIZE[accessor.componentType];
  const elementSize = componentSize * numComponents;
  const stride = bufferView.byteStride || elementSize;
  const base = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const normMax = accessor.normalized ? NORMALIZED_MAX[accessor.componentType] : undefined;
  for (let i = 0; i < count; i++) {
    const elementOffset = base + i * stride;
    for (let c = 0; c < numComponents; c++) {
      const byteOffset = elementOffset + c * componentSize;
      let value;
      switch (accessor.componentType) {
        case 5126: value = bin.readFloatLE(byteOffset); break;
        case 5125: value = bin.readUInt32LE(byteOffset); break;
        case 5123: value = bin.readUInt16LE(byteOffset); break;
        case 5122: value = bin.readInt16LE(byteOffset); break;
        case 5121: value = bin.readUInt8(byteOffset); break;
        case 5120: value = bin.readInt8(byteOffset); break;
        default: throw new Error(`unsupported componentType ${accessor.componentType}`);
      }
      out[i * numComponents + c] = normMax ? Math.max(-1, value / normMax) : value;
    }
  }
  return { count, numComponents, values: out };
}

// ---------------------------------------------------------------------------
// Scene-graph / transform math (column-major 4x4, glTF/three.js convention)
// ---------------------------------------------------------------------------

const IDENTITY_MAT4 = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function composeMatrix(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = s;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}

function multiplyMat4(a, b) {
  const out = new Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function transformPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

/** Sign of the determinant of the linear (3x3) part — negative means a mirrored/negative-scale ancestor. */
function linearDeterminantSign(m) {
  const det =
    m[0] * (m[5] * m[10] - m[6] * m[9]) -
    m[1] * (m[4] * m[10] - m[6] * m[8]) +
    m[2] * (m[4] * m[9] - m[5] * m[8]);
  if (!Number.isFinite(det) || det === 0) return 0;
  return det > 0 ? 1 : -1;
}

function localMatrixForNode(node) {
  if (Array.isArray(node.matrix)) return node.matrix.map(Number);
  const t = node.translation || [0, 0, 0];
  const q = node.rotation || [0, 0, 0, 1];
  const s = node.scale || [1, 1, 1];
  return composeMatrix(t, q, s);
}

function allFinite(arr) {
  return arr.every((v) => Number.isFinite(v));
}

/**
 * Walk the default scene, computing world matrices, and return:
 *  - nodesByName: Map(name -> {index, node, worldMatrix})
 *  - failures: transform-related contract violations already found
 *  - meshWorldBounds: [min[3], max[3]] over every non-outline-proxy mesh vertex, in world space
 *  - roots: node indices in the default scene
 */
function walkScene(json, bin) {
  const failures = [];
  const nodesByName = new Map();
  const sceneIndex = json.scene ?? 0;
  const scene = json.scenes?.[sceneIndex];
  const roots = scene?.nodes ?? [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const visited = new Set();

  const visit = (index, parentWorld) => {
    if (visited.has(index)) return; // guard against cyclic authoring errors
    visited.add(index);
    const node = json.nodes?.[index];
    if (!node) { failures.push({ code: 'MISSING_NODE_REF', message: `scene graph references missing node ${index}` }); return; }
    const local = localMatrixForNode(node);
    if (!allFinite(local)) failures.push({ code: 'NON_FINITE_TRANSFORM', message: `node "${node.name || index}" has a non-finite transform` });
    if (Array.isArray(node.scale) && node.scale.some((v) => !(v > 0))) {
      failures.push({ code: 'NON_POSITIVE_SCALE', message: `node "${node.name || index}" has non-positive scale [${node.scale.join(', ')}]` });
    }
    const world = multiplyMat4(parentWorld, local);
    if (nodesByName.has(node.name)) {
      // duplicate names are allowed by glTF but we key sockets by name; keep first occurrence and flag collisions on required sockets later.
    } else if (node.name) {
      nodesByName.set(node.name, { index, node, worldMatrix: world });
    }

    const isOutlineProxy = node.extras?.outlineProxy === true || /outline/i.test(node.name || '');
    if (node.mesh !== undefined && !isOutlineProxy) {
      const mesh = json.meshes[node.mesh];
      const sign = linearDeterminantSign(world);
      if (sign < 0) failures.push({ code: 'NEGATIVE_SCALE_ANCESTRY', message: `mesh node "${node.name || index}" has a negative-scale ancestor (mirrored geometry)` });
      for (const prim of mesh.primitives || []) {
        const posAccessorIndex = prim.attributes?.POSITION;
        if (posAccessorIndex === undefined) continue;
        const acc = json.accessors[posAccessorIndex];
        if (!acc.min || !acc.max) continue;
        const corners = [];
        for (let cx = 0; cx < 2; cx++) for (let cy = 0; cy < 2; cy++) for (let cz = 0; cz < 2; cz++) {
          corners.push([cx ? acc.max[0] : acc.min[0], cy ? acc.max[1] : acc.min[1], cz ? acc.max[2] : acc.min[2]]);
        }
        for (const corner of corners) {
          const w = transformPoint(world, corner);
          for (let k = 0; k < 3; k++) { if (w[k] < min[k]) min[k] = w[k]; if (w[k] > max[k]) max[k] = w[k]; }
        }
      }
    }
    for (const childIndex of node.children || []) visit(childIndex, world);
  };
  for (const rootIndex of roots) visit(rootIndex, IDENTITY_MAT4);

  return { nodesByName, failures, bounds: { min, max }, roots };
}

function findSocketNode(nodesByName, aliases) {
  for (const alias of aliases) if (nodesByName.has(alias)) return nodesByName.get(alias);
  return null;
}

// ---------------------------------------------------------------------------
// Content hash (uniqueness / anti-reuse fingerprint)
// ---------------------------------------------------------------------------

/** Deterministic content hash over every non-outline-proxy mesh's POSITION+indices bytes, in scene-graph traversal order. */
export function computeContentHash(json, bin) {
  const hash = createHash('sha256');
  const sceneIndex = json.scene ?? 0;
  const roots = json.scenes?.[sceneIndex]?.nodes ?? [];
  const visited = new Set();
  const visit = (index) => {
    if (visited.has(index)) return;
    visited.add(index);
    const node = json.nodes?.[index];
    if (!node) return;
    const isOutlineProxy = node.extras?.outlineProxy === true || /outline/i.test(node.name || '');
    if (node.mesh !== undefined && !isOutlineProxy && bin) {
      const mesh = json.meshes[node.mesh];
      for (const prim of mesh.primitives || []) {
        for (const key of ['POSITION', 'indices']) {
          const accessorIndex = key === 'indices' ? prim.indices : prim.attributes?.[key];
          if (accessorIndex === undefined) continue;
          const accessor = json.accessors[accessorIndex];
          const bufferView = json.bufferViews[accessor.bufferView];
          if (!bufferView) continue;
          const start = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
          const size = accessor.count * TYPE_COMPONENTS[accessor.type] * COMPONENT_TYPE_SIZE[accessor.componentType];
          hash.update(bin.subarray(start, start + size));
        }
      }
    }
    for (const childIndex of node.children || []) visit(childIndex);
  };
  for (const rootIndex of roots) visit(rootIndex);
  return hash.digest('hex');
}

// ---------------------------------------------------------------------------
// Shared checks: identity metadata, animations, materials, skinning
// ---------------------------------------------------------------------------

function isForbiddenIdentityToken(value) {
  if (typeof value !== 'string') return true;
  const lower = value.toLowerCase();
  return FORBIDDEN_IDENTITY_TOKENS.some((token) => lower.includes(token));
}

function findRootExtrasNode(json) {
  const sceneIndex = json.scene ?? 0;
  const roots = json.scenes?.[sceneIndex]?.nodes ?? [];
  for (const index of roots) {
    const node = json.nodes?.[index];
    if (node?.extras) return node;
  }
  return json.nodes?.[roots[0]] ?? null;
}

function checkAnimations(json, requiredClips, failures) {
  const byName = new Map((json.animations || []).map((a) => [a.name, a]));
  for (const clipName of requiredClips) {
    const clip = byName.get(clipName);
    if (!clip) { failures.push({ code: 'MISSING_REQUIRED_CLIP', message: `required clip "${clipName}" is absent` }); continue; }
    const channels = clip.channels || [];
    if (channels.length === 0) { failures.push({ code: 'EMPTY_CLIP_TRACKS', message: `clip "${clipName}" exists but has zero channels/tracks` }); continue; }
    let hasFrames = false;
    for (const channel of channels) {
      const sampler = clip.samplers?.[channel.sampler];
      const inputAccessor = json.accessors?.[sampler?.input];
      if (inputAccessor && inputAccessor.count >= 2) hasFrames = true;
    }
    if (!hasFrames) failures.push({ code: 'EMPTY_CLIP_TRACKS', message: `clip "${clipName}" has channels but no sampler carries real keyframes` });
  }
}

function checkMaterials(json, failures) {
  for (const [materialIndex, material] of (json.materials || []).entries()) {
    const label = material.name || `material[${materialIndex}]`;
    const role = material.extras?.materialRole;
    const alpha = material.pbrMetallicRoughness?.baseColorFactor?.[3];
    const isOutlineNamed = /outline/i.test(material.name || '') || material.extras?.outlineProxy === true;
    const nearZeroOpacity = typeof alpha === 'number' && alpha <= 0.02;
    if (isOutlineNamed || nearZeroOpacity) {
      failures.push({ code: 'FORBIDDEN_ALPHA_PROXY', message: `material "${label}" looks like a forbidden outline/near-zero-opacity proxy (alpha=${alpha})` });
      continue;
    }
    if (material.alphaMode === 'BLEND' && role !== APPROVED_ALPHA_ROLE) {
      failures.push({ code: 'FORBIDDEN_ALPHA_PROXY', message: `material "${label}" uses alphaMode BLEND without the "${APPROVED_ALPHA_ROLE}" role` });
    }
    if (material.normalTexture) {
      const usesTangent = (json.meshes || []).some((mesh) => (mesh.primitives || []).some((prim) => prim.material === materialIndex && prim.attributes?.TANGENT !== undefined));
      if (!usesTangent) failures.push({ code: 'MISSING_TANGENT_FOR_NORMAL_MAP', message: `material "${label}" has a normalTexture but no primitive using it exports TANGENT` });
    }
  }
}

function checkSkinning(json, bin, failures) {
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const jointsIndex = prim.attributes?.JOINTS_0;
      const weightsIndex = prim.attributes?.WEIGHTS_0;
      if (jointsIndex === undefined && weightsIndex === undefined) continue;
      if (jointsIndex === undefined || weightsIndex === undefined) {
        failures.push({ code: 'SKIN_ATTRIBUTE_MISMATCH', message: 'primitive has JOINTS_0 without WEIGHTS_0 or vice versa' });
        continue;
      }
      if (prim.attributes?.JOINTS_1 !== undefined || prim.attributes?.WEIGHTS_1 !== undefined) {
        failures.push({ code: 'SKIN_TOO_MANY_INFLUENCES', message: 'primitive exports a second joint/weight set (>4 influences per vertex)' });
      }
      const weights = readAccessor(json, bin, weightsIndex);
      let unnormalizedCount = 0;
      let unweightedCount = 0;
      let nonFiniteCount = 0;
      let negativeCount = 0;
      for (let i = 0; i < weights.count; i++) {
        let sum = 0;
        let allZero = true;
        for (let c = 0; c < weights.numComponents; c++) {
          const w = weights.values[i * weights.numComponents + c];
          if (!Number.isFinite(w)) { nonFiniteCount++; continue; }
          if (w < 0) negativeCount++;
          if (w !== 0) allZero = false;
          sum += w;
        }
        if (allZero) unweightedCount++;
        else if (Math.abs(sum - 1) > SKIN_WEIGHT_SUM_TOLERANCE) unnormalizedCount++;
      }
      if (nonFiniteCount > 0) failures.push({ code: 'SKIN_WEIGHT_NON_FINITE', message: `${nonFiniteCount} vertex weight component(s) are non-finite` });
      if (negativeCount > 0) failures.push({ code: 'SKIN_WEIGHT_NEGATIVE', message: `${negativeCount} vertex weight component(s) are negative` });
      if (unweightedCount > 0) failures.push({ code: 'SKIN_WEIGHT_UNWEIGHTED', message: `${unweightedCount} vertex/vertices on a deforming mesh have all-zero skin weights` });
      if (unnormalizedCount > 0) failures.push({ code: 'SKIN_WEIGHT_NOT_NORMALIZED', message: `${unnormalizedCount} vertex/vertices have skin weights that do not sum to 1 (±${SKIN_WEIGHT_SUM_TOLERANCE})` });
    }
  }
}

// ---------------------------------------------------------------------------
// Hero / weapon validators
// ---------------------------------------------------------------------------

function countTriangles(json) {
  let total = 0;
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
      const count = json.accessors?.[accessorIndex]?.count ?? 0;
      const mode = primitive.mode ?? 4;
      if (mode === 4) total += Math.floor(count / 3);
      else if (mode === 5 || mode === 6) total += Math.max(0, count - 2);
    }
  }
  return total;
}

/**
 * Validate a hero GLB against the class contract.
 * @param {object} json glTF JSON chunk
 * @param {Buffer|null} bin GLB BIN chunk
 * @param {{classId: string, requiredClips?: string[]}} expect
 * @returns {{failures: Array<{code:string,message:string}>, stats: object}}
 */
export function validateHeroGlb(json, bin, expect) {
  const failures = [];
  const requiredClips = expect.requiredClips || SHARED_REQUIRED_CLIPS;

  const rootNode = findRootExtrasNode(json);
  const extras = rootNode?.extras || {};
  if (extras.assetType !== 'hero' || isForbiddenIdentityToken(extras.heroClass)) {
    failures.push({ code: 'FALLBACK_METADATA', message: `hero root metadata is missing/placeholder (assetType=${extras.assetType}, heroClass=${extras.heroClass})` });
  } else if (extras.heroClass !== expect.classId) {
    failures.push({ code: 'CLASS_MARKER_MISMATCH', message: `root metadata says heroClass="${extras.heroClass}" but manifest expects "${expect.classId}"` });
  }
  if (extras.schemaVersion !== HERO_SCHEMA_VERSION || extras.rigId !== HERO_RIG_ID || extras.classId !== expect.classId) {
    failures.push({
      code: 'HERO_SCHEMA_MISMATCH',
      message: `expected schema=${HERO_SCHEMA_VERSION} rig=${HERO_RIG_ID} classId=${expect.classId}; got schema=${extras.schemaVersion} rig=${extras.rigId} classId=${extras.classId}`,
    });
  }
  if (extras.physiqueProfile !== expect.classId || extras.physiqueVersion !== 1) {
    failures.push({
      code: 'HERO_PHYSIQUE_MISMATCH',
      message: `expected physiqueProfile=${expect.classId} physiqueVersion=1; got physiqueProfile=${extras.physiqueProfile} physiqueVersion=${extras.physiqueVersion}`,
    });
  }
  if (![0, 1, 2].includes(extras.lod)) {
    failures.push({ code: 'INVALID_LOD_METADATA', message: `hero root lod metadata must be 0, 1, or 2 (got ${extras.lod})` });
  }
  if (!(typeof extras.modelHeight === 'number' && Number.isFinite(extras.modelHeight) && extras.modelHeight > 0)) {
    failures.push({ code: 'INVALID_MODEL_HEIGHT_METADATA', message: `hero root modelHeight metadata is not a finite positive number (${extras.modelHeight})` });
  }

  const scene = walkScene(json, bin);
  failures.push(...scene.failures);

  const socket = findSocketNode(scene.nodesByName, HERO_SOCKET_ALIASES.weaponSocket);
  if (!socket) failures.push({ code: 'MISSING_SOCKET', message: `no weapon socket node found (expected one of: ${HERO_SOCKET_ALIASES.weaponSocket.join(', ')})` });
  for (const nodeName of HERO_REQUIRED_V2_NODES) {
    if (!scene.nodesByName.has(nodeName)) {
      failures.push({ code: 'MISSING_V2_NODE', message: `schema-v2 hero is missing required node "${nodeName}"` });
    }
  }
  const classMarker = HERO_CLASS_MARKERS[expect.classId];
  if (classMarker && !scene.nodesByName.has(classMarker)) {
    failures.push({ code: 'MISSING_CLASS_MARKER', message: `hero "${expect.classId}" is missing silhouette marker "${classMarker}"` });
  }

  checkAnimations(json, requiredClips, failures);
  checkMaterials(json, failures);
  checkSkinning(json, bin, failures);
  const triangleCount = countTriangles(json);
  const triangleBudget = BOUNDS.heroTrianglesMaxByLod[extras.lod];
  if (Number.isFinite(triangleBudget) && triangleCount > triangleBudget) {
    failures.push({
      code: 'HERO_TRIANGLE_BUDGET_EXCEEDED',
      message: `hero LOD${extras.lod} has ${triangleCount} triangles; budget is ${triangleBudget}`,
    });
  }

  const [minB, maxB] = [scene.bounds.min, scene.bounds.max];
  const height = Number.isFinite(minB[1]) && Number.isFinite(maxB[1]) ? maxB[1] - minB[1] : NaN;
  if (!(Number.isFinite(height) && height > 0)) {
    failures.push({ code: 'BOUNDS_OUT_OF_RANGE', message: 'hero mesh bounds could not be computed (no valid mesh geometry)' });
  } else if (height < BOUNDS.heroHeight.min || height > BOUNDS.heroHeight.max) {
    failures.push({ code: 'BOUNDS_OUT_OF_RANGE', message: `hero bounds height ${height.toFixed(3)} is outside [${BOUNDS.heroHeight.min}, ${BOUNDS.heroHeight.max}]` });
  }

  return {
    failures,
    stats: {
      height,
      triangleCount,
      materialCount: (json.materials || []).length,
      meshCount: (json.meshes || []).length,
      nodeCount: (json.nodes || []).length,
      animationCount: (json.animations || []).length,
    },
  };
}

/**
 * Validate a weapon GLB against its weapon-kind contract.
 * @param {object} json glTF JSON chunk
 * @param {Buffer|null} bin GLB BIN chunk
 * @param {{weaponKind: string, heroHeight?: number}} expect
 */
export function validateWeaponGlb(json, bin, expect) {
  const failures = [];
  const info = WEAPON_KIND_INFO[expect.weaponKind];
  if (!info) throw new Error(`unknown weapon kind: ${expect.weaponKind}`);

  const rootNode = findRootExtrasNode(json);
  const extras = rootNode?.extras || {};
  if (isForbiddenIdentityToken(extras.weaponKind)) {
    failures.push({ code: 'FALLBACK_METADATA', message: `weapon root metadata is missing/placeholder (weaponKind=${extras.weaponKind})` });
  } else if (extras.weaponKind !== expect.weaponKind) {
    failures.push({ code: 'WEAPON_KIND_MISMATCH', message: `root metadata says weaponKind="${extras.weaponKind}" but manifest expects "${expect.weaponKind}"` });
  }

  const scene = walkScene(json, bin);
  failures.push(...scene.failures);

  const requireSocket = (aliasKey, code) => {
    const found = findSocketNode(scene.nodesByName, WEAPON_SOCKET_ALIASES[aliasKey]);
    if (!found) failures.push({ code, message: `no "${aliasKey}" socket found (expected one of: ${WEAPON_SOCKET_ALIASES[aliasKey].join(', ')})` });
    return found;
  };
  requireSocket('grip', 'MISSING_SOCKET');
  requireSocket('bladeBase', 'MISSING_SOCKET');
  requireSocket('bladeTip', 'MISSING_SOCKET');
  if (info.requiresMuzzle) requireSocket('muzzle', 'MISSING_SOCKET');
  if (info.requiresGripSupport) requireSocket('gripSupport', 'MISSING_SOCKET');

  checkMaterials(json, failures);

  const [minB, maxB] = [scene.bounds.min, scene.bounds.max];
  const length = Number.isFinite(minB[1]) && Number.isFinite(maxB[1])
    ? Math.hypot(maxB[0] - minB[0], maxB[1] - minB[1], maxB[2] - minB[2])
    : NaN;
  if (!(Number.isFinite(length) && length > 0)) {
    failures.push({ code: 'BOUNDS_OUT_OF_RANGE', message: 'weapon mesh bounds could not be computed (no valid mesh geometry)' });
  } else if (expect.heroHeight) {
    const [lo, hi] = BOUNDS.weaponRatio[expect.weaponKind] || [0, Infinity];
    const ratio = length / expect.heroHeight;
    if (ratio < lo || ratio > hi) {
      failures.push({ code: 'WEAPON_RATIO_OUT_OF_RANGE', message: `weapon/hero length ratio ${ratio.toFixed(3)} is outside [${lo}, ${hi}]` });
    }
  }

  return { failures, stats: { length, materialCount: (json.materials || []).length, meshCount: (json.meshes || []).length } };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function loadGlbFile(relativeUrl) {
  const path = resolve(ROOT, relativeUrl.replace(/^\.\//, ''));
  const buffer = await readFile(path);
  return { path, ...parseGlb(buffer) };
}

async function runContractForClass(manifest, classId, { lods = ['high'] } = {}) {
  const entry = resolveManifestEntry(manifest, classId);
  const report = { classId, weaponKind: entry.weaponKind, heroFailures: [], weaponFailures: [], hashes: [] };

  let heroHeight;
  for (const lod of lods) {
    const url = entry.heroLodUrls[lod];
    const { path, json, bin } = await loadGlbFile(url);
    const result = validateHeroGlb(json, bin, { classId });
    if (lod === lods[0]) heroHeight = result.stats.height;
    report.heroFailures.push(...result.failures.map((f) => ({ ...f, asset: `hero.${classId} (${lod}) ${path}` })));
    report.hashes.push({ kind: 'hero', classId, lod, hash: computeContentHash(json, bin) });
  }

  {
    const { path, json, bin } = await loadGlbFile(entry.weaponUrl);
    const result = validateWeaponGlb(json, bin, { weaponKind: entry.weaponKind, heroHeight });
    report.weaponFailures.push(...result.failures.map((f) => ({ ...f, asset: `weapon.${entry.weaponKind} ${path}` })));
    report.hashes.push({ kind: 'weapon', weaponKind: entry.weaponKind, hash: computeContentHash(json, bin) });
  }

  return report;
}

/** Cross-check content hashes across a set of reports; flags renamed-copy reuse. */
export function checkUniquenessAcrossReports(reports) {
  const failures = [];
  const seen = new Map(); // hash -> identity label
  for (const report of reports) {
    for (const entry of report.hashes) {
      const identity = entry.kind === 'hero' ? `hero.${entry.classId}` : `weapon.${entry.weaponKind}`;
      const priorIdentity = seen.get(entry.hash);
      if (priorIdentity && priorIdentity !== identity) {
        failures.push({ code: 'DUPLICATE_CONTENT_HASH', message: `${identity} has identical mesh content to ${priorIdentity} (renamed-copy reuse)` });
      } else if (!priorIdentity) {
        seen.set(entry.hash, identity);
      }
    }
  }
  return failures;
}

async function main() {
  const args = process.argv.slice(2);
  const classArgIndex = args.indexOf('--class');
  const requestedClass = classArgIndex >= 0 ? args[classArgIndex + 1] : null;
  const lodArgIndex = args.indexOf('--lod');
  const requestedLod = lodArgIndex >= 0 ? args[lodArgIndex + 1] : 'high';

  const manifest = JSON.parse(await readFile(resolve(ROOT, 'assets/manifests/assets.json'), 'utf8'));
  const classIds = requestedClass ? [requestedClass] : HERO_CLASS_IDS;
  for (const classId of classIds) {
    if (!HERO_CLASS_IDS.includes(classId)) throw new Error(`unknown --class "${classId}"; expected one of ${HERO_CLASS_IDS.join(', ')}`);
  }

  const reports = [];
  for (const classId of classIds) reports.push(await runContractForClass(manifest, classId, { lods: [requestedLod] }));
  const uniquenessFailures = checkUniquenessAcrossReports(reports);

  let totalFailures = 0;
  for (const report of reports) {
    const failures = [...report.heroFailures, ...report.weaponFailures];
    console.log(`\n== ${report.classId} (weapon: ${report.weaponKind}) ==`);
    if (failures.length === 0) console.log('  contract OK');
    for (const failure of failures) {
      console.log(`  ✗ [${failure.code}] ${failure.asset}: ${failure.message}`);
      totalFailures++;
    }
  }
  if (uniquenessFailures.length) {
    console.log('\n== cross-class uniqueness ==');
    for (const failure of uniquenessFailures) { console.log(`  ✗ [${failure.code}] ${failure.message}`); totalFailures++; }
  }

  console.log(`\n${totalFailures} contract violation(s) across ${reports.length} class(es).`);
  process.exit(totalFailures ? 1 : 0);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
