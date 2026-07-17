/**
 * Inventory / weapon forge panel helpers (N1 UI extract).
 * Call with UI instance; DOM ids stay owned by index.html / UI.elements.
 */
import {
  GEAR_ENHANCE,
  WEAPON_ENHANCE,
  WEAPON_OPTION_ENHANCE,
} from '../../config.js';
import {
  RARITIES,
  WEAPON_EVOLUTIONS,
  getHeroClass,
  getWeaponResonance,
  weaponResonanceTier,
} from '../../data/content.js';
import {
  gearEnhanceCost,
  gearEnhanceSuccessChance,
  gearSellValue,
  weaponEnhanceCost,
  weaponEnhanceSuccessChance,
  weaponOptionEnhanceCost,
} from '../../systems/LootSystem.js';
import {
  PERCENT_STATS,
  STAT_KEYS,
  STAT_LABELS,
  escapeHtml,
  formatStatDelta,
  hexColor,
  itemIcon,
  statText,
  titleCaseId,
} from '../uiShared.js';

export function itemStats(ui, item, limit = 6, options = {}) {
    const compare = Boolean(options.compare);
    const equippedItem = compare
      ? ui.game.player.getItem(ui.game.player.equipped[item.slot])
      : null;
    const showDelta = Boolean(equippedItem && equippedItem.id !== item.id);
    const values = [];
    for (const key of STAT_KEYS) {
      const value = Number(item[key]) || 0;
      const base = showDelta ? (Number(equippedItem[key]) || 0) : 0;
      if (!value && !(showDelta && base)) continue;
      if (!value && !showDelta) continue;
      if (!value && showDelta && !base) continue;
      // Prefer showing stats that exist on the candidate (or on equipped when comparing).
      if (!value && showDelta) {
        const delta = -base;
        const deltaHtml = `<em class="stat-down">${formatStatDelta(key, delta)}</em>`;
        values.push(`<span>${STAT_LABELS[key]} 0 ${deltaHtml}</span>`);
        continue;
      }
      const main = statText(key, value);
      if (!showDelta) {
        values.push(`<span>${main}</span>`);
        continue;
      }
      const delta = value - base;
      if (Math.abs(delta) < 1e-9) {
        values.push(`<span>${main}</span>`);
      } else {
        const cls = delta > 0 ? 'stat-up' : 'stat-down';
        values.push(`<span>${main} <em class="${cls}">${formatStatDelta(key, delta)}</em></span>`);
      }
    }
    if (item.slot === 'weapon') {
      const speed = Number(item.speed ?? 1);
      let speedHtml = `Speed ×${speed.toFixed(2)}`;
      if (showDelta) {
        const baseSpeed = Number(equippedItem.speed ?? 1);
        const delta = speed - baseSpeed;
        if (Math.abs(delta) >= 0.005) {
          const cls = delta > 0 ? 'stat-up' : 'stat-down';
          speedHtml += ` <em class="${cls}">${formatStatDelta('speed', delta)}</em>`;
        }
      }
      values.push(`<span>${speedHtml}</span>`);
    }
    if (showDelta && (item.score != null || equippedItem.score != null)) {
      const scoreDelta = (item.score ?? 0) - (equippedItem.score ?? 0);
      if (Math.abs(scoreDelta) >= 1) {
        const cls = scoreDelta > 0 ? 'stat-up' : 'stat-down';
        values.push(`<span>Score <em class="${cls}">${scoreDelta > 0 ? '+' : ''}${Math.round(scoreDelta)}</em></span>`);
      }
    }
    return values.slice(0, limit).join('') || '<span>No special stats</span>';
  }

export function equipmentSlot(ui, slot) {
    const labels = { weapon: 'Main Weapon', armor: 'Armor', charm: 'Hunt Charm' };
    const item = ui.game.player.getItem(ui.game.player.equipped[slot]);
    if (!item) return `<article class="equipment-slot"><small>${labels[slot]}</small><strong>Empty</strong><div class="item-stats"><span>Obtain gear from hunting.</span></div></article>`;
    const plus = Number(item.enhanceLevel) || 0;
    const plusLabel = plus > 0 ? ` · +${plus}` : '';
    return `<article class="equipment-slot" style="--rarity:${hexColor(item.rarityColor)}">
      <img class="equipment-icon" src="${itemIcon(item)}" alt="">
      <small>${labels[slot]} · ${RARITIES[item.rarity].name}${plusLabel}</small><span class="item-score">S ${item.score}</span>
      <strong style="color:${hexColor(item.rarityColor)}">${plus > 0 ? `+${plus} ` : ''}${escapeHtml(item.name)}</strong>
      <div class="item-stats">${itemStats(ui, item, 6)}</div>
    </article>`;
  }

