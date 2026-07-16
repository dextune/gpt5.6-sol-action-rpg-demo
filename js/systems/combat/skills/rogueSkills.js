/**
 * Active skill implementations — rogue (Sol combat, not template).
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

export function attachRogueSkillMethods(proto) {
  Object.assign(proto, {
_twinFangStab(player, bundle, hitIndex, state = null) {
  const { combat, theme } = this._skillBundle(bundle);
  const rank = bundle.rank;
  const direction = this._facingDir(player);
  let hits = Math.max(1, Math.round(combat.hits ?? 2));
  if (rank >= 3) hits = Math.max(hits, Math.round(combat.hitsAtRank3 ?? 3));
  const finale = hitIndex >= hits - 1;
  if (state && !this._ownsCast(player, state.cast)) return;
  if(state&&hitIndex===0)this._apexAudioPhase(player,state.apexAudio,'impact');
  if(state&&finale)this._apexAudioPhase(player,state.apexAudio,'finisher');
  const offhand = hitIndex % 2 === 1;
  let origin = this._handContactOrigin(player, offhand, direction, .18);
  if (hitIndex === 2 && hits >= 3) {
    const other = this._handContactOrigin(player, true, direction, .18);
    origin = origin.add(other).multiplyScalar(.5);
  }
  (this.ctx ?? this.game).effects.recipeFangRush(origin, direction, theme, combat.range, hitIndex, finale, offhand);
  (this.ctx ?? this.game).audio.swing?.(offhand ? 1 : 0);
  let status = combat.status ? { ...combat.status } : null;
  if (status && rank >= 3 && combat.bleedDurationBonus) {
    status = { ...status, duration: (status.duration ?? 2.6) + combat.bleedDurationBonus };
  }
  if (status && combat.bleedMult) status = { ...status, dps: (status.dps ?? .1) * combat.bleedMult };
  this._hitEnemiesInCone(origin, direction, combat.range, combat.arc ?? 1.15, skillDamage(player.attackPower, combat), {
    knockback: combat.knockback ?? 1.6,
    criticalBonus: combat.criticalBonus ?? 0.15,
    multiHit: true,
    skill: true,
    status,
    onHit: enemy => {
      if(finale&&state)this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat),castKey:`fang-${state.cast.generation}`,budget:state.apexBudget});
      if (state && combat.thousandFang && state.cutLines < Math.min(6, combat.cutLineCap ?? 6)) {
        state.cutLines += 1; state.targets.add(enemy);
        (this.ctx ?? this.game).effects.recipeFangCutLine?.(origin, enemy.position, theme, state.cutLines);
      }
      if (finale && combat.consumeBleed && enemy.statuses?.bleed && !state.consumed.has(enemy.id)) {
        state.consumed.add(enemy.id); delete enemy.statuses.bleed;
        this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.woundMult, {
          multiHit: true, skill: true, sameCastHit: { key: `fang-${state.cast.generation}:wound`, maxHits: 1 },
        });
      }
      if (finale && combat.durableMult && (enemy.elite || enemy.boss)) {
        this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * (combat.durableMult - 1), {
          multiHit: true, skill: true, sameCastHit: { key: `fang-${state.cast.generation}:heart`, maxHits: 1 },
        });
        enemy.addStagger?.(combat.durableStagger ?? 0);
      }
    },
  });
  if (finale && state && combat.backbite && !state.backbite) {
    state.backbite = true;
    this._delay(.1, () => {
      if (!this._ownsCast(player, state.cast)) return;
      const behind = player.position.clone().addScaledVector(direction, combat.range * .8);
      (this.ctx ?? this.game).effects.recipeBackbite?.(behind, direction, theme);
      this._hitEnemiesInCone(behind, direction.clone().negate(), combat.range, combat.arc ?? 1.15,
        skillDamage(player.attackPower, combat) * combat.backbiteMult, { multiHit: true, skill: true,
          sameCastHit: { key: `fang-${state.cast.generation}:backbite`, maxHits: 1 } });
    });
  }
  if (finale && state && combat.thousandFang) {
    for (const enemy of state.targets) if (enemy.alive) this._damageEnemy(enemy,
      skillDamage(player.attackPower, combat) * combat.detonateMult, { multiHit: true, skill: true,
        sameCastHit: { key: `fang-${state.cast.generation}:detonate:${enemy.id}`, maxHits: 1 } });
    (this.ctx ?? this.game).effects.recipeThousandFangFinale?.(player.position, direction, theme, state.cutLines);
  }
},

_twinFang(player, bundle, phase = null, apexAudio = null) {
  const { combat } = this._skillBundle(bundle);
  const rank = bundle.rank;
  let hits = Math.max(1, Math.round(combat.hits ?? 2));
  if (rank >= 3) hits = Math.max(hits, Math.round(combat.hitsAtRank3 ?? 3));
  if (phase != null && phase !== 'full') {
    if (!player.alive) return;
    const index = Number(phase);
    if (!Number.isInteger(index) || index < 0 || index >= hits) return;
    let state = this.twinFangStates.get(player);
    if (index === 0) {
      state = { cast: this._beginOwnedCast(player, bundle.id), bundle, completed: new Set(), backbite: false, cutLines: 0, targets: new Set(), consumed: new Set(), apexAudio, apexBudget:{targets:new Map(),casts:new Set()} };
      this.twinFangStates.set(player, state);
    }
    if (!state || state.bundle !== bundle || !this._ownsCast(player, state.cast) || state.completed.has(index)) return;
    state.completed.add(index);
    this._twinFangStab(player, bundle, index, state);
    if (index >= hits - 1) this.twinFangStates.delete(player);
    return;
  }
  const state = { cast: this._beginOwnedCast(player, bundle.id), bundle, completed: new Set(), backbite: false, cutLines: 0, targets: new Set(), consumed: new Set(), apexAudio, apexBudget:{targets:new Map(),casts:new Set()} };
  this.twinFangStates.set(player, state);
  // Fallback absolute delays if anim timeline not used
  for (let hit = 0; hit < hits; hit += 1) {
    this._delay(0.05 + hit * 0.12 * (combat.cadenceMult ?? 1), () => {
      if (!this._ownsCast(player, state.cast)) return;
      if (state.completed.has(hit)) return;
      state.completed.add(hit);
      this._twinFangStab(player, bundle, hit, state);
      if (hit === hits - 1) this.twinFangStates.delete(player);
    });
  }
},

_fanOfKnives(player, bundle, phase = null, apexAudio = null) {
  const {combat,theme}=this._skillBundle(bundle);const acts=bundle.playerLevel>=100?3:bundle.playerLevel>=20?2:1;
  const daggerTrailRate=this._quality()==='low'?6:this._quality()==='medium'?10:16;
  const execute=index=>{let state=this.fanStates.get(player);if(index===0){state={cast:this._beginOwnedCast(player,bundle.id),bundle,completed:new Set(),origin:player.position.clone(),facing:this._facingDir(player),outbound:[],targets:[],bounced:new Set(),pinned:new Set(),finale:false,apexAudio,apexBudget:{targets:new Map(),casts:new Set()}};this.fanStates.set(player,state);}
    if(!state||state.bundle!==bundle||!this._ownsCast(player,state.cast)||index<0||index>=acts||state.completed.has(index))return;state.completed.add(index);
    if(index===0)this._apexAudioPhase(player,state.apexAudio,'impact');
    if(index===acts-1)this._apexAudioPhase(player,state.apexAudio,'finisher');
    if(index===0){const knives=Math.min(combat.knifeCap??18,Math.max(1,Math.round(combat.knives??5)));const spread=(combat.spread??.16)*(combat.spreadMult??1);const yaw0=Math.atan2(state.facing.x,state.facing.z);(this.ctx ?? this.game).effects.recipeNightPeacockAct?.(state.origin,state.facing,theme,0,Boolean(combat.nightPeacock));
      for(let i=0;i<knives;i+=1){const yaw=yaw0+(i-(knives-1)/2)*spread;const dir=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));const start=state.origin.clone().add(new THREE.Vector3(0,1.1,0)).addScaledVector(dir,.6);
        const projectile=this._spawnFriendlyOrb(start,dir,{style:'dagger',color:i%2?theme.secondary:theme.primary,damage:skillDamage(player.attackPower,combat)*(combat.damageMult??1),speed:combat.speed,radius:combat.radius??.85,life:combat.life??.62,pierce:Math.round(combat.pierce??1),knockback:combat.knockback??2.4,skill:true,trailRate:daggerTrailRate,statusOnHit:combat.status??null,ownerGuard:()=>this._ownsCast(player,state.cast),
          onHit:enemy=>{if(!state.targets.includes(enemy))state.targets.push(enemy);if(combat.pinnedMult&&(enemy.elite||enemy.boss)&&!state.pinned.has(enemy.id)){state.pinned.add(enemy.id);this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.pinnedMult,{multiHit:true,skill:true,sameCastHit:{key:`fan-${state.cast.generation}:pinned:${enemy.id}`,maxHits:1}});enemy.addStagger?.(combat.pinnedStagger??0);}
            if(combat.bounceCap&&state.bounced.size<combat.bounceCap){const next=(this.ctx ?? this.game).enemies.enemies.filter(other=>other.alive&&other!==enemy&&!state.bounced.has(other.id)).sort((a,b)=>a.position.distanceToSquared(enemy.position)-b.position.distanceToSquared(enemy.position))[0];if(next){state.bounced.add(next.id);this._damageEnemy(next,skillDamage(player.attackPower,combat)*combat.bounceMult,{multiHit:true,skill:true,sameCastHit:{key:`fan-${state.cast.generation}:bounce:${next.id}`,maxHits:1}});}}},});state.outbound.push(projectile);}
    }else if(index===1){(this.ctx ?? this.game).effects.recipeNightPeacockAct?.(state.origin,state.facing,theme,1,Boolean(combat.nightPeacock));if(combat.returnPass){const survivors=state.outbound.filter(projectile=>!projectile.retired&&projectile.life>0&&this.projectiles.includes(projectile)&&(!projectile.ownerGuard||projectile.ownerGuard())).map(projectile=>projectile.mesh.position.clone());for(const from of survivors){const dir=state.origin.clone().sub(from).setY(0).normalize();this._spawnFriendlyOrb(from.addScaledVector(dir,.7),dir,{style:'dagger',color:theme.secondary,damage:skillDamage(player.attackPower,combat)*combat.returnMult,speed:combat.speed,radius:.65,life:.6,pierce:1,skill:true,trailRate:daggerTrailRate,reactionDepth:1,ownerGuard:()=>this._ownsCast(player,state.cast)});}}
      for(const enemy of state.targets.slice(0,Math.min(6,combat.duplicateCap??0))){const dir=state.facing;this._spawnFriendlyOrb(enemy.position.clone().add(new THREE.Vector3(0,.8,0)).addScaledVector(dir,enemy.radius+.7),dir,{style:'dagger',color:theme.core,damage:skillDamage(player.attackPower,combat)*combat.duplicateMult,speed:15,radius:.5,life:.45,pierce:1,skill:true,trailRate:daggerTrailRate,reactionDepth:1,ownerGuard:()=>this._ownsCast(player,state.cast)});}
    }else if(index===2&&!state.finale){state.finale=true;(this.ctx ?? this.game).effects.recipeNightPeacockAct?.(state.origin,state.facing,theme,2,true);const raw=skillDamage(player.attackPower,combat)*combat.finaleMult;this._hitEnemiesInRadius(state.origin,combat.finaleRadius??3.2,raw,{multiHit:true,skill:true,sameCastHit:{key:`fan-${state.cast.generation}:finale`,maxHits:1},onHit:enemy=>this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:raw,castKey:`fan-${state.cast.generation}`,budget:state.apexBudget})});}
    if(index===acts-1)this.fanStates.delete(player);};
  if(phase!=null&&phase!=='full'){const index=Number(phase);if(Number.isInteger(index))execute(index);return;}const chain=index=>{execute(index);if(index+1<acts)this._delay(.18,()=>chain(index+1));};chain(0);
},

_shadowstep(player, bundle, apexAudio = null) {
  const { combat, theme } = this._skillBundle(bundle);
  const direction = this._facingDir(player);
  const from = player.position.clone();
  const target = this._aimAlongFacing(player, combat.dash ?? 7.5);
  player.position.copy(target);
  (this.ctx ?? this.game).world.resolvePosition(player.position, 0.48);
  player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.5);
  const to = player.position.clone();
  (this.ctx ?? this.game).effects.recipeShadowDash(from, to, direction, theme);
  this._apexAudioPhase(player,apexAudio,'impact');
  // Carve every enemy near the dash segment.
  const path = TMP_B.copy(to).sub(from).setY(0);
  const pathLength = Math.max(0.001, path.length());
  const pathDir = TMP_C.copy(path).normalize();
  const halfWidth = (combat.width ?? 2.2) * 0.5;
  const raw = skillDamage(player.attackPower, combat);
  for (const enemy of (this.ctx ?? this.game).enemies.enemies) {
    if (!enemy.alive) continue;
    const offset = TMP_A.copy(enemy.position).sub(from).setY(0);
    const along = clamp(offset.dot(pathDir), 0, pathLength);
    const lateral = offset.addScaledVector(pathDir, -along).length();
    if (lateral > halfWidth + enemy.radius) continue;
    const side = enemy.position.clone().sub(from).setY(0).addScaledVector(pathDir, -along);
    const knockDir = side.lengthSq() > .001 ? side.normalize() : pathDir.clone();
    this._damageEnemy(enemy, raw, {
      direction: knockDir,
      knockback: combat.knockback ?? 2.2,
      armorPierce: combat.armorPierce ?? 0.3,
      criticalBonus: combat.criticalBonus ?? 0.18,
      skill: true,
    });
  }
  (this.ctx ?? this.game).effects.recipeDualBladeCross?.(to, direction, theme.primary, theme.secondary, combat.width * 1.4);
  if (bundle.playerLevel >= 20) {
    const frenzy=player.activateShadowFrenzy?.(combat,bundle);
    if(frenzy&&!frenzy.apexAudio)frenzy.apexAudio=apexAudio;
  }
},

_deathLotus(player, bundle, phase = null, apexAudio = null) {
  const { combat, theme } = this._skillBundle(bundle);
  const legacy=bundle.playerLevel<20,acts=legacy?1:bundle.playerLevel>=100?3:2;
  const execute=index=>{let state=this.lotusStates.get(player);if(index===0){state={cast:this._beginOwnedCast(player,bundle.id),bundle,completed:new Set(),origin:player.position.clone(),targets:[],echoed:new Set(),finale:false,apexAudio,apexBudget:{targets:new Map(),casts:new Set()}};this.lotusStates.set(player,state);}
    if(!state||state.bundle!==bundle||!this._ownsCast(player,state.cast)||index<0||index>=acts||state.completed.has(index))return;state.completed.add(index);(this.ctx ?? this.game).audio.swing?.(index);player.invulnerable=Math.max(player.invulnerable,combat.invuln??.6);
    if(index===0)this._apexAudioPhase(player,state.apexAudio,'impact');
    if(index===acts-1)this._apexAudioPhase(player,state.apexAudio,'finisher');
    if(index===0){const lines=legacy?Math.max(1,Math.round(combat.hits??8)):8;const radius=(combat.radius??3)*(combat.radiusMult??1);
      const landLine=i=>{if(!this._ownsCast(player,state.cast))return;const angle=i/lines*Math.PI*2,dir=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));(this.ctx ?? this.game).effects.recipeMoonlessAct?.(state.origin,dir,theme,0,Boolean(combat.moonless));for(const enemy of (this.ctx ?? this.game).enemies.enemies){if(!enemy.alive)continue;const offset=enemy.position.clone().sub(state.origin).setY(0),along=offset.dot(dir),lateral=offset.addScaledVector(dir,-along).length();if(along<0||along>radius||lateral>.42+enemy.radius)continue;const result=this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*(combat.damageMult??1),{multiHit:true,skill:true,status:combat.bleedEvery&&(i+1)%combat.bleedEvery===0?combat.status:null,sameCastHit:{key:`lotus-${state.cast.generation}:line-${i}:${enemy.id}`,maxHits:1}});if(result.amount>0&&!state.targets.includes(enemy))state.targets.push(enemy);}};
      if(legacy){this._delay(.14+lines*.09,()=>{if(!this._ownsCast(player,state.cast))return;(this.ctx ?? this.game).effects.recipeLotusFlurry?.(state.origin,theme,combat.finaleRadius??3.9,lines,true);this._hitEnemiesInRadius(state.origin,combat.finaleRadius??3.9,skillDamage(player.attackPower,combat,'finaleMult'),{multiHit:true,skill:true,status:combat.status});});for(let i=lines-1;i>=0;i-=1)this._delay(.04+i*.07,()=>{if(this._ownsCast(player,state.cast))landLine(i);});}
      else for(let i=0;i<lines;i+=1)this._delay(.02+i*.03,()=>landLine(i));
    }else if(index===1){(this.ctx ?? this.game).effects.recipeMoonlessAct?.(state.origin,this._facingDir(player),theme,1,Boolean(combat.moonless));state.targets.slice(0,Math.min(6,combat.echoCap??0)).forEach((enemy,i)=>this._delay(.1+i*.04,()=>{if(this._ownsCast(player,state.cast)&&enemy.alive)this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.echoMult,{multiHit:true,skill:true,sameCastHit:{key:`lotus-${state.cast.generation}:echo:${enemy.id}`,maxHits:1}});}));
      if(combat.executeThreshold)for(const enemy of state.targets){if(!enemy.boss&&enemy.hp/Math.max(1,enemy.maxHp)<=combat.executeThreshold)this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.executeMult,{multiHit:true,skill:true,sameCastHit:{key:`lotus-${state.cast.generation}:harvest:${enemy.id}`,maxHits:1}});}
      const durable=state.targets.find(enemy=>enemy.alive&&(enemy.elite||enemy.boss));if(durable&&combat.redirectCap)for(let i=0;i<Math.min(4,combat.redirectCap);i+=1)this._damageEnemy(durable,skillDamage(player.attackPower,combat)*combat.durableMult,{multiHit:true,skill:true,sameCastHit:{key:`lotus-${state.cast.generation}:redirect-${i}`,maxHits:1}});if(durable&&combat.durableStagger)durable.addStagger?.(combat.durableStagger);
    }else if(index===2&&!state.finale){state.finale=true;(this.ctx ?? this.game).effects.recipeMoonlessAct?.(state.origin,this._facingDir(player),theme,2,true);const raw=skillDamage(player.attackPower,combat)*combat.moonlessFinaleMult;this._hitEnemiesInRadius(state.origin,combat.finaleRadius??3.9,raw,{multiHit:true,skill:true,sameCastHit:{key:`lotus-${state.cast.generation}:finale`,maxHits:1},onHit:enemy=>this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:raw,castKey:`lotus-${state.cast.generation}`,budget:state.apexBudget})});}
    if(index===acts-1)this.lotusStates.delete(player);};if(phase!=null&&phase!=='full'){const i=Number(phase);if(Number.isInteger(i))execute(i);return;}
  execute(0);
  if(acts>1)this._delay(.32,()=>this._delay(0,()=>{execute(1);if(acts>2)this._delay(.18,()=>this._delay(0,()=>execute(2)));}));
},

  });
}
