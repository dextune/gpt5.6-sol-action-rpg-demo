import * as THREE from 'three';
import { DEFENSE_CONFIG } from '../config.js';
import {
  ENEMY_TYPES, ZONE_BOSSES, ZONE_MINI_BOSSES, ZONE_SPAWNS, defenseRecipeForWave, enemiesByZoneRole,
} from '../data/content.js';
import { chance, clamp, weightedPick } from '../core/Utils.js';
import { createGameContext } from '../core/GameContext.js';

const TMP_UP = new THREE.Vector3(0, 1, 0);

/** Zone pools rotate by wave band (read-only shared content). */
const DEFENSE_ZONE_ORDER = Object.freeze([
  'verdant', 'forest', 'canyon', 'frost', 'ember', 'astral',
]);

/**
 * Defense mode wave FSM. Hunt paths never call this; when mode !== 'defense', update is a no-op.
 * Does not own combat damage, Hunt contracts, or save blobs.
 */
export class DefenseSystem {
  constructor(game) {
    this.game = game;
    this.ctx = game?.ctx ?? createGameContext(game);
    this.reset();
  }

  reset() {
    this.phase = 'idle'; // idle | prep | combat | clear | failed | victory
    this.wave = 0;
    this.prepTimer = 0;
    this.clearTimer = 0;
    this.bestWaveThisRun = 0;
    this.killsThisRun = 0;
    this.lastSpawned = 0;
    this.mutator = null;
    this.mutatorsSeen = [];
    this.powerShards = 0;
    this.victory = false;
  }

  /** Begin an endless Defense run at wave 1. */
  start() {
    this.reset();
    this.wave = 1;
    this.#applyRunMods();
    // Spend opener skill points into actives/passives for immediate spectacle.
    this.#autoSpendSkillPoints();
    this.#enterPrep();
  }

  /** Called from Game death branch when wired. */
  fail() {
    if (this.phase === 'failed' || this.phase === 'idle' || this.phase === 'victory') return;
    this.phase = 'failed';
    this.prepTimer = 0;
    this.clearTimer = 0;
  }

  update(delta) {
    if (this.game.mode !== 'defense') return;
    if (this.phase === 'idle' || this.phase === 'failed' || this.phase === 'victory') return;

    if (this.phase === 'prep') {
      this.prepTimer -= delta;
      if (this.prepTimer <= 0) {
        this.spawnWave();
        this.phase = 'combat';
      }
      return;
    }

    if (this.phase === 'combat') {
      if (this.#countLivingWaveEnemies() <= 0) {
        this.#onWaveClear();
      }
      return;
    }

    if (this.phase === 'clear') {
      this.clearTimer -= delta;
      if (this.clearTimer <= 0) {
        if (this.victory) {
          this.phase = 'victory';
          this.game?.handleDefenseVictory?.();
          return;
        }
        this.wave += 1;
        this.#enterPrep();
      }
    }
  }

  onKill(enemy) {
    if (this.phase === 'idle' || this.phase === 'failed' || this.phase === 'victory') return;
    if (!enemy?.defenseWave) return;
    this.killsThisRun += 1;
    // Clear detection is polled in update; onKill is bookkeeping only.
  }

