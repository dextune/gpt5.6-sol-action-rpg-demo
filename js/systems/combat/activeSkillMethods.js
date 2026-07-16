/**
 * Active skill implementations (Sol combat — not template).
 * Attached onto CombatSystem.prototype; `this` is the CombatSystem instance.
 */
import * as THREE from 'three';
import { skillDamage } from '../../data/skillCombat.js';
import { getFxTheme } from '../../data/fxThemes.js';
import { getHeroClass } from '../../data/content.js';
import { clamp } from '../../core/Utils.js';

const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();

export function attachActiveSkillMethods(proto) {
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
  this.game.effects.recipeSpinStorm(player.position, player.facing, theme, radius, hitIndex, finale);
  this.game.audio.swing?.(hitIndex % 4);
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
        enemy.pullToward?.(player.position, 1.45, combat.cageDrag ?? combat.inwardDrag, this.game.world, this.game.enemies.enemies);
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
      this.game.effects.recipeWhirlwindScar?.(from, to, theme);
      const segment = to.clone().sub(from).setY(0); const lengthSq = Math.max(1e-6, segment.lengthSq());
      for (const enemy of this.game.enemies.enemies) {
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
    for (const enemy of this.game.enemies.enemies) {
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
    this.game.effects.recipeSovereignCross?.(player.position, facing, theme, radius);
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
      this.game.audio.swing?.(0);
      state.released=true; const waves=Math.min(3,combat.waveCount??1); const yaw0=Math.atan2(state.facing.x,state.facing.z);
      this.game.effects.recipeWorldsplitterAct?.(state.origin,state.facing,theme,0,Boolean(combat.worldsplitter));
      for(let wave=0;wave<waves;wave+=1){const yaw=yaw0+(wave-(waves-1)/2)*(combat.spread??0);const dir=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
        const start=state.origin.clone().addScaledVector(dir,1.2).add(new THREE.Vector3(0,1,0));
        this._spawnFriendlyOrb(start,dir,{style:'blade_wave',color:theme.primary,damage:skillDamage(player.attackPower,combat)*(combat.damageMult??combat.waveMult??1),speed:combat.speed,
          radius:(combat.radius??1.25)*(combat.radiusMult??1),life:1.35,pierce:Math.round(combat.pierce??3),knockback:combat.knockback??4.2,skill:true,wave:true,
          ownerGuard:()=>this._ownsCast(player,state.cast),
          statusOnHit:combat.status??null,onHit:enemy=>{if(state.points.length<Math.min(6,combat.crossCap??6))state.points.push(enemy.position.clone());
            if(combat.crosscurrent&&!state.crossHits.has(enemy.id)&&state.crossHits.size<Math.min(6,combat.crossCap??6)){state.crossHits.set(enemy.id,1);const side=new THREE.Vector3(-dir.z,0,dir.x);
              this._delay(.08,()=>{if(!this._ownsCast(player,state.cast))return;this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.crossMult,{multiHit:true,skill:true,sameCastHit:{key:`cres-${state.cast.generation}:cross:${enemy.id}`,maxHits:1}});this.game.effects.recipeCrosscurrent?.(enemy.position,side,theme);});}
            if(combat.severMult&&(enemy.elite||enemy.boss)){this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.severMult,{multiHit:true,skill:true,sameCastHit:{key:`cres-${state.cast.generation}:sever:${enemy.id}`,maxHits:1}});enemy.applyStatus?.('armor_break',{duration:combat.armorBreakDuration,power:combat.armorBreakPower},this.game);}},
        });}
      if(bundle.playerLevel<20&&bundle.rank>=3&&combat.residualMult>0){const scarCenter=state.origin.clone().addScaledVector(state.facing,4.2);this._delay(combat.residualDelay??.42,()=>{if(!this._ownsCast(player,state.cast))return;this.game.effects.groundDecal?.(scarCenter,theme.accent,combat.residualRadius??1.5,{life:1.6,opacity:.45,startScale:.2});this._hitEnemiesInRadius(scarCenter,combat.residualRadius??1.5,skillDamage(player.attackPower,combat,'residualMult'),{knockback:1.2,multiHit:true,skill:true});});}
    } else if(index===1){this.game.audio.swing?.(1);this.game.effects.recipeWorldsplitterAct?.(state.origin,state.facing,theme,1,Boolean(combat.worldsplitter));
      if(combat.moonScar||bundle.rank>=3)this._delay(combat.residualDelay??.42,()=>{if(!this._ownsCast(player,state.cast))return;this._segmentDamage(state.origin,state.origin.clone().addScaledVector(state.facing,8),.8,skillDamage(player.attackPower,combat)*(combat.scarMult??combat.residualMult??.3),{multiHit:true,skill:true},`cres-${state.cast.generation}:scar`);});
      if(combat.riftTicks)for(let tick=0;tick<Math.min(3,combat.riftTicks);tick+=1)this._delay(.18+tick*.16,()=>{if(!this._ownsCast(player,state.cast))return;
        const to=state.origin.clone().addScaledVector(state.facing,8);const segment=to.clone().sub(state.origin);const lengthSq=segment.lengthSq();let targets=0;
        for(const enemy of this.game.enemies.enemies){if(!enemy.alive||targets>=Math.min(4,combat.riftCap??4))continue;const rel=enemy.position.clone().sub(state.origin).setY(0);const t=clamp(rel.dot(segment)/lengthSq,0,1);if(enemy.position.distanceTo(state.origin.clone().addScaledVector(segment,t))>.9+enemy.radius)continue;
          const result=this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.riftMult,{multiHit:true,skill:true,sameCastHit:{key:`cres-${state.cast.generation}:rift-${tick}:${enemy.id}`,maxHits:1}});if(result.amount>0){targets+=1;if(enemy.boss)enemy.addStagger?.(4);else enemy.applyStun?.(.2);}}
      });
    } else if(index===2){this.game.audio.swing?.(2);this.game.effects.recipeWorldsplitterAct?.(state.origin,state.facing,theme,2,true);this._delay(.16,()=>{if(!this._ownsCast(player,state.cast))return;const raw=skillDamage(player.attackPower,combat)*combat.ruptureMult;this._segmentDamage(state.origin,state.origin.clone().addScaledVector(state.facing,10),1,raw,{multiHit:true,skill:true,onHit:enemy=>this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:raw,castKey:`cres-${state.cast.generation}`,budget:state.apexBudget})},`cres-${state.cast.generation}:rupture`);});}
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
    this.game.world.resolvePosition(player.position, 0.48);
    player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.55);
    this.game.effects.recipeLeapImpact(target, direction, theme, radius);
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
    const enemies = this.game.enemies.enemies;
    const pullRadius = (combat.pullRadius ?? combat.radius) + (combat.apexPullBonus ?? 0);
    if (index === 0) {
      player.position.copy(cast.target);
      this.game.world.resolvePosition(player.position, 0.48);
      cast.target.copy(player.position);
      player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.55);
      this.game.effects.recipeVortexPull?.(cast.target, theme, pullRadius);
      for (const enemy of enemies) {
        if (!enemy.alive || enemy.position.distanceTo(cast.target) > pullRadius + enemy.radius) continue;
        const direction = enemy.position.clone().sub(cast.target).setY(0).normalize();
        this._damageEnemy(enemy, skillDamage(player.attackPower, combat, 'plantMult'), {
          direction, knockback: 0, armorPierce: combat.armorPierce ?? 0.25, multiHit: true, skill: true,
        });
        if (enemy.controlCategory === 'boss') {
          this.game.effects.recipeBossPullResist?.(enemy.position, cast.target, theme);
        } else {
          enemy.pullToward?.(cast.target, combat.safeRing ?? 1.55, combat.pullStrength ?? 0.72, this.game.world, enemies);
        }
      }
      return true;
    }
    this.game.effects.recipeGroundFracture?.(cast.target, cast.direction, theme, combat.radius);
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
    if (combat.judgmentApex) this.game.effects.recipeJudgmentApex?.(cast.target, theme, combat.radius);
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
    if(!state||state.bundle!==bundle||!this._ownsCast(player,state.cast)||index<0||index>=acts||state.completed.has(index))return;state.completed.add(index);this.game.audio.swing?.(index);
    if(index===0)this._apexAudioPhase(player,state.apexAudio,'impact');
    if(index===acts-1)this._apexAudioPhase(player,state.apexAudio,'finisher');
    if(index===0){const hits=combat.arsenal?10:Math.min(Math.round(combat.hits??6),combat.distinctBladeCap??99);const field=combat.fieldRadius??5;
      const bladePoint=i=>{const arm=i%6,ring=Math.floor(i/6),angle=arm/6*Math.PI*2+ring*.22;const dist=i===0?0:legacy?Math.min(field,1.3+ring*1.4+(arm%2)*.5):field*(.38+.58*i/Math.max(1,hits-1));const point=state.center.clone().add(new THREE.Vector3(Math.cos(angle)*dist,0,Math.sin(angle)*dist));point.y=this.game.world.heightAt(point.x,point.z);return point;};
      const landBlade=(i,after=null)=>{if(!this._ownsCast(player,state.cast))return;const point=bladePoint(i),warningTime=legacy?(combat.telegraph??.28):Math.min(.05,combat.telegraph??.05);this._telegraphCircle(point,combat.hitRadius*.9,warningTime,theme.primary,()=>{if(!this._ownsCast(player,state.cast))return;this.game.effects.recipeStarBlade(point,theme,i);this._hitEnemiesInRadius(point,combat.hitRadius,skillDamage(player.attackPower,combat)*(combat.centerMult??1),{knockback:combat.knockback??2.5,multiHit:true,armorPierce:combat.armorPierce??.2,skill:true,onHit:enemy=>{if(!state.landed.includes(enemy)&&state.landed.length<(combat.targetCap??10))state.landed.push(enemy);}});after?.();},{fillOpacity:.12});};
      if(legacy){const finale=()=>{if(!this._ownsCast(player,state.cast))return;this.game.effects.recipeStarFinale(state.center,theme,combat.finaleRadius??5.8);this._hitEnemiesInRadius(state.center,combat.finaleRadius??5.8,skillDamage(player.attackPower,combat,'finaleMult'),{multiHit:true,skill:true,knockback:combat.finaleKnockback??6.2,armorPierce:combat.finaleArmorPierce??.35});};const launch=i=>{if(!this._ownsCast(player,state.cast)||i>=hits)return;this._delay(i===0?.1:.095,()=>{if(!this._ownsCast(player,state.cast))return;if(i+1<hits)launch(i+1);landBlade(i,()=>{if(i===hits-1&&this._ownsCast(player,state.cast))finale();});});};launch(0);}
      else for(let i=0;i<hits;i+=1)this._delay(.01+i*.012,()=>landBlade(i));
    }else if(index===1){this.game.effects.recipeArsenalAct?.(state.center,theme,1,Boolean(combat.arsenal));const royal=state.landed.find(enemy=>enemy.alive&&(enemy.elite||enemy.boss))??state.landed[0];if(royal){this._damageEnemy(royal,skillDamage(player.attackPower,combat)*(combat.sealMult??.5),{multiHit:true,skill:true,sameCastHit:{key:`star-${state.cast.generation}:royal`,maxHits:1}});if(combat.crownMult&&(royal.elite||royal.boss)){this._damageEnemy(royal,skillDamage(player.attackPower,combat)*combat.crownMult,{multiHit:true,skill:true,sameCastHit:{key:`star-${state.cast.generation}:crown`,maxHits:1}});royal.addStagger?.(combat.crownStagger??0);}}
      state.landed.slice(0,Math.min(6,combat.embeddedCap??0)).forEach((enemy,i)=>this._delay(.12+i*.04,()=>{if(this._ownsCast(player,state.cast)&&enemy.alive)this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.embeddedMult,{multiHit:true,skill:true,sameCastHit:{key:`star-${state.cast.generation}:embed:${enemy.id}`,maxHits:1}});}));
      if(combat.prisonCap)for(const enemy of state.landed.slice(0,combat.prisonCap)){if(enemy.boss)enemy.addStagger?.(combat.bossStagger);else enemy.applyStun?.(combat.prisonStun);}
    }else if(index===2&&!state.finale){state.finale=true;for(let ring=0;ring<3;ring+=1)this.game.effects.recipeArsenalAct?.(state.center,theme,2+ring,true);this.game.effects.recipeStarFinale(state.center, theme, combat.finaleRadius ?? 5.8);this._hitEnemiesInRadius(state.center, combat.finaleRadius ?? 5.8, skillDamage(player.attackPower, combat)*(combat.arsenalFinaleMult??combat.finaleMult), {
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


_fireball(player, bundle, phase = null, apexAudio = null) {
  const fire = () => {
    if (!player.alive) return;
    const { combat, theme } = this._skillBundle(bundle);
    const direction = this._facingDir(player);
    const start = player.position.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(direction, 1.05);
    const castState = this._beginWizardCast(player, bundle.id, bundle);
    castState.apexAudio = apexAudio;
    const castId = `fire-${castState.generation}-${++this.spellCastSerial}`;
    const handleFireLanded = enemy => {
      this._apexAudioPhase(player, castState.apexAudio, 'impact');
      if (castState.reactions.has(enemy.id)) return;
      castState.reactions.add(enemy.id);
      const reacted = this._reactSpellPrime(enemy, 'fire', player, skillDamage(player.attackPower, combat), { castId });
      if (!reacted) enemy.setSpellPrime?.('burn', { depth: 0, castId, remaining: combat.status?.duration ?? 2.2 });
      if (combat.reaction === 'chain_ignition' && enemy.statuses?.burn) {
        const relays = this.game.enemies.enemies.filter(other => other.alive && other !== enemy && other.statuses?.burn)
          .sort((a, b) => a.position.distanceToSquared(enemy.position) - b.position.distanceToSquared(enemy.position))
          .slice(0, Math.min(3, combat.reactionCap ?? 3));
        for (const other of relays) this._damageEnemy(other, skillDamage(player.attackPower, combat) * .18, {
          direction: other.position.clone().sub(enemy.position).setY(0).normalize(), knockback: .4, multiHit: true, skill: true,
        });
      }
      if (combat.bossBrandCap && enemy.boss) {
        enemy.solarBrandStacks = Math.min(combat.bossBrandCap, (enemy.solarBrandStacks ?? 0) + 1);
        if (enemy.solarBrandStacks >= combat.bossBrandCap) {
          const detonation = this._damageEnemy(enemy,
            skillDamage(player.attackPower, combat) * combat.bossBrandMult * combat.bossBrandCap, {
            direction, knockback: 0, multiHit: true, skill: true,
            sameCastHit: { key: `${castId}:solar-brand-detonation`, maxHits: 1 },
          });
          if (detonation.amount > 0) enemy.solarBrandStacks = 0;
        }
      }
    };
    this.game.effects.recipeFireOrb(player.position, direction, theme);
    this._spawnFriendlyOrb(start, direction, {
      style: 'fireball',
      color: theme.primary,
      damage: skillDamage(player.attackPower, combat) * player.skillPower,
      speed: combat.speed,
      radius: combat.radius ?? 1.15,
      life: 1.4,
      pierce: Math.min(3, Math.max(1, Math.round(combat.pierce ?? 1))),
      knockback: combat.knockback ?? 4.5,
      skill: true,
      skillPowerApplied: true,
      scale: combat.scale ?? 1.35,
      statusOnHit: combat.status ?? null,
      castId,
      castMeta: { skillId: bundle.id, playerLevel: bundle.playerLevel },
      onHit: handleFireLanded,
      onRetire: projectile => {
        if (!this._endWizardCast(player, castState)) return;
        if (this._clearing || projectile.suppressRetireAuthority) return;
        this._apexAudioPhase(player, castState.apexAudio, 'finisher');
        const at = projectile.mesh.position.clone();
        this.game.effects.recipeLivingStar?.(at, theme, combat.cinders ?? 0, Boolean(combat.prominence));
        const cinders = Math.min(3, Math.max(0, Math.round(combat.cinders ?? 0)));
        const targets = this.game.enemies.enemies.filter(enemy => enemy.alive)
          .sort((a, b) => a.position.distanceToSquared(at) - b.position.distanceToSquared(at)).slice(0, cinders);
        for (const target of targets) {
          const cinderDirection = target.position.clone().sub(at).setY(0).normalize();
          this._spawnFriendlyOrb(at.clone().add(new THREE.Vector3(0, .65, 0)), cinderDirection, {
            style: 'fireball', color: theme.secondary,
            damage: skillDamage(player.attackPower, combat) * (combat.cinderMult ?? 0),
            speed: 11, radius: .55, life: .55, pierce: 1, skill: true,
            skillPowerApplied: false, reactionDepth: 1, castId, homingTarget: target,
          });
        }
        const ticks = Math.min(3, Math.max(0, Math.round(combat.vortexTicks ?? 0)));
        for (let tick = 0; tick < ticks; tick += 1) this._delay(0.12 + tick * 0.16, () => {
          if (!this._isWizardGenerationCurrent(player, castState)) return;
          this._hitEnemiesInRadius(at, combat.blastRadius, skillDamage(player.attackPower, combat) * (combat.vortexMult ?? 0), {
            knockback: 0.4, multiHit: true, skill: true,
          });
        });
        if (combat.prominence) this._hitEnemiesInRadius(at, combat.blastRadius * 1.35,
          skillDamage(player.attackPower, combat) * (combat.flareMult ?? 0), {
            knockback: 2.8, multiHit: true, armorPierce: .3, skill: true,
            sameCastHit: { key: `${castId}:prominence-flare`, maxHits: 1 },
          });
        const apexTarget=this.game.enemies.enemies.filter(enemy=>enemy.alive&&enemy.position.distanceTo(at)<=combat.blastRadius*1.35+enemy.radius)
          .sort((a,b)=>a.position.distanceToSquared(at)-b.position.distanceToSquared(at))[0];
        if(apexTarget)this._applyApexKeystone(player,apexTarget,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat),castKey:castId,budget:castState.apexBudget,overcast:castState.overcast});
      },
      explode: {
        radius: combat.blastRadius,
        damage: skillDamage(player.attackPower, combat, 'blastMult') * player.skillPower,
        color: theme.accent,
        theme,
        status: combat.status ?? null,
        skillPowerApplied: true,
        onHit: handleFireLanded,
        sameCastHit: { key: `${castId}:blast`, maxHits: 1 },
      },
    });
  };
  if (phase != null && phase !== 'full') fire();
  else fire();
},


_frostNova(player, bundle, phase = null, apexAudio = null) {
  const fire = () => {
    if (!player.alive) return;
    const castState = this._beginWizardCast(player, bundle.id, bundle);
    castState.apexAudio = apexAudio;
    const { combat, theme } = this._skillBundle(bundle);
    const rank = bundle.rank;
    const radius = combat.radius;
    const center = player.position.clone();
    const castFacing = this._facingDir(player);
    player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.28);
    this.game.effects.recipeIceNova(center, theme, radius);
    this._apexAudioPhase(player, castState.apexAudio, 'impact');
    // Rank 3+: deepen chill on already-slowed targets (B5).
    for (const enemy of this.game.enemies.enemies) {
      if (!enemy.alive) continue;
      if (enemy.position.distanceTo(center) > radius + enemy.radius) continue;
      if (rank >= 3 && enemy.statuses?.slow?.remaining > 0) {
        enemy.applyStatus?.('slow', {
          duration: combat.deepChillDuration ?? 1.55,
          power: combat.deepChillPower ?? 0.58,
        }, this.game);
      }
    }
    const frostCastId = `frost-${++this.spellCastSerial}`;
    const executionCrystals = new Set(combat.crystalExecuteMult
      ? this.game.enemies.enemies.filter(enemy => enemy.alive
        && (enemy.elite || enemy.boss)
        && enemy.spellPrime?.id === 'crystal')
      : []);
    if (combat.lances) this.game.effects.recipeCrystalDominion?.(center, theme, radius, Math.min(6, combat.lances), Boolean(combat.dominion));
    this._hitEnemiesInRadius(
      center,
      radius,
      skillDamage(player.attackPower, combat),
      {
        knockback: combat.knockback ?? 5.4,
        multiHit: true,
        criticalBonus: combat.criticalBonus ?? 0.04,
        skill: true,
        status: combat.status ?? null,
        onHit: enemy => {
          const reacted = this._reactSpellPrime(enemy, 'frost', player, skillDamage(player.attackPower, combat), { castId: frostCastId });
          const executes = !reacted && executionCrystals.has(enemy)
            && enemy.consumeSpellPrime?.('crystal');
          if (executes) {
            executionCrystals.delete(enemy);
            this.game.effects.recipeSpellReaction?.(enemy.position, 'crystal_execution', castFacing);
            this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.crystalExecuteMult, {
              direction: enemy.position.clone().sub(center).setY(0).normalize(),
              knockback: .8, armorPierce: .35, multiHit: true, skill: true,
              sameCastHit: { key: `${frostCastId}:crystal-execution`, maxHits: 1 },
            });
          } else if (!reacted) {
            if (combat.crystalPrime) enemy.setSpellPrime?.('crystal', { depth: 0, remaining: 4 });
            else if (rank >= 3 && enemy.statuses?.slow?.remaining > 0) enemy.setSpellPrime?.('deep_chill', { depth: 0, remaining: 3 });
          }
        },
      },
    );
    if (combat.lances) this._delay(.18, () => {
      if (!this._isWizardGenerationCurrent(player, castState)) return;
      const lanceHits = new Map();
      for (let lance = 0; lance < Math.min(6, combat.lances); lance += 1) {
        const angle = lance / 6 * Math.PI * 2;
        const lanceDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        for (const enemy of this.game.enemies.enemies) {
          if (!enemy.alive || (lanceHits.get(enemy.id) ?? 0) >= Math.min(2, combat.lancePerEnemyCap ?? 2)) continue;
          const offset = enemy.position.clone().sub(center).setY(0);
          const along = offset.dot(lanceDir);
          const lateral = offset.addScaledVector(lanceDir, -along).length();
          if (along < 0 || along > radius + 2.4 || lateral > .62 + enemy.radius) continue;
          lanceHits.set(enemy.id, (lanceHits.get(enemy.id) ?? 0) + 1);
          this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * (combat.lanceMult ?? 0), {
            direction: lanceDir, knockback: 1, multiHit: true, skill: true,
          });
        }
      }
    });
    if (combat.freezeChainCap) {
      const targets = this.game.enemies.enemies.filter(enemy => enemy.alive && enemy.position.distanceTo(center) <= radius + enemy.radius)
        .slice(0, Math.min(3, combat.freezeChainCap));
      for (const enemy of targets) {
        if (enemy.controlCategory === 'normal') enemy.applyStun?.(.65);
        else enemy.addStagger?.(enemy.controlCategory === 'boss' ? 22 : 16);
      }
    }
    if (combat.dominion) this._delay(.42, () => {
      if (!player.alive || !this._isWizardCastCurrent(player, castState)) {
        this._endWizardCast(player, castState);
        return;
      }
      const facing = castFacing;
      for (const enemy of this.game.enemies.enemies) {
        if (!enemy.alive) continue;
        const offset = enemy.position.clone().sub(center).setY(0);
        const along = offset.dot(facing);
        const lateral = offset.addScaledVector(facing, -along).length();
        if (along < -1 || along > radius || lateral > 1.05 + enemy.radius) continue;
        const inwardRaw=skillDamage(player.attackPower,combat)*combat.inwardMult;const inwardResult=this._damageEnemy(enemy, inwardRaw, {
          direction: facing.clone().negate(), knockback: 1.4, multiHit: true, skill: true,
        });
        if(inwardResult.amount>0)this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:inwardRaw,castKey:frostCastId,budget:castState.apexBudget,overcast:castState.overcast});
      }
      this._apexAudioPhase(player, castState.apexAudio, 'finisher');
      this._endWizardCast(player, castState);
    });
    for (let i = 0; i < 3; i += 1) {
      this._delay(0.1 + i * 0.08, () => {
        if (!player.alive) return;
        this.game.effects.ring(center, theme.secondary, radius * (0.5 + i * 0.16), {
          life: 0.28, startScale: 0.35, height: 0.06, opacity: 0.5,
        });
      });
    }
    if (!combat.dominion) this._endWizardCast(player, castState);
  };
  if (phase != null && phase !== 'full') fire();
  else fire();
},


