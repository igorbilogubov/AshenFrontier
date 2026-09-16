import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,stats} from '../dist/world.js';

// Contact throughput with identical class, gear and unallocated attributes.
// Mana is replenished for this ceiling test; paid MP consumption is recorded.
// This is deliberately not an economy, moving-target, talent-build or PvP claim.
function sample(ids){
 const classId=ids[0].split('-')[0],w=new World({random:()=>0}),p=newHero('Проверка',classId);
 p.level=45;p.skillBuild={slots:[...ids,...Array(4-ids.length).fill(null)],talents:{}};
 Object.assign(p,{x:8,z:1.8,yaw:Math.PI/2,targetYaw:Math.PI/2});w.add(p);
 const m=w.mobs[0];Object.assign(m,{x:9.4,z:1.8,homeX:9.4,homeZ:1.8,hp:100000,state:'recover',timer:10000,target:p.id});w.mobs=[m];
 let manaSpent=0,casts=0;
 for(let i=0;i<1200;i++){
  p.mana=stats(p).maxMana;
  if(!p.attack||p.channel){
   const id=ids.length>1&&m.dots?.some(dot=>dot.remaining>1)?ids[1]:ids[0],before=p.mana;
   if(w.castSkill(p,id,Math.PI/2,m.id)){manaSpent+=before-p.mana;casts++;}
  }
  const before=p.mana;w.tick(.05,w.t+50);if(p.channel)manaSpent+=Math.max(0,before-p.mana);
 }
 return {ids,dps:(100000-m.hp)/60,mpPerSecond:manaSpent/60,casts};
}
test('one repeated single-target skill stays within 15 percent of a bleed/poison rotation ceiling',()=>{
 for(const pair of [['warrior-heavy','warrior-bleed'],['archer-aimed','archer-poison']]){
  const primary=sample([pair[0]]),dot=sample([pair[1]]),rotation=sample([pair[1],pair[0]]);
  assert(dot.dps>=primary.dps*.85);assert(dot.dps<=primary.dps*1.15);
  assert(rotation.dps<=Math.max(primary.dps,dot.dps)*1.15);
  assert(dot.mpPerSecond<=primary.mpPerSecond*1.2,'repeatable DoT must not pay an excessive mana premium');
  if(process.env.COMBAT_BALANCE_VERBOSE==='1')console.log(JSON.stringify({primary,dot,rotation}));
 }
 const lance=sample(['mage-ice-lance']),beam=sample(['mage-beam']);
 assert(beam.dps>=lance.dps*.85);assert(beam.mpPerSecond<lance.mpPerSecond);
 if(process.env.COMBAT_BALANCE_VERBOSE==='1')console.log(JSON.stringify({lance,beam}));
});
