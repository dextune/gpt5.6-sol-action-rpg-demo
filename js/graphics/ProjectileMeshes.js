/**
 * Distinct projectile meshes for combat — not a single shared sphere.
 * Geometries are shared; materials are per-instance (disposed on despawn).
 */
import * as THREE from 'three';

/** @typedef {'mana'|'arrow'|'heavy_arrow'|'dagger'|'fireball'|'blade_wave'|'enemy_spit'|'enemy_bolt'|'enemy_shard'|'enemy_ember'|'enemy_void'|'enemy_frost'} ProjectileStyle */

const _geo = {
  manaCore: null,
  manaShell: null,
  arrowShaft: null,
  arrowHead: null,
  arrowFletch: null,
  heavyShaft: null,
  heavyHead: null,
  daggerBlade: null,
  daggerGuard: null,
  fireCore: null,
  fireShell: null,
  fireSpike: null,
  waveBody: null,
  spitBlob: null,
  boltCrystal: null,
  boltTrail: null,
  shard: null,
  ember: null,
  voidDisc: null,
  voidCore: null,
  frostShard: null,
};

function bank() {
  if (_geo.manaCore) return _geo;
  // —— Wizard mana bolt —— crystalline core + soft shell
  _geo.manaCore = new THREE.OctahedronGeometry(0.14, 0);
  _geo.manaShell = new THREE.IcosahedronGeometry(0.2, 0);

  // —— Arrow (Z-forward) ——
  _geo.arrowShaft = new THREE.CylinderGeometry(0.022, 0.03, 0.58, 6);
  _geo.arrowShaft.rotateX(Math.PI / 2);
  _geo.arrowHead = new THREE.ConeGeometry(0.065, 0.16, 6);
  _geo.arrowHead.rotateX(Math.PI / 2);
  _geo.arrowHead.translate(0, 0, 0.34);
  _geo.arrowFletch = new THREE.BoxGeometry(0.12, 0.02, 0.1);
  _geo.arrowFletch.translate(0, 0, -0.28);

  _geo.heavyShaft = new THREE.CylinderGeometry(0.03, 0.04, 0.72, 6);
  _geo.heavyShaft.rotateX(Math.PI / 2);
  _geo.heavyHead = new THREE.ConeGeometry(0.09, 0.2, 7);
  _geo.heavyHead.rotateX(Math.PI / 2);
  _geo.heavyHead.translate(0, 0, 0.42);

  // —— Dagger / knife ——
  _geo.daggerBlade = new THREE.ConeGeometry(0.055, 0.42, 4);
  _geo.daggerBlade.rotateX(Math.PI / 2);
  _geo.daggerBlade.translate(0, 0, 0.08);
  _geo.daggerGuard = new THREE.BoxGeometry(0.14, 0.03, 0.04);

  // —— Fireball ——
  _geo.fireCore = new THREE.IcosahedronGeometry(0.18, 0);
  _geo.fireShell = new THREE.IcosahedronGeometry(0.28, 0);
  _geo.fireSpike = new THREE.ConeGeometry(0.08, 0.2, 5);

  // —— Crescent ground wave ——
  _geo.waveBody = new THREE.BoxGeometry(1.35, 0.16, 0.42);

  // —— Enemy spit / goo ——
  _geo.spitBlob = new THREE.SphereGeometry(0.2, 8, 6);

  // —— Caster bolt ——
  _geo.boltCrystal = new THREE.OctahedronGeometry(0.16, 0);
  _geo.boltCrystal.scale(1, 1, 1.6);
  _geo.boltTrail = new THREE.ConeGeometry(0.1, 0.28, 5);
  _geo.boltTrail.rotateX(-Math.PI / 2);
  _geo.boltTrail.translate(0, 0, -0.22);

  // —— Rock shard ——
  _geo.shard = new THREE.TetrahedronGeometry(0.2, 0);

  // —— Ember ——
  _geo.ember = new THREE.OctahedronGeometry(0.12, 0);

  // —— Void disc ——
  _geo.voidDisc = new THREE.TorusGeometry(0.16, 0.045, 6, 16);
  _geo.voidCore = new THREE.SphereGeometry(0.1, 8, 6);

  // —— Frost ——
  _geo.frostShard = new THREE.ConeGeometry(0.1, 0.32, 5);
  _geo.frostShard.rotateX(Math.PI / 2);

  return _geo;
}

function mat(color, opacity = 0.92, additive = true) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  material.userData.baseOpacity = opacity;
  return material;
}

function darken(hex, amount = 0.35) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - amount);
  return c.getHex();
}

function lighten(hex, amount = 0.35) {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color(0xffffff), amount);
  return c.getHex();
}

/**
 * @param {ProjectileStyle} style
 * @param {number} color
 * @param {{ scale?: number }} [options]
 * @returns {{ root: THREE.Group, materials: THREE.Material[], orient: boolean, spin: 'tumble'|'roll'|'none', trailRate: number, trailSize: number }}
 */
