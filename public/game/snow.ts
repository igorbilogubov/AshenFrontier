import type {Position,Obstacle} from './motion.js';
import type {MobType} from '../../shared/types.js';
export const SNOW_BOUNDS=Object.freeze({minX:260,maxX:440,minZ:-80,maxZ:85});
export const SNOW_ENTRY=Object.freeze({x:268,z:8});
export const SNOW_MIN_LEVEL=10;
export const inSnow=(p:Position,padding=0)=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=260+padding&&p.x<=440-padding&&p.z>=-80+padding&&p.z<=85-padding;
export const snowSafe=(p:Position)=>Math.hypot(p.x-266,p.z-8)<6;
export type SnowSpotId='snow-lynx-west'|'snow-yak-meadow'|'snow-spider-grove'|'snow-lynx-ridge'|'snow-yak-tundra'|'snow-spider-hollow'|'snow-golem-ruins'|'snow-golem-glacier';
const centers:readonly (readonly [SnowSpotId,string,number,number,MobType])[]=[
 ['snow-lynx-west','Рысья ложбина',288,-12,'lynx'],['snow-yak-meadow','Белый луг',294,40,'yak'],
 ['snow-spider-grove','Промёрзшая роща',326,-46,'frost-spider'],['snow-lynx-ridge','Охотничий гребень',338,12,'lynx'],
 ['snow-yak-tundra','Дальняя тундра',353,62,'yak'],['snow-spider-hollow','Ледяная впадина',381,-15,'frost-spider'],
 ['snow-golem-ruins','Застывшие руины',402,44,'ice-golem'],['snow-golem-glacier','Сердце ледника',412,-57,'ice-golem'],
];
export const SNOW_SPOTS=Object.freeze(centers.map(([id,name,x,z],i)=>Object.freeze({id,name,x,z,radius:5.2,spawnIds:Object.freeze(Array.from({length:6},(_,j)=>96+i*6+j))})));
export const SNOW_SPAWNS:readonly Readonly<Position & {type:MobType;spotId?:SnowSpotId;eliteId?:string}>[]=Object.freeze([
 ...centers.flatMap(([spotId,,x,z,type])=>Array.from({length:6},(_,i)=>({type,spotId,x:x+Math.cos(i*Math.PI/3)*3.5,z:z+Math.sin(i*Math.PI/3)*3.5}))),
 ...Array.from({length:48},(_,i)=>{const col=i%8,row=Math.floor(i/8),x=280+col*20;let z=-68+row*27;for(let attempt=0;attempt<12&&centers.some(([, ,sx,sz])=>Math.hypot(x-sx,z-sz)<9);attempt++)z+=1.5;return {type:(['lynx','yak','frost-spider','ice-golem'] as const)[Math.min(3,Math.floor(col/2))],x,z};}),
 {type:'yak',eliteId:'frost-matriarch',x:357,z:35},
 {type:'ice-golem',eliteId:'glacier-warden',x:423,z:-29},
]);
export const SNOW_ROADS=Object.freeze([
 {id:'snow-main',width:5,points:[SNOW_ENTRY,{x:287,z:8},{x:315,z:6},{x:350,z:3},{x:380,z:12},{x:416,z:12},{x:437,z:12}]},
 {id:'snow-north',width:4,points:[{x:287,z:8},{x:288,z:-12},{x:304,z:-36},{x:326,z:-46},{x:371,z:-55},{x:412,z:-57}]},
 {id:'snow-south',width:4,points:[{x:287,z:8},{x:294,z:40},{x:324,z:58},{x:353,z:62},{x:402,z:44},{x:416,z:12},{x:437,z:12}]},
]);
export const SNOW_LANDMARKS=Object.freeze([{id:'snow-obelisk',name:'Ледяной обелиск',kind:'obelisk',x:360,z:-30},{id:'snow-ruins',name:'Застывшие руины',kind:'ruins',x:413,z:56},{id:'snow-crystals',name:'Сердце ледника',kind:'crystals',x:426,z:-66}]);
const LANDMARK_OBSTACLES:readonly Readonly<Obstacle>[]=Object.freeze([{x:360,z:-30,r:2.2},{x:413,z:56,w:6,d:2},{x:426,z:-66,r:2.5}]);
export const SNOW_PASSAGES=Object.freeze([
 {id:'forest-snow' as const,name:'Снежный перевал · ур. 10',x:69,z:5,range:1.8,destination:SNOW_ENTRY,destinationName:'Снежный предел',minLevel:SNOW_MIN_LEVEL},
 {id:'snow-forest' as const,name:'Лесная опушка',x:263,z:8,range:1.8,destination:{x:65,z:5},destinationName:'Лесная опушка',minLevel:1},
]);

const segmentDistance=(p:Position,a:Position,b:Position)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);};
export const SNOW_TREES=Object.freeze(Array.from({length:165},(_,i)=>({x:275+(i*47%158),z:-73+(i*61%150),s:.8+(i%5)*.13})).filter(p=>
 !snowSafe(p)&&SNOW_SPAWNS.every(spawn=>Math.hypot(p.x-spawn.x,p.z-spawn.z)>6)&&
 SNOW_ROADS.every(road=>road.points.slice(1).every((b,i)=>segmentDistance(p,road.points[i],b)>road.width/2+3))&&
 SNOW_SPOTS.every(spot=>Math.hypot(p.x-spot.x,p.z-spot.z)>spot.radius+4)&&
 SNOW_LANDMARKS.every(mark=>Math.hypot(p.x-mark.x,p.z-mark.z)>6)
).map(p=>Object.freeze(p)));
export const SNOW_OBSTACLES:readonly Readonly<Obstacle>[]=Object.freeze([...LANDMARK_OBSTACLES,...SNOW_TREES.map(p=>({x:p.x,z:p.z,r:.28}))]);
