import * as THREE from '../../vendor/three.module.min.js';
import { GLTFExporter } from '../../vendor/examples/jsm/exporters/GLTFExporter.js';
import { MarchingCubes } from '../../vendor/examples/jsm/objects/MarchingCubes.js';
import { RoundedBoxGeometry } from '../../vendor/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from '../../vendor/examples/jsm/utils/BufferGeometryUtils.js';
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
  for (const name of rotationBones) {
    const values = [];
    for (const frame of frames) {
      const [x, y, z] = frame.rotations?.[name] ?? [0, 0, 0];
      const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
      values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values));
  }
  for (const name of positionBones) {
    const rest = skeletonInfo.restPositions.get(name) ?? new THREE.Vector3();
    const values = [];
    for (const frame of frames) {
      const offset = frame.positions?.[name] ?? [0, 0, 0];
      values.push(rest.x + offset[0], rest.y + offset[1], rest.z + offset[2]);
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, times, values));
  }
  for (const name of scaleBones) {
    const values = [];
    for (const frame of frames) values.push(...(frame.scales?.[name] ?? [1, 1, 1]));
    tracks.push(new THREE.VectorKeyframeTrack(`${name}.scale`, times, values));
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
  ];
  return implicitGeometry(p => unionSdf(parts, p, .105), {
    min: V3(-1.05, -.08, -.62), max: V3(1.05, 3.32, .70),
  }, resolution, 110000);
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
  const rows = 8;
  const cols = 7;
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
      const py = 1.98 - v * .92;
      const pz = -.31 - Math.sin(v * Math.PI) * .11 - Math.abs(u - .5) * .035;
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
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function heroAnimations(skeletonInfo) {
  const F = (time, rotations = {}, positions = {}, scales = {}) => ({ time, rotations, positions, scales });
  const clips = [];
  clips.push(animationClip('idle', 1.6, [
    F(0, { chest: [.015, 0, 0], head: [0, -.025, 0], left_upper_arm: [.03, 0, .08], right_upper_arm: [.03, 0, -.08], cape_root: [.08, 0, 0], hair_root: [-.02, 0, 0] }, { pelvis: [0, 0, 0] }),
    F(.8, { chest: [-.02, .02, 0], head: [.015, .03, 0], left_upper_arm: [-.02, 0, .075], right_upper_arm: [-.02, 0, -.075], cape_root: [.13, .015, 0], hair_root: [.035, 0, 0] }, { pelvis: [0, .025, 0] }),
    F(1.6, { chest: [.015, 0, 0], head: [0, -.025, 0], left_upper_arm: [.03, 0, .08], right_upper_arm: [.03, 0, -.08], cape_root: [.08, 0, 0], hair_root: [-.02, 0, 0] }, { pelvis: [0, 0, 0] }),
  ], skeletonInfo));
  clips.push(animationClip('run', .72, [
    F(0, { chest: [-.10, 0, -.03], spine: [-.05, 0, .04], left_upper_arm: [.62, 0, .08], right_upper_arm: [-.62, 0, -.08], left_upper_leg: [-.72, 0, 0], right_upper_leg: [.72, 0, 0], left_lower_leg: [.35, 0, 0], right_lower_leg: [.9, 0, 0], cape_root: [.38, 0, 0], hair_root: [.12, 0, 0] }, { pelvis: [0, .02, 0] }),
    F(.18, { chest: [-.12, 0, .035], spine: [-.05, 0, -.04], left_upper_arm: [0, 0, .08], right_upper_arm: [0, 0, -.08], left_upper_leg: [-.1, 0, 0], right_upper_leg: [.1, 0, 0], left_lower_leg: [.85, 0, 0], right_lower_leg: [.35, 0, 0], cape_root: [.48, .02, 0], hair_root: [.16, 0, 0] }, { pelvis: [0, .09, 0] }),
    F(.36, { chest: [-.10, 0, .03], spine: [-.05, 0, -.04], left_upper_arm: [-.62, 0, .08], right_upper_arm: [.62, 0, -.08], left_upper_leg: [.72, 0, 0], right_upper_leg: [-.72, 0, 0], left_lower_leg: [.9, 0, 0], right_lower_leg: [.35, 0, 0], cape_root: [.4, 0, 0], hair_root: [.12, 0, 0] }, { pelvis: [0, .02, 0] }),
    F(.54, { chest: [-.12, 0, -.035], spine: [-.05, 0, .04], left_upper_arm: [0, 0, .08], right_upper_arm: [0, 0, -.08], left_upper_leg: [.1, 0, 0], right_upper_leg: [-.1, 0, 0], left_lower_leg: [.35, 0, 0], right_lower_leg: [.85, 0, 0], cape_root: [.48, -.02, 0], hair_root: [.16, 0, 0] }, { pelvis: [0, .09, 0] }),
    F(.72, { chest: [-.10, 0, -.03], spine: [-.05, 0, .04], left_upper_arm: [.62, 0, .08], right_upper_arm: [-.62, 0, -.08], left_upper_leg: [-.72, 0, 0], right_upper_leg: [.72, 0, 0], left_lower_leg: [.35, 0, 0], right_lower_leg: [.9, 0, 0], cape_root: [.38, 0, 0], hair_root: [.12, 0, 0] }, { pelvis: [0, .02, 0] }),
  ], skeletonInfo));
  clips.push(animationClip('sprint', .56, [
    F(0, { chest: [-.23, 0, -.06], spine: [-.12, 0, .06], left_upper_arm: [.86, 0, .1], right_upper_arm: [-.9, 0, -.1], left_upper_leg: [-.9, 0, 0], right_upper_leg: [.92, 0, 0], left_lower_leg: [.45, 0, 0], right_lower_leg: [1.1, 0, 0], cape_root: [.72, 0, 0], hair_root: [.28, 0, 0] }, { pelvis: [0, .02, 0] }),
    F(.14, { chest: [-.25, 0, .04], spine: [-.13, 0, -.05], left_upper_arm: [0, 0, .1], right_upper_arm: [0, 0, -.1], left_upper_leg: [-.12, 0, 0], right_upper_leg: [.12, 0, 0], left_lower_leg: [1.05, 0, 0], right_lower_leg: [.4, 0, 0], cape_root: [.82, .04, 0], hair_root: [.33, 0, 0] }, { pelvis: [0, .13, 0] }),
    F(.28, { chest: [-.23, 0, .06], spine: [-.12, 0, -.06], left_upper_arm: [-.9, 0, .1], right_upper_arm: [.86, 0, -.1], left_upper_leg: [.92, 0, 0], right_upper_leg: [-.9, 0, 0], left_lower_leg: [1.1, 0, 0], right_lower_leg: [.45, 0, 0], cape_root: [.72, 0, 0], hair_root: [.28, 0, 0] }, { pelvis: [0, .02, 0] }),
    F(.42, { chest: [-.25, 0, -.04], spine: [-.13, 0, .05], left_upper_arm: [0, 0, .1], right_upper_arm: [0, 0, -.1], left_upper_leg: [.12, 0, 0], right_upper_leg: [-.12, 0, 0], left_lower_leg: [.4, 0, 0], right_lower_leg: [1.05, 0, 0], cape_root: [.82, -.04, 0], hair_root: [.33, 0, 0] }, { pelvis: [0, .13, 0] }),
    F(.56, { chest: [-.23, 0, -.06], spine: [-.12, 0, .06], left_upper_arm: [.86, 0, .1], right_upper_arm: [-.9, 0, -.1], left_upper_leg: [-.9, 0, 0], right_upper_leg: [.92, 0, 0], left_lower_leg: [.45, 0, 0], right_lower_leg: [1.1, 0, 0], cape_root: [.72, 0, 0], hair_root: [.28, 0, 0] }, { pelvis: [0, .02, 0] }),
  ], skeletonInfo));

  const attacks = [
    ['attack_1', .58, [
      F(0, { pelvis: [0, -.18, 0], chest: [0, -.25, -.08], right_upper_arm: [-.25, -.45, -.35], right_lower_arm: [-.5, 0, -.2] }),
      F(.14, { pelvis: [0, -.36, 0], chest: [-.15, -.48, -.16], right_upper_arm: [-1.15, -.75, -.75], right_lower_arm: [-.8, 0, -.55], left_upper_arm: [.2, .15, .28], cape_root: [.28, -.1, 0] }),
      F(.27, { pelvis: [0, .26, 0], chest: [-.08, .65, .20], right_upper_arm: [-.45, .95, .62], right_lower_arm: [-.2, 0, .55], left_upper_arm: [-.3, -.2, .1], cape_root: [.55, .15, 0] }),
      F(.58, { pelvis: [0, .02, 0], chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], right_lower_arm: [0, 0, 0], left_upper_arm: [.03, 0, .08], cape_root: [.12, 0, 0] }),
    ]],
    ['attack_2', .62, [
      F(0, { chest: [0, .35, .12], right_upper_arm: [-.35, .55, .5], right_lower_arm: [-.5, 0, .35] }),
      F(.16, { pelvis: [0, -.25, 0], chest: [-.12, .58, .22], right_upper_arm: [-1.05, 1.0, .65], right_lower_arm: [-.65, 0, .6], cape_root: [.25, .12, 0] }),
      F(.30, { pelvis: [0, .18, 0], chest: [-.1, -.72, -.25], right_upper_arm: [-.35, -1.05, -.6], right_lower_arm: [-.15, 0, -.5], left_upper_arm: [.15, .2, .32], cape_root: [.52, -.12, 0] }),
      F(.62, { chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], right_lower_arm: [0, 0, 0], left_upper_arm: [.03, 0, .08], cape_root: [.12, 0, 0] }),
    ]],
    ['attack_3', .68, [
      F(0, { pelvis: [0, -.24, 0], chest: [-.05, -.4, -.15], right_upper_arm: [-.8, -.65, -.7], right_lower_arm: [-.7, 0, -.5] }),
      F(.2, { pelvis: [0, -.5, 0], chest: [-.18, -.8, -.3], right_upper_arm: [-1.35, -1.1, -.9], right_lower_arm: [-.9, 0, -.8], left_upper_arm: [.4, .35, .35], cape_root: [.28, -.18, 0] }),
      F(.36, { pelvis: [0, .34, 0], chest: [-.2, .95, .36], right_upper_arm: [-.2, 1.35, .82], right_lower_arm: [.1, 0, .72], left_upper_arm: [-.4, -.3, .12], cape_root: [.66, .2, 0] }),
      F(.68, { chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], right_lower_arm: [0, 0, 0], left_upper_arm: [.03, 0, .08], cape_root: [.12, 0, 0] }),
    ]],
    ['attack_4', .82, [
      F(0, { pelvis: [0, -.35, 0], spine: [-.16, 0, 0], chest: [-.25, -.6, -.22], right_upper_arm: [-1.0, -.75, -.75], right_lower_arm: [-.9, 0, -.65], left_upper_arm: [.65, .4, .45] }),
      F(.24, { pelvis: [0, -.58, 0], spine: [-.28, -.12, 0], chest: [-.38, -1.0, -.38], right_upper_arm: [-1.45, -1.3, -1.0], right_lower_arm: [-1.0, 0, -.9], cape_root: [.35, -.25, 0] }),
      F(.42, { pelvis: [0, .48, .05], spine: [-.1, .35, 0], chest: [-.08, 1.25, .45], right_upper_arm: [.15, 1.5, .95], right_lower_arm: [.28, 0, .8], left_upper_arm: [-.65, -.4, .18], cape_root: [.82, .28, 0] }),
      F(.82, { pelvis: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], right_lower_arm: [0, 0, 0], left_upper_arm: [.03, 0, .08], cape_root: [.12, 0, 0] }),
    ]],
    // Extended chain — spin / cross / thrust variants for high-level combos
    ['attack_5', .72, [
      F(0, { pelvis: [0, -.2, 0], chest: [0, -.5, -.12], right_upper_arm: [-.9, -.5, -.6], left_upper_arm: [.3, .2, .3] }),
      F(.2, { pelvis: [0, 1.2, 0], spine: [0, 1.0, 0], chest: [-.1, 1.8, .1], right_upper_arm: [-.3, 1.6, .5], left_upper_arm: [-.4, -1.0, -.3], cape_root: [.7, .2, 0] }),
      F(.42, { pelvis: [0, 2.4, 0], spine: [0, 2.0, 0], chest: [-.1, 2.8, -.15], right_upper_arm: [-.5, 2.4, -.6], left_upper_arm: [.4, 1.2, .4], cape_root: [.95, -.2, 0] }),
      F(.72, { pelvis: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], left_upper_arm: [.03, 0, .08], cape_root: [.12, 0, 0] }),
    ]],
    ['attack_6', .7, [
      F(0, { chest: [-.1, .4, .1], right_upper_arm: [-.5, .7, .4], left_upper_arm: [.2, -.2, .2] }),
      F(.22, { pelvis: [0, -.4, 0], chest: [-.25, -.9, -.3], right_upper_arm: [-1.4, -1.1, -.9], left_upper_arm: [.5, .4, .4], cape_root: [.4, -.2, 0] }),
      F(.4, { pelvis: [0, .35, 0], chest: [-.15, 1.1, .4], right_upper_arm: [.1, 1.4, .9], left_upper_arm: [-.5, -.3, .15], cape_root: [.75, .25, 0] }),
      F(.7, { chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], left_upper_arm: [.03, 0, .08], cape_root: [.12, 0, 0] }),
    ]],
    ['attack_7', .88, [
      F(0, { pelvis: [0, -.4, 0], spine: [-.2, 0, 0], chest: [-.3, -.7, -.25], right_upper_arm: [-1.2, -.9, -.85], left_upper_arm: [.7, .45, .5] }),
      F(.28, { pelvis: [0, -.65, 0], spine: [-.35, -.15, 0], chest: [-.42, -1.15, -.4], right_upper_arm: [-1.55, -1.4, -1.05], cape_root: [.4, -.3, 0] }),
      F(.48, { pelvis: [0, .55, .08], spine: [-.08, .4, 0], chest: [-.05, 1.4, .5], right_upper_arm: [.25, 1.65, 1.0], left_upper_arm: [-.75, -.45, .2], cape_root: [.9, .3, 0] }),
      F(.88, { pelvis: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], left_upper_arm: [.03, 0, .08], cape_root: [.12, 0, 0] }),
    ]],
  ];
  for (const [name, duration, frames] of attacks) clips.push(animationClip(name, duration, frames, skeletonInfo));

  clips.push(animationClip('dodge', .52, [
    F(0, { pelvis: [-.08, 0, 0], spine: [-.12, 0, 0], chest: [-.15, 0, 0], left_upper_arm: [.2, 0, .25], right_upper_arm: [.2, 0, -.25] }, { pelvis: [0, 0, 0] }),
    F(.18, { pelvis: [-.58, .7, 0], spine: [-.42, .4, 0], chest: [-.5, .8, 0], left_upper_arm: [1.0, .3, .55], right_upper_arm: [1.0, -.3, -.55], cape_root: [1.0, 0, 0] }, { pelvis: [0, -.28, .12] }),
    F(.36, { pelvis: [-.34, 1.8, 0], spine: [-.25, 1.0, 0], chest: [-.2, 1.7, 0], left_upper_arm: [.55, .2, .3], right_upper_arm: [.55, -.2, -.3], cape_root: [.72, 0, 0] }, { pelvis: [0, -.12, .05] }),
    F(.52, { pelvis: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], left_upper_arm: [.03, 0, .08], right_upper_arm: [.03, 0, -.08], cape_root: [.12, 0, 0] }, { pelvis: [0, 0, 0] }),
  ], skeletonInfo));
  clips.push(animationClip('hit', .34, [
    F(0, { chest: [0, 0, 0], head: [0, 0, 0] }),
    F(.09, { pelvis: [.1, .12, 0], spine: [.22, 0, -.1], chest: [.38, 0, -.18], head: [-.25, 0, .12], left_upper_arm: [-.3, 0, .25], right_upper_arm: [-.3, 0, -.25] }, { pelvis: [0, -.06, -.08] }),
    F(.34, { pelvis: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], left_upper_arm: [.03, 0, .08], right_upper_arm: [.03, 0, -.08] }, { pelvis: [0, 0, 0] }),
  ], skeletonInfo));
  clips.push(animationClip('death', 1.15, [
    F(0, { chest: [0, 0, 0], head: [0, 0, 0] }),
    F(.28, { pelvis: [-.2, .12, 0], spine: [-.35, 0, 0], chest: [-.45, 0, 0], head: [.24, 0, 0], left_upper_arm: [-.6, 0, .4], right_upper_arm: [-.6, 0, -.4] }, { pelvis: [0, -.12, -.08] }),
    F(.72, { pelvis: [-1.25, .1, 0], spine: [-.55, 0, 0], chest: [-.48, 0, 0], head: [.15, 0, 0], left_upper_arm: [-1.0, 0, .2], right_upper_arm: [-1.0, 0, -.2], cape_root: [.7, 0, 0] }, { pelvis: [0, -.82, -.15] }),
    F(1.15, { pelvis: [-1.45, .1, 0], spine: [-.65, 0, 0], chest: [-.55, 0, 0], head: [.1, 0, 0], left_upper_arm: [-1.2, 0, .15], right_upper_arm: [-1.2, 0, -.15], cape_root: [.9, 0, 0] }, { pelvis: [0, -.94, -.22] }),
  ], skeletonInfo));

  clips.push(animationClip('skill_whirlwind', 1.05, [
    F(0, { chest: [-.1, -.35, -.15], right_upper_arm: [-.8, -.65, -.7], left_upper_arm: [.2, .25, .3] }),
    F(.24, { pelvis: [0, -.6, 0], spine: [-.25, -.8, 0], chest: [-.3, -1.25, -.3], right_upper_arm: [-1.45, -1.2, -.95], left_upper_arm: [.6, .65, .5], cape_root: [.5, -.3, 0] }),
    F(.52, { pelvis: [0, 1.7, 0], spine: [-.12, 1.6, 0], chest: [-.12, 2.3, .25], right_upper_arm: [-.2, 2.0, .8], left_upper_arm: [-.6, -1.4, -.4], cape_root: [1.0, .4, 0] }),
    F(.78, { pelvis: [0, 3.6, 0], spine: [-.1, 2.7, 0], chest: [-.1, 3.8, -.2], right_upper_arm: [-.4, 3.0, -.7], left_upper_arm: [.5, 1.7, .45], cape_root: [1.15, -.35, 0] }),
    F(1.05, { pelvis: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], left_upper_arm: [.03, 0, .08], cape_root: [.12, 0, 0] }),
  ], skeletonInfo));
  clips.push(animationClip('skill_crescent', .88, [
    F(0, { pelvis: [0, -.25, 0], chest: [-.08, -.6, -.2], right_upper_arm: [-1.0, -.85, -.8], right_lower_arm: [-.8, 0, -.6] }),
    F(.28, { pelvis: [0, -.52, 0], spine: [-.28, -.25, 0], chest: [-.35, -1.0, -.35], right_upper_arm: [-1.55, -1.35, -1.05], right_lower_arm: [-1.0, 0, -.85], cape_root: [.42, -.22, 0] }),
    F(.43, { pelvis: [0, .4, .12], spine: [-.12, .4, 0], chest: [-.12, 1.18, .38], right_upper_arm: [.12, 1.45, .95], right_lower_arm: [.2, 0, .8], cape_root: [.82, .28, 0] }),
    F(.88, { pelvis: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], right_lower_arm: [0, 0, 0], cape_root: [.12, 0, 0] }),
  ], skeletonInfo));
  clips.push(animationClip('skill_skyfall', 1.15, [
    F(0, { pelvis: [-.15, 0, 0], chest: [-.2, 0, 0], right_upper_arm: [-.6, 0, -.4], left_upper_arm: [-.6, 0, .4] }),
    F(.3, { pelvis: [-.65, 0, 0], spine: [-.3, 0, 0], chest: [-.35, 0, 0], right_upper_arm: [-1.45, 0, -.9], left_upper_arm: [-1.45, 0, .9], cape_root: [.8, 0, 0] }, { root: [0, 1.35, 0] }),
    F(.62, { pelvis: [.18, 0, 0], spine: [.12, 0, 0], chest: [.18, 0, 0], right_upper_arm: [.35, 0, -.55], left_upper_arm: [.35, 0, .55], cape_root: [1.05, 0, 0] }, { root: [0, 2.8, .2] }),
    F(.82, { pelvis: [-.75, 0, 0], spine: [-.45, 0, 0], chest: [-.55, 0, 0], right_upper_arm: [-1.4, 0, -.25], left_upper_arm: [-1.1, 0, .25], cape_root: [.5, 0, 0] }, { root: [0, .1, .45] }),
    F(1.15, { pelvis: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], left_upper_arm: [.03, 0, .08], cape_root: [.12, 0, 0] }, { root: [0, 0, 0] }),
  ], skeletonInfo));
  clips.push(animationClip('skill_starburst', 1.45, [
    F(0, { chest: [-.1, 0, 0], right_upper_arm: [-.5, 0, -.3], left_upper_arm: [-.5, 0, .3] }),
    F(.35, { pelvis: [-.35, 0, 0], spine: [-.25, 0, 0], chest: [-.28, 0, 0], right_upper_arm: [-1.55, 0, -.95], left_upper_arm: [-1.55, 0, .95], right_lower_arm: [-.65, 0, -.25], left_lower_arm: [-.65, 0, .25], cape_root: [.7, 0, 0] }, { pelvis: [0, -.1, 0] }),
    F(.72, { pelvis: [.12, 0, 0], spine: [.1, 0, 0], chest: [.14, 0, 0], right_upper_arm: [-2.55, 0, -.35], left_upper_arm: [-2.55, 0, .35], right_lower_arm: [-.25, 0, 0], left_lower_arm: [-.25, 0, 0], cape_root: [1.0, 0, 0] }, { pelvis: [0, .14, 0] }),
    F(1.08, { pelvis: [-.25, 0, 0], spine: [-.18, 0, 0], chest: [-.2, 0, 0], right_upper_arm: [-.9, 1.6, -.5], left_upper_arm: [-.9, -1.6, .5], cape_root: [.85, .4, 0] }),
    F(1.45, { pelvis: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], left_upper_arm: [.03, 0, .08], cape_root: [.12, 0, 0] }),
  ], skeletonInfo));

  // Wizard-unique cast / skill clips (not aliases of knight skills)
  clips.push(animationClip('cast_1', .55, [
    F(0, { chest: [-.05, 0, 0], right_upper_arm: [-.4, 0, -.25], left_upper_arm: [-.35, 0, .25] }),
    F(.18, { chest: [-.12, 0, 0], right_upper_arm: [-1.1, -.2, -.5], left_upper_arm: [-.5, .15, .35], right_lower_arm: [-.5, 0, -.2] }),
    F(.32, { chest: [-.08, .15, .1], right_upper_arm: [-.55, .6, .45], left_upper_arm: [-.3, -.1, .2], right_lower_arm: [-.15, 0, .35] }),
    F(.55, { chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], left_upper_arm: [.03, 0, .08], right_lower_arm: [0, 0, 0] }),
  ], skeletonInfo));
  clips.push(animationClip('cast_2', .58, [
    F(0, { right_upper_arm: [-.3, .3, .2], left_upper_arm: [-.3, -.2, .2] }),
    F(.2, { chest: [-.1, 0, 0], right_upper_arm: [-1.2, .4, .3], left_upper_arm: [-.8, -.3, .25] }),
    F(.35, { chest: [-.05, .2, 0], right_upper_arm: [-.4, .9, .55], left_upper_arm: [-.25, .2, .3] }),
    F(.58, { right_upper_arm: [.03, 0, -.08], left_upper_arm: [.03, 0, .08], chest: [0, 0, 0] }),
  ], skeletonInfo));
  clips.push(animationClip('cast_3', .62, [
    F(0, { right_upper_arm: [-.6, 0, -.3], left_upper_arm: [-.6, 0, .3] }),
    F(.22, { pelvis: [0, -.15, 0], right_upper_arm: [-1.4, 0, -.55], left_upper_arm: [-1.35, 0, .55] }),
    F(.4, { chest: [.1, 0, 0], right_upper_arm: [-.7, .5, .2], left_upper_arm: [-.7, -.5, .2] }),
    F(.62, { pelvis: [0, 0, 0], chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], left_upper_arm: [.03, 0, .08] }),
  ], skeletonInfo));
  clips.push(animationClip('cast_4', .75, [
    F(0, { spine: [-.1, 0, 0], right_upper_arm: [-.8, 0, -.4], left_upper_arm: [-.8, 0, .4] }),
    F(.28, { spine: [-.2, 0, 0], chest: [-.15, 0, 0], right_upper_arm: [-1.8, 0, -.6], left_upper_arm: [-1.8, 0, .6] }, { pelvis: [0, .1, 0] }),
    F(.48, { spine: [.05, 0, 0], right_upper_arm: [-.5, .8, .3], left_upper_arm: [-.5, -.8, .3] }),
    F(.75, { spine: [0, 0, 0], chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], left_upper_arm: [.03, 0, .08] }, { pelvis: [0, 0, 0] }),
  ], skeletonInfo));
  clips.push(animationClip('skill_fireball', .95, [
    F(0, { chest: [-.08, 0, 0], right_upper_arm: [-.7, -.2, -.4], left_upper_arm: [-.3, .15, .25] }),
    F(.28, { pelvis: [0, -.2, 0], chest: [-.2, -.3, -.1], right_upper_arm: [-1.5, -.6, -.75], right_lower_arm: [-.7, 0, -.4], cape_root: [.35, -.1, 0] }),
    F(.48, { pelvis: [0, .15, 0], chest: [-.05, .5, .2], right_upper_arm: [-.2, 1.1, .7], right_lower_arm: [.1, 0, .55], left_upper_arm: [-.4, -.2, .15], cape_root: [.55, .15, 0] }),
    F(.95, { pelvis: [0, 0, 0], chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], right_lower_arm: [0, 0, 0], left_upper_arm: [.03, 0, .08], cape_root: [.12, 0, 0] }),
  ], skeletonInfo));
  clips.push(animationClip('skill_frost_nova', 1.0, [
    F(0, { right_upper_arm: [-.5, 0, -.3], left_upper_arm: [-.5, 0, .3] }),
    F(.25, { pelvis: [0, -.25, 0], chest: [-.15, 0, 0], right_upper_arm: [-1.2, .4, -.2], left_upper_arm: [-1.2, -.4, .2] }),
    F(.48, { pelvis: [0, .1, 0], chest: [.08, 0, 0], right_upper_arm: [-.35, 1.0, .55], left_upper_arm: [-.35, -1.0, .55], cape_root: [.5, 0, 0] }),
    F(1.0, { pelvis: [0, 0, 0], chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], left_upper_arm: [.03, 0, .08], cape_root: [.12, 0, 0] }),
  ], skeletonInfo));
  clips.push(animationClip('skill_blink', 1.1, [
    F(0, { pelvis: [-.1, 0, 0], chest: [-.15, 0, 0], right_upper_arm: [-.5, 0, -.25], left_upper_arm: [-.5, 0, .25] }),
    F(.28, { pelvis: [-.55, 0, 0], spine: [-.25, 0, 0], right_upper_arm: [-1.3, 0, -.5], left_upper_arm: [-1.3, 0, .5], cape_root: [.7, 0, 0] }, { root: [0, .4, 0] }),
    F(.52, { pelvis: [.1, 0, 0], spine: [.08, 0, 0], right_upper_arm: [-.2, .4, .2], left_upper_arm: [-.2, -.4, .2] }, { root: [0, 1.2, .15] }),
    F(.78, { pelvis: [-.2, 0, 0], right_upper_arm: [-.8, 0, -.2], left_upper_arm: [-.8, 0, .2], cape_root: [.45, 0, 0] }, { root: [0, .05, .3] }),
    F(1.1, { pelvis: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], left_upper_arm: [.03, 0, .08], cape_root: [.12, 0, 0] }, { root: [0, 0, 0] }),
  ], skeletonInfo));
  clips.push(animationClip('skill_meteor', 1.5, [
    F(0, { chest: [-.12, 0, 0], right_upper_arm: [-.6, 0, -.35], left_upper_arm: [-.6, 0, .35] }),
    F(.4, { pelvis: [-.3, 0, 0], spine: [-.22, 0, 0], right_upper_arm: [-1.7, 0, -.7], left_upper_arm: [-1.7, 0, .7], cape_root: [.65, 0, 0] }, { pelvis: [0, -.08, 0] }),
    F(.85, { pelvis: [.08, 0, 0], spine: [.08, 0, 0], right_upper_arm: [-2.2, .3, -.2], left_upper_arm: [-2.2, -.3, .2], cape_root: [.95, 0, 0] }, { pelvis: [0, .12, 0] }),
    F(1.2, { right_upper_arm: [-1.0, 1.2, -.4], left_upper_arm: [-1.0, -1.2, .4], cape_root: [.8, .25, 0] }),
    F(1.5, { pelvis: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], right_upper_arm: [.03, 0, -.08], left_upper_arm: [.03, 0, .08], cape_root: [.12, 0, 0] }),
  ], skeletonInfo));
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
    new THREE.CylinderGeometry(.58, .62, .05, 28),
    material('hero_cloth', profile.cloth, .86, 0),
  );
  brim.name = 'wizard_hat_brim';
  brim.position.set(0, .22, -.02);
  brim.castShadow = true;
  hatRoot.add(brim);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(.34, .95, 24),
    material('hero_cloth', profile.cloth, .84, 0),
  );
  cone.name = 'wizard_hat_cone';
  cone.position.set(0, .72, -.04);
  cone.rotation.x = -.12;
  cone.castShadow = true;
  hatRoot.add(cone);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(.07, 12, 10),
    material('hero_trim', profile.trim, .4, .7),
  );
  tip.name = 'wizard_hat_tip';
  tip.position.set(0, 1.2, -.12);
  hatRoot.add(tip);
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(.28, .035, 8, 28),
    material('hero_trim', profile.trim, .42, .72),
  );
  band.name = 'wizard_hat_band';
  band.rotation.x = Math.PI / 2;
  band.position.set(0, .38, -.02);
  hatRoot.add(band);
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

  const dome = new THREE.Mesh(new THREE.SphereGeometry(.44, 20, 16, 0, Math.PI * 2, 0, Math.PI * .62), steel);
  dome.name = 'knight_helm_dome';
  dome.position.set(0, .14, -.02);
  dome.scale.set(1.05, 1.12, 1.08);
  dome.castShadow = true;
  root.add(dome);

  const brow = new THREE.Mesh(new RoundedBoxGeometry(.72, .1, .22, 2, .03), dark);
  brow.position.set(0, .08, .28);
  root.add(brow);

  // Open face window — dark recess (face still readable underneath).
  const visor = new THREE.Mesh(new RoundedBoxGeometry(.5, .18, .08, 2, .02), dark);
  visor.position.set(0, -.02, .36);
  root.add(visor);

  const cheekL = new THREE.Mesh(new RoundedBoxGeometry(.12, .28, .18, 2, .03), steel);
  cheekL.position.set(.28, -.08, .22);
  root.add(cheekL);
  const cheekR = cheekL.clone();
  cheekR.position.x = -.28;
  root.add(cheekR);

  const jaw = new THREE.Mesh(new THREE.CylinderGeometry(.22, .28, .16, 12), steel);
  jaw.position.set(0, -.22, .12);
  jaw.rotation.x = .15;
  root.add(jaw);

  const crest = new THREE.Mesh(new THREE.BoxGeometry(.06, .22, .5), gold);
  crest.position.set(0, .42, -.06);
  root.add(crest);

  const plume = new THREE.Mesh(new THREE.ConeGeometry(.12, .7, 8), plumeMat);
  plume.position.set(0, .78, -.18);
  plume.rotation.x = .35;
  plume.castShadow = true;
  root.add(plume);
  const plumeTip = new THREE.Mesh(new THREE.SphereGeometry(.08, 10, 8), plumeMat);
  plumeTip.position.set(0, 1.12, -.32);
  root.add(plumeTip);

  root.position.set(0, .04, 0);
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
    group.add(makeSkinnedMesh(geometry, mats[i], skeletonInfo.skeleton, `hero_body_${i}`));
  }
  const outlineMat = new THREE.MeshBasicMaterial({ name: 'outline_proxy', color: profile.outline, transparent: true, opacity: .001, depthWrite: false, side: THREE.BackSide });
  const outline = makeSkinnedMesh(body.clone(), outlineMat, skeletonInfo.skeleton, 'hero_outline_proxy');
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
  const browGeo = new THREE.BoxGeometry(isKnight ? .16 : .18, isKnight ? .035 : .025, .018);
  const browL = addSurfaceDetail(group, headBone, 'brow_L', browGeo, material('hero_brow', profile.brow, .9, 0), [.185, .245, .44], [0, 0, isKnight ? -.2 : -.12]);
  const browR = addSurfaceDetail(group, headBone, 'brow_R', browGeo, browL.material, [-.185, .245, .44], [0, 0, isKnight ? .2 : .12]);
  void browR;
  const mouthCurve = new THREE.QuadraticBezierCurve3(V3(-.11, -.06, .447), V3(0, isKnight ? -.08 : -.11, .457), V3(.11, -.06, .447));
  addSurfaceDetail(group, headBone, 'mouth', new THREE.TubeGeometry(mouthCurve, 12, .012, 5, false), material('hero_mouth', profile.mouth, .72, 0), [0, 0, 0]);

  const hairParts = heroHairParts(profile.hairStyle);
  const hairGeometry = implicitGeometry(p => unionSdf(hairParts, p, .08), { min: V3(-.65, -.72, -.62), max: V3(.65, .68, .48) }, Math.max(34, resolution - 10), 50000);
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
    const collar = new THREE.Mesh(new THREE.TorusGeometry(.39, .055, 8, 36), material('hero_trim', profile.trim, .42, .72));
    collar.name = 'hero_collar';
    collar.rotation.x = Math.PI / 2;
    collar.scale.z = .72;
    collar.position.set(0, .27, .015);
    skeletonInfo.bones.get('chest').add(collar);
  }
  const belt = new THREE.Mesh(new THREE.TorusGeometry(.43, .055, 8, 40), material('hero_belt', profile.belt, .7, .05));
  belt.name = 'hero_belt';
  belt.rotation.x = Math.PI / 2;
  belt.scale.z = .72;
  belt.position.set(0, -.19, .01);
  skeletonInfo.bones.get('pelvis').add(belt);
  const buckle = new THREE.Mesh(new RoundedBoxGeometry(.18, .16, .06, 3, .035), material('hero_buckle', profile.buckle, .35, .85));
  buckle.name = 'hero_buckle';
  buckle.position.set(0, -.19, .36);
  skeletonInfo.bones.get('pelvis').add(buckle);

  if (profileId === 'wizard') {
    // Soft robe flare on lower body via leather-role sash trim.
    const sash = new THREE.Mesh(new THREE.TorusGeometry(.48, .04, 8, 36), material('hero_trim', profile.trim, .5, .55));
    sash.name = 'wizard_sash';
    sash.rotation.x = Math.PI / 2;
    sash.scale.set(1, 1, .78);
    sash.position.set(0, -.05, .02);
    skeletonInfo.bones.get('pelvis').add(sash);
  }

  const socket = skeletonInfo.bones.get('weapon_socket');
  socket.userData.socket = 'weapon';
  const animations = heroAnimations(skeletonInfo);
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
    relic: [[-.16, 0], [-width * .72, length * .2], [-width, length * .62], [-width * .36, length * .82], [0, length], [width * .36, length * .82], [width, length * .62], [width * .72, length * .2], [.16, 0]],
  }[kind] ?? [];
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return shape;
}

