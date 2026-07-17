/**
 * Active skill implementations — knight (Sol combat, not template).
 * Attached onto CombatSystem.prototype; `this` is the CombatSystem instance.
 */
import * as THREE from 'three';
import { skillDamage } from '../../../data/skillCombat.js';
import { getFxTheme } from '../../../data/fxThemes.js';
import { getHeroClass } from '../../../data/content.js';
import { clamp } from '../../../core/Utils.js';

const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();

export function attachKnightSkillMethods(proto) {
  Object.assign(proto, {
/** Snap non-boss enemies inside gatherRadius onto a safe ring around the knight. */
_whirlwindGather(player, combat, theme, state) {
  if (!state || state.gathered) return;
  state.gathered = true;
  const game = this.ctx ?? this.game;
  const center = player.position;
  const gatherRadius = (combat.gatherRadius ?? 10.5) * (combat.radiusMult ?? 1);
  const safeRing = combat.safeRing ?? 2.05;
  const cap = Math.max(1, Math.round(combat.gatherCap ?? combat.dragCap ?? 12));
  const enemies = game.enemies?.enemies ?? [];
  const candidates = [];
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const dist = enemy.position.distanceTo(center);
    if (dist > gatherRadius + (enemy.radius ?? 0.5)) continue;
    if (enemy.controlCategory === 'boss' || enemy.boss) {
      game.effects?.recipeBossPullResist?.(enemy.position, center, theme);
      continue;
    }
    candidates.push({ enemy, dist });
  }
  candidates.sort((a, b) => a.dist - b.dist);
  const taken = candidates.slice(0, cap).map(entry => entry.enemy);
  if (taken.length === 0) {
    game.effects?.recipeVortexPull?.(center, theme, gatherRadius * 0.55);
    return;
  }
  game.effects?.recipeVortexPull?.(center, theme, gatherRadius);
  const n = taken.length;
  let placed = 0;
  for (let i = 0; i < n; i += 1) {
    const enemy = taken[i];
    const from = enemy.position.clone();
    // Keep enemies already in/near the pack ring (no pointless reshuffle).
    const alreadyClose = from.distanceTo(center) <= safeRing + (enemy.radius ?? 0.55) + 0.4;
    state.dragTargets?.add?.(enemy.id);
    if (alreadyClose) {
      enemy.velocity?.set?.(0, 0, 0);
      enemy.knockback?.set?.(0, 0, 0);
      continue;
    }
    // Even ring placement with slight radial stagger so bodies don't stack.
    const angle = (placed / Math.max(1, n)) * Math.PI * 2 + (state.cast?.generation ?? 0) * 0.17;
    const ring = safeRing + (enemy.radius ?? 0.55) + (placed % 3) * 0.32;
    const dest = TMP_A.set(
      center.x + Math.cos(angle) * ring,
      from.y,
      center.z + Math.sin(angle) * ring,
    ).clone();
    game.world?.resolvePosition?.(dest, enemy.radius ?? 0.55);
    // Avoid hard overlaps with already-snapped packmates.
    for (let j = 0; j < i; j += 1) {
      const other = taken[j];
      const minSep = (enemy.radius ?? 0.55) + (other.radius ?? 0.55) + 0.12;
      const dx = dest.x - other.position.x;
      const dz = dest.z - other.position.z;
      const sep = Math.hypot(dx, dz);
      if (sep < minSep && sep > 1e-5) {
        const push = (minSep - sep) / sep;
        dest.x += dx * push;
        dest.z += dz * push;
        game.world?.resolvePosition?.(dest, enemy.radius ?? 0.55);
      }
    }
    game.effects?.trail?.(from.clone().add(new THREE.Vector3(0, 1, 0)), theme.primary, 0.45, 0.2);
    game.effects?.afterimage?.(from, theme.secondary ?? theme.primary, { life: 0.28, opacity: 0.5, scale: 0.95 });
    enemy.position.copy(dest);
    enemy.velocity?.set?.(0, 0, 0);
    enemy.knockback?.set?.(0, 0, 0);
    placed += 1;
    game.effects?.trail?.(dest.clone().add(new THREE.Vector3(0, 1, 0)), theme.core ?? theme.primary, 0.5, 0.22);
  }
  game.effects?.ring?.(center, theme.core ?? theme.primary, safeRing + 1.2, {
    life: 0.4, startScale: 0.15, opacity: 0.7,
  });
},

_whirlwindPulse(player, bundle, hitIndex, state = null) {
  const { combat, theme } = this._skillBundle(bundle);
  const radius = combat.radius * (combat.radiusMult ?? 1);
  const hits = Math.max(1, Math.round(combat.hits ?? 3));
  const finale = hitIndex >= hits - 1;
  if (state && !this._ownsCast(player, state.cast)) return;
  if (state && hitIndex === 0) this._apexAudioPhase(player, state.apexAudio, 'impact');
  if (state && finale) this._apexAudioPhase(player, state.apexAudio, 'finisher');
  if (hitIndex === 0) player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.34);
  // First contact: teleport-gather pack, then carve the ring.
  if (state && hitIndex === 0) this._whirlwindGather(player, combat, theme, state);
  (this.ctx ?? this.game).effects.recipeSpinStorm(player.position, player.facing, theme, radius, hitIndex, finale);
  (this.ctx ?? this.game).audio.swing?.(hitIndex % 4);
  this._hitEnemiesInRadius(player.position, radius, skillDamage(player.attackPower, combat), {
    knockback: finale ? combat.knockbackFinale : combat.knockbackPulse,
    multiHit: true,
    criticalBonus: combat.criticalBonus ?? 0.03,
    skill: true,
    status: combat.bleedEvery && (hitIndex + 1) % combat.bleedEvery === 0 ? combat.bleed : null,
    onHit: enemy => {
      if(finale&&state)this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat),castKey:`whirl-${state.cast.generation}`,budget:state.apexBudget});
      // Residual drag for mutations that still request pullToward (non-teleport soft pull).
      const dragAllowed = !combat.dragCap || state.dragTargets.has(enemy.id) || state.dragTargets.size < combat.dragCap;
      if ((combat.inwardDrag || combat.cageDrag) && enemy.controlCategory !== 'boss' && dragAllowed && hitIndex > 0) {
        state.dragTargets.add(enemy.id);
        enemy.pullToward?.(player.position, combat.safeRing ?? 1.45, combat.cageDrag ?? combat.inwardDrag, (this.ctx ?? this.game).world, (this.ctx ?? this.game).enemies.enemies);
      }
      if (finale && combat.durableMult && (enemy.elite || enemy.boss)) {
        this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * (combat.durableMult - 1), {
          multiHit: true, skill: true, sameCastHit: { key: `whirl-${state.cast.generation}:durable`, maxHits: 1 },
        });
        enemy.addStagger?.(combat.durableStagger ?? 0);
      }
    },
  });
  if (finale && state && combat.rovingGale && !state.scarred) {
    state.scarred = true;
    const from = state.origin.clone(); const to = player.position.clone(); const scarFacing = state.facing.clone();
    this._delay(.1, () => {
      if (!this._ownsCast(player, state.cast)) return;
      (this.ctx ?? this.game).effects.recipeWhirlwindScar?.(from, to, theme);
      const segment = to.clone().sub(from).setY(0); const lengthSq = Math.max(1e-6, segment.lengthSq());
      for (const enemy of (this.ctx ?? this.game).enemies.enemies) {
        if (!enemy.alive) continue;
        const relative = enemy.position.clone().sub(from).setY(0);
        const t = clamp(relative.dot(segment) / lengthSq, 0, 1);
        const nearest = from.clone().addScaledVector(segment, t);
        if (enemy.position.distanceTo(nearest) > .75 + enemy.radius) continue;
        this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.scarMult, {
          direction: scarFacing, multiHit: true, skill: true,
          sameCastHit: { key: `whirl-${state.cast.generation}:scar:${enemy.id}`, maxHits: 1 },
        });
      }
    });
  }
  if (finale && state && (combat.finalCross || combat.sovereign)) {
    const facing = this._facingDir(player); const side = new THREE.Vector3(-facing.z, 0, facing.x);
    for (const enemy of (this.ctx ?? this.game).enemies.enemies) {
      if (!enemy.alive) continue;
      const offset = enemy.position.clone().sub(player.position).setY(0);
      const axes = [
        Math.abs(offset.dot(side)) <= .65 && Math.abs(offset.dot(facing)) <= radius,
        Math.abs(offset.dot(facing)) <= .65 && Math.abs(offset.dot(side)) <= radius,
      ];
      axes.forEach((onAxis, axis) => {
        if (onAxis && this._consumeHitBudget(state.crossBudget, enemy, Math.min(2, combat.crossBudget ?? 2))) this._damageEnemy(enemy,
          skillDamage(player.attackPower, combat) * (combat.crossMult ?? .35), {
            multiHit: true, skill: true, sameCastHit: { key: `whirl-${state.cast.generation}:cross-${axis}:${enemy.id}`, maxHits: 1 },
          });
      });
    }
    (this.ctx ?? this.game).effects.recipeSovereignCross?.(player.position, facing, theme, radius);
  }
},

