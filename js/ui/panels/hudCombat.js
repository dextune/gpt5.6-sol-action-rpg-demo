/**
 * Combat HUD helpers (N2 UI extract).
 */
import {
  WEAPON_ENHANCE,
  WEAPON_OPTION_ENHANCE,
} from '../../config.js';
import {
  getClassActiveSkills,
  getHeroClass,
  weaponResonanceTier,
} from '../../data/content.js';
import {
  weaponEnhanceCost,
  weaponEnhanceSuccessChance,
  weaponOptionEnhanceCost,
} from '../../systems/LootSystem.js';
import { resolveSkillForm } from '../../data/skillCombat.js';
import { clamp } from '../../core/Utils.js';
import { zoneBandSubtitle, zoneThreat } from '../../systems/huntThreat.js';
import {
  HUD_FORM_TIERS,
  mutationAccessibleText,
  mutationIconView,
  titleCaseId,
} from '../uiShared.js';

export function syncCombatForge(ui, player) {
    const forge = ui.elements['combat-forge'];
    if (!forge) return;
    const playing = ui.game.state === 'playing' || ui.game.state === 'paused';
    forge.classList.toggle('hidden', !playing || !player?.alive);
    const weapon = player?.weapon;
    if (!weapon) {
      if (ui.elements['combat-weapon-enhance']) ui.elements['combat-weapon-enhance'].disabled = true;
      if (ui.elements['combat-option-enhance']) ui.elements['combat-option-enhance'].disabled = true;
      return;
    }
    const wLv = Number(weapon.weaponEnhanceLevel ?? weapon.enhanceLevel) || 0;
    const oLv = Number(weapon.optionEnhanceLevel) || 0;
    const wMax = wLv >= WEAPON_ENHANCE.maxLevel;
    const oMax = oLv >= WEAPON_OPTION_ENHANCE.maxLevel;
    const wCost = weaponEnhanceCost(weapon);
    const oCost = weaponOptionEnhanceCost(weapon);
    const wChance = weaponEnhanceSuccessChance(weapon);
    if (ui.elements['combat-weapon-level']) {
      const resonanceTier = weaponResonanceTier(wLv);
      ui.elements['combat-weapon-level'].textContent = wMax ? 'MAX · R7' : `+${wLv} · R${resonanceTier}`;
    }
    if (ui.elements['combat-option-level']) {
      ui.elements['combat-option-level'].textContent = oMax ? 'MAX' : `+${oLv}`;
    }
    if (ui.elements['combat-weapon-cost']) {
      ui.elements['combat-weapon-cost'].textContent = wMax
        ? 'Done'
        : `${wCost.toLocaleString('en-US')}G · ${Math.round(wChance * 100)}%`;
    }
    if (ui.elements['combat-option-cost']) {
      ui.elements['combat-option-cost'].textContent = oMax
        ? 'Done'
        : `${oCost.toLocaleString('en-US')}G`;
    }
    const wBtn = ui.elements['combat-weapon-enhance'];
    const oBtn = ui.elements['combat-option-enhance'];
    if (wBtn) {
      wBtn.disabled = wMax || player.gold < wCost;
      wBtn.classList.toggle('is-max', wMax);
      wBtn.classList.toggle('is-unaffordable', !wMax && player.gold < wCost);
    }
    if (oBtn) {
      oBtn.disabled = oMax || player.gold < oCost;
      oBtn.classList.toggle('is-max', oMax);
      oBtn.classList.toggle('is-unaffordable', !oMax && player.gold < oCost);
    }
  }

export function runCombatWeaponEnhance(ui) {
    const result = ui.game.player.enhanceWeapon();
    if (!result.ok) {
      ui.notify(
        result.reason === 'gold'
          ? `Need ${result.cost.toLocaleString('en-US')}G to evolve the weapon.`
          : 'Weapon evolution is complete.',
        'danger',
        2.8,
      );
      return;
    }
    if (result.success === false) {
      ui.game.audio.click();
      ui.notify(`Weapon enhance failed · remains at +${result.level}`, 'danger', 3.2);
      ui.game.requestSave();
      syncCombatForge(ui, ui.game.player);
      return;
    }
    ui.game.audio.levelUp?.();
    if (result.resonance) {
      const player = ui.game.player;
      ui.game.effects.ring?.(player.position, result.resonance.color, 4.2, { life: 0.8, opacity: 0.9 });
      ui.game.effects.burst?.(player.position, result.resonance.color, 28, {
        speed: 7, size: 0.24, life: 0.75, gravity: 3, upward: 0.65, height: 0.8,
      });
      ui.notify(`RESONANCE UNLOCKED · ${result.resonance.name} · ${result.resonance.summary}`, 'level', 5.2);
    } else {
      ui.notify(`Weapon surged · ${ui.game.player.weapon.name} · +${result.level}`, 'level', 3.6);
    }
    ui.game.requestSave();
    syncCombatForge(ui, ui.game.player);
  }

