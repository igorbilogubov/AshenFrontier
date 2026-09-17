import {travelSafe} from './travel.js';
import {fieldBalance} from './field-balance.js';
import {baseExperience} from './progression-curve.js';
import {LATE_SPAWNS,LATE_MOB_TYPES,LATE_ELITE_TYPES,LATE_LARGE_EXTRA_SPAWNS,lateSafe} from './late-world.js';
import {DUNGEON_SPAWNS,dungeonById,dungeonSafe} from './dungeons.js';
import {WASTELAND_SPAWNS,WASTELAND_LARGE_EXTRA_SPAWNS,wastelandSafe} from './wasteland.js';
import {SNOW_SPAWNS,SNOW_LARGE_EXTRA_SPAWNS,snowSafe} from './snow.js';
import {campSafe} from './camp-layout.js';
import {canOccupy,turnTowards,gaitProfile} from './motion.js';
import type {Position} from './motion.js';
import {nearbyObstacles} from './terrain.js';
import {AFK_SPAWNS,BEAR_AFK_SPAWNS,FOREST_LARGE_EXTRA_SPAWNS} from './afk.js';
import {STADIUM_SPAWNS,stadiumSafe} from './stadium.js';
import {WORLD_BOUNDS,ROAMING_SPAWNS,EXTRA_ROAMING_SPAWNS,boundsForPosition} from './world-layout.js';
import type {AfkSpotId} from './afk.js';
export {AFK_SPOTS,afkSpotAt,withinSpot} from './afk.js';
export type {AfkSpot,AfkSpotId} from './afk.js';

