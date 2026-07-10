import * as THREE from 'three';
import { GAME_CONFIG } from '../config.js';
import { SKILLS } from '../data/content.js';
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
import { HuntSystem } from '../systems/HuntSystem.js';
import { UI } from '../ui/UI.js';

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

    this.state = 'loading';
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
    window.addEventListener('keydown', event => {
      if (event.code === 'F3') {
        event.preventDefault();
        this.debugVisible = !this.debugVisible;
        this.ui.setDebugVisible(this.debugVisible);
      }
    });
    window.addEventListener('beforeunload', () => {
      if (this.state === 'playing' || this.state === 'paused') this.saveGame(false);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.state === 'playing' || this.state === 'paused')) this.saveGame(false);
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
    this.combat = new CombatSystem(this);
    this.loot = new LootSystem(this);
    this.enemies = new EnemySystem(this, this.monsterFactory, this.quality);
    this.world.resolvePosition(this.player.position, .48);
    this.#snapCamera();

    this.renderer.compile(this.scene, this.camera);
    this.ui.setLoading(1, 'High-quality hunting ground ready');
    await new Promise(resolve => setTimeout(resolve, 180));
    this.state = 'title';
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

  #updatePlaying(delta) {
    this.playTime += delta;
    this.#handleMenus();
    if (this.state !== 'playing') return;
    this.#handleInput(delta);
    this.#updateAim();
    this.#updateDeferred(delta);

    this.player.update(delta, this);
    this.hunt.update(delta);
    this.enemies.update(delta);
    this.combat.update(delta);
    this.loot.update(delta);
    this.effects.update(delta);
    this.world.update(delta, this);

    if (!this.player.alive) this.handlePlayerDeath();
    this.autoSaveTimer -= delta;
    if (this.autoSaveTimer <= 0 || this.saveRequested) {
      this.saveGame(false);
      this.autoSaveTimer = GAME_CONFIG.autoSaveSeconds;
      this.saveRequested = false;
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
    this.enemies.update(delta * .35);
    this.combat.update(delta);
    this.loot.update(delta);
    if (this.deathTimer <= 0) this.#respawn();
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
    const forwardAmount = (this.input.isDown('KeyW') || this.input.isDown('ArrowUp') ? 1 : 0)
      - (this.input.isDown('KeyS') || this.input.isDown('ArrowDown') ? 1 : 0);
    const rightAmount = (this.input.isDown('KeyD') || this.input.isDown('ArrowRight') ? 1 : 0)
      - (this.input.isDown('KeyA') || this.input.isDown('ArrowLeft') ? 1 : 0);
    TMP_FORWARD.copy(this.player.position).sub(this.camera.position).setY(0).normalize();
    TMP_RIGHT.crossVectors(TMP_FORWARD, Y_AXIS).normalize();
    TMP_MOVE.set(0, 0, 0).addScaledVector(TMP_FORWARD, forwardAmount).addScaledVector(TMP_RIGHT, rightAmount);
    if (TMP_MOVE.lengthSq() > 1) TMP_MOVE.normalize();
    this.player.setMoveDirection(TMP_MOVE);

    if (this.input.isMouseDown(0) || this.input.isDown('KeyJ')) this.player.tryAttack(this);
    if (this.input.consumeMouse(2) || this.input.consume('Space')) this.player.tryDash(this);
    if (this.input.consume('KeyQ')) this.player.trySkill('whirlwind', this);
    if (this.input.consume('KeyE')) this.player.trySkill('crescent', this);
    if (this.input.consume('KeyR')) this.player.trySkill('skyfall', this);
    if (this.input.consume('KeyC')) this.player.trySkill('starburst', this);
    if (this.input.consumeAny('Digit1', 'Numpad1')) this.player.usePotion(this);

    const cameraDirection = (this.input.isDown('KeyX') ? 1 : 0) - (this.input.isDown('KeyZ') ? 1 : 0);
    this.cameraYaw += cameraDirection * delta * 1.25;
    if (this.input.isMouseDown(1)) {
      const pointerDelta = this.input.consumePointerDelta();
      this.cameraYaw -= pointerDelta.x * .0055;
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
      .addScaledVector(this.player.facing, 1.05)
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
      .addScaledVector(this.player.facing, 1.05)
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

  newGame() {
    this.#clearRun();
    this.player.reset();
    this.hunt.reset();
    this.playTime = 0;
    this.autoSaveTimer = GAME_CONFIG.autoSaveSeconds;
    this.cameraYaw = .55;
    this.cameraDistance = GAME_CONFIG.cameraDistance;
    this.world.resolvePosition(this.player.position, .48);
    this.state = 'playing';
    this.ui.showHUD();
    this.#snapCamera();
    this.enemies.populate(28);
    this.ui.notify('Hunt started · Defeat monsters to earn gear and XP.', 'contract', 4.5);
    this.requestSave();
  }

  continueGame() {
    const data = this.save.load();
    if (!data) {
      this.newGame();
      return;
    }
    this.#clearRun();
    this.player.load(data.player, this.world);
    this.hunt.load(data.hunt);
    this.playTime = Math.max(0, Number(data.playTime) || 0);
    this.cameraYaw = Number(data.cameraYaw) || .55;
    this.cameraDistance = clamp(Number(data.cameraDistance) || GAME_CONFIG.cameraDistance, GAME_CONFIG.cameraMinDistance, GAME_CONFIG.cameraMaxDistance);
    this.state = 'playing';
    this.ui.showHUD();
    this.#snapCamera();
    this.enemies.populate(28);
    this.ui.notify(`Hunt resumed · ${this.hunt.hunterTitle}`, 'contract', 3.8);
  }

  #clearRun() {
    this.combat?.clear();
    this.enemies?.clear();
    this.loot?.clear();
    this.effects?.clear();
    this.deferred.length = 0;
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
    if (this.state !== 'title') this.saveGame(false);
    this.#clearRun();
    this.player.reset();
    this.world.resolvePosition(this.player.position, .48);
    this.state = 'title';
    this.ui.showTitle();
  }

  handlePlayerDeath() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deathTimer = this.deathDuration;
    this.player.setMoveDirection(TMP_MOVE.set(0, 0, 0));
    this.ui.showDeath();
    this.combat.clear();
    this.saveGame(false);
  }

  #respawn() {
    const penalty = Math.floor(this.player.gold * .04);
    this.player.gold = Math.max(0, this.player.gold - penalty);
    this.player.position.set(...GAME_CONFIG.respawnPosition);
    this.world.resolvePosition(this.player.position, .48);
    this.player.restore();
    this.enemies.clear();
    this.combat.clear();
    this.state = 'playing';
    this.ui.hideDeath();
    this.#snapCamera();
    this.enemies.populate(22);
    this.ui.notify(penalty > 0 ? `Revived at hub · Repair cost ${penalty}G` : 'Revived at hub.', 'danger', 3.8);
    this.requestSave();
  }

  onEnemyKilled(enemy) {
    if (enemy.deathHandled) return;
    enemy.deathHandled = true;
    const xpResult = this.player.addXp(enemy.xpValue);
    const [minGold, maxGold] = enemy.goldRange;
    const goldRaw = randInt(minGold, maxGold) * (enemy.elite ? 2.2 : 1) * (enemy.boss ? 5 : 1);
    const gold = this.player.addGold(goldRaw);
    this.hunt.onKill(enemy);
    this.loot.dropFromEnemy(enemy);

    const position = enemy.position.clone().add(new THREE.Vector3(0, Math.max(.7, enemy.refs.modelHeight * .45), 0));
    this.effects.burst(position, enemy.boss ? enemy.data.accent : enemy.elite ? 0xffd66b : 0xeaf7d7, enemy.boss ? 46 : enemy.elite ? 22 : 12, {
      speed: enemy.boss ? 7.5 : 4.4, size: enemy.boss ? .55 : .3, life: enemy.boss ? 1.2 : .62,
    });
    this.ui.floatText(position, `+${xpResult.amount} EXP · +${gold}G`, 'heal');

    if (enemy.elite) this.ui.notify(`Elite slain · ${enemy.data.name}`, 'uncommon', 2.8);
    if (enemy.boss) {
      this.effects.pillar(enemy.position, enemy.data.accent, 14, { life: 1.55, bottom: 2.2 });
      this.effects.ring(enemy.position, enemy.data.accent, 10, { life: 1.4, startScale: .06 });
      this.ui.notify(`Boss defeated · ${enemy.data.name}`, 'boss', 5);

    }

    for (const level of xpResult.levelUps) {
      this.audio.levelUp();
      this.effects.pillar(this.player.position, 0xffe38a, 8, { life: .9, bottom: 1.25 });
      this.effects.ring(this.player.position, 0xffe38a, 5.5, { life: .85, startScale: .05 });
      this.ui.notify(`LEVEL UP · Lv.${level} · Skill Point +1`, 'level', 4.4);
      for (const skill of Object.values(SKILLS)) {
        if (!skill.passive && skill.unlockLevel === level) this.ui.notify(`New skill unlocked · ${skill.name} [${skill.key}]`, 'level', 4.2);
      }
    }
    this.requestSave();
  }

  requestSave() {
    this.saveRequested = true;
  }

  saveGame(showFailure = false) {
    if (!this.player || !this.hunt || this.state === 'title' || this.state === 'loading') return false;
    const success = this.save.save({
      player: this.player.serialize(),
      hunt: this.hunt.serialize(),
      playTime: this.playTime,
      cameraYaw: this.cameraYaw,
      cameraDistance: this.cameraDistance,
    });
    if (!success && showFailure) this.ui.notify('Could not access browser storage.', 'danger');
    return success;
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
