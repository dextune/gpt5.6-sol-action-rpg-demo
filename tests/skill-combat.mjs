/**
 * Unit tests for skill combat params, statuses, themes, and presentation identity.
 * Drives shipped modules — no reimplemented damage formulas as the sole oracle.
 */
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = [];
const ok = (cond, msg) => {
  if (!cond) fail.push(msg);
  else console.log(`  ✓ ${msg}`);
};

const content = await import(pathToFileURL(join(root, 'js/data/content.js')).href);
const {
  resolveScaled, skillCombatAtRank, skillDamage, resolveSkillHitRaw,
  applyStatus, tickStatuses, statusMoveMul, skillUsesAnimTimeline, KNIGHT_SKILL_CLIPS,
} = await import(pathToFileURL(join(root, 'js/data/skillCombat.js')).href);
const { FX_THEMES, getFxTheme, qualityParticleMul, scaleCount } = await import(
  pathToFileURL(join(root, 'js/data/fxThemes.js')).href
);

console.log('skill-combat unit tests\n');

// —— Pure helpers ——
ok(resolveScaled([1.5, 0.22], 3) === 1.5 + 0.22 * 3, 'resolveScaled pair at rank 3');
ok(resolveScaled(4.2, 2) === 4.2, 'resolveScaled plain number');
ok(qualityParticleMul('low') < qualityParticleMul('medium'), 'low quality fewer particles than medium');
ok(qualityParticleMul('high') === 1, 'high quality full particles');
ok(scaleCount(20, 'low') < 20, 'scaleCount reduces on low');
ok(getFxTheme('ember').primary === FX_THEMES.ember.primary, 'getFxTheme ember');
ok(getFxTheme('nope').id === 'windsteel', 'getFxTheme fallback windsteel');

// —— Status pure path ——
let st = applyStatus({}, 'slow', { duration: 2, power: 0.4 });
ok(st.slow?.remaining === 2, 'applyStatus slow duration');
ok(statusMoveMul(st) < 1, 'slow reduces move mul');
const tick1 = tickStatuses(st, 0.5);
ok(tick1.statuses.slow.remaining === 1.5, 'tickStatuses reduces remaining');
st = applyStatus({}, 'burn', { duration: 1.0, dps: 10, tick: 0.5 });
const burnTick = tickStatuses(st, 0.5);
ok(burnTick.dotDamage > 0, 'burn produces damage on tick');
const expired = tickStatuses(st, 5);
ok(!expired.statuses.burn && expired.expired.includes('burn'), 'burn expires');

// —— All actives have combat + presentation identity ——
const actives = Object.values(content.SKILLS).filter(s => !s.passive);
ok(actives.length === Object.keys(content.HERO_CLASSES).length * 4, 'every class contributes 4 actives');

// Every declared recipe must exist as an Effects.recipe<PascalCase> method (label-code drift guard).
const effectsSrc = await (await import('node:fs/promises')).readFile(join(root, 'js/graphics/Effects.js'), 'utf8');
for (const skill of actives) {
  const method = `recipe${skill.recipe[0].toUpperCase()}${skill.recipe.slice(1)}`;
  ok(effectsSrc.includes(`${method}(`), `${skill.id} recipe '${skill.recipe}' maps to Effects.${method}`);
}

const recipes = new Set();
const themes = new Set();
const sfx = new Set();
const patterns = new Set();

for (const skill of actives) {
  ok(Boolean(skill.combat), `${skill.id} has combat block`);
  ok(Boolean(skill.theme), `${skill.id} has theme`);
  ok(Boolean(skill.sfx), `${skill.id} has sfx`);
  ok(Boolean(skill.recipe), `${skill.id} has recipe`);
  ok(Boolean(skill.effect), `${skill.id} has effect handler id`);
  ok(Boolean(skill.anim), `${skill.id} has anim clip name`);
  recipes.add(skill.recipe);
  themes.add(skill.theme);
  sfx.add(skill.sfx);
  if (skill.combat.pattern) patterns.add(skill.combat.pattern);

  const rank = 3;
  const combat = skillCombatAtRank(skill, rank);
  ok(typeof combat.mult === 'number' || combat.mult === undefined, `${skill.id} combat resolved`);

  // rankText should mention scaled values derived from combat (consistency smoke)
  const text = skill.rankText(rank);
  ok(typeof text === 'string' && text.length > 4, `${skill.id} rankText string`);
}

