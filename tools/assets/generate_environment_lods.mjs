import * as THREE from '../../vendor/three.module.min.js';
import { GLTFLoader } from '../../vendor/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from '../../vendor/examples/jsm/exporters/GLTFExporter.js';
import { SimplifyModifier } from '../../vendor/examples/jsm/modifiers/SimplifyModifier.js';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
if (!globalThis.self) globalThis.self = globalThis;
if (!globalThis.ProgressEvent) globalThis.ProgressEvent = class ProgressEvent {};
if (!globalThis.FileReader) {
  globalThis.FileReader = class FileReaderPolyfill {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then(v => { this.result = v; this.onload?.({ target: this }); this.onloadend?.({ target: this }); }).catch(e => this.onerror?.(e)); }
    readAsDataURL(blob) { blob.arrayBuffer().then(v => { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(v).toString('base64')}`; this.onload?.({ target: this }); this.onloadend?.({ target: this }); }).catch(e => this.onerror?.(e)); }
  };
}

const loader = new GLTFLoader();
const exporter = new GLTFExporter();
const modifier = new SimplifyModifier();

async function loadGLB(path) {
  const buffer = await readFile(path);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Promise((resolvePromise, rejectPromise) => loader.parse(arrayBuffer, '', resolvePromise, rejectPromise));
}

async function exportGLB(scene, path) {
  scene.updateMatrixWorld(true);
  const data = await new Promise((resolvePromise, rejectPromise) => exporter.parse(scene, resolvePromise, rejectPromise, {
    binary: true, trs: true, onlyVisible: false, includeCustomExtensions: false,
  }));
  await writeFile(path, Buffer.from(data));
}

function simplifyScene(scene, ratio = .34) {
  let before = 0; let after = 0;
  scene.traverse(object => {
    if (!object.isMesh || object.isSkinnedMesh) return;
    const geometry = object.geometry;
    const beforeTris = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    before += beforeTris;
    const vertices = geometry.attributes.position.count;
    if (vertices > 80 && beforeTris > 90) {
      const targetVertices = Math.max(36, Math.floor(vertices * ratio));
      const collapses = Math.max(0, vertices - targetVertices);
      try {
        const simplified = modifier.modify(geometry, collapses);
        simplified.computeVertexNormals();
        simplified.computeBoundingBox(); simplified.computeBoundingSphere();
        object.geometry = simplified;
      } catch (error) {
        console.warn(`Could not simplify ${object.name}:`, error.message);
      }
    }
    const result = object.geometry;
    after += result.index ? result.index.count / 3 : result.attributes.position.count / 3;
  });
  return { before: Math.round(before), after: Math.round(after) };
}

for (let i = 0; i < 4; i += 1) {
  const input = resolve(ROOT, `assets/models/environment/tree_${i}.glb`);
  const output = resolve(ROOT, `assets/models/environment/tree_${i}_lod1.glb`);
  const gltf = await loadGLB(input);
  const stats = simplifyScene(gltf.scene, .34);
  await exportGLB(gltf.scene, output);
  console.log(`tree_${i}: ${stats.before} -> ${stats.after} triangles`);
}
