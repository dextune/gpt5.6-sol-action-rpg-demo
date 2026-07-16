/**
 * Unit tests for skill combat params, statuses, themes, and presentation identity.
 * Drives shipped modules — no reimplemented damage formulas as the sole oracle.
 */
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

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
  normalizeSkillEvolutionState, normalizeSkillRank, resolveSkillForm, resolveSkillMutationChoice, skillMutationOptions,
  updateSkillMutationChoices, validateSkillEvolutionSchema,
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
ok(normalizeSkillRank({ maxRank: 5 }, 3) === 3, 'old valid saved rank is preserved');
ok(normalizeSkillRank({ maxRank: 5 }, 999) === 5, 'tampered saved rank clamps to skill maxRank');
ok(normalizeSkillRank({ maxRank: 5 }, -8) === 0, 'negative saved rank clamps to zero');
ok(normalizeSkillRank({ maxRank: 5 }, 0) === 0, 'locked active rank zero is not auto-unlocked');
ok(normalizeSkillRank({ maxRank: 5 }, 2.9) === 2, 'fractional saved rank floors to an integer');

// —— Level-100 evolution foundation ——
const evolutionFixture = {
  id: 'fixture',
  classId: 'wizard',
  effect: 'whirlwind',
  maxRank: 5,
  anim: 'base_cast',
  combat: { mult: [1, 0.1], radius: 2, status: { id: 'slow', duration: 1 } },
  presentation: { theme: 'base', particles: 8 },
  timeline: { hits: [0.4] },
  evolution: {
    forms: {
      20: { label: 'Awakened Orbit', summary: 'Expands the first impact.', combat: { radius: 3 }, presentation: { particles: 12 } },
      60: { label: 'Living Star', summary: 'Adds a compressed finisher.', combat: { mult: [1.4, 0.12] }, anim: 'advanced_cast' },
      100: { label: 'Apex Star', summary: 'Completes the stellar form.', combat: { radius: 7 }, presentation: { theme: 'apex' } },
    },
    mutations: {
      40: {
        coverage: { label: 'Wide Orbit', summary: 'Expands attack coverage.', combat: { radius: 5 }, presentation: { theme: 'wide' } },
        focus: { label: 'Solar Core', summary: 'Concentrates damage.', combat: { mult: [2, 0.2], radius: 1.5 } },
      },
      80: {
        chain: { label: 'Binary Flare', summary: 'Chains through nearby targets.', combat: { chains: 2, radius: 6 } },
        execution: { label: 'Star Collapse', summary: 'Executes a concentrated detonation.', combat: { execute: 0.2 } },
      },
    },
  },
};
ok(validateSkillEvolutionSchema(evolutionFixture).length === 0, 'valid evolution schema passes validation');
ok(skillMutationOptions(evolutionFixture, 40).length === 2
  && skillMutationOptions(evolutionFixture, 40).every(id => evolutionFixture.evolution.mutations[40][id].label),
  'mutation schema exposes two English UI labels');
const selected40 = updateSkillMutationChoices(evolutionFixture, {}, 40, 'coverage', {
  classId: 'wizard', playerLevel: 40,
});
const respecced40 = updateSkillMutationChoices(evolutionFixture, selected40, 40, 'focus', {
  classId: 'wizard', playerLevel: 80,
});
ok(selected40?.tier40 === 'coverage' && respecced40?.tier40 === 'focus',
  'valid mutation selection and explicit respec replace one tier');
ok(selected40.tier40 === 'coverage', 'mutation respec does not mutate the prior selection object');
ok(updateSkillMutationChoices(evolutionFixture, selected40, 40, 'coverage', {
  classId: 'wizard', playerLevel: 100,
}) === null, 'selecting the current mutation is a no-op');
ok(updateSkillMutationChoices(evolutionFixture, {}, 40, 'coverage', { classId: 'wizard', playerLevel: 39 }) === null,
  'locked mutation selection is rejected');
ok(updateSkillMutationChoices(evolutionFixture, {}, 40, 'coverage', { classId: 'rogue', playerLevel: 100 }) === null,
  'foreign-class mutation selection is rejected');
ok(updateSkillMutationChoices({ ...evolutionFixture, passive: true }, {}, 40, 'coverage', {
  classId: 'wizard', playerLevel: 100,
}) === null, 'passive mutation selection is rejected');
ok(updateSkillMutationChoices(evolutionFixture, {}, 40, 'unknown', {
  classId: 'wizard', playerLevel: 100,
}) === null, 'unknown mutation selection is rejected');
const invalidEvolution = {
  evolution: {
    forms: { 40: { combat: [] }, 60: 'bad' },
    mutations: { 60: {}, 80: { '': { presentation: [] }, execution: null } },
  },
};
const schemaErrors = validateSkillEvolutionSchema(invalidEvolution);
ok(schemaErrors.some(error => error.includes('unsupported form gate 40')), 'schema rejects unsupported form gate');
ok(schemaErrors.some(error => error.includes('unsupported mutation gate 60')), 'schema rejects unsupported mutation gate');
ok(schemaErrors.some(error => error.includes('must contain exactly two options')),
  'schema requires exactly two mutation options');
ok(schemaErrors.some(error => error.includes('option id must be nonempty')), 'schema rejects empty mutation option id');
ok(schemaErrors.some(error => error.includes('presentation must be an object')),
  'schema rejects malformed overlay fields');
ok(validateSkillEvolutionSchema({ evolution: { forms: { 20: { label: '', summary: 4 } } } }).length === 2,
  'schema rejects missing English form label/summary text');
const unchanged = resolveSkillForm({ combat: { mult: [1, 0.1] }, anim: 'plain' }, 2, 100);
ok(unchanged.combat.mult === 1.2 && unchanged.anim === 'plain', 'skill without evolution preserves combat');
ok(unchanged.presentation.theme === null && unchanged.presentation.recipe === null,
  'skill without presentation resolves a stable presentation contract');
ok(unchanged.activeForms.length === 0 && Object.keys(unchanged.mutations).length === 0,
  'skill without evolution has no active milestones');
const evolved = resolveSkillForm(evolutionFixture, 2, 80, { tier40: 'focus', tier80: 'invalid' });
ok(evolved.combat.mult === 1.64, 'later level-60 form wins a level-40 combat-key collision');
ok(evolved.combat.radius === 6 && evolved.combat.chains === 2,
  'later level-80 mutation wins earlier collision and invalid choice falls back');
ok(evolved.anim === 'advanced_cast' && evolved.activeForms.join(',') === '20,60', 'automatic forms apply in order');
ok(evolved.mutations.tier40 === 'focus' && evolved.mutations.tier80 === 'chain', 'resolved mutation ids exposed');
const beforeMutation = resolveSkillForm(evolutionFixture, 2, 39, {});
const atMutation = resolveSkillForm(evolutionFixture, 2, 40, {});
ok(!beforeMutation.mutations.tier40 && atMutation.mutations.tier40 === 'coverage',
  'current/next snapshots expose the effective level-40 fallback selection');
ok(Object.isFrozen(evolved) && Object.isFrozen(evolved.combat) && Object.isFrozen(evolved.timeline.hits),
  'resolved bundle is deeply immutable');
ok(resolveSkillMutationChoice(evolutionFixture, 40, 'nope') === 'coverage', 'choice helper uses stable fallback');
const apex = resolveSkillForm(evolutionFixture, 2, 100, { tier40: 'focus', tier80: 'chain' });
ok(apex.combat.radius === 7 && apex.presentation.theme === 'apex',
  'level-100 form wins level-80 collisions in chronological milestone order');
const fractionalRank = resolveSkillForm(evolutionFixture, 2.9, 1);
const oversizedRank = resolveSkillForm(evolutionFixture, 999, 1);
ok(fractionalRank.rank === 2 && fractionalRank.combat.mult === 1.2,
  'resolver floors fractional ranks before combat scaling');
ok(oversizedRank.rank === 5 && oversizedRank.combat.mult === 1.5,
  'resolver clamps oversized ranks before combat scaling');
const normalizedEvolution = normalizeSkillEvolutionState(
  { fixture: { tier40: 'focus', tier80: 'nope' }, foreign: { tier40: 'x' } },
  { fixture: evolutionFixture, foreign: evolutionFixture },
  ['fixture'],
);
ok(normalizedEvolution.fixture.tier40 === 'focus' && normalizedEvolution.fixture.tier80 === 'chain',
  'save choices normalize valid and invalid ids');
ok(!normalizedEvolution.foreign, 'save choices exclude skills outside class scope');
ok(Object.keys(normalizeSkillEvolutionState(null, { plain: { combat: {} } })).length === 0,
  'missing old-save evolution data defaults safely');
ok(Object.keys(normalizeSkillEvolutionState(null, { fixture: evolutionFixture })).length === 0,
  'missing old-save data does not synthesize choices for evolved skills');
const partialEvolution = normalizeSkillEvolutionState(
  { fixture: { tier40: 'focus' } },
  { fixture: evolutionFixture },
);
ok(partialEvolution.fixture.tier40 === 'focus' && !Object.hasOwn(partialEvolution.fixture, 'tier80'),
  'save normalization keeps only explicitly persisted mutation tiers');
