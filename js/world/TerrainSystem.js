import * as THREE from 'three';
import { GAME_CONFIG } from '../config.js';
import { ZONES } from '../data/content.js';
import { fbm, smoothstep } from '../core/Utils.js';

const LAYERS = Object.freeze(['grass', 'dirt', 'sand', 'stone', 'path', 'cliff']);

function shaderTextureUniforms(assetManager) {
  const uniforms = {};
  // Color maps only — normal/roughness multi-maps blew past WebGL's 16 texture unit limit
  // and triplanar sampling made each pixel do ~50+ texture() calls.
  for (const layer of LAYERS) {
    const cap = layer[0].toUpperCase() + layer.slice(1);
    uniforms[`u${cap}Color`] = { value: assetManager.getTexture(`terrain.${layer}.baseColor`) };
  }
  return uniforms;
}

export class TerrainSystem {
  constructor(scene, assetManager, quality = 'high') {
    this.scene = scene;
    this.assets = assetManager;
    this.quality = quality;
    this.size = GAME_CONFIG.terrainSize;
    this.radius = GAME_CONFIG.worldRadius;
    this.group = new THREE.Group();
    this.group.name = 'TerrainSystem';
    scene.add(this.group);
    this.mesh = this.#buildMesh();
    this.group.add(this.mesh);
  }

  heightAt(x, z) {
    const radial = Math.hypot(x, z);
    const broad = (fbm(x * .0105, z * .0105, 13) - .5) * 8.2;
    const fine = (fbm(x * .035, z * .035, 31) - .5) * 1.65;
    const ridges = Math.max(0, fbm(x * .017 + 8, z * .017 - 4, 73) - .57) * 12;
    let height = broad + fine + ridges;

    // Readable central hunting ground and camp, surrounded by hand-shaped rises.
    const campFlatten = 1 - smoothstep(12, 25, radial);
    height *= 1 - campFlatten * .92;
    const arena1 = Math.hypot(x - 25, z + 5);
    height *= 1 - (1 - smoothstep(9, 18, arena1)) * .55;
    const arena2 = Math.hypot(x + 32, z - 18);
    height *= 1 - (1 - smoothstep(10, 20, arena2)) * .45;

    // Distinct biome topography.
    if (x > 45) height += Math.max(0, (x - 45) / 55) * 5.2;
    if (z < -55) height += Math.max(0, (-z - 55) / 70) * 3.8;
    if (z > 58) height += Math.max(0, (z - 58) / 70) * 2.7;
    if (x < -55) height += Math.sin((x + z) * .032) * 1.2;

    const edge = smoothstep(this.radius - 26, this.radius + 4, radial);
    height += edge * edge * 18;
    return height;
  }

  /** Nearest biome by center distance scaled by each zone's radius. */
  zoneAt(x, z) {
    let best = ZONES.verdant;
    let bestScore = Infinity;
    for (const zone of Object.values(ZONES)) {
      const [cx, cz] = zone.center;
      const score = Math.hypot(x - cx, z - cz) / Math.max(zone.radius, 1);
      if (score < bestScore) {
        bestScore = score;
        best = zone;
      }
    }
    return best;
  }