  spawnWave() {
    const cfg = DEFENSE_CONFIG;
    const wave = Math.max(1, Math.min(cfg.maxWave, this.wave));
    const zoneId = this.#zoneForWave(wave);
    const entries = ZONE_SPAWNS[zoneId] ?? ZONE_SPAWNS.verdant;
    const player = this.game.player;
    // Mutators every 3 waves from wave 3 (B6). Soften early scarce.
    this.mutator = wave >= 3 && wave % 3 === 0 ? this.#pickMutator(wave) : this.mutator;
    if (this.mutator && !this.mutatorsSeen.includes(this.mutator.id)) {
      this.mutatorsSeen.push(this.mutator.id);
      this.game.ui?.notify?.(`Mutator · ${this.mutator.label}`, 'contract', 3.2);
    }
    const mut = this.mutator;
    let count = Math.min(
      cfg.maxCount,
      cfg.baseCount + Math.floor((wave - 1) / 3) * cfg.countPerThreeWaves,
    );
    if (mut?.id === 'frenzy') count = Math.min(cfg.maxCount, count + 2);

    // Hybrid composition: role fractions from recipe, fill remainder by zone weights.
    const recipe = defenseRecipeForWave(wave);
    const roleQueue = this.#buildRoleQueue(recipe, count);
    let spawned = 0;
    for (let i = 0; i < count; i += 1) {
      const wantRole = roleQueue[i] ?? null;
      const data = this.#pickDefenseEnemy(zoneId, entries, wantRole);
      if (!data) continue;

      let eliteChance = cfg.eliteChanceBase + (wave - cfg.eliteStartWave) * cfg.eliteChancePerWave;
      if (mut?.id === 'frenzy') eliteChance += 0.1;
      if (wave >= 10) eliteChance += 0.04;
      const elite = wave >= cfg.eliteStartWave
        && chance(clamp(eliteChance, 0, cfg.eliteChanceCap ?? 0.48));
      const eliteAffix = elite ? this.game.enemies.rollEliteAffix(zoneId) : null;
      // Fodder for bulk roles; tanks/artillery keep full stats more often.
      const bulkRole = data.role === 'fodder_swarm' || data.role === 'skirmisher';
      const fodder = !elite && !data.boss && (bulkRole ? Math.random() < 0.78 : Math.random() < 0.45);
      // Slightly less level pressure per body at higher roster counts.
      const levelPressure = Math.max(0, Math.floor((wave - 1) * cfg.levelBonusPerWave * 0.85));
      const adjustedLevel = Math.max(data.level, player.level + levelPressure);

      const position = this.game.world.randomSpawnAround(
        player.position,
        cfg.spawnInner,
        cfg.spawnOuter,
      );
      const enemy = this.game.enemies.spawn(data, position, {
        level: adjustedLevel,
        elite,
        eliteAffix,
        fodder,
        wave,
        defenseWave: true,
      });
      if (enemy) {
        if (mut?.id === 'swift') {
          enemy.speed *= 1.1;
          enemy.attackCooldown *= 0.9;
        } else if (mut?.id === 'armored') {
          enemy.defense *= 1.16;
          enemy.maxHp = Math.round(enemy.maxHp * 1.06);
          enemy.hp = enemy.maxHp;
        }
        spawned += 1;
      }
    }

    // Mini-boss cadence: prefer zone mini-champion; every 2nd cadence escalates to apex boss.
    if (wave > 0 && wave % cfg.miniBossEvery === 0) {
      const useApex = Math.floor(wave / cfg.miniBossEvery) % 2 === 0;
      const champId = ZONE_MINI_BOSSES[zoneId];
      const apexId = ZONE_BOSSES[zoneId] ?? ZONE_BOSSES.verdant;
      const champData = ENEMY_TYPES[useApex ? apexId : (champId ?? apexId)]
        ?? ENEMY_TYPES[apexId];
      if (champData) {
        const bossLevel = Math.max(
          champData.level,
          player.level + (champData.miniBoss ? 1 : 2) + Math.floor((wave - 1) * cfg.levelBonusPerWave),
        );
        const position = this.game.world.randomSpawnAround(
          player.position,
          cfg.spawnInner + 2,
          cfg.spawnOuter + 4,
        );
        const boss = this.game.enemies.spawn(champData, position, {
          level: bossLevel,
          elite: Boolean(champData.miniBoss),
          eliteAffix: champData.miniBoss ? this.game.enemies.rollEliteAffix(zoneId) : null,
          wave,
          defenseWave: true,
        });
        if (boss) {
          spawned += 1;
          this.game.audio?.boss?.();
          this.game.effects?.pillar?.(position, champData.accent, champData.miniBoss ? 7.5 : 10, { life: 1.1, bottom: 1.4 });
          this.game.effects?.ring?.(position, champData.accent, champData.miniBoss ? 4.5 : 6, { life: .9, startScale: .06 });
          const tag = champData.miniBoss ? 'Champion' : 'Boss';
          this.game.ui?.notify?.(`Wave ${wave} ${tag} · ${champData.name}`, 'boss', 3.6);
        }
      }
    }

    this.lastSpawned = spawned;
    if (spawned > 0) {
      const band = wave >= 100 ? ' · Deep siege' : wave >= 50 ? ' · Hard siege' : wave >= 20 ? ' · Rising tide' : '';
      this.game.ui?.notify?.(`Wave ${wave} · ${spawned} enemies appear${band}`, 'contract', 2.8);
    }
    return spawned;
  }