_arcaneBlink(player, bundle, apexAudio = null) {
  const castState = this._beginWizardCast(player, bundle.id, bundle);
  castState.apexAudio = apexAudio;
  const blinkCastId = `blink-${castState.generation}-${++this.spellCastSerial}`;
  const { combat, theme } = this._skillBundle(bundle);
  const target = this._aimAlongFacing(player, combat.leap ?? 11);
  const from = player.position.clone();
  const radius = combat.radius;
  this._telegraphCircle(target, radius, combat.telegraph ?? 0.42, theme.primary, () => {
    if (!player.alive || !this._isWizardCastCurrent(player, castState)) {
      this._endWizardCast(player, castState);
      return;
    }
    player.position.copy(target);
    this.game.world.resolvePosition(player.position, 0.48);
    const to = player.position.clone();
    player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.55);
    this.game.effects.recipeBlinkBurst(from, to, theme, radius);
    this._apexAudioPhase(player, castState.apexAudio, 'impact');
    if (combat.routeMult) {
      const route = to.clone().sub(from).setY(0);
      const length = Math.max(0.001, route.length());
      const routeDir = route.normalize();
      let anchors = 0;
      const anchored = [];
      this.game.effects.recipeSpaceSeam?.(from, to, theme, Boolean(combat.spaceRend));
      const crossed = [];
      for (const enemy of this.game.enemies.enemies) {
        if (!enemy.alive) continue;
        const offset = enemy.position.clone().sub(from).setY(0);
        const along = clamp(offset.dot(routeDir), 0, length);
        if (offset.addScaledVector(routeDir, -along).length() > 1.2 + enemy.radius) continue;
        crossed.push({ enemy, along });
      }
      crossed.sort((a, b) => a.along - b.along);
      this._delay(.12, () => {
        if (!this._isWizardGenerationCurrent(player, castState)) return;
        for (const { enemy } of crossed) {
          this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.routeMult, {
            direction: routeDir, knockback: 0.5, multiHit: true, skill: true,
            onHit: landed => {
              if (!this._reactSpellPrime(landed, 'arcane', player, skillDamage(player.attackPower, combat), { castId: blinkCastId })
                && anchors < Math.min(6, combat.anchors ?? 0)) {
                landed.setSpellPrime?.('rift_anchor', { depth: 0, order: anchors, remaining: 4 });
                anchored.push(landed); anchors += 1;
              }
            },
          });
        }
        anchored.forEach((enemy, order) => this._delay(.14 + order * .07, () => {
          if (!enemy.alive || !this._isWizardGenerationCurrent(player, castState)) return;
          this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * (combat.anchorMult ?? 0), {
            direction: routeDir, knockback: 0.4,
            armorPierce: combat.anchorArmorPierce && (enemy.elite || enemy.boss) ? combat.anchorArmorPierce : .3,
            multiHit: true, skill: true,
          });
        }));
      });
      const echoes = Math.min(2, Math.max(1, combat.routeEchoes ?? 1));
      if (echoes > 1) this._delay(.26, () => {
        if (!this._isWizardGenerationCurrent(player, castState)) return;
        for (const { enemy } of crossed) this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.routeMult * .65, {
          direction: routeDir, knockback: .3, multiHit: true, skill: true,
        });
      });
      if (combat.spaceRend) this._delay(.42, () => {
        if (!this._isWizardGenerationCurrent(player, castState)) return;
        let apexTarget=null;for (const { enemy } of crossed){const seamRaw=skillDamage(player.attackPower,combat)*combat.seamMult;const seamResult=this._damageEnemy(enemy, seamRaw, {
          direction: routeDir, knockback: .6, armorPierce: .4, multiHit: true, skill: true,
        });if(seamResult.amount>0&&!apexTarget)apexTarget=enemy;}
        if(apexTarget)this._applyApexKeystone(player,apexTarget,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat)*combat.seamMult,castKey:blinkCastId,budget:castState.apexBudget,overcast:castState.overcast});
        this._apexAudioPhase(player, castState.apexAudio, 'finisher');
      });
    }
    if (combat.lanceMult) {
      for (const enemy of this.game.enemies.enemies) {
        const offset = enemy.position.clone().sub(to).setY(0);
        const along = offset.dot(this._facingDir(player));
        if (enemy.alive && along >= 0 && along <= radius + 3 && offset.length() <= radius + 3) this._damageEnemy(enemy,
          skillDamage(player.attackPower, combat) * combat.lanceMult, { direction: this._facingDir(player), knockback: 2, armorPierce: .4, skill: true });
      }
    }
    if (combat.horizonMult) {
      const midpoint = from.clone().add(to).multiplyScalar(.5);
      this._delay(.22, () => {
        if (!this._isWizardGenerationCurrent(player, castState)) return;
        this._hitEnemiesInRadius(midpoint, radius * .75,
          skillDamage(player.attackPower, combat) * combat.horizonMult, { knockback: 1.5, multiHit: true, skill: true });
      });
    }
    this._hitEnemiesInRadius(
      to,
      radius,
      skillDamage(player.attackPower, combat),
      {
        knockback: combat.knockback ?? 6.8,
        armorPierce: combat.armorPierce ?? 0.22,
        criticalBonus: combat.criticalBonus ?? 0.05,
        skill: true,
      },
    );
    this._endWizardCast(player, castState);
  }, { fillOpacity: 0.14 });
},


