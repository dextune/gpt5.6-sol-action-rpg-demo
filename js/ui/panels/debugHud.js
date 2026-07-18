/**
 * F3 debug HUD helpers (W1 UI panel extract).
 *
 * Hero graphics/animation diagnostics (character-graphics-animation-overhaul plan §4.1):
 * asset status, normal/wireframe/skeleton/material debug views, and animation-runtime
 * state (layer weights, normalized time, contact markers, IK/support/foot errors).
 *
 * All hero-runtime fields are read defensively (optional chaining, '-' fallback) because
 * the v2 asset-contract / layered-animation fields land incrementally from other slices
 * of this workstream; the HUD must never throw when they are absent.
 *
 * Never runs/allocates scene objects unless the debug panel is visible and a view toggle
 * is switched on; text refresh piggybacks on Game's own throttled debug tick (~4Hz).
 */
import * as THREE from 'three';
import { getHeroClass } from '../../data/content.js';

const SOCKET_NAMES = [
  'weapon_socket_r', 'weapon_socket_l', 'weapon_socket', 'offhand_socket',
  'hand_ik_l', 'hand_ik_r', 'foot_contact_l', 'foot_contact_r', 'head_look_target',
  'back_socket', 'hip_socket_l', 'hip_socket_r',
];
const WEAPON_SOCKET_NAMES = ['muzzle_socket', 'grip_support', 'trail_base', 'trail_tip', 'stock_anchor'];
const MARKER_COLOR = 0xff5fc7;
const MARKER_GEOMETRY = new THREE.SphereGeometry(.035, 6, 6);

