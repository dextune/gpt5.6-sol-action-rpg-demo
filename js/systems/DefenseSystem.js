import * as THREE from 'three';
import { DEFENSE_CONFIG } from '../config.js';
import {
  ENEMY_TYPES, ZONE_BOSSES, ZONE_MINI_BOSSES, ZONE_SPAWNS, defenseRecipeForWave, enemiesByZoneRole,
} from '../data/content.js';
import { pickDefenseEncounter, pickDefenseMutator } from '../data/defenseContent.js';
import { chance, clamp, weightedPick } from '../core/Utils.js';
import { createGameContext } from '../core/GameContext.js';

const TMP_UP = new THREE.Vector3(0, 1, 0);
const TMP_HAZARD = new THREE.Vector3();

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
    this.encounter = null;
    this.powerShards = 0;
    this.victory = false;
    this.hazardTimer = 0;
    this.bloodTempo = 0;
    this.champions = [];
    this.breakValue = 0;
    this.breakWindow = 0;
    this.breakTarget = null;
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
      this.#tickCombatDrama(delta);
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
    if (this.mutator?.id === 'blood_tempo') {
      this.bloodTempo = Math.min(2.4, this.bloodTempo + 0.55);
      const player = this.game.player;
      if (player?.runMods) {
        player.runMods.haste = Math.min(0.55, (player.runMods.haste ?? 0) + 0.04);
        player.invalidateStats?.();
      }
    }
    if (enemy === this.breakTarget) {
      this.breakTarget = null;
      this.breakWindow = 0;
      this.breakValue = 0;
    }
    this.champions = this.champions.filter(entry => entry?.alive && entry !== enemy);
  }

  /** Called from CombatSystem on Defense hits against wave champions. */
  onChampionHit(enemy, result, options = {}) {
    if (this.game.mode !== 'defense' || this.phase !== 'combat') return;
    if (!enemy?.alive || !enemy.defenseWave) return;
    if (!(enemy.boss || enemy.elite || enemy.data?.miniBoss)) return;
    const cfg = DEFENSE_CONFIG;
    if (this.breakWindow > 0 && this.breakTarget === enemy) return;
    let gain = options.skill ? cfg.champBreakSkill : cfg.champBreakBasic;
    if (options.critical || options.finisher) gain += cfg.champBreakCritBonus;
    this.breakTarget = enemy;
    this.breakValue = Math.min(cfg.champBreakMax, this.breakValue + gain);
    if (this.breakValue >= cfg.champBreakMax) {
      this.breakValue = cfg.champBreakMax;
      this.breakWindow = cfg.champBreakWindow;
      enemy.applyStun?.(Math.min(1.2, cfg.champBreakWindow * 0.45));
      this.game.effects?.recipeJudgmentApex?.(enemy.position, {
        primary: 0xffe38a, secondary: 0xffc45c, core: 0xfff6d0, accent: 0xffd26b, dust: 0xc8a858,
      }, 3.2);
      this.game.ui?.notify?.('BREAK · Champion exposed!', 'critical', 2.4);
      this.game.audio?.boss?.();
    }
  }

  damageMultiplierFor(enemy) {
    if (this.breakWindow > 0 && this.breakTarget === enemy) {
      return DEFENSE_CONFIG.champBreakDamageMul ?? 1.2;
    }
    return 1;
  }

  spawnWave() {
    const cfg = DEFENSE_CONFIG;
    const wave = Math.max(1, Math.min(cfg.maxWave, this.wave));
    const zoneId = this.#zoneForWave(wave);
    const entries = ZONE_SPAWNS[zoneId] ?? ZONE_SPAWNS.verdant;
    const player = this.game.player;
    this.champions = [];
    this.breakValue = 0;
    this.breakWindow = 0;
    this.breakTarget = null;
    this.hazardTimer = 0;
    // Mutators every 3 waves from wave 3 — decision pool from defenseContent.
    if (wave >= 3 && wave % 3 === 0) {
      this.mutator = pickDefenseMutator(wave) ?? this.mutator;
      if (this.mutator && !this.mutatorsSeen.includes(this.mutator.id)) {
        this.mutatorsSeen.push(this.mutator.id);
      }
      if (this.mutator) {
        this.game.ui?.notify?.(
          `Mutator · ${this.mutator.label}${this.mutator.summary ? ` — ${this.mutator.summary}` : ''}`,
          'contract',
          3.4,
        );
      }
    }
    this.encounter = pickDefenseEncounter(wave);
    if (this.encounter) {
      this.game.ui?.notify?.(
        `${this.encounter.kicker} · ${this.encounter.name}`,
        'legendary',
        2.8,
      );
    }
    const mut = this.mutator;
    const enc = this.encounter;
    let count = Math.min(
      cfg.maxCount,
      cfg.baseCount + Math.floor((wave - 1) / 3) * cfg.countPerThreeWaves,
    );
    if (mut?.id === 'frenzy') count = Math.min(cfg.maxCount, count + 2);
    if (enc?.countBonus) count = Math.min(cfg.maxCount, count + enc.countBonus);
    if (enc?.countMul) count = Math.max(6, Math.round(count * enc.countMul));

    // Hybrid composition: role fractions from recipe, fill remainder by zone weights.
    let recipe = defenseRecipeForWave(wave);
    if (enc?.fodderBoost) {
      recipe = recipe.map(row => (
        row.role === 'fodder_swarm'
          ? { ...row, frac: Math.min(0.75, (row.frac ?? 0.35) + enc.fodderBoost) }
          : row
      ));
    }
    const roleQueue = this.#buildRoleQueue(recipe, count);
    const spawnInner = enc?.spawnInner ?? cfg.spawnInner;
    const spawnOuter = enc?.spawnOuter ?? cfg.spawnOuter;
    let elitesForced = 0;
    let spawned = 0;
    for (let i = 0; i < count; i += 1) {
      const wantRole = roleQueue[i] ?? null;
      const data = this.#pickDefenseEnemy(zoneId, entries, wantRole);
      if (!data) continue;

      let eliteChance = cfg.eliteChanceBase + (wave - cfg.eliteStartWave) * cfg.eliteChancePerWave;
      if (mut?.id === 'frenzy') eliteChance += 0.1;
      if (enc?.eliteChanceBonus) eliteChance += enc.eliteChanceBonus;
      if (wave >= 10) eliteChance += 0.04;
      let elite = wave >= cfg.eliteStartWave
        && chance(clamp(eliteChance, 0, cfg.eliteChanceCap ?? 0.48));
      if (enc?.guaranteedElites && elitesForced < enc.guaranteedElites) {
        elite = true;
        elitesForced += 1;
      }
      const eliteAffix = elite ? this.game.enemies.rollEliteAffix(zoneId) : null;
      // Fodder for bulk roles; tanks/artillery keep full stats more often.
      const bulkRole = data.role === 'fodder_swarm' || data.role === 'skirmisher';
      const fodder = !elite && !data.boss && (bulkRole ? Math.random() < 0.78 : Math.random() < 0.45);
      // Slightly less level pressure per body at higher roster counts.
      const levelPressure = Math.max(0, Math.floor((wave - 1) * cfg.levelBonusPerWave * 0.85));
      const adjustedLevel = Math.max(data.level, player.level + levelPressure);

      const position = this.#spawnPosition(player.position, spawnInner, spawnOuter, enc);
      const enemy = this.game.enemies.spawn(data, position, {
        level: adjustedLevel,
        elite,
        eliteAffix,
        fodder,
        wave,
        defenseWave: true,
      });
      if (enemy) {
        if (mut?.id === 'swift' || enc?.speedBonus) {
          enemy.speed *= 1.1 + (enc?.speedBonus ?? 0);
          enemy.attackCooldown *= 0.9;
        }
        if (mut?.id === 'armored') {
          enemy.defense *= 1.16;
          enemy.maxHp = Math.round(enemy.maxHp * 1.06);
          enemy.hp = enemy.maxHp;
        }
        if (mut?.id === 'glass_cannon') {
          enemy.damage *= 1.18;
          enemy.maxHp = Math.max(1, Math.round(enemy.maxHp * 0.78));
          enemy.hp = enemy.maxHp;
        }
        if (elite && enc?.exposeElites) {
          enemy.applyStatus?.('expose', { duration: 8, power: 0.22, damageAmp: 0.12 }, this.game);
        }
        if (elite || enemy.boss) this.champions.push(enemy);
        spawned += 1;
      }
    }

    // Mini-boss cadence: prefer zone mini-champion; every 2nd cadence escalates to apex boss.
    const champWaves = wave > 0 && (wave % cfg.miniBossEvery === 0 || enc?.forceChampion);
    if (champWaves) {
      const champCount = mut?.id === 'double_champ' && wave % cfg.miniBossEvery === 0 ? 2 : 1;
      for (let c = 0; c < champCount; c += 1) {
        const useApex = Math.floor(wave / cfg.miniBossEvery) % 2 === 0 && c === 0;
        const champId = ZONE_MINI_BOSSES[zoneId];
        const apexId = ZONE_BOSSES[zoneId] ?? ZONE_BOSSES.verdant;
        const champData = ENEMY_TYPES[useApex ? apexId : (champId ?? apexId)]
          ?? ENEMY_TYPES[apexId];
        if (!champData) continue;
        const bossLevel = Math.max(
          champData.level,
          player.level + (champData.miniBoss ? 1 : 2) + Math.floor((wave - 1) * cfg.levelBonusPerWave),
        );
        const position = this.#spawnPosition(player.position, spawnInner + 2, spawnOuter + 4, enc);
        const boss = this.game.enemies.spawn(champData, position, {
          level: bossLevel,
          elite: Boolean(champData.miniBoss),
          eliteAffix: champData.miniBoss ? this.game.enemies.rollEliteAffix(zoneId) : null,
          wave,
          defenseWave: true,
        });
        if (boss) {
          spawned += 1;
          this.champions.push(boss);
          this.game.audio?.boss?.();
          this.game.effects?.pillar?.(position, champData.accent, champData.miniBoss ? 8.5 : 11, { life: 1.25, bottom: 1.5 });
          this.game.effects?.ring?.(position, champData.accent, champData.miniBoss ? 5 : 6.5, { life: 1.0, startScale: .05 });
          this.game.effects?.ring?.(position, 0xffe38a, champData.miniBoss ? 3.2 : 4.2, { life: 0.55, startScale: .15, height: 0.12, opacity: 0.8 });
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
      mutatorSummary: this.mutator?.summary ?? null,
      mutatorsSeen: [...this.mutatorsSeen],
      encounter: this.encounter?.name ?? null,
      encounterKicker: this.encounter?.kicker ?? null,
      bestWave: this.bestWaveThisRun,
      powerShards: this.powerShards,
      victory: this.victory,
      breakValue: this.breakValue,
      breakMax: DEFENSE_CONFIG.champBreakMax,
      breakWindow: this.breakWindow,
      breakTargetAlive: Boolean(this.breakTarget?.alive),
    };
  }

  #spawnPosition(origin, inner, outer, enc) {
    if (enc?.spawnArc) {
      const angle = (Math.floor(this.wave * 1.7) % 8) * (Math.PI / 4);
      const dist = inner + Math.random() * Math.max(0.5, outer - inner);
      const pos = origin.clone().add(new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist));
      this.game.world?.resolvePosition?.(pos, 0.55);
      return pos;
    }
    return this.game.world.randomSpawnAround(origin, inner, outer);
  }

  #tickCombatDrama(delta) {
    const cfg = DEFENSE_CONFIG;
    const player = this.game.player;
    if (!player?.alive) return;

    if (this.breakWindow > 0) {
      this.breakWindow = Math.max(0, this.breakWindow - delta);
      if (this.breakWindow <= 0) {
        this.breakValue = 0;
        this.breakTarget = null;
      }
    }

    if (this.bloodTempo > 0) {
      this.bloodTempo = Math.max(0, this.bloodTempo - delta);
      if (this.bloodTempo <= 0 && player.runMods) {
        // Soft decay of temporary blood-tempo haste bump.
        player.runMods.haste = Math.max(
          Math.min(0.45, this.wave * cfg.runHastePerWave),
          (player.runMods.haste ?? 0) - 0.08,
        );
        player.invalidateStats?.();
      }
    }

    if (this.mutator?.id === 'dark_ring') {
      const dist = Math.hypot(player.position.x, player.position.z);
      if (dist > (cfg.darkRingRadius ?? 18)) {
        const chip = Math.max(1, Math.round(player.maxHp * (cfg.darkRingDpsRatio ?? 0.04) * delta));
        player.takeDamage?.(chip, new THREE.Vector3(-player.position.x, 0, -player.position.z).normalize());
      }
    }

    if (this.mutator?.id === 'no_potion') {
      player.potionLock = true;
    } else if (player.potionLock) {
      player.potionLock = false;
    }

    if (this.encounter?.hazard) {
      this.hazardTimer -= delta;
      if (this.hazardTimer <= 0) {
        this.hazardTimer = this.encounter.hazardCadence ?? 4.2;
        this.#pulseHazard();
      }
    }
  }

  #pulseHazard() {
    const player = this.game.player;
    if (!player?.alive) return;
    const radius = this.encounter?.hazardRadius ?? 3.4;
    const angle = Math.random() * Math.PI * 2;
    const dist = 4 + Math.random() * 10;
    TMP_HAZARD.set(
      player.position.x + Math.cos(angle) * dist,
      0,
      player.position.z + Math.sin(angle) * dist,
    );
    this.game.world?.resolvePosition?.(TMP_HAZARD, 0.5);
    this.game.effects?.ring?.(TMP_HAZARD, 0xff6a4a, radius, { life: 0.85, startScale: 0.08, opacity: 0.7 });
    this.game.effects?.groundDecal?.(TMP_HAZARD, 0xff9040, radius * 0.9, { life: 1.1, opacity: 0.4, startScale: 0.15 });
    this.game.defer?.(0.55, () => {
      if (this.game.mode !== 'defense' || this.phase !== 'combat' || !player.alive) return;
      this.game.effects?.burst?.(TMP_HAZARD.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xff7040, 22, {
        speed: 5.5, size: 0.3, life: 0.45, upward: 0.5,
      });
      const dmg = Math.max(2, Math.round(player.maxHp * (this.encounter?.hazardDamageRatio ?? 0.055)));
      if (player.position.distanceTo(TMP_HAZARD) <= radius + 0.6) {
        player.takeDamage?.(dmg, player.position.clone().sub(TMP_HAZARD).setY(0).normalize());
      }
    });
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
    // Preview next wave identity during prep so the climb feels authored.
    this.encounter = pickDefenseEncounter(this.wave);
    const encName = this.encounter?.name ? ` · ${this.encounter.name}` : '';
    const mutName = this.mutator?.label ? ` · ${this.mutator.label}` : '';
    this.game.ui?.notify?.(`Wave ${this.wave} prep${encName}${mutName}`, 'contract', 2.4);
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
    if (this.mutator?.id === 'no_potion' || (cleared % 4 === 0 && this.game.player.potions < this.game.player.maxPotions)) {
      if (this.game.player.potions < this.game.player.maxPotions) {
        this.game.player.potions = Math.min(this.game.player.maxPotions, this.game.player.potions + 1);
        this.game.ui?.notify?.(
          this.mutator?.id === 'no_potion' ? 'Dry Canteen ends · potion +1' : 'Defense supply · potion +1',
          'heal',
          2.4,
        );
      }
    }
    if (this.game.player.potionLock) this.game.player.potionLock = false;

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
    this.game.effects?.ring?.(pos, color, 5.2 + Math.min(5, cleared * 0.05), { life: .85, startScale: .05 });
    this.game.effects?.ring?.(pos, 0xffe38a, 3.2, { life: .45, startScale: .12, height: 0.1, opacity: 0.75 });
    this.game.effects?.burst?.(pos.clone().addScaledVector(TMP_UP, .9), color, 22 + Math.min(24, cleared), {
      speed: 5.0, size: .3, life: .6, upward: .4,
    });
    this.game.effects?.starburst?.(pos.clone().addScaledVector(TMP_UP, 1.1), color, 2.6, { life: 0.28 });
    if (cleared % 5 === 0) {
      this.game.effects?.pillar?.(pos, 0xffe38a, 12, { life: 1.25, bottom: 1.7, opacity: .52 });
      this.game.effects?.verticalBeam?.(pos, 0xffc45c, 9, { life: 0.5, bottom: 0.55, opacity: 0.42 });
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
