/** Shared UI constants/helpers extracted from UI.js (W1). */
import * as THREE from 'three';
import {
  GEAR_ENHANCE, PLAYER_CONFIG, WEAPON_ENHANCE, WEAPON_OPTION_ENHANCE,
} from '../config.js';
import {
  gearEnhanceCost, gearEnhanceSuccessChance, gearSellValue, weaponEnhanceCost, weaponEnhanceSuccessChance, weaponOptionEnhanceCost,
} from '../systems/LootSystem.js';
import {
  DEFAULT_HERO_CLASS_ID, HERO_CLASSES, RARITIES, SKILLS, ZONES,
  WEAPON_EVOLUTIONS, getClassActiveSkills, getClassPassiveSkills, getHeroClass, resolveHeroClassId,
} from '../data/content.js';
import { resolveSkillForm, skillMutationOptions } from '../data/skillCombat.js';
import { clamp, formatTime } from '../core/Utils.js';

export const STAT_LABELS = Object.freeze({
  power: 'Attack', defense: 'Defense', hp: 'Health', crit: 'Crit', haste: 'Haste', leech: 'Lifesteal',
  xpBonus: 'XP', goldBonus: 'Gold', skillPower: 'Skill', moveSpeed: 'Move', luck: 'Luck',
});
export const STAT_KEYS = Object.freeze([
  'power', 'defense', 'hp', 'crit', 'haste', 'leech', 'skillPower', 'xpBonus', 'goldBonus', 'moveSpeed', 'luck',
]);
export const PERCENT_STATS = new Set(['crit', 'haste', 'leech', 'xpBonus', 'goldBonus', 'skillPower', 'luck']);
export const RARITY_RANK = Object.freeze({ common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 });
export const ATTACK_STYLE_LABEL = Object.freeze({ melee: 'Melee', magic: 'Magic', ranged: 'Ranged' });
export const CLASS_ACCENT = Object.freeze({
  aerin: '#d4b86a',
  wizard: '#b06dff',
  rogue: '#35e0b8',
  ranger: '#e8b040',
});
export const HUD_FORM_TIERS = Object.freeze({
  20: Object.freeze({ text: 'I', className: 'evolution-tier-i' }),
  60: Object.freeze({ text: 'II', className: 'evolution-tier-ii' }),
  100: Object.freeze({ text: 'APEX', className: 'evolution-tier-apex' }),
});
export const MUTATION_FAMILY_GLYPHS = Object.freeze({
  vortex: '↻', moon: '◒', hammer: '◆', arsenal: '✦',
  flame: '▲', crystal: '◇', rift: '⌁', meteor: '●',
  fang: '⋀', knives: '✣', shadow: '◩', lotus: '✤',
  arrow: '➤', thorn: '⌗', vault: '⌃', mark: '◎',
});
export const MUTATION_ROLE_MARKERS = Object.freeze({
  breadth: '•••', focus: '•', flow: '↝', execution: '▼',
});
export const NEUTRAL_MUTATION_ICON = Object.freeze({ token: 'neutral.unknown', glyph: '·', marker: '?' });
export const COMBAT_VALUE_LABELS = Object.freeze({
  mult: ['Damage', 'percent'], finaleMult: ['Finale', 'percent'], blastMult: ['Blast', 'percent'],
  residualMult: ['Aftershock', 'percent'], detonateMult: ['Detonate', 'percent'],
  radius: ['Radius', 'decimal'], blastRadius: ['Blast Radius', 'decimal'], hitRadius: ['Hit Radius', 'decimal'],
  finaleRadius: ['Finale Radius', 'decimal'], residualRadius: ['Aftershock Radius', 'decimal'],
  range: ['Range', 'decimal'], dash: ['Dash', 'decimal'], leap: ['Leap', 'decimal'], speed: ['Speed', 'decimal'],
  hits: ['Hits', 'integer'], knives: ['Knives', 'integer'], arrows: ['Arrows', 'integer'], ticks: ['Ticks', 'integer'],
  pierce: ['Pierce', 'integer'], markDuration: ['Duration', 'seconds'],
  damageAmp: ['Damage Amp', 'percent'], exposePower: ['Expose', 'percent'], criticalBonus: ['Crit', 'percent'],
  plantMult: ['Plant Damage', 'percent'], pullRadius: ['Pull Radius', 'decimal'],
  pullStrength: ['Pull Strength', 'percent'], apexPullBonus: ['Apex Pull', 'decimal'],
  stunNormal: ['Normal Stun', 'seconds'], stunElite: ['Elite Stun', 'seconds'],
  bossStagger: ['Boss Stagger', 'integer'], armorPierce: ['Armor Pierce', 'percent'],
  frenzyDuration: ['Frenzy', 'seconds'], frenzyAttackHaste: ['Attack Haste', 'percent'],
  frenzyMoveHaste: ['Move Haste', 'percent'], offhandEcho: ['Offhand Echo', 'percent'],
  killExtension: ['Kill Extend', 'seconds'], contactCap: ['Contact Cap', 'integer'],
  exitMult: ['Exit / Contact', 'percent'], chainCap: ['Chain Cap', 'integer'], bossRampCap: ['Boss Ramp', 'integer'],
});

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

