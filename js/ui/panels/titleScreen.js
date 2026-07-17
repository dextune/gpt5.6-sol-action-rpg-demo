/**
 * Title screen helpers (N1b UI extract).
 */
import {
  getHeroClass,
  resolveHeroClassId,
} from '../../data/content.js';
import { formatTime } from '../../core/Utils.js';
import {
  CLASS_ACCENT,
  formatSaveAge,
} from '../uiShared.js';

export function syncClassSelect(ui) {
    const id = resolveHeroClassId(ui.selectedClassId);
    ui.selectedClassId = id;
    for (const card of ui.classCards) {
      const selected = card.dataset.classId === id;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
  }

/** Compact hero chips: character name + job from shared class presentation data. */
export function fillClassCards(ui) {
    for (const card of ui.classCards) {
      const classId = resolveHeroClassId(card.dataset.classId);
      const hero = getHeroClass(classId);
      const accent = hero?.presentation?.accent ?? CLASS_ACCENT[classId] ?? '#78d2ff';
      card.style.setProperty('--class-accent', accent);
      const nameEl = card.querySelector('.class-card-name');
      const jobEl = card.querySelector('.class-card-job');
      const name = hero?.name ?? classId;
      const job = hero?.presentation?.jobLabel ?? hero?.title ?? classId;
      if (nameEl) nameEl.textContent = name;
      if (jobEl) jobEl.textContent = job;
      card.setAttribute('aria-label', `${name}, ${job}`);
    }
  }

export function refreshContinueButton(ui) {
    const btn = ui.elements['continue-btn'];
    const meta = ui.elements['continue-meta'];
    if (!btn || !meta) return;
    const summary = ui.game.save.getSummary?.() ?? null;
    const save = summary ? true : ui.game.save.hasSave();
    btn.disabled = !save;
    if (!summary) {
      meta.textContent = 'No save data';
      return;
    }
    const hero = summary.classId ? getHeroClass(summary.classId) : null;
    const label = hero?.title || hero?.name || summary.name || 'Hunter';
    const age = formatSaveAge(summary.savedAt);
    const prefix = summary.variant === 'max' ? 'MAX · ' : 'Legacy Hunt · ';
    meta.textContent = age
      ? `${prefix}${label} Lv.${summary.level} · ${summary.kills} kills · ${age}`
      : `${prefix}${label} Lv.${summary.level} · ${formatTime(summary.playTime)} · ${summary.kills} kills`;
  }

export function showTitle(ui) {
    document.body.dataset.mode = 'title';
    ui.elements['loading-screen'].classList.remove('active');
    ui.elements['title-screen'].classList.add('active');
    ui.elements.hud.classList.add('hidden');
    ui.elements['panel-layer'].classList.add('hidden');
    ui.elements['death-screen'].classList.add('hidden');
    fillClassCards(ui);
    refreshContinueButton(ui);
}