_whirlwind(player, bundle, phase = null, apexAudio = null) {
  const { combat } = this._skillBundle(bundle);
  const hits = Math.max(1, Math.round(combat.hits ?? 3));
  if (phase != null && phase !== 'full') {
    if (!player.alive) return;
    const index = Number(phase);
    if (!Number.isInteger(index) || index < 0 || index >= hits) return;
    let state = this.whirlwindStates.get(player);
    if (index === 0) {
      state = { cast: this._beginOwnedCast(player, bundle.id), bundle, completed: new Set(), origin: player.position.clone(),
        facing: this._facingDir(player), dragTargets: new Set(), crossBudget: new Map(), scarred: false, gathered: false, apexAudio, apexBudget:{targets:new Map(),casts:new Set()} };
      this.whirlwindStates.set(player, state);
    }
    if (!state || state.bundle !== bundle || !this._ownsCast(player, state.cast) || state.completed.has(index)) return;
    state.completed.add(index);
    this._whirlwindPulse(player, bundle, index, state);
    if (index >= hits - 1) this.whirlwindStates.delete(player);
    return;
  }
  const state = { cast: this._beginOwnedCast(player, bundle.id), bundle, completed: new Set(), origin: player.position.clone(),
    facing: this._facingDir(player), dragTargets: new Set(), crossBudget: new Map(), scarred: false, gathered: false, apexAudio, apexBudget:{targets:new Map(),casts:new Set()} };
  this.whirlwindStates.set(player, state);
  // Fallback absolute delays if anim timeline not used
  for (let hit = 0; hit < hits; hit += 1) {
    this._delay(0.06 + hit * 0.15 * (combat.cadenceMult ?? 1), () => {
      if (!this._ownsCast(player, state.cast)) return;
      if (state.completed.has(hit)) return;
      state.completed.add(hit);
      this._whirlwindPulse(player, bundle, hit, state);
      if (hit === hits - 1) this.whirlwindStates.delete(player);
    });
  }
},

