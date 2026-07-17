/**
 * Active skill attach entry — class kits under combat/skills/.
 */
import { attachKnightSkillMethods } from './knightSkills.js';
import { attachWizardSkillMethods } from './wizardSkills.js';
import { attachRogueSkillMethods } from './rogueSkills.js';
import { attachRangerSkillMethods } from './rangerSkills.js';
import { attachGunnerSkillMethods } from './gunnerSkills.js';

export function attachActiveSkillMethods(proto) {
  attachKnightSkillMethods(proto);
  attachWizardSkillMethods(proto);
  attachRogueSkillMethods(proto);
  attachRangerSkillMethods(proto);
  attachGunnerSkillMethods(proto);
}
