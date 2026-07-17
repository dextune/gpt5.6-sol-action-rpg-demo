import * as THREE from 'three';
import {
  GEAR_ENHANCE, LOOT_CONFIG, PLAYER_CONFIG, WEAPON_ENHANCE, WEAPON_OPTION_ENHANCE,
  defenseRarityFloor, enemyGoldLevelMul,
} from '../config.js';
import {
  AFFIXES, ARMOR_BASES, CHARM_BASES, RARITIES, WEAPON_BASES,
  getHeroClass, getWeaponEvolution, getWeaponResonance, weaponResonanceTier,
} from '../data/content.js';
import { chance, clamp, pick, rand, randInt, uid, weightedPick } from '../core/Utils.js';
import { createGameContext } from '../core/GameContext.js';
import { composeHuntRewardMul } from './huntThreat.js';

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const STAT_KEYS = ['power', 'defense', 'hp', 'crit', 'haste', 'leech', 'xpBonus', 'goldBonus', 'skillPower', 'moveSpeed', 'luck'];
const FLAT_ENHANCE_STATS = new Set(['power', 'defense', 'hp', 'moveSpeed']);

/** Combat score used for auto-equip and inventory sort. */
export function scoreGear(item) {
  return Math.round(
    (item.power ?? 0) * 1.65 + (item.defense ?? 0) * 1.3 + (item.hp ?? 0) * .105
    + (item.crit ?? 0) * 320 + (item.haste ?? 0) * 235 + (item.leech ?? 0) * 520
    + (item.xpBonus ?? 0) * 160 + (item.goldBonus ?? 0) * 120
    + (item.skillPower ?? 0) * 250 + (item.moveSpeed ?? 0) * 36 + (item.luck ?? 0) * 220
    + (item.itemLevel ?? 1) * 2.2
    + (item.enhanceLevel ?? 0) * 6,
  );
}

/** Snapshot base stats if missing (old saves treat current values as base at level 0). */
export function ensureGearBaseStats(item) {
  if (!item || item.baseStats) return item;
  const base = {};
  for (const key of STAT_KEYS) base[key] = Number(item[key]) || 0;
  item.baseStats = base;
  item.enhanceLevel = Math.max(0, Math.min(GEAR_ENHANCE.maxLevel, Number(item.enhanceLevel) || 0));
  return item;
}

/** Recompute live stats from baseStats × enhanceLevel. */
export function recomputeGearFromEnhance(item) {
  if (!item) return item;
  ensureGearBaseStats(item);
  const level = Math.max(0, Math.min(GEAR_ENHANCE.maxLevel, Number(item.enhanceLevel) || 0));
  item.enhanceLevel = level;
  const flatMul = 1 + level * GEAR_ENHANCE.flatStep;
  const pctMul = 1 + level * GEAR_ENHANCE.pctStep;
  for (const key of STAT_KEYS) {
    const base = Number(item.baseStats[key]) || 0;
    if (!base) {
      item[key] = 0;
      continue;
    }
    const mul = FLAT_ENHANCE_STATS.has(key) ? flatMul : pctMul;
    const raw = base * mul;
    item[key] = ['power', 'defense', 'hp'].includes(key) ? Math.round(raw) : raw;
  }
  item.score = scoreGear(item);
  return item;
}

/** Gold cost to attempt +1 enhance. */
export function gearEnhanceCost(item) {
  if (!item) return 0;
  const level = Math.max(0, Number(item.enhanceLevel) || 0);
  if (level >= GEAR_ENHANCE.maxLevel) return 0;
  const rarityMul = GEAR_ENHANCE.rarityCost[item.rarity] ?? 1;
  const iLv = Math.max(1, Number(item.itemLevel) || 1);
  const tier = (level + 1) ** GEAR_ENHANCE.costLevelPow;
  return Math.max(5, Math.round(
    (GEAR_ENHANCE.costBase + iLv * GEAR_ENHANCE.costPerItemLevel) * rarityMul * tier,
  ));
}

/** Enhancement is deterministic; a failed attempt never lowers the item level. */
export function gearEnhanceSuccessChance(item) {
  if (!item) return 0;
  const next = Math.max(0, Number(item.enhanceLevel) || 0) + 1;
  if (next > GEAR_ENHANCE.maxLevel) return 0;
  return 1;
}

