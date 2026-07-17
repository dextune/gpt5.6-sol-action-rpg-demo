/**
 * Hunt records panel (N1 UI extract).
 */
import { ZONES } from '../../data/content.js';
import { formatTime } from '../../core/Utils.js';
import { escapeHtml } from '../uiShared.js';

export function renderHunter(ui) {
    ui.elements['panel-title'].textContent = 'Hunt Records';
    const hunt = ui.game.hunt;
    const contract = hunt.contract;
    const maxZoneKills = Math.max(1, ...Object.values(hunt.killsByZone));
    const zoneRows = Object.values(ZONES).map(zone => {
      const kills = hunt.killsByZone[zone.id] ?? 0;
      return `<div class="zone-record"><span>${zone.name}</span><b>${kills.toLocaleString('en-US')}</b><div><i style="width:${kills / maxZoneKills * 100}%"></i></div></div>`;
    }).join('');
    const discovered = Object.keys(hunt.killsByType).length;
    ui.elements['panel-content'].innerHTML = `
      <div class="records-layout">
        <section>
          <div class="record-card"><h3>${escapeHtml(hunt.hunterTitle)} · WORLD TIER ${hunt.worldTier}</h3>
            <div class="big-record"><div><strong>${hunt.totalKills}</strong><small>Total Kills</small></div><div><strong>${hunt.elitesKilled}</strong><small>Elite</small></div><div><strong>${hunt.bossesKilled}</strong><small>Boss</small></div><div><strong>${hunt.bestStreak}</strong><small>Best Streak</small></div></div>
          </div>
          <div class="record-card"><h3>Kills by Zone</h3>${zoneRows}</div>
        </section>
        <section>
          <div class="record-card"><h3>Current Contract</h3><div class="contract-detail"><small>REWARD TIER ${contract?.rewardTier ?? 1}</small><strong>${escapeHtml(contract?.label ?? 'Contract preparing')}</strong><p>${escapeHtml(contract?.description ?? '')}</p><p class="contract-reward-hint">${escapeHtml(contract?.rewardHint ?? '')}</p><div class="zone-record"><span>Progress</span><b>${Math.floor(contract?.progress ?? 0)} / ${contract?.target ?? 0}</b><div><i style="width:${contract ? contract.progress / contract.target * 100 : 0}%"></i></div></div></div></div>
          <div class="record-card"><h3>Codex & Play</h3><div class="character-stats"><span>Monsters Found <b>${discovered} / 42</b></span><span>Contracts Done <b>${hunt.completedContracts}</b></span><span>Play Time <b>${formatTime(ui.game.playTime)}</b></span><span>Next Boss <b>${Math.floor(hunt.bossCharge)}%</b></span></div></div>
        </section>
      </div>`;
  }
