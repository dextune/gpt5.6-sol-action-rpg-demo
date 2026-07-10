import * as THREE from 'three';
import { GAME_CONFIG } from '../config.js';
import { ZONES } from '../data/content.js';
import { seededRandom } from '../core/Utils.js';
import { MaterialLibrary } from '../graphics/MaterialLibrary.js';
import { TerrainSystem } from './TerrainSystem.js';
import { EnvironmentFactory } from './EnvironmentFactory.js';
import { BiomeDecorator } from './BiomeDecorator.js';
import { VegetationSystem } from './VegetationSystem.js';
import { WaterSystem } from './WaterSystem.js';

const TMP = new THREE.Vector3();

function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x74b8ca) },
      uHorizon: { value: new THREE.Color(0xffd3a3) },
      uGround: { value: new THREE.Color(0x9bb995) },
      uSunDirection: { value: new THREE.Vector3(-.45, .72, .34).normalize() },
    },
    vertexShader: `varying vec3 vWorldDir; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWorldDir=normalize(w.xyz-cameraPosition); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vWorldDir; uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDirection;
      void main(){ float h=clamp(vWorldDir.y*.5+.5,0.0,1.0); vec3 c=mix(uGround,uHorizon,smoothstep(.18,.52,h)); c=mix(c,uTop,smoothstep(.48,.92,h)); float sun=pow(max(0.0,dot(vWorldDir,uSunDirection)),180.0); c += vec3(1.0,.73,.43)*sun*.8; gl_FragColor=vec4(c,1.0); }`,
  });
}

function ambientParticles(terrain, quality) {
  const counts = { high: 280, medium: 160, low: 80 };
  const count = counts[quality] ?? counts.medium;
  const rng = seededRandom(0xB10550A);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = 16 + Math.sqrt(rng()) * 142;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const zone = terrain.zoneAt(x, z);
    positions[i * 3] = x;
    positions[i * 3 + 1] = terrain.heightAt(x, z) + .7 + rng() * 6;
    positions[i * 3 + 2] = z;
    seeds[i] = rng() * 12;
    const c = new THREE.Color(zone.particle ?? 0xffefb5).lerp(new THREE.Color(0xffffff), .24);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, vertexColors: true, blending: THREE.NormalBlending,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: Math.min(2, devicePixelRatio || 1) } },
    vertexShader: `attribute float aSeed; varying vec3 vColor; varying float vAlpha; uniform float uTime; uniform float uPixelRatio;
      void main(){ vec3 p=position; p.x += sin(uTime*.31+aSeed)*.48; p.y += sin(uTime*.83+aSeed*1.7)*.34; p.z += cos(uTime*.27+aSeed*.8)*.42; vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=(2.2+sin(aSeed)*.7)*uPixelRatio*(18.0/max(6.0,-mv.z)); vColor=color; vAlpha=.28+.18*sin(uTime*1.1+aSeed); }`,
    fragmentShader: `varying vec3 vColor; varying float vAlpha; void main(){ vec2 p=gl_PointCoord-.5; float d=dot(p,p); if(d>.25) discard; float a=smoothstep(.25,0.0,d)*vAlpha; gl_FragColor=vec4(vColor,a); }`,
  });
  const points = new THREE.Points(geometry, material); points.name = 'BiomeAmbientMotes'; points.frustumCulled = false;
  return points;
}

export class World {
  constructor(scene, assetManager, quality = 'medium') {
    this.scene = scene;
    this.assets = assetManager;
    this.quality = quality;
    this.root = new THREE.Group();
    this.root.name = 'SolActionRPGWorld';
    this.scene.add(this.root);
    this.rng = seededRandom(0xA731BEEF);
    this.colliders = [];
    this.time = 0;
    this.currentZone = ZONES.verdant;

    this.materials = new MaterialLibrary(assetManager);
    this.terrainSystem = new TerrainSystem(this.root, assetManager, quality);
    this.environmentFactory = new EnvironmentFactory(assetManager, this.materials);
    this.decorator = new BiomeDecorator(this.root, this.terrainSystem, this.environmentFactory, this.materials, quality);
    this.colliders.push(...this.decorator.colliders);
    this.vegetation = new VegetationSystem(this.root, this.terrainSystem, quality);
    this.waterSystem = new WaterSystem(this.root, this.terrainSystem, quality);

    this.skyMaterial = makeSkyMaterial();
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(470, 32, 20), this.skyMaterial);
    this.sky.name = 'AtmosphericSky'; this.sky.frustumCulled = false; this.scene.add(this.sky);
    this.motes = ambientParticles(this.terrainSystem, quality); this.root.add(this.motes);
  }

  get terrain() { return this.terrainSystem.mesh; }
  heightAt(x, z) { return this.terrainSystem.heightAt(x, z); }
  zoneAt(x, z) { return this.terrainSystem.zoneAt(x, z); }

  #nearCollider(x, z, padding = 0) {
    for (const c of this.colliders) if (Math.hypot(x - c.x, z - c.z) < c.radius + padding) return true;
    return false;
  }

  resolvePosition(position, radius = .45) {
    const planar = Math.hypot(position.x, position.z);
    const maxRadius = GAME_CONFIG.worldRadius - radius - 2;
    if (planar > maxRadius) { position.x *= maxRadius / planar; position.z *= maxRadius / planar; }
    for (const collider of this.colliders) {
      const dx = position.x - collider.x; const dz = position.z - collider.z;
      const minDistance = radius + collider.radius; const distanceSq = dx * dx + dz * dz;
      if (distanceSq > .0001 && distanceSq < minDistance * minDistance) {
        const distance = Math.sqrt(distanceSq); const push = (minDistance - distance) / distance;
        position.x += dx * push; position.z += dz * push;
      }
    }
    position.y = this.heightAt(position.x, position.z);
    return position;
  }

  randomSpawnAround(center, innerRadius, outerRadius) {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const angle = this.rng() * Math.PI * 2;
      const radius = innerRadius + Math.sqrt(this.rng()) * (outerRadius - innerRadius);
      const x = center.x + Math.cos(angle) * radius; const z = center.z + Math.sin(angle) * radius;
      if (Math.hypot(x, z) > GAME_CONFIG.worldRadius - 8 || Math.hypot(x, z) < GAME_CONFIG.campRadius + 5) continue;
      if (this.#nearCollider(x, z, 1.25)) continue;
      return new THREE.Vector3(x, this.heightAt(x, z), z);
    }
    const angle = this.rng() * Math.PI * 2;
    const x = center.x + Math.cos(angle) * innerRadius; const z = center.z + Math.sin(angle) * innerRadius;
    return new THREE.Vector3(x, this.heightAt(x, z), z);
  }

  update(delta, game) {
    this.time += delta;
    this.vegetation.update(delta, game.player?.position);
    this.waterSystem.update(delta);
    this.decorator.update(delta, this.time);
    this.motes.material.uniforms.uTime.value = this.time;
    this.sky.position.copy(game.camera.position);
    if (game.player) this.currentZone = this.zoneAt(game.player.position.x, game.player.position.z);
  }

  setQuality(quality) { this.quality = quality; }

  dispose() {
    this.vegetation.dispose(); this.waterSystem.dispose(); this.decorator.dispose(); this.environmentFactory.dispose(); this.terrainSystem.dispose(); this.materials.dispose();
    this.motes.geometry.dispose(); this.motes.material.dispose(); this.sky.geometry.dispose(); this.skyMaterial.dispose();
    this.scene.remove(this.root, this.sky);
  }
}