export function itemCard(ui, item) {
    const player = ui.game.player;
    const equipped = player.equipped[item.slot] === item.id;
    const canEquip = player.canEquipItem?.(item) ?? true;
    const equipLabel = equipped ? 'Equipped' : canEquip ? 'Equip' : 'Class';
    const plus = Number(item.enhanceLevel) || 0;
    const maxed = plus >= GEAR_ENHANCE.maxLevel;
    const cost = gearEnhanceCost(item);
    const chancePct = Math.round(gearEnhanceSuccessChance(item) * 100);
    const sellVal = (!equipped && !item.locked) ? gearSellValue(item) : 0;
    const canAfford = player.gold >= cost;
    const enhanceDisabled = maxed || !canAfford;
    const plusBadge = plus > 0 ? `<span class="enhance-badge">+${plus}</span>` : '';
    const enhanceMeta = maxed
      ? `<span class="meta-enhance maxed">+${plus} MAX</span>`
      : `<span class="meta-enhance${canAfford ? '' : ' unaffordable'}">+${plus}→+${plus + 1} · ${cost.toLocaleString('en-US')}G · ${chancePct}%</span>`;
    const sellMeta = equipped
      ? '<span class="meta-sell muted">Equipped</span>'
      : item.locked
        ? '<span class="meta-sell muted">Locked</span>'
        : `<span class="meta-sell">Sell ${sellVal.toLocaleString('en-US')}G</span>`;
    const enhanceTitle = maxed
      ? 'Already at max enhance'
      : canAfford
        ? `Spend ${cost}G. Failure keeps the current level.`
        : `Need ${cost}G (have ${player.gold})`;
    return `<article class="item-card ${equipped ? 'equipped' : ''}${canEquip ? '' : ' wrong-class'}${plus > 0 ? ' enhanced' : ''}" style="--rarity:${hexColor(item.rarityColor)}">
      <img class="item-icon" src="${itemIcon(item)}" alt="">
      <header><small>${RARITIES[item.rarity].name} · iLv.${item.itemLevel}${plus > 0 ? ` · +${plus}` : ''}</small><strong>${plus > 0 ? `+${plus} ` : ''}${escapeHtml(item.name)}</strong></header>
      <span class="item-score">S ${item.score}</span>
      ${plusBadge}
      <div class="item-stats">${itemStats(ui, item, 6, { compare: !equipped })}</div>
      <div class="item-meta" aria-hidden="true">${enhanceMeta}${sellMeta}</div>
      <div class="item-actions">
        <button type="button" data-action="equip" data-item="${item.id}" ${equipped || !canEquip ? 'disabled' : ''}>${equipLabel}</button>
        <button type="button" data-action="enhance" data-item="${item.id}" ${enhanceDisabled ? 'disabled' : ''} title="${enhanceTitle}">Enhance</button>
        <button type="button" data-action="sell" data-item="${item.id}" ${equipped || item.locked ? 'disabled' : ''} title="${sellVal ? `Sell for ${sellVal} gold` : 'Cannot sell'}">Sell</button>
      </div>
    </article>`;
  }

