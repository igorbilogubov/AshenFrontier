import {SKILLS} from '../../dist/public/game/skills.js';
const original={warrior:['warrior-cleave','warrior-whirlwind','warrior-thrust','warrior-shockwave'],archer:['archer-piercing','archer-volley','archer-frost-shot','archer-rain'],mage:['mage-fireball','mage-frost','mage-lightning','mage-meteor']};
/** Regression fixtures exercise the original four attacks at their real unlock level. */
export const legacyCombatSkills=classId=>original[classId].map(id=>SKILLS[id]);
export function equipLegacySkills(hero){hero.level=Math.max(hero.level,22);hero.skillBuild={slots:[...original[hero.classId],null],talents:{}};hero.afkPreferences={...hero.afkPreferences,attackSkill:original[hero.classId][0],buffSkills:[]};return hero;}
