import {equipLegacySkills} from './helpers/skill-builds.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,stats} from '../dist/world.js';
import {SKILLS} from '../dist/public/game/skills.js';
import {safe} from '../dist/public/game/location.js';
import {SHOP} from '../dist/public/game/shop.js';
import {PORTALS} from '../dist/public/game/stadium.js';

const step=(w,n=1)=>{for(let i=0;i<n;i++)w.tick(.05,w.t+50);};

test('combat chase is wider than patrol; wounded animals return without instant healing and can reacquire',()=>{
  const w=new World({random:()=>0}),p=newHero('Бегун');w.add(p);
  const m=w.mobs[0];w.mobs=[m];
  Object.assign(m,{x:m.homeX+9,z:m.homeZ,hp:20,state:'chase',target:p.id});
  Object.assign(p,{x:m.x+1,z:m.z});step(w,10);
  assert(['chase','windup','recover'].includes(m.state));assert.equal(m.hp,20);
  Object.assign(p,{x:50,z:30});step(w);
  assert.equal(m.state,'return');assert.equal(m.hp,20);
  Object.assign(p,{x:m.x+2,z:m.z});step(w);
  assert.equal(m.state,'chase');assert.equal(m.target,p.id);assert.equal(m.hp,20);
  Object.assign(p,{x:50,z:30});step(w);assert.equal(m.state,'return');
  Object.assign(p,{x:m.x+2,z:m.z});
  assert(w.hurtMob(p,m,1),'returning mob should take real damage and reengage');
  assert.equal(m.state,'chase');assert.equal(m.hp,19);
  Object.assign(p,{x:50,z:30});step(w,20);
  assert.equal(m.hp,19,'return travel and grace preserve damage');
  for(let i=0;i<500&&m.state!=='idle';i++)step(w);
  assert.equal(m.state,'idle');assert.equal(m.hp,60);
});

test('safe entry cancels windup, projectiles and delayed areas before vendor and portal checks',()=>{
  const w=new World(),p=newHero('Убежище','mage');w.add(p);
  Object.assign(p,{x:SHOP.x,z:SHOP.z,attack:{id:1,age:0,duration:1,yaw:0,hit:false,special:false},combatUntil:w.t+15000});
  const m=w.mobs[0];Object.assign(m,{state:'windup',target:p.id,timer:.01,targetYaw:Math.PI});
  w.projectiles.push({id:'safe-shot',owner:p.id,x:7,z:2,yaw:0,remaining:10,speed:1,kind:'mage',damage:999,aoe:0});
  w.pendingAreas.push({skillId:'mage-meteor',caster:p.id,attackId:1,yaw:0,x:8,z:2,at:w.t+100,damage:999,automatic:false});
  const hp=p.hp;step(w);
  assert(safe(p));assert.equal(p.hp,hp);assert.equal(p.attack,null);assert.equal(p.combatUntil,w.t);
  assert.equal(m.target,null);assert.equal(m.state,'return');assert.equal(w.projectiles.length,0);assert.equal(w.pendingAreas.length,0);
  assert(w.startVendor(p,SHOP.id));
  Object.assign(p,{x:PORTALS[0].x,z:PORTALS[0].z,combatUntil:w.t+10000});
  assert(w.startPortal(p,PORTALS[0].id));assert.equal(p.combatUntil,w.t);
});

test('server target checks reject malformed, blocked, distant and cross-region aims before cost',()=>{
  const w=new World(),p=newHero('Прицел','mage');w.add(p);Object.assign(p,{x:8,z:1.8});
  const m=w.mobs[0];Object.assign(m,{x:10,z:1.8,state:'recover',timer:100});w.mobs=[m];
  p.mana=stats(p).maxMana;const before=p.mana;
  for(const targetId of [NaN,999]){
    w.command(p,{type:'skill',skillId:'mage-fireball',yaw:Math.PI/2,targetId});
    assert.equal(p.attack,null);assert.equal(p.mana,before);
  }
  Object.assign(m,{x:60,z:0});w.command(p,{type:'skill',skillId:'mage-fireball',yaw:Math.PI/2,targetId:m.id});
  assert.equal(p.attack,null);assert.equal(p.mana,before);
  Object.assign(m,{x:160,z:15});w.command(p,{type:'skill',skillId:'mage-fireball',yaw:Math.PI/2,targetId:m.id});
  assert.equal(p.attack,null);assert.equal(p.mana,before);
  for(const target of [{x:Infinity,z:2},{x:160,z:15}]){
    w.command(p,{type:'skill',skillId:'mage-meteor',yaw:Math.PI/2,target});
    assert.equal(p.attack,null);assert.equal(p.mana,before);
  }
  assert(w.events.some(e=>e.type==='notice'&&e.owner===p.id));
});

test('ground areas use a clamped server point; aimed body contact and accuracy remain separate',()=>{
  const w=new World({random:()=>0}),p=newHero('Наведение','mage');equipLegacySkills(p);p.mana=stats(p).maxMana;w.add(p);Object.assign(p,{x:8,z:1.8,yaw:Math.PI/2,targetYaw:Math.PI/2});
  const m=w.mobs[0];w.mobs=[m];Object.assign(m,{x:12,z:1.8,homeX:12,homeZ:1.8,hp:190,state:'recover',timer:100,target:p.id});
  p.mana=stats(p).maxMana;
  w.command(p,{type:'skill',skillId:'mage-meteor',yaw:Math.PI/2,target:{x:30,z:1.8}});
  assert(p.attack?.target);assert(Math.abs(p.attack.target.x-(8+SKILLS['mage-meteor'].range))<1e-6);
  step(w,35);assert(w.events.some(e=>e.type==='skillImpact'&&e.phase==='warning'&&Math.abs(e.x-(8+SKILLS['mage-meteor'].range))<1e-6));
  p.attack=null;p.skillCooldowns['mage-fireball']=0;p.mana=stats(p).maxMana;
  Object.assign(m,{x:10,z:1.8,hp:190,state:'recover',timer:100});
  w.random=()=>.999;w.command(p,{type:'skill',skillId:'mage-fireball',yaw:0,targetId:m.id});step(w,30);
  assert.equal(m.hp,190);assert(w.events.some(e=>e.type==='miss'&&e.id===m.id));
  assert(!w.events.some(e=>e.type==='notice'&&e.text.includes('Снаряд не коснулся')));
});
