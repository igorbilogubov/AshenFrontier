import {defaultSkillBuild} from '../dist/public/game/skill-builds.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,stats} from '../dist/world.js';
import {skillsForClass} from '../dist/public/game/skills.js';

// Controlled contact scenario, not a replacement for real moving mobs or PvP.
const EAST=Math.PI/2,SECONDS=30,INITIAL_HP=100000;
const classes=['warrior','archer','mage'];
const budgets={
  warrior:{strength:30,dexterity:5,vitality:10,energy:5},
  archer:{strength:0,dexterity:30,vitality:10,energy:10},
  mage:{strength:0,dexterity:10,vitality:10,energy:30}
};
function randomFor(seed){
  let state=seed;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
}
function run(classId,level,targets,mode,seed,duration=SECONDS){
  const w=new World({random:randomFor(seed)}),p=newHero('Баланс',classId);w.add(p);
  p.level=level;p.skillBuild=defaultSkillBuild(classId,level);p.allocatedStats=level===1?{...p.allocatedStats,[classId==='warrior'?'strength':classId==='archer'?'dexterity':'energy']:5}:budgets[classId];
  p.mana=stats(p).maxMana;p.hp=stats(p).maxHp;
  Object.assign(p,{x:8,z:1.8,yaw:EAST,targetYaw:EAST});
  w.mobs=w.mobs.slice(0,targets);
  // Same coordinates for every class. Enemies stay still and invulnerable to
  // death, while World performs real phases, collision, accuracy and MP regen.
  const locations=[[9.4,1.8],[9.4,2.7],[9.4,.9]];
  for(let i=0;i<w.mobs.length;i++)Object.assign(w.mobs[i],{
    x:locations[i][0],z:locations[i][1],homeX:locations[i][0],homeZ:locations[i][1],
    hp:INITIAL_HP,state:'recover',timer:100000,target:p.id
  });
  const ids=skillsForClass(classId).map(skill=>skill.id),casts={regular:0,Q:0,E:0};
  for(let i=0;i<duration*20;i++){
    if(!p.attack){
      const order=mode==='Q'?[0]:mode==='E'?[1]:mode==='both'?[0,1]:[];
      let skillUsed=false;
      for(const index of order){
        if(w.castSkill(p,ids[index],EAST)){casts[index===0?'Q':'E']++;skillUsed=true;break;}
      }
      if(!skillUsed&&w.attack(p,EAST))casts.regular++;
    }
    w.tick(.05,w.t+50);
    assert(p.mana>=0&&p.mana<=stats(p).maxMana);
  }
  const damage=w.mobs.map(m=>INITIAL_HP-m.hp),misses=w.events.filter(e=>e.type==='miss').length;
  return {damage:damage.reduce((a,b)=>a+b,0),perTarget:damage,casts,misses,remainingMana:p.mana,
    maxMana:stats(p).maxMana,regen:stats(p).manaRegen,attack:stats(p).attack,accuracy:stats(p).hitChance};
}

test('World tick sample compares sustained Q/E and normal attack with misses, MP and casting time',()=>{
  const samples=16,results=[];
  for(const level of [1,10])for(const targets of [1,3])for(const classId of classes){
    for(const mode of ['regular','Q','E','both']){
      const entries=Array.from({length:samples},(_,i)=>run(classId,level,targets,mode,i+1));
      const mean=(field)=>entries.reduce((sum,e)=>sum+field(e),0)/samples;
      const example=entries[0];
      results.push({level,targets,classId,mode,dps:+(mean(e=>e.damage)/SECONDS).toFixed(2),
        perTarget:example.perTarget.map((_,i)=>+mean(e=>e.perTarget[i]).toFixed(1)),casts:{regular:+mean(e=>e.casts.regular).toFixed(1),Q:+mean(e=>e.casts.Q).toFixed(1),E:+mean(e=>e.casts.E).toFixed(1)},
        misses:+mean(e=>e.misses).toFixed(1),finalMP:+mean(e=>e.remainingMana).toFixed(1),maxMP:example.maxMana,
        regen:+example.regen.toFixed(2),attack:+example.attack.toFixed(2),accuracy:+example.accuracy.toFixed(3)});
    }
  }
  for(const row of results)assert(row.dps>0&&row.dps<1000);
  if(process.env.COMBAT_BALANCE_VERBOSE==='1')console.log('COMBAT_BALANCE_RESULTS '+JSON.stringify(results));
  const sustained=[];
  for(const level of [1,10])for(const targets of [1,3])for(const classId of classes){
    const entries=Array.from({length:8},(_,i)=>run(classId,level,targets,'both',i+1,90));
    const mean=field=>entries.reduce((sum,e)=>sum+field(e),0)/entries.length;
    sustained.push({level,targets,classId,dps:+(mean(e=>e.damage)/90).toFixed(2),
      Q:mean(e=>e.casts.Q),E:mean(e=>e.casts.E),finalMP:+mean(e=>e.remainingMana).toFixed(1)});
  }
  if(process.env.COMBAT_BALANCE_VERBOSE==='1')console.log('COMBAT_BALANCE_90S '+JSON.stringify(sustained));
});
