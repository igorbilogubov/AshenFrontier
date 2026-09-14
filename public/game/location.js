import {canOccupy,turnTowards,gaitProfile} from './motion.js';
import {OBSTACLES} from './terrain.js';

export const CAMERA=Object.freeze({azimuth:.55,elevation:44*Math.PI/180});
export const BOUNDS=Object.freeze({minX:-11,maxX:31,minZ:-15,maxZ:15});
export const CAMP=Object.freeze({x:-1,z:0,r:5.6});
export const SPEED=2.35;
export const RUN_SPEED=3.8;
export const WEAPONS=Object.freeze({sword:{name:'Стальной меч',duration:.64,range:1.95,damage:25},axe:{name:'Боевой топор',duration:.84,range:1.85,damage:40}});
export const MOB_TYPES=Object.freeze({
  wolf:{name:'Пепельный волк',hp:60,damage:8,speed:1.82,range:1.35,windup:.70,cooldown:1.10,aggro:4.7,coins:8,xp:12,radius:.38,scale:1},
  boar:{name:'Лесной кабан',hp:90,damage:12,speed:1.55,range:1.55,windup:.95,cooldown:1.35,aggro:4.4,coins:12,xp:18,radius:.46,scale:1.1},
  alpha:{name:'Седой вожак',hp:190,damage:17,speed:2.02,range:1.75,windup:1.05,cooldown:1.3,aggro:5.1,coins:35,xp:55,radius:.52,scale:1.4},
});
export const SPAWNS=Object.freeze([
  {type:'wolf',x:7.6,z:1.8},{type:'wolf',x:10.4,z:-4},{type:'boar',x:12.4,z:6.4},
  {type:'wolf',x:15.4,z:1.4},{type:'boar',x:18.2,z:-6.2},{type:'wolf',x:20.7,z:4.9},
  {type:'alpha',x:25,z:-1.2},
]);
export const safe=p=>Math.hypot(p.x-CAMP.x,p.z-CAMP.z)<CAMP.r;

export const stand=(x,z,r=.29)=>Number.isFinite(x)&&Number.isFinite(z)&&canOccupy(x,z,OBSTACLES,r,BOUNDS);
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function clearPath(a,b){
  const steps=Math.ceil(distance(a,b)/.18);
  for(let i=1;i<steps;i++)if(!stand(a.x+(b.x-a.x)*i/steps,a.z+(b.z-a.z)*i/steps,0))return false;
  return true;
}
export function translate(actor,dx,dz,r=.29,avoidCamp=false){
  let moved=0;const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));
  const valid=(x,z)=>stand(x,z,r)&&(!avoidCamp||!safe({x,z}));
  for(let i=0;i<count;i++){const x=actor.x,z=actor.z;if(valid(x+dx/count,z))actor.x+=dx/count;if(valid(actor.x,z+dz/count))actor.z+=dz/count;moved+=Math.hypot(actor.x-x,actor.z-z);}
  return moved;
}
const approach=(a,b,max)=>a+Math.max(-max,Math.min(max,b-a));
// Same acceleration and collision geometry on the server and in client prediction.
export function moveHero(p,dt,input={}){
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
  else if(Number.isFinite(input.aim)&&!p.attack)p.targetYaw=input.aim;
  if(p.attack&&p.attack.yaw!==null)p.yaw=p.attack.yaw;
  else p.yaw=turnTowards(p.yaw,p.targetYaw,dt,p.attack?22:14);
}