export function runCombatOptionEnhance(ui) {
    const result = ui.game.player.enhanceWeaponOptions();
    if (!result.ok) {
      ui.notify(
        result.reason === 'gold'
          ? `Need ${result.cost.toLocaleString('en-US')}G to enhance weapon options.`
          : 'Weapon options are complete.',
        'danger',
        2.8,
      );
      return;
    }
    ui.game.audio.click();
    ui.notify(`Weapon option surged · ${titleCaseId(result.stat)} +${(result.amount * 100).toFixed(1)}% · Lv.${result.level}`, 'loot', 3.2);
    ui.game.requestSave();
    syncCombatForge(ui, ui.game.player);
  }

export function abilityBarSignature(ui, player) {
    const skills = getClassActiveSkills(player.classId).map(skill => {
      const choices = player.skillEvolution?.[skill.id] ?? {};
      return `${skill.id}:${player.skillRank(skill.id)}:${choices.tier40 ?? ''}:${choices.tier80 ?? ''}`;
    });
    return `${player.classId}|${player.level}|${skills.join('|')}`;
  }

export function updateAbilitySlot(ui, slot, ratio, seconds) {
    if (!slot) return;
    const value = clamp(ratio || 0, 0, 1);
    slot.style.setProperty('--cooldown', value);
    slot.classList.toggle('cooling', seconds > .05);
    slot.dataset.cd = seconds > .05 ? seconds.toFixed(seconds >= 10 ? 0 : 1) : '';
  }

export function updateAbility(ui, id, ratio, seconds) {
    const slot = ui.abilitySlots[id];
    if (!slot) return;
    updateAbilitySlot(ui, slot, ratio, seconds);
  }

