// Deterministic offline combat audit. No HTTP, accounts, PostgreSQL, or saves.
// Run after npm run build: node scripts/balance/skill-alpha.mjs
import {World,newHero,stats} from '../../dist/world.js';
import {skillsForClass} from '../../dist/public/game/skills.js';
import {effectiveSkill,talentPoints} from '../../dist/public/game/skill-builds.js';
import {regionalEquipment,rollEquipment} from '../../dist/public/game/equipment-items.js';
const level=25,dt=.05,east=Math.PI/2;
const allocations={warrior:{strength:65,dexterity:20,vitality:25,energy:15},archer:{strength:0,dexterity:65,vitality:35,energy:25},mage:{strength:0,dexterity:20,vitality:40,energy:65}};
const talents={warrior:{'warrior-duelist-1':2,'warrior-duelist-2':2},archer:{'archer-sniper-1':2,'archer-sniper-2':2},mage:{'mage-arcanist-1':2,'mage-arcanist-2':2}};
function fixture(classId,id,count,manaMode,withTalents=false){
 // A seeded roll sequence reproduces hit/miss variation without guaranteeing hits.
 let seed=619;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const w=new World({random}),p=newHero('Баланс',classId);w.add(p);Object.assign(p,{level,x:10,z:1.8,yaw:east,targetYaw:east,allocatedStats:allocations[classId]});
 p.items=regionalEquipment(classId,'wasteland',1).map(def=>rollEquipment(def.id,def.id,()=>.5));p.equipment=Object.fromEntries(p.items.map(i=>[i.slot,i.id]));p.skillBuild={slots:[id,null,null,null,null,null],talents:withTalents?talents[classId]:{}};p.hp=stats(p).maxHp;p.mana=stats(p).maxMana;
 const coords=count===1?[[1.6,0]]:[[1.3,-.55],[1.3,.55],[2.3,-.55],[2.3,.55]];w.mobs=w.mobs.slice(0,count);w.mobs.forEach((m,i)=>Object.assign(m,{type:'wolf',eliteId:undefined,x:p.x+coords[i][0],z:p.z+coords[i][1],homeX:p.x+coords[i][0],homeZ:p.z+coords[i][1],hp:1000000,state:'recover',timer:100000,target:p.id}));
 return {w,p,count,manaMode};
}
function sample(classId,id,count,manaMode,withTalents=false){
 const seconds=manaMode==='ceiling'?60:300,f=fixture(classId,id,count,manaMode,withTalents),{w,p}=f;let spent=0,casts=0,basic=0;
 for(let n=0;n<seconds/dt;n++){
  if(manaMode==='ceiling')p.mana=stats(p).maxMana;
  const before=p.mana,skill=effectiveSkill(p,id),previous=p.attackSerial;
  const target=skill.maxTargets===1?w.mobs[0].id:undefined;
  if(!w.castSkill(p,id,east,target)&&manaMode==='natural'&&!p.attack&&!p.channel){if(w.attack(p,east,false,w.mobs[0].id))basic++;}
  if(p.attackSerial>previous&&p.attack?.skillId===id)casts++;
  spent+=Math.max(0,before-p.mana);const preTick=p.channel?.nextTick;w.tick(dt,w.t+dt*1000);
  // Only channel can spend MP during this tick; ordinary casting was counted above.
  if(id==='mage-beam'&&p.channel&&p.channel.nextTick!==preTick)spent+=effectiveSkill(p,id).manaCost;
  w.events=[];
 }
 return {classId,skill:id,targets:count,seconds,mana:manaMode,talents:withTalents?talentPoints(level):0,dps:Number((w.mobs.reduce((n,m)=>n+1000000-m.hp,0)/seconds).toFixed(2)),mpPerSecond:Number((spent/seconds).toFixed(2)),casts,basic,maxMana:stats(p).maxMana,manaRegen:Number(stats(p).manaRegen.toFixed(3)),endMana:Number(p.mana.toFixed(1))};
}
const talentRows=[['warrior','warrior-heavy'],['archer','archer-aimed'],['mage','mage-beam']].flatMap(([c,id])=>[false,true].map(on=>sample(c,id,1,'ceiling',on)));
const rows=[];for(const c of ['warrior','archer','mage'])for(const s of skillsForClass(c).filter(s=>s.unlockLevel<=level&&(s.kind==='attack'||s.kind==='channel')&&s.cooldown===0))for(const count of [1,4])for(const mode of ['ceiling','natural'])rows.push(sample(c,s.id,count,mode));
console.log(JSON.stringify({method:{level,durations:{ceiling:60,natural:300},dt,allocations,gear:'six class-specific wasteland uncommon items, midpoint rolls',talents:'baseline 0, same unspent budget4; talentRows spend four points per class',targets:'stationary wolves with 1000000 HP, no attacks, group rectangle1.0m×1.1m; hero stationary; hit/miss seeded',natural:'full starting MP, regen, no potions; try skill each tick, use basic when skill cannot start and no attack/channel is active',ceiling:'refill MP eachtick, damage ceiling not normalplay'},rows,talentRows},null,2));
