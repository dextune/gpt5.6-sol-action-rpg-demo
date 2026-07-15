import * as THREE from 'three';
import {
  ENEMY_TYPES,
  SKILLS,
  ZONES,
  ZONE_BOSSES,
  ZONE_SPAWNS,
  getClassActiveSkills,
} from '../data/content.js';
import { skillMutationOptions } from '../data/skillCombat.js';
import {
  RUSH_CONFIG,
  RUSH_GRADES,
  RUSH_HAZARDS,
  RUSH_SCORE,
  buildRushPlan,
  buildTrophyOffers,
  createRushRng,
  dailyRushSeed,
  hashRushSeed,
  rushGrade,
  rushShuffle,
} from '../data/rushContent.js';
import { clamp } from '../core/Utils.js';

const UP = new THREE.Vector3(0, 1, 0);
const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();

function defaultMeta() {
  return {
    version: RUSH_CONFIG.contentVersion,
    runs: 0,
    completions: 0,
    bestScore: 0,
    bestGrade: 'C',
    lastScore: 0,
    daily: {},
    pendingGold: 0,
    pendingSkillPoints: 0,
    collectibles: {},
    claimedRuns: [],
  };
}

function safeMeta(value) {
  const base = defaultMeta();
  if (!value || typeof value !== 'object') return base;
  return {
    ...base,
    ...value,
    daily: value.daily && typeof value.daily === 'object' ? { ...value.daily } : {},
    collectibles: value.collectibles && typeof value.collectibles === 'object' ? { ...value.collectibles } : {},
    claimedRuns: Array.isArray(value.claimedRuns) ? value.claimedRuns.filter(Boolean).slice(-24) : [],
    pendingGold: clamp(Math.floor(Number(value.pendingGold) || 0), 0, RUSH_CONFIG.pendingRewardGoldCap),
    pendingSkillPoints: clamp(Math.floor(Number(value.pendingSkillPoints) || 0), 0, RUSH_CONFIG.pendingRewardSkillPointCap),
  };
}

function pointSegmentDistance(point, start, end) {
  TMP_A.copy(end).sub(start).setY(0);
  const lengthSq = Math.max(0.0001, TMP_A.lengthSq());
  TMP_B.copy(point).sub(start).setY(0);
  const t = clamp(TMP_B.dot(TMP_A) / lengthSq, 0, 1);
  TMP_C.copy(start).addScaledVector(TMP_A, t);
  return point.distanceTo(TMP_C);
}

export class RushSystem {
  constructor(game) {
    this.game = game;
    this.meta = this.#loadMeta();
    this.reset();
  }

  reset() {
    this.#clearHazards();
    this.phase = 'idle';
    this.runId = null;
    this.daily = false;
    this.seed = 0;
    this.plan = null;
    this.rng = createRushRng(1);
    this.timeRemaining = RUSH_CONFIG.maxSeconds;
    this.elapsed = 0;
    this.phaseTimer = 0;
    this.encounterRemaining = 0;
    this.encounterIndex = -1;
    this.encounter = null;
    this.objectiveProgress = 0;
    this.objectiveTarget = 0;
    this.encounterSucceeded = true;
    this.pendingStep = null;
    this.draft = null;
    this.draftQueue = [];
    this.usedDrafts = new Set();
    this.tasks = [];
    this.hazardTimer = RUSH_CONFIG.hazardFirstDelay;
    this.hazardPulse = 0;
    this.collapseFxTimer = 0;
    this.collapseDamageTimer = 0;
    this.collapseRadius = 0;
    this.arenaCenter ??= new THREE.Vector3();
    this.arenaCenter.set(0, 0, 0);
    this.hazardSpeedBonus = 0;
    this.boss = null;
    this.breakValue = 0;
    this.breakWindow = 0;
    this.breaks = 0;
    this.executed = false;
    this.score = 0;
    this.kills = 0;
    this.elites = 0;
    this.bosses = 0;
    this.peakChain = 0;
    this.multikills = 0;
    this.multikillPeak = 0;
    this.killBurstCount = 0;
    this.killBurstTimer = 0;
    this.damageTaken = 0;
    this.lastHp = 0;
    this.encountersCleared = 0;
    this.encountersFailed = 0;
    this.result = null;
    this.game?.ui?.hideRushOverlays?.();
  }

  get blocksSimulation() {
    return this.phase === 'draft' || this.phase === 'result';
  }

  get active() {
    return this.phase !== 'idle' && this.phase !== 'result';
  }

  get hud() {
    const encounter = this.encounter;
    return {
      phase: this.phase,
      daily: this.daily,
      seed: this.seed,
      timeRemaining: this.timeRemaining,
      elapsed: this.elapsed,
      act: this.phase === 'apex' || this.phase === 'finishing'
        ? 'APEX'
        : this.encounterIndex >= 0 ? `ACT ${Math.min(2, this.encounterIndex + 1)}` : 'RIFT OPENING',
      encounter: encounter?.name ?? (this.phase === 'apex' ? 'Apex Execution' : 'Rift Opening'),
      kicker: encounter?.kicker ?? (this.phase === 'apex' ? 'BREAK THE ALPHA' : 'ENTER THE STORM'),
      description: encounter?.description ?? 'Prepare for immediate contact.',
      progress: this.objectiveProgress,
      target: this.objectiveTarget,
      encounterRemaining: this.encounterRemaining,
      score: Math.max(0, Math.round(this.score)),
      kills: this.kills,
      elites: this.elites,
      bosses: this.bosses,
      peakChain: this.peakChain,
      breakValue: this.breakValue,
      breakMax: RUSH_CONFIG.breakMax,
      breakWindow: this.breakWindow,
      hazard: this.plan ? RUSH_HAZARDS[this.plan.zoneId] : null,
    };
  }

