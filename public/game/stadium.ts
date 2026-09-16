import {WASTELAND_PASSAGES} from './wasteland.js';
import {SNOW_PASSAGES} from './snow.js';
import type {Position,Obstacle} from './motion.js';
import type {MobType} from '../../shared/types.js';

/** Separate, server-owned coordinates. The gap to the forest is never walkable. */
export const STADIUM_BOUNDS=Object.freeze({minX:133,maxX:205,minZ:-19,maxZ:23});
export const STADIUM_HUB=Object.freeze({x:160,z:15,r:6.2});
export type StadiumPenId='stadium-wolves'|'stadium-boars'|'stadium-alphas'|'stadium-bears';
export interface StadiumPen extends Position {
  readonly id:StadiumPenId;readonly name:string;readonly subtitle:string;
  readonly width:number;readonly depth:number;readonly radius:number;
  readonly tint:string;readonly rank:'I'|'II'|'III'|'IV';readonly spawnIds:readonly number[];
}
export const STADIUM_PENS:readonly Readonly<StadiumPen>[]=Object.freeze([
  {id:'stadium-wolves',name:'Волчий загон',subtitle:'Волки · 6 существ',x:142,z:-6,width:14,depth:16,radius:5.8,tint:'#819b94',rank:'I',spawnIds:[41,42,43,44,45,46]},
  {id:'stadium-boars',name:'Кабаний загон',subtitle:'Кабаны · 6 существ',x:160,z:-6,width:14,depth:16,radius:5.8,tint:'#b29a71',rank:'II',spawnIds:[47,48,49,50,51,52]},
  {id:'stadium-alphas',name:'Загон вожаков',subtitle:'2 вожака и 4 волка',x:178,z:-6,width:14,depth:16,radius:5.8,tint:'#9b859e',rank:'III',spawnIds:[53,54,55,56,57,58]},
  {id:'stadium-bears',name:'Медвежий загон',subtitle:'Медведи · 6 существ',x:196,z:-6,width:14,depth:16,radius:5.8,tint:'#a68466',rank:'IV',spawnIds:[89,90,91,92,93,94]},
].map(p=>Object.freeze({...p,spawnIds:Object.freeze(p.spawnIds)})) as readonly Readonly<StadiumPen>[]);
const formation:readonly (readonly [number,number])[]=[[-3,-2.2],[0,-3.7],[3,-2.2],[-3,1.8],[0,3.5],[3,1.8]];
export const STADIUM_SPAWNS:readonly Readonly<Position & {type:MobType;spotId:StadiumPenId}>[]=Object.freeze(STADIUM_PENS.flatMap((pen,index)=>formation.map(([dx,dz],i)=>Object.freeze({type:(index===3?'bear':index===1?'boar':index===2&&i<2?'alpha':'wolf') as MobType,spotId:pen.id,x:pen.x+dx,z:pen.z+dz}))));
export interface Portal extends Position {readonly id:'camp-stadium'|'stadium-camp'|'forest-snow'|'snow-forest'|'snow-wasteland'|'wasteland-snow';readonly minLevel?:number;readonly name:string;readonly range:number;readonly destination:Readonly<Position>;readonly destinationName:string}
export const PORTALS:readonly Readonly<Portal>[]=Object.freeze([
  Object.freeze({id:'camp-stadium',name:'Стадиум',x:-4.6,z:2.9,range:1.8,destination:Object.freeze({x:160,z:14.8}),destinationName:'Стадиум'}),
  Object.freeze({id:'stadium-camp',name:'Лагерь',x:160,z:19.4,range:1.8,destination:Object.freeze({x:-3.2,z:2.5}),destinationName:'Лесная опушка'}),
]);
export const portalById=(id:unknown)=>typeof id==='string'?[...PORTALS,...SNOW_PASSAGES,...WASTELAND_PASSAGES].find(portal=>portal.id===id):undefined;
export const inStadium=(p:Position,padding=0)=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=STADIUM_BOUNDS.minX+padding&&p.x<=STADIUM_BOUNDS.maxX-padding&&p.z>=STADIUM_BOUNDS.minZ+padding&&p.z<=STADIUM_BOUNDS.maxZ-padding;
export const stadiumSafe=(p:Position)=>Math.hypot(p.x-STADIUM_HUB.x,p.z-STADIUM_HUB.z)<STADIUM_HUB.r;
/** Low fences have the same rectangles in rendering, movement and line of sight.
 * Each 4.8 m southern gate remains open; the hunting circle fits fully inside.
 */
export const STADIUM_PEN_WALLS:readonly Readonly<Obstacle>[]=Object.freeze(STADIUM_PENS.flatMap<Obstacle>(pen=>[
  {x:pen.x-pen.width/2,z:pen.z,w:.42,d:pen.depth},
  {x:pen.x+pen.width/2,z:pen.z,w:.42,d:pen.depth},
  {x:pen.x,z:pen.z-pen.depth/2,w:pen.width+.42,d:.42},
  ...[-1,1].map(side=>({x:pen.x+side*(pen.width/4+1.2),z:pen.z+pen.depth/2,w:pen.width/2-2.4,d:.42})),
]).map(w=>Object.freeze(w)));
export const STADIUM_OBSTACLES:readonly Readonly<Obstacle>[]=Object.freeze([
  ...STADIUM_PEN_WALLS,
  {x:133.35,z:2,w:.7,d:42},{x:204.65,z:2,w:.7,d:42},
  {x:169,z:-18.65,w:72,d:.7},{x:169,z:22.65,w:72,d:.7},
].map(w=>Object.freeze(w)));
