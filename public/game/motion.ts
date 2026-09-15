export interface Position { x:number; z:number }
export interface Bounds { minX:number; maxX:number; minZ:number; maxZ:number }
export type Obstacle = Position & ({ w:number; d:number; r?:never } | { r:number; w?:never; d?:never });
export const TAU=Math.PI*2;
// Shared by simulation and IK so the support foot matches distance travelled.
export function gaitProfile(runBlend=0){
  const run=Math.max(0,Math.min(1,runBlend));
  return {stride:1.4+.5*run,stance:.6-.16*run,lift:.14+.14*run};
}
export const angleDelta=(from:number,to:number)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
export function turnTowards(from:number,to:number,dt:number,speed=13){return from+angleDelta(from,to)*(1-Math.exp(-speed*dt));}
export function inStrike(origin:Position,target:Position,yaw:number,range:number,halfAngle=.85){
  const dx=target.x-origin.x,dz=target.z-origin.z,d=Math.hypot(dx,dz);
  return d<=range&&Math.abs(angleDelta(yaw,Math.atan2(dx,dz)))<=halfAngle;
}
export function screenDirection(x:number,y:number,azimuth:number){
  const length=Math.max(1,Math.hypot(x,y));
  return {x:(Math.cos(azimuth)*x+Math.sin(azimuth)*y)/length,z:(-Math.sin(azimuth)*x+Math.cos(azimuth)*y)/length};
}
export function canOccupy(x:number,z:number,obstacles:readonly Obstacle[],radius=.29,bounds:Bounds={minX:-10.8,maxX:10.8,minZ:-9.5,maxZ:9.5}){
  if(x<bounds.minX+radius||x>bounds.maxX-radius||z<bounds.minZ+radius||z>bounds.maxZ-radius)return false;
  return !obstacles.some(o=>o.w?Math.abs(x-o.x)<o.w/2+radius&&Math.abs(z-o.z)<o.d/2+radius:Math.hypot(x-o.x,z-o.z)<o.r!+radius);
}
