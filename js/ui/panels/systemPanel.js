/**
 * System / pause panel (N1 UI extract).
 */
import { GAME_CONFIG } from '../../config.js';
import { formatTime } from '../../core/Utils.js';

export function renderSystem(ui) {
    ui.elements['panel-title'].textContent = 'System';
    ui.elements['panel-content'].innerHTML = `
      <div class="system-layout">
        <section class="system-card"><h3>Current Hunt</h3><p>Progress auto-saves every ${GAME_CONFIG.autoSaveSeconds}s; near the hub your HP and mana recover quickly.</p><div class="character-stats"><span>Level <b>${ui.game.player.level}</b></span><span>Play Time <b>${formatTime(ui.game.playTime)}</b></span><span>Kills <b>${ui.game.hunt.totalKills}</b></span><span>World Tier <b>${ui.game.hunt.worldTier}</b></span></div></section>
        <section class="system-card"><h3>Graphics Quality</h3><p>Unified control of post-processing, shadows, vegetation density and dynamic render resolution. <kbd>F3</kbd> shows the dev HUD.</p><div class="quality-actions">${['low','medium','high'].map(id => `<button data-action="quality" data-quality="${id}" class="${ui.game.quality === id ? 'active' : ''}">${{ low: 'Low', medium: 'Medium', high: 'High' }[id]}</button>`).join('')}</div></section>
        <section class="system-card"><h3>Game Menu</h3><div class="system-actions"><button data-action="resume">Resume Hunt</button><button data-action="save">Save Now</button><button data-action="mute">Sound ${ui.game.audio.muted ? 'On' : 'Off'}</button><button data-action="title">Return to Title</button><button class="danger-button" data-action="reset-save">Delete Save Data</button></div></section>
      </div>`;
  }