/** Sell / salvage gold value. */
export function gearSellValue(item) {
  if (!item) return 0;
  const rarity = RARITIES[item.rarity] ?? RARITIES.common;
  const enhanceBonus = 1 + (Number(item.enhanceLevel) || 0) * 0.12;
  return Math.max(2, Math.round((item.itemLevel + (item.score ?? 0) * .35) * rarity.salvage * enhanceBonus));
}

/** Gold cost for the next signature-weapon evolution level. */
export function weaponEnhanceCost(item) {
  if (!item) return 0;
  const level = Math.max(0, Number(item.weaponEnhanceLevel ?? item.enhanceLevel) || 0);
  if (level >= WEAPON_ENHANCE.maxLevel) return 0;
  return Math.round(
    (WEAPON_ENHANCE.costBase + Math.max(1, Number(item.itemLevel) || 1) * WEAPON_ENHANCE.costPerLevel)
      * (level + 1) ** WEAPON_ENHANCE.costPow,
  );
}

/** Success rate for the next signature-weapon enhancement; failure preserves state. */
export function weaponEnhanceSuccessChance(item) {
  if (!item) return 0;
  const next = Math.max(0, Number(item.weaponEnhanceLevel ?? item.enhanceLevel) || 0) + 1;
  if (next > WEAPON_ENHANCE.maxLevel) return 0;
  return WEAPON_ENHANCE.successByTarget[next]
    ?? Math.max(WEAPON_ENHANCE.successFloor, WEAPON_ENHANCE.successBase - next * WEAPON_ENHANCE.successFalloff);
}

/** Gold cost for the next weapon-option level. */
export function weaponOptionEnhanceCost(item) {
  if (!item) return 0;
  const level = Math.max(0, Number(item.optionEnhanceLevel) || 0);
  if (level >= WEAPON_OPTION_ENHANCE.maxLevel) return 0;
  return Math.round(
    (WEAPON_OPTION_ENHANCE.costBase + Math.max(1, Number(item.itemLevel) || 1) * WEAPON_OPTION_ENHANCE.costPerLevel)
      * (level + 1) ** WEAPON_OPTION_ENHANCE.costPow,
  );
}

const OPTION_ORDER = ['crit', 'haste', 'skillPower', 'goldBonus', 'luck', 'leech'];

/** Apply both enhancement tracks and the class-specific weapon evolution visual. */
export function recomputeWeaponFromEnhance(item) {
  if (!item) return item;
  ensureGearBaseStats(item);
  item.slot = 'weapon';
  item.weaponEnhanceLevel = Math.max(
    0,
    Math.min(WEAPON_ENHANCE.maxLevel, Number(item.weaponEnhanceLevel ?? item.enhanceLevel) || 0),
  );
  item.optionEnhanceLevel = Math.max(
    0,
    Math.min(WEAPON_OPTION_ENHANCE.maxLevel, Number(item.optionEnhanceLevel) || 0),
  );
  item.enhanceLevel = item.weaponEnhanceLevel;
  const resonanceTier = weaponResonanceTier(item.weaponEnhanceLevel);
  const flatMul = (1 + item.weaponEnhanceLevel * WEAPON_ENHANCE.powerStep)
    * (1 + resonanceTier * WEAPON_ENHANCE.powerMilestoneStep);
  const evolution = getWeaponEvolution(item.classId, item.weaponEnhanceLevel);
  const resonance = getWeaponResonance(item.classId);
  item.evolutionStage = evolution.level;
  item.name = evolution.name;
  item.model = evolution.model;
  item.color = evolution.color;
  item.rarity = evolution.rarity;
  item.rarityColor = evolution.color;
  item.power = Math.round((Number(item.baseStats.power) || 0) * flatMul);
  item.speed = (Number(item.baseSpeed) || Number(item.speed) || 1)
    * (1 + item.weaponEnhanceLevel * WEAPON_ENHANCE.speedStep);
  for (const key of STAT_KEYS) {
    if (key === 'power') continue;
    item[key] = Number(item.baseStats[key]) || 0;
  }
  for (const [key, step] of Object.entries(WEAPON_ENHANCE.intrinsicSteps)) {
    item[key] += item.weaponEnhanceLevel * step * (resonance.statBias[key] ?? 1);
  }
  const optionStats = item.optionStats && typeof item.optionStats === 'object' ? item.optionStats : {};
  item.optionStats = optionStats;
  for (const key of OPTION_ORDER) item[key] += Number(optionStats[key]) || 0;
  item.affixes = OPTION_ORDER
    .filter(key => Number(optionStats[key]) > 0)
    .map(key => ({ id: `weapon-${key}`, name: key, stat: key, value: Number(optionStats[key]) }));
  item.score = scoreGear(item);
  return item;
}

