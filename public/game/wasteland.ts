import type {Position,Obstacle} from './motion.js';
import type {MobType} from '../../shared/types.js';
import {LARGE_SPOT_RADIUS,WASTELAND_PACK_BASE,extraIds,packRing} from './pack-size.js';
/** Third open region. Disjoint coordinates prevent movement between map gaps. */
export const WASTELAND_BOUNDS=Object.freeze({minX:520,maxX:680,minZ:-80,maxZ:80});
export const WASTELAND_ENTRY=Object.freeze({x:528,z:0});
export const WASTELAND_MIN_LEVEL=25;
export const inWasteland=(p:Position,padding=0)=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=520+padding&&p.x<=680-padding&&p.z>=-80+padding&&p.z<=80-padding;
export const wastelandSafe=(p:Position)=>Math.hypot(p.x-526,p.z)<6;
export type WastelandSpotId='ash-jackal-dunes'|'ash-scorpion-basin'|'ash-jackal-ridge'|'ash-monitor-oasis'|'ash-scorpion-fissure'|'ash-scarab-tombs'|'ash-monitor-bones'|'ash-scarab-crater';
const centers:readonly (readonly [WastelandSpotId,string,number,number,MobType])[]=[
 ['ash-jackal-dunes','Шакальи дюны',548,-22,'ash-jackal'],['ash-scorpion-basin','Чаша скорпионов',551,35,'scorpion'],
 ['ash-jackal-ridge','Обугленный гребень',578,-55,'ash-jackal'],['ash-monitor-oasis','Высохший оазис',590,18,'monitor-lizard'],
 ['ash-scorpion-fissure','Пепельный разлом',618,-28,'scorpion'],['ash-scarab-tombs','Погребённые гробницы',625,53,'scarab'],
 ['ash-monitor-bones','Кладбище костей',652,-56,'monitor-lizard'],['ash-scarab-crater','Кратер скарабеев',655,8,'scarab'],
];
const WASTELAND_LARGE_INDICES=[2,4,6,7] as const;
export const WASTELAND_SPOTS=Object.freeze(centers.map(([id,name,x,z],i)=>{
  const large=WASTELAND_LARGE_INDICES.includes(i as typeof WASTELAND_LARGE_INDICES[number]);
  const rank=WASTELAND_LARGE_INDICES.indexOf(i as typeof WASTELAND_LARGE_INDICES[number]);
  const ids=[...Array.from({length:6},(_,j)=>194+i*6+j),...large?extraIds(WASTELAND_PACK_BASE,rank):[]];
  return Object.freeze({id,name,x,z,radius:large?LARGE_SPOT_RADIUS:5.2,spawnIds:Object.freeze(ids)});
}));
export const WASTELAND_LARGE_EXTRA_SPAWNS:readonly Readonly<Position & {type:MobType;spotId:WastelandSpotId}>[]=Object.freeze(
  WASTELAND_LARGE_INDICES.flatMap(i=>{
    const [spotId,,x,z,type]=centers[i];
    return packRing(x,z).map(([px,pz])=>Object.freeze({type,spotId,x:px,z:pz}));
  })
);
export const WASTELAND_SPAWNS:readonly Readonly<Position & {type:MobType;spotId?:WastelandSpotId;eliteId?:string}>[]=Object.freeze([
 ...centers.flatMap(([spotId,,x,z,type])=>Array.from({length:6},(_,i)=>({type,spotId,x:x+Math.cos(i*Math.PI/3)*3.5,z:z+Math.sin(i*Math.PI/3)*3.5}))),
 ...Array.from({length:48},(_,i)=>{const col=i%8,row=Math.floor(i/8),x=538+col*18;let z=-69+row*27;for(let attempt=0;attempt<12&&centers.some(([, ,sx,sz],si)=>Math.hypot(x-sx,z-sz)<(WASTELAND_LARGE_INDICES.includes(si as typeof WASTELAND_LARGE_INDICES[number])?LARGE_SPOT_RADIUS+4:9));attempt++)z+=1.3;return {type:(['ash-jackal','scorpion','monitor-lizard','scarab'] as const)[Math.min(3,Math.floor(col/2))],x,z};}),
 {type:'scorpion',eliteId:'obsidian-stinger',x:614,z:-63},
 {type:'scarab',eliteId:'sun-devourer',x:666,z:47},
]);
export const WASTELAND_ROADS=Object.freeze([
 {id:'ash-main',width:5.2,points:[WASTELAND_ENTRY,{x:549,z:0},{x:579,z:-4},{x:607,z:4},{x:636,z:0},{x:673,z:0}]},
 {id:'ash-north',width:4.5,points:[{x:549,z:0},{x:548,z:-22},{x:578,z:-55},{x:612,z:-49},{x:652,z:-56},{x:663,z:-22},{x:655,z:8}]},
 {id:'ash-south',width:4.5,points:[{x:549,z:0},{x:551,z:35},{x:585,z:47},{x:625,z:53},{x:657,z:37},{x:655,z:8}]},
 {id:'ash-crossing',width:4,points:[{x:578,z:-55},{x:583,z:-25},{x:590,z:18},{x:585,z:47}]},
 {id:'ash-eastern-crossing',width:4,points:[{x:612,z:-49},{x:618,z:-28},{x:607,z:4},{x:616,z:27},{x:625,z:53}]},
]);
export const WASTELAND_LANDMARKS=Object.freeze([
 {id:'ash-pillars',kind:'pillars',name:'Столбы праха',x:565,z:61},
 {id:'ash-skeleton',kind:'skeleton',name:'Кости исполина',x:645,z:-36},
 {id:'ash-tomb',kind:'tomb',name:'Гробница солнца',x:648,z:61},
]);
export const WASTELAND_PASSAGES=Object.freeze([
 {id:'snow-wasteland' as const,name:'Пепельные пустоши · ур. 25',x:437,z:12,range:1.8,destination:WASTELAND_ENTRY,destinationName:'Пепельные пустоши',minLevel:WASTELAND_MIN_LEVEL},
 {id:'wasteland-snow' as const,name:'Снежный предел',x:523,z:0,range:1.8,destination:{x:433,z:12},destinationName:'Снежный предел',minLevel:1},
]);
function edgeDistance(p:Position){let n=Infinity;for(const road of WASTELAND_ROADS)for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));n=Math.min(n,Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)-road.width/2);}return n;}
export const wastelandRoadDistance=(x:number,z:number)=>edgeDistance({x,z});
/** Sparse dead trees have exact matching server trunks. Low rocks are walkable. */
export const WASTELAND_TREES=Object.freeze(Array.from({length:115},(_,i)=>({x:532+i*41%140,z:-73+i*59%146,s:.8+i%5*.14})).filter(p=>
 !wastelandSafe(p)&&edgeDistance(p)>4&&WASTELAND_SPAWNS.every(s=>Math.hypot(p.x-s.x,p.z-s.z)>5.5)&&WASTELAND_SPOTS.every(s=>Math.hypot(p.x-s.x,p.z-s.z)>s.radius+4)&&WASTELAND_LANDMARKS.every(s=>Math.hypot(p.x-s.x,p.z-s.z)>9)));
export const WASTELAND_OBSTACLES:readonly Readonly<Obstacle>[]=Object.freeze([
 ...WASTELAND_TREES.map(p=>({x:p.x,z:p.z,r:.27})),
 ...[-2.5,0,2.5].map(dx=>({x:565+dx,z:61,r:.55})),
 {x:645,z:-36,w:5.5,d:1.7},{x:648,z:61,w:5,d:3},
]);