function num(value, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function bool(value) {
  return value == null ? '-' : (value ? 'yes' : 'no');
}

function str(value) {
  return value == null || value === '' ? '-' : String(value);
}

/** Per-UI debug view state (view toggles + live scene overrides). Created lazily, once. */
function viewState(ui) {
  if (!ui.__debugView) {
    ui.__debugView = {
      normal: false, wireframe: false, skeleton: false, materials: false,
      appliedMesh: null, normalOriginals: null, skeletonHelper: null, markers: [],
    };
  }
  return ui.__debugView;
}

function heroMesh(ui) {
  return ui.game?.player?.mesh ?? null;
}

function clearNormalView(state) {
  if (!state.normalOriginals) return;
  for (const [object, material] of state.normalOriginals) object.material = material;
  state.normalOriginals = null;
}

function applyNormalView(ui, state, on) {
  const mesh = heroMesh(ui);
  clearNormalView(state);
  if (!on || !mesh) return;
  const overrides = new Map();
  mesh.traverse(object => {
    if (!object.isMesh) return;
    overrides.set(object, object.material);
    object.material = new THREE.MeshNormalMaterial();
  });
  state.normalOriginals = overrides;
}

function applyWireframe(ui, on) {
  for (const material of ui.game?.player?.refs?.materials ?? []) {
    if (material) material.wireframe = Boolean(on);
  }
}

function clearSkeletonView(ui, state) {
  const scene = ui.game?.scene;
  if (state.skeletonHelper) {
    scene?.remove(state.skeletonHelper);
    state.skeletonHelper = null;
  }
  for (const marker of state.markers) marker.parent?.remove(marker);
  state.markers = [];
}

function applySkeletonView(ui, state, on) {
  const mesh = heroMesh(ui);
  const scene = ui.game?.scene;
  clearSkeletonView(ui, state);
  if (!on || !mesh || !scene) return;
  state.skeletonHelper = new THREE.SkeletonHelper(mesh);
  scene.add(state.skeletonHelper);
  const refs = ui.game.player?.refs ?? {};
  const roots = [mesh, refs.weapon, refs.offhandWeapon].filter(Boolean);
  const names = [...SOCKET_NAMES, ...WEAPON_SOCKET_NAMES];
  for (const root of roots) {
    for (const name of names) {
      const target = root.getObjectByName(name);
      if (!target || state.markers.includes(target)) continue;
      const marker = new THREE.Mesh(MARKER_GEOMETRY, new THREE.MeshBasicMaterial({ color: MARKER_COLOR, depthTest: false }));
      marker.name = `debug_marker_${name}`;
      marker.renderOrder = 999;
      target.add(marker);
      state.markers.push(marker);
    }
  }
}

/** Re-apply active toggles if the hero mesh changed underneath us (class swap). */
function resyncViews(ui, state) {
  const mesh = heroMesh(ui);
  if (mesh === state.appliedMesh) return;
  state.appliedMesh = mesh;
  if (state.normal) applyNormalView(ui, state, true);
  if (state.wireframe) applyWireframe(ui, true);
  if (state.skeleton) applySkeletonView(ui, state, true);
}

function resetDebugViews(ui) {
  const state = viewState(ui);
  clearNormalView(state);
  applyWireframe(ui, false);
  clearSkeletonView(ui, state);
  state.normal = false;
  state.wireframe = false;
  state.skeleton = false;
  state.materials = false;
  state.appliedMesh = null;
}

const TOGGLES = [
  { key: 'normal', label: 'Normal', apply: (ui, state, on) => applyNormalView(ui, state, on) },
  { key: 'wireframe', label: 'Wire', apply: (ui, _state, on) => applyWireframe(ui, on) },
  { key: 'skeleton', label: 'Skeleton', apply: (ui, state, on) => applySkeletonView(ui, state, on) },
  { key: 'materials', label: 'Materials', apply: () => {} },
];

function ensureDom(ui) {
  const el = ui.elements['debug-hud'];
  if (!el || el.__debugBuilt) return el;
  el.__debugBuilt = true;
  el.innerHTML = '';
  const title = document.createElement('strong');
  title.textContent = 'DEV HUD · F3';
  const row = document.createElement('div');
  row.className = 'debug-hud-toggles';
  for (const toggle of TOGGLES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = toggle.label;
    button.dataset.toggle = toggle.key;
    button.addEventListener('click', () => {
      const state = viewState(ui);
      state[toggle.key] = !state[toggle.key];
      resyncViews(ui, state);
      toggle.apply(ui, state, state[toggle.key]);
      button.classList.toggle('active', state[toggle.key]);
      renderText(ui);
    });
    row.appendChild(button);
  }
  const pre = document.createElement('pre');
  el.append(title, row, pre);
  return el;
}

function formatLayers(layers) {
  if (!layers || typeof layers !== 'object') return 'layers -';
  const slot = (name) => {
    const layer = layers[name];
    if (layer == null) return `${name}=-`;
    if (typeof layer === 'number') return `${name}=${num(layer)}`;
    if (Array.isArray(layer)) {
      return `${name}=[${layer.map(entry => `${str(entry?.name)}:${num(entry?.weight)}`).join(',') || '-'}]`;
    }
    if (name === 'additive') {
      const entries = Object.entries(layer);
      return `additive=[${entries.map(([clip, weight]) => `${clip}:${num(weight)}`).join(',') || '-'}]`;
    }
    return `${name}=${str(layer.name)}:${num(layer.weight)}@${num(layer.normalizedTime)}`;
  };
  return `layers ${slot('base')} ${slot('upper')} ${slot('full')} ${slot('additive')}`;
}

function formatIk(ik) {
  if (!ik || typeof ik !== 'object') return 'ik -';
  const point = (name) => {
    const p = ik[name];
    if (!p) return `${name}=-`;
    return `${name} err=${num(p.error, 3)}${p.clamped ? '*' : ''}${p.active === false ? ' idle' : ''}`;
  };
  return `ik ${point('hand_l')} ${point('hand_r')} ${point('foot_l')} ${point('foot_r')}`;
}

function formatEvents(events) {
  if (!Array.isArray(events) || !events.length) return 'contacts -';
  const eventName = (event) => event?.name ?? event?.key?.description ?? event?.action?.getClip?.()?.name;
  const shown = events.slice(-4).map(event => `${str(eventName(event))}@${num(event?.normalizedTime)}${event?.fired ? '\u2713' : ''}`);
  return `contacts ${shown.join(' ')}`;
}

function heroDiagnostics(ui) {
  const player = ui.game?.player;
  if (!player) return ['hero -'];
  const classId = player.classId;
  const heroDef = classId ? getHeroClass(classId) : null;
  const modelKey = heroDef?.modelKey;
  const refs = player.refs ?? {};
  const assets = ui.game?.assets;
  const entry = assets?.getModelEntry?.(modelKey, refs.quality ?? player.quality);
  const lines = [];
  lines.push(`hero ${str(classId)} key=${str(modelKey)} q=${str(entry?.quality ?? refs.quality)}`);
  lines.push(`url=${str(entry?.url)}`);
  lines.push(`fallback=${bool(refs.fallback)} assetError=${bool(refs.assetError)}`);
  if (refs.assetErrorDetail) {
    lines.push(`assetErrorDetail=${str(refs.assetErrorDetail.reason ?? refs.assetErrorDetail)}`);
  }
  const contract = refs.contract;
  lines.push(`contract=${contract ? (contract.ok ? 'ok' : `FAIL:${(contract.issues ?? []).join(',') || '?'}`) : '-'}`);
  const sockets = refs.socketNames ?? {
    primary: refs.socket?.name, offhand: refs.offhandSocket?.name, muzzle: refs.weapon?.getObjectByName?.('muzzle_socket')?.name,
  };
  lines.push(`sockets primary=${str(sockets?.primary)} offhand=${str(sockets?.offhand)} muzzle=${str(sockets?.muzzle)}`);

  const animation = player.animation;
  const diagnostics = animation?.getDiagnostics?.();
  lines.push(`clip=${str(animation?.currentName)} band=${str(animation?.locoBand)} state=${str(diagnostics?.locomotionState)}`);
  lines.push(formatLayers(diagnostics?.layerWeights ?? animation?.layers));
  lines.push(formatIk(diagnostics?.ik ?? animation?.grounding?.ik));
  lines.push(formatEvents(diagnostics?.events ?? animation?.events));

  const state = viewState(ui);
  if (state.materials) {
    const materials = refs.materials ?? [];
    if (!materials.length) lines.push('materials -');
    for (const material of materials.slice(0, 8)) {
      const info = material?.userData ?? {};
      const maps = ['hasMap', 'hasNormalMap', 'hasEmissiveMap', 'hasAlphaMap']
        .filter(key => info[key]).map(key => key.replace('has', '').replace('Map', '').toLowerCase());
      lines.push(`mat ${str(material?.name)} role=${str(info.materialRole)} maps=[${maps.join(',') || '-'}] preserved=${bool(info.sourceMapsPreserved)} side=${str(material?.side)}`);
    }
  }
  return lines;
}

export function setDebugVisible(ui, visible) {
  const el = ui.elements['debug-hud'];
  if (!el) return;
  el.classList.toggle('hidden', !visible);
  el.classList.toggle('visible', Boolean(visible));
  if (!visible) {
    resetDebugViews(ui);
    el.querySelectorAll('.debug-hud-toggles button.active').forEach(button => button.classList.remove('active'));
  }
}

function renderText(ui) {
  const el = ensureDom(ui);
  if (!el) return;
  const pre = el.querySelector('pre');
  if (pre) pre.textContent = ui.__debugLines?.join('\n') ?? '';
}

export function updateDebug(ui, snapshot = {}) {
  const el = ui.elements['debug-hud'];
  if (!el || el.classList.contains('hidden')) return;
  const player = snapshot.player;
  const assets = snapshot.assets;
  const lines = [
    `state ${snapshot.state ?? '-'} \u00b7 quality ${snapshot.quality ?? '-'}`,
    `fps ${Number(snapshot.fps ?? 0).toFixed(1)} \u00b7 scale ${Number(snapshot.renderScale ?? 1).toFixed(2)}`,
    `draw ${snapshot.calls ?? 0} \u00b7 tris ${Number(snapshot.triangles ?? 0).toLocaleString('en-US')}`,
    `geo ${snapshot.geometries ?? 0} \u00b7 tex ${snapshot.textures ?? 0}`,
    `enemies ${snapshot.enemies ?? 0}`,
  ];
  if (player) {
    lines.push(`player Lv.${player.level} hp ${Math.round(player.hp)}`);
    lines.push(`pos ${player.x?.toFixed?.(1) ?? player.x}, ${player.z?.toFixed?.(1) ?? player.z}`);
  }
  if (assets) {
    lines.push(`assets models ${assets.models ?? assets.modelCount ?? '-'} tex ${assets.textures ?? assets.textureCount ?? '-'}`);
  }
  lines.push('\u2014 hero \u2014');
  lines.push(...heroDiagnostics(ui));
  ui.__debugLines = lines;
  resyncViews(ui, viewState(ui));
  renderText(ui);
}