  start(options = {}) {
    this.reset();
    this.daily = Boolean(options.daily);
    this.seed = this.daily
      ? dailyRushSeed(options.date instanceof Date ? options.date : new Date())
      : (Number(options.seed) >>> 0) || hashRushSeed(`${Date.now()}:${performance.now()}:${this.game.player.classId}`);
    this.plan = buildRushPlan(this.seed);
    this.rng = createRushRng(this.seed);
    this.runId = `${this.daily ? 'daily' : 'rift'}-${this.seed.toString(36)}-${Date.now().toString(36)}`;
    this.phase = 'opening';
    this.timeRemaining = RUSH_CONFIG.maxSeconds;
    this.phaseTimer = RUSH_CONFIG.openingSeconds;
    this.hazardTimer = RUSH_CONFIG.hazardFirstDelay;
    this.lastHp = this.game.player.hp;
    this.#bootstrapHero();
    this.#buildDraftQueue();
    this.#moveToZone();
    const zone = ZONES[this.plan.zoneId] ?? ZONES.verdant;
    this.game.effects?.pillar?.(this.game.player.position, zone.accent, 8.5, { life: 0.85, bottom: 1.1, opacity: 0.55 });
    this.game.effects?.ring?.(this.game.player.position, zone.accent, 6.5, { life: 0.8, startScale: 0.08, opacity: 0.9 });
    this.game.ui?.notify?.(`${this.daily ? 'Daily Rift' : 'Rift Rush'} · ${zone.name} · 90 seconds`, 'legendary', 3.6);
    this.game.ui?.hideRushOverlays?.();
    return this.plan;
  }

  update(delta) {
    if (this.phase === 'idle' || this.phase === 'result') return;
    if (this.phase === 'draft') {
      this.phaseTimer -= delta;
      if (this.phaseTimer <= 0 && this.draft) this.chooseMutation(this.draft.options[0]?.id);
      return;
    }

    this.#trackDamageTaken();
    this.#updateTasks(delta);
    this.#updateKillBurst(delta);
    if (this.breakWindow > 0) this.breakWindow = Math.max(0, this.breakWindow - delta);

    if (this.phase === 'finishing') {
      this.phaseTimer -= delta;
      if (this.phaseTimer <= 0) this.#showResult();
      return;
    }

    this.elapsed += delta;
    this.timeRemaining = Math.max(0, this.timeRemaining - delta);
    if (this.timeRemaining <= 0) {
      this.finish(false, 'The rift collapsed before the apex fell.');
      return;
    }

    if (this.phase === 'opening' || this.phase === 'transition') {
      this.phaseTimer -= delta;
      if (this.phaseTimer <= 0) this.#advancePendingStep();
      return;
    }

    if (this.phase === 'combat') {
      this.encounterRemaining = Math.max(0, this.encounterRemaining - delta);
      if (this.encounter?.id === 'collapse') this.#updateCollapse(delta);
      if (this.encounterRemaining <= 0) this.#completeEncounter(false);
    }

    if (this.phase === 'combat' || this.phase === 'apex') {
      if (this.encounterIndex >= 1 || this.phase === 'apex') this.#updateHazard(delta);
    }
  }

  onKill(enemy) {
    if (!enemy || enemy.rushRunId !== this.runId || this.phase === 'result' || this.phase === 'idle') return;
    this.kills += 1;
    if (enemy.elite) this.elites += 1;
    if (enemy.boss) this.bosses += 1;
    const killScore = enemy.boss ? RUSH_SCORE.bossKill : enemy.elite ? RUSH_SCORE.eliteKill : RUSH_SCORE.normalKill;
    this.score += killScore;
    const expectedChain = this.game.killChainTimer > 0 ? this.game.killChain + 1 : 1;
    this.peakChain = Math.max(this.peakChain, expectedChain);
    this.killBurstCount += 1;
    this.killBurstTimer = 0.36;

    if (this.encounter?.id === 'chain_reaction' && !enemy.rushReaction) {
      this.#triggerChainReaction(enemy);
    }

    if (this.phase === 'combat') {
      if (this.encounter?.objective === 'target') {
        if (enemy.rushTarget) this.objectiveProgress = 1;
      } else {
        this.objectiveProgress += 1;
      }
      if (this.objectiveProgress >= this.objectiveTarget) this.#completeEncounter(true);
    } else if (this.phase === 'apex' && enemy.boss) {
      if (this.breakWindow > 0) {
        this.executed = true;
        this.score += RUSH_SCORE.execution;
        this.game.ui?.notify?.('APEX EXECUTION!', 'legendary', 4.2);
      }
      this.objectiveProgress = 1;
      this.finish(true, 'The apex has fallen.');
    }
  }