// Distinct recipes for starburst vs meteor
const starburst = content.SKILLS.starburst;
const meteor = content.SKILLS.meteor_storm;
ok(starburst.recipe !== meteor.recipe, 'starburst and meteor use different recipes');
ok(starburst.theme !== meteor.theme, 'starburst and meteor use different themes');
ok(starburst.combat.pattern === 'star', 'starburst pattern star');
ok(meteor.combat.pattern === 'fallCone', 'meteor pattern fallCone');
ok(starburst.anim !== meteor.anim, 'starburst and meteor different anim clips');

// Wizard/rogue anims must not alias knight skill clips
const wizardActives = actives.filter(s => s.classId === 'wizard');
for (const skill of wizardActives) {
  ok(!KNIGHT_SKILL_CLIPS.includes(skill.anim), `wizard ${skill.id} anim is not knight alias (${skill.anim})`);
}
const rogueActives = actives.filter(s => s.classId === 'rogue');
ok(rogueActives.length === 4, 'rogue has 4 actives');
for (const skill of rogueActives) {
  ok(!KNIGHT_SKILL_CLIPS.includes(skill.anim), `rogue ${skill.id} anim is not knight alias (${skill.anim})`);
}

// Rogue identity: bleed status + crit bonuses on every active
ok(content.SKILLS.twin_fang.combat.status?.id === 'bleed', 'twin_fang applies bleed');
ok(rogueActives.every(s => (s.combat.criticalBonus ?? 0) > 0 || s.id === 'fan_of_knives'), 'rogue actives carry crit bonuses');
const bleedSt = applyStatus({}, 'bleed', { duration: 1.0, dps: 8, tick: 0.4 });
ok(tickStatuses(bleedSt, 0.4).dotDamage > 0, 'bleed produces damage on tick');

// Anim timeline on at least whirlwind
ok(skillUsesAnimTimeline(content.SKILLS.whirlwind), 'whirlwind uses anim timeline');
ok(content.SKILLS.whirlwind.timeline.hits.length >= 3, 'whirlwind has 3 hit cues');
ok(skillUsesAnimTimeline(content.SKILLS.fireball), 'fireball uses anim timeline');
ok(skillUsesAnimTimeline(content.SKILLS.frost_nova), 'frost_nova uses anim timeline');

// Frost/fire status
ok(content.SKILLS.frost_nova.combat.status?.id === 'slow', 'frost applies slow');
ok(content.SKILLS.fireball.combat.status?.id === 'burn', 'fireball applies burn');

// Damage snapshot from content combat matches helper
const ww = skillCombatAtRank(content.SKILLS.whirlwind, 2);
const wwDmg = skillDamage(100, ww);
ok(Math.abs(wwDmg - 100 * (0.46 + 2 * 0.055)) < 1e-9, 'whirlwind damage from content combat');

const fb = skillCombatAtRank(content.SKILLS.fireball, 1);
ok(Math.abs(fb.blastRadius - (2.4 + 0.12)) < 1e-9, 'fireball blastRadius rank scale');
ok(Math.abs(fb.mult - (1.55 + 0.24)) < 1e-9, 'fireball mult rank scale');

// —— Real hit-resolution path: skillPower applied exactly once ——
// Mirrors CombatSystem handlers → resolveSkillHitRaw (#damageEnemy uses this export).
const SP = 1.5;
const ATK = 100;
const rank = 2;

