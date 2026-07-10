import * as THREE from 'three';
import { GAME_CONFIG, PLAYER_CONFIG } from '../config.js';
import { RARITIES, SKILLS, ZONES } from '../data/content.js';
import { clamp, formatTime } from '../core/Utils.js';

const STAT_LABELS = Object.freeze({
  power: 'Attack', defense: 'Defense', hp: 'Health', crit: 'Crit', haste: 'Haste', leech: 'Lifesteal',
  xpBonus: 'XP', goldBonus: 'Gold', skillPower: 'Skill', moveSpeed: 'Move', luck: 'Luck',
});
const PERCENT_STATS = new Set(['crit', 'haste', 'leech', 'xpBonus', 'goldBonus', 'skillPower', 'luck']);
const RARITY_RANK = Object.freeze({ common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 });

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

function statText(key, value) {
  if (!value) return '';
  if (PERCENT_STATS.has(key)) return `${STAT_LABELS[key]} +${(value * 100).toFixed(value < .1 ? 1 : 0)}%`;
  if (key === 'moveSpeed') return `${STAT_LABELS[key]} +${Number(value).toFixed(2)}`;
  return `${STAT_LABELS[key]} +${Math.round(value)}`;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.currentPanel = null;
    this.inventoryFilter = 'all';
    this.hudTimer = 0;
    this.minimapTimer = 0;
    this.lastZoneId = null;
    this.elements = {};
    for (const id of [
      'loading-screen', 'loading-text', 'loading-bar', 'title-screen', 'new-game-btn', 'defense-btn', 'continue-btn', 'continue-meta',
      'hud', 'player-name', 'portrait-level', 'hunter-title', 'hp-fill', 'hp-text', 'mp-fill', 'mp-text', 'xp-fill', 'xp-text',
      'world-tier', 'zone-name', 'zone-subtitle', 'defense-wave-panel', 'defense-wave-label', 'defense-wave-remaining',
      'kill-count', 'streak-count', 'elite-count', 'boss-count',
      'boss-charge-text', 'boss-charge-fill', 'contract-title', 'contract-fill', 'contract-progress',
      'boss-hud', 'boss-name', 'boss-level', 'boss-health-fill', 'gold-count', 'essence-count', 'bag-count', 'potion-count',
      'minimap', 'minimap-zone', 'notifications', 'float-layer', 'aim-reticle', 'zone-toast',
      'panel-layer', 'panel-title', 'panel-content', 'panel-close', 'death-screen', 'death-timer-fill',
      'damage-flash', 'fatal-error', 'debug-hud',
    ]) this.elements[id] = document.getElementById(id);
    this.minimapContext = this.elements.minimap.getContext('2d');
    this.abilitySlots = Object.fromEntries([...document.querySelectorAll('.ability-slot')].map(slot => [slot.dataset.slot, slot]));
    this.panelButtons = [...document.querySelectorAll('[data-panel]')];
    this.#bindEvents();
  }

  #bindEvents() {
    this.elements['new-game-btn'].addEventListener('click', async () => {
      await this.game.audio.unlock();
      this.game.newGame();
    });
    this.elements['defense-btn']?.addEventListener('click', async () => {
      await this.game.audio.unlock();
      if (typeof this.game.startDefense === 'function') this.game.startDefense();
    });
    this.elements['continue-btn'].addEventListener('click', async () => {
      if (this.elements['continue-btn'].disabled) return;
      await this.game.audio.unlock();
      this.game.continueGame();
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
    const save = this.game.save.load();
    this.elements['continue-btn'].disabled = !save;
    this.elements['continue-meta'].textContent = save
      ? `Lv.${save.player?.level ?? 1} · ${formatTime(save.playTime ?? 0)} · ${save.hunt?.totalKills ?? 0} kills`
      : 'No save data';
  }

  showHUD() {
    const mode = this.game.mode === 'defense' ? 'defense' : 'hunt';
    document.body.dataset.mode = mode;
    this.elements['title-screen'].classList.remove('active');
    this.elements.hud.classList.remove('hidden');
    this.elements['death-screen'].classList.add('hidden');
    this.elements['defense-wave-panel']?.classList.toggle('hidden', mode !== 'defense');
    this.lastZoneId = null;
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
    if (isDefense) {
      const wave = defenseHud?.wave ?? 1;
      const remaining = defenseHud?.remaining ?? 0;
      this.elements['world-tier'].textContent = `WAVE ${wave}`;
      if (this.elements['defense-wave-label']) this.elements['defense-wave-label'].textContent = `WAVE ${wave}`;
      if (this.elements['defense-wave-remaining']) {
        this.elements['defense-wave-remaining'].textContent = `${remaining} left`;
      }
      this.elements['contract-title'].textContent = 'Wave Survival';
      this.elements['contract-progress'].textContent = `${remaining} remaining`;
      this.elements['contract-fill'].style.width = '0%';
      const defenseKills = defenseHud?.kills ?? defenseHud?.totalKills;
      this.elements['kill-count'].textContent = (defenseKills ?? hunt.totalKills ?? 0).toLocaleString('en-US');
      this.elements['streak-count'].textContent = defenseHud?.streak ?? 0;
      this.elements['elite-count'].textContent = defenseHud?.elitesKilled ?? 0;
      this.elements['boss-count'].textContent = defenseHud?.bossesKilled ?? 0;
    } else {
      this.elements['world-tier'].textContent = `WORLD TIER ${hunt.worldTier}`;
      this.elements['kill-count'].textContent = hunt.totalKills.toLocaleString('en-US');
      this.elements['streak-count'].textContent = hunt.streak;
      this.elements['elite-count'].textContent = hunt.elitesKilled;
      this.elements['boss-count'].textContent = hunt.bossesKilled;
      const contract = hunt.contract;
      if (contract) {
        this.elements['contract-title'].textContent = contract.label;
        this.elements['contract-progress'].textContent = `${Math.floor(contract.progress)} / ${contract.target}`;
        this.elements['contract-fill'].style.width = `${clamp(contract.progress / contract.target, 0, 1) * 100}%`;
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
    for (const skillId of ['whirlwind', 'crescent', 'skyfall', 'starburst']) {
      const unlocked = player.skillRank(skillId) > 0;
      const slot = this.abilitySlots[skillId];
      slot.classList.toggle('locked', !unlocked);
      this.#updateAbility(skillId, player.cooldownRatio(skillId), player.skillCooldowns[skillId]);
      slot.classList.toggle('insufficient', unlocked && player.mp < SKILLS[skillId].mp);
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

  #updateAbility(id, ratio, seconds) {
    const slot = this.abilitySlots[id];
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
    const element = document.createElement('div');
    element.className = `notification ${type}`;
    element.textContent = message;
    element.style.setProperty('--out-delay', `${Math.max(.2, duration - .35)}s`);
    this.elements.notifications.prepend(element);
    while (this.elements.notifications.children.length > 6) this.elements.notifications.lastElementChild.remove();
    setTimeout(() => element.remove(), duration * 1000 + 120);
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
    setTimeout(() => element.remove(), type === 'critical' ? 920 : 760);
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
    this.game.setPaused(true);
    this.panelButtons.forEach(button => button.classList.toggle('active', button.dataset.panel === type));
    this.renderPanel();
  }

  closePanel() {
    if (this.elements['panel-layer'].classList.contains('hidden')) return;
    this.elements['panel-layer'].classList.add('hidden');
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
      .sort((a, b) => (RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]) || ((b.score ?? 0) - (a.score ?? 0)));
    const cards = list.length ? list.map(item => this.#itemCard(item)).join('') : '<div class="empty-inventory">No loot of this type.</div>';
    this.elements['panel-content'].innerHTML = `
      <div class="panel-grid">
        <section class="equipment-column">
          <p class="section-label"><span>EQUIPPED</span><b>Power ${Math.round(player.attackPower + player.defense + player.maxHp * .08)}</b></p>
          ${equipped}
          <div class="character-stats">
            <span>Attack <b>${Math.round(player.attackPower)}</b></span><span>Defense <b>${Math.round(player.defense)}</b></span>
            <span>Health <b>${player.maxHp}</b></span><span>Crit <b>${(player.critChance * 100).toFixed(1)}%</b></span>
            <span>Atk Speed <b>${player.attackSpeed.toFixed(2)}</b></span><span>Skill Power <b>${Math.round(player.skillPower * 100)}%</b></span>
            <span>Lifesteal <b>${(player.leech * 100).toFixed(1)}%</b></span><span>Luck <b>${(player.luck * 100).toFixed(1)}%</b></span>
          </div>
        </section>
        <section class="inventory-column">
          <div class="inventory-toolbar">
            <p class="section-label"><span>INVENTORY</span><b>${player.inventory.length} / ${PLAYER_CONFIG.inventoryLimit}</b></p>
            <div>
              ${['all', 'weapon', 'armor', 'charm'].map(id => `<button class="filter-button ${this.inventoryFilter === id ? 'active' : ''}" data-action="filter" data-filter="${id}">${{ all: 'All', weapon: 'Weapon', armor: 'Armor', charm: 'Charm' }[id]}</button>`).join('')}
              <button class="small-button" data-action="salvage-low">Salvage Common/Uncommon</button>
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
    return `<article class="equipment-slot" style="--rarity:${hexColor(item.rarityColor)}">
      <img class="equipment-icon" src="${itemIcon(item)}" alt="">
      <small>${labels[slot]} · ${RARITIES[item.rarity].name}</small><span class="item-score">S ${item.score}</span>
      <strong style="color:${hexColor(item.rarityColor)}">${escapeHtml(item.name)}</strong>
      <div class="item-stats">${this.#itemStats(item, 6)}</div>
    </article>`;
  }

  #itemCard(item) {
    const equipped = this.game.player.equipped[item.slot] === item.id;
    return `<article class="item-card ${equipped ? 'equipped' : ''}" style="--rarity:${hexColor(item.rarityColor)}">
      <img class="item-icon" src="${itemIcon(item)}" alt="">
      <header><small>${RARITIES[item.rarity].name} · iLv.${item.itemLevel}</small><strong>${escapeHtml(item.name)}</strong></header>
      <span class="item-score">S ${item.score}</span>
      <div class="item-stats">${this.#itemStats(item, 6)}</div>
      <div class="item-actions">
        <button data-action="equip" data-item="${item.id}" ${equipped ? 'disabled' : ''}>${equipped ? 'Equipped' : 'Equip'}</button>
        <button data-action="salvage" data-item="${item.id}" ${equipped || item.locked ? 'disabled' : ''}>Salvage</button>
      </div>
    </article>`;
  }

  #itemStats(item, limit = 6) {
    const values = [];
    for (const key of ['power', 'defense', 'hp', 'crit', 'haste', 'leech', 'skillPower', 'xpBonus', 'goldBonus', 'moveSpeed', 'luck']) {
      if (item[key]) values.push(`<span>${statText(key, item[key])}</span>`);
    }
    if (item.slot === 'weapon') values.push(`<span>Speed ×${Number(item.speed ?? 1).toFixed(2)}</span>`);
    return values.slice(0, limit).join('') || '<span>No special stats</span>';
  }

  #renderSkills() {
    this.elements['panel-title'].textContent = 'Blade Arts & Hunt Instincts';
    const player = this.game.player;
    const active = Object.values(SKILLS).filter(skill => !skill.passive).map(skill => this.#skillCard(skill)).join('');
    const passive = Object.values(SKILLS).filter(skill => skill.passive).map(skill => this.#skillCard(skill)).join('');
    this.elements['panel-content'].innerHTML = `
      <div class="skills-layout">
        <div class="skill-points-banner"><div><span>AVAILABLE POINTS</span><strong>Earned from level-ups and hunt milestones.</strong></div><b>${player.skillPoints} SP</b></div>
        <section class="skill-group"><h3>Active Arts</h3>${active}</section>
        <section class="skill-group"><h3>Passive Instincts</h3>${passive}</section>
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
          <div class="record-card"><h3>Current Contract</h3><div class="contract-detail"><small>REWARD TIER ${contract?.rewardTier ?? 1}</small><strong>${escapeHtml(contract?.label ?? 'Contract preparing')}</strong><p>${escapeHtml(contract?.description ?? '')}</p><div class="zone-record"><span>Progress</span><b>${Math.floor(contract?.progress ?? 0)} / ${contract?.target ?? 0}</b><div><i style="width:${contract ? contract.progress / contract.target * 100 : 0}%"></i></div></div></div></div>
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
      if (this.game.player.equip(button.dataset.item)) {
        this.game.audio.click();
        this.notify('Equipped new gear.', 'loot');
        this.game.requestSave();
        this.#renderInventory();
      }
    } else if (action === 'salvage') {
      const value = this.game.player.salvage(button.dataset.item);
      if (value > 0) {
        this.game.audio.click();
        this.notify(`Salvaged · +${value}G`, 'loot');
        this.game.requestSave();
        this.#renderInventory();
      }
    } else if (action === 'salvage-low') {
      let total = 0;
      const candidates = [...this.game.player.inventory].filter(item => ['common', 'uncommon'].includes(item.rarity) && !item.locked && this.game.player.equipped[item.slot] !== item.id);
      candidates.forEach(item => { total += this.game.player.salvage(item.id); });
      this.notify(candidates.length ? `${candidates.length} items salvaged · +${total}G` : 'No Common/Uncommon gear to salvage.', candidates.length ? 'loot' : 'danger');
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
      this.game.saveGame(true);
      this.notify('Progress saved.', 'loot');
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
      if (eyebrow) eyebrow.textContent = 'DEFENSE FAILED';
      if (title) title.textContent = `You fell on wave ${wave}`;
      if (copy) copy.textContent = 'The defense run is over. Returning to title.';
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
