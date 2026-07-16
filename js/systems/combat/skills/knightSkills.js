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
_whirlwindPulse(player, bundle, hitIndex, state = null) {
  const { combat, theme } = this._skillBundle(bundle);
  const radius = combat.radius * (combat.radiusMult ?? 1);
  const hits = Math.max(1, Math.round(combat.hits ?? 3));
  const finale = hitIndex >= hits - 1;
  if (state && !this._ownsCast(player, state.cast)) return;
  if (state && hitIndex === 0) this._apexAudioPhase(player, state.apexAudio, 'impact');
  if (state && finale) this._apexAudioPhase(player, state.apexAudio, 'finisher');
  if (hitIndex === 0) player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.34);
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
      const dragAllowed = !combat.dragCap || state.dragTargets.has(enemy.id) || state.dragTargets.size < combat.dragCap;
      if ((combat.inwardDrag || combat.cageDrag) && enemy.controlCategory !== 'boss' && dragAllowed) {
        state.dragTargets.add(enemy.id);
        enemy.pullToward?.(player.position, 1.45, combat.cageDrag ?? combat.inwardDrag, (this.ctx ?? this.game).world, (this.ctx ?? this.game).enemies.enemies);
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
        facing: this._facingDir(player), dragTargets: new Set(), crossBudget: new Map(), scarred: false, apexAudio, apexBudget:{targets:new Map(),casts:new Set()} };
      this.whirlwindStates.set(player, state);
    }
    if (!state || state.bundle !== bundle || !this._ownsCast(player, state.cast) || state.completed.has(index)) return;
    state.completed.add(index);
    this._whirlwindPulse(player, bundle, index, state);
    if (index >= hits - 1) this.whirlwindStates.delete(player);
    return;
  }
  const state = { cast: this._beginOwnedCast(player, bundle.id), bundle, completed: new Set(), origin: player.position.clone(),
    facing: this._facingDir(player), dragTargets: new Set(), crossBudget: new Map(), scarred: false, apexAudio, apexBudget:{targets:new Map(),casts:new Set()} };
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
      for(let wave=0;wave<waves;wave+=1){const yaw=yaw0+(wave-(waves-1)/2)*(combat.spread??0);const dir=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
        const start=state.origin.clone().addScaledVector(dir,1.2).add(new THREE.Vector3(0,1,0));
        this._spawnFriendlyOrb(start,dir,{style:'blade_wave',color:theme.primary,damage:skillDamage(player.attackPower,combat)*(combat.damageMult??combat.waveMult??1),speed:combat.speed,
          radius:(combat.radius??1.25)*(combat.radiusMult??1),life:1.35,pierce:Math.round(combat.pierce??3),knockback:combat.knockback??4.2,skill:true,wave:true,
          ownerGuard:()=>this._ownsCast(player,state.cast),
          statusOnHit:combat.status??null,onHit:enemy=>{if(state.points.length<Math.min(6,combat.crossCap??6))state.points.push(enemy.position.clone());
            if(combat.crosscurrent&&!state.crossHits.has(enemy.id)&&state.crossHits.size<Math.min(6,combat.crossCap??6)){state.crossHits.set(enemy.id,1);const side=new THREE.Vector3(-dir.z,0,dir.x);
              this._delay(.08,()=>{if(!this._ownsCast(player,state.cast))return;this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.crossMult,{multiHit:true,skill:true,sameCastHit:{key:`cres-${state.cast.generation}:cross:${enemy.id}`,maxHits:1}});(this.ctx ?? this.game).effects.recipeCrosscurrent?.(enemy.position,side,theme);});}
            if(combat.severMult&&(enemy.elite||enemy.boss)){this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.severMult,{multiHit:true,skill:true,sameCastHit:{key:`cres-${state.cast.generation}:sever:${enemy.id}`,maxHits:1}});enemy.applyStatus?.('armor_break',{duration:combat.armorBreakDuration,power:combat.armorBreakPower},this.game);}},
        });}
      if(bundle.playerLevel<20&&bundle.rank>=3&&combat.residualMult>0){const scarCenter=state.origin.clone().addScaledVector(state.facing,4.2);this._delay(combat.residualDelay??.42,()=>{if(!this._ownsCast(player,state.cast))return;(this.ctx ?? this.game).effects.groundDecal?.(scarCenter,theme.accent,combat.residualRadius??1.5,{life:1.6,opacity:.45,startScale:.2});this._hitEnemiesInRadius(scarCenter,combat.residualRadius??1.5,skillDamage(player.attackPower,combat,'residualMult'),{knockback:1.2,multiHit:true,skill:true});});}
    } else if(index===1){(this.ctx ?? this.game).audio.swing?.(1);(this.ctx ?? this.game).effects.recipeWorldsplitterAct?.(state.origin,state.facing,theme,1,Boolean(combat.worldsplitter));
      if(combat.moonScar||bundle.rank>=3)this._delay(combat.residualDelay??.42,()=>{if(!this._ownsCast(player,state.cast))return;this._segmentDamage(state.origin,state.origin.clone().addScaledVector(state.facing,8),.8,skillDamage(player.attackPower,combat)*(combat.scarMult??combat.residualMult??.3),{multiHit:true,skill:true},`cres-${state.cast.generation}:scar`);});
      if(combat.riftTicks)for(let tick=0;tick<Math.min(3,combat.riftTicks);tick+=1)this._delay(.18+tick*.16,()=>{if(!this._ownsCast(player,state.cast))return;
        const to=state.origin.clone().addScaledVector(state.facing,8);const segment=to.clone().sub(state.origin);const lengthSq=segment.lengthSq();let targets=0;
        for(const enemy of (this.ctx ?? this.game).enemies.enemies){if(!enemy.alive||targets>=Math.min(4,combat.riftCap??4))continue;const rel=enemy.position.clone().sub(state.origin).setY(0);const t=clamp(rel.dot(segment)/lengthSq,0,1);if(enemy.position.distanceTo(state.origin.clone().addScaledVector(segment,t))>.9+enemy.radius)continue;
          const result=this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.riftMult,{multiHit:true,skill:true,sameCastHit:{key:`cres-${state.cast.generation}:rift-${tick}:${enemy.id}`,maxHits:1}});if(result.amount>0){targets+=1;if(enemy.boss)enemy.addStagger?.(4);else enemy.applyStun?.(.2);}}
      });
    } else if(index===2){(this.ctx ?? this.game).audio.swing?.(2);(this.ctx ?? this.game).effects.recipeWorldsplitterAct?.(state.origin,state.facing,theme,2,true);this._delay(.16,()=>{if(!this._ownsCast(player,state.cast))return;const raw=skillDamage(player.attackPower,combat)*combat.ruptureMult;this._segmentDamage(state.origin,state.origin.clone().addScaledVector(state.facing,10),1,raw,{multiHit:true,skill:true,onHit:enemy=>this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:raw,castKey:`cres-${state.cast.generation}`,budget:state.apexBudget})},`cres-${state.cast.generation}:rupture`);});}
    if(index===acts-1)this.crescentStates.delete(player);
  };
  if(phase!=null&&phase!=='full'){const index=Number(phase);if(Number.isInteger(index))execute(index);return;}
  const chain=index=>{execute(index);if(index+1<acts)this._delay(.18,()=>chain(index+1));};chain(0);
},