_meteorStorm(player, bundle, apexAudio = null) {
  const castState = this._beginWizardCast(player, bundle.id, bundle);
  castState.apexAudio = apexAudio;
  const { combat, theme } = this._skillBundle(bundle);
  const facing = this._facingDir(player);
  const center = this._aimAlongFacing(player, combat.aim ?? 10);
  if (combat.worldEnder) {
    const durable = this.game.enemies.enemies.filter(enemy => enemy.alive && (enemy.elite || enemy.boss))
      .sort((a, b) => a.position.distanceToSquared(center) - b.position.distanceToSquared(center))[0];
    if (durable) center.copy(durable.position);
  }
  const hits = Math.min(10, Math.max(1, Math.round(combat.hits ?? 6), Math.round(combat.impactsCap ?? 0)));
  const fallHeight = combat.fallHeight ?? 8.5;
  let gravityReactions = 0;
  const reservedRifts = new Set();
  castState.impactsResolved = 0;
  castState.authoritiesExpected = hits * (combat.fractures ? 2 : 1);
  const meteorCastId = `meteor-${castState.generation}-${++this.spellCastSerial}`;
  const orbitTargets = combat.orbitTargets
    ? this.game.enemies.enemies.filter(enemy => enemy.alive)
      .sort((a, b) => a.position.distanceToSquared(center) - b.position.distanceToSquared(center))
      .slice(0, Math.min(6, combat.orbitTargets)) : [];
  // Fall-cone pattern along facing (distinct from star radial blades)
  for (let i = 0; i < hits; i += 1) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const lateral = (col - 1) * (1.8 + row * 0.35);
    const forward = 0.6 + row * 2.1 + i * 0.15 + (combat.pattern === 'movingRain' ? row * .7 : 0);
    const side = new THREE.Vector3(-facing.z, 0, facing.x);
    const point = center.clone()
      .addScaledVector(facing, forward - 2.2)
      .addScaledVector(side, lateral);
    if (orbitTargets.length) {
      const targetEnemy = orbitTargets[i % orbitTargets.length];
      const spiralAngle = i * 1.37;
      point.copy(targetEnemy.position).add(new THREE.Vector3(Math.cos(spiralAngle) * .55, 0, Math.sin(spiralAngle) * .55));
    }
    point.y = this.game.world.heightAt(point.x, point.z);
    this._delay(0.08 + i * 0.11, () => {
      if (!this._isWizardGenerationCurrent(player, castState)) return;
      const impactPoint = point.clone();
      let riftTarget = null;
      if (gravityReactions < Math.min(3, combat.gravityReactionCap ?? 3)) {
        riftTarget = this.game.enemies.enemies.filter(enemy => enemy.alive
          && enemy.spellPrime?.id === 'rift_anchor' && !reservedRifts.has(enemy)
          && enemy.position.distanceTo(impactPoint) <= combat.hitRadius + enemy.radius + 1.25)
          .sort((a, b) => a.position.distanceToSquared(impactPoint) - b.position.distanceToSquared(impactPoint))[0] ?? null;
        if (riftTarget) {
          reservedRifts.add(riftTarget);
          const shift = riftTarget.position.clone().sub(impactPoint).setY(0);
          if (shift.lengthSq() > 1.25 * 1.25) shift.setLength(1.25);
          impactPoint.add(shift);
          impactPoint.y = this.game.world.heightAt(impactPoint.x, impactPoint.z);
        }
      }
      if (combat.gravityLens) {
        const fallStart = impactPoint.clone().add(new THREE.Vector3(0, fallHeight, 0));
        this.game.effects.recipeGravityLens?.(fallStart, impactPoint, theme, i, hits, Boolean(combat.astralCataclysm));
      }
      this._telegraphCircle(impactPoint, combat.hitRadius * 0.95, combat.telegraph ?? 0.26, theme.primary, () => {
        if (!this._isWizardGenerationCurrent(player, castState)) return;
        this._apexAudioPhase(player, castState.apexAudio, 'impact');
        this.game.effects.recipeMeteorDrop(impactPoint, theme, fallHeight);
        if (combat.fractures && (this._quality() === 'high' || i % 2 === 0)) {
          this.game.effects.recipeGroundFracture?.(impactPoint, facing, theme, combat.hitRadius * 1.15);
        }
        this._hitEnemiesInRadius(
          impactPoint,
          combat.hitRadius,
          skillDamage(player.attackPower, combat),
          {
            knockback: combat.knockback ?? 2.8,
            multiHit: true,
            armorPierce: combat.armorPierce ?? 0.18,
            skill: true,
            status: combat.status ?? null,
            onHit: enemy => {
              if (enemy === riftTarget && gravityReactions < Math.min(3, combat.gravityReactionCap ?? 3)
                && enemy.consumeSpellPrime?.('rift_anchor')) {
                gravityReactions += 1;
                this.game.effects.recipeSpellReaction?.(enemy.position, 'rift_impact', facing);
              }
            },
          },
        );
        if (riftTarget?.spellPrime?.id === 'rift_anchor') reservedRifts.delete(riftTarget);
        castState.impactsResolved += 1;
        if (combat.fractures) this._delay(.16, () => {
          if (!this._isWizardGenerationCurrent(player, castState)) return;
          this._hitEnemiesInRadius(impactPoint, combat.hitRadius * .72, skillDamage(player.attackPower, combat) * .16, {
            knockback: .4, multiHit: true, skill: true,
            sameCastHit: { key: `${meteorCastId}:fracture-${i}`, maxHits: 1 },
          });
          castState.impactsResolved += 1;
        });
      }, { fillOpacity: 0.13 });
    });
  }
  const resolveFinale = () => {
    if (!this._isWizardCastCurrent(player, castState)) {
      this._endWizardCast(player, castState);
      return;
    }
    if (castState.impactsResolved < castState.authoritiesExpected) {
      this._delay(.035, resolveFinale);
      return;
    }
    this.game.effects.recipeMeteorFinale(center, theme, combat.finaleRadius ?? 5.6);
    this._apexAudioPhase(player, castState.apexAudio, 'finisher');
    this._hitEnemiesInRadius(
      center,
      combat.finaleRadius ?? 5.6,
      skillDamage(player.attackPower, combat, 'finaleMult'),
      {
        knockback: combat.finaleKnockback ?? 6.4,
        multiHit: true,
        armorPierce: combat.finaleArmorPierce ?? 0.3,
        skill: true,
        status: combat.status ?? null,
        sameCastHit: { key: `${meteorCastId}:finale`, maxHits: 1 },
        onHit:enemy=>this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat,'finaleMult'),castKey:meteorCastId,budget:castState.apexBudget,overcast:castState.overcast}),
      },
    );
    if (combat.astralCataclysm) {
      this.game.effects.recipeGroundFracture?.(center, facing, theme, combat.finaleRadius * 1.25);
      this._hitEnemiesInRadius(center, combat.finaleRadius * 1.15, skillDamage(player.attackPower, combat) * .35, {
        knockback: 2, multiHit: true, armorPierce: .35, skill: true,
        sameCastHit: { key: `${meteorCastId}:apex-fracture`, maxHits: 1 },
      });
    }
    this._endWizardCast(player, castState);
  };
  this._delay(0.2 + hits * 0.11, resolveFinale);
},


