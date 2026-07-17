/**
 * System / pause panel (N1 UI extract).
 */
import { GAME_CONFIG } from '../../config.js';
import { formatTime } from '../../core/Utils.js';

export function renderSystem(ui) {
    ui.elements['panel-title'].textContent = 'System';
    const isMax = Boolean(ui.game.hunt?.isMax);
    const living = ui.game.enemies?.livingCount ?? 0;
    const springCopy = isMax
      ? 'The spring is breached. Full HP regen only when no enemy is nearby (MP still recovers).'
      : 'Near the hub your HP and mana recover quickly.';
    const huntTitle = isMax ? 'MAX HUNT' : 'Current Hunt';
    const resumeLabel = isMax ? 'Resume MAX HUNT' : 'Resume Hunt';
    const variantLabel = isMax ? 'MAX' : 'Legacy';
    ui.elements['panel-content'].innerHTML = `
      <div class="system-layout">
        <section class="system-card"><h3>${huntTitle}</h3><p>Progress auto-saves every ${GAME_CONFIG.autoSaveSeconds}s. ${springCopy}</p><div class="character-stats"><span>Variant <b>${variantLabel}</b></span><span>Level <b>${ui.game.player.level}</b></span><span>Play Time <b>${formatTime(ui.game.playTime)}</b></span><span>Hostiles <b>${living}</b></span><span>Kills <b>${ui.game.hunt.totalKills}</b></span><span>World Tier <b>${ui.game.hunt.worldTier}</b></span></div></section>
        <section class="system-card"><h3>Graphics Quality</h3><p>Unified control of post-processing, shadows, vegetation density and dynamic render resolution. <kbd>F3</kbd> shows the dev HUD.</p><div class="quality-actions">${['low','medium','high'].map(id => `<button data-action="quality" data-quality="${id}" class="${ui.game.quality === id ? 'active' : ''}">${{ low: 'Low', medium: 'Medium', high: 'High' }[id]}</button>`).join('')}</div></section>
        <section class="system-card"><h3>Game Menu</h3><div class="system-actions"><button data-action="resume">${resumeLabel}</button><button data-action="save">Save Now</button><button data-action="mute">Sound ${ui.game.audio.muted ? 'On' : 'Off'}</button><button data-action="title">Return to Title</button><button class="danger-button" data-action="reset-save">Delete Save Data</button></div></section>
      </div>`;
  }
