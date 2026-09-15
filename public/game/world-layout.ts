import type {Position} from './motion.js';
import type {MobType} from '../../shared/types.js';

/** Shared metres: terrain, server bounds, roads and minimap read this layout. */
export const WORLD_BOUNDS=Object.freeze({minX:-37,maxX:73,minZ:-45,maxZ:45});
export interface WorldClearing extends Position {readonly id:string;readonly name:string;readonly radius:number;readonly tint:string}
export const WORLD_CLEARINGS:readonly Readonly<WorldClearing>[]=Object.freeze([
  {id:'camp',name:'Лагерь',x:-1,z:0,radius:7,tint:'#b9a485'},
  {id:'west',name:'Западный луг',x:-25,z:5,radius:9,tint:'#96a578'},
  {id:'north',name:'Каменный круг',x:-14,z:-27,radius:10,tint:'#9da8a3'},
  {id:'south',name:'Старый дуб',x:-12,z:25,radius:11,tint:'#aaa078'},
  {id:'crossroads',name:'Большая поляна',x:23,z:24,radius:11,tint:'#acaa81'},
  {id:'east',name:'Лесоповал',x:49,z:23,radius:10,tint:'#baa17b'},
  {id:'ridge',name:'Забытые арки',x:48,z:-25,radius:11,tint:'#a1aaa1'},
  {id:'ruins',name:'Сторожевая застава',x:25,z:-1.2,radius:6,tint:'#aaa392'},
].map(c=>Object.freeze(c)));
export interface WorldRoad {readonly id:string;readonly width:number;readonly points:readonly Readonly<Position>[]}
const road=(id:string,width:number,points:readonly (readonly [number,number])[]):Readonly<WorldRoad>=>Object.freeze({id,width,points:Object.freeze(points.map(([x,z])=>Object.freeze({x,z})))});
export const WORLD_ROADS:readonly Readonly<WorldRoad>[]=Object.freeze([
  road('old-road',4.6,Array.from({length:32},(_,i)=>[i-1,1+Math.sin((i-1)*.25)*.9] as const)),
  road('western-loop',5,[[.5,2],[-9,6],[-25,5],[-27,-12],[-14,-27],[4,-26],[15,-18],[25,-14],[34,-10],[35,1],[30,1.85]]),
  road('southern-loop',5.8,[[.5,2],[-5,13],[-12,25],[5,30],[23,24],[32,16],[32,7],[30,1.85]]),
  road('western-crossing',4.8,[[-25,5],[-26,18],[-12,25]]),
  road('northern-frontier',5.4,[[4,-26],[25,-33],[48,-25],[63,-13],[59,5],[49,23],[23,24]]),
  road('eastern-crossing',5.6,[[35,1],[46,1],[59,5]]),
  road('ridge-approach',5,[[35,1],[38,-11],[48,-25]]),
  road('wolf-approach',3.8,[[11.4,1.26],[12.7,-4.8],[12.7,-8.2]]),
  road('boar-approach',3.8,[[21,.23],[22.2,5.7],[23,9.3],[26,14],[23,24]]),
]);
export interface WorldLandmark extends Position {readonly id:string;readonly name:string;readonly kind:'standing-stones'|'fallen-oak'|'arches'|'logging'}
export const WORLD_LANDMARKS:readonly Readonly<WorldLandmark>[]=Object.freeze([
  {id:'stone-circle',name:'Каменный круг',kind:'standing-stones',x:-17,z:-33},
  {id:'old-oak',name:'Старый дуб',kind:'fallen-oak',x:-17,z:29},
  {id:'forgotten-arches',name:'Забытые арки',kind:'arches',x:49,z:-31},
  {id:'logging-yard',name:'Лесоповал',kind:'logging',x:55,z:27},
].map(p=>Object.freeze(p)) as WorldLandmark[]);
export const ROAMING_SPAWNS:readonly Readonly<Position & {type:MobType}>[]=Object.freeze([
  {type:'wolf',x:-25,z:2},{type:'boar',x:-28,z:9},
  {type:'boar',x:-12,z:22},{type:'wolf',x:-6,z:26},
  {type:'boar',x:20,z:25},{type:'boar',x:27,z:23},
  {type:'wolf',x:45,z:-25},{type:'wolf',x:51,z:-22},
  {type:'wolf',x:61,z:-12},{type:'boar',x:58,z:5},
].map(p=>Object.freeze(p)) as (Position & {type:MobType})[]);
export function segmentDistance(x:number,z:number,a:Position,b:Position){
  const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/length)):0;
  return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
}
export function roadDistance(x:number,z:number){
  let distance=Infinity;
  for(const road of WORLD_ROADS)for(let i=1;i<road.points.length;i++)distance=Math.min(distance,segmentDistance(x,z,road.points[i-1],road.points[i]));
  return distance;
}
/** Signed distance from the authored broad road edge. */
export function roadEdgeDistance(x:number,z:number){
  let distance=Infinity;
  for(const road of WORLD_ROADS)for(let i=1;i<road.points.length;i++)distance=Math.min(distance,segmentDistance(x,z,road.points[i-1],road.points[i])-road.width/2);
  return distance;
}