  #buildMesh() {
    const segments = this.quality === 'high' ? 128 : this.quality === 'medium' ? 96 : 72;
    const geometry = new THREE.PlaneGeometry(this.size, this.size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      position.setY(i, this.heightAt(position.getX(i), position.getZ(i)));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    if (!geometry.getAttribute('uv2')) geometry.setAttribute('uv2', geometry.getAttribute('uv').clone());

    const material = new THREE.MeshStandardMaterial({
      name: 'LayeredDioramaTerrain',
      color: 0xffffff,
      roughness: .86,
      metalness: 0,
      envMapIntensity: .4,
    });
    const uniforms = shaderTextureUniforms(this.assets);
    uniforms.uTerrainTime = { value: 0 };
    material.userData.uniforms = uniforms;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTerrainWorldPosition;
        varying vec3 vTerrainWorldNormal;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vTerrainWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTerrainWorldPosition;
        varying vec3 vTerrainWorldNormal;
        uniform sampler2D uGrassColor;
        uniform sampler2D uDirtColor;
        uniform sampler2D uSandColor;
        uniform sampler2D uStoneColor;
        uniform sampler2D uPathColor;
        uniform sampler2D uCliffColor;
        uniform float uTerrainTime;
        float terrainHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float terrainNoise(vec2 p) {
          vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(terrainHash(i),terrainHash(i+vec2(1,0)),f.x),mix(terrainHash(i+vec2(0,1)),terrainHash(i+vec2(1,1)),f.x),f.y);
        }
        // Planar XZ sample only (1 texture fetch vs 3 for triplanar).
        vec4 xzSample(sampler2D map, vec2 p, float scale) {
          return texture2D(map, p * scale);
        }
        void terrainWeights(out vec4 a, out vec2 b) {
          vec2 p=vTerrainWorldPosition.xz;
          float slope=1.0-clamp(vTerrainWorldNormal.y,0.0,1.0);
          float macro=terrainNoise(p*.027);
          float pathCenter=sin(p.x*.055)*3.4 + sin(p.x*.017)*2.0;
          float path=1.0-smoothstep(2.1,5.6,abs(p.y-pathCenter));
          path*=1.0-smoothstep(18.0,30.0,length(p));
          float campPath=(1.0-smoothstep(8.8,12.7,abs(length(p)-10.6)))*.55;
          path=max(path,campPath);
          float canyon=smoothstep(42.0,78.0,p.x);
          float frost=smoothstep(52.0,88.0,-p.y);
          float ember=smoothstep(55.0,92.0,p.y);
          float astral=smoothstep(48.0,82.0,p.x)*smoothstep(40.0,77.0,-p.y);
          float forest=smoothstep(40.0,78.0,-p.x);
          float cliff=smoothstep(.23,.58,slope)+smoothstep(5.0,12.0,vTerrainWorldPosition.y)*.28;
          float stone=clamp(slope*.9 + frost*.34 + astral*.23,0.0,1.0);
          float sand=clamp(canyon*.85 + ember*.28,0.0,1.0)*(1.0-cliff);
          float dirt=clamp(.18 + macro*.25 + forest*.22 + ember*.42,0.0,1.0)*(1.0-path);
          float grass=clamp(1.15-dirt-sand-stone-cliff-path,0.0,1.0);
          a=vec4(grass,dirt,sand,stone);
          b=vec2(path,cliff);
          float sum=max(dot(a,vec4(1.0))+b.x+b.y,.001); a/=sum; b/=sum;
        }`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `vec4 terrainA; vec2 terrainB; terrainWeights(terrainA, terrainB);
        vec2 tp=vTerrainWorldPosition.xz;
        float macroTint=.91+terrainNoise(tp*.012)*.18;
        vec4 terrainColor =
          xzSample(uGrassColor,tp,.115)*terrainA.x +
          xzSample(uDirtColor,tp,.105)*terrainA.y +
          xzSample(uSandColor,tp,.095)*terrainA.z +
          xzSample(uStoneColor,tp,.12)*terrainA.w +
          xzSample(uPathColor,tp,.11)*terrainB.x +
          xzSample(uCliffColor,tp,.095)*terrainB.y;
        terrainColor.rgb*=macroTint;
        diffuseColor *= terrainColor;`,
      );
      material.userData.shader = shader;
    };
    material.customProgramCacheKey = () => `sol-arpg-layered-terrain-v8-${this.quality}`;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'LayeredTerrainMesh';
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    return mesh;
  }

  update(delta) {
    const uniforms = this.mesh.material.userData.uniforms;
    if (uniforms) uniforms.uTerrainTime.value += delta;
  }

  dispose() {
    this.scene.remove(this.group);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