_skyfallLegacy(player, bundle) {
  const { combat, theme } = this._skillBundle(bundle);
  const target = this._aimAlongFacing(player, combat.leap ?? 10.5);
  const direction = this._facingDir(player);
  const radius = combat.radius;
  this._telegraphCircle(target, radius, combat.telegraph ?? 0.46, theme.primary, () => {
    if (!player.alive) return;
    player.position.copy(target);
    (this.ctx ?? this.game).world.resolvePosition(player.position, 0.48);
    player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.55);
    (this.ctx ?? this.game).effects.recipeLeapImpact(target, direction, theme, radius);
    this._hitEnemiesInRadius(target, radius, skillDamage(player.attackPower, combat), {
      knockback: combat.knockback ?? 7.2,
      armorPierce: combat.armorPierce ?? 0.25,
      criticalBonus: combat.criticalBonus ?? 0.06,
      skill: true,
    });
  }, { fillOpacity: 0.12 });
},

_skyfall(player, bundle, phase = null, apexAudio = null) {
  if (bundle.playerLevel < 20) {
    this._skyfallLegacy(player, bundle);
    return;
  }
  const runPhase = index => {
    let cast = this.skillCastState.get(player);
    if (!cast || cast.bundle !== bundle) {
      if (index !== 0) return false;
      cast = {
        bundle,
        target: this._aimAlongFacing(player, bundle.combat.leap ?? 10.5),
        direction: this._facingDir(player),
        completed: new Set(),
        apexAudio,
        apexBudget: { targets:new Map(), casts:new Set() },
      };
      this.skillCastState.set(player, cast);
    }
    if (cast.completed.has(index)) return false;
    if (!player.alive) {
      if (index === 1) this.skillCastState.delete(player);
      return false;
    }
    cast.completed.add(index);
    if(index===0)this._apexAudioPhase(player,cast.apexAudio,'impact');
    if(index===1)this._apexAudioPhase(player,cast.apexAudio,'finisher');
    const { combat, theme } = this._skillBundle(bundle);
    const enemies = (this.ctx ?? this.game).enemies.enemies;
    const pullRadius = (combat.pullRadius ?? combat.radius) + (combat.apexPullBonus ?? 0);
    if (index === 0) {
      player.position.copy(cast.target);
      (this.ctx ?? this.game).world.resolvePosition(player.position, 0.48);
      cast.target.copy(player.position);
      player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.55);
      (this.ctx ?? this.game).effects.recipeVortexPull?.(cast.target, theme, pullRadius);
      for (const enemy of enemies) {
        if (!enemy.alive || enemy.position.distanceTo(cast.target) > pullRadius + enemy.radius) continue;
        const direction = enemy.position.clone().sub(cast.target).setY(0).normalize();
        this._damageEnemy(enemy, skillDamage(player.attackPower, combat, 'plantMult'), {
          direction, knockback: 0, armorPierce: combat.armorPierce ?? 0.25, multiHit: true, skill: true,
        });
        if (enemy.controlCategory === 'boss') {
          (this.ctx ?? this.game).effects.recipeBossPullResist?.(enemy.position, cast.target, theme);
        } else {
          enemy.pullToward?.(cast.target, combat.safeRing ?? 1.55, combat.pullStrength ?? 0.72, (this.ctx ?? this.game).world, enemies);
        }
      }
      return true;
    }
    (this.ctx ?? this.game).effects.recipeGroundFracture?.(cast.target, cast.direction, theme, combat.radius);
    for (const enemy of enemies) {
      if (!enemy.alive || enemy.position.distanceTo(cast.target) > combat.radius + enemy.radius) continue;
      const direction = enemy.position.clone().sub(cast.target).setY(0).normalize();
      const slamRaw=skillDamage(player.attackPower,combat);const slamResult=this._damageEnemy(enemy, slamRaw, {
        direction,
        knockback: Math.min(3.2, combat.knockback ?? 7.2),
        armorPierce: combat.armorPierce ?? 0.25,
        criticalBonus: combat.criticalBonus ?? 0.06,
        multiHit: true,
        finisher: true,
        skill: true,
      });
      if(slamResult.amount>0)this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:slamRaw,castKey:`judgment-${bundle.id}`,budget:cast.apexBudget});
      if (enemy.controlCategory === 'boss') {
        enemy.addStagger?.((combat.bossStagger ?? 28) + (combat.apexStaggerBonus ?? 0));
      }
      else enemy.applyStun?.(enemy.controlCategory === 'elite' ? combat.stunElite : combat.stunNormal);
    }
    if (combat.judgmentApex) (this.ctx ?? this.game).effects.recipeJudgmentApex?.(cast.target, theme, combat.radius);
    this.skillCastState.delete(player);
    return true;
  };
  if (phase == null || phase === 'full') {
    runPhase(0);
    runPhase(1);
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