_crescent(player, bundle, phase = null, apexAudio = null) {
  const { combat, theme } = this._skillBundle(bundle);
  const acts = bundle.playerLevel >= 100 ? 3 : bundle.playerLevel >= 20 ? 2 : 1;
  const execute = index => {
    let state = this.crescentStates.get(player);
    if (index === 0) {
      state = { cast:this._beginOwnedCast(player,bundle.id), bundle, completed:new Set(), origin:player.position.clone(),
        facing:this._facingDir(player), points:[], crossHits:new Map(), released:false, apexAudio, apexBudget:{targets:new Map(),casts:new Set()} };
      this.crescentStates.set(player,state);
    }
    if (!state || state.bundle !== bundle || !this._ownsCast(player,state.cast) || index<0 || index>=acts || state.completed.has(index)) return;
    state.completed.add(index);
    if(index===0)this._apexAudioPhase(player,state.apexAudio,'impact');
    if(index===acts-1)this._apexAudioPhase(player,state.apexAudio,'finisher');
    if (index === 0 && !state.released) {
      (this.ctx ?? this.game).audio.swing?.(0);
      state.released=true; const waves=Math.min(3,combat.waveCount??1); const yaw0=Math.atan2(state.facing.x,state.facing.z);
      (this.ctx ?? this.game).effects.recipeWorldsplitterAct?.(state.origin,state.facing,theme,0,Boolean(combat.worldsplitter));
      (this.ctx ?? this.game).effects.recipeBladeRift?.(state.origin,state.facing,theme,8.5);
      for(let wave=0;wave<waves;wave+=1){const yaw=yaw0+(wave-(waves-1)/2)*(combat.spread??0);const dir=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
        const start=state.origin.clone().addScaledVector(dir,1.2).add(new THREE.Vector3(0,1,0));
        this._spawnFriendlyOrb(start,dir,{style:'blade_wave',color:theme.primary,damage:skillDamage(player.attackPower,combat)*(combat.damageMult??combat.waveMult??1),speed:combat.speed,
          radius:(combat.radius??1.55)*(combat.radiusMult??1),life:1.4,pierce:Math.round(combat.pierce??4),knockback:combat.knockback??1.1,skill:true,wave:true,
          ownerGuard:()=>this._ownsCast(player,state.cast),
          statusOnHit:combat.status??null,onHit:enemy=>{if(state.points.length<Math.min(6,combat.crossCap??6))state.points.push(enemy.position.clone());
            // Blade Rift hold — pin non-boss prey in the corridor (bosses resist VFX only).
            if(enemy.controlCategory==='boss'||enemy.boss){(this.ctx ?? this.game).effects.recipeBossPullResist?.(enemy.position,state.origin,theme);}
            else{enemy.applyStun?.(combat.holdDuration??1.1);enemy.velocity?.set?.(0,0,0);enemy.knockback?.set?.(0,0,0);}
            if(combat.crosscurrent&&!state.crossHits.has(enemy.id)&&state.crossHits.size<Math.min(6,combat.crossCap??6)){state.crossHits.set(enemy.id,1);const side=new THREE.Vector3(-dir.z,0,dir.x);
              this._delay(.08,()=>{if(!this._ownsCast(player,state.cast))return;this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.crossMult,{multiHit:true,skill:true,sameCastHit:{key:`cres-${state.cast.generation}:cross:${enemy.id}`,maxHits:1}});(this.ctx ?? this.game).effects.recipeCrosscurrent?.(enemy.position,side,theme);});}
            if(combat.severMult&&(enemy.elite||enemy.boss)){this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.severMult,{multiHit:true,skill:true,sameCastHit:{key:`cres-${state.cast.generation}:sever:${enemy.id}`,maxHits:1}});enemy.applyStatus?.('armor_break',{duration:combat.armorBreakDuration,power:combat.armorBreakPower},this.game);}},
        });}
      if(bundle.playerLevel<20&&bundle.rank>=3&&combat.residualMult>0){const scarCenter=state.origin.clone().addScaledVector(state.facing,4.2);this._delay(combat.residualDelay??.42,()=>{if(!this._ownsCast(player,state.cast))return;(this.ctx ?? this.game).effects.groundDecal?.(scarCenter,theme.accent,combat.residualRadius??1.85,{life:1.6,opacity:.45,startScale:.2});this._hitEnemiesInRadius(scarCenter,combat.residualRadius??1.85,skillDamage(player.attackPower,combat,'residualMult'),{knockback:0.6,multiHit:true,skill:true,onHit:e=>{if(e.controlCategory!=='boss'&&!e.boss)e.applyStun?.((combat.holdDuration??1.1)*0.55);}});});}
    } else if(index===1){(this.ctx ?? this.game).audio.swing?.(1);(this.ctx ?? this.game).effects.recipeWorldsplitterAct?.(state.origin,state.facing,theme,1,Boolean(combat.worldsplitter));
      if(combat.moonScar||bundle.rank>=3)this._delay(combat.residualDelay??.42,()=>{if(!this._ownsCast(player,state.cast))return;this._segmentDamage(state.origin,state.origin.clone().addScaledVector(state.facing,8),.9,skillDamage(player.attackPower,combat)*(combat.scarMult??combat.residualMult??.3),{multiHit:true,skill:true,onHit:e=>{if(e.controlCategory!=='boss'&&!e.boss)e.applyStun?.((combat.holdDuration??1.1)*0.6);}},`cres-${state.cast.generation}:scar`);});
      if(combat.riftTicks)for(let tick=0;tick<Math.min(3,combat.riftTicks);tick+=1)this._delay(.18+tick*.16,()=>{if(!this._ownsCast(player,state.cast))return;
        const to=state.origin.clone().addScaledVector(state.facing,8);const segment=to.clone().sub(state.origin);const lengthSq=segment.lengthSq();let targets=0;
        for(const enemy of (this.ctx ?? this.game).enemies.enemies){if(!enemy.alive||targets>=Math.min(4,combat.riftCap??4))continue;const rel=enemy.position.clone().sub(state.origin).setY(0);const t=clamp(rel.dot(segment)/lengthSq,0,1);if(enemy.position.distanceTo(state.origin.clone().addScaledVector(segment,t))>.9+enemy.radius)continue;
          // Rift Trail control: short stun on normals (tests expect .2 scale authority), boss stagger only.
          const result=this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.riftMult,{multiHit:true,skill:true,sameCastHit:{key:`cres-${state.cast.generation}:rift-${tick}:${enemy.id}`,maxHits:1}});if(result.amount>0){targets+=1;if(enemy.boss)enemy.addStagger?.(4);else enemy.applyStun?.(.2);}}
      });
    } else if(index===2){(this.ctx ?? this.game).audio.swing?.(2);(this.ctx ?? this.game).effects.recipeWorldsplitterAct?.(state.origin,state.facing,theme,2,true);this._delay(.16,()=>{if(!this._ownsCast(player,state.cast))return;const raw=skillDamage(player.attackPower,combat)*combat.ruptureMult;this._segmentDamage(state.origin,state.origin.clone().addScaledVector(state.facing,10),1,raw,{multiHit:true,skill:true,onHit:enemy=>this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:raw,castKey:`cres-${state.cast.generation}`,budget:state.apexBudget})},`cres-${state.cast.generation}:rupture`);});}
    if(index===acts-1)this.crescentStates.delete(player);
  };
  if(phase!=null&&phase!=='full'){const index=Number(phase);if(Number.isInteger(index))execute(index);return;}
  const chain=index=>{execute(index);if(index+1<acts)this._delay(.18,()=>chain(index+1));};chain(0);
},