// Direct AoE skills: raw = skillDamage only, skill:true → multiply once in resolve
for (const id of ['whirlwind', 'skyfall', 'frost_nova', 'arcane_blink', 'meteor_storm', 'starburst']) {
  const combat = skillCombatAtRank(content.SKILLS[id], rank);
  const raw = skillDamage(ATK, combat);
  const hit = resolveSkillHitRaw(raw, { skill: true, skillPower: SP });
  const expected = raw * SP;
  ok(Math.abs(hit - expected) < 1e-9, `${id}: skillPower once (raw*SP, not raw*SP^2)`);
  const wrongDouble = resolveSkillHitRaw(raw * SP, { skill: true, skillPower: SP });
  ok(Math.abs(wrongDouble - raw * SP * SP) < 1e-9, `${id}: double-mul path would be SP^2 (anti-oracle)`);
  ok(Math.abs(hit - wrongDouble) > 1e-6, `${id}: shipped path ≠ double skillPower`);
}

// Crescent projectile path (shipped): damage NOT pre-baked; skillPowerApplied false on hit
{
  const combat = skillCombatAtRank(content.SKILLS.crescent, rank);
  const raw = skillDamage(ATK, combat); // matches #crescent spawn
  // BUG path (always skillPowerApplied:true): under-damages
  const bugPath = resolveSkillHitRaw(raw, { skill: true, skillPowerApplied: true, skillPower: SP });
  ok(Math.abs(bugPath - raw) < 1e-9, 'crescent bug-path skips skillPower (raw only)');
  // Shipped projectile hit options from #updateProjectiles when skillPowerApplied flag is false
  const hit = resolveSkillHitRaw(raw, { skill: true, skillPowerApplied: false, skillPower: SP });
  const expected = raw * SP; // 100 * (1.5+0.22*2) * 1.5 = 291
  ok(Math.abs(hit - expected) < 1e-9, `crescent projectile hit applies skillPower once (got ${hit}, expect ${expected})`);
  ok(Math.abs(hit - bugPath) > 1e-6, 'crescent shipped path ≠ under-damage bug path');
}

// Fireball projectile path: skillPower baked into damage, skillPowerApplied:true
{
  const combat = skillCombatAtRank(content.SKILLS.fireball, rank);
  const rawBaked = skillDamage(ATK, combat) * SP;
  const hit = resolveSkillHitRaw(rawBaked, { skill: true, skillPowerApplied: true, skillPower: SP });
  ok(Math.abs(hit - rawBaked) < 1e-9, 'fireball: skillPowerApplied skips second mul');
  const ifForgotFlag = resolveSkillHitRaw(rawBaked, { skill: true, skillPower: SP });
  ok(Math.abs(ifForgotFlag - rawBaked * SP) < 1e-9, 'fireball without flag would double (guard)');
  ok(Math.abs(hit - ifForgotFlag) > 1e-6, 'fireball shipped path uses skillPowerApplied');
}

// Projectile spawn option audit from CombatSystem source
{
  const combatSrc = await import('node:fs/promises').then(fs =>
    fs.readFile(join(root, 'js/systems/CombatSystem.js'), 'utf8'),
  );
  // #spawnFriendlyOrb must default skillPowerApplied from options (not hard true)
  ok(combatSrc.includes('skillPowerApplied: Boolean(options.skillPowerApplied)'),
    'spawnFriendlyOrb stores skillPowerApplied from options');
  ok(combatSrc.includes('skillPowerApplied: Boolean(projectile.skillPowerApplied)'),
    'updateProjectiles uses per-projectile skillPowerApplied');
  // crescent must NOT set skillPowerApplied: true
  const cresStart = combatSrc.indexOf('  #crescent(player');
  const cresEnd = combatSrc.indexOf('  #skyfall(player');
  const cresBody = combatSrc.slice(cresStart, cresEnd > cresStart ? cresEnd : cresStart + 2000);
  ok(cresBody.includes('skillDamage(player.attackPower, combat)'), 'crescent uses skillDamage raw');
  ok(!/skillPowerApplied:\s*true/.test(cresBody), 'crescent does not force skillPowerApplied true');
  ok(!/\*\s*player\.skillPower/.test(cresBody), 'crescent does not bake skillPower (hit path multiplies)');
  // fireball must set skillPowerApplied true when baking
  const fbStart = combatSrc.indexOf('  #fireball(player');
  const fbEnd = combatSrc.indexOf('  #frostNova(player');
  const fbBody = combatSrc.slice(fbStart, fbEnd > fbStart ? fbEnd : fbStart + 2500);
  ok(/skillPowerApplied:\s*true/.test(fbBody), 'fireball sets skillPowerApplied true with baked damage');
}

