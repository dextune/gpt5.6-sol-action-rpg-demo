import { DEFENSE_CONFIG } from '../config.js';
import { ENEMY_TYPES, ZONE_BOSSES, ZONE_SPAWNS } from '../data/content.js';
import { chance, clamp, weightedPick } from '../core/Utils.js';

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
    this.reset();
  }

  reset() {
    this.phase = 'idle'; // idle | prep | combat | clear | failed
    this.wave = 0;
    this.prepTimer = 0;
    this.clearTimer = 0;
    this.bestWaveThisRun = 0;
    this.killsThisRun = 0;
    this.lastSpawned = 0;
    this.mutator = null;
    this.mutatorsSeen = [];
  }

  /** Begin an endless Defense run at wave 1. */
  start() {
    this.reset();
    this.wave = 1;
    this.#enterPrep();
  }

  /** Called from Game death branch when wired. */
  fail() {
    if (this.phase === 'failed' || this.phase === 'idle') return;
    this.phase = 'failed';
    this.prepTimer = 0;
    this.clearTimer = 0;
  }

  update(delta) {
    if (this.game.mode !== 'defense') return;
    if (this.phase === 'idle' || this.phase === 'failed') return;

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
        this.wave += 1;
        this.#enterPrep();
      }
    }
  }

  onKill(enemy) {
    if (this.phase === 'idle' || this.phase === 'failed') return;
    if (!enemy?.defenseWave) return;
    this.killsThisRun += 1;
    // Clear detection is polled in update; onKill is bookkeeping only.
  }

  spawnWave() {
    const cfg = DEFENSE_CONFIG;
    const wave = Math.max(1, this.wave);
    const zoneId = this.#zoneForWave(wave);
    const entries = ZONE_SPAWNS[zoneId] ?? ZONE_SPAWNS.verdant;
    const player = this.game.player;
    // Mutators every 3 waves from wave 3 (B6).
    this.mutator = wave >= 3 && wave % 3 === 0 ? this.#pickMutator(wave) : this.mutator;
    if (this.mutator && !this.mutatorsSeen.includes(this.mutator.id)) {
      this.mutatorsSeen.push(this.mutator.id);
      this.game.ui?.notify?.(`Mutator · ${this.mutator.label}`, 'contract', 3.2);
    }
    const mut = this.mutator;
    let count = Math.min(
      cfg.maxCount,
      cfg.baseCount + Math.floor((wave - 1) / 2) * cfg.countPerTwoWaves,
    );
    if (mut?.id === 'frenzy') count = Math.min(cfg.maxCount, count + 2);

    let spawned = 0;
    for (let i = 0; i < count; i += 1) {
      const typeId = weightedPick(entries);
      const data = ENEMY_TYPES[typeId];
      if (!data) continue;

      const level = Math.max(
        data.level,
        player.level + Math.floor((wave - 1) * cfg.levelBonusPerWave),
      );
      let eliteChance = cfg.eliteChanceBase + (wave - cfg.eliteStartWave) * cfg.eliteChancePerWave;
      if (mut?.id === 'frenzy') eliteChance += 0.12;
      const elite = wave >= cfg.eliteStartWave
        && chance(clamp(eliteChance, 0, 0.55));
      const eliteAffix = elite ? this.game.enemies.rollEliteAffix() : null;

      const position = this.game.world.randomSpawnAround(
        player.position,
        cfg.spawnInner,
        cfg.spawnOuter,
      );
      const enemy = this.game.enemies.spawn(data, position, {
        level,
        elite,
        eliteAffix,
        wave,
        defenseWave: true,
      });
      if (enemy) {
        if (mut?.id === 'swift') {
          enemy.speed *= 1.12;
          enemy.attackCooldown *= 0.88;
        } else if (mut?.id === 'armored') {
          enemy.defense *= 1.22;
          enemy.maxHp = Math.round(enemy.maxHp * 1.08);
          enemy.hp = enemy.maxHp;
        }
        spawned += 1;
      }
    }

    // Mini-boss cadence: one boss from the rotated zone's boss table.
    if (wave > 0 && wave % cfg.miniBossEvery === 0) {
      const bossId = ZONE_BOSSES[zoneId] ?? ZONE_BOSSES.verdant;
      const bossData = ENEMY_TYPES[bossId];
      if (bossData) {
        const bossLevel = Math.max(
          bossData.level,
          player.level + 2 + Math.floor((wave - 1) * cfg.levelBonusPerWave),
        );
        const position = this.game.world.randomSpawnAround(
          player.position,
          cfg.spawnInner + 2,
          cfg.spawnOuter + 4,
        );
        const boss = this.game.enemies.spawn(bossData, position, {
          level: bossLevel,
          elite: false,
          wave,
          defenseWave: true,
        });
        if (boss) {
          spawned += 1;
          this.game.audio?.boss?.();
          this.game.effects?.pillar?.(position, bossData.accent, 10, { life: 1.1, bottom: 1.6 });
          this.game.effects?.ring?.(position, bossData.accent, 6, { life: .9, startScale: .06 });
          this.game.ui?.notify?.(`Wave ${wave} boss · ${bossData.name}`, 'boss', 3.6);
        }
      }
    }

    this.lastSpawned = spawned;
    if (spawned > 0) {
      this.game.ui?.notify?.(`Wave ${wave} · ${spawned} enemies appear`, 'contract', 2.8);
    }
    return spawned;
  }

  get hud() {
    return {
      wave: this.wave,
      remaining: this.#countLivingWaveEnemies(),
      phase: this.phase,
      kills: this.killsThisRun,
      totalKills: this.killsThisRun,
      mutator: this.mutator?.label ?? null,
      mutatorId: this.mutator?.id ?? null,
      mutatorsSeen: [...this.mutatorsSeen],
      bestWave: this.bestWaveThisRun,
    };
  }

  #pickMutator(wave) {
    const pool = [
      { id: 'swift', label: 'Swift Tide' },
      { id: 'armored', label: 'Iron Tide' },
      { id: 'frenzy', label: 'Frenzy Tide' },
      { id: 'scarce', label: 'Scarce Tide' },
    ];
    return pool[Math.floor(wave / 3) % pool.length];
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
    this.clearTimer = 0.85;
    this.bestWaveThisRun = Math.max(this.bestWaveThisRun, cleared);

    const xp = cfg.clearXpBase + (cleared - 1) * cfg.clearXpPerWave;
    const gold = cfg.clearGoldBase + (cleared - 1) * cfg.clearGoldPerWave;
    const xpResult = this.game.player.addXp(xp);
    const goldGained = this.game.player.addGold(gold);

    if (cleared > 0 && cleared % cfg.gearEveryWaves === 0) {
      this.#grantGearReward(cleared);
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
      }
    }
    this.game.audio?.levelUp?.();
    this.game.effects?.ring?.(this.game.player.position, 0xffd36d, 4.2, { life: .7 });
  }

  #grantGearReward(cleared) {
    const loot = this.game.loot;
    const player = this.game.player;
    if (!loot || !player) return;

    const floor = cleared >= 12 ? 'epic' : cleared >= 6 ? 'rare' : 'uncommon';
    const gear = loot.generateGear(player.level + Math.floor(cleared / 3), { floor });
    const result = player.addGear?.(gear);

    if (result?.added) {
      const equipNote = result.equipped ? ' equipped' : ' acquired';
      this.game.ui?.notify?.(`Defense reward · ${gear.name}${equipNote}`, 'contract', 3.6);
      if (gear.rarity === 'legendary') this.game.audio?.legendary?.();
      return;
    }

    // Inventory full or addGear missing — drop beside the player like contract rewards.
    const angle = Math.random() * Math.PI * 2;
    const dropPos = player.position.clone();
    dropPos.x += Math.cos(angle) * 1.8;
    dropPos.z += Math.sin(angle) * 1.8;
    loot.spawnGear?.(gear, dropPos);
    this.game.ui?.notify?.(`Defense reward · ${gear.name} dropped`, 'contract', 3.6);
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
