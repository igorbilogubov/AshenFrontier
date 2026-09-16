import test from 'node:test';
import assert from 'node:assert/strict';
import {SKILLS,skillsForClass} from '../dist/public/game/skills.js';
import {defaultSkillBuild,parseSkillBuild} from '../dist/public/game/skill-builds.js';

const classes=['warrior','archer','mage'];
const largeAreas={
  warrior:'warrior-earthquake',
  archer:'archer-arrow-storm',
  mage:'mage-arcane-nova'
};

test('every class has a level-20 large-area skill with a deliberately low per-target ceiling and no cooldown',()=>{
  assert.equal(Object.keys(SKILLS).length,39);
  for(const classId of classes){
    const skills=skillsForClass(classId),skill=SKILLS[largeAreas[classId]];
    assert.equal(skills.length,13,classId);
    assert.deepEqual(skills.map(value=>value.unlockLevel),[1,3,5,8,10,14,18,20,22,27,32,38,45],classId);
    assert.equal(skill.classId,classId);
    assert.equal(skill.unlockLevel,20);
    assert(skill.maxTargets>=10,`${skill.id} must feel massive`);
    assert(skill.damageScale<=.6,`${skill.id} must trade per-target damage for reach`);
    assert(skill.manaCost>=26,`${skill.id} must have a meaningful mana cost`);
    assert.equal(skill.cooldown,0,`${skill.id} must be limited by animation and mana, not a timer`);
    assert(skill.damageScale*skill.maxTargets>=5,`${skill.id} must reward a genuinely large pack`);
    assert(skill.damageScale*skill.maxTargets<=6,`${skill.id} total ceiling is too high`);
  }
  assert(SKILLS['warrior-earthquake'].range>=5);
  assert(SKILLS['archer-arrow-storm'].radius>=5);
  assert(SKILLS['mage-arcane-nova'].range>=5);
});

test('five-slot builds preserve old four-slot saves by adding an empty RMB slot',()=>{
  const old={slots:['warrior-cleave','warrior-whirlwind','warrior-thrust','warrior-charge'],talents:{}};
  assert.deepEqual(parseSkillBuild(old,'warrior',20),{...old,slots:[...old.slots,null]});
  const current={slots:['warrior-cleave','warrior-whirlwind','warrior-thrust','warrior-charge','warrior-earthquake'],talents:{}};
  assert.deepEqual(parseSkillBuild(current,'warrior',20),current);
  assert.equal(parseSkillBuild({...current,slots:[...current.slots,null]},'warrior',20),null);
  assert.equal(defaultSkillBuild('mage',20).slots.length,5);
});