  onDamageEnemy(enemy, result, options = {}) {
    if (this.phase !== 'apex' || !enemy?.boss || enemy !== this.boss || result?.amount <= 0 || this.breakWindow > 0) return;
    const flat = options.skill ? RUSH_CONFIG.breakSkill : RUSH_CONFIG.breakBasic;
    const critical = options.critical ? RUSH_CONFIG.breakCriticalBonus : 0;
    const damagePart = clamp((result.amount / Math.max(1, enemy.maxHp)) * 42, 0, 6);
    const contribution = Math.min(RUSH_CONFIG.breakBossHitCap, flat + critical + damagePart);
    this.breakValue = clamp(this.breakValue + contribution, 0, RUSH_CONFIG.breakMax);
    if (this.breakValue >= RUSH_CONFIG.breakMax) this.#triggerBreak();
  }

  damageMultiplierFor(enemy) {
    return this.phase === 'apex' && enemy?.boss && enemy === this.boss && this.breakWindow > 0
      ? RUSH_CONFIG.breakDamageMultiplier
      : 1;
  }

  chooseMutation(choiceId) {
    if (this.phase !== 'draft' || !this.draft) return false;
    const option = this.draft.options.find(row => row.id === choiceId);
    if (!option) return false;
    const applied = this.game.player.setSkillMutation(this.draft.skillId, this.draft.gate, option.id);
    if (!applied) return false;
    const skill = SKILLS[this.draft.skillId];
    this.usedDrafts.add(`${this.draft.skillId}:${this.draft.gate}`);
    this.game.audio?.levelUp?.();
    this.game.effects?.ring?.(this.game.player.position, 0xffe38a, 5.2, { life: 0.7, startScale: 0.08 });
    this.game.ui?.notify?.(`${skill.name} · ${option.label}`, 'level', 3.2);
    this.draft = null;
    this.game.ui?.hideRushDraft?.();
    this.phase = 'transition';
    this.phaseTimer = RUSH_CONFIG.actTransitionSeconds;
    return true;
  }

  finish(completed, reason = '') {
    if (this.phase === 'finishing' || this.phase === 'result' || this.phase === 'idle') return false;
    this.#flushKillBurst();
    this.#clearHazards();
    this.resultPending = { completed: Boolean(completed), reason };
    this.phase = 'finishing';
    this.phaseTimer = RUSH_CONFIG.resultDelaySeconds;
    this.game.player.invulnerable = Math.max(this.game.player.invulnerable ?? 0, RUSH_CONFIG.resultDelaySeconds + 0.3);
    return true;
  }

  claimTrophy(trophyId) {
    const result = this.result;
    if (this.phase !== 'result' || !result || result.claimed) return { ok: false, reason: 'claimed' };
    const trophy = result.trophies.find(row => row.id === trophyId);
    if (!trophy) return { ok: false, reason: 'missing' };
    if (this.meta.claimedRuns.includes(result.runId)) return { ok: false, reason: 'claimed' };

    const reward = { gold: trophy.gold ?? 0, skillPoints: trophy.skillPoints ?? 0 };
    const huntSave = this.game.save.load();
    let appliedToSave = false;
    if (huntSave?.player) {
      huntSave.player.gold = Math.max(0, Number(huntSave.player.gold) || 0) + reward.gold;
      huntSave.player.skillPoints = Math.max(0, Number(huntSave.player.skillPoints) || 0) + reward.skillPoints;
      appliedToSave = this.game.save.save(huntSave);
    }
    if (!appliedToSave) {
      this.meta.pendingGold = clamp(this.meta.pendingGold + reward.gold, 0, RUSH_CONFIG.pendingRewardGoldCap);
      this.meta.pendingSkillPoints = clamp(
        this.meta.pendingSkillPoints + reward.skillPoints,
        0,
        RUSH_CONFIG.pendingRewardSkillPointCap,
      );
    }
    if (trophy.collectible) {
      this.meta.collectibles[trophy.id] = (Number(this.meta.collectibles[trophy.id]) || 0) + 1;
    }
    this.meta.claimedRuns = [...this.meta.claimedRuns, result.runId].slice(-24);
    result.claimed = trophy.id;
    result.rewardAppliedToSave = appliedToSave;
    this.#saveMeta();
    this.game.ui?.showRushResult?.(result);
    this.game.audio?.legendary?.();
    this.game.ui?.notify?.(
      appliedToSave ? `${trophy.name} sent to your Hunt save.` : `${trophy.name} banked for your next Hunt.`,
      'legendary',
      4,
    );
    return { ok: true, trophy, appliedToSave };
  }

  consumePendingRewards(player) {
    if (!player) return { gold: 0, skillPoints: 0 };
    const gold = clamp(Number(this.meta.pendingGold) || 0, 0, RUSH_CONFIG.pendingRewardGoldCap);
    const skillPoints = clamp(Number(this.meta.pendingSkillPoints) || 0, 0, RUSH_CONFIG.pendingRewardSkillPointCap);
    if (gold <= 0 && skillPoints <= 0) return { gold: 0, skillPoints: 0 };
    player.gold += gold;
    player.skillPoints += skillPoints;
    this.meta.pendingGold = 0;
    this.meta.pendingSkillPoints = 0;
    this.#saveMeta();
    return { gold, skillPoints };
  }

