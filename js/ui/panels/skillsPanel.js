/**
 * Skills panel helpers (N1 UI extract).
 */
import {
  HERO_CLASSES,
  getClassActiveSkills,
  getClassPassiveSkills,
  getHeroClass,
} from '../../data/content.js';
import { resolveSkillForm, skillMutationOptions } from '../../data/skillCombat.js';
import {
  escapeHtml,
  formatCombatDeltas,
  formatCombatSnapshot,
  mutationAccessibleText,
  mutationIconView,
  titleCaseId,
} from '../uiShared.js';

export function debugSkillControls(ui) {
    const player = ui.game.player;
    const classButtons = Object.entries(HERO_CLASSES).map(([id, hero]) => (
      `<button type="button" data-action="debug-skill-state" data-debug-class="${id}" class="${id === player.classId ? 'active' : ''}">${escapeHtml(hero.name)}</button>`
    )).join('');
    const levelButtons = [20, 40, 60, 80, 100].map(level => (
      `<button type="button" data-action="debug-skill-state" data-debug-level="${level}" class="${player.level === level ? 'active' : ''}">Lv.${level}</button>`
    )).join('');
    const rankButtons = [1, 5, 10].map(rank => (
      `<button type="button" data-action="debug-skill-state" data-debug-rank="${rank}">Rank ${rank}</button>`
    )).join('');
    return `<aside class="skill-debug"><strong>DEBUG · Skill Evolution</strong><span>Class</span><div>${classButtons}</div><span>Level</span><div>${levelButtons}</div><span>All active ranks</span><div>${rankButtons}</div></aside>`;
  }

export function skillEvolution(ui, skill, rank, bundle) {
    const player = ui.game.player;
    const choices = player.skillEvolution?.[skill.id] ?? {};
    const formLevel = bundle.activeForms.at(-1) ?? 0;
    const formOverlay = skill.evolution?.forms?.[formLevel];
    const currentForm = formOverlay?.label ?? (formLevel >= 100 ? 'Apex Form' : formLevel >= 60 ? 'Form II' : formLevel >= 20 ? 'Form I' : 'Base Form');
    const gates = [
      ...Object.keys(skill.evolution?.forms ?? {}),
      ...Object.keys(skill.evolution?.mutations ?? {}),
    ].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const nextGate = gates.find(gate => gate > player.level);
    const nextBundle = nextGate ? resolveSkillForm(skill, rank, nextGate, choices) : null;
    const nextFormLevel = nextBundle?.activeForms?.at(-1) ?? 0;
    const nextMutationId = nextBundle?.mutations?.[`tier${nextGate}`];
    const nextOverlay = nextMutationId
      ? skill.evolution?.mutations?.[nextGate]?.[nextMutationId]
      : skill.evolution?.forms?.[nextFormLevel];
    const nextLabel = nextOverlay?.label ?? (nextMutationId ? titleCaseId(nextMutationId) : nextGate ? `Lv.${nextGate} Form` : '');
    const nextText = nextGate ? `Next · Lv.${nextGate} ${nextLabel}` : gates.length ? 'All configured milestones unlocked' : 'No evolution milestones configured';
    const selectedOverlays = [40, 80].map(gate => {
      const id = bundle.mutations[`tier${gate}`];
      return id ? skill.evolution?.mutations?.[gate]?.[id] : null;
    }).filter(Boolean);
    const currentSummary = [formOverlay?.summary, ...selectedOverlays.map(option => option.summary)].filter(Boolean).join(' ');
    const nextSummary = nextOverlay?.summary ?? '';
    const nextDeltas = nextBundle ? formatCombatDeltas(bundle.combat, nextBundle.combat).join(' · ') : '';
    const mutationRows = [40, 80].map(gate => {
      const options = skillMutationOptions(skill, gate);
      if (!options.length) return '';
      const key = `tier${gate}`;
      const selected = bundle.mutations[key] ?? null;
      const selectedOption = selected ? skill.evolution.mutations[gate][selected] : null;
      const unlocked = player.level >= gate;
      const buttons = options.map(optionId => {
        const option = skill.evolution.mutations[gate][optionId];
        const label = option.label ?? titleCaseId(optionId);
        const summary = option.summary ?? '';
        const icon = mutationIconView(option.icon);
        const accessible = mutationAccessibleText(label, summary);
        return `<button type="button" data-action="select-mutation" data-skill="${escapeHtml(skill.id)}" data-milestone="${gate}" data-choice="${escapeHtml(optionId)}" data-icon="${icon.token}" class="${selected === optionId ? 'selected' : ''}" aria-label="${escapeHtml(accessible)}" title="${escapeHtml(accessible)}" aria-pressed="${selected === optionId ? 'true' : 'false'}" ${unlocked ? '' : 'disabled'}><span class="mutation-icon" aria-hidden="true"><i>${icon.glyph}</i><em>${icon.marker}</em></span><span class="mutation-copy"><b>${escapeHtml(label)}</b><small>${escapeHtml(summary)}</small></span></button>`;
      }).join('');
      return `<div class="mutation-row"><span>Lv.${gate} ${unlocked ? (selectedOption ? `· ${escapeHtml(selectedOption.label)}` : '· Choose one') : '· Locked'}</span><div class="mutation-options">${buttons}</div></div>`;
    }).join('');
    return `<div class="skill-evolution"><div class="form-status"><b>${escapeHtml(currentForm)}</b><span>${escapeHtml(nextText)}</span></div>${currentSummary ? `<p class="current-summary">${escapeHtml(currentSummary)}</p>` : ''}${nextSummary || nextDeltas ? `<p class="next-summary">${escapeHtml([nextSummary, nextDeltas].filter(Boolean).join(' · '))}</p>` : ''}${mutationRows}${mutationRows ? '<small>Select another option to respec this tier.</small>' : ''}</div>`;
  }