  get hud() {
    return {
      wave: this.wave,
      maxWave: DEFENSE_CONFIG.maxWave,
      remaining: this.#countLivingWaveEnemies(),
      phase: this.phase,
      kills: this.killsThisRun,
      totalKills: this.killsThisRun,
      mutator: this.mutator?.label ?? null,
      mutatorId: this.mutator?.id ?? null,
      mutatorsSeen: [...this.mutatorsSeen],
      bestWave: this.bestWaveThisRun,
      powerShards: this.powerShards,
      victory: this.victory,
    };
  }

  #pickMutator(wave) {
    const pool = [
      { id: 'swift', label: 'Swift Tide' },
      { id: 'armored', label: 'Iron Tide' },
      { id: 'frenzy', label: 'Frenzy Tide' },
      // Scarce starts later so early waves stay drinkable.
      ...(wave >= 12 ? [{ id: 'scarce', label: 'Scarce Tide' }] : []),
    ];
    return pool[Math.floor(wave / 3) % pool.length];
  }

  /** Expand role fractions into a shuffled queue of length `count`. */
  #buildRoleQueue(recipe, count) {
    const queue = [];
    let assigned = 0;
    for (let i = 0; i < recipe.length; i += 1) {
      const row = recipe[i];
      const n = i === recipe.length - 1
        ? Math.max(0, count - assigned)
        : Math.max(0, Math.round(count * (row.frac ?? 0)));
      for (let k = 0; k < n; k += 1) queue.push(row.role);
      assigned += n;
    }
    while (queue.length < count) queue.push(recipe[0]?.role ?? 'fodder_swarm');
    // Shuffle so tanks/ranged are not clumped at the front of spawn order.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    return queue.slice(0, count);
  }

  #pickDefenseEnemy(zoneId, entries, wantRole) {
    if (wantRole) {
      const pool = enemiesByZoneRole(zoneId, wantRole);
      if (pool.length) {
        const weighted = pool.map(e => ({
          id: e.id,
          weight: (e.weight ?? 1) * (e.defenseWeight ?? 1),
        }));
        const id = weightedPick(weighted);
        if (id && ENEMY_TYPES[id]) return ENEMY_TYPES[id];
      }
      // Soft fallbacks so missing role in a zone does not empty the slot.
      const fallbackRoles = wantRole === 'support' ? ['artillery', 'controller', 'bruiser']
        : wantRole === 'controller' ? ['artillery', 'glass_ranged']
          : wantRole === 'artillery' ? ['glass_ranged', 'bruiser']
            : wantRole === 'frontline' ? ['bruiser', 'fodder_swarm']
              : ['fodder_swarm', 'bruiser', 'skirmisher'];
      for (const role of fallbackRoles) {
        const alt = enemiesByZoneRole(zoneId, role);
        if (alt.length) {
          const id = weightedPick(alt.map(e => ({ id: e.id, weight: e.weight ?? 1 })));
          if (id && ENEMY_TYPES[id]) return ENEMY_TYPES[id];
        }
      }
    }
    const typeId = weightedPick(entries);
    return ENEMY_TYPES[typeId] ?? null;
  }

  /** Meta merge helper for SaveManager (best wave this run). */
  serializeMeta() {
    return {
      bestWave: this.bestWaveThisRun,
      lastWave: Math.max(0, this.wave - (this.phase === 'prep' && this.wave > 1 ? 1 : 0)),
      kills: this.killsThisRun,
    };
  }

  #enterPrep() {
    this.phase = 'prep';
    this.prepTimer = DEFENSE_CONFIG.prepSeconds;
    this.clearTimer = 0;
    this.game.ui?.notify?.(`Wave ${this.wave} prep…`, 'contract', 2.2);
  }

  #onWaveClear() {
    const cfg = DEFENSE_CONFIG;
    const cleared = this.wave;
    this.phase = 'clear';
    this.clearTimer = 0.9;
    this.bestWaveThisRun = Math.max(this.bestWaveThisRun, cleared);

    // XP scales super-linearly so deep climbs keep unlocking skills.
    const xp = Math.round(cfg.clearXpBase + (cleared - 1) * cfg.clearXpPerWave + Math.pow(cleared, 1.15) * 2.4);
    const gold = Math.round(cfg.clearGoldBase + (cleared - 1) * cfg.clearGoldPerWave + cleared * 1.1);
    const xpResult = this.game.player.addXp(xp);
    const goldGained = this.game.player.addGold(gold);

    this.#growRunMods(cleared);
    this.#autoSpendSkillPoints();
    this.#recoverBetweenWaves();

    if (cleared > 0 && cleared % cfg.goldMilestoneEveryWaves === 0) {
      this.#grantGoldMilestone(cleared);
    }
    if (cleared > 0 && cleared % cfg.powerShardEvery === 0) {
      this.#grantPowerShard(cleared);
    }
    // Occasional potion drip so scarce mutators don't brick long runs.
    if (cleared % 4 === 0 && this.game.player.potions < this.game.player.maxPotions) {
      this.game.player.potions = Math.min(this.game.player.maxPotions, this.game.player.potions + 1);
      this.game.ui?.notify?.('Defense supply · potion +1', 'heal', 2.4);
    }

    const leveled = Array.isArray(xpResult?.levelUps) && xpResult.levelUps.length > 0;
    const levelNote = leveled ? ` · Level up!` : '';
    this.game.ui?.notify?.(
      `Wave ${cleared} clear · XP +${xpResult?.amount ?? xp} · ${goldGained}G${levelNote}`,
      'level',
      3.4,
    );
    if (leveled) {
      for (const level of xpResult.levelUps) {
        this.game.ui?.notify?.(`LEVEL UP · Lv.${level}`, 'level', 3.2);
        this.#flashLevelUp(level);
      }
      // Spend any new points immediately for spectacle skills.
      this.#autoSpendSkillPoints();
    }
    this.game.audio?.levelUp?.();
    this.#waveClearSpectacle(cleared);

    if (cleared >= cfg.maxWave) {
      this.victory = true;
      this.clearTimer = 1.6;
      this.game.ui?.notify?.(`Defense conquered · Wave ${cfg.maxWave}!`, 'legendary', 5.5);
      this.game.audio?.legendary?.();
    }
  }

  #growRunMods(cleared) {
    const cfg = DEFENSE_CONFIG;
    const player = this.game.player;
    if (!player?.runMods) {
      player.runMods = { attack: 1, defense: 1, skillPower: 0, haste: 0, xp: 0 };
    }
    // Rebuild from cleared wave so loads/resets stay consistent.
    const shards = this.powerShards;
    player.runMods.attack = cfg.startAttackMul
      + cleared * cfg.runAttackPerWave
      + shards * cfg.powerShardAttack;
    player.runMods.defense = cfg.startDefenseMul
      + cleared * cfg.runDefensePerWave
      + shards * cfg.powerShardDefense;
    player.runMods.skillPower = cfg.startSkillPower
      + cleared * cfg.runSkillPowerPerWave
      + shards * cfg.powerShardSkill;
    player.runMods.haste = Math.min(0.45, cleared * cfg.runHastePerWave);
    player.runMods.xp = 0.22 + Math.min(0.55, cleared * 0.004);
    player.invalidateStats?.();
  }

  #applyRunMods() {
    const cfg = DEFENSE_CONFIG;
    const player = this.game.player;
    if (!player) return;
    player.runMods = {
      attack: cfg.startAttackMul,
      defense: cfg.startDefenseMul,
      skillPower: cfg.startSkillPower,
      haste: 0.04,
      xp: 0.28,
    };
    player.invalidateStats?.();
  }

  #grantPowerShard(cleared) {
    this.powerShards += 1;
    this.#growRunMods(cleared);
    this.game.ui?.notify?.(
      `Power shard ×${this.powerShards} · combat surges`,
      'legendary',
      3.2,
    );
    const pos = this.game.player.position;
    this.game.effects?.pillar?.(pos, 0xffc45c, 9, { life: 1.0, bottom: 1.4, opacity: .5 });
    this.game.effects?.ring?.(pos, 0xffe38a, 5.5, { life: .85, startScale: .08 });
    this.game.effects?.burst?.(pos.clone().addScaledVector(TMP_UP, 1), 0xffd36d, 28, {
      speed: 5.5, size: .34, life: .7, upward: .4,
    });
  }

  #recoverBetweenWaves() {
    const cfg = DEFENSE_CONFIG;
    const player = this.game.player;
    if (!player?.alive) return;
    const heal = Math.round(player.maxHp * cfg.clearHealRatio);
    const mp = Math.round(player.maxMp * cfg.clearMpRatio);
    player.heal?.(heal);
    player.mp = Math.min(player.maxMp, player.mp + mp);
    player.energy = Math.min(100, (player.energy ?? 0) + 28);
    // Partial invuln so next spawn doesn't chain-stun a recovering hero.
    player.invulnerable = Math.max(player.invulnerable ?? 0, 0.85);
  }

  /**
   * Prefer active combat skills first (spectacle), then passives.
   * Shared helper lives on Player; Defense keeps notify flavor.
   */
  #autoSpendSkillPoints() {
    const player = this.game.player;
    if (!player?.autoSpendSkillPoints) return;
    const spent = player.autoSpendSkillPoints({
      onUnlock: (skill) => this.game.ui?.notify?.(`Skill ready · ${skill.name} [${skill.key}]`, 'level', 3.0),
    });
    if (spent > 0) {
      this.game.ui?.notify?.(`Skills reinforced ×${spent}`, 'level', 2.6);
    }
  }

  #waveClearSpectacle(cleared) {
    const pos = this.game.player.position;
    const color = cleared % 5 === 0 ? 0xffc45c : 0x67dcff;
    this.game.effects?.ring?.(pos, color, 4.8 + Math.min(4, cleared * 0.04), { life: .75, startScale: .06 });
    this.game.effects?.burst?.(pos.clone().addScaledVector(TMP_UP, .9), color, 16 + Math.min(20, cleared), {
      speed: 4.2, size: .28, life: .55, upward: .35,
    });
    if (cleared % 5 === 0) {
      this.game.effects?.pillar?.(pos, 0xffe38a, 11, { life: 1.15, bottom: 1.6, opacity: .48 });
    }
  }

  #flashLevelUp(level) {
    const pos = this.game.player.position;
    this.game.effects?.pillar?.(pos, 0xffe38a, 8, { life: .9, bottom: 1.25 });
    this.game.effects?.ring?.(pos, 0xffe38a, 5.5, { life: .85, startScale: .05 });
    void level;
  }

  #grantGoldMilestone(cleared) {
    const loot = this.game.loot;
    const player = this.game.player;
    if (!loot || !player) return;
    const gold = player.addGold(Math.round(
      DEFENSE_CONFIG.clearGoldBase * 2 + cleared * (DEFENSE_CONFIG.clearGoldPerWave + 4),
    ));
    this.game.ui?.notify?.(`Defense milestone · +${gold}G`, 'contract', 3.6);
    this.#gearSpectacle(gold);
  }

  #gearSpectacle(gold) {
    const pos = this.game.player.position;
    const color = 0xffd36d;
    const intensity = Math.min(28, 10 + Math.round(Math.log10(Math.max(1, gold)) * 5));
    this.game.effects?.pillar?.(pos, color, 6 + intensity * .2, { life: 1.0, bottom: 1.1, opacity: .42 });
    this.game.effects?.burst?.(pos.clone().addScaledVector(TMP_UP, .5), color, intensity, {
      speed: 3.8, size: .25, life: .6, upward: .35,
    });
  }

  #zoneForWave(wave) {
    // Band of 2 waves per zone: 1–2 verdant, 3–4 forest, …
    const index = Math.floor(Math.max(0, wave - 1) / 2) % DEFENSE_ZONE_ORDER.length;
    return DEFENSE_ZONE_ORDER[index];
  }

  #countLivingWaveEnemies() {
    const list = this.game.enemies?.enemies ?? [];
    let count = 0;
    for (const enemy of list) {
      if (!enemy.alive) continue;
      // Include bosses tagged for the defense wave (clear must wait for them).
      if (enemy.defenseWave) count += 1;
    }
    return count;
  }
}
