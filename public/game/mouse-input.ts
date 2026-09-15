import type {Point} from '../../shared/types.js';
export interface MouseHero extends Point {dead:number; yaw:number}
export interface HeldInput {x:number; z:number; aim:number|null; attack:boolean}
export interface HeldOptions {held?:boolean;target?:Point|null;reach?:number;inCamp?:boolean}

// A live direction, never a destination retained after the button is released.
export function heldMouseInput(hero:MouseHero,point:Point|null,{held=false,target=null,reach=1.45,inCamp=false}:HeldOptions={}):HeldInput{
  const idle:HeldInput={x:0,z:0,aim:null,attack:false};
  if(!held||hero.dead||!point||![point.x,point.z].every(Number.isFinite))return idle;
  const goal=target||point,dx=goal.x-hero.x,dz=goal.z-hero.z,distance=Math.hypot(dx,dz);
  const aim=distance>.001?Math.atan2(dx,dz):hero.yaw;
  if(target&&distance<=reach&&!inCamp)return {...idle,aim,attack:true};
  // Avoid twitching when the cursor is over the character's feet.
  if(distance<=.18)return idle;
  const strength=target?1:Math.min(1,(distance-.18)/.7);
  return {x:dx/distance*strength,z:dz/distance*strength,aim,attack:false};
}
