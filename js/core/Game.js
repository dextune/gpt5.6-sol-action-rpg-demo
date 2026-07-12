import * as THREE from 'three';
import { DEFENSE_CONFIG, GAME_CONFIG } from '../config.js';
import { SKILLS, getClassActiveSkills, getClassSkillIds, skillKeyCode } from '../data/content.js';
import { clamp, randInt } from './Utils.js';
import { Input } from './Input.js';
import { SaveManager } from './SaveManager.js';
import { AudioManager } from './AudioManager.js';
import { AssetManager } from '../assets/AssetManager.js';
import { RenderPipeline, QUALITY_PRESETS } from '../graphics/RenderPipeline.js';
import { LightingSystem } from '../graphics/LightingSystem.js';
import { OutlineSystem } from '../graphics/OutlineSystem.js';
import { CharacterFactory } from '../characters/CharacterFactory.js';
import { MonsterFactory } from '../characters/MonsterFactory.js';
import { World } from '../world/World.js';
import { Player } from '../entities/Player.js';
import { Effects } from '../graphics/Effects.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { EnemySystem } from '../systems/EnemySystem.js';
import { LootSystem } from '../systems/LootSystem.js';
import { XpGemSystem } from '../systems/XpGemSystem.js';
import { HuntSystem } from '../systems/HuntSystem.js';
import { DefenseSystem } from '../systems/DefenseSystem.js';
import { UI } from '../ui/UI.js';
import { TouchControls } from '../ui/TouchControls.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const TMP_FORWARD = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_MOVE = new THREE.Vector3();
const TMP_TARGET = new THREE.Vector3();
const TMP_CAMERA = new THREE.Vector3();

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xc2d1bd);
    this.camera = new THREE.PerspectiveCamera(36, 1, .1, 620);
    this.camera.position.set(10, 10.5, 16);

    this.query = new URLSearchParams(window.location.search);
    const requestedQuality = this.query.get('quality') ?? localStorage.getItem('sol-arpg-quality') ?? 'medium';
    this.renderPipeline = new RenderPipeline(canvas, this.scene, this.camera, {
      quality: QUALITY_PRESETS[requestedQuality] ? requestedQuality : 'medium',
    });
    this.renderer = this.renderPipeline.renderer;
    this.quality = this.renderPipeline.quality;

    this.cameraTarget = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.aimPlane = new THREE.Plane(Y_AXIS, 0);
    this.aimPoint = new THREE.Vector3(0, 0, 3);

    this.input = new Input(canvas);
    this.save = new SaveManager();
    this.audio = new AudioManager();
    this.ui = new UI(this);
    this.touchControls = new TouchControls(this);

    this.state = 'loading';
    /** @type {'hunt' | 'defense'} */
    this.mode = 'hunt';
    this.defenseMeta = { bestWave: 0, runs: 0, lastWave: 0 };
    this.elapsed = 0;
    this.playTime = 0;
    this.delta = 0;
    this.autoSaveTimer = GAME_CONFIG.autoSaveSeconds;
    this.saveRequested = false;
    this.cameraYaw = .55;
    this.cameraDistance = GAME_CONFIG.cameraDistance;
    this.cameraShakeAmount = 0;
    this.cameraShakeTime = 0;
    this.hitStopTimer = 0;
    this.deathTimer = 0;
    this.deathDuration = 3.4;
    this.deferred = [];
    this.titleTime = 0;
    this.loopStarted = false;
    this.loopRunning = false;
    this.frameHandle = 0;
    this.debugVisible = this.query.get('debug') === '1';
    this.debugTimer = 0;
    this.clock = new THREE.Clock();

    this.#resize();
    window.addEventListener('resize', () => this.#resize());
    window.visualViewport?.addEventListener('resize', () => this.#resize());
    window.addEventListener('keydown', event => {
      if (event.code === 'F3') {
        event.preventDefault();
        this.debugVisible = !this.debugVisible;
        this.ui.setDebugVisible(this.debugVisible);
      }
    });
    const flushSave = () => {
      if (this.state === 'playing' || this.state === 'paused') this.saveGame(false);
    };
    window.addEventListener('beforeunload', flushSave);
    // Mobile Safari often skips beforeunload; pagehide is the reliable flush.
    window.addEventListener('pagehide', flushSave);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flushSave();
    });
  }

  async initialize() {
    this.ui.setLoading(.04, 'Preparing render pipeline and lighting…');
    await new Promise(resolve => requestAnimationFrame(resolve));

    this.lighting = new LightingSystem(this.scene, this.quality);
    this.outlineSystem = new OutlineSystem();
    this.assets = new AssetManager(this.renderer, { quality: this.quality });
    await this.assets.initialize();

    const modelKeys = Object.keys(this.assets.manifest.models);
    const textureKeys = Object.keys(this.assets.manifest.textures);
    this.ui.setLoading(.08, 'Loading rigged models and PBR textures…');
    await this.assets.preload(modelKeys, textureKeys, progress => {
      const ratio = .08 + progress.ratio * .68;
      this.ui.setLoading(ratio, `Local asset ${progress.loaded}/${progress.total} · ${progress.label}`);
    }, this.quality === 'high' ? 6 : 8);

    this.ui.setLoading(.79, 'Placing diorama terrain and environment objects…');
    await new Promise(resolve => requestAnimationFrame(resolve));
    this.characterFactory = new CharacterFactory(this.assets, this.outlineSystem);
    this.monsterFactory = new MonsterFactory(this.assets, this.outlineSystem);
    this.effects = new Effects(this.scene, this.assets, this.quality);
    this.world = new World(this.scene, this.assets, this.quality);

    this.ui.setLoading(.9, 'Wiring skeletal characters and hunt systems…');
    await new Promise(resolve => requestAnimationFrame(resolve));
    this.player = new Player(this.scene, this.characterFactory, this.quality);
    this.hunt = new HuntSystem(this);
    this.defense = new DefenseSystem(this);
    this.combat = new CombatSystem(this);
    this.loot = new LootSystem(this);
    this.xpGems = new XpGemSystem(this);
    this.enemies = new EnemySystem(this, this.monsterFactory, this.quality);
    this.killChain = 0;
    this.killChainTimer = 0;
    this.killChainInterval = 2.5;
    this._chainMilestones = new Set();
    this.multikillBuffer = [];
    this.multikillTimer = 0;
    this.multikillWindow = 0.35;
    this.world.resolvePosition(this.player.position, .48);
    this.#snapCamera();
    this.#loadDefenseMeta();

    this.renderer.compile(this.scene, this.camera);
    this.ui.setLoading(1, 'High-quality hunting ground ready');
    await new Promise(resolve => setTimeout(resolve, 180));
    this.state = 'title';
    this.mode = 'hunt';
    this.ui.showTitle();
    this.ui.setDebugVisible(this.debugVisible);
    this.startLoop();
    if (this.query.get('autostart') === '1') setTimeout(() => this.newGame(), 100);
  }

  startLoop() {
    if (this.loopStarted) return;
    this.loopStarted = true;
    this.resumeRenderLoop();
  }

  resumeRenderLoop() {
    if (this.loopRunning) return;
    this.loopRunning = true;
    this.clock.start();
    this.clock.getDelta();
    this.frameHandle = requestAnimationFrame(() => this.#frame());
  }

  pauseRenderLoop() {
    this.loopRunning = false;
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }

  renderSingleFrame(delta = 1 / 60) {
    if (!this.player || !this.world) return this.renderPipeline.render(this.scene, this.camera, delta);
    this.#updateCamera(delta);
    this.lighting?.update(delta, this.player.position, this.world.currentZone);
    this.outlineSystem?.update(this.camera);
    this.renderPipeline.setFocusDistance(this.camera.position.distanceTo(this.player.position));
    return this.renderPipeline.render(this.scene, this.camera, delta);
  }

  #frame() {
    if (!this.loopRunning) return;
    const rawDelta = this.clock.getDelta();
    const frameDelta = Math.min(GAME_CONFIG.maxDelta, Math.max(0, rawDelta));
    this.elapsed += frameDelta;
    // No hit-stop freeze — freezes made the whole view feel like it was shaking.
    this.hitStopTimer = 0;
    const simulationDelta = frameDelta;
    this.delta = simulationDelta;

    if (this.state === 'title') this.#updateTitle(frameDelta);
    else if (this.state === 'playing') this.#updatePlaying(simulationDelta);
    else if (this.state === 'dead') this.#updateDead(simulationDelta);
    else if (this.state === 'paused') this.#updatePaused(frameDelta);

    this.#updateCamera(frameDelta);
    this.ui.update(frameDelta);
    this.lighting?.update(frameDelta, this.player?.position, this.world?.currentZone);
    this.outlineSystem?.update(this.camera);
    if (this.player) this.renderPipeline.setFocusDistance(this.camera.position.distanceTo(this.player.position));
    this.renderPipeline.render(this.scene, this.camera, frameDelta);
    this.renderPipeline.monitorFrame(rawDelta);
    this.#updateDebugHUD(frameDelta);
    this.input.endFrame();
    this.frameHandle = requestAnimationFrame(() => this.#frame());
  }

  #updateTitle(delta) {
    this.titleTime += delta;
    this.player.setMoveDirection(TMP_MOVE.set(0, 0, 0));
    this.player.update(delta, this);
    this.world.update(delta, this);
    this.effects.update(delta);
    const focus = TMP_TARGET.copy(this.player.position).add(new THREE.Vector3(0, 1.65, 1.1));
    const orbit = .55 + Math.sin(this.titleTime * .075) * .08;
    const distance = 18.5;
    this.camera.position.set(
      this.player.position.x + Math.sin(orbit) * distance,
      this.player.position.y + 12.2,
      this.player.position.z + Math.cos(orbit) * distance + 2.8,
    );
    this.camera.lookAt(focus);
    this.aimPoint.copy(this.player.position).addScaledVector(this.player.facing, 3);
  }

  /** Replace the title-screen character without resetting an active Hunt or Defense run. */
  previewHeroClass(classId) {
    if (this.state !== 'title' || !this.player) return this.player?.classId;
    return this.player.setClass(classId, { keepTransform: true });
  }

  #updatePlaying(delta) {
    this.playTime += delta;
    this.#handleMenus();
    if (this.state !== 'playing') return;
    this.#handleInput(delta);
    this.#updateAim();
    this.#updateDeferred(delta);

    this.player.update(delta, this);
    if (this.mode === 'defense') this.defense.update(delta);
    else this.hunt.update(delta);
    this.enemies.update(delta);
    this.combat.update(delta);
    this.loot.update(delta);
    this.xpGems?.update(delta);
    this.#updateKillFeedback(delta);
    this.effects.update(delta);
    this.world.update(delta, this);

    if (!this.player.alive) this.handlePlayerDeath();
    // Hunt only: never autosave Defense run into Hunt continue blob.
    if (this.mode === 'hunt') {
      this.autoSaveTimer -= delta;
      if (this.autoSaveTimer <= 0 || this.saveRequested) {
        this.saveGame(false);
        this.autoSaveTimer = GAME_CONFIG.autoSaveSeconds;
        this.saveRequested = false;
      }
    }
  }

  #updatePaused(delta) {
    this.#handleMenus();
    this.world.update(delta * .22, this);
    this.effects.update(delta * .15);
    this.#updateAim();
  }

  #updateDead(delta) {
    this.deathTimer -= delta;
    this.ui.setDeathProgress(this.deathTimer / this.deathDuration);
    this.world.update(delta, this);
    this.effects.update(delta);
    // Soft residual sim only — combat was cleared on death; avoid re-spawning attack FX.
    this.enemies.update(delta * .35);
    this.loot.update(delta);
    this.xpGems?.update(delta);
    if (this.deathTimer <= 0) {
      if (this.mode === 'defense') this.#endDefenseRun();
      else this.#respawn();
    }
  }

  #handleMenus() {
    if (this.state === 'paused') {
      if (this.input.consume('Escape')) this.ui.closePanel();
      else if (this.input.consume('KeyI')) this.ui.openPanel('inventory');
      else if (this.input.consume('KeyK')) this.ui.openPanel('skills');
      else if (this.input.consume('Tab')) this.ui.openPanel('hunter');
      return;
    }
    if (this.input.consume('KeyI')) this.ui.openPanel('inventory');
    else if (this.input.consume('KeyK')) this.ui.openPanel('skills');
    else if (this.input.consume('Tab')) this.ui.openPanel('hunter');
    else if (this.input.consume('Escape')) this.ui.openPanel('pause');
  }

  #handleInput(delta) {
    TMP_FORWARD.copy(this.player.position).sub(this.camera.position).setY(0).normalize();
    TMP_RIGHT.crossVectors(TMP_FORWARD, Y_AXIS).normalize();

    // Virtual stick (mobile) preferred when active; else WASD / arrows.
    if (this.input.hasVirtualMove?.()) {
      const { x, y } = this.input.virtualAxes;
      TMP_MOVE.set(0, 0, 0).addScaledVector(TMP_FORWARD, y).addScaledVector(TMP_RIGHT, x);
    } else {
      const forwardAmount = (this.input.isDown('KeyW') || this.input.isDown('ArrowUp') ? 1 : 0)
        - (this.input.isDown('KeyS') || this.input.isDown('ArrowDown') ? 1 : 0);
      const rightAmount = (this.input.isDown('KeyD') || this.input.isDown('ArrowRight') ? 1 : 0)
        - (this.input.isDown('KeyA') || this.input.isDown('ArrowLeft') ? 1 : 0);
      TMP_MOVE.set(0, 0, 0).addScaledVector(TMP_FORWARD, forwardAmount).addScaledVector(TMP_RIGHT, rightAmount);
    }
    if (TMP_MOVE.lengthSq() > 1) TMP_MOVE.normalize();
    this.player.setMoveDirection(TMP_MOVE);

    // Combat: keyboard and virtual touch buttons (same codes). Mouse LMB remains UI-only.
    if (this.input.isDown('KeyJ')) this.player.tryAttack(this);
    if (this.input.consume('Space')) this.player.tryDash(this);
    this.#tryClassSkillKeys();
    if (this.input.consumeAny('Digit1', 'Numpad1')) this.player.usePotion(this);

    const cameraDirection = (this.input.isDown('KeyX') ? 1 : 0) - (this.input.isDown('KeyZ') ? 1 : 0);
    this.cameraYaw += cameraDirection * delta * 1.25;
    // Optional camera orbit with middle mouse — not used for attack/aim.
    if (this.input.isMouseDown(1)) {
      const pointerDelta = this.input.consumePointerDelta();
      this.cameraYaw -= pointerDelta.x * .0055;
    }
    // Mobile: one-finger drag on canvas orbits camera; pinch zooms.
    const lookDx = this.input.consumeLookDelta?.() ?? 0;
    if (lookDx) this.cameraYaw -= lookDx * .0048;
    const pinch = this.input.consumePinchZoom?.() ?? 0;
    if (pinch) {
      this.cameraDistance = clamp(
        this.cameraDistance + pinch,
        GAME_CONFIG.cameraMinDistance,
        GAME_CONFIG.cameraMaxDistance,
      );
    }
    const wheel = this.input.consumeWheel();
    if (wheel) {
      // Scroll up = zoom in, scroll down = zoom out (larger steps feel better over a wide range).
      const step = Math.abs(wheel) > 1 ? wheel * 1.65 : wheel * 1.85;
      this.cameraDistance = clamp(
        this.cameraDistance + step,
        GAME_CONFIG.cameraMinDistance,
        GAME_CONFIG.cameraMaxDistance,
      );
    }
  }

  #updateAim() {
    this.raycaster.setFromCamera(this.input.pointer, this.camera);
    this.aimPlane.constant = -(this.player.position.y + .12);
    if (!this.raycaster.ray.intersectPlane(this.aimPlane, this.aimPoint)) {
      this.aimPoint.copy(this.player.position).addScaledVector(this.player.facing, 5);
    }
    const planar = Math.hypot(this.aimPoint.x, this.aimPoint.z);
    if (planar > GAME_CONFIG.worldRadius - 2) {
      this.aimPoint.x *= (GAME_CONFIG.worldRadius - 2) / planar;
      this.aimPoint.z *= (GAME_CONFIG.worldRadius - 2) / planar;
    }
    this.aimPoint.y = this.world.heightAt(this.aimPoint.x, this.aimPoint.z);
  }

  #cameraOffsetHeight(distance = this.cameraDistance) {
    const lift = (distance - GAME_CONFIG.cameraDistance) * (GAME_CONFIG.cameraHeightPerDistance ?? .42);
    return GAME_CONFIG.cameraHeight + lift;
  }

  #updateCamera(delta) {
    if (this.state === 'title' || !this.player || !this.world) return;
    const distance = this.cameraDistance;
    // Orbit is driven only by cameraYaw + player position — never by body facing.
    // Looking along facing made 180° turns pan the whole frame as if the camera translated.
    TMP_CAMERA.set(
      Math.sin(this.cameraYaw) * distance,
      this.#cameraOffsetHeight(distance),
      Math.cos(this.cameraYaw) * distance,
    ).add(this.player.position);
    const terrainY = this.world.heightAt(TMP_CAMERA.x, TMP_CAMERA.z);
    TMP_CAMERA.y = Math.max(TMP_CAMERA.y, terrainY + 3.1);
    const positionLerp = 1 - Math.exp(-7.4 * delta);
    this.camera.position.lerp(TMP_CAMERA, positionLerp);
    this.cameraTarget.copy(this.player.position)
      .add(TMP_TARGET.set(0, GAME_CONFIG.cameraLookHeight, 0));

    // Camera shake intentionally disabled — keep framing stable during combat.
    this.cameraShakeTime = 0;
    this.cameraShakeAmount = 0;
    this.camera.lookAt(this.cameraTarget);
  }

  #snapCamera() {
    TMP_CAMERA.set(
      Math.sin(this.cameraYaw) * this.cameraDistance,
      this.#cameraOffsetHeight(this.cameraDistance),
      Math.cos(this.cameraYaw) * this.cameraDistance,
    ).add(this.player.position);
    this.camera.position.copy(TMP_CAMERA);
    this.cameraTarget.copy(this.player.position)
      .add(TMP_TARGET.set(0, GAME_CONFIG.cameraLookHeight, 0));
    this.camera.lookAt(this.cameraTarget);
  }

  #updateDeferred(delta) {
    for (let i = this.deferred.length - 1; i >= 0; i -= 1) {
      const action = this.deferred[i];
      action.time -= delta;
      if (action.time > 0) continue;
      this.deferred.splice(i, 1);
      try { action.callback(); } catch (error) { console.error('Deferred action failed:', error); }
    }
  }

  defer(time, callback) {
    this.deferred.push({ time, callback });
  }

  /** Bind Q/E/R/C (or skill.key) to the active class skill list — not hardcoded hunter ids. */
  #tryClassSkillKeys() {
    for (const skill of getClassActiveSkills(this.player.classId)) {
      const code = skillKeyCode(skill.key);
      if (code && this.input.consume(code)) this.player.trySkill(skill.id, this);
    }
  }

  newGame(options = {}) {
    const classId = options.classId ?? this.ui?.selectedClassId ?? this.query.get('class');
    this.#clearRun();
    this.mode = 'hunt';
    this.defense.reset();
    this.player.reset(classId);
    this.hunt.reset();
    this.playTime = 0;
    this.autoSaveTimer = GAME_CONFIG.autoSaveSeconds;
    this.saveRequested = false;
    this.cameraYaw = .55;
    this.cameraDistance = GAME_CONFIG.cameraDistance;
    this.world.resolvePosition(this.player.position, .48);
    this.state = 'playing';
    this.ui.showHUD();
    this.#snapCamera();
    this.enemies.populate(52);
    const heroName = this.player.name;
    this.ui.notify(`Hunt started · ${heroName} enters the field.`, 'contract', 4.5);
    // Immediate localStorage write so Continue is available even if the tab closes early.
    this.saveGame(false);
  }

  /** Endless wave arena — separate entry from Hunt; does not write Hunt continue saves mid-run. */
  startDefense(options = {}) {
    const classId = options.classId ?? this.ui?.selectedClassId ?? this.query.get('class');
    this.#clearRun();
    this.mode = 'defense';
    this.defense.reset();
    this.player.reset(classId);
    this.#bootstrapDefenseHero();
    this.hunt.reset();
    this.playTime = 0;
    this.autoSaveTimer = GAME_CONFIG.autoSaveSeconds;
    this.cameraYaw = .55;
    this.cameraDistance = GAME_CONFIG.cameraDistance;
    this.player.position.set(...GAME_CONFIG.respawnPosition);
    this.world.resolvePosition(this.player.position, .48);
    this.state = 'playing';
    this.ui.showHUD();
    this.#snapCamera();
    this.defense.start();
    const best = this.defenseMeta?.bestWave ?? 0;
    this.ui.notify(
      best > 0
        ? `Defense · Best ${best} · Climb to wave ${DEFENSE_CONFIG.maxWave}`
        : `Defense · Survive to wave ${DEFENSE_CONFIG.maxWave}`,
      'contract',
      4.2,
    );
  }

  /**
   * Defense-only opener: pad level, potions, skill points, and unlock early actives.
   * Never called from Hunt paths.
   */
  #bootstrapDefenseHero() {
    const cfg = DEFENSE_CONFIG;
    const player = this.player;
    const targetLevel = Math.max(1, cfg.startLevel ?? 3);
    // Feed exact XP needed so unlockLevel actives auto-grant via addXp.
    let guard = 40;
    while (player.level < targetLevel && guard-- > 0) {
      player.addXp(Math.max(1, player.xpNeeded - player.xp + 1));
    }
    player.skillPoints += Math.max(0, cfg.startSkillPoints ?? 0);
    player.potions = Math.max(player.potions, cfg.startPotions ?? 5);
    player.maxPotions = Math.max(player.maxPotions, 6);
    // Starter uncommon kit so wave 1 is not naked-blade only.
    if (this.loot?.generateGear) {
      for (const slot of ['armor', 'charm']) {
        const gear = this.loot.generateGear(player.level + 1, {
          slot, floor: 'uncommon', powerScale: 1.08,
        });
        player.addGear?.(gear);
      }
      const weapon = this.loot.generateGear(player.level + 2, {
        slot: 'weapon', floor: 'uncommon', powerScale: 1.12,
      });
      player.addGear?.(weapon);
    }
    player.hp = player.maxHp;
    player.mp = player.maxMp;
    player.energy = 40;
    player.invalidateStats();
  }

  /** Wave 200 clear — end run with victory meta, return to title. */
  handleDefenseVictory() {
    if (this.mode !== 'defense') return;
    this.#persistDefenseMeta(true);
    const wave = DEFENSE_CONFIG.maxWave;
    const best = Math.max(wave, this.defenseMeta?.bestWave ?? 0);
    this.ui.notify(`Victory · Wave ${wave} conquered · Best ${best}`, 'legendary', 5.5);
    this.effects?.pillar?.(this.player.position, 0xffc45c, 16, { life: 1.8, bottom: 2.4, opacity: .6 });
    this.effects?.ring?.(this.player.position, 0xffe38a, 12, { life: 1.6, startScale: .05 });
    this.audio?.legendary?.();
    this.#clearRun();
    this.mode = 'hunt';
    this.defense.reset();
    this.player.reset();
    this.world.resolvePosition(this.player.position, .48);
    this.state = 'title';
    this.ui.hideDeath();
    this.ui.showTitle();
  }

  continueGame() {
    const data = this.save.load();
    if (!data?.player) {
      this.ui.notify('No valid save found in browser storage.', 'danger', 3.5);
      this.ui.showTitle();
      return false;
    }
    try {
      this.#clearRun();
      this.mode = 'hunt';
      this.defense.reset();
      this.player.load(data.player, this.world);
      this.hunt.load(data.hunt ?? {});
      this.defenseMeta = { bestWave: 0, lastWave: 0, runs: 0 };
      if (data.defenseMeta) this.#mergeDefenseMeta(data.defenseMeta, false);
      this.playTime = Math.max(0, Number(data.playTime) || 0);
      this.cameraYaw = Number.isFinite(Number(data.cameraYaw)) ? Number(data.cameraYaw) : .55;
      this.cameraDistance = clamp(
        Number(data.cameraDistance) || GAME_CONFIG.cameraDistance,
        GAME_CONFIG.cameraMinDistance,
        GAME_CONFIG.cameraMaxDistance,
      );
      this.autoSaveTimer = GAME_CONFIG.autoSaveSeconds;
      this.saveRequested = false;
      this.state = 'playing';
      if (this.ui) this.ui.selectedClassId = this.player.classId;
      this.ui.showHUD();
      this.#snapCamera();
      this.enemies.populate(52);
      // Re-write current schema so Continue stays durable after version upgrades.
      this.saveGame(false);
      this.ui.notify(
        `Hunt resumed · ${this.player.name} · Lv.${this.player.level} · ${this.hunt.hunterTitle}`,
        'contract',
        3.8,
      );
      return true;
    } catch (error) {
      console.error('[continueGame] failed', error);
      this.ui.notify('Could not load save. Try New Hunt or clear site data.', 'danger', 4.5);
      this.state = 'title';
      this.ui.showTitle();
      return false;
    }
  }

  #clearRun() {
    this.combat?.clear();
    this.enemies?.clear();
    this.loot?.clear();
    this.xpGems?.clear();
    this.effects?.clear();
    this.deferred.length = 0;
    this.killChain = 0;
    this.killChainTimer = 0;
    this._chainMilestones?.clear?.();
    this.multikillBuffer = [];
    this.multikillTimer = 0;
    this.#applyKillChainMods(false);
    this.ui.hideDeath();
    this.saveRequested = false;
  }

  setPaused(paused) {
    if (paused && this.state === 'playing') this.state = 'paused';
    else if (!paused && this.state === 'paused') {
      this.state = 'playing';
      this.clock.getDelta();
    }
  }

  returnToTitle() {
    if (this.state !== 'title') {
      if (this.mode === 'defense') {
        // Abandon mid-run from pause menu; death path already persisted in #endDefenseRun.
        if (this.defense?.phase !== 'failed' && this.defense?.phase !== 'idle') {
          this.#persistDefenseMeta(true);
        }
      } else {
        this.saveGame(false);
      }
    }
    this.#clearRun();
    this.mode = 'hunt';
    this.defense.reset();
    this.player.reset();
    this.world.resolvePosition(this.player.position, .48);
    this.state = 'title';
    this.ui.showTitle();
  }

  handlePlayerDeath() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deathTimer = this.mode === 'defense' ? 2.8 : this.deathDuration;
    this.player.setMoveDirection(TMP_MOVE.set(0, 0, 0));
    if (this.mode === 'defense') this.defense.fail();
    else this.saveGame(false);
    this.ui.showDeath();
    this.combat.clear();
  }

  #endDefenseRun() {
    this.#persistDefenseMeta(true);
    const wave = Math.max(1, this.defense?.bestWaveThisRun || this.defense?.wave || 1);
    const best = this.defenseMeta?.bestWave ?? wave;
    this.ui.notify(`Defense ended · Wave ${wave} · Best ${best}`, 'danger', 4.5);
    this.#clearRun();
    this.mode = 'hunt';
    this.defense.reset();
    this.player.reset();
    this.world.resolvePosition(this.player.position, .48);
    this.state = 'title';
    this.ui.hideDeath();
    this.ui.showTitle();
  }

  #respawn() {
    const penalty = Math.floor(this.player.gold * .04);
    this.player.gold = Math.max(0, this.player.gold - penalty);
    this.player.position.set(...GAME_CONFIG.respawnPosition);
    this.world.resolvePosition(this.player.position, .48);
    this.player.restore();
    this.enemies.clear();
    this.combat.clear();
    this.xpGems?.clear();
    this.killChain = 0;
    this.killChainTimer = 0;
    this.multikillBuffer = [];
    this.multikillTimer = 0;
    this.#applyKillChainMods(false);
    this.state = 'playing';
    this.ui.hideDeath();
    this.#snapCamera();
    this.enemies.populate(40);
    this.ui.notify(penalty > 0 ? `Revived at hub · Repair cost ${penalty}G` : 'Revived at hub.', 'danger', 3.8);
    this.requestSave();
  }

  onEnemyKilled(enemy) {
    if (enemy.deathHandled) return;
    enemy.deathHandled = true;

    // Gold still grants immediately; XP is deferred to floor gems.
    const [minGold, maxGold] = enemy.goldRange;
    const goldRaw = randInt(minGold, maxGold) * (enemy.elite ? 2.2 : 1) * (enemy.boss ? 5 : 1);
    const gold = this.player.addGold(goldRaw);
    if (this.mode === 'defense') this.defense.onKill(enemy);
    else this.hunt.onKill(enemy);
    this.loot.dropFromEnemy(enemy);
    this.xpGems?.spawnFromKill(enemy);

    const position = enemy.position.clone().add(new THREE.Vector3(0, Math.max(.7, enemy.refs.modelHeight * .45), 0));
    if (gold > 0) this.ui.floatText(position, `+${gold}G`, 'heal');

    // Kill chain (2.5s window) — shared HUD counter for hunt + defense.
    if (this.killChainTimer > 0) this.killChain += 1;
    else this.killChain = 1;
    this.killChainTimer = this.killChainInterval;
    this.#applyKillChainMods(this.killChain >= 10);
    this.#checkChainMilestones();

    // Multikill buffer: suppress individual death bursts until window resolves.
    this.multikillBuffer.push({
      position: position.clone(),
      ground: enemy.position.clone(),
      accent: enemy.data?.accent ?? 0xeaf7d7,
      elite: enemy.elite,
      boss: enemy.boss,
      color: enemy.boss ? (enemy.data?.accent ?? 0xffd66b) : enemy.elite ? 0xffd66b : 0xeaf7d7,
    });
    this.multikillTimer = this.multikillWindow;

    if (enemy.overkill) {
      this.ui.floatText(position.clone().add(new THREE.Vector3(0, 0.4, 0)), 'OVERKILL', 'overkill');
    }
    if (enemy.elite) this.ui.notify(`Elite slain · ${enemy.data.name}`, 'uncommon', 2.8);
    if (enemy.boss) {
      this.effects.pillar(enemy.position, enemy.data.accent, 14, { life: 1.55, bottom: 2.2 });
      this.effects.ring(enemy.position, enemy.data.accent, 10, { life: 1.4, startScale: .06 });
      this.ui.notify(`Boss defeated · ${enemy.data.name}`, 'boss', 5);
    }

    if (this.mode === 'hunt') this.requestSave();
  }

  /** Level-ups from XP gem collection (mirrors former onEnemyKilled XP path). */
  onXpLevelUps(levelUps = []) {
    for (const level of levelUps) {
      this.audio.levelUp();
      this.effects.pillar(this.player.position, 0xffe38a, 8, { life: .9, bottom: 1.25 });
      this.effects.ring(this.player.position, 0xffe38a, 5.5, { life: .85, startScale: .05 });
      this.ui.notify(`LEVEL UP · Lv.${level} · Skill Point +1`, 'level', 4.4);
      for (const id of getClassSkillIds(this.player.classId)) {
        const skill = SKILLS[id];
        if (skill && !skill.passive && skill.unlockLevel === level) {
          this.ui.notify(`New skill unlocked · ${skill.name} [${skill.key}]`, 'level', 4.2);
        }
      }
    }
    if (this.mode === 'hunt' && levelUps.length) this.requestSave();
  }

  #updateKillFeedback(delta) {
    if (this.killChainTimer > 0) {
      this.killChainTimer -= delta;
      if (this.killChainTimer <= 0) {
        this.killChain = 0;
        this._chainMilestones?.clear?.();
        this.#applyKillChainMods(false);
      }
    }
    if (this.multikillTimer > 0) {
      this.multikillTimer -= delta;
      if (this.multikillTimer <= 0) this.#flushMultikill();
    }
  }

  #flushMultikill() {
    const kills = this.multikillBuffer;
    this.multikillBuffer = [];
    this.multikillTimer = 0;
    if (!kills.length) return;

    const defensePop = this.mode === 'defense' ? 1.35 : 1;
    if (kills.length >= 3) {
      const centroid = new THREE.Vector3();
      for (const k of kills) centroid.add(k.ground);
      centroid.multiplyScalar(1 / kills.length);
      const label = kills.length >= 6 ? 'MASSACRE!' : kills.length >= 4 ? 'QUAD!' : 'TRIPLE!';
      this.effects.starburst(centroid.clone().add(new THREE.Vector3(0, 1.1, 0)), 0xffe38a, 4.2 + kills.length * 0.15, {
        life: 0.35, opacity: 0.9,
      });
      this.effects.ring(centroid, 0xffd66b, 4.5 + kills.length * 0.35, {
        life: 0.55, startScale: 0.08, opacity: 0.9,
      });
      this.effects.ring(centroid, 0xfff2c4, 2.8 + kills.length * 0.2, {
        life: 0.32, startScale: 0.15, height: 0.08, opacity: 0.75,
      });
      this.effects.burst(centroid.clone().add(new THREE.Vector3(0, 1, 0)), 0xffe38a, Math.round(28 * defensePop + kills.length * 4), {
        speed: 6.5, size: 0.38, life: 0.75, upward: 0.55,
      });
      this.ui.floatText(centroid.clone().add(new THREE.Vector3(0, 1.6, 0)), label, 'multikill');
      this.audio?.killSting?.(this.killChain);
      // Still show light elite/boss accent pops at each site without full individual bursts.
      for (const k of kills) {
        if (k.boss || k.elite) {
          this.effects.burst(k.position, k.color, k.boss ? 18 : 10, {
            speed: 4, size: 0.28, life: 0.5,
          });
        }
      }
      return;
    }

    for (const k of kills) this.#individualKillBurst(k, defensePop);
  }

  #individualKillBurst(k, defensePop = 1) {
    const burstCount = Math.round((k.boss ? 46 : k.elite ? 22 : 12) * defensePop);
    this.effects.burst(k.position, k.color, burstCount, {
      speed: (k.boss ? 7.5 : 4.4) * (this.mode === 'defense' ? 1.12 : 1),
      size: (k.boss ? .55 : .3) * (this.mode === 'defense' ? 1.1 : 1),
      life: k.boss ? 1.2 : .62,
    });
    if (this.mode === 'defense' && (k.elite || k.boss)) {
      this.effects.ring(k.ground, k.accent ?? 0xffd36d, k.boss ? 7 : 3.4, {
        life: k.boss ? 1.1 : .55, startScale: .08,
      });
    }
  }

  #checkChainMilestones() {
    const chain = this.killChain;
    for (const mark of [25, 50, 100]) {
      if (chain >= mark && !this._chainMilestones.has(mark)) {
        this._chainMilestones.add(mark);
        this.ui.notify(`${mark} KILL CHAIN!`, mark >= 100 ? 'boss' : 'level', 3.6);
        this.audio?.killSting?.(mark);
        this.effects?.ring?.(this.player.position, 0xffe38a, 3.5 + mark * 0.02, {
          life: 0.55, startScale: 0.1,
        });
      }
    }
  }

  #applyKillChainMods(active) {
    const mods = this.player?.runMods;
    if (!mods) return;
    if (active) {
      mods.moveSpeed = 0.06;
      mods.killChainXp = 0.10;
    } else {
      mods.moveSpeed = 0;
      mods.killChainXp = 0;
    }
  }

  requestSave() {
    if (this.mode === 'defense') return;
    this.saveRequested = true;
  }

  saveGame(showFailure = false) {
    // Never serialize a Defense run as Hunt continue progress.
    if (this.mode === 'defense') return false;
    if (!this.player || !this.hunt || this.state === 'title' || this.state === 'loading') return false;
    const success = this.save.save({
      player: this.player.serialize(),
      hunt: this.hunt.serialize(),
      playTime: this.playTime,
      cameraYaw: this.cameraYaw,
      cameraDistance: this.cameraDistance,
      defenseMeta: this.defenseMeta,
    });
    if (!success && showFailure) {
      this.ui.notify('Could not write save to browser localStorage.', 'danger', 4);
    }
    return success;
  }

  #loadDefenseMeta() {
    const data = this.save.load();
    if (data?.defenseMeta) this.#mergeDefenseMeta(data.defenseMeta, false);
  }

  #mergeDefenseMeta(meta = {}, incrementRuns = false) {
    const bestWave = Math.max(0, Number(this.defenseMeta.bestWave) || 0, Number(meta.bestWave) || 0);
    const lastWave = Math.max(0, Number(meta.lastWave) || 0, Number(this.defenseMeta.lastWave) || 0);
    const runs = Math.max(0, Number(this.defenseMeta.runs) || 0, Number(meta.runs) || 0)
      + (incrementRuns ? 0 : 0);
    this.defenseMeta = {
      bestWave,
      lastWave,
      runs: incrementRuns ? runs + 1 : runs,
    };
  }

  /** Update best-wave meta without writing Defense player into Hunt blob. */
  #persistDefenseMeta(incrementRuns = false) {
    const run = this.defense?.serializeMeta?.() ?? { bestWave: 0, lastWave: 0 };
    const next = {
      bestWave: Math.max(
        Number(this.defenseMeta.bestWave) || 0,
        Number(run.bestWave) || 0,
        Number(run.lastWave) || 0,
      ),
      lastWave: Math.max(Number(run.lastWave) || 0, Number(run.bestWave) || 0),
      runs: (Number(this.defenseMeta.runs) || 0) + (incrementRuns ? 1 : 0),
    };
    this.defenseMeta = next;

    const existing = this.save.load();
    if (!existing?.player) return false;
    return this.save.save({
      player: existing.player,
      hunt: existing.hunt,
      playTime: existing.playTime,
      cameraYaw: existing.cameraYaw,
      cameraDistance: existing.cameraDistance,
      defenseMeta: next,
    });
  }

  shake(_amount = .2, _duration = .2) {
    // Disabled: user requested a completely stable camera during combat.
    this.cameraShakeAmount = 0;
    this.cameraShakeTime = 0;
  }

  setQuality(quality) {
    if (!QUALITY_PRESETS[quality] || quality === this.quality) return false;
    this.quality = quality;
    this.renderPipeline.setQuality(quality);
    this.assets?.setQuality(quality);
    this.lighting?.applyQuality(quality);
    this.effects?.setQuality?.(quality);
    this.ui.notify(`Graphics quality: ${QUALITY_PRESETS[quality].label}`, 'loot', 2.4);
    return true;
  }

  hitStop(_duration = .045) {
    // Disabled: freeze-frames made the screen feel like it was stuttering/shaking.
    this.hitStopTimer = 0;
  }

  getDebugSnapshot() {
    const stats = this.renderPipeline.stats;
    return {
      state: this.state,
      quality: this.quality,
      fps: Number(stats.fps || 0),
      calls: Number(stats.calls || 0),
      triangles: Number(stats.triangles || 0),
      geometries: Number(stats.geometries || 0),
      textures: Number(stats.textures || 0),
      renderScale: Number(stats.scale || 1),
      enemies: this.enemies?.enemies?.filter(enemy => enemy.alive).length ?? 0,
      assets: this.assets?.getStats?.() ?? null,
      player: this.player ? { level: this.player.level, hp: this.player.hp, x: this.player.position.x, z: this.player.position.z } : null,
    };
  }

  #updateDebugHUD(delta) {
    this.debugTimer -= delta;
    if (!this.debugVisible || this.debugTimer > 0) return;
    this.debugTimer = .25;
    this.ui.updateDebug(this.getDebugSnapshot());
  }

  #resize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.renderPipeline.resize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