  debugAdvance() {
    if (!this.game.debugEnabled) return false;
    if (this.phase === 'combat') return this.#completeEncounter(true);
    if (this.phase === 'draft') return this.chooseMutation(this.draft?.options?.[0]?.id);
    if (this.phase === 'apex' && this.boss?.alive) {
      this.breakValue = RUSH_CONFIG.breakMax;
      this.#triggerBreak();
      this.boss.takeDamage(this.boss.maxHp * 2, this.game, { skill: true, overkill: true });
      return true;
    }
    return false;
  }

  debugTriggerHazard(zoneId = this.plan?.zoneId) {
    if (!this.game.debugEnabled || this.phase === 'idle' || this.phase === 'draft' || this.phase === 'result') return false;
    const hazard = RUSH_HAZARDS[zoneId];
    if (!hazard) return false;
    this.#triggerHazard(hazard);
    return true;
  }

  #bootstrapHero() {
    const player = this.game.player;
    player.level = RUSH_CONFIG.runLevel;
    player.xp = 0;
    player.skillPoints = 0;
    for (const skill of getClassActiveSkills(player.classId)) {
      player.skills[skill.id] = Math.min(skill.maxRank, RUSH_CONFIG.activeSkillRank);
      player.skillCooldowns[skill.id] = 0;
    }
    player.runMods.attack = 1.65;
    player.runMods.defense = 1.45;
    player.runMods.skillPower = 0.35;
    player.runMods.haste = 0.22;
    player.runMods.xp = 0;
    player.potions = 5;
    player.maxPotions = 5;
    player.energy = 40;
    player.invalidateStats();
    player.hp = player.maxHp;
    player.mp = player.maxMp;
  }

  #buildDraftQueue() {
    const rows = [];
    for (const skill of getClassActiveSkills(this.game.player.classId)) {
      for (const gate of [40, 80]) {
        if (skillMutationOptions(skill, gate).length === 2) rows.push({ skillId: skill.id, gate });
      }
    }
    this.draftQueue = rushShuffle(rows, this.rng);
  }

  #moveToZone() {
    const zone = ZONES[this.plan.zoneId] ?? ZONES.verdant;
    const world = this.game.world;
    const destination = new THREE.Vector3(zone.center[0], 0, zone.center[1]);
    const cameraDistance = Math.max(10, this.game.cameraDistance ?? 13.6);
    const cameraYaw = this.game.cameraYaw ?? 0.55;
    for (let attempt = 0; attempt < 28; attempt += 1) {
      const angle = this.rng() * Math.PI * 2;
      const distance = 8 + this.rng() * 14;
      const candidate = new THREE.Vector3(
        zone.center[0] + Math.cos(angle) * distance,
        0,
        zone.center[1] + Math.sin(angle) * distance,
      );
      if (world.zoneAt(candidate.x, candidate.z)?.id !== zone.id) continue;
      const cameraX = candidate.x + Math.sin(cameraYaw) * cameraDistance;
      const cameraZ = candidate.z + Math.cos(cameraYaw) * cameraDistance;
      const blocked = world.colliders?.some(collider => {
        const arenaDistance = Math.hypot(candidate.x - collider.x, candidate.z - collider.z);
        if (arenaDistance < collider.radius + 5.5) return true;
        const dx = candidate.x - cameraX;
        const dz = candidate.z - cameraZ;
        const lengthSq = Math.max(0.0001, dx * dx + dz * dz);
        const t = clamp(((collider.x - cameraX) * dx + (collider.z - cameraZ) * dz) / lengthSq, 0, 1);
        const sightX = cameraX + dx * t;
        const sightZ = cameraZ + dz * t;
        return Math.hypot(collider.x - sightX, collider.z - sightZ) < collider.radius + 1.8;
      });
      if (!blocked) {
        destination.copy(candidate);
        break;
      }
    }
    this.game.player.position.copy(destination);
    this.game.world.resolvePosition(this.game.player.position, 0.48);
    this.arenaCenter.copy(this.game.player.position);
  }

  #advancePendingStep() {
    if (this.phase === 'opening') {
      this.#startEncounter(0);
      return;
    }
    if (this.phase !== 'transition') return;
    if (this.pendingStep?.type === 'encounter') this.#startEncounter(this.pendingStep.index);
    else this.#startApex();
    this.pendingStep = null;
  }

  #startEncounter(index) {
    const encounter = this.plan.encounters[index];
    if (!encounter) {
      this.#startApex();
      return;
    }
    this.game.enemies.clear();
    this.game.combat.clear();
    this.tasks.length = 0;
    this.encounterIndex = index;
    this.encounter = encounter;
    this.objectiveProgress = 0;
    this.objectiveTarget = encounter.target;
    this.encounterRemaining = encounter.duration;
    this.encounterSucceeded = true;
    this.phase = 'combat';
    this.hazardTimer = RUSH_CONFIG.hazardFirstDelay;
    this.#spawnEncounter(encounter);
    this.game.player.heal(this.game.player.maxHp * 0.12);
    this.game.player.mp = this.game.player.maxMp;
    this.game.ui?.notify?.(`${encounter.kicker} · ${encounter.name}`, 'contract', 2.8);
  }

  #spawnEncounter(encounter) {
    const roles = encounter.roles ?? [];
    const pool = this.#rolePool(roles);
    const fallback = this.#rolePool([]);
    let targetAssigned = false;
    for (let i = 0; i < encounter.count; i += 1) {
      const data = pool[Math.floor(this.rng() * pool.length)] ?? fallback[Math.floor(this.rng() * fallback.length)];
      if (!data) continue;
      const crossfire = encounter.id === 'crossfire';
      const angle = crossfire
        ? (i / encounter.count) * Math.PI * 2
        : this.rng() * Math.PI * 2;
      const distance = crossfire
        ? 9.5 + this.rng() * 1.8
        : RUSH_CONFIG.spawnInner + this.rng() * (RUSH_CONFIG.spawnOuter - RUSH_CONFIG.spawnInner);
      const position = this.#positionOnRing(angle, distance);
      const isTarget = encounter.objective === 'target' && !targetAssigned && i === 0;
      const elite = isTarget || (encounter.id === 'apex_escort' && i === 0);
      const enemy = this.game.enemies.spawn(data, position, {
        level: RUSH_CONFIG.runLevel,
        elite,
        eliteAffix: elite ? 'hasted' : null,
        fodder: !elite && (data.role === 'fodder_swarm' || data.role === 'skirmisher'),
      });
      if (!enemy) continue;
      enemy.rushRunId = this.runId;
      enemy.rushEncounterIndex = this.encounterIndex;
      enemy.defenseWave = true;
      if (isTarget) {
        targetAssigned = true;
        enemy.rushTarget = true;
        enemy.speed *= 1.28;
        enemy.maxHp = Math.round(enemy.maxHp * 1.45);
        enemy.hp = enemy.maxHp;
        this.game.effects?.pillar?.(enemy.position, 0xffdf6b, 6.5, { life: 0.9, bottom: 1.0 });
      }
    }
  }

  #completeEncounter(success) {
    if (this.phase !== 'combat') return false;
    const encounter = this.encounter;
    const timeBonus = success ? Math.round(this.encounterRemaining * (encounter?.timeBonus ?? 30)) : 0;
    this.score += success ? RUSH_SCORE.encounterClear + timeBonus : RUSH_SCORE.encounterFail;
    if (success) this.encountersCleared += 1;
    else this.encountersFailed += 1;
    this.encounterSucceeded = success;
    this.game.enemies.clear();
    this.game.combat.clear();
    this.tasks.length = 0;
    this.#clearHazards();
    this.game.ui?.notify?.(
      success ? `${encounter.name} cleared · +${RUSH_SCORE.encounterClear + timeBonus}` : `${encounter.name} escaped · keep moving`,
      success ? 'level' : 'danger',
      2.7,
    );
    this.pendingStep = this.encounterIndex + 1 < this.plan.encounters.length
      ? { type: 'encounter', index: this.encounterIndex + 1 }
      : { type: 'apex' };
    this.#openDraft();
    return true;
  }

  #openDraft() {
    const entry = this.draftQueue.find(row => !this.usedDrafts.has(`${row.skillId}:${row.gate}`));
    if (!entry) {
      this.phase = 'transition';
      this.phaseTimer = RUSH_CONFIG.actTransitionSeconds;
      return;
    }
    const skill = SKILLS[entry.skillId];
    const options = skillMutationOptions(skill, entry.gate).map(id => ({ id, ...skill.evolution.mutations[entry.gate][id] }));
    this.draft = { skillId: entry.skillId, skillName: skill.name, key: skill.key, gate: entry.gate, options };
    this.phase = 'draft';
    this.phaseTimer = RUSH_CONFIG.draftSeconds;
    this.game.player.setMoveDirection(TMP_A.set(0, 0, 0));
    this.game.ui?.showRushDraft?.(this.draft);
  }

  #startApex() {
    this.game.enemies.clear();
    this.game.combat.clear();
    this.tasks.length = 0;
    this.phase = 'apex';
    this.encounter = this.plan.apex;
    this.encounterRemaining = Math.max(0, this.timeRemaining);
    this.objectiveProgress = 0;
    this.objectiveTarget = 1;
    this.breakValue = 0;
    this.breakWindow = 0;
    this.hazardTimer = RUSH_CONFIG.hazardFirstDelay;
    const bossId = ZONE_BOSSES[this.plan.zoneId] ?? ZONE_BOSSES.verdant;
    const bossData = ENEMY_TYPES[bossId];
    const angle = this.rng() * Math.PI * 2;
    const position = this.#positionOnRing(angle, RUSH_CONFIG.bossSpawnDistance);
    const boss = this.game.enemies.spawn(bossData, position, { level: RUSH_CONFIG.runLevel + 2, elite: false, fodder: false });
    if (boss) {
      boss.rushRunId = this.runId;
      boss.defenseWave = true;
      boss.maxHp = Math.round(boss.maxHp * 0.72);
      boss.hp = boss.maxHp;
      this.boss = boss;
      this.game.audio?.boss?.();
      this.game.effects?.pillar?.(position, bossData.accent, 12, { life: 1.15, bottom: 1.8 });
      this.game.effects?.ring?.(position, bossData.accent, 8, { life: 1.0, startScale: 0.06 });
    }
    const supportPool = this.#rolePool(this.plan.apex.roles);
    for (let i = 0; i < 7; i += 1) {
      const data = supportPool[Math.floor(this.rng() * supportPool.length)];
      if (!data) continue;
      const support = this.game.enemies.spawn(data, this.#positionOnRing(angle + (i + 1) * 0.75, 6.5 + this.rng() * 3), {
        level: RUSH_CONFIG.runLevel,
        elite: false,
        fodder: data.role !== 'frontline',
      });
      if (support) {
        support.rushRunId = this.runId;
        support.defenseWave = true;
      }
    }
    this.game.ui?.notify?.(`APEX · ${bossData?.name ?? 'Rift Alpha'} · Build Break!`, 'boss', 4);
  }

  #triggerBreak() {
    if (!this.boss?.alive || this.breakWindow > 0) return;
    this.breakValue = 0;
    this.breakWindow = RUSH_CONFIG.breakWindow;
    this.breaks += 1;
    this.score += RUSH_SCORE.break;
    this.boss.addStagger?.(9999);
    this.boss.applyStun?.(Math.min(2.8, RUSH_CONFIG.breakWindow));
    const color = this.boss.data?.accent ?? 0xffe38a;
    this.game.effects?.pillar?.(this.boss.position, color, 13, { life: 0.95, bottom: 2, opacity: 0.65 });
    this.game.effects?.ring?.(this.boss.position, 0xfff2c4, 9, { life: 0.8, startScale: 0.05, opacity: 0.95 });
    this.game.effects?.burst?.(this.boss.position.clone().addScaledVector(UP, 1.2), color, 44, {
      speed: 7, size: 0.42, life: 0.8, upward: 0.5,
    });
    this.game.audio?.killSting?.(50);
    this.game.ui?.notify?.(`BREAK! · ${RUSH_CONFIG.breakWindow.toFixed(1)}s execution window`, 'legendary', 3.2);
  }

  #triggerChainReaction(enemy) {
    const radius = 4.2;
    let hits = 0;
    this.game.effects?.ring?.(enemy.position, 0xffa24d, radius, { life: 0.45, startScale: 0.1, opacity: 0.8 });
    for (const target of this.game.enemies.enemies) {
      if (!target.alive || target === enemy || target.boss || target.rushRunId !== this.runId || target.rushReaction) continue;
      if (target.position.distanceTo(enemy.position) > radius + target.radius) continue;
      target.rushReaction = true;
      const direction = target.position.clone().sub(enemy.position).setY(0).normalize();
      target.takeDamage(Math.max(1, Math.round(target.maxHp * 0.42)), this.game, {
        direction,
        knockback: 4.5,
        multiHit: true,
        overkill: target.fodder,
      });
      hits += 1;
      if (hits >= 5) break;
    }
    if (hits >= 2) this.score += hits * 90;
  }

  #updateHazard(delta) {
    if (!this.plan || this.phase === 'draft' || this.phase === 'result') return;
    this.hazardTimer -= delta;
    if (this.hazardTimer > 0) return;
    this.hazardTimer = RUSH_CONFIG.hazardCadence;
    const hazard = RUSH_HAZARDS[this.plan.zoneId];
    if (!hazard) return;
    this.hazardPulse += 1;
    this.#triggerHazard(hazard);
  }

  #triggerHazard(hazard) {
    const player = this.game.player;
    const warning = RUSH_CONFIG.hazardTelegraph;
    if (hazard.id === 'pollen_burst') {
      const center = this.#enemyCentroid(5) ?? player.position.clone().add(TMP_A.set(2, 0, 0));
      this.#telegraphCircle(center, 3.7, hazard.color, warning, () => {
        this.#damageEnemiesInRadius(center, 3.7, enemy => enemy.boss ? enemy.maxHp * 0.04 : enemy.maxHp * 0.34);
        this.game.effects?.burst?.(center.clone().addScaledVector(UP, 0.7), hazard.color, 24, { speed: 5, size: 0.3, life: 0.55, upward: 0.45 });
      });
    } else if (hazard.id === 'root_snare') {
      const center = player.position.clone();
      this.#telegraphCircle(center, 3.2, hazard.color, warning, () => {
        if (player.position.distanceTo(center) <= 3.2) this.#damagePlayerAt(center, 3.2, 0.065);
      });
    } else if (hazard.id === 'fault_line') {
      const angle = this.rng() * Math.PI * 2;
      const dir = TMP_A.set(Math.cos(angle), 0, Math.sin(angle));
      const start = player.position.clone().addScaledVector(dir, -10);
      const end = player.position.clone().addScaledVector(dir, 10);
      this.game.effects?.recipeGroundWave?.(start, dir, { primary: hazard.color, secondary: 0xfff0bf }, 0);
      this.game.effects?.ring?.(player.position, hazard.color, 2.2, { life: warning, startScale: 0.15, opacity: 0.65 });
      this.#queue(warning, () => {
        if (pointSegmentDistance(player.position, start, end) < 1.15) this.#damagePlayerAt(player.position, 1.3, 0.075);
        for (const enemy of this.game.enemies.enemies) {
          if (enemy.alive && !enemy.boss && pointSegmentDistance(enemy.position, start, end) < 1.2) {
            enemy.takeDamage(enemy.maxHp * 0.22, this.game, { skill: true, multiHit: true });
          }
        }
      });
    } else if (hazard.id === 'ice_ring') {
      const center = player.position.clone();
      this.game.effects?.ring?.(center, hazard.color, 5.2, { life: 1.0, startScale: 0.1, opacity: 0.85 });
      this.#grantHazardSpeed(0.12, 2.4);
      player.mp = Math.min(player.maxMp, player.mp + player.maxMp * 0.12);
      this.game.ui?.notify?.('Ice Ring · haste and mana surge', 'heal', 1.9);
    } else if (hazard.id === 'lava_bloom') {
      for (let i = 0; i < 3; i += 1) {
        const angle = this.rng() * Math.PI * 2;
        const center = player.position.clone().add(TMP_A.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(2 + this.rng() * 4));
        this.game.world.resolvePosition(center, 0.3);
        this.#telegraphCircle(center, 2.35, hazard.color, warning, () => {
          this.#damagePlayerAt(center, 2.35, 0.07);
          this.#damageEnemiesInRadius(center, 2.35, enemy => enemy.boss ? enemy.maxHp * 0.035 : enemy.maxHp * 0.2);
          this.game.effects?.pillar?.(center, hazard.color, 5.5, { life: 0.45, bottom: 0.55 });
        });
      }
    } else if (hazard.id === 'rift_collapse') {
      const center = this.#enemyCentroid(7) ?? player.position.clone();
      this.#telegraphCircle(center, 4.3, hazard.color, warning, () => {
        for (const enemy of this.game.enemies.enemies) {
          if (!enemy.alive || enemy.boss || enemy.rushRunId !== this.runId) continue;
          const pull = center.clone().sub(enemy.position).setY(0);
          if (pull.lengthSq() > 0.01) enemy.knockback.addScaledVector(pull.normalize(), 7.5);
        }
        this.#damageEnemiesInRadius(center, 4.3, enemy => enemy.boss ? enemy.maxHp * 0.03 : enemy.maxHp * 0.18);
        this.game.effects?.burst?.(center.clone().addScaledVector(UP, 1), hazard.color, 30, { speed: 5.5, size: 0.32, life: 0.65, upward: 0.5 });
      });
    }
  }

  #updateCollapse(delta) {
    const encounter = this.encounter;
    const ratio = 1 - clamp(this.encounterRemaining / Math.max(1, encounter.duration), 0, 1);
    this.collapseRadius = encounter.safeRadiusStart + (encounter.safeRadiusEnd - encounter.safeRadiusStart) * ratio;
    const center = TMP_A.copy(this.arenaCenter);
    center.y = this.game.world.heightAt(center.x, center.z);
    this.collapseFxTimer -= delta;
    if (this.collapseFxTimer <= 0) {
      this.collapseFxTimer = 0.35;
      this.game.effects?.ring?.(center, 0xffd66b, this.collapseRadius, {
        life: 0.42, startScale: 0.97, opacity: 0.52,
      });
    }
    this.collapseDamageTimer -= delta;
    if (this.game.player.position.distanceTo(center) > this.collapseRadius && this.collapseDamageTimer <= 0) {
      this.collapseDamageTimer = 0.7;
      this.#damagePlayerAt(this.game.player.position, 1, 0.055);
      this.score += RUSH_SCORE.outsideArenaTick;
      this.game.ui?.notify?.('Outside the collapse ring!', 'danger', 1.2);
    }
  }

  #telegraphCircle(center, radius, color, delay, callback) {
    this.game.effects?.ring?.(center, color, radius, { life: delay, startScale: 0.25, opacity: 0.78 });
    this.#queue(delay, callback);
  }

  #damagePlayerAt(center, radius, hpRatio) {
    const player = this.game.player;
    if (!player.alive || player.position.distanceTo(center) > radius) return 0;
    const raw = Math.max(1, Math.round(player.maxHp * hpRatio));
    const direction = player.position.clone().sub(center).setY(0);
    if (direction.lengthSq() < 0.001) direction.set(0, 0, 1);
    else direction.normalize();
    const dealt = player.takeDamage(raw, direction.multiplyScalar(4.5));
    if (dealt > 0) {
      this.game.ui?.floatText?.(player.position.clone().addScaledVector(UP, 1.7), `-${dealt}`, 'hurt');
      this.game.effects?.burst?.(player.position.clone().addScaledVector(UP, 0.9), 0xff6b6b, 10, { speed: 3.4, size: 0.23, life: 0.38, upward: 0.35 });
    }
    return dealt;
  }

  #damageEnemiesInRadius(center, radius, amountFor) {
    for (const enemy of this.game.enemies.enemies) {
      if (!enemy.alive || enemy.rushRunId !== this.runId || enemy.position.distanceTo(center) > radius + enemy.radius) continue;
      enemy.rushReaction = true;
      enemy.takeDamage(Math.max(1, Math.round(amountFor(enemy))), this.game, { skill: true, multiHit: true });
    }
  }

  #grantHazardSpeed(amount, duration) {
    const player = this.game.player;
    this.#clearHazardSpeed();
    this.hazardSpeedBonus = amount;
    player.runMods.moveSpeed += amount;
    player.invalidateStats();
    this.#queue(duration, () => this.#clearHazardSpeed());
  }

  #clearHazardSpeed() {
    if (!this.hazardSpeedBonus || !this.game?.player?.runMods) return;
    this.game.player.runMods.moveSpeed -= this.hazardSpeedBonus;
    this.hazardSpeedBonus = 0;
    this.game.player.invalidateStats();
  }

  #clearHazards() {
    this.#clearHazardSpeed();
    if (this.tasks) this.tasks.length = 0;
    this.collapseRadius = 0;
    this.collapseFxTimer = 0;
    this.collapseDamageTimer = 0;
  }

  #queue(time, callback) {
    this.tasks.push({ time: Math.max(0, time), callback });
  }

  #updateTasks(delta) {
    for (let i = this.tasks.length - 1; i >= 0; i -= 1) {
      const task = this.tasks[i];
      task.time -= delta;
      if (task.time > 0) continue;
      this.tasks.splice(i, 1);
      if (this.phase !== 'draft' && this.phase !== 'result' && this.phase !== 'idle') task.callback();
    }
  }

  #trackDamageTaken() {
    const hp = Math.max(0, Number(this.game.player.hp) || 0);
    if (hp < this.lastHp) {
      const amount = this.lastHp - hp;
      this.damageTaken += amount;
      this.score -= amount * RUSH_SCORE.damagePointPenalty;
    }
    this.lastHp = hp;
  }

  #updateKillBurst(delta) {
    if (this.killBurstTimer <= 0) return;
    this.killBurstTimer -= delta;
    if (this.killBurstTimer <= 0) this.#flushKillBurst();
  }

  #flushKillBurst() {
    if (this.killBurstCount >= 3) {
      this.multikills += 1;
      this.multikillPeak = Math.max(this.multikillPeak, this.killBurstCount);
      this.score += (this.killBurstCount - 1) * RUSH_SCORE.multikillExtra;
    }
    this.killBurstCount = 0;
    this.killBurstTimer = 0;
  }

  #showResult() {
    const pending = this.resultPending ?? { completed: false, reason: 'Rift ended.' };
    const completed = pending.completed;
    if (completed) this.score += Math.round(this.timeRemaining * RUSH_SCORE.remainingSecond);
    this.score = Math.max(0, Math.round(this.score));
    const grade = rushGrade(this.score, completed);
    const today = new Date().toISOString().slice(0, 10);
    const previousBest = this.daily ? Number(this.meta.daily?.[today]?.score) || 0 : Number(this.meta.bestScore) || 0;
    this.meta.runs += 1;
    if (completed) this.meta.completions += 1;
    this.meta.lastScore = this.score;
    if (this.score > this.meta.bestScore) {
      this.meta.bestScore = this.score;
      this.meta.bestGrade = grade.id;
    }
    if (this.daily && this.score > previousBest) {
      this.meta.daily[today] = { score: this.score, grade: grade.id, classId: this.game.player.classId, seed: this.seed };
    }
    this.#saveMeta();
    const runId = this.runId;
    this.result = {
      runId,
      completed,
      reason: pending.reason,
      daily: this.daily,
      seed: this.seed,
      zoneId: this.plan.zoneId,
      score: this.score,
      grade,
      clearTime: this.elapsed,
      remaining: this.timeRemaining,
      kills: this.kills,
      elites: this.elites,
      bosses: this.bosses,
      peakChain: this.peakChain,
      multikills: this.multikills,
      multikillPeak: this.multikillPeak,
      damageTaken: Math.round(this.damageTaken),
      encountersCleared: this.encountersCleared,
      encountersFailed: this.encountersFailed,
      breaks: this.breaks,
      executed: this.executed,
      newBest: this.score > previousBest,
      trophies: completed ? buildTrophyOffers(this.seed, { executed: this.executed }) : Object.freeze([]),
      claimed: false,
    };
    this.phase = 'result';
    this.game.enemies.clear();
    this.game.combat.clear();
    this.tasks.length = 0;
    this.game.player.setMoveDirection(TMP_A.set(0, 0, 0));
    this.game.ui?.showRushResult?.(this.result);
    if (completed) this.game.audio?.legendary?.();
    else this.game.audio?.boss?.();
  }

  #rolePool(roles) {
    const entries = ZONE_SPAWNS[this.plan.zoneId] ?? ZONE_SPAWNS.verdant ?? [];
    const all = entries.map(entry => ENEMY_TYPES[entry.id]).filter(data => data && !data.boss && !data.miniBoss);
    if (!roles?.length) return all;
    const filtered = all.filter(data => roles.includes(data.role));
    return filtered.length ? filtered : all;
  }

  #positionOnRing(angle, distance) {
    const player = this.game.player;
    const position = new THREE.Vector3(
      player.position.x + Math.cos(angle) * distance,
      0,
      player.position.z + Math.sin(angle) * distance,
    );
    this.game.world.resolvePosition(position, 0.7);
    return position;
  }

  #enemyCentroid(limit = 5) {
    const living = this.game.enemies.enemies
      .filter(enemy => enemy.alive && enemy.rushRunId === this.runId)
      .slice(0, limit);
    if (!living.length) return null;
    const center = new THREE.Vector3();
    for (const enemy of living) center.add(enemy.position);
    return center.multiplyScalar(1 / living.length);
  }

  #loadMeta() {
    try {
      const raw = localStorage.getItem(RUSH_CONFIG.metaKey);
      return safeMeta(raw ? JSON.parse(raw) : null);
    } catch {
      return defaultMeta();
    }
  }

  #saveMeta() {
    try {
      localStorage.setItem(RUSH_CONFIG.metaKey, JSON.stringify(this.meta));
      return true;
    } catch {
      return false;
    }
  }
}

export { RUSH_GRADES };
