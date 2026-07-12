import * as THREE from 'three';
import { scaleCount } from '../data/fxThemes.js';

const MAX_PARTICLES = 128;

function makeSoftDiscTexture() {
  const size = 64;
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(.22, 'rgba(255,255,255,.95)'); gradient.addColorStop(.62, 'rgba(255,255,255,.28)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  return texture;
}

function ribbonGeometry(segments = 26) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const angle = (t - .5) * Math.PI * 1.28;
    const taper = Math.sin(Math.PI * t);
    const r = .53;
    const width = .065 * taper + .006;
    const cx = Math.cos(angle) * r;
    const cy = Math.sin(angle) * r;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    positions.push(cx - nx * width, cy - ny * width, 0, cx + nx * width, cy + ny * width, 0);
    uvs.push(t, 0, t, 1);
    if (i < segments) {
      const a = i * 2; indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

class Pool {
  constructor(factory, count) {
    this.items = Array.from({ length: count }, (_, i) => ({ ...factory(i), active: false, serial: i }));
    this.serial = count;
  }
  acquire() {
    let item = this.items.find(entry => !entry.active);
    if (!item) item = this.items.reduce((oldest, entry) => entry.started < oldest.started ? entry : oldest, this.items[0]);
    item.active = true; item.started = ++this.serial; item.object.visible = true; return item;
  }
  release(item) { item.active = false; item.object.visible = false; }
  active() { return this.items.filter(item => item.active); }
}

export class Effects {
  /**
   * @param {THREE.Scene} scene
   * @param {object|string} [assetsOrOptions] legacy assets bag, options object, or quality string
   * @param {string} [qualityArg] quality when called as (scene, assets, quality)
   */
  constructor(scene, assetsOrOptions = {}, qualityArg) {
    this.scene = scene;
    const opts = typeof assetsOrOptions === 'string'
      ? { quality: assetsOrOptions }
      : (assetsOrOptions && !assetsOrOptions.isAssetManager ? assetsOrOptions : {});
    this.quality = qualityArg ?? opts.quality ?? 'medium';
    this.root = new THREE.Group(); this.root.name = 'PooledCombatEffects'; scene.add(this.root);
    this.texture = makeSoftDiscTexture();
    this.shared = {
      slash: ribbonGeometry(),
      ring: new THREE.RingGeometry(.78, 1, 64),
      pillar: new THREE.CylinderGeometry(.08, .68, 1, 16, 1, true),
      trail: new THREE.SphereGeometry(1, 12, 9),
      decal: new THREE.CircleGeometry(1, 28),
      ghost: new THREE.CapsuleGeometry(.28, .9, 4, 8),
      beam: new THREE.CylinderGeometry(.06, .14, 1, 8, 1, true),
    };
    this.particles = new Pool(() => {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(MAX_PARTICLES * 3);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setDrawRange(0, 0);
      const material = new THREE.PointsMaterial({ map: this.texture, size: .3, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
      const object = new THREE.Points(geometry, material); object.visible = false; object.frustumCulled = false; this.root.add(object);
      return { object, geometry, material, velocities: new Float32Array(MAX_PARTICLES * 3), count: 0 };
    }, 48);
    this.slashes = new Pool(() => {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const object = new THREE.Mesh(this.shared.slash, material); object.visible = false; this.root.add(object); return { object, material };
    }, 36);
    this.rings = new Pool(() => {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const object = new THREE.Mesh(this.shared.ring, material); object.visible = false; object.rotation.x = -Math.PI / 2; this.root.add(object); return { object, material };
    }, 44);
    this.pillars = new Pool(() => {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const object = new THREE.Mesh(this.shared.pillar, material); object.visible = false; this.root.add(object); return { object, material };
    }, 24);
    this.trails = new Pool(() => {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const object = new THREE.Mesh(this.shared.trail, material); object.visible = false; this.root.add(object); return { object, material };
    }, 40);
    this.decals = new Pool(() => {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const object = new THREE.Mesh(this.shared.decal, material); object.visible = false; object.rotation.x = -Math.PI / 2; this.root.add(object);
      return { object, material };
    }, 20);
    this.ghosts = new Pool(() => {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const object = new THREE.Mesh(this.shared.ghost, material); object.visible = false; this.root.add(object);
      return { object, material };
    }, 8);
    this.beams = new Pool(() => {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const object = new THREE.Mesh(this.shared.beam, material); object.visible = false; this.root.add(object);
      return { object, material };
    }, 16);
  }

  setQuality(quality) {
    this.quality = quality ?? 'medium';
  }

  #count(n, min = 1) {
    return scaleCount(n, this.quality, min);
  }

  burst(position, color = 0xffffff, count = 12, options = {}) {
    const effect = this.particles.acquire();
    const scaled = options.rawCount ? count : this.#count(count);
    effect.count = Math.min(MAX_PARTICLES, Math.max(1, scaled));
    effect.geometry.setDrawRange(0, effect.count);
    const positions = effect.geometry.attributes.position.array;
    const baseSpeed = options.speed ?? 4.2;
    for (let i = 0; i < effect.count; i += 1) {
      positions[i * 3] = 0; positions[i * 3 + 1] = 0; positions[i * 3 + 2] = 0;
      const angle = Math.random() * Math.PI * 2;
      const elevation = (options.upward ?? .45) + Math.random() * .75;
      const speed = baseSpeed * (.45 + Math.random() * .75);
      effect.velocities[i * 3] = Math.cos(angle) * speed;
      effect.velocities[i * 3 + 1] = elevation * speed;
      effect.velocities[i * 3 + 2] = Math.sin(angle) * speed;
    }
    effect.geometry.attributes.position.needsUpdate = true;
    effect.object.position.copy(position); effect.object.position.y += options.height ?? .55; effect.object.scale.setScalar(1);
    effect.material.color.set(color); effect.material.size = options.size ?? .34; effect.material.opacity = options.opacity ?? .9;
    effect.material.blending = options.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending; effect.material.needsUpdate = true;
    effect.life = effect.maxLife = options.life ?? .55; effect.baseOpacity = options.opacity ?? .9; effect.gravity = options.gravity ?? 8.5; effect.drag = options.drag ?? 2.5;
    return effect.object;
  }

  dust(position, color = 0xd5c09a, count = 8, size = .42) {
    return this.burst(position, color, count, { speed: 2.2, upward: .1, size, life: .65, gravity: 2.2, additive: false, opacity: .48 });
  }

  slash(position, direction, color = 0xffffff, size = 2.4, options = {}) {
    const effect = this.slashes.acquire();
    effect.object.position.copy(position); effect.object.position.y += options.height ?? 1.05;
    effect.object.rotation.set(Math.PI / 2, 0, -Math.atan2(direction.z, direction.x) + (options.angleOffset ?? 0));
    // Slight tilt for more dimensional blade arcs.
    effect.object.rotation.x = Math.PI / 2 + (options.tilt ?? (Math.random() - .5) * .35);
    const thick = options.thickness ?? .06;
    effect.object.scale.set(size * (.55 + thick * 2.2), size, size * (.9 + thick));
    effect.material.color.set(color); effect.material.opacity = options.opacity ?? .85;
    effect.life = effect.maxLife = options.life ?? .23; effect.baseOpacity = options.opacity ?? .85; effect.grow = options.grow ?? .45; effect.spin = options.spin ?? 1.4;
    return effect.object;
  }

  ring(position, color = 0xffffff, radius = 3, options = {}) {
    const effect = this.rings.acquire();
    effect.object.position.copy(position); effect.object.position.y += options.height ?? .08; effect.object.scale.setScalar(options.startScale ?? .15);
    effect.material.color.set(color); effect.material.opacity = options.opacity ?? .72; effect.material.blending = options.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending; effect.material.needsUpdate = true;
    effect.life = effect.maxLife = options.life ?? .52; effect.baseOpacity = options.opacity ?? .72; effect.targetScale = radius; effect.lift = options.lift ?? 0;
    return effect.object;
  }

  pillar(position, color = 0xffffff, height = 6, options = {}) {
    const effect = this.pillars.acquire();
    effect.object.position.copy(position); effect.object.position.y += height * .5; effect.object.scale.set(options.bottom ?? .8, .05, options.bottom ?? .8);
    effect.material.color.set(color); effect.material.opacity = options.opacity ?? .42;
    effect.life = effect.maxLife = options.life ?? .65; effect.baseOpacity = options.opacity ?? .42; effect.height = height;
    effect.object.scale.y = height * .05;
    return effect.object;
  }

  trail(position, color = 0xffffff, radius = .45, life = .24) {
    const effect = this.trails.acquire();
    effect.object.position.copy(position); effect.object.scale.setScalar(radius); effect.material.color.set(color); effect.material.opacity = .3;
    effect.life = effect.maxLife = life; effect.baseRadius = radius;
    return effect.object;
  }

  /**
   * Flashy multi-layer hit VFX (no camera shake) — sparks, flash rings, streaks, optional beam.
   * @param {'light'|'heavy'|'critical'|'finisher'} intensity
   */
  impact(position, color = 0xffffff, intensity = 'light', options = {}) {
    const dir = options.direction?.clone?.().setY(0).normalize?.() ?? new THREE.Vector3(0, 0, 1);
    const crit = intensity === 'critical';
    const finisher = intensity === 'finisher';
    const heavy = intensity === 'heavy' || crit || finisher;
    const accent = crit ? 0xffe47a : finisher ? 0xfff6d0 : color;
    const white = 0xffffff;
    const sparkCount = crit ? 48 : finisher ? 36 : heavy ? 28 : 18;
    const ringSize = crit ? 2.1 : finisher ? 1.75 : heavy ? 1.25 : .85;

    // Core white flash + colored spark shell.
    this.burst(position, white, Math.round(sparkCount * .45), {
      speed: crit ? 9.5 : 7.2, size: crit ? .48 : .34, life: .28, gravity: 4, upward: .15, height: 0, opacity: 1,
    });
    this.burst(position, accent, sparkCount, {
      speed: crit ? 8.5 : heavy ? 6.8 : 5.2, size: crit ? .4 : .3, life: crit ? .55 : .42,
      gravity: 6.5, upward: .7, height: 0, opacity: .95,
    });
    // Secondary glitter scatter.
    this.burst(position, crit ? 0xffc857 : accent, Math.round(sparkCount * .55), {
      speed: 3.2, size: .18, life: .62, gravity: 2.4, upward: 1.1, height: .1, opacity: .85,
    });

    // Expanding shock rings (stacked for drama).
    this.ring(position, white, ringSize * .55, { life: .14, startScale: .08, height: 0, opacity: .95 });
    this.ring(position, accent, ringSize, { life: .22, startScale: .12, height: .02, opacity: .85 });
    if (heavy) this.ring(position, accent, ringSize * 1.45, { life: .32, startScale: .05, height: .04, opacity: .55, lift: .4 });

    // Slash streaks through the hit point.
    this.slash(position, dir, white, heavy ? 2.4 : 1.7, {
      height: 0, thickness: heavy ? .1 : .07, opacity: .95, spin: 4.5, life: .12, grow: 1.4, tilt: .2,
    });
    this.slash(position, dir, accent, heavy ? 2.8 : 2.0, {
      height: .05, thickness: heavy ? .08 : .05, opacity: .75, spin: -3.2, life: .16, grow: 1.1,
      angleOffset: 1.1, tilt: -.35,
    });
    if (crit || finisher) {
      this.slash(position, dir, white, 3.2, {
        height: -.05, thickness: .06, opacity: .65, spin: 6, life: .14, grow: 1.6, angleOffset: -1.0,
      });
      this.pillar(position, accent, crit ? 5.5 : 4.2, { life: .32, bottom: .55, opacity: .55 });
      this.trail(position, white, crit ? .85 : .6, .16);
      this.trail(position.clone().addScaledVector(dir, .4), accent, .5, .2);
    } else {
      this.trail(position, accent, .38, .14);
    }
  }

  /** Wide colorful swing arc for attacks (visual only). */
  swingArc(position, direction, color = 0xffffff, size = 2.6, options = {}) {
    const heavy = Boolean(options.heavy);
    this.slash(position, direction, color, size, {
      height: options.height ?? 1.1, thickness: heavy ? .12 : .075, opacity: heavy ? 1 : .92,
      spin: options.spin ?? 2.6, life: heavy ? .3 : .2, grow: heavy ? .75 : .55, tilt: options.tilt ?? .15,
    });
    this.slash(position, direction, 0xffffff, size * .88, {
      height: (options.height ?? 1.1) + .22, thickness: heavy ? .07 : .045, opacity: heavy ? .7 : .5,
      spin: -(options.spin ?? 2.6) * 1.15, life: heavy ? .22 : .14, grow: .9,
      angleOffset: options.angleOffset ?? .5, tilt: -.25,
    });
    this.slash(position, direction, color, size * 1.05, {
      height: (options.height ?? 1.1) - .18, thickness: .04, opacity: .4,
      spin: (options.spin ?? 2.6) * .7, life: .18, grow: .65, angleOffset: -(options.angleOffset ?? .5),
    });
    // Foot sparkle under the swing.
    this.ring(position, color, size * .35, { life: .2, startScale: .15, height: .06, opacity: .45 });
    this.burst(position.clone().addScaledVector(direction, size * .25).add(new THREE.Vector3(0, 1, 0)), color, heavy ? 14 : 8, {
      speed: 3.5, size: .22, life: .32, upward: .2, height: 0, gravity: 5,
    });
  }

  /** Fading ground disc (ice residual / scorch). */
  groundDecal(position, color = 0xffffff, radius = 2, options = {}) {
    const effect = this.decals.acquire();
    effect.object.position.copy(position);
    effect.object.position.y += options.height ?? 0.04;
    effect.object.scale.setScalar(radius * (options.startScale ?? 0.35));
    effect.material.color.set(color);
    effect.material.opacity = options.opacity ?? 0.55;
    effect.material.blending = options.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending;
    effect.material.needsUpdate = true;
    effect.life = effect.maxLife = options.life ?? 0.85;
    effect.baseOpacity = options.opacity ?? 0.55;
    effect.targetScale = radius;
    return effect.object;
  }

  /** Short-lived additive ghost (blink afterimage). */
  afterimage(position, color = 0xb06dff, options = {}) {
    const effect = this.ghosts.acquire();
    effect.object.position.copy(position);
    effect.object.position.y += options.height ?? 1.05;
    effect.object.rotation.y = options.yaw ?? 0;
    const s = options.scale ?? 1;
    effect.object.scale.set(s * 0.9, s, s * 0.9);
    effect.material.color.set(color);
    effect.material.opacity = options.opacity ?? 0.55;
    effect.life = effect.maxLife = options.life ?? 0.32;
    effect.baseOpacity = options.opacity ?? 0.55;
    effect.rise = options.rise ?? 0.6;
    return effect.object;
  }

  /** Vertical beam / meteor fall column. */
  verticalBeam(position, color = 0xff9040, height = 8, options = {}) {
    const effect = this.beams.acquire();
    effect.object.position.copy(position);
    effect.object.position.y += height * 0.5 + (options.yOffset ?? 0);
    const bottom = options.bottom ?? 0.55;
    effect.object.scale.set(bottom, height, bottom);
    effect.material.color.set(color);
    effect.material.opacity = options.opacity ?? 0.55;
    effect.life = effect.maxLife = options.life ?? 0.45;
    effect.baseOpacity = options.opacity ?? 0.55;
    effect.shrink = options.shrink ?? 1.4;
    return effect.object;
  }

  // —— Named multi-layer recipes (skill identity) ——

  recipeSpinStorm(position, facing, theme, radius, pulseIndex = 0, finale = false) {
    const h = 0.72 + pulseIndex * 0.32;
    this.ring(position, theme.primary, radius * (0.78 + pulseIndex * 0.1), { life: 0.38, startScale: 0.3 });
    this.slash(position, facing, finale ? theme.core : theme.primary, radius * 0.98, {
      height: h, thickness: 0.07 + pulseIndex * 0.015, life: 0.3, spin: 5.5 + pulseIndex, opacity: 0.9,
    });
    this.slash(position, facing, theme.secondary, radius * 0.85, {
      height: h + 0.35, thickness: 0.045, life: 0.22, spin: -4.2, angleOffset: 1.2, opacity: 0.65,
    });
    if (finale) {
      this.slash(position, facing, theme.core, radius * 1.05, {
        height: 1.4, thickness: 0.09, life: 0.28, spin: 7, angleOffset: -0.9, opacity: 0.85,
      });
      this.ring(position, theme.core, radius * 1.1, { life: 0.42, startScale: 0.12, height: 0.1, opacity: 0.7 });
      this.dust(position, theme.dust, 16, 0.42);
    }
    this.burst(position.clone().add(new THREE.Vector3(0, 1, 0)), theme.primary, 12 + pulseIndex * 5, {
      speed: 4.2 + pulseIndex, size: 0.28, life: 0.38, upward: 0.4,
    });
  }

  recipeGroundWave(position, direction, theme, size = 3.4) {
    this.slash(position, direction, theme.secondary, size, { height: 1, life: 0.34, thickness: 0.08, spin: 2.2 });
    this.slash(position, direction, theme.primary, size * 1.1, {
      height: 0.55, life: 0.28, thickness: 0.05, spin: -1.6, angleOffset: 0.4,
    });
    // Longer scar residual (A6).
    this.groundDecal(position, theme.accent, size * 0.55, { life: 1.35, opacity: 0.42, startScale: 0.2 });
    this.groundDecal(position.clone().addScaledVector(direction, size * 0.45), theme.primary, size * 0.4, {
      life: 1.15, opacity: 0.32, startScale: 0.25,
    });
    this.dust(position, theme.dust, 12, 0.36);
    this.burst(position.clone().add(new THREE.Vector3(0, 0.9, 0)).addScaledVector(direction, 1.2), theme.primary, 14, {
      speed: 4, size: 0.26, life: 0.4, upward: 0.25,
    });
  }

  recipeLeapImpact(position, direction, theme, radius) {
    this.trail(position.clone().add(new THREE.Vector3(0, 1.2, 0)), theme.primary, 1.2, 0.45);
    this.pillar(position, theme.secondary, 8.2, { life: 0.75, bottom: 1.3, opacity: 0.5 });
    this.ring(position, theme.primary, radius, { life: 0.65, startScale: 0.08 });
    this.ring(position, theme.core, radius * 0.55, { life: 0.35, startScale: 0.15, height: 0.12, opacity: 0.85 });
    this.burst(position.clone().add(new THREE.Vector3(0, 0.9, 0)), theme.secondary, 30, {
      speed: 6.4, upward: 0.65, size: 0.4, life: 0.85,
    });
    this.dust(position, theme.dust, 22, 0.5);
    // Facing dust cone
    const cone = position.clone().addScaledVector(direction, 1.4);
    this.dust(cone, theme.dust, 14, 0.44);
    this.impact(position.clone().add(new THREE.Vector3(0, 1.1, 0)), theme.primary, 'heavy', { direction });
  }

  recipeStarBlade(point, theme, index = 0) {
    const dir = new THREE.Vector3(Math.cos(index * 1.1), 0, Math.sin(index * 1.1));
    this.slash(point, dir, index % 2 ? theme.accent : theme.secondary, 2.6, {
      height: 1.15, thickness: 0.07, life: 0.32, spin: 4.5 + index * 0.3, opacity: 0.9,
    });
    this.slash(point, dir, theme.core, 2.1, {
      height: 0.85, thickness: 0.04, life: 0.2, spin: -3.2, angleOffset: 0.9, opacity: 0.7,
    });
    this.pillar(point, index % 2 ? theme.accent : theme.secondary, 5.4, { life: 0.42, bottom: 0.45, opacity: 0.4 });
    this.burst(point.clone().add(new THREE.Vector3(0, 1, 0)), theme.primary, 14, {
      speed: 5, size: 0.28, life: 0.5, upward: 0.55,
    });
    this.ring(point, theme.secondary, 1.6, { life: 0.3, startScale: 0.2, opacity: 0.55 });
  }

  recipeStarFinale(center, theme, radius) {
    this.ring(center, theme.core, radius, { life: 0.8, startScale: 0.05 });
    this.ring(center, theme.primary, radius * 0.7, { life: 0.5, startScale: 0.1, height: 0.1 });
    this.pillar(center, theme.secondary, 7.8, { life: 0.58, bottom: 1.15, opacity: 0.55 });
    this.burst(center.clone().add(new THREE.Vector3(0, 1.2, 0)), theme.primary, 36, {
      speed: 7, size: 0.36, life: 0.7, upward: 0.7,
    });
    this.impact(center.clone().add(new THREE.Vector3(0, 1.2, 0)), theme.primary, 'finisher');
  }

  recipeFireOrb(muzzle, direction, theme) {
    this.slash(muzzle, direction, theme.secondary, 2.9, { height: 0.95, life: 0.28, thickness: 0.08, spin: 2 });
    this.burst(muzzle.clone().add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(direction, 0.6), theme.primary, 16, {
      speed: 3.8, size: 0.28, life: 0.36, upward: 0.35,
    });
    this.trail(muzzle.clone().add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(direction, 0.8), theme.core, 0.55, 0.2);
  }

  recipeFireBlast(at, theme, radius) {
    this.ring(at, theme.primary, radius, { life: 0.48, startScale: 0.1 });
    this.ring(at, theme.core, radius * 0.55, { life: 0.28, startScale: 0.2, height: 0.1, opacity: 0.85 });
    this.burst(at.clone().add(new THREE.Vector3(0, 0.9, 0)), theme.secondary, 28, {
      speed: 6.2, size: 0.36, life: 0.55, upward: 0.5,
    });
    this.burst(at.clone().add(new THREE.Vector3(0, 0.7, 0)), theme.core, 14, {
      speed: 4, size: 0.22, life: 0.4, upward: 0.8,
    });
    this.groundDecal(at, theme.accent, radius * 0.85, { life: 0.9, opacity: 0.45, startScale: 0.15 });
    this.dust(at, theme.dust, 14, 0.4);
    this.impact(at.clone().add(new THREE.Vector3(0, 1, 0)), theme.primary, 'heavy');
  }

  recipeIceNova(position, theme, radius) {
    this.ring(position, theme.primary, radius, { life: 0.58, startScale: 0.1 });
    this.ring(position, theme.secondary, radius * 0.72, { life: 0.42, startScale: 0.18, height: 0.08 });
    this.ring(position, theme.core, radius * 0.4, { life: 0.3, startScale: 0.25, height: 0.14, opacity: 0.7 });
    this.burst(position.clone().add(new THREE.Vector3(0, 0.85, 0)), theme.primary, 26, {
      speed: 5.4, size: 0.3, life: 0.55, upward: 0.12,
    });
    // Longer frost residual floor (A6).
    this.groundDecal(position, theme.accent, radius * 0.95, { life: 1.85, opacity: 0.48, startScale: 0.12 });
    this.groundDecal(position, theme.secondary, radius * 0.7, { life: 1.5, opacity: 0.28, startScale: 0.2 });
    // Lattice shards
    for (let i = 0; i < 6; i += 1) {
      const ang = (i / 6) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      this.slash(position, dir, i % 2 ? theme.secondary : theme.primary, radius * 0.55, {
        height: 0.7 + (i % 3) * 0.15, life: 0.28, thickness: 0.04, spin: 2 + i * 0.4, opacity: 0.7,
      });
    }
  }

  recipeBlinkBurst(from, to, theme, radius) {
    this.afterimage(from, theme.primary, { life: 0.38, opacity: 0.6, scale: 1.05 });
    this.burst(from.clone().add(new THREE.Vector3(0, 1, 0)), theme.primary, 18, { speed: 4.2, size: 0.3, life: 0.42 });
    this.ring(from, theme.accent, 2.4, { life: 0.32, startScale: 0.18 });
    // Path trail samples
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 1.1, 0));
    this.trail(mid, theme.secondary, 0.7, 0.28);
    this.afterimage(to, theme.secondary, { life: 0.28, opacity: 0.45, scale: 0.95 });
    this.pillar(to, theme.core, 7.6, { life: 0.68, bottom: 1.15, opacity: 0.48 });
    this.ring(to, theme.primary, radius, { life: 0.6, startScale: 0.08 });
    this.burst(to.clone().add(new THREE.Vector3(0, 1, 0)), theme.secondary, 28, {
      speed: 6, upward: 0.55, size: 0.36, life: 0.78,
    });
    this.impact(to.clone().add(new THREE.Vector3(0, 1.1, 0)), theme.primary, 'heavy');
  }

  recipeMeteorDrop(point, theme, fallHeight = 8) {
    const sky = point.clone().add(new THREE.Vector3(0, fallHeight, 0));
    this.verticalBeam(point, theme.secondary, fallHeight * 0.92, { life: 0.38, bottom: 0.35, opacity: 0.55 });
    this.trail(sky, theme.core, 0.55, 0.35);
    this.trail(point.clone().add(new THREE.Vector3(0, fallHeight * 0.45, 0)), theme.primary, 0.7, 0.28);
    this.pillar(point, theme.accent, 7.2, { life: 0.52, bottom: 0.85, opacity: 0.5 });
    this.burst(point.clone().add(new THREE.Vector3(0, 0.9, 0)), theme.primary, 18, {
      speed: 5.5, size: 0.34, life: 0.58, upward: 0.45,
    });
    this.ring(point, theme.secondary, 2.4, { life: 0.38, startScale: 0.12 });
    this.groundDecal(point, theme.accent, 2.1, { life: 0.95, opacity: 0.5, startScale: 0.15 });
    this.dust(point, theme.dust, 12, 0.42);
  }

  recipeFangRush(position, direction, theme, range, hitIndex = 0, finale = false) {
    const side = hitIndex % 2 ? 1 : -1;
    this.slash(position, direction, finale ? theme.core : theme.primary, range * 1.15, {
      height: 0.95 + hitIndex * 0.12, thickness: 0.05, life: 0.2, spin: side * 6.5, angleOffset: side * 0.45, opacity: 0.92,
    });
    this.slash(position, direction, theme.secondary, range * 0.9, {
      height: 0.8, thickness: 0.035, life: 0.16, spin: side * -4.8, angleOffset: side * -0.3, opacity: 0.7,
    });
    this.burst(position.clone().add(new THREE.Vector3(0, 1, 0)).addScaledVector(direction, 0.9), theme.primary, 10 + hitIndex * 4, {
      speed: 4.6, size: 0.22, life: 0.3, upward: 0.3,
    });
    this.trail(position.clone().add(new THREE.Vector3(0, 1.05, 0)).addScaledVector(direction, 0.6), theme.accent, 0.4, 0.14);
    if (finale) {
      this.ring(position.clone().addScaledVector(direction, 1), theme.accent, range * 0.7, { life: 0.28, startScale: 0.25, height: 0.1, opacity: 0.6 });
      this.dust(position, theme.dust, 8, 0.3);
    }
  }

  recipeDaggerFan(position, direction, theme) {
    this.slash(position, direction, theme.primary, 2.4, { height: 1, life: 0.24, thickness: 0.06, spin: 3.4 });
    this.slash(position, direction, theme.secondary, 2, { height: 0.85, life: 0.18, thickness: 0.04, spin: -2.6, angleOffset: 0.5, opacity: 0.7 });
    this.groundDecal(position.clone().addScaledVector(direction, 1), theme.accent, 1.6, { life: 0.4, opacity: 0.35, startScale: 0.25 });
    this.burst(position.clone().add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(direction, 0.8), theme.core, 14, {
      speed: 5.2, size: 0.2, life: 0.3, upward: 0.2,
    });
  }

  recipeShadowDash(from, to, direction, theme) {
    this.afterimage(from, theme.primary, { life: 0.4, opacity: 0.6, scale: 1 });
    this.ring(from, theme.accent, 1.8, { life: 0.3, startScale: 0.2, opacity: 0.6 });
    // Path afterimages — the rogue flickers along the cut line.
    const steps = 3;
    for (let i = 1; i <= steps; i += 1) {
      const at = from.clone().lerp(to, i / (steps + 1));
      this.afterimage(at, i % 2 ? theme.secondary : theme.primary, { life: 0.3 + i * 0.04, opacity: 0.45, scale: 0.95 });
      this.trail(at.clone().add(new THREE.Vector3(0, 1.05, 0)), theme.primary, 0.5, 0.2);
    }
    this.slash(from.clone().lerp(to, 0.5), direction, theme.core, from.distanceTo(to) * 0.55, {
      height: 1.05, thickness: 0.05, life: 0.26, spin: 0.6, opacity: 0.85,
    });
    this.burst(to.clone().add(new THREE.Vector3(0, 1, 0)), theme.secondary, 20, { speed: 5.4, size: 0.28, life: 0.45, upward: 0.4 });
    this.ring(to, theme.primary, 2.6, { life: 0.42, startScale: 0.1 });
    this.dust(to, theme.dust, 12, 0.36);
    this.impact(to.clone().add(new THREE.Vector3(0, 1.05, 0)), theme.primary, 'heavy', { direction });
  }

  recipeLotusFlurry(position, theme, radius, index = 0, finale = false) {
    const dir = new THREE.Vector3(Math.cos(index * 2.4), 0, Math.sin(index * 2.4));
    if (finale) {
      this.ring(position, theme.core, radius, { life: 0.5, startScale: 0.08 });
      this.ring(position, theme.primary, radius * 0.65, { life: 0.36, startScale: 0.15, height: 0.12, opacity: 0.8 });
      this.pillar(position, theme.secondary, 5.8, { life: 0.45, bottom: 0.8, opacity: 0.45 });
      this.burst(position.clone().add(new THREE.Vector3(0, 1, 0)), theme.primary, 30, {
        speed: 6.4, size: 0.3, life: 0.6, upward: 0.5,
      });
      this.impact(position.clone().add(new THREE.Vector3(0, 1.1, 0)), theme.primary, 'finisher');
      this.dust(position, theme.dust, 14, 0.4);
      return;
    }
    this.slash(position, dir, index % 2 ? theme.secondary : theme.primary, radius * 0.95, {
      height: 0.65 + (index % 3) * 0.28, thickness: 0.04, life: 0.18, spin: (index % 2 ? -1 : 1) * (6 + index * 0.4), opacity: 0.85,
    });
    if (index % 2 === 0) {
      this.burst(position.clone().add(new THREE.Vector3(0, 1, 0)), theme.accent, 8, { speed: 4.4, size: 0.2, life: 0.26, upward: 0.35 });
    }
    if (index % 3 === 0) this.ring(position, theme.accent, radius * 0.5, { life: 0.22, startScale: 0.3, height: 0.08, opacity: 0.5 });
  }

  recipeMeteorFinale(center, theme, radius) {
    this.ring(center, theme.core, radius, { life: 0.85, startScale: 0.05 });
    this.pillar(center, theme.secondary, 8.5, { life: 0.65, bottom: 1.2, opacity: 0.58 });
    this.verticalBeam(center, theme.primary, 10, { life: 0.5, bottom: 0.8, opacity: 0.45 });
    this.burst(center.clone().add(new THREE.Vector3(0, 1.2, 0)), theme.primary, 40, {
      speed: 7.2, size: 0.4, life: 0.75, upward: 0.65,
    });
    this.groundDecal(center, theme.accent, radius * 0.75, { life: 1.2, opacity: 0.48, startScale: 0.08 });
    this.impact(center.clone().add(new THREE.Vector3(0, 1.2, 0)), theme.primary, 'finisher');
  }

  /** Ranger bow draw / pierce muzzle flash */
  recipeArrowStreak(muzzle, direction, theme) {
    this.slash(muzzle, direction, theme.secondary, 2.4, { height: 0.75, life: 0.2, thickness: 0.04, spin: 1.2, opacity: 0.65 });
    this.trail(muzzle.clone().add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(direction, 0.9), theme.core, 0.62, 0.18);
    this.burst(muzzle.clone().add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(direction, 0.55), theme.primary, 12, {
      speed: 4.2, size: 0.2, life: 0.28, upward: 0.15,
    });
  }

  recipeTrapField(center, theme, radius) {
    this.ring(center, theme.primary, radius, { life: 0.55, startScale: 0.12 });
    this.ring(center, theme.secondary, radius * 0.7, { life: 0.4, startScale: 0.2, height: 0.07, opacity: 0.65 });
    this.groundDecal(center, theme.accent, radius * 0.95, { life: 1.6, opacity: 0.4, startScale: 0.15 });
    this.burst(center.clone().add(new THREE.Vector3(0, 0.6, 0)), theme.primary, 18, {
      speed: 3.8, size: 0.24, life: 0.45, upward: 0.55,
    });
    this.dust(center, theme.dust, 12, 0.36);
  }

  recipeVaultVolley(from, to, direction, theme) {
    this.afterimage(from, theme.primary, { life: 0.32, opacity: 0.5, scale: 1 });
    this.dust(from, theme.dust, 10, 0.3);
    this.trail(from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 1, 0)), theme.secondary, 0.55, 0.22);
    this.ring(to, theme.accent, 1.8, { life: 0.28, startScale: 0.2 });
    this.recipeArrowStreak(to, direction, theme);
  }

  recipeMarkGlyph(at, theme, radius = 2.6) {
    this.ring(at, theme.primary, radius, { life: 0.55, startScale: 0.08, height: 0.12 });
    this.ring(at, theme.core, radius * 0.45, { life: 0.35, startScale: 0.2, height: 0.16, opacity: 0.85 });
    this.pillar(at, theme.secondary, 5.5, { life: 0.48, bottom: 0.7, opacity: 0.42 });
    this.burst(at.clone().add(new THREE.Vector3(0, 1.2, 0)), theme.primary, 22, {
      speed: 5.2, size: 0.28, life: 0.5, upward: 0.55,
    });
    this.groundDecal(at, theme.accent, radius * 0.7, { life: 1.0, opacity: 0.45, startScale: 0.12 });
    this.impact(at.clone().add(new THREE.Vector3(0, 1.1, 0)), theme.primary, 'heavy');
  }

  update(delta) {
    for (const effect of this.particles.active()) {
      effect.life -= delta; const t = Math.max(0, effect.life / effect.maxLife); const p = effect.geometry.attributes.position.array;
      for (let i = 0; i < effect.count; i += 1) {
        const index = i * 3; const drag = Math.max(0, 1 - effect.drag * delta);
        effect.velocities[index] *= drag; effect.velocities[index + 1] = effect.velocities[index + 1] * drag - effect.gravity * delta; effect.velocities[index + 2] *= drag;
        p[index] += effect.velocities[index] * delta; p[index + 1] += effect.velocities[index + 1] * delta; p[index + 2] += effect.velocities[index + 2] * delta;
      }
      effect.geometry.attributes.position.needsUpdate = true; effect.material.opacity = t * effect.baseOpacity; effect.object.scale.setScalar(.72 + (1 - t) * .55);
      if (effect.life <= 0) this.particles.release(effect);
    }
    for (const effect of this.slashes.active()) {
      effect.life -= delta; const t = Math.max(0, effect.life / effect.maxLife); effect.object.scale.multiplyScalar(1 + effect.grow * delta); effect.object.rotation.z += effect.spin * delta; effect.material.opacity = Math.pow(t, 1.7) * effect.baseOpacity;
      if (effect.life <= 0) this.slashes.release(effect);
    }
    for (const effect of this.rings.active()) {
      effect.life -= delta; const t = Math.max(0, effect.life / effect.maxLife); const progress = 1 - t; const scale = effect.targetScale * (1 - Math.pow(1 - progress, 3)); effect.object.scale.setScalar(scale); effect.object.position.y += effect.lift * delta; effect.material.opacity = t * t * effect.baseOpacity;
      if (effect.life <= 0) this.rings.release(effect);
    }
    for (const effect of this.pillars.active()) {
      effect.life -= delta; const t = Math.max(0, effect.life / effect.maxLife); const progress = 1 - t; effect.object.scale.y = effect.height * Math.min(1, progress * 7) * Math.min(1, t * 5); effect.material.opacity = Math.sin(progress * Math.PI) * effect.baseOpacity;
      if (effect.life <= 0) this.pillars.release(effect);
    }
    for (const effect of this.trails.active()) {
      effect.life -= delta; const t = Math.max(0, effect.life / effect.maxLife); effect.object.scale.multiplyScalar(1 + delta * 2.2); effect.material.opacity = t * .3;
      if (effect.life <= 0) this.trails.release(effect);
    }
    for (const effect of this.decals.active()) {
      effect.life -= delta;
      const t = Math.max(0, effect.life / effect.maxLife);
      const progress = 1 - t;
      const scale = effect.targetScale * (0.35 + progress * 0.65);
      effect.object.scale.setScalar(scale);
      effect.material.opacity = t * t * effect.baseOpacity;
      if (effect.life <= 0) this.decals.release(effect);
    }
    for (const effect of this.ghosts.active()) {
      effect.life -= delta;
      const t = Math.max(0, effect.life / effect.maxLife);
      effect.object.position.y += (effect.rise ?? 0.5) * delta;
      effect.object.scale.multiplyScalar(1 + delta * 0.8);
      effect.material.opacity = t * effect.baseOpacity;
      if (effect.life <= 0) this.ghosts.release(effect);
    }
    for (const effect of this.beams.active()) {
      effect.life -= delta;
      const t = Math.max(0, effect.life / effect.maxLife);
      effect.object.scale.x *= 1 - delta * (effect.shrink ?? 1.2) * 0.35;
      effect.object.scale.z = effect.object.scale.x;
      effect.material.opacity = Math.sin(t * Math.PI) * effect.baseOpacity;
      if (effect.life <= 0) this.beams.release(effect);
    }
  }

  clear() {
    for (const pool of [this.particles, this.slashes, this.rings, this.pillars, this.trails, this.decals, this.ghosts, this.beams]) {
      for (const effect of pool.active()) pool.release(effect);
    }
  }

  dispose() {
    this.clear();
    for (const pool of [this.particles, this.slashes, this.rings, this.pillars, this.trails, this.decals, this.ghosts, this.beams]) {
      for (const item of pool.items) {
        if (item.geometry && !Object.values(this.shared).includes(item.geometry)) item.geometry.dispose?.();
        item.material?.dispose?.();
      }
    }
    for (const geometry of Object.values(this.shared)) geometry.dispose();
    this.texture.dispose(); this.scene.remove(this.root);
  }
}
