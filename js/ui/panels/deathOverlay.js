/**
 * Death overlay helpers (W1 UI panel extract).
 * Call with UI instance; DOM ids stay owned by index.html / UI.elements.
 */
import { clamp } from '../../core/Utils.js';

export function showDeath(ui) {
  const els = ui.elements;
  els['death-screen'].classList.remove('hidden');
  els['death-timer-fill'].style.width = '100%';
  const root = els['death-screen']?.querySelector('div');
  if (!root) return;
  const title = root.querySelector('h2');
  const copy = root.querySelector('p');
  const eyebrow = root.querySelector('span');
  const game = ui.game;
  if (game.mode === 'defense') {
    const wave = game.defense?.hud?.wave ?? game.defense?.wave ?? 1;
    const best = game.defense?.bestWaveThisRun ?? game.defenseMeta?.bestWave ?? wave;
    const kills = game.defense?.killsThisRun ?? 0;
    const mut = game.defense?.mutator?.label;
    if (eyebrow) eyebrow.textContent = 'DEFENSE FAILED';
    if (title) title.textContent = `You fell on wave ${wave}`;
    if (copy) {
      copy.textContent = mut
        ? `Best wave ${best} · ${kills} kills · Last mutator: ${mut}. Returning to title.`
        : `Best wave ${best} · ${kills} kills. Returning to title.`;
    }
  } else if (game.hunt?.isMax) {
    if (eyebrow) eyebrow.textContent = 'BREACH OVERRUN';
    if (title) title.textContent = 'The invasion does not end';
    if (copy) copy.textContent = 'Revived at the breached hub. The spring is not safe.';
  } else {
    if (eyebrow) eyebrow.textContent = 'HUNTER DOWN';
    if (title) title.textContent = 'The hunt is not over';
    if (copy) copy.textContent = "Regroup at the camp's guardian stone.";
  }
}

export function setDeathProgress(ui, ratio) {
  ui.elements['death-timer-fill'].style.width = `${clamp(ratio, 0, 1) * 100}%`;
}

export function hideDeath(ui) {
  ui.elements['death-screen'].classList.add('hidden');
}
