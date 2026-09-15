import type {Position} from './motion.js';
import {roadDistance} from './world-layout.js';
import {STADIUM_PENS} from './stadium.js';
import type {StadiumPenId} from './stadium.js';
import type {MobType} from '../../shared/types.js';

export type AfkSpotId=StadiumPenId|'wolf-den'|'boar-clearing'|'northern-stones'|'eastern-logging';
export interface AfkSpot extends Position {
  readonly id:AfkSpotId;
  readonly name:string;
  readonly radius:number;
  readonly spawnIds:readonly number[];
}
// Numeric mob ids are stable indices in location.SPAWNS. The first seven remain
// the original route and watchpost boss; the following twenty-four belong to four spots.
// Stadium mobs are appended after the ten roaming forest creatures, preserving IDs.
export const AFK_SPOTS:readonly Readonly<AfkSpot>[]=Object.freeze([
  Object.freeze({id:'wolf-den',name:'Волчья ложбина',x:12.7,z:-8.2,radius:3.5,spawnIds:Object.freeze([7,8,9,10,11,12])}),
  Object.freeze({id:'boar-clearing',name:'Кабанья поляна',x:23,z:9.3,radius:3.5,spawnIds:Object.freeze([13,14,15,16,17,18])}),
  Object.freeze({id:'northern-stones',name:'Северная стая',x:-14,z:-27,radius:4.6,spawnIds:Object.freeze([19,20,21,22,23,24])}),
  Object.freeze({id:'eastern-logging',name:'Дальний лесоповал',x:49,z:23,radius:4.6,spawnIds:Object.freeze([25,26,27,28,29,30])}),
  ...STADIUM_PENS,
]);
export const AFK_SPAWNS:readonly Readonly<Position & {type:MobType;spotId:AfkSpotId}>[]=Object.freeze([
  ...[[11,-7],[14.4,-6.8],[15,-8.6],[13.5,-10.4],[11.6,-10.2],[10.3,-8.7]].map(([x,z])=>Object.freeze({type:'wolf' as const,spotId:'wolf-den' as const,x,z})),
  ...[[20.7,8.2],[23,7],[25.2,8.1],[25.4,10.6],[22.9,11.7],[20.8,10.7]].map(([x,z])=>Object.freeze({type:'boar' as const,spotId:'boar-clearing' as const,x,z})),
  ...[[-17,-27],[-15.5,-29.5],[-12.5,-29.5],[-11,-27],[-12.5,-24.5],[-15.5,-24.5]].map(([x,z])=>Object.freeze({type:'wolf' as const,spotId:'northern-stones' as const,x,z})),
  ...[[46,23],[47.5,20.5],[50.5,20.5],[52,23],[50.5,25.5],[47.5,25.5]].map(([x,z])=>Object.freeze({type:'boar' as const,spotId:'eastern-logging' as const,x,z})),
]);

/** Positive padding expands the boundary; negative padding reserves body space. */
export function withinSpot(point:Position,spot:AfkSpot,padding=0){
  const radius=spot.radius+padding;
  return Number.isFinite(radius)&&radius>=0&&Number.isFinite(point.x)&&Number.isFinite(point.z)&&Math.hypot(point.x-spot.x,point.z-spot.z)<=radius;
}
export const afkSpotAt=(point:Position)=>AFK_SPOTS.find(spot=>withinSpot(point,spot))??null;

// Branch trails are shared by soil wear, vegetation clearance and navigation QA.
export const AFK_TRAILS:readonly (readonly Readonly<Position>[])[]=Object.freeze([
  Object.freeze([{x:11.4,z:1.26},{x:12.7,z:-4.8},{x:12.7,z:-8.2}].map(p=>Object.freeze(p))),
  Object.freeze([{x:21,z:.23},{x:22.2,z:5.7},{x:23,z:9.3}].map(p=>Object.freeze(p))),
]);
// Compatibility export; all roads now have finite authored endpoints.
export const forestTrailDistance=roadDistance;
