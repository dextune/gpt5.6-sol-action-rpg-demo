import * as THREE from 'three';
import { HUNT_TITLES, ZONES } from '../data/content.js';
import { HUNT_THREAT_CONFIG, MAX_HUNT_CONFIG } from '../config.js';
import { clamp, rand, randInt, uid, weightedPick } from '../core/Utils.js';
import { createGameContext } from '../core/GameContext.js';
import {
  recommendedHuntTip,
  recommendedZoneId,
  zoneThreat,
} from './huntThreat.js';

/** English reward preview lines by contract reward tier (1–5). */
const CONTRACT_REWARD_HINTS = Object.freeze({
  1: 'Modest gold · Weapon forge fund',
  2: 'Solid gold · Weapon forge fund',
  3: 'Rich gold · Weapon forge fund',
  4: 'Premium gold · Option forge fund · Skill Point chance',
  5: 'Jackpot gold · Option forge fund · Skill Point',
});

function rewardHintForTier(tier) {
  const t = clamp(Math.round(tier) || 1, 1, 5);
  return CONTRACT_REWARD_HINTS[t] ?? CONTRACT_REWARD_HINTS[1];
}

export class HuntSystem {
  constructor(game) {
    this.game = game;
    this.ctx = game?.ctx ?? createGameContext(game);
    this.reset();
  }

  /**
   * @param {{ variant?: 'max'|'legacy' }} [options]
   */
  reset(options = {}) {
    this.totalKills = 0;
    this.elitesKilled = 0;
    this.bossesKilled = 0;
    this.completedContracts = 0;
    this.killsByZone = Object.fromEntries(Object.keys(ZONES).map(id => [id, 0]));
    this.killsByType = {};
    this.streak = 0;
    this.bestStreak = 0;
    this.streakTimer = 0;
    this.bossCharge = 0;
    this.bossPendingTimer = 0;
    this.contractCooldown = 0;
    this.contract = null;
    this.fieldMarkTimer = rand(
      HUNT_THREAT_CONFIG.fieldMarkMinSec,
      HUNT_THREAT_CONFIG.fieldMarkMaxSec,
    );
    this.variant = options.variant === 'max' ? 'max' : 'legacy';
    this.maxBaselineVersion = this.variant === 'max'
      ? (Number(options.maxBaselineVersion) || MAX_HUNT_CONFIG.baseline.maxBaselineVersion)
      : 0;
    this.invasionPhase = this.variant === 'max' ? 'opening' : 'none';
    this.invasionElapsed = 0;
    if (this.variant === 'max') {
      this.contract = this.#makeBreachContract();
    }
  }

  get isMax() {
    return this.variant === 'max';
  }

  /** Legacy Hunt keeps the hub safe; MAX HUNT opens the perimeter. Defense ignores this. */
  get campSafe() {
    return this.variant !== 'max';
  }

  get worldTier() {
    return Math.max(1, 1 + Math.floor((this.game.player.level - 1) / 10));
  }

  get hunterTitle() {
    return [...HUNT_TITLES].reverse().find(entry => this.totalKills >= entry.kills)?.name ?? HUNT_TITLES[0].name;
  }

  get bossReady() { return this.bossCharge >= 100; }