/** Apply one deterministic level of weapon option growth. */
export function enhanceWeaponOptions(item) {
  if (!item) return { ok: false, reason: 'missing' };
  recomputeWeaponFromEnhance(item);
  const level = item.optionEnhanceLevel;
  if (level >= WEAPON_OPTION_ENHANCE.maxLevel) return { ok: false, reason: 'max', level };
  const stat = OPTION_ORDER[level % OPTION_ORDER.length];
  const amount = WEAPON_OPTION_ENHANCE.steps[stat];
  item.optionEnhanceLevel = level + 1;
  item.optionStats[stat] = (Number(item.optionStats[stat]) || 0) + amount;
  recomputeWeaponFromEnhance(item);
  return { ok: true, level: item.optionEnhanceLevel, stat, amount };
}

const BASE_LEVELS = Object.freeze({
  field_blade: 1, moon_saber: 5, stone_cleaver: 9, thorn_edge: 12,
  sun_fang: 18, glacier_brand: 27, ember_katana: 36, astral_oath: 50,
  oak_staff: 1, crystal_rod: 14, void_scepter: 40,
  night_fang: 1, viper_kris: 30,
  yew_bow: 1, longbow_ash: 16, storm_recurve: 38,
  service_rifle: 1, brass_carbine: 18, ember_lance: 36,
  hide_vest: 1, leaf_mail: 8, dune_plate: 16, frost_coat: 25, forge_shell: 36, starweave: 49,
  fang_charm: 1, breeze_knot: 6, heart_seed: 12, coin_eye: 19, scholar_rune: 28, eclipse_shard: 48,
});

export class LootSystem {
  constructor(game) {
    this.game = game;
    this.ctx = game?.ctx ?? createGameContext(game);
    this.pickups = [];
    this.rarePity = 0;
  }

  rollRarity(options = {}) {
    const luck = clamp((options.luck ?? this.game.player.luck) + this.game.hunt.worldTier * .008, 0, .55);
    const boss = Boolean(options.boss);
    const elite = Boolean(options.elite);
    const weights = [
      { id: 'common', weight: Math.max(.08, .58 - luck * .72 - (elite ? .18 : 0) - (boss ? .42 : 0)) },
      { id: 'uncommon', weight: .285 + luck * .16 + (elite ? .12 : 0) },
      { id: 'rare', weight: .108 + luck * .34 + this.rarePity * .0035 + (elite ? .18 : 0) + (boss ? .22 : 0) },
      { id: 'epic', weight: .025 + luck * .18 + (elite ? .045 : 0) + (boss ? .17 : 0) },
      { id: 'legendary', weight: .002 + luck * .035 + this.game.hunt.worldTier * .0015 + (boss ? .025 : 0) },
    ];
    let rarity = weightedPick(weights);
    const floorIndex = RARITY_ORDER.indexOf(options.floor ?? 'common');
    if (RARITY_ORDER.indexOf(rarity) < floorIndex) rarity = RARITY_ORDER[floorIndex];
    if (RARITY_ORDER.indexOf(rarity) >= 2) this.rarePity = 0;
    else this.rarePity = Math.min(60, this.rarePity + 1);
    return rarity;
  }