export function createProjectileVisual(style, color, options = {}) {
  const g = bank();
  const root = new THREE.Group();
  root.name = `proj_${style}`;
  const materials = [];
  const scale = options.scale ?? 1;
  let orient = false;
  let spin = 'tumble';
  let trailRate = 16;
  let trailSize = 0.18;

  const add = (geometry, material, pos = null, rot = null, scl = null) => {
    materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    if (scl) mesh.scale.set(scl[0], scl[1], scl[2]);
    root.add(mesh);
    return mesh;
  };

  switch (style) {
    case 'arrow': {
      orient = true;
      spin = 'roll';
      trailRate = 22;
      trailSize = 0.14;
      add(g.arrowShaft, mat(lighten(color, 0.15), 0.95, false));
      add(g.arrowHead, mat(color, 1, false));
      add(g.arrowFletch, mat(darken(color, 0.25), 0.9, false), null, [0, 0, 0.4]);
      add(g.arrowFletch, mat(darken(color, 0.25), 0.9, false), null, [0, 0, -0.4]);
      break;
    }
    case 'heavy_arrow': {
      orient = true;
      spin = 'roll';
      trailRate = 20;
      trailSize = 0.2;
      add(g.heavyShaft, mat(lighten(color, 0.1), 0.95, false));
      add(g.heavyHead, mat(color, 1, false));
      add(g.arrowFletch, mat(0xe8d8b0, 0.9, false), [0, 0, -0.32], [0, 0, 0.5], [1.2, 1, 1.1]);
      add(g.arrowFletch, mat(0xe8d8b0, 0.9, false), [0, 0, -0.32], [0, 0, -0.5], [1.2, 1, 1.1]);
      break;
    }
    case 'dagger': {
      orient = true;
      spin = 'roll';
      trailRate = 18;
      trailSize = 0.12;
      add(g.daggerBlade, mat(color, 0.95, false));
      add(g.daggerGuard, mat(lighten(color, 0.25), 0.9, false), [0, 0, -0.08]);
      break;
    }
    case 'fireball': {
      orient = false;
      spin = 'tumble';
      trailRate = 28;
      trailSize = 0.28;
      add(g.fireCore, mat(lighten(color, 0.35), 1, true));
      add(g.fireShell, mat(color, 0.55, true));
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2;
        add(g.fireSpike, mat(lighten(color, 0.1), 0.75, true), [Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0], [0, 0, a]);
      }
      break;
    }
    case 'blade_wave': {
      orient = true;
      spin = 'none';
      trailRate = 30;
      trailSize = 0.32;
      add(g.waveBody, mat(color, 0.75, true));
      add(g.waveBody, mat(lighten(color, 0.4), 0.4, true), [0, 0.05, 0], null, [0.85, 0.6, 0.7]);
      break;
    }
    case 'enemy_spit': {
      orient = false;
      spin = 'tumble';
      trailRate = 14;
      trailSize = 0.22;
      add(g.spitBlob, mat(color, 0.88, false), null, null, [1.15, 0.85, 1]);
      add(g.spitBlob, mat(lighten(color, 0.2), 0.45, true), null, null, [0.55, 0.55, 0.55]);
      break;
    }
    case 'enemy_bolt': {
      orient = true;
      spin = 'roll';
      trailRate = 20;
      trailSize = 0.22;
      add(g.boltCrystal, mat(color, 0.95, true));
      add(g.boltTrail, mat(lighten(color, 0.25), 0.55, true));
      break;
    }
    case 'enemy_shard': {
      orient = true;
      spin = 'tumble';
      trailRate = 12;
      trailSize = 0.16;
      add(g.shard, mat(color, 0.92, false));
      add(g.shard, mat(darken(color, 0.3), 0.7, false), null, [0.5, 0.3, 0.2], [0.55, 0.55, 0.55]);
      break;
    }
    case 'enemy_ember': {
      orient = false;
      spin = 'tumble';
      trailRate = 24;
      trailSize = 0.2;
      add(g.ember, mat(color, 0.95, true));
      add(g.ember, mat(lighten(color, 0.4), 0.5, true), null, null, [1.5, 1.5, 1.5]);
      break;
    }
    case 'enemy_void': {
      orient = true;
      spin = 'roll';
      trailRate = 18;
      trailSize = 0.24;
      add(g.voidDisc, mat(color, 0.85, true), null, [Math.PI / 2, 0, 0]);
      add(g.voidCore, mat(lighten(color, 0.35), 0.9, true));
      break;
    }
    case 'enemy_frost': {
      orient = true;
      spin = 'roll';
      trailRate = 16;
      trailSize = 0.18;
      add(g.frostShard, mat(color, 0.92, true));
      add(g.frostShard, mat(lighten(color, 0.3), 0.55, true), null, [0, 0, Math.PI / 3], [0.6, 0.6, 0.7]);
      break;
    }
    case 'mana':
    default: {
      orient = false;
      spin = 'tumble';
      trailRate = 18;
      trailSize = 0.2;
      add(g.manaCore, mat(lighten(color, 0.45), 1, true));
      add(g.manaShell, mat(color, 0.55, true));
      break;
    }
  }

  root.scale.setScalar(scale);
  return { root, materials, orient, spin, trailRate, trailSize };
}

/** Dispose per-instance materials; shared geometries stay. */
export function disposeProjectileVisual(root, materials = []) {
  for (const m of materials) m?.dispose?.();
  if (root) {
    root.traverse(obj => {
      if (obj.isMesh && obj.material && !materials.includes(obj.material)) {
        const list = Array.isArray(obj.material) ? obj.material : [obj.material];
        list.forEach(m => m.dispose?.());
      }
    });
  }
}

/**
 * Point a Z-forward projectile along a velocity / direction vector.
 * @param {THREE.Object3D} root
 * @param {THREE.Vector3} direction horizontal unit-ish
 * @param {number} [spinRoll] extra roll radians
 */
export function orientProjectile(root, direction, spinRoll = 0) {
  const yaw = Math.atan2(direction.x, direction.z);
  root.rotation.set(0, yaw, spinRoll);
}
