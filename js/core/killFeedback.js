/**
 * Kill chain / multikill / level-up nova helpers (N4 Game extract).
 * State fields remain on the Game instance; helpers read/write game.*.
 */
import * as THREE from 'three';
import { GROWTH_CONFIG } from '../config.js';
import { SKILLS, getClassActiveSkills, getClassSkillIds } from '../data/content.js';

export function applyKillChainMods(game, active) {
    const mods = (game.ctx?.player ?? game.player)?.runMods;
    if (!mods) return;
    if (active) {
      mods.moveSpeed = 0.06;
      mods.killChainXp = 0.10;
    } else {
      mods.moveSpeed = 0;
      mods.killChainXp = 0;
    }
  }

export function applyChainAttackGrowth(game) {
    const cfg = GROWTH_CONFIG;
    const mods = (game.ctx?.player ?? game.player)?.runMods;
    if (!mods) return;
    const before = mods.attack ?? 1;
    mods.attack = Math.min(cfg.chainAttackCap, before + cfg.chainAttackBump);
    if (mods.attack > before) {
      (game.ctx?.player ?? game.player).invalidateStats?.();
      (game.ctx?.ui ?? game.ui)?.notify?.(
        `Kill surge · Attack +${Math.round(cfg.chainAttackBump * 100)}% (run)`,
        'level',
        2.4,
      );
    }
  }

export function individualKillBurst(game, k, defensePop = 1) {
    const burstCount = Math.round((k.boss ? 46 : k.elite ? 22 : 12) * defensePop);
    (game.ctx?.effects ?? game.effects).burst(k.position, k.color, burstCount, {
      speed: (k.boss ? 7.5 : 4.4) * (game.mode === 'defense' ? 1.12 : 1),
      size: (k.boss ? .55 : .3) * (game.mode === 'defense' ? 1.1 : 1),
      life: k.boss ? 1.2 : .62,
    });
    if (game.mode === 'defense' && (k.elite || k.boss)) {
      (game.ctx?.effects ?? game.effects).ring(k.ground, k.accent ?? 0xffd36d, k.boss ? 7 : 3.4, {
        life: k.boss ? 1.1 : .55, startScale: .08,
      });
    }
  }

export function checkChainMilestones(game) {
    const chain = game.killChain;
    const every = GROWTH_CONFIG.chainAttackEvery;
    const marks = new Set([25, 50, 100]);
    if (every > 0 && chain >= every) {
      for (let m = every; m <= chain; m += every) marks.add(m);
    }
    for (const mark of [...marks].sort((a, b) => a - b)) {
      if (chain >= mark && !game._chainMilestones.has(mark)) {
        game._chainMilestones.add(mark);
        (game.ctx?.ui ?? game.ui).notify(`${mark} KILL CHAIN!`, mark >= 100 ? 'boss' : 'level', 3.6);
        (game.ctx?.audio ?? game.audio)?.killSting?.(mark);
        (game.ctx?.effects ?? game.effects)?.ring?.((game.ctx?.player ?? game.player).position, 0xffe38a, 3.5 + mark * 0.02, {
          life: 0.55, startScale: 0.1,
        });
        // Permanent-in-run attack bump every N chain kills (Hunt + Defense).
        if (every > 0 && mark % every === 0) applyChainAttackGrowth(game);
      }
    }
  }