export function syncAbilityBar(ui, player) {
    const classId = player.classId;
    const signature = abilityBarSignature(ui, player);
    if (ui.lastAbilitySignature === signature) return;
    ui.lastAbilitySignature = signature;
    const classChanged = ui.lastAbilityClassId !== classId;
    ui.lastAbilityClassId = classId;
    const hero = getHeroClass(classId);
    if (classChanged) {
      const attackLabel = document.getElementById('attack-slot-label');
      if (attackLabel) attackLabel.textContent = hero.attackLabel ?? 'Attack';
      const attackSlot = ui.abilitySlots.attack;
      if (attackSlot) {
        const icon = attackSlot.querySelector('.ability-icon');
        if (icon) {
          const attackIcon = hero.presentation?.attackIcon
            ?? hero.basicAttack?.attackIcon
            ?? (hero.attackStyle === 'magic' ? 'magic' : hero.attackStyle === 'ranged' ? 'bow' : 'melee');
          icon.classList.toggle('sword-icon', attackIcon === 'melee' || attackIcon === 'sword');
          icon.classList.toggle('starburst-icon', attackIcon === 'magic');
          icon.classList.toggle('bow-icon', attackIcon === 'bow');
          icon.classList.toggle('rifle-icon', attackIcon === 'rifle');
          icon.classList.toggle('smartlink-ready', false);
        }
      }
      for (const skillId of Object.keys(ui.boundSkillSlots)) delete ui.abilitySlots[skillId];
      ui.boundSkillSlots = {};
    }
    for (const skill of getClassActiveSkills(classId)) {
      const slot = ui.skillKeySlots[skill.key];
      if (!slot) continue;
      // data-slot is the stable touch binding/CSS position. The class skill id is metadata only.
      slot.dataset.slot = `skill-${skill.key.toLowerCase()}`;
      slot.dataset.skillId = skill.id;
      ui.boundSkillSlots[skill.id] = slot;
      ui.abilitySlots[skill.id] = slot;
      const nameEl = slot.querySelector('b');
      if (nameEl) nameEl.textContent = skill.name;
      const lock = slot.querySelector('.lock-level');
      if (lock) lock.textContent = `LV.${skill.unlockLevel}`;
      const kbd = slot.querySelector('kbd');
      if (kbd) kbd.textContent = skill.key;

      const rank = player.skillRank(skill.id);
      const unlocked = rank > 0;
      const bundle = resolveSkillForm(
        skill, Math.max(1, rank), player.level, player.skillEvolution?.[skill.id] ?? {},
      );
      const highestForm = unlocked ? (bundle.activeForms.at(-1) ?? 0) : 0;
      const tier = HUD_FORM_TIERS[highestForm] ?? null;
      slot.classList.remove('evolution-tier-i', 'evolution-tier-ii', 'evolution-tier-apex');
      if (tier) slot.classList.add(tier.className);
      slot.dataset.formTier = tier?.text ?? '';
      slot.dataset.skillRank = String(rank);

      const tierBadge = slot.querySelector('.skill-tier-badge');
      const form = tier ? skill.evolution?.forms?.[highestForm] : null;
      if (tierBadge) {
        tierBadge.textContent = tier?.text ?? '';
        tierBadge.classList.toggle('hidden', !tier);
        tierBadge.title = tier ? `Level ${highestForm} form: ${form?.label ?? tier.text}` : '';
      }

      const mutationLabels = [];
      const mutationContainer = slot.querySelector('.skill-mutation-badges');
      for (const gate of [40, 80]) {
        const badge = mutationContainer?.querySelector(`[data-mutation-tier="${gate}"]`);
        if (!badge) continue;
        const mutationId = unlocked ? bundle.mutations?.[`tier${gate}`] : null;
        const mutation = mutationId ? skill.evolution?.mutations?.[gate]?.[mutationId] : null;
        const fullLabel = mutation?.label ?? '';
        const summary = mutation?.summary ?? '';
        const icon = mutationIconView(mutation?.icon);
        badge.textContent = fullLabel ? `${icon.glyph}${icon.marker}` : '';
        badge.dataset.icon = fullLabel ? icon.token : '';
        badge.classList.toggle('hidden', !fullLabel);
        badge.title = fullLabel ? mutationAccessibleText(fullLabel, summary, gate) : '';
        if (fullLabel) {
          badge.setAttribute('aria-label', mutationAccessibleText(fullLabel, summary, gate));
          mutationLabels.push(`Level ${gate} mutation ${fullLabel}`);
        } else {
          badge.removeAttribute('aria-label');
        }
      }
      mutationContainer?.classList.toggle('hidden', mutationLabels.length === 0);

      const formLabel = form?.label ? `, ${form.label} ${tier.text}` : '';
      const mutationDescription = mutationLabels.length ? `, ${mutationLabels.join(', ')}` : '';
      slot.setAttribute('aria-label', `${skill.key}: ${skill.name}, rank ${rank}${formLabel}${mutationDescription}`);
      slot.title = `${skill.name}${form?.label ? ` · ${form.label}` : ''}${mutationLabels.length ? ` · ${mutationLabels.join(' · ')}` : ''}`;
    }
  }

export function updateBossHUD(ui) {
    const boss = ui.game.enemies.activeBoss;
    ui.elements.hud.classList.toggle('boss-active', Boolean(boss));
    if (!boss) {
      ui.elements['boss-hud'].classList.add('hidden');
      ui.elements['boss-break-row']?.classList.add('hidden');
      return;
    }
    ui.elements['boss-hud'].classList.remove('hidden');
    ui.elements['boss-name'].textContent = boss.data.name;
    ui.elements['boss-level'].textContent = `LV.${boss.level}`;
    ui.elements['boss-health-fill'].style.width = `${boss.healthRatio * 100}%`;
    ui.elements['boss-break-row']?.classList.toggle('hidden', true);
  }

export function updateReticle(ui) {
    const reticle = ui.elements['aim-reticle'];
    const pointer = ui.game.input.pointerPixels;
    if (pointer.x > 0 && pointer.y > 0) {
      reticle.style.left = `${pointer.x}px`;
      reticle.style.top = `${pointer.y}px`;
    }
  }

