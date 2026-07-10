import { HUNT_TITLES, ZONES } from '../data/content.js';
import { clamp, pick, randInt, uid } from '../core/Utils.js';

export class HuntSystem {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
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
  }

  get worldTier() {
    return Math.max(1, 1 + Math.floor((this.game.player.level - 1) / 10));
  }

  get hunterTitle() {
    return [...HUNT_TITLES].reverse().find(entry => this.totalKills >= entry.kills)?.name ?? HUNT_TITLES[0].name;
  }

  get bossReady() { return this.bossCharge >= 100; }

  update(delta) {
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
      this.bossCharge = clamp(this.bossCharge + (enemy.elite ? 9 : 2.35), 0, 100);
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
    if (contract.type === 'kills') amount = 1;
    else if (contract.type === 'elite' && enemy.elite) amount = 1;
    else if (contract.type === 'boss' && enemy.boss) amount = 1;
    else if (contract.type === 'zone' && enemy.data.zone === contract.zoneId) amount = 1;
    else if (contract.type === 'streak' && this.streak >= contract.target) contract.progress = contract.target;
    contract.progress = clamp(contract.progress + amount, 0, contract.target);
    if (contract.progress >= contract.target) this.#completeContract();
  }

  #completeContract() {
    const contract = this.contract;
    if (!contract || contract.complete) return;
    contract.complete = true;
    this.completedContracts += 1;
    const reward = this.game.loot.grantContractReward(contract.rewardTier);
    this.game.ui.notify(`Hunt contract complete · ${contract.label} · ${reward.gold}G`, 'contract', 4.4);
    this.game.audio.levelUp();
    this.game.player.skillPoints += contract.rewardTier >= 4 ? 1 : 0;
    this.contractCooldown = 1.8;
    this.game.requestSave?.();
    this.game.defer?.(1.9, () => {
      this.contract = this.#makeContract();
      this.game.ui.notify(`New hunt contract · ${this.contract.label}`, 'contract', 3.4);
    });
  }

  #makeContract() {
    const level = this.game.player.level;
    const currentZone = this.game.world.currentZone?.id ?? 'verdant';
    const pool = ['kills', 'zone', 'elite'];
    if (level >= 8) pool.push('streak');
    if (level >= 12) pool.push('boss');
    const type = pick(pool);
    const scale = Math.max(0, Math.floor(level / 10));
    const contract = {
      id: uid('contract'), type, progress: 0, complete: false,
      zoneId: currentZone, rewardTier: clamp(1 + Math.floor(level / 16), 1, 5),
      target: 0, label: '', description: '',
    };
    if (type === 'kills') {
      contract.target = 18 + scale * 4 + randInt(0, 8);
      contract.label = `Defeat ${contract.target} monsters`;
      contract.description = 'Hunt wild monsters of any kind.';
    } else if (type === 'zone') {
      const zone = ZONES[currentZone];
      contract.target = 14 + scale * 3 + randInt(0, 6);
      contract.label = `${zone.name} purge ${contract.target} monsters`;
      contract.description = `Defeat monsters in ${zone.name}.`;
    } else if (type === 'elite') {
      contract.target = 2 + Math.min(4, Math.floor(level / 18));
      contract.label = `Defeat ${contract.target} elite monsters`;
      contract.description = 'Track elite specimens wrapped in a golden aura.';
    } else if (type === 'streak') {
      contract.target = 10 + Math.min(15, Math.floor(level / 3));
      contract.label = `Achieve a ${contract.target}-kill streak`;
      contract.description = 'Keep hunting without letting the streak lapse.';
    } else {
      contract.target = 1;
      contract.label = 'Defeat 1 zone boss';
      contract.description = 'Fill the boss gauge to summon the zone boss.';
      contract.rewardTier = clamp(contract.rewardTier + 1, 2, 5);
    }
    return contract;
  }

  serialize() {
    return {
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
    this.reset();
    this.totalKills = Math.max(0, Number(state.totalKills) || 0);
    this.elitesKilled = Math.max(0, Number(state.elitesKilled) || 0);
    this.bossesKilled = Math.max(0, Number(state.bossesKilled) || 0);
    this.completedContracts = Math.max(0, Number(state.completedContracts) || 0);
    this.killsByZone = { ...this.killsByZone, ...(state.killsByZone ?? {}) };
    this.killsByType = { ...(state.killsByType ?? {}) };
    this.bestStreak = Math.max(0, Number(state.bestStreak) || 0);
    this.bossCharge = clamp(Number(state.bossCharge) || 0, 0, 99.5);
    if (state.contract && typeof state.contract === 'object' && !state.contract.complete) {
      this.contract = { ...state.contract, progress: clamp(Number(state.contract.progress) || 0, 0, Number(state.contract.target) || 1) };
    }
  }
}
