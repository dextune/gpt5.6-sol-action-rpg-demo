import { DEFAULT_HERO_CLASS_ID, resolveHeroClassId } from '../data/content.js';
import { clamp } from '../core/Utils.js';
import { hideDeath as hideDeathPanel, setDeathProgress as setDeathProgressPanel, showDeath as showDeathPanel } from './panels/deathOverlay.js';
import { setDebugVisible as setDebugVisiblePanel, updateDebug as updateDebugPanel } from './panels/debugHud.js';
import { renderInventory } from './panels/inventoryPanel.js';
import { renderSkills } from './panels/skillsPanel.js';
import { renderHunter } from './panels/hunterPanel.js';
import { renderSystem } from './panels/systemPanel.js';
import { handlePanelAction } from './panels/panelActions.js';
import {
  fillClassCards,
  refreshContinueButton,
  showTitle as showTitlePanel,
  syncClassSelect,
} from './panels/titleScreen.js';
import {
  runCombatOptionEnhance,
  runCombatWeaponEnhance,
  updateHUD,
  updateReticle,
} from './panels/hudCombat.js';
import { drawMinimap } from './panels/minimap.js';
import { zoneThreat, zoneToastDetail } from '../systems/huntThreat.js';
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
      'hud', 'profile-toggle', 'hunt-record-panel', 'player-name', 'portrait-level', 'player-level-text', 'hunter-title', 'hp-fill', 'mobile-hp-fill', 'mp-fill', 'mobile-mp-fill', 'xp-fill', 'xp-text',
      'class-state-row', 'frenzy-chip', 'overflow-chip', 'stim-chip',
      'ranger-state-row', 'thorns-chip', 'verdict-chip',
      'world-tier', 'zone-name', 'zone-subtitle',
      'kill-count', 'streak-count', 'elite-count', 'boss-count',
      'boss-charge-text', 'boss-charge-fill', 'contract-title', 'contract-fill', 'contract-progress', 'contract-hint',
      'boss-hud', 'boss-name', 'boss-level', 'boss-health-fill', 'boss-break-row', 'boss-break-fill', 'boss-break-text', 'gold-count', 'potion-count',
      'combat-forge', 'combat-weapon-enhance', 'combat-option-enhance',
      'combat-weapon-level', 'combat-weapon-cost', 'combat-option-level', 'combat-option-cost',
      'minimap', 'notifications', 'float-layer', 'aim-reticle', 'smartlink-reticle', 'zone-toast',
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
    // In-combat forge shortcuts (desktop + mobile).
    this.elements['combat-weapon-enhance']?.addEventListener('click', async () => {
      await this.game.audio.unlock();
      this.#runCombatWeaponEnhance();
    });
    this.elements['combat-option-enhance']?.addEventListener('click', async () => {
      await this.game.audio.unlock();
      this.#runCombatOptionEnhance();
    });
    this.elements['profile-toggle']?.addEventListener('click', () => {
      const expanded = this.elements['profile-toggle'].getAttribute('aria-expanded') === 'true';
      this.#setHuntRecordExpanded(!expanded);
    });
    window.addEventListener('keydown', event => {
      if (this.elements['title-screen'].classList.contains('active') && event.code === 'Enter') {
        event.preventDefault();
        (this.game.save.hasSave() ? this.elements['continue-btn'] : this.elements['new-game-btn']).click();
      }
    });
  }

  #runCombatWeaponEnhance() {
    return runCombatWeaponEnhance(this);
  }

  #runCombatOptionEnhance() {
    return runCombatOptionEnhance(this);
  }

  #syncClassSelect() {
    return syncClassSelect(this);
  }

  /** Densify title class cards: energy name, attack style, Q/E/R/C skill names. */
  #fillClassCards() {
    return fillClassCards(this);
  }

  setLoading(progress, text) {
    this.elements['loading-bar'].style.width = `${clamp(progress, 0, 1) * 100}%`;
    if (text) this.elements['loading-text'].textContent = text;
  }

  showTitle() {
    return showTitlePanel(this);
  }

  #refreshContinueButton() {
    return refreshContinueButton(this);
  }

  showHUD() {
    const mode = this.game.mode === 'defense' ? 'defense' : 'hunt';
    document.body.dataset.mode = mode;
    this.elements['title-screen'].classList.remove('active');
    this.elements.hud.classList.remove('hidden');
    this.elements['death-screen'].classList.add('hidden');
    this.#setHuntRecordExpanded(false);
    this.lastZoneId = null;
    this.lastAbilityClassId = null;
    this.lastAbilitySignature = null;
    this.update(1);
  }

  hideHUD() {
    this.elements.hud.classList.add('hidden');
  }

  #setHuntRecordExpanded(expanded) {
    const toggle = this.elements['profile-toggle'];
    const panel = this.elements['hunt-record-panel'];
    if (!toggle || !panel) return;
    const isExpanded = Boolean(expanded);
    toggle.setAttribute('aria-expanded', String(isExpanded));
    panel.classList.toggle('hidden', !isExpanded);
    toggle.closest('.hunter-profile')?.classList.toggle('hunt-expanded', isExpanded);
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
    return updateHUD(this);
  }


  #updateReticle() {
    return updateReticle(this);
  }

  #drawMinimap() {
    return drawMinimap(this);
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
    const playerLevel = this.game.player?.level ?? 1;
    const threat = zoneThreat(playerLevel, zone);
    toast.querySelector('strong').textContent = zone.name;
    toast.querySelector('span').textContent = zoneToastDetail(zone, playerLevel);
    toast.dataset.threat = threat.id;
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    // Once per zone visit: lethal soft warning (Hunt only).
    if (this.game.mode === 'hunt' && threat.id === 'lethal') {
      this.notify('This hunting ground far exceeds your level.', 'danger', 4.2);
    }
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
    return renderInventory(this);
  }

  #renderSkills() {
    return renderSkills(this);
  }

  #renderHunter() {
    return renderHunter(this);
  }

  #renderSystem() {
    return renderSystem(this);
  }

  #handlePanelAction(event) {
    return handlePanelAction(this, event);
  }

  showDeath() {
    showDeathPanel(this);
  }

  setDeathProgress(ratio) {
    setDeathProgressPanel(this, ratio);
  }

  hideDeath() {
    hideDeathPanel(this);
  }

  setDebugVisible(visible) {
    setDebugVisiblePanel(this, visible);
  }

  updateDebug(snapshot = {}) {
    updateDebugPanel(this, snapshot);
  }

  fatal(error) {
    this.elements['loading-screen'].classList.remove('active');
    this.elements['title-screen'].classList.remove('active');
    this.elements['fatal-error'].classList.remove('hidden');
    this.elements['fatal-error'].querySelector('p').textContent = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
  }
}
