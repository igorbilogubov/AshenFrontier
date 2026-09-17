import {World,newHero,stats} from '../../dist/world.js';
import {mobConfig,distance} from '../../dist/public/game/location.js';
import {regionalEquipment,rollEquipment} from '../../dist/public/game/equipment-items.js';
import {defaultSkillBuild} from '../../dist/public/game/skill-builds.js';
import {skillsForClass,SKILLS} from '../../dist/public/game/skills.js';
import {FIELD_BALANCE} from '../../dist/public/game/field-balance.js';
import {MAX_LEVEL,baseXp,targetKills,xpNeeded} from '../../dist/public/game/progression-curve.js';

const CLASSES=['warrior','archer','mage'];
const CASES=[
  {level:5,type:'boar',x:23,z:9.3},
  {level:10,type:'lynx',x:326,z:-46},
  {level:20,type:'frost-spider',x:381,z:-15},
  {level:25,type:'ash-jackal',x:548,z:-22},
  {level:35,type:'monitor-lizard',x:590,z:18},
  {level:40,type:'scarab',x:655,z:8},
];
const SLOTS=['weapon','armor','helmet','boots','ring','amulet'];
const STEP=.05;

function randomSource(seed){
  let state=seed>>>0;
  return ()=>{state=(state*1664525+1013904223)>>>0;return state/2**32;};
}
function midpoint(item){return item.ranges.reduce((sum,range)=>sum+(range.min+range.max)/2,0);}
function gearDefinitions(classId,level){
  const region=level>=25?'wasteland':level>=10?'snow':'forest';
  const choices=regionalEquipment(classId,region,1);
  return SLOTS.map(slot=>choices.filter(item=>item.slot===slot).sort((a,b)=>midpoint(b)-midpoint(a))[0]);
}
function allocations(classId,level){
  const total=level*5,main=classId==='warrior'?'strength':classId==='archer'?'dexterity':'energy';
  const result={strength:0,dexterity:0,vitality:0,energy:0};
  result[main]=Math.floor(total*.55);result.vitality=Math.floor(total*.3);
  const utility=classId==='warrior'?'dexterity':classId==='archer'?'energy':'dexterity';
  result[utility]=total-result[main]-result.vitality;
  return result;
}
function combatBuild(classId,level){
  const attacks=skillsForClass(classId).filter(skill=>skill.unlockLevel<=level&&['attack','control','channel'].includes(skill.kind)).slice(0,4);
  const base=defaultSkillBuild(classId,level);base.slots=Array.from({length:4},(_,index)=>attacks[index]?.id??null);
  return base;
}
function heroFor(classId,level){
  const hero=newHero(`balance-${classId}`,classId);hero.level=level;hero.allocatedStats=allocations(classId,level);hero.skillBuild=combatBuild(classId,level);
  const definitions=gearDefinitions(classId,level);hero.items=definitions.map((definition,index)=>rollEquipment(definition.id,`balance-${classId}-${level}-${index}`,()=>.5));
  hero.equipment=Object.fromEntries(hero.items.map(item=>[item.slot,item.id]));hero.afkPreferences={...hero.afkPreferences,attackSkill:hero.skillBuild.slots.find(Boolean)??null,buffSkills:[],basicAttackFallback:true};
  hero.hp=stats(hero).maxHp;hero.mana=stats(hero).maxMana;return hero;
}
function prepare(caseInfo,classId,count,seed){
  const world=new World({random:randomSource(seed)}),hero=heroFor(classId,caseInfo.level);world.add(hero);
  Object.assign(hero,{x:caseInfo.x,z:caseInfo.z,yaw:0,targetYaw:0});
  for(const mob of world.mobs)Object.assign(mob,{state:'dead',timer:1e9,target:null,contributors:new Map()});
  for(let index=0;index<count;index++){
    const mob=world.mobs[index],angle=index/count*Math.PI*2,radius=count===1?1.8:2.15;
    Object.assign(mob,{type:caseInfo.type,eliteId:undefined,spotId:count===1?undefined:'wolf-den',x:caseInfo.x+Math.sin(angle)*radius,z:caseInfo.z+Math.cos(angle)*radius,homeX:caseInfo.x+Math.sin(angle)*radius,homeZ:caseInfo.z+Math.cos(angle)*radius,hp:mobConfig({type:caseInfo.type}).hp,state:'idle',timer:1,target:null,contributors:new Map()});
  }
  world.mobs=world.mobs.slice(0,count);
  return {world,hero};
}
function liveTargets(world,hero){return world.mobs.filter(mob=>mob.state!=='dead').sort((a,b)=>distance(hero,a)-distance(hero,b)||a.id-b.id);}
function activeAction(world,hero,cursor){
  if(hero.dead||hero.attack)return cursor;
  if(hero.hp/stats(hero).maxHp<.48)world.potion(hero,'hp');
  if(hero.mana/stats(hero).maxMana<.22)world.potion(hero,'mana');
  const target=liveTargets(world,hero)[0];if(!target)return cursor;
  const yaw=Math.atan2(target.x-hero.x,target.z-hero.z),order=hero.skillBuild.slots.filter(Boolean);
  for(let offset=0;offset<order.length;offset++){
    const index=(cursor+offset)%order.length,id=order[index],skill=SKILLS[id];
    if(distance(hero,target)>skill.range+mobConfig(target).radius||hero.mana<skill.manaCost||(hero.skillCooldowns[id]??0)>0)continue;
    const point=['archer-rain','mage-meteor'].includes(id)?{x:target.x,z:target.z}:undefined;
    if(world.castSkill(hero,id,yaw,target.id,point))return (index+1)%order.length;
  }
  world.attack(hero,yaw,false,target.id);return cursor;
}
function tick(world,hero,level,seconds,mode,stopAfterKill=false){
  let cursor=0,deaths=0,previousDead=false,minHp=hero.hp,endedAt=seconds;
  const initialKills=hero.kills;
  if(mode==='afk')world.startAfk(hero);
  for(let index=0;index<Math.ceil(seconds/STEP);index++){
    if(mode==='active')cursor=activeAction(world,hero,cursor);
    world.tick(STEP,world.t+STEP*1000);hero.level=level;hero.xp=0;
    minHp=Math.min(minHp,hero.hp);
    if(hero.dead&&!previousDead){deaths++;if(mode==='afk'){endedAt=(index+1)*STEP;break;}}
    if(stopAfterKill&&hero.kills>initialKills){endedAt=(index+1)*STEP;break;}
    previousDead=!!hero.dead;
  }
  const elapsed=endedAt,hpMax=stats(hero).maxHp;
  return {kills:hero.kills-initialKills,killsPerHour:Math.round((hero.kills-initialKills)/elapsed*3600),deaths,seconds:Math.round(elapsed*10)/10,minHpPercent:Math.round(minHp/hpMax*100),hpPotions:3-hero.potions,manaPotions:3-hero.manaPotions};
}
function single(caseInfo,classId,seed){
  const {world,hero}=prepare(caseInfo,classId,1,seed);const result=tick(world,hero,caseInfo.level,120,'active',true);
  return {...result,ttkSeconds:result.kills?result.seconds:null};
}
function pack(caseInfo,classId,mode,seed){
  const {world,hero}=prepare(caseInfo,classId,6,seed);return tick(world,hero,caseInfo.level,300,mode);
}
function sustainedSingle(caseInfo,classId,mode,seed){
  const {world,hero}=prepare(caseInfo,classId,1,seed);return tick(world,hero,caseInfo.level,600,mode);
}

