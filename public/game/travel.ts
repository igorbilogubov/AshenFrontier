import {DUNGEONS} from './dungeons.js';
import {LATE_REGIONS} from './late-world.js';
import type {LocationId,Point} from '../../shared/types.js';
export interface TravelPortal extends Point {readonly id:string;readonly location:LocationId;readonly name:string;readonly minLevel:number;readonly fee:number;readonly range:number;readonly safeRadius:number}
const fields:{location:LocationId;name:string;minLevel:number;fee:number;x:number;z:number}[]=[
 {location:'forest',name:'Город · Пепельная опушка',minLevel:1,fee:20,x:3.3,z:-3},
 {location:'stadium',name:'Стадиум',minLevel:1,fee:20,x:163,z:15},
 {location:'snow',name:'Снежный предел',minLevel:10,fee:80,x:269,z:11},
 {location:'wasteland',name:'Пепельные пустоши',minLevel:25,fee:180,x:529,z:3},
 ...LATE_REGIONS.map((r,i)=>({location:r.id,name:r.name,minLevel:r.minLevel,fee:[320,500,720,980][i],x:r.entry.x,z:r.entry.z+3})),
];
/** Price is per destination, approximately two to five ordinary kills at its tier. */
export const TRAVEL_PORTALS:readonly Readonly<TravelPortal>[]=Object.freeze([
 ...fields,...DUNGEONS.map(d=>({location:d.id,name:d.name,minLevel:d.minLevel,fee:Math.round(fields.find(f=>f.location===d.region)!.fee*1.5),x:d.entry.x,z:d.entry.z+3})),
].map(p=>Object.freeze({...p,id:`travel-${p.location}`,range:2.2,safeRadius:4})));
export const travelPortalById=(id:unknown)=>typeof id==='string'?TRAVEL_PORTALS.find(p=>p.id===id):undefined;
export const travelCost=(from:TravelPortal,to:TravelPortal)=>from.id===to.id?0:to.fee;
export const travelSafe=(p:Point)=>TRAVEL_PORTALS.some(g=>Math.hypot(p.x-g.x,p.z-g.z)<g.safeRadius);
