import * as THREE from 'three';
import { GAME_CONFIG } from '../config.js';
import { HERO_CLASSES, getClassActiveSkills, skillKeyCode } from '../data/content.js';
import { normalizeSkillRank } from '../data/skillCombat.js';
// Template package surface (physical boundary — also mapped as @sol/template-3d in index.html).
import {
  clamp,
  createGameContext,
  Input,
  AssetManager,
  RenderPipeline,
  QUALITY_PRESETS,
  LightingSystem,
  OutlineSystem,
} from '../../packages/template-3d/index.js';
import { SaveManager } from './SaveManager.js';
import { AudioManager } from './AudioManager.js';
import { CharacterFactory } from '../characters/CharacterFactory.js';
import { MonsterFactory } from '../characters/MonsterFactory.js';
import { createEnemyModel, createHeroModel } from '../graphics/ModelFactory.js';
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
import {
  continueSavedGame,
  endDefenseRun,
  handleDefenseVictory as handleDefenseVictoryMode,
  handlePlayerDeath as handlePlayerDeathMode,
  mergeDefenseMeta,
  respawnPlayer,
  returnGameToTitle,
  startDefenseMode,
  startNewGame,
} from './gameModes.js';
import {
  onEnemyKilled as onEnemyKilledFeedback,
  onXpLevelUps as onXpLevelUpsFeedback,
  updateKillFeedback,
} from './killFeedback.js';

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
    this.debugEnabled = this.query.get('debug') === '1';
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
    this.debugVisible = this.debugEnabled;
    this.debugTimer = 0;
    this.clock = new THREE.Clock();

    /**
     * Narrow system facade (live getters). Created before systems exist so
     * constructors can capture `game.ctx`. See architecture-template-boundary.md.
     */
    this.ctx = createGameContext(this);

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
    this.titleKeyLight = new THREE.DirectionalLight(0xdcecff, 1.15);
    this.titleKeyLight.name = 'TitleNeutralKey';
    this.titleKeyLight.castShadow = false;
    this.titleKeyLight.target.name = 'TitleNeutralKeyTarget';
    this.titleRimLight = new THREE.PointLight(0x8fcfff, 7.5, 13, 1.8);
    this.titleRimLight.name = 'TitleCoolRim';
    this.scene.add(this.titleKeyLight, this.titleKeyLight.target, this.titleRimLight);
    this.outlineSystem = new OutlineSystem();
    this.assets = new AssetManager(this.renderer, { quality: this.quality });
    // Never leave heroes/monsters as bare capsules when a GLB fails — use procedural kits.
    this.assets.createFallbackModel = (key, options = {}) => {
      if (typeof key === 'string' && key.startsWith('hero.')) {
        return createHeroModel();
      }
      if (typeof key === 'string' && key.startsWith('monster.')) {
        const archetype = key.slice('monster.'.length);
        const shapeFromArchetype = {
          slime: 'blob', hare: 'hare', boar: 'boar', wisp: 'wisp',
          humanoid: 'raider', colossus: 'colossus',
        };
        const shape = options.data?.shape ?? shapeFromArchetype[archetype] ?? 'blob';
        return createEnemyModel({
          id: options.data?.id ?? archetype,
          name: options.data?.name ?? archetype,
          shape,
          color: options.data?.color ?? 0x71816a,
          accent: options.data?.accent ?? 0xe3c771,
          scale: options.data?.scale ?? 1,
          boss: options.boss ?? options.data?.boss,
          zone: options.data?.zone,
        }, Boolean(options.elite || options.boss));
      }
      // Weapons/env/props: null → AssetManager minimal capsule path.
      return null;
    };
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
    this.snapCamera();
    this.#loadDefenseMeta();

    this.renderer.compile(this.scene, this.camera);
    this.ui.setLoading(1, 'High-quality hunting ground ready');
    await new Promise(resolve => setTimeout(resolve, 180));
    this.state = 'title';
    this.mode = 'hunt';
    this.ui.showTitle();
    this.ui.setDebugVisible(this.debugVisible);
    this.renderSingleFrame();
    window.__gameReady = true;
    this.startLoop();
    if (this.query.get('autostart') === '1') {
      setTimeout(() => {
        const mode = this.query.get('mode');
        if (mode === 'defense') this.startDefense();
        else this.newGame();
      }, 100);
    }
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
    if (this.world.decorator?.campfire) this.world.decorator.campfire.visible = false;
    this.titleKeyLight.visible = true;
    this.titleRimLight.visible = true;
    this.titleKeyLight.position.set(
      this.player.position.x + 5,
      this.player.position.y + 8,
      this.player.position.z + 6,
    );
    this.titleKeyLight.target.position.copy(this.player.position);
    this.titleKeyLight.target.position.y += 1.35;
    this.titleRimLight.position.set(
      this.player.position.x - 3.2,
      this.player.position.y + 3.8,
      this.player.position.z - 2.4,
    );
    const focus = TMP_TARGET.copy(this.player.position);
    focus.y += GAME_CONFIG.titleCameraFocusHeight;
    focus.z += GAME_CONFIG.titleCameraFocusForward;
    const orbit = .55 + Math.sin(this.titleTime * .075) * .08;
    const distance = GAME_CONFIG.titleCameraDistance;
    this.camera.position.set(
      this.player.position.x + Math.sin(orbit) * distance,
      this.player.position.y + GAME_CONFIG.titleCameraHeight,
      this.player.position.z + Math.cos(orbit) * distance + GAME_CONFIG.titleCameraForwardOffset,
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
    if (this.world.decorator?.campfire) this.world.decorator.campfire.visible = true;
    this.titleKeyLight.visible = false;
    this.titleRimLight.visible = false;
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

  snapCamera() {
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
    return startNewGame(this, options);
  }

  /** Endless wave arena — separate entry from Hunt; does not write Hunt continue saves mid-run. */
  startDefense(options = {}) {
    return startDefenseMode(this, options);
  }

  /** Wave 200 clear — end run with victory meta, return to title. */
  handleDefenseVictory() {
    return handleDefenseVictoryMode(this);
  }

  continueGame() {
    return continueSavedGame(this);
  }

  setPaused(paused) {
    if (paused && this.state === 'playing') this.state = 'paused';
    else if (!paused && this.state === 'paused') {
      this.state = 'playing';
      this.clock.getDelta();
    }
  }

  returnToTitle() {
    return returnGameToTitle(this);
  }

  /**
   * Dispose AssetManager model cache entries that have no live skeleton clones.
   * Safe after enemy/loot teardown; does not touch textures still referenced by terrain.
   * @returns {number} purged entry count
   */
  purgeUnusedAssets() {
    return this.assets?.purgeUnused?.() ?? 0;
  }

  handlePlayerDeath() {
    return handlePlayerDeathMode(this);
  }

  #endDefenseRun() {
    return endDefenseRun(this);
  }

  #respawn() {
    return respawnPlayer(this);
  }

  onEnemyKilled(enemy) {
    return onEnemyKilledFeedback(this, enemy);
  }

  /** Level-ups from XP gem collection (mirrors former onEnemyKilled XP path). */
  onXpLevelUps(levelUps = []) {
    return onXpLevelUpsFeedback(this, levelUps);
  }

  #updateKillFeedback(delta) {
    return updateKillFeedback(this, delta);
  }

  requestSave() {
    if (this.mode === 'defense') return;
    this.saveRequested = true;
  }

  saveGame(showFailure = false) {
    // Never serialize temporary Defense heroes as Hunt continue progress.
    if (this.mode !== 'hunt') return false;
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
    return mergeDefenseMeta(this, meta, incrementRuns);
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
      mode: this.mode,
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

  /** Debug-query-only skill evolution controls; also callable from window.__SOL_ARPG_DEMO__. */
  debugSetSkillState(options = {}) {
    if (!this.debugEnabled || !this.player) return false;
    let changed = false;
    if (options.classId && HERO_CLASSES[options.classId] && options.classId !== this.player.classId) {
      this.player.reset(options.classId);
      changed = true;
    }
    if (options.level != null) {
      const level = clamp(Math.floor(Number(options.level) || 1), 1, 100);
      if (level !== this.player.level) {
        this.player.level = level;
        changed = true;
      }
    }
    if (options.rank != null) {
      for (const skill of getClassActiveSkills(this.player.classId)) {
        const rank = normalizeSkillRank(skill, options.rank);
        if (this.player.skills[skill.id] !== rank) {
          this.player.skills[skill.id] = rank;
          changed = true;
        }
      }
    }
    if (options.skillId && options.milestone != null && options.choiceId) {
      changed = this.player.setSkillMutation(options.skillId, options.milestone, options.choiceId) || changed;
    }
    if (changed) {
      this.player.invalidateStats();
      this.player.hp = Math.min(this.player.hp, this.player.maxHp);
      this.player.mp = Math.min(this.player.mp, this.player.maxMp);
    }
    return changed;
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
