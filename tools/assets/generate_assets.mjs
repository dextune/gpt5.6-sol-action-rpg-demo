import * as THREE from '../../vendor/three.module.min.js';
import { GLTFExporter } from '../../vendor/examples/jsm/exporters/GLTFExporter.js';
import { MarchingCubes } from '../../vendor/examples/jsm/objects/MarchingCubes.js';
import { RoundedBoxGeometry } from '../../vendor/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from '../../vendor/examples/jsm/utils/BufferGeometryUtils.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const ASSETS = resolve(ROOT, 'assets');

if (!globalThis.FileReader) {
  globalThis.FileReader = class FileReaderPolyfill {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(value => {
        this.result = value;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      }).catch(error => this.onerror?.(error));
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then(value => {
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(value).toString('base64')}`;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      }).catch(error => this.onerror?.(error));
    }
  };
}

const exporter = new GLTFExporter();
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;

function material(name, color, roughness = .72, metalness = 0, emissive = 0x000000, emissiveIntensity = 0) {
  const result = new THREE.MeshStandardMaterial({
    name,
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
  });
  result.userData.materialRole = name;
  return result;
}

async function exportGLB(object, outputPath, animations = []) {
  await mkdir(dirname(outputPath), { recursive: true });
  object.updateMatrixWorld(true);
  const buffer = await new Promise((resolvePromise, rejectPromise) => {
    exporter.parse(
      object,
      result => resolvePromise(Buffer.from(result)),
      rejectPromise,
      {
        binary: true,
        trs: true,
        onlyVisible: false,
        animations,
        includeCustomExtensions: false,
      },
    );
  });
  await writeFile(outputPath, buffer);
  console.log(`${outputPath.slice(ROOT.length + 1)}  ${(buffer.length / 1024).toFixed(1)} KB`);
}

function smoothMin(a, b, k = .12) {
  const h = clamp(.5 + .5 * (b - a) / k, 0, 1);
  return THREE.MathUtils.lerp(b, a, h) - k * h * (1 - h);
}

function sdfEllipsoid(p, center, radius) {
  const qx = (p.x - center.x) / radius.x;
  const qy = (p.y - center.y) / radius.y;
  const qz = (p.z - center.z) / radius.z;
  return (Math.hypot(qx, qy, qz) - 1) * Math.min(radius.x, radius.y, radius.z);
}

function sdfCapsule(p, a, b, r0, r1 = r0) {
  const pax = p.x - a.x;
  const pay = p.y - a.y;
  const paz = p.z - a.z;
  const bax = b.x - a.x;
  const bay = b.y - a.y;
  const baz = b.z - a.z;
  const denom = bax * bax + bay * bay + baz * baz || 1;
  const h = clamp((pax * bax + pay * bay + paz * baz) / denom, 0, 1);
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  const dz = paz - baz * h;
  return Math.hypot(dx, dy, dz) - THREE.MathUtils.lerp(r0, r1, h);
}

function sdfRoundedBox(p, center, half, radius) {
  const qx = Math.abs(p.x - center.x) - half.x;
  const qy = Math.abs(p.y - center.y) - half.y;
  const qz = Math.abs(p.z - center.z) - half.z;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  return outside + inside - radius;
}

function unionSdf(parts, p, smoothness = .1) {
  if (!parts.length) return Infinity;
  let value = parts[0](p);
  for (let i = 1; i < parts.length; i += 1) value = smoothMin(value, parts[i](p), smoothness);
  return value;
}

function implicitGeometry(sdf, bounds, resolution = 46, maxPolyCount = 70000) {
  const marching = new MarchingCubes(resolution, new THREE.MeshBasicMaterial(), false, false, maxPolyCount);
  marching.isolation = 0;
  const min = bounds.min;
  const max = bounds.max;
  const size = marching.size;
  const field = marching.field;
  let index = 0;
  for (let z = 0; z < size; z += 1) {
    const nz = z / (size - 1);
    const wz = THREE.MathUtils.lerp(min.z, max.z, nz);
    for (let y = 0; y < size; y += 1) {
      const ny = y / (size - 1);
      const wy = THREE.MathUtils.lerp(min.y, max.y, ny);
      for (let x = 0; x < size; x += 1, index += 1) {
        const nx = x / (size - 1);
        const wx = THREE.MathUtils.lerp(min.x, max.x, nx);
        field[index] = -sdf(V3(wx, wy, wz));
      }
    }
  }
  marching.update();
  const count = marching.geometry.drawRange.count;
  if (!count) throw new Error('Implicit surface produced no triangles');
  const sourcePosition = marching.geometry.getAttribute('position');
  const sourceNormal = marching.geometry.getAttribute('normal');
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const sx = (max.x - min.x) * .5;
  const sy = (max.y - min.y) * .5;
  const sz = (max.z - min.z) * .5;
  const cx = (max.x + min.x) * .5;
  const cy = (max.y + min.y) * .5;
  const cz = (max.z + min.z) * .5;
  for (let i = 0; i < count; i += 1) {
    const x = sourcePosition.getX(i) * sx + cx;
    const y = sourcePosition.getY(i) * sy + cy;
    const z = sourcePosition.getZ(i) * sz + cz;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    const nx = sourceNormal.getX(i) / Math.max(.0001, sx);
    const ny = sourceNormal.getY(i) / Math.max(.0001, sy);
    const nz = sourceNormal.getZ(i) / Math.max(.0001, sz);
    const nlen = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / nlen;
    normals[i * 3 + 1] = ny / nlen;
    normals[i * 3 + 2] = nz / nlen;
    uvs[i * 2] = Math.atan2(x - cx, z - cz) / (Math.PI * 2) + .5;
    uvs[i * 2 + 1] = clamp((y - min.y) / (max.y - min.y), 0, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Index marching-cube soup — identical corner vertices collapse, shrinking GLBs ~3x and smoothing normals. */
function weld(geometry, tolerance = 1e-4) {
  const result = mergeVertices(geometry, tolerance);
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

function createSkeleton(specs) {
  const bones = new Map();
  const restPositions = new Map();
  for (const spec of specs) {
    const bone = new THREE.Bone();
    bone.name = spec.name;
    bone.position.fromArray(spec.position ?? [0, 0, 0]);
    bones.set(spec.name, bone);
    restPositions.set(spec.name, bone.position.clone());
  }
  for (const spec of specs) {
    const bone = bones.get(spec.name);
    if (spec.parent) bones.get(spec.parent).add(bone);
  }
  const rootBone = specs.find(spec => !spec.parent)?.name;
  const skeleton = new THREE.Skeleton(specs.map(spec => bones.get(spec.name)));
  return { bones, restPositions, rootBone: bones.get(rootBone), skeleton };
}

function pointSegmentDistanceSq(p, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ap = new THREE.Vector3().subVectors(p, a);
  const denom = ab.lengthSq() || 1;
  const t = clamp(ap.dot(ab) / denom, 0, 1);
  const closest = a.clone().addScaledVector(ab, t);
  return closest.distanceToSquared(p);
}

function applySkinWeights(geometry, skeletonInfo, segmentRules, candidateSelector = null) {
  const { bones, skeleton } = skeletonInfo;
  const boneIndex = new Map(skeleton.bones.map((bone, index) => [bone.name, index]));
  skeletonInfo.rootBone.updateMatrixWorld(true);
  const worldPositions = new Map();
  for (const [name, bone] of bones) worldPositions.set(name, bone.getWorldPosition(new THREE.Vector3()));
  const position = geometry.getAttribute('position');
  const skinIndices = new Uint16Array(position.count * 4);
  const skinWeights = new Float32Array(position.count * 4);
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    p.fromBufferAttribute(position, i);
    const candidates = candidateSelector?.(p, segmentRules) ?? segmentRules;
    const scored = [];
    for (const rule of candidates) {
      const a = worldPositions.get(rule.start);
      const b = worldPositions.get(rule.end ?? rule.start);
      if (!a || !b) continue;
      const distanceSq = pointSegmentDistanceSq(p, a, b);
      const sigma = rule.sigma ?? .35;
      const weight = Math.exp(-distanceSq / (2 * sigma * sigma)) * (rule.bias ?? 1);
      scored.push({ index: boneIndex.get(rule.bone ?? rule.start), weight });
    }
    scored.sort((a, b) => b.weight - a.weight);
    const top = scored.slice(0, 4);
    let total = top.reduce((sum, item) => sum + item.weight, 0);
    if (total < 1e-5) {
      top.length = 0;
      top.push({ index: 0, weight: 1 });
      total = 1;
    }
    for (let j = 0; j < 4; j += 1) {
      const item = top[j] ?? { index: 0, weight: 0 };
      skinIndices[i * 4 + j] = item.index;
      skinWeights[i * 4 + j] = item.weight / total;
    }
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  return geometry;
}

function subsetGeometry(source, classifier, classIndex) {
  const attributeNames = Object.keys(source.attributes);
  const data = Object.fromEntries(attributeNames.map(name => [name, []]));
  const position = source.getAttribute('position');
  const centroid = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 3) {
    centroid.set(
      (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3,
      (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3,
      (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3,
    );
    if (classifier(centroid) !== classIndex) continue;
    for (let v = 0; v < 3; v += 1) {
      for (const name of attributeNames) {
        const attribute = source.getAttribute(name);
        for (let c = 0; c < attribute.itemSize; c += 1) data[name].push(attribute.array[(i + v) * attribute.itemSize + c]);
      }
    }
  }
  const result = new THREE.BufferGeometry();
  for (const name of attributeNames) {
    const attribute = source.getAttribute(name);
    const TypedArray = attribute.array.constructor;
    result.setAttribute(name, new THREE.BufferAttribute(new TypedArray(data[name]), attribute.itemSize, attribute.normalized));
  }
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

function makeSkinnedMesh(geometry, mat, skeleton, name) {
  const mesh = new THREE.SkinnedMesh(geometry, mat);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.bind(skeleton);
  return mesh;
}

function animationClip(name, duration, frames, skeletonInfo) {
  const times = new Float32Array(frames.map(frame => frame.time));
  const tracks = [];
  const rotationBones = new Set();
  const positionBones = new Set();
  const scaleBones = new Set();
  for (const frame of frames) {
    Object.keys(frame.rotations ?? {}).forEach(key => rotationBones.add(key));
    Object.keys(frame.positions ?? {}).forEach(key => positionBones.add(key));
    Object.keys(frame.scales ?? {}).forEach(key => scaleBones.add(key));
  }
  // Hold-forward omitted channels. Snapping missing keys to identity made combat
  // clips look wooden whenever a mid-frame only authored a subset of bones.
  for (const boneName of rotationBones) {
    const values = [];
    let last = [0, 0, 0];
    for (const frame of frames) {
      if (frame.rotations?.[boneName]) last = frame.rotations[boneName];
      const [x, y, z] = last;
      const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
      values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values));
  }
  for (const boneName of positionBones) {
    const rest = skeletonInfo.restPositions.get(boneName) ?? new THREE.Vector3();
    const values = [];
    let last = [0, 0, 0];
    for (const frame of frames) {
      if (frame.positions?.[boneName]) last = frame.positions[boneName];
      values.push(rest.x + last[0], rest.y + last[1], rest.z + last[2]);
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.position`, times, values));
  }
  for (const boneName of scaleBones) {
    const values = [];
    let last = [1, 1, 1];
    for (const frame of frames) {
      if (frame.scales?.[boneName]) last = frame.scales[boneName];
      values.push(...last);
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.scale`, times, values));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

function addSurfaceDetail(root, bone, name, geometry, mat, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.position.fromArray(position);
  mesh.rotation.fromArray(rotation);
  mesh.scale.fromArray(scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  bone.add(mesh);
  return mesh;
}

function heroSkeleton() {
  return createSkeleton([
    { name: 'root', position: [0, 0, 0] },
    { name: 'pelvis', parent: 'root', position: [0, 1.08, 0] },
    { name: 'spine', parent: 'pelvis', position: [0, .34, 0] },
    { name: 'chest', parent: 'spine', position: [0, .42, 0] },
    { name: 'neck', parent: 'chest', position: [0, .34, .015] },
    { name: 'head', parent: 'neck', position: [0, .28, .02] },
    { name: 'left_upper_arm', parent: 'chest', position: [.43, .22, 0] },
    { name: 'left_lower_arm', parent: 'left_upper_arm', position: [.24, -.42, .01] },
    { name: 'left_hand', parent: 'left_lower_arm', position: [.08, -.40, .035] },
    { name: 'right_upper_arm', parent: 'chest', position: [-.43, .22, 0] },
    { name: 'right_lower_arm', parent: 'right_upper_arm', position: [-.24, -.42, .01] },
    { name: 'right_hand', parent: 'right_lower_arm', position: [-.08, -.40, .035] },
    { name: 'left_upper_leg', parent: 'pelvis', position: [.22, -.08, 0] },
    { name: 'left_lower_leg', parent: 'left_upper_leg', position: [.01, -.52, .03] },
    { name: 'left_foot', parent: 'left_lower_leg', position: [0, -.48, .10] },
    { name: 'right_upper_leg', parent: 'pelvis', position: [-.22, -.08, 0] },
    { name: 'right_lower_leg', parent: 'right_upper_leg', position: [-.01, -.52, .03] },
    { name: 'right_foot', parent: 'right_lower_leg', position: [0, -.48, .10] },
    { name: 'cape_root', parent: 'chest', position: [0, .08, -.25] },
    { name: 'cape_mid', parent: 'cape_root', position: [0, -.38, -.05] },
    { name: 'cape_tip', parent: 'cape_mid', position: [0, -.40, -.04] },
    { name: 'hair_root', parent: 'head', position: [0, .08, -.08] },
    { name: 'hair_tip', parent: 'hair_root', position: [0, -.38, -.12] },
    { name: 'weapon_socket', parent: 'right_hand', position: [-.03, -.11, .02] },
  ]);
}

function heroBodyGeometry(resolution = 52) {
  const parts = [
    p => sdfEllipsoid(p, V3(0, 1.72, 0), V3(.53, .66, .36)),
    p => sdfEllipsoid(p, V3(0, 1.18, .005), V3(.42, .38, .33)),
    p => sdfCapsule(p, V3(0, 1.45, 0), V3(0, 2.27, 0), .40, .43),
    p => sdfCapsule(p, V3(.42, 2.02, 0), V3(.67, 1.60, .01), .19, .16),
    p => sdfCapsule(p, V3(.67, 1.60, .01), V3(.75, 1.20, .04), .16, .13),
    p => sdfEllipsoid(p, V3(.76, 1.12, .06), V3(.16, .18, .14)),
    p => sdfCapsule(p, V3(-.42, 2.02, 0), V3(-.67, 1.60, .01), .19, .16),
    p => sdfCapsule(p, V3(-.67, 1.60, .01), V3(-.75, 1.20, .04), .16, .13),
    p => sdfEllipsoid(p, V3(-.76, 1.12, .06), V3(.16, .18, .14)),
    p => sdfCapsule(p, V3(.22, 1.14, 0), V3(.23, .58, .02), .22, .18),
    p => sdfCapsule(p, V3(.23, .58, .02), V3(.23, .15, .08), .18, .14),
    p => sdfEllipsoid(p, V3(.23, .10, .20), V3(.20, .12, .32)),
    p => sdfCapsule(p, V3(-.22, 1.14, 0), V3(-.23, .58, .02), .22, .18),
    p => sdfCapsule(p, V3(-.23, .58, .02), V3(-.23, .15, .08), .18, .14),
    p => sdfEllipsoid(p, V3(-.23, .10, .20), V3(.20, .12, .32)),
    p => sdfCapsule(p, V3(0, 2.19, 0), V3(0, 2.40, .01), .21, .22),
    p => sdfEllipsoid(p, V3(0, 2.70, .035), V3(.49, .54, .44)),
    p => sdfEllipsoid(p, V3(0, 2.67, .43), V3(.13, .12, .15)),
    p => sdfEllipsoid(p, V3(.47, 2.70, .02), V3(.09, .17, .10)),
    p => sdfEllipsoid(p, V3(-.47, 2.70, .02), V3(.09, .17, .10)),
    // Musculature pass — pecs, delts, traps, forearms, calves for a defined heroic build.
    p => sdfEllipsoid(p, V3(.19, 1.97, .26), V3(.20, .15, .13)),
    p => sdfEllipsoid(p, V3(-.19, 1.97, .26), V3(.20, .15, .13)),
    p => sdfEllipsoid(p, V3(0, 1.60, .25), V3(.16, .22, .10)),
    p => sdfEllipsoid(p, V3(.45, 2.08, 0), V3(.16, .14, .14)),
    p => sdfEllipsoid(p, V3(-.45, 2.08, 0), V3(.16, .14, .14)),
    p => sdfCapsule(p, V3(.12, 2.32, -.04), V3(.40, 2.14, -.02), .10, .08),
    p => sdfCapsule(p, V3(-.12, 2.32, -.04), V3(-.40, 2.14, -.02), .10, .08),
    p => sdfEllipsoid(p, V3(.70, 1.44, .03), V3(.11, .15, .10)),
    p => sdfEllipsoid(p, V3(-.70, 1.44, .03), V3(.11, .15, .10)),
    p => sdfEllipsoid(p, V3(.25, .52, -.03), V3(.13, .20, .13)),
    p => sdfEllipsoid(p, V3(-.25, .52, -.03), V3(.13, .20, .13)),
    p => sdfEllipsoid(p, V3(.16, 2.02, -.24), V3(.14, .18, .10)),
    p => sdfEllipsoid(p, V3(-.16, 2.02, -.24), V3(.14, .18, .10)),
    // Facial structure — chin/jaw plane, cheekbones, thumb nubs on the mitts.
    p => sdfEllipsoid(p, V3(0, 2.50, .32), V3(.16, .12, .13)),
    p => sdfEllipsoid(p, V3(.24, 2.64, .28), V3(.10, .09, .10)),
    p => sdfEllipsoid(p, V3(-.24, 2.64, .28), V3(.10, .09, .10)),
    p => sdfCapsule(p, V3(.82, 1.10, .14), V3(.88, 1.02, .20), .055, .04),
    p => sdfCapsule(p, V3(-.82, 1.10, .14), V3(-.88, 1.02, .20), .055, .04),
  ];
  return implicitGeometry(p => unionSdf(parts, p, .105), {
    min: V3(-1.05, -.08, -.62), max: V3(1.05, 3.32, .70),
  }, resolution, 190000);
}

function heroSkinRules(skeletonInfo) {
  const rules = [
    { bone: 'pelvis', start: 'pelvis', end: 'spine', sigma: .34, bias: 1.2 },
    { bone: 'spine', start: 'spine', end: 'chest', sigma: .34, bias: 1.3 },
    { bone: 'chest', start: 'chest', end: 'neck', sigma: .38, bias: 1.2 },
    { bone: 'neck', start: 'neck', end: 'head', sigma: .24, bias: 1 },
    { bone: 'head', start: 'head', end: 'head', sigma: .46, bias: 2.2 },
    { bone: 'left_upper_arm', start: 'left_upper_arm', end: 'left_lower_arm', sigma: .25, bias: 1.8 },
    { bone: 'left_lower_arm', start: 'left_lower_arm', end: 'left_hand', sigma: .21, bias: 1.8 },
    { bone: 'left_hand', start: 'left_hand', end: 'left_hand', sigma: .18, bias: 2.1 },
    { bone: 'right_upper_arm', start: 'right_upper_arm', end: 'right_lower_arm', sigma: .25, bias: 1.8 },
    { bone: 'right_lower_arm', start: 'right_lower_arm', end: 'right_hand', sigma: .21, bias: 1.8 },
    { bone: 'right_hand', start: 'right_hand', end: 'right_hand', sigma: .18, bias: 2.1 },
    { bone: 'left_upper_leg', start: 'left_upper_leg', end: 'left_lower_leg', sigma: .27, bias: 1.8 },
    { bone: 'left_lower_leg', start: 'left_lower_leg', end: 'left_foot', sigma: .23, bias: 1.8 },
    { bone: 'left_foot', start: 'left_foot', end: 'left_foot', sigma: .24, bias: 1.7 },
    { bone: 'right_upper_leg', start: 'right_upper_leg', end: 'right_lower_leg', sigma: .27, bias: 1.8 },
    { bone: 'right_lower_leg', start: 'right_lower_leg', end: 'right_foot', sigma: .23, bias: 1.8 },
    { bone: 'right_foot', start: 'right_foot', end: 'right_foot', sigma: .24, bias: 1.7 },
  ];
  const selector = p => {
    if (p.y > 2.34) return rules.filter(rule => ['head', 'neck', 'chest'].includes(rule.bone));
    if (p.x > .38 && p.y > 1.0) return rules.filter(rule => rule.bone.startsWith('left_') || ['chest', 'spine'].includes(rule.bone));
    if (p.x < -.38 && p.y > 1.0) return rules.filter(rule => rule.bone.startsWith('right_') || ['chest', 'spine'].includes(rule.bone));
    if (p.y < 1.18 && p.x >= 0) return rules.filter(rule => rule.bone.startsWith('left_') || rule.bone === 'pelvis');
    if (p.y < 1.18 && p.x < 0) return rules.filter(rule => rule.bone.startsWith('right_') || rule.bone === 'pelvis');
    return rules.filter(rule => ['pelvis', 'spine', 'chest', 'neck'].includes(rule.bone));
  };
  return { rules, selector };
}

function createCapeGeometry(skeletonInfo) {
  const rows = 16;
  const cols = 13;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let y = 0; y < rows; y += 1) {
    const v = y / (rows - 1);
    const width = THREE.MathUtils.lerp(.48, .68, v);
    for (let x = 0; x < cols; x += 1) {
      const u = x / (cols - 1);
      const px = (u - .5) * width * 2;
      const py = 1.98 - v * .92 - Math.sin(u * Math.PI * 3) * .022 * v;
      const pz = -.31 - Math.sin(v * Math.PI) * .11 - Math.abs(u - .5) * .035
        - Math.sin(u * Math.PI * 2.5 + v * 2.2) * .020 * v;
      positions.push(px, py, pz);
      normals.push(0, .12, -1);
      uvs.push(u, 1 - v);
    }
  }
  for (let y = 0; y < rows - 1; y += 1) {
    for (let x = 0; x < cols - 1; x += 1) {
      const a = y * cols + x;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const boneIndex = new Map(skeletonInfo.skeleton.bones.map((bone, index) => [bone.name, index]));
  const skinIndices = [];
  const skinWeights = [];
  for (let y = 0; y < rows; y += 1) {
    const v = y / (rows - 1);
    for (let x = 0; x < cols; x += 1) {
      const wRoot = clamp(1 - v * 2.2, 0, 1);
      const wTip = clamp((v - .48) * 2.1, 0, 1);
      const wMid = Math.max(0, 1 - wRoot - wTip);
      skinIndices.push(boneIndex.get('cape_root'), boneIndex.get('cape_mid'), boneIndex.get('cape_tip'), 0);
      skinWeights.push(wRoot, wMid, wTip, 0);
    }
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const HERO_MELEE_ATTACK_CLIPS = Object.freeze([
  'attack_1', 'attack_2', 'attack_3', 'attack_4', 'attack_5', 'attack_6', 'attack_7',
]);

/** Combat clips owned by each class — shared locomotion/reaction clips stay in every GLB. */
const HERO_CLASS_CLIPS = Object.freeze({
  aerin: Object.freeze([...HERO_MELEE_ATTACK_CLIPS, 'skill_whirlwind', 'skill_crescent', 'skill_skyfall', 'skill_starburst']),
  wizard: Object.freeze(['attack_1', 'attack_2', 'attack_3', 'attack_4', 'cast_1', 'cast_2', 'cast_3', 'cast_4', 'skill_fireball', 'skill_frost_nova', 'skill_blink', 'skill_meteor']),
  rogue: Object.freeze([...HERO_MELEE_ATTACK_CLIPS, 'skill_twin_fang', 'skill_fan_knives', 'skill_shadowstep', 'skill_death_lotus']),
  ranger: Object.freeze([
    'attack_1', 'attack_2', 'attack_3', 'attack_4',
    'cast_1', 'cast_2', 'cast_3', 'cast_4',
    'skill_pierce_shot', 'skill_trap', 'skill_vault_shot', 'skill_hunter_mark',
  ]),
});
const HERO_SHARED_CLIPS = Object.freeze([
  'idle', 'run', 'sprint', 'dodge', 'hit', 'death',
]);

/**
 * Per-class weapon-ready hold poses.
 * Soft combat stances (not T-pose arms) so attacks/casts start from a natural ready pose.
 */
function classWeaponHold(profileId = 'aerin') {
  if (profileId === 'rogue') {
    return {
      idleDuration: 1.45,
      idle: {
        a: {
          pelvis: [.08, -.12, 0],
          spine: [-.12, -.08, .05],
          chest: [-.16, -.1, -.04],
          neck: [.06, .05, 0],
          head: [.05, .08, -.02],
          left_upper_arm: [-.55, .32, .55],
          left_lower_arm: [-1.28, .12, .28],
          left_hand: [.15, .22, .18],
          right_upper_arm: [-.55, -.32, -.55],
          right_lower_arm: [-1.28, -.12, -.28],
          right_hand: [.15, -.22, -.18],
          left_upper_leg: [.28, .08, .1],
          left_lower_leg: [.42, 0, 0],
          left_foot: [-.12, 0, .04],
          right_upper_leg: [-.1, -.12, -.12],
          right_lower_leg: [.55, 0, 0],
          right_foot: [-.08, 0, -.02],
          cape_root: [.12, 0, 0],
          hair_root: [-.03, 0, 0],
        },
        b: {
          pelvis: [.07, -.1, 0],
          spine: [-.11, -.06, .04],
          chest: [-.14, -.08, -.03],
          neck: [.04, .04, 0],
          head: [.03, .06, -.015],
          left_upper_arm: [-.52, .3, .52],
          left_lower_arm: [-1.22, .1, .26],
          left_hand: [.14, .2, .16],
          right_upper_arm: [-.52, -.3, -.52],
          right_lower_arm: [-1.22, -.1, -.26],
          right_hand: [.14, -.2, -.16],
          left_upper_leg: [.26, .08, .1],
          left_lower_leg: [.4, 0, 0],
          left_foot: [-.1, 0, .04],
          right_upper_leg: [-.08, -.12, -.12],
          right_lower_leg: [.52, 0, 0],
          right_foot: [-.07, 0, -.02],
          cape_root: [.16, .02, 0],
          hair_root: [.04, 0, 0],
        },
        bob: [0, -.04, .02],
        bobMid: [0, -.025, .03],
      },
      runArms: (phase) => {
        const pump = Math.sin(phase * Math.PI * 2) * .14;
        return {
          spine: [-.12, -.05, pump * .25],
          chest: [-.16, -.06, -.03 + pump * .2],
          left_upper_arm: [-.48 + pump * .15, .28, .48],
          left_lower_arm: [-1.15, .08, .22],
          left_hand: [.12, .16, .12],
          right_upper_arm: [-.48 - pump * .15, -.28, -.48],
          right_lower_arm: [-1.15, -.08, -.22],
          right_hand: [.12, -.16, -.12],
          cape_root: [.4, pump * .1, 0],
          hair_root: [.12, 0, 0],
        };
      },
      sprintArms: (phase) => {
        const pump = Math.sin(phase * Math.PI * 2) * .18;
        return {
          spine: [-.16, -.04, pump * .3],
          chest: [-.22, -.05, -.04 + pump * .25],
          left_upper_arm: [-.42 + pump * .18, .24, .42],
          left_lower_arm: [-1.05, .06, .18],
          left_hand: [.1, .12, .1],
          right_upper_arm: [-.42 - pump * .18, -.24, -.42],
          right_lower_arm: [-1.05, -.06, -.18],
          right_hand: [.1, -.12, -.1],
          cape_root: [.68, pump * .12, 0],
          hair_root: [.26, 0, 0],
        };
      },
    };
  }

  if (profileId === 'wizard') {
    // Staff-forward caster stance — soft knees, hands mid-height, slight lean.
    return {
      idleDuration: 1.7,
      idle: {
        a: {
          pelvis: [.04, .06, 0],
          spine: [-.08, .04, .02],
          chest: [-.1, .05, -.02],
          neck: [.04, .03, 0],
          head: [.03, .05, -.01],
          left_upper_arm: [-.42, .18, .38],
          left_lower_arm: [-.85, .08, .22],
          left_hand: [.08, .12, .1],
          right_upper_arm: [-.48, -.12, -.42],
          right_lower_arm: [-.95, -.06, -.18],
          right_hand: [.1, -.1, -.08],
          left_upper_leg: [.12, .06, .06],
          left_lower_leg: [.22, 0, 0],
          left_foot: [-.06, 0, .02],
          right_upper_leg: [.08, -.05, -.05],
          right_lower_leg: [.28, 0, 0],
          right_foot: [-.05, 0, -.01],
          cape_root: [.14, 0, 0],
          hair_root: [-.02, 0, 0],
        },
        b: {
          pelvis: [.03, .05, 0],
          spine: [-.07, .03, .015],
          chest: [-.08, .04, -.015],
          neck: [.03, .02, 0],
          head: [.02, .04, -.008],
          left_upper_arm: [-.4, .16, .36],
          left_lower_arm: [-.8, .06, .2],
          left_hand: [.07, .1, .08],
          right_upper_arm: [-.45, -.1, -.4],
          right_lower_arm: [-.9, -.05, -.16],
          right_hand: [.08, -.08, -.06],
          left_upper_leg: [.1, .05, .05],
          left_lower_leg: [.2, 0, 0],
          left_foot: [-.05, 0, .02],
          right_upper_leg: [.07, -.04, -.04],
          right_lower_leg: [.25, 0, 0],
          right_foot: [-.04, 0, -.01],
          cape_root: [.18, .02, 0],
          hair_root: [.03, 0, 0],
        },
        bob: [0, -.015, .01],
        bobMid: [0, .01, .015],
      },
      runArms: (phase) => {
        const pump = Math.sin(phase * Math.PI * 2) * .12;
        return {
          spine: [-.1, .03, pump * .2],
          chest: [-.12, .04, -.02 + pump * .15],
          left_upper_arm: [-.35 + pump * .2, .14, .32],
          left_lower_arm: [-.75, .05, .16],
          left_hand: [.06, .08, .06],
          right_upper_arm: [-.4 - pump * .18, -.1, -.36],
          right_lower_arm: [-.85, -.04, -.14],
          right_hand: [.08, -.08, -.05],
          cape_root: [.42, pump * .08, 0],
          hair_root: [.14, 0, 0],
        };
      },
      sprintArms: (phase) => {
        const pump = Math.sin(phase * Math.PI * 2) * .16;
        return {
          spine: [-.14, .02, pump * .25],
          chest: [-.18, .03, -.03 + pump * .18],
          left_upper_arm: [-.28 + pump * .22, .12, .28],
          left_lower_arm: [-.65, .04, .12],
          left_hand: [.05, .06, .05],
          right_upper_arm: [-.35 - pump * .2, -.08, -.32],
          right_lower_arm: [-.75, -.03, -.12],
          right_hand: [.06, -.06, -.04],
          cape_root: [.7, pump * .1, 0],
          hair_root: [.28, 0, 0],
        };
      },
    };
  }

  if (profileId === 'ranger') {
    // Bow-ready: left arm forward (bow), right hand near string, athletic crouch.
    return {
      idleDuration: 1.55,
      idle: {
        a: {
          pelvis: [.06, -.08, 0],
          spine: [-.1, -.06, .03],
          chest: [-.12, -.08, -.03],
          neck: [.05, .04, 0],
          head: [.04, .06, -.015],
          left_upper_arm: [-.72, .22, .55],
          left_lower_arm: [-.55, .1, .35],
          left_hand: [.12, .18, .15],
          right_upper_arm: [-.55, -.35, -.48],
          right_lower_arm: [-1.05, -.08, -.22],
          right_hand: [.14, -.16, -.1],
          left_upper_leg: [.22, .1, .08],
          left_lower_leg: [.35, 0, 0],
          left_foot: [-.1, 0, .03],
          right_upper_leg: [-.06, -.1, -.1],
          right_lower_leg: [.48, 0, 0],
          right_foot: [-.07, 0, -.02],
          cape_root: [.12, 0, 0],
          hair_root: [-.02, 0, 0],
        },
        b: {
          pelvis: [.05, -.07, 0],
          spine: [-.09, -.05, .025],
          chest: [-.1, -.06, -.025],
          neck: [.04, .03, 0],
          head: [.03, .05, -.01],
          left_upper_arm: [-.68, .2, .52],
          left_lower_arm: [-.5, .08, .32],
          left_hand: [.1, .16, .13],
          right_upper_arm: [-.52, -.32, -.45],
          right_lower_arm: [-1.0, -.06, -.2],
          right_hand: [.12, -.14, -.08],
          left_upper_leg: [.2, .09, .07],
          left_lower_leg: [.32, 0, 0],
          left_foot: [-.08, 0, .03],
          right_upper_leg: [-.05, -.09, -.09],
          right_lower_leg: [.45, 0, 0],
          right_foot: [-.06, 0, -.02],
          cape_root: [.16, .02, 0],
          hair_root: [.03, 0, 0],
        },
        bob: [0, -.03, .015],
        bobMid: [0, -.01, .02],
      },
      runArms: (phase) => {
        const pump = Math.sin(phase * Math.PI * 2) * .12;
        return {
          spine: [-.1, -.04, pump * .18],
          chest: [-.12, -.05, -.02 + pump * .14],
          left_upper_arm: [-.55 + pump * .1, .18, .45],
          left_lower_arm: [-.45, .06, .28],
          left_hand: [.08, .12, .1],
          right_upper_arm: [-.42 - pump * .12, -.28, -.4],
          right_lower_arm: [-.9, -.05, -.16],
          right_hand: [.1, -.1, -.06],
          cape_root: [.4, pump * .08, 0],
          hair_root: [.12, 0, 0],
        };
      },
      sprintArms: (phase) => {
        const pump = Math.sin(phase * Math.PI * 2) * .16;
        return {
          spine: [-.14, -.03, pump * .22],
          chest: [-.18, -.04, -.03 + pump * .16],
          left_upper_arm: [-.48 + pump * .12, .15, .4],
          left_lower_arm: [-.4, .05, .24],
          left_hand: [.06, .1, .08],
          right_upper_arm: [-.38 - pump * .14, -.24, -.36],
          right_lower_arm: [-.8, -.04, -.14],
          right_hand: [.08, -.08, -.05],
          cape_root: [.68, pump * .1, 0],
          hair_root: [.26, 0, 0],
        };
      },
    };
  }

  // Knight (aerin) — blade-ready guard: weight on rear leg, sword hand cocked, shield side soft.
  return {
    idleDuration: 1.6,
    idle: {
      a: {
        pelvis: [.05, -.1, 0],
        spine: [-.1, -.08, .03],
        chest: [-.12, -.1, -.04],
        neck: [.04, .05, 0],
        head: [.03, .06, -.015],
        left_upper_arm: [-.28, .22, .42],
        left_lower_arm: [-.75, .1, .2],
        left_hand: [.08, .12, .1],
        right_upper_arm: [-.42, -.38, -.52],
        right_lower_arm: [-1.05, -.08, -.28],
        right_hand: [.12, -.14, -.1],
        left_upper_leg: [.18, .1, .08],
        left_lower_leg: [.32, 0, 0],
        left_foot: [-.08, 0, .03],
        right_upper_leg: [-.08, -.12, -.1],
        right_lower_leg: [.48, 0, 0],
        right_foot: [-.06, 0, -.02],
        cape_root: [.12, 0, 0],
        hair_root: [-.02, 0, 0],
      },
      b: {
        pelvis: [.04, -.08, 0],
        spine: [-.09, -.06, .025],
        chest: [-.1, -.08, -.03],
        neck: [.03, .04, 0],
        head: [.02, .05, -.01],
        left_upper_arm: [-.26, .2, .4],
        left_lower_arm: [-.7, .08, .18],
        left_hand: [.07, .1, .08],
        right_upper_arm: [-.4, -.35, -.48],
        right_lower_arm: [-1.0, -.06, -.25],
        right_hand: [.1, -.12, -.08],
        left_upper_leg: [.16, .09, .07],
        left_lower_leg: [.3, 0, 0],
        left_foot: [-.07, 0, .03],
        right_upper_leg: [-.06, -.1, -.09],
        right_lower_leg: [.45, 0, 0],
        right_foot: [-.05, 0, -.02],
        cape_root: [.16, .02, 0],
        hair_root: [.03, 0, 0],
      },
      bob: [0, -.02, .01],
      bobMid: [0, .005, .015],
    },
    runArms: (phase) => {
      const pump = Math.sin(phase * Math.PI * 2) * .14;
      return {
        spine: [-.1, -.05, pump * .22],
        chest: [-.12, -.06, -.03 + pump * .16],
        left_upper_arm: [-.15 + pump * .35, .12, .28],
        left_lower_arm: [-.55, .05, .12],
        left_hand: [.05, .06, .05],
        right_upper_arm: [-.35 - pump * .28, -.28, -.4],
        right_lower_arm: [-.85, -.05, -.18],
        right_hand: [.08, -.08, -.06],
        cape_root: [.4, pump * .1, 0],
        hair_root: [.12, 0, 0],
      };
    },
    sprintArms: (phase) => {
      const pump = Math.sin(phase * Math.PI * 2) * .18;
      return {
        spine: [-.14, -.04, pump * .28],
        chest: [-.18, -.05, -.04 + pump * .2],
        left_upper_arm: [-.08 + pump * .4, .1, .22],
        left_lower_arm: [-.45, .04, .1],
        left_hand: [.04, .05, .04],
        right_upper_arm: [-.28 - pump * .32, -.24, -.36],
        right_lower_arm: [-.75, -.04, -.15],
        right_hand: [.06, -.06, -.05],
        cape_root: [.7, pump * .12, 0],
        hair_root: [.26, 0, 0],
      };
    },
  };
}

function buildClassIdleClip(skeletonInfo, profileId, F) {
  const hold = classWeaponHold(profileId);
  const d = hold.idleDuration;
  const mid = d * .5;
  const { a, b, bob, bobMid } = hold.idle;
  return animationClip('idle', d, [
    F(0, { ...a }, { pelvis: bob }),
    F(mid, { ...b }, { pelvis: bobMid }),
    F(d, { ...a }, { pelvis: bob }),
  ], skeletonInfo);
}

function buildClassRunClip(skeletonInfo, profileId, F) {
  const hold = classWeaponHold(profileId);
  const d = .72;
  const legs = [
    { t: 0, rot: { left_upper_leg: [-.72, 0, 0], right_upper_leg: [.72, 0, 0], left_lower_leg: [.35, 0, 0], right_lower_leg: [.9, 0, 0] }, pos: [0, .02, 0],
      arms: { chest: [-.10, 0, -.03], spine: [-.05, 0, .04], left_upper_arm: [.62, 0, .08], right_upper_arm: [-.62, 0, -.08], cape_root: [.38, 0, 0], hair_root: [.12, 0, 0] } },
    { t: .18, rot: { left_upper_leg: [-.1, 0, 0], right_upper_leg: [.1, 0, 0], left_lower_leg: [.85, 0, 0], right_lower_leg: [.35, 0, 0] }, pos: [0, .09, 0],
      arms: { chest: [-.12, 0, .035], spine: [-.05, 0, -.04], left_upper_arm: [0, 0, .08], right_upper_arm: [0, 0, -.08], cape_root: [.48, .02, 0], hair_root: [.16, 0, 0] } },
    { t: .36, rot: { left_upper_leg: [.72, 0, 0], right_upper_leg: [-.72, 0, 0], left_lower_leg: [.9, 0, 0], right_lower_leg: [.35, 0, 0] }, pos: [0, .02, 0],
      arms: { chest: [-.10, 0, .03], spine: [-.05, 0, -.04], left_upper_arm: [-.62, 0, .08], right_upper_arm: [.62, 0, -.08], cape_root: [.4, 0, 0], hair_root: [.12, 0, 0] } },
    { t: .54, rot: { left_upper_leg: [.1, 0, 0], right_upper_leg: [-.1, 0, 0], left_lower_leg: [.35, 0, 0], right_lower_leg: [.85, 0, 0] }, pos: [0, .09, 0],
      arms: { chest: [-.12, 0, -.035], spine: [-.05, 0, .04], left_upper_arm: [0, 0, .08], right_upper_arm: [0, 0, -.08], cape_root: [.48, -.02, 0], hair_root: [.16, 0, 0] } },
    { t: .72, rot: { left_upper_leg: [-.72, 0, 0], right_upper_leg: [.72, 0, 0], left_lower_leg: [.35, 0, 0], right_lower_leg: [.9, 0, 0] }, pos: [0, .02, 0],
      arms: { chest: [-.10, 0, -.03], spine: [-.05, 0, .04], left_upper_arm: [.62, 0, .08], right_upper_arm: [-.62, 0, -.08], cape_root: [.38, 0, 0], hair_root: [.12, 0, 0] } },
  ];
  return animationClip('run', d, legs.map(frame => {
    const phase = frame.t / d;
    const upper = typeof hold.runArms === 'function' ? hold.runArms(phase) : frame.arms;
    return F(frame.t, { ...frame.rot, ...upper }, { pelvis: frame.pos });
  }), skeletonInfo);
}

function buildClassSprintClip(skeletonInfo, profileId, F) {
  const hold = classWeaponHold(profileId);
  const d = .56;
  const legs = [
    { t: 0, rot: { left_upper_leg: [-.9, 0, 0], right_upper_leg: [.92, 0, 0], left_lower_leg: [.45, 0, 0], right_lower_leg: [1.1, 0, 0] }, pos: [0, .02, 0],
      arms: { chest: [-.23, 0, -.06], spine: [-.12, 0, .06], left_upper_arm: [.86, 0, .1], right_upper_arm: [-.9, 0, -.1], cape_root: [.72, 0, 0], hair_root: [.28, 0, 0] } },
    { t: .14, rot: { left_upper_leg: [-.12, 0, 0], right_upper_leg: [.12, 0, 0], left_lower_leg: [1.05, 0, 0], right_lower_leg: [.4, 0, 0] }, pos: [0, .13, 0],
      arms: { chest: [-.25, 0, .04], spine: [-.13, 0, -.05], left_upper_arm: [0, 0, .1], right_upper_arm: [0, 0, -.1], cape_root: [.82, .04, 0], hair_root: [.33, 0, 0] } },
    { t: .28, rot: { left_upper_leg: [.92, 0, 0], right_upper_leg: [-.9, 0, 0], left_lower_leg: [1.1, 0, 0], right_lower_leg: [.45, 0, 0] }, pos: [0, .02, 0],
      arms: { chest: [-.23, 0, .06], spine: [-.12, 0, -.06], left_upper_arm: [-.9, 0, .1], right_upper_arm: [.86, 0, -.1], cape_root: [.72, 0, 0], hair_root: [.28, 0, 0] } },
    { t: .42, rot: { left_upper_leg: [.12, 0, 0], right_upper_leg: [-.12, 0, 0], left_lower_leg: [.4, 0, 0], right_lower_leg: [1.05, 0, 0] }, pos: [0, .13, 0],
      arms: { chest: [-.25, 0, -.04], spine: [-.13, 0, .05], left_upper_arm: [0, 0, .1], right_upper_arm: [0, 0, -.1], cape_root: [.82, -.04, 0], hair_root: [.33, 0, 0] } },
    { t: .56, rot: { left_upper_leg: [-.9, 0, 0], right_upper_leg: [.92, 0, 0], left_lower_leg: [.45, 0, 0], right_lower_leg: [1.1, 0, 0] }, pos: [0, .02, 0],
      arms: { chest: [-.23, 0, -.06], spine: [-.12, 0, .06], left_upper_arm: [.86, 0, .1], right_upper_arm: [-.9, 0, -.1], cape_root: [.72, 0, 0], hair_root: [.28, 0, 0] } },
  ];
  return animationClip('sprint', d, legs.map(frame => {
    const phase = frame.t / d;
    const upper = typeof hold.sprintArms === 'function' ? hold.sprintArms(phase) : frame.arms;
    return F(frame.t, { ...frame.rot, ...upper }, { pelvis: frame.pos });
  }), skeletonInfo);
}

function classRestRot(profileId) {
  const a = classWeaponHold(profileId).idle.a;
  return {
    pelvis: a.pelvis ?? [0, 0, 0],
    spine: a.spine ?? [0, 0, 0],
    chest: a.chest ?? [0, 0, 0],
    neck: a.neck ?? [0, 0, 0],
    head: a.head ?? [0, 0, 0],
    left_upper_arm: a.left_upper_arm ?? [.03, 0, .08],
    left_lower_arm: a.left_lower_arm ?? [0, 0, 0],
    left_hand: a.left_hand ?? [0, 0, 0],
    right_upper_arm: a.right_upper_arm ?? [.03, 0, -.08],
    right_lower_arm: a.right_lower_arm ?? [0, 0, 0],
    right_hand: a.right_hand ?? [0, 0, 0],
    left_upper_leg: a.left_upper_leg ?? [0, 0, 0],
    left_lower_leg: a.left_lower_leg ?? [0, 0, 0],
    left_foot: a.left_foot ?? [0, 0, 0],
    right_upper_leg: a.right_upper_leg ?? [0, 0, 0],
    right_lower_leg: a.right_lower_leg ?? [0, 0, 0],
    right_foot: a.right_foot ?? [0, 0, 0],
    cape_root: a.cape_root ?? [.12, 0, 0],
    hair_root: a.hair_root ?? [0, 0, 0],
  };
}

/**
 * Combat clips: always start from class rest, use full-body weight shift,
 * and include anticipation → contact → follow-through → settle keys so
 * attacks/casts stop reading as wooden arm-only snaps.
 */
function buildClassCombatClipSpecs(profileId, F) {
  const rest = classRestRot(profileId);
  const bob = classWeaponHold(profileId).idle.bob ?? [0, 0, 0];
  const pose = (t, rot = {}, pos = {}) => F(t, { ...rest, ...rot }, { pelvis: bob, root: [0, 0, 0], ...pos });
  const end = (t, extra = {}) => pose(t, extra);

  // Soft knee / hip helpers for weight transfer (relative to rest legs).
  const weightL = (amount = 1) => ({
    left_upper_leg: [rest.left_upper_leg[0] + .12 * amount, rest.left_upper_leg[1] + .08 * amount, rest.left_upper_leg[2]],
    left_lower_leg: [rest.left_lower_leg[0] + .18 * amount, 0, 0],
    left_foot: [rest.left_foot[0] - .04 * amount, 0, rest.left_foot[2]],
    right_upper_leg: [rest.right_upper_leg[0] - .1 * amount, rest.right_upper_leg[1] - .06 * amount, rest.right_upper_leg[2]],
    right_lower_leg: [rest.right_lower_leg[0] + .1 * amount, 0, 0],
  });
  const weightR = (amount = 1) => ({
    right_upper_leg: [rest.right_upper_leg[0] + .12 * amount, rest.right_upper_leg[1] - .08 * amount, rest.right_upper_leg[2]],
    right_lower_leg: [rest.right_lower_leg[0] + .18 * amount, 0, 0],
    right_foot: [rest.right_foot[0] - .04 * amount, 0, rest.right_foot[2]],
    left_upper_leg: [rest.left_upper_leg[0] - .08 * amount, rest.left_upper_leg[1] + .05 * amount, rest.left_upper_leg[2]],
    left_lower_leg: [rest.left_lower_leg[0] + .1 * amount, 0, 0],
  });

  if (profileId === 'rogue') {
    // Dual-dagger: R / L / R / X-cross / spin / twin thrust / flurry — fuller arcs + settle.
    return [
      ['attack_1', .56, [
        pose(0, { pelvis: [.08, -.18, 0], chest: [-.16, -.22, -.08], right_upper_arm: [-.75, -.48, -.52], right_lower_arm: [-1.05, -.12, -.38], ...weightR(.6) }),
        pose(.1, { pelvis: [.12, -.32, 0], spine: [-.12, -.18, 0], chest: [-.22, -.52, -.14], neck: [.08, -.1, 0], head: [.06, -.08, 0],
          right_upper_arm: [-1.2, -.78, -.8], right_lower_arm: [-1.25, -.16, -.58], right_hand: [.2, -.25, -.15],
          left_upper_arm: [-.42, .28, .48], left_lower_arm: [-1.12, .1, .22], cape_root: [.28, -.1, 0], ...weightR(1) }, { pelvis: [0, -.02, .02] }),
        pose(.22, { pelvis: [.04, .22, 0], spine: [-.04, .28, 0], chest: [-.06, .58, .2], neck: [-.04, .12, 0], head: [-.03, .1, 0],
          right_upper_arm: [-.22, .92, .58], right_lower_arm: [-.1, 0, .48], right_hand: [-.05, .1, .2],
          left_upper_arm: [-.52, .12, .38], left_lower_arm: [-1.15, .08, .25], cape_root: [.48, .12, 0], ...weightL(.7) }, { pelvis: [0, .02, .06] }),
        pose(.36, { pelvis: [.05, .1, 0], chest: [-.08, .28, .1], right_upper_arm: [-.4, .45, .3], right_lower_arm: [-.55, -.04, .15],
          left_upper_arm: [-.5, .2, .42], cape_root: [.35, .05, 0], ...weightL(.3) }),
        end(.56),
      ]],
      ['attack_2', .58, [
        pose(0, { pelvis: [.06, .14, 0], chest: [-.12, .22, .06], left_upper_arm: [-.7, .42, .58], left_lower_arm: [-1.08, .12, .32], ...weightL(.55) }),
        pose(.12, { pelvis: [.1, .32, 0], spine: [-.1, .22, 0], chest: [-.2, .6, .16], neck: [.06, .12, 0],
          left_upper_arm: [-1.15, .8, .78], left_lower_arm: [-1.18, .16, .52], left_hand: [.18, .24, .16],
          right_upper_arm: [-.48, -.28, -.42], right_lower_arm: [-1.08, -.08, -.22], cape_root: [.3, .1, 0], ...weightL(1) }),
        pose(.26, { pelvis: [.04, -.24, 0], spine: [-.06, -.32, 0], chest: [-.1, -.68, -.22], neck: [-.02, -.1, 0],
          left_upper_arm: [-.18, -.95, .48], left_lower_arm: [-.15, 0, .38], left_hand: [-.04, -.08, .15],
          right_upper_arm: [-.58, -.38, -.48], cape_root: [.52, -.14, 0], ...weightR(.75) }, { pelvis: [0, .01, .05] }),
        pose(.4, { pelvis: [.05, -.1, 0], chest: [-.1, -.3, -.1], left_upper_arm: [-.4, -.4, .35], left_lower_arm: [-.7, .05, .2],
          right_upper_arm: [-.55, -.32, -.45], ...weightR(.3) }),
        end(.58),
      ]],
      ['attack_3', .62, [
        pose(0, { pelvis: [.1, -.22, 0], chest: [-.18, -.38, -.12], right_upper_arm: [-.9, -.58, -.62], right_lower_arm: [-1.18, -.12, -.42], left_upper_arm: [-.52, .32, .52], ...weightR(.7) }),
        pose(.14, { pelvis: [.14, -.42, 0], spine: [-.16, -.28, 0], chest: [-.24, -.75, -.24], neck: [.1, -.12, 0],
          right_upper_arm: [-1.3, -1.0, -.88], right_lower_arm: [-1.28, -.16, -.68], cape_root: [.32, -.16, 0], ...weightR(1.1) }, { pelvis: [0, -.03, .02] }),
        pose(.3, { pelvis: [.04, .3, 0], spine: [-.05, .38, 0], chest: [-.05, .8, .28], neck: [-.05, .15, 0],
          right_upper_arm: [-.12, 1.1, .72], right_lower_arm: [.08, 0, .52], left_upper_arm: [-.72, -.22, .18], left_lower_arm: [-.92, 0, .12],
          cape_root: [.58, .16, 0], ...weightL(.8) }, { pelvis: [0, .02, .08] }),
        pose(.44, { pelvis: [.05, .12, 0], chest: [-.08, .35, .12], right_upper_arm: [-.35, .55, .35], right_lower_arm: [-.4, 0, .2], ...weightL(.35) }),
        end(.62),
      ]],
      ['attack_4', .74, [
        pose(0, { pelvis: [.1, 0, 0], chest: [-.16, 0, -.06], right_upper_arm: [-.8, -.52, -.58], left_upper_arm: [-.8, .52, .58],
          right_lower_arm: [-1.12, 0, -.38], left_lower_arm: [-1.12, 0, .38], ...weightR(.4) }),
        pose(.16, { pelvis: [.12, 0, 0], spine: [-.14, 0, 0], chest: [-.24, 0, -.1], neck: [.08, 0, 0],
          right_upper_arm: [-1.25, -.8, -.82], left_upper_arm: [-1.25, .8, .82], right_lower_arm: [-1.28, 0, -.58], left_lower_arm: [-1.28, 0, .58],
          cape_root: [.38, 0, 0], ...weightR(.5) }, { pelvis: [0, -.02, .03] }),
        pose(.34, { pelvis: [.03, 0, 0], chest: [.1, 0, .1], neck: [-.04, 0, 0],
          right_upper_arm: [-.28, 1.05, .68], left_upper_arm: [-.28, -1.05, .68], right_lower_arm: [.08, 0, .42], left_lower_arm: [.08, 0, -.42],
          cape_root: [.68, 0, 0], ...weightL(.5) }, { pelvis: [0, .02, .1] }),
        pose(.5, { pelvis: [.05, 0, 0], chest: [.04, 0, .04], right_upper_arm: [-.45, .5, .3], left_upper_arm: [-.45, -.5, .3],
          right_lower_arm: [-.5, 0, .1], left_lower_arm: [-.5, 0, -.1] }),
        end(.74),
      ]],
      ['attack_5', .76, [
        pose(0, { pelvis: [.1, -.22, 0], chest: [-.16, -.42, -.1], right_upper_arm: [-.85, -.52, -.58], left_upper_arm: [-.85, .52, .58], ...weightR(.6) }),
        pose(.14, { pelvis: [.06, .4, 0], spine: [-.05, .45, 0], chest: [-.12, .7, .08], right_upper_arm: [-.55, .4, .2], left_upper_arm: [-.55, -.35, .25], cape_root: [.45, .08, 0] }),
        pose(.28, { pelvis: [0, 1.25, 0], spine: [0, .95, 0], chest: [-.1, 1.7, .12], neck: [0, .2, 0],
          right_upper_arm: [-.38, 1.55, .52], left_upper_arm: [-.38, -1.45, .52], cape_root: [.78, .16, 0], ...weightL(.4) }, { pelvis: [0, .04, 0] }),
        pose(.46, { pelvis: [0, 2.55, 0], spine: [0, 1.95, 0], chest: [-.1, 2.95, -.12], neck: [0, -.1, 0],
          right_upper_arm: [-.55, 2.55, -.55], left_upper_arm: [-.55, 1.35, .55], cape_root: [.98, -.14, 0] }, { pelvis: [0, .02, 0] }),
        pose(.6, { pelvis: [0, 1.2, 0], spine: [0, .9, 0], chest: [-.1, 1.4, 0], right_upper_arm: [-.5, 1.2, 0], left_upper_arm: [-.5, .4, .3] }),
        end(.76),
      ]],
      ['attack_6', .72, [
        pose(0, { pelvis: [.1, -.2, 0], spine: [-.14, 0, 0], chest: [-.2, -.28, -.1],
          right_upper_arm: [-.95, -.38, -.52], left_upper_arm: [-.95, .38, .52], right_lower_arm: [-1.18, 0, -.32], left_lower_arm: [-1.18, 0, .32], ...weightR(.7) }),
        pose(.16, { pelvis: [.14, -.38, 0], spine: [-.22, 0, 0], chest: [-.3, -.5, -.16], neck: [.1, 0, 0],
          right_upper_arm: [-1.4, -.58, -.72], left_upper_arm: [-1.4, .58, .72], cape_root: [.42, -.12, 0], ...weightR(1) }, { pelvis: [0, -.04, .06] }),
        pose(.34, { pelvis: [.03, .18, 0], spine: [-.04, 0, 0], chest: [-.04, .55, .22], neck: [-.04, 0, 0],
          right_upper_arm: [-.18, 1.0, .62], left_upper_arm: [-.18, -1.0, .62], right_lower_arm: [.12, 0, .42], left_lower_arm: [.12, 0, -.42],
          cape_root: [.62, .14, 0], ...weightL(.6) }, { pelvis: [0, .02, .12] }),
        pose(.5, { pelvis: [.05, .06, 0], chest: [-.06, .2, .08], right_upper_arm: [-.4, .4, .25], left_upper_arm: [-.4, -.4, .25], ...weightL(.25) }),
        end(.72),
      ]],
      ['attack_7', .86, [
        pose(0, { pelvis: [.12, -.28, 0], spine: [-.16, -.12, 0], chest: [-.22, -.55, -.14],
          right_upper_arm: [-1.0, -.62, -.68], left_upper_arm: [-1.0, .62, .68], ...weightR(.8) }),
        pose(.16, { pelvis: [.15, -.48, 0], spine: [-.24, -.22, 0], chest: [-.3, -.9, -.24], neck: [.12, -.1, 0],
          right_upper_arm: [-1.38, -1.05, -.92], left_upper_arm: [-1.38, 1.05, .92], cape_root: [.42, -.22, 0], ...weightR(1.15) }, { pelvis: [0, -.04, .02] }),
        pose(.32, { pelvis: [0, .55, 0], spine: [0, .5, 0], chest: [-.1, .85, .16], right_upper_arm: [-.5, .9, .35], left_upper_arm: [-.5, -.8, .35], cape_root: [.55, .1, 0] }),
        pose(.48, { pelvis: [0, 1.35, 0], spine: [0, 1.05, 0], chest: [-.06, 1.75, .15], neck: [0, .15, 0],
          right_upper_arm: [-.4, 1.85, .5], left_upper_arm: [-.4, -1.55, .5], cape_root: [.82, .18, 0], ...weightL(.5) }, { pelvis: [0, .03, .06] }),
        pose(.64, { pelvis: [0, 1.75, 0], spine: [0, 1.35, 0], chest: [-.06, 2.15, -.08], right_upper_arm: [-.52, 2.25, -.45], left_upper_arm: [-.52, 1.05, .48], cape_root: [.92, -.12, 0] }),
        end(.86),
      ]],
    ];
  }

  // Knight / wizard / ranger shared attack vocabulary + caster casts.
  // Each swing: ready → windup → contact → follow → settle (legs + head included).
  const attacks = [
    // 1 — horizontal cut (right → left)
    ['attack_1', .64, [
      pose(0, { pelvis: [.04, -.16, 0], spine: [-.08, -.12, 0], chest: [-.1, -.28, -.1], neck: [.04, -.06, 0],
        right_upper_arm: [-.55, -.55, -.48], right_lower_arm: [-.85, -.06, -.32], right_hand: [.1, -.12, -.08],
        left_upper_arm: [-.2, .18, .35], left_lower_arm: [-.55, .06, .12], ...weightR(.55) }),
      pose(.12, { pelvis: [.06, -.34, 0], spine: [-.14, -.28, 0], chest: [-.18, -.55, -.18], neck: [.08, -.12, 0], head: [.05, -.08, 0],
        right_upper_arm: [-1.15, -.85, -.78], right_lower_arm: [-1.05, -.08, -.58], right_hand: [.18, -.2, -.12],
        left_upper_arm: [-.12, .22, .4], left_lower_arm: [-.45, .08, .18], cape_root: [.3, -.12, 0], ...weightR(1) }, { pelvis: [0, -.02, .02] }),
      pose(.26, { pelvis: [.02, .22, 0], spine: [-.04, .32, .04], chest: [-.06, .68, .22], neck: [-.04, .14, 0], head: [-.03, .12, 0],
        right_upper_arm: [-.35, 1.0, .65], right_lower_arm: [-.12, 0, .55], right_hand: [-.06, .12, .18],
        left_upper_arm: [-.35, -.18, .12], left_lower_arm: [-.7, 0, .08], cape_root: [.58, .16, 0], ...weightL(.75) }, { pelvis: [0, .02, .07] }),
      pose(.4, { pelvis: [.03, .08, 0], spine: [-.04, .12, 0], chest: [-.06, .28, .1], neck: [0, .05, 0],
        right_upper_arm: [-.4, .45, .28], right_lower_arm: [-.5, -.02, .15], left_upper_arm: [-.28, .08, .28],
        cape_root: [.35, .06, 0], ...weightL(.3) }),
      end(.64),
    ]],
    // 2 — rising diagonal (left-low → right-high)
    ['attack_2', .68, [
      pose(0, { pelvis: [.03, .12, 0], spine: [-.06, .18, 0], chest: [-.08, .32, .1], neck: [.02, .08, 0],
        right_upper_arm: [-.45, .48, .42], right_lower_arm: [-.7, 0, .28], left_upper_arm: [-.22, .12, .3], ...weightL(.5) }),
      pose(.14, { pelvis: [.05, .28, 0], spine: [-.1, .35, 0], chest: [-.14, .58, .2], neck: [.04, .14, 0], head: [.03, .1, 0],
        right_upper_arm: [-1.0, .95, .68], right_lower_arm: [-.85, 0, .55], right_hand: [.12, .15, .12],
        left_upper_arm: [-.15, .2, .38], cape_root: [.28, .12, 0], ...weightL(.9) }, { pelvis: [0, -.01, .02] }),
      pose(.3, { pelvis: [.02, -.2, 0], spine: [-.08, -.38, 0], chest: [-.12, -.75, -.26], neck: [-.02, -.12, 0], head: [-.02, -.1, 0],
        right_upper_arm: [-.32, -1.08, -.62], right_lower_arm: [-.1, 0, -.48], right_hand: [-.05, -.1, -.15],
        left_upper_arm: [-.18, .22, .35], cape_root: [.55, -.14, 0], ...weightR(.8) }, { pelvis: [0, .02, .06] }),
      pose(.46, { pelvis: [.03, -.08, 0], chest: [-.08, -.3, -.1], right_upper_arm: [-.4, -.45, -.28], right_lower_arm: [-.55, 0, -.15],
        left_upper_arm: [-.22, .15, .3], ...weightR(.35) }),
      end(.68),
    ]],
    // 3 — heavy overhead into cross
    ['attack_3', .74, [
      pose(0, { pelvis: [.05, -.22, 0], spine: [-.1, -.18, 0], chest: [-.14, -.42, -.16], neck: [.06, -.08, 0],
        right_upper_arm: [-.85, -.7, -.72], right_lower_arm: [-.95, -.05, -.52], left_upper_arm: [-.15, .28, .38], ...weightR(.7) }),
      pose(.16, { pelvis: [.08, -.48, 0], spine: [-.18, -.42, 0], chest: [-.22, -.85, -.32], neck: [.1, -.16, 0], head: [.06, -.12, 0],
        right_upper_arm: [-1.35, -1.15, -.95], right_lower_arm: [-1.1, -.08, -.82], right_hand: [.2, -.22, -.15],
        left_upper_arm: [-.1, .38, .42], left_lower_arm: [-.4, .1, .2], cape_root: [.32, -.2, 0], ...weightR(1.15) }, { pelvis: [0, -.03, .02] }),
      pose(.34, { pelvis: [.02, .32, 0], spine: [-.06, .42, .05], chest: [-.1, .98, .38], neck: [-.06, .16, 0], head: [-.04, .14, 0],
        right_upper_arm: [-.15, 1.38, .85], right_lower_arm: [.12, 0, .72], right_hand: [-.08, .15, .22],
        left_upper_arm: [-.42, -.32, .1], left_lower_arm: [-.75, 0, .05], cape_root: [.7, .22, 0], ...weightL(.85) }, { pelvis: [0, .03, .08] }),
      pose(.5, { pelvis: [.03, .12, 0], chest: [-.08, .4, .15], right_upper_arm: [-.3, .65, .4], right_lower_arm: [-.25, 0, .3],
        left_upper_arm: [-.3, .05, .25], cape_root: [.42, .08, 0], ...weightL(.35) }),
      end(.74),
    ]],
    // 4 — thrust / shoulder drive
    ['attack_4', .86, [
      pose(0, { pelvis: [.06, -.28, 0], spine: [-.14, -.15, 0], chest: [-.22, -.48, -.2], neck: [.06, -.1, 0],
        right_upper_arm: [-.95, -.72, -.7], right_lower_arm: [-1.05, -.06, -.58], left_upper_arm: [-.2, .35, .42],
        left_lower_arm: [-.55, .1, .18], ...weightR(.85) }),
      pose(.18, { pelvis: [.1, -.52, 0], spine: [-.26, -.28, 0], chest: [-.36, -.95, -.36], neck: [.12, -.18, 0], head: [.08, -.14, 0],
        right_upper_arm: [-1.42, -1.28, -1.0], right_lower_arm: [-1.18, -.08, -.9], right_hand: [.22, -.25, -.18],
        left_upper_arm: [-.12, .45, .48], cape_root: [.38, -.26, 0], ...weightR(1.2) }, { pelvis: [0, -.04, .04] }),
      pose(.36, { pelvis: [0, .42, .04], spine: [-.06, .38, 0], chest: [-.04, 1.2, .42], neck: [-.06, .18, 0], head: [-.04, .15, 0],
        right_upper_arm: [.12, 1.48, .92], right_lower_arm: [.28, 0, .78], right_hand: [-.1, .18, .25],
        left_upper_arm: [-.6, -.38, .14], left_lower_arm: [-.85, 0, .05], cape_root: [.85, .28, 0], ...weightL(.9) }, { pelvis: [0, .02, .12] }),
      pose(.55, { pelvis: [.02, .15, 0], spine: [-.04, .12, 0], chest: [-.05, .45, .16],
        right_upper_arm: [-.25, .7, .45], right_lower_arm: [-.15, 0, .35], left_upper_arm: [-.35, 0, .22], cape_root: [.5, .1, 0], ...weightL(.4) }),
      end(.86),
    ]],
    // 5 — spin slash (high-level)
    ['attack_5', .78, [
      pose(0, { pelvis: [.05, -.18, 0], spine: [-.1, -.2, 0], chest: [-.12, -.45, -.14],
        right_upper_arm: [-.9, -.55, -.62], left_upper_arm: [-.25, .25, .35], ...weightR(.6) }),
      pose(.12, { pelvis: [.04, .35, 0], spine: [-.04, .4, 0], chest: [-.1, .55, .08], right_upper_arm: [-.55, .35, .15], left_upper_arm: [-.35, -.2, .2], cape_root: [.4, .08, 0] }),
      pose(.26, { pelvis: [0, 1.15, 0], spine: [0, .95, 0], chest: [-.1, 1.65, .12], neck: [0, .18, 0],
        right_upper_arm: [-.28, 1.55, .52], left_upper_arm: [-.42, -1.05, -.28], cape_root: [.72, .18, 0], ...weightL(.4) }, { pelvis: [0, .04, 0] }),
      pose(.44, { pelvis: [0, 2.35, 0], spine: [0, 1.9, 0], chest: [-.1, 2.75, -.12], neck: [0, -.08, 0],
        right_upper_arm: [-.48, 2.35, -.55], left_upper_arm: [-.35, 1.15, .38], cape_root: [.95, -.18, 0] }, { pelvis: [0, .02, 0] }),
      pose(.58, { pelvis: [0, 1.1, 0], spine: [0, .85, 0], chest: [-.1, 1.3, 0], right_upper_arm: [-.45, 1.1, 0], left_upper_arm: [-.3, .3, .25] }),
      end(.78),
    ]],
    // 6 — reverse cross cut
    ['attack_6', .76, [
      pose(0, { pelvis: [.04, .15, 0], spine: [-.08, .2, 0], chest: [-.12, .38, .1],
        right_upper_arm: [-.55, .65, .42], left_upper_arm: [-.2, -.15, .22], ...weightL(.55) }),
      pose(.14, { pelvis: [.05, .3, 0], chest: [-.14, .55, .16], right_upper_arm: [-.85, 1.0, .55], left_upper_arm: [-.15, .15, .32], cape_root: [.28, .1, 0], ...weightL(.8) }),
      pose(.3, { pelvis: [.04, -.38, 0], spine: [-.14, -.35, 0], chest: [-.24, -.88, -.28], neck: [.06, -.12, 0], head: [.04, -.1, 0],
        right_upper_arm: [-1.35, -1.12, -.88], right_lower_arm: [-.9, 0, -.55], left_upper_arm: [-.18, .35, .42],
        cape_root: [.45, -.18, 0], ...weightR(1) }, { pelvis: [0, -.02, .04] }),
      pose(.46, { pelvis: [.02, .28, 0], spine: [-.05, .3, 0], chest: [-.1, 1.0, .36], neck: [-.04, .12, 0],
        right_upper_arm: [.08, 1.35, .88], right_lower_arm: [.15, 0, .65], left_upper_arm: [-.48, -.28, .12],
        cape_root: [.78, .22, 0], ...weightL(.7) }, { pelvis: [0, .02, .08] }),
      pose(.6, { pelvis: [.03, .08, 0], chest: [-.06, .35, .12], right_upper_arm: [-.3, .55, .35], left_upper_arm: [-.28, .05, .22], ...weightL(.25) }),
      end(.76),
    ]],
    // 7 — finisher smash
    ['attack_7', .94, [
      pose(0, { pelvis: [.06, -.32, 0], spine: [-.16, -.12, 0], chest: [-.26, -.6, -.22], neck: [.08, -.1, 0],
        right_upper_arm: [-1.15, -.88, -.82], left_upper_arm: [-.18, .4, .48], left_lower_arm: [-.5, .1, .2], ...weightR(.95) }),
      pose(.2, { pelvis: [.1, -.58, 0], spine: [-.3, -.28, 0], chest: [-.4, -1.1, -.38], neck: [.14, -.18, 0], head: [.1, -.14, 0],
        right_upper_arm: [-1.52, -1.38, -1.05], right_lower_arm: [-1.15, -.1, -.88], right_hand: [.24, -.28, -.18],
        left_upper_arm: [-.12, .5, .52], cape_root: [.42, -.28, 0], ...weightR(1.25) }, { pelvis: [0, -.05, .03] }),
      pose(.4, { pelvis: [0, .48, .06], spine: [-.05, .42, 0], chest: [-.02, 1.35, .48], neck: [-.08, .18, 0], head: [-.05, .16, 0],
        right_upper_arm: [.22, 1.62, .98], right_lower_arm: [.3, 0, .82], right_hand: [-.12, .2, .28],
        left_upper_arm: [-.7, -.42, .16], left_lower_arm: [-.9, 0, .05], cape_root: [.92, .3, 0], ...weightL(1) }, { pelvis: [0, .03, .1] }),
      pose(.6, { pelvis: [.02, .18, 0], spine: [-.04, .15, 0], chest: [-.04, .5, .18],
        right_upper_arm: [-.2, .75, .48], right_lower_arm: [-.1, 0, .35], left_upper_arm: [-.35, 0, .22], cape_root: [.55, .12, 0], ...weightL(.4) }),
      end(.94),
    ]],
  ];

  const casts = [
    // cast_1 — short push (right-hand orb flick)
    ['cast_1', .62, [
      pose(0, { spine: [-.06, .04, 0], chest: [-.1, .06, -.02], neck: [.04, .04, 0],
        right_upper_arm: [-.55, -.15, -.35], right_lower_arm: [-.75, -.04, -.18], left_upper_arm: [-.4, .15, .32], left_lower_arm: [-.7, .06, .15], ...weightR(.35) }),
      pose(.14, { pelvis: [.04, -.08, 0], spine: [-.12, -.05, 0], chest: [-.16, -.08, -.06], neck: [.06, -.04, 0], head: [.04, -.02, 0],
        right_upper_arm: [-1.15, -.35, -.55], right_lower_arm: [-1.0, -.08, -.35], right_hand: [.12, -.1, -.08],
        left_upper_arm: [-.48, .22, .38], cape_root: [.22, -.06, 0], ...weightR(.7) }, { pelvis: [0, -.02, .01] }),
      pose(.3, { pelvis: [.02, .1, 0], spine: [-.04, .12, 0], chest: [-.06, .22, .12], neck: [-.02, .1, 0], head: [-.02, .08, 0],
        right_upper_arm: [-.4, .72, .52], right_lower_arm: [-.1, 0, .42], right_hand: [-.05, .1, .15],
        left_upper_arm: [-.32, -.08, .2], left_lower_arm: [-.55, 0, .1], cape_root: [.4, .1, 0], ...weightL(.45) }, { pelvis: [0, .015, .04] }),
      pose(.44, { chest: [-.06, .1, .04], right_upper_arm: [-.42, .3, .2], right_lower_arm: [-.45, 0, .1], left_upper_arm: [-.35, .1, .28], ...weightL(.2) }),
      end(.62),
    ]],
    // cast_2 — side channel → release
    ['cast_2', .66, [
      pose(0, { spine: [-.06, .08, 0], chest: [-.08, .12, .04], right_upper_arm: [-.45, .28, .22], left_upper_arm: [-.42, -.18, .22], ...weightL(.3) }),
      pose(.16, { pelvis: [.03, -.06, 0], spine: [-.12, .05, 0], chest: [-.14, .08, 0], neck: [.05, .05, 0],
        right_upper_arm: [-1.18, .42, .32], right_lower_arm: [-.85, 0, .15], left_upper_arm: [-.85, -.32, .28], left_lower_arm: [-.75, 0, .12],
        cape_root: [.25, .04, 0], ...weightL(.55) }, { pelvis: [0, -.015, .01] }),
      pose(.34, { pelvis: [.02, .12, 0], spine: [-.04, .15, 0], chest: [-.04, .28, .08], neck: [-.02, .1, 0], head: [-.02, .08, 0],
        right_upper_arm: [-.35, .95, .58], right_lower_arm: [-.1, 0, .4], left_upper_arm: [-.28, .18, .32], left_lower_arm: [-.4, 0, .15],
        cape_root: [.45, .12, 0], ...weightR(.4) }, { pelvis: [0, .02, .04] }),
      pose(.48, { chest: [-.05, .12, .03], right_upper_arm: [-.4, .4, .25], left_upper_arm: [-.32, .1, .28], ...weightR(.15) }),
      end(.66),
    ]],
    // cast_3 — dual palm press / nova prep
    ['cast_3', .7, [
      pose(0, { spine: [-.08, 0, 0], chest: [-.1, 0, -.04], right_upper_arm: [-.65, -.08, -.35], left_upper_arm: [-.65, .08, .35],
        right_lower_arm: [-.7, 0, -.15], left_lower_arm: [-.7, 0, .15], ...weightR(.25) }),
      pose(.18, { pelvis: [.04, -.18, 0], spine: [-.14, 0, 0], chest: [-.18, 0, -.08], neck: [.08, 0, 0], head: [.05, 0, 0],
        right_upper_arm: [-1.35, -.12, -.55], left_upper_arm: [-1.3, .12, .55], right_lower_arm: [-1.05, 0, -.28], left_lower_arm: [-1.05, 0, .28],
        right_hand: [.15, -.08, -.05], left_hand: [.15, .08, .05], cape_root: [.3, -.08, 0], ...weightR(.55) }, { pelvis: [0, -.025, 0] }),
      pose(.38, { pelvis: [.02, .1, 0], spine: [.04, 0, 0], chest: [.12, 0, .06], neck: [-.04, 0, 0], head: [-.03, 0, 0],
        right_upper_arm: [-.55, .55, .28], left_upper_arm: [-.55, -.55, .28], right_lower_arm: [-.2, 0, .25], left_lower_arm: [-.2, 0, -.25],
        cape_root: [.55, .1, 0], ...weightL(.4) }, { pelvis: [0, .02, .03] }),
      pose(.52, { chest: [.04, 0, .02], right_upper_arm: [-.48, .25, .15], left_upper_arm: [-.48, -.25, .15], ...weightL(.15) }),
      end(.7),
    ]],
    // cast_4 — overhead channel / power cast
    ['cast_4', .82, [
      pose(0, { spine: [-.12, 0, 0], chest: [-.14, 0, -.05], neck: [.05, 0, 0],
        right_upper_arm: [-.85, -.1, -.42], left_upper_arm: [-.85, .1, .42], right_lower_arm: [-.8, 0, -.2], left_lower_arm: [-.8, 0, .2], ...weightR(.4) }),
      pose(.22, { pelvis: [.05, -.12, 0], spine: [-.22, 0, 0], chest: [-.22, 0, -.1], neck: [.1, 0, 0], head: [.06, 0, 0],
        right_upper_arm: [-1.75, -.15, -.62], left_upper_arm: [-1.75, .15, .62], right_lower_arm: [-1.15, 0, -.32], left_lower_arm: [-1.15, 0, .32],
        cape_root: [.4, -.1, 0], ...weightR(.75) }, { pelvis: [0, .08, 0] }),
      pose(.42, { pelvis: [.02, .1, 0], spine: [.06, 0, 0], chest: [.08, 0, .06], neck: [-.05, 0, 0], head: [-.04, 0, 0],
        right_upper_arm: [-.45, .85, .35], left_upper_arm: [-.45, -.85, .35], right_lower_arm: [-.15, 0, .3], left_lower_arm: [-.15, 0, -.3],
        cape_root: [.65, .15, 0], ...weightL(.5) }, { pelvis: [0, .04, .02] }),
      pose(.6, { spine: [0, 0, 0], chest: [.02, 0, .02], right_upper_arm: [-.45, .35, .18], left_upper_arm: [-.45, -.35, .18], ...weightL(.2) }),
      end(.82),
    ]],
  ];
  return [...attacks, ...casts];
}

function heroAnimations(skeletonInfo, profileId = null) {
  const F = (time, rotations = {}, positions = {}, scales = {}) => ({ time, rotations, positions, scales });
  const clips = [];
  const classId = profileId ?? 'aerin';
  const rest = classRestRot(classId);
  const bob = classWeaponHold(classId).idle.bob ?? [0, 0, 0];
  const pose = (t, rot = {}, pos = {}) => F(t, { ...rest, ...rot }, { pelvis: bob, root: [0, 0, 0], ...pos });
  const end = (t, extra = {}) => pose(t, extra);

  clips.push(buildClassIdleClip(skeletonInfo, classId, F));
  clips.push(buildClassRunClip(skeletonInfo, classId, F));
  clips.push(buildClassSprintClip(skeletonInfo, classId, F));

  for (const [name, duration, frames] of buildClassCombatClipSpecs(classId, F)) {
    clips.push(animationClip(name, duration, frames, skeletonInfo));
  }

  clips.push(animationClip('dodge', .56, [
    pose(0, { pelvis: [-.1, -.06, 0], spine: [-.14, 0, 0], chest: [-.18, 0, 0], neck: [.06, 0, 0],
      left_upper_arm: [.15, .08, .28], right_upper_arm: [.15, -.08, -.28] }),
    pose(.14, { pelvis: [-.45, .45, 0], spine: [-.35, .28, 0], chest: [-.42, .55, 0], neck: [.1, .1, 0],
      left_upper_arm: [.75, .25, .5], right_upper_arm: [.75, -.25, -.5],
      left_upper_leg: [.4, 0, .1], right_upper_leg: [-.35, 0, -.1], cape_root: [.85, 0, 0] }, { pelvis: [0, -.22, .1] }),
    pose(.3, { pelvis: [-.5, 1.2, 0], spine: [-.32, .7, 0], chest: [-.35, 1.35, 0],
      left_upper_arm: [.9, .28, .52], right_upper_arm: [.9, -.28, -.52], cape_root: [1.0, .05, 0],
      left_upper_leg: [-.2, 0, .05], right_upper_leg: [.45, 0, -.05] }, { pelvis: [0, -.18, .08] }),
    pose(.42, { pelvis: [-.28, 1.65, 0], spine: [-.2, .9, 0], chest: [-.18, 1.55, 0],
      left_upper_arm: [.5, .18, .28], right_upper_arm: [.5, -.18, -.28], cape_root: [.7, 0, 0] }, { pelvis: [0, -.08, .04] }),
    end(.56),
  ], skeletonInfo));
  clips.push(animationClip('hit', .38, [
    pose(0),
    pose(.08, { pelvis: [.12, .14, 0], spine: [.24, 0, -.12], chest: [.4, 0, -.2], neck: [-.12, 0, .08], head: [-.28, 0, .14],
      left_upper_arm: [-.35, .1, .28], right_upper_arm: [-.35, -.1, -.28],
      left_upper_leg: [.15, 0, .05], right_upper_leg: [-.12, 0, -.05] }, { pelvis: [0, -.07, -.1] }),
    pose(.2, { pelvis: [.06, .06, 0], spine: [.1, 0, -.05], chest: [.16, 0, -.08], head: [-.1, 0, .05],
      left_upper_arm: [-.15, .05, .18], right_upper_arm: [-.15, -.05, -.18] }, { pelvis: [0, -.02, -.03] }),
    end(.38),
  ], skeletonInfo));
  clips.push(animationClip('death', 1.15, [
    pose(0),
    pose(.28, { pelvis: [-.22, .12, 0], spine: [-.38, 0, 0], chest: [-.48, 0, 0], head: [.26, 0, 0],
      left_upper_arm: [-.65, 0, .42], right_upper_arm: [-.65, 0, -.42], left_upper_leg: [.2, 0, .08], right_upper_leg: [.15, 0, -.06] }, { pelvis: [0, -.14, -.1] }),
    pose(.72, { pelvis: [-1.28, .1, 0], spine: [-.58, 0, 0], chest: [-.5, 0, 0], head: [.16, 0, 0],
      left_upper_arm: [-1.05, 0, .22], right_upper_arm: [-1.05, 0, -.22], cape_root: [.72, 0, 0] }, { pelvis: [0, -.84, -.16] }),
    pose(1.15, { pelvis: [-1.48, .1, 0], spine: [-.68, 0, 0], chest: [-.58, 0, 0], head: [.1, 0, 0],
      left_upper_arm: [-1.25, 0, .15], right_upper_arm: [-1.25, 0, -.15], cape_root: [.92, 0, 0] }, { pelvis: [0, -.96, -.24] }),
  ], skeletonInfo));

  clips.push(animationClip('skill_whirlwind', 1.12, [
    pose(0, { pelvis: [.05, -.2, 0], chest: [-.14, -.4, -.16], right_upper_arm: [-.85, -.7, -.72], left_upper_arm: [-.2, .28, .35],
      right_lower_arm: [-.9, 0, -.45], left_upper_leg: [.15, .08, .06], right_upper_leg: [-.1, -.1, -.08] }),
    pose(.18, { pelvis: [.08, -.55, 0], spine: [-.22, -.7, 0], chest: [-.28, -1.15, -.28], neck: [.1, -.15, 0],
      right_upper_arm: [-1.4, -1.15, -.95], left_upper_arm: [-.15, .6, .52], cape_root: [.48, -.28, 0] }, { pelvis: [0, -.03, .02] }),
    pose(.4, { pelvis: [0, .9, 0], spine: [-.08, .85, 0], chest: [-.1, 1.35, .18], right_upper_arm: [-.35, 1.3, .55], left_upper_arm: [-.45, -.9, -.25], cape_root: [.75, .2, 0] }),
    pose(.62, { pelvis: [0, 2.0, 0], spine: [-.08, 1.7, 0], chest: [-.1, 2.55, .18], neck: [0, .15, 0],
      right_upper_arm: [-.25, 2.15, .75], left_upper_arm: [-.55, -1.35, -.35], cape_root: [1.0, .35, 0] }, { pelvis: [0, .03, 0] }),
    pose(.82, { pelvis: [0, 3.5, 0], spine: [-.08, 2.6, 0], chest: [-.1, 3.7, -.15], neck: [0, -.08, 0],
      right_upper_arm: [-.4, 2.95, -.65], left_upper_arm: [-.4, 1.6, .4], cape_root: [1.12, -.3, 0] }),
    pose(.96, { pelvis: [0, 1.6, 0], spine: [0, 1.2, 0], chest: [-.1, 1.7, 0], right_upper_arm: [-.45, 1.3, 0], left_upper_arm: [-.3, .4, .25] }),
    end(1.12),
  ], skeletonInfo));
  clips.push(animationClip('skill_crescent', .94, [
    pose(0, { pelvis: [.05, -.22, 0], spine: [-.1, -.15, 0], chest: [-.14, -.55, -.18],
      right_upper_arm: [-1.0, -.85, -.78], right_lower_arm: [-.95, 0, -.55], left_upper_arm: [-.2, .3, .38],
      left_upper_leg: [.12, .08, .05], right_upper_leg: [-.12, -.1, -.1] }),
    pose(.2, { pelvis: [.08, -.48, 0], spine: [-.26, -.3, 0], chest: [-.34, -.95, -.32], neck: [.1, -.14, 0], head: [.06, -.1, 0],
      right_upper_arm: [-1.52, -1.32, -1.02], right_lower_arm: [-1.12, 0, -.82], cape_root: [.45, -.22, 0] }, { pelvis: [0, -.03, .03] }),
    pose(.38, { pelvis: [0, .35, .08], spine: [-.08, .38, 0], chest: [-.08, 1.1, .35], neck: [-.05, .14, 0],
      right_upper_arm: [.1, 1.4, .92], right_lower_arm: [.22, 0, .78], left_upper_arm: [-.45, -.25, .12],
      cape_root: [.82, .26, 0] }, { pelvis: [0, .02, .1] }),
    pose(.58, { pelvis: [.02, .12, 0], chest: [-.06, .4, .14], right_upper_arm: [-.25, .65, .4], right_lower_arm: [-.15, 0, .3], left_upper_arm: [-.3, .05, .25] }),
    end(.94),
  ], skeletonInfo));
  clips.push(animationClip('skill_skyfall', 1.2, [
    pose(0, { pelvis: [-.12, -.05, 0], spine: [-.1, 0, 0], chest: [-.18, 0, 0], neck: [.05, 0, 0],
      right_upper_arm: [-.7, -.1, -.42], left_upper_arm: [-.7, .1, .42], left_upper_leg: [.2, 0, .05], right_upper_leg: [.15, 0, -.05] }),
    pose(.22, { pelvis: [-.45, 0, 0], spine: [-.22, 0, 0], chest: [-.28, 0, 0], neck: [.1, 0, 0],
      right_upper_arm: [-1.25, -.1, -.7], left_upper_arm: [-1.25, .1, .7], cape_root: [.55, 0, 0],
      left_upper_leg: [.45, 0, .08], right_upper_leg: [.35, 0, -.06] }, { root: [0, .55, 0] }),
    pose(.42, { pelvis: [-.62, 0, 0], spine: [-.32, 0, 0], chest: [-.36, 0, 0],
      right_upper_arm: [-1.5, 0, -.92], left_upper_arm: [-1.5, 0, .92], cape_root: [.85, 0, 0] }, { root: [0, 1.55, .08] }),
    pose(.62, { pelvis: [.15, 0, 0], spine: [.1, 0, 0], chest: [.16, 0, 0], neck: [-.06, 0, 0],
      right_upper_arm: [.3, 0, -.5], left_upper_arm: [.3, 0, .5], cape_root: [1.05, 0, 0] }, { root: [0, 2.75, .18] }),
    pose(.82, { pelvis: [-.72, 0, 0], spine: [-.42, 0, 0], chest: [-.52, 0, 0], neck: [.12, 0, 0],
      right_upper_arm: [-1.35, 0, -.28], left_upper_arm: [-1.05, 0, .28], cape_root: [.55, 0, 0],
      left_upper_leg: [.55, 0, .1], right_upper_leg: [.4, 0, -.08], left_lower_leg: [.5, 0, 0], right_lower_leg: [.4, 0, 0] }, { root: [0, .08, .42] }),
    pose(1.0, { pelvis: [-.2, 0, 0], spine: [-.12, 0, 0], chest: [-.15, 0, 0], right_upper_arm: [-.6, 0, -.3], left_upper_arm: [-.55, 0, .3] }, { root: [0, 0, .1] }),
    end(1.2),
  ], skeletonInfo));
  clips.push(animationClip('skill_starburst', 1.5, [
    pose(0, { spine: [-.08, 0, 0], chest: [-.12, 0, 0], right_upper_arm: [-.55, -.08, -.32], left_upper_arm: [-.55, .08, .32] }),
    pose(.22, { pelvis: [-.2, 0, 0], spine: [-.18, 0, 0], chest: [-.2, 0, 0], neck: [.08, 0, 0],
      right_upper_arm: [-1.15, -.1, -.65], left_upper_arm: [-1.15, .1, .65], right_lower_arm: [-.55, 0, -.2], left_lower_arm: [-.55, 0, .2],
      cape_root: [.45, 0, 0] }, { pelvis: [0, -.06, 0] }),
    pose(.48, { pelvis: [-.35, 0, 0], spine: [-.28, 0, 0], chest: [-.3, 0, 0],
      right_upper_arm: [-1.65, 0, -.95], left_upper_arm: [-1.65, 0, .95], right_lower_arm: [-.7, 0, -.28], left_lower_arm: [-.7, 0, .28],
      cape_root: [.75, 0, 0] }, { pelvis: [0, -.12, 0] }),
    pose(.78, { pelvis: [.1, 0, 0], spine: [.1, 0, 0], chest: [.12, 0, 0], neck: [-.05, 0, 0],
      right_upper_arm: [-2.5, 0, -.32], left_upper_arm: [-2.5, 0, .32], right_lower_arm: [-.2, 0, 0], left_lower_arm: [-.2, 0, 0],
      cape_root: [1.0, 0, 0] }, { pelvis: [0, .14, 0] }),
    pose(1.05, { pelvis: [-.2, 0, 0], spine: [-.14, 0, 0], chest: [-.16, 0, 0],
      right_upper_arm: [-.85, 1.55, -.45], left_upper_arm: [-.85, -1.55, .45], cape_root: [.85, .35, 0] }),
    pose(1.25, { pelvis: [-.08, 0, 0], chest: [-.08, 0, 0], right_upper_arm: [-.55, .6, -.2], left_upper_arm: [-.55, -.6, .2] }),
    end(1.5),
  ], skeletonInfo));

  // cast_* are already authored in buildClassCombatClipSpecs; wizard skills only below.
  clips.push(animationClip('skill_fireball', 1.0, [
    pose(0, { spine: [-.08, -.05, 0], chest: [-.12, -.08, -.04], neck: [.04, -.03, 0],
      right_upper_arm: [-.75, -.25, -.42], right_lower_arm: [-.85, -.05, -.28], left_upper_arm: [-.35, .18, .28],
      left_upper_leg: [.1, .05, .04], right_upper_leg: [-.06, -.06, -.05] }),
    pose(.2, { pelvis: [.05, -.18, 0], spine: [-.16, -.18, 0], chest: [-.22, -.32, -.12], neck: [.08, -.08, 0], head: [.05, -.05, 0],
      right_upper_arm: [-1.4, -.55, -.72], right_lower_arm: [-1.05, -.08, -.45], right_hand: [.15, -.12, -.1],
      left_upper_arm: [-.42, .22, .32], cape_root: [.38, -.1, 0] }, { pelvis: [0, -.025, .02] }),
    pose(.4, { pelvis: [.02, .12, 0], spine: [-.04, .28, 0], chest: [-.04, .52, .22], neck: [-.04, .12, 0], head: [-.03, .1, 0],
      right_upper_arm: [-.18, 1.15, .72], right_lower_arm: [.12, 0, .55], right_hand: [-.06, .12, .18],
      left_upper_arm: [-.42, -.18, .14], left_lower_arm: [-.65, 0, .08], cape_root: [.58, .16, 0] }, { pelvis: [0, .02, .05] }),
    pose(.62, { pelvis: [.03, .04, 0], chest: [-.05, .2, .08], right_upper_arm: [-.35, .5, .3], right_lower_arm: [-.3, 0, .2], left_upper_arm: [-.35, .1, .25] }),
    end(1.0),
  ], skeletonInfo));
  clips.push(animationClip('skill_frost_nova', 1.06, [
    pose(0, { spine: [-.08, 0, 0], chest: [-.1, 0, -.04], right_upper_arm: [-.55, -.05, -.32], left_upper_arm: [-.55, .05, .32],
      right_lower_arm: [-.65, 0, -.12], left_lower_arm: [-.65, 0, .12] }),
    pose(.18, { pelvis: [.04, -.2, 0], spine: [-.14, 0, 0], chest: [-.18, 0, -.08], neck: [.08, 0, 0],
      right_upper_arm: [-1.15, .25, -.28], left_upper_arm: [-1.15, -.25, .28], right_lower_arm: [-.95, 0, -.2], left_lower_arm: [-.95, 0, .2],
      cape_root: [.32, -.06, 0] }, { pelvis: [0, -.03, 0] }),
    pose(.4, { pelvis: [.02, .1, 0], spine: [.05, 0, 0], chest: [.1, 0, .06], neck: [-.04, 0, 0], head: [-.03, 0, 0],
      right_upper_arm: [-.32, 1.05, .55], left_upper_arm: [-.32, -1.05, .55], right_lower_arm: [-.1, 0, .35], left_lower_arm: [-.1, 0, -.35],
      cape_root: [.55, .08, 0] }, { pelvis: [0, .02, .03] }),
    pose(.65, { chest: [.04, 0, .02], right_upper_arm: [-.4, .45, .25], left_upper_arm: [-.4, -.45, .25], cape_root: [.35, .04, 0] }),
    end(1.06),
  ], skeletonInfo));
  clips.push(animationClip('skill_blink', 1.14, [
    pose(0, { pelvis: [-.1, -.04, 0], spine: [-.1, 0, 0], chest: [-.16, 0, 0], right_upper_arm: [-.55, 0, -.28], left_upper_arm: [-.55, 0, .28] }),
    pose(.2, { pelvis: [-.4, 0, 0], spine: [-.22, 0, 0], chest: [-.28, 0, 0], neck: [.1, 0, 0],
      right_upper_arm: [-1.15, 0, -.48], left_upper_arm: [-1.15, 0, .48], left_upper_leg: [.35, 0, .08], right_upper_leg: [.28, 0, -.06],
      cape_root: [.6, 0, 0] }, { root: [0, .25, 0], pelvis: [0, -.08, 0] }),
    pose(.4, { pelvis: [-.5, 0, 0], spine: [-.28, 0, 0], chest: [-.32, 0, 0],
      right_upper_arm: [-1.35, 0, -.52], left_upper_arm: [-1.35, 0, .52], cape_root: [.78, 0, 0] }, { root: [0, .75, .08] }),
    pose(.58, { pelvis: [.08, 0, 0], spine: [.08, 0, 0], chest: [.06, 0, 0], neck: [-.04, 0, 0],
      right_upper_arm: [-.22, .42, .22], left_upper_arm: [-.22, -.42, .22], cape_root: [.55, .08, 0] }, { root: [0, 1.15, .14] }),
    pose(.8, { pelvis: [-.16, 0, 0], spine: [-.1, 0, 0], chest: [-.12, 0, 0],
      right_upper_arm: [-.75, 0, -.22], left_upper_arm: [-.75, 0, .22], cape_root: [.42, 0, 0],
      left_upper_leg: [.25, 0, .05], right_upper_leg: [.18, 0, -.04] }, { root: [0, .04, .28] }),
    end(1.14),
  ], skeletonInfo));
  clips.push(animationClip('skill_meteor', 1.55, [
    pose(0, { spine: [-.1, 0, 0], chest: [-.14, 0, -.04], right_upper_arm: [-.65, -.05, -.38], left_upper_arm: [-.65, .05, .38] }),
    pose(.28, { pelvis: [-.18, 0, 0], spine: [-.18, 0, 0], chest: [-.2, 0, -.08], neck: [.08, 0, 0],
      right_upper_arm: [-1.35, -.1, -.58], left_upper_arm: [-1.35, .1, .58], right_lower_arm: [-.75, 0, -.22], left_lower_arm: [-.75, 0, .22],
      cape_root: [.5, 0, 0] }, { pelvis: [0, -.06, 0] }),
    pose(.55, { pelvis: [-.32, 0, 0], spine: [-.26, 0, 0], chest: [-.26, 0, -.1],
      right_upper_arm: [-1.85, -.05, -.72], left_upper_arm: [-1.85, .05, .72], cape_root: [.75, 0, 0] }, { pelvis: [0, -.1, 0] }),
    pose(.9, { pelvis: [.08, 0, 0], spine: [.08, 0, 0], chest: [.1, 0, .04], neck: [-.05, 0, 0],
      right_upper_arm: [-2.25, .28, -.22], left_upper_arm: [-2.25, -.28, .22], cape_root: [.98, 0, 0] }, { pelvis: [0, .12, 0] }),
    pose(1.2, { pelvis: [-.1, 0, 0], spine: [-.08, 0, 0], chest: [-.08, 0, 0],
      right_upper_arm: [-.95, 1.15, -.38], left_upper_arm: [-.95, -1.15, .38], cape_root: [.8, .22, 0] }),
    pose(1.35, { right_upper_arm: [-.55, .5, -.2], left_upper_arm: [-.55, -.5, .2] }),
    end(1.55),
  ], skeletonInfo));

  clips.push(animationClip('skill_twin_fang', .74, [
    pose(0, { pelvis: [.08, -.16, 0], chest: [-.12, -.32, -.1], right_upper_arm: [-.65, -.42, -.42], right_lower_arm: [-.7, -.08, -.32],
      left_upper_arm: [-.4, .28, .4], left_lower_arm: [-1.0, .08, .22] }),
    pose(.12, { pelvis: [.04, .18, 0], spine: [-.04, .2, 0], chest: [-.05, .42, .14], neck: [-.02, .1, 0],
      right_upper_arm: [-.28, .88, .55], right_lower_arm: [-.05, 0, .48], left_upper_arm: [-.4, .15, .35], cape_root: [.4, .1, 0] }, { pelvis: [0, .015, .04] }),
    pose(.28, { pelvis: [.08, -.24, 0], spine: [-.1, -.22, 0], chest: [-.14, -.52, -.14], neck: [.05, -.08, 0],
      right_upper_arm: [-.42, -.58, -.32], left_upper_arm: [-.95, .52, .62], left_lower_arm: [-.35, 0, .42], cape_root: [.5, -.12, 0] }),
    pose(.44, { pelvis: [.04, .28, 0], spine: [-.04, .28, 0], chest: [-.05, .55, .18],
      left_upper_arm: [-.22, -.95, .5], left_lower_arm: [.05, 0, .35], right_upper_arm: [-.2, .28, -.15], cape_root: [.6, .14, 0] }, { pelvis: [0, .02, .05] }),
    pose(.58, { pelvis: [.05, .08, 0], chest: [-.08, .15, .05], right_upper_arm: [-.4, .15, -.25], left_upper_arm: [-.4, -.25, .3] }),
    end(.74),
  ], skeletonInfo));
  clips.push(animationClip('skill_fan_knives', .86, [
    pose(0, { spine: [-.08, 0, 0], chest: [-.12, 0, -.05], right_upper_arm: [-.55, -.52, -.52], left_upper_arm: [-.55, .52, .52],
      right_lower_arm: [-.75, 0, -.32], left_lower_arm: [-.75, 0, .32] }),
    pose(.16, { pelvis: [.08, -.26, 0], spine: [-.14, 0, 0], chest: [-.24, 0, -.08], neck: [.08, 0, 0],
      right_upper_arm: [-1.15, -.75, -.72], left_upper_arm: [-1.15, .75, .72], right_lower_arm: [-1.0, 0, -.52], left_lower_arm: [-1.0, 0, .52],
      cape_root: [.38, 0, 0] }, { pelvis: [0, -.02, .02] }),
    pose(.36, { pelvis: [.03, .14, 0], spine: [.04, 0, 0], chest: [.1, 0, .08], neck: [-.04, 0, 0],
      right_upper_arm: [-.32, 1.12, .7], left_upper_arm: [-.32, -1.12, .7], right_lower_arm: [.08, 0, .4], left_lower_arm: [.08, 0, -.4],
      cape_root: [.68, 0, 0] }, { pelvis: [0, .02, .06] }),
    pose(.55, { chest: [.04, 0, .03], right_upper_arm: [-.42, .45, .3], left_upper_arm: [-.42, -.45, .3] }),
    end(.86),
  ], skeletonInfo));
  clips.push(animationClip('skill_shadowstep', 1.05, [
    pose(0, { pelvis: [-.1, -.04, 0], spine: [-.1, 0, 0], chest: [-.16, 0, 0], right_upper_arm: [-.5, 0, -.32], left_upper_arm: [-.5, 0, .32] }),
    pose(.18, { pelvis: [-.4, 0, 0], spine: [-.24, 0, 0], chest: [-.32, 0, 0],
      right_upper_arm: [-.95, 0, -.52], left_upper_arm: [-.95, 0, .52], left_upper_leg: [.4, 0, .08], right_upper_leg: [.3, 0, -.06],
      cape_root: [.75, 0, 0] }, { pelvis: [0, -.14, 0] }),
    pose(.4, { pelvis: [-.48, .25, 0], spine: [-.26, .22, 0], chest: [-.35, .35, .08],
      right_upper_arm: [-.35, .55, .28], left_upper_arm: [-1.2, -.35, .28], cape_root: [1.0, .15, 0] }, { root: [0, .1, .25], pelvis: [0, -.1, 0] }),
    pose(.6, { pelvis: [-.28, .35, 0], spine: [-.14, .28, 0], chest: [-.2, .48, .1],
      right_upper_arm: [-.28, .78, .38], left_upper_arm: [-1.25, -.42, .28], cape_root: [1.08, .18, 0] }, { root: [0, .14, .38] }),
    pose(.8, { pelvis: [-.08, -.28, 0], spine: [-.08, -.12, 0], chest: [-.1, -.4, -.08],
      right_upper_arm: [-.78, -.65, -.48], left_upper_arm: [-.3, .28, .32], cape_root: [.55, -.15, 0] }, { root: [0, 0, .15] }),
    end(1.05),
  ], skeletonInfo));
  clips.push(animationClip('skill_death_lotus', 1.35, [
    pose(0, { pelvis: [.08, -.18, 0], chest: [-.14, -.42, -.12], right_upper_arm: [-.75, -.52, -.52], left_upper_arm: [-.75, .52, .52] }),
    pose(.16, { pelvis: [0, .7, 0], spine: [0, .55, 0], chest: [-.1, .9, .08], right_upper_arm: [-.45, .85, .35], left_upper_arm: [-.45, -.8, .35], cape_root: [.55, .12, 0] }),
    pose(.34, { pelvis: [0, 1.55, 0], spine: [0, 1.2, 0], chest: [-.08, 1.85, .1], neck: [0, .15, 0],
      right_upper_arm: [-.35, 1.5, .5], left_upper_arm: [-.35, -1.45, .5], cape_root: [.82, .22, 0] }, { pelvis: [0, .05, 0] }),
    pose(.55, { pelvis: [0, 3.0, 0], spine: [0, 2.25, 0], chest: [-.08, 3.4, -.08],
      right_upper_arm: [-.5, 2.85, -.48], left_upper_arm: [-.5, .25, .5], cape_root: [1.05, -.18, 0] }, { pelvis: [0, .1, 0] }),
    pose(.8, { pelvis: [0, 4.7, 0], spine: [0, 3.45, 0], chest: [-.08, 5.1, .1],
      right_upper_arm: [-.32, 4.45, .52], left_upper_arm: [-.32, 1.65, .45], cape_root: [1.2, .28, 0] }, { pelvis: [0, .04, 0] }),
    pose(1.02, { pelvis: [0, 6.2, 0], spine: [0, 4.35, 0], chest: [-.14, 6.5, -.1],
      right_upper_arm: [-.88, 5.55, -.55], left_upper_arm: [-.88, 2.95, .55], cape_root: [.9, -.22, 0] }, { pelvis: [0, -.06, 0] }),
    pose(1.18, { pelvis: [0, 2.8, 0], spine: [0, 2.0, 0], chest: [-.1, 3.0, 0], right_upper_arm: [-.5, 2.4, 0], left_upper_arm: [-.5, 1.0, .3] }),
    end(1.35),
  ], skeletonInfo));

  clips.push(animationClip('skill_pierce_shot', .96, [
    pose(0, { spine: [-.08, -.05, 0], chest: [-.12, -.08, -.04], neck: [.04, .04, 0],
      right_upper_arm: [-.95, -.32, -.48], right_lower_arm: [-.7, -.05, -.28], left_upper_arm: [-.75, .22, .4], left_lower_arm: [-.55, .08, .28],
      left_upper_leg: [.15, .08, .06], right_upper_leg: [-.08, -.08, -.08] }),
    pose(.22, { pelvis: [.05, -.2, 0], spine: [-.16, -.12, 0], chest: [-.22, -.18, -.1], neck: [.08, .06, 0], head: [.04, .05, 0],
      right_upper_arm: [-1.48, -.55, -.68], right_lower_arm: [-.95, -.08, -.4], left_upper_arm: [-1.15, .38, .48], left_lower_arm: [-.65, .1, .35],
      cape_root: [.38, -.08, 0] }, { pelvis: [0, -.02, .02] }),
    pose(.42, { pelvis: [.02, .1, 0], spine: [-.04, .18, 0], chest: [-.04, .32, .12], neck: [-.02, .08, 0],
      right_upper_arm: [-.22, .88, .55], right_lower_arm: [.08, 0, .4], left_upper_arm: [-.42, -.12, .2], left_lower_arm: [-.35, 0, .15],
      cape_root: [.52, .12, 0] }, { pelvis: [0, .015, .04] }),
    pose(.62, { chest: [-.05, .12, .04], right_upper_arm: [-.4, .4, .25], left_upper_arm: [-.45, .1, .3] }),
    end(.96),
  ], skeletonInfo));
  clips.push(animationClip('skill_trap', 1.0, [
    pose(0, { spine: [-.08, 0, 0], chest: [-.1, 0, -.03], right_upper_arm: [-.55, -.05, -.28], left_upper_arm: [-.5, .08, .28] }),
    pose(.2, { pelvis: [.05, -.2, 0], spine: [-.14, 0, 0], chest: [-.18, 0, -.06], neck: [.08, 0, 0],
      right_upper_arm: [-1.1, .22, -.32], left_upper_arm: [-.95, -.18, .32], left_upper_leg: [.3, .1, .08], right_upper_leg: [-.05, -.08, -.08],
      left_lower_leg: [.4, 0, 0], cape_root: [.4, 0, 0] }, { pelvis: [0, -.03, 0] }),
    pose(.42, { pelvis: [.02, .06, 0], spine: [.04, 0, 0], chest: [.06, 0, .04], neck: [-.03, 0, 0],
      right_upper_arm: [-.38, .68, .38], left_upper_arm: [-.32, -.5, .32], cape_root: [.55, .08, 0] }, { pelvis: [0, .015, .02] }),
    pose(.65, { chest: [.02, 0, .01], right_upper_arm: [-.42, .3, .18], left_upper_arm: [-.4, -.2, .25] }),
    end(1.0),
  ], skeletonInfo));
  clips.push(animationClip('skill_vault_shot', 1.1, [
    pose(0, { pelvis: [-.08, -.04, 0], spine: [-.1, 0, 0], chest: [-.12, 0, 0], right_upper_arm: [-.58, 0, -.32], left_upper_arm: [-.58, 0, .32] }),
    pose(.18, { pelvis: [-.35, .2, 0], spine: [-.18, .12, 0], chest: [-.2, .1, 0],
      right_upper_arm: [-.9, 0, -.48], left_upper_arm: [-.9, 0, .48], left_upper_leg: [.45, 0, .1], right_upper_leg: [.3, 0, -.08],
      cape_root: [.75, .08, 0] }, { pelvis: [0, -.1, 0] }),
    pose(.38, { pelvis: [-.35, .25, 0], spine: [-.16, .12, 0], right_upper_arm: [-1.05, 0, -.52], left_upper_arm: [-1.05, 0, .52],
      cape_root: [.88, .1, 0] }, { pelvis: [0, -.08, 0], root: [0, .08, -.08] }),
    pose(.55, { pelvis: [-.15, -.22, 0], spine: [-.08, -.1, 0], chest: [-.08, -.18, 0],
      right_upper_arm: [-.28, .68, .38], left_upper_arm: [-.85, -.28, .22], cape_root: [.68, -.1, 0] }, { root: [0, .04, -.18] }),
    pose(.75, { pelvis: [0, .08, 0], chest: [-.04, .12, .04], right_upper_arm: [-.18, .98, .52], left_upper_arm: [-.28, -.18, .2], cape_root: [.5, .08, 0] }),
    end(1.1),
  ], skeletonInfo));
  clips.push(animationClip('skill_hunter_mark', 1.2, [
    pose(0, { spine: [-.08, 0, 0], chest: [-.12, 0, -.04], right_upper_arm: [-.65, -.05, -.38], left_upper_arm: [-.65, .05, .38] }),
    pose(.24, { pelvis: [.04, -.14, 0], spine: [-.14, 0, 0], chest: [-.18, 0, -.08], neck: [.08, 0, 0],
      right_upper_arm: [-1.35, -.08, -.52], left_upper_arm: [-1.3, .08, .52], right_lower_arm: [-.85, 0, -.22], left_lower_arm: [-.85, 0, .22],
      cape_root: [.5, 0, 0] }, { pelvis: [0, -.02, 0] }),
    pose(.5, { pelvis: [.02, .08, 0], spine: [.04, 0, 0], chest: [.08, 0, .04], neck: [-.04, 0, 0], head: [-.03, 0, 0],
      right_upper_arm: [-.38, .88, .42], left_upper_arm: [-.38, -.88, .42], cape_root: [.7, .12, 0] }, { pelvis: [0, .02, .02] }),
    pose(.8, { chest: [.03, 0, .01], right_upper_arm: [-.42, .4, .22], left_upper_arm: [-.42, -.4, .22] }),
    end(1.2),
  ], skeletonInfo));

  // Per-class clip subset — keeps each hero GLB lean instead of shipping every job's kit.
  if (profileId && HERO_CLASS_CLIPS[profileId]) {
    const keep = new Set([...HERO_SHARED_CLIPS, ...HERO_CLASS_CLIPS[profileId]]);
    return clips.filter(clip => keep.has(clip.name));
  }
  return clips;
}

/** Shared hero bake profiles — add a profile + export path for each new class. */
const HERO_BAKE_PROFILES = Object.freeze({
  // Masculine plate knight — steel armor, crimson tabard, short crop, open helm.
  aerin: Object.freeze({
    name: 'Knight_Hero_Rig',
    skin: 0xd4a07a,
    cloth: 0x7a8fa3,
    leather: 0x2a303c,
    cape: 0x8b1a28,
    hair: 0x2a1f18,
    eye: 0x2a4060,
    eyeWhite: 0xfff4e8,
    brow: 0x1a1410,
    mouth: 0x6a4038,
    trim: 0xd4b05a,
    belt: 0x1c1814,
    buckle: 0xe0c878,
    outline: 0x0e1218,
    hairStyle: 'knight',
    headGear: 'helm',
    bodyStyle: 'knight',
  }),
  wizard: Object.freeze({
    name: 'Wizard_Hero_Rig',
    skin: 0xe9a87e,
    cloth: 0x3a4f9c,
    leather: 0x2a2440,
    cape: 0x24306e,
    hair: 0xe8e0f4,
    eye: 0x6b2db8,
    eyeWhite: 0xfff6df,
    brow: 0xb0a0d0,
    mouth: 0x8c4f50,
    trim: 0xd4b862,
    belt: 0x1e1840,
    buckle: 0xe0c878,
    outline: 0x121428,
    hairStyle: 'wizard',
    headGear: 'hat',
    bodyStyle: 'default',
  }),
  // Night rogue — dark leather wrap, mint eyes; hood is a runtime head kit, so keep hair a low crop.
  rogue: Object.freeze({
    name: 'Rogue_Hero_Rig',
    skin: 0xdca27e,
    cloth: 0x3c4e5a,
    leather: 0x1a222c,
    cape: 0x28323e,
    hair: 0x3aa890,
    eye: 0x2bd1b4,
    eyeWhite: 0xfdf6e8,
    brow: 0x1c3830,
    mouth: 0x7a4a44,
    trim: 0x9ad8c8,
    belt: 0x14181e,
    buckle: 0xb8e8d8,
    outline: 0x0a0e14,
    hairStyle: 'knight',
    headGear: 'none',
    bodyStyle: 'default',
  }),
  // Wildshot ranger — forest cloak, auburn crop, amber eyes; no runtime hood.
  ranger: Object.freeze({
    name: 'Ranger_Hero_Rig',
    skin: 0xd8a882,
    cloth: 0x4a6a48,
    leather: 0x3a2a1c,
    cape: 0x3a4a30,
    hair: 0x8a4028,
    eye: 0xe8b040,
    eyeWhite: 0xfff6e8,
    brow: 0x5a2818,
    mouth: 0x7a4a44,
    trim: 0xc8b070,
    belt: 0x241810,
    buckle: 0xd4b862,
    outline: 0x101810,
    hairStyle: 'knight',
    headGear: 'none',
    bodyStyle: 'default',
  }),
});

function heroHairParts(style) {
  if (style === 'wizard') {
    return [
      p => sdfEllipsoid(p, V3(0, .08, -.02), V3(.5, .42, .42)),
      p => sdfEllipsoid(p, V3(0, .2, -.28), V3(.38, .4, .22)),
      p => sdfCapsule(p, V3(.28, .1, -.08), V3(.34, -.55, -.18), .16, .08),
      p => sdfCapsule(p, V3(-.28, .1, -.08), V3(-.34, -.55, -.18), .16, .08),
      p => sdfCapsule(p, V3(0, .05, -.3), V3(0, -.62, -.36), .2, .1),
      p => sdfEllipsoid(p, V3(.14, .22, .22), V3(.24, .14, .16)),
      p => sdfEllipsoid(p, V3(-.14, .22, .22), V3(.24, .14, .16)),
      p => sdfEllipsoid(p, V3(0, .02, .28), V3(.22, .1, .12)),
    ];
  }
  if (style === 'knight') {
    // Short military crop — dense, low profile, masculine.
    return [
      p => sdfEllipsoid(p, V3(0, .12, -.06), V3(.48, .28, .42)),
      p => sdfEllipsoid(p, V3(0, .06, -.22), V3(.4, .22, .28)),
      p => sdfEllipsoid(p, V3(.16, .08, .08), V3(.18, .14, .2)),
      p => sdfEllipsoid(p, V3(-.16, .08, .08), V3(.18, .14, .2)),
      p => sdfCapsule(p, V3(0, .02, -.28), V3(0, -.12, -.32), .14, .08),
    ];
  }
  return [
    p => sdfEllipsoid(p, V3(0, .09, -.04), V3(.53, .48, .43)),
    p => sdfEllipsoid(p, V3(0, .16, -.34), V3(.42, .46, .24)),
    p => sdfCapsule(p, V3(.34, .12, -.12), V3(.27, -.40, -.28), .20, .11),
    p => sdfCapsule(p, V3(-.34, .12, -.12), V3(-.27, -.40, -.28), .20, .11),
    p => sdfCapsule(p, V3(0, .08, -.34), V3(0, -.48, -.40), .24, .13),
    p => sdfEllipsoid(p, V3(.18, .25, .18), V3(.28, .18, .20)),
    p => sdfEllipsoid(p, V3(-.16, .28, .20), V3(.31, .17, .20)),
  ];
}

function attachWizardHat(headBone, profile) {
  const hatRoot = new THREE.Group();
  hatRoot.name = 'wizard_hat';
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(.70, .76, .06, 28),
    material('hero_cloth', profile.cloth, .86, 0),
  );
  brim.name = 'wizard_hat_brim';
  brim.position.set(0, .30, -.02);
  brim.castShadow = true;
  hatRoot.add(brim);
  // Wide cone fully encloses the skull — no scalp peeking between brim and point.
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(.62, 1.05, 26),
    material('hero_cloth', profile.cloth, .84, 0),
  );
  cone.name = 'wizard_hat_cone';
  cone.position.set(0, .78, -.03);
  cone.rotation.x = -.09;
  cone.castShadow = true;
  hatRoot.add(cone);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(.075, 12, 10),
    material('hero_trim', profile.trim, .4, .7),
  );
  tip.name = 'wizard_hat_tip';
  tip.position.set(0, 1.33, -.14);
  hatRoot.add(tip);
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(.56, .045, 8, 28),
    material('hero_trim', profile.trim, .42, .72),
  );
  band.name = 'wizard_hat_band';
  band.rotation.x = Math.PI / 2;
  band.position.set(0, .37, -.02);
  hatRoot.add(band);
  const buckleDetail = new THREE.Mesh(new RoundedBoxGeometry(.11, .11, .04, 2, .02), material('hero_buckle', profile.buckle, .35, .85));
  buckleDetail.name = 'wizard_hat_buckle';
  buckleDetail.position.set(0, .37, .58);
  hatRoot.add(buckleDetail);
  hatRoot.position.set(0, .02, 0);
  headBone.add(hatRoot);
  return hatRoot;
}

/** Open-faced great helm + crest for a bold knight silhouette. */
function attachKnightHelm(headBone, profile) {
  const root = new THREE.Group();
  root.name = 'knight_helm';
  const steel = material('hero_cloth', profile.cloth, .38, .72);
  const dark = material('hero_leather', profile.leather, .55, .45);
  const gold = material('hero_trim', profile.trim, .4, .8);
  const plumeMat = material('hero_cape', profile.cape, .85, 0);

  // Enclosing dome with a front face window (phi sweep skips the face arc).
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.53, 26, 18, 2.35, 4.58, 0, Math.PI * .60), steel);
  dome.name = 'knight_helm_dome';
  dome.position.set(0, .24, 0);
  dome.scale.set(1.02, 1.10, 1.04);
  dome.castShadow = true;
  root.add(dome);

  // Skull cap closes the top of the face window.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.53, 26, 10, 0, Math.PI * 2, 0, Math.PI * .30), steel);
  cap.name = 'knight_helm_cap';
  cap.position.set(0, .24, 0);
  cap.scale.set(1.02, 1.10, 1.04);
  cap.castShadow = true;
  root.add(cap);

  const brow = new THREE.Mesh(new RoundedBoxGeometry(.68, .13, .12, 2, .03), dark);
  brow.name = 'knight_helm_brow';
  brow.position.set(0, .33, .40);
  root.add(brow);

  const neckGuard = new THREE.Mesh(new RoundedBoxGeometry(.52, .18, .22, 2, .05), steel);
  neckGuard.name = 'knight_helm_neck';
  neckGuard.position.set(0, -.26, -.34);
  neckGuard.rotation.x = -.3;
  root.add(neckGuard);

  const crest = new THREE.Mesh(new THREE.BoxGeometry(.06, .22, .55), gold);
  crest.name = 'knight_helm_crest';
  crest.position.set(0, .78, -.04);
  root.add(crest);

  const plume = new THREE.Mesh(new THREE.ConeGeometry(.12, .7, 8), plumeMat);
  plume.name = 'knight_helm_plume';
  plume.position.set(0, 1.08, -.18);
  plume.rotation.x = .35;
  plume.castShadow = true;
  root.add(plume);
  const plumeTip = new THREE.Mesh(new THREE.SphereGeometry(.08, 10, 8), plumeMat);
  plumeTip.name = 'knight_helm_plume_tip';
  plumeTip.position.set(0, 1.40, -.30);
  root.add(plumeTip);

  root.position.set(0, .02, 0);
  headBone.add(root);
  return root;
}

/** Pauldrons, breastplate, greave bands — knight bulk on shared skeleton. */
function attachKnightArmor(skeletonInfo, profile) {
  const steel = material('hero_cloth', profile.cloth, .36, .75);
  const dark = material('hero_leather', profile.leather, .55, .4);
  const gold = material('hero_trim', profile.trim, .38, .82);
  const chest = skeletonInfo.bones.get('chest');
  const pelvis = skeletonInfo.bones.get('pelvis');

  const breast = new THREE.Mesh(new RoundedBoxGeometry(.72, .7, .28, 3, .06), steel);
  breast.name = 'knight_breastplate';
  breast.position.set(0, .08, .16);
  breast.castShadow = true;
  chest.add(breast);

  const ridge = new THREE.Mesh(new RoundedBoxGeometry(.12, .55, .08, 2, .02), gold);
  ridge.position.set(0, .1, .32);
  chest.add(ridge);

  for (const side of [-1, 1]) {
    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(.28, 14, 12, 0, Math.PI * 2, 0, Math.PI * .72), steel);
    pauldron.name = side > 0 ? 'knight_pauldron_L' : 'knight_pauldron_R';
    pauldron.position.set(side * .52, .28, 0);
    pauldron.scale.set(1.15, .85, 1.05);
    pauldron.castShadow = true;
    chest.add(pauldron);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(.08, .22, 6), dark);
    spike.position.set(side * .62, .42, 0);
    spike.rotation.z = side * -.7;
    chest.add(spike);
  }

  const gorget = new THREE.Mesh(new THREE.TorusGeometry(.32, .07, 8, 20), steel);
  gorget.rotation.x = Math.PI / 2;
  gorget.position.set(0, .32, .04);
  chest.add(gorget);

  const fauld = new THREE.Mesh(new THREE.CylinderGeometry(.38, .48, .28, 12, 1, true), dark);
  fauld.position.set(0, -.08, 0);
  pelvis.add(fauld);

  const tabard = new THREE.Mesh(new RoundedBoxGeometry(.42, .55, .06, 2, .02), material('hero_cape', profile.cape, .88, 0));
  tabard.position.set(0, -.05, .22);
  pelvis.add(tabard);

  const crossV = new THREE.Mesh(new THREE.BoxGeometry(.06, .28, .04), gold);
  crossV.position.set(0, .02, .26);
  pelvis.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(.2, .06, .04), gold);
  crossH.position.set(0, .02, .26);
  pelvis.add(crossH);

  // Limb plate — couters, gauntlet cuffs, poleyns, greaves, sabaton caps, backplate, hip scabbard.
  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? 1 : -1;
    const lowerArm = skeletonInfo.bones.get(`${side}_lower_arm`);
    const couter = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 10, 0, Math.PI * 2, 0, Math.PI * .7), steel);
    couter.name = `knight_couter_${side}`;
    couter.position.set(0, .03, 0);
    couter.castShadow = true;
    lowerArm.add(couter);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.165, .19, .16, 12, 1, true), steel);
    cuff.name = `knight_gauntlet_${side}`;
    cuff.position.set(sign * .04, -.28, .02);
    cuff.rotation.z = -sign * .19;
    lowerArm.add(cuff);
    const lowerLeg = skeletonInfo.bones.get(`${side}_lower_leg`);
    const poleyn = new THREE.Mesh(new THREE.SphereGeometry(.15, 12, 10, 0, Math.PI * 2, 0, Math.PI * .68), steel);
    poleyn.name = `knight_poleyn_${side}`;
    poleyn.position.set(0, .02, .07);
    poleyn.rotation.x = Math.PI * .42;
    lowerLeg.add(poleyn);
    const greave = new THREE.Mesh(new THREE.CylinderGeometry(.175, .20, .34, 12, 1, true), steel);
    greave.name = `knight_greave_${side}`;
    greave.position.set(0, -.22, .04);
    greave.castShadow = true;
    lowerLeg.add(greave);
    const foot = skeletonInfo.bones.get(`${side}_foot`);
    const sabaton = new THREE.Mesh(new RoundedBoxGeometry(.32, .17, .26, 2, .05), steel);
    sabaton.name = `knight_sabaton_${side}`;
    sabaton.position.set(0, .05, .18);
    foot.add(sabaton);
  }
  const backplate = new THREE.Mesh(new RoundedBoxGeometry(.62, .58, .16, 3, .05), steel);
  backplate.name = 'knight_backplate';
  backplate.position.set(0, .06, -.22);
  backplate.castShadow = true;
  chest.add(backplate);
  const scabbard = new THREE.Mesh(new RoundedBoxGeometry(.08, .82, .13, 2, .03), dark);
  scabbard.name = 'knight_scabbard';
  scabbard.position.set(.30, -.48, -.08);
  scabbard.rotation.set(.10, 0, .16);
  scabbard.castShadow = true;
  pelvis.add(scabbard);
  const scabbardTip = new THREE.Mesh(new THREE.ConeGeometry(.055, .14, 8), gold);
  scabbardTip.name = 'knight_scabbard_tip';
  scabbardTip.position.set(.38, -.90, -.13);
  scabbardTip.rotation.set(.10 + Math.PI, 0, .16);
  pelvis.add(scabbardTip);
  const scabbardThroat = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .07, 10), gold);
  scabbardThroat.name = 'knight_scabbard_throat';
  scabbardThroat.position.set(.235, -.10, -.045);
  scabbardThroat.rotation.set(.10, 0, .16);
  pelvis.add(scabbardThroat);
}

/** Cloth-class fit — bracers, wrist trim, boot cuffs, toe caps, diagonal chest strap. */
function attachAdventurerGear(skeletonInfo, profile) {
  const leather = material('hero_leather', profile.leather, .62, .05);
  const trim = material('hero_trim', profile.trim, .42, .7);
  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? 1 : -1;
    const lowerArm = skeletonInfo.bones.get(`${side}_lower_arm`);
    const bracer = new THREE.Mesh(new THREE.CylinderGeometry(.155, .175, .30, 12, 1, true), leather);
    bracer.name = `hero_leather_bracer_${side}`;
    bracer.position.set(sign * .04, -.20, .02);
    bracer.rotation.z = -sign * .19;
    bracer.castShadow = true;
    lowerArm.add(bracer);
    const wristRing = new THREE.Mesh(new THREE.TorusGeometry(.155, .022, 8, 20), trim);
    wristRing.name = `hero_trim_wrist_${side}`;
    wristRing.rotation.x = Math.PI / 2;
    wristRing.rotation.z = -sign * .19;
    wristRing.position.set(sign * .06, -.33, .025);
    lowerArm.add(wristRing);
    const lowerLeg = skeletonInfo.bones.get(`${side}_lower_leg`);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(.185, .05, 8, 22), leather);
    cuff.name = `hero_leather_cuff_${side}`;
    cuff.rotation.x = Math.PI / 2;
    cuff.position.set(0, -.14, .04);
    lowerLeg.add(cuff);
    const foot = skeletonInfo.bones.get(`${side}_foot`);
    const toeCap = new THREE.Mesh(new RoundedBoxGeometry(.28, .15, .24, 2, .05), leather);
    toeCap.name = `hero_leather_toecap_${side}`;
    toeCap.position.set(0, .06, .20);
    foot.add(toeCap);
  }
  const chest = skeletonInfo.bones.get('chest');
  // Bandolier: ring plane holds the vertical axis, normal tilted sideways; parent squashes depth to hug the torso.
  const strapGroup = new THREE.Group();
  strapGroup.name = 'hero_strap_group';
  strapGroup.position.set(0, -.02, .01);
  strapGroup.scale.set(1, 1, .58);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(.62, .05, 8, 36), leather);
  strap.name = 'hero_leather_strap';
  strap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(.86, .51, 0).normalize());
  strapGroup.add(strap);
  chest.add(strapGroup);
  const strapBuckle = new THREE.Mesh(new RoundedBoxGeometry(.10, .10, .045, 2, .02), trim);
  strapBuckle.name = 'hero_buckle_strap';
  strapBuckle.position.set(-.15, .14, .335);
  strapBuckle.rotation.z = .55;
  chest.add(strapBuckle);
}

/** Rogue kit — throwing knives on the strap, thigh sheath, shoulder pad, forearm wraps. */
function attachRogueKit(skeletonInfo, profile) {
  const chest = skeletonInfo.bones.get('chest');
  const knifeMat = material('hero_trim_knife', profile.trim, .35, .8);
  for (let i = 0; i < 3; i += 1) {
    const knife = new THREE.Mesh(new THREE.ConeGeometry(.036, .20, 6), knifeMat);
    knife.name = `rogue_knife_${i}`;
    knife.position.set(.10 - i * .10, .16 - i * .17, .41 - Math.abs(1 - i) * .01);
    knife.rotation.set(Math.PI, 0, .53);
    chest.add(knife);
  }
  const pad = new THREE.Mesh(new THREE.SphereGeometry(.22, 14, 10, 0, Math.PI * 2, 0, Math.PI * .66), material('hero_leather', profile.leather, .6, .05));
  pad.name = 'rogue_shoulder_pad';
  pad.position.set(.46, .22, 0);
  pad.scale.set(1.15, .72, 1.0);
  pad.rotation.z = -.28;
  pad.castShadow = true;
  chest.add(pad);
  const leg = skeletonInfo.bones.get('left_upper_leg');
  const sheath = new THREE.Mesh(new RoundedBoxGeometry(.10, .26, .10, 2, .03), material('hero_leather', profile.leather, .6, .05));
  sheath.name = 'rogue_thigh_sheath';
  sheath.position.set(.12, -.24, .14);
  sheath.rotation.z = .08;
  leg.add(sheath);
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .12, 8), knifeMat);
  hilt.name = 'rogue_sheath_hilt';
  hilt.position.set(.12, -.08, .14);
  leg.add(hilt);
  const wrapMat = material('hero_cloth', profile.cloth, .88, 0);
  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? 1 : -1;
    const lowerArm = skeletonInfo.bones.get(`${side}_lower_arm`);
    for (let i = 0; i < 2; i += 1) {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(.165 - i * .012, .028, 8, 18), wrapMat);
      wrap.name = `rogue_wrap_${side}_${i}`;
      wrap.rotation.set(Math.PI / 2, 0, -sign * .19);
      wrap.position.set(sign * (.02 + i * .02), -.10 - i * .13, .02);
      lowerArm.add(wrap);
    }
  }
}

/** Ranger kit — back quiver with fletched arrows, cloak clasp, reinforced bow bracer. */
function attachRangerKit(skeletonInfo, profile) {
  const chest = skeletonInfo.bones.get('chest');
  const leather = material('hero_leather', profile.leather, .62, .05);
  const trim = material('hero_trim', profile.trim, .42, .7);
  const quiver = new THREE.Group();
  quiver.name = 'ranger_quiver';
  quiver.position.set(-.30, .14, -.44);
  quiver.rotation.set(.24, 0, -.42);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(.105, .09, .58, 12), leather);
  tube.name = 'ranger_quiver_tube';
  tube.castShadow = true;
  quiver.add(tube);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.105, .018, 8, 18), trim);
  rim.name = 'ranger_quiver_rim';
  rim.rotation.x = Math.PI / 2;
  rim.position.y = .29;
  quiver.add(rim);
  const shaftMat = material('hero_hair_arrow', profile.hair, .8, 0);
  const fletchMat = material('hero_eye_fletch', profile.eye, .8, 0);
  for (let i = 0; i < 4; i += 1) {
    const angle = i / 4 * Math.PI * 2 + .4;
    const ox = Math.cos(angle) * .05;
    const oz = Math.sin(angle) * .05;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .42, 6), shaftMat);
    shaft.name = `ranger_arrow_${i}`;
    shaft.position.set(ox, .44, oz);
    quiver.add(shaft);
    const fletch = new THREE.Mesh(new THREE.ConeGeometry(.05, .14, 5), fletchMat);
    fletch.name = `ranger_fletch_${i}`;
    fletch.position.set(ox, .63, oz);
    quiver.add(fletch);
  }
  chest.add(quiver);
  const clasp = new THREE.Mesh(new RoundedBoxGeometry(.12, .12, .05, 2, .03), trim);
  clasp.name = 'ranger_cloak_clasp';
  clasp.position.set(0, .30, .28);
  clasp.rotation.z = Math.PI / 4;
  chest.add(clasp);
  const lowerArm = skeletonInfo.bones.get('left_lower_arm');
  const bowBracer = new THREE.Mesh(new THREE.CylinderGeometry(.17, .19, .22, 12, 1, true), leather);
  bowBracer.name = 'ranger_bow_bracer';
  bowBracer.position.set(.05, -.26, .02);
  bowBracer.rotation.z = -.19;
  lowerArm.add(bowBracer);
  const bracerStud = new THREE.Mesh(new THREE.TorusGeometry(.175, .02, 8, 18), trim);
  bracerStud.name = 'ranger_bracer_stud';
  bracerStud.rotation.set(Math.PI / 2, 0, -.19);
  bracerStud.position.set(.055, -.30, .02);
  lowerArm.add(bracerStud);
}

/** Wizard kit — shoulder mantle, belt tome, vial, off-hand rune ring. */
function attachWizardKit(skeletonInfo, profile) {
  const chest = skeletonInfo.bones.get('chest');
  const pelvis = skeletonInfo.bones.get('pelvis');
  const clothMat = material('hero_cloth', profile.cloth, .86, 0);
  const trim = material('hero_trim', profile.trim, .42, .7);
  for (const sign of [-1, 1]) {
    const mantle = new THREE.Mesh(new THREE.SphereGeometry(.26, 14, 10, 0, Math.PI * 2, 0, Math.PI * .6), clothMat);
    mantle.name = sign > 0 ? 'wizard_mantle_L' : 'wizard_mantle_R';
    mantle.position.set(sign * .48, .28, 0);
    mantle.scale.set(1.12, .74, 1.05);
    mantle.castShadow = true;
    chest.add(mantle);
    const mantleTrim = new THREE.Mesh(new THREE.TorusGeometry(.25, .02, 8, 20), trim);
    mantleTrim.name = sign > 0 ? 'wizard_mantle_trim_L' : 'wizard_mantle_trim_R';
    mantleTrim.rotation.x = Math.PI / 2;
    mantleTrim.position.set(sign * .48, .22, 0);
    mantleTrim.scale.set(1.12, 1.05, 1);
    chest.add(mantleTrim);
  }
  const tome = new THREE.Mesh(new RoundedBoxGeometry(.20, .26, .08, 2, .02), material('hero_leather_tome', profile.leather, .6, .05));
  tome.name = 'wizard_tome';
  tome.position.set(.34, -.16, .10);
  tome.rotation.y = .3;
  tome.castShadow = true;
  pelvis.add(tome);
  const tomeClasp = new THREE.Mesh(new THREE.BoxGeometry(.05, .10, .10), trim);
  tomeClasp.name = 'wizard_tome_clasp';
  tomeClasp.position.set(.38, -.16, .13);
  tomeClasp.rotation.y = .3;
  pelvis.add(tomeClasp);
  const vial = new THREE.Mesh(new THREE.CylinderGeometry(.035, .045, .11, 8), material('hero_eye_vial', profile.eye, .25, 0, profile.eye, .5));
  vial.name = 'wizard_vial';
  vial.position.set(-.30, -.18, .18);
  pelvis.add(vial);
  const vialCap = new THREE.Mesh(new THREE.SphereGeometry(.028, 8, 8), trim);
  vialCap.name = 'wizard_vial_cap';
  vialCap.position.set(-.30, -.11, .18);
  pelvis.add(vialCap);
  const runeRing = new THREE.Mesh(new THREE.TorusGeometry(.12, .016, 8, 20), material('hero_trim_rune', profile.trim, .35, .8, profile.eye, .35));
  runeRing.name = 'wizard_rune_ring';
  runeRing.rotation.x = Math.PI / 2;
  runeRing.position.set(-.02, -.36, .03);
  skeletonInfo.bones.get('left_lower_arm').add(runeRing);
}

function createHero(resolution = 52, profileId = 'aerin') {
  const profile = HERO_BAKE_PROFILES[profileId] ?? HERO_BAKE_PROFILES.aerin;
  const group = new THREE.Group();
  group.name = profile.name;
  group.userData.assetType = 'hero';
  group.userData.heroClass = profileId;
  group.userData.modelHeight = 3.28;
  const skeletonInfo = heroSkeleton();
  group.add(skeletonInfo.rootBone);
  group.updateMatrixWorld(true);

  const body = heroBodyGeometry(resolution);
  const { rules, selector } = heroSkinRules(skeletonInfo);
  applySkinWeights(body, skeletonInfo, rules, selector);
  const isKnight = profile.bodyStyle === 'knight';
  const classify = p => {
    const hands = Math.abs(p.x) > .58 && p.y > .93 && p.y < 1.43;
    const face = p.y > 2.34;
    const boots = p.y < .66;
    const gloves = Math.abs(p.x) > .54 && p.y < 1.58;
    const belt = p.y > 1.18 && p.y < 1.37 && Math.abs(p.x) < .52;
    // Knight: armor reads on torso/legs; only face + hands stay skin.
    if (isKnight) {
      if (face || hands) return 0;
      if (boots || gloves || belt || p.y < 1.5) return 2;
      return 1;
    }
    if (face || hands) return 0;
    if (boots || gloves || belt) return 2;
    return 1;
  };
  const mats = [
    material('hero_skin', profile.skin, .72, 0),
    material('hero_cloth', profile.cloth, isKnight ? .38 : .84, isKnight ? .72 : 0),
    material('hero_leather', profile.leather, isKnight ? .48 : .62, isKnight ? .35 : 0),
  ];
  for (let i = 0; i < 3; i += 1) {
    const geometry = subsetGeometry(body, classify, i);
    if (geometry.getAttribute('position').count === 0) continue;
    group.add(makeSkinnedMesh(weld(geometry), mats[i], skeletonInfo.skeleton, `hero_body_${i}`));
  }
  const outlineMat = new THREE.MeshBasicMaterial({ name: 'outline_proxy', color: profile.outline, transparent: true, opacity: .001, depthWrite: false, side: THREE.BackSide });
  const outline = makeSkinnedMesh(weld(body.clone()), outlineMat, skeletonInfo.skeleton, 'hero_outline_proxy');
  outline.userData.outlineProxy = true;
  group.add(outline);

  const cape = makeSkinnedMesh(createCapeGeometry(skeletonInfo), material('hero_cape', profile.cape, .9, 0), skeletonInfo.skeleton, 'hero_cape');
  group.add(cape);

  const headBone = skeletonInfo.bones.get('head');
  const eyeMat = material('hero_eye', profile.eye, .35, 0, profile.eye, profileId === 'wizard' ? .25 : 0);
  const eyeWhite = material('hero_eye_white', profile.eyeWhite, .45, 0);
  const eyeGeo = new THREE.CircleGeometry(isKnight ? .09 : .105, 24);
  addSurfaceDetail(group, headBone, 'eye_white_L', eyeGeo, eyeWhite, [.185, .10, .425], [0, 0, 0], [1.12, 1.35, 1]);
  addSurfaceDetail(group, headBone, 'eye_white_R', eyeGeo, eyeWhite, [-.185, .10, .425], [0, 0, 0], [1.12, 1.35, 1]);
  addSurfaceDetail(group, headBone, 'eye_L', eyeGeo, eyeMat, [.185, .10, .437], [0, 0, 0], [.5, .72, 1]);
  addSurfaceDetail(group, headBone, 'eye_R', eyeGeo, eyeMat, [-.185, .10, .437], [0, 0, 0], [.5, .72, 1]);
  // Catch-light glints sell the eyes at close-camera range.
  const glintMat = material('hero_eye_white_glint', 0xffffff, .2, 0);
  const glintGeo = new THREE.CircleGeometry(.026, 10);
  addSurfaceDetail(group, headBone, 'eye_glint_L', glintGeo, glintMat, [.212, .135, .448]);
  addSurfaceDetail(group, headBone, 'eye_glint_R', glintGeo, glintMat, [-.158, .135, .448]);
  const browGeo = new THREE.BoxGeometry(isKnight ? .16 : .18, isKnight ? .035 : .025, .018);
  const browL = addSurfaceDetail(group, headBone, 'brow_L', browGeo, material('hero_brow', profile.brow, .9, 0), [.185, .245, .44], [0, 0, isKnight ? -.2 : -.12]);
  const browR = addSurfaceDetail(group, headBone, 'brow_R', browGeo, browL.material, [-.185, .245, .44], [0, 0, isKnight ? .2 : .12]);
  void browR;
  const mouthCurve = new THREE.QuadraticBezierCurve3(V3(-.11, -.06, .447), V3(0, isKnight ? -.08 : -.11, .457), V3(.11, -.06, .447));
  addSurfaceDetail(group, headBone, 'mouth', new THREE.TubeGeometry(mouthCurve, 12, .012, 5, false), material('hero_mouth', profile.mouth, .72, 0), [0, 0, 0]);

  const hairParts = heroHairParts(profile.hairStyle);
  const hairGeometry = weld(implicitGeometry(p => unionSdf(hairParts, p, .08), { min: V3(-.65, -.72, -.62), max: V3(.65, .68, .48) }, Math.max(34, resolution - 10), 90000));
  const hair = new THREE.Mesh(hairGeometry, material('hero_hair', profile.hair, .55, 0));
  hair.name = 'hero_hair_silhouette';
  hair.castShadow = true;
  hair.receiveShadow = true;
  skeletonInfo.bones.get('hair_root').add(hair);

  if (profile.headGear === 'hat') attachWizardHat(headBone, profile);
  if (profile.headGear === 'helm') attachKnightHelm(headBone, profile);

  if (isKnight) {
    attachKnightArmor(skeletonInfo, profile);
  } else {
    attachAdventurerGear(skeletonInfo, profile);
    if (profileId === 'rogue') attachRogueKit(skeletonInfo, profile);
    if (profileId === 'ranger') attachRangerKit(skeletonInfo, profile);
    if (profileId === 'wizard') attachWizardKit(skeletonInfo, profile);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(.39, .055, 8, 36), material('hero_trim', profile.trim, .42, .72));
    collar.name = 'hero_collar';
    collar.rotation.x = Math.PI / 2;
    collar.scale.z = .72;
    collar.position.set(0, .27, .015);
    skeletonInfo.bones.get('chest').add(collar);
  }
  const belt = new THREE.Mesh(new THREE.TorusGeometry(.375, .055, 8, 40), material('hero_belt', profile.belt, .7, .05));
  belt.name = 'hero_belt';
  belt.rotation.x = Math.PI / 2;
  belt.scale.z = .64;
  belt.position.set(0, -.17, .02);
  skeletonInfo.bones.get('pelvis').add(belt);
  const buckle = new THREE.Mesh(new RoundedBoxGeometry(.16, .14, .06, 3, .035), material('hero_buckle', profile.buckle, .35, .85));
  buckle.name = 'hero_buckle';
  buckle.position.set(0, -.17, .265);
  skeletonInfo.bones.get('pelvis').add(buckle);

  if (profileId === 'wizard') {
    // Soft robe flare on lower body via leather-role sash trim.
    const sash = new THREE.Mesh(new THREE.TorusGeometry(.41, .04, 8, 36), material('hero_trim', profile.trim, .5, .55));
    sash.name = 'wizard_sash';
    sash.rotation.x = Math.PI / 2;
    sash.scale.set(1, 1, .68);
    sash.position.set(0, -.05, .02);
    skeletonInfo.bones.get('pelvis').add(sash);
  }

  const socket = skeletonInfo.bones.get('weapon_socket');
  socket.userData.socket = 'weapon';
  const animations = heroAnimations(skeletonInfo, profileId);
  group.userData.animationMap = Object.fromEntries(animations.map(clip => [clip.name, clip.name]));
  return { group, animations };
}

function bladeShape(kind, length, width) {
  const shape = new THREE.Shape();
  const base = .16;
  const points = {
    sword: [[-base, 0], [-width, length * .22], [-width * .76, length * .83], [0, length], [width * .76, length * .83], [width, length * .22], [base, 0]],
    saber: [[-.11, 0], [-width * .8, length * .22], [-width * .65, length * .78], [-width * .12, length], [width * .48, length * .82], [width * .62, length * .22], [.11, 0]],
    greatsword: [[-.22, 0], [-width, length * .14], [-width * .92, length * .77], [0, length], [width * .92, length * .77], [width, length * .14], [.22, 0]],
    leaf: [[-.12, 0], [-width * .42, length * .18], [-width, length * .55], [-width * .42, length * .84], [0, length], [width * .42, length * .84], [width, length * .55], [width * .42, length * .18], [.12, 0]],
    katana: [[-.07, 0], [-width * .5, length * .18], [-width * .4, length * .86], [-width * .12, length], [width * .32, length * .9], [width * .42, length * .18], [.07, 0]],
    dagger: [[-.09, 0], [-width, length * .16], [-width * .68, length * .52], [-width * .3, length * .84], [0, length], [width * .55, length * .7], [width * .8, length * .3], [.09, 0]],
    relic: [[-.16, 0], [-width * .72, length * .2], [-width, length * .62], [-width * .36, length * .82], [0, length], [width * .36, length * .82], [width, length * .62], [width * .72, length * .2], [.16, 0]],
  }[kind] ?? [];
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return shape;
}

function createWeapon(kind) {
  if (kind === 'staff') return createStaff();
  if (kind === 'bow') return createBow();
  const specs = {
    sword: { length: 1.55, width: .18 },
    saber: { length: 1.62, width: .18 },
    greatsword: { length: 1.78, width: .28 },
    leaf: { length: 1.58, width: .24 },
    katana: { length: 1.72, width: .14 },
    relic: { length: 1.76, width: .25 },
    dagger: { length: .98, width: .15 },
  }[kind];
  const group = new THREE.Group();
  group.name = `weapon_${kind}`;
  group.userData.weaponKind = kind;
  const bladeMat = material('weapon_metal', kind === 'relic' ? 0xb9cae6 : 0xcbd8dc, .28, .78);
  const gripMat = material('weapon_grip', 0x3c2c28, .8, .05);
  const trimMat = material('weapon_trim', 0xc99d4d, .35, .82);
  const runeMat = material('weapon_rune', 0x6fc8ff, .24, .2, 0x4faeff, .75);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape(kind, specs.length, specs.width), {
    depth: kind === 'greatsword' ? .12 : .075,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: kind === 'greatsword' ? .045 : .028,
    bevelThickness: .024,
    curveSegments: 16,
  });
  bladeGeo.center();
  bladeGeo.translate(0, specs.length * .5 + .22, 0);
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.name = 'blade_mesh';
  blade.castShadow = true;
  blade.receiveShadow = true;
  group.add(blade);
  const guardCurve = new THREE.CatmullRomCurve3([V3(-.42, .16, 0), V3(-.18, .22, .02), V3(0, .19, 0), V3(.18, .22, -.02), V3(.42, .16, 0)]);
  const guard = new THREE.Mesh(new THREE.TubeGeometry(guardCurve, 24, .055, 8, false), trimMat);
  guard.name = 'weapon_guard';
  guard.castShadow = true;
  group.add(guard);
  const handleCurve = new THREE.LineCurve3(V3(0, .12, 0), V3(0, -.42, 0));
  const handle = new THREE.Mesh(new THREE.TubeGeometry(handleCurve, 10, .075, 10, false), gripMat);
  handle.name = 'weapon_grip';
  handle.castShadow = true;
  group.add(handle);
  const pommel = new THREE.Mesh(new RoundedBoxGeometry(.16, .16, .12, 3, .045), trimMat);
  pommel.name = 'weapon_pommel';
  pommel.position.set(0, -.48, 0);
  pommel.rotation.z = Math.PI / 4;
  group.add(pommel);
  const runeShape = new THREE.Shape();
  runeShape.moveTo(-.018, .40); runeShape.lineTo(.018, .40); runeShape.lineTo(.035, specs.length * .67); runeShape.lineTo(0, specs.length * .78); runeShape.lineTo(-.035, specs.length * .67); runeShape.closePath();
  const rune = new THREE.Mesh(new THREE.ShapeGeometry(runeShape, 12), runeMat);
  rune.name = 'weapon_rune';
  rune.position.z = .07;
  group.add(rune);
  // Detail pass — fuller groove, leather grip wraps, guard caps, pommel gem.
  const fullerDepth = kind === 'greatsword' ? .092 : .066;
  for (const side of [-1, 1]) {
    const fuller = new THREE.Mesh(new THREE.BoxGeometry(.022, specs.length * .52, .012), gripMat);
    fuller.name = `weapon_fuller_${side}`;
    fuller.position.set(0, specs.length * .48 + .22, side * fullerDepth);
    group.add(fuller);
  }
  for (let i = 0; i < 3; i += 1) {
    const wrapRing = new THREE.Mesh(new THREE.TorusGeometry(.078, .013, 6, 14), trimMat);
    wrapRing.name = `weapon_trim_wrap_${i}`;
    wrapRing.rotation.x = Math.PI / 2;
    wrapRing.position.set(0, .02 - i * .13, 0);
    group.add(wrapRing);
  }
  for (const side of [-1, 1]) {
    const guardCap = new THREE.Mesh(new THREE.SphereGeometry(.062, 10, 8), trimMat);
    guardCap.name = `weapon_guard_cap_${side}`;
    guardCap.position.set(side * .42, .16, 0);
    group.add(guardCap);
  }
  const pommelGem = new THREE.Mesh(new THREE.OctahedronGeometry(.055, 0), runeMat);
  pommelGem.name = 'weapon_rune_pommel';
  pommelGem.position.set(0, -.48, .085);
  group.add(pommelGem);
  const base = new THREE.Object3D();
  base.name = 'blade_base';
  base.position.set(0, .24, 0);
  const tip = new THREE.Object3D();
  tip.name = 'blade_tip';
  tip.position.set(0, specs.length + .23, 0);
  group.add(base, tip);
  group.rotation.set(0, 0, -.08);
  return group;
}

function createBow() {
  const group = new THREE.Group();
  group.name = 'weapon_bow';
  group.userData.weaponKind = 'bow';
  const wood = material('weapon_grip', 0x6a4a28, .82, .06);
  const dark = material('weapon_metal', 0x3a2a18, .55, .25);
  const stringMat = material('weapon_trim', 0xe8dcc0, .4, .15);
  // Recurve limbs as a thin torus segment + grip
  const limb = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.045, 8, 28, Math.PI * 1.15), wood);
  limb.name = 'blade_mesh';
  limb.rotation.z = Math.PI / 2;
  limb.rotation.y = Math.PI / 2;
  limb.position.set(0, 0.85, 0);
  limb.castShadow = true;
  group.add(limb);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.28, 10), dark);
  grip.name = 'weapon_grip';
  grip.position.y = 0.85;
  grip.castShadow = true;
  group.add(grip);
  // Bowstring
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.35, 6), stringMat);
  string.position.set(0.22, 0.85, 0);
  string.rotation.z = 0.08;
  group.add(string);
  const tipOrnament = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), stringMat);
  tipOrnament.name = 'weapon_rune';
  tipOrnament.position.set(0.05, 1.55, 0);
  group.add(tipOrnament);
  // Detail pass — grip wraps, limb reinforcement plates, nock beads, lower tip.
  const trimMat = material('weapon_trim', 0xc99d4d, .35, .82);
  for (let i = 0; i < 2; i += 1) {
    const gripRing = new THREE.Mesh(new THREE.TorusGeometry(.062, .012, 6, 12), trimMat);
    gripRing.name = `bow_grip_ring_${i}`;
    gripRing.rotation.x = Math.PI / 2;
    gripRing.position.set(0, .76 + i * .18, 0);
    group.add(gripRing);
  }
  for (const y of [.58, 1.12]) {
    const plate = new THREE.Mesh(new RoundedBoxGeometry(.06, .14, .09, 2, .02), trimMat);
    plate.name = `bow_plate_${y}`;
    plate.position.set(-.04, y, 0);
    plate.rotation.z = y > .85 ? -.35 : .35;
    group.add(plate);
  }
  const nockTop = new THREE.Mesh(new THREE.SphereGeometry(.032, 8, 6), trimMat);
  nockTop.name = 'bow_nock_top';
  nockTop.position.set(.25, 1.51, 0);
  group.add(nockTop);
  const nockBottom = nockTop.clone();
  nockBottom.name = 'bow_nock_bottom';
  nockBottom.position.set(.19, .19, 0);
  group.add(nockBottom);
  const tipLower = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), stringMat);
  tipLower.name = 'bow_tip_lower';
  tipLower.position.set(0.05, .15, 0);
  group.add(tipLower);
  const base = new THREE.Object3D();
  base.name = 'blade_base';
  base.position.set(0, 0.35, 0);
  const tip = new THREE.Object3D();
  tip.name = 'blade_tip';
  tip.position.set(0, 1.55, 0);
  group.add(base, tip);
  group.rotation.set(0, 0, -0.12);
  return group;
}

function createStaff() {
  const group = new THREE.Group();
  group.name = 'weapon_staff';
  group.userData.weaponKind = 'staff';
  const wood = material('weapon_grip', 0x6a4a32, .85, .05);
  const metal = material('weapon_metal', 0xb8c8e0, .32, .7);
  const crystal = material('weapon_rune', 0xb06dff, .22, .15, 0x8a4dff, .9);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.055, .07, 1.95, 12), wood);
  shaft.name = 'blade_mesh';
  shaft.position.y = .85;
  shaft.castShadow = true;
  group.add(shaft);
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .28, 10), metal);
  wrap.name = 'weapon_grip';
  wrap.position.y = .22;
  group.add(wrap);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(.06, .04, .12, 10), metal);
  ferrule.position.y = -.05;
  group.add(ferrule);
  const band = new THREE.Mesh(new THREE.TorusGeometry(.09, .025, 8, 16), metal);
  band.position.y = 1.72;
  band.rotation.x = Math.PI / 2;
  group.add(band);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.18, 0), crystal);
  gem.name = 'weapon_rune';
  gem.position.y = 1.95;
  gem.castShadow = true;
  group.add(gem);
  const tipOrb = new THREE.Mesh(new THREE.SphereGeometry(.08, 12, 10), crystal);
  tipOrb.position.y = 2.12;
  group.add(tipOrb);
  // Detail pass — gold vine spiralling the shaft, crown prongs, floating rune halo.
  const gold = material('weapon_trim', 0xc99d4d, .35, .82);
  const vinePoints = [];
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    const angle = t * Math.PI * 5;
    vinePoints.push(V3(Math.cos(angle) * .085, .40 + t * 1.2, Math.sin(angle) * .085));
  }
  const vine = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vinePoints), 48, .018, 6, false), gold);
  vine.name = 'staff_vine';
  vine.castShadow = true;
  group.add(vine);
  for (let i = 0; i < 3; i += 1) {
    const angle = i / 3 * Math.PI * 2;
    const prong = new THREE.Mesh(new THREE.ConeGeometry(.03, .18, 6), metal);
    prong.name = `staff_prong_${i}`;
    prong.position.set(Math.cos(angle) * .10, 1.86, Math.sin(angle) * .10);
    prong.rotation.set(Math.sin(angle) * .35, 0, -Math.cos(angle) * .35);
    group.add(prong);
  }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(.26, .014, 6, 28), crystal);
  halo.name = 'weapon_rune_halo';
  halo.position.y = 1.95;
  halo.rotation.x = Math.PI / 2;
  group.add(halo);
  const base = new THREE.Object3D();
  base.name = 'blade_base';
  base.position.set(0, .2, 0);
  const tip = new THREE.Object3D();
  tip.name = 'blade_tip';
  tip.position.set(0, 2.15, 0);
  group.add(base, tip);
  group.rotation.set(0, 0, -.06);
  return group;
}

function makeHealthlessMonsterSkeleton(type) {
  if (type === 'slime' || type === 'wisp') {
    return createSkeleton([
      { name: 'root', position: [0, 0, 0] },
      { name: 'body', parent: 'root', position: [0, .65, 0] },
      { name: 'head', parent: 'body', position: [0, .42, .05] },
    ]);
  }
  if (type === 'colossus' || type === 'humanoid') {
    return createSkeleton([
      { name: 'root', position: [0, 0, 0] },
      { name: 'pelvis', parent: 'root', position: [0, 1.0, 0] },
      { name: 'spine', parent: 'pelvis', position: [0, .58, 0] },
      { name: 'head', parent: 'spine', position: [0, .66, .05] },
      { name: 'left_arm', parent: 'spine', position: [.58, .4, 0] },
      { name: 'left_hand', parent: 'left_arm', position: [.38, -.58, .03] },
      { name: 'right_arm', parent: 'spine', position: [-.58, .4, 0] },
      { name: 'right_hand', parent: 'right_arm', position: [-.38, -.58, .03] },
      { name: 'left_leg', parent: 'pelvis', position: [.3, -.08, 0] },
      { name: 'left_foot', parent: 'left_leg', position: [0, -.82, .12] },
      { name: 'right_leg', parent: 'pelvis', position: [-.3, -.08, 0] },
      { name: 'right_foot', parent: 'right_leg', position: [0, -.82, .12] },
    ]);
  }
  return createSkeleton([
    { name: 'root', position: [0, 0, 0] },
    { name: 'body', parent: 'root', position: [0, .72, 0] },
    { name: 'neck', parent: 'body', position: [0, .36, .42] },
    { name: 'head', parent: 'neck', position: [0, .18, .36] },
    { name: 'front_left', parent: 'body', position: [.32, .05, .38] },
    { name: 'front_left_foot', parent: 'front_left', position: [0, -.63, .06] },
    { name: 'front_right', parent: 'body', position: [-.32, .05, .38] },
    { name: 'front_right_foot', parent: 'front_right', position: [0, -.63, .06] },
    { name: 'back_left', parent: 'body', position: [.35, .02, -.38] },
    { name: 'back_left_foot', parent: 'back_left', position: [0, -.62, -.04] },
    { name: 'back_right', parent: 'body', position: [-.35, .02, -.38] },
    { name: 'back_right_foot', parent: 'back_right', position: [0, -.62, -.04] },
    { name: 'tail', parent: 'body', position: [0, .18, -.65] },
  ]);
}

function monsterAnimations(type, skeletonInfo) {
  const F = (time, rotations = {}, positions = {}, scales = {}) => ({ time, rotations, positions, scales });
  if (type === 'slime' || type === 'wisp') {
    return [
      animationClip('idle', 1.4, [F(0, { body: [0, 0, 0] }, {}, { body: [1, 1, 1] }), F(.7, { body: [0, .12, 0] }, { body: [0, .07, 0] }, { body: [1.06, .92, 1.06] }), F(1.4, { body: [0, 0, 0] }, {}, { body: [1, 1, 1] })], skeletonInfo),
      animationClip('run', .62, [F(0, { body: [0, -.18, .08] }, {}, { body: [1.12, .82, 1.12] }), F(.2, { body: [0, .12, -.08] }, { body: [0, .16, .12] }, { body: [.9, 1.18, .9] }), F(.42, { body: [0, .16, .06] }, { body: [0, .05, -.04] }, { body: [1.08, .9, 1.08] }), F(.62, { body: [0, -.18, .08] }, {}, { body: [1.12, .82, 1.12] })], skeletonInfo),
      animationClip('attack', .72, [F(0, {}, {}, { body: [1, 1, 1] }), F(.24, { body: [-.38, 0, 0] }, { body: [0, -.08, -.12] }, { body: [1.18, .72, 1.18] }), F(.38, { body: [.45, 0, 0] }, { body: [0, .28, .45] }, { body: [.8, 1.35, .8] }), F(.72, {}, {}, { body: [1, 1, 1] })], skeletonInfo),
      animationClip('cast', .85, [F(0), F(.35, { body: [0, .6, 0], head: [-.2, 0, 0] }, { body: [0, .18, 0] }, { body: [.85, 1.25, .85] }), F(.6, { body: [0, -1.1, 0], head: [.35, 0, 0] }, { body: [0, .08, 0] }, { body: [1.22, .82, 1.22] }), F(.85)], skeletonInfo),
      animationClip('hit', .32, [F(0), F(.1, { body: [.45, 0, .15] }, { body: [0, -.08, -.12] }, { body: [1.18, .78, 1.0] }), F(.32)], skeletonInfo),
      animationClip('death', .75, [F(0), F(.32, { body: [0, .5, 0] }, { body: [0, -.28, 0] }, { body: [1.25, .55, 1.25] }), F(.75, { body: [0, 1.2, 0] }, { body: [0, -.55, 0] }, { body: [1.45, .08, 1.45] })], skeletonInfo),
      animationClip('special', 1.05, [F(0), F(.4, { body: [0, 1.5, 0] }, { body: [0, .25, 0] }, { body: [.75, 1.35, .75] }), F(.72, { body: [0, 3.4, 0] }, { body: [0, .12, 0] }, { body: [1.35, .7, 1.35] }), F(1.05)], skeletonInfo),
    ];
  }
  if (type === 'humanoid' || type === 'colossus') {
    return [
      animationClip('idle', 1.8, [F(0, { spine: [.02, 0, 0], head: [0, -.04, 0], left_arm: [.08, 0, .2], right_arm: [.08, 0, -.2] }), F(.9, { spine: [-.03, .03, 0], head: [.03, .04, 0], left_arm: [-.04, 0, .18], right_arm: [-.04, 0, -.18] }, { pelvis: [0, .025, 0] }), F(1.8, { spine: [.02, 0, 0], head: [0, -.04, 0], left_arm: [.08, 0, .2], right_arm: [.08, 0, -.2] })], skeletonInfo),
      animationClip('run', .82, [F(0, { spine: [-.12, 0, 0], left_arm: [.5, 0, .2], right_arm: [-.5, 0, -.2], left_leg: [-.65, 0, 0], right_leg: [.65, 0, 0] }), F(.41, { spine: [-.12, 0, 0], left_arm: [-.5, 0, .2], right_arm: [.5, 0, -.2], left_leg: [.65, 0, 0], right_leg: [-.65, 0, 0] }, { pelvis: [0, .08, 0] }), F(.82, { spine: [-.12, 0, 0], left_arm: [.5, 0, .2], right_arm: [-.5, 0, -.2], left_leg: [-.65, 0, 0], right_leg: [.65, 0, 0] })], skeletonInfo),
      animationClip('attack', .78, [F(0, { spine: [0, -.35, -.1], right_arm: [-.6, -.7, -.5] }), F(.28, { pelvis: [-.25, 0, 0], spine: [-.3, -.75, -.25], right_arm: [-1.25, -1.1, -.9], left_arm: [.4, .4, .3] }), F(.44, { pelvis: [.18, 0, 0], spine: [-.1, .82, .28], right_arm: [-.2, 1.2, .75], left_arm: [-.3, -.3, .1] }), F(.78)], skeletonInfo),
      animationClip('cast', 1.0, [F(0), F(.38, { spine: [-.2, 0, 0], left_arm: [-1.35, 0, .8], right_arm: [-1.35, 0, -.8] }, { pelvis: [0, -.08, 0] }), F(.72, { spine: [.15, 0, 0], left_arm: [-2.45, 0, .25], right_arm: [-2.45, 0, -.25] }, { pelvis: [0, .12, 0] }), F(1.0)], skeletonInfo),
      animationClip('hit', .38, [F(0), F(.12, { pelvis: [.2, 0, 0], spine: [.45, 0, -.2], head: [-.35, 0, .15], left_arm: [-.4, 0, .3], right_arm: [-.4, 0, -.3] }, { pelvis: [0, -.08, -.1] }), F(.38)], skeletonInfo),
      animationClip('death', 1.1, [F(0), F(.35, { pelvis: [-.35, 0, 0], spine: [-.48, 0, 0], head: [.3, 0, 0], left_arm: [-.8, 0, .2], right_arm: [-.8, 0, -.2] }, { pelvis: [0, -.25, -.1] }), F(1.1, { pelvis: [-1.4, 0, 0], spine: [-.7, 0, 0], head: [.15, 0, 0], left_arm: [-1.2, 0, .1], right_arm: [-1.2, 0, -.1] }, { pelvis: [0, -.9, -.25] })], skeletonInfo),
      animationClip('special', 1.35, [F(0), F(.4, { pelvis: [-.45, 0, 0], spine: [-.35, 0, 0], left_arm: [-1.5, -.6, .9], right_arm: [-1.5, .6, -.9] }), F(.82, { pelvis: [.25, 0, 0], spine: [.2, 0, 0], left_arm: [-2.6, 1.1, .25], right_arm: [-2.6, -1.1, -.25] }, { root: [0, .2, .15] }), F(1.35)], skeletonInfo),
    ];
  }
  return [
    animationClip('idle', 1.7, [F(0, { body: [.02, 0, 0], head: [0, -.04, 0], tail: [0, -.18, 0] }), F(.85, { body: [-.025, 0, 0], head: [.04, .05, 0], tail: [0, .24, 0] }, { body: [0, .025, 0] }), F(1.7, { body: [.02, 0, 0], head: [0, -.04, 0], tail: [0, -.18, 0] })], skeletonInfo),
    animationClip('run', .66, [F(0, { body: [-.1, 0, 0], front_left: [.72, 0, 0], front_right: [-.72, 0, 0], back_left: [-.72, 0, 0], back_right: [.72, 0, 0], front_left_foot: [-.45, 0, 0], back_right_foot: [-.45, 0, 0], tail: [0, -.35, 0] }), F(.165, { body: [-.14, 0, 0], front_left: [0, 0, 0], front_right: [0, 0, 0], back_left: [0, 0, 0], back_right: [0, 0, 0], tail: [0, .15, 0] }, { body: [0, .1, 0] }), F(.33, { body: [-.1, 0, 0], front_left: [-.72, 0, 0], front_right: [.72, 0, 0], back_left: [.72, 0, 0], back_right: [-.72, 0, 0], front_right_foot: [-.45, 0, 0], back_left_foot: [-.45, 0, 0], tail: [0, .35, 0] }), F(.495, { body: [-.14, 0, 0], front_left: [0, 0, 0], front_right: [0, 0, 0], back_left: [0, 0, 0], back_right: [0, 0, 0], tail: [0, -.15, 0] }, { body: [0, .1, 0] }), F(.66, { body: [-.1, 0, 0], front_left: [.72, 0, 0], front_right: [-.72, 0, 0], back_left: [-.72, 0, 0], back_right: [.72, 0, 0], tail: [0, -.35, 0] })], skeletonInfo),
    animationClip('attack', .72, [F(0, { body: [0, 0, 0], head: [0, 0, 0] }), F(.24, { body: [-.32, 0, 0], neck: [.35, 0, 0], head: [.2, 0, 0], front_left: [-.45, 0, 0], front_right: [-.45, 0, 0] }, { body: [0, -.08, -.18] }), F(.42, { body: [.25, 0, 0], neck: [-.5, 0, 0], head: [-.35, 0, 0], front_left: [.5, 0, 0], front_right: [.5, 0, 0] }, { body: [0, .12, .32] }), F(.72)], skeletonInfo),
    animationClip('cast', .95, [F(0), F(.38, { body: [-.18, 0, 0], head: [-.35, 0, 0], tail: [0, .55, 0] }, { body: [0, -.08, 0] }), F(.65, { body: [.16, 0, 0], head: [.35, 0, 0], tail: [0, -1.0, 0] }, { body: [0, .14, .12] }), F(.95)], skeletonInfo),
    animationClip('hit', .34, [F(0), F(.11, { body: [.4, 0, .12], head: [-.25, 0, 0], tail: [0, .4, 0] }, { body: [0, -.08, -.1] }), F(.34)], skeletonInfo),
    animationClip('death', .9, [F(0), F(.35, { body: [-.4, 0, .3], head: [.35, 0, 0], front_left: [-.8, 0, 0], front_right: [-.8, 0, 0], back_left: [.6, 0, 0], back_right: [.6, 0, 0] }, { body: [0, -.25, -.15] }), F(.9, { body: [-1.35, 0, .35], head: [.2, 0, 0], front_left: [-1.0, 0, 0], front_right: [-1.0, 0, 0], back_left: [.8, 0, 0], back_right: [.8, 0, 0] }, { body: [0, -.62, -.2] })], skeletonInfo),
    animationClip('special', 1.15, [F(0), F(.35, { body: [-.42, 0, 0], head: [-.35, 0, 0], front_left: [-.65, 0, 0], front_right: [-.65, 0, 0], tail: [0, .65, 0] }, { body: [0, -.12, -.25] }), F(.66, { body: [.32, 0, 0], head: [.45, 0, 0], front_left: [.65, 0, 0], front_right: [.65, 0, 0], tail: [0, -1.0, 0] }, { body: [0, .22, .42] }), F(1.15)], skeletonInfo),
  ];
}

function monsterGeometry(type, resolution) {
  if (type === 'slime') {
    const parts = [
      p => sdfEllipsoid(p, V3(0, .62, 0), V3(.70, .64, .64)),
      p => sdfEllipsoid(p, V3(0, .35, .02), V3(.82, .38, .72)),
      p => sdfCapsule(p, V3(-.55, .30, 0), V3(-.72, .12, .08), .18, .10),
      p => sdfCapsule(p, V3(.55, .30, 0), V3(.72, .12, .08), .18, .10),
      // Surface blobs and dripping goo nubs break up the clean dome read.
      p => sdfEllipsoid(p, V3(.30, .88, .28), V3(.18, .16, .18)),
      p => sdfEllipsoid(p, V3(-.34, .80, -.20), V3(.16, .14, .16)),
      p => sdfEllipsoid(p, V3(.10, 1.04, -.30), V3(.14, .12, .14)),
      p => sdfCapsule(p, V3(.30, .18, .55), V3(.38, .05, .68), .12, .05),
      p => sdfCapsule(p, V3(-.42, .16, .40), V3(-.55, .04, .52), .10, .05),
      p => sdfCapsule(p, V3(.05, .16, -.60), V3(.10, .04, -.73), .10, .05),
    ];
    return implicitGeometry(p => unionSdf(parts, p, .16), { min: V3(-1.0, -.05, -.9), max: V3(1.0, 1.45, .9) }, resolution, 110000);
  }
  if (type === 'hare') {
    const parts = [
      p => sdfEllipsoid(p, V3(0, .82, -.12), V3(.52, .50, .72)),
      p => sdfCapsule(p, V3(0, .93, .25), V3(0, 1.20, .55), .34, .30),
      p => sdfEllipsoid(p, V3(0, 1.30, .64), V3(.40, .42, .38)),
      p => sdfCapsule(p, V3(.17, 1.52, .60), V3(.24, 2.15, .50), .14, .085),
      p => sdfCapsule(p, V3(-.17, 1.52, .60), V3(-.24, 2.15, .50), .14, .085),
      p => sdfCapsule(p, V3(.30, .65, .30), V3(.35, .12, .40), .18, .11),
      p => sdfCapsule(p, V3(-.30, .65, .30), V3(-.35, .12, .40), .18, .11),
      p => sdfCapsule(p, V3(.34, .63, -.40), V3(.42, .12, -.35), .22, .13),
      p => sdfCapsule(p, V3(-.34, .63, -.40), V3(-.42, .12, -.35), .22, .13),
      p => sdfEllipsoid(p, V3(0, .70, -.78), V3(.23, .23, .22)),
      // Chest ruff, heavier haunches, muzzle plane for a defined head.
      p => sdfEllipsoid(p, V3(0, 1.02, .40), V3(.28, .24, .22)),
      p => sdfEllipsoid(p, V3(.30, .76, -.30), V3(.22, .26, .30)),
      p => sdfEllipsoid(p, V3(-.30, .76, -.30), V3(.22, .26, .30)),
      p => sdfEllipsoid(p, V3(0, 1.22, .90), V3(.18, .14, .17)),
      p => sdfEllipsoid(p, V3(.15, 1.44, .84), V3(.08, .07, .07)),
      p => sdfEllipsoid(p, V3(-.15, 1.44, .84), V3(.08, .07, .07)),
    ];
    return implicitGeometry(p => unionSdf(parts, p, .105), { min: V3(-.9, -.05, -1.1), max: V3(.9, 2.35, 1.15) }, resolution, 150000);
  }
  if (type === 'boar') {
    const parts = [
      p => sdfEllipsoid(p, V3(0, .88, -.1), V3(.70, .64, 1.02)),
      p => sdfCapsule(p, V3(0, 1.0, .52), V3(0, 1.14, .92), .48, .38),
      p => sdfEllipsoid(p, V3(0, 1.13, 1.02), V3(.48, .45, .48)),
      p => sdfEllipsoid(p, V3(0, 1.02, 1.39), V3(.36, .28, .38)),
      p => sdfCapsule(p, V3(.42, .70, .45), V3(.44, .10, .48), .19, .12),
      p => sdfCapsule(p, V3(-.42, .70, .45), V3(-.44, .10, .48), .19, .12),
      p => sdfCapsule(p, V3(.46, .70, -.55), V3(.48, .10, -.52), .20, .12),
      p => sdfCapsule(p, V3(-.46, .70, -.55), V3(-.48, .10, -.52), .20, .12),
      p => sdfCapsule(p, V3(0, .95, -.95), V3(0, 1.02, -1.32), .15, .06),
      // Mane ridge along the spine, ears, shoulder bulk, snout disc.
      p => sdfEllipsoid(p, V3(0, 1.34, .28), V3(.20, .22, .30)),
      p => sdfEllipsoid(p, V3(0, 1.40, -.08), V3(.22, .24, .34)),
      p => sdfEllipsoid(p, V3(0, 1.30, -.46), V3(.20, .20, .30)),
      p => sdfCapsule(p, V3(.26, 1.36, .90), V3(.40, 1.60, .80), .10, .04),
      p => sdfCapsule(p, V3(-.26, 1.36, .90), V3(-.40, 1.60, .80), .10, .04),
      p => sdfEllipsoid(p, V3(.40, .94, .40), V3(.24, .30, .30)),
      p => sdfEllipsoid(p, V3(-.40, .94, .40), V3(.24, .30, .30)),
      p => sdfEllipsoid(p, V3(0, .98, 1.50), V3(.24, .18, .14)),
    ];
    return implicitGeometry(p => unionSdf(parts, p, .12), { min: V3(-1.05, -.05, -1.55), max: V3(1.05, 1.85, 1.75) }, resolution, 160000);
  }
  if (type === 'wisp') {
    const parts = [
      p => sdfEllipsoid(p, V3(0, .92, 0), V3(.48, .58, .45)),
      p => sdfCapsule(p, V3(0, .58, 0), V3(0, .12, 0), .34, .06),
      p => sdfCapsule(p, V3(.28, .98, 0), V3(.62, 1.24, -.08), .16, .05),
      p => sdfCapsule(p, V3(-.28, .98, 0), V3(-.62, 1.24, -.08), .16, .05),
      // Extra flame tendrils and a crown lick for a livelier spirit silhouette.
      p => sdfCapsule(p, V3(.15, .62, .22), V3(.35, .20, .42), .10, .03),
      p => sdfCapsule(p, V3(-.15, .62, .22), V3(-.35, .20, .42), .10, .03),
      p => sdfCapsule(p, V3(0, 1.28, -.12), V3(0, 1.56, -.32), .12, .04),
    ];
    return implicitGeometry(p => unionSdf(parts, p, .10), { min: V3(-.85, -.05, -.65), max: V3(.85, 1.75, .65) }, resolution, 110000);
  }
  if (type === 'humanoid') {
    const parts = [
      p => sdfEllipsoid(p, V3(0, 1.55, 0), V3(.62, .72, .42)),
      p => sdfEllipsoid(p, V3(0, 2.25, .06), V3(.46, .50, .42)),
      p => sdfCapsule(p, V3(.50, 1.88, 0), V3(.88, 1.12, .02), .23, .17),
      p => sdfCapsule(p, V3(-.50, 1.88, 0), V3(-.88, 1.12, .02), .23, .17),
      p => sdfCapsule(p, V3(.28, 1.10, 0), V3(.32, .18, .10), .28, .16),
      p => sdfCapsule(p, V3(-.28, 1.10, 0), V3(-.32, .18, .10), .28, .16),
      // Brute anatomy — pecs, gut, delts, heavy fists, jaw and brow ridge.
      p => sdfEllipsoid(p, V3(.28, 1.80, .28), V3(.22, .16, .14)),
      p => sdfEllipsoid(p, V3(-.28, 1.80, .28), V3(.22, .16, .14)),
      p => sdfEllipsoid(p, V3(0, 1.26, .30), V3(.30, .26, .16)),
      p => sdfEllipsoid(p, V3(.54, 2.00, 0), V3(.20, .18, .18)),
      p => sdfEllipsoid(p, V3(-.54, 2.00, 0), V3(.20, .18, .18)),
      p => sdfEllipsoid(p, V3(.90, 1.06, .04), V3(.15, .13, .14)),
      p => sdfEllipsoid(p, V3(-.90, 1.06, .04), V3(.15, .13, .14)),
      p => sdfEllipsoid(p, V3(0, 2.00, .28), V3(.16, .12, .12)),
      p => sdfEllipsoid(p, V3(0, 2.42, .38), V3(.26, .08, .12)),
    ];
    return implicitGeometry(p => unionSdf(parts, p, .11), { min: V3(-1.15, -.05, -.72), max: V3(1.15, 2.95, .78) }, resolution, 160000);
  }
  if (type === 'colossus') {
    const parts = [
      p => sdfEllipsoid(p, V3(0, 1.75, 0), V3(.95, 1.00, .62)),
      p => sdfRoundedBox(p, V3(0, 1.72, 0), V3(.72, .88, .48), .22),
      p => sdfEllipsoid(p, V3(0, 2.73, .08), V3(.62, .65, .55)),
      p => sdfCapsule(p, V3(.75, 2.18, 0), V3(1.25, 1.15, .02), .34, .24),
      p => sdfCapsule(p, V3(-.75, 2.18, 0), V3(-1.25, 1.15, .02), .34, .24),
      p => sdfCapsule(p, V3(.42, 1.15, 0), V3(.48, .10, .12), .38, .22),
      p => sdfCapsule(p, V3(-.42, 1.15, 0), V3(-.48, .10, .12), .38, .22),
      p => sdfCapsule(p, V3(.28, 3.05, -.05), V3(.65, 3.72, -.1), .18, .07),
      p => sdfCapsule(p, V3(-.28, 3.05, -.05), V3(-.65, 3.72, -.1), .18, .07),
      p => sdfCapsule(p, V3(.52, 3.45, -.08), V3(.92, 3.82, -.15), .11, .05),
      p => sdfCapsule(p, V3(-.52, 3.45, -.08), V3(-.92, 3.82, -.15), .11, .05),
      // Boulder shoulders, knuckle mass, brow shelf — ancient stone golem bulk.
      p => sdfEllipsoid(p, V3(.85, 2.35, 0), V3(.34, .30, .32)),
      p => sdfEllipsoid(p, V3(-.85, 2.35, 0), V3(.34, .30, .32)),
      p => sdfEllipsoid(p, V3(1.28, 1.05, .04), V3(.24, .20, .24)),
      p => sdfEllipsoid(p, V3(-1.28, 1.05, .04), V3(.24, .20, .24)),
      p => sdfEllipsoid(p, V3(0, 2.88, .42), V3(.36, .12, .18)),
      p => sdfEllipsoid(p, V3(0, 1.35, .40), V3(.42, .30, .22)),
      p => sdfEllipsoid(p, V3(.30, 2.10, -.42), V3(.26, .34, .20)),
      p => sdfEllipsoid(p, V3(-.30, 2.10, -.42), V3(.26, .34, .20)),
    ];
    return implicitGeometry(p => unionSdf(parts, p, .14), { min: V3(-1.65, -.05, -.92), max: V3(1.65, 4.05, 1.0) }, resolution, 240000);
  }
  throw new Error(`Unknown monster geometry: ${type}`);
}

function monsterSkinRules(type, skeletonInfo) {
  if (type === 'slime' || type === 'wisp') {
    return {
      rules: [
        { bone: 'body', start: 'body', end: 'head', sigma: .75, bias: 2 },
        { bone: 'head', start: 'head', end: 'head', sigma: .5, bias: 1.6 },
        { bone: 'root', start: 'root', end: 'body', sigma: .55, bias: .6 },
      ], selector: null,
    };
  }
  if (type === 'humanoid' || type === 'colossus') {
    const rules = [
      { bone: 'pelvis', start: 'pelvis', end: 'spine', sigma: .55, bias: 1.5 },
      { bone: 'spine', start: 'spine', end: 'head', sigma: .62, bias: 1.5 },
      { bone: 'head', start: 'head', end: 'head', sigma: .65, bias: 1.8 },
      { bone: 'left_arm', start: 'left_arm', end: 'left_hand', sigma: .42, bias: 1.8 },
      { bone: 'left_hand', start: 'left_hand', end: 'left_hand', sigma: .34, bias: 1.7 },
      { bone: 'right_arm', start: 'right_arm', end: 'right_hand', sigma: .42, bias: 1.8 },
      { bone: 'right_hand', start: 'right_hand', end: 'right_hand', sigma: .34, bias: 1.7 },
      { bone: 'left_leg', start: 'left_leg', end: 'left_foot', sigma: .42, bias: 1.8 },
      { bone: 'left_foot', start: 'left_foot', end: 'left_foot', sigma: .34, bias: 1.7 },
      { bone: 'right_leg', start: 'right_leg', end: 'right_foot', sigma: .42, bias: 1.8 },
      { bone: 'right_foot', start: 'right_foot', end: 'right_foot', sigma: .34, bias: 1.7 },
    ];
    const selector = p => {
      if (p.y > 2.2) return rules.filter(rule => ['head', 'spine'].includes(rule.bone));
      if (p.x > .5 && p.y > .8) return rules.filter(rule => rule.bone.startsWith('left_') || rule.bone === 'spine');
      if (p.x < -.5 && p.y > .8) return rules.filter(rule => rule.bone.startsWith('right_') || rule.bone === 'spine');
      if (p.y < 1.15 && p.x >= 0) return rules.filter(rule => rule.bone.startsWith('left_') || rule.bone === 'pelvis');
      if (p.y < 1.15 && p.x < 0) return rules.filter(rule => rule.bone.startsWith('right_') || rule.bone === 'pelvis');
      return rules.filter(rule => ['pelvis', 'spine', 'head'].includes(rule.bone));
    };
    return { rules, selector };
  }
  const rules = [
    { bone: 'body', start: 'body', end: 'neck', sigma: .68, bias: 1.7 },
    { bone: 'neck', start: 'neck', end: 'head', sigma: .42, bias: 1.6 },
    { bone: 'head', start: 'head', end: 'head', sigma: .50, bias: 1.8 },
    { bone: 'front_left', start: 'front_left', end: 'front_left_foot', sigma: .32, bias: 1.8 },
    { bone: 'front_left_foot', start: 'front_left_foot', end: 'front_left_foot', sigma: .25, bias: 1.5 },
    { bone: 'front_right', start: 'front_right', end: 'front_right_foot', sigma: .32, bias: 1.8 },
    { bone: 'front_right_foot', start: 'front_right_foot', end: 'front_right_foot', sigma: .25, bias: 1.5 },
    { bone: 'back_left', start: 'back_left', end: 'back_left_foot', sigma: .34, bias: 1.8 },
    { bone: 'back_left_foot', start: 'back_left_foot', end: 'back_left_foot', sigma: .27, bias: 1.5 },
    { bone: 'back_right', start: 'back_right', end: 'back_right_foot', sigma: .34, bias: 1.8 },
    { bone: 'back_right_foot', start: 'back_right_foot', end: 'back_right_foot', sigma: .27, bias: 1.5 },
    { bone: 'tail', start: 'tail', end: 'tail', sigma: .34, bias: 1.6 },
  ];
  const selector = p => {
    if (p.z > .65 && p.y > .8) return rules.filter(rule => ['head', 'neck', 'body'].includes(rule.bone));
    if (p.z < -.7) return rules.filter(rule => ['tail', 'body'].includes(rule.bone));
    if (p.y < .72 && p.x >= 0 && p.z >= 0) return rules.filter(rule => rule.bone.startsWith('front_left') || rule.bone === 'body');
    if (p.y < .72 && p.x < 0 && p.z >= 0) return rules.filter(rule => rule.bone.startsWith('front_right') || rule.bone === 'body');
    if (p.y < .72 && p.x >= 0 && p.z < 0) return rules.filter(rule => rule.bone.startsWith('back_left') || rule.bone === 'body');
    if (p.y < .72 && p.x < 0 && p.z < 0) return rules.filter(rule => rule.bone.startsWith('back_right') || rule.bone === 'body');
    return rules.filter(rule => ['body', 'neck', 'head'].includes(rule.bone));
  };
  return { rules, selector };
}

function createMonster(type, resolution = 44) {
  const group = new THREE.Group();
  group.name = `monster_${type}_rig`;
  group.userData.assetType = 'monster';
  group.userData.archetype = type;
  const skeletonInfo = makeHealthlessMonsterSkeleton(type);
  group.add(skeletonInfo.rootBone);
  group.updateMatrixWorld(true);
  const { rules, selector } = monsterSkinRules(type, skeletonInfo);
  const geometry = weld(applySkinWeights(monsterGeometry(type, resolution), skeletonInfo, rules, selector));
  const bodyMat = material('monster_body', type === 'slime' ? 0x55bd7b : type === 'hare' ? 0xb9aa7d : type === 'boar' ? 0x6f664b : type === 'wisp' ? 0xf0c95e : type === 'colossus' ? 0x4f6945 : 0x527a55, type === 'slime' || type === 'wisp' ? .36 : .78, type === 'colossus' ? .05 : 0, type === 'wisp' ? 0xe0a940 : 0x000000, type === 'wisp' ? .55 : 0);
  const body = makeSkinnedMesh(geometry, bodyMat, skeletonInfo.skeleton, `${type}_body`);
  group.add(body);
  const outline = makeSkinnedMesh(geometry.clone(), new THREE.MeshBasicMaterial({ name: 'outline_proxy', color: 0x172632, transparent: true, opacity: .001, depthWrite: false, side: THREE.BackSide }), skeletonInfo.skeleton, `${type}_outline_proxy`);
  outline.userData.outlineProxy = true;
  group.add(outline);

  const headBone = skeletonInfo.bones.get('head');
  const eyeMat = material('monster_eye', 0x18202a, .3, 0);
  const eyeGlow = material('monster_eye_glow', 0xffe17b, .25, .05, 0xffb83f, .35);
  const eyeGeo = new THREE.CircleGeometry(type === 'colossus' ? .12 : .085, 20);
  if (type === 'slime' || type === 'wisp') {
    addSurfaceDetail(group, headBone, `${type}_eye_l`, eyeGeo, eyeMat, [.18, .02, type === 'wisp' ? .40 : .46], [0, 0, 0], [1, 1.25, 1]);
    addSurfaceDetail(group, headBone, `${type}_eye_r`, eyeGeo, eyeMat, [-.18, .02, type === 'wisp' ? .40 : .46], [0, 0, 0], [1, 1.25, 1]);
    const bodyBone = skeletonInfo.bones.get('body');
    if (type === 'slime') {
      // Glossy surface bubbles + a dark gel mouth; glints keep the face readable.
      const glintMat = material('slime_accent_glint', 0xf4fff2, .2, 0);
      const glintGeo = new THREE.CircleGeometry(.03, 10);
      addSurfaceDetail(group, headBone, 'slime_glint_l', glintGeo, glintMat, [.21, .07, .465]);
      addSurfaceDetail(group, headBone, 'slime_glint_r', glintGeo, glintMat, [-.15, .07, .465]);
      const mouthCurve = new THREE.QuadraticBezierCurve3(V3(-.12, -.16, .48), V3(0, -.24, .52), V3(.12, -.16, .48));
      addSurfaceDetail(group, headBone, 'slime_accent_mouth', new THREE.TubeGeometry(mouthCurve, 10, .022, 5, false), material('slime_accent_mouth', 0x1d4a34, .5, 0), [0, 0, 0]);
      const bubbleMat = material('slime_bubble_glow', 0x8fe8ae, .22, 0, 0x55bd7b, .35);
      for (const [bx, by, bz, br] of [[.42, .30, .32, .075], [-.36, .34, .38, .06], [.05, .44, -.52, .09], [-.44, .18, -.30, .055]]) {
        addSurfaceDetail(group, bodyBone, `slime_bubble_${bx}`, new THREE.SphereGeometry(br, 12, 10), bubbleMat, [bx, by, bz]);
      }
    } else {
      // Ember motes + halo ring reinforce the spirit-flame identity.
      const emberMat = material('wisp_ember_glow', 0xffd685, .25, 0, 0xe0a940, .8);
      for (const [ex, ey, ez, er] of [[.55, -.32, .15, .05], [-.50, -.18, -.12, .04], [.18, .10, -.32, .06]]) {
        addSurfaceDetail(group, bodyBone, `wisp_ember_${ex}`, new THREE.SphereGeometry(er, 10, 8), emberMat, [ex, ey, ez]);
      }
      const halo = new THREE.Mesh(new THREE.TorusGeometry(.55, .022, 8, 36), material('wisp_halo_glow', 0xffe9b0, .3, 0, 0xe0a940, .6));
      halo.name = 'wisp_halo';
      halo.rotation.x = Math.PI / 2;
      halo.position.set(0, .38, 0);
      bodyBone.add(halo);
    }
  } else if (type === 'hare') {
    addSurfaceDetail(group, headBone, 'hare_eye_l', eyeGeo, eyeMat, [.23, .08, .34], [0, 0, 0], [1, 1.2, 1]);
    addSurfaceDetail(group, headBone, 'hare_eye_r', eyeGeo, eyeMat, [-.23, .08, .34], [0, 0, 0], [1, 1.2, 1]);
    const hareGlintMat = material('hare_accent_glint', 0xffffff, .2, 0);
    const hareGlintGeo = new THREE.CircleGeometry(.028, 10);
    addSurfaceDetail(group, headBone, 'hare_glint_l', hareGlintGeo, hareGlintMat, [.255, .115, .355]);
    addSurfaceDetail(group, headBone, 'hare_glint_r', hareGlintGeo, hareGlintMat, [-.205, .115, .355]);
    const hornMat = material('monster_accent', 0xe7db9f, .65, 0);
    const hornCurveL = new THREE.CatmullRomCurve3([V3(.18, .25, .22), V3(.25, .45, .18), V3(.16, .62, .08)]);
    const hornCurveR = new THREE.CatmullRomCurve3([V3(-.18, .25, .22), V3(-.25, .45, .18), V3(-.16, .62, .08)]);
    addSurfaceDetail(group, headBone, 'hare_horn_l', new THREE.TubeGeometry(hornCurveL, 12, .035, 7, false), hornMat, [0, 0, 0]);
    addSurfaceDetail(group, headBone, 'hare_horn_r', new THREE.TubeGeometry(hornCurveR, 12, .035, 7, false), hornMat, [0, 0, 0]);
    // Face kit — pink nose/inner ears, buck teeth, whisker sticks.
    const noseMat = material('hare_accent_nose', 0xd88a90, .55, 0);
    addSurfaceDetail(group, headBone, 'hare_nose', new THREE.SphereGeometry(.045, 10, 8), noseMat, [0, -.04, .40], [0, 0, 0], [1, .8, .7]);
    const innerEarMat = material('hare_accent_ear_inner', 0xd8a0a0, .7, 0);
    const innerEarGeo = new THREE.CircleGeometry(.085, 12);
    addSurfaceDetail(group, headBone, 'hare_ear_inner_l', innerEarGeo, innerEarMat, [.21, .56, -.20], [-.28, .18, .08], [.55, 1.9, 1]);
    addSurfaceDetail(group, headBone, 'hare_ear_inner_r', innerEarGeo, innerEarMat, [-.21, .56, -.20], [-.28, -.18, -.08], [.55, 1.9, 1]);
    const toothMat = material('hare_accent_tooth', 0xf6f0dc, .5, 0);
    addSurfaceDetail(group, headBone, 'hare_tooth_l', new THREE.BoxGeometry(.035, .055, .02), toothMat, [.022, -.13, .385]);
    addSurfaceDetail(group, headBone, 'hare_tooth_r', new THREE.BoxGeometry(.035, .055, .02), toothMat, [-.022, -.13, .385]);
    const whiskerMat = material('hare_accent_whisker', 0xe8e0c8, .8, 0);
    for (const sign of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        const whisker = new THREE.Mesh(new THREE.BoxGeometry(.24, .006, .006), whiskerMat);
        whisker.name = `hare_whisker_${sign}_${i}`;
        whisker.position.set(sign * .20, -.05 - i * .025, .34);
        whisker.rotation.set(0, sign * -.5, (i - 1) * .16);
        headBone.add(whisker);
      }
    }
  } else if (type === 'boar') {
    addSurfaceDetail(group, headBone, 'boar_eye_l', eyeGeo, eyeMat, [.25, .10, .32]);
    addSurfaceDetail(group, headBone, 'boar_eye_r', eyeGeo, eyeMat, [-.25, .10, .32]);
    const tuskMat = material('monster_accent', 0xe7d9b0, .58, 0);
    const tuskL = new THREE.CatmullRomCurve3([V3(.20, -.26, .58), V3(.31, -.32, .76), V3(.25, -.08, .90)]);
    const tuskR = new THREE.CatmullRomCurve3([V3(-.20, -.26, .58), V3(-.31, -.32, .76), V3(-.25, -.08, .90)]);
    addSurfaceDetail(group, headBone, 'boar_tusk_l', new THREE.TubeGeometry(tuskL, 12, .055, 7, false), tuskMat, [0, 0, 0]);
    addSurfaceDetail(group, headBone, 'boar_tusk_r', new THREE.TubeGeometry(tuskR, 12, .055, 7, false), tuskMat, [0, 0, 0]);
    // Snout nostrils, hooves, bristle row, tail tuft complete the wild-boar read.
    const nostrilMat = material('boar_accent_nostril', 0x2a211c, .6, 0);
    const nostrilGeo = new THREE.CircleGeometry(.035, 10);
    addSurfaceDetail(group, headBone, 'boar_nostril_l', nostrilGeo, nostrilMat, [.08, -.28, .875], [0, 0, 0], [1, 1.4, 1]);
    addSurfaceDetail(group, headBone, 'boar_nostril_r', nostrilGeo, nostrilMat, [-.08, -.28, .875], [0, 0, 0], [1, 1.4, 1]);
    const hoofMat = material('boar_accent_hoof', 0x2e2622, .55, 0);
    for (const footName of ['front_left_foot', 'front_right_foot', 'back_left_foot', 'back_right_foot']) {
      const foot = skeletonInfo.bones.get(footName);
      const outward = footName.includes('left') ? 1 : -1;
      const isFront = footName.startsWith('front');
      const hoof = new THREE.Mesh(new RoundedBoxGeometry(.22, .13, .24, 2, .03), hoofMat);
      hoof.name = `boar_hoof_${footName}`;
      // Skeleton feet sit inboard of the sculpted legs — offset out to the actual leg line.
      hoof.position.set(outward * .12, -.07, isFront ? .06 : -.10);
      foot.add(hoof);
    }
    const bodyBone = skeletonInfo.bones.get('body');
    const bristleMat = material('boar_accent_bristle', 0x453a2c, .85, 0);
    for (let i = 0; i < 5; i += 1) {
      const bristle = new THREE.Mesh(new THREE.ConeGeometry(.055, .17, 6), bristleMat);
      bristle.name = `boar_bristle_${i}`;
      bristle.position.set((i % 2) * .05 - .025, .78 - i * .04, .35 - i * .21);
      bristle.rotation.x = -.45;
      bodyBone.add(bristle);
    }
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 8), bristleMat);
    tuft.name = 'boar_tail_tuft';
    tuft.position.set(0, .30, -1.32);
    bodyBone.add(tuft);
  } else {
    // Colossus head sits higher than the shared skeleton's head bone — lift eyes onto the actual skull.
    const eyeY = type === 'colossus' ? .52 : .06;
    const eyeZ = type === 'colossus' ? .60 : .43;
    addSurfaceDetail(group, headBone, `${type}_eye_l`, eyeGeo, type === 'colossus' ? eyeGlow : eyeMat, [.21, eyeY, eyeZ], [0, 0, 0], [1, 1.2, 1]);
    addSurfaceDetail(group, headBone, `${type}_eye_r`, eyeGeo, type === 'colossus' ? eyeGlow : eyeMat, [-.21, eyeY, eyeZ], [0, 0, 0], [1, 1.2, 1]);
  }
  if (type === 'humanoid') {
    // Horns, under-bite teeth, rope belt, loincloth, spine spikes — a proper brute.
    const hornMat = material('humanoid_accent_horn', 0xd8cba8, .6, 0);
    const hornL = new THREE.CatmullRomCurve3([V3(.28, .28, .08), V3(.46, .50, -.02), V3(.42, .70, -.16)]);
    const hornR = new THREE.CatmullRomCurve3([V3(-.28, .28, .08), V3(-.46, .50, -.02), V3(-.42, .70, -.16)]);
    addSurfaceDetail(group, headBone, 'humanoid_horn_l', new THREE.TubeGeometry(hornL, 10, .055, 7, false), hornMat, [0, 0, 0]);
    addSurfaceDetail(group, headBone, 'humanoid_horn_r', new THREE.TubeGeometry(hornR, 10, .055, 7, false), hornMat, [0, 0, 0]);
    const toothMat = material('humanoid_accent_tooth', 0xe8ddc0, .5, 0);
    for (const [tx, tz] of [[.14, .34], [.05, .385], [-.05, .385], [-.14, .34]]) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(.026, .075, 6), toothMat);
      tooth.name = `humanoid_tooth_${tx}`;
      tooth.position.set(tx, -.22, tz);
      headBone.add(tooth);
    }
    const pelvisBone = skeletonInfo.bones.get('pelvis');
    const rope = new THREE.Mesh(new THREE.TorusGeometry(.44, .05, 8, 28), material('humanoid_accent_rope', 0x8a7648, .9, 0));
    rope.name = 'humanoid_rope_belt';
    rope.rotation.x = Math.PI / 2;
    rope.scale.z = .8;
    rope.position.set(0, -.04, 0);
    pelvisBone.add(rope);
    const loincloth = new THREE.Mesh(new RoundedBoxGeometry(.42, .36, .07, 2, .03), material('humanoid_cloth_wrap', 0x4a4238, .92, 0));
    loincloth.name = 'humanoid_loincloth';
    loincloth.position.set(0, -.22, .30);
    loincloth.rotation.x = .12;
    loincloth.castShadow = true;
    pelvisBone.add(loincloth);
    const spineBone = skeletonInfo.bones.get('spine');
    for (let i = 0; i < 3; i += 1) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(.05, .15, 6), hornMat);
      spike.name = `humanoid_spike_${i}`;
      spike.position.set(0, .40 - i * .24, -.42 - (i === 1 ? .02 : 0));
      spike.rotation.x = -.9;
      spineBone.add(spike);
    }
    for (const side of ['left', 'right']) {
      const arm = skeletonInfo.bones.get(`${side}_arm`);
      const pad = new THREE.Mesh(new RoundedBoxGeometry(.36, .14, .34, 2, .05), material('humanoid_stone_pad', 0x6a6f66, .9, 0));
      pad.name = `humanoid_pad_${side}`;
      pad.position.set(side === 'left' ? -.02 : .02, .04, 0);
      pad.rotation.z = side === 'left' ? -.38 : .38;
      pad.castShadow = true;
      arm.add(pad);
    }
  }
  if (type === 'colossus') {
    const mossMat = material('monster_moss', 0x6e9b4a, .95, 0);
    for (let i = 0; i < 5; i += 1) {
      const leafShape = new THREE.Shape();
      leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(.16, .18, 0, .42); leafShape.quadraticCurveTo(-.16, .18, 0, 0);
      const leaf = new THREE.Mesh(new THREE.ShapeGeometry(leafShape, 8), mossMat);
      leaf.name = `moss_leaf_${i}`;
      leaf.position.set((i - 2) * .17, .82 + (i % 2) * .10, -.30 - i * .03);
      leaf.rotation.set(-.65, i * .45, (i - 2) * .18);
      headBone.add(leaf);
    }
    // Rock plates, glowing rune cracks, and crystal shards — ancient awakened golem.
    const spineBone = skeletonInfo.bones.get('spine');
    const stoneMat = material('colossus_stone_plate', 0x5d6258, .92, 0);
    for (const [px, py, pz, ry] of [[0, .40, -.72, 0], [.44, .10, -.66, .5], [-.44, .10, -.66, -.5], [0, -.24, -.72, .25]]) {
      const plate = new THREE.Mesh(new RoundedBoxGeometry(.52, .36, .20, 2, .05), stoneMat);
      plate.name = `colossus_plate_${px}_${py}`;
      plate.position.set(px, py, pz);
      plate.rotation.set(.12, ry, 0);
      plate.castShadow = true;
      spineBone.add(plate);
    }
    const runeMat = material('colossus_rune_glow', 0x8fe8c0, .4, 0, 0x4fd898, .9);
    for (const [rx, ry, rot] of [[.16, .18, .5], [-.20, .05, -.6], [.05, -.18, .2], [-.10, .32, -.25]]) {
      const rune = new THREE.Mesh(new THREE.BoxGeometry(.05, .28, .025), runeMat);
      rune.name = `colossus_rune_${rx}_${ry}`;
      rune.position.set(rx, ry, .70);
      rune.rotation.z = rot;
      spineBone.add(rune);
    }
    const crystalMat = material('colossus_crystal_glow', 0x7dd8c8, .3, .1, 0x3fb89a, .7);
    for (const [cx, cy, cz, tilt] of [[0, .70, -.66, -.6], [.36, .55, -.62, -.45], [-.32, .60, -.64, -.75]]) {
      const crystal = new THREE.Mesh(new THREE.ConeGeometry(.10, .38, 5), crystalMat);
      crystal.name = `colossus_crystal_${cx}`;
      crystal.position.set(cx, cy, cz);
      crystal.rotation.set(tilt, cx * 1.2, 0);
      crystal.castShadow = true;
      spineBone.add(crystal);
    }
    for (const side of ['left', 'right']) {
      const hand = skeletonInfo.bones.get(`${side}_hand`);
      const knuckle = new THREE.Mesh(new RoundedBoxGeometry(.34, .24, .30, 2, .06), stoneMat);
      knuckle.name = `colossus_knuckle_${side}`;
      knuckle.position.set(side === 'left' ? .33 : -.33, -.36, .18);
      knuckle.castShadow = true;
      hand.add(knuckle);
    }
  }
  const animations = monsterAnimations(type, skeletonInfo);
  group.userData.modelHeight = type === 'colossus' ? 4.0 : type === 'hare' ? 2.3 : type === 'boar' ? 1.85 : type === 'humanoid' ? 2.95 : 1.7;
  group.userData.animationMap = Object.fromEntries(animations.map(clip => [clip.name, clip.name]));
  return { group, animations };
}

function createTaperedTube(points, radii, radialSegments = 10, tubularSegments = 20) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= tubularSegments; i += 1) {
    const t = i / tubularSegments;
    const center = curve.getPointAt(t);
    const normal = frames.normals[i];
    const binormal = frames.binormals[i];
    const scaledIndex = t * (radii.length - 1);
    const r0 = Math.floor(scaledIndex);
    const r1 = Math.min(radii.length - 1, r0 + 1);
    const radius = THREE.MathUtils.lerp(radii[r0], radii[r1], scaledIndex - r0);
    for (let j = 0; j <= radialSegments; j += 1) {
      const u = j / radialSegments;
      const angle = u * Math.PI * 2;
      const radial = normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle));
      positions.push(center.x + radial.x * radius, center.y + radial.y * radius, center.z + radial.z * radius);
      normals.push(radial.x, radial.y, radial.z);
      uvs.push(u, t);
    }
  }
  for (let i = 0; i < tubularSegments; i += 1) {
    for (let j = 0; j < radialSegments; j += 1) {
      const a = i * (radialSegments + 1) + j;
      const b = a + radialSegments + 1;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function createTree(variant = 0) {
  const root = new THREE.Group();
  root.name = `tree_variant_${variant}`;
  root.userData.assetType = 'environment';
  const trunkMat = material('tree_bark', variant === 2 ? 0x6a4b38 : 0x5c4736, .94, 0);
  const leafColors = [0x4f8b42, 0x3f7b4c, 0x6c9e4a, 0x47745a];
  const leafMat = material('tree_leaves', leafColors[variant % leafColors.length], .88, 0);
  const lean = [-.18, .12, -.08, .22][variant % 4];
  const points = [V3(0, 0, 0), V3(.05 + lean * .2, 1.1, 0), V3(lean * .45, 2.2, .05), V3(lean, 3.2, -.08), V3(lean * 1.05, 4.0, -.03)];
  const trunk = new THREE.Mesh(createTaperedTube(points, [.42, .35, .26, .18, .09], 12, 28), trunkMat);
  trunk.name = 'tree_trunk'; trunk.castShadow = true; trunk.receiveShadow = true; root.add(trunk);
  const branches = [
    [V3(lean * .45, 2.15, .02), V3(.8 + lean, 2.75, .18), V3(1.22 + lean, 3.08, .08)],
    [V3(lean * .62, 2.65, -.02), V3(-.72 + lean, 3.12, -.18), V3(-1.15 + lean, 3.42, -.06)],
    [V3(lean * .8, 3.0, -.04), V3(.28 + lean, 3.65, -.62), V3(.45 + lean, 3.92, -.9)],
  ];
  for (let i = 0; i < branches.length; i += 1) {
    const branch = new THREE.Mesh(createTaperedTube(branches[i], [.18, .11, .035], 8, 14), trunkMat);
    branch.name = `tree_branch_${i}`; branch.castShadow = true; root.add(branch);
  }
  const canopyCenters = [
    V3(lean + .1, 4.0, 0), V3(lean + .8, 3.55, .15), V3(lean - .85, 3.75, -.05),
    V3(lean + .25, 3.6, -.72), V3(lean - .15, 4.35, .15),
  ];
  const canopyParts = canopyCenters.map((center, i) => p => sdfEllipsoid(p, center, V3(1.0 - i * .04, .72 + (i % 2) * .08, .86 - i * .03)));
  const canopyGeo = implicitGeometry(p => unionSdf(canopyParts, p, .28), { min: V3(-2.1, 2.75, -1.75), max: V3(2.15, 5.25, 1.55) }, 34, 65000);
  const canopy = new THREE.Mesh(canopyGeo, leafMat); canopy.name = 'tree_canopy'; canopy.castShadow = true; canopy.receiveShadow = true; root.add(canopy);
  if (variant === 2) {
    const blossomMat = material('tree_blossom', 0xe9a0b5, .82, 0);
    for (let i = 0; i < 18; i += 1) {
      const petal = new THREE.Mesh(new THREE.CircleGeometry(.09 + (i % 3) * .02, 8), blossomMat);
      const a = i * 2.399;
      petal.position.set(Math.cos(a) * (1.15 + (i % 4) * .13) + lean, 3.5 + (i % 5) * .22, Math.sin(a) * .85);
      petal.rotation.set(Math.PI / 2 + Math.sin(a) * .3, a, 0);
      root.add(petal);
    }
  }
  return root;
}

function hash3(x, y, z, seed = 1) {
  const value = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
  return value - Math.floor(value);
}

function createRock(variant = 0) {
  const widthSegments = 24;
  const heightSegments = 16;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const scale = [V3(1.0, .74, .86), V3(.78, 1.0, .72), V3(1.25, .62, .74), V3(.92, .9, 1.15), V3(1.1, .82, .7), V3(.72, .72, 1.2)][variant % 6];
  for (let y = 0; y <= heightSegments; y += 1) {
    const v = y / heightSegments;
    const phi = v * Math.PI;
    for (let x = 0; x <= widthSegments; x += 1) {
      const u = x / widthSegments;
      const theta = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      const noise = 1 + (hash3(Math.round(nx * 4), Math.round(ny * 4), Math.round(nz * 4), variant + 3) - .5) * .28 + Math.sin(theta * (3 + variant % 3)) * Math.sin(phi) * .045;
      positions.push(nx * scale.x * noise, ny * scale.y * noise, nz * scale.z * noise);
      normals.push(nx, ny, nz);
      uvs.push(u, v);
    }
  }
  for (let y = 0; y < heightSegments; y += 1) {
    for (let x = 0; x < widthSegments; x += 1) {
      const a = y * (widthSegments + 1) + x;
      const b = a + widthSegments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices); geo.computeVertexNormals();
  const root = new THREE.Group(); root.name = `rock_variant_${variant}`; root.userData.assetType = 'environment';
  const rock = new THREE.Mesh(geo, material('rock_stone', [0x77786e, 0x867b69, 0x6d756a, 0x7e776b, 0x696e68, 0x8a806f][variant % 6], .92, 0));
  rock.name = 'rock_mesh'; rock.castShadow = true; rock.receiveShadow = true; rock.position.y = scale.y * .72; root.add(rock);
  if (variant % 2 === 0) {
    const moss = new THREE.Mesh(new THREE.CircleGeometry(.55, 18), material('rock_moss', 0x537346, .96, 0));
    moss.name = 'rock_moss'; moss.rotation.x = -Math.PI / 2; moss.position.set(.05, scale.y * 1.52, -.05); moss.scale.set(1.0, .7, 1); root.add(moss);
  }
  return root;
}

function createRuinArch() {
  const root = new THREE.Group(); root.name = 'verdant_ruin_arch'; root.userData.assetType = 'environment';
  const stone = material('ruin_stone', 0x9b8b6f, .92, 0);
  const moss = material('ruin_moss', 0x5f7d49, .98, 0);
  const columnGeo = new RoundedBoxGeometry(.68, 3.4, .78, 6, .14);
  for (const side of [-1, 1]) {
    const column = new THREE.Mesh(columnGeo, stone); column.name = `ruin_column_${side}`; column.position.set(side * 1.55, 1.7, 0); column.rotation.z = side * .035; column.castShadow = true; column.receiveShadow = true; root.add(column);
    const base = new THREE.Mesh(new RoundedBoxGeometry(1.0, .38, 1.08, 4, .11), stone); base.position.set(side * 1.55, .19, 0); base.castShadow = true; base.receiveShadow = true; root.add(base);
    const mossPatch = new THREE.Mesh(new RoundedBoxGeometry(.72, .18, .82, 3, .07), moss); mossPatch.position.set(side * 1.55, 3.28, -.03); root.add(mossPatch);
  }
  const archShape = new THREE.Shape();
  archShape.moveTo(-2.05, 0); archShape.lineTo(-2.05, .62); archShape.absarc(0, .62, 2.05, Math.PI, 0, true); archShape.lineTo(2.05, 0); archShape.lineTo(1.32, 0); archShape.absarc(0, .62, 1.32, 0, Math.PI, false); archShape.closePath();
  const arch = new THREE.Mesh(new THREE.ExtrudeGeometry(archShape, { depth: .72, bevelEnabled: true, bevelSegments: 3, bevelSize: .08, bevelThickness: .08, curveSegments: 24 }), stone);
  arch.name = 'ruin_arch'; arch.position.set(0, 3.35, -.36); arch.castShadow = true; arch.receiveShadow = true; root.add(arch);
  return root;
}

function createWell() {
  const root = new THREE.Group(); root.name = 'verdant_well'; root.userData.assetType = 'prop';
  const stone = material('well_stone', 0xa29578, .9, 0);
  const water = material('well_water', 0x57b9c8, .18, .05, 0x267f9c, .12);
  const blocks = 18;
  for (let i = 0; i < blocks; i += 1) {
    const angle = i / blocks * Math.PI * 2;
    const block = new THREE.Mesh(new RoundedBoxGeometry(.54, .42, .36, 3, .07), stone);
    block.position.set(Math.cos(angle) * 1.04, .32 + (i % 2) * .04, Math.sin(angle) * 1.04);
    block.rotation.y = -angle + Math.PI / 2;
    block.castShadow = true; block.receiveShadow = true; root.add(block);
  }
  const waterMesh = new THREE.Mesh(new THREE.CircleGeometry(.86, 48), water); waterMesh.name = 'well_water'; waterMesh.rotation.x = -Math.PI / 2; waterMesh.position.y = .42; root.add(waterMesh);
  return root;
}

async function exportHeroClass(classId, fileStem) {
  const hero0 = createHero(66, classId);
  await exportGLB(hero0.group, resolve(ASSETS, `models/hero/${fileStem}_lod0.glb`), hero0.animations);
  const hero1 = createHero(46, classId);
  await exportGLB(hero1.group, resolve(ASSETS, `models/hero/${fileStem}_lod1.glb`), hero1.animations);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const aerinOnly = args.has('--aerin-only') || args.has('--knight-only');
  const wizardOnly = args.has('--wizard-only');
  const rogueOnly = args.has('--rogue-only');
  const rangerOnly = args.has('--ranger-only');
  const heroesOnly = args.has('--heroes-only') || wizardOnly || aerinOnly || rogueOnly || rangerOnly;
  const staffOnly = args.has('--staff-only');
  const daggerOnly = args.has('--dagger-only');
  const bowOnly = args.has('--bow-only');

  await mkdir(resolve(ASSETS, 'models/hero'), { recursive: true });
  await mkdir(resolve(ASSETS, 'models/props'), { recursive: true });

  if (staffOnly) {
    await exportGLB(createWeapon('staff'), resolve(ASSETS, 'models/props/weapon_staff.glb'));
    console.log('Staff weapon generation complete.');
    return;
  }

  if (daggerOnly) {
    await exportGLB(createWeapon('dagger'), resolve(ASSETS, 'models/props/weapon_dagger.glb'));
    console.log('Dagger weapon generation complete.');
    return;
  }

  if (bowOnly) {
    await exportGLB(createWeapon('bow'), resolve(ASSETS, 'models/props/weapon_bow.glb'));
    console.log('Bow weapon generation complete.');
    return;
  }

  if (!heroesOnly) {
    await mkdir(resolve(ASSETS, 'models/monsters'), { recursive: true });
    await mkdir(resolve(ASSETS, 'models/environment'), { recursive: true });
  }

  if (aerinOnly) {
    await exportHeroClass('aerin', 'aerin');
  } else if (wizardOnly) {
    await exportHeroClass('wizard', 'wizard');
  } else if (rogueOnly) {
    await exportHeroClass('rogue', 'rogue');
  } else if (rangerOnly) {
    await exportHeroClass('ranger', 'ranger');
  } else if (!args.has('--no-heroes')) {
    await exportHeroClass('aerin', 'aerin');
    await exportHeroClass('wizard', 'wizard');
    await exportHeroClass('rogue', 'rogue');
    await exportHeroClass('ranger', 'ranger');
  }

  if (heroesOnly) {
    console.log('Hero asset generation complete.');
    return;
  }

  for (const kind of ['sword', 'saber', 'greatsword', 'leaf', 'katana', 'relic', 'staff', 'dagger', 'bow']) {
    await exportGLB(createWeapon(kind), resolve(ASSETS, `models/props/weapon_${kind}.glb`));
  }

  const monsterSpecs = [
    ['slime', 58, 40], ['hare', 62, 44], ['boar', 62, 44], ['wisp', 54, 38], ['humanoid', 60, 44], ['colossus', 72, 50],
  ];
  for (const [type, lod0Res, lod1Res] of monsterSpecs) {
    const lod0 = createMonster(type, lod0Res);
    await exportGLB(lod0.group, resolve(ASSETS, `models/monsters/${type}_lod0.glb`), lod0.animations);
    const lod1 = createMonster(type, lod1Res);
    await exportGLB(lod1.group, resolve(ASSETS, `models/monsters/${type}_lod1.glb`), lod1.animations);
  }

  for (let i = 0; i < 4; i += 1) await exportGLB(createTree(i), resolve(ASSETS, `models/environment/tree_${i}.glb`));
  for (let i = 0; i < 6; i += 1) await exportGLB(createRock(i), resolve(ASSETS, `models/environment/rock_${i}.glb`));
  await exportGLB(createRuinArch(), resolve(ASSETS, 'models/environment/ruin_arch.glb'));
  await exportGLB(createWell(), resolve(ASSETS, 'models/props/well.glb'));

  console.log('Asset generation complete.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
