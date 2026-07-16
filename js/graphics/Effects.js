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

/** Anime-style radial impact star — sharp spikes with a hot core, for hit flashes. */
function makeStarburstTexture() {
  const size = 128;
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  ctx.translate(c, c);
  const spikes = 8;
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  for (let i = 0; i < spikes; i += 1) {
    const angle = (i / spikes) * Math.PI * 2;
    const len = i % 2 === 0 ? c * .98 : c * .55;
    const width = i % 2 === 0 ? c * .13 : c * .09;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -width);
    ctx.lineTo(len, 0);
    ctx.lineTo(0, width);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, c * .4);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(.55, 'rgba(255,255,255,.85)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(-c, -c, size, size);
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
    this.starTexture = makeStarburstTexture();
    // Camera-facing impact stars — the classic anime hit flash.
    this.stars = new Pool(() => {
      const material = new THREE.SpriteMaterial({ map: this.starTexture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const object = new THREE.Sprite(material); object.visible = false; this.root.add(object);
      return { object, material };
    }, 18);
    // Fake light pops: additive soft-glow sprites. Real PointLights are avoided on
    // purpose — toggling scene light count forces a full shader recompile of every
    // visible material (a frame-long freeze exactly on hit).
    this.lightFlashes = new Pool(() => {
      const material = new THREE.SpriteMaterial({ map: this.texture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const object = new THREE.Sprite(material); object.visible = false; this.root.add(object);
      return { object, material };
    }, 10);
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

  /** Camera-facing radial star flash with pop-in scale and fast falloff. */
  starburst(position, color = 0xffffff, size = 1.6, options = {}) {
    const effect = this.stars.acquire();
    effect.object.position.copy(position);
    effect.object.position.y += options.height ?? 0;
    effect.material.color.set(color);
    effect.material.opacity = options.opacity ?? 1;
    effect.material.rotation = options.rotation ?? Math.random() * Math.PI * 2;
    effect.object.scale.setScalar(size * .25);
    effect.life = effect.maxLife = options.life ?? .18;
    effect.baseOpacity = options.opacity ?? 1;
    effect.targetScale = size;
    effect.spin = options.spin ?? (Math.random() < .5 ? -2.4 : 2.4);
    return effect.object;
  }

  /** Short fake-light pop (additive glow sprite). Skipped on low quality. */
  flash(position, color = 0xffffff, intensity = 14, options = {}) {
    if (this.quality === 'low') return null;
    const effect = this.lightFlashes.acquire();
    effect.object.position.copy(position);
    effect.object.position.y += options.height ?? .6;
    effect.material.color.set(color);
    effect.material.opacity = Math.min(1, intensity / 22) * .85;
    effect.object.scale.setScalar((options.distance ?? 11) * .38);
    effect.life = effect.maxLife = options.life ?? .16;
    effect.baseOpacity = effect.material.opacity;
    return effect.object;
  }

  /**
   * Flashy multi-layer hit VFX (no camera shake) — sparks, flash rings, streaks, optional beam.
   * @param {'light'|'heavy'|'critical'|'finisher'} intensity
   * @param {{ direction?: THREE.Vector3, scale?: number }} options scale multiplies star/ring/spark size (multi-hit coalesce).
   */
  impact(position, color = 0xffffff, intensity = 'light', options = {}) {
    const dir = options.direction?.clone?.().setY(0).normalize?.() ?? new THREE.Vector3(0, 0, 1);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    const scale = Math.max(0.5, options.scale ?? 1);
    const crit = intensity === 'critical';
    const finisher = intensity === 'finisher';
    const heavy = intensity === 'heavy' || crit || finisher;
    const accent = crit ? 0xffe47a : finisher ? 0xfff6d0 : color;
    const white = 0xffffff;
    const sparkCount = Math.round((crit ? 48 : finisher ? 36 : heavy ? 28 : 18) * Math.min(1.35, 0.7 + scale * 0.25));
    const ringSize = (crit ? 2.1 : finisher ? 1.75 : heavy ? 1.25 : .85) * scale;

    // Anime star flash + light pop — instant "contact" read before particles bloom.
    this.starburst(position, white, (crit ? 3.4 : finisher ? 2.9 : heavy ? 2.3 : 1.55) * scale, {
      life: crit ? .22 : .16, opacity: 1,
    });
    if (heavy) {
      this.starburst(position, accent, (crit ? 4.6 : 3.4) * scale, { life: .28, opacity: .7, spin: -3.5 });
    }
    this.flash(position, crit || finisher ? 0xffe9b0 : color, (crit ? 26 : finisher ? 20 : heavy ? 15 : 9) * Math.min(1.4, scale), {
      life: crit ? .2 : .14, distance: (crit ? 14 : 10) * Math.min(1.25, scale),
    });

    // Core white flash + colored spark shell.
    this.burst(position, white, Math.round(sparkCount * .45), {
      speed: crit ? 9.5 : 7.2, size: (crit ? .48 : .34) * Math.min(1.2, scale), life: .28, gravity: 4, upward: .15, height: 0, opacity: 1,
    });
    this.burst(position, accent, sparkCount, {
      speed: crit ? 8.5 : heavy ? 6.8 : 5.2, size: (crit ? .4 : .3) * Math.min(1.2, scale), life: crit ? .55 : .42,
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
    this.slash(position, dir, white, (heavy ? 2.4 : 1.7) * Math.min(1.3, scale), {
      height: 0, thickness: heavy ? .1 : .07, opacity: .95, spin: 4.5, life: .12, grow: 1.4, tilt: .2,
    });
    this.slash(position, dir, accent, (heavy ? 2.8 : 2.0) * Math.min(1.3, scale), {
      height: .05, thickness: heavy ? .08 : .05, opacity: .75, spin: -3.2, life: .16, grow: 1.1,
      angleOffset: 1.1, tilt: -.35,
    });
    if (crit || finisher) {
      this.slash(position, dir, white, 3.2 * Math.min(1.3, scale), {
        height: -.05, thickness: .06, opacity: .65, spin: 6, life: .14, grow: 1.6, angleOffset: -1.0,
      });
      this.pillar(position, accent, (crit ? 5.5 : 4.2) * Math.min(1.2, scale), { life: .32, bottom: .55, opacity: .55 });
      this.trail(position, white, (crit ? .85 : .6) * scale, .16);
      this.trail(position.clone().addScaledVector(dir, .4), accent, .5 * scale, .2);
    } else {
      this.trail(position, accent, .38 * scale, .14);
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

  /**
   * Weapon swing trail — additive slash ribbon + soft glow along the swing path.
   * Prefer blade base→tip world samples when provided (weapon_socket bones); otherwise
   * approximate with origin + facing + range.
   * @param {THREE.Vector3} position mid/origin fallback
   * @param {THREE.Vector3} direction horizontal facing
   * @param {{ heavy?: boolean, angleOffset?: number, height?: number, base?: THREE.Vector3, tip?: THREE.Vector3 }} options
   */
  swingTrail(position, direction, color = 0xffffff, range = 2.4, options = {}) {
    const dir = direction?.clone?.().setY(0) ?? new THREE.Vector3(0, 0, 1);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    else dir.normalize();
    const heavy = Boolean(options.heavy);
    const angle = options.angleOffset ?? 0.42;
    const base = options.base;
    const tip = options.tip;
    const hasBlade = base && tip
      && Number.isFinite(base.x) && Number.isFinite(tip.x)
      && base.distanceToSquared?.(tip) > 1e-4;

    if (hasBlade) {
      // Bone-sampled ribbon: mid along blade edge, size from blade length.
      const mid = base.clone().lerp(tip, 0.55);
      const bladeDir = tip.clone().sub(base);
      const bladeLen = Math.max(0.6, Math.min(range * 1.35, bladeDir.length() * 1.85));
      const horiz = bladeDir.setY(0);
      if (horiz.lengthSq() < 1e-6) horiz.copy(dir);
      else horiz.normalize();
      this.slash(mid, horiz, color, bladeLen, {
        height: 0,
        thickness: heavy ? .14 : .09,
        opacity: heavy ? .95 : .78,
        spin: heavy ? 3.4 : 2.5,
        life: heavy ? .28 : .2,
        grow: heavy ? .85 : .6,
        tilt: .12,
        angleOffset: angle * 0.35,
      });
      this.slash(mid, horiz, 0xffffff, bladeLen * .92, {
        height: 0.05,
        thickness: heavy ? .07 : .045,
        opacity: heavy ? .62 : .48,
        spin: heavy ? -2.8 : -2.1,
        life: heavy ? .2 : .14,
        grow: .95,
        tilt: -.18,
        angleOffset: -angle * 0.55,
      });
      this.trail(tip.clone(), color, heavy ? .55 : .38, heavy ? .22 : .15);
      this.trail(mid, color, heavy ? .4 : .28, .12);
      return;
    }

    const size = range * (heavy ? 1.15 : 1);
    // Fallback ribbon when blade markers are missing (magic/staff/ranged).
    this.slash(position, dir, color, size, {
      height: options.height ?? 1.08,
      thickness: heavy ? .14 : .09,
      opacity: heavy ? .95 : .78,
      spin: heavy ? 3.4 : 2.5,
      life: heavy ? .28 : .2,
      grow: heavy ? .85 : .6,
      tilt: .12,
      angleOffset: angle * 0.35,
    });
    this.slash(position, dir, 0xffffff, size * .92, {
      height: (options.height ?? 1.08) + .08,
      thickness: heavy ? .07 : .045,
      opacity: heavy ? .62 : .48,
      spin: heavy ? -2.8 : -2.1,
      life: heavy ? .2 : .14,
      grow: .95,
      tilt: -.18,
      angleOffset: -angle * 0.55,
    });
    const mid = position.clone().addScaledVector(dir, range * 0.45);
    mid.y += options.height ?? 1.08;
    this.trail(mid, color, heavy ? .55 : .38, heavy ? .22 : .15);
    this.trail(mid.clone().addScaledVector(dir, range * 0.22), color, heavy ? .4 : .28, .12);
  }

  /** Throttled burn ember residual (status readability). */
  statusBurnEmber(position, intensity = 1) {
    const n = Math.max(2, Math.round(4 * intensity));
    this.burst(position, 0xff7a42, n, {
      speed: 1.7, size: 0.15, life: 0.3, upward: 0.55, gravity: 3.5,
    });
  }

  /** Foot ice ring refresh while slowed. */
  statusSlowRing(position, radius = 1.2) {
    this.groundDecal(position, 0xa8ecff, radius, { life: 0.55, opacity: 0.28, startScale: 0.4 });
    this.trail(position.clone().add(new THREE.Vector3(0, 0.55, 0)), 0xa8ecff, 0.2, 0.22);
  }

  /** Bleed drip burst on tick. */
  statusBleedDrip(position) {
    this.burst(position, 0xff4a5a, 3, {
      speed: 1.5, size: 0.12, life: 0.22, upward: 0.15, gravity: 6,
    });
  }

  /** Expose / Hunter Mark head cue. */
  statusExposeMark(position, height = 2.2) {
    this.ring(
      position.clone().add(new THREE.Vector3(0, height, 0)),
      0xffd26b,
      0.55,
      { life: 0.28, startScale: 0.35, height: 0.9, opacity: 0.65 },
    );
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
    // Third mid-height slash for denser whirl silhouette (P1 micro-pass).
    this.slash(position, facing, theme.accent ?? theme.secondary, radius * 0.9, {
      height: h + 0.18, thickness: 0.035, life: 0.2, spin: 3.8 + pulseIndex * 0.4, angleOffset: -0.7, opacity: 0.55,
    });
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
      this.groundDecal(position, theme.dust ?? theme.primary, radius * 0.75, { life: 0.7, opacity: 0.28, startScale: 0.2 });
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

  recipeVortexPull(position, theme, radius) {
    this.ring(position, theme.secondary, radius, { life: 0.55, startScale: 1, opacity: 0.52 });
    this.ring(position, theme.primary, radius * 0.62, { life: 0.44, startScale: 0.9, height: 0.12, opacity: 0.7 });
    const dir = new THREE.Vector3(1, 0, 0);
    this.slash(position, dir, theme.primary, radius * 0.9, { height: 0.5, spin: -5.5, life: 0.42, opacity: 0.62 });
    this.burst(position.clone().add(new THREE.Vector3(0, 0.45, 0)), theme.dust, 18, {
      speed: 3.4, upward: 0.18, size: 0.26, life: 0.55, additive: false,
    });
  }

  recipeBossPullResist(position, target, theme) {
    const direction = target.clone().sub(position).setY(0);
    if (direction.lengthSq() < 0.0001) direction.set(0, 0, 1);
    direction.normalize();
    this.ring(position, theme.core, 1.35, { life: 0.32, startScale: 0.9, opacity: 0.58 });
    this.slash(position, direction, theme.secondary, 1.5, {
      height: 1.05, life: 0.24, opacity: 0.5, thickness: 0.05,
    });
  }

  recipeDualBladeCross(position, direction, mainColor, offhandColor, size = 3) {
    this.slash(position, direction, mainColor, size, {
      height: 1.08, life: 0.28, thickness: 0.07, angleOffset: 0.72, opacity: 0.84,
    });
    this.slash(position, direction, offhandColor, size, {
      height: 1.08, life: 0.3, thickness: 0.07, angleOffset: -0.72, opacity: 0.8,
    });
  }

  recipeShadowCuts(position, direction, color = 0x9a6be8, size = 2.4) {
    this.slash(position, direction, color, size, {
      height: 0.92, life: 0.2, thickness: 0.045, angleOffset: -0.38, opacity: 0.58,
    });
    this.trail(position.clone().add(new THREE.Vector3(0, 0.9, 0)).addScaledVector(direction, 0.5), color, 0.28, 0.18);
  }

  recipeFrenzyExit(position, theme, contacts = 0, cap = 12) {
    const ratio = Math.min(1, contacts / Math.max(1, cap));
    const radius = 2.8 + ratio * 1.6;
    this.ring(position, theme.secondary, radius, { life: 0.5, startScale: 0.08, opacity: 0.78 });
    this.ring(position, theme.core, radius * 0.65, { life: 0.34, startScale: 0.16, height: 0.12, opacity: 0.68 });
    this.burst(position.clone().add(new THREE.Vector3(0, 0.9, 0)), theme.primary, 14 + Math.round(ratio * 20), {
      speed: 5.2, upward: 0.48, size: 0.3, life: 0.55,
    });
  }

  recipeLivingStar(position, theme, cinders = 0, apex = false) {
    this.ring(position, theme.primary, apex ? 4.8 : 2.8, { life: .55, startScale: .08, opacity: .78 });
    this.burst(position.clone().add(new THREE.Vector3(0, .8, 0)), theme.core, 12 + Math.min(3, cinders) * 4, { speed: 4.8, upward: .55, size: .28, life: .55 });
    if (apex) this.pillar(position, theme.secondary, 7.5, { life: .65, bottom: .65, opacity: .48 });
  }

  recipeCrystalDominion(position, theme, radius, lances = 6, apex = false) {
    this.ring(position, theme.primary, radius, { life: .65, startScale: .08 });
    for (let i = 0; i < Math.min(6, lances); i += 1) {
      const angle = i / 6 * Math.PI * 2;
      const at = position.clone().add(new THREE.Vector3(Math.cos(angle) * radius * .72, 0, Math.sin(angle) * radius * .72));
      this.pillar(at, i % 2 ? theme.secondary : theme.core, apex ? 4.8 : 3.2, { life: .58, bottom: .28, opacity: .5 });
    }
  }

  recipeSpaceSeam(from, to, theme, apex = false) {
    const mid = from.clone().add(to).multiplyScalar(.5);
    const direction = to.clone().sub(from).setY(0).normalize();
    this.slash(mid, direction, theme.primary, from.distanceTo(to) * .7, { height: 1, life: apex ? .7 : .4, thickness: .05, opacity: .72 });
    this.trail(mid.clone().add(new THREE.Vector3(0, 1, 0)), theme.secondary, apex ? .65 : .4, .35);
  }

  recipeGravityLens(from, to, theme, impactIndex = 0, impactCount = 1, apex = false) {
    const axis = to.clone().sub(from);
    const horizontal = new THREE.Vector3(axis.z, 0, -axis.x);
    if (horizontal.lengthSq() < 1e-5) horizontal.set(1, 0, 0);
    horizontal.normalize();
    const tangent = new THREE.Vector3(-horizontal.z, 0, horizontal.x);
    const phase = impactIndex * 1.37;
    const stages = apex ? 7 : 5;
    for (let stage = 0; stage < stages; stage += 1) {
      const t = (stage + 1) / stages;
      const radius = (1 - t) * (apex ? 1.8 : 1.25);
      const angle = phase + t * Math.PI * (apex ? 3.2 : 2.35);
      const point = from.clone().lerp(to, t)
        .addScaledVector(horizontal, Math.cos(angle) * radius)
        .addScaledVector(tangent, Math.sin(angle) * radius);
      this.trail(point, stage % 2 ? theme.secondary : theme.core, apex ? .44 : .34, .2 + t * .08);
    }
    this.ring(to, theme.secondary, (apex ? 2.5 : 1.8) + impactIndex / Math.max(1, impactCount) * .45, {
      life: .42, startScale: .18, opacity: .48,
    });
  }

  recipeSpellReaction(position, kind = 'crystal_shards', direction = null) {
    const colors = {
      steam: 0xe8fbff, thermal_shock: 0xffb15c, crystal_shards: 0xaadfff,
      crystal_execution: 0x72cfff, rift_impact: 0xc08cff,
    };
    const color = colors[kind] ?? colors.crystal_shards;
    this.starburst(position.clone().add(new THREE.Vector3(0, 1, 0)), color, 1.8, { life: .3 });
    if (direction && (kind === 'crystal_shards' || kind === 'crystal_execution')) {
      this.slash(position, direction, color, kind === 'crystal_execution' ? 3.2 : 2.5, {
        height: 1.05, thickness: .06, life: .34, opacity: .82,
      });
    }
  }

  recipeGroundFracture(position, direction, theme, radius) {
    this.groundDecal(position, theme.accent, radius * 0.78, { life: 1.15, opacity: 0.48, startScale: 0.15 });
    this.ring(position, theme.core, radius, { life: 0.58, startScale: 0.06, opacity: 0.82 });
    this.slash(position, direction, theme.secondary, radius * 1.05, { height: 0.2, thickness: 0.11, life: 0.36, spin: 0.5 });
    this.slash(position, direction, theme.primary, radius * 0.9, { height: 0.24, thickness: 0.07, life: 0.3, spin: -0.4, angleOffset: Math.PI / 2 });
    this.dust(position, theme.dust, 28, 0.48);
    this.impact(position.clone().add(new THREE.Vector3(0, 0.8, 0)), theme.primary, 'finisher', { direction });
  }

  recipeRangerRupture(position, direction, theme) {
    this.groundDecal(position, theme.secondary, 1.25, { life: .55, opacity: .42, startScale: .2 });
    this.slash(position, direction, theme.primary, 2.2, { height: .18, life: .3, thickness: .06 });
  }

  recipeRangerBackwardCorridor(points, direction, theme) {
    for (const point of points.slice(0, 6)) this.slash(point, direction.clone().negate(), theme.secondary, 3.8, {
      height: .65, life: .36, thickness: .035, opacity: .62,
    });
  }

  recipeWhirlwindScar(from, to, theme) {
    const mid = from.clone().add(to).multiplyScalar(.5);
    const direction = to.clone().sub(from).setY(0).normalize();
    this.slash(mid, direction, theme.secondary, Math.max(2, from.distanceTo(to)), { height: .12, life: .55, thickness: .06 });
  }

  recipeSovereignCross(position, direction, theme, radius) {
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    this.slash(position, direction, theme.primary, radius * 1.8, { height: .9, life: .42, thickness: .08 });
    this.slash(position, side, theme.core, radius * 1.8, { height: 1.05, life: .42, thickness: .08 });
  }

  recipeFangCutLine(from, to, theme, index = 0) {
    const direction = to.clone().sub(from).setY(0).normalize();
    this.slash(from.clone().add(to).multiplyScalar(.5), direction, index % 2 ? theme.secondary : theme.primary,
      from.distanceTo(to), { height: .9, life: .28, thickness: .035 });
  }

  recipeBackbite(position, direction, theme) {
    this.slash(position, direction.clone().negate(), theme.secondary, 3.2, { height: 1, life: .34, thickness: .06 });
  }

  recipeThousandFangFinale(position, direction, theme, lines = 0) {
    this.ring(position, theme.primary, 3.2, { life: .5, startScale: .15 });
    this.starburst(position.clone().add(new THREE.Vector3(0, 1, 0)), theme.core, 1.8 + Math.min(6, lines) * .12, { life: .35 });
  }

  recipeWorldsplitterAct(position, direction, theme, act = 0, apex = false) {
    if (act === 0) this.slash(position, direction, theme.primary, apex ? 6 : 3.8, { height:.7,life:.35,thickness:.06 });
    else if (act === 1) this.groundDecal(position.clone().addScaledVector(direction,4),theme.accent,apex?4:2.5,{life:.7,opacity:.45,startScale:.2});
    else this.slash(position.clone().addScaledVector(direction,4),direction,theme.core,apex?9:5,{height:.2,life:.5,thickness:.09});
  }

  recipeCrosscurrent(position, direction, theme) {
    this.slash(position,direction,theme.secondary,2.4,{height:.8,life:.28,thickness:.04});
  }

  recipeNightPeacockAct(position, direction, theme, act = 0, apex = false) {
    if (act === 0) this.slash(position,direction,theme.primary,apex?4.5:3,{height:1,life:.3,thickness:.05});
    else if (act === 1) this.ring(position,theme.secondary,apex?4:2.8,{life:.42,startScale:.2});
    else this.starburst(position.clone().add(new THREE.Vector3(0,1,0)),theme.core,3.2,{life:.38});
  }

  recipeThornGrid(position, direction, theme, lines = 0) {
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    for (let i = 0; i < Math.min(5, lines); i += 1) {
      const at = position.clone().addScaledVector(side, (i - 2) * .9);
      this.slash(at, direction, i % 2 ? theme.secondary : theme.primary, 4.8, { height: .08, life: .8, thickness: .035, opacity: .52 });
    }
  }

  recipeSkyHunterArc(from, to, direction, theme, layers = 1) {
    const mid = from.clone().add(to).multiplyScalar(.5).add(new THREE.Vector3(0, 2.4, 0));
    this.trail(mid, theme.core, .55, .3);
    for (let i = 0; i < Math.min(3, layers); i += 1) this.slash(mid.clone().add(new THREE.Vector3(0, i * .35, 0)), direction, theme.primary, 2.2 + i * .5, { height: 1, life: .42, thickness: .04 });
  }

  recipePredatorConvergence(position, direction, theme, apex = false) {
    this.ring(position, theme.secondary, apex ? 4.2 : 2.6, { life: .58, startScale: .16, opacity: .6 });
    const count = apex ? 8 : 4;
    for (let i = 0; i < count; i += 1) {
      const angle = i / count * Math.PI * 2;
      const at = position.clone().add(new THREE.Vector3(Math.cos(angle) * 2, 1 + (i % 2) * .4, Math.sin(angle) * 2));
      this.trail(at, i % 2 ? theme.primary : theme.core, .4, .22);
    }
    this.slash(position, direction, theme.accent, apex ? 4.8 : 3.2, { height: 1.1, life: .4, thickness: .07 });
  }

  recipeJudgmentApex(position, theme, radius) {
    const count = this.#count(8, 4);
    for (let i = 0; i < count; i += 1) {
      const angle = i / count * Math.PI * 2;
      const at = position.clone().add(new THREE.Vector3(Math.cos(angle) * radius * 0.72, 0, Math.sin(angle) * radius * 0.72));
      this.pillar(at, i % 2 ? theme.primary : theme.secondary, 3.8 + (i % 3) * 0.7, {
        life: 0.72, bottom: 0.38, opacity: 0.48,
      });
    }
    this.ring(position, theme.core, radius * 1.12, { life: 0.82, startScale: 0.08, opacity: 0.72 });
    this.burst(position.clone().add(new THREE.Vector3(0, 1, 0)), theme.primary, 38, {
      speed: 6.2, upward: 0.7, size: 0.36, life: 0.75,
    });
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

  recipeArsenalAct(center, theme, act = 1, apex = false) {
    const radius = apex ? 5.2 : 3.6;
    if (act === 1) {
      this.groundDecal(center, theme.accent, radius, { life: .62, opacity: .42, startScale: .16 });
      this.pillar(center, theme.secondary, apex ? 6.2 : 4.4, { life: .46, bottom: .7, opacity: .4 });
      return;
    }
    this.ring(center, act % 2 ? theme.secondary : theme.primary, radius * (.64 + (act - 2) * .18), {
      life: .42 + (act - 2) * .08, startScale: .12, height: .04 * (act - 1), opacity: .68,
    });
    const angle = (act - 2) * Math.PI / 3;
    this.slash(center, new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)), theme.core, radius * 1.35, {
      height: .32 + (act - 2) * .18, life: .34, thickness: .055, opacity: .78,
    });
  }

  recipeFireOrb(muzzle, direction, theme) {
    this.slash(muzzle, direction, theme.secondary, 2.9, { height: 0.95, life: 0.28, thickness: 0.08, spin: 2 });
    this.burst(muzzle.clone().add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(direction, 0.6), theme.primary, 16, {
      speed: 3.8, size: 0.28, life: 0.36, upward: 0.35,
    });
    this.trail(muzzle.clone().add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(direction, 0.8), theme.core, 0.55, 0.2);
  }

  recipeFireBlast(at, theme, radius) {
    // Scorch residual + dual ring for explosion silhouette (P1).
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
    this.starburst(position.clone().add(new THREE.Vector3(0, .9, 0)), theme.core, 3.2, { life: .22 });
    this.flash(position, theme.primary, 18, { life: .18, distance: radius + 5 });
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
    this.starburst(point.clone().add(new THREE.Vector3(0, 1, 0)), theme.core, 3.6, { life: .24 });
    this.flash(point, theme.primary, 22, { life: .2, distance: 13 });
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

  recipeMoonlessAct(position, direction, theme, act = 0, apex = false) {
    if (act === 0) {
      const side = new THREE.Vector3(-direction.z, 0, direction.x);
      this.slash(position.clone().addScaledVector(direction, 1.35), direction, theme.primary, apex ? 4.8 : 3.5, {
        height: .78, life: .24, thickness: .04, opacity: .82,
      });
      this.slash(position.clone().addScaledVector(side, .18), direction, theme.secondary, apex ? 4.1 : 3, {
        height: 1.05, life: .2, thickness: .028, opacity: .66,
      });
      return;
    }
    if (act === 1) {
      this.ring(position, theme.accent, apex ? 3.8 : 2.8, { life: .4, startScale: .2, opacity: .58 });
      this.burst(position.clone().add(new THREE.Vector3(0, .9, 0)), theme.secondary, apex ? 24 : 14, {
        speed: 4.8, size: .24, life: .42, upward: .32,
      });
      return;
    }
    this.ring(position, theme.core, 4.4, { life: .56, startScale: .08, opacity: .78 });
    this.pillar(position, theme.primary, 6.4, { life: .48, bottom: .85, opacity: .48 });
    this.starburst(position.clone().add(new THREE.Vector3(0, 1, 0)), theme.secondary, 3.4, { life: .4 });
  }

  recipeApexKeystone(position, classId, theme, count = 1) {
    const pulses = this.#count(Math.min(8, Math.max(1, count * 2)), 1);
    const color = classId === 'wizard' ? theme.core : classId === 'rogue' ? theme.secondary : theme.primary;
    this.ring(position, color, 2.2 + Math.min(3, count) * .35, { life:.48,startScale:.12,opacity:.72 });
    this.burst(position.clone().add(new THREE.Vector3(0,1,0)),color,pulses,{speed:4.8,size:.24,life:.42,upward:.4});
    this.starburst(position.clone().add(new THREE.Vector3(0,1,0)),theme.accent,1.5+Math.min(3,count)*.3,{life:.34});
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
  recipeArrowStreak(muzzle, direction, theme, rail = false) {
    this.slash(muzzle, direction, rail ? theme.core : theme.secondary, rail ? 4.2 : 2.4, {
      height: 0.75, life: rail ? .34 : 0.2, thickness: rail ? .075 : 0.04, spin: 1.2, opacity: rail ? .88 : .65,
    });
    if (rail) this.slash(muzzle.clone().addScaledVector(direction, 1.6), direction, theme.primary, 5.4, {
      height: .82, life: .38, thickness: .035, opacity: .62,
    });
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
    for (const effect of this.stars.active()) {
      effect.life -= delta;
      const t = Math.max(0, effect.life / effect.maxLife);
      const progress = 1 - t;
      // Snap out fast (elastic pop), collapse opacity with a hot tail.
      const pop = 1 - Math.pow(1 - Math.min(1, progress * 2.6), 3);
      effect.object.scale.setScalar(effect.targetScale * (.25 + pop * .75));
      effect.material.rotation += effect.spin * delta;
      effect.material.opacity = Math.pow(t, 1.35) * effect.baseOpacity;
      if (effect.life <= 0) this.stars.release(effect);
    }
    for (const effect of this.lightFlashes.active()) {
      effect.life -= delta;
      const t = Math.max(0, effect.life / effect.maxLife);
      effect.object.scale.multiplyScalar(1 + delta * 2.4);
      effect.material.opacity = effect.baseOpacity * t * t;
      if (effect.life <= 0) this.lightFlashes.release(effect);
    }
  }

  #pools() {
    return [this.particles, this.slashes, this.rings, this.pillars, this.trails, this.decals, this.ghosts, this.beams, this.stars, this.lightFlashes];
  }

  clear() {
    for (const pool of this.#pools()) {
      for (const effect of pool.active()) pool.release(effect);
    }
  }

  dispose() {
    this.clear();
    for (const pool of this.#pools()) {
      for (const item of pool.items) {
        if (item.geometry && !Object.values(this.shared).includes(item.geometry)) item.geometry.dispose?.();
        item.material?.dispose?.();
      }
    }
    for (const geometry of Object.values(this.shared)) geometry.dispose();
    this.texture.dispose(); this.starTexture.dispose(); this.scene.remove(this.root);
  }
}
