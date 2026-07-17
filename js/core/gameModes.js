/**
 * Hunt / Defense mode lifecycle helpers (N3 Game extract).
 * Frame loop, camera, and input stay on Game.js.
 */
import * as THREE from 'three';
import { DEFENSE_CONFIG, GAME_CONFIG } from '../config.js';
import { clamp } from '../../packages/template-3d/index.js';
import { applyKillChainMods } from './killFeedback.js';

const ZERO_MOVE = new THREE.Vector3(0, 0, 0);

export function mergeDefenseMeta(game, meta = {}, incrementRuns = false) {
    const bestWave = Math.max(0, Number(game.defenseMeta.bestWave) || 0, Number(meta.bestWave) || 0);
    const lastWave = Math.max(0, Number(meta.lastWave) || 0, Number(game.defenseMeta.lastWave) || 0);
    const runs = Math.max(0, Number(game.defenseMeta.runs) || 0, Number(meta.runs) || 0)
      + (incrementRuns ? 0 : 0);
    game.defenseMeta = {
      bestWave,
      lastWave,
      runs: incrementRuns ? runs + 1 : runs,
    };
  }

export function persistDefenseMeta(game, incrementRuns = false) {
    const run = game.defense?.serializeMeta?.() ?? { bestWave: 0, lastWave: 0 };
    const next = {
      bestWave: Math.max(
        Number(game.defenseMeta.bestWave) || 0,
        Number(run.bestWave) || 0,
        Number(run.lastWave) || 0,
      ),
      lastWave: Math.max(Number(run.lastWave) || 0, Number(run.bestWave) || 0),
      runs: (Number(game.defenseMeta.runs) || 0) + (incrementRuns ? 1 : 0),
    };
    game.defenseMeta = next;

    const existing = game.save.load();
    if (!existing?.player) return false;
    return game.save.save({
      player: existing.player,
      hunt: existing.hunt,
      playTime: existing.playTime,
      cameraYaw: existing.cameraYaw,
      cameraDistance: existing.cameraDistance,
      defenseMeta: next,
    });
  }

export function clearRun(game) {
    (game.ctx?.combat ?? game.combat)?.clear();
    (game.ctx?.enemies ?? game.enemies)?.clear();
    game.loot?.clear();
    game.xpGems?.clear();
    (game.ctx?.effects ?? game.effects)?.clear();
    game.deferred.length = 0;
    game.killChain = 0;
    game.killChainTimer = 0;
    game._chainMilestones?.clear?.();
    game.multikillBuffer = [];
    game.multikillTimer = 0;
    applyKillChainMods(game, false);
    (game.ctx?.ui ?? game.ui).hideDeath();
    game.saveRequested = false;
  }

export function bootstrapDefenseHero(game) {
    const cfg = DEFENSE_CONFIG;
    const player = (game.ctx?.player ?? game.player);
    const targetLevel = Math.max(1, cfg.startLevel ?? 3);
    // Feed exact XP needed so unlockLevel actives auto-grant via addXp.
    let guard = 40;
    while (player.level < targetLevel && guard-- > 0) {
      player.addXp(Math.max(1, player.xpNeeded - player.xp + 1));
    }
    player.skillPoints += Math.max(0, cfg.startSkillPoints ?? 0);
    player.potions = Math.max(player.potions, cfg.startPotions ?? 5);
    player.maxPotions = Math.max(player.maxPotions, 6);
    player.hp = player.maxHp;
    player.mp = player.maxMp;
    player.energy = 40;
    player.invalidateStats();
  }

export function endDefenseRun(game) {
    persistDefenseMeta(game, true);
    const wave = Math.max(1, game.defense?.bestWaveThisRun || game.defense?.wave || 1);
    const best = game.defenseMeta?.bestWave ?? wave;
    (game.ctx?.ui ?? game.ui).notify(`Defense ended · Wave ${wave} · Best ${best}`, 'danger', 4.5);
    clearRun(game);
    game.mode = 'hunt';
    game.defense.reset();
    (game.ctx?.player ?? game.player).reset();
    (game.ctx?.world ?? game.world).resolvePosition((game.ctx?.player ?? game.player).position, .48);
    game.state = 'title';
    (game.ctx?.ui ?? game.ui).hideDeath();
    (game.ctx?.ui ?? game.ui).showTitle();
  }