function createWeapon(kind) {
  if (kind === 'staff') return createStaff();
  const specs = {
    sword: { length: 1.55, width: .18 },
    saber: { length: 1.62, width: .18 },
    greatsword: { length: 1.78, width: .28 },
    leaf: { length: 1.58, width: .24 },
    katana: { length: 1.72, width: .14 },
    relic: { length: 1.76, width: .25 },
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
    ];
    return implicitGeometry(p => unionSdf(parts, p, .16), { min: V3(-1.0, -.05, -.9), max: V3(1.0, 1.45, .9) }, resolution, 60000);
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
    ];
    return implicitGeometry(p => unionSdf(parts, p, .105), { min: V3(-.9, -.05, -1.1), max: V3(.9, 2.35, 1.15) }, resolution, 85000);
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
    ];
    return implicitGeometry(p => unionSdf(parts, p, .12), { min: V3(-1.05, -.05, -1.55), max: V3(1.05, 1.85, 1.75) }, resolution, 90000);
  }
  if (type === 'wisp') {
    const parts = [
      p => sdfEllipsoid(p, V3(0, .92, 0), V3(.48, .58, .45)),
      p => sdfCapsule(p, V3(0, .58, 0), V3(0, .12, 0), .34, .06),
      p => sdfCapsule(p, V3(.28, .98, 0), V3(.62, 1.24, -.08), .16, .05),
      p => sdfCapsule(p, V3(-.28, .98, 0), V3(-.62, 1.24, -.08), .16, .05),
    ];
    return implicitGeometry(p => unionSdf(parts, p, .10), { min: V3(-.85, -.05, -.65), max: V3(.85, 1.75, .65) }, resolution, 60000);
  }
  if (type === 'humanoid') {
    const parts = [
      p => sdfEllipsoid(p, V3(0, 1.55, 0), V3(.62, .72, .42)),
      p => sdfEllipsoid(p, V3(0, 2.25, .06), V3(.46, .50, .42)),
      p => sdfCapsule(p, V3(.50, 1.88, 0), V3(.88, 1.12, .02), .23, .17),
      p => sdfCapsule(p, V3(-.50, 1.88, 0), V3(-.88, 1.12, .02), .23, .17),
      p => sdfCapsule(p, V3(.28, 1.10, 0), V3(.32, .18, .10), .28, .16),
      p => sdfCapsule(p, V3(-.28, 1.10, 0), V3(-.32, .18, .10), .28, .16),
    ];
    return implicitGeometry(p => unionSdf(parts, p, .11), { min: V3(-1.15, -.05, -.72), max: V3(1.15, 2.95, .78) }, resolution, 90000);
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
    ];
    return implicitGeometry(p => unionSdf(parts, p, .14), { min: V3(-1.65, -.05, -.92), max: V3(1.65, 4.05, 1.0) }, resolution, 150000);
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
  const geometry = monsterGeometry(type, resolution);
  const { rules, selector } = monsterSkinRules(type, skeletonInfo);
  applySkinWeights(geometry, skeletonInfo, rules, selector);
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
    addSurfaceDetail(group, headBone, `${type}_eye_l`, eyeGeo, type === 'wisp' ? eyeGlow : eyeMat, [.18, .02, type === 'wisp' ? .40 : .46], [0, 0, 0], [1, 1.25, 1]);
    addSurfaceDetail(group, headBone, `${type}_eye_r`, eyeGeo, type === 'wisp' ? eyeGlow : eyeMat, [-.18, .02, type === 'wisp' ? .40 : .46], [0, 0, 0], [1, 1.25, 1]);
  } else if (type === 'hare') {
    addSurfaceDetail(group, headBone, 'hare_eye_l', eyeGeo, eyeMat, [.23, .08, .34], [0, 0, 0], [1, 1.2, 1]);
    addSurfaceDetail(group, headBone, 'hare_eye_r', eyeGeo, eyeMat, [-.23, .08, .34], [0, 0, 0], [1, 1.2, 1]);
    const hornMat = material('monster_accent', 0xe7db9f, .65, 0);
    const hornCurveL = new THREE.CatmullRomCurve3([V3(.18, .25, .22), V3(.25, .45, .18), V3(.16, .62, .08)]);
    const hornCurveR = new THREE.CatmullRomCurve3([V3(-.18, .25, .22), V3(-.25, .45, .18), V3(-.16, .62, .08)]);
    addSurfaceDetail(group, headBone, 'hare_horn_l', new THREE.TubeGeometry(hornCurveL, 12, .035, 7, false), hornMat, [0, 0, 0]);
    addSurfaceDetail(group, headBone, 'hare_horn_r', new THREE.TubeGeometry(hornCurveR, 12, .035, 7, false), hornMat, [0, 0, 0]);
  } else if (type === 'boar') {
    addSurfaceDetail(group, headBone, 'boar_eye_l', eyeGeo, eyeMat, [.25, .10, .32]);
    addSurfaceDetail(group, headBone, 'boar_eye_r', eyeGeo, eyeMat, [-.25, .10, .32]);
    const tuskMat = material('monster_accent', 0xe7d9b0, .58, 0);
    const tuskL = new THREE.CatmullRomCurve3([V3(.22, -.05, .31), V3(.30, -.12, .50), V3(.23, .05, .62)]);
    const tuskR = new THREE.CatmullRomCurve3([V3(-.22, -.05, .31), V3(-.30, -.12, .50), V3(-.23, .05, .62)]);
    addSurfaceDetail(group, headBone, 'boar_tusk_l', new THREE.TubeGeometry(tuskL, 12, .045, 7, false), tuskMat, [0, 0, 0]);
    addSurfaceDetail(group, headBone, 'boar_tusk_r', new THREE.TubeGeometry(tuskR, 12, .045, 7, false), tuskMat, [0, 0, 0]);
  } else {
    addSurfaceDetail(group, headBone, `${type}_eye_l`, eyeGeo, type === 'colossus' ? eyeGlow : eyeMat, [.21, .06, .43], [0, 0, 0], [1, 1.2, 1]);
    addSurfaceDetail(group, headBone, `${type}_eye_r`, eyeGeo, type === 'colossus' ? eyeGlow : eyeMat, [-.21, .06, .43], [0, 0, 0], [1, 1.2, 1]);
  }
  if (type === 'colossus') {
    const mossMat = material('monster_moss', 0x6e9b4a, .95, 0);
    for (let i = 0; i < 5; i += 1) {
      const leafShape = new THREE.Shape();
      leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(.16, .18, 0, .42); leafShape.quadraticCurveTo(-.16, .18, 0, 0);
      const leaf = new THREE.Mesh(new THREE.ShapeGeometry(leafShape, 8), mossMat);
      leaf.name = `moss_leaf_${i}`;
      leaf.position.set((i - 2) * .17, .36 + (i % 2) * .12, -.18 - i * .025);
      leaf.rotation.set(-.25, i * .45, (i - 2) * .18);
      headBone.add(leaf);
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
  const hero0 = createHero(52, classId);
  await exportGLB(hero0.group, resolve(ASSETS, `models/hero/${fileStem}_lod0.glb`), hero0.animations);
  const hero1 = createHero(38, classId);
  await exportGLB(hero1.group, resolve(ASSETS, `models/hero/${fileStem}_lod1.glb`), hero1.animations);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const aerinOnly = args.has('--aerin-only') || args.has('--knight-only');
  const wizardOnly = args.has('--wizard-only');
  const heroesOnly = args.has('--heroes-only') || wizardOnly || aerinOnly;
  const staffOnly = args.has('--staff-only');

  await mkdir(resolve(ASSETS, 'models/hero'), { recursive: true });
  await mkdir(resolve(ASSETS, 'models/props'), { recursive: true });

  if (staffOnly) {
    await exportGLB(createWeapon('staff'), resolve(ASSETS, 'models/props/weapon_staff.glb'));
    console.log('Staff weapon generation complete.');
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
  } else if (!args.has('--no-heroes')) {
    await exportHeroClass('aerin', 'aerin');
    await exportHeroClass('wizard', 'wizard');
  }

  if (heroesOnly) {
    console.log('Hero asset generation complete.');
    return;
  }

  for (const kind of ['sword', 'saber', 'greatsword', 'leaf', 'katana', 'relic', 'staff']) {
    await exportGLB(createWeapon(kind), resolve(ASSETS, `models/props/weapon_${kind}.glb`));
  }

  const monsterSpecs = [
    ['slime', 46, 32], ['hare', 48, 34], ['boar', 48, 34], ['wisp', 42, 30], ['humanoid', 46, 34], ['colossus', 58, 40],
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
