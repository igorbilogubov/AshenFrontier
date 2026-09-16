import {World,newHero,stats} from '../../dist/world.js';
import {mobConfig,distance} from '../../dist/public/game/location.js';
import {regionalEquipment,rollEquipment} from '../../dist/public/game/equipment-items.js';
import {defaultSkillBuild} from '../../dist/public/game/skill-builds.js';
import {SKILLS} from '../../dist/public/game/skills.js';
import {LATE_REGIONS} from '../../dist/public/game/late-world.js';

const CLASSES=['warrior','archer','mage'];
const CASES=[
  {level:40,region:'swamp',type:'swamp-frog'},
  {level:55,region:'mines',type:'cave-bat'},
  {level:70,region:'rift',type:'hellhound'},
  {level:85,region:'citadel',type:'bonehound'},
  {level:99,region:'citadel',type:'iron-warden'}
];
const BUILDS={
  warrior:['warrior-shockwave','warrior-bleed','warrior-guard','warrior-banner','warrior-berserk'],
  archer:['archer-rain','archer-poison','archer-trap','archer-smoke','archer-focus'],
  mage:['mage-meteor','mage-beam','mage-mana-shield','mage-ward','mage-mana-source']
};
const SLOTS=['weapon','armor','helmet','boots','ring','amulet'];
const STEP=.05;

function randomSource(seed){let state=seed>>>0;return ()=>{state=(state*1664525+1013904223)>>>0;return state/2**32;};}
function midpoint(item){return item.ranges.reduce((sum,range)=>sum+(range.min+range.max)/2,0);}
function allocations(classId,level){
  const total=level*5,main=classId==='warrior'?'strength':classId==='archer'?'dexterity':'energy',utility=classId==='warrior'?'dexterity':classId==='archer'?'energy':'dexterity';
  const value={strength:0,dexterity:0,vitality:0,energy:0};value[main]=Math.floor(total*.55);value.vitality=Math.floor(total*.3);value[utility]=total-value[main]-value.vitality;return value;
}
function build(classId,level){
  const value=defaultSkillBuild(classId,level),available=BUILDS[classId].filter(id=>SKILLS[id].unlockLevel<=level).slice(0,4);value.slots=available;return value;
}
function heroFor(classId,level,region){
  const hero=newHero(`late-balance-${classId}`,classId);hero.level=level;hero.allocatedStats=allocations(classId,level);hero.skillBuild=build(classId,level);
  const choices=regionalEquipment(classId,region,1),definitions=SLOTS.map(slot=>choices.filter(item=>item.slot===slot).sort((a,b)=>midpoint(b)-midpoint(a))[0]);
  hero.items=definitions.map((definition,index)=>rollEquipment(definition.id,`late-${classId}-${level}-${index}`,()=>.5));hero.equipment=Object.fromEntries(hero.items.map(item=>[item.slot,item.id]));
  hero.afkPreferences={...hero.afkPreferences,skillOrder:hero.skillBuild.slots.filter(Boolean),basicAttackFallback:true};hero.hp=stats(hero).maxHp;hero.mana=stats(hero).maxMana;return hero;
}
function spotFor(world,caseInfo){
  const region=LATE_REGIONS.find(value=>value.id===caseInfo.region),spot=region.spots.find(value=>world.mobs.filter(mob=>mob.spotId===value.id&&mob.type===caseInfo.type).length===6);
  if(!spot)throw new Error(`No six-mob ${caseInfo.type} spot in ${caseInfo.region}`);return spot;
}
function resetMob(mob){Object.assign(mob,{hp:mobConfig(mob).hp,state:'idle',timer:1,target:null,contributors:new Map(),age:0,slowUntil:0,rootUntil:0,dots:[]});}
function prepare(caseInfo,classId,mode,seed){
  const world=new World({random:randomSource(seed)}),hero=heroFor(classId,caseInfo.level,caseInfo.region);world.add(hero);const spot=spotFor(world,caseInfo),pack=world.mobs.filter(mob=>mob.spotId===spot.id&&mob.type===caseInfo.type);
  if(mode==='single'){
    const mob=pack[0];Object.assign(mob,{x:spot.x,z:spot.z,homeX:spot.x,homeZ:spot.z});resetMob(mob);world.mobs=[mob];Object.assign(hero,{x:spot.x,z:spot.z+1.8,yaw:Math.PI,targetYaw:Math.PI});
  }else{
    for(const mob of pack)resetMob(mob);world.mobs=pack;Object.assign(hero,{x:spot.x+spot.radius+2.5,z:spot.z,yaw:-Math.PI/2,targetYaw:-Math.PI/2});
  }
  return {world,hero};
}
function liveTargets(world,hero){return world.mobs.filter(mob=>mob.state!=='dead').sort((a,b)=>distance(hero,a)-distance(hero,b)||a.id-b.id);}
function activeAction(world,hero,cursor){
  if(hero.dead||hero.attack)return cursor;
  if(hero.hp/stats(hero).maxHp<.48)world.potion(hero,'hp');if(hero.mana/stats(hero).maxMana<.22)world.potion(hero,'mana');
  const target=liveTargets(world,hero)[0];if(!target)return cursor;const yaw=Math.atan2(target.x-hero.x,target.z-hero.z),order=hero.skillBuild.slots.filter(Boolean);
  for(let offset=0;offset<order.length;offset++){
    const index=(cursor+offset)%order.length,id=order[index],skill=SKILLS[id],utility=['support','defense'].includes(skill.kind);
    if((utility&&!world.utilityNeeded(hero,id))||(!utility&&distance(hero,target)>skill.range+mobConfig(target).radius)||hero.mana<skill.manaCost||(hero.skillCooldowns[id]??0)>0)continue;
    const point=['archer-rain','mage-meteor'].includes(id)?{x:target.x,z:target.z}:undefined;
    if(world.castSkill(hero,id,yaw,utility?undefined:target.id,point))return (index+1)%order.length;
  }
  world.attack(hero,yaw,false,target.id);return cursor;
}
function run(caseInfo,classId,mode,seed){
  const {world,hero}=prepare(caseInfo,classId,mode,seed),limit=mode==='single'?180:600,initialKills=hero.kills,maxHp=stats(hero).maxHp;let cursor=0,minHp=hero.hp,seconds=limit;
  if(mode==='edgeAfk')world.startAfk(hero);
  for(let index=0;index<Math.ceil(limit/STEP);index++){
    if(mode==='single')cursor=activeAction(world,hero,cursor);world.tick(STEP,world.t+STEP*1000);hero.level=caseInfo.level;hero.xp=0;minHp=Math.min(minHp,hero.hp);
    if(hero.dead||(mode==='single'&&hero.kills>initialKills)){seconds=(index+1)*STEP;break;}
  }
  const kills=hero.kills-initialKills;
  return {seconds:Math.round(seconds*10)/10,kills,killsPerHour:Math.round(kills/seconds*3600),died:!!hero.dead,minHpPercent:Math.round(minHp/maxHp*100),hpPotions:3-hero.potions,manaPotions:3-hero.manaPotions,attack:Math.round(stats(hero).attack),maxHp:stats(hero).maxHp,armor:Math.round(stats(hero).armor)};
}