import type {MobType,WeaponId} from '../../shared/types.js';
export type {MobType,WeaponId} from '../../shared/types.js';
export interface MovementInput {x?:number;z?:number;aim?:number|null}
export interface MovingHero extends Position {vx:number;vz:number;running:boolean;speedScale?:number;attack:{yaw:number|null}|null;dead:boolean|number;runBlend:number;gait:number;moveBlend:number;targetYaw:number;yaw:number}
export const CAMERA=Object.freeze({azimuth:.55,elevation:44*Math.PI/180});
export const BOUNDS=WORLD_BOUNDS;
export const CAMP=Object.freeze({x:-1,z:0,r:5.6});
export const SPEED=2.35;
export const RUN_SPEED=3.8;
export const WEAPONS=Object.freeze({sword:{name:'Стальной меч',duration:.64,range:1.95,damage:25},axe:{name:'Боевой топор',duration:.84,range:1.85,damage:40}});
export const MOB_TYPES=Object.freeze({
  ...LATE_MOB_TYPES,
  wolf:{name:'Пепельный волк',hp:60,damage:8,speed:1.82,range:1.35,windup:.70,cooldown:1.10,aggro:4.7,coins:8,xp:12,radius:.38,scale:1},
  boar:{name:'Лесной кабан',hp:90,damage:12,speed:1.55,range:1.55,windup:.95,cooldown:1.35,aggro:4.4,coins:12,xp:18,radius:.46,scale:1.1},
  bear:{name:'Пепельный медведь',hp:145,damage:15,speed:1.38,range:1.6,windup:1.08,cooldown:1.5,aggro:4.8,coins:21,xp:32,radius:.62,scale:1.15},
  lynx:{name:'Снежная рысь',hp:230,damage:20,speed:2.2,range:1.4,windup:.72,cooldown:1.15,aggro:5.2,coins:28,xp:46,radius:.43,scale:1},
  yak:{name:'Шерстистый як',hp:330,damage:25,speed:1.4,range:1.8,windup:1.15,cooldown:1.6,aggro:4.8,coins:36,xp:62,radius:.72,scale:1},
  'frost-spider':{name:'Морозный паук',hp:285,damage:28,speed:1.8,range:1.6,windup:.85,cooldown:1.25,aggro:5.1,coins:40,xp:72,radius:.58,scale:1},
  'ice-golem':{name:'Ледяной голем',hp:460,damage:36,speed:1.2,range:1.9,windup:1.3,cooldown:1.7,aggro:5,coins:52,xp:95,radius:.76,scale:1},
  'ash-jackal':{name:'Пепельный шакал',hp:620,damage:38,speed:2.35,range:1.5,windup:.78,cooldown:1.2,aggro:5.5,coins:70,xp:135,radius:.44,scale:1},
  scorpion:{name:'Обсидиановый скорпион',hp:800,damage:46,speed:1.6,range:1.75,windup:1.02,cooldown:1.4,aggro:5.2,coins:84,xp:168,radius:.68,scale:1},
  'monitor-lizard':{name:'Пустынный варан',hp:960,damage:54,speed:1.75,range:1.85,windup:1.1,cooldown:1.45,aggro:5.3,coins:100,xp:205,radius:.7,scale:1},
  scarab:{name:'Панцирный скарабей',hp:1250,damage:63,speed:1.4,range:1.9,windup:1.25,cooldown:1.6,aggro:5.2,coins:120,xp:255,radius:.76,scale:1},
  alpha:{name:'Седой вожак',hp:190,damage:17,speed:2.02,range:1.75,windup:1.05,cooldown:1.3,aggro:5.1,coins:35,xp:55,radius:.52,scale:1.4},
});
export const ELITE_TYPES=Object.freeze({
 ...LATE_ELITE_TYPES,
 'obsidian-stinger':{type:'scorpion',name:'Обсидиановое жало',hp:2900,damage:75,coins:320,xp:640,scale:1.4,respawn:240},
 'sun-devourer':{type:'scarab',name:'Пожиратель солнца',hp:3900,damage:88,coins:420,xp:850,scale:1.4,respawn:300},
 'grey-alpha':{type:'alpha',name:'Седой вожак',hp:190,damage:17,coins:35,xp:55,scale:1.4,respawn:180},
 'elder-bear':{type:'bear',name:'Древний буролом',hp:420,damage:25,coins:65,xp:110,scale:1.65,respawn:240},
 'frost-matriarch':{type:'yak',name:'Матриарх метели',hp:1100,damage:40,coins:130,xp:230,scale:1.45,respawn:240},
 'glacier-warden':{type:'ice-golem',name:'Страж ледника',hp:1500,damage:52,coins:180,xp:320,scale:1.45,respawn:300},
});
/** Named elites and dungeon bosses currently deal and absorb four times the authored combat stats. Dungeon guards keep the previous 2× layer. */
export const ELITE_COMBAT_SCALE=4;
export function mobConfig(m:{type:MobType;eliteId?:string;bossId?:string;dungeonId?:string}){
 const elite=m.eliteId?ELITE_TYPES[m.eliteId as keyof typeof ELITE_TYPES]:undefined;
 const base={level:1,...MOB_TYPES[m.type],...fieldBalance(m.type)},dungeon=dungeonById(m.dungeonId);
 if(dungeon){const boss=!!m.bossId,combat=boss?ELITE_COMBAT_SCALE:2;return {...base,level:dungeon.level,name:boss?dungeon.bossName:`Страж · ${base.name}`,hp:Math.round(base.hp*(boss?10:2)*combat),damage:Math.round(base.damage*(boss?1.8:1.15)*combat),xp:baseExperience(dungeon.level)*(boss?12:2),coins:Math.round(base.coins*(boss?15:2)),scale:base.scale*(boss?1.6:1.13),aggro:boss?12:6,respawn:180};}
 return {...base,respawn:24,...(elite?.type===m.type?{...elite,hp:Math.round(elite.hp*ELITE_COMBAT_SCALE),damage:Math.round(elite.damage*ELITE_COMBAT_SCALE),level:Math.min(100,base.level+2),xp:baseExperience(base.level+2)*3}:{})};
}
export const SPAWNS:readonly Readonly<Position & {type:MobType;spotId?:AfkSpotId;eliteId?:string;bossId?:import('../../shared/types.js').DungeonId;dungeonId?:import('../../shared/types.js').DungeonId;bossLocked?:boolean}>[]=Object.freeze([
  {type:'wolf',x:7.6,z:1.8},{type:'wolf',x:10.4,z:-4},{type:'boar',x:12.4,z:6.4},
  {type:'wolf',x:15.4,z:1.4},{type:'boar',x:18.2,z:-6.2},{type:'wolf',x:20.7,z:4.9},
  {type:'alpha',eliteId:'grey-alpha',x:25,z:-1.2},
  ...AFK_SPAWNS,
  ...ROAMING_SPAWNS,
  ...STADIUM_SPAWNS.slice(0,18),
  ...EXTRA_ROAMING_SPAWNS,
  ...BEAR_AFK_SPAWNS,
  ...STADIUM_SPAWNS.slice(18,24),
  {type:'bear',eliteId:'elder-bear',x:-20,z:-16},
  ...SNOW_SPAWNS,
  ...WASTELAND_SPAWNS,
  ...LATE_SPAWNS as readonly (Position & {type:MobType;spotId?:AfkSpotId;eliteId?:string})[],
  ...STADIUM_SPAWNS.slice(24),
  ...DUNGEON_SPAWNS,
  ...FOREST_LARGE_EXTRA_SPAWNS,
  ...SNOW_LARGE_EXTRA_SPAWNS,
  ...WASTELAND_LARGE_EXTRA_SPAWNS,
  ...LATE_LARGE_EXTRA_SPAWNS as readonly (Position & {type:MobType;spotId?:AfkSpotId})[],
]);
export const safe=(p:Position)=>travelSafe(p)||lateSafe(p)||dungeonSafe(p)||campSafe(p)||stadiumSafe(p)||snowSafe(p)||wastelandSafe(p);