_knightChargeTarget(player, combat) {
  const facing = this._facingDir(player);
  const range = combat.chargeRange ?? 9.5;
  const threshold = Math.cos((combat.chargeArc ?? 1.5) * .5);
  const enemies = (this.ctx ?? this.game).enemies?.enemies ?? [];
  const candidates = [];
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const offset = enemy.position.clone().sub(player.position).setY(0);
    const distance = offset.length();
    if (distance < .001 || distance > range + (enemy.radius ?? .5)) continue;
    if (offset.clone().normalize().dot(facing) < threshold) continue;
    let pack = 0;
    for (const other of enemies) if (other.alive
      && other.position.distanceTo(enemy.position) <= (combat.radius ?? 4.5) + (other.radius ?? .5)) pack += 1;
    candidates.push({ enemy, distance, pack });
  }
  candidates.sort((a, b) => b.pack - a.pack || a.distance - b.distance);
  const locked = candidates[0]?.enemy ?? null;
  const direction = locked
    ? locked.position.clone().sub(player.position).setY(0).normalize()
    : facing;
  const travel = locked
    ? Math.max(0, Math.min(range, candidates[0].distance - (locked.radius ?? .5) - (combat.stopDistance ?? 1.25)))
    : Math.min(range, combat.missDistance ?? 5.5);
  const target = player.position.clone().addScaledVector(direction, travel);
  target.y = (this.ctx ?? this.game).world.heightAt(target.x, target.z);
  (this.ctx ?? this.game).world.resolvePosition(target, .48);
  player.facing.copy(direction);
  return { target, direction, locked };
},

