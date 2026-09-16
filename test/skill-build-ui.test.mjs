import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {actionIcon} from '../dist/public/game/action-icons.js';
import {SKILLS,skillsForClass} from '../dist/public/game/skills.js';
import {TALENTS,parseSkillBuild,talentBranches,talentPoints} from '../dist/public/game/skill-builds.js';

const classes=['warrior','archer','mage'];
const legacy=new Set(['warrior-cleave','warrior-whirlwind','warrior-thrust','warrior-shockwave','archer-piercing','archer-volley','archer-frost-shot','archer-rain','mage-fireball','mage-frost','mage-lightning','mage-meteor']);
const newSkills=Object.values(SKILLS).filter(skill=>!legacy.has(skill.id));

test('skillbook catalog presents thirteen level-ordered skills and three complete talent branches per class',()=>{
  for(const classId of classes){
    const skills=skillsForClass(classId);assert.equal(skills.length,13,classId);assert.deepEqual(skills.map(skill=>skill.unlockLevel),[1,3,5,8,10,14,18,20,22,27,32,38,45]);
    const branches=talentBranches(classId);assert.equal(branches.length,3,classId);
    for(const branch of branches){const talents=TALENTS.filter(talent=>talent.classId===classId&&talent.branch===branch.id);assert.equal(talents.filter(talent=>!talent.keystone).length,5);assert.equal(talents.filter(talent=>talent.keystone).length,1);}
  }
});

test('all twenty-seven new actions have a distinct authored HUD silhouette',()=>{
  assert.equal(newSkills.length,27);const icons=newSkills.map(skill=>actionIcon(skill.id));assert.equal(new Set(icons).size,27);
  for(const skill of newSkills)assert.notEqual(actionIcon(skill.id),actionIcon(skill.classId),`${skill.id} fell back to the class icon`);
});

test('client-side build validation exposes the same locked-level, budget and keystone rules shown in the UI',()=>{
  const level10={slots:['warrior-cleave','warrior-whirlwind','warrior-thrust','warrior-charge'],talents:{}};assert.deepEqual(parseSkillBuild(level10,'warrior',10),{...level10,slots:[...level10.slots,null]});
  assert.equal(parseSkillBuild({...level10,slots:['warrior-cleave','warrior-cleave',null,null,null]},'warrior',10),null,'duplicate skill');
  assert.equal(parseSkillBuild({...level10,slots:['warrior-banner',null,null,null,null]},'warrior',10),null,'locked skill');
  const duelist=TALENTS.filter(talent=>talent.classId==='warrior'&&talent.branch==='duelist'),minors=duelist.filter(talent=>!talent.keystone),keystone=duelist.find(talent=>talent.keystone);
  const validTalents=Object.fromEntries([...minors.slice(0,4).map(talent=>[talent.id,2]),[keystone.id,1]]);assert(parseSkillBuild({...level10,talents:validTalents},'warrior',42));
  assert.equal(parseSkillBuild({...level10,talents:{[minors[0].id]:2,[keystone.id]:1}},'warrior',42),null,'keystone before eight branch points');
  assert.equal(talentPoints(9),0);assert.equal(talentPoints(10),1);assert.equal(talentPoints(86),20);assert.equal(talentPoints(100),20);
});

test('production page includes an accessible non-HUD-shifting skillbook surface',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  for(const id of ['skillbook-toggle','skillbook-panel','skillbook-skills','skillbook-slots','skillbook-catalog','skillbook-talents','talent-branches','skillbook-apply','skillbook-status'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/game\/skillbook\.css/);assert.match(html,/aria-controls="skillbook-panel"/);assert.match(html,/Навыки и таланты · K/);
});
