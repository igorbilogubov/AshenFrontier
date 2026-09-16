import {LATE_REGIONS} from './late-world.js';
import type {Point,MobType,FieldRegionId,DungeonId,BossTelegraph} from '../../shared/types.js';
import type {Obstacle} from './motion.js';
export interface Dungeon {id:DungeonId;region:FieldRegionId;name:string;bossName:string;bossType:MobType;types:readonly MobType[];minLevel:number;level:number;entrance:Point;entry:Point;boss:Point;bounds:{minX:number;maxX:number;minZ:number;maxZ:number};color:string;floor:string;walls:readonly Obstacle[]}
const designs=[
 {region:'forest',name:'Склеп корней',bossName:'Хранитель древнего дуба',bossType:'bear',types:['wolf','boar','bear'],minLevel:5,level:12,entrance:{x:30,z:6},color:'#a4c585',floor:'#383b2c'},
 {region:'snow',name:'Сердце ледника',bossName:'Король вечной стужи',bossType:'ice-golem',types:['lynx','yak','frost-spider'],minLevel:15,level:25,entrance:{x:412,z:-55},color:'#8cdbed',floor:'#364e59'},
 {region:'wasteland',name:'Гробница солнца',bossName:'Пожиратель рассвета',bossType:'scarab',types:['ash-jackal','scorpion','monitor-lizard'],minLevel:30,level:40,entrance:{x:648,z:55},color:'#e6bd72',floor:'#4b3b2b'},
 {region:'swamp',name:'Затонувшее святилище',bossName:'Матерь трясины',bossType:'bog-spider',types:['swamp-frog','marsh-crocodile','plague-mosquito'],minLevel:45,level:55,entrance:LATE_REGIONS[0].dungeonEntrance,color:'#a7d969',floor:'#273e32'},
 {region:'mines',name:'Печать глубин',bossName:'Древний монолит',bossType:'stone-guardian',types:['cave-bat','cave-crawler','crystal-beetle'],minLevel:60,level:70,entrance:LATE_REGIONS[1].dungeonEntrance,color:'#b29aef',floor:'#353443'},
 {region:'rift',name:'Пылающее горнило',bossName:'Владыка горнила',bossType:'basalt-brute',types:['hellhound','lava-elemental','ember-crab'],minLevel:75,level:85,entrance:LATE_REGIONS[2].dungeonEntrance,color:'#ed8359',floor:'#352d2b'},
 {region:'citadel',name:'Трон безмолвия',bossName:'Последний король',bossType:'iron-warden',types:['bonehound','gargoyle','void-stalker'],minLevel:90,level:100,entrance:LATE_REGIONS[3].dungeonEntrance,color:'#c8a9ed',floor:'#2e303b'},
] as const;
export const DUNGEONS:readonly Dungeon[]=Object.freeze(designs.map((d,i)=>{
 const x=3000+i*200;
 const walls:Obstacle[]=[{x:x+55,z:-25.6,w:110,d:.8},{x:x+55,z:25.6,w:110,d:.8},{x:x+.4,z:0,w:.8,d:52},{x:x+109.6,z:0,w:.8,d:52},...[20,44,68,84].flatMap(dx=>[-1,1].map(side=>({x:x+dx,z:side*15,w:1,d:22}))),...[30,53,75,98].flatMap(dx=>[-1,1].map(side=>({x:x+dx,z:side*16,r:.8})))];
 return {...d,id:`${d.region}-dungeon` as DungeonId,entry:{x:x+8,z:0},boss:{x:x+96,z:0},bounds:{minX:x,maxX:x+110,minZ:-26,maxZ:26},walls};
}));
export const DUNGEON_RESET_SECONDS=180,DUNGEON_ABANDON_SECONDS=600;
export const dungeonAt=(p:Point)=>DUNGEONS.find(d=>p.x>=d.bounds.minX&&p.x<=d.bounds.maxX&&p.z>=d.bounds.minZ&&p.z<=d.bounds.maxZ);
export const dungeonSafe=(p:Point)=>{const d=dungeonAt(p);return !!d&&p.x<d.bounds.minX+17;};
export const dungeonById=(id:string|undefined)=>DUNGEONS.find(d=>d.id===id);
export const DUNGEON_PASSAGES=Object.freeze(DUNGEONS.flatMap(d=>[
 {id:`enter-${d.id}`,name:`${d.name} · ур. ${d.minLevel}`,...d.entrance,range:1.8,destination:d.entry,destinationName:d.name,minLevel:d.minLevel},
 {id:`exit-${d.id}`,name:'Выход из подземелья',x:d.entry.x-4,z:0,range:1.8,destination:{x:d.entrance.x,z:d.entrance.z+3},destinationName:'Открытый мир',minLevel:1},
]));
export const DUNGEON_SPAWNS=Object.freeze(DUNGEONS.flatMap(d=>[
 ...[30,54,76].flatMap((dx,i)=>[[-2,-3],[2,-3],[-2,3],[2,3]].map(([x,z])=>({type:d.types[i],x:d.bounds.minX+dx+x,z,dungeonId:d.id,eliteId:`guard-${d.region}`}))),
 {type:d.bossType,...d.boss,dungeonId:d.id,bossId:d.id,bossLocked:true},
]));
export const DUNGEON_OBSTACLES=Object.freeze(DUNGEONS.flatMap(d=>d.walls));
/** Telegraph geometry is shared with the rendered warning, including hero body radius. */
export function inBossTelegraph(t:BossTelegraph,p:Point,r=.29){
 const distance=Math.hypot(p.x-t.x,p.z-t.z);if(distance>t.radius+r)return false;
 if(t.kind==='ring')return distance>=t.innerRadius-r;
 if(t.kind==='cone'){const angle=Math.atan2(p.x-t.x,p.z-t.z)-t.yaw;return Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))<=t.halfAngle+Math.asin(Math.min(1,r/Math.max(distance,.01)));}
 return true;
}
