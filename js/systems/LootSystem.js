import * as THREE from 'three';
import { PLAYER_CONFIG, defenseRarityFloor } from '../config.js';
import {
  AFFIXES, ARMOR_BASES, CHARM_BASES, RARITIES, WEAPON_BASES, getHeroClass,
} from '../data/content.js';
import { chance, clamp, pick, rand, randInt, uid, weightedPick } from '../core/Utils.js';
import { createLootMesh } from '../graphics/ModelFactory.js';

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const STAT_KEYS = ['power', 'defense', 'hp', 'crit', 'haste', 'leech', 'xpBonus', 'goldBonus', 'skillPower', 'moveSpeed', 'luck'];

const BASE_LEVELS = Object.freeze({
  field_blade: 1, moon_saber: 5, stone_cleaver: 9, thorn_edge: 12,
  sun_fang: 18, glacier_brand: 27, ember_katana: 36, astral_oath: 50,
  oak_staff: 1, crystal_rod: 14, void_scepter: 40,
  night_fang: 1, viper_kris: 30,
  yew_bow: 1, longbow_ash: 16, storm_recurve: 38,
  hide_vest: 1, leaf_mail: 8, dune_plate: 16, frost_coat: 25, forge_shell: 36, starweave: 49,
  fang_charm: 1, breeze_knot: 6, heart_seed: 12, coin_eye: 19, scholar_rune: 28, eclipse_shard: 48,
});

export class LootSystem {
  constructor(game) {
    this.game = game;
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
    item.score = this.#score(item);
    return item;
  }

