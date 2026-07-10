import * as THREE from 'three';

const MAX_PARTICLES = 96;

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
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group(); this.root.name = 'PooledCombatEffects'; scene.add(this.root);
    this.texture = makeSoftDiscTexture();
    this.shared = {
      slash: ribbonGeometry(),
      ring: new THREE.RingGeometry(.78, 1, 64),
      pillar: new THREE.CylinderGeometry(.08, .68, 1, 16, 1, true),
      trail: new THREE.SphereGeometry(1, 12, 9),
    };
    this.particles = new Pool(() => {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(MAX_PARTICLES * 3);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setDrawRange(0, 0);
      const material = new THREE.PointsMaterial({ map: this.texture, size: .3, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
      const object = new THREE.Points(geometry, material); object.visible = false; object.frustumCulled = false; this.root.add(object);
      return { object, geometry, material, velocities: new Float32Array(MAX_PARTICLES * 3), count: 0 };
    }, 40);
    this.slashes = new Pool(() => {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const object = new THREE.Mesh(this.shared.slash, material); object.visible = false; this.root.add(object); return { object, material };
    }, 28);
    this.rings = new Pool(() => {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const object = new THREE.Mesh(this.shared.ring, material); object.visible = false; object.rotation.x = -Math.PI / 2; this.root.add(object); return { object, material };
    }, 36);
    this.pillars = new Pool(() => {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const object = new THREE.Mesh(this.shared.pillar, material); object.visible = false; this.root.add(object); return { object, material };
    }, 18);
    this.trails = new Pool(() => {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const object = new THREE.Mesh(this.shared.trail, material); object.visible = false; this.root.add(object); return { object, material };
    }, 32);
  }

  burst(position, color = 0xffffff, count = 12, options = {}) {
    const effect = this.particles.acquire();
    effect.count = Math.min(MAX_PARTICLES, Math.max(1, count));
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
  }

  clear() {
    for (const pool of [this.particles, this.slashes, this.rings, this.pillars, this.trails]) for (const effect of pool.active()) pool.release(effect);
  }

  dispose() {
    this.clear();
    for (const pool of [this.particles, this.slashes, this.rings, this.pillars, this.trails]) {
      for (const item of pool.items) { if (item.geometry && item.geometry !== this.shared.slash) item.geometry.dispose?.(); item.material?.dispose?.(); }
    }
    for (const geometry of Object.values(this.shared)) geometry.dispose();
    this.texture.dispose(); this.scene.remove(this.root);
  }
}