  /** Weighted weapon-base pick using the class's weaponBias (falls back to uniform). */
  #pickWeaponBase(pool) {
    const bias = getHeroClass(this.game.player?.classId)?.weaponBias;
    if (!bias?.preferred?.length) return pick(pool);
    // Strict class weapons: only drop models this class can equip (sword never on ranger, etc.).
    const preferred = pool.filter(base => bias.preferred.includes(base.model));
    const usePool = preferred.length ? preferred : pool;
    const preferredMult = bias.mult ?? 2.2;
    return weightedPick(usePool.map(base => ({
      id: base,
      weight: preferredMult,
    })));
  }

  generateGear(level = this.game.player.level, options = {}) {
    const itemLevel = Math.max(1, Math.round(level + randInt(-2, 2)));
    const rarity = options.rarity ?? this.rollRarity(options);
    const rarityData = RARITIES[rarity];
    const slot = options.slot ?? weightedPick([
      { id: 'weapon', weight: .43 }, { id: 'armor', weight: .32 }, { id: 'charm', weight: .25 },
    ]);
    const bases = slot === 'weapon' ? WEAPON_BASES : slot === 'armor' ? ARMOR_BASES : CHARM_BASES;
    const eligible = Object.values(bases).filter(base => (BASE_LEVELS[base.id] ?? 1) <= itemLevel + 4);
    const pool = eligible.length ? eligible : Object.values(bases);
    // Weapons lean toward the player's class identity (daggers for rogue, staves for wizard, …).
    const base = slot === 'weapon' ? this.#pickWeaponBase(pool) : pick(pool);
    // Defense climb can pass powerScale so late-wave drip stays competitive to wave 200.
    const powerScale = Math.max(1, Number(options.powerScale) || 1);
    const multiplier = rarityData.multiplier * (1 + itemLevel * .014) * powerScale;
    const item = {
      id: uid('gear'), baseId: base.id, slot, name: base.name, rarity,
      rarityColor: rarityData.color, level: Math.max(1, itemLevel - 3), itemLevel,
      model: base.model, color: base.color ?? rarityData.color, speed: base.speed ?? 1,
      affixes: [], locked: false,
    };
    for (const key of STAT_KEYS) item[key] = 0;

    if (slot === 'weapon') {
      item.power = Math.round((base.power + itemLevel * 1.34) * multiplier);
      item.crit = base.crit ?? 0;
      item.speed = base.speed ?? 1;
    } else if (slot === 'armor') {
      item.defense = Math.round((base.defense + itemLevel * .53) * multiplier);
      item.hp = Math.round((base.hp + itemLevel * 2.15) * multiplier);
      for (const key of ['crit', 'haste', 'skillPower']) item[key] += base[key] ?? 0;
    } else {
      for (const key of STAT_KEYS) {
        const value = base[key] ?? 0;
        if (!value) continue;
        item[key] += ['power', 'defense', 'hp'].includes(key)
          ? value * (1 + itemLevel * .055) * rarityData.multiplier * powerScale
          : value * rarityData.multiplier * Math.min(1.35, powerScale);
      }
    }

    const affixCount = rarityData.affixes;
    const available = [...AFFIXES];
    for (let i = 0; i < affixCount && available.length; i += 1) {
      const index = randInt(0, available.length - 1);
      const affix = available.splice(index, 1)[0];
      let value = rand(affix.min, affix.max) + itemLevel * affix.perLevel;
      if (['power', 'defense', 'hp'].includes(affix.stat)) {
        value = Math.round(value * rarityData.multiplier * powerScale);
      } else {
        value *= 1 + (rarityData.multiplier - 1) * .45;
        value *= Math.min(1.25, powerScale);
      }
      item[affix.stat] = (item[affix.stat] ?? 0) + value;
      item.affixes.push({ id: affix.id, name: affix.prefix, stat: affix.stat, value });
    }

    if (item.affixes.length) item.name = `${item.affixes[0].name} ${base.name}`;
    if (rarity === 'legendary') item.name = `★ ${item.name}`;
    item.power = Math.round(item.power ?? 0);
    item.defense = Math.round(item.defense ?? 0);
    item.hp = Math.round(item.hp ?? 0);
    item.enhanceLevel = 0;
    ensureGearBaseStats(item);
    item.score = scoreGear(item);
    return item;
  }

  #score(item) {
    return scoreGear(item);
  }

  dropFromEnemy(enemy) {
    // Instant auto-loot — no world gold/item pickups on the field.
    const defense = this.game.mode === 'defense';
    const wave = defense ? Math.max(1, Number(enemy.wave ?? this.game.defense?.wave) || 1) : 0;
    const [minGold, maxGold] = enemy.goldRange ?? [1, 3];
    const waveBonus = defense ? 1 + wave * .035 : 1 + this.game.hunt.worldTier * .04;
    const levelBonus = enemyGoldLevelMul(enemy.level);
    let threatMul = 1;
    if (!defense && this.game.player) {
      // Hunt on-level / danger reward bias (+ MAX HUNT gold scale once).
      const kind = enemy.boss ? 'boss' : 'gold';
      threatMul = composeHuntRewardMul(
        (enemy.level ?? 1) - this.game.player.level,
        { isMax: Boolean(this.game.hunt?.isMax), kind },
      );
    }
    const multiplier = (enemy.elite ? 2.2 : 1)
      * (enemy.boss ? 5 : 1)
      * levelBonus
      * waveBonus
      * threatMul;
    const amount = Math.max(1, Math.round(randInt(minGold, maxGold) * multiplier));
    const player = this.game.player;
    const at = enemy.position.clone().add(new THREE.Vector3(0, Math.max(0.8, (enemy.refs?.modelHeight ?? 1.6) * 0.45), 0));
    const goldGained = player.addGold(amount);
    this.game.ui?.floatText?.(at, `+${goldGained}G`, 'loot');
    this.game.audio?.pickup?.('common');
    this.game.effects?.burst?.(at, 0xffd36d, 8, { speed: 2.8, size: 0.2, life: 0.35, upward: 0.35 });
    const potionChance = enemy.boss
      ? LOOT_CONFIG.potionDropChance.boss
      : enemy.elite
        ? LOOT_CONFIG.potionDropChance.elite
        : LOOT_CONFIG.potionDropChance.normal;
    if (player.potions < player.maxPotions && chance(potionChance)) {
      player.potions = Math.min(player.maxPotions, player.potions + LOOT_CONFIG.potionDropAmount);
      this.game.ui?.floatText?.(at.clone().add(new THREE.Vector3(0, 0.35, 0)), 'Potion +1', 'heal');
      this.game.audio?.pickup?.('uncommon');
      this.game.effects?.burst?.(at, 0x62f29b, 6, { speed: 2.4, size: 0.18, life: 0.32, upward: 0.4 });
    }
    this.game.requestSave?.();
    return [];
  }

  spawnGear(item, position) {
    const amount = Math.max(1, Math.round((Number(item?.itemLevel) || 1) + (Number(item?.score) || 0) * .35));
    return this.spawnConsumable('gold', position, amount);
  }

  spawnConsumable(kind, position, amount = 1) {
    // Gear and essence remain gold-only; potion drops are the survival exception.
    kind = kind === 'potion' ? 'potion' : 'gold';
    const group = new THREE.Group();
    const color = kind === 'gold' ? 0xffd36d : kind === 'potion' ? 0x62f29b : 0xc18aff;
    const material = new THREE.MeshToonMaterial({ color, emissive: color, emissiveIntensity: .5 });
    const dark = new THREE.MeshToonMaterial({ color: new THREE.Color(color).multiplyScalar(.55), emissive: color, emissiveIntensity: .1 });
    let core;
    if (kind === 'gold') {
      core = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .1, 12), material);
      core.rotation.x = Math.PI / 2;
      core.position.y = .5;
      group.add(core);
    } else if (kind === 'potion') {
      core = new THREE.Mesh(new THREE.SphereGeometry(.28, 10, 8), material);
      core.scale.y = 1.15;
      core.position.y = .48;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(.12, .15, .22, 8), dark);
      neck.position.y = .79;
      group.add(core, neck);
    } else {
      core = new THREE.Mesh(new THREE.OctahedronGeometry(.34, 1), material);
      core.position.y = .58;
      group.add(core);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.52, .035, 6, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .7 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = .58;
      group.add(ring);
    }
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(.05, .18, 3.4, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .16, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    beam.position.y = 1.7;
    group.add(beam);
    const ground = this.game.world.heightAt(position.x, position.z);
    group.position.set(position.x, ground + .06, position.z);
    this.game.scene.add(group);
    const pickup = { id: uid('loot'), kind, amount, group, refs: { group, beam, core }, baseY: ground + .06, age: 0, life: 90, collected: false };
    this.pickups.push(pickup);
    return pickup;
  }

  grantContractReward(tier = 1) {
    const gold = this.game.player.addGold(50 + tier * 60 + this.game.player.level * 8);
    return { gold };
  }

  update(delta) {
    const player = this.game.player;
    for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = this.pickups[i];
      pickup.age += delta;
      pickup.life -= delta;
      // Legacy / scripted world drops obey the same global auto-loot contract.
      if (player.alive) this.#collect(pickup);
      if (pickup.collected) {
        this.#removePickup(pickup);
        this.pickups.splice(i, 1);
        continue;
      }
      const group = pickup.group;
      const bob = Math.sin(pickup.age * 2.7 + i) * .12;
      group.position.y = pickup.baseY + bob;
      group.rotation.y += delta * (pickup.kind === 'gear' ? .75 : 1.45);
      if (pickup.refs.beam?.material) {
        const rarity = pickup.item?.rarity;
        const base = rarity === 'legendary' ? .26 : rarity === 'epic' ? .2 : .12;
        const amp = rarity === 'legendary' ? .1 : rarity === 'epic' ? .07 : .055;
        pickup.refs.beam.material.opacity = base + Math.sin(pickup.age * 3.2) * amp;
      }
      if (pickup.refs.glow?.material) pickup.refs.glow.material.opacity = .52 + Math.sin(pickup.age * 3.5) * .16;
      if (pickup.refs.ring?.material) {
        const base = pickup.item?.rarity === 'legendary' ? .48 : .32;
        pickup.refs.ring.material.opacity = base + Math.sin(pickup.age * 2.6) * .12;
        pickup.refs.ring.rotation.z += delta * .9;
      }

      const distance = group.position.distanceTo(player.position);
      if (distance < 5.2 && distance > 1.15) {
        const direction = player.position.clone().sub(group.position).setY(0);
        group.position.addScaledVector(direction.normalize(), delta * (6.5 - distance * .55));
        pickup.baseY = this.game.world.heightAt(group.position.x, group.position.z) + .08;
      }
      if (distance <= 1.35 && player.alive) this.#collect(pickup);
      if (pickup.collected || pickup.life <= 0) {
        this.#removePickup(pickup);
        this.pickups.splice(i, 1);
      }
    }
  }

  #collect(pickup) {
    if (pickup.collected) return;
    if (pickup.kind === 'gold') {
      const amount = this.game.player.addGold(pickup.amount);
      this.game.ui.notify(`Gold +${amount}`, 'loot');
      this.game.audio.pickup('common');
    } else if (pickup.kind === 'potion') {
      if (this.game.player.potions >= this.game.player.maxPotions) return;
      this.game.player.potions += 1;
      this.game.ui.notify('Recovery potion +1', 'loot');
      this.game.audio.pickup('uncommon');
    } else if (pickup.kind === 'essence') {
      this.game.player.essence += pickup.amount;
      this.game.ui.notify(`Wild essence +${pickup.amount}`, 'loot');
      this.game.audio.pickup('epic');
    } else {
      const result = this.game.player.addGear(pickup.item);
      if (!result.added) {
        const rarity = RARITIES[pickup.item.rarity] ?? RARITIES.common;
        const salvage = Math.max(3, Math.round((pickup.item.itemLevel + pickup.item.score * .3) * rarity.salvage));
        this.game.player.gold += salvage;
        this.game.ui.notify(`Bag full — ${pickup.item.name} auto-salvaged · +${salvage}G`, 'danger', 3.6);
      } else {
        const suffix = result.equipped ? ' · Auto-equipped' : '';
        this.game.ui.notify(`${RARITIES[pickup.item.rarity].name} ${pickup.item.name}${suffix}`, pickup.item.rarity, 3.2);
        this.game.audio.pickup(pickup.item.rarity);
      }
    }
    const color = pickup.kind === 'gold' ? 0xffd36d : pickup.kind === 'gear' ? pickup.item.rarityColor : pickup.kind === 'potion' ? 0x62f29b : 0xc18aff;
    this.game.effects.burst(pickup.group.position, color, 14, { speed: 3.5, size: .27, life: .48 });
    pickup.collected = true;
    this.game.requestSave?.();
  }

  #removePickup(pickup) {
    this.game.scene.remove(pickup.group);
    // Weapon clones: dispose cloned materials + release AssetManager ref (skip shared GLB geo).
    if (typeof pickup.refs?.release === 'function') {
      pickup.refs.release();
      pickup.refs.release = null;
      // Still dispose beam/glow/ring materials that live on the group outside the weapon root.
      for (const key of ['beam', 'glow', 'ring', 'shadow']) {
        const node = pickup.refs[key];
        if (!node?.material) continue;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          if (!material || material.name === 'silhouette-outline') continue;
          material.dispose?.();
        }
      }
      return;
    }
    pickup.group.traverse(object => {
      if (!object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material || material.name === 'silhouette-outline') continue;
        material.dispose?.();
      }
    });
  }

  clear() {
    for (const pickup of this.pickups) this.#removePickup(pickup);
    this.pickups.length = 0;
  }
}