// Crit still multiplies once on top of single skillPower
{
  const combat = skillCombatAtRank(content.SKILLS.frost_nova, 1);
  const raw = skillDamage(ATK, combat);
  const crit = resolveSkillHitRaw(raw, { skill: true, skillPower: SP, critical: true });
  ok(Math.abs(crit - raw * SP * 1.85) < 1e-9, 'frost_nova crit = raw * skillPower * 1.85 once');
}

// Static audit: AoE skill methods must not bake skillPower into raw (only fireball projectile does).
const combatSrc = await import('node:fs/promises').then(fs =>
  fs.readFile(join(root, 'js/systems/CombatSystem.js'), 'utf8'),
);
function methodBody(src, name) {
  // Prefer method definition (`#name(player`) over skillHandlers arrow refs.
  const markers = [`  #${name}(player`, `  #${name}(p,`, `#${name}(player`];
  let start = -1;
  for (const m of markers) {
    start = src.indexOf(m);
    if (start >= 0) break;
  }
  if (start < 0) return '';
  const rest = src.slice(start);
  const next = rest.search(/\n  #[a-zA-Z]/);
  return next > 0 ? rest.slice(0, next) : rest.slice(0, 4000);
}
for (const name of ['frostNova', 'arcaneBlink', 'meteorStorm', 'whirlwind', 'skyfall', 'starburst', 'crescent']) {
  const body = methodBody(combatSrc, name);
  ok(body.length > 40, `found handler body #${name}`);
  ok(!/\*\s*player\.skillPower/.test(body), `#${name} does not pre-multiply player.skillPower`);
}
// Fireball intentionally bakes skillPower on orb + explode, then skillPowerApplied on hit
const fireBody = methodBody(combatSrc, 'fireball');
ok(/\*\s*player\.skillPower/.test(fireBody), 'fireball bakes skillPower into projectile damage');
ok(fireBody.includes('skillPowerApplied: true') || fireBody.includes('skillPowerApplied:true'),
  'fireball projectile path sets skillPowerApplied true');
ok(combatSrc.includes('resolveSkillHitRaw'), 'CombatSystem uses resolveSkillHitRaw');

// Game.setQuality wires effects LOD
const gameSrc = await import('node:fs/promises').then(fs =>
  fs.readFile(join(root, 'js/core/Game.js'), 'utf8'),
);
ok(/effects\?\.setQuality/.test(gameSrc) || /this\.effects\.setQuality/.test(gameSrc),
  'Game.setQuality calls effects.setQuality');

// Presentation diversity: enough unique recipes/themes
ok(recipes.size >= 6, `at least 6 distinct recipes (got ${recipes.size})`);
ok(themes.size >= 6, `at least 6 distinct themes (got ${themes.size})`);
ok(sfx.size >= 4, `at least 4 distinct sfx banks (got ${sfx.size})`);

// Class kits
ok(content.HERO_CLASSES.aerin.activeSkills.length === 4, 'aerin 4 actives');
ok(content.HERO_CLASSES.wizard.activeSkills.length === 4, 'wizard 4 actives');

// CharacterAnimationController scheduleNormalized exists
const { CharacterAnimationController } = await import(
  pathToFileURL(join(root, 'js/characters/CharacterAnimationController.js')).href
);
ok(typeof CharacterAnimationController.prototype.scheduleNormalized === 'function', 'scheduleNormalized API');

if (fail.length) {
  console.error(`\n${fail.length} failure(s):`);
  fail.forEach(m => console.error(`- ${m}`));
  process.exit(1);
}
console.log(`\nAll skill-combat checks passed (${actives.length} actives audited).`);