export function respawnPlayer(game) {
    const penalty = Math.floor((game.ctx?.player ?? game.player).gold * .04);
    (game.ctx?.player ?? game.player).gold = Math.max(0, (game.ctx?.player ?? game.player).gold - penalty);
    (game.ctx?.player ?? game.player).position.set(...GAME_CONFIG.respawnPosition);
    (game.ctx?.world ?? game.world).resolvePosition((game.ctx?.player ?? game.player).position, .48);
    (game.ctx?.player ?? game.player).restore();
    (game.ctx?.enemies ?? game.enemies).clear();
    (game.ctx?.combat ?? game.combat).clear();
    game.xpGems?.clear();
    game.killChain = 0;
    game.killChainTimer = 0;
    game.multikillBuffer = [];
    game.multikillTimer = 0;
    applyKillChainMods(game, false);
    game.state = 'playing';
    (game.ctx?.ui ?? game.ui).hideDeath();
    game.snapCamera();
    (game.ctx?.enemies ?? game.enemies).populate(40);
    (game.ctx?.ui ?? game.ui).notify(penalty > 0 ? `Revived at hub · Repair cost ${penalty}G` : 'Revived at hub.', 'danger', 3.8);
    game.requestSave();
  }

export function startNewGame(game, options = {}) {
    const classId = options.classId ?? (game.ctx?.ui ?? game.ui)?.selectedClassId ?? game.query.get('class');
    clearRun(game);
    game.mode = 'hunt';
    game.defense.reset();
    (game.ctx?.player ?? game.player).reset(classId);
    game.hunt.reset();
    game.playTime = 0;
    game.autoSaveTimer = GAME_CONFIG.autoSaveSeconds;
    game.saveRequested = false;
    game.cameraYaw = .55;
    game.cameraDistance = GAME_CONFIG.cameraDistance;
    (game.ctx?.world ?? game.world).resolvePosition((game.ctx?.player ?? game.player).position, .48);
    game.state = 'playing';
    (game.ctx?.ui ?? game.ui).showHUD();
    game.snapCamera();
    (game.ctx?.enemies ?? game.enemies).populate(52);
    const heroName = (game.ctx?.player ?? game.player).name;
    const ui = game.ctx?.ui ?? game.ui;
    ui.notify(`Hunt started · ${heroName} enters the field.`, 'contract', 4.5);
    // On-level guidance: point new hunters at a fitting band immediately.
    const tip = game.hunt?.recommendedHuntTip?.()
      ?? 'Hunt tip · Emerald Meadow (Lv.1–14) fits you';
    ui.notify(tip, 'loot', 5.2);
    // Seed contract on start so guided objectives appear within the first seconds.
    game.hunt.update?.(0);
    if (game.hunt.contract?.label) {
      ui.notify(`New contract · ${game.hunt.contract.label}`, 'contract', 3.6);
    }
    // Immediate localStorage write so Continue is available even if the tab closes early.
    game.saveGame(false);
  }

export function startDefenseMode(game, options = {}) {
    const classId = options.classId ?? (game.ctx?.ui ?? game.ui)?.selectedClassId ?? game.query.get('class');
    clearRun(game);
    game.mode = 'defense';
    game.defense.reset();
    (game.ctx?.player ?? game.player).reset(classId);
    bootstrapDefenseHero(game);
    game.hunt.reset();
    game.playTime = 0;
    game.autoSaveTimer = GAME_CONFIG.autoSaveSeconds;
    game.cameraYaw = .55;
    game.cameraDistance = GAME_CONFIG.cameraDistance;
    (game.ctx?.player ?? game.player).position.set(...GAME_CONFIG.respawnPosition);
    (game.ctx?.world ?? game.world).resolvePosition((game.ctx?.player ?? game.player).position, .48);
    game.state = 'playing';
    (game.ctx?.ui ?? game.ui).showHUD();
    game.snapCamera();
    game.defense.start();
    const best = game.defenseMeta?.bestWave ?? 0;
    (game.ctx?.ui ?? game.ui).notify(
      best > 0
        ? `Defense · Best ${best} · Climb to wave ${DEFENSE_CONFIG.maxWave}`
        : `Defense · Survive to wave ${DEFENSE_CONFIG.maxWave}`,
      'contract',
      4.2,
    );
  }