_piercingShot(player, bundle, phase = null, apexAudio = null) {
  const fire = () => {
    if (!player.alive) return;
    const { combat, theme } = this._skillBundle(bundle);
    const direction = this._facingDir(player);
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    const points = [];
    let splinters = 0;
    let split = false;
    const apexBudget={targets:new Map(),casts:new Set()};
    const generations=this.rangerGeneration.get(player)??{};const generation=(generations.pierce??0)+1;generations.pierce=generation;this.rangerGeneration.set(player,generations);
    const current=()=>player.alive&&player.classId==='ranger'&&this.rangerGeneration.get(player)?.pierce===generation;
    const castId = `ranger-q-${++this.rangerSerial}`;
    this.game.effects.recipeArrowStreak?.(player.position, direction, theme, Boolean(combat.railArrow));
    const start = player.position.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(direction, 1.0);
    this._spawnFriendlyOrb(start, direction, {
      style: 'heavy_arrow',
      color: theme.primary,
      damage: skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1),
      speed: (combat.speed ?? 18) * (combat.speedMult ?? 1),
      radius: (combat.radius ?? 0.95) * (combat.radiusMult ?? 1),
      life: combat.life ?? 1.15,
      pierce: Math.max(1, Math.round((combat.pierce ?? 3) + (combat.crowdPierce ?? 0))),
      knockback: combat.knockback ?? 3.2,
      skill: true,
      scale: combat.scale ?? 1.1,
      armorPierce: combat.armorPierce ?? 0.18,
      statusOnHit: combat.status ?? null,
      castId,
      ownerGuard:current,
      onHit: enemy => {
        this._apexAudioPhase(player,apexAudio,'impact');
        if (points.length < Math.min(6, combat.storedPierceCap ?? 6)) points.push(enemy.position.clone());
        if (combat.fishbone && splinters < Math.min(12, combat.splinterCap ?? 12)) {
          for (const sign of [-1, 1]) {
            if (splinters >= 12) break;
            const splinterDir = side.clone().multiplyScalar(sign);
            this._spawnFriendlyOrb(enemy.position.clone().add(new THREE.Vector3(0, .8, 0)).addScaledVector(splinterDir, enemy.radius + .7), splinterDir, {
              style: 'arrow', color: theme.secondary, damage: skillDamage(player.attackPower, combat) * combat.splinterMult,
              speed: 13, radius: .45, life: .34, pierce: 1, skill: true, reactionDepth: 1, castId,
            });
            splinters += 1;
          }
        }
        if (combat.splitArrow && !split) {
          split = true;
          for (const angle of [-.18, .18]) {
            const dir = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            this._spawnFriendlyOrb(enemy.position.clone().add(new THREE.Vector3(0, .8, 0)).addScaledVector(dir, enemy.radius + .7), dir, {
              style: 'arrow', color: theme.accent, damage: skillDamage(player.attackPower, combat) * combat.splitMult,
              speed: 16, radius: .5, life: .55, pierce: 1, skill: true, reactionDepth: 1, castId,
            });
          }
        }
        if (combat.dragonPiercer && (enemy.elite || enemy.boss)) enemy.addStagger?.(combat.bossStagger ?? 24);
      },
      onRetire: projectile => {
        if (projectile.suppressRetireAuthority || this._clearing || !current()) return;
        this._apexAudioPhase(player,apexAudio,'finisher');
        if (combat.backwardRelease && points.length) {
          const corridor = points.slice(0, 6);
          this.game.effects.recipeRangerBackwardCorridor?.(corridor, direction, theme);
          for (const enemy of this.game.enemies.enemies) {
            if (!enemy.alive) continue;
            const crossed = corridor.some(point => {
              const offset = enemy.position.clone().sub(point).setY(0);
              const along = offset.dot(direction.clone().negate());
              return along >= 0 && along <= 4.5 && offset.addScaledVector(direction, along).length() <= .7 + enemy.radius;
            });
            if (crossed) this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.backwardMult, {
              multiHit: true, skill: true, sameCastHit: { key: `${castId}:backward:${enemy.id}`, maxHits: 1 },
            });
          }
        }
        if (combat.horizonBreaker) {
          const ruptureHits = new Map();
          points.slice(0, Math.min(6, combat.ruptureCap ?? 6)).forEach((point, index) => this._delay(.08 + index * .05, () => {
          if(!current())return;
          this.game.effects.recipeRangerRupture?.(point, direction, theme);
          for (const enemy of this.game.enemies.enemies) {
            if (!enemy.alive || (ruptureHits.get(enemy.id) ?? 0) >= Math.min(2, combat.rupturePerEnemyCap ?? 2)
              || enemy.position.distanceTo(point) > 1.25 + enemy.radius) continue;
            const result = this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.ruptureMult, {
              multiHit: true, skill: true, sameCastHit: { key: `${castId}:rupture:${enemy.id}`, maxHits: 1 },
            });
            if(result.amount>0)this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat)*combat.ruptureMult,castKey:castId,budget:apexBudget});
            if (result.amount > 0) ruptureHits.set(enemy.id, (ruptureHits.get(enemy.id) ?? 0) + 1);
          }
        }));
        }
      },
    });
  };
  if (phase != null && phase !== 'full') fire();
  else fire();
},


