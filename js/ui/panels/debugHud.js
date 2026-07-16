/**
 * F3 debug HUD helpers (W1 UI panel extract).
 */
import { escapeHtml } from '../uiShared.js';

export function setDebugVisible(ui, visible) {
  const el = ui.elements['debug-hud'];
  if (!el) return;
  el.classList.toggle('hidden', !visible);
  el.classList.toggle('visible', Boolean(visible));
}

export function updateDebug(ui, snapshot = {}) {
  const el = ui.elements['debug-hud'];
  if (!el || el.classList.contains('hidden')) return;
  const player = snapshot.player;
  const assets = snapshot.assets;
  const lines = [
    `state ${snapshot.state ?? '-'} · quality ${snapshot.quality ?? '-'}`,
    `fps ${Number(snapshot.fps ?? 0).toFixed(1)} · scale ${Number(snapshot.renderScale ?? 1).toFixed(2)}`,
    `draw ${snapshot.calls ?? 0} · tris ${Number(snapshot.triangles ?? 0).toLocaleString('en-US')}`,
    `geo ${snapshot.geometries ?? 0} · tex ${snapshot.textures ?? 0}`,
    `enemies ${snapshot.enemies ?? 0}`,
  ];
  if (player) {
    lines.push(`player Lv.${player.level} hp ${Math.round(player.hp)}`);
    lines.push(`pos ${player.x?.toFixed?.(1) ?? player.x}, ${player.z?.toFixed?.(1) ?? player.z}`);
  }
  if (assets) {
    lines.push(`assets models ${assets.models ?? assets.modelCount ?? '-'} tex ${assets.textures ?? assets.textureCount ?? '-'}`);
  }
  el.innerHTML = `<strong>DEV HUD · F3</strong><pre>${lines.map(escapeHtml).join('\n')}</pre>`;
}
