import * as THREE from 'three';
import {
  GAME_CONFIG, GEAR_ENHANCE, PLAYER_CONFIG, WEAPON_ENHANCE, WEAPON_OPTION_ENHANCE,
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

const STAT_LABELS = Object.freeze({
  power: 'Attack', defense: 'Defense', hp: 'Health', crit: 'Crit', haste: 'Haste', leech: 'Lifesteal',
  xpBonus: 'XP', goldBonus: 'Gold', skillPower: 'Skill', moveSpeed: 'Move', luck: 'Luck',
});
const STAT_KEYS = Object.freeze([
  'power', 'defense', 'hp', 'crit', 'haste', 'leech', 'skillPower', 'xpBonus', 'goldBonus', 'moveSpeed', 'luck',
]);
const PERCENT_STATS = new Set(['crit', 'haste', 'leech', 'xpBonus', 'goldBonus', 'skillPower', 'luck']);
const RARITY_RANK = Object.freeze({ common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 });
const ATTACK_STYLE_LABEL = Object.freeze({ melee: 'Melee', magic: 'Magic', ranged: 'Ranged' });
const CLASS_ACCENT = Object.freeze({
  aerin: '#d4b86a',
  wizard: '#b06dff',
  rogue: '#35e0b8',
  ranger: '#e8b040',
});
const HUD_FORM_TIERS = Object.freeze({
  20: Object.freeze({ text: 'I', className: 'evolution-tier-i' }),
  60: Object.freeze({ text: 'II', className: 'evolution-tier-ii' }),
  100: Object.freeze({ text: 'APEX', className: 'evolution-tier-apex' }),
});
const MUTATION_FAMILY_GLYPHS = Object.freeze({
  vortex: '↻', moon: '◒', hammer: '◆', arsenal: '✦',
  flame: '▲', crystal: '◇', rift: '⌁', meteor: '●',
  fang: '⋀', knives: '✣', shadow: '◩', lotus: '✤',
  arrow: '➤', thorn: '⌗', vault: '⌃', mark: '◎',
});
const MUTATION_ROLE_MARKERS = Object.freeze({
  breadth: '•••', focus: '•', flow: '↝', execution: '▼',
});
const NEUTRAL_MUTATION_ICON = Object.freeze({ token: 'neutral.unknown', glyph: '·', marker: '?' });
const COMBAT_VALUE_LABELS = Object.freeze({
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function hexColor(value) {
  return `#${Number(value ?? 0xffffff).toString(16).padStart(6, '0')}`;
}

function itemIcon(item) {
  const icon = item?.slot === 'weapon' ? (item.model ?? 'sword') : (item?.slot ?? 'charm');
  return `./assets/textures/ui/icon_${icon}.png`;
}

function titleCaseId(value) {
  return String(value ?? '').split(/[_-]+/).filter(Boolean)
    .map(word => word[0]?.toUpperCase() + word.slice(1)).join(' ');
}

function mutationIconView(value) {
  const token = String(value ?? '').trim().toLowerCase();
  const match = /^([a-z][a-z0-9_-]*)\.(breadth|focus|flow|execution)$/.exec(token);
  if (!match) return NEUTRAL_MUTATION_ICON;
  const glyph = MUTATION_FAMILY_GLYPHS[match[1]];
  const marker = MUTATION_ROLE_MARKERS[match[2]];
  return glyph && marker ? Object.freeze({ token, glyph, marker }) : NEUTRAL_MUTATION_ICON;
}

function mutationAccessibleText(label, summary, gate = null) {
  const prefix = gate ? `Level ${gate} mutation: ` : '';
  return `${prefix}${label}${summary ? `. ${summary}` : ''}`;
}

function formatCombatValue(key, value) {
  if (!Number.isFinite(value) || !COMBAT_VALUE_LABELS[key]) return null;
  const [label, kind] = COMBAT_VALUE_LABELS[key];
  if (kind === 'percent') return `${label} ${Math.round(value * 100)}%`;
  if (kind === 'integer') return `${label} ${Math.round(value)}`;
  if (kind === 'seconds') return `${label} ${value.toFixed(1)}s`;
  return `${label} ${value.toFixed(1)}`;
}

function formatCombatSnapshot(combat, limit = 12) {
  return Object.keys(COMBAT_VALUE_LABELS)
    .map(key => formatCombatValue(key, combat?.[key]))
    .filter(Boolean).slice(0, limit);
}

function formatCombatDeltas(current, next, limit = 4) {
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
function formatSaveAge(savedAt) {
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

function statText(key, value) {
  if (!value) return '';
  if (PERCENT_STATS.has(key)) return `${STAT_LABELS[key]} +${(value * 100).toFixed(value < .1 ? 1 : 0)}%`;
  if (key === 'moveSpeed') return `${STAT_LABELS[key]} +${Number(value).toFixed(2)}`;
  return `${STAT_LABELS[key]} +${Math.round(value)}`;
}

/** Format a signed delta for inventory compare (same units as statText). */
function formatStatDelta(key, delta) {
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

export class UI {
  constructor(game) {
    this.game = game;
    this.currentPanel = null;
    this.inventoryFilter = 'all';
    this.hudTimer = 0;
    this.minimapTimer = 0;
    this.lastZoneId = null;
    this.selectedClassId = resolveHeroClassId(game.query?.get?.('class') || DEFAULT_HERO_CLASS_ID);
    this.elements = {};
    for (const id of [
      'loading-screen', 'loading-text', 'loading-bar', 'title-screen', 'class-select', 'new-game-btn', 'defense-btn', 'continue-btn', 'continue-meta',
      'hud', 'player-name', 'portrait-level', 'player-level-text', 'hunter-title', 'hp-fill', 'hp-text', 'mp-fill', 'mp-text', 'xp-fill', 'xp-text',
      'energy-bar', 'energy-fill', 'energy-text',
      'class-state-row', 'frenzy-chip', 'overflow-chip',
      'ranger-state-row', 'thorns-chip', 'verdict-chip',
      'world-tier', 'zone-name', 'zone-subtitle', 'defense-wave-panel', 'defense-wave-label', 'defense-wave-remaining',
      'kill-count', 'streak-count', 'elite-count', 'boss-count',
      'boss-charge-text', 'boss-charge-fill', 'contract-title', 'contract-fill', 'contract-progress', 'contract-hint',
      'boss-hud', 'boss-name', 'boss-level', 'boss-health-fill', 'gold-count', 'weapon-level', 'potion-count',
      'minimap', 'minimap-zone', 'notifications', 'float-layer', 'aim-reticle', 'zone-toast',
      'panel-layer', 'panel-title', 'panel-content', 'panel-close', 'death-screen', 'death-timer-fill',
      'damage-flash', 'fatal-error', 'debug-hud',
    ]) this.elements[id] = document.getElementById(id);
    this.minimapContext = this.elements.minimap.getContext('2d');
    this.abilitySlots = Object.fromEntries([...document.querySelectorAll('.ability-slot')].map(slot => [slot.dataset.slot, slot]));
    this.skillKeySlots = Object.fromEntries(
      [...document.querySelectorAll('.ability-slot[data-key]')].map(slot => [slot.dataset.key, slot]),
    );
    this.boundSkillSlots = {};
    this.lastAbilityClassId = null;
    this.lastAbilitySignature = null;
    this.panelButtons = [...document.querySelectorAll('[data-panel]')];
    this.classCards = [...document.querySelectorAll('[data-class-id]')];
    this.#bindEvents();
    this.#syncClassSelect();
    this.#fillClassCards();
  }

  #bindEvents() {
    this.elements['new-game-btn'].addEventListener('click', async () => {
      await this.game.audio.unlock();
      this.game.newGame({ classId: this.selectedClassId });
    });
    this.elements['defense-btn']?.addEventListener('click', async () => {
      await this.game.audio.unlock();
      if (typeof this.game.startDefense === 'function') this.game.startDefense({ classId: this.selectedClassId });
    });
    this.elements['continue-btn'].addEventListener('click', async () => {
      if (this.elements['continue-btn'].disabled) return;
      await this.game.audio.unlock();
      const ok = this.game.continueGame();
      if (!ok) this.#refreshContinueButton();
    });
    this.classCards.forEach(card => {
      let suppressClickUntil = 0;
      const selectClass = () => {
        this.selectedClassId = resolveHeroClassId(card.dataset.classId);
        this.#syncClassSelect();
        this.game.previewHeroClass?.(this.selectedClassId);
      };
      // iOS reliably reports pointer events even when the browser does not synthesize a click.
      card.addEventListener('pointerup', event => {
        if (event.pointerType !== 'touch') return;
        event.preventDefault();
        suppressClickUntil = performance.now() + 500;
        selectClass();
      }, { passive: false });
      card.addEventListener('click', event => {
        if (performance.now() < suppressClickUntil) {
          event.preventDefault();
          return;
        }
        selectClass();
      });
    });
    this.elements['panel-close'].addEventListener('click', () => this.closePanel());
    this.panelButtons.forEach(button => button.addEventListener('click', () => this.openPanel(button.dataset.panel)));
    this.elements['panel-layer'].addEventListener('pointerdown', event => {
      if (event.target === this.elements['panel-layer']) this.closePanel();
    });
    this.elements['panel-content'].addEventListener('click', event => this.#handlePanelAction(event));
    window.addEventListener('keydown', event => {
      if (this.elements['title-screen'].classList.contains('active') && event.code === 'Enter') {
        event.preventDefault();
        (this.game.save.hasSave() ? this.elements['continue-btn'] : this.elements['new-game-btn']).click();
      }
    });
  }

  #syncClassSelect() {
    const id = resolveHeroClassId(this.selectedClassId);
    this.selectedClassId = id;
    for (const card of this.classCards) {
      const selected = card.dataset.classId === id;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
  }

  /** Densify title class cards: energy name, attack style, Q/E/R/C skill names. */
  #fillClassCards() {
    for (const card of this.classCards) {
      const classId = resolveHeroClassId(card.dataset.classId);
      const hero = getHeroClass(classId);
      const accent = CLASS_ACCENT[classId] ?? '#78d2ff';
      card.style.setProperty('--class-accent', accent);

      const tags = card.querySelector('[data-class-tags]');
      if (tags) {
        const styleLabel = ATTACK_STYLE_LABEL[hero.attackStyle] ?? 'Melee';
        const energyLabel = hero.energy?.label ? escapeHtml(hero.energy.label) : '—';
        tags.innerHTML = `
          <span class="class-tag style">${escapeHtml(styleLabel)}</span>
          <span class="class-tag energy">${energyLabel === '—' ? 'No energy' : energyLabel}</span>`;
      }

      const skillsEl = card.querySelector('[data-class-skills]');
      if (skillsEl) {
        const skills = getClassActiveSkills(classId);
        skillsEl.innerHTML = skills.map(skill => {
          const key = escapeHtml(skill.key ?? '?');
          const name = escapeHtml(skill.name ?? skill.id);
          return `<span class="class-skill"><kbd>${key}</kbd> ${name}</span>`;
        }).join('');
      }
    }
  }

  setLoading(progress, text) {
    this.elements['loading-bar'].style.width = `${clamp(progress, 0, 1) * 100}%`;
    if (text) this.elements['loading-text'].textContent = text;
  }

  showTitle() {
    document.body.dataset.mode = 'title';
    this.elements['loading-screen'].classList.remove('active');
    this.elements['title-screen'].classList.add('active');
    this.elements.hud.classList.add('hidden');
    this.elements['panel-layer'].classList.add('hidden');
    this.elements['death-screen'].classList.add('hidden');
    this.elements['defense-wave-panel']?.classList.add('hidden');
    this.#fillClassCards();
    this.#refreshContinueButton();
  }

  #refreshContinueButton() {
    const btn = this.elements['continue-btn'];
    const meta = this.elements['continue-meta'];
    if (!btn || !meta) return;
    const summary = this.game.save.getSummary?.() ?? null;
    const save = summary ? true : this.game.save.hasSave();
    btn.disabled = !save;
    if (!summary) {
      meta.textContent = 'No save data';
      return;
    }
    const hero = summary.classId ? getHeroClass(summary.classId) : null;
    const label = hero?.title || hero?.name || summary.name || 'Hunter';
    const age = formatSaveAge(summary.savedAt);
    meta.textContent = age
      ? `${label} Lv.${summary.level} · ${summary.kills} kills · ${age}`
      : `${label} Lv.${summary.level} · ${formatTime(summary.playTime)} · ${summary.kills} kills`;
  }

  showHUD() {
    const mode = this.game.mode === 'defense' ? 'defense' : 'hunt';
    document.body.dataset.mode = mode;
    this.elements['title-screen'].classList.remove('active');
    this.elements.hud.classList.remove('hidden');
    this.elements['death-screen'].classList.add('hidden');
    this.elements['defense-wave-panel']?.classList.toggle('hidden', mode !== 'defense');
    this.lastZoneId = null;
    this.lastAbilityClassId = null;
    this.lastAbilitySignature = null;
    this.update(1);
  }

  hideHUD() {
    this.elements.hud.classList.add('hidden');
  }

  update(delta) {
    if (this.elements.hud.classList.contains('hidden')) return;
    this.hudTimer -= delta;
    this.minimapTimer -= delta;
    this.#updateReticle();
    if (this.hudTimer <= 0) {
      this.hudTimer = .055;
      this.#updateHUD();
    }
    if (this.minimapTimer <= 0) {
      this.minimapTimer = .11;
      this.#drawMinimap();
    }
  }

  #updateHUD() {
    const player = this.game.player;
    const hunt = this.game.hunt;
    const zone = this.game.world.currentZone;
    const isDefense = this.game.mode === 'defense';
    const defenseHud = this.game.defense?.hud;
    this.elements.hud.classList.toggle('defense-active', isDefense);
    this.elements['player-name'].textContent = player.name;
    const levelLabel = `LV.${player.level}`;
    if (this.elements['portrait-level']) this.elements['portrait-level'].textContent = levelLabel;
    if (this.elements['player-level-text']) this.elements['player-level-text'].textContent = levelLabel;
    this.elements['hunter-title'].textContent = isDefense ? 'Wave Survival' : hunt.hunterTitle;
    this.elements['hp-fill'].style.width = `${player.healthRatio * 100}%`;
    this.elements['hp-text'].textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    this.elements['mp-fill'].style.width = `${player.manaRatio * 100}%`;
    this.elements['mp-text'].textContent = `${Math.floor(player.mp)} / ${player.maxMp}`;
    const xpRatio = clamp(player.xp / Math.max(1, player.xpNeeded), 0, 1);
    if (this.elements['xp-fill']) this.elements['xp-fill'].style.width = `${xpRatio * 100}%`;
    if (this.elements['xp-text']) {
      this.elements['xp-text'].textContent = `${Math.floor(player.xp)} / ${player.xpNeeded}`;
    }
    // Class energy gauge (Focus/Rage) — only classes with an energy resource show it.
    if (this.elements['energy-bar']) {
      const energyDef = player.energyDef;
      this.elements['energy-bar'].classList.toggle('hidden', !energyDef);
      if (energyDef) {
        const label = energyDef.label ?? 'Energy';
        this.elements['energy-fill'].style.width = `${player.energyRatio * 100}%`;
        this.elements['energy-bar'].classList.toggle('is-ready', player.energyComboReady);
        this.elements['energy-bar'].classList.toggle('is-rage', label === 'Rage');
        this.elements['energy-text'].textContent = player.energyComboReady
          ? (player.energyComboHits > 0 ? `COMBO READY ×${player.energyComboHits}` : `${label.toUpperCase()} READY`)
          : `${label} ${Math.floor(player.energy)} / ${player.maxEnergy}`;
      }
    }
    if (this.elements['class-state-row']) {
      const frenzyVisible = Boolean(player.frenzyActive);
      const overflowVisible = player.classId === 'wizard';
      const thornsVisible = player.classId === 'ranger' && Boolean(player.thornField);
      const verdictVisible = player.classId === 'ranger' && Boolean(player.predatorVerdict);
      const rangerVisible = thornsVisible || verdictVisible;
      const stateCount = Number(frenzyVisible) + Number(overflowVisible)
        + Number(thornsVisible) + Number(verdictVisible);
      this.elements.hud.classList.toggle('class-state-active', stateCount > 0);
      this.elements.hud.dataset.classStateCount = String(stateCount);
      const frenzy = this.elements['frenzy-chip'];
      const overflow = this.elements['overflow-chip'];
      const ranger = this.elements['ranger-state-row'];
      frenzy.classList.toggle('hidden', !frenzyVisible);
      overflow.classList.toggle('hidden', !overflowVisible);
      ranger.classList.toggle('hidden', !rangerVisible);
      this.elements['thorns-chip'].classList.toggle('hidden', !thornsVisible);
      this.elements['verdict-chip'].classList.toggle('hidden', !verdictVisible);
      if (frenzyVisible) {
        frenzy.querySelector('span').textContent = `${player.shadowFrenzy.remaining.toFixed(1)}s`;
        frenzy.style.setProperty('--frenzy-ratio', player.frenzyRatio);
        frenzy.setAttribute('aria-label', `Shadow Frenzy: ${player.shadowFrenzy.remaining.toFixed(1)} seconds remaining`);
      }
      if (overflowVisible) {
        const value = clamp(Number(player.arcaneOverflow) || 0, 0, 100);
        const ready = value >= 100;
        overflow.classList.toggle('is-ready', ready);
        overflow.querySelector('span').textContent = ready ? 'READY' : `${Math.floor(value)}/100`;
        overflow.style.setProperty('--overflow-ratio', value / 100);
        overflow.setAttribute('aria-label', ready ? 'Arcane Overflow ready' : `Arcane Overflow: ${Math.floor(value)} of 100`);
      }
      if (thornsVisible) {
        this.elements['thorns-chip'].querySelector('span').textContent = `${player.thornField.planted ?? 0}/4`;
      }
      if (verdictVisible) {
        this.elements['verdict-chip'].querySelector('span').textContent = `${Math.round(100 * player.predatorVerdict.stored / Math.max(1, player.predatorVerdict.cap))}%`;
      }
      this.elements['class-state-row'].classList.toggle('hidden', !(frenzyVisible || overflowVisible || rangerVisible));
    }
    if (isDefense) {
      const wave = defenseHud?.wave ?? 1;
      const maxWave = defenseHud?.maxWave ?? 200;
      const remaining = defenseHud?.remaining ?? 0;
      this.elements['world-tier'].textContent = `WAVE ${wave}/${maxWave}`;
      if (this.elements['defense-wave-label']) {
        this.elements['defense-wave-label'].textContent = `WAVE ${wave} / ${maxWave}`;
      }
      if (this.elements['defense-wave-remaining']) {
        this.elements['defense-wave-remaining'].textContent = `${remaining} left`;
      }
      const mutLabel = this.game.defense?.hud?.mutator;
      this.elements['contract-title'].textContent = mutLabel ? `Wave Survival · ${mutLabel}` : 'Wave Survival';
      this.elements['contract-progress'].textContent = `${remaining} remaining · ${wave}/${maxWave}`;
      const clearRatio = clamp(wave / Math.max(1, maxWave), 0, 1);
      this.elements['contract-fill'].style.width = `${clearRatio * 100}%`;
      if (this.elements['contract-hint']) {
        this.elements['contract-hint'].textContent = 'Clear waves · gold & power shards scale up';
      }
      const defenseKills = defenseHud?.kills ?? defenseHud?.totalKills;
      this.elements['kill-count'].textContent = (defenseKills ?? hunt.totalKills ?? 0).toLocaleString('en-US');
      this.elements['streak-count'].textContent = this.game.killChain ?? defenseHud?.streak ?? 0;
      this.elements['elite-count'].textContent = defenseHud?.elitesKilled ?? 0;
      this.elements['boss-count'].textContent = defenseHud?.bossesKilled ?? 0;
    } else {
      this.elements['world-tier'].textContent = `WORLD TIER ${hunt.worldTier}`;
      this.elements['kill-count'].textContent = hunt.totalKills.toLocaleString('en-US');
      this.elements['streak-count'].textContent = this.game.killChain ?? hunt.streak;
      this.elements['elite-count'].textContent = hunt.elitesKilled;
      this.elements['boss-count'].textContent = hunt.bossesKilled;
      const contract = hunt.contract;
      if (contract) {
        this.elements['contract-title'].textContent = contract.label;
        this.elements['contract-progress'].textContent = `${Math.floor(contract.progress)} / ${contract.target}`;
        this.elements['contract-fill'].style.width = `${clamp(contract.progress / contract.target, 0, 1) * 100}%`;
        if (this.elements['contract-hint']) {
          this.elements['contract-hint'].textContent = contract.rewardHint
            || `Reward tier ${contract.rewardTier ?? 1}`;
        }
      } else if (this.elements['contract-hint']) {
        this.elements['contract-hint'].textContent = '';
      }
    }
    this.elements['zone-name'].textContent = zone.name;
    this.elements['zone-subtitle'].textContent = isDefense ? 'Defense Arena' : zone.subtitle;
    this.elements['minimap-zone'].textContent = zone.name;
    this.elements['boss-charge-text'].textContent = `${Math.floor(hunt.bossCharge)}%`;
    this.elements['boss-charge-fill'].style.width = `${hunt.bossCharge}%`;
    this.elements['gold-count'].textContent = player.gold.toLocaleString('en-US');
    if (this.elements['weapon-level']) {
      this.elements['weapon-level'].textContent = `WPN +${Number(player.weapon?.weaponEnhanceLevel ?? player.weapon?.enhanceLevel) || 0}`;
    }
    this.elements['potion-count'].textContent = player.potions;

    this.#updateAbility('dash', player.cooldownRatio('dash'), player.dashCooldown);
    this.#updateAbility('potion', player.cooldownRatio('potion'), player.potionCooldown);
    this.#syncAbilityBar(player);
    for (const skill of getClassActiveSkills(player.classId)) {
      const unlocked = player.skillRank(skill.id) > 0;
      const slot = this.boundSkillSlots[skill.id] ?? this.skillKeySlots[skill.key];
      if (!slot) continue;
      slot.classList.toggle('locked', !unlocked);
      this.#updateAbilitySlot(slot, player.cooldownRatio(skill.id), player.skillCooldowns[skill.id]);
      slot.classList.toggle('insufficient', unlocked && player.mp < skill.mp);
    }
    this.#updateBossHUD();
    // Smooth damage flash — hard class toggle at a threshold looked like random screen flicker.
    const flash = this.elements['damage-flash'];
    if (flash) {
      const pulse = player.hitTimer > 0 ? Math.min(1, player.hitTimer / .19) : 0;
      flash.style.opacity = String(pulse * .55);
      flash.classList.toggle('active', pulse > .02);
    }

    if (zone.id !== this.lastZoneId) {
      if (this.lastZoneId !== null) this.zoneEntered(zone);
      this.lastZoneId = zone.id;
    }
  }

  #abilityBarSignature(player) {
    const skills = getClassActiveSkills(player.classId).map(skill => {
      const choices = player.skillEvolution?.[skill.id] ?? {};
      return `${skill.id}:${player.skillRank(skill.id)}:${choices.tier40 ?? ''}:${choices.tier80 ?? ''}`;
    });
    return `${player.classId}|${player.level}|${skills.join('|')}`;
  }

  #syncAbilityBar(player) {
    const classId = player.classId;
    const signature = this.#abilityBarSignature(player);
    if (this.lastAbilitySignature === signature) return;
    this.lastAbilitySignature = signature;
    const classChanged = this.lastAbilityClassId !== classId;
    this.lastAbilityClassId = classId;
    const hero = getHeroClass(classId);
    if (classChanged) {
      const attackLabel = document.getElementById('attack-slot-label');
      if (attackLabel) attackLabel.textContent = hero.attackLabel ?? 'Attack';
      const attackSlot = this.abilitySlots.attack;
      if (attackSlot) {
        const icon = attackSlot.querySelector('.ability-icon');
        if (icon) {
          icon.classList.toggle('sword-icon', hero.attackStyle !== 'magic');
          icon.classList.toggle('starburst-icon', hero.attackStyle === 'magic');
        }
      }
      for (const skillId of Object.keys(this.boundSkillSlots)) delete this.abilitySlots[skillId];
      this.boundSkillSlots = {};
    }
    for (const skill of getClassActiveSkills(classId)) {
      const slot = this.skillKeySlots[skill.key];
      if (!slot) continue;
      // data-slot is the stable touch binding/CSS position. The class skill id is metadata only.
      slot.dataset.slot = `skill-${skill.key.toLowerCase()}`;
      slot.dataset.skillId = skill.id;
      this.boundSkillSlots[skill.id] = slot;
      this.abilitySlots[skill.id] = slot;
      const nameEl = slot.querySelector('b');
      if (nameEl) nameEl.textContent = skill.name;
      const lock = slot.querySelector('.lock-level');
      if (lock) lock.textContent = `LV.${skill.unlockLevel}`;
      const kbd = slot.querySelector('kbd');
      if (kbd) kbd.textContent = skill.key;

      const rank = player.skillRank(skill.id);
      const unlocked = rank > 0;
      const bundle = resolveSkillForm(
        skill, Math.max(1, rank), player.level, player.skillEvolution?.[skill.id] ?? {},
      );
      const highestForm = unlocked ? (bundle.activeForms.at(-1) ?? 0) : 0;
      const tier = HUD_FORM_TIERS[highestForm] ?? null;
      slot.classList.remove('evolution-tier-i', 'evolution-tier-ii', 'evolution-tier-apex');
      if (tier) slot.classList.add(tier.className);
      slot.dataset.formTier = tier?.text ?? '';
      slot.dataset.skillRank = String(rank);

      const tierBadge = slot.querySelector('.skill-tier-badge');
      const form = tier ? skill.evolution?.forms?.[highestForm] : null;
      if (tierBadge) {
        tierBadge.textContent = tier?.text ?? '';
        tierBadge.classList.toggle('hidden', !tier);
        tierBadge.title = tier ? `Level ${highestForm} form: ${form?.label ?? tier.text}` : '';
      }

      const mutationLabels = [];
      const mutationContainer = slot.querySelector('.skill-mutation-badges');
      for (const gate of [40, 80]) {
        const badge = mutationContainer?.querySelector(`[data-mutation-tier="${gate}"]`);
        if (!badge) continue;
        const mutationId = unlocked ? bundle.mutations?.[`tier${gate}`] : null;
        const mutation = mutationId ? skill.evolution?.mutations?.[gate]?.[mutationId] : null;
        const fullLabel = mutation?.label ?? '';
        const summary = mutation?.summary ?? '';
        const icon = mutationIconView(mutation?.icon);
        badge.textContent = fullLabel ? `${icon.glyph}${icon.marker}` : '';
        badge.dataset.icon = fullLabel ? icon.token : '';
        badge.classList.toggle('hidden', !fullLabel);
        badge.title = fullLabel ? mutationAccessibleText(fullLabel, summary, gate) : '';
        if (fullLabel) {
          badge.setAttribute('aria-label', mutationAccessibleText(fullLabel, summary, gate));
          mutationLabels.push(`Level ${gate} mutation ${fullLabel}`);
        } else {
          badge.removeAttribute('aria-label');
        }
      }
      mutationContainer?.classList.toggle('hidden', mutationLabels.length === 0);

      const formLabel = form?.label ? `, ${form.label} ${tier.text}` : '';
      const mutationDescription = mutationLabels.length ? `, ${mutationLabels.join(', ')}` : '';
      slot.setAttribute('aria-label', `${skill.key}: ${skill.name}, rank ${rank}${formLabel}${mutationDescription}`);
      slot.title = `${skill.name}${form?.label ? ` · ${form.label}` : ''}${mutationLabels.length ? ` · ${mutationLabels.join(' · ')}` : ''}`;
    }
  }

  #updateAbility(id, ratio, seconds) {
    const slot = this.abilitySlots[id];
    if (!slot) return;
    this.#updateAbilitySlot(slot, ratio, seconds);
  }

  #updateAbilitySlot(slot, ratio, seconds) {
    if (!slot) return;
    const value = clamp(ratio || 0, 0, 1);
    slot.style.setProperty('--cooldown', value);
    slot.classList.toggle('cooling', seconds > .05);
    slot.dataset.cd = seconds > .05 ? seconds.toFixed(seconds >= 10 ? 0 : 1) : '';
  }

  #updateBossHUD() {
    const boss = this.game.enemies.activeBoss;
    this.elements.hud.classList.toggle('boss-active', Boolean(boss));
    if (!boss) {
      this.elements['boss-hud'].classList.add('hidden');
      return;
    }
    this.elements['boss-hud'].classList.remove('hidden');
    this.elements['boss-name'].textContent = boss.data.name;
    this.elements['boss-level'].textContent = `LV.${boss.level}`;
    this.elements['boss-health-fill'].style.width = `${boss.healthRatio * 100}%`;
  }

  #updateReticle() {
    const reticle = this.elements['aim-reticle'];
    const pointer = this.game.input.pointerPixels;
    if (pointer.x > 0 && pointer.y > 0) {
      reticle.style.left = `${pointer.x}px`;
      reticle.style.top = `${pointer.y}px`;
    }
  }

  #drawMinimap() {
    const context = this.minimapContext;
    const canvas = this.elements.minimap;
    const width = canvas.width;
    const center = width / 2;
    const range = 62;
    const scale = (center - 7) / range;
    const player = this.game.player;
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
      context.globalAlpha = zone.id === this.game.world.currentZone.id ? .24 : .11;
      context.fillStyle = hexColor(zone.ground);
      context.beginPath();
      context.arc(x, y, zone.radius * scale, 0, Math.PI * 2);
      context.fill();
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

    context.globalAlpha = 1;
    for (const enemy of this.game.enemies.enemies) {
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
    const yaw = this.game.player.mesh.rotation.y;
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

  notify(message, type = 'normal', duration = 3) {
    const touch = document.body.classList.contains('touch-ui');
    // Shorter, fewer toasts on phones so combat stays readable.
    const life = touch ? Math.min(duration, 2.1) : duration;
    const maxStack = touch ? 2 : 6;
    const element = document.createElement('div');
    element.className = `notification ${type}`;
    element.textContent = message;
    element.style.setProperty('--out-delay', `${Math.max(.15, life - .3)}s`);
    this.elements.notifications.prepend(element);
    while (this.elements.notifications.children.length > maxStack) {
      this.elements.notifications.lastElementChild.remove();
    }
    setTimeout(() => element.remove(), life * 1000 + 100);
  }

  floatText(worldPosition, text, type = 'damage') {
    const point = worldPosition.clone().project(this.game.camera);
    if (point.z < -1 || point.z > 1) return;
    const element = document.createElement('span');
    element.className = `float-text ${type}`;
    element.textContent = text;
    // Small random scatter so multi-hits don't stack into one blob.
    const jitterX = (Math.random() - .5) * 36;
    const jitterY = (Math.random() - .5) * 18;
    element.style.left = `${(point.x * .5 + .5) * window.innerWidth + jitterX}px`;
    element.style.top = `${(-point.y * .5 + .5) * window.innerHeight + jitterY}px`;
    this.elements['float-layer'].appendChild(element);
    setTimeout(() => element.remove(), (type === 'critical' || type === 'overkill' || type === 'multikill') ? 920 : 760);
  }

  zoneEntered(zone) {
    const toast = this.elements['zone-toast'];
    toast.querySelector('strong').textContent = zone.name;
    toast.querySelector('span').textContent = `${zone.subtitle} · Recommended Lv.${zone.minLevel}–${zone.maxLevel}`;
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
  }

  openPanel(type = 'inventory') {
    if (this.game.state === 'title' || !this.game.player.alive) return;
    this.currentPanel = type;
    this.elements['panel-layer'].classList.remove('hidden');
    document.body.classList.add('panel-open');
    this.game.setPaused(true);
    this.panelButtons.forEach(button => button.classList.toggle('active', button.dataset.panel === type));
    this.renderPanel();
  }

  closePanel() {
    if (this.elements['panel-layer'].classList.contains('hidden')) return;
    this.elements['panel-layer'].classList.add('hidden');
    document.body.classList.remove('panel-open');
    this.currentPanel = null;
    if (this.game.state !== 'title' && this.game.player.alive) this.game.setPaused(false);
  }

  renderPanel() {
    if (this.currentPanel === 'skills') this.#renderSkills();
    else if (this.currentPanel === 'hunter') this.#renderHunter();
    else if (this.currentPanel === 'pause') this.#renderSystem();
    else this.#renderInventory();
  }

  #renderInventory() {
    this.elements['panel-title'].textContent = 'Weapon Forge';
    const player = this.game.player;
    const weapon = player.weapon;
    const weaponLevel = Number(weapon.weaponEnhanceLevel ?? weapon.enhanceLevel) || 0;
    const optionLevel = Number(weapon.optionEnhanceLevel) || 0;
    const weaponMax = weaponLevel >= WEAPON_ENHANCE.maxLevel;
    const optionMax = optionLevel >= WEAPON_OPTION_ENHANCE.maxLevel;
    const weaponCost = weaponEnhanceCost(weapon);
    const weaponChance = weaponEnhanceSuccessChance(weapon);
    const optionCost = weaponOptionEnhanceCost(weapon);
    const stages = WEAPON_EVOLUTIONS[player.classId] ?? [];
    const stageTrack = stages.map(stage => `<span class="weapon-stage ${weaponLevel >= stage.level ? 'is-complete' : ''}${weaponLevel === stage.level ? ' is-current' : ''}"><i></i><small>+${stage.level}</small><b>${escapeHtml(stage.name)}</b></span>`).join('');
    const options = Object.entries(weapon.optionStats ?? {})
      .filter(([, value]) => Number(value) > 0)
      .map(([key, value]) => `<span>${STAT_LABELS[key] ?? titleCaseId(key)} +${PERCENT_STATS.has(key) ? `${(Number(value) * 100).toFixed(1)}%` : Math.round(value)}</span>`)
      .join('') || '<span>No weapon options yet.</span>';
    this.elements['panel-content'].innerHTML = `
      <div class="weapon-forge-layout">
        <section class="equipment-column weapon-forge-card">
          <p class="section-label"><span>SIGNATURE WEAPON</span><b>Score ${Math.round(weapon.score ?? 0)}</b></p>
          <article class="equipment-slot weapon-slot" style="--rarity:${hexColor(weapon.rarityColor)}">
            <img class="equipment-icon" src="${itemIcon(weapon)}" alt="">
            <small>${escapeHtml(getHeroClass(player.classId).title)} · ${escapeHtml(weapon.model)}</small>
            <strong style="color:${hexColor(weapon.rarityColor)}">${escapeHtml(weapon.name)}</strong>
            <div class="item-stats">${this.#itemStats(weapon, 8)}</div>
          </article>
          <div class="weapon-option-list"><p class="section-label"><span>WEAPON OPTIONS · ${optionLevel}/${WEAPON_OPTION_ENHANCE.maxLevel}</span></p>${options}</div>
          <div class="character-stats">
            <span>Attack <b>${Math.round(player.attackPower)}</b></span><span>Defense <b>${Math.round(player.defense)}</b></span>
            <span>Health <b>${player.maxHp}</b></span><span>Crit <b>${(player.critChance * 100).toFixed(1)}%</b></span>
            <span>Atk Speed <b>${player.attackSpeed.toFixed(2)}</b></span><span>Skill Power <b>${Math.round(player.skillPower * 100)}%</b></span>
            <span>Lifesteal <b>${(player.leech * 100).toFixed(1)}%</b></span><span>Luck <b>${(player.luck * 100).toFixed(1)}%</b></span>
            <span>Gold <b>${player.gold.toLocaleString('en-US')}</b></span><span>Weapon <b>1 / 1</b></span>
          </div>
        </section>
        <section class="enhancement-column">
          <div class="enhancement-banner"><span>GOLD RESOURCES</span><strong>${player.gold.toLocaleString('en-US')}G</strong><small>Hunting rewards are gold only. Your signature weapon never drops.</small></div>
          <article class="enhancement-card weapon-enhancement-card">
            <div><span class="enhancement-kicker">WEAPON ENHANCE</span><h3>Evolution ${weaponLevel} / ${WEAPON_ENHANCE.maxLevel}</h3><p>Raises attack and advances the weapon's name, model, color, and rarity at milestone levels. Failure keeps the current level.</p></div>
            <div class="weapon-stage-track">${stageTrack}</div>
            <button type="button" class="forge-button" data-action="weapon-enhance" ${weaponMax || player.gold < weaponCost ? 'disabled' : ''}>${weaponMax ? 'Evolution Complete' : `Weapon Enhance · ${weaponCost.toLocaleString('en-US')}G · ${Math.round(weaponChance * 100)}%`}</button>
          </article>
          <article class="enhancement-card option-enhancement-card">
            <div><span class="enhancement-kicker">WEAPON OPTION ENHANCE</span><h3>Options ${optionLevel} / ${WEAPON_OPTION_ENHANCE.maxLevel}</h3><p>Unlocks and improves secondary weapon stats. This track does not change the weapon model.</p></div>
            <button type="button" class="forge-button option-button" data-action="weapon-option-enhance" ${optionMax || player.gold < optionCost ? 'disabled' : ''}>${optionMax ? 'Options Complete' : `Option Enhance · ${optionCost.toLocaleString('en-US')}G`}</button>
          </article>
        </section>
      </div>`;
  }

  #equipmentSlot(slot) {
    const labels = { weapon: 'Main Weapon', armor: 'Armor', charm: 'Hunt Charm' };
    const item = this.game.player.getItem(this.game.player.equipped[slot]);
    if (!item) return `<article class="equipment-slot"><small>${labels[slot]}</small><strong>Empty</strong><div class="item-stats"><span>Obtain gear from hunting.</span></div></article>`;
    const plus = Number(item.enhanceLevel) || 0;
    const plusLabel = plus > 0 ? ` · +${plus}` : '';
    return `<article class="equipment-slot" style="--rarity:${hexColor(item.rarityColor)}">
      <img class="equipment-icon" src="${itemIcon(item)}" alt="">
      <small>${labels[slot]} · ${RARITIES[item.rarity].name}${plusLabel}</small><span class="item-score">S ${item.score}</span>
      <strong style="color:${hexColor(item.rarityColor)}">${plus > 0 ? `+${plus} ` : ''}${escapeHtml(item.name)}</strong>
      <div class="item-stats">${this.#itemStats(item, 6)}</div>
    </article>`;
  }

  #itemCard(item) {
    const player = this.game.player;
    const equipped = player.equipped[item.slot] === item.id;
    const canEquip = player.canEquipItem?.(item) ?? true;
    const equipLabel = equipped ? 'Equipped' : canEquip ? 'Equip' : 'Class';
    const plus = Number(item.enhanceLevel) || 0;
    const maxed = plus >= GEAR_ENHANCE.maxLevel;
    const cost = gearEnhanceCost(item);
    const chancePct = Math.round(gearEnhanceSuccessChance(item) * 100);
    const sellVal = (!equipped && !item.locked) ? gearSellValue(item) : 0;
    const canAfford = player.gold >= cost;
    const enhanceDisabled = maxed || !canAfford;
    const plusBadge = plus > 0 ? `<span class="enhance-badge">+${plus}</span>` : '';
    const enhanceMeta = maxed
      ? `<span class="meta-enhance maxed">+${plus} MAX</span>`
      : `<span class="meta-enhance${canAfford ? '' : ' unaffordable'}">+${plus}→+${plus + 1} · ${cost.toLocaleString('en-US')}G · ${chancePct}%</span>`;
    const sellMeta = equipped
      ? '<span class="meta-sell muted">Equipped</span>'
      : item.locked
        ? '<span class="meta-sell muted">Locked</span>'
        : `<span class="meta-sell">Sell ${sellVal.toLocaleString('en-US')}G</span>`;
    const enhanceTitle = maxed
      ? 'Already at max enhance'
      : canAfford
        ? `Spend ${cost}G. Failure keeps the current level.`
        : `Need ${cost}G (have ${player.gold})`;
    return `<article class="item-card ${equipped ? 'equipped' : ''}${canEquip ? '' : ' wrong-class'}${plus > 0 ? ' enhanced' : ''}" style="--rarity:${hexColor(item.rarityColor)}">
      <img class="item-icon" src="${itemIcon(item)}" alt="">
      <header><small>${RARITIES[item.rarity].name} · iLv.${item.itemLevel}${plus > 0 ? ` · +${plus}` : ''}</small><strong>${plus > 0 ? `+${plus} ` : ''}${escapeHtml(item.name)}</strong></header>
      <span class="item-score">S ${item.score}</span>
      ${plusBadge}
      <div class="item-stats">${this.#itemStats(item, 6, { compare: !equipped })}</div>
      <div class="item-meta" aria-hidden="true">${enhanceMeta}${sellMeta}</div>
      <div class="item-actions">
        <button type="button" data-action="equip" data-item="${item.id}" ${equipped || !canEquip ? 'disabled' : ''}>${equipLabel}</button>
        <button type="button" data-action="enhance" data-item="${item.id}" ${enhanceDisabled ? 'disabled' : ''} title="${enhanceTitle}">Enhance</button>
        <button type="button" data-action="sell" data-item="${item.id}" ${equipped || item.locked ? 'disabled' : ''} title="${sellVal ? `Sell for ${sellVal} gold` : 'Cannot sell'}">Sell</button>
      </div>
    </article>`;
  }

  #itemStats(item, limit = 6, options = {}) {
    const compare = Boolean(options.compare);
    const equippedItem = compare
      ? this.game.player.getItem(this.game.player.equipped[item.slot])
      : null;
    const showDelta = Boolean(equippedItem && equippedItem.id !== item.id);
    const values = [];
    for (const key of STAT_KEYS) {
      const value = Number(item[key]) || 0;
      const base = showDelta ? (Number(equippedItem[key]) || 0) : 0;
      if (!value && !(showDelta && base)) continue;
      if (!value && !showDelta) continue;
      if (!value && showDelta && !base) continue;
      // Prefer showing stats that exist on the candidate (or on equipped when comparing).
      if (!value && showDelta) {
        const delta = -base;
        const deltaHtml = `<em class="stat-down">${formatStatDelta(key, delta)}</em>`;
        values.push(`<span>${STAT_LABELS[key]} 0 ${deltaHtml}</span>`);
        continue;
      }
      const main = statText(key, value);
      if (!showDelta) {
        values.push(`<span>${main}</span>`);
        continue;
      }
      const delta = value - base;
      if (Math.abs(delta) < 1e-9) {
        values.push(`<span>${main}</span>`);
      } else {
        const cls = delta > 0 ? 'stat-up' : 'stat-down';
        values.push(`<span>${main} <em class="${cls}">${formatStatDelta(key, delta)}</em></span>`);
      }
    }
    if (item.slot === 'weapon') {
      const speed = Number(item.speed ?? 1);
      let speedHtml = `Speed ×${speed.toFixed(2)}`;
      if (showDelta) {
        const baseSpeed = Number(equippedItem.speed ?? 1);
        const delta = speed - baseSpeed;
        if (Math.abs(delta) >= 0.005) {
          const cls = delta > 0 ? 'stat-up' : 'stat-down';
          speedHtml += ` <em class="${cls}">${formatStatDelta('speed', delta)}</em>`;
        }
      }
      values.push(`<span>${speedHtml}</span>`);
    }
    if (showDelta && (item.score != null || equippedItem.score != null)) {
      const scoreDelta = (item.score ?? 0) - (equippedItem.score ?? 0);
      if (Math.abs(scoreDelta) >= 1) {
        const cls = scoreDelta > 0 ? 'stat-up' : 'stat-down';
        values.push(`<span>Score <em class="${cls}">${scoreDelta > 0 ? '+' : ''}${Math.round(scoreDelta)}</em></span>`);
      }
    }
    return values.slice(0, limit).join('') || '<span>No special stats</span>';
  }

  #renderSkills() {
    const player = this.game.player;
    const hero = getHeroClass(player.classId);
    this.elements['panel-title'].textContent = hero.skillPanelTitle ?? 'Skills';
    const active = getClassActiveSkills(player.classId).map(skill => this.#skillCard(skill)).join('');
    const passive = getClassPassiveSkills(player.classId).map(skill => this.#skillCard(skill)).join('');
    const debugControls = this.game.debugEnabled ? this.#debugSkillControls() : '';
    this.elements['panel-content'].innerHTML = `
      <div class="skills-layout">
        ${debugControls}
        <div class="skill-points-banner"><div><span>AVAILABLE POINTS</span><strong>Earned from level-ups and hunt milestones.</strong></div><b>${player.skillPoints} SP</b></div>
        <section class="skill-group"><h3>Active Arts</h3>${active}</section>
        <section class="skill-group"><h3>Passives</h3>${passive}</section>
      </div>`;
  }

  #skillCard(skill) {
    const player = this.game.player;
    const unlocked = player.level >= skill.unlockLevel;
    const rank = player.skillRank(skill.id);
    const displayRank = skill.passive ? rank : unlocked ? Math.max(1, rank) : 0;
    const canUpgrade = unlocked && player.skillPoints > 0 && displayRank < skill.maxRank;
    const bundle = skill.passive ? null : resolveSkillForm(
      skill, displayRank, player.level, player.skillEvolution?.[skill.id] ?? {},
    );
    const currentValues = bundle ? formatCombatSnapshot(bundle.combat).join(' · ') : '';
    const evolution = skill.passive ? '' : this.#skillEvolution(skill, displayRank, bundle);
    return `<article class="skill-card ${unlocked ? '' : 'locked'}">
      <span class="skill-key">${skill.key ?? '◆'}</span>
      <h4>${escapeHtml(skill.name)} <small>Lv.${displayRank}/${skill.maxRank}</small></h4>
      <p>${escapeHtml(skill.description)} ${skill.passive ? '' : `MP ${bundle.mp} · CD ${bundle.cooldown}s`}</p>
      <div class="rank-line"><span>${unlocked ? escapeHtml(skill.passive ? skill.rankText(Math.max(1, displayRank)) : currentValues) : `Unlocks at Lv.${skill.unlockLevel}`}</span><div class="rank-pips">${Array.from({ length: skill.maxRank }, (_, i) => `<i class="${i < displayRank ? 'active' : ''}"></i>`).join('')}</div></div>
      ${evolution}
      <button data-action="upgrade-skill" data-skill="${skill.id}" ${canUpgrade ? '' : 'disabled'}>${displayRank >= skill.maxRank ? 'Max Rank' : 'Spend 1 SP'}</button>
    </article>`;
  }

  #skillEvolution(skill, rank, bundle) {
    const player = this.game.player;
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

  #debugSkillControls() {
    const player = this.game.player;
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

  #renderHunter() {
    this.elements['panel-title'].textContent = 'Hunt Records';
    const hunt = this.game.hunt;
    const contract = hunt.contract;
    const maxZoneKills = Math.max(1, ...Object.values(hunt.killsByZone));
    const zoneRows = Object.values(ZONES).map(zone => {
      const kills = hunt.killsByZone[zone.id] ?? 0;
      return `<div class="zone-record"><span>${zone.name}</span><b>${kills.toLocaleString('en-US')}</b><div><i style="width:${kills / maxZoneKills * 100}%"></i></div></div>`;
    }).join('');
    const discovered = Object.keys(hunt.killsByType).length;
    this.elements['panel-content'].innerHTML = `
      <div class="records-layout">
        <section>
          <div class="record-card"><h3>${escapeHtml(hunt.hunterTitle)} · WORLD TIER ${hunt.worldTier}</h3>
            <div class="big-record"><div><strong>${hunt.totalKills}</strong><small>Total Kills</small></div><div><strong>${hunt.elitesKilled}</strong><small>Elite</small></div><div><strong>${hunt.bossesKilled}</strong><small>Boss</small></div><div><strong>${hunt.bestStreak}</strong><small>Best Streak</small></div></div>
          </div>
          <div class="record-card"><h3>Kills by Zone</h3>${zoneRows}</div>
        </section>
        <section>
          <div class="record-card"><h3>Current Contract</h3><div class="contract-detail"><small>REWARD TIER ${contract?.rewardTier ?? 1}</small><strong>${escapeHtml(contract?.label ?? 'Contract preparing')}</strong><p>${escapeHtml(contract?.description ?? '')}</p><p class="contract-reward-hint">${escapeHtml(contract?.rewardHint ?? '')}</p><div class="zone-record"><span>Progress</span><b>${Math.floor(contract?.progress ?? 0)} / ${contract?.target ?? 0}</b><div><i style="width:${contract ? contract.progress / contract.target * 100 : 0}%"></i></div></div></div></div>
          <div class="record-card"><h3>Codex & Play</h3><div class="character-stats"><span>Monsters Found <b>${discovered} / 42</b></span><span>Contracts Done <b>${hunt.completedContracts}</b></span><span>Play Time <b>${formatTime(this.game.playTime)}</b></span><span>Next Boss <b>${Math.floor(hunt.bossCharge)}%</b></span></div></div>
        </section>
      </div>`;
  }

  #renderSystem() {
    this.elements['panel-title'].textContent = 'System';
    this.elements['panel-content'].innerHTML = `
      <div class="system-layout">
        <section class="system-card"><h3>Current Hunt</h3><p>Progress auto-saves every ${GAME_CONFIG.autoSaveSeconds}s; near the hub your HP and mana recover quickly.</p><div class="character-stats"><span>Level <b>${this.game.player.level}</b></span><span>Play Time <b>${formatTime(this.game.playTime)}</b></span><span>Kills <b>${this.game.hunt.totalKills}</b></span><span>World Tier <b>${this.game.hunt.worldTier}</b></span></div></section>
        <section class="system-card"><h3>Graphics Quality</h3><p>Unified control of post-processing, shadows, vegetation density and dynamic render resolution. <kbd>F3</kbd> shows the dev HUD.</p><div class="quality-actions">${['low','medium','high'].map(id => `<button data-action="quality" data-quality="${id}" class="${this.game.quality === id ? 'active' : ''}">${{ low: 'Low', medium: 'Medium', high: 'High' }[id]}</button>`).join('')}</div></section>
        <section class="system-card"><h3>Game Menu</h3><div class="system-actions"><button data-action="resume">Resume Hunt</button><button data-action="save">Save Now</button><button data-action="mute">Sound ${this.game.audio.muted ? 'On' : 'Off'}</button><button data-action="title">Return to Title</button><button class="danger-button" data-action="reset-save">Delete Save Data</button></div></section>
      </div>`;
  }

  #handlePanelAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'filter') {
      this.inventoryFilter = button.dataset.filter;
      this.#renderInventory();
    } else if (action === 'equip') {
      const item = this.game.player.getItem(button.dataset.item);
      if (item && !this.game.player.canEquipItem?.(item)) {
        this.notify('This class cannot equip that weapon.', 'danger', 2.8);
        return;
      }
      if (this.game.player.equip(button.dataset.item)) {
        this.game.audio.click();
        this.notify('Equipped new gear.', 'loot');
        this.game.requestSave();
        this.#renderInventory();
      }
    } else if (action === 'sell' || action === 'salvage') {
      const value = this.game.player.sell(button.dataset.item);
      if (value > 0) {
        this.game.audio.click();
        this.notify(`Sold · +${value}G`, 'loot');
        this.game.requestSave();
        this.#renderInventory();
      }
    } else if (action === 'sell-junk' || action === 'salvage-low') {
      const result = this.game.player.sellAllUnequipped({ rarities: ['common', 'uncommon'] });
      this.notify(
        result.count ? `Sold ${result.count} junk · +${result.gold}G` : 'No Common/Uncommon gear to sell.',
        result.count ? 'loot' : 'danger',
      );
      if (result.count) this.game.audio.click();
      this.game.requestSave();
      this.#renderInventory();
    } else if (action === 'sell-all') {
      const result = this.game.player.sellAllUnequipped();
      this.notify(
        result.count ? `Sold ${result.count} items · +${result.gold.toLocaleString('en-US')}G` : 'Nothing to sell (equipped gear is kept).',
        result.count ? 'loot' : 'danger',
      );
      if (result.count) this.game.audio.click();
      this.game.requestSave();
      this.#renderInventory();
    } else if (action === 'weapon-enhance') {
      const result = this.game.player.enhanceWeapon();
      if (!result.ok) {
        this.notify(result.reason === 'gold' ? `Need ${result.cost.toLocaleString('en-US')}G to evolve the weapon.` : 'Weapon evolution is complete.', 'danger', 2.8);
        return;
      }
      if (result.success === false) {
        this.game.audio.click();
        this.notify(`Weapon enhance failed · remains at +${result.level}`, 'danger', 3.2);
        this.game.requestSave();
        this.#renderInventory();
        return;
      }
      this.game.audio.levelUp?.();
      this.notify(`Weapon evolved · ${this.game.player.weapon.name} · +${result.level}`, 'level', 3.6);
      this.game.requestSave();
      this.#renderInventory();
    } else if (action === 'weapon-option-enhance') {
      const result = this.game.player.enhanceWeaponOptions();
      if (!result.ok) {
        this.notify(result.reason === 'gold' ? `Need ${result.cost.toLocaleString('en-US')}G to enhance weapon options.` : 'Weapon options are complete.', 'danger', 2.8);
        return;
      }
      this.game.audio.click();
      this.notify(`Weapon option improved · ${titleCaseId(result.stat)} · Lv.${result.level}`, 'loot', 3.2);
      this.game.requestSave();
      this.#renderInventory();
    } else if (action === 'enhance') {
      const item = this.game.player.getItem(button.dataset.item);
      const name = item?.name ?? 'Gear';
      const result = this.game.player.enhance(button.dataset.item);
      if (!result.ok) {
        if (result.reason === 'gold') this.notify(`Need ${result.cost}G to enhance.`, 'danger', 2.6);
        else if (result.reason === 'max') this.notify('Already at max enhance (+10).', 'danger', 2.4);
        else this.notify('Cannot enhance that item.', 'danger', 2.4);
        return;
      }
      this.game.audio.click();
      this.game.audio.levelUp?.();
      this.notify(`Enhance complete · ${name} → +${result.level}`, 'level', 3.2);
      this.game.requestSave();
      this.#renderInventory();
    } else if (action === 'upgrade-skill') {
      if (this.game.player.upgradeSkill(button.dataset.skill)) {
        this.game.audio.levelUp();
        this.notify(`${SKILLS[button.dataset.skill].name} upgraded`, 'level');
        this.game.requestSave();
        this.#renderSkills();
      }
    } else if (action === 'select-mutation') {
      const skill = SKILLS[button.dataset.skill];
      const milestone = Number(button.dataset.milestone);
      if (this.game.player.setSkillMutation(button.dataset.skill, milestone, button.dataset.choice)) {
        const option = skill?.evolution?.mutations?.[milestone]?.[button.dataset.choice];
        this.game.audio.click();
        this.notify(`${skill.name} · Lv.${milestone} ${option?.label ?? titleCaseId(button.dataset.choice)}`, 'level');
        this.game.requestSave();
        this.#renderSkills();
      }
    } else if (action === 'debug-skill-state') {
      if (!this.game.debugEnabled) return;
      const changed = this.game.debugSetSkillState({
        classId: button.dataset.debugClass,
        level: button.dataset.debugLevel,
        rank: button.dataset.debugRank,
      });
      if (changed) {
        this.notify('Debug skill state updated.', 'level', 1.8);
        this.#renderSkills();
      }
    } else if (action === 'quality') {
      if (this.game.setQuality(button.dataset.quality)) this.#renderSystem();
    } else if (action === 'resume') this.closePanel();
    else if (action === 'save') {
      if (this.game.saveGame(true)) this.notify('Progress saved to browser storage.', 'loot');
    } else if (action === 'mute') {
      this.game.audio.setMuted(!this.game.audio.muted);
      this.#renderSystem();
    } else if (action === 'title') {
      this.closePanel();
      this.game.returnToTitle();
    } else if (action === 'reset-save') {
      if (window.confirm('Delete save data and start a new hunt?')) {
        this.game.save.clear();
        this.closePanel();
        this.game.newGame();
      }
    }
  }

  showDeath() {
    this.elements['death-screen'].classList.remove('hidden');
    this.elements['death-timer-fill'].style.width = '100%';
    const root = this.elements['death-screen']?.querySelector('div');
    if (!root) return;
    const title = root.querySelector('h2');
    const copy = root.querySelector('p');
    const eyebrow = root.querySelector('span');
    if (this.game.mode === 'defense') {
      const wave = this.game.defense?.hud?.wave ?? this.game.defense?.wave ?? 1;
      const best = this.game.defense?.bestWaveThisRun ?? this.game.defenseMeta?.bestWave ?? wave;
      const kills = this.game.defense?.killsThisRun ?? 0;
      const mut = this.game.defense?.mutator?.label;
      if (eyebrow) eyebrow.textContent = 'DEFENSE FAILED';
      if (title) title.textContent = `You fell on wave ${wave}`;
      if (copy) {
        copy.textContent = mut
          ? `Best wave ${best} · ${kills} kills · Last mutator: ${mut}. Returning to title.`
          : `Best wave ${best} · ${kills} kills. Returning to title.`;
      }
    } else {
      if (eyebrow) eyebrow.textContent = 'HUNTER DOWN';
      if (title) title.textContent = 'The hunt is not over';
      if (copy) copy.textContent = "Regroup at the camp's guardian stone.";
    }
  }

  setDeathProgress(ratio) {
    this.elements['death-timer-fill'].style.width = `${clamp(ratio, 0, 1) * 100}%`;
  }

  hideDeath() {
    this.elements['death-screen'].classList.add('hidden');
  }

  setDebugVisible(visible) {
    const el = this.elements['debug-hud'];
    if (!el) return;
    el.classList.toggle('hidden', !visible);
    el.classList.toggle('visible', Boolean(visible));
  }

  updateDebug(snapshot = {}) {
    const el = this.elements['debug-hud'];
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

  fatal(error) {
    this.elements['loading-screen'].classList.remove('active');
    this.elements['title-screen'].classList.remove('active');
    this.elements['fatal-error'].classList.remove('hidden');
    this.elements['fatal-error'].querySelector('p').textContent = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
  }
}