export function flushMultikill(game) {
    const kills = game.multikillBuffer;
    game.multikillBuffer = [];
    game.multikillTimer = 0;
    if (!kills.length) return;

    const defensePop = game.mode === 'defense' ? 1.35 : 1;
    if (kills.length >= 3) {
      const centroid = new THREE.Vector3();
      for (const k of kills) centroid.add(k.ground);
      centroid.multiplyScalar(1 / kills.length);
      const label = kills.length >= 6 ? 'MASSACRE!' : kills.length >= 4 ? 'QUAD!' : 'TRIPLE!';
      (game.ctx?.effects ?? game.effects).starburst(centroid.clone().add(new THREE.Vector3(0, 1.1, 0)), 0xffe38a, 4.2 + kills.length * 0.15, {
        life: 0.35, opacity: 0.9,
      });
      (game.ctx?.effects ?? game.effects).ring(centroid, 0xffd66b, 4.5 + kills.length * 0.35, {
        life: 0.55, startScale: 0.08, opacity: 0.9,
      });
      (game.ctx?.effects ?? game.effects).ring(centroid, 0xfff2c4, 2.8 + kills.length * 0.2, {
        life: 0.32, startScale: 0.15, height: 0.08, opacity: 0.75,
      });
      (game.ctx?.effects ?? game.effects).burst(centroid.clone().add(new THREE.Vector3(0, 1, 0)), 0xffe38a, Math.round(28 * defensePop + kills.length * 4), {
        speed: 6.5, size: 0.38, life: 0.75, upward: 0.55,
      });
      (game.ctx?.ui ?? game.ui).floatText(centroid.clone().add(new THREE.Vector3(0, 1.6, 0)), label, 'multikill');
      (game.ctx?.audio ?? game.audio)?.killSting?.(game.killChain);
      // Still show light elite/boss accent pops at each site without full individual bursts.
      for (const k of kills) {
        if (k.boss || k.elite) {
          (game.ctx?.effects ?? game.effects).burst(k.position, k.color, k.boss ? 18 : 10, {
            speed: 4, size: 0.28, life: 0.5,
          });
        }
      }
      return;
    }

    for (const k of kills) individualKillBurst(game, k, defensePop);
  }

export function applyKillSkillRefund(game, enemy) {
    const cfg = GROWTH_CONFIG;
    const player = (game.ctx?.player ?? game.player);
    if (!player?.alive) return;
    let cdr = cfg.killCdrFodder;
    let mpGain = cfg.killMpFodder;
    if (enemy.boss) {
      cdr = cfg.killCdrBoss;
      mpGain = cfg.killMpBoss;
    } else if (enemy.elite) {
      cdr = cfg.killCdrElite;
      mpGain = cfg.killMpElite;
    }
    for (const skill of getClassActiveSkills(player.classId)) {
      const id = skill.id;
      const cd = player.skillCooldowns[id] ?? 0;
      if (cd > 0) {
        player.skillCooldowns[id] = Math.max(cfg.killCdrFloor, cd - cdr);
      }
    }
    player.mp = Math.min(player.maxMp, player.mp + mpGain);
  }

export function levelUpNova(game) {
    const cfg = GROWTH_CONFIG;
    const player = (game.ctx?.player ?? game.player);
    if (!player) return;
    const origin = player.position;
    player.invulnerable = Math.max(player.invulnerable ?? 0, cfg.levelNovaInvuln);

    (game.ctx?.effects ?? game.effects).pillar(origin, 0xffe38a, 10, { life: 1.05, bottom: 1.45, opacity: 0.55 });
    (game.ctx?.effects ?? game.effects).ring(origin, 0xffe38a, cfg.levelNovaRadius + 0.8, { life: 0.9, startScale: 0.05, opacity: 0.92 });
    (game.ctx?.effects ?? game.effects).ring(origin, 0xfff2c4, cfg.levelNovaRadius * 0.55, {
      life: 0.45, startScale: 0.12, height: 0.1, opacity: 0.8,
    });
    (game.ctx?.effects ?? game.effects).burst(origin.clone().add(new THREE.Vector3(0, 1.05, 0)), 0xffd66b, 36, {
      speed: 6.2, size: 0.36, life: 0.72, upward: 0.5,
    });

    const radius = cfg.levelNovaRadius;
    const r2 = radius * radius;
    const enemies = (game.ctx?.enemies ?? game.enemies)?.enemies ?? [];
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - origin.x;
      const dz = enemy.position.z - origin.z;
      if (dx * dx + dz * dz > r2) continue;
      const dist = Math.hypot(dx, dz) || 0.001;
      const dir = new THREE.Vector3(dx / dist, 0, dz / dist);
      const amount = enemy.fodder
        ? cfg.levelNovaFodderDamage
        : Math.max(1, Math.round(enemy.maxHp * cfg.levelNovaNonFodderHpFrac));
      enemy.takeDamage(amount, game, {
        direction: dir,
        knockback: cfg.levelNovaKnockback,
        skill: true,
        multiHit: false,
        overkill: Boolean(enemy.fodder),
      });
    }
  }

