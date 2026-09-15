import {canOccupy,turnTowards,gaitProfile} from './motion.js';
import type {Position} from './motion.js';
import {nearbyObstacles} from './terrain.js';
import {AFK_SPAWNS} from './afk.js';
import {STADIUM_SPAWNS,stadiumSafe} from './stadium.js';
import {WORLD_BOUNDS,ROAMING_SPAWNS,boundsForPosition} from './world-layout.js';
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
  wolf:{name:'Пепельный волк',hp:60,damage:8,speed:1.82,range:1.35,windup:.70,cooldown:1.10,aggro:4.7,coins:8,xp:12,radius:.38,scale:1},
  boar:{name:'Лесной кабан',hp:90,damage:12,speed:1.55,range:1.55,windup:.95,cooldown:1.35,aggro:4.4,coins:12,xp:18,radius:.46,scale:1.1},
  alpha:{name:'Седой вожак',hp:190,damage:17,speed:2.02,range:1.75,windup:1.05,cooldown:1.3,aggro:5.1,coins:35,xp:55,radius:.52,scale:1.4},
});
export const SPAWNS:readonly Readonly<Position & {type:MobType;spotId?:AfkSpotId}>[]=Object.freeze([
  {type:'wolf',x:7.6,z:1.8},{type:'wolf',x:10.4,z:-4},{type:'boar',x:12.4,z:6.4},
  {type:'wolf',x:15.4,z:1.4},{type:'boar',x:18.2,z:-6.2},{type:'wolf',x:20.7,z:4.9},
  {type:'alpha',x:25,z:-1.2},
  ...AFK_SPAWNS,
  ...ROAMING_SPAWNS,
  ...STADIUM_SPAWNS,
]);
export const safe=(p:Position)=>Math.hypot(p.x-CAMP.x,p.z-CAMP.z)<CAMP.r||stadiumSafe(p);

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