const requestedClasses=process.env.BALANCE_CLASSES?.split(',').filter(value=>CLASSES.includes(value))??CLASSES;
const requestedLevels=process.env.BALANCE_LEVELS?.split(',').map(Number).filter(Number.isFinite);
const selectedCases=requestedLevels?.length?CASES.filter(value=>requestedLevels.includes(value.level)):CASES;
const rows=[];let seed=20260916;
for(const caseInfo of selectedCases)for(const classId of requestedClasses){const single=run(caseInfo,classId,'single',seed++),edge=run(caseInfo,classId,'edgeAfk',seed++);rows.push({level:caseInfo.level,region:caseInfo.region,mob:caseInfo.type,classId,singleTtk:single.kills?single.seconds:null,singleDied:single.died,singleMinHp:single.minHpPercent,edgeKillsPerHour:edge.killsPerHour,edgeDied:edge.died,edgeSeconds:edge.seconds,edgeMinHp:edge.minHpPercent,edgeHpPotions:edge.hpPotions,edgeManaPotions:edge.manaPotions,attack:edge.attack,maxHp:edge.maxHp,armor:edge.armor});}
const payload={assumptions:{stepSeconds:STEP,single:'active server combat against one ordinary mob; skills, basic fallback and potions; stop on kill or death',edgeAfk:'real stationary World.startAfk for 600 seconds from 2.5m outside the boundary of a six-mob spot; stop on death',gear:'six median-roll green items from the current unlocked late region',stats:'all level*5 points allocated: 55% main, 30% vitality, 15% class utility',builds:BUILDS,potions:'three HP and three mana bottles, real thresholds and cooldowns'},rows};
if(process.argv.includes('--json'))console.log(JSON.stringify(payload,null,2));else{console.table(rows);console.log('Run with --json for machine-readable output.');}