export function hexColor(value) {
  return `#${Number(value ?? 0xffffff).toString(16).padStart(6, '0')}`;
}

export function itemIcon(item) {
  const icon = item?.slot === 'weapon' ? (item.model ?? 'sword') : (item?.slot ?? 'charm');
  return `./assets/textures/ui/icon_${icon}.png`;
}

export function titleCaseId(value) {
  return String(value ?? '').split(/[_-]+/).filter(Boolean)
    .map(word => word[0]?.toUpperCase() + word.slice(1)).join(' ');
}

export function mutationIconView(value) {
  const token = String(value ?? '').trim().toLowerCase();
  const match = /^([a-z][a-z0-9_-]*)\.(breadth|focus|flow|execution)$/.exec(token);
  if (!match) return NEUTRAL_MUTATION_ICON;
  const glyph = MUTATION_FAMILY_GLYPHS[match[1]];
  const marker = MUTATION_ROLE_MARKERS[match[2]];
  return glyph && marker ? Object.freeze({ token, glyph, marker }) : NEUTRAL_MUTATION_ICON;
}

export function mutationAccessibleText(label, summary, gate = null) {
  const prefix = gate ? `Level ${gate} mutation: ` : '';
  return `${prefix}${label}${summary ? `. ${summary}` : ''}`;
}

export function formatCombatValue(key, value) {
  if (!Number.isFinite(value) || !COMBAT_VALUE_LABELS[key]) return null;
  const [label, kind] = COMBAT_VALUE_LABELS[key];
  if (kind === 'percent') return `${label} ${Math.round(value * 100)}%`;
  if (kind === 'integer') return `${label} ${Math.round(value)}`;
  if (kind === 'seconds') return `${label} ${value.toFixed(1)}s`;
  return `${label} ${value.toFixed(1)}`;
}

export function formatCombatSnapshot(combat, limit = 12) {
  return Object.keys(COMBAT_VALUE_LABELS)
    .map(key => formatCombatValue(key, combat?.[key]))
    .filter(Boolean).slice(0, limit);
}

export function formatCombatDeltas(current, next, limit = 4) {
  const changed = [];
  for (const key of Object.keys(COMBAT_VALUE_LABELS)) {
    if (!Number.isFinite(current?.[key]) || !Number.isFinite(next?.[key]) || current[key] === next[key]) continue;
    const from = formatCombatValue(key, current[key]);
    const to = formatCombatValue(key, next[key]);
    if (from && to) changed.push(`${from} → ${to.replace(/^[^ ]+(?: [^ ]+)? /, '')}`);
  }
  return changed.slice(0, limit);
}

/** Relative age for Continue meta (localStorage savedAt). */
export function formatSaveAge(savedAt) {
  const ts = Number(savedAt) || 0;
  if (ts <= 0) return '';
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 14) return `${Math.floor(sec / 86400)}d ago`;
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return '';
  }
}

export function statText(key, value) {
  if (!value) return '';
  if (PERCENT_STATS.has(key)) return `${STAT_LABELS[key]} +${(value * 100).toFixed(value < .1 ? 1 : 0)}%`;
  if (key === 'moveSpeed') return `${STAT_LABELS[key]} +${Number(value).toFixed(2)}`;
  return `${STAT_LABELS[key]} +${Math.round(value)}`;
}

/** Format a signed delta for inventory compare (same units as statText). */
export function formatStatDelta(key, delta) {
  if (!delta) return '';
  const sign = delta > 0 ? '+' : '';
  if (PERCENT_STATS.has(key)) {
    const pct = delta * 100;
    return `${sign}${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`;
  }
  if (key === 'moveSpeed') return `${sign}${Number(delta).toFixed(2)}`;
  if (key === 'speed') return `${sign}${Number(delta).toFixed(2)}`;
  return `${sign}${Math.round(delta)}`;
}