_caltropTrap(player, bundle, apexAudio = null) {
  const { combat, theme } = this._skillBundle(bundle);
  if (!combat.seedLanded) {
    const direction = this._facingDir(player);
    const distance = combat.aim ?? 7.5;
    const start = player.position.clone().add(new THREE.Vector3(0, 1, 0));
    this._spawnFriendlyOrb(start, direction, {
      style: 'arrow', color: theme.primary, damage: skillDamage(player.attackPower, combat) * .35,
      speed: 15, radius: .4, life: distance / 15, pierce: 1, skill: true,
      onRetire: projectile => {
        if (projectile.suppressRetireAuthority || this._clearing || !player.alive || player.classId !== 'ranger') return;
        const impactCenter = projectile.mesh.position.clone(); impactCenter.y = this.game.world.heightAt(impactCenter.x, impactCenter.z);
        this._caltropTrap(player, { ...bundle, combat: { ...combat, seedLanded: 1, impactCenter, seedFacing: direction } }, apexAudio);
      },
    });
    return;
  }
  const center = combat.impactCenter.clone();
  const castFacing = combat.seedFacing.clone();
  const radius = (combat.radius ?? 3.2) * (combat.radiusMult ?? 1);
  const ticks = Math.max(1, Math.round(combat.ticks ?? 5));
  const interval = combat.tickInterval ?? 0.55;
  const generation = (this.rangerGeneration.get(player)?.thorn ?? 0) + 1;
  const apexBudget={targets:new Map(),casts:new Set()};
  const generations = this.rangerGeneration.get(player) ?? {};
  generations.thorn = generation; this.rangerGeneration.set(player, generations);
  player.thornField = { generation, remaining: .08 + ticks * interval + .2, contacts: 0, planted: 0 };
  const current = () => player.alive && player.classId === 'ranger' && player.thornField?.generation === generation;
  this.game.effects.recipeTrapField?.(center, theme, radius);
  this._apexAudioPhase(player,apexAudio,'impact');
  this._hitEnemiesInRadius(center, 1.1, skillDamage(player.attackPower, combat) * (combat.seedMult ?? 1), {
    multiHit: true, skill: true, sameCastHit: { key: `thorn-${generation}:seed-impact`, maxHits: 1 },
  });
  if (combat.openClose) this._delay(.05, () => current() && this._hitEnemiesInRadius(center, radius,
    skillDamage(player.attackPower, combat) * combat.burstMult, { multiHit: true, skill: true,
      sameCastHit: { key: `thorn-${generation}:open`, maxHits: 1 } }));
  for (let i = 0; i < ticks; i += 1) {
    this._delay(0.08 + i * interval, () => {
      if (!current()) return;
      this.game.effects.ring(center, i % 2 ? theme.secondary : theme.primary, radius * (0.55 + i * 0.08), {
        life: 0.32, startScale: 0.3, height: 0.06, opacity: 0.55,
      });
      this._hitEnemiesInRadius(center, radius, skillDamage(player.attackPower, combat), {
        knockback: combat.knockback ?? 1.1,
        multiHit: true,
        skill: true,
        status: combat.status ?? null,
        sameCastHit: { key: `thorn-${generation}:tick-${i}`, maxHits: 1 },
        onHit: enemy => {
          player.thornField.contacts += 1;
          if (combat.snareBloom && enemy.controlCategory === 'normal'
            && (player.thornField.snares ?? 0) < Math.min(4, combat.snareCap ?? 4)) {
            player.thornField.snares = (player.thornField.snares ?? 0) + 1;
            enemy.pullToward?.(center, 0, .45, this.game.world, this.game.enemies.enemies);
          }
          const fieldTime = i * interval;
          if (combat.mineGarden && (enemy.elite || enemy.boss)
            && fieldTime >= (player.thornField.mineReadyAt ?? 0)
            && (player.thornField.mines ?? 0) < Math.min(3, combat.mineCap ?? 3)) {
            player.thornField.mines = (player.thornField.mines ?? 0) + 1;
            player.thornField.mineReadyAt = fieldTime + (combat.mineCooldown ?? .55);
            this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.mineMult, {
              multiHit: true, skill: true, sameCastHit: { key: `thorn-${generation}:mine-${player.thornField.mines}`, maxHits: 1 },
            });
          }
          if (combat.plantedEvery && player.thornField.contacts % combat.plantedEvery === 0
            && player.thornField.planted < Math.min(4, combat.plantedCap ?? 4)) {
            player.thornField.planted += 1;
            const dir = castFacing;
            this._spawnFriendlyOrb(center.clone().add(new THREE.Vector3(0, .6, 0)), dir, {
              style: 'arrow', color: theme.secondary, damage: skillDamage(player.attackPower, combat) * combat.plantedMult,
              speed: 15, radius: .45, life: .5, pierce: 2, skill: true, reactionDepth: 1,
            });
          }
        },
      });
      if (combat.lineCount) {
        const side = new THREE.Vector3(-castFacing.z, 0, castFacing.x);
        const lineHits = new Map();
        for (let line = 0; line < Math.min(5, combat.lineCount); line += 1) {
          const lineCenter = center.clone().addScaledVector(side, (line - (combat.lineCount - 1) / 2) * 1.05);
          for (const enemy of this.game.enemies.enemies) {
            if (!enemy.alive || (lineHits.get(enemy.id) ?? 0) >= 2) continue;
            const offset = enemy.position.clone().sub(lineCenter).setY(0);
            if (Math.abs(offset.dot(side)) > .42 + enemy.radius || Math.abs(offset.dot(castFacing)) > radius) continue;
            const result = this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * .32, {
              multiHit: true, skill: true, sameCastHit: { key: `thorn-${generation}:line-${i}-${line}:${enemy.id}`, maxHits: 1 },
            });
            if (result.amount > 0) lineHits.set(enemy.id, (lineHits.get(enemy.id) ?? 0) + 1);
          }
        }
      }
    });
  }
  this._delay(.1 + ticks * interval, () => {
    if (!current()) return;
    if (combat.openClose) this._hitEnemiesInRadius(center, radius, skillDamage(player.attackPower, combat) * combat.burstMult, {
      multiHit: true, skill: true, sameCastHit: { key: `thorn-${generation}:close`, maxHits: 1 },
    });
    if (combat.thornGrid) this._delay(.08, () => {
      if (!current()) return;
      this._apexAudioPhase(player,apexAudio,'finisher');
      this.game.effects.recipeThornGrid?.(center, castFacing, theme, combat.gridLines ?? 0);
      const side = new THREE.Vector3(-castFacing.z, 0, castFacing.x);
      const axisHits = new Map();
      for (const enemy of this.game.enemies.enemies) {
        if (!enemy.alive) continue;
        const offset = enemy.position.clone().sub(center).setY(0);
        const row = Math.abs(offset.dot(side)) <= .55 && Math.abs(offset.dot(castFacing)) <= radius;
        const column = Math.abs(offset.dot(castFacing)) <= .55 && Math.abs(offset.dot(side)) <= radius;
        for (const [axis, hit] of [['row', row], ['column', column]]) if (hit && (axisHits.get(enemy.id) ?? 0) < 2) {
          const result = this._damageEnemy(enemy, skillDamage(player.attackPower, combat) * combat.finaleMult * .5, {
            multiHit: true, skill: true, sameCastHit: { key: `thorn-${generation}:grid:${axis}:${enemy.id}`, maxHits: 1 },
          });
          if(result.amount>0)this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat)*combat.finaleMult*.5,castKey:`thorn-${generation}`,budget:apexBudget});
          if (result.amount > 0) axisHits.set(enemy.id, (axisHits.get(enemy.id) ?? 0) + 1);
        }
      }
      player.thornField = null;
    }); else player.thornField = null;
  });
},


