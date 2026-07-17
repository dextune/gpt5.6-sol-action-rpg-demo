/**
 * Minimap drawing (N2 UI extract).
 * Zone discs tint by Hunt threat vs player; guided/zone contracts get a compass mark.
 */
import { ZONES } from '../../data/content.js';
import { hexColor } from '../uiShared.js';
import { zoneThreat } from '../../systems/huntThreat.js';

const THREAT_STROKE = Object.freeze({
  safe: 'rgba(122, 184, 154, 0.55)',
  onlevel: 'rgba(109, 255, 154, 0.75)',
  challenging: 'rgba(255, 213, 111, 0.8)',
  danger: 'rgba(255, 154, 74, 0.85)',
  lethal: 'rgba(255, 77, 98, 0.95)',
});

const THREAT_ALPHA = Object.freeze({
  safe: 0.1,
  onlevel: 0.2,
  challenging: 0.16,
  danger: 0.14,
  lethal: 0.12,
});

export function drawMinimap(ui) {
    const context = ui.minimapContext;
    const canvas = ui.elements.minimap;
    const width = canvas.width;
    const center = width / 2;
    const range = 62;
    const scale = (center - 7) / range;
    const player = ui.game.player;
    const playerLevel = player?.level ?? 1;
    const isHunt = ui.game.mode === 'hunt';
    context.clearRect(0, 0, width, width);
    context.save();
    context.beginPath();
    context.arc(center, center, center - 3, 0, Math.PI * 2);
    context.clip();
    const gradient = context.createRadialGradient(center, center, 4, center, center, center);
    gradient.addColorStop(0, '#496f58');
    gradient.addColorStop(1, '#172f35');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, width);

    for (const zone of Object.values(ZONES)) {
      const x = center + (zone.center[0] - player.position.x) * scale;
      const y = center + (zone.center[1] - player.position.z) * scale;
      const threat = isHunt ? zoneThreat(playerLevel, zone) : { id: 'onlevel' };
      const isCurrent = zone.id === ui.game.world.currentZone.id;
      const baseAlpha = THREAT_ALPHA[threat.id] ?? 0.12;
      context.globalAlpha = isCurrent ? Math.min(0.34, baseAlpha + 0.12) : baseAlpha;
      context.fillStyle = hexColor(zone.ground);
      context.beginPath();
      context.arc(x, y, zone.radius * scale, 0, Math.PI * 2);
      context.fill();
      if (isHunt) {
        context.globalAlpha = isCurrent ? 0.95 : 0.55;
        context.strokeStyle = THREAT_STROKE[threat.id] ?? THREAT_STROKE.onlevel;
        context.lineWidth = isCurrent ? 2.2 : 1.2;
        context.beginPath();
        context.arc(x, y, zone.radius * scale, 0, Math.PI * 2);
        context.stroke();
      }
    }
    context.globalAlpha = .18;
    context.strokeStyle = '#d8f1e1';
    context.lineWidth = 1;
    for (const r of [20, 40, 60]) {
      context.beginPath(); context.arc(center, center, r * scale, 0, Math.PI * 2); context.stroke();
    }
    context.beginPath(); context.moveTo(center, 0); context.lineTo(center, width); context.moveTo(0, center); context.lineTo(width, center); context.stroke();

    const campX = center + (0 - player.position.x) * scale;
    const campY = center + (0 - player.position.z) * scale;
    if (campX > 0 && campX < width && campY > 0 && campY < width) {
      context.globalAlpha = .9;
      context.strokeStyle = '#8effd3';
      context.lineWidth = 2;
      context.beginPath(); context.arc(campX, campY, 5, 0, Math.PI * 2); context.stroke();
      context.fillStyle = '#d7fff0'; context.fillRect(campX - 1, campY - 1, 2, 2);
    }

    // Guided / zone contract compass — target zone center.
    if (isHunt) {
      const contract = ui.game.hunt?.contract;
      if (contract && !contract.complete && (contract.type === 'guided' || contract.type === 'zone')) {
        const target = ZONES[contract.zoneId];
        if (target) {
          const tx = center + (target.center[0] - player.position.x) * scale;
          const ty = center + (target.center[1] - player.position.z) * scale;
          const dx = tx - center;
          const dy = ty - center;
          const dist = Math.hypot(dx, dy) || 1;
          const edge = center - 10;
          const onMap = dist < edge;
          const mx = onMap ? tx : center + (dx / dist) * edge;
          const my = onMap ? ty : center + (dy / dist) * edge;
          context.globalAlpha = 0.95;
          context.fillStyle = '#9ef0c8';
          context.strokeStyle = '#16343c';
          context.lineWidth = 1.5;
          context.beginPath();
          context.arc(mx, my, onMap ? 4.5 : 5.5, 0, Math.PI * 2);
          context.fill();
          context.stroke();
          if (!onMap) {
            // Chevron toward off-map contract zone.
            const ang = Math.atan2(dy, dx);
            context.save();
            context.translate(mx, my);
            context.rotate(ang);
            context.beginPath();
            context.moveTo(6, 0);
            context.lineTo(-4, 4);
            context.lineTo(-4, -4);
            context.closePath();
            context.fill();
            context.restore();
          }
        }
      }
    }

    context.globalAlpha = 1;
    for (const enemy of ui.game.enemies.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - player.position.x;
      const dz = enemy.position.z - player.position.z;
      if (dx * dx + dz * dz > range * range) continue;
      const x = center + dx * scale;
      const y = center + dz * scale;
      context.fillStyle = enemy.boss ? '#d78fff' : enemy.elite ? '#ffd56f' : '#ff7180';
      context.shadowColor = context.fillStyle;
      context.shadowBlur = enemy.boss ? 8 : enemy.elite ? 4 : 0;
      context.beginPath(); context.arc(x, y, enemy.boss ? 4.8 : enemy.elite ? 3.2 : 2.1, 0, Math.PI * 2); context.fill();
    }
    context.shadowBlur = 0;
    const yaw = ui.game.player.mesh.rotation.y;
    context.save();
    context.translate(center, center);
    context.rotate(-yaw);
    context.fillStyle = '#f7fff0';
    context.strokeStyle = '#16343c';
    context.lineWidth = 2;
    context.beginPath(); context.moveTo(0, -8); context.lineTo(6, 7); context.lineTo(0, 4); context.lineTo(-6, 7); context.closePath(); context.fill(); context.stroke();
    context.restore();
    context.restore();
  }