export function handleDefenseVictory(game) {
    if (game.mode !== 'defense') return;
    persistDefenseMeta(game, true);
    const wave = DEFENSE_CONFIG.maxWave;
    const best = Math.max(wave, game.defenseMeta?.bestWave ?? 0);
    (game.ctx?.ui ?? game.ui).notify(`Victory · Wave ${wave} conquered · Best ${best}`, 'legendary', 5.5);
    (game.ctx?.effects ?? game.effects)?.pillar?.((game.ctx?.player ?? game.player).position, 0xffc45c, 16, { life: 1.8, bottom: 2.4, opacity: .6 });
    (game.ctx?.effects ?? game.effects)?.ring?.((game.ctx?.player ?? game.player).position, 0xffe38a, 12, { life: 1.6, startScale: .05 });
    (game.ctx?.audio ?? game.audio)?.legendary?.();
    clearRun(game);
    game.mode = 'hunt';
    game.defense.reset();
    (game.ctx?.player ?? game.player).reset();
    (game.ctx?.world ?? game.world).resolvePosition((game.ctx?.player ?? game.player).position, .48);
    game.state = 'title';
    (game.ctx?.ui ?? game.ui).hideDeath();
    (game.ctx?.ui ?? game.ui).showTitle();
  }

export function continueSavedGame(game) {
    const data = game.save.load();
    if (!data?.player) {
      (game.ctx?.ui ?? game.ui).notify('No valid save found in browser storage.', 'danger', 3.5);
      (game.ctx?.ui ?? game.ui).showTitle();
      return false;
    }
    try {
      clearRun(game);
      game.mode = 'hunt';
      game.defense.reset();
      (game.ctx?.player ?? game.player).load(data.player, (game.ctx?.world ?? game.world));
      game.hunt.load(data.hunt ?? {});
      game.defenseMeta = { bestWave: 0, lastWave: 0, runs: 0 };
      if (data.defenseMeta) mergeDefenseMeta(game, data.defenseMeta, false);
      game.playTime = Math.max(0, Number(data.playTime) || 0);
      game.cameraYaw = Number.isFinite(Number(data.cameraYaw)) ? Number(data.cameraYaw) : .55;
      game.cameraDistance = clamp(
        Number(data.cameraDistance) || GAME_CONFIG.cameraDistance,
        GAME_CONFIG.cameraMinDistance,
        GAME_CONFIG.cameraMaxDistance,
      );
      game.autoSaveTimer = GAME_CONFIG.autoSaveSeconds;
      game.saveRequested = false;
      game.state = 'playing';
      if ((game.ctx?.ui ?? game.ui)) (game.ctx?.ui ?? game.ui).selectedClassId = (game.ctx?.player ?? game.player).classId;
      (game.ctx?.ui ?? game.ui).showHUD();
      game.snapCamera();
      (game.ctx?.enemies ?? game.enemies).populate(52);
      // Re-write current schema so Continue stays durable after version upgrades.
      game.saveGame(false);
      (game.ctx?.ui ?? game.ui).notify(
        `Hunt resumed · ${(game.ctx?.player ?? game.player).name} · Lv.${(game.ctx?.player ?? game.player).level} · ${game.hunt.hunterTitle}`,
        'contract',
        3.8,
      );
      return true;
    } catch (error) {
      console.error('[continueGame] failed', error);
      (game.ctx?.ui ?? game.ui).notify('Could not load save. Try New Hunt or clear site data.', 'danger', 4.5);
      game.state = 'title';
      (game.ctx?.ui ?? game.ui).showTitle();
      return false;
    }
  }

export function returnGameToTitle(game) {
    if (game.state !== 'title') {
      if (game.mode === 'defense') {
        // Abandon mid-run from pause menu; death path already persisted in #endDefenseRun.
        if (game.defense?.phase !== 'failed' && game.defense?.phase !== 'idle') {
          persistDefenseMeta(game, true);
        }
      } else if (game.mode === 'hunt') {
        game.saveGame(false);
      }
    }
    clearRun(game);
    game.mode = 'hunt';
    game.defense.reset();
    (game.ctx?.player ?? game.player).reset();
    (game.ctx?.world ?? game.world).resolvePosition((game.ctx?.player ?? game.player).position, .48);
    // Drop cache entries with zero live clones after run teardown.
    game.purgeUnusedAssets();
    game.state = 'title';
    (game.ctx?.ui ?? game.ui).showTitle();
  }

export function handlePlayerDeath(game) {
    if (game.state === 'dead') return;
    game.state = 'dead';
    game.deathTimer = game.mode === 'defense' ? 2.8 : game.deathDuration;
    (game.ctx?.player ?? game.player).setMoveDirection(ZERO_MOVE);
    if (game.mode === 'defense') game.defense.fail();
    else game.saveGame(false);
    (game.ctx?.ui ?? game.ui).showDeath();
    (game.ctx?.combat ?? game.combat).clear();
  }