export const stand=(x:number,z:number,r=.29)=>Number.isFinite(x)&&Number.isFinite(z)&&canOccupy(x,z,nearbyObstacles(x,z,r),r,boundsForPosition({x,z}));
export const distance=(a:Position,b:Position)=>Math.hypot(a.x-b.x,a.z-b.z);
export function clearPath(a:Position,b:Position){
  const steps=Math.ceil(distance(a,b)/.18);
  for(let i=1;i<steps;i++)if(!stand(a.x+(b.x-a.x)*i/steps,a.z+(b.z-a.z)*i/steps,0))return false;
  return true;
}
export function translate(actor:Position,dx:number,dz:number,r=.29,avoidCamp=false){
  let moved=0;const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));
  const valid=(x:number,z:number)=>stand(x,z,r)&&(!avoidCamp||!safe({x,z}));
  for(let i=0;i<count;i++){const x=actor.x,z=actor.z;if(valid(x+dx/count,z))actor.x+=dx/count;if(valid(actor.x,z+dz/count))actor.z+=dz/count;moved+=Math.hypot(actor.x-x,actor.z-z);}
  return moved;
}
const approach=(a:number,b:number,max:number)=>a+Math.max(-max,Math.min(max,b-a));
// Same acceleration and collision geometry on the server and in client prediction.
export function moveHero(p:MovingHero,dt:number,input:MovementInput={}){
  const length=Math.max(1,Math.hypot(input.x||0,input.z||0)),moving=!p.attack&&!p.dead;
  const speedLimit=(p.running?RUN_SPEED:SPEED)*(p.speedScale||1);
  p.vx=approach(p.vx,moving?(input.x||0)/length*speedLimit:0,dt*(moving?12:24));
  p.vz=approach(p.vz,moving?(input.z||0)/length*speedLimit:0,dt*(moving?12:24));
  const before={x:p.x,z:p.z},moved=translate(p,p.vx*dt,p.vz*dt),speed=moved/dt||0;
  const run=Math.max(0,Math.min(1,(speed-SPEED)/(RUN_SPEED-SPEED)));
  p.runBlend+=(run-p.runBlend)*(1-Math.exp(-12*dt));
  p.gait+=moved/gaitProfile(p.runBlend).stride*Math.PI*2;
  p.moveBlend+=(Math.min(1,speed/SPEED)-p.moveBlend)*(1-Math.exp(-14*dt));
  if(speed>.15&&!p.attack)p.targetYaw=Math.atan2(p.x-before.x,p.z-before.z);
  else if(typeof input.aim==='number'&&Number.isFinite(input.aim)&&!p.attack)p.targetYaw=input.aim;
  if(p.attack&&p.attack.yaw!==null)p.yaw=p.attack.yaw;
  else p.yaw=turnTowards(p.yaw,p.targetYaw,dt,p.attack?22:14);
}