export function updateHUD(ui) {
    const player = ui.game.player;
    const hunt = ui.game.hunt;
    const zone = ui.game.world.currentZone;
    const isDefense = ui.game.mode === 'defense';
    const defenseHud = ui.game.defense?.hud;
    // Defense uses the same profile / hunt-record chrome as Hunt.
    ui.elements.hud.classList.remove('defense-active');
    ui.elements['player-name'].textContent = player.name;
    const levelLabel = `LV.${player.level}`;
    if (ui.elements['portrait-level']) ui.elements['portrait-level'].textContent = levelLabel;
    if (ui.elements['player-level-text']) ui.elements['player-level-text'].textContent = levelLabel;
    ui.elements['hunter-title'].textContent = isDefense
      ? 'Defense Hunter'
      : (hunt.isMax ? `MAX · ${hunt.hunterTitle}` : hunt.hunterTitle);
    const hpTransform = `scaleY(${player.healthRatio})`;
    if (ui.elements['hp-fill'].style.transform !== hpTransform) {
      ui.elements['hp-fill'].style.transform = hpTransform;
    }
    const mobileHpTransform = `scaleX(${player.healthRatio})`;
    if (ui.elements['mobile-hp-fill'].style.transform !== mobileHpTransform) {
      ui.elements['mobile-hp-fill'].style.transform = mobileHpTransform;
    }
    const mpTransform = `scaleY(${player.manaRatio})`;
    if (ui.elements['mp-fill'].style.transform !== mpTransform) {
      ui.elements['mp-fill'].style.transform = mpTransform;
    }
    const mobileMpTransform = `scaleX(${player.manaRatio})`;
    if (ui.elements['mobile-mp-fill'].style.transform !== mobileMpTransform) {
      ui.elements['mobile-mp-fill'].style.transform = mobileMpTransform;
    }
    const xpRatio = clamp(player.xp / Math.max(1, player.xpNeeded), 0, 1);
    if (ui.elements['xp-fill']) ui.elements['xp-fill'].style.width = `${xpRatio * 100}%`;
    if (ui.elements['xp-text']) {
      ui.elements['xp-text'].textContent = `${Math.floor(player.xp)} / ${player.xpNeeded}`;
    }
    if (ui.elements['class-state-row']) {
      const frenzyVisible = Boolean(player.frenzyActive);
      const overflowVisible = player.classId === 'wizard';
      const thornsVisible = player.classId === 'ranger' && Boolean(player.thornField);
      const verdictVisible = player.classId === 'ranger' && Boolean(player.predatorVerdict);
      const stimVisible = player.classId === 'gunner' && Boolean(player.stimRushActive);
      const rangerVisible = thornsVisible || verdictVisible;
      const stateCount = Number(frenzyVisible) + Number(overflowVisible)
        + Number(thornsVisible) + Number(verdictVisible) + Number(stimVisible);
      ui.elements.hud.classList.toggle('class-state-active', stateCount > 0);
      ui.elements.hud.dataset.classStateCount = String(stateCount);
      const frenzy = ui.elements['frenzy-chip'];
      const overflow = ui.elements['overflow-chip'];
      const ranger = ui.elements['ranger-state-row'];
      const stim = ui.elements['stim-chip'];
      frenzy.classList.toggle('hidden', !frenzyVisible);
      overflow.classList.toggle('hidden', !overflowVisible);
      ranger.classList.toggle('hidden', !rangerVisible);
      if (stim) stim.classList.toggle('hidden', !stimVisible);
      ui.elements['thorns-chip']?.classList.toggle('hidden', !thornsVisible);
      ui.elements['verdict-chip']?.classList.toggle('hidden', !verdictVisible);
      if (frenzyVisible) {
        frenzy.querySelector('span').textContent = `${player.shadowFrenzy.remaining.toFixed(1)}s`;
        frenzy.style.setProperty('--frenzy-ratio', player.frenzyRatio);
        frenzy.setAttribute('aria-label', `Shadow Frenzy: ${player.shadowFrenzy.remaining.toFixed(1)} seconds remaining`);
      }
      if (overflowVisible) {
        const value = clamp(Number(player.arcaneOverflow) || 0, 0, 100);
        const ready = value >= 100;
        overflow.classList.toggle('is-ready', ready);
        overflow.querySelector('span').textContent = ready ? 'READY' : `${Math.floor(value)}/100`;
        overflow.style.setProperty('--overflow-ratio', value / 100);
        overflow.setAttribute('aria-label', ready ? 'Arcane Overflow ready' : `Arcane Overflow: ${Math.floor(value)} of 100`);
      }
      if (thornsVisible) {
        ui.elements['thorns-chip'].querySelector('span').textContent = `${player.thornField.planted ?? 0}/4`;
      }
      if (verdictVisible) {
        ui.elements['verdict-chip'].querySelector('span').textContent = `${Math.round(100 * player.predatorVerdict.stored / Math.max(1, player.predatorVerdict.cap))}%`;
      }
      if (stimVisible && stim) {
        const left = Math.max(0, player.stimRush.remaining);
        stim.querySelector('span').textContent = `${left.toFixed(1)}s`;
        stim.setAttribute('aria-label', `Stim Rush: ${left.toFixed(1)} seconds remaining`);
      }
      // Smartlink state on the basic-attack slot.
      const attackSlot = ui.abilitySlots?.attack;
      const attackIcon = attackSlot?.querySelector('.ability-icon');
      if (attackIcon && player.classId === 'gunner') {
        const online = player.level >= 5;
        const locked = online && Boolean(player._smartlinkReticleEnemy?.alive);
        attackIcon.classList.toggle('smartlink-ready', online);
        attackIcon.classList.toggle('smartlink-locked', locked);
        attackSlot?.classList.toggle('smartlink-online', online);
      }
      ui.elements['class-state-row'].classList.toggle(
        'hidden',
        !(frenzyVisible || overflowVisible || rangerVisible || stimVisible),
      );
    }
    if (isDefense) {
      const wave = defenseHud?.wave ?? 1;
      const maxWave = defenseHud?.maxWave ?? 200;
      const remaining = defenseHud?.remaining ?? 0;
      // Zone ribbon carries wave identity (same chrome as Hunt world tier / zone name).
      ui.elements['world-tier'].textContent = `WAVE ${wave}/${maxWave}`;
      ui.elements['zone-name'].textContent = zone.name;
      const enc = defenseHud?.encounter;
      const mut = defenseHud?.mutator;
      const ribbonBits = [];
      if (enc) ribbonBits.push(enc);
      if (mut) ribbonBits.push(mut);
      ribbonBits.push(`${remaining} left`);
      ui.elements['zone-subtitle'].textContent = ribbonBits.join(' · ');
      // Hunt-record panel mirrors Hunt layout: contract slot shows wave objective.
      const titleParts = ['Defense Wave'];
      if (enc) titleParts.push(enc);
      if (mut) titleParts.push(mut);
      ui.elements['contract-title'].textContent = titleParts.join(' · ');
      ui.elements['contract-progress'].textContent = `${remaining} remaining · ${wave}/${maxWave}`;
      const clearRatio = clamp(wave / Math.max(1, maxWave), 0, 1);
      ui.elements['contract-fill'].style.width = `${clearRatio * 100}%`;
      if (ui.elements['contract-hint']) {
        ui.elements['contract-hint'].textContent = defenseHud?.encounterKicker
          || defenseHud?.mutatorSummary
          || 'Clear the wave · gold & shards scale up';
      }
      // Boss presence gauge → wave progress in Defense.
      ui.elements['boss-charge-text'].textContent = `${Math.floor(clearRatio * 100)}%`;
      ui.elements['boss-charge-fill'].style.width = `${clearRatio * 100}%`;
      const breakActive = (defenseHud?.breakWindow ?? 0) > 0 || (defenseHud?.breakValue ?? 0) > 0;
      ui.elements['boss-break-row']?.classList.toggle('hidden', !breakActive);
      if (breakActive && ui.elements['boss-break-fill']) {
        const broken = (defenseHud.breakWindow ?? 0) > 0;
        const ratio = broken ? 1 : clamp((defenseHud.breakValue ?? 0) / Math.max(1, defenseHud.breakMax ?? 100), 0, 1);
        ui.elements['boss-break-fill'].style.width = `${ratio * 100}%`;
        if (ui.elements['boss-break-text']) {
          ui.elements['boss-break-text'].textContent = broken
            ? `EXECUTE ${defenseHud.breakWindow.toFixed(1)}s`
            : `${Math.floor(ratio * 100)}%`;
        }
      }
      const defenseKills = defenseHud?.kills ?? defenseHud?.totalKills;
      ui.elements['kill-count'].textContent = (defenseKills ?? 0).toLocaleString('en-US');
      ui.elements['streak-count'].textContent = ui.game.killChain ?? 0;
      ui.elements['elite-count'].textContent = defenseHud?.elitesKilled ?? 0;
      ui.elements['boss-count'].textContent = defenseHud?.bossesKilled ?? 0;
    } else {
      const isMax = Boolean(hunt.isMax);
      ui.elements['world-tier'].textContent = isMax
        ? `MAX · WT ${hunt.worldTier}`
        : `WORLD TIER ${hunt.worldTier}`;
      ui.elements['zone-name'].textContent = zone.name;
      const living = ui.game.enemies?.livingCount ?? 0;
      const campDist = Math.hypot(player.position.x, player.position.z);
      let bandLine = zoneBandSubtitle(zone, player.level);
      if (isMax) {
        const contested = campDist < (ui.game?.config?.campRadius ?? 15) + 2;
        if (contested) {
          bandLine = living > 0
            ? `VILLAGE BREACH · ${living} HOSTILES`
            : 'CONTESTED SPRING';
          // Nearby enemies within spring contest radius → contested label.
          const radius = 12;
          const enemies = ui.game.enemies?.enemies ?? [];
          let near = false;
          for (const e of enemies) {
            if (!e?.alive) continue;
            const dx = e.position.x - player.position.x;
            const dz = e.position.z - player.position.z;
            if (dx * dx + dz * dz <= radius * radius) { near = true; break; }
          }
          if (near && campDist < 15) bandLine = `CONTESTED SPRING · ${living} HOSTILES`;
        } else {
          bandLine = `${bandLine} · ${living} hostiles`;
        }
      }
      ui.elements['zone-subtitle'].textContent = bandLine;
      const threat = isMax ? { id: 'danger' } : zoneThreat(player.level, zone);
      const ribbon = ui.elements['zone-subtitle']?.closest?.('.zone-ribbon')
        ?? document.querySelector('.zone-ribbon');
      if (ribbon) ribbon.dataset.threat = threat.id;
      ui.elements['kill-count'].textContent = hunt.totalKills.toLocaleString('en-US');
      ui.elements['streak-count'].textContent = ui.game.killChain ?? hunt.streak;
      ui.elements['elite-count'].textContent = hunt.elitesKilled;
      ui.elements['boss-count'].textContent = hunt.bossesKilled;
      ui.elements['boss-charge-text'].textContent = `${Math.floor(hunt.bossCharge)}%`;
      ui.elements['boss-charge-fill'].style.width = `${hunt.bossCharge}%`;
      const contract = hunt.contract;
      if (contract) {
        ui.elements['contract-title'].textContent = contract.label;
        ui.elements['contract-progress'].textContent = `${Math.floor(contract.progress)} / ${contract.target}`;
        ui.elements['contract-fill'].style.width = `${clamp(contract.progress / contract.target, 0, 1) * 100}%`;
        if (ui.elements['contract-hint']) {
          ui.elements['contract-hint'].textContent = contract.rewardHint
            || `Reward tier ${contract.rewardTier ?? 1}`;
        }
      } else if (ui.elements['contract-hint']) {
        ui.elements['contract-hint'].textContent = '';
      }
    }
    if (ui.elements['gold-count']) {
      ui.elements['gold-count'].textContent = player.gold.toLocaleString('en-US');
    }
    ui.elements['potion-count'].textContent = player.potions;
    syncCombatForge(ui, player);

    updateAbility(ui, 'dash', player.cooldownRatio('dash'), player.dashCooldown);
    updateAbility(ui, 'potion', player.cooldownRatio('potion'), player.potionCooldown);
    syncAbilityBar(ui, player);
    for (const skill of getClassActiveSkills(player.classId)) {
      const unlocked = player.skillRank(skill.id) > 0;
      const slot = ui.boundSkillSlots[skill.id] ?? ui.skillKeySlots[skill.key];
      if (!slot) continue;
      slot.classList.toggle('locked', !unlocked);
      updateAbilitySlot(ui, slot, player.cooldownRatio(skill.id), player.skillCooldowns[skill.id]);
      slot.classList.toggle('insufficient', unlocked && player.mp < skill.mp);
    }
    updateBossHUD(ui);
    // Smooth damage flash — hard class toggle at a threshold looked like random screen flicker.
    const flash = ui.elements['damage-flash'];
    if (flash) {
      const pulse = player.hitTimer > 0 ? Math.min(1, player.hitTimer / .19) : 0;
      flash.style.opacity = String(pulse * .55);
      flash.classList.toggle('active', pulse > .02);
    }

    if (zone.id !== ui.lastZoneId) {
      if (ui.lastZoneId !== null) ui.zoneEntered(zone);
      ui.lastZoneId = zone.id;
    }
  }