export function renderInventory(ui) {
    ui.elements['panel-title'].textContent = 'Weapon Forge';
    const player = ui.game.player;
    const weapon = player.weapon;
    const weaponLevel = Number(weapon.weaponEnhanceLevel ?? weapon.enhanceLevel) || 0;
    const optionLevel = Number(weapon.optionEnhanceLevel) || 0;
    const weaponMax = weaponLevel >= WEAPON_ENHANCE.maxLevel;
    const optionMax = optionLevel >= WEAPON_OPTION_ENHANCE.maxLevel;
    const weaponCost = weaponEnhanceCost(weapon);
    const weaponChance = weaponEnhanceSuccessChance(weapon);
    const optionCost = weaponOptionEnhanceCost(weapon);
    const stages = WEAPON_EVOLUTIONS[player.classId] ?? [];
    const stageTrack = stages.map(stage => `<span class="weapon-stage ${weaponLevel >= stage.level ? 'is-complete' : ''}${weaponLevel === stage.level ? ' is-current' : ''}"><i></i><small>+${stage.level}</small><b>${escapeHtml(stage.name)}</b></span>`).join('');
    const resonance = getWeaponResonance(player.classId);
    const resonanceTier = weaponResonanceTier(weaponLevel);
    const nextResonance = resonance.milestones.find(entry => entry.level > weaponLevel)?.level ?? Infinity;
    const hitAmp = resonanceTier > 0
      ? weaponLevel * WEAPON_ENHANCE.damageAmpStep + resonanceTier * WEAPON_ENHANCE.damageAmpTierStep
      : 0;
    const resonanceTrack = resonance.milestones.map(entry => {
      const state = weaponLevel >= entry.level ? 'is-unlocked' : entry.level === nextResonance ? 'is-next' : '';
      return `<span class="weapon-resonance-node ${state}"><small>+${entry.level}</small><b>${escapeHtml(entry.name)}</b><em>${escapeHtml(entry.summary)}</em></span>`;
    }).join('');
    const options = Object.entries(weapon.optionStats ?? {})
      .filter(([, value]) => Number(value) > 0)
      .map(([key, value]) => `<span>${STAT_LABELS[key] ?? titleCaseId(key)} +${PERCENT_STATS.has(key) ? `${(Number(value) * 100).toFixed(1)}%` : Math.round(value)}</span>`)
      .join('') || '<span>No weapon options yet.</span>';
    ui.elements['panel-content'].innerHTML = `
      <div class="weapon-forge-layout">
        <section class="equipment-column weapon-forge-card">
          <p class="section-label"><span>SIGNATURE WEAPON</span><b>Score ${Math.round(weapon.score ?? 0)}</b></p>
          <article class="equipment-slot weapon-slot" style="--rarity:${hexColor(weapon.rarityColor)}">
            <img class="equipment-icon" src="${itemIcon(weapon)}" alt="">
            <small>${escapeHtml(getHeroClass(player.classId).title)} · ${escapeHtml(weapon.model)}</small>
            <strong style="color:${hexColor(weapon.rarityColor)}">${escapeHtml(weapon.name)}</strong>
            <div class="item-stats">${itemStats(ui, weapon, 8)}</div>
          </article>
          <div class="weapon-option-list"><p class="section-label"><span>WEAPON OPTIONS · ${optionLevel}/${WEAPON_OPTION_ENHANCE.maxLevel}</span></p>${options}</div>
          <div class="character-stats">
            <span>Attack <b>${Math.round(player.attackPower)}</b></span><span>Defense <b>${Math.round(player.defense)}</b></span>
            <span>Health <b>${player.maxHp}</b></span><span>Crit <b>${(player.critChance * 100).toFixed(1)}%</b></span>
            <span>Atk Speed <b>${player.attackSpeed.toFixed(2)}</b></span><span>Skill Power <b>${Math.round(player.skillPower * 100)}%</b></span>
            <span>Lifesteal <b>${(player.leech * 100).toFixed(1)}%</b></span><span>Luck <b>${(player.luck * 100).toFixed(1)}%</b></span>
            <span>Gold <b>${player.gold.toLocaleString('en-US')}</b></span><span>Weapon <b>1 / 1</b></span>
          </div>
        </section>
        <section class="enhancement-column">
          <div class="enhancement-banner"><span>GOLD RESOURCES</span><strong>${player.gold.toLocaleString('en-US')}G</strong><small>Hunting rewards are gold only. Your signature weapon never drops.</small></div>
          <article class="enhancement-card weapon-enhancement-card">
            <div><span class="enhancement-kicker">WEAPON ENHANCE</span><h3>Evolution ${weaponLevel} / ${WEAPON_ENHANCE.maxLevel}</h3><p>Each level grants +${Math.round(WEAPON_ENHANCE.powerStep * 100)}% base power, intrinsic combat stats, and faster attacks. Resonance milestones multiply power again and unlock visible bonus hits.</p></div>
            <div class="weapon-stage-track">${stageTrack}</div>
            <button type="button" class="forge-button" data-action="weapon-enhance" ${weaponMax || player.gold < weaponCost ? 'disabled' : ''}>${weaponMax ? 'Evolution Complete' : `Weapon Enhance · ${weaponCost.toLocaleString('en-US')}G · ${Math.round(weaponChance * 100)}%`}</button>
          </article>
          <article class="enhancement-card option-enhancement-card">
            <div><span class="enhancement-kicker">WEAPON OPTION ENHANCE</span><h3>Options ${optionLevel} / ${WEAPON_OPTION_ENHANCE.maxLevel}</h3><p>Deterministically grants large Crit, Haste, Skill Power, Gold, Luck, and Lifesteal gains in a rapid six-stat cycle.</p></div>
            <button type="button" class="forge-button option-button" data-action="weapon-option-enhance" ${optionMax || player.gold < optionCost ? 'disabled' : ''}>${optionMax ? 'Options Complete' : `Option Enhance · ${optionCost.toLocaleString('en-US')}G`}</button>
          </article>
          <article class="enhancement-card weapon-resonance-card" style="--resonance:${hexColor(resonance.color)}">
            <div class="weapon-resonance-heading"><span class="enhancement-kicker">CLASS WEAPON RESONANCE</span><h3>${escapeHtml(resonance.name)} · Tier ${resonanceTier}/${resonance.milestones.length}</h3><strong>${resonanceTier ? `All hit damage +${Math.round(hitAmp * 100)}%` : 'First proc unlocks at +3'}</strong></div>
            <div class="weapon-resonance-track">${resonanceTrack}</div>
          </article>
        </section>
      </div>`;
  }
