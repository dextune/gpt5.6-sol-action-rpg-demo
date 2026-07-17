/**
 * Panel action dispatcher (N1 UI extract).
 */
import { SKILLS } from '../../data/content.js';
import { titleCaseId } from '../uiShared.js';
import { renderInventory } from './inventoryPanel.js';
import { renderSkills } from './skillsPanel.js';
import { renderSystem } from './systemPanel.js';

export function handlePanelAction(ui, event) {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'filter') {
      ui.inventoryFilter = button.dataset.filter;
      renderInventory(ui);
    } else if (action === 'equip') {
      const item = ui.game.player.getItem(button.dataset.item);
      if (item && !ui.game.player.canEquipItem?.(item)) {
        ui.notify('This class cannot equip that weapon.', 'danger', 2.8);
        return;
      }
      if (ui.game.player.equip(button.dataset.item)) {
        ui.game.audio.click();
        ui.notify('Equipped new gear.', 'loot');
        ui.game.requestSave();
        renderInventory(ui);
      }
    } else if (action === 'sell' || action === 'salvage') {
      const value = ui.game.player.sell(button.dataset.item);
      if (value > 0) {
        ui.game.audio.click();
        ui.notify(`Sold · +${value}G`, 'loot');
        ui.game.requestSave();
        renderInventory(ui);
      }
    } else if (action === 'sell-junk' || action === 'salvage-low') {
      const result = ui.game.player.sellAllUnequipped({ rarities: ['common', 'uncommon'] });
      ui.notify(
        result.count ? `Sold ${result.count} junk · +${result.gold}G` : 'No Common/Uncommon gear to sell.',
        result.count ? 'loot' : 'danger',
      );
      if (result.count) ui.game.audio.click();
      ui.game.requestSave();
      renderInventory(ui);
    } else if (action === 'sell-all') {
      const result = ui.game.player.sellAllUnequipped();
      ui.notify(
        result.count ? `Sold ${result.count} items · +${result.gold.toLocaleString('en-US')}G` : 'Nothing to sell (equipped gear is kept).',
        result.count ? 'loot' : 'danger',
      );
      if (result.count) ui.game.audio.click();
      ui.game.requestSave();
      renderInventory(ui);
    } else if (action === 'weapon-enhance') {
      const result = ui.game.player.enhanceWeapon();
      if (!result.ok) {
        ui.notify(result.reason === 'gold' ? `Need ${result.cost.toLocaleString('en-US')}G to evolve the weapon.` : 'Weapon evolution is complete.', 'danger', 2.8);
        return;
      }
      if (result.success === false) {
        ui.game.audio.click();
        ui.notify(`Weapon enhance failed · remains at +${result.level}`, 'danger', 3.2);
        ui.game.requestSave();
        renderInventory(ui);
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
      renderInventory(ui);
    } else if (action === 'weapon-option-enhance') {
      const result = ui.game.player.enhanceWeaponOptions();
      if (!result.ok) {
        ui.notify(result.reason === 'gold' ? `Need ${result.cost.toLocaleString('en-US')}G to enhance weapon options.` : 'Weapon options are complete.', 'danger', 2.8);
        return;
      }
      ui.game.audio.click();
      ui.notify(`Weapon option surged · ${titleCaseId(result.stat)} +${(result.amount * 100).toFixed(1)}% · Lv.${result.level}`, 'loot', 3.2);
      ui.game.requestSave();
      renderInventory(ui);
    } else if (action === 'enhance') {
      const item = ui.game.player.getItem(button.dataset.item);
      const name = item?.name ?? 'Gear';
      const result = ui.game.player.enhance(button.dataset.item);
      if (!result.ok) {
        if (result.reason === 'gold') ui.notify(`Need ${result.cost}G to enhance.`, 'danger', 2.6);
        else if (result.reason === 'max') ui.notify('Already at max enhance (+10).', 'danger', 2.4);
        else ui.notify('Cannot enhance that item.', 'danger', 2.4);
        return;
      }
      ui.game.audio.click();
      ui.game.audio.levelUp?.();
      ui.notify(`Enhance complete · ${name} → +${result.level}`, 'level', 3.2);
      ui.game.requestSave();
      renderInventory(ui);
    } else if (action === 'upgrade-skill') {
      if (ui.game.player.upgradeSkill(button.dataset.skill)) {
        ui.game.audio.levelUp();
        ui.notify(`${SKILLS[button.dataset.skill].name} upgraded`, 'level');
        ui.game.requestSave();
        renderSkills(ui);
      }
    } else if (action === 'select-mutation') {
      const skill = SKILLS[button.dataset.skill];
      const milestone = Number(button.dataset.milestone);
      if (ui.game.player.setSkillMutation(button.dataset.skill, milestone, button.dataset.choice)) {
        const option = skill?.evolution?.mutations?.[milestone]?.[button.dataset.choice];
        ui.game.audio.click();
        ui.notify(`${skill.name} · Lv.${milestone} ${option?.label ?? titleCaseId(button.dataset.choice)}`, 'level');
        ui.game.requestSave();
        renderSkills(ui);
      }
    } else if (action === 'debug-skill-state') {
      if (!ui.game.debugEnabled) return;
      const changed = ui.game.debugSetSkillState({
        classId: button.dataset.debugClass,
        level: button.dataset.debugLevel,
        rank: button.dataset.debugRank,
      });
      if (changed) {
        ui.notify('Debug skill state updated.', 'level', 1.8);
        renderSkills(ui);
      }
    } else if (action === 'quality') {
      if (ui.game.setQuality(button.dataset.quality)) renderSystem(ui);
    } else if (action === 'resume') ui.closePanel();
    else if (action === 'save') {
      if (ui.game.saveGame(true)) ui.notify('Progress saved to browser storage.', 'loot');
    } else if (action === 'mute') {
      ui.game.audio.setMuted(!ui.game.audio.muted);
      renderSystem(ui);
    } else if (action === 'title') {
      ui.closePanel();
      ui.game.returnToTitle();
    } else if (action === 'reset-save') {
      if (window.confirm('Delete save data and start a new hunt?')) {
        ui.game.save.clear();
        ui.closePanel();
        ui.game.newGame();
      }
    }
  }