const playerSrc = await (await import('node:fs/promises')).readFile(join(root, 'js/entities/Player.js'), 'utf8');
ok((playerSrc.match(/normalizeSkillEvolutionState\(/g) ?? []).length >= 2,
  'Player normalizes evolution choices on load and serialize');
ok(playerSrc.includes('this.skillEvolution = {};'), 'Player reset supplies old-save evolution default');
ok(playerSrc.includes('normalizeSkillRank(SKILLS[id], incoming[id])'),
  'Player load normalizes persisted ranks against each skill definition');
const { Player } = await import(pathToFileURL(join(root, 'js/entities/Player.js')).href);
const previousWhirlwindEvolution = content.SKILLS.whirlwind.evolution;
content.SKILLS.whirlwind.evolution = evolutionFixture.evolution;
const mutationPlayer = { classId: 'aerin', level: 80, skillEvolution: {} };
ok(Player.prototype.setSkillMutation.call(mutationPlayer, 'whirlwind', 40, 'coverage'),
  'Player.setSkillMutation accepts a valid owned unlocked choice');
ok(Player.prototype.setSkillMutation.call(mutationPlayer, 'whirlwind', 80, 'chain'),
  'Player.setSkillMutation can select the second tier');
ok(Player.prototype.setSkillMutation.call(mutationPlayer, 'whirlwind', 40, 'focus')
  && mutationPlayer.skillEvolution.whirlwind.tier40 === 'focus'
  && mutationPlayer.skillEvolution.whirlwind.tier80 === 'chain',
  'Player.setSkillMutation respec preserves the other tier');
ok(!Player.prototype.setSkillMutation.call(mutationPlayer, 'whirlwind', 40, 'focus'),
  'Player.setSkillMutation returns false for the selected no-op');
mutationPlayer.level = 39;
ok(!Player.prototype.setSkillMutation.call(mutationPlayer, 'whirlwind', 40, 'coverage'),
  'Player.setSkillMutation rejects a locked choice');
mutationPlayer.level = 100;
mutationPlayer.classId = 'rogue';
ok(!Player.prototype.setSkillMutation.call(mutationPlayer, 'whirlwind', 40, 'coverage'),
  'Player.setSkillMutation rejects a foreign skill');
mutationPlayer.classId = 'aerin';
ok(!Player.prototype.setSkillMutation.call(mutationPlayer, 'whirlwind', 40, 'unknown'),
  'Player.setSkillMutation rejects an unknown choice');
if (previousWhirlwindEvolution === undefined) delete content.SKILLS.whirlwind.evolution;
else content.SKILLS.whirlwind.evolution = previousWhirlwindEvolution;
const oldSaveSnapshot = Player.prototype.serialize.call({
  classId: 'aerin', name: 'Old Save', level: 9, xp: 0, gold: 0, essence: 0,
  skillPoints: 0, skills: {}, skillEvolution: null, inventory: [], equipped: {},
  potions: 0, maxPotions: 5, hp: 1, mp: 0, energy: 0, position: { x: 0, y: 0, z: 6 },
});
ok(Object.keys(oldSaveSnapshot.skillEvolution).length === 0,
  'serializing an old player snapshot does not synthesize mutation choices');
const trySkillBody = playerSrc.slice(playerSrc.indexOf('  trySkill('), playerSrc.indexOf('  usePotion('));
ok((trySkillBody.match(/resolveSkillForm\(/g) ?? []).length === 1,
  'Player.trySkill resolves exactly one skill snapshot at cast start');
ok(trySkillBody.includes('usePlayerSkill(bundle, this, phase)')
  && trySkillBody.includes('usePlayerSkill(bundle, this, null)'),
  'scheduled and immediate cast paths pass the same snapshot');
ok(trySkillBody.includes('bundle.timeline?.hits') && trySkillBody.includes('bundle.presentation.sfx'),
  'cast animation timeline and sfx consume the resolved snapshot');
ok(trySkillBody.includes('hits[i] * cadence') && trySkillBody.includes('bundle.combat?.cadenceMult'),
  'animation-normalized skill phases apply the resolved cadence multiplier exactly once');
ok(playerSrc.includes('setSkillMutation(skillId, milestone, choiceId)')
  && playerSrc.includes('skill.classId !== this.classId || this.level < gate'),
  'Player mutation setter guards class ownership and locked milestones');
const uiSrc = await (await import('node:fs/promises')).readFile(join(root, 'js/ui/UI.js'), 'utf8');
ok(uiSrc.includes('data-action="select-mutation"') && uiSrc.includes('this.game.requestSave()')
  && uiSrc.includes('this.#renderSkills()'), 'delegated mutation action persists and rerenders');
ok(uiSrc.includes('const nextBundle = nextGate ? resolveSkillForm'),
  'skill cards resolve exact current and next milestone snapshots');
ok(uiSrc.includes('formatCombatSnapshot(bundle.combat)') && uiSrc.includes('formatCombatDeltas(bundle.combat, nextBundle.combat)'),
  'skill cards render resolved current values and visible next deltas');
ok(uiSrc.includes('aria-pressed="${selected === optionId') && uiSrc.includes('selectedOption.label'),
  'mutation controls expose effective selection and option labels accessibly');
const gameSource = await (await import('node:fs/promises')).readFile(join(root, 'js/core/Game.js'), 'utf8');
ok(gameSource.includes("this.debugEnabled = this.query.get('debug') === '1'")
  && gameSource.includes('if (!this.debugEnabled || !this.player) return false'),
  'skill debug commands are strictly gated behind query debug=1');

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
ok(actives.every(skill => skill.maxRank === 10), 'all 16 active skills support rank 10');
for (const [classId, hero] of Object.entries(content.HERO_CLASSES)) {
  const passiveRanks = hero.passiveSkills.map(id => content.SKILLS[id].maxRank);
  ok(passiveRanks.join(',') === '10,10,10,10,5', `${classId} passive rank caps unchanged`);
}

function makeAutoSpendPlayer(skillPoints) {
  const skills = content.createEmptySkillRanks('aerin');
  for (const id of content.HERO_CLASSES.aerin.activeSkills) skills[id] = 1;
  return {
    classId: 'aerin', level: 100, skillPoints, skills, hp: 100, maxHp: 100,
    skillRank: Player.prototype.skillRank,
    upgradeSkill: Player.prototype.upgradeSkill,
    autoSpendSkillPoints: Player.prototype.autoSpendSkillPoints,
    invalidateStats() {},
  };
}
const fairSpendPlayer = makeAutoSpendPlayer(17);
const fairSpent = fairSpendPlayer.autoSpendSkillPoints();
const fairRanks = content.HERO_CLASSES.aerin.activeSkills.map(id => fairSpendPlayer.skills[id]);
ok(fairSpent === 17 && Math.max(...fairRanks) - Math.min(...fairRanks) <= 1,
  'auto-spend balances unlocked Q/E/R/C ranks within one');
ok(fairRanks[0] >= fairRanks[1], 'auto-spend ties break by deterministic unlock/key order');
const backlogPlayer = makeAutoSpendPlayer(1000);
const backlogSpent = backlogPlayer.autoSpendSkillPoints();
const backlogCapacity = content.HERO_CLASSES.aerin.activeSkills.length * 9 + 45;
ok(backlogSpent === backlogCapacity && backlogPlayer.skillPoints === 1000 - backlogCapacity,
  'large backlog spends the full unlocked capacity and terminates');
ok(content.getClassSkillIds('aerin').every(id => backlogPlayer.skills[id] === content.SKILLS[id].maxRank),
  'large backlog settles every unlocked skill at its cap');

const gameCss = await (await import('node:fs/promises')).readFile(join(root, 'css/game.css'), 'utf8');
ok(/\.rank-pips[^}]*grid-template-columns:\s*repeat\(5/.test(gameCss),
  'rank pips use a compact two-row grid for ten ranks');

// —— Knight Iron Judgment vertical slice ——
const judgment = content.SKILLS.skyfall;
ok(judgment.name === 'Iron Judgment' && judgment.id === 'skyfall' && judgment.key === 'R',
  'Iron Judgment preserves the Skyfall id/effect/key contract');
ok(validateSkillEvolutionSchema(judgment).length === 0, 'Iron Judgment evolution schema is valid');
const judgmentLegacy = resolveSkillForm(judgment, 5, 19, {});
const judgment20 = resolveSkillForm(judgment, 5, 20, {});
const judgmentMeteor = resolveSkillForm(judgment, 5, 40, { tier40: 'meteor_hammer' });
const judgmentEarth = resolveSkillForm(judgment, 5, 80, { tier40: 'iron_vortex', tier80: 'earthbreaker' });
const judgmentApex = resolveSkillForm(judgment, 5, 100, { tier40: 'iron_vortex', tier80: 'kings_command' });
const judgmentEarthApex = resolveSkillForm(judgment, 5, 100, { tier40: 'iron_vortex', tier80: 'earthbreaker' });
const judgmentMeteorApex = resolveSkillForm(judgment, 5, 100, { tier40: 'meteor_hammer', tier80: 'kings_command' });
ok(judgmentLegacy.activeForms.length === 0 && !judgmentLegacy.timeline.hits,
  'Iron Judgment below level 20 keeps legacy single-impact behavior');
ok(judgment20.activeForms.join(',') === '20' && judgment20.timeline.hits.length === 2,
  'Iron Judgment level 20 unlocks plant and slam phases');
ok(judgment20.mutations.tier40 === undefined && judgmentMeteor.mutations.tier40 === 'meteor_hammer',
  'Iron Judgment level 40 branch gate and explicit choice resolve');
ok(judgmentMeteor.combat.mult > judgment20.combat.mult && judgmentMeteor.combat.pullRadius < judgment20.combat.pullRadius,
  'Meteor Hammer trades pull coverage for slam damage');
ok(judgmentEarth.combat.bossStagger > judgment20.combat.bossStagger && judgmentEarth.combat.armorPierce > judgment20.combat.armorPierce,
  'Earthbreaker increases boss stagger and armor pierce');
ok(judgmentApex.combat.judgmentApex === 1 && judgmentApex.combat.stunNormal === 2.4,
  'level 100 Judgment unlocks Apex decoration and capped normal stun');
ok(judgmentEarthApex.combat.bossStagger === judgmentEarth.combat.bossStagger
  && judgmentEarthApex.combat.apexStaggerBonus > 0,
  'level 100 Judgment adds Apex boss pressure without erasing the Lv80 branch');
ok(judgmentApex.combat.pullRadius > judgmentMeteorApex.combat.pullRadius
  && judgmentMeteorApex.combat.mult > judgmentApex.combat.mult
  && judgmentApex.combat.apexPullBonus === judgmentMeteorApex.combat.apexPullBonus,
  'level 100 Judgment preserves wide-vortex versus tight-damage Lv40 identity');

const THREE = await import('three');
const { Enemy, ENEMY_CONTROL_LIMITS } = await import(pathToFileURL(join(root, 'js/entities/Enemy.js')).href);
const primeEnemy = { alive: true, spellPrime: null };
Enemy.prototype.setSpellPrime.call(primeEnemy, 'burn', { depth: 0, castId: 'a' });
Enemy.prototype.setSpellPrime.call(primeEnemy, 'crystal', { depth: 0, castId: 'b' });
const consumedPrime = Enemy.prototype.consumeSpellPrime.call(primeEnemy, 'crystal');
ok(consumedPrime?.id === 'crystal' && primeEnemy.spellPrime === null
  && Enemy.prototype.consumeSpellPrime.call(primeEnemy) === null,
  'Enemy stores one spell prime and consumes it exactly once');
Enemy.prototype.setSpellPrime.call(primeEnemy, 'burn', { remaining: .2 });
Enemy.prototype.tickSpellPrime.call(primeEnemy, .21);
ok(primeEnemy.spellPrime === null, 'spell prime expires on its bounded remaining timer');
Enemy.prototype.setSpellPrime.call(primeEnemy, 'rift_anchor', { remaining: 4 });
Enemy.prototype.clearSpellPrime.call(primeEnemy);
ok(primeEnemy.spellPrime === null, 'spell prime death/cleanup path removes pending authority');
const controlFake = category => ({
  alive: true, controlCategory: category, stunTimer: 0, stagger: 0, breakTimer: 0,
  state: 'idle', stateTimer: 0, velocity: new THREE.Vector3(), radius: category === 'boss' ? 1.25 : 0.6,
  position: new THREE.Vector3(10, 0, 0), animation: null,
});
const normalControl = controlFake('normal');
const eliteControl = controlFake('elite');
const bossControl = controlFake('boss');
ok(Enemy.prototype.applyStun.call(normalControl, 99) === ENEMY_CONTROL_LIMITS.normal.stun,
  'normal stun clamps to category cap');
ok(Enemy.prototype.applyStun.call(eliteControl, 99) === ENEMY_CONTROL_LIMITS.elite.stun,
  'elite stun clamps to category cap');
ok(Enemy.prototype.applyStun.call(bossControl, 99) === 0 && bossControl.stunTimer === 0,
  'boss converts hard control away from stun');
ok(!Enemy.prototype.addStagger.call(bossControl, 60).broken
  && Enemy.prototype.addStagger.call(bossControl, 40).broken
  && bossControl.breakTimer === ENEMY_CONTROL_LIMITS.boss.break,
  'boss stagger reaches a capped break state');
let worldResolved = 0;
const pulled = Enemy.prototype.pullToward.call(normalControl, new THREE.Vector3(), 1.5, 1, {
  resolvePosition() { worldResolved += 1; },
});
ok(pulled === ENEMY_CONTROL_LIMITS.normal.pull && normalControl.position.length() >= 1.5 + normalControl.radius,
  'pull respects displacement cap and player safe ring');
const resolvesBeforeBoss = worldResolved;
const bossPulled = Enemy.prototype.pullToward.call(bossControl, new THREE.Vector3(), 1.5, 1, null);
ok(bossPulled === 0 && bossControl.position.equals(new THREE.Vector3(10, 0, 0))
  && ENEMY_CONTROL_LIMITS.boss.pull === 0 && worldResolved === resolvesBeforeBoss,
  'boss pull has zero authoritative displacement');
const coincidentControl = controlFake('normal');
coincidentControl.position.set(5, 0, 0);
const coincidentBlocker = { alive: true, radius: 0.7, position: new THREE.Vector3(4.42, 0, 0) };
Enemy.prototype.pullToward.call(coincidentControl, new THREE.Vector3(), 1.5, 0.2, null, [coincidentBlocker]);
ok(coincidentControl.position.distanceTo(coincidentBlocker.position)
  >= coincidentControl.radius + coincidentBlocker.radius + 0.049,
  'pull separates exact-coincident enemy collision circles deterministically');
const inwardControl = controlFake('normal');
inwardControl.position.set(5, 0, 0);
const inwardOrigin = inwardControl.position.clone();
const inwardBlocker = { alive: true, radius: 0.7, position: new THREE.Vector3(0, 0, 2.1) };
const colliderCenter = new THREE.Vector3(3, 0, 0);
const actualPull = Enemy.prototype.pullToward.call(inwardControl, new THREE.Vector3(), 1.5, 1, {
  resolvePosition(position, radius) {
    const dx = position.x - colliderCenter.x;
    const dz = position.z - colliderCenter.z;
    const distance = Math.hypot(dx, dz);
    const minimum = 1 + radius;
    if (distance >= minimum) return;
    const nx = distance > 1e-5 ? dx / distance : -1;
    const nz = distance > 1e-5 ? dz / distance : 0;
    position.x = colliderCenter.x + nx * minimum;
    position.z = colliderCenter.z + nz * minimum;
  },
}, [inwardBlocker]);
ok(inwardControl.position.length() >= 2.1 - 1e-5
  && inwardControl.position.distanceTo(colliderCenter) >= 1.6 - 1e-5
  && inwardControl.position.distanceTo(inwardBlocker.position)
    >= inwardControl.radius + inwardBlocker.radius + 0.049
  && Math.abs(actualPull - inwardControl.position.distanceTo(inwardOrigin)) < 1e-5,
  'pull feasible search simultaneously preserves safe ring, persistent collider, blockers, and actual displacement');

// Every declared recipe must exist as an Effects.recipe<PascalCase> method (label-code drift guard).
const effectsSrc = await (await import('node:fs/promises')).readFile(join(root, 'js/graphics/Effects.js'), 'utf8');
const characterFactorySrc = await (await import('node:fs/promises')).readFile(join(root, 'js/characters/CharacterFactory.js'), 'utf8');
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
  const bundle = resolveSkillForm(skill, rank, 1, {});
  ok(isDeepStrictEqual(bundle.combat, combat), `${skill.id} pre-evolution formula unchanged`);
  ok(bundle.effect === skill.effect && bundle.mp === skill.mp && bundle.cooldown === skill.cooldown,
    `${skill.id} runtime cast fields preserved`);
  const rank10 = skillCombatAtRank(skill, 10);
  ok(Object.values(rank10).every(value => typeof value !== 'number' || Number.isFinite(value)),
    `${skill.id} rank 10 combat values finite`);
  ok(typeof skill.rankText(10) === 'string' && skill.rankText(10).length > 4,
    `${skill.id} rank 10 text valid`);

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
ok(effectsSrc.includes('recipeVortexPull(') && effectsSrc.includes('recipeBossPullResist(')
  && effectsSrc.includes('recipeGroundFracture(')
  && effectsSrc.includes('recipeJudgmentApex('), 'Iron Judgment pooled effect recipes exist');
ok(!effectsSrc.slice(effectsSrc.indexOf('recipeVortexPull('), effectsSrc.indexOf('recipeStarBlade(')).includes('PointLight'),
  'Iron Judgment recipes add no dynamic lights');
ok(effectsSrc.includes('recipeDualBladeCross(') && effectsSrc.includes('recipeShadowCuts(')
  && effectsSrc.includes('recipeFrenzyExit('), 'Shadow Frenzy pooled dual-blade recipes exist');
ok(characterFactorySrc.includes("getObjectByName('left_hand')")
  && characterFactorySrc.includes("refs.classId === 'rogue'")
  && characterFactorySrc.includes("kind === 'dagger' || kind === 'saber'"),
  'rogue runtime offhand socket and paired blade kinds are explicit');

const { CharacterFactory } = await import(pathToFileURL(join(root, 'js/characters/CharacterFactory.js')).href);
const weaponQualities = [];
let weaponReleases = 0;
const weaponClone = (kind, options = {}) => {
  weaponQualities.push(options.quality);
  const scene = new THREE.Group();
  scene.name = kind;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(.1, 1, .1), new THREE.MeshStandardMaterial({ name: 'metal' }));
  mesh.name = 'blade_mesh';
  const base = new THREE.Group(); base.name = 'blade_base';
  const tip = new THREE.Group(); tip.name = 'blade_tip';
  scene.add(mesh, base, tip);
  return { scene, animations: [], fallback: false, release: () => { weaponReleases += 1; } };
};
const outlineCalls = { configured: [], unregistered: [] };
const visualFactory = new CharacterFactory(
  { cloneModel: (key, options) => weaponClone(key, options) },
  { configure: object => outlineCalls.configured.push(object), unregister: object => outlineCalls.unregistered.push(object) },
);
const visualRefs = { socket: new THREE.Group(), offhandSocket: new THREE.Group(), classId: 'rogue', quality: 'low' };
visualFactory.equipWeapon(visualRefs, { model: 'dagger', rarityColor: 0x99ddcc });
const firstMain = visualRefs.weapon;
const firstOffhand = visualRefs.offhandWeapon;
let runtimeMaterialDisposes = 0;
let sharedGeometryDisposes = 0;
const watchOwnedResources = (...roots) => {
  for (const root of roots) root.traverse(object => {
    if (!object.isMesh) return;
    object.material.addEventListener('dispose', () => { runtimeMaterialDisposes += 1; });
    object.geometry.addEventListener('dispose', () => { sharedGeometryDisposes += 1; });
  });
};
watchOwnedResources(firstMain, firstOffhand);
ok(firstMain?.parent === visualRefs.socket && firstOffhand?.parent === visualRefs.offhandSocket
  && visualRefs.mainBladeTip && visualRefs.offhandBladeTip,
  'rogue equip exposes mounted main/offhand blade references');
visualFactory.equipWeapon(visualRefs, { model: 'saber', rarityColor: 0xcc99ff });
ok(!firstMain.parent && !firstOffhand.parent && outlineCalls.unregistered.includes(firstMain)
  && outlineCalls.unregistered.includes(firstOffhand) && weaponReleases === 2
  && runtimeMaterialDisposes === 2 && sharedGeometryDisposes === 0,
  'rogue re-equip releases handles and owned materials without disposing shared geometry');
const secondMain = visualRefs.weapon;
const secondOffhand = visualRefs.offhandWeapon;
watchOwnedResources(secondMain, secondOffhand);
visualFactory.clearWeapons(visualRefs);
visualFactory.clearWeapons(visualRefs);
ok(!secondMain.parent && !secondOffhand.parent && !visualRefs.weapon && !visualRefs.offhandWeapon
  && weaponReleases === 4 && runtimeMaterialDisposes === 4 && sharedGeometryDisposes === 0
  && weaponQualities.every(quality => quality === 'low') && visualRefs.weaponQuality === 'low',
  'rogue idempotent cleanup disposes each owned material and releases each clone exactly once');
ok(!characterFactorySrc.includes("quality: 'high'") && !characterFactorySrc.includes('disposeObject(instance)'),
  'weapon clones inherit quality and never dispose cache-shared geometry directly');

// Wizard/rogue anims must not alias knight skill clips
const wizardActives = actives.filter(s => s.classId === 'wizard');
for (const skill of wizardActives) {
  ok(!KNIGHT_SKILL_CLIPS.includes(skill.anim), `wizard ${skill.id} anim is not knight alias (${skill.anim})`);
  ok(validateSkillEvolutionSchema(skill).length === 0, `wizard ${skill.id} evolution schema is valid`);
}
const wizardApex = Object.fromEntries(wizardActives.map(skill => [skill.id, resolveSkillForm(skill, 10, 100, {})]));
ok(wizardApex.fireball.combat.cinders <= 3 && wizardApex.fireball.combat.vortexTicks === 3,
  'Living Star cinders and vortex ticks respect hard caps');
ok(wizardApex.frost_nova.combat.lancePerEnemyCap === 2, 'Crystal Dominion lances cap per enemy at two');
ok(wizardApex.arcane_blink.combat.anchors === 6, 'Space Rend anchors cap at six');
ok(wizardApex.meteor_storm.combat.impactsCap === 10
  && wizardApex.meteor_storm.combat.gravityReactionCap === 3,
  'Astral Cataclysm impacts and gravity reactions respect hard caps');
const rangerActives = actives.filter(skill => skill.classId === 'ranger');
for (const skill of rangerActives) ok(validateSkillEvolutionSchema(skill).length === 0,
  `ranger ${skill.id} evolution schema is valid`);
const rangerApex = Object.fromEntries(rangerActives.map(skill => [skill.id, resolveSkillForm(skill, 10, 100, {})]));
ok(rangerApex.piercing_shot.combat.splinterCap === 12
  && rangerApex.piercing_shot.combat.storedPierceCap === 6
  && rangerApex.piercing_shot.combat.rupturePerEnemyCap === 2,
  'Horizon Breaker fishbone, stored points, and ruptures are bounded');
const mineGardenApex = resolveSkillForm(content.SKILLS.caltrop_trap, 10, 100, { tier40: 'blast_seed', tier80: 'mine_garden' });
ok(rangerApex.caltrop_trap.combat.plantedCap === 4
  && mineGardenApex.combat.mineCap === 3,
  'Thornburst planted arrows and mines are bounded');
ok(rangerApex.vault_shot.combat.arrowCap === 12 && rangerApex.vault_shot.combat.volleyLayers === 3,
  'Sky Hunter arrows and staged layers are bounded');
ok(rangerApex.hunter_mark.combat.verdictChains === 2,
  'Predator Verdict chain depth is capped at two targets');
const rogueActives = actives.filter(s => s.classId === 'rogue');
ok(rogueActives.length === 4, 'rogue has 4 actives');
for (const skill of rogueActives) {
  ok(!KNIGHT_SKILL_CLIPS.includes(skill.anim), `rogue ${skill.id} anim is not knight alias (${skill.anim})`);
}
const whirlwindEvolution = content.SKILLS.whirlwind;
ok(validateSkillEvolutionSchema(whirlwindEvolution).length === 0, 'Whirlwind evolution schema is valid');
ok(resolveSkillForm(whirlwindEvolution, 10, 19, {}).combat.hits === 3
  && resolveSkillForm(whirlwindEvolution, 10, 20, {}).combat.hits === 5
  && resolveSkillForm(whirlwindEvolution, 10, 100, {}).combat.hits === 6,
  'Whirlwind preserves below-20 contacts and resolves Crosswind/Sovereign counts');
const cycloneWhirl = resolveSkillForm(whirlwindEvolution, 10, 80, { tier40: 'cyclone', tier80: 'storm_cage' });
const bloodWhirl = resolveSkillForm(whirlwindEvolution, 10, 80, { tier40: 'blood_wheel', tier80: 'giant_slayer' });
ok(cycloneWhirl.combat.inwardDrag > 0 && cycloneWhirl.combat.dragCap === 5
  && bloodWhirl.combat.hits === 6 && bloodWhirl.combat.durableMult > 1,
  'Whirlwind Lv40/Lv80 branches resolve distinct bounded geometry');
const twinEvolution = content.SKILLS.twin_fang;
ok(validateSkillEvolutionSchema(twinEvolution).length === 0, 'Twin Fang evolution schema is valid');
ok(resolveSkillForm(twinEvolution, 10, 19, {}).combat.hits === 2
  && resolveSkillForm(twinEvolution, 10, 20, {}).combat.hits === 3
  && resolveSkillForm(twinEvolution, 10, 100, {}).combat.hits === 8,
  'Twin Fang preserves two contacts then resolves Cross Fang and Thousand Fang counts');
const frenzySkill = content.SKILLS.shadowstep;
ok(frenzySkill.name === 'Shadow Frenzy' && frenzySkill.id === 'shadowstep'
  && frenzySkill.effect === 'shadowstep' && frenzySkill.key === 'R',
  'Shadow Frenzy preserves the Shadowstep runtime contract');
ok(validateSkillEvolutionSchema(frenzySkill).length === 0, 'Shadow Frenzy evolution schema is valid');
const frenzy20 = resolveSkillForm(frenzySkill, 5, 20, {});
const frenzyGhost = resolveSkillForm(frenzySkill, 5, 40, { tier40: 'ghost_rush' });
const frenzyRed = resolveSkillForm(frenzySkill, 5, 40, { tier40: 'red_tempo' });
const frenzyPredator = resolveSkillForm(frenzySkill, 5, 80, { tier40: 'ghost_rush', tier80: 'predator_flow' });
const frenzyBoss = resolveSkillForm(frenzySkill, 5, 80, { tier40: 'red_tempo', tier80: 'boss_killer' });
const frenzyApex = resolveSkillForm(frenzySkill, 5, 100, { tier40: 'red_tempo', tier80: 'boss_killer' });
ok(frenzy20.combat.frenzyDuration === 4 && frenzy20.combat.offhandEcho > 0,
  'Shadow Frenzy level 20 enables bounded haste and one offhand echo');
ok(frenzyGhost.combat.frenzyMoveHaste > frenzyRed.combat.frenzyMoveHaste
  && frenzyRed.combat.frenzyAttackHaste > frenzyGhost.combat.frenzyAttackHaste,
  'Shadow Frenzy level 40 branches preserve movement versus attack identity');
ok(frenzyPredator.combat.chainCap === 2 && frenzyBoss.combat.bossRampCap === 5,
  'Shadow Frenzy level 80 chain and boss ramps are capped');
ok(frenzyApex.combat.frenzyDuration === 5 && frenzyApex.combat.contactCap === 12
  && frenzyApex.combat.exitMult > 0,
  'Shadow Frenzy Apex has capped contacts and five-second exit detonation');

const frenzyState = { alive: true };
Player.prototype.clearShadowFrenzy.call(frenzyState);
Player.prototype.activateShadowFrenzy.call(frenzyState, frenzyApex.combat);
Object.defineProperty(frenzyState, 'frenzyActive', {
  configurable: true, get() { return this.shadowFrenzy.active && this.shadowFrenzy.remaining > 0; },
});
for (let i = 0; i < 30; i += 1) Player.prototype.registerFrenzyContact.call(frenzyState, { boss: true, id: 'boss-a' });
let extended = 0;
for (let i = 0; i < 8; i += 1) extended += Player.prototype.extendShadowFrenzyOnKill.call(frenzyState);
ok(frenzyState.shadowFrenzy.contactCount === 12 && frenzyState.shadowFrenzy.bossStacks === 5,
  'Shadow Frenzy contact and single-target boss stacks cannot exceed caps');
ok(extended === 2 && frenzyState.shadowFrenzy.extensionUsed === 2,
  'Shadow Frenzy kill extension cannot exceed two seconds');
const activeGeneration = frenzyState.shadowFrenzy.generation;
const activeSnapshot = { ...frenzyState.shadowFrenzy };
const recastState = Player.prototype.activateShadowFrenzy.call(frenzyState, frenzyGhost.combat);
ok(recastState === frenzyState.shadowFrenzy && recastState.generation === activeGeneration
  && recastState.remaining === activeSnapshot.remaining
  && recastState.extensionUsed === activeSnapshot.extensionUsed
  && recastState.contactCount === activeSnapshot.contactCount
  && recastState.bossStacks === activeSnapshot.bossStacks,
  'active Shadow Frenzy recast cannot refresh or replace its current generation');
Player.prototype.clearShadowFrenzy.call(frenzyState);
ok(!frenzyState.shadowFrenzy.active && frenzyState.shadowFrenzy.remaining === 0,
  'Shadow Frenzy transient state clears on reset/death path');
ok(!playerSrc.slice(playerSrc.indexOf('serialize()'), playerSrc.indexOf('load(state')).includes('shadowFrenzy'),
  'Shadow Frenzy transient state is excluded from save serialization');
ok(!playerSrc.slice(playerSrc.indexOf('serialize()'), playerSrc.indexOf('load(state')).includes('predatorVerdict')
  && !playerSrc.slice(playerSrc.indexOf('serialize()'), playerSrc.indexOf('load(state')).includes('thornField'),
  'Ranger field and verdict transient authority are excluded from save serialization');
const playerAnimationStub = {
  play() {}, playOneShot() {}, setLocomotion() {}, update() {}, dispose() {}, has: () => true,
};
const playerFactoryStub = {
  outlines: { unregister() {} },
  createHero({ classId }) {
    const group = new THREE.Group();
    return { group, classId, refs: { group, classId, modelHeight: 3 }, animation: playerAnimationStub };
  },
  equipWeapon() {}, clearWeapons() {},
};
const timedFrenzyPlayer = new Player(new THREE.Scene(), playerFactoryStub, 'medium', 'rogue');
let exitCalls = 0;
timedFrenzyPlayer.activateShadowFrenzy({ frenzyDuration: 0.01, contactCap: 12, exitMult: 0.1 });
timedFrenzyPlayer.update(0.02, {
  world: { resolvePosition() {} }, combat: { endShadowFrenzy() { exitCalls += 1; } },
});
ok(!timedFrenzyPlayer.frenzyActive && exitCalls === 1,
  'Shadow Frenzy timer expires once and dispatches one terminal exit');
timedFrenzyPlayer.activateShadowFrenzy({ frenzyDuration: 4, frenzyAttackHaste: 0.4 });
timedFrenzyPlayer.invulnerable = 0;
timedFrenzyPlayer.hp = 1;
timedFrenzyPlayer.takeDamage(9999);
ok(!timedFrenzyPlayer.alive && !timedFrenzyPlayer.frenzyActive,
  'Shadow Frenzy clears immediately on player death without a terminal refresh');
timedFrenzyPlayer.dispose();
let lifecycleClears = 0;
let lifecycleEquips = 0;
const lifecycleFactoryStub = {
  outlines: { unregister() {} },
  createHero({ classId, quality }) {
    const group = new THREE.Group();
    return { group, classId, refs: { group, classId, quality, modelHeight: 3 }, animation: playerAnimationStub };
  },
  equipWeapon() { lifecycleEquips += 1; },
  clearWeapons() { lifecycleClears += 1; },
};
const lifecycleVisualPlayer = new Player(new THREE.Scene(), lifecycleFactoryStub, 'low', 'rogue');
const lifecycleSave = lifecycleVisualPlayer.serialize();
lifecycleVisualPlayer.load(lifecycleSave, { resolvePosition() {} });
lifecycleVisualPlayer.setClass('aerin', { keepTransform: true });
lifecycleVisualPlayer.setClass('rogue', { keepTransform: true });
lifecycleVisualPlayer.dispose();
ok(lifecycleClears === 3 && lifecycleEquips >= 5,
  'Player load/class/dismount lifecycle remounts visuals and clears each departed character once');

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
  const combatSrc = await import('node:fs/promises').then(async fs => {
    const parts = await Promise.all([
      fs.readFile(join(root, 'js/systems/CombatSystem.js'), 'utf8'),
      fs.readFile(join(root, 'js/systems/combat/activeSkillMethods.js'), 'utf8'),
      fs.readFile(join(root, 'js/systems/combat/energyBurstMethods.js'), 'utf8'),
      fs.readFile(join(root, 'js/systems/combat/createSkillHandlers.js'), 'utf8'),
    ]);
    return parts.join('\n');
  });
  // spawnFriendlyOrb must default skillPowerApplied from options (not hard true)
  ok(combatSrc.includes('skillPowerApplied: Boolean(options.skillPowerApplied)'),
    'spawnFriendlyOrb stores skillPowerApplied from options');
  ok(combatSrc.includes('skillPowerApplied: Boolean(projectile.skillPowerApplied)'),
    'updateProjectiles uses per-projectile skillPowerApplied');
  // crescent must NOT set skillPowerApplied: true
  const cresStart = combatSrc.search(/_crescent\s*\(\s*player/);
  const cresEnd = combatSrc.search(/_skyfall\s*\(\s*player/);
  const cresBody = combatSrc.slice(cresStart, cresEnd > cresStart ? cresEnd : cresStart + 2000);
  ok(cresBody.includes('skillDamage(player.attackPower, combat)'), 'crescent uses skillDamage raw');
  ok(!/skillPowerApplied:\s*true/.test(cresBody), 'crescent does not force skillPowerApplied true');
  ok(!/\*\s*player\.skillPower/.test(cresBody), 'crescent does not bake skillPower (hit path multiplies)');
  // fireball must set skillPowerApplied true when baking
  const fbStart = combatSrc.search(/_fireball\s*\(\s*player/);
  const fbEnd = combatSrc.search(/_frostNova\s*\(\s*player/);
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
const combatSrc = await import('node:fs/promises').then(async fs => {
  const parts = await Promise.all([
    fs.readFile(join(root, 'js/systems/CombatSystem.js'), 'utf8'),
    fs.readFile(join(root, 'js/systems/combat/activeSkillMethods.js'), 'utf8'),
    fs.readFile(join(root, 'js/systems/combat/energyBurstMethods.js'), 'utf8'),
    fs.readFile(join(root, 'js/systems/combat/createSkillHandlers.js'), 'utf8'),
  ]);
  return parts.join('\n');
});
const judgmentHandler = methodBody(combatSrc, 'skyfall');
ok(judgmentHandler.includes('bundle.playerLevel < 20') && /_skyfallLegacy\s*\(\s*player,\s*bundle\)/.test(combatSrc),
  'Iron Judgment preserves the legacy path below level 20');
ok(judgmentHandler.includes('completed.has(index)') && judgmentHandler.includes('completed.add(index)'),
  'Iron Judgment phase contacts are guarded to land once');
ok(judgmentHandler.includes('cast.target.copy(player.position)'),
  'Iron Judgment synchronizes cast geometry to the world-resolved leap position');
ok(judgmentHandler.includes('if (index !== 0) return false')
  && judgmentHandler.includes('this.skillCastState.delete(player)'),
  'Iron Judgment rejects orphan finishers and deletes terminal cast state');
ok(judgmentHandler.includes("controlCategory === 'boss'") && judgmentHandler.includes('addStagger')
  && judgmentHandler.includes('applyStun'), 'Iron Judgment converts boss stun to stagger');
ok(judgmentHandler.indexOf('recipeJudgmentApex') > judgmentHandler.indexOf("if (index === 0)"),
  'Apex pillars remain decorative after the authoritative slam pass');
const enemySrc = await import('node:fs/promises').then(fs => fs.readFile(join(root, 'js/entities/Enemy.js'), 'utf8'));
ok(enemySrc.includes('this.stunTimer > 0 || this.breakTimer > 0')
  && enemySrc.indexOf('this.stunTimer > 0 || this.breakTimer > 0') < enemySrc.indexOf('this.#combatAI(delta'),
  'enemy control suppresses AI while the shared update continues');
ok(!combatSrc.includes('skillCombatAtRank'), 'CombatSystem does not re-resolve combat per phase');
ok(/_skillBundle\s*\(\s*bundle\)/.test(combatSrc) && combatSrc.includes('handler(player, bundle, phase, audio)'),
  'CombatSystem handlers consume the provided bundle');
const { CombatSystem } = await import(pathToFileURL(join(root, 'js/systems/CombatSystem.js')).href);
const combatSystem = new CombatSystem({});
let receivedBundle = null;
let receivedPhase = null;
combatSystem.skillHandlers.whirlwind = (_player, bundle, phase) => {
  receivedBundle = bundle;
  receivedPhase = phase;
};
combatSystem.usePlayerSkill(apex, {}, 3);
ok(receivedBundle === apex && receivedPhase === 3,
  'usePlayerSkill forwards the identical immutable snapshot to its handler');

let livingStarRetires = 0;
const projectilePlayer = {
  alive: true, position: new THREE.Vector3(), facing: new THREE.Vector3(0, 0, 1),
  attackPower: 10, skillPower: 1, critChance: 0, critMultiplier: 1.85, leech: 0,
  passiveEffects: { statusCrit: 0, execute: 0 }, classId: 'wizard', weapon: null,
};
let reactionDamageCalls = 0;
const primeAtDamage = [];
const fireRetireOrder = [];
const fireReactionKinds = [];
const reactionEnemy = {
  alive: true, id: 'reaction-enemy', radius: .6, position: new THREE.Vector3(0, 0, 2.4),
  hp: 100, maxHp: 100, statuses: { slow: { id: 'slow', remaining: 4 } }, refs: { modelHeight: 2 }, spellPrime: { id: 'deep_chill', depth: 0 },
  consumeSpellPrime: Enemy.prototype.consumeSpellPrime,
  setSpellPrime: Enemy.prototype.setSpellPrime,
  takeDamage() {
    reactionDamageCalls += 1;
    fireRetireOrder.push(`damage-${reactionDamageCalls}`);
    primeAtDamage.push(Boolean(this.spellPrime));
    return { amount: 1, killed: false };
  },
};
const blockedReactionEnemy = {
  ...reactionEnemy, id: 'blocked-reaction', position: new THREE.Vector3(.2, 0, 2.4),
  spellPrime: { id: 'deep_chill', depth: 0 },
  takeDamage: () => ({ amount: 0, killed: false }),
};
const projectileGame = {
  player: projectilePlayer, scene: new THREE.Scene(), enemies: { enemies: [reactionEnemy, blockedReactionEnemy] },
  world: { heightAt: () => 0 },
  effects: {
    recipeFireOrb() {}, recipeFireBlast() { fireRetireOrder.push('blast-fx'); },
    recipeLivingStar() { livingStarRetires += 1; fireRetireOrder.push('terminal'); },
    recipeSpellReaction(_position, kind) { fireReactionKinds.push(kind); }, trail() {}, ring() {}, burst() {}, impact() {},
  },
  ui: { floatText() {} }, audio: { hit() {} },
};
const projectileCombat = new CombatSystem(projectileGame);
const livingStarBundle = resolveSkillForm(content.SKILLS.fireball, 10, 100, {});
projectileCombat.usePlayerSkill(livingStarBundle, projectilePlayer, 0);
const livingProjectile = projectileCombat.projectiles[0];
ok(typeof livingProjectile.onHit === 'function' && typeof livingProjectile.onRetire === 'function'
  && livingProjectile.retired === false && livingProjectile.reactionDepth === 0
  && livingProjectile.castId && Object.isFrozen(livingProjectile.castMeta),
  'friendly projectile carries bounded callbacks, depth, cast metadata, and live state');
projectileCombat.update(.1);
ok(reactionEnemy.spellPrime === null && primeAtDamage.join(',') === 'true,false,false,false' && reactionDamageCalls === 4,
  'Fireball lands direct damage, then consumes once before reaction, shared blast, and Prominence flare');
ok(fireReactionKinds[0] === 'steam' && reactionEnemy.statuses.slow.remaining === 2,
  'Fire plus Deep Chill emits Steam and halves the remaining slow');
ok(fireRetireOrder.indexOf('terminal') > fireRetireOrder.indexOf('damage-3')
  && fireRetireOrder.indexOf('terminal') < fireRetireOrder.indexOf('damage-4'),
  'Fireball retirement resolves base blast authority before terminal flare authority');
ok(blockedReactionEnemy.spellPrime?.id === 'deep_chill',
  'zero landed damage cannot consume or replace a spell prime');
projectileCombat.update(2);
projectileCombat.clear();
ok(livingProjectile.retired && livingStarRetires === 1,
  'actual projectile update retires and invokes terminal callback exactly once');
let currentGenerationTerminals = 0;
const staleGame = {
  player: projectilePlayer, scene: new THREE.Scene(), enemies: { enemies: [] }, world: { heightAt: () => 0 },
  effects: { recipeFireOrb() {}, recipeLivingStar() { currentGenerationTerminals += 1; }, trail() {}, ring() {}, burst() {} },
};
const staleCombat = new CombatSystem(staleGame);
staleCombat.usePlayerSkill(livingStarBundle, projectilePlayer, 0);
staleCombat.usePlayerSkill(livingStarBundle, projectilePlayer, 0);
staleCombat.update(2);
ok(currentGenerationTerminals === 1,
  'stale Fireball generation has zero terminal authority after a same-skill recast');
staleCombat.usePlayerSkill(livingStarBundle, projectilePlayer, 0);
staleCombat.usePlayerSkill(livingStarBundle, projectilePlayer, 0);
staleCombat.clear();
ok(currentGenerationTerminals === 1 && staleCombat.projectiles.length === 0 && staleCombat.delayed.length === 0,
  'wizard clear retires all generations without spawning terminal or delayed work');

let blinkBurstTo = null;
let seamTo = null;
const blinkPlayer = {
  alive: true, position: new THREE.Vector3(), facing: new THREE.Vector3(0, 0, 1), invulnerable: 0,
  attackPower: 10, skillPower: 1, critChance: 0, critMultiplier: 1.85, leech: 0,
  passiveEffects: { statusCrit: 0, execute: 0 }, classId: 'wizard', weapon: null,
};
const blinkGame = {
  player: blinkPlayer, scene: new THREE.Scene(), enemies: { enemies: [] },
  world: {
    heightAt: () => 0,
    resolvePosition(position) { position.x += 2; },
  },
  effects: {
    recipeBlinkBurst(_from, to) { blinkBurstTo = to.clone(); },
    recipeSpaceSeam(_from, to) { seamTo = to.clone(); },
  },
};
const blinkCombat = new CombatSystem(blinkGame);
const blinkBundle = resolveSkillForm(content.SKILLS.arcane_blink, 10, 100, {});
blinkCombat.usePlayerSkill(blinkBundle, blinkPlayer);
blinkCombat.update(1);
ok(blinkBurstTo?.equals(blinkPlayer.position) && seamTo?.equals(blinkPlayer.position)
  && blinkPlayer.position.x === 2,
  'Space Rend snapshots world-resolved destination for player, VFX, hit, and route geometry');

const makeWizardEnemy = (id, x, z, category = 'normal') => ({
  id, alive: true, radius: .55, position: new THREE.Vector3(x, 0, z), hp: 100, maxHp: 100,
  elite: category === 'elite', boss: category === 'boss', controlCategory: category,
  statuses: {}, spellPrime: null, refs: { modelHeight: 2 }, hits: 0, stuns: 0, staggers: 0,
  takeDamage() { this.hits += 1; return { amount: 1, killed: false }; },
  applyStatus(id, options) { this.statuses[id] = { id, remaining: options.duration, ...options }; },
  applyStun(value) { this.stuns += value; return value; }, addStagger(value) { this.staggers += value; return { added: value }; },
  setSpellPrime: Enemy.prototype.setSpellPrime, consumeSpellPrime: Enemy.prototype.consumeSpellPrime,
});
const wizardEffects = new Proxy({}, { get: () => () => {} });
const wizardPlayer = {
  alive: true, position: new THREE.Vector3(), facing: new THREE.Vector3(1, 0, 0), invulnerable: 0,
  attackPower: 10, skillPower: 1, critChance: 0, critMultiplier: 1.85, leech: 0,
  passiveEffects: { statusCrit: 0, execute: 0 }, classId: 'wizard', weapon: null,
};
const makeWizardGame = enemies => {
  wizardPlayer.position.set(0, 0, 0);
  return ({
  player: wizardPlayer, scene: new THREE.Scene(), enemies: { enemies }, elapsed: 1,
  world: { heightAt: () => 0, resolvePosition() {} }, effects: wizardEffects,
  ui: { floatText() {} }, audio: { hit() {} }, mode: 'hunt',
  });
};
const shardKinds = [];
const shardSource = makeWizardEnemy('shard-source', 5, 0);
const shardForward = makeWizardEnemy('shard-forward', 7, 0);
shardSource.setSpellPrime('crystal', { remaining: 4 });
const shardGame = makeWizardGame([shardSource, shardForward]);
shardGame.effects = new Proxy({
  recipeSpellReaction(_position, kind, direction) { shardKinds.push([kind, direction?.clone()]); },
}, { get: (target, key) => target[key] ?? (() => {}) });
const shardCombat = new CombatSystem(shardGame);
shardCombat.usePlayerSkill(resolveSkillForm(content.SKILLS.arcane_blink, 10, 100, {}), wizardPlayer);
shardCombat.update(1); shardCombat.update(1);
ok(shardSource.spellPrime === null && shardKinds[0]?.[0] === 'crystal_shards'
  && shardKinds[0][1].dot(new THREE.Vector3(1, 0, 0)) > .99
  && shardForward.hits > 0,
  'Arcane plus Crystal consumes once and emits authoritative facing shard-cone damage');
const realEnemyData = {
  id: 'iframe_oracle', name: 'IFrame Oracle', level: 1, hp: 5000, damage: 1,
  defense: 0, speed: 1, range: 1, xp: 1, gold: [0, 0], ai: 'melee', accent: 0xffffff,
};
const realEnemyFactory = {
  create() {
    const group = new THREE.Group();
    const healthGroup = new THREE.Group();
    const healthFill = new THREE.Mesh(new THREE.PlaneGeometry(1, .1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    healthGroup.add(healthFill); group.add(healthGroup);
    return {
      group, animation: { has: () => false, setLocomotion() {}, update() {} },
      refs: { modelHeight: 2, healthWidth: 1, healthFill, healthGroup },
    };
  },
};
const makeRealWizardEnemy = (game, category = 'normal') => new Enemy(
  game.scene,
  realEnemyData,
  new THREE.Vector3(2, 0, 0),
  { elite: category === 'elite', level: 1 },
  realEnemyFactory,
);

const knightPlayer = { ...wizardPlayer, classId: 'aerin', position: new THREE.Vector3(), facing: new THREE.Vector3(1, 0, 0), invulnerable: 0 };
const whirlGame = makeWizardGame([]); whirlGame.player = knightPlayer;
whirlGame.camera = { getWorldQuaternion(quaternion) { return quaternion.identity(); } };
const whirlNormal = makeRealWizardEnemy(whirlGame); whirlNormal.position.set(3, 0, 0);
const whirlBoss = new Enemy(whirlGame.scene, { ...realEnemyData, id: 'whirl_boss', boss: true }, new THREE.Vector3(3, 0, 1), { level: 1 }, realEnemyFactory);
whirlGame.enemies.enemies.push(whirlNormal, whirlBoss);
const whirlEvents = [];
whirlGame.effects = new Proxy({ recipeSovereignCross() { whirlEvents.push('cross'); }, recipeWhirlwindScar() { whirlEvents.push('scar'); } },
  { get: (target, key) => target[key] ?? (() => {}) });
const whirlCombat = new CombatSystem(whirlGame);
const sovereignCyclone = resolveSkillForm(content.SKILLS.whirlwind, 10, 100, { tier40: 'cyclone', tier80: 'storm_cage' });
const bossOrigin = whirlBoss.position.clone(); const normalOrigin = whirlNormal.position.clone();
whirlCombat.usePlayerSkill(sovereignCyclone, knightPlayer, 'full');
for (let i = 0; i < 8; i += 1) { whirlNormal.invulnerable = 0; whirlBoss.invulnerable = 0; whirlCombat.update(.16); }
ok(whirlEvents.filter(event => event === 'cross').length === 1
  && whirlEvents.filter(event => event === 'scar').length === 1,
  'Sovereign Roving Gale emits one travelled scar and one final cross');
ok(whirlNormal.position.distanceTo(knightPlayer.position) < normalOrigin.distanceTo(knightPlayer.position)
  && whirlBoss.position.distanceTo(bossOrigin) < .01,
  'Cyclone moves normal prey inward while boss authoritative displacement remains zero');
const bloodGame = makeWizardGame([]); bloodGame.player = knightPlayer;
bloodGame.camera = { getWorldQuaternion(quaternion) { return quaternion.identity(); } };
const bloodEnemy = makeRealWizardEnemy(bloodGame); bloodEnemy.position.set(2, 0, 0); bloodGame.enemies.enemies.push(bloodEnemy);
const bloodAmounts = [];
const bloodTake = bloodEnemy.takeDamage.bind(bloodEnemy);
bloodEnemy.takeDamage = (raw, game, options = {}) => { const result = bloodTake(raw, game, options); bloodAmounts.push({ amount: result.amount, key: options.sameCastHit?.key, dot: options.dot }); return result; };
const bloodCombat = new CombatSystem(bloodGame);
bloodCombat.usePlayerSkill(resolveSkillForm(content.SKILLS.whirlwind, 10, 80, { tier40: 'blood_wheel', tier80: 'giant_slayer' }), knightPlayer, 'full');
for (let i = 0; i < 20; i += 1) { bloodCombat.update(.055); bloodEnemy.update(.055, bloodGame); bloodEnemy.position.set(2,0,0); bloodEnemy.knockback.set(0,0,0); }
ok(bloodAmounts.filter(hit => hit.amount > 0 && !hit.key && !hit.dot).length === 6 && bloodEnemy.statuses.bleed?.remaining > 0,
  `Blood Wheel lands six real-iframe pulses and applies its bleed cadence (${bloodAmounts.map(h=>`${h.amount}:${h.key??'base'}`).join('|')})`);

const fangOrigins = [];
const rogueSkillPlayer = { ...wizardPlayer, classId: 'rogue', position: new THREE.Vector3(), facing: new THREE.Vector3(1, 0, 0), invulnerable: 0,
  mesh: { updateWorldMatrix() {} }, refs: {
    mainBladeTip: { getWorldPosition(v) { v.set(.25, 1, 0); } },
    offhandBladeTip: { getWorldPosition(v) { v.set(-.25, 1, 0); } },
  } };
const fangEnemy = makeWizardEnemy('fang-prey', 1.5, 0); fangEnemy.statuses.bleed = { id: 'bleed', remaining: 3 };
const fangGame = makeWizardGame([fangEnemy]); fangGame.player = rogueSkillPlayer;
fangGame.effects = new Proxy({ recipeFangRush(origin) { fangOrigins.push(origin.clone()); }, recipeBackbite() { fangOrigins.push('backbite'); },
  recipeFangCutLine() {}, recipeThousandFangFinale() {} }, { get: (target, key) => target[key] ?? (() => {}) });
const fangCombat = new CombatSystem(fangGame);
const openFang = resolveSkillForm(content.SKILLS.twin_fang, 10, 80, { tier40: 'viper', tier80: 'open_wound' });
fangCombat.usePlayerSkill(openFang, rogueSkillPlayer, 0);
fangCombat.usePlayerSkill(openFang, rogueSkillPlayer, 1);
fangCombat.usePlayerSkill(openFang, rogueSkillPlayer, 2);
fangCombat.usePlayerSkill(openFang, rogueSkillPlayer, 2);
fangCombat.update(.2);
ok(fangOrigins[0].x > fangOrigins[1].x && Math.abs(fangOrigins[2].x - .18) < 1e-6,
  `Twin Fang contacts originate main/off/main-cross from actual blade tips (${fangOrigins.slice(0,3).map(v => v.x).join(',')})`);
ok(!fangEnemy.statuses.bleed && fangOrigins.filter(event => event === 'backbite').length === 1,
  'Open Wound consumes bleed once and Backbite echoes once without recursion');
const thousandGame = makeWizardGame([makeWizardEnemy('thousand-prey', 1.5, 0)]); thousandGame.player = rogueSkillPlayer;
let cutLines = 0; let finales = 0;
thousandGame.effects = new Proxy({ recipeFangRush() {}, recipeFangCutLine() { cutLines += 1; }, recipeThousandFangFinale() { finales += 1; } },
  { get: (target, key) => target[key] ?? (() => {}) });
const thousandCombat = new CombatSystem(thousandGame);
const thousand = resolveSkillForm(content.SKILLS.twin_fang, 10, 100, { tier40: 'raptor', tier80: 'heartseeker' });
thousandCombat.usePlayerSkill(thousand, rogueSkillPlayer, 'full');
for (let i = 0; i < 10; i += 1) thousandCombat.update(.1);
ok(cutLines <= 6 && finales === 1 && thousandGame.enemies.enemies[0].hits === 10,
  `Thousand Fang lands eight contacts, caps cut lines at six, and detonates once (${cutLines}/${finales}/${thousandGame.enemies.enemies[0].hits})`);
const realFangGame = makeWizardGame([]); realFangGame.player = rogueSkillPlayer;
realFangGame.camera = { getWorldQuaternion(quaternion) { return quaternion.identity(); } };
const realFangEnemy = makeRealWizardEnemy(realFangGame, 'elite'); realFangEnemy.position.set(1.5, 0, 0); realFangGame.enemies.enemies.push(realFangEnemy);
const realFangHits = [];
const realFangTake = realFangEnemy.takeDamage.bind(realFangEnemy);
realFangEnemy.takeDamage = (raw, game, options = {}) => { const result = realFangTake(raw, game, options); realFangHits.push({ amount: result.amount, key: options.sameCastHit?.key, dot: options.dot }); return result; };
realFangGame.effects = new Proxy({}, { get: () => () => {} });
const realFangCombat = new CombatSystem(realFangGame);
realFangCombat.usePlayerSkill(thousand, rogueSkillPlayer, 'full');
for (let i = 0; i < 24; i += 1) { realFangCombat.update(.045); realFangEnemy.update(.045, realFangGame); realFangEnemy.position.set(1.5,0,0); realFangEnemy.knockback.set(0,0,0); }
ok(realFangHits.filter(hit => hit.amount > 0 && !hit.key && !hit.dot).length === 8
  && realFangHits.filter(hit => hit.amount > 0 && hit.key?.includes(':backbite')).length === 1
  && realFangHits.filter(hit => hit.amount > 0 && hit.key?.includes(':detonate')).length === 1,
  `Thousand Fang crosses real Enemy iframes for eight contacts, one Backbite, and one bounded detonation (${realFangHits.map(h=>`${h.amount}:${h.key??'base'}`).join('|')})`);

const phaseEnemy = makeWizardEnemy('phase-enemy', 2, 0);
const phaseGame = makeWizardGame([phaseEnemy]); phaseGame.player = knightPlayer;
const phaseCombat = new CombatSystem(phaseGame);
const whirlA = resolveSkillForm(content.SKILLS.whirlwind, 10, 100, { tier40: 'cyclone', tier80: 'storm_cage' });
const whirlB = resolveSkillForm(content.SKILLS.whirlwind, 9, 100, { tier40: 'blood_wheel', tier80: 'giant_slayer' });
phaseCombat.usePlayerSkill(whirlA, knightPlayer, 1);
ok(phaseEnemy.hits === 0, 'Whirlwind rejects orphan nonzero phase');
phaseCombat.usePlayerSkill(whirlA, knightPlayer, 0); phaseCombat.usePlayerSkill(whirlA, knightPlayer, 1);
phaseCombat.usePlayerSkill(whirlA, knightPlayer, 1);
ok(phaseEnemy.hits === 2, 'Whirlwind rejects a duplicate middle phase before authority');
phaseCombat.usePlayerSkill(whirlB, knightPlayer, 0); phaseCombat.usePlayerSkill(whirlA, knightPlayer, 1);
phaseCombat.usePlayerSkill(whirlB, knightPlayer, 1);
ok(phaseEnemy.hits === 4, 'Whirlwind A0→B0 rejects A1 and accepts identical-bundle B1');
knightPlayer.classId = 'wizard'; phaseCombat.usePlayerSkill(whirlB, knightPlayer, 2);
ok(phaseEnemy.hits === 4, 'Whirlwind class switch cancels owned phase authority'); knightPlayer.classId = 'aerin';

const fangPhaseEnemy = makeWizardEnemy('fang-phase', 1.5, 0);
const fangPhaseGame = makeWizardGame([fangPhaseEnemy]); fangPhaseGame.player = rogueSkillPlayer;
const fangPhaseCombat = new CombatSystem(fangPhaseGame);
const fangA = resolveSkillForm(content.SKILLS.twin_fang, 10, 100, { tier40: 'viper', tier80: 'open_wound' });
const fangB = resolveSkillForm(content.SKILLS.twin_fang, 9, 100, { tier40: 'raptor', tier80: 'heartseeker' });
fangPhaseCombat.usePlayerSkill(fangA, rogueSkillPlayer, 1);
ok(fangPhaseEnemy.hits === 0, 'Twin Fang rejects orphan nonzero phase');
fangPhaseCombat.usePlayerSkill(fangA, rogueSkillPlayer, 0); fangPhaseCombat.usePlayerSkill(fangA, rogueSkillPlayer, 1);
fangPhaseCombat.usePlayerSkill(fangA, rogueSkillPlayer, 1);
ok(fangPhaseEnemy.hits === 2, 'Twin Fang rejects duplicate middle phase');
fangPhaseCombat.usePlayerSkill(fangB, rogueSkillPlayer, 0); fangPhaseCombat.usePlayerSkill(fangA, rogueSkillPlayer, 1);
fangPhaseCombat.usePlayerSkill(fangB, rogueSkillPlayer, 1);
ok(fangPhaseEnemy.hits === 4, 'Twin Fang A0→B0 rejects A1 and accepts identical-bundle B1');
rogueSkillPlayer.classId = 'wizard'; fangPhaseCombat.usePlayerSkill(fangB, rogueSkillPlayer, 2);
ok(fangPhaseEnemy.hits === 4, 'Twin Fang class switch cancels owned phase authority'); rogueSkillPlayer.classId = 'rogue';

const cycloneApex = resolveSkillForm(content.SKILLS.whirlwind, 10, 100, { tier40: 'cyclone', tier80: 'storm_cage' });
const bloodApex = resolveSkillForm(content.SKILLS.whirlwind, 10, 100, { tier40: 'blood_wheel', tier80: 'storm_cage' });
ok(cycloneApex.timeline.hits.length === 6 && bloodApex.timeline.hits.length === 6
  && bloodApex.timeline.hits.at(-1) * bloodApex.combat.cadenceMult < cycloneApex.timeline.hits.at(-1),
  'Apex Blood and Cyclone both schedule six contacts while Blood completes earlier via one cadence multiplier');
const cadenceCounts = { cyclone: 0, blood: 0 };
for (const [label, bundle] of [['cyclone', cycloneApex], ['blood', bloodApex]]) {
  const game = makeWizardGame([]); game.player = knightPlayer;
  game.audio = { swing() { cadenceCounts[label] += 1; }, hit() {} };
  const combat = new CombatSystem(game); combat.usePlayerSkill(bundle, knightPlayer, 'full'); combat.update(1);
}
ok(cadenceCounts.cyclone === 6 && cadenceCounts.blood === 6,
  'Cyclone and Blood fallback cadence each dispatch exactly six swing cues');

const scarOn = makeWizardEnemy('scar-on', 2, .2); const scarOff = makeWizardEnemy('scar-off', 2, 2);
const scarGame = makeWizardGame([scarOn, scarOff]); scarGame.player = knightPlayer; let scarFx = 0; let crossFx = 0;
scarGame.effects = new Proxy({ recipeSpinStorm() {}, recipeSovereignCross() { crossFx += 1; }, recipeWhirlwindScar() { scarFx += 1; } }, { get: (target,key) => target[key] ?? (()=>{}) });
const scarCombat = new CombatSystem(scarGame); knightPlayer.position.set(0,0,0);
scarCombat.usePlayerSkill(cycloneApex, knightPlayer, 0); knightPlayer.position.set(4,0,0);
for (let phase = 1; phase < 6; phase += 1) scarCombat.usePlayerSkill(cycloneApex, knightPlayer, phase);
scarCombat.usePlayerSkill(cycloneApex, knightPlayer, 5);
const onBefore = scarOn.hits; const offBefore = scarOff.hits;
scarCombat.update(.09);
ok(scarFx === 0 && scarOn.hits === onBefore, 'Roving Gale has no authority before its owned delay');
scarCombat.update(.02);
ok(scarFx === 1 && crossFx === 1 && scarOn.hits === onBefore + 1 && scarOff.hits === offBefore,
  'Roving Gale fires once with capsule on-line hit and off-line miss');
knightPlayer.position.set(0,0,0); scarCombat.usePlayerSkill(cycloneApex, knightPlayer, 0); knightPlayer.position.set(4,0,0);
for (let phase = 1; phase < 6; phase += 1) scarCombat.usePlayerSkill(cycloneApex, knightPlayer, phase);
scarCombat.usePlayerSkill(cycloneApex, knightPlayer, 0); scarCombat.update(.2);
ok(scarFx === 1, 'Roving Gale recast cancels the stale delayed scar generation');

const cageTargets = Array.from({ length: 7 }, (_, index) => {
  const enemy = makeWizardEnemy(`cage-${index}`, 2 + index * .1, 0, index % 2 ? 'elite' : 'normal');
  enemy.pulls = 0; enemy.pullToward = () => { enemy.pulls += 1; return .2; }; return enemy;
});
const cageBoss = makeWizardEnemy('cage-boss', 2, 1, 'boss'); cageBoss.pulls = 0; cageBoss.pullToward = () => { cageBoss.pulls += 1; };
const cageGame = makeWizardGame([...cageTargets, cageBoss]); cageGame.player = knightPlayer; knightPlayer.position.set(0,0,0);
const cageCombat = new CombatSystem(cageGame); cageCombat.usePlayerSkill(cycloneApex, knightPlayer, 0);
ok(cageTargets.filter(enemy => enemy.pulls > 0).length === 5 && cageBoss.pulls === 0,
  'Storm Cage groups at most five distinct mixed normal/elite targets and never displaces bosses');

const giantNormal = makeWizardEnemy('giant-normal', 2, 0); const giantBoss = makeWizardEnemy('giant-boss', 2, .4, 'boss');
const giantKeys = [];
giantBoss.takeDamage = (_raw, _game, options = {}) => { giantKeys.push(options.sameCastHit?.key ?? 'base'); return { amount: 1, killed: false }; };
const giantGame = makeWizardGame([giantNormal, giantBoss]); giantGame.player = knightPlayer;
const giantCombat = new CombatSystem(giantGame); const giantBundle = resolveSkillForm(content.SKILLS.whirlwind, 10, 100, { tier40: 'cyclone', tier80: 'giant_slayer' });
for (let phase = 0; phase < 6; phase += 1) giantCombat.usePlayerSkill(giantBundle, knightPlayer, phase);
ok(giantKeys.filter(key => key.includes(':durable')).length === 1
  && giantBoss.staggers === giantBundle.combat.durableStagger && giantNormal.staggers === 0,
  'Giant Slayer grants exactly one durable-only bonus and stagger');
const crossCenter = makeWizardEnemy('cross-center', 0, 0); const crossKeys = [];
crossCenter.takeDamage = (_raw, _game, options = {}) => { crossKeys.push(options.sameCastHit?.key ?? 'base'); return { amount: 1, killed: false }; };
const crossGame = makeWizardGame([crossCenter]); crossGame.player = knightPlayer; const crossCombat = new CombatSystem(crossGame);
for (let phase = 0; phase < 6; phase += 1) crossCombat.usePlayerSkill(cycloneApex, knightPlayer, phase);
ok(crossKeys.filter(key => key.includes(':cross-')).length === 2,
  'Sovereign perpendicular intersection consumes at most two cross contacts per enemy');

const heartNormal = makeWizardEnemy('heart-normal', 1.5, .25); const heartBoss = makeWizardEnemy('heart-boss', 1.5, -.25, 'boss');
const heartKeys = [];
heartBoss.takeDamage = (_raw, _game, options = {}) => { heartKeys.push(options.sameCastHit?.key ?? 'base'); return { amount: 1, killed: false }; };
const heartGame = makeWizardGame([heartNormal, heartBoss]); heartGame.player = rogueSkillPlayer;
const heartCombat = new CombatSystem(heartGame);
for (let phase = 0; phase < 8; phase += 1) heartCombat.usePlayerSkill(thousand, rogueSkillPlayer, phase);
ok(heartKeys.filter(key => key.endsWith(':heart')).length === 1
  && heartBoss.staggers === thousand.combat.durableStagger && heartNormal.staggers === 0,
  `Heartseeker grants exactly one durable-only bonus and stagger (${heartKeys.join('|')}/${heartBoss.staggers}/${heartNormal.staggers})`);

const crescent19 = resolveSkillForm(content.SKILLS.crescent,10,19,{});
const wideMoon = resolveSkillForm(content.SKILLS.crescent,10,40,{tier40:'wide_moon'});
const fullMoon = resolveSkillForm(content.SKILLS.crescent,10,40,{tier40:'full_moon'});
const crescentCountGame = makeWizardGame([]); crescentCountGame.player=knightPlayer;const crescentCountCombat=new CombatSystem(crescentCountGame);
crescentCountCombat.usePlayerSkill(crescent19,knightPlayer,0);ok(crescentCountCombat.projectiles.length===1,'Crescent below20 preserves one direct legacy wave');crescentCountCombat.clear();
const legacyScarEnemy=makeWizardEnemy('legacy-scar',4.2,0);const legacyScarGame=makeWizardGame([legacyScarEnemy]);legacyScarGame.player=knightPlayer;const legacyScarCombat=new CombatSystem(legacyScarGame);legacyScarCombat.usePlayerSkill(crescent19,knightPlayer,0);legacyScarCombat.update(.5);ok(legacyScarEnemy.hits===1,'Crescent below20 rank legacy preserves one delayed residual scar');
const wideGame=makeWizardGame([]);wideGame.player=knightPlayer;const wideCombat=new CombatSystem(wideGame);wideCombat.usePlayerSkill(wideMoon,knightPlayer,0);
const fullGame=makeWizardGame([]);fullGame.player=knightPlayer;const fullCombat=new CombatSystem(fullGame);fullCombat.usePlayerSkill(fullMoon,knightPlayer,0);
ok(wideCombat.projectiles.length===3&&fullCombat.projectiles.length===1
  &&fullCombat.projectiles[0].damage>wideCombat.projectiles[0].damage,'Wide Moon launches three spread waves while Full Moon launches one focused stronger wave');

const worldEnemyOn=makeWizardEnemy('world-on',4,0),worldEnemyOff=makeWizardEnemy('world-off',4,2);const worldKeys=[];
for(const enemy of [worldEnemyOn,worldEnemyOff])enemy.takeDamage=(_r,_g,o={})=>{worldKeys.push([enemy.id,o.sameCastHit?.key]);return{amount:1,killed:false};};
const worldGame=makeWizardGame([worldEnemyOn,worldEnemyOff]);worldGame.player=knightPlayer;worldGame.effects=new Proxy({}, {get:()=>()=>{}});const worldCombat=new CombatSystem(worldGame);
const worldBundle=resolveSkillForm(content.SKILLS.crescent,10,100,{tier40:'full_moon',tier80:'rift_trail'});
worldCombat.usePlayerSkill(worldBundle,knightPlayer,1);ok(worldCombat.projectiles.length===0,'Worldsplitter rejects orphan presentation phase');
worldCombat.usePlayerSkill(worldBundle,knightPlayer,0);worldCombat.usePlayerSkill(worldBundle,knightPlayer,0);worldCombat.update(.01);ok(worldCombat.projectiles.length===1,'Worldsplitter duplicate phase zero retires stale release and owns one projectile');
worldCombat.usePlayerSkill(worldBundle,knightPlayer,1);worldCombat.usePlayerSkill(worldBundle,knightPlayer,1);worldCombat.usePlayerSkill(worldBundle,knightPlayer,2);worldCombat.usePlayerSkill(worldBundle,knightPlayer,2);worldCombat.update(.5);
ok(worldKeys.filter(([,key])=>key?.includes(':rupture')&&key.includes('world-on')).length===1
  &&worldKeys.filter(([,key])=>key?.includes(':rupture')&&key.includes('world-off')).length===0,'Worldsplitter delayed rupture uses one on-line capsule hit and rejects off-line prey');

const severBoss=makeWizardEnemy('sever-boss',3.5,0,'boss');const severGame=makeWizardGame([severBoss]);severGame.player=knightPlayer;const severCombat=new CombatSystem(severGame);
const severBundle=resolveSkillForm(content.SKILLS.crescent,10,80,{tier40:'full_moon',tier80:'armor_sever'});severCombat.usePlayerSkill(severBundle,knightPlayer,0);severCombat.update(.1);
ok(severBoss.statuses.armor_break?.remaining===severBundle.combat.armorBreakDuration&&severBoss.hits>=2,'Armor Sever deals direct durable bonus and applies bounded generic armor_break');
const realSeverGame=makeWizardGame([]);realSeverGame.player=knightPlayer;const realSeverBoss=new Enemy(realSeverGame.scene,{...realEnemyData,id:'real_sever',boss:true},new THREE.Vector3(3.3,0,0),{level:1},realEnemyFactory);realSeverGame.enemies.enemies.push(realSeverBoss);const realSeverAmounts=[];const realSeverTake=realSeverBoss.takeDamage.bind(realSeverBoss);realSeverBoss.takeDamage=(r,g,o={})=>{const result=realSeverTake(r,g,o);realSeverAmounts.push(result.amount);return result;};const realSeverCombat=new CombatSystem(realSeverGame);realSeverCombat.usePlayerSkill(severBundle,knightPlayer,0);realSeverCombat.update(.1);ok(realSeverAmounts.filter(amount=>amount>0).length===2&&realSeverBoss.statuses.armor_break,'Armor Sever main and focused bonus cross the real Enemy iframe contract');

const fan20=resolveSkillForm(content.SKILLS.fan_of_knives,10,20,{});const fanBaseGame=makeWizardGame([]);fanBaseGame.player=rogueSkillPlayer;const fanBaseCombat=new CombatSystem(fanBaseGame);
fanBaseCombat.usePlayerSkill(fan20,rogueSkillPlayer,1);ok(fanBaseCombat.projectiles.length===0,'Returning Steel rejects orphan return phase');fanBaseCombat.usePlayerSkill(fan20,rogueSkillPlayer,0);
const outboundCount=fanBaseCombat.projectiles.length;fanBaseCombat.usePlayerSkill(fan20,rogueSkillPlayer,1);const returnedCount=fanBaseCombat.projectiles.length-outboundCount;fanBaseCombat.usePlayerSkill(fan20,rogueSkillPlayer,1);
ok(outboundCount>0&&returnedCount===outboundCount&&fanBaseCombat.projectiles.length===outboundCount*2,'Returning Steel creates exactly one nonrecursive return pass');

const ricochetTargets=Array.from({length:5},(_,i)=>makeWizardEnemy(`rico-${i}`,3+i*.3,(i-2)*.2));const bounceKeys=[];
for(const enemy of ricochetTargets)enemy.takeDamage=(_r,_g,o={})=>{if(o.sameCastHit?.key?.includes(':bounce:'))bounceKeys.push(o.sameCastHit.key);return{amount:1,killed:false};};
const ricoGame=makeWizardGame(ricochetTargets);ricoGame.player=rogueSkillPlayer;const ricoCombat=new CombatSystem(ricoGame);const ricoBundle=resolveSkillForm(content.SKILLS.fan_of_knives,10,80,{tier40:'black_fan',tier80:'ricochet'});
ricoCombat.usePlayerSkill(ricoBundle,rogueSkillPlayer,0);for(let i=0;i<3;i+=1)ricoCombat.projectiles[i].onHit?.(ricochetTargets[i]);ok(new Set(bounceKeys).size===3,`Ricochet lands exactly three positive unique derived targets without recursion (${bounceKeys.join('|')})`);
const pinnedNormal=makeWizardEnemy('pin-normal',4.8,.5),pinnedBoss=makeWizardEnemy('pin-boss',4.8,0,'boss');const pinKeys=[];pinnedBoss.takeDamage=(_r,_g,o={})=>{pinKeys.push(o.sameCastHit?.key??'base');return{amount:1,killed:false};};
const pinGame=makeWizardGame([pinnedNormal,pinnedBoss]);pinGame.player=rogueSkillPlayer;const pinCombat=new CombatSystem(pinGame);const pinBundle=resolveSkillForm(content.SKILLS.fan_of_knives,10,80,{tier40:'needle_line',tier80:'pinned_prey'});pinCombat.usePlayerSkill(pinBundle,rogueSkillPlayer,0);pinCombat.update(.2);
ok(pinnedNormal.hits>0&&pinKeys.some(key=>key?.includes(':pinned:'))&&pinnedBoss.staggers===pinBundle.combat.pinnedStagger&&pinnedNormal.staggers===0,`Pinned Prey keeps normal pack direct hits and adds durable-only focused damage/stagger (${pinKeys.join('|')}/${pinnedBoss.staggers})`);
const realPinGame=makeWizardGame([]);realPinGame.player=rogueSkillPlayer;const realPinBoss=new Enemy(realPinGame.scene,{...realEnemyData,id:'real_pin',boss:true},new THREE.Vector3(4.8,0,0),{level:1},realEnemyFactory);realPinGame.enemies.enemies.push(realPinBoss);realPinGame.effects=new Proxy({}, {get:()=>()=>{}});const realPinAmounts=[];const realPinTake=realPinBoss.takeDamage.bind(realPinBoss);realPinBoss.takeDamage=(r,g,o={})=>{const result=realPinTake(r,g,o);realPinAmounts.push({amount:result.amount,key:o.sameCastHit?.key??'direct'});return result;};const realPinCombat=new CombatSystem(realPinGame);realPinCombat.usePlayerSkill(pinBundle,rogueSkillPlayer,0);realPinCombat.update(.2);const realPinPositive=realPinAmounts.filter(hit=>hit.amount>0);ok(realPinPositive.length===2&&realPinPositive.filter(hit=>hit.key==='direct').length===1&&realPinPositive.filter(hit=>hit.key.includes(':pinned:')).length===1&&realPinBoss.stagger===pinBundle.combat.pinnedStagger,'Pinned Prey crosses real iframe with exactly one direct and one named durable bonus plus one stagger');

const peacockGame=makeWizardGame([]);peacockGame.player=rogueSkillPlayer;let peacockFinales=0;peacockGame.effects=new Proxy({recipeNightPeacockAct(_p,_d,_t,act){if(act===2)peacockFinales+=1;}},{get:(t,k)=>t[k]??(()=>{})});const peacockCombat=new CombatSystem(peacockGame);
const peacock=resolveSkillForm(content.SKILLS.fan_of_knives,10,100,{tier40:'black_fan',tier80:'ricochet'});peacockCombat.usePlayerSkill(peacock,rogueSkillPlayer,0);const peacockOutbound=peacockCombat.projectiles.length;
peacockCombat.usePlayerSkill(peacock,rogueSkillPlayer,1);const afterReturn=peacockCombat.projectiles.length;peacockCombat.usePlayerSkill(peacock,rogueSkillPlayer,1);peacockCombat.usePlayerSkill(peacock,rogueSkillPlayer,2);peacockCombat.usePlayerSkill(peacock,rogueSkillPlayer,2);
ok(peacockOutbound===12&&afterReturn===24&&peacockFinales===1,'Night Peacock phase switch prevents outbound respawn, returns once, and owns one finale');
const fanHandlerBody=methodBody(combatSrc,'fanOfKnives');
ok(combatSrc.includes('trailRate: options.trailRate ?? visual.trailRate')
  && (fanHandlerBody.includes("daggerTrailRate=this._quality()==='low'?6:this._quality()==='medium'?10:16")
    || fanHandlerBody.includes("daggerTrailRate=this.#quality()==='low'?6:this.#quality()==='medium'?10:16"))
  && fanHandlerBody.match(/trailRate:daggerTrailRate/g)?.length===3,
  'Fan and Night Peacock preserve projectile cores while quality-capping decorative dagger trails');
const meteorHandlerBody=methodBody(combatSrc,'meteorStorm');
ok((meteorHandlerBody.includes("this._quality() === 'high' || i % 2 === 0")
    || meteorHandlerBody.includes("this.#quality() === 'high' || i % 2 === 0"))
  && (meteorHandlerBody.includes('this._hitEnemiesInRadius(impactPoint, combat.hitRadius * .72')
    || meteorHandlerBody.includes('this.#hitEnemiesInRadius(impactPoint, combat.hitRadius * .72')),
  'Meteor keeps every authoritative fracture hit while low/medium decoration uses alternating impacts');
const cresPhaseEvents=[];const cresPhaseGame=makeWizardGame([]);cresPhaseGame.player=knightPlayer;cresPhaseGame.effects=new Proxy({recipeWorldsplitterAct(_p,_d,_t,act){cresPhaseEvents.push(act);}},{get:(t,k)=>t[k]??(()=>{})});const cresPhaseCombat=new CombatSystem(cresPhaseGame);
const worldB=resolveSkillForm(content.SKILLS.crescent,9,100,{tier40:'wide_moon',tier80:'armor_sever'});cresPhaseCombat.usePlayerSkill(worldBundle,knightPlayer,1);ok(cresPhaseEvents.length===0,'Crescent rejects orphan nonzero phase');cresPhaseCombat.usePlayerSkill(worldBundle,knightPlayer,0);cresPhaseCombat.usePlayerSkill(worldB,knightPlayer,0);cresPhaseCombat.usePlayerSkill(worldBundle,knightPlayer,1);cresPhaseCombat.usePlayerSkill(worldB,knightPlayer,1);cresPhaseCombat.usePlayerSkill(worldB,knightPlayer,1);
ok(cresPhaseEvents.filter(act=>act===1).length===1,'Crescent rejects stale foreign bundle and duplicate phase');knightPlayer.classId='wizard';cresPhaseCombat.usePlayerSkill(worldB,knightPlayer,2);ok(!cresPhaseEvents.includes(2),'Crescent class switch cancels terminal authority');knightPlayer.classId='aerin';
const fanPhaseEvents=[];const fanPhaseGame=makeWizardGame([]);fanPhaseGame.player=rogueSkillPlayer;fanPhaseGame.effects=new Proxy({recipeNightPeacockAct(_p,_d,_t,act){fanPhaseEvents.push(act);}},{get:(t,k)=>t[k]??(()=>{})});const fanPhaseCombat=new CombatSystem(fanPhaseGame);
const peacockB=resolveSkillForm(content.SKILLS.fan_of_knives,9,100,{tier40:'needle_line',tier80:'pinned_prey'});fanPhaseCombat.usePlayerSkill(peacock,rogueSkillPlayer,1);ok(fanPhaseEvents.length===0,'Fan rejects orphan return phase');fanPhaseCombat.usePlayerSkill(peacock,rogueSkillPlayer,0);fanPhaseCombat.usePlayerSkill(peacockB,rogueSkillPlayer,0);fanPhaseCombat.usePlayerSkill(peacock,rogueSkillPlayer,1);fanPhaseCombat.usePlayerSkill(peacockB,rogueSkillPlayer,1);fanPhaseCombat.usePlayerSkill(peacockB,rogueSkillPlayer,1);ok(fanPhaseEvents.filter(act=>act===1).length===1,'Fan rejects stale bundle and duplicate return phase');rogueSkillPlayer.classId='wizard';fanPhaseCombat.usePlayerSkill(peacockB,rogueSkillPlayer,2);ok(!fanPhaseEvents.includes(2),'Fan class switch cancels finale authority');rogueSkillPlayer.classId='rogue';

const cresFallbackEvents=[];const cresFallbackTarget=makeWizardEnemy('cres-full-line',4,0);cresFallbackTarget.takeDamage=(_r,_g,o={})=>{if(o.sameCastHit?.key)cresFallbackEvents.push(o.sameCastHit.key);return{amount:1,killed:false};};const cresFallbackGame=makeWizardGame([cresFallbackTarget]);cresFallbackGame.player=knightPlayer;cresFallbackGame.effects=new Proxy({recipeWorldsplitterAct(_p,_d,_t,act){cresFallbackEvents.push(`act:${act}`);}},{get:(t,k)=>t[k]??(()=>{})});const cresFallbackCombat=new CombatSystem(cresFallbackGame);cresFallbackCombat.usePlayerSkill(worldBundle,knightPlayer,'full');ok(cresFallbackEvents[0]==='act:0'&&cresFallbackCombat.projectiles.length===1,'Crescent full fallback starts with one owned release');cresFallbackCombat.update(1);cresFallbackCombat.update(1);cresFallbackCombat.update(1);ok(cresFallbackEvents.filter(event=>event.startsWith('act:')).join(',')==='act:0,act:1,act:2'&&cresFallbackEvents.filter(event=>event.includes(':scar:')).length===1&&cresFallbackEvents.filter(event=>event.includes(':rupture:')).length===1,'Crescent coarse fallback preserves 0→1→2 and one scar/rupture');
const cresCancelEvents=[];const cresCancelGame=makeWizardGame([]);cresCancelGame.player=knightPlayer;cresCancelGame.effects=new Proxy({recipeWorldsplitterAct(_p,_d,_t,act){cresCancelEvents.push(act);}},{get:(t,k)=>t[k]??(()=>{})});const cresCancelCombat=new CombatSystem(cresCancelGame);cresCancelCombat.usePlayerSkill(worldBundle,knightPlayer,'full');cresCancelCombat.usePlayerSkill(worldB,knightPlayer,0);cresCancelCombat.update(1);ok(cresCancelEvents.join(',')==='0,0','Crescent recast cancels stale fallback continuation');
const fanFallbackEvents=[];const fanFallbackGame=makeWizardGame([]);fanFallbackGame.player=rogueSkillPlayer;fanFallbackGame.effects=new Proxy({recipeNightPeacockAct(_p,_d,_t,act){fanFallbackEvents.push(act);}},{get:(t,k)=>t[k]??(()=>{})});const fanFallbackCombat=new CombatSystem(fanFallbackGame);fanFallbackCombat.usePlayerSkill(peacock,rogueSkillPlayer,null);const fanFallbackOutbound=fanFallbackCombat.projectiles.length;fanFallbackCombat.update(1);fanFallbackCombat.update(1);ok(fanFallbackEvents.join(',')==='0,1,2'&&fanFallbackOutbound===12,'Fan coarse fallback preserves 0→1→2 with one outbound act');
const survivorTarget=makeWizardEnemy('return-retire-target',2.7,0);const survivorGame=makeWizardGame([survivorTarget]);survivorGame.player=rogueSkillPlayer;const survivorCombat=new CombatSystem(survivorGame);survivorCombat.usePlayerSkill(fan20,rogueSkillPlayer,0);const survivorOutbound=[...survivorCombat.projectiles];survivorCombat.update(.1);const realSurvivors=survivorOutbound.filter(projectile=>!projectile.retired&&projectile.life>0&&survivorCombat.projectiles.includes(projectile)&&(!projectile.ownerGuard||projectile.ownerGuard()));const naturallyRetired=survivorOutbound.filter(projectile=>projectile.retired);survivorCombat.usePlayerSkill(fan20,rogueSkillPlayer,1);const survivorReturns=survivorCombat.projectiles.filter(projectile=>projectile.reactionDepth===1);ok(naturallyRetired.length>0&&realSurvivors.length>0&&survivorReturns.length===realSurvivors.length&&survivorReturns.every(projectile=>projectile.onHit===null&&projectile.onRetire===null),'Returning Steel returns exactly natural lifecycle survivors; retired knives never return and callbacks stay null');survivorCombat.update(2);ok(survivorCombat.projectiles.length===0,'Return knives advance through hit/retire without spawning another projectile pass');
ok(wideMoon.combat.waveCount===3&&wideMoon.combat.spread>0&&fullMoon.combat.waveCount===1&&fullMoon.combat.radiusMult<1&&fullMoon.combat.damageMult>1,'Wide Moon is broad while Full Moon is tight and focused');ok(ricoBundle.combat.spreadMult>1&&pinBundle.combat.spreadMult<1&&pinBundle.combat.pierce===3,'Black Fan is broad while Needle Line is tight, centered, and piercing');
const runCrescentGeometry=bundle=>{const game=makeWizardGame([]);game.player=knightPlayer;const center=makeRealWizardEnemy(game);center.position.set(3.35,0,0);const off=makeRealWizardEnemy(game);off.position.set(3.25,0,1.65);game.enemies.enemies.push(center,off);const combat=new CombatSystem(game);const centerHp=center.hp,offHp=off.hp;combat.usePlayerSkill(bundle,knightPlayer,0);combat.update(.1);return{center:centerHp-center.hp,off:offHp-off.hp};};const wideGeometry=runCrescentGeometry(wideMoon),fullGeometry=runCrescentGeometry(fullMoon);ok(wideGeometry.off>0&&fullGeometry.off===0&&wideGeometry.center>0&&fullGeometry.center>wideGeometry.center,`actual Crescent geometry proves Wide off-axis and Full focused center (${JSON.stringify(wideGeometry)}/${JSON.stringify(fullGeometry)})`);
const blackGeometryBundle=resolveSkillForm(content.SKILLS.fan_of_knives,10,40,{tier40:'black_fan'});const needleGeometryBundle=resolveSkillForm(content.SKILLS.fan_of_knives,10,40,{tier40:'needle_line'});const runFanGeometry=bundle=>{const game=makeWizardGame([]);game.player=rogueSkillPlayer;const center=makeRealWizardEnemy(game);center.position.set(4.8,0,0);const off=makeRealWizardEnemy(game);off.position.set(3.8,0,-3.15);game.enemies.enemies.push(center,off);const combat=new CombatSystem(game);const centerHp=center.hp,offHp=off.hp;combat.usePlayerSkill(bundle,rogueSkillPlayer,0);const pierce=combat.projectiles[0].pierce;combat.update(.2);return{center:centerHp-center.hp,off:offHp-off.hp,pierce};};const blackGeometry=runFanGeometry(blackGeometryBundle),needleGeometry=runFanGeometry(needleGeometryBundle);ok(blackGeometry.off>0&&needleGeometry.off===0&&blackGeometry.center>0&&needleGeometry.center>blackGeometry.center&&needleGeometry.pierce===3,`actual Fan geometry proves Black off-axis and Needle focused center/pierce (${JSON.stringify(blackGeometry)}/${JSON.stringify(needleGeometry)})`);
const moonOn=makeWizardEnemy('moon-on',4,0),moonOff=makeWizardEnemy('moon-off',4,2);const moonKeys=[];for(const enemy of [moonOn,moonOff])enemy.takeDamage=(_r,_g,o={})=>{if(o.sameCastHit?.key)moonKeys.push([enemy.id,o.sameCastHit.key]);return{amount:1,killed:false};};const moonGame=makeWizardGame([moonOn,moonOff]);moonGame.player=knightPlayer;const moonCombat=new CombatSystem(moonGame);const moonBundle=resolveSkillForm(content.SKILLS.crescent,10,20,{});moonCombat.usePlayerSkill(moonBundle,knightPlayer,0);moonCombat.usePlayerSkill(moonBundle,knightPlayer,1);moonCombat.usePlayerSkill(moonBundle,knightPlayer,1);moonCombat.update(.4);ok(moonKeys.length===0,'Moon Scar has no authority before delay');moonCombat.update(.03);ok(moonKeys.filter(([id,key])=>id==='moon-on'&&key.includes(':scar:')).length===1&&moonKeys.every(([id])=>id!=='moon-off'),'Moon Scar fires exactly once, rejects duplicate phase, and misses off-line prey');
const crossTargets=Array.from({length:8},(_,i)=>makeWizardEnemy(`crosscap-${i}`,3.3,(i-3.5)*.08));const crosscurrentKeys=[];for(const enemy of crossTargets)enemy.takeDamage=(_r,_g,o={})=>{if(o.sameCastHit?.key?.includes(':cross:'))crosscurrentKeys.push(o.sameCastHit.key);return{amount:1,killed:false};};const crosscurrentGame=makeWizardGame(crossTargets);crosscurrentGame.player=knightPlayer;const crosscurrentCombat=new CombatSystem(crosscurrentGame);const crosscurrentBundle=resolveSkillForm(content.SKILLS.crescent,10,60,{tier40:'full_moon'});crosscurrentCombat.usePlayerSkill(crosscurrentBundle,knightPlayer,0);crosscurrentCombat.update(.1);crosscurrentCombat.update(.08);ok(crosscurrentKeys.length===6&&new Set(crosscurrentKeys).size===6,'Crosscurrent enforces exact global six and per-enemy one qualified pierce cuts');
const riftTargets=Array.from({length:5},(_,i)=>makeWizardEnemy(`rift-${i}`,2+i,0,i===3?'boss':'normal'));const riftKeys=[];for(const enemy of riftTargets)enemy.takeDamage=(_r,_g,o={})=>{if(/:rift-[0-2]:/.test(o.sameCastHit?.key??''))riftKeys.push(o.sameCastHit.key);return{amount:1,killed:false};};const cresRiftGame=makeWizardGame(riftTargets);cresRiftGame.player=knightPlayer;const cresRiftCombat=new CombatSystem(cresRiftGame);const riftBundle=resolveSkillForm(content.SKILLS.crescent,10,80,{tier40:'full_moon',tier80:'rift_trail'});cresRiftCombat.usePlayerSkill(riftBundle,knightPlayer,0);cresRiftCombat.usePlayerSkill(riftBundle,knightPlayer,1);for(let i=0;i<4;i+=1)cresRiftCombat.update(.18);ok(riftKeys.length===12&&riftTargets[0].stuns>0&&riftTargets[3].stuns===0&&riftTargets[3].staggers===12,`Rift Trail lands exact 3×4 ticks, controls normals, and converts boss control to stagger (${riftKeys.length}/${riftTargets[0].stuns}/${riftTargets[3].stuns}/${riftTargets[3].staggers})`);
const duplicateSources=Array.from({length:8},(_,i)=>makeWizardEnemy(`dup-${i}`,4.8,(i-3.5)*.18));const duplicateGame=makeWizardGame(duplicateSources);duplicateGame.player=rogueSkillPlayer;const duplicateCombat=new CombatSystem(duplicateGame);const duplicateBundle=resolveSkillForm(content.SKILLS.fan_of_knives,10,60,{tier40:'black_fan'});duplicateCombat.usePlayerSkill(duplicateBundle,rogueSkillPlayer,0);duplicateCombat.update(.2);const sourceHitsBeforeDuplicates=duplicateSources.map(source=>source.hits);duplicateCombat.usePlayerSkill(duplicateBundle,rogueSkillPlayer,1);const duplicateDamage=skillDamage(rogueSkillPlayer.attackPower,duplicateBundle.combat)*duplicateBundle.combat.duplicateMult;const shadowDuplicates=duplicateCombat.projectiles.filter(projectile=>projectile.reactionDepth===1&&Math.abs(projectile.damage-duplicateDamage)<1e-6);const duplicateOriginsStrict=shadowDuplicates.every(projectile=>duplicateSources.every(source=>projectile.mesh.position.distanceTo(source.position)>source.radius+projectile.radius));for(const projectile of duplicateCombat.projectiles)if(projectile.reactionDepth===1&&!shadowDuplicates.includes(projectile))projectile.life=0;duplicateCombat.update(.2);ok(shadowDuplicates.length>0&&shadowDuplicates.length<=6&&duplicateOriginsStrict&&duplicateSources.every((source,index)=>source.hits===sourceHitsBeforeDuplicates[index]),`Shadow Volley duplicates start beyond every combined collision radius and never rehit sources (${shadowDuplicates.length})`);

// Real Enemy.takeDamage iframe oracle: the primary hit claims the iframe, while
// one named same-cast authority may deliberately cross it once (never globally).
const thermalGame = makeWizardGame([]);
const thermalKinds = [];
thermalGame.effects = new Proxy({
  recipeSpellReaction(_position, kind) { thermalKinds.push(kind); },
}, { get: (target, key) => target[key] ?? (() => {}) });
const thermalEnemy = makeRealWizardEnemy(thermalGame);
thermalGame.enemies.enemies.push(thermalEnemy);
thermalEnemy.statuses.burn = { id: 'burn', remaining: 4, dps: .1, tick: .5, tickAcc: 0 };
thermalEnemy.setSpellPrime('burn', { remaining: 4 });
const thermalAmounts = [];
const thermalTakeDamage = thermalEnemy.takeDamage.bind(thermalEnemy);
thermalEnemy.takeDamage = (...args) => {
  const result = thermalTakeDamage(...args); thermalAmounts.push(result.amount); return result;
};
new CombatSystem(thermalGame).usePlayerSkill(
  resolveSkillForm(content.SKILLS.frost_nova, 10, 80, { tier40: 'glacier_ring', tier80: 'absolute_zero' }),
  wizardPlayer,
  0,
);
ok(thermalAmounts[0] > 0 && thermalEnemy.invulnerable > 0 && thermalAmounts[1] > 0
  && thermalEnemy.spellPrime === null && thermalEnemy.statuses.burn.remaining === 2
  && thermalKinds[0] === 'thermal_shock',
  'real Enemy iframe permits one bounded same-cast Thermal Shock after its landed primary');
const blockedRepeat = thermalEnemy.takeDamage(50, thermalGame, {
  multiHit: true, sameCastHit: { key: 'frost-1:thermal_shock', maxHits: 1 },
});
ok(blockedRepeat.amount === 0,
  'real Enemy iframe remains active outside the exact bounded same-cast authority');

const executeGame = makeWizardGame([]);
const executeEnemy = makeRealWizardEnemy(executeGame, 'elite');
executeGame.enemies.enemies.push(executeEnemy);
executeEnemy.setSpellPrime('crystal', { remaining: 4 });
const executeAmounts = [];
const executeTakeDamage = executeEnemy.takeDamage.bind(executeEnemy);
executeEnemy.takeDamage = (...args) => {
  const result = executeTakeDamage(...args); executeAmounts.push(result.amount); return result;
};
new CombatSystem(executeGame).usePlayerSkill(
  resolveSkillForm(content.SKILLS.frost_nova, 10, 80, { tier40: 'shatter_crown', tier80: 'crystal_execution' }),
  wizardPlayer,
  0,
);
ok(executeAmounts[0] > 0 && executeAmounts[1] > 0 && executeEnemy.spellPrime === null,
  'Crystal Execution consumes an existing proxy once and crosses the real primary iframe');

const noProxyGame = makeWizardGame([]);
const noProxyEnemy = makeRealWizardEnemy(noProxyGame, 'elite');
noProxyGame.enemies.enemies.push(noProxyEnemy);
const noProxyAmounts = [];
const noProxyTakeDamage = noProxyEnemy.takeDamage.bind(noProxyEnemy);
noProxyEnemy.takeDamage = (...args) => {
  const result = noProxyTakeDamage(...args); noProxyAmounts.push(result.amount); return result;
};
new CombatSystem(noProxyGame).usePlayerSkill(
  resolveSkillForm(content.SKILLS.frost_nova, 10, 80, { tier40: 'shatter_crown', tier80: 'crystal_execution' }),
  wizardPlayer,
  0,
);
ok(noProxyAmounts.filter(amount => amount > 0).length === 1 && noProxyEnemy.spellPrime?.id === 'crystal',
  'Crystal Execution grants no unconditional durable bonus without a pre-cast crystal proxy');

const realFireGame = makeWizardGame([]);
const realFireEnemy = makeRealWizardEnemy(realFireGame);
realFireGame.enemies.enemies.push(realFireEnemy);
realFireEnemy.statuses.slow = { id: 'slow', remaining: 4, power: .4 };
realFireEnemy.setSpellPrime('deep_chill', { remaining: 4 });
const realFireEvents = [];
const realFireTakeDamage = realFireEnemy.takeDamage.bind(realFireEnemy);
realFireEnemy.takeDamage = (...args) => {
  const result = realFireTakeDamage(...args); realFireEvents.push(`amount:${result.amount}`); return result;
};
realFireGame.effects = new Proxy({
  recipeFireBlast() { realFireEvents.push('blast-fx'); },
  recipeLivingStar() { realFireEvents.push('terminal'); },
}, { get: (target, key) => target[key] ?? (() => {}) });
const realFireCombat = new CombatSystem(realFireGame);
realFireCombat.usePlayerSkill(resolveSkillForm(content.SKILLS.fireball, 10, 100, {}), wizardPlayer, 0);
realFireCombat.update(.1);
const realFireAmounts = realFireEvents.filter(event => event.startsWith('amount:'))
  .map(event => Number(event.slice(7)));
const realFireAmountIndices = realFireEvents.map((event, index) => event.startsWith('amount:') ? index : -1)
  .filter(index => index >= 0);
ok(realFireAmounts.length === 4 && realFireAmounts.every(amount => amount > 0)
  && realFireEvents.indexOf('terminal') > realFireAmountIndices[2]
  && realFireEvents.indexOf('terminal') < realFireAmountIndices[3],
  'real Enemy iframe lands Fire primary, Steam, blast, then Prominence in authority order');

const steamGame = makeWizardGame([]);
const steamSource = makeRealWizardEnemy(steamGame);
const steamNear = makeRealWizardEnemy(steamGame);
const steamOutside = makeRealWizardEnemy(steamGame);
steamSource.position.set(2, 0, 0);
steamNear.position.set(2, 0, 2);
steamOutside.position.set(2, 0, 5);
steamSource.setSpellPrime('deep_chill', { remaining: 4 });
steamNear.setSpellPrime('deep_chill', { remaining: 4 });
steamOutside.setSpellPrime('deep_chill', { remaining: 4 });
steamSource.statuses.slow = { id: 'slow', remaining: 4, power: .4 };
const steamAmounts = new Map([[steamSource, []], [steamNear, []], [steamOutside, []]]);
for (const enemy of steamAmounts.keys()) {
  const takeDamage = enemy.takeDamage.bind(enemy);
  enemy.takeDamage = (raw, game, options = {}) => {
    const result = takeDamage(raw, game, options);
    if (options.sameCastHit?.key?.includes(':steam:')) steamAmounts.get(enemy).push(result.amount);
    return result;
  };
}
steamGame.enemies.enemies.push(steamSource, steamNear, steamOutside);
steamGame.effects = new Proxy({}, { get: () => () => {} });
const steamCombat = new CombatSystem(steamGame);
const steamResolved = resolveSkillForm(content.SKILLS.fireball, 10, 100, {});
const steamOracleBundle = Object.freeze({
  ...steamResolved,
  combat: Object.freeze({ ...steamResolved.combat, blastRadius: .1, cinders: 0, vortexTicks: 0, prominence: 0 }),
});
steamCombat.usePlayerSkill(steamOracleBundle, wizardPlayer, 0);
steamCombat.update(.1);
ok(steamAmounts.get(steamSource).some(amount => amount > 0)
  && steamAmounts.get(steamNear).some(amount => amount > 0)
  && steamAmounts.get(steamOutside).length === 0
  && steamSource.spellPrime === null
  && steamNear.spellPrime?.id === 'deep_chill'
  && steamOutside.spellPrime?.id === 'deep_chill',
  'Steam is a short bounded radial hit that consumes only the landed source prime');

const bossEnemyData = { ...realEnemyData, id: 'solar_oracle', name: 'Solar Oracle', boss: true };
const solarGame = makeWizardGame([]);
const solarBoss = new Enemy(solarGame.scene, bossEnemyData, new THREE.Vector3(2, 0, 0), { level: 1 }, realEnemyFactory);
solarGame.enemies.enemies.push(solarBoss);
solarGame.effects = new Proxy({}, { get: () => () => {} });
const solarDetonations = [];
const solarTakeDamage = solarBoss.takeDamage.bind(solarBoss);
solarBoss.takeDamage = (raw, game, options = {}) => {
  const before = solarBoss.solarBrandStacks ?? 0;
  const result = solarTakeDamage(raw, game, options);
  if (options.sameCastHit?.key?.includes(':solar-brand-detonation')) {
    solarDetonations.push({ amount: result.amount, before });
  }
  return result;
};
const solarBundle = resolveSkillForm(content.SKILLS.fireball, 10, 80, {
  tier40: 'comet_core', tier80: 'solar_brand',
});
for (let cast = 0; cast < 4; cast += 1) {
  solarBoss.invulnerable = 0;
  const solarCombat = new CombatSystem(solarGame);
  solarCombat.usePlayerSkill(solarBundle, wizardPlayer, 0);
  solarCombat.update(.1);
  solarCombat.clear();
}
ok(solarDetonations.length === 1 && solarDetonations[0].before === 4
  && solarDetonations[0].amount > 0 && solarBoss.solarBrandStacks === 0,
  'four real landed Fireballs deal Solar Brand detonation through iframe before resetting stacks');

const zeroSolarGame = makeWizardGame([]);
const zeroSolarBoss = new Enemy(zeroSolarGame.scene, bossEnemyData, new THREE.Vector3(2, 0, 0), { level: 1 }, realEnemyFactory);
zeroSolarBoss.solarBrandStacks = 3;
zeroSolarGame.enemies.enemies.push(zeroSolarBoss);
zeroSolarGame.effects = new Proxy({}, { get: () => () => {} });
const zeroSolarTakeDamage = zeroSolarBoss.takeDamage.bind(zeroSolarBoss);
zeroSolarBoss.takeDamage = (raw, game, options = {}) => options.sameCastHit?.key?.includes(':solar-brand-detonation')
  ? { amount: 0, killed: false }
  : zeroSolarTakeDamage(raw, game, options);
const zeroSolarCombat = new CombatSystem(zeroSolarGame);
zeroSolarCombat.usePlayerSkill(solarBundle, wizardPlayer, 0);
zeroSolarCombat.update(.1);
ok(zeroSolarBoss.solarBrandStacks === 4,
  'Solar Brand keeps capped stacks when its fourth-hit detonation deals zero damage');

const rangerBranchChoices = {
  piercing_shot: [['rail_arrow', 'crowd_skewer'], ['rail_arrow', 'dragon_piercer'], ['split_arrow', 'crowd_skewer'], ['split_arrow', 'dragon_piercer']],
  caltrop_trap: [['briar_field', 'snare_bloom'], ['briar_field', 'mine_garden'], ['blast_seed', 'snare_bloom'], ['blast_seed', 'mine_garden']],
  vault_shot: [['gale_vault', 'escape_artist'], ['gale_vault', 'perfect_distance'], ['counter_volley', 'escape_artist'], ['counter_volley', 'perfect_distance']],
  hunter_mark: [['pack_hunt', 'chain_verdict'], ['pack_hunt', 'trophy_shot'], ['prime_target', 'chain_verdict'], ['prime_target', 'trophy_shot']],
};
let rangerBranchRuns = 0;
for (const [skillId, choices] of Object.entries(rangerBranchChoices)) for (const [tier40, tier80] of choices) {
  const rangerPlayer = { ...wizardPlayer, classId: 'ranger', position: new THREE.Vector3(), facing: new THREE.Vector3(1, 0, 0), invulnerable: 0,
    predatorVerdict: null, thornField: null };
  const game = makeWizardGame([]); game.player = rangerPlayer;
  game.camera = { getWorldQuaternion(quaternion) { return quaternion.identity(); } };
  const normal = makeRealWizardEnemy(game); normal.position.set(2, 0, 0);
  const elite = makeRealWizardEnemy(game, 'elite'); elite.position.set(8, 0, 0);
  game.enemies.enemies.push(normal, elite);
  const combat = new CombatSystem(game);
  combat.usePlayerSkill(resolveSkillForm(content.SKILLS[skillId], 10, 100, { tier40, tier80 }), rangerPlayer, 0);
  for (let tick = 0; tick < 8; tick += 1) {
    combat.update(.5);
    normal.update(.5, game); elite.update(.5, game);
    game.elapsed += .5;
  }
  ok(Number.isFinite(normal.hp) && Number.isFinite(elite.hp) && combat.projectiles.length <= 12,
    `real Enemy ranger runtime remains bounded for ${skillId} ${tier40}/${tier80}`);
  combat.clear();
  ok(rangerPlayer.thornField === null && rangerPlayer.predatorVerdict === null,
    `ranger clear removes field/mark authority for ${skillId} ${tier40}/${tier80}`);
  rangerBranchRuns += 1;
}
ok(rangerBranchRuns === 16, 'all Ranger Lv40/Lv80 branch combinations execute against real Enemy iframe models');

const rangerProbePlayer = () => ({ ...wizardPlayer, classId: 'ranger', position: new THREE.Vector3(),
  facing: new THREE.Vector3(1, 0, 0), invulnerable: 0, predatorVerdict: null, thornField: null });
const rangerProbe = (enemies = []) => {
  const player = rangerProbePlayer(); const game = makeWizardGame(enemies); game.player = player;
  const events = [];
  game.effects = new Proxy({
    recipeArrowStreak(_p, _d, _t, rail) { events.push(`rail:${rail}`); },
    recipeRangerBackwardCorridor(points) { events.push(`corridor:${points.length}`); },
    recipeTrapField() { events.push('field'); }, recipeThornGrid() { events.push('grid-vfx'); },
  }, { get: (target, key) => target[key] ?? (() => {}) });
  return { player, game, events, combat: new CombatSystem(game) };
};

const railProbe = rangerProbe();
const railBundle = resolveSkillForm(content.SKILLS.piercing_shot, 10, 100, { tier40: 'rail_arrow', tier80: 'crowd_skewer' });
railProbe.combat.usePlayerSkill(railBundle, railProbe.player, 0);
ok(railProbe.events[0] === 'rail:true'
  && Math.abs(railProbe.combat.projectiles[0].damage
    - skillDamage(railProbe.player.attackPower, railBundle.combat) * railBundle.combat.damageMult) < 1e-6,
  'Rail Arrow exposes rail VFX and applies its main-projectile damage ratio');
ok(railProbe.combat.projectiles[0].pierce
  === Math.round(railBundle.combat.pierce + railBundle.combat.crowdPierce),
  'Crowd Skewer adds its exact bounded main-projectile pierce');

const splitSource = makeWizardEnemy('split-source', 3.5, 0);
const splitProbe = rangerProbe([splitSource]);
const splitBundle = resolveSkillForm(content.SKILLS.piercing_shot, 10, 100, { tier40: 'split_arrow', tier80: 'dragon_piercer' });
splitProbe.combat.usePlayerSkill(splitBundle, splitProbe.player, 0); splitProbe.combat.update(.1);
const splitChildren = splitProbe.combat.projectiles.filter(projectile => projectile.reactionDepth === 1);
const forwardSplitChildren = splitChildren.filter(projectile => projectile.direction.dot(splitProbe.player.facing) > .9);
ok(forwardSplitChildren.length === 2
  && splitChildren.every(projectile => projectile.mesh.position.distanceTo(splitSource.position) > splitSource.radius),
  'Split Arrow produces primary plus exactly two source-excluded children');
ok(splitSource.staggers === 0, 'Dragon Piercer does not stagger ordinary prey');
const dragon = makeWizardEnemy('dragon', 3.5, 0, 'boss');
const dragonProbe = rangerProbe([dragon]); dragonProbe.combat.usePlayerSkill(splitBundle, dragonProbe.player, 0); dragonProbe.combat.update(.1);
ok(dragon.staggers === splitBundle.combat.bossStagger, 'Dragon Piercer applies its exact durable stagger once');
splitProbe.combat.update(2);
ok(splitProbe.events.filter(event => event.startsWith('corridor:')).length === 1,
  'Backward Release emits one corridor authority rather than one projectile per point');

const thornKeys = [];
const thornTargets = [-2.1, -1.05, 0, 1.05, 2.1].map((z, index) => {
  const target = makeWizardEnemy(`thorn-${index}`, 7.5, z);
  target.takeDamage = (_raw, _game, options = {}) => { thornKeys.push(options.sameCastHit?.key ?? 'seed-arrow'); return { amount: 1, killed: false }; };
  return target;
});
const thornProbe = rangerProbe(thornTargets);
const briar = resolveSkillForm(content.SKILLS.caltrop_trap, 10, 100, { tier40: 'briar_field', tier80: 'snare_bloom' });
thornProbe.combat.usePlayerSkill(briar, thornProbe.player); thornProbe.combat.update(.5);
thornProbe.combat.update(.05); thornProbe.combat.update(.03);
for (let i = 0; i < 8; i += 1) thornProbe.combat.update(.5);
const seedIndex = thornKeys.findIndex(key => key.includes('seed-impact'));
const openIndex = thornKeys.findIndex(key => key.includes(':open'));
const tickIndex = thornKeys.findIndex(key => key.includes(':tick-0'));
const closeIndex = thornKeys.findIndex(key => key.includes(':close'));
ok(seedIndex >= 0 && openIndex > seedIndex && tickIndex > openIndex && closeIndex > tickIndex
  && thornProbe.events.indexOf('grid-vfx') > thornProbe.events.indexOf('field'),
  'Thornburst orders seed, open, ticks, close, then staged grid VFX');
ok(thornKeys.filter(key => key.includes(':line-')).some(key => key.includes('-4:')),
  'Briar Field consumes all five declared cast-facing line indices');

const legacyVault = rangerProbe();
legacyVault.combat.usePlayerSkill(resolveSkillForm(content.SKILLS.vault_shot, 10, 19, {}), legacyVault.player);
ok(legacyVault.player.position.x < 0 && legacyVault.combat.projectiles.length > 0,
  'pre-Level-20 Vault preserves immediate movement and volley authority');
const skyProbe = rangerProbe();
const sky = resolveSkillForm(content.SKILLS.vault_shot, 10, 100, { tier40: 'gale_vault', tier80: 'escape_artist' });
skyProbe.combat.usePlayerSkill(sky, skyProbe.player); skyProbe.combat.update(.06);
const launchCount = skyProbe.combat.projectiles.length; skyProbe.combat.update(.1);
const airCount = skyProbe.combat.projectiles.length - launchCount; skyProbe.combat.update(.2);
const landingCount = skyProbe.combat.projectiles.length - launchCount - airCount;
ok(launchCount === 4 && airCount === 4 && landingCount === 4 && skyProbe.combat.projectiles.length === 12,
  'Sky Hunter allocates exact 4/4/4 centered layers within twelve arrows');
const staleVault = rangerProbe(); staleVault.combat.usePlayerSkill(sky, staleVault.player); staleVault.combat.usePlayerSkill(sky, staleVault.player);
staleVault.player.classId = 'wizard'; staleVault.combat.update(1);
ok(staleVault.player.position.equals(new THREE.Vector3()), 'Vault generation and class guard cancel stale delayed movement');
const idealBundle = resolveSkillForm(content.SKILLS.vault_shot, 10, 100, { tier40: 'counter_volley', tier80: 'perfect_distance' });
const idealLandingX = -idealBundle.combat.dash * idealBundle.combat.dashMult;
const idealEnemies = [6.99, 7, 11, 11.01].map((distance, index) => {
  const enemy = makeWizardEnemy(`ideal-${index}`, idealLandingX + distance, 0, 'elite'); return enemy;
});
const idealProbe = rangerProbe(idealEnemies);
idealProbe.combat.usePlayerSkill(idealBundle, idealProbe.player); idealProbe.combat.update(.31);
const idealLanding = idealProbe.combat.projectiles.find(projectile => typeof projectile.onHit === 'function');
for (const enemy of idealEnemies) enemy.hits = 0;
for (const enemy of idealEnemies) idealLanding.onHit?.(enemy);
ok(idealEnemies[0].hits === 0 && idealEnemies[1].hits === 1 && idealEnemies[2].hits === 1 && idealEnemies[3].hits === 0,
  'Perfect Distance landing onHit accepts exact 7/11 boundaries and rejects 6.99/11.01');

const verdictTargets = [makeWizardEnemy('prey', 3, 0), makeWizardEnemy('pack-a', 4, 1), makeWizardEnemy('pack-b', 4, -1), makeWizardEnemy('pack-c', 5, 0)];
const verdictProbe = rangerProbe(verdictTargets);
const pack = resolveSkillForm(content.SKILLS.hunter_mark, 10, 100, { tier40: 'pack_hunt', tier80: 'chain_verdict' });
verdictProbe.combat.usePlayerSkill(pack, verdictProbe.player);
verdictProbe.player.predatorVerdict.stored = verdictProbe.player.predatorVerdict.cap;
verdictProbe.combat.usePlayerSkill(pack, verdictProbe.player);
ok(verdictProbe.player.predatorVerdict?.depth === 1
  && verdictProbe.player.predatorVerdict.linked.length === 1
  && verdictProbe.player.predatorVerdict.detonationScale === pack.combat.transferMult,
  'Pack Hunt creates exactly two distinct reduced depth-one transient marks');
const transferGeneration = verdictProbe.player.predatorVerdict.generation;
ok(verdictProbe.combat.expirePredatorVerdict(verdictProbe.player, transferGeneration)
  && verdictProbe.player.predatorVerdict === null,
  'transferred Verdict expiry detonates atomically once without recursive transfer');
const trophyBoss = makeWizardEnemy('trophy-boss', 3, 0, 'boss');
const trophyProbe = rangerProbe([trophyBoss]);
const trophy = resolveSkillForm(content.SKILLS.hunter_mark, 10, 100, { tier40: 'prime_target', tier80: 'trophy_shot' });
trophyProbe.combat.usePlayerSkill(trophy, trophyProbe.player);
const trophyGeneration = trophyProbe.player.predatorVerdict.generation;
trophyProbe.combat.expirePredatorVerdict(trophyProbe.player, trophyGeneration);
ok(trophyBoss.staggers === trophy.combat.bossStagger && trophyProbe.player.predatorVerdict === null,
  'Trophy Shot expiry applies exact boss stagger and clears authority once');
const chainTargets = [makeWizardEnemy('chain-root', 3, 0), makeWizardEnemy('chain-1', 4, 1),
  makeWizardEnemy('chain-2', 4, -1), makeWizardEnemy('chain-3', 5, 0)];
const chainKeys = new Map(chainTargets.map(enemy => [enemy.id, []]));
for (const enemy of chainTargets) enemy.takeDamage = (_raw, _game, options = {}) => {
  chainKeys.get(enemy.id).push(options.sameCastHit?.key ?? 'other'); return { amount: 1, killed: false };
};
const chainProbe = rangerProbe(chainTargets);
const chain = resolveSkillForm(content.SKILLS.hunter_mark, 10, 100, { tier40: 'prime_target', tier80: 'chain_verdict' });
chainProbe.combat.usePlayerSkill(chain, chainProbe.player);
chainProbe.combat.expirePredatorVerdict(chainProbe.player, chainProbe.player.predatorVerdict.generation);
ok(chainKeys.get('chain-1').filter(key => key.includes(':chain-')).length === 1
  && chainKeys.get('chain-2').filter(key => key.includes(':chain-')).length === 1
  && chainKeys.get('chain-3').filter(key => key.includes(':chain-')).length === 0,
  'Chain Verdict hits exactly two nearest secondary targets with no recursive third hop');
const controlEnemies = [
  makeWizardEnemy('normal', 2, 0), makeWizardEnemy('elite', 0, 2, 'elite'), makeWizardEnemy('boss', -2, 0, 'boss'),
];
const absoluteCombat = new CombatSystem(makeWizardGame(controlEnemies));
absoluteCombat.usePlayerSkill(resolveSkillForm(content.SKILLS.frost_nova, 10, 80, { tier40: 'glacier_ring', tier80: 'absolute_zero' }), wizardPlayer, 0);
absoluteCombat.update(.2);
ok(controlEnemies[0].stuns > 0 && controlEnemies[1].staggers > 0 && controlEnemies[2].staggers > 0,
  'Absolute Zero converts category control into normal stun and elite/boss stagger');
const executionEnemies = [makeWizardEnemy('plain', 2, 0), makeWizardEnemy('durable', 0, 2, 'elite')];
executionEnemies[1].setSpellPrime('crystal', { remaining: 4 });
const executionCombat = new CombatSystem(makeWizardGame(executionEnemies));
executionCombat.usePlayerSkill(resolveSkillForm(content.SKILLS.frost_nova, 10, 80, { tier40: 'shatter_crown', tier80: 'crystal_execution' }), wizardPlayer, 0);
executionCombat.update(.2);
ok(executionEnemies[1].hits > executionEnemies[0].hits && executionEnemies[1].spellPrime === null,
  'Crystal Execution adds runtime shard authority only to a durable pre-cast crystal proxy');

const runMeteorPattern = (choices, enemies = []) => {
  const points = [];
  const game = makeWizardGame(enemies);
  game.effects = new Proxy({ recipeMeteorDrop(point) { points.push([point.x, point.z]); } }, { get: (target, key) => target[key] ?? (() => {}) });
  const combat = new CombatSystem(game);
  combat.usePlayerSkill(resolveSkillForm(content.SKILLS.meteor_storm, 10, 100, choices), wizardPlayer);
  combat.update(1); combat.update(1); combat.update(1);
  return points;
};
const rainA = runMeteorPattern({ tier40: 'meteor_rain', tier80: 'orbit_fall' });
const rainB = runMeteorPattern({ tier40: 'meteor_rain', tier80: 'orbit_fall' });
const extinctionPoints = runMeteorPattern({ tier40: 'extinction', tier80: 'world_ender' });
ok(JSON.stringify(rainA) === JSON.stringify(rainB) && rainA.length <= 10,
  'Meteor Rain coordinates and impact order are deterministic and capped');
ok(extinctionPoints.length < rainA.length,
  'Extinction runtime uses fewer impacts than Meteor Rain before its larger finale');

const riftEnemy = makeWizardEnemy('rift-proxy', 9.65, -1.8);
riftEnemy.setSpellPrime('rift_anchor', { remaining: 4 });
const riftDrops = [];
const gravityStages = [];
const riftKinds = [];
const riftGame = makeWizardGame([riftEnemy]);
riftGame.effects = new Proxy({
  recipeMeteorDrop(point) { riftDrops.push(point.clone()); },
  recipeGravityLens(from, to, _theme, index, count, apex) {
    gravityStages.push({ from: from.clone(), to: to.clone(), index, count, apex });
  },
  recipeSpellReaction(_position, kind) { riftKinds.push(kind); },
}, { get: (target, key) => target[key] ?? (() => {}) });
const riftCombat = new CombatSystem(riftGame);
riftCombat.usePlayerSkill(resolveSkillForm(content.SKILLS.meteor_storm, 10, 100, {
  tier40: 'meteor_rain', tier80: 'world_ender',
}), wizardPlayer);
for (let i = 0; i < 5; i += 1) riftCombat.update(1);
const shiftedIndex = riftDrops.findIndex((point, index) => point.distanceTo(
  new THREE.Vector3(rainA[index][0], 0, rainA[index][1]),
) > 1e-5);
const shiftedDistance = shiftedIndex >= 0 ? riftDrops[shiftedIndex].distanceTo(
  new THREE.Vector3(rainA[shiftedIndex][0], 0, rainA[shiftedIndex][1]),
) : Infinity;
ok(shiftedIndex >= 0 && shiftedDistance <= 1.25001
  && riftEnemy.spellPrime === null && riftKinds[0] === 'rift_impact',
  'Meteor plus Rift Anchor shifts the pre-impact point by at most 1.25 and consumes on landed impact');
ok(gravityStages.length === riftDrops.length
  && gravityStages.every(stage => stage.index >= 0
    && stage.count === riftDrops.length
    && stage.from.y > stage.to.y
    && stage.to.equals(riftDrops[stage.index])),
  'Gravity Lens receives staged fall origins, resolved targets, and deterministic impact indices');
ok(effectsSrc.includes('recipeGravityLens(from, to, theme, impactIndex')
  && effectsSrc.includes('this.trail(point, stage % 2'),
  'Gravity Lens presentation renders curved staged pooled trails instead of vertical-only rings');

const terminalEvents = [];
const fractureOracle = makeWizardEnemy('fracture-oracle', 10, 0);
fractureOracle.radius = 100;
fractureOracle.takeDamage = () => { terminalEvents.push('damage'); return { amount: 1, killed: false }; };
const fractureGame = makeWizardGame([fractureOracle]);
fractureGame.effects = new Proxy({
  recipeMeteorFinale() { terminalEvents.push('finale'); },
}, { get: (target, key) => target[key] ?? (() => {}) });
const fractureCombat = new CombatSystem(fractureGame);
fractureCombat.usePlayerSkill(resolveSkillForm(content.SKILLS.meteor_storm, 10, 100, {
  tier40: 'meteor_rain', tier80: 'world_ender',
}), wizardPlayer);
for (let i = 0; i < 5; i += 1) fractureCombat.update(1);
const finaleIndex = terminalEvents.indexOf('finale');
ok(finaleIndex >= 20
  && terminalEvents.slice(0, finaleIndex).filter(event => event === 'damage').length === 20,
  'Meteor terminal waits for all ten impacts and ten scheduled authoritative fractures');

const lifecycleCounts = { pull: 0, slam: 0, apex: 0, bossCue: 0 };
const lifecyclePlayer = {
  alive: true, position: new THREE.Vector3(), facing: new THREE.Vector3(1, 0, 0), invulnerable: 0,
  attackPower: 10, critChance: 0, critMultiplier: 1.85, skillPower: 1, leech: 0,
  passiveEffects: { statusCrit: 0, execute: 0 }, classId: 'aerin', weapon: null,
};
const lifecycleGame = {
  player: lifecyclePlayer,
  enemies: { enemies: [] },
  world: { heightAt: () => 0, resolvePosition() {} },
  effects: {
    recipeVortexPull() { lifecycleCounts.pull += 1; },
    recipeBossPullResist() { lifecycleCounts.bossCue += 1; },
    recipeGroundFracture() { lifecycleCounts.slam += 1; },
    recipeJudgmentApex() { lifecycleCounts.apex += 1; },
  },
};
const lifecycleCombat = new CombatSystem(lifecycleGame);
const castA = resolveSkillForm(judgment, 5, 20, {});
const castB = resolveSkillForm(judgment, 6, 20, {});
lifecycleCombat.usePlayerSkill(castA, lifecyclePlayer, 1);
ok(lifecycleCounts.pull === 0 && lifecycleCounts.slam === 0,
  'Iron Judgment rejects an orphan phase 1 without initializing cast state');
lifecycleCombat.usePlayerSkill(castA, lifecyclePlayer, 0);
lifecycleCombat.usePlayerSkill(castA, lifecyclePlayer, 0);
lifecycleCombat.usePlayerSkill(castA, lifecyclePlayer, 1);
lifecycleCombat.usePlayerSkill(castA, lifecyclePlayer, 1);
ok(lifecycleCounts.pull === 1 && lifecycleCounts.slam === 1,
  'Iron Judgment ignores duplicate phases and terminal replay after state deletion');
lifecycleCombat.usePlayerSkill(castA, lifecyclePlayer, 0);
lifecycleCombat.usePlayerSkill(castB, lifecyclePlayer, 0);
lifecycleCombat.usePlayerSkill(castA, lifecyclePlayer, 1);
lifecycleCombat.usePlayerSkill(castB, lifecyclePlayer, 1);
ok(lifecycleCounts.pull === 3 && lifecycleCounts.slam === 2,
  'Iron Judgment only finishes the current bundle across consecutive casts');
lifecycleCombat.usePlayerSkill(castA, lifecyclePlayer, 'full');
ok(lifecycleCounts.pull === 4 && lifecycleCounts.slam === 3,
  'Iron Judgment full execution initializes and terminates one complete cast');
let bossPullCalls = 0;
const bossAt = lifecyclePlayer.position.clone().addScaledVector(lifecyclePlayer.facing, castA.combat.leap);
const lifecycleBoss = {
  alive: true, controlCategory: 'boss', radius: 1.25, position: bossAt.clone(), statuses: {},
  hp: 100, maxHp: 100, takeDamage: () => ({ amount: 0 }),
  pullToward() { bossPullCalls += 1; },
};
lifecycleGame.enemies.enemies = [lifecycleBoss];
lifecycleCombat.usePlayerSkill(castA, lifecyclePlayer, 0);
ok(lifecycleBoss.position.equals(bossAt) && bossPullCalls === 0 && lifecycleCounts.bossCue === 1,
  'Iron Judgment represents boss pull with VFX only and leaves authority position unchanged');
lifecycleCombat.usePlayerSkill(castA, lifecyclePlayer, 1);

let frenzyExitVfx = 0;
const terminalPlayer = { alive: true, position: new THREE.Vector3(), attackPower: 10 };
const terminalCombat = new CombatSystem({
  player: terminalPlayer, enemies: { enemies: [] },
  effects: { recipeFrenzyExit() { frenzyExitVfx += 1; } },
});
const terminalState = { generation: 7, exitMult: 0.1, contactCap: 12, contactCount: 6 };
ok(terminalCombat.endShadowFrenzy(terminalPlayer, terminalState) === 6
  && terminalCombat.endShadowFrenzy(terminalPlayer, terminalState) === 0
  && frenzyExitVfx === 1,
  'Shadow Frenzy terminal generation applies VFX and damage authority at most once');

const makeContactHarness = ({ frenzy = false, timingScale = 1, echo = 0 } = {}) => {
  const root = new THREE.Group();
  const mainTip = new THREE.Group(); mainTip.position.set(1, 1, 0); root.add(mainTip);
  const offhandTip = new THREE.Group(); offhandTip.position.set(-1, 1, 0); root.add(offhandTip);
  const arcs = []; const rush = []; let echoes = 0;
  const noop = () => {};
  const effects = {
    dust: noop, trail: noop, swingTrail: noop, ring: noop, pillar: noop, burst: noop,
    swingArc(position) { arcs.push(position.clone()); },
    recipeDualBladeCross: noop,
    recipeShadowCuts() { echoes += 1; },
    recipeFangRush(position) { rush.push(position.clone()); },
  };
  const player = {
    alive: true, classId: 'rogue', position: root.position, mesh: root,
    facing: new THREE.Vector3(0, 0, 1), velocity: new THREE.Vector3(), level: 1,
    attackPower: 10, weapon: { rarityColor: 0x55ddaa }, refs: { mainBladeTip: mainTip, offhandBladeTip: offhandTip },
    frenzyActive: frenzy, frenzyTimingScale: timingScale,
    shadowFrenzy: { offhandEcho: echo }, registerFrenzyContact: () => null,
    energyComboHits: 2,
  };
  const game = { player, enemies: { enemies: [] }, effects, audio: { swing: noop } };
  return { player, combat: new CombatSystem(game), arcs, rush, get echoes() { return echoes; } };
};
const contacts = makeContactHarness();
contacts.combat.playerAttack(contacts.player, 0, 7);
contacts.combat.update(0.021);
contacts.combat.update(0.051);
contacts.combat.playerAttack(contacts.player, 1, 7);
contacts.combat.update(0.026);
contacts.combat.update(0.051);
ok(contacts.arcs.length === 4
  && contacts.arcs.map(origin => Math.sign(origin.x)).join(',') === '1,-1,-1,1',
  'rogue blade-tip hit origins carry R/L alternation across consecutive attack inputs');
const normalTiming = makeContactHarness();
normalTiming.combat.playerAttack(normalTiming.player, 0, 7);
const normalMaxDelay = Math.max(...normalTiming.combat.delayed.map(action => action.time));
const fastTiming = makeContactHarness({ frenzy: true, timingScale: 0.72, echo: 0.2 });
fastTiming.combat.playerAttack(fastTiming.player, 0, 7);
const fastMaxContactDelay = Math.max(...fastTiming.combat.delayed.slice(0, 2).map(action => action.time));
fastTiming.combat.update(1);
ok(fastMaxContactDelay < normalMaxDelay && fastTiming.echoes === 1,
  'frenzy compresses delayed contacts and schedules exactly one offhand echo per input');
const rushContacts = makeContactHarness({ frenzy: true, timingScale: 0.7 });
rushContacts.combat.releaseEnergyBurst(rushContacts.player, {
  effect: 'dagger_rush', comboInterval: 0.1, comboRange: 3, comboArc: 1.5, comboMult: 0.5,
});
rushContacts.combat.update(0.041);
rushContacts.combat.update(0.071);
ok(rushContacts.rush.length === 2
  && rushContacts.rush.map(origin => Math.sign(origin.x)).join(',') === '1,-1',
  'Dagger Rush samples actual main/offhand blade-tip origins in alternating order');
function methodBody(src, name) {
  // Prefer method *definitions* (… ) { … }, not call sites like this._name(...);
  const defRe = new RegExp(
    `(?:^|\\n)[ \\t]*(?:_|#)${name}\\s*\\([^)]*\\)\\s*\\{`,
    'm',
  );
  const m = defRe.exec(src);
  if (!m) return '';
  const start = m.index + (m[0].startsWith('\n') ? 1 : 0);
  const rest = src.slice(start);
  // Next method: class indent (`  _foo(`) or mixin object (`_foo(` / `  _foo(`).
  // Skip the opening line by searching after the first newline.
  const afterOpen = rest.indexOf('\n');
  const tail = afterOpen >= 0 ? rest.slice(afterOpen) : rest;
  const nextRel = tail.search(/\n[ \t]*(?:_|#)[a-zA-Z][a-zA-Z0-9_]*\s*\(/);
  if (nextRel >= 0) return rest.slice(0, afterOpen + nextRel);
  return rest.slice(0, 8000);
}
for (const name of ['frostNova', 'arcaneBlink', 'meteorStorm', 'whirlwind', 'skyfall', 'starburst', 'crescent']) {
  const body = methodBody(combatSrc, name);
  ok(body.length > 40, `found handler body _${name}`);
  ok(!/\*\s*player\.skillPower/.test(body), `_${name} does not pre-multiply player.skillPower`);
}
const meleeBody = methodBody(combatSrc, 'meleeAttack');
const daggerRushBody = methodBody(combatSrc, 'daggerRushBurst');
const shadowstepBody = methodBody(combatSrc, 'shadowstep');
ok(
  Math.min(
    shadowstepBody.indexOf('_damageEnemy') >= 0 ? shadowstepBody.indexOf('_damageEnemy') : Infinity,
    shadowstepBody.indexOf('#damageEnemy') >= 0 ? shadowstepBody.indexOf('#damageEnemy') : Infinity,
  )
  < shadowstepBody.indexOf('activateShadowFrenzy'),
  'Shadow Frenzy recast still performs dash damage before the no-refresh activation guard',
);
ok(meleeBody.includes('(combo + pulse) % 2') && meleeBody.includes('offhandEcho')
  && meleeBody.includes('frenzyTimingScale'),
  'rogue basics alternate blade contacts and schedule one haste-compressed offhand echo');
ok(daggerRushBody.includes('i % 2') && daggerRushBody.includes('frenzyTimingScale')
  && daggerRushBody.includes('recipeDualBladeCross'),
  'Dagger Rush alternates hands, compresses timing, and finishes with both blades');
ok(combatSrc.includes('slice(0, contact.chainCap)') && combatSrc.includes('bossRampStep')
  && !methodBody(combatSrc, 'applyFrenzyContact').includes('onHit:'),
  'frenzy chain/ramp effects are capped and cannot recursively trigger contacts');
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
ok(validateSkillEvolutionSchema(content.SKILLS.starburst).length === 0,
  'Starburst evolution schema is valid');
ok(validateSkillEvolutionSchema(content.SKILLS.death_lotus).length === 0,
  'Death Lotus evolution schema is valid');
const star20 = resolveSkillForm(content.SKILLS.starburst, 10, 20, {});
const star60 = resolveSkillForm(content.SKILLS.starburst, 10, 60, { tier40: 'constellation' });
const starPrison = resolveSkillForm(content.SKILLS.starburst, 10, 100, { tier40: 'constellation', tier80: 'oath_prison' });
const starCrown = resolveSkillForm(content.SKILLS.starburst, 10, 100, { tier40: 'execution_field', tier80: 'falling_crown' });
ok(star20.timeline.hits.length === 2 && star60.combat.embeddedCap === 6
  && starPrison.timeline.hits.length === 3 && starPrison.combat.regularBlades === 10
  && starPrison.combat.royalBlades === 1 && starPrison.combat.ringActs === 3,
  "Starburst resolves Greatblade, Embedded Sky, and Heaven's Arsenal gates");
const lotus20 = resolveSkillForm(content.SKILLS.death_lotus, 10, 20, {});
const lotus60 = resolveSkillForm(content.SKILLS.death_lotus, 10, 60, { tier40: 'crimson_lotus' });
const lotusHarvest = resolveSkillForm(content.SKILLS.death_lotus, 10, 100, { tier40: 'crimson_lotus', tier80: 'harvest' });
const lotusTarget = resolveSkillForm(content.SKILLS.death_lotus, 10, 100, { tier40: 'phantom_lotus', tier80: 'one_target' });
ok(lotus20.combat.petalLines === 8 && lotus60.combat.echoCap === 6
  && lotusHarvest.timeline.hits.length === 3 && lotusHarvest.combat.petalLines === 8
  && lotusTarget.combat.redirectCap === 4,
  'Death Lotus resolves Eight Petal, Shadow Petals, and Moonless Lotus gates');

const legacyStarLow = resolveSkillForm(content.SKILLS.starburst, 1, 1, {});
const legacyStarHigh = resolveSkillForm(content.SKILLS.starburst, 10, 1, {});
const legacyLotusLow = resolveSkillForm(content.SKILLS.death_lotus, 1, 1, {});
const legacyLotusHigh = resolveSkillForm(content.SKILLS.death_lotus, 10, 1, {});
ok(legacyStarHigh.combat.hits > legacyStarLow.combat.hits
  && legacyLotusHigh.combat.hits > legacyLotusLow.combat.hits,
  'Starburst and Death Lotus preserve below-20 rank-scaled contact counts');
const legacyStarCount = Math.round(legacyStarLow.combat.hits);
const legacyStarEvents = [];
const legacyStarGame = makeWizardGame([]); legacyStarGame.player = knightPlayer;
legacyStarGame.effects = new Proxy({
  recipeStarBlade(_point, _theme, index) { legacyStarEvents.push(`regular:${index}`); },
  recipeStarFinale() { legacyStarEvents.push('finale'); },
}, { get: (target, key) => target[key] ?? (() => {}) });
const legacyStarCombat = new CombatSystem(legacyStarGame);
legacyStarCombat.usePlayerSkill(legacyStarLow, knightPlayer, 'full');
for (let i = 0; i < legacyStarCount + 2; i += 1) legacyStarCombat.update(5);
ok(legacyStarEvents.join(',') === [
  ...Array.from({ length: legacyStarCount }, (_, index) => `regular:${index}`), 'finale',
].join(','), `legacy Starburst coarse fallback owns exact 0→${legacyStarCount - 1} then one finale (${legacyStarEvents.join(',')})`);

const legacyLotusCount = Math.round(legacyLotusLow.combat.hits);
const legacyLotusEvents = [];
const legacyLotusEnemy = makeWizardEnemy('legacy-lotus', 0, 0);
legacyLotusEnemy.takeDamage = (_raw, _game, options = {}) => {
  legacyLotusEvents.push(options.sameCastHit?.key?.match(/line-(\d+)/)?.[1] ?? 'finale');
  return { amount: 1, killed: false };
};
const legacyLotusGame = makeWizardGame([legacyLotusEnemy]); legacyLotusGame.player = rogueSkillPlayer;
const legacyLotusCombat = new CombatSystem(legacyLotusGame);
legacyLotusCombat.usePlayerSkill(legacyLotusLow, rogueSkillPlayer, 'full');
for (let i = 0; i < legacyLotusCount + 2; i += 1) legacyLotusCombat.update(5);
ok(legacyLotusEvents.join(',') === [
  ...Array.from({ length: legacyLotusCount }, (_, index) => String(index)), 'finale',
].join(','), `legacy Death Lotus coarse fallback owns exact 0→${legacyLotusCount - 1} then one finale (${legacyLotusEvents.join(',')})`);

const legacyFrame = .005;
const runLegacyStarTiming = bundle => {
  let clock = 0; const regular = []; const finales = [];
  const game = makeWizardGame([]); game.player = knightPlayer;
  game.effects = new Proxy({
    recipeStarBlade(_p, _t, index) { regular.push({ index, time: clock }); },
    recipeStarFinale() { finales.push(clock); },
  }, { get: (target, key) => target[key] ?? (() => {}) });
  const combat = new CombatSystem(game); const count = Math.round(bundle.combat.hits);
  combat.usePlayerSkill(bundle, knightPlayer, 'full');
  const expectedFinal = .38 + (count - 1) * .095;
  while (clock < expectedFinal + legacyFrame * 3) { clock += legacyFrame; combat.update(legacyFrame); }
  return { count, regular, finales, expectedFinal };
};
for (const [label, bundle] of [['low', legacyStarLow], ['high', legacyStarHigh]]) {
  const timing = runLegacyStarTiming(bundle);
  ok(timing.regular.length === timing.count
    && timing.regular.every((event, index) => event.index === index)
    && Math.abs(timing.regular[0].time - .38) <= legacyFrame * 1.1
    && Math.abs(timing.regular.at(-1).time - timing.expectedFinal) <= legacyFrame * 1.1
    && timing.regular.slice(1).every((event, index) => Math.abs(
      event.time - timing.regular[index].time - .095,
    ) <= legacyFrame * 1.1)
    && timing.finales.length === 1
    && timing.finales[0] >= timing.regular.at(-1).time
    && timing.finales[0] - timing.regular.at(-1).time <= legacyFrame,
  `legacy Starburst ${label} rank preserves .095 launch cadence, first/last impact timing, and post-impact finale`);
}

const runLegacyLotusTiming = bundle => {
  let clock = 0; const regular = []; const finales = [];
  const enemy = makeWizardEnemy(`legacy-lotus-timing-${bundle.rank}`, 0, 0);
  enemy.takeDamage = (_raw, _game, options = {}) => {
    const index = options.sameCastHit?.key?.match(/line-(\d+)/)?.[1];
    if (index != null) regular.push({ index: Number(index), time: clock });
    return { amount: 1, killed: false };
  };
  const game = makeWizardGame([enemy]); game.player = rogueSkillPlayer;
  game.effects = new Proxy({ recipeLotusFlurry() { finales.push(clock); } },
    { get: (target, key) => target[key] ?? (() => {}) });
  const combat = new CombatSystem(game); const count = Math.round(bundle.combat.hits);
  combat.usePlayerSkill(bundle, rogueSkillPlayer, 'full');
  const expectedLast = .04 + (count - 1) * .07;
  const expectedFinal = .14 + count * .09;
  while (clock < expectedFinal + legacyFrame * 3) { clock += legacyFrame; combat.update(legacyFrame); }
  return { count, regular, finales, expectedLast, expectedFinal };
};
for (const [label, bundle] of [['low', legacyLotusLow], ['high', legacyLotusHigh]]) {
  const timing = runLegacyLotusTiming(bundle);
  ok(timing.regular.length === timing.count
    && timing.regular.every((event, index) => event.index === index)
    && Math.abs(timing.regular[0].time - .04) <= legacyFrame * 1.1
    && Math.abs(timing.regular.at(-1).time - timing.expectedLast) <= legacyFrame * 1.1
    && timing.regular.slice(1).every((event, index) => Math.abs(
      event.time - timing.regular[index].time - .07,
    ) <= legacyFrame * 1.1)
    && timing.finales.length === 1
    && Math.abs(timing.finales[0] - timing.expectedFinal) <= legacyFrame * 1.1,
  `legacy Death Lotus ${label} rank preserves .04/.07 launches and absolute finale timing (${JSON.stringify(timing)})`);
}

const legacyStarCancelEvents = [];
const legacyStarCancelGame = makeWizardGame([]); legacyStarCancelGame.player = knightPlayer;
legacyStarCancelGame.effects = new Proxy({
  recipeStarBlade(_p, _t, index) { legacyStarCancelEvents.push(`regular:${index}`); },
  recipeStarFinale() { legacyStarCancelEvents.push('finale'); },
}, { get: (target, key) => target[key] ?? (() => {}) });
const legacyStarCancelCombat = new CombatSystem(legacyStarCancelGame);
legacyStarCancelCombat.usePlayerSkill(legacyStarLow, knightPlayer, 'full'); legacyStarCancelCombat.update(5);
legacyStarCancelCombat.usePlayerSkill(legacyStarLow, knightPlayer, 'full');
for (let i = 0; i < legacyStarCount + 2; i += 1) legacyStarCancelCombat.update(5);
const expectedLegacyStarRecast = ['regular:0',
  ...Array.from({ length: legacyStarCount }, (_, index) => `regular:${index}`), 'finale'];
ok(legacyStarCancelEvents.join(',') === expectedLegacyStarRecast.join(','),
  `legacy Starburst recast cancels every stale sequential callback (${legacyStarCancelEvents.join(',')})`);
legacyStarCancelEvents.length = 0;
legacyStarCancelCombat.usePlayerSkill(legacyStarLow, knightPlayer, 'full'); legacyStarCancelCombat.update(5);
knightPlayer.classId = 'wizard';
for (let i = 0; i < legacyStarCount + 2; i += 1) legacyStarCancelCombat.update(5);
knightPlayer.classId = 'aerin';
ok(legacyStarCancelEvents.join(',') === 'regular:0',
  'legacy Starburst class switch cancels remaining contacts and finale');

const legacyLotusCancelEvents = [];
const legacyLotusCancelEnemy = makeWizardEnemy('legacy-lotus-cancel', 0, 0);
legacyLotusCancelEnemy.takeDamage = (_raw, _game, options = {}) => {
  legacyLotusCancelEvents.push(options.sameCastHit?.key ?? 'finale'); return { amount: 1, killed: false };
};
const legacyLotusCancelGame = makeWizardGame([legacyLotusCancelEnemy]); legacyLotusCancelGame.player = rogueSkillPlayer;
const legacyLotusCancelCombat = new CombatSystem(legacyLotusCancelGame);
legacyLotusCancelCombat.usePlayerSkill(legacyLotusLow, rogueSkillPlayer, 'full'); legacyLotusCancelCombat.update(.04);
legacyLotusCancelCombat.usePlayerSkill(legacyLotusLow, rogueSkillPlayer, 'full');
for (let i = 0; i < legacyLotusCount + 2; i += 1) legacyLotusCancelCombat.update(5);
ok(legacyLotusCancelEvents.length === legacyLotusCount + 2
  && legacyLotusCancelEvents[0].includes(':line-0:')
  && legacyLotusCancelEvents.slice(1, -1).every((key, index) => key.includes(`:line-${index}:`))
  && legacyLotusCancelEvents.at(-1) === 'finale',
  `legacy Death Lotus recast cancels stale sequence and completes one fresh ordered cast (${legacyLotusCancelEvents.join(',')})`);
legacyLotusCancelEvents.length = 0;
legacyLotusCancelCombat.usePlayerSkill(legacyLotusLow, rogueSkillPlayer, 'full'); legacyLotusCancelCombat.update(.04);
rogueSkillPlayer.classId = 'wizard';
for (let i = 0; i < legacyLotusCount + 2; i += 1) legacyLotusCancelCombat.update(5);
rogueSkillPlayer.classId = 'rogue';
ok(legacyLotusCancelEvents.length === 1 && legacyLotusCancelEvents[0].includes(':line-0:'),
  'legacy Death Lotus class switch cancels remaining contacts and finale');

const runStarGeometry = bundle => {
  const game = makeWizardGame([]); game.player = knightPlayer; knightPlayer.position.set(0, 0, 0);
  const center = makeRealWizardEnemy(game); center.position.set(9.5, 0, 0);
  const outer = makeRealWizardEnemy(game); outer.position.set(1.69, 0, -1.74);
  game.enemies.enemies.push(center, outer);
  const combat = new CombatSystem(game); const hp = [center.hp, outer.hp];
  combat.usePlayerSkill(bundle, knightPlayer, 0); combat.update(.3);
  return { center: hp[0] - center.hp, outer: hp[1] - outer.hp };
};
const constellationGeometry = runStarGeometry(resolveSkillForm(content.SKILLS.starburst, 10, 40, { tier40: 'constellation' }));
const executionGeometry = runStarGeometry(resolveSkillForm(content.SKILLS.starburst, 10, 40, { tier40: 'execution_field' }));
ok(constellationGeometry.outer > 0 && executionGeometry.outer === 0
  && constellationGeometry.center > 0 && executionGeometry.center > constellationGeometry.center,
  `Starburst Constellation is broad while Execution Field is focused (${JSON.stringify(constellationGeometry)}/${JSON.stringify(executionGeometry)})`);

const starEvents = [];
const starTargets = Array.from({ length: 8 }, (_, index) => makeWizardEnemy(
  `arsenal-${index}`, 9.5 + Math.cos(index * Math.PI / 4) * (index ? 3 : 0),
  Math.sin(index * Math.PI / 4) * (index ? 3 : 0), index === 0 ? 'boss' : index % 2 ? 'elite' : 'normal',
));
for (const enemy of starTargets) {
  enemy.takeDamage = (_raw, _game, options = {}) => {
    starEvents.push(options.sameCastHit?.key ?? `direct:${enemy.id}`); enemy.hits += 1; return { amount: 1, killed: false };
  };
}
const arsenalGame = makeWizardGame(starTargets); arsenalGame.player = knightPlayer;
arsenalGame.effects = new Proxy({
  recipeStarBlade() { starEvents.push('blade'); },
  recipeArsenalAct(_position, _theme, act) { starEvents.push(`act:${act}`); },
  recipeStarFinale() { starEvents.push('finale'); },
}, { get: (target, key) => target[key] ?? (() => {}) });
const arsenalCombat = new CombatSystem(arsenalGame);
arsenalCombat.usePlayerSkill(starPrison, knightPlayer, 0); arsenalCombat.update(.3);
arsenalCombat.usePlayerSkill(starPrison, knightPlayer, 1); arsenalCombat.update(.5);
arsenalCombat.usePlayerSkill(starPrison, knightPlayer, 2);
ok(starEvents.filter(event => event === 'blade').length === 10
  && starEvents.filter(event => event.includes(':royal')).length === 1
  && starEvents.filter(event => /^act:[234]$/.test(event)).length === 3
  && starEvents.filter(event => event === 'finale').length === 1,
  'Heaven\'s Arsenal owns exactly ten regular blades, one bounded royal seal, three rings, and one finale');
ok(starTargets.filter(enemy => enemy.stuns > 0).length <= 6
  && starTargets.find(enemy => enemy.boss).stuns === 0
  && starTargets.find(enemy => enemy.boss).staggers > 0,
  'Oath Prison caps control at six and converts boss stun to stagger');
const prisonCategories = ['normal', 'elite', 'boss', 'normal', 'elite', 'normal', 'normal', 'elite'];
const prisonTargets = prisonCategories.map((category, index) => makeWizardEnemy(
  `prison-${index}`, 9.5, index * .02, category,
));
const prisonGame = makeWizardGame(prisonTargets); prisonGame.player = knightPlayer;
const prisonCombat = new CombatSystem(prisonGame);
prisonCombat.usePlayerSkill(starPrison, knightPlayer, 0); prisonCombat.update(.3);
prisonCombat.usePlayerSkill(starPrison, knightPlayer, 1);
const prisonConsumed = prisonTargets.filter(enemy => enemy.stuns > 0 || enemy.staggers > 0);
ok(prisonConsumed.length === starPrison.combat.prisonCap
  && prisonTargets[0].stuns === starPrison.combat.prisonStun
  && prisonTargets[1].stuns === starPrison.combat.prisonStun
  && prisonTargets[2].stuns === 0
  && prisonTargets[2].staggers === starPrison.combat.bossStagger
  && prisonTargets[3].stuns === starPrison.combat.prisonStun
  && prisonTargets[4].stuns === starPrison.combat.prisonStun
  && prisonTargets[5].stuns === starPrison.combat.prisonStun
  && prisonTargets[6].stuns === 0 && prisonTargets[6].staggers === 0
  && prisonTargets[7].stuns === 0 && prisonTargets[7].staggers === 0,
  'Oath Prison consumes exactly six mixed targets, stuns normal/elite, staggers boss once, and leaves overflow untouched');

const embeddedEvents = [];
const embeddedTargets = Array.from({ length: 7 }, (_, index) => makeWizardEnemy(`embedded-${index}`, 9.5, index * .12));
for (const enemy of embeddedTargets) enemy.takeDamage = (_raw, _game, options = {}) => {
  if (options.sameCastHit?.key?.includes(':embed:')) embeddedEvents.push(options.sameCastHit.key);
  return { amount: 1, killed: false };
};
const embeddedGame = makeWizardGame(embeddedTargets); embeddedGame.player = knightPlayer;
const embeddedCombat = new CombatSystem(embeddedGame);
embeddedCombat.usePlayerSkill(star60, knightPlayer, 0); embeddedCombat.update(.3);
embeddedCombat.usePlayerSkill(star60, knightPlayer, 1);
ok(embeddedEvents.length === 0, 'Embedded Sky has no authority before its owned delay');
embeddedCombat.update(.5);
ok(embeddedEvents.length === 6 && new Set(embeddedEvents).size === 6,
  'Embedded Sky strikes at most six distinct landed targets once');
embeddedEvents.length = 0;
embeddedCombat.usePlayerSkill(star60, knightPlayer, 0); embeddedCombat.update(.3);
embeddedCombat.usePlayerSkill(star60, knightPlayer, 1);
embeddedCombat.usePlayerSkill(star60, knightPlayer, 0); embeddedCombat.update(.5);
ok(embeddedEvents.length === 0, 'Starburst recast cancels stale Embedded Sky authority');

const crownEvents = [];
const crownNormal = makeWizardEnemy('crown-normal', 9.5, 0);
const crownElite = makeWizardEnemy('crown-elite', 9.5, .2, 'elite');
for (const enemy of [crownNormal, crownElite]) enemy.takeDamage = (_raw, _game, options = {}) => {
  crownEvents.push([enemy.id, options.sameCastHit?.key ?? 'direct']); return { amount: 1, killed: false };
};
const crownGame = makeWizardGame([crownNormal, crownElite]); crownGame.player = knightPlayer;
const crownCombat = new CombatSystem(crownGame);
crownCombat.usePlayerSkill(starCrown, knightPlayer, 0); crownCombat.update(.3);
crownCombat.usePlayerSkill(starCrown, knightPlayer, 1);
ok(crownEvents.filter(([, key]) => key.includes(':crown')).length === 1
  && crownEvents.find(([id, key]) => key.includes(':crown'))?.[0] === 'crown-elite'
  && crownElite.staggers === starCrown.combat.crownStagger
  && crownEvents.some(([id, key]) => id === 'crown-normal' && key === 'direct'),
  'Falling Crown adds one durable-only bonus and stagger while pack blades remain direct');

const starStrictEvents = [];
const starStrictGame = makeWizardGame([]); starStrictGame.player = knightPlayer;
starStrictGame.effects = new Proxy({ recipeArsenalAct(_p, _t, act) { starStrictEvents.push(act); } },
  { get: (target, key) => target[key] ?? (() => {}) });
const starStrictCombat = new CombatSystem(starStrictGame);
starStrictCombat.usePlayerSkill(starPrison, knightPlayer, 1);
starStrictCombat.usePlayerSkill(starPrison, knightPlayer, 0);
starStrictCombat.usePlayerSkill(starPrison, knightPlayer, 1);
starStrictCombat.usePlayerSkill(starPrison, knightPlayer, 1);
starStrictCombat.usePlayerSkill(starCrown, knightPlayer, 0);
starStrictCombat.usePlayerSkill(starPrison, knightPlayer, 2);
knightPlayer.classId = 'wizard'; starStrictCombat.usePlayerSkill(starCrown, knightPlayer, 1); knightPlayer.classId = 'aerin';
ok(starStrictEvents.join(',') === '1', 'Starburst rejects orphan, duplicate, stale-bundle, and class-switched phases');

const starFallbackEvents = [];
const starFallbackTarget = makeWizardEnemy('star-fallback', 9.5, 0);
starFallbackTarget.takeDamage = (_raw, _game, options = {}) => {
  starFallbackEvents.push(options.sameCastHit?.key?.includes(':royal') ? 'royal' : 'blade'); return { amount: 1, killed: false };
};
const starFallbackGame = makeWizardGame([starFallbackTarget]); starFallbackGame.player = knightPlayer;
starFallbackGame.effects = new Proxy({
  recipeStarBlade() {}, recipeArsenalAct(_p, _t, act) { starFallbackEvents.push(`act:${act}`); },
  recipeStarFinale() { starFallbackEvents.push('finale'); },
}, { get: (target, key) => target[key] ?? (() => {}) });
const starFallbackCombat = new CombatSystem(starFallbackGame);
starFallbackCombat.usePlayerSkill(starPrison, knightPlayer, 'full');
starFallbackCombat.update(1); starFallbackCombat.update(1); starFallbackCombat.update(1); starFallbackCombat.update(1);
ok(starFallbackEvents.indexOf('blade') < starFallbackEvents.indexOf('royal')
  && starFallbackEvents.indexOf('royal') < starFallbackEvents.indexOf('finale')
  && starFallbackEvents.filter(event => event === 'act:1').length === 1,
  `Starburst coarse fallback preserves blade → royal → three-ring finale chronology (${starFallbackEvents.join(',')})`);

const arsenalTerminalEvents = [];
const arsenalTerminalGame = makeWizardGame([]); arsenalTerminalGame.player = knightPlayer;
arsenalTerminalGame.effects = new Proxy({
  recipeStarBlade() { arsenalTerminalEvents.push('regular'); },
  recipeArsenalAct(_p, _t, act) { arsenalTerminalEvents.push(`act:${act}`); },
  recipeStarFinale() { arsenalTerminalEvents.push('finale'); },
}, { get: (target, key) => target[key] ?? (() => {}) });
const arsenalTerminalCombat = new CombatSystem(arsenalTerminalGame);
arsenalTerminalCombat.usePlayerSkill(starPrison, knightPlayer, 0); arsenalTerminalCombat.update(.3);
arsenalTerminalCombat.usePlayerSkill(starCrown, knightPlayer, 0); arsenalTerminalCombat.update(.3);
arsenalTerminalCombat.usePlayerSkill(starPrison, knightPlayer, 2);
ok(arsenalTerminalEvents.filter(event => /^act:[234]$/.test(event)).length === 0
  && arsenalTerminalEvents.filter(event => event === 'finale').length === 0,
  'Heaven\'s Arsenal rejects stale terminal phase after a recast');
arsenalTerminalCombat.usePlayerSkill(starCrown, knightPlayer, 1);
arsenalTerminalCombat.usePlayerSkill(starCrown, knightPlayer, 2);
const arsenalTerminalSnapshot = arsenalTerminalEvents.join(',');
arsenalTerminalCombat.usePlayerSkill(starCrown, knightPlayer, 2); arsenalTerminalCombat.update(1);
ok(arsenalTerminalEvents.filter(event => event === 'regular').length === 20
  && [2, 3, 4].every(act => arsenalTerminalEvents.filter(event => event === `act:${act}`).length === 1)
  && arsenalTerminalEvents.filter(event => event === 'finale').length === 1
  && arsenalTerminalEvents.join(',') === arsenalTerminalSnapshot,
  'Heaven\'s Arsenal terminal owns exact acts 2/3/4 and one finale; replay respawns nothing');

const runLotusGeometry = bundle => {
  const game = makeWizardGame([]); game.player = rogueSkillPlayer; rogueSkillPlayer.position.set(0, 0, 0);
  const center = makeRealWizardEnemy(game); center.position.set(2, 0, 0);
  const outer = makeRealWizardEnemy(game); outer.position.set(4.6, 0, 0);
  game.enemies.enemies.push(center, outer);
  const combat = new CombatSystem(game); const hp = [center.hp, outer.hp];
  combat.usePlayerSkill(bundle, rogueSkillPlayer, 0); combat.update(.3);
  return { center: hp[0] - center.hp, outer: hp[1] - outer.hp };
};
const crimsonGeometry = runLotusGeometry(resolveSkillForm(content.SKILLS.death_lotus, 10, 40, { tier40: 'crimson_lotus' }));
const phantomGeometry = runLotusGeometry(resolveSkillForm(content.SKILLS.death_lotus, 10, 40, { tier40: 'phantom_lotus' }));
ok(crimsonGeometry.outer > 0 && phantomGeometry.outer === 0
  && crimsonGeometry.center > 0 && phantomGeometry.center > crimsonGeometry.center,
  `Crimson Lotus is broad while Phantom Lotus is focused (${JSON.stringify(crimsonGeometry)}/${JSON.stringify(phantomGeometry)})`);

const lotusEvents = [];
const lotusTargets = Array.from({ length: 8 }, (_, index) => {
  const enemy = makeWizardEnemy(`lotus-${index}`, Math.cos(index * Math.PI / 4) * 2, Math.sin(index * Math.PI / 4) * 2,
    index === 7 ? 'boss' : index % 2 ? 'elite' : 'normal');
  enemy.hp = enemy.maxHp = 100; if (index < 3 || index === 7) enemy.hp = 20;
  enemy.takeDamage = (_raw, _game, options = {}) => {
    lotusEvents.push(options.sameCastHit?.key ?? `direct:${enemy.id}`); enemy.hits += 1; return { amount: 1, killed: false };
  };
  return enemy;
});
const lotusGame = makeWizardGame(lotusTargets); lotusGame.player = rogueSkillPlayer;
lotusGame.effects = new Proxy({ recipeMoonlessAct(_p, _d, _t, act) { lotusEvents.push(`act:${act}`); } },
  { get: (target, key) => target[key] ?? (() => {}) });
const lotusCombat = new CombatSystem(lotusGame);
lotusCombat.usePlayerSkill(lotusHarvest, rogueSkillPlayer, 0); lotusCombat.update(.3);
lotusCombat.usePlayerSkill(lotusHarvest, rogueSkillPlayer, 1); lotusCombat.update(.5);
lotusCombat.usePlayerSkill(lotusHarvest, rogueSkillPlayer, 2);
ok(lotusEvents.filter(event => event === 'act:0').length === 8
  && lotusEvents.filter(event => event.includes(':echo:')).length <= 6
  && lotusEvents.filter(event => event === 'act:2').length === 1,
  'Moonless Lotus owns eight petal lines, six bounded nonrecursive echoes, and one finale');
ok(lotusEvents.filter(event => event.includes(':harvest:')).length === 3
  && lotusEvents.every(event => !event.includes(':harvest:lotus-7')),
  'Harvest executes weakened normal and elite targets but never bosses');

const echoEvents = [];
const echoTargets = Array.from({ length: 7 }, (_, index) => makeWizardEnemy(
  `echo-${index}`, Math.cos(index * Math.PI / 4) * 2, Math.sin(index * Math.PI / 4) * 2,
));
for (const enemy of echoTargets) enemy.takeDamage = (_raw, _game, options = {}) => {
  if (options.sameCastHit?.key?.includes(':echo:')) echoEvents.push(options.sameCastHit.key);
  return { amount: 1, killed: false };
};
const echoGame = makeWizardGame(echoTargets); echoGame.player = rogueSkillPlayer;
const echoCombat = new CombatSystem(echoGame);
echoCombat.usePlayerSkill(lotus60, rogueSkillPlayer, 0); echoCombat.update(.3);
echoCombat.usePlayerSkill(lotus60, rogueSkillPlayer, 1);
ok(echoEvents.length === 0, 'Shadow Petals have no authority before their owned delay');
echoCombat.update(.5);
ok(echoEvents.length === 6 && new Set(echoEvents).size === 6,
  'Shadow Petals echo six unique sources without recursion');
echoEvents.length = 0;
echoCombat.usePlayerSkill(lotus60, rogueSkillPlayer, 0); echoCombat.update(.3);
echoCombat.usePlayerSkill(lotus60, rogueSkillPlayer, 1);
echoCombat.usePlayerSkill(lotus60, rogueSkillPlayer, 0); echoCombat.update(.5);
ok(echoEvents.length === 0, 'Death Lotus recast cancels stale Shadow Petal authority');

const targetEvents = [];
const targetGame = makeWizardGame([]); targetGame.player = rogueSkillPlayer;
const targetNormal = makeRealWizardEnemy(targetGame); targetNormal.position.set(2, 0, 0);
const targetElite = makeRealWizardEnemy(targetGame, 'elite'); targetElite.position.set(2, 0, .12);
targetGame.enemies.enemies.push(targetNormal, targetElite);
for (const enemy of [targetNormal, targetElite]) {
  const takeDamage = enemy.takeDamage.bind(enemy);
  enemy.takeDamage = (raw, game, options = {}) => {
    const result = takeDamage(raw, game, options);
    targetEvents.push({ enemyId: enemy.id, key: options.sameCastHit?.key ?? 'direct', amount: result.amount });
    return result;
  };
}
const durableStaggers = [];
const targetEliteAddStagger = targetElite.addStagger.bind(targetElite);
targetElite.addStagger = value => { durableStaggers.push(value); return targetEliteAddStagger(value); };
const targetCombat = new CombatSystem(targetGame);
targetCombat.usePlayerSkill(lotusTarget, rogueSkillPlayer, 0); targetCombat.update(.3);
targetCombat.usePlayerSkill(lotusTarget, rogueSkillPlayer, 1);
const redirectEvents = targetEvents.filter(event => event.amount > 0 && event.key.includes(':redirect-'));
ok(redirectEvents.length === 4
  && redirectEvents.every(event => event.enemyId === targetElite.id)
  && targetEvents.every(event => !event.key.includes(':redirect-') || event.enemyId !== targetNormal.id)
  && durableStaggers.length === 1 && durableStaggers[0] === lotusTarget.combat.durableStagger
  && targetNormal.stagger === 0
  && targetEvents.some(event => event.enemyId === targetNormal.id && event.amount > 0 && event.key.includes(':line-')),
  'One Target crosses real iframe with four redirects on one durable target, one exact stagger, and normal direct line damage');

const lotusStrictEvents = [];
const lotusStrictGame = makeWizardGame([]); lotusStrictGame.player = rogueSkillPlayer;
lotusStrictGame.effects = new Proxy({ recipeMoonlessAct(_p, _d, _t, act) { lotusStrictEvents.push(act); } },
  { get: (target, key) => target[key] ?? (() => {}) });
const lotusStrictCombat = new CombatSystem(lotusStrictGame);
lotusStrictCombat.usePlayerSkill(lotusHarvest, rogueSkillPlayer, 1);
lotusStrictCombat.usePlayerSkill(lotusHarvest, rogueSkillPlayer, 0);
lotusStrictCombat.usePlayerSkill(lotusHarvest, rogueSkillPlayer, 1);
lotusStrictCombat.usePlayerSkill(lotusHarvest, rogueSkillPlayer, 1);
lotusStrictCombat.usePlayerSkill(lotusTarget, rogueSkillPlayer, 0);
lotusStrictCombat.usePlayerSkill(lotusHarvest, rogueSkillPlayer, 2);
rogueSkillPlayer.classId = 'wizard'; lotusStrictCombat.usePlayerSkill(lotusTarget, rogueSkillPlayer, 1); rogueSkillPlayer.classId = 'rogue';
ok(lotusStrictEvents.filter(event => event === 1).length === 1 && !lotusStrictEvents.includes(2),
  'Death Lotus rejects orphan, duplicate, stale-bundle, and class-switched phases');

const lotusFallbackEvents = [];
const lotusFallbackTarget = makeWizardEnemy('lotus-fallback', 2, 0);
lotusFallbackTarget.takeDamage = (_raw, _game, options = {}) => {
  lotusFallbackEvents.push(options.sameCastHit?.key?.includes(':echo:') ? 'echo' : options.sameCastHit?.key?.includes(':finale') ? 'finale-hit' : 'line');
  return { amount: 1, killed: false };
};
const lotusFallbackGame = makeWizardGame([lotusFallbackTarget]); lotusFallbackGame.player = rogueSkillPlayer;
lotusFallbackGame.effects = new Proxy({ recipeMoonlessAct(_p, _d, _t, act) { lotusFallbackEvents.push(`act:${act}`); } },
  { get: (target, key) => target[key] ?? (() => {}) });
const lotusFallbackCombat = new CombatSystem(lotusFallbackGame);
lotusFallbackCombat.usePlayerSkill(lotusHarvest, rogueSkillPlayer, 'full');
lotusFallbackCombat.update(1); lotusFallbackCombat.update(1); lotusFallbackCombat.update(1); lotusFallbackCombat.update(1);
ok(lotusFallbackEvents.indexOf('line') < lotusFallbackEvents.indexOf('echo')
  && lotusFallbackEvents.indexOf('echo') < lotusFallbackEvents.indexOf('finale-hit')
  && lotusFallbackEvents.filter(event => event === 'act:2').length === 1,
  'Death Lotus coarse fallback preserves line → echo → finale chronology');

const fxSource = await import('node:fs/promises').then(fs => fs.readFile(join(root, 'js/graphics/Effects.js'), 'utf8'));
for (const recipe of ['recipeArsenalAct', 'recipeMoonlessAct']) {
  const body = fxSource.slice(fxSource.indexOf(`${recipe}(`), fxSource.indexOf(`${recipe}(`) + 2400);
  ok(body.length > 80 && !/PointLight|DirectionalLight|SpotLight/.test(body), `${recipe} exists and adds no dynamic lights`);
}

const apexRows = {
  aerin: ['broken_crown', 'apex_finisher'], wizard: ['overflow_overcast', 'apex_cast'],
  rogue: ['blood_echo', 'apex_finisher'], ranger: ['marked_convergence', 'apex_finisher'],
};
const { APEX_AUDIO_PROFILES, AudioManager } = await import(pathToFileURL(join(root, 'js/core/AudioManager.js')).href);
const apexProfileIds=Object.keys(APEX_AUDIO_PROFILES);const apexDataIds=[];
for (const [classId, [id, trigger]] of Object.entries(apexRows)) {
  const row = content.HERO_CLASSES[classId].apexKeystone;
  ok(Object.isFrozen(row) && row.id === id && row.trigger === trigger && row.unlockLevel === 100,
    `${classId} exposes its frozen level-100 offensive keystone`);
}
for (const skill of actives) {
  const at99 = resolveSkillForm(skill, 10, 99, {});
  const at100 = resolveSkillForm(skill, 10, 100, {});
  apexDataIds.push(at100.presentation.apexAudio);
  ok(at99.classId === skill.classId && at100.classId === skill.classId
    && !at99.combat.apexFinisher && at100.combat.apexFinisher === 1 && typeof at100.presentation.apexMarker === 'string'
    && at100.presentation.apexAudio===skill.id,
    `${skill.id} enables an explicit apex finale only at level 100`);
}
ok(apexProfileIds.length===16&&new Set(Object.values(APEX_AUDIO_PROFILES)).size===16
  && isDeepStrictEqual([...apexProfileIds].sort(),[...apexDataIds].sort())
  && Object.values(APEX_AUDIO_PROFILES).every(profile=>Object.isFrozen(profile)&&Object.isFrozen(profile.cadence)
    && isDeepStrictEqual(Object.keys(profile.cadence),['anticipate','impact','finisher'])
    && ['anticipate','impact','finisher'].every(phase=>Object.isFrozen(profile.cadence[phase])))
  && actives.every(skill=>APEX_AUDIO_PROFILES[skill.id].classId===skill.classId)
  && new Set(Object.values(APEX_AUDIO_PROFILES).map(profile=>`${profile.pitch}:${profile.noise}:${profile.filter}`)).size===16
  && new Set(Object.values(APEX_AUDIO_PROFILES).map(profile=>profile.timbre)).size===4
  && Object.keys(apexRows).every(classId=>new Set(Object.values(APEX_AUDIO_PROFILES).filter(profile=>profile.classId===classId)
    .map(profile=>profile.timbre)).size===1),
  'exactly 16 unique frozen Apex audio profiles match the 16 level-100 data ids and three cadence phases');
ok(new AudioManager().apex('whirlwind','anticipate')===false&&new AudioManager().apex('unknown','finisher')===false,
  'Apex procedural audio gracefully declines without an unlocked audio context or known profile');

const assetManifest=JSON.parse(await import('node:fs/promises').then(fs=>fs.readFile(join(root,'assets/manifests/assets.json'),'utf8')));
const heroAsset={aerin:'hero.aerin',wizard:'hero.wizard',rogue:'hero.rogue',ranger:'hero.ranger'};
const expectedFallback={whirlwind:'attack_4',crescent:'skill_whirlwind',skyfall:'skill_whirlwind',starburst:'skill_whirlwind',
  fireball:'cast_2',frost_nova:'cast_3',arcane_blink:'dodge',meteor_storm:'cast_4',twin_fang:'attack_2',fan_of_knives:'skill_twin_fang',
  shadowstep:'dodge',death_lotus:'attack_4',piercing_shot:'cast_2',caltrop_trap:'cast_3',vault_shot:'dodge',hunter_mark:'cast_4'};
for(const skill of actives){const animationMap=assetManifest.models[heroAsset[skill.classId]].animationMap;
  ok(Object.hasOwn(animationMap,skill.anim)&&skill.animFallback===expectedFallback[skill.id]&&Object.hasOwn(animationMap,skill.animFallback),
    `${skill.id} primary and owning fallback animations exist in its class animationMap`);}
const expectedEvolutionAnimations={
  whirlwind:['attack_5','skill_whirlwind'],crescent:['attack_6','skill_crescent'],skyfall:['attack_7','skill_skyfall'],starburst:['attack_7','skill_starburst'],
  fireball:['cast_2','skill_fireball'],frost_nova:['cast_3','skill_frost_nova'],arcane_blink:['dodge','skill_blink'],meteor_storm:['cast_4','skill_meteor'],
  twin_fang:['attack_6','skill_twin_fang'],fan_of_knives:['attack_5','skill_fan_knives'],shadowstep:['dodge','skill_shadowstep'],death_lotus:['attack_5','skill_death_lotus'],
  piercing_shot:['cast_2','skill_pierce_shot'],caltrop_trap:['cast_3','skill_trap'],vault_shot:['dodge','skill_vault_shot'],hunter_mark:['cast_4','skill_hunter_mark'],
};
for(const skill of actives){
  const [form60,form100]=expectedEvolutionAnimations[skill.id]??[];
  const animationMap=assetManifest.models[heroAsset[skill.classId]].animationMap;
  ok(skill.evolution.forms[60].anim===form60&&skill.evolution.forms[100].anim===form100,
    `${skill.id} has exact level-60 and level-100 animation mapping`);
  ok(Object.hasOwn(animationMap,form60)&&Object.hasOwn(animationMap,form100),
    `${skill.id} evolution animations exist in its owning class animationMap`);
  const resolved=[59,60,99,100].map(level=>resolveSkillForm(skill,10,level,{}).anim);
  ok(isDeepStrictEqual(resolved,[skill.anim,form60,form60,form100]),
    `${skill.id} resolver switches animation exactly at levels 60 and 100`);
}
const mutationIconFamilies={
  whirlwind:['vortex',['cyclone','blood_wheel','storm_cage','giant_slayer']],
  crescent:['moon',['wide_moon','full_moon','rift_trail','armor_sever']],
  skyfall:['hammer',['iron_vortex','meteor_hammer','kings_command','earthbreaker']],
  starburst:['arsenal',['constellation','execution_field','oath_prison','falling_crown']],
  fireball:['flame',['wildfire','comet_core','chain_ignition','solar_brand']],
  frost_nova:['crystal',['glacier_ring','shatter_crown','absolute_zero','crystal_execution']],
  arcane_blink:['rift',['echo_step','rift_lance','twin_horizon','void_break']],
  meteor_storm:['meteor',['meteor_rain','extinction','orbit_fall','world_ender']],
  twin_fang:['fang',['viper','raptor','open_wound','heartseeker']],
  fan_of_knives:['knives',['black_fan','needle_line','ricochet','pinned_prey']],
  shadowstep:['shadow',['ghost_rush','red_tempo','predator_flow','boss_killer']],
  death_lotus:['lotus',['crimson_lotus','phantom_lotus','harvest','one_target']],
  piercing_shot:['arrow',['split_arrow','rail_arrow','crowd_skewer','dragon_piercer']],
  caltrop_trap:['thorn',['briar_field','blast_seed','snare_bloom','mine_garden']],
  vault_shot:['vault',['gale_vault','counter_volley','escape_artist','perfect_distance']],
  hunter_mark:['mark',['pack_hunt','prime_target','chain_verdict','trophy_shot']],
};
const expectedRoles=['breadth','focus','flow','execution'];
const mutationIcons=[];
for(const skill of actives){
  const [family,ids]=mutationIconFamilies[skill.id]??[];
  const options={...skill.evolution.mutations[40],...skill.evolution.mutations[80]};
  for(let index=0;index<ids.length;index+=1){
    const option=options[ids[index]];
    const expectedIcon=`${family}.${expectedRoles[index]}`;
    ok(Boolean(option?.label?.trim())&&Boolean(option?.summary?.trim())&&option.icon===expectedIcon,
      `${skill.id}.${ids[index]} has nonempty copy and exact mutation icon ${expectedIcon}`);
    mutationIcons.push(option?.icon);
  }
}
ok(mutationIcons.length===64&&new Set(mutationIcons).size===64
  && mutationIcons.every(icon=>/^[a-z][a-z0-9_-]*\.(breadth|focus|flow|execution)$/.test(icon))
  && isDeepStrictEqual([...new Set(mutationIcons.map(icon=>icon.split('.')[1]))].sort(),[...expectedRoles].sort()),
  'all 64 mutation icons are valid, globally unique, and cover the four exact roles');
const wizardOvercasts = { fireball:.35, frost_nova:.32, arcane_blink:.38, meteor_storm:.42 };
for (const [id, mult] of Object.entries(wizardOvercasts)) {
  const resolved = resolveSkillForm(content.SKILLS[id], 10, 100, {});
  ok(resolved.combat.overcastMult === mult && typeof resolved.presentation.overcastRecipe === 'string',
    `${id} exposes its explicit overcast multiplier and recipe`);
}

let stacked = applyStatus({}, 'bleed', { duration:2, stackDelta:1, stackCap:3 });
stacked = applyStatus(stacked, 'bleed', { duration:3, stackDelta:1, stackCap:3 });
stacked = applyStatus(stacked, 'bleed', { duration:1, stackDelta:4, stackCap:3 });
ok(stacked.bleed.stacks === 3 && stacked.bleed.remaining === 3,
  'bleed stackDelta grows one-to-three while refresh preserves the longest duration');
const overflowOracle = { alive:true, classId:'wizard', level:100, arcaneOverflow:0 };
ok(Player.prototype.gainArcaneOverflow.call(overflowOracle,25,100)===25
  && Player.prototype.gainArcaneOverflow.call(overflowOracle,100,100)===75
  && overflowOracle.arcaneOverflow===100
  && Player.prototype.consumeArcaneOverflow.call(overflowOracle,100)
  && overflowOracle.arcaneOverflow===0,
  'Arcane Overflow clamps at 100 and atomically consumes one full gauge');
ok(!playerSrc.slice(playerSrc.indexOf('serialize()'),playerSrc.indexOf('load(state')).includes('arcaneOverflow'),
  'Arcane Overflow remains transient and excluded from save serialization');

const crownKeystoneTarget = makeWizardEnemy('broken-crown-target', 9.5, 0, 'boss');
crownKeystoneTarget.statuses.armor_break={id:'armor_break',remaining:3};
const crownKeystoneGame=makeWizardGame([crownKeystoneTarget]);crownKeystoneGame.player=knightPlayer;
const crownKeystoneCombat=new CombatSystem(crownKeystoneGame);
crownKeystoneCombat.usePlayerSkill(starPrison,knightPlayer,0);crownKeystoneCombat.update(.3);
crownKeystoneCombat.usePlayerSkill(starPrison,knightPlayer,2);crownKeystoneCombat.usePlayerSkill(starPrison,knightPlayer,2);
ok(crownKeystoneTarget.staggers===content.HERO_CLASSES.aerin.apexKeystone.staggerBonus,
  'Broken Crown reads live armor_break and adds exact boss stagger once per target/cast');
const crownExclusion=makeWizardEnemy('broken-crown-exclusion',9.5,0,'boss');crownExclusion.statuses.expose={remaining:3};crownExclusion.stagger=100;
const crownExclusionGame=makeWizardGame([crownExclusion]);crownExclusionGame.player=knightPlayer;const crownExclusionCombat=new CombatSystem(crownExclusionGame);
crownExclusionCombat.usePlayerSkill(starPrison,knightPlayer,0);crownExclusionCombat.update(.3);crownExclusionCombat.usePlayerSkill(starPrison,knightPlayer,2);
ok(crownExclusion.staggers===0,'Broken Crown rejects expose and pre-existing stagger-break without generic armor_break');
const crown99Target=makeWizardEnemy('broken-crown-99',9.5,0);crown99Target.statuses.armor_break={remaining:3};
const crown99Game=makeWizardGame([crown99Target]);crown99Game.player=knightPlayer;const crown99Combat=new CombatSystem(crown99Game);
const judgment99=resolveSkillForm(content.SKILLS.skyfall,10,99,{});crown99Combat.usePlayerSkill(judgment99,knightPlayer,0);crown99Combat.usePlayerSkill(judgment99,knightPlayer,1);
ok(crown99Target.staggers===0,'level-99 authoritative finale never invokes Broken Crown');
const crownCrossTarget=makeWizardEnemy('broken-crown-cross-class',9.5,0);crownCrossTarget.statuses.armor_break={remaining:3};
const crownCrossGame=makeWizardGame([crownCrossTarget]);crownCrossGame.player=knightPlayer;const crownCrossCombat=new CombatSystem(crownCrossGame);
crownCrossCombat.usePlayerSkill(starPrison,knightPlayer,0);crownCrossCombat.update(.3);knightPlayer.classId='wizard';crownCrossCombat.usePlayerSkill(starPrison,knightPlayer,2);knightPlayer.classId='aerin';
ok(crownCrossTarget.staggers===0,'cross-class stale Apex cast has zero keystone authority');

const foreignSyncPlayer={...rogueSkillPlayer,classId:'rogue',position:new THREE.Vector3(),facing:new THREE.Vector3(1,0,0)};
const foreignSyncTarget=makeWizardEnemy('foreign-sync-keystone',9.5,0);const foreignSyncKeys=[];
foreignSyncTarget.statuses.bleed={id:'bleed',remaining:3,stacks:3,stackCap:3};
foreignSyncTarget.takeDamage=(_raw,_game,options={})=>{foreignSyncKeys.push(options.sameCastHit?.key??'base');return{amount:1,killed:false};};
const foreignSyncGame=makeWizardGame([foreignSyncTarget]);foreignSyncGame.player=foreignSyncPlayer;
const foreignSyncCombat=new CombatSystem(foreignSyncGame);const judgment100=resolveSkillForm(content.SKILLS.skyfall,10,100,{});
foreignSyncCombat.usePlayerSkill(judgment100,foreignSyncPlayer,0);foreignSyncCombat.usePlayerSkill(judgment100,foreignSyncPlayer,1);
ok(foreignSyncKeys.length>0&&foreignSyncKeys.filter(key=>key.includes(':blood-echo:')).length===0,
  'foreign immutable Knight bundle has exactly zero synchronous Rogue keystone authority');

const foreignDeferredTarget=makeWizardEnemy('foreign-deferred-keystone',2,0);const foreignDeferredKeys=[];
foreignDeferredTarget.statuses.bleed={id:'bleed',remaining:3,stacks:3,stackCap:3};
foreignDeferredTarget.takeDamage=(_raw,_game,options={})=>{foreignDeferredKeys.push(options.sameCastHit?.key??'base');return{amount:1,killed:false};};
const foreignDeferredGame=makeWizardGame([foreignDeferredTarget]);foreignDeferredGame.player=foreignSyncPlayer;
foreignSyncPlayer.position.set(0,0,0);foreignSyncPlayer.facing.set(1,0,0);
const foreignDeferredCombat=new CombatSystem(foreignDeferredGame);
foreignDeferredCombat.usePlayerSkill(resolveSkillForm(content.SKILLS.fireball,10,100,{}),foreignSyncPlayer,0);
for(let i=0;i<50;i+=1)foreignDeferredCombat.update(.12);
ok(foreignDeferredKeys.length>0&&foreignDeferredKeys.filter(key=>key.includes(':blood-echo:')||key.includes(':overcast')).length===0,
  'foreign immutable Wizard bundle has exactly zero deferred Rogue or Wizard keystone authority');

const apexTargetX={starburst:9.5,skyfall:10,arcane_blink:5,meteor_storm:10,caltrop_trap:7.5};
for(const skill of actives){
  const events=[];const enemy=makeWizardEnemy(`apex-audio-${skill.id}`,apexTargetX[skill.id]??2,0);
  const player={...rogueSkillPlayer,classId:skill.classId,level:100,alive:true,position:new THREE.Vector3(),facing:new THREE.Vector3(1,0,0),
    predatorVerdict:null,thornField:null,arcaneOverflow:0};
  if(skill.id==='shadowstep')player.activateShadowFrenzy=(combat,bundle)=>(player.shadowFrenzy={active:true,generation:1,remaining:combat.frenzyDuration,
    duration:combat.frenzyDuration,contactCount:1,contactCap:combat.contactCap,exitMult:combat.exitMult,apexBundle:bundle,apexAudio:null});
  const game=makeWizardGame([enemy]);game.player=player;game.audio=new Proxy({apex(id,phase){events.push(`${id}:${phase}`);}},
    {get:(target,key)=>target[key]??(()=>{})});
  const combat=new CombatSystem(game);const bundle=resolveSkillForm(skill,10,100,{});
  combat.usePlayerSkill(bundle,player,'full');
  if(skill.id==='shadowstep')combat.endShadowFrenzy(player,player.shadowFrenzy);
  for(let i=0;i<400;i+=1)combat.update(.03);
  ok(isDeepStrictEqual(events,[`${skill.id}:anticipate`,`${skill.id}:impact`,`${skill.id}:finisher`]),
    `${skill.id} complete level-100 cast emits exactly ordered anticipate, impact, finisher audio (${events.join(',')})`);
}

const belowApexAudio=[];const belowApexGame=makeWizardGame([]);belowApexGame.audio=new Proxy({apex(id,phase){belowApexAudio.push(`${id}:${phase}`);}},
  {get:(target,key)=>target[key]??(()=>{})});const belowApexCombat=new CombatSystem(belowApexGame);
for(const skill of actives){const player={...rogueSkillPlayer,classId:skill.classId,level:99,alive:true,position:new THREE.Vector3(),facing:new THREE.Vector3(1,0,0)};
  belowApexGame.player=player;belowApexCombat.usePlayerSkill(resolveSkillForm(skill,10,99,{}),player,0);}
ok(belowApexAudio.length===0,'all 16 level-99 skill casts emit exactly zero Apex audio phases');

const staleAudioEvents=[];const staleAudioTarget=makeWizardEnemy('stale-apex-audio',2,0);const staleAudioGame=makeWizardGame([staleAudioTarget]);
const staleAudioPlayer={...rogueSkillPlayer,classId:'ranger',level:100,alive:true,position:new THREE.Vector3(),facing:new THREE.Vector3(1,0,0),predatorVerdict:null};
staleAudioGame.player=staleAudioPlayer;staleAudioGame.audio=new Proxy({apex(id,phase){staleAudioEvents.push(`${id}:${phase}`);}},
  {get:(target,key)=>target[key]??(()=>{})});const staleAudioCombat=new CombatSystem(staleAudioGame);
const staleAudioPierce=resolveSkillForm(content.SKILLS.piercing_shot,10,100,{});
staleAudioCombat.usePlayerSkill(staleAudioPierce,staleAudioPlayer,'full');staleAudioCombat.usePlayerSkill(staleAudioPierce,staleAudioPlayer,'full');
for(let i=0;i<150;i+=1)staleAudioCombat.update(.03);
ok(isDeepStrictEqual(staleAudioEvents,['piercing_shot:anticipate','piercing_shot:anticipate','piercing_shot:impact','piercing_shot:finisher']),
  'Ranger projectile recast cancels every stale impact and finisher audio phase');

const frenzyRecastEvents=[];const frenzyRecastPlayer=new Player(new THREE.Scene(),playerFactoryStub,'low','rogue');
frenzyRecastPlayer.level=100;frenzyRecastPlayer.position.set(0,0,0);frenzyRecastPlayer.facing.set(1,0,0);
const frenzyRecastGame=makeWizardGame([]);frenzyRecastGame.player=frenzyRecastPlayer;
frenzyRecastGame.audio=new Proxy({apex(id,phase){frenzyRecastEvents.push(`${id}:${phase}`);}},{get:(target,key)=>target[key]??(()=>{})});
const frenzyRecastCombat=new CombatSystem(frenzyRecastGame);const apexShadowstep=resolveSkillForm(content.SKILLS.shadowstep,10,100,{});
frenzyRecastCombat.usePlayerSkill(apexShadowstep,frenzyRecastPlayer,'full');
const originalFrenzy=frenzyRecastPlayer.shadowFrenzy;const originalFrenzyGeneration=originalFrenzy.generation;const originalFrenzyToken=originalFrenzy.apexAudio;
const beforeActiveRecast=[...frenzyRecastEvents];frenzyRecastCombat.usePlayerSkill(apexShadowstep,frenzyRecastPlayer,'full');
const recastPreserved=frenzyRecastPlayer.shadowFrenzy===originalFrenzy
  && frenzyRecastPlayer.shadowFrenzy.generation===originalFrenzyGeneration
  && frenzyRecastPlayer.shadowFrenzy.apexAudio===originalFrenzyToken
  && isDeepStrictEqual(frenzyRecastEvents,beforeActiveRecast);
const expiredFrenzy={...originalFrenzy};frenzyRecastPlayer.clearShadowFrenzy();
frenzyRecastCombat.endShadowFrenzy(frenzyRecastPlayer,expiredFrenzy);frenzyRecastCombat.endShadowFrenzy(frenzyRecastPlayer,expiredFrenzy);
ok(recastPreserved&&isDeepStrictEqual(frenzyRecastEvents,['shadowstep:anticipate','shadowstep:impact','shadowstep:finisher']),
  'active Shadow Frenzy recast preserves the original state, generation, token, cues, and one expiry finisher');

const deathAudioEvents=[];const deathAudioPlayer={...knightPlayer,classId:'aerin',level:100,alive:true,position:new THREE.Vector3(),facing:new THREE.Vector3(1,0,0)};
const deathAudioGame=makeWizardGame([]);deathAudioGame.player=deathAudioPlayer;
deathAudioGame.audio=new Proxy({apex(id,phase){deathAudioEvents.push(`${id}:${phase}`);}},{get:(target,key)=>target[key]??(()=>{})});
const deathAudioCombat=new CombatSystem(deathAudioGame);deathAudioCombat.usePlayerSkill(starPrison,deathAudioPlayer,0);
deathAudioPlayer.alive=false;deathAudioCombat.usePlayerSkill(starPrison,deathAudioPlayer,1);deathAudioCombat.usePlayerSkill(starPrison,deathAudioPlayer,2);
for(let i=0;i<40;i+=1)deathAudioCombat.update(.05);
ok(isDeepStrictEqual(deathAudioEvents,['starburst:anticipate','starburst:impact']),
  'death after an owned phased Apex impact cancels every delayed and delivered terminal finisher cue');

const missAudioEvents=[];const missAudioPlayer={...staleAudioPlayer,alive:true,position:new THREE.Vector3(),facing:new THREE.Vector3(1,0,0)};
const missAudioGame=makeWizardGame([]);missAudioGame.player=missAudioPlayer;
missAudioGame.audio=new Proxy({apex(id,phase){missAudioEvents.push(`${id}:${phase}`);}},{get:(target,key)=>target[key]??(()=>{})});
const missAudioCombat=new CombatSystem(missAudioGame);missAudioCombat.usePlayerSkill(staleAudioPierce,missAudioPlayer,'full');
for(let i=0;i<100;i+=1)missAudioCombat.update(.03);
ok(isDeepStrictEqual(missAudioEvents,['piercing_shot:anticipate']),
  'Apex projectile natural retirement after a clean miss emits zero impact and finisher cues');

const switchedAudioEvents=[];const switchedAudioGame=makeWizardGame([]);switchedAudioGame.player=knightPlayer;
switchedAudioGame.audio=new Proxy({apex(id,phase){switchedAudioEvents.push(`${id}:${phase}`);}},{get:(target,key)=>target[key]??(()=>{})});
const switchedAudioCombat=new CombatSystem(switchedAudioGame);knightPlayer.classId='aerin';
switchedAudioCombat.usePlayerSkill(starPrison,knightPlayer,0);knightPlayer.classId='wizard';
switchedAudioCombat.usePlayerSkill(starPrison,knightPlayer,2);knightPlayer.classId='aerin';
ok(isDeepStrictEqual(switchedAudioEvents,['starburst:anticipate','starburst:impact']),
  'class switch cancels stale Apex finisher audio authority');

const duplicateAudioEvents=[];const duplicateAudioGame=makeWizardGame([]);duplicateAudioGame.player=rogueSkillPlayer;
duplicateAudioGame.audio=new Proxy({apex(id,phase){duplicateAudioEvents.push(`${id}:${phase}`);}},{get:(target,key)=>target[key]??(()=>{})});
const duplicateAudioCombat=new CombatSystem(duplicateAudioGame);duplicateAudioCombat.usePlayerSkill(peacock,rogueSkillPlayer,0);
duplicateAudioCombat.usePlayerSkill(peacock,rogueSkillPlayer,1);duplicateAudioCombat.usePlayerSkill(peacock,rogueSkillPlayer,2);
duplicateAudioCombat.usePlayerSkill(peacock,rogueSkillPlayer,2);
ok(isDeepStrictEqual(duplicateAudioEvents,['fan_of_knives:anticipate','fan_of_knives:impact','fan_of_knives:finisher']),
  'duplicate animation and terminal phases cannot repeat Apex audio');

const runOvercastSkill = (id, x) => {
  const enemy=makeWizardEnemy(`overcast-${id}`,x,0);const keys=[];
  enemy.takeDamage=(_raw,_game,options={})=>{keys.push(options.sameCastHit?.key??'base');return{amount:1,killed:false};};
  const game=makeWizardGame([enemy]);game.player=wizardPlayer;wizardPlayer.level=100;wizardPlayer.arcaneOverflow=100;
  wizardPlayer.consumeArcaneOverflow=Player.prototype.consumeArcaneOverflow;wizardPlayer.gainArcaneOverflow=Player.prototype.gainArcaneOverflow;
  const combat=new CombatSystem(game);combat.usePlayerSkill(resolveSkillForm(content.SKILLS[id],10,100,{}),wizardPlayer,0);
  for(let i=0;i<50;i+=1)combat.update(.12);
  return { keys, overflow:wizardPlayer.arcaneOverflow };
};
for(const [id,x] of Object.entries({fireball:2,frost_nova:2,arcane_blink:5,meteor_storm:10})){
  const result=runOvercastSkill(id,x);
  ok(result.overflow===0&&result.keys.filter(key=>key.includes(':overcast')).length===1,
    `${id} consumes overflow at cast start and lands one unique direct overcast finale`);
}

const overflowReactionEnemy=makeWizardEnemy('overflow-reaction',2,0);const overflowReactionKeys=[];
overflowReactionEnemy.takeDamage=(_raw,_game,options={})=>{overflowReactionKeys.push(options.sameCastHit?.key??'base');return{amount:1,killed:false};};
const overflowReactionGame=makeWizardGame([overflowReactionEnemy]);overflowReactionGame.player=wizardPlayer;wizardPlayer.level=100;wizardPlayer.arcaneOverflow=0;
const overflowReactionCombat=new CombatSystem(overflowReactionGame);const overflowFrost=resolveSkillForm(content.SKILLS.frost_nova,10,100,{});
for(let cast=0;cast<3;cast+=1){overflowReactionEnemy.setSpellPrime('burn',{remaining:3});overflowReactionCombat.usePlayerSkill(overflowFrost,wizardPlayer,0);overflowReactionCombat.update(1);}
ok(wizardPlayer.arcaneOverflow===75&&!overflowReactionKeys.some(key=>key.includes(':overcast')),
  'three successful primary reactions charge 75 Overflow and cannot overcast');
overflowReactionEnemy.setSpellPrime('burn',{remaining:3});overflowReactionCombat.usePlayerSkill(overflowFrost,wizardPlayer,0);overflowReactionCombat.update(1);
ok(wizardPlayer.arcaneOverflow===100&&!overflowReactionKeys.some(key=>key.includes(':overcast')),
  'fourth reaction reaches 100 after cast start and cannot spend in the same spell');
overflowReactionEnemy.setSpellPrime('burn',{remaining:3});overflowReactionCombat.usePlayerSkill(overflowFrost,wizardPlayer,0);overflowReactionCombat.update(1);
ok(wizardPlayer.arcaneOverflow===25&&overflowReactionKeys.filter(key=>key.includes(':overcast')).length===1,
  'next Apex cast atomically spends 100 before its reaction and derived overcast cannot refill');

const overflowLifecyclePlayer=new Player(new THREE.Scene(),playerFactoryStub,'low','wizard');
overflowLifecyclePlayer.level=100;overflowLifecyclePlayer.arcaneOverflow=100;overflowLifecyclePlayer.reset('wizard');
const resetOverflow=overflowLifecyclePlayer.arcaneOverflow;overflowLifecyclePlayer.level=100;overflowLifecyclePlayer.arcaneOverflow=100;
overflowLifecyclePlayer.hp=1;overflowLifecyclePlayer.invulnerable=0;overflowLifecyclePlayer.takeDamage(999);
const deathOverflow=overflowLifecyclePlayer.arcaneOverflow;overflowLifecyclePlayer.arcaneOverflow=100;overflowLifecyclePlayer.restore();
const restoreOverflow=overflowLifecyclePlayer.arcaneOverflow;overflowLifecyclePlayer.arcaneOverflow=100;overflowLifecyclePlayer.setClass('ranger');
ok(resetOverflow===0&&deathOverflow===0&&restoreOverflow===0&&overflowLifecyclePlayer.arcaneOverflow===0,
  'Overflow clears on reset, death, restore, and class change');

const bloodEchoTargets=Array.from({length:9},(_,index)=>{const angle=index/9*Math.PI*2;const enemy=makeWizardEnemy(`blood-echo-${index}`,Math.cos(angle)*2,Math.sin(angle)*2);enemy.statuses.bleed={id:'bleed',remaining:3,stacks:3,stackCap:3};return enemy;});
const bloodEchoKeys=[];for(const enemy of bloodEchoTargets)enemy.takeDamage=(_raw,_game,options={})=>{if(options.sameCastHit?.key?.includes(':blood-echo:'))bloodEchoKeys.push(options.sameCastHit.key);return{amount:1,killed:false};};
const bloodEchoGame=makeWizardGame(bloodEchoTargets);bloodEchoGame.player=rogueSkillPlayer;const bloodEchoCombat=new CombatSystem(bloodEchoGame);
bloodEchoCombat.usePlayerSkill(lotusTarget,rogueSkillPlayer,0);bloodEchoCombat.update(.3);bloodEchoCombat.usePlayerSkill(lotusTarget,rogueSkillPlayer,2);
ok(bloodEchoKeys.length===24&&new Set(bloodEchoKeys.map(key=>key.split(':').slice(0,-1).join(':'))).size===8,
  'Blood Echo emits exact three nonrecursive duplicates on at most eight bleeding targets');

const priorRogueCrit=rogueSkillPlayer.critChance;const priorRogueGainEnergy=rogueSkillPlayer.gainEnergy;
rogueSkillPlayer.critChance=10;
for(const tier of [1,2,3]){
  let energyCalls=0,statusCalls=0,reactionCalls=0,primeConsumes=0;
  rogueSkillPlayer.gainEnergy=()=>{energyCalls+=1;};
  const game=makeWizardGame([]);game.player=rogueSkillPlayer;
  game.effects=new Proxy({recipeSpellReaction(){reactionCalls+=1;}},{get:(target,key)=>target[key]??(()=>{})});
  const enemy=makeRealWizardEnemy(game);enemy.id=`real-blood-echo-${tier}`;
  enemy.applyStatus('bleed',{duration:3.4,dps:.09,tick:.4,stackDelta:tier,stackCap:3},game);
  const expectedStatus={remaining:enemy.statuses.bleed.remaining,dps:enemy.statuses.bleed.dps,tick:enemy.statuses.bleed.tick,stacks:enemy.statuses.bleed.stacks,stackCap:enemy.statuses.bleed.stackCap};
  const originalStatus=enemy.applyStatus.bind(enemy);enemy.applyStatus=(...args)=>{statusCalls+=1;return originalStatus(...args);};
  const originalPrimeConsume=enemy.consumeSpellPrime.bind(enemy);enemy.consumeSpellPrime=(...args)=>{primeConsumes+=1;return originalPrimeConsume(...args);};
  const echoHits=[];const originalTake=enemy.takeDamage.bind(enemy);
  enemy.takeDamage=(raw,activeGame,options={})=>{const result=originalTake(raw,activeGame,options);if(options.sameCastHit?.key?.includes(':blood-echo:'))echoHits.push({amount:result.amount,critical:options.critical,key:options.sameCastHit.key});return result;};
  const combat=new CombatSystem(game);combat.usePlayerSkill(peacock,rogueSkillPlayer,0);game.enemies.enemies.push(enemy);combat.usePlayerSkill(peacock,rogueSkillPlayer,2);
  const bleed=enemy.statuses.bleed;
  ok(echoHits.length===tier&&echoHits.every((hit,index)=>hit.amount>0&&!hit.critical&&hit.key===`fan-1:blood-echo:${enemy.id}:${index}`)
    && bleed.remaining===expectedStatus.remaining&&bleed.dps===expectedStatus.dps&&bleed.tick===expectedStatus.tick
    && bleed.stacks===expectedStatus.stacks&&bleed.stackCap===expectedStatus.stackCap
    && statusCalls===0&&energyCalls===0&&reactionCalls===0&&primeConsumes===0,
    `real Enemy Blood Echo tier ${tier} lands exactly ${tier} positive noncritical duplicates without status, energy, or reaction recursion`);
}
rogueSkillPlayer.critChance=priorRogueCrit;
if(priorRogueGainEnergy)rogueSkillPlayer.gainEnergy=priorRogueGainEnergy;else delete rogueSkillPlayer.gainEnergy;

const rangerApexPlayer={...rogueSkillPlayer,classId:'ranger',level:100,position:new THREE.Vector3(),facing:new THREE.Vector3(1,0,0)};
const rangerApexTarget=makeWizardEnemy('marked-convergence-target',2,0);const rangerApexKeys=[];
rangerApexTarget.takeDamage=(_raw,_game,options={})=>{rangerApexKeys.push(options.sameCastHit?.key??'base');return{amount:1,killed:false};};
const rangerApexGame=makeWizardGame([rangerApexTarget]);rangerApexGame.player=rangerApexPlayer;const rangerApexCombat=new CombatSystem(rangerApexGame);
const apexMarkBundle=resolveSkillForm(content.SKILLS.hunter_mark,10,100,{});
rangerApexCombat.usePlayerSkill(apexMarkBundle,rangerApexPlayer);rangerApexCombat.usePlayerSkill(apexMarkBundle,rangerApexPlayer);
ok(rangerApexKeys.filter(key=>key.includes('marked-convergence')).length===1
  && rangerApexKeys.filter(key=>key.endsWith(':convergence')).length>=1
  && rangerApexPlayer.predatorVerdict===null,
  'Hunter Apex captures its live marked target before clear and keeps existing convergence separate');
const deadMarkTarget=makeWizardEnemy('dead-mark-target',2,0);const deadMarkKeys=[];deadMarkTarget.takeDamage=(_r,_g,o={})=>{deadMarkKeys.push(o.sameCastHit?.key??'base');return{amount:1,killed:false};};
const deadMarkGame=makeWizardGame([deadMarkTarget]);deadMarkGame.player=rangerApexPlayer;rangerApexPlayer.position.set(0,0,0);rangerApexPlayer.predatorVerdict=null;
const deadMarkCombat=new CombatSystem(deadMarkGame);deadMarkCombat.usePlayerSkill(apexMarkBundle,rangerApexPlayer);deadMarkTarget.alive=false;deadMarkCombat.usePlayerSkill(apexMarkBundle,rangerApexPlayer);
ok(!deadMarkKeys.some(key=>key.includes('marked-convergence')),'dead marked target grants no convergence authority');

const liveMarkTarget=makeWizardEnemy('live-mark-target',2,0);const liveMarkKeys=[];
liveMarkTarget.takeDamage=(_raw,_game,options={})=>{liveMarkKeys.push(options.sameCastHit?.key??'base');return{amount:1,killed:false};};
const liveMarkGame=makeWizardGame([liveMarkTarget]);liveMarkGame.player=rangerApexPlayer;
 rangerApexPlayer.position.set(0,0,0);rangerApexPlayer.facing.set(1,0,0);rangerApexPlayer.alive=true;
const liveVerdict={target:liveMarkTarget,remaining:5};rangerApexPlayer.predatorVerdict=liveVerdict;
const liveMarkCombat=new CombatSystem(liveMarkGame);const apexPierce=resolveSkillForm(content.SKILLS.piercing_shot,10,100,{});
liveMarkCombat.usePlayerSkill(apexPierce,rangerApexPlayer);for(let i=0;i<100;i+=1)liveMarkCombat.update(.03);
ok(liveMarkKeys.filter(key=>key.includes('marked-convergence')).length===1&&rangerApexPlayer.predatorVerdict===liveVerdict,
  `Ranger Q finale converges once on a live marked target and leaves the mark intact (${liveMarkKeys.join(',')})`);
const staleMarkKeys=[];const staleMarkTarget=makeWizardEnemy('stale-mark-target',2,0);staleMarkTarget.takeDamage=(_r,_g,o={})=>{staleMarkKeys.push(o.sameCastHit?.key??'base');return{amount:1,killed:false};};
const staleMarkGame=makeWizardGame([staleMarkTarget]);staleMarkGame.player=rangerApexPlayer;rangerApexPlayer.predatorVerdict={target:staleMarkTarget,remaining:5};
 rangerApexPlayer.position.set(0,0,0);rangerApexPlayer.facing.set(1,0,0);
const staleMarkCombat=new CombatSystem(staleMarkGame);staleMarkCombat.usePlayerSkill(apexPierce,rangerApexPlayer);
const staleCastId=staleMarkCombat.projectiles.at(-1)?.castId;staleMarkCombat.usePlayerSkill(apexPierce,rangerApexPlayer);
const newestCastId=staleMarkCombat.projectiles.at(-1)?.castId;for(let i=0;i<100;i+=1)staleMarkCombat.update(.03);
ok(staleMarkKeys.filter(key=>key===`${staleCastId}:marked-convergence`).length===0
  && staleMarkKeys.filter(key=>key===`${newestCastId}:marked-convergence`).length===1,
  'Ranger Q recast grants exactly one newest-generation convergence and zero stale-generation convergence');

const apexFxBody=effectsSrc.slice(effectsSrc.indexOf('recipeApexKeystone('),effectsSrc.indexOf('recipeApexKeystone(')+1800);
ok(apexFxBody.length>100&&!/PointLight|SpotLight|DirectionalLight/.test(apexFxBody),
  'Apex keystone recipe is pooled, quality-scaled, and adds no dynamic lights');

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