  #makeBreachContract() {
    const c = MAX_HUNT_CONFIG.openingContract;
    return {
      id: uid('contract'),
      type: c.type,
      progress: 0,
      complete: false,
      zoneId: 'verdant',
      rewardTier: c.rewardTier,
      target: c.target,
      label: c.label,
      description: c.description,
      rewardHint: c.rewardHint,
    };
  }

  /** Advance invasion phase timers (opening → surge → steady). */
  tickInvasion(delta) {
    if (!this.isMax) return;
    this.invasionElapsed += Math.max(0, Number(delta) || 0);
    if (this.invasionPhase === 'opening' || this.invasionPhase === 'surge') {
      if (this.invasionElapsed >= MAX_HUNT_CONFIG.surgeSeconds) {
        this.invasionPhase = 'steady';
      } else if (this.invasionPhase === 'opening' && this.invasionElapsed > 0.05) {
        this.invasionPhase = 'surge';
      }
    }
  }

  /** Recommended hunting zone for the current player level. */
  recommendedZoneId() {
    return recommendedZoneId(this.game.player?.level ?? 1);
  }

  recommendedHuntTip() {
    return recommendedHuntTip(this.game.player?.level ?? 1);
  }

  update(delta) {
    this.tickInvasion(delta);
    if (!this.contract) this.contract = this.#makeContract();
    this.streakTimer = Math.max(0, this.streakTimer - delta);
    if (this.streakTimer <= 0 && this.streak > 0) this.streak = 0;
    this.contractCooldown = Math.max(0, this.contractCooldown - delta);

    if (this.bossPendingTimer > 0) {
      this.bossPendingTimer -= delta;
      if (this.bossPendingTimer <= 0 && !this.game.enemies.activeBoss) {
        const boss = this.game.enemies.spawnBoss(this.game.world.currentZone.id);
        if (boss) this.bossCharge = 0;
      }
    }

    if (this.game.mode === 'hunt' && this.game.state === 'playing' && this.game.player?.alive) {
      // Opening breach already floods the village — suppress field-mark spam for MAX.
      if (!this.isMax) this.#tickFieldMark(delta);
    }
  }

  #tickFieldMark(delta) {
    this.fieldMarkTimer -= delta;
    if (this.fieldMarkTimer > 0) return;
    this.fieldMarkTimer = rand(
      HUNT_THREAT_CONFIG.fieldMarkMinSec,
      HUNT_THREAT_CONFIG.fieldMarkMaxSec,
    );
    const player = this.game.player;
    const zone = this.game.world.currentZone;
    const threat = zoneThreat(player.level, zone);
    // Only ping in readable on-level / challenging bands — not greys or suicide lethal.
    if (threat.id !== 'onlevel' && threat.id !== 'challenging') return;
    if (this.game.enemies.livingCount > HUNT_THREAT_CONFIG.packPressureLiving + 8) return;

    const world = this.game.world;
    const origin = world.randomSpawnAround(
      player.position,
      14,
      28,
    );
    world.resolvePosition(origin, 0.7);
    const markZone = world.zoneAt(origin.x, origin.z);
    // Keep field marks inside the player's current hunting ground when possible.
    if (markZone.id !== zone.id) {
      origin.set(zone.center[0] + rand(-12, 12), 0, zone.center[1] + rand(-12, 12));
      world.resolvePosition(origin, 0.7);
    }

    const pack = this.game.enemies.spawnPack(null, randInt(4, 6), origin);
    // Guarantee one elite in the mark for greed/readability.
    const living = this.game.enemies.enemies.filter(e => e.alive && !e.boss);
    const seed = pack[0] ?? living[living.length - 1];
    if (seed) {
      const elitePos = origin.clone().add(new THREE.Vector3(rand(-1.5, 1.5), 0, rand(-1.5, 1.5)));
      world.resolvePosition(elitePos, 0.7);
      this.game.enemies.spawn(seed.data, elitePos, {
        level: seed.level,
        elite: true,
        eliteAffix: this.game.enemies.rollEliteAffix(zone.id),
        fodder: false,
      });
    } else {
      this.game.enemies.spawnPack(null, 5, origin);
    }

    this.game.effects?.ring?.(origin, 0xffd56f, 3.4, { life: 0.85, startScale: 0.1, opacity: 0.6 });
    this.game.effects?.pillar?.(origin, 0xffd56f, 5.5, { life: 0.55, bottom: 0.7 });
    this.game.ui?.notify?.('Field mark · elite pack nearby', 'uncommon', 3.2);
  }

  onKill(enemy) {
    this.totalKills += 1;
    this.killsByZone[enemy.data.zone] = (this.killsByZone[enemy.data.zone] ?? 0) + 1;
    this.killsByType[enemy.typeId] = (this.killsByType[enemy.typeId] ?? 0) + 1;
    if (enemy.elite) this.elitesKilled += 1;
    if (enemy.boss) this.bossesKilled += 1;

    this.streak = this.streakTimer > 0 ? this.streak + 1 : 1;
    this.streakTimer = enemy.boss ? 12 : enemy.elite ? 8.5 : 6.2;
    this.bestStreak = Math.max(this.bestStreak, this.streak);

    if (enemy.boss) {
      this.bossCharge = 0;
      this.bossPendingTimer = 0;
    } else if (!this.game.enemies.activeBoss) {
      const chargeGain = this.isMax
        ? (enemy.elite ? MAX_HUNT_CONFIG.bossCharge.elite : MAX_HUNT_CONFIG.bossCharge.normal)
        : (enemy.elite ? 9 : 2.35);
      this.bossCharge = clamp(this.bossCharge + chargeGain, 0, 100);
      if (this.bossCharge >= 100 && this.bossPendingTimer <= 0) {
        this.bossPendingTimer = 2.25;
        this.game.ui.notify('A mighty presence shakes the hunting ground…', 'boss', 3.2);
      }
    }

    this.#advanceContract(enemy);
    if (this.totalKills > 0 && this.totalKills % 100 === 0) {
      this.game.player.skillPoints += 1;
      this.game.ui.notify(`Hunt milestone ${this.totalKills} kills · Skill Point +1`, 'level', 4);
      this.game.audio.levelUp();
    }
  }

  #advanceContract(enemy) {
    const contract = this.contract;
    if (!contract || contract.complete) return;
    let amount = 0;
    if (contract.type === 'kills' || contract.type === 'breach') amount = 1;
    else if (contract.type === 'elite' && enemy.elite) amount = 1;
    else if (contract.type === 'boss' && enemy.boss) amount = 1;
    else if (contract.type === 'zone' && enemy.data.zone === contract.zoneId) amount = 1;
    else if (contract.type === 'guided' && enemy.data.zone === contract.zoneId) amount = 1;
    else if (contract.type === 'streak' && this.streak >= contract.target) contract.progress = contract.target;
    contract.progress = clamp(contract.progress + amount, 0, contract.target);
    if (contract.progress >= contract.target) this.#completeContract();
  }

  #completeContract() {
    const contract = this.contract;
    if (!contract || contract.complete) return;
    contract.complete = true;
    this.completedContracts += 1;
    let rewardTier = contract.rewardTier;
    // MAX HUNT: scale contract reward tier once (bounded; no double gold grants).
    if (this.isMax && contract.type === 'breach') {
      rewardTier = clamp(Math.round(rewardTier * MAX_HUNT_CONFIG.rewards.contract), 1, 5);
    } else if (this.isMax) {
      rewardTier = clamp(Math.round(rewardTier * Math.min(1.25, MAX_HUNT_CONFIG.rewards.contract)), 1, 5);
    }
    const reward = this.game.loot.grantContractReward(rewardTier);
    const spNote = rewardTier >= 4 ? ' · Skill Point' : '';
    this.game.ui.notify(
      `Contract complete · ${contract.label} · +${reward.gold}G${spNote}`,
      'contract',
      5.2,
    );
    const floatAt = this.game.player.position.clone();
    floatAt.y += 2.2;
    this.game.ui.floatText?.(floatAt, 'CONTRACT+', 'heal');
    // Mini payoff VFX at the hunter (reuse existing effects pools).
    const fxPos = this.game.player.position.clone();
    this.game.effects?.pillar?.(fxPos, 0x69e0a0, 5.5, { life: 0.55, bottom: 0.9, opacity: 0.52 });
    const burstAt = fxPos.clone();
    burstAt.y += 1.0;
    this.game.effects?.burst?.(burstAt, 0x9ef0c8, 22, {
      speed: 3.8, size: 0.26, life: 0.5, upward: 0.45,
    });
    this.game.audio.levelUp();
    this.game.player.skillPoints += contract.rewardTier >= 4 ? 1 : 0;
    this.contractCooldown = 1.8;
    this.game.requestSave?.();
    this.game.defer?.(1.9, () => {
      this.contract = this.#makeContract();
      this.game.ui.notify(`New contract · ${this.contract.label}`, 'contract', 3.4);
    });
  }

  /**
   * Level-based type weights:
   * early — guided / zone · mid — elite / streak · late — boss slightly higher.
   * Pure "any kills" is de-emphasized when a clear band exists.
   */
  #pickContractType(level) {
    const entries = [
      { id: 'guided', weight: level < 40 ? 3.6 : 1.6 },
      { id: 'zone', weight: level < 8 ? 1.4 : level < 16 ? 1.2 : 1.0 },
      { id: 'kills', weight: level < 8 ? 1.6 : level < 16 ? 1.1 : 0.75 },
      { id: 'elite', weight: level < 6 ? 0.85 : level < 14 ? 2.1 : 2.5 },
    ];
    if (level >= 8) {
      entries.push({ id: 'streak', weight: level < 16 ? 1.5 : 2.2 });
    }
    if (level >= 12) {
      entries.push({ id: 'boss', weight: level < 20 ? 1.05 : 1.85 });
    }
    return weightedPick(entries);
  }

  #makeContract() {
    const level = this.game.player.level;
    const currentZone = this.game.world.currentZone?.id ?? 'verdant';
    const recId = recommendedZoneId(level);
    const recZone = ZONES[recId] ?? ZONES.verdant;
    const zone = ZONES[currentZone] ?? ZONES.verdant;
    const type = this.#pickContractType(level);
    const scale = Math.max(0, Math.floor(level / 10));
    const rewardTier = clamp(1 + Math.floor(level / 16), 1, 5);
    const contract = {
      id: uid('contract'),
      type,
      progress: 0,
      complete: false,
      zoneId: currentZone,
      rewardTier,
      target: 0,
      label: '',
      description: '',
      rewardHint: rewardHintForTier(rewardTier),
    };

    if (type === 'guided') {
      contract.zoneId = recId;
      contract.target = 12 + scale * 3 + randInt(0, 6);
      contract.label = `On-level hunt · ${recZone.name} · ${contract.target}`;
      contract.description = `Hunt in ${recZone.name} (Lv.${recZone.minLevel}–${recZone.maxLevel}).`;
      contract.rewardHint = `${rewardHintForTier(rewardTier)} · On-level bonus`;
    } else if (type === 'kills') {
      contract.target = 18 + scale * 4 + randInt(0, 8);
      contract.label = `Cull ${contract.target} beasts`;
      contract.description = 'Defeat any wild monsters across the hunting grounds.';
    } else if (type === 'zone') {
      contract.target = 14 + scale * 3 + randInt(0, 6);
      contract.label = `${zone.name} · clear ${contract.target}`;
      contract.description = `Hunt monsters inside ${zone.name} only.`;
    } else if (type === 'elite') {
      contract.target = 2 + Math.min(4, Math.floor(level / 18));
      contract.label = `Fell ${contract.target} elite${contract.target > 1 ? 's' : ''}`;
      contract.description = 'Track golden-aura elites and bring them down.';
    } else if (type === 'streak') {
      contract.target = 10 + Math.min(15, Math.floor(level / 3));
      contract.label = `${contract.target}-kill blood streak`;
      contract.description = 'Chain kills before the streak timer fades.';
    } else {
      contract.target = 1;
      contract.label = `Slay the ${zone.name} alpha`;
      contract.description = `Fill Boss Presence, then defeat the ${zone.name} boss.`;
      contract.rewardTier = clamp(contract.rewardTier + 1, 2, 5);
      contract.rewardHint = rewardHintForTier(contract.rewardTier);
    }

    // Ensure reward hint always matches final tier (guided keeps on-level note).
    if (type !== 'guided') {
      contract.rewardHint = rewardHintForTier(contract.rewardTier);
    }
    return contract;
  }

  serialize() {
    return {
      variant: this.variant === 'max' ? 'max' : 'legacy',
      maxBaselineVersion: this.isMax ? (this.maxBaselineVersion || MAX_HUNT_CONFIG.baseline.maxBaselineVersion) : 0,
      totalKills: this.totalKills,
      elitesKilled: this.elitesKilled,
      bossesKilled: this.bossesKilled,
      completedContracts: this.completedContracts,
      killsByZone: { ...this.killsByZone },
      killsByType: { ...this.killsByType },
      bestStreak: this.bestStreak,
      bossCharge: this.bossCharge,
      contract: this.contract ? { ...this.contract } : null,
    };
  }

  load(state = {}) {
    const variant = state.variant === 'max' ? 'max' : 'legacy';
    this.reset({ variant, maxBaselineVersion: state.maxBaselineVersion });
    this.totalKills = Math.max(0, Number(state.totalKills) || 0);
    this.elitesKilled = Math.max(0, Number(state.elitesKilled) || 0);
    this.bossesKilled = Math.max(0, Number(state.bossesKilled) || 0);
    this.completedContracts = Math.max(0, Number(state.completedContracts) || 0);
    this.killsByZone = { ...this.killsByZone, ...(state.killsByZone ?? {}) };
    this.killsByType = { ...(state.killsByType ?? {}) };
    this.bestStreak = Math.max(0, Number(state.bestStreak) || 0);
    this.bossCharge = clamp(Number(state.bossCharge) || 0, 0, 99.5);
    // Resume pressure profile — not a fresh opening grant.
    this.invasionPhase = this.isMax ? 'steady' : 'none';
    this.invasionElapsed = this.isMax ? MAX_HUNT_CONFIG.surgeSeconds : 0;
    // reset() seeds a fresh VILLAGE BREACH for max starts. Continue must not reopen it:
    // restore only an incomplete contract; completed/missing/invalid → null (normal generator).
    if (state.contract && typeof state.contract === 'object' && !state.contract.complete) {
      const c = { ...state.contract };
      c.progress = clamp(Number(c.progress) || 0, 0, Number(c.target) || 1);
      if (!c.rewardHint) c.rewardHint = rewardHintForTier(c.rewardTier ?? 1);
      this.contract = c;
    } else {
      this.contract = null;
    }
  }
}