_vaultShot(player, bundle, apexAudio = null) {
  const { combat, theme } = this._skillBundle(bundle);
  const forward = this._facingDir(player);
  const back = forward.clone().multiplyScalar(-1);
  const from = player.position.clone();
  if (bundle.playerLevel < 20) {
    player.position.addScaledVector(back, combat.dash ?? 3.6);
    this.game.world.resolvePosition(player.position, .48);
    player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? .4);
    this.game.effects.recipeVaultVolley?.(from, player.position, forward, theme);
    const count = Math.min(12, Math.max(1, Math.round(combat.arrows ?? 4)));
    const yaw0 = Math.atan2(forward.x, forward.z);
    for (let i = 0; i < count; i += 1) {
      const yaw = yaw0 + (i - (count - 1) / 2) * (combat.spread ?? .14);
      const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      this._spawnFriendlyOrb(player.position.clone().add(new THREE.Vector3(0, 1.15, 0)), dir, {
        style: 'arrow', color: theme.primary, damage: skillDamage(player.attackPower, combat), speed: combat.speed,
        radius: combat.radius, life: combat.life, pierce: 1, skill: true, criticalBonus: combat.criticalBonus,
      });
    }
    return;
  }
  const generations = this.rangerGeneration.get(player) ?? {};
  const generation = (generations.vault ?? 0) + 1;
  generations.vault = generation; this.rangerGeneration.set(player, generations);
  const current = () => player.alive && player.classId === 'ranger' && this.rangerGeneration.get(player)?.vault === generation;
  const dash = (combat.dash ?? 3.6) * (combat.dashMult ?? 1);
  const landing = from.clone().addScaledVector(back, dash);
  this.game.world.resolvePosition(landing, 0.48);
  player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.4);
  this.game.effects.recipeVaultVolley?.(from, landing, forward, theme);
  this.game.effects.recipeSkyHunterArc?.(from, landing, forward, theme, combat.volleyLayers ?? 1);
  const arrows = Math.min(12, Math.max(1, Math.round(combat.arrows ?? 4)));
  const baseYaw = Math.atan2(forward.x, forward.z);
  const spread = (combat.spread ?? 0.14) * (combat.spreadMult ?? 1);
  const usedRedirects = new Set();
  const apexBudget={targets:new Map(),casts:new Set()};
  const shootLayer = (origin, count, layer = 0, landingLayer = false) => { for (let i = 0; i < count; i += 1) {
    const yaw = baseYaw + (i - (count - 1) / 2) * spread;
    let dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    if (combat.redirect && usedRedirects.size < Math.min(combat.redirectCap ?? 6, 6)) {
      const target = this.game.enemies.enemies.filter(enemy => enemy.alive && !usedRedirects.has(enemy.id))
        .map(enemy => ({ enemy, offset: enemy.position.clone().sub(origin).setY(0) }))
        .filter(entry => entry.offset.length() <= 12 && entry.offset.normalize().dot(dir) >= Math.cos(35 * Math.PI / 180))
        .sort((a, b) => a.enemy.position.distanceToSquared(origin) - b.enemy.position.distanceToSquared(origin))[0]?.enemy;
      if (target) { usedRedirects.add(target.id); dir = target.position.clone().sub(origin).setY(0).normalize(); }
    }
    const start = origin.clone().add(new THREE.Vector3(0, 1.15 + layer * .3, 0)).addScaledVector(dir, 0.55);
    this._spawnFriendlyOrb(start, dir, {
      style: 'arrow',
      color: i % 2 ? theme.secondary : theme.primary,
      damage: skillDamage(player.attackPower, combat) * (combat.damageMult ?? 1),
      speed: combat.speed ?? 16.5,
      radius: combat.radius ?? 0.88,
      life: combat.life ?? 0.85,
      pierce: 1,
      knockback: combat.knockback ?? 2.6,
      skill: true,
      scale: 0.95,
      criticalBonus: combat.criticalBonus ?? 0.06,
      onHit: landingLayer ? enemy => {
        const distance = enemy.position.distanceTo(landing);
        if (combat.idealMin&&(enemy.elite || enemy.boss) && distance >= combat.idealMin && distance <= combat.idealMax) this._damageEnemy(enemy,
          skillDamage(player.attackPower, combat) * (combat.idealMult - 1), { multiHit: true, skill: true,
            sameCastHit: { key: `vault-${generation}:ideal:${enemy.id}`, maxHits: 1 } });
        if(combat.skyHunter)this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:skillDamage(player.attackPower,combat)*(combat.damageMult??1),castKey:`vault-${generation}`,budget:apexBudget});
      } : null,
    });
  }};
  const landingCount = combat.landingShot ? (combat.skyHunter ? Math.min(4, arrows) : 1) : 0;
  const airCount = combat.airVolley ? Math.min(4, Math.max(0, arrows - landingCount - 1)) : 0;
  const launchCount = Math.max(1, arrows - airCount - landingCount);
  this._delay(.05, () => {
    if (!current()) return;
    this._apexAudioPhase(player,apexAudio,'impact');
    if (combat.launchBlast) this._hitEnemiesInRadius(from, 2.1, skillDamage(player.attackPower, combat) * .7, { multiHit: true, skill: true });
    shootLayer(from, launchCount, 0);
  });
  this._delay(.14, () => {
    if (!current()) return;
    player.position.copy(landing); // one authoritative movement
    if (airCount) shootLayer(from.clone().add(landing).multiplyScalar(.5), airCount, 1);
  });
  this._delay(.3, () => {
    if (!current()) return;
    if (landingCount) shootLayer(landing, landingCount, 2, true);
    this._apexAudioPhase(player,apexAudio,'finisher');
  });
},