const measurements=[];let seed=20260916;
for(const caseInfo of CASES)for(const classId of CLASSES){
  const one=single(caseInfo,classId,seed++),activeSingle=sustainedSingle(caseInfo,classId,'active',seed++),afkSingle=sustainedSingle(caseInfo,classId,'afk',seed++),activePack=pack(caseInfo,classId,'active',seed++),afkPack=pack(caseInfo,classId,'afk',seed++);
  measurements.push({level:caseInfo.level,mob:caseInfo.type,classId,singleTtk:one.ttkSeconds,singleMinHp:one.minHpPercent,
    activeSingleKph:activeSingle.killsPerHour,activeSingleDeaths:activeSingle.deaths,afkSingleKph:afkSingle.killsPerHour,afkSingleDeaths:afkSingle.deaths,afkEfficiency:activeSingle.killsPerHour?Math.round(afkSingle.killsPerHour/activeSingle.killsPerHour*100):0,
    activePackKph:activePack.killsPerHour,activePackDeaths:activePack.deaths,afkPackKph:afkPack.killsPerHour,afkPackDeaths:afkPack.deaths,afkPackSeconds:afkPack.seconds});
}
const bands=[[1,20],[20,40],[40,60],[60,80],[80,MAX_LEVEL]].map(([from,to])=>({levels:`${from}-${to}`,equalLevelKills:Array.from({length:to-from},(_,i)=>targetKills(from+i)).reduce((sum,value)=>sum+value,0)}));
const payload={assumptions:{singleDurationSeconds:600,packDurationSeconds:300,stepSeconds:STEP,gear:'median green equipment from the highest unlocked current field tier',allocations:'55% main, 30% vitality, 15% class utility',single:'one ordinary field spawn with the real 24 second respawn',pack:'six ordinary mobs, authored 16 second respawn, stationary hero',active:'server skills plus basic fallback and configured potions',afk:'real World.startAfk; stops on first death'},curve:{maxLevel:MAX_LEVEL,xp1:xpNeeded(1),xp20:xpNeeded(20),xp40:xpNeeded(40),xp60:xpNeeded(60),xp80:xpNeeded(80),xp99:xpNeeded(99),bands},fieldBalance:FIELD_BALANCE,measurements};
if(process.argv.includes('--json'))console.log(JSON.stringify(payload,null,2));
else{
  console.log('Progression curve');console.table(payload.curve.bands);
  console.log('World combat samples');console.table(measurements);
  console.log('Run with --json for the reproducible machine-readable report.');
}