_skyfallLegacy(player, bundle, apexAudio = null) {
  this._skyfall(player, bundle, 'full', apexAudio);
},

_skyfall(player, bundle, phase = null, apexAudio = null) {
  const runPhase = index => {
    let cast = this.skillCastState.get(player);
    if (!cast || cast.bundle !== bundle) {
      if (index !== 0) return false;
      const { combat } = this._skillBundle(bundle);
      const charge = this._knightChargeTarget(player, combat);
      cast = {
        bundle,
        authority: this._beginOwnedCast(player, bundle.id),
        origin: player.position.clone(),
        target: charge.target,
        direction: charge.direction,
        locked: charge.locked,
        chargeComplete: false,
        completed: new Set(),
        apexAudio,
        apexBudget: { targets:new Map(), casts:new Set() },
      };
      this.skillCastState.set(player, cast);
    }
    if (cast.completed.has(index) || !this._ownsCast(player, cast.authority)) return false;
    if (!player.alive) {
      if (index === 1) this.skillCastState.delete(player);
      return false;
    }
    const { combat, theme } = this._skillBundle(bundle);
    const enemies = (this.ctx ?? this.game).enemies.enemies;
    const radius = combat.radius * (combat.radiusMult ?? 1);
    if (index === 0) {
      cast.completed.add(index);
      const duration = Math.max(.08, combat.chargeDuration ?? .18);
      const steps = 5;
      for (let step = 1; step <= steps; step += 1) this._delay(duration * step / steps, () => {
        if (!player.alive || !this._ownsCast(player, cast.authority)
          || this.skillCastState.get(player) !== cast) return;
        player.position.lerpVectors(cast.origin, cast.target, step / steps);
        (this.ctx ?? this.game).world.resolvePosition(player.position, .48);
        (this.ctx ?? this.game).effects.trail?.(
          player.position.clone().add(new THREE.Vector3(0, .75, 0)), theme.primary, .34, .16,
        );
        if (step !== steps) return;
        cast.chargeComplete = true;
        cast.target.copy(player.position);
        this._apexAudioPhase(player, cast.apexAudio, 'impact');
        (this.ctx ?? this.game).effects.recipeLeapImpact(cast.target, cast.direction, theme, radius * .78);
        const chargeRaw = skillDamage(player.attackPower, combat, 'chargeMult');
        this._segmentDamage(cast.origin, cast.target, combat.chargeWidth ?? 1.45, chargeRaw, {
          direction: cast.direction, knockback: .8, armorPierce: combat.armorPierce ?? .25,
          multiHit: true, skill: true,
        }, `vanguard-${cast.authority.generation}:charge`);
        if (combat.arrivalMult) this._hitEnemiesInRadius(cast.target, radius * .78,
          skillDamage(player.attackPower, combat, 'arrivalMult'), {
            direction: cast.direction, knockback: 1.2, multiHit: true, skill: true,
            sameCastHit: { key: `vanguard-${cast.authority.generation}:arrival`, maxHits: 1 },
          });
      });
      return true;
    }
    if (!cast.chargeComplete) {
      this._delay(.04, () => {
        if (this.skillCastState.get(player) === cast && this._ownsCast(player, cast.authority)) runPhase(1);
      });
      return false;
    }
    cast.completed.add(index);
    this._apexAudioPhase(player,cast.apexAudio,'finisher');
    (this.ctx ?? this.game).effects.recipeGroundFracture?.(cast.target, cast.direction, theme, combat.radius);
    for (const enemy of enemies) {
      if (!enemy.alive || enemy.position.distanceTo(cast.target) > radius + enemy.radius) continue;
      const direction = enemy.position.clone().sub(cast.target).setY(0).normalize();
      const slamRaw=skillDamage(player.attackPower,combat);const slamResult=this._damageEnemy(enemy, slamRaw, {
        direction,
        knockback: combat.knockback ?? 4.8,
        armorPierce: combat.armorPierce ?? 0.25,
        criticalBonus: combat.criticalBonus ?? 0.06,
        multiHit: true,
        finisher: true,
        skill: true,
      });
      if (slamResult.amount > 0 && combat.durableMult && (enemy.elite || enemy.boss)) this._damageEnemy(enemy,
        slamRaw * (combat.durableMult - 1), {
          multiHit: true, skill: true, liteImpact: true,
          sameCastHit: { key: `vanguard-${cast.authority.generation}:durable:${enemy.id}`, maxHits: 1 },
        });
      if(slamResult.amount>0)this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:slamRaw,castKey:`vanguard-${cast.authority.generation}`,budget:cast.apexBudget});
      if (enemy.controlCategory === 'boss') {
        enemy.addStagger?.((combat.bossStagger ?? 28) + (combat.apexStaggerBonus ?? 0));
      }
      else if (combat.stunNormal) enemy.applyStun?.(enemy.controlCategory === 'elite' ? combat.stunElite : combat.stunNormal);
    }
    const aftershockHits = Math.min(4, Math.max(0, Math.round(combat.aftershockHits ?? 0)
      + Math.round(combat.bonusAftershock ?? 0)));
    for (let hit = 0; hit < aftershockHits; hit += 1) this._delay(.1 + hit * .11, () => {
      if (!this._ownsCast(player, cast.authority)) return;
      const afterRadius = radius + hit * (combat.aftershockRadiusStep ?? .7);
      (this.ctx ?? this.game).effects.ring?.(cast.target, hit % 2 ? theme.secondary : theme.primary, afterRadius, {
        life: .34, startScale: .22, opacity: .72,
      });
      this._hitEnemiesInRadius(cast.target, afterRadius,
        skillDamage(player.attackPower, combat) * (combat.aftershockMult ?? .42), {
          direction: cast.direction, knockback: .7, multiHit: true, skill: true, liteImpact: true,
          sameCastHit: { key: `vanguard-${cast.authority.generation}:aftershock-${hit}`, maxHits: 1 },
        });
    });
    if (combat.kingFinaleMult) this._delay(.14 + aftershockHits * .11, () => {
      if (!this._ownsCast(player, cast.authority)) return;
      (this.ctx ?? this.game).effects.recipeJudgmentApex?.(cast.target, theme, radius);
      this._hitEnemiesInRadius(cast.target, radius * 1.2,
        skillDamage(player.attackPower, combat) * combat.kingFinaleMult, {
          direction: cast.direction, knockback: 5.6, armorPierce: .45, multiHit: true, skill: true,
          sameCastHit: { key: `vanguard-${cast.authority.generation}:king-finale`, maxHits: 1 },
        });
    }); else if (combat.judgmentApex) (this.ctx ?? this.game).effects.recipeJudgmentApex?.(cast.target, theme, radius);
    this.skillCastState.delete(player);
    return true;
  };
  if (phase == null || phase === 'full') {
    runPhase(0);
    this._delay((bundle.combat.chargeDuration ?? .18) + .06, () => runPhase(1));
    return;
  }
  const index = Number(phase);
  if (index === 0 || index === 1) runPhase(index);
},

