import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,stats} from '../dist/world.js';
import {SKILLS,skillsForClass} from '../dist/public/game/skills.js';
import {rollEquipment} from '../dist/public/game/equipment-items.js';

const east=Math.PI/2;
const step=(w,n=1)=>{for(let i=0;i<n;i++)w.tick(.05,w.t+50);};
function setup(classId='warrior'){
  const w=new World({random:()=>0}),p=newHero('Темп',classId);w.add(p);
  Object.assign(p,{x:8,z:1.8,yaw:east,targetYaw:east});
  const m=w.mobs[0];w.mobs=[m];Object.assign(m,{x:9.4,z:1.8,homeX:9.4,homeZ:1.8,hp:10000,state:'recover',timer:10000,target:p.id});
  p.mana=stats(p).maxMana;return {w,p,m};
}

test('nine ordinary skills have no individual cooldown; fourth per class retains one',()=>{
  for(const classId of ['warrior','archer','mage']){
    const skills=skillsForClass(classId);
    assert.deepEqual(skills.map(skill=>skill.cooldown>0),[false,false,false,true]);
    const {w,p}=setup(classId),q=skills[0],e=skills[1];
    assert(w.castSkill(p,q.id,east));const first=p.attack.id,startMana=p.mana;
    for(let i=0;p.attack&&i<50;i++){
      assert.equal(w.castSkill(p,q.id,east),false);
      assert.equal(w.castSkill(p,e.id,east),false);
      assert.equal(p.attack.id,first);assert(p.mana>=startMana&&p.mana<=stats(p).maxMana);
      step(w);
    }
    while(p.attack)step(w);
    assert.equal(p.skillCooldowns[q.id],0);
    assert(w.castSkill(p,q.id,east),'after full recovery, mana is the only per-skill gate');
    assert.equal(p.attack.id,first+1);
  }
});

test('contact occurs once per attack and recovering phase cannot be cancelled by packet spam',()=>{
  const {w,p,m}=setup(),q=SKILLS['warrior-cleave'],initialMana=p.mana;
  assert(w.castSkill(p,q.id,east));const id=p.attack.id;
  while(!p.attack.hit){assert.equal(w.castSkill(p,q.id,east),false);step(w);}
  const afterContact=m.hp;assert(afterContact<10000);
  while(p.attack){assert.equal(w.attack(p,east),false);assert.equal(w.castSkill(p,'warrior-thrust',east),false);step(w);assert.equal(m.hp,afterContact);}
  assert(p.mana>initialMana-q.manaCost&&p.mana<initialMana-q.manaCost+2);
  assert.equal(p.attackSerial,id);
  assert(w.castSkill(p,q.id,east));assert.equal(p.attackSerial,id+1);
  while(p.attack)step(w);
  assert(m.hp<afterContact);
});

test('haste shortens full animation/contact/recovery, but never changes MP cost or fourth-skill cooldown',()=>{
  const base=setup(),fast=setup();
  const ring=rollEquipment('copper-ring','haste-ring',()=>1-Number.EPSILON);
  for(const roll of ring.rolls)if(roll.key==='haste')roll.value=25;
  fast.p.items.push(ring);fast.p.equipment.ring=ring.id;
  for(const {w,p} of [base,fast]){
    assert(w.castSkill(p,'warrior-cleave',east));
    assert.equal(p.skillCooldowns['warrior-cleave'],0);
  }
  const skill=SKILLS['warrior-cleave'];
  assert(stats(fast.p).attackSpeed>0);
  assert(Math.abs(fast.p.attack.duration/base.p.attack.duration-1/(1+stats(fast.p).attackSpeed))<1e-10);
  assert.equal(fast.p.mana-base.p.mana,0);
  const contact=(fixture)=>{let ticks=0;while(!fixture.p.attack.hit){step(fixture.w);ticks++;}return ticks;};
  assert(contact(fast)<contact(base));
  const fourthBase=setup(),fourthFast=setup();fourthFast.p.items.push(ring);fourthFast.p.equipment.ring=ring.id;
  assert(fourthBase.w.castSkill(fourthBase.p,'warrior-shockwave',east));
  assert(fourthFast.w.castSkill(fourthFast.p,'warrior-shockwave',east));
  assert.equal(fourthBase.p.skillCooldowns['warrior-shockwave'],fourthFast.p.skillCooldowns['warrior-shockwave']);
  assert(fourthFast.p.attack.duration<fourthBase.p.attack.duration);
  assert.equal(skill.cooldown,0);
});

test('saved remaining cooldown from the previous release counts down, then new zero-cooldown rule applies',()=>{
  const {w,p}=setup('mage');p.skillCooldowns['mage-fireball']=.15;
  assert.equal(w.castSkill(p,'mage-fireball',east),false);step(w,3);
  assert(w.castSkill(p,'mage-fireball',east));
  while(p.attack)step(w);
  assert.equal(p.skillCooldowns['mage-fireball'],0);
  assert(w.castSkill(p,'mage-fireball',east));
});