_detonateVerdict(player, verdict) {
  if (!verdict || player.predatorVerdict !== verdict) return false;
  const capturedMarkedTarget=verdict.target;
  player.predatorVerdict = null; // atomic before any derived authority
  const enemy = verdict.target;
  if (!enemy?.alive) return false;
  const { combat, theme } = this._skillBundle(verdict.bundle);
  this.game.effects.recipePredatorConvergence?.(enemy.position, this._facingDir(player), theme, Boolean(combat.apexVerdict));
  const detonationScale = verdict.detonationScale ?? 1;
  const raw = (skillDamage(player.attackPower, combat, 'detonateMult') + verdict.stored) * detonationScale;
  this._damageEnemy(enemy, raw, { multiHit: true, skill: true, armorPierce: combat.verdictPierce ? .5 : .25, verdictDerived: true,
    sameCastHit: { key: `verdict-${verdict.generation}:primary`, maxHits: 1 } });
  if (combat.bossStagger && enemy.boss) enemy.addStagger?.(combat.bossStagger);
  for (const linked of verdict.linked ?? []) if (linked.target?.alive) this._damageEnemy(linked.target,
    (skillDamage(player.attackPower, combat, 'detonateMult') + linked.stored) * linked.detonationScale, {
      multiHit: true, skill: true, verdictDerived: true,
      sameCastHit: { key: `verdict-${verdict.generation}:transfer:${linked.target.id}`, maxHits: 1 },
    });
  if (combat.verdictPierce) {
    const facing = this._facingDir(player);
    this._hitEnemiesInCone(enemy.position.clone().addScaledVector(facing, -.25), facing, 6, .7,
      raw * combat.verdictPierceMult, { multiHit: true, skill: true, verdictDerived: true,
        sameCastHit: { key: `verdict-${verdict.generation}:pierce`, maxHits: 1 } });
  }
  const chains = Math.min(2, combat.verdictChains ?? 0);
  if (chains) this.game.enemies.enemies.filter(other => other.alive && other !== enemy)
    .sort((a, b) => a.position.distanceToSquared(enemy.position) - b.position.distanceToSquared(enemy.position))
    .slice(0, chains).forEach((other, index) => this._damageEnemy(other, raw * combat.chainMult, {
      multiHit: true, skill: true, verdictDerived: true, sameCastHit: { key: `verdict-${verdict.generation}:chain-${index}`, maxHits: 1 },
    }));
  if (combat.transferMarks && (verdict.depth ?? 0) < 1) {
    const transfers = this.game.enemies.enemies.filter(other => other.alive && other !== enemy)
      .sort((a, b) => a.position.distanceToSquared(enemy.position) - b.position.distanceToSquared(enemy.position))
      .slice(0, Math.min(2, combat.transferMarks));
    if (transfers.length) {
      for (const transfer of transfers) transfer.applyStatus?.('expose', { duration: 2.2, power: .12, damageAmp: .08 }, this.game);
      const [primary, ...linked] = transfers.map(transfer => ({ target: transfer,
        stored: Math.min(verdict.cap * combat.transferMult, verdict.stored * combat.transferMult),
        detonationScale: combat.transferMult }));
      player.predatorVerdict = { ...verdict, generation: ++this.rangerSerial, target: primary.target, remaining: 2.2,
        stored: primary.stored, cap: verdict.cap * combat.transferMult, detonationScale: primary.detonationScale,
        linked, depth: 1 };
    }
  }
  if (combat.apexVerdict) this._hitEnemiesInRadius(enemy.position, 2.4, raw * combat.convergenceMult, {
    multiHit: true, skill: true, verdictDerived: true, sameCastHit: { key: `verdict-${verdict.generation}:convergence`, maxHits: 1 },
  });
  this._applyApexKeystone(player,enemy,{bundle:verdict.bundle,theme,rawDamage:raw,castKey:`verdict-${verdict.generation}`,budget:{targets:new Map(),casts:new Set()},capturedMarkedTarget});
  return true;
},


_hunterMark(player, bundle, apexAudio = null) {
  const { combat, theme } = this._skillBundle(bundle);
  const rank = bundle.rank;
  const direction = this._facingDir(player);
  const range = combat.range ?? 14;
  const cosThreshold = Math.cos((combat.arc ?? 1.4) * 0.5);
  let best = null;
  let bestDist = Infinity;
  for (const enemy of this.game.enemies.enemies) {
    if (!enemy.alive) continue;
    const offset = TMP_A.copy(enemy.position).sub(player.position).setY(0);
    const dist = offset.length();
    if (dist > range + enemy.radius || dist < 0.001) continue;
    const dir = offset.clone().normalize();
    if (dir.dot(direction) < cosThreshold) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = enemy;
    }
  }
  if (!best) {
    // Fallback: nearest living enemy in world radius of aim
    for (const enemy of this.game.enemies.enemies) {
      if (!enemy.alive) continue;
      const dist = enemy.position.distanceTo(player.position);
      if (dist < bestDist && dist < range + 4) {
        bestDist = dist;
        best = enemy;
      }
    }
  }
  if (!best) {
    this.game.effects.recipeMarkGlyph?.(player.position.clone().addScaledVector(direction, 4), theme, 2.2);
    return;
  }
  if (player.predatorVerdict) {
    this._apexAudioPhase(player,apexAudio,'impact');
    this._detonateVerdict(player, player.predatorVerdict);
    this._apexAudioPhase(player,apexAudio,'finisher');
    return;
  }
  this.game.effects.recipeMarkGlyph?.(best.position, theme, 2.8);
  const landed = this._damageEnemy(best, skillDamage(player.attackPower, combat), {
    direction: TMP_B.copy(best.position).sub(player.position).setY(0).normalize(),
    knockback: combat.knockback ?? 2,
    criticalBonus: combat.criticalBonus ?? 0.08,
    skill: true,
  });
  if (landed.amount <= 0) return;
  this._apexAudioPhase(player,apexAudio,'impact');
  best.applyStatus?.('expose', {
    duration: combat.markDuration ?? 5.2,
    power: (combat.exposePower ?? 0.22) * (combat.exposeMult ?? 1),
    damageAmp: (combat.damageAmp ?? 0.16) * (combat.exposeMult ?? 1),
  }, this.game);
  const generation = ++this.rangerSerial;
  const storeMult = (combat.verdictStore ?? 0) * (combat.storeMult ?? 1);
  const cap = skillDamage(player.attackPower, combat) * (combat.verdictCap ?? 0) * (combat.capMult ?? 1);
  player.predatorVerdict = { generation, target: best, bundle, remaining: combat.markDuration ?? 5.2, stored: 0, storeMult, cap };
  this._apexAudioPhase(player,apexAudio,'finisher');
},


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
  this.game.effects.recipeFangRush(origin, direction, theme, combat.range, hitIndex, finale, offhand);
  this.game.audio.swing?.(offhand ? 1 : 0);
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
        this.game.effects.recipeFangCutLine?.(origin, enemy.position, theme, state.cutLines);
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
      this.game.effects.recipeBackbite?.(behind, direction, theme);
      this._hitEnemiesInCone(behind, direction.clone().negate(), combat.range, combat.arc ?? 1.15,
        skillDamage(player.attackPower, combat) * combat.backbiteMult, { multiHit: true, skill: true,
          sameCastHit: { key: `fang-${state.cast.generation}:backbite`, maxHits: 1 } });
    });
  }
  if (finale && state && combat.thousandFang) {
    for (const enemy of state.targets) if (enemy.alive) this._damageEnemy(enemy,
      skillDamage(player.attackPower, combat) * combat.detonateMult, { multiHit: true, skill: true,
        sameCastHit: { key: `fang-${state.cast.generation}:detonate:${enemy.id}`, maxHits: 1 } });
    this.game.effects.recipeThousandFangFinale?.(player.position, direction, theme, state.cutLines);
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
    if(index===0){const knives=Math.min(combat.knifeCap??18,Math.max(1,Math.round(combat.knives??5)));const spread=(combat.spread??.16)*(combat.spreadMult??1);const yaw0=Math.atan2(state.facing.x,state.facing.z);this.game.effects.recipeNightPeacockAct?.(state.origin,state.facing,theme,0,Boolean(combat.nightPeacock));
      for(let i=0;i<knives;i+=1){const yaw=yaw0+(i-(knives-1)/2)*spread;const dir=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));const start=state.origin.clone().add(new THREE.Vector3(0,1.1,0)).addScaledVector(dir,.6);
        const projectile=this._spawnFriendlyOrb(start,dir,{style:'dagger',color:i%2?theme.secondary:theme.primary,damage:skillDamage(player.attackPower,combat)*(combat.damageMult??1),speed:combat.speed,radius:combat.radius??.85,life:combat.life??.62,pierce:Math.round(combat.pierce??1),knockback:combat.knockback??2.4,skill:true,trailRate:daggerTrailRate,statusOnHit:combat.status??null,ownerGuard:()=>this._ownsCast(player,state.cast),
          onHit:enemy=>{if(!state.targets.includes(enemy))state.targets.push(enemy);if(combat.pinnedMult&&(enemy.elite||enemy.boss)&&!state.pinned.has(enemy.id)){state.pinned.add(enemy.id);this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.pinnedMult,{multiHit:true,skill:true,sameCastHit:{key:`fan-${state.cast.generation}:pinned:${enemy.id}`,maxHits:1}});enemy.addStagger?.(combat.pinnedStagger??0);}
            if(combat.bounceCap&&state.bounced.size<combat.bounceCap){const next=this.game.enemies.enemies.filter(other=>other.alive&&other!==enemy&&!state.bounced.has(other.id)).sort((a,b)=>a.position.distanceToSquared(enemy.position)-b.position.distanceToSquared(enemy.position))[0];if(next){state.bounced.add(next.id);this._damageEnemy(next,skillDamage(player.attackPower,combat)*combat.bounceMult,{multiHit:true,skill:true,sameCastHit:{key:`fan-${state.cast.generation}:bounce:${next.id}`,maxHits:1}});}}},});state.outbound.push(projectile);}
    }else if(index===1){this.game.effects.recipeNightPeacockAct?.(state.origin,state.facing,theme,1,Boolean(combat.nightPeacock));if(combat.returnPass){const survivors=state.outbound.filter(projectile=>!projectile.retired&&projectile.life>0&&this.projectiles.includes(projectile)&&(!projectile.ownerGuard||projectile.ownerGuard())).map(projectile=>projectile.mesh.position.clone());for(const from of survivors){const dir=state.origin.clone().sub(from).setY(0).normalize();this._spawnFriendlyOrb(from.addScaledVector(dir,.7),dir,{style:'dagger',color:theme.secondary,damage:skillDamage(player.attackPower,combat)*combat.returnMult,speed:combat.speed,radius:.65,life:.6,pierce:1,skill:true,trailRate:daggerTrailRate,reactionDepth:1,ownerGuard:()=>this._ownsCast(player,state.cast)});}}
      for(const enemy of state.targets.slice(0,Math.min(6,combat.duplicateCap??0))){const dir=state.facing;this._spawnFriendlyOrb(enemy.position.clone().add(new THREE.Vector3(0,.8,0)).addScaledVector(dir,enemy.radius+.7),dir,{style:'dagger',color:theme.core,damage:skillDamage(player.attackPower,combat)*combat.duplicateMult,speed:15,radius:.5,life:.45,pierce:1,skill:true,trailRate:daggerTrailRate,reactionDepth:1,ownerGuard:()=>this._ownsCast(player,state.cast)});}
    }else if(index===2&&!state.finale){state.finale=true;this.game.effects.recipeNightPeacockAct?.(state.origin,state.facing,theme,2,true);const raw=skillDamage(player.attackPower,combat)*combat.finaleMult;this._hitEnemiesInRadius(state.origin,combat.finaleRadius??3.2,raw,{multiHit:true,skill:true,sameCastHit:{key:`fan-${state.cast.generation}:finale`,maxHits:1},onHit:enemy=>this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:raw,castKey:`fan-${state.cast.generation}`,budget:state.apexBudget})});}
    if(index===acts-1)this.fanStates.delete(player);};
  if(phase!=null&&phase!=='full'){const index=Number(phase);if(Number.isInteger(index))execute(index);return;}const chain=index=>{execute(index);if(index+1<acts)this._delay(.18,()=>chain(index+1));};chain(0);
},