export function skillCard(ui, skill) {
    const player = ui.game.player;
    const unlocked = player.level >= skill.unlockLevel;
    const rank = player.skillRank(skill.id);
    const displayRank = skill.passive ? rank : unlocked ? Math.max(1, rank) : 0;
    const canUpgrade = unlocked && player.skillPoints > 0 && displayRank < skill.maxRank;
    const bundle = skill.passive ? null : resolveSkillForm(
      skill, displayRank, player.level, player.skillEvolution?.[skill.id] ?? {},
    );
    const currentValues = bundle ? formatCombatSnapshot(bundle.combat).join(' · ') : '';
    const evolution = skill.passive ? '' : skillEvolution(ui, skill, displayRank, bundle);
    return `<article class="skill-card ${unlocked ? '' : 'locked'}">
      <span class="skill-key">${skill.key ?? '◆'}</span>
      <h4>${escapeHtml(skill.name)} <small>Lv.${displayRank}/${skill.maxRank}</small></h4>
      <p>${escapeHtml(skill.description)} ${skill.passive ? '' : `MP ${bundle.mp} · CD ${bundle.cooldown}s`}</p>
      <div class="rank-line"><span>${unlocked ? escapeHtml(skill.passive ? skill.rankText(Math.max(1, displayRank)) : currentValues) : `Unlocks at Lv.${skill.unlockLevel}`}</span><div class="rank-pips">${Array.from({ length: skill.maxRank }, (_, i) => `<i class="${i < displayRank ? 'active' : ''}"></i>`).join('')}</div></div>
      ${evolution}
      <button data-action="upgrade-skill" data-skill="${skill.id}" ${canUpgrade ? '' : 'disabled'}>${displayRank >= skill.maxRank ? 'Max Rank' : 'Spend 1 SP'}</button>
    </article>`;
  }

export function renderSkills(ui) {
    const player = ui.game.player;
    const hero = getHeroClass(player.classId);
    ui.elements['panel-title'].textContent = hero.skillPanelTitle ?? 'Skills';
    const active = getClassActiveSkills(player.classId).map(skill => skillCard(ui, skill)).join('');
    const passive = getClassPassiveSkills(player.classId).map(skill => skillCard(ui, skill)).join('');
    const debugControls = ui.game.debugEnabled ? debugSkillControls(ui) : '';
    ui.elements['panel-content'].innerHTML = `
      <div class="skills-layout">
        ${debugControls}
        <div class="skill-points-banner"><div><span>AVAILABLE POINTS</span><strong>Earned from level-ups and hunt milestones.</strong></div><b>${player.skillPoints} SP</b></div>
        <section class="skill-group"><h3>Active Arts</h3>${active}</section>
        <section class="skill-group"><h3>Passives</h3>${passive}</section>
      </div>`;
  }