export function updateKillFeedback(game, delta) {
    if (game.killChainTimer > 0) {
      game.killChainTimer -= delta;
      if (game.killChainTimer <= 0) {
        game.killChain = 0;
        game._chainMilestones?.clear?.();
        applyKillChainMods(game, false);
      }
    }
    if (game.multikillTimer > 0) {
      game.multikillTimer -= delta;
      if (game.multikillTimer <= 0) flushMultikill(game);
    }
  }

export function onEnemyKilled(game, enemy) {
    if (enemy.deathHandled) return;
    enemy.deathHandled = true;

    if (game.mode === 'defense') game.defense.onKill(enemy);
    else game.hunt.onKill(enemy);
    game.loot.dropFromEnemy(enemy);
    game.xpGems?.spawnFromKill(enemy);

    // Kill → skill uptime: CDR + MP (immediate, independent of XP gems).
    applyKillSkillRefund(game, enemy);

    const position = enemy.position.clone().add(new THREE.Vector3(0, Math.max(.7, enemy.refs.modelHeight * .45), 0));

    // Kill chain (2.5s window) — shared HUD counter for hunt + defense.
    if (game.killChainTimer > 0) game.killChain += 1;
    else game.killChain = 1;
    game.killChainTimer = game.killChainInterval;
    applyKillChainMods(game, game.killChain >= 10);
    checkChainMilestones(game);

    // Multikill buffer: suppress individual death bursts until window resolves.
    game.multikillBuffer.push({
      position: position.clone(),
      ground: enemy.position.clone(),
      accent: enemy.data?.accent ?? 0xeaf7d7,
      elite: enemy.elite,
      boss: enemy.boss,
      color: enemy.boss ? (enemy.data?.accent ?? 0xffd66b) : enemy.elite ? 0xffd66b : 0xeaf7d7,
    });
    game.multikillTimer = game.multikillWindow;

    if (enemy.overkill) {
      (game.ctx?.ui ?? game.ui).floatText(position.clone().add(new THREE.Vector3(0, 0.4, 0)), 'OVERKILL', 'overkill');
    }
    if (enemy.elite) (game.ctx?.ui ?? game.ui).notify(`Elite slain · ${enemy.data.name}`, 'uncommon', 2.8);
    if (enemy.boss) {
      (game.ctx?.effects ?? game.effects).pillar(enemy.position, enemy.data.accent, 14, { life: 1.55, bottom: 2.2 });
      (game.ctx?.effects ?? game.effects).ring(enemy.position, enemy.data.accent, 10, { life: 1.4, startScale: .06 });
      (game.ctx?.ui ?? game.ui).notify(`Boss defeated · ${enemy.data.name}`, 'boss', 5);
    }

    if (game.mode === 'hunt') game.requestSave();
  }

export function onXpLevelUps(game, levelUps = []) {
    if (!levelUps.length) return;
    for (const level of levelUps) {
      (game.ctx?.audio ?? game.audio).levelUp();
      (game.ctx?.ui ?? game.ui).notify(`LEVEL UP · Lv.${level} · Skill Point +1`, 'level', 4.4);
      for (const id of getClassSkillIds((game.ctx?.player ?? game.player).classId)) {
        const skill = SKILLS[id];
        if (skill && !skill.passive && skill.unlockLevel === level) {
          (game.ctx?.ui ?? game.ui).notify(`New skill unlocked · ${skill.name} [${skill.key}]`, 'level', 4.2);
        }
        // Generic passive feature notice (e.g. Gunner Smartlink at level 5).
        const notice = skill?.unlockNotice;
        if (skill?.passive && notice && Number(notice.level) === level) {
          (game.ctx?.ui ?? game.ui).notify(
            notice.title ? `${notice.title} — ${notice.body ?? ''}`.trim() : `Feature unlocked · ${skill.name}`,
            'level',
            4.6,
          );
        }
      }
      // Combat beat: nova + brief invuln (once per level gained).
      levelUpNova(game);
    }
    // Auto-spend SP so growth completes without opening the skill menu.
    const spent = (game.ctx?.player ?? game.player).autoSpendSkillPoints({
      onUnlock: (skill) => (game.ctx?.ui ?? game.ui).notify(`Skill ready · ${skill.name} [${skill.key}]`, 'level', 3.0),
    });
    if (spent > 0) (game.ctx?.ui ?? game.ui).notify(`Skills reinforced ×${spent}`, 'level', 2.6);
    if (game.mode === 'hunt') game.requestSave();
  }