_shadowstep(player, bundle, apexAudio = null) {
  const { combat, theme } = this._skillBundle(bundle);
  const direction = this._facingDir(player);
  const from = player.position.clone();
  const target = this._aimAlongFacing(player, combat.dash ?? 7.5);
  player.position.copy(target);
  this.game.world.resolvePosition(player.position, 0.48);
  player.invulnerable = Math.max(player.invulnerable, combat.invuln ?? 0.5);
  const to = player.position.clone();
  this.game.effects.recipeShadowDash(from, to, direction, theme);
  this._apexAudioPhase(player,apexAudio,'impact');
  // Carve every enemy near the dash segment.
  const path = TMP_B.copy(to).sub(from).setY(0);
  const pathLength = Math.max(0.001, path.length());
  const pathDir = TMP_C.copy(path).normalize();
  const halfWidth = (combat.width ?? 2.2) * 0.5;
  const raw = skillDamage(player.attackPower, combat);
  for (const enemy of this.game.enemies.enemies) {
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
  this.game.effects.recipeDualBladeCross?.(to, direction, theme.primary, theme.secondary, combat.width * 1.4);
  if (bundle.playerLevel >= 20) {
    const frenzy=player.activateShadowFrenzy?.(combat,bundle);
    if(frenzy&&!frenzy.apexAudio)frenzy.apexAudio=apexAudio;
  }
},


_deathLotus(player, bundle, phase = null, apexAudio = null) {
  const { combat, theme } = this._skillBundle(bundle);
  const legacy=bundle.playerLevel<20,acts=legacy?1:bundle.playerLevel>=100?3:2;
  const execute=index=>{let state=this.lotusStates.get(player);if(index===0){state={cast:this._beginOwnedCast(player,bundle.id),bundle,completed:new Set(),origin:player.position.clone(),targets:[],echoed:new Set(),finale:false,apexAudio,apexBudget:{targets:new Map(),casts:new Set()}};this.lotusStates.set(player,state);}
    if(!state||state.bundle!==bundle||!this._ownsCast(player,state.cast)||index<0||index>=acts||state.completed.has(index))return;state.completed.add(index);this.game.audio.swing?.(index);player.invulnerable=Math.max(player.invulnerable,combat.invuln??.6);
    if(index===0)this._apexAudioPhase(player,state.apexAudio,'impact');
    if(index===acts-1)this._apexAudioPhase(player,state.apexAudio,'finisher');
    if(index===0){const lines=legacy?Math.max(1,Math.round(combat.hits??8)):8;const radius=(combat.radius??3)*(combat.radiusMult??1);
      const landLine=i=>{if(!this._ownsCast(player,state.cast))return;const angle=i/lines*Math.PI*2,dir=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));this.game.effects.recipeMoonlessAct?.(state.origin,dir,theme,0,Boolean(combat.moonless));for(const enemy of this.game.enemies.enemies){if(!enemy.alive)continue;const offset=enemy.position.clone().sub(state.origin).setY(0),along=offset.dot(dir),lateral=offset.addScaledVector(dir,-along).length();if(along<0||along>radius||lateral>.42+enemy.radius)continue;const result=this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*(combat.damageMult??1),{multiHit:true,skill:true,status:combat.bleedEvery&&(i+1)%combat.bleedEvery===0?combat.status:null,sameCastHit:{key:`lotus-${state.cast.generation}:line-${i}:${enemy.id}`,maxHits:1}});if(result.amount>0&&!state.targets.includes(enemy))state.targets.push(enemy);}};
      if(legacy){this._delay(.14+lines*.09,()=>{if(!this._ownsCast(player,state.cast))return;this.game.effects.recipeLotusFlurry?.(state.origin,theme,combat.finaleRadius??3.9,lines,true);this._hitEnemiesInRadius(state.origin,combat.finaleRadius??3.9,skillDamage(player.attackPower,combat,'finaleMult'),{multiHit:true,skill:true,status:combat.status});});for(let i=lines-1;i>=0;i-=1)this._delay(.04+i*.07,()=>{if(this._ownsCast(player,state.cast))landLine(i);});}
      else for(let i=0;i<lines;i+=1)this._delay(.02+i*.03,()=>landLine(i));
    }else if(index===1){this.game.effects.recipeMoonlessAct?.(state.origin,this._facingDir(player),theme,1,Boolean(combat.moonless));state.targets.slice(0,Math.min(6,combat.echoCap??0)).forEach((enemy,i)=>this._delay(.1+i*.04,()=>{if(this._ownsCast(player,state.cast)&&enemy.alive)this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.echoMult,{multiHit:true,skill:true,sameCastHit:{key:`lotus-${state.cast.generation}:echo:${enemy.id}`,maxHits:1}});}));
      if(combat.executeThreshold)for(const enemy of state.targets){if(!enemy.boss&&enemy.hp/Math.max(1,enemy.maxHp)<=combat.executeThreshold)this._damageEnemy(enemy,skillDamage(player.attackPower,combat)*combat.executeMult,{multiHit:true,skill:true,sameCastHit:{key:`lotus-${state.cast.generation}:harvest:${enemy.id}`,maxHits:1}});}
      const durable=state.targets.find(enemy=>enemy.alive&&(enemy.elite||enemy.boss));if(durable&&combat.redirectCap)for(let i=0;i<Math.min(4,combat.redirectCap);i+=1)this._damageEnemy(durable,skillDamage(player.attackPower,combat)*combat.durableMult,{multiHit:true,skill:true,sameCastHit:{key:`lotus-${state.cast.generation}:redirect-${i}`,maxHits:1}});if(durable&&combat.durableStagger)durable.addStagger?.(combat.durableStagger);
    }else if(index===2&&!state.finale){state.finale=true;this.game.effects.recipeMoonlessAct?.(state.origin,this._facingDir(player),theme,2,true);const raw=skillDamage(player.attackPower,combat)*combat.moonlessFinaleMult;this._hitEnemiesInRadius(state.origin,combat.finaleRadius??3.9,raw,{multiHit:true,skill:true,sameCastHit:{key:`lotus-${state.cast.generation}:finale`,maxHits:1},onHit:enemy=>this._applyApexKeystone(player,enemy,{bundle,theme,rawDamage:raw,castKey:`lotus-${state.cast.generation}`,budget:state.apexBudget})});}
    if(index===acts-1)this.lotusStates.delete(player);};if(phase!=null&&phase!=='full'){const i=Number(phase);if(Number.isInteger(i))execute(i);return;}
  execute(0);
  if(acts>1)this._delay(.32,()=>this._delay(0,()=>{execute(1);if(acts>2)this._delay(.18,()=>this._delay(0,()=>execute(2)));}));
},

  });
}