  #score(item) {
    return Math.round(
      (item.power ?? 0) * 1.65 + (item.defense ?? 0) * 1.3 + (item.hp ?? 0) * .105
      + (item.crit ?? 0) * 320 + (item.haste ?? 0) * 235 + (item.leech ?? 0) * 520
      + (item.xpBonus ?? 0) * 160 + (item.goldBonus ?? 0) * 120
      + (item.skillPower ?? 0) * 250 + (item.moveSpeed ?? 0) * 36 + (item.luck ?? 0) * 220
      + (item.itemLevel ?? 1) * 2.2,
    );
  }

  dropFromEnemy(enemy) {
    const drops = [];
    const level = enemy.level;
    const defense = this.game.mode === 'defense';
    const wave = defense ? Math.max(1, Number(enemy.wave ?? this.game.defense?.wave) || 1) : 0;
    const luck = this.game.player.luck;
    const tier = defense ? 0 : this.game.hunt.worldTier * .006;
    // Defense drops more often and floors rarity by wave so deep climbs stay gear-fed.
    const gearChance = enemy.boss ? 1 : enemy.elite
      ? (defense ? .88 : .78)
      : clamp((defense ? .16 : .105) + luck * .42 + tier + (defense ? wave * .0012 : 0), defense ? .16 : .105, defense ? .48 : .34);
    const gearCount = enemy.boss ? (defense ? 2 : 3) : chance(gearChance) ? 1 : 0;
    for (let i = 0; i < gearCount; i += 1) {
      let floor = enemy.boss ? (i === 0 ? 'epic' : 'rare') : enemy.elite ? 'uncommon' : 'common';
      if (defense) {
        const waveFloor = defenseRarityFloor(wave);
        if (RARITY_ORDER.indexOf(waveFloor) > RARITY_ORDER.indexOf(floor)) floor = waveFloor;
      }
      const powerScale = defense ? 1 + wave * 0.0085 : 1;
      const itemLevel = defense ? level + Math.floor(wave * 0.35) : level;
      const item = this.generateGear(itemLevel, {
        boss: enemy.boss,
        elite: enemy.elite,
        floor,
        powerScale,
        defenseWave: defense ? wave : 0,
      });
      const offset = new THREE.Vector3(rand(-1.2, 1.2), 0, rand(-1.2, 1.2));
      drops.push(this.spawnGear(item, enemy.position.clone().add(offset)));
    }

    const potionChance = this.game.player.potions < 2 ? .18 : (defense ? .09 : .055);
    if (chance(potionChance + (enemy.elite ? .08 : 0) + (enemy.boss ? .25 : 0))) {
      drops.push(this.spawnConsumable('potion', enemy.position.clone().add(new THREE.Vector3(rand(-.8, .8), 0, rand(-.8, .8)))));
    }
    if ((enemy.elite && chance(.28)) || enemy.boss) {
      const amount = enemy.boss ? randInt(4, 8) : randInt(1, 2);
      drops.push(this.spawnConsumable('essence', enemy.position.clone().add(new THREE.Vector3(rand(-.7, .7), 0, rand(-.7, .7))), amount));
    }
    return drops;
  }

  spawnGear(item, position) {
    const quality = this.game.quality ?? 'high';
    const refs = createLootMesh(item, {
      assets: this.game.assets,
      // Low/mobile quality still clones weapons; outlines stay off via loot mesh path.
      quality: quality === 'low' ? 'low' : 'medium',
    });
    const ground = this.game.world.heightAt(position.x, position.z);
    refs.group.position.set(position.x, ground + .08, position.z);
    this.game.scene.add(refs.group);
    const pickup = {
      id: uid('loot'), kind: 'gear', item, refs, group: refs.group,
      baseY: ground + .08, age: 0,
      life: item.rarity === 'legendary' ? 300 : item.rarity === 'epic' ? 180 : 120,
      collected: false,
    };
    this.pickups.push(pickup);
    if (item.rarity === 'legendary') {
      this.game.audio.legendary();
      this.game.ui.notify(`Legendary gear appears · ${item.name}`, 'legendary', 5);
      this.game.effects.pillar(position, item.rarityColor, 12, { life: 1.55, bottom: 1.45, opacity: .55 });
      this.game.effects.burst(position.clone().add(new THREE.Vector3(0, .4, 0)), item.rarityColor, 22, {
        speed: 4.2, size: .32, life: .7, upward: .35,
      });
    } else if (item.rarity === 'epic') {
      this.game.effects.pillar(position, item.rarityColor, 7.5, { life: .95, bottom: 1.05, opacity: .42 });
    }
    return pickup;
  }

  spawnConsumable(kind, position, amount = 1) {
    const group = new THREE.Group();
    const color = kind === 'potion' ? 0x62f29b : 0xc18aff;
    const material = new THREE.MeshToonMaterial({ color, emissive: color, emissiveIntensity: .5 });
    const dark = new THREE.MeshToonMaterial({ color: new THREE.Color(color).multiplyScalar(.55), emissive: color, emissiveIntensity: .1 });
    let core;
    if (kind === 'potion') {
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
    // Slight tier floors: T1 uncommon, T2–3 rare, T4–5 epic. Higher tiers roll a bit over player level.
    const rarityFloor = tier >= 4 ? 'epic' : tier >= 2 ? 'rare' : 'uncommon';
    const itemLevel = this.game.player.level + tier + (tier >= 4 ? 1 : 0);
    const gear = this.generateGear(itemLevel, { floor: rarityFloor });
    const angle = Math.random() * Math.PI * 2;
    const position = this.game.player.position.clone().add(new THREE.Vector3(Math.cos(angle) * 1.8, 0, Math.sin(angle) * 1.8));
    this.spawnGear(gear, position);
    const gold = this.game.player.addGold(50 + tier * 60 + this.game.player.level * 8);
    this.game.player.essence += Math.max(1, Math.floor(tier / 2) + (tier >= 4 ? 1 : 0));
    return { gear, gold };
  }

  update(delta) {
    const player = this.game.player;
    for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = this.pickups[i];
      pickup.age += delta;
      pickup.life -= delta;
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
    if (pickup.kind === 'potion') {
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
    const color = pickup.kind === 'gear' ? pickup.item.rarityColor : pickup.kind === 'potion' ? 0x62f29b : 0xc18aff;
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
