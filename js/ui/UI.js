import * as THREE from 'three';
import { GAME_CONFIG, GEAR_ENHANCE, PLAYER_CONFIG } from '../config.js';
import { gearEnhanceCost, gearEnhanceSuccessChance, gearSellValue } from '../systems/LootSystem.js';
import {
  DEFAULT_HERO_CLASS_ID, RARITIES, SKILLS, ZONES,
  getClassActiveSkills, getClassPassiveSkills, getHeroClass, resolveHeroClassId,
} from '../data/content.js';
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
      'hud', 'player-name', 'portrait-level', 'hunter-title', 'hp-fill', 'hp-text', 'mp-fill', 'mp-text', 'xp-fill', 'xp-text',
      'energy-bar', 'energy-fill', 'energy-text',
      'world-tier', 'zone-name', 'zone-subtitle', 'defense-wave-panel', 'defense-wave-label', 'defense-wave-remaining',
      'kill-count', 'streak-count', 'elite-count', 'boss-count',
      'boss-charge-text', 'boss-charge-fill', 'contract-title', 'contract-fill', 'contract-progress', 'contract-hint',
      'boss-hud', 'boss-name', 'boss-level', 'boss-health-fill', 'gold-count', 'essence-count', 'bag-count', 'potion-count',
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
    this.elements['player-name'].textContent = player.name;
    this.elements['portrait-level'].textContent = player.level;
    this.elements['hunter-title'].textContent = isDefense ? 'Wave Survival' : hunt.hunterTitle;
    this.elements['hp-fill'].style.width = `${player.healthRatio * 100}%`;
    this.elements['hp-text'].textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    this.elements['mp-fill'].style.width = `${player.manaRatio * 100}%`;
    this.elements['mp-text'].textContent = `${Math.floor(player.mp)} / ${player.maxMp}`;
    this.elements['xp-fill'].style.width = `${clamp(player.xp / player.xpNeeded, 0, 1) * 100}%`;
    this.elements['xp-text'].textContent = `${Math.floor(player.xp)} / ${player.xpNeeded}`;
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
        this.elements['contract-hint'].textContent = 'Clear waves · gear & power shards scale up';
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
    this.elements['essence-count'].textContent = player.essence.toLocaleString('en-US');
    this.elements['bag-count'].textContent = `${player.inventory.length} / ${PLAYER_CONFIG.inventoryLimit}`;
    this.elements['potion-count'].textContent = player.potions;

    this.#updateAbility('dash', player.cooldownRatio('dash'), player.dashCooldown);
    this.#updateAbility('potion', player.cooldownRatio('potion'), player.potionCooldown);
    this.#syncAbilityBarForClass(player.classId);
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

  #syncAbilityBarForClass(classId) {
    if (this.lastAbilityClassId === classId) return;
    this.lastAbilityClassId = classId;
    const hero = getHeroClass(classId);
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
    this.boundSkillSlots = {};
    for (const skill of getClassActiveSkills(classId)) {
      const slot = this.skillKeySlots[skill.key];
      if (!slot) continue;
      slot.dataset.slot = skill.id;
      this.boundSkillSlots[skill.id] = slot;
      this.abilitySlots[skill.id] = slot;
      const nameEl = slot.querySelector('b');
      if (nameEl) nameEl.textContent = skill.name;
      const lock = slot.querySelector('.lock-level');
      if (lock) lock.textContent = `LV.${skill.unlockLevel}`;
      const kbd = slot.querySelector('kbd');
      if (kbd) kbd.textContent = skill.key;
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
    this.elements['panel-title'].textContent = 'Equipment & Loot';
    const player = this.game.player;
    const equipped = ['weapon', 'armor', 'charm'].map(slot => this.#equipmentSlot(slot)).join('');
    const list = player.inventory
      .filter(item => this.inventoryFilter === 'all' || item.slot === this.inventoryFilter)
      .sort((a, b) => ((b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0))
        || (RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity])
        || ((b.score ?? 0) - (a.score ?? 0)));
    const cards = list.length ? list.map(item => this.#itemCard(item)).join('') : '<div class="empty-inventory">No loot of this type.</div>';
    const sellableCount = player.inventory.filter(item => !item.locked && player.equipped[item.slot] !== item.id).length;
    this.elements['panel-content'].innerHTML = `
      <div class="panel-grid inventory-layout">
        <section class="equipment-column">
          <p class="section-label"><span>EQUIPPED</span><b>Power ${Math.round(player.attackPower + player.defense + player.maxHp * .08)}</b></p>
          ${equipped}
          <div class="character-stats">
            <span>Attack <b>${Math.round(player.attackPower)}</b></span><span>Defense <b>${Math.round(player.defense)}</b></span>
            <span>Health <b>${player.maxHp}</b></span><span>Crit <b>${(player.critChance * 100).toFixed(1)}%</b></span>
            <span>Atk Speed <b>${player.attackSpeed.toFixed(2)}</b></span><span>Skill Power <b>${Math.round(player.skillPower * 100)}%</b></span>
            <span>Lifesteal <b>${(player.leech * 100).toFixed(1)}%</b></span><span>Luck <b>${(player.luck * 100).toFixed(1)}%</b></span>
            <span>Gold <b>${player.gold.toLocaleString('en-US')}</b></span><span>Bag <b>${player.inventory.length}/${PLAYER_CONFIG.inventoryLimit}</b></span>
          </div>
          <p class="enhance-hint">Sell spare gear for gold, then <b>Enhance</b> keepers. Success raises stats; fail drops 1 level.</p>
        </section>
        <section class="inventory-column">
          <div class="inventory-toolbar">
            <p class="section-label inventory-count"><span>INVENTORY</span><b>${player.inventory.length} / ${PLAYER_CONFIG.inventoryLimit}</b></p>
            <div class="inventory-filters" role="group" aria-label="Filter gear">
              ${['all', 'weapon', 'armor', 'charm'].map(id => `<button type="button" class="filter-button ${this.inventoryFilter === id ? 'active' : ''}" data-action="filter" data-filter="${id}">${{ all: 'All', weapon: 'Weapon', armor: 'Armor', charm: 'Charm' }[id]}</button>`).join('')}
            </div>
            <div class="inventory-bulk-actions" role="group" aria-label="Bulk sell">
              <button type="button" class="small-button" data-action="sell-junk" title="Sell Common and Uncommon unequipped gear">Sell Junk</button>
              <button type="button" class="small-button accent-button" data-action="sell-all" ${sellableCount ? '' : 'disabled'} title="Sell every unequipped item (keeps equipped)">Sell All${sellableCount ? ` · ${sellableCount}` : ''}</button>
            </div>
          </div>
          <div class="item-grid">${cards}</div>
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
        ? `Spend ${cost}G. Success ${chancePct}%. Fail drops 1 level.`
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
    this.elements['panel-content'].innerHTML = `
      <div class="skills-layout">
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
    return `<article class="skill-card ${unlocked ? '' : 'locked'}">
      <span class="skill-key">${skill.key ?? '◆'}</span>
      <h4>${escapeHtml(skill.name)} <small>Lv.${displayRank}/${skill.maxRank}</small></h4>
      <p>${escapeHtml(skill.description)} ${skill.passive ? '' : `MP ${skill.mp} · CD ${skill.cooldown}s`}</p>
      <div class="rank-line"><span>${unlocked ? skill.rankText(Math.max(1, displayRank)) : `Unlocks at Lv.${skill.unlockLevel}`}</span><div class="rank-pips">${Array.from({ length: skill.maxRank }, (_, i) => `<i class="${i < displayRank ? 'active' : ''}"></i>`).join('')}</div></div>
      <button data-action="upgrade-skill" data-skill="${skill.id}" ${canUpgrade ? '' : 'disabled'}>${displayRank >= skill.maxRank ? 'Max Rank' : 'Spend 1 SP'}</button>
    </article>`;
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
      if (result.success) {
        this.game.audio.levelUp?.();
        this.notify(`Enhance success · ${name} → +${result.level}`, 'level', 3.2);
      } else {
        this.notify(
          result.level > 0
            ? `Enhance failed · ${name} dropped to +${result.level}`
            : `Enhance failed · ${name} stays +0`,
          'danger',
          3.4,
        );
      }
      this.game.requestSave();
      this.#renderInventory();
    } else if (action === 'upgrade-skill') {
      if (this.game.player.upgradeSkill(button.dataset.skill)) {
        this.game.audio.levelUp();
        this.notify(`${SKILLS[button.dataset.skill].name} upgraded`, 'level');
        this.game.requestSave();
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