_starburst(player, bundle, phase = null, apexAudio = null) {
  const { combat, theme } = this._skillBundle(bundle);
  const center = this._aimAlongFacing(player, combat.aim ?? 9.5);
  const legacy = bundle.playerLevel < 20;
  const acts = legacy ? 1 : bundle.playerLevel >= 100 ? 3 : 2;
  const execute = index => {
    let state=this.starburstStates.get(player);
    if(index===0){state={cast:this._beginOwnedCast(player,bundle.id),bundle,completed:new Set(),center:center.clone(),landed:[],controlled:new Set(),finale:false,apexAudio,apexBudget:{targets:new Map(),casts:new Set()}};this.starburstStates.set(player,state);}
    if(!state||state.bundle!==bundle||!this._ownsCast(player,state.cast)||index<0||index>=acts||state.completed.has(index))return;state.completed.add(index);(this.ctx ?? this.game).audio.swing?.(index);
    if(index===0)this._apexAudioPhase(player,state.apexAudio,'impact');
    if(index===acts-1)this._apexAudioPhase(player,state.apexAudio,'finisher');
    if(index===0){const hits=combat.arsenal?10:Math.min(Math.round(combat.hits??6),combat.distinctBladeCap??99);const field=combat.fieldRadius??5;
      const bladePoint=i=>{const arm=i%6,ring=Math.floor(i/6),angle=arm/6*Math.PI*2+ring*.22;const dist=i===0?0:legacy?Math.min(field,1.3+ring*1.4+(arm%2)*.5):field*(.38+.58*i/Math.max(1,hits-1));const point=state.center.clone().add(new THREE.Vector3(Math.cos(angle)*dist,0,Math.sin(angle)*dist));point.y=(this.ctx ?? this.game).world.heightAt(point.x,point.z);return point;};
      const landBlade=(i,after=null)=>{if(!this._ownsCast(player,state.cast))return;const point=bladePoint(i),warningTime=legacy?(combat.telegraph??.28):Math.min(.05,combat.telegraph??.05);this._telegraphCircle(point,combat.hitRadius*.9,warningTime,theme.primary,()=>{if(!this._ownsCast(player,state.cast))return;(this.ctx ?? this.game).effects.recipeStarBlade(point,theme,i);this._hitEnemiesInRadius(point,combat.hitRadius,skillDamage(player.attackPower,combat)*(combat.centerMult??1),{knockback:combat.knockback??2.5,multiHit:true,armorPierce:combat.armorPierce??.2,skill:true,onHit:enemy=>{if(!state.landed.includes(enemy)&&state.landed.length<(combat.targetCap??10))state.landed.push(enemy);}});after?.();},{fillOpacity:.12});};
      if(legacy){const finale=()=>{if(!this._ownsCast(player,state.cast))return;(this.ctx ?? this.game).effects.recipeStarFinale(state.center,theme,combat.finaleRadius??5.8);this._hitEnemiesInRadius(state.center,combat.finaleRadius??5.8,skillDamage(player.attackPower,combat,'finaleMult'),{multiHit:true,skill:true,knockback:combat.finaleKnockback??6.2,armorPierce:combat.finaleArmorPierce??.35});};const launch=i=>{if(!this._ownsCast(player,state.cast)||i>=hits)return;this._delay(i===0?.1:.095,()=>{if(!this._ownsCast(player,state.cast))return;if(i+1<hits)launch(i+1);landBlade(i,()=>{if(i===hits-1&&this._ownsCast(player,state.cast))finale();});});};launch(0);}
      else for(let i=0;i<hits;i+=1)this._delay(.01+i*.012,()=>landBlade(i));
    }else if(index===1){(this.ctx ?? this.game).effects.recipeArsenalAct?.(state.center,theme,1,Boolean(combat.arsenal));const royal=state.landed.find(enemy=>enemy.alive&&(enemy.elite||enemy.boss))??state.landed[0];if(royal){this._damageEnemy(royal,skillDamage(player.attackPower,combat)*(combat.sealMult??.5),{multiHit:true,skill:true,sameCastHit:{key:`star-${state.cast.generation}:royal`,maxHits:1}});if(combat.crownMult&&(royal.elite||royal.boss)){this._damageEnemy(royal,skillDamage(player.attackPower,combat)*combat.crownMult,{multiHit:true,skill:true,sameCastHit:{key:`star-${state.cast.generation}:crown`,maxHits:1}});royal.addStagger?.(combat.crownStagger??0);}}
      state.landed.slice(0,Math.min(6,combat.embeddedCap??0)).forEach((enemy,i)=>this._delay(.12+i*.04,()=>{if(this._ownsCast(player,state.cast)&&enemy.alive)this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.embeddedMult,{multiHit:true,skill:true,sameCastHit:{key:`star-${state.cast.generation}:embed:${enemy.id}`,maxHits:1}});}));
      if(combat.prisonCap)for(const enemy of state.landed.slice(0,combat.prisonCap)){if(enemy.boss)enemy.addStagger?.(combat.bossStagger);else enemy.applyStun?.(combat.prisonStun);}
    }else if(index===2&&!state.finale){state.finale=true;for(let ring=0;ring<3;ring+=1)(this.ctx ?? this.game).effects.recipeArsenalAct?.(state.center,theme,2+ring,true);(this.ctx ?? this.game).effects.recipeStarFinale(state.center, theme, combat.finaleRadius ?? 5.8);this._hitEnemiesInRadius(state.center, combat.finaleRadius ?? 5.8, skillDamage(player.attackPower, combat)*(combat.arsenalFinaleMult??combat.finaleMult), {
      knockback: combat.finaleKnockback ?? 6.2,
      multiHit: true,
      armorPierce: combat.finaleArmorPierce ?? 0.35,
      skill: true,
      onHit:enemy=>this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat)*(combat.arsenalFinaleMult??combat.finaleMult),castKey:`star-${state.cast.generation}`,budget:state.apexBudget}),
    });
    }if(index===acts-1)this.starburstStates.delete(player);
  };
  if(phase!=null&&phase!=='full'){const i=Number(phase);if(Number.isInteger(i))execute(i);return;}
  execute(0);
  if(acts>1)this._delay(.42,()=>this._delay(0,()=>{execute(1);if(acts>2)this._delay(.2,()=>this._delay(0,()=>execute(2)));}));
},

  });
}
