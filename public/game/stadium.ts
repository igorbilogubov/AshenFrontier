import {LATE_PASSAGES} from './late-world.js';
import {DUNGEON_PASSAGES} from './dungeons.js';
import {WASTELAND_PASSAGES} from './wasteland.js';
import {SNOW_PASSAGES} from './snow.js';
import type {Position,Obstacle} from './motion.js';
import type {MobType} from '../../shared/types.js';

/** Separate, server-owned coordinates. The gap to the forest is never walkable. */
export const STADIUM_PEN_WIDTH=14;
export const STADIUM_PEN_DEPTH=16;
export const STADIUM_PEN_RADIUS=5.8;
export const STADIUM_COL_X=Object.freeze([142,160,178,196] as const);
export const STADIUM_ROW_Z0=-6;
export const STADIUM_ROW_PITCH=22;
export const STADIUM_ROWS=7;
export const STADIUM_COLS=4;
/** First four pens keep historical SPAWNS indices; the other 24 append after dungeons. Extra homes append after large field packs. */
export const STADIUM_EXPANSION_SPAWN_BASE=620;
export const STADIUM_PEN_HOME=6;
export const STADIUM_PEN_EXTRA=4;
export const STADIUM_PEN_SIZE=STADIUM_PEN_HOME+STADIUM_PEN_EXTRA;
export const STADIUM_EXTRA_SPAWN_BASE=1017;
export const STADIUM_BOUNDS=Object.freeze({minX:133,maxX:205,minZ:-149,maxZ:23});
export const STADIUM_HUB=Object.freeze({x:160,z:15,r:6.2});
const ROMAN=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI','XXII','XXIII','XXIV','XXV','XXVI','XXVII','XXVIII'] as const;
export type StadiumRank=typeof ROMAN[number];
const ALPHA_MOBS=Object.freeze(['alpha','alpha','wolf','wolf','wolf','wolf','wolf','wolf','wolf','wolf'] as const satisfies readonly MobType[]);
const DESIGNS=Object.freeze([
  {id:'stadium-wolves',name:'Волчий загон',subtitle:'Волки · 10 существ',type:'wolf' as const,tint:'#819b94'},
  {id:'stadium-boars',name:'Кабаний загон',subtitle:'Кабаны · 10 существ',type:'boar' as const,tint:'#b29a71'},
  {id:'stadium-alphas',name:'Загон вожаков',subtitle:'2 вожака и 8 волков',type:'alpha' as const,tint:'#9b859e',mobs:ALPHA_MOBS},
  {id:'stadium-bears',name:'Медвежий загон',subtitle:'Медведи · 10 существ',type:'bear' as const,tint:'#a68466'},
  {id:'stadium-lynx',name:'Рысий загон',subtitle:'Снежные рыси · 10 существ',type:'lynx' as const,tint:'#8aa7b8'},
  {id:'stadium-yak',name:'Загон яков',subtitle:'Шерстистые яки · 10 существ',type:'yak' as const,tint:'#c5d4dc'},
  {id:'stadium-frost-spider',name:'Загон морозных пауков',subtitle:'Морозные пауки · 10 существ',type:'frost-spider' as const,tint:'#7b9aa8'},
  {id:'stadium-ice-golem',name:'Загон ледяных големов',subtitle:'Ледяные големы · 10 существ',type:'ice-golem' as const,tint:'#9ec4d4'},
  {id:'stadium-ash-jackal',name:'Шакалий загон',subtitle:'Пепельные шакалы · 10 существ',type:'ash-jackal' as const,tint:'#c4a070'},
  {id:'stadium-scorpion',name:'Загон скорпионов',subtitle:'Обсидиановые скорпионы · 10 существ',type:'scorpion' as const,tint:'#b07a4a'},
  {id:'stadium-monitor-lizard',name:'Загон варанов',subtitle:'Пустынные вараны · 10 существ',type:'monitor-lizard' as const,tint:'#9a6b3c'},
  {id:'stadium-scarab',name:'Загон скарабеев',subtitle:'Панцирные скарабеи · 10 существ',type:'scarab' as const,tint:'#d4b06a'},
  {id:'stadium-swamp-frog',name:'Жабий загон',subtitle:'Топяные жабы · 10 существ',type:'swamp-frog' as const,tint:'#6a8b62'},
  {id:'stadium-marsh-crocodile',name:'Крокодилий загон',subtitle:'Болотные крокодилы · 10 существ',type:'marsh-crocodile' as const,tint:'#4e7a58'},
  {id:'stadium-plague-mosquito',name:'Комариный загон',subtitle:'Чумные комары · 10 существ',type:'plague-mosquito' as const,tint:'#7a9a4a'},
  {id:'stadium-bog-spider',name:'Загон топяных пауков',subtitle:'Топяные пауки · 10 существ',type:'bog-spider' as const,tint:'#3d6b52'},
  {id:'stadium-cave-bat',name:'Загон нетопырей',subtitle:'Пещерные нетопыри · 10 существ',type:'cave-bat' as const,tint:'#8b7aad'},
  {id:'stadium-cave-crawler',name:'Загон ползунов',subtitle:'Пещерные ползуны · 10 существ',type:'cave-crawler' as const,tint:'#6d6a8a'},
  {id:'stadium-crystal-beetle',name:'Загон кристальных жуков',subtitle:'Кристальные жуки · 10 существ',type:'crystal-beetle' as const,tint:'#a090c4'},
  {id:'stadium-stone-guardian',name:'Загон каменных стражей',subtitle:'Каменные стражи · 10 существ',type:'stone-guardian' as const,tint:'#7a758c'},
  {id:'stadium-hellhound',name:'Загон адских гончих',subtitle:'Адские гончие · 10 существ',type:'hellhound' as const,tint:'#c45c3a'},
  {id:'stadium-lava-elemental',name:'Загон элементалей',subtitle:'Лавовые элементали · 10 существ',type:'lava-elemental' as const,tint:'#d4783c'},
  {id:'stadium-ember-crab',name:'Загон угольных крабов',subtitle:'Угольные крабы · 10 существ',type:'ember-crab' as const,tint:'#a84832'},
  {id:'stadium-basalt-brute',name:'Загон громил',subtitle:'Базальтовые громилы · 10 существ',type:'basalt-brute' as const,tint:'#8a4038'},
  {id:'stadium-bonehound',name:'Загон костяных гончих',subtitle:'Костяные гончие · 10 существ',type:'bonehound' as const,tint:'#6a6e7a'},
  {id:'stadium-gargoyle',name:'Загон горгулий',subtitle:'Горгульи · 10 существ',type:'gargoyle' as const,tint:'#8a8494'},
  {id:'stadium-void-stalker',name:'Загон ловчих пустоты',subtitle:'Ловчие пустоты · 10 существ',type:'void-stalker' as const,tint:'#4a4558'},
  {id:'stadium-iron-warden',name:'Загон надзирателей',subtitle:'Железные надзиратели · 10 существ',type:'iron-warden' as const,tint:'#9a90a8'},
] as const);
export type StadiumPenId=typeof DESIGNS[number]['id'];
const LEGACY_SPAWN_IDS=Object.freeze([
  Object.freeze([41,42,43,44,45,46]),
  Object.freeze([47,48,49,50,51,52]),
  Object.freeze([53,54,55,56,57,58]),
  Object.freeze([89,90,91,92,93,94]),
]);
function spawnIdsFor(index:number):readonly number[]{
  const extra=Object.freeze(Array.from({length:STADIUM_PEN_EXTRA},(_,j)=>STADIUM_EXTRA_SPAWN_BASE+index*STADIUM_PEN_EXTRA+j));
  if(index<LEGACY_SPAWN_IDS.length)return Object.freeze([...LEGACY_SPAWN_IDS[index],...extra]);
  const base=STADIUM_EXPANSION_SPAWN_BASE+(index-LEGACY_SPAWN_IDS.length)*STADIUM_PEN_HOME;
  return Object.freeze([...Array.from({length:STADIUM_PEN_HOME},(_,j)=>base+j),...extra]);
}
export interface StadiumPen extends Position {
  readonly id:StadiumPenId;readonly name:string;readonly subtitle:string;
  readonly width:number;readonly depth:number;readonly radius:number;
  readonly tint:string;readonly rank:StadiumRank;readonly type:MobType;
  readonly mobs:readonly MobType[];readonly spawnIds:readonly number[];
}
export const STADIUM_PENS:readonly Readonly<StadiumPen>[]=Object.freeze(DESIGNS.map((design,index)=>{
  const col=index%STADIUM_COLS,row=Math.floor(index/STADIUM_COLS);
  const mobs='mobs' in design&&design.mobs?design.mobs:Object.freeze(Array.from({length:STADIUM_PEN_SIZE},()=>design.type));
  return Object.freeze({
    id:design.id,name:design.name,subtitle:design.subtitle,type:design.type,tint:design.tint,
    x:STADIUM_COL_X[col],z:STADIUM_ROW_Z0-row*STADIUM_ROW_PITCH,
    width:STADIUM_PEN_WIDTH,depth:STADIUM_PEN_DEPTH,radius:STADIUM_PEN_RADIUS,
    rank:ROMAN[index],mobs,spawnIds:spawnIdsFor(index),
  });
}));
const formation:readonly (readonly [number,number])[]=[[-3,-2.2],[0,-3.7],[3,-2.2],[-3,1.8],[0,3.5],[3,1.8]];
const extraFormation:readonly (readonly [number,number])[]=[[-4.1,.2],[4.1,.2],[-2.2,-4],[2.2,-4]];
export const STADIUM_SPAWNS:readonly Readonly<Position & {type:MobType;spotId:StadiumPenId}>[]=Object.freeze(STADIUM_PENS.flatMap(pen=>formation.map(([dx,dz],i)=>Object.freeze({type:pen.mobs[i],spotId:pen.id,x:pen.x+dx,z:pen.z+dz}))));
export const STADIUM_EXTRA_SPAWNS:readonly Readonly<Position & {type:MobType;spotId:StadiumPenId}>[]=Object.freeze(STADIUM_PENS.flatMap(pen=>extraFormation.map(([dx,dz],i)=>Object.freeze({type:pen.mobs[STADIUM_PEN_HOME+i],spotId:pen.id,x:pen.x+dx,z:pen.z+dz}))));
export interface Portal extends Position {readonly id:string;readonly minLevel?:number;readonly name:string;readonly range:number;readonly destination:Readonly<Position>;readonly destinationName:string}
export const PORTALS:readonly Readonly<Portal>[]=Object.freeze([
  Object.freeze({id:'camp-stadium',name:'Стадиум',x:-4.6,z:2.9,range:1.8,destination:Object.freeze({x:160,z:14.8}),destinationName:'Стадиум'}),
  Object.freeze({id:'stadium-camp',name:'Лагерь',x:160,z:19.4,range:1.8,destination:Object.freeze({x:-3.2,z:2.5}),destinationName:'Лесная опушка'}),
]);
export const ALL_PASSAGES=Object.freeze([...SNOW_PASSAGES,...WASTELAND_PASSAGES,...LATE_PASSAGES,...DUNGEON_PASSAGES]);
export const ALL_PORTALS:readonly Portal[]=Object.freeze([...PORTALS,...ALL_PASSAGES]);
export const portalById=(id:unknown)=>typeof id==='string'?ALL_PORTALS.find(portal=>portal.id===id):undefined;
export const inStadium=(p:Position,padding=0)=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=STADIUM_BOUNDS.minX+padding&&p.x<=STADIUM_BOUNDS.maxX-padding&&p.z>=STADIUM_BOUNDS.minZ+padding&&p.z<=STADIUM_BOUNDS.maxZ-padding;
export const stadiumSafe=(p:Position)=>Math.hypot(p.x-STADIUM_HUB.x,p.z-STADIUM_HUB.z)<STADIUM_HUB.r;
export const stadiumPenWalls=(pen:Pick<StadiumPen,'x'|'z'|'width'|'depth'>):readonly Obstacle[]=>Object.freeze([
  {x:pen.x-pen.width/2,z:pen.z,w:.42,d:pen.depth},
  {x:pen.x+pen.width/2,z:pen.z,w:.42,d:pen.depth},
  {x:pen.x,z:pen.z-pen.depth/2,w:pen.width+.42,d:.42},
  ...[-1,1].map(side=>({x:pen.x+side*(pen.width/4+1.2),z:pen.z+pen.depth/2,w:pen.width/2-2.4,d:.42})),
].map(w=>Object.freeze(w)));
/** Low fences have the same rectangles in rendering, movement and line of sight.
 * Each 4.8 m southern gate remains open; the hunting circle fits fully inside.
 */
export const STADIUM_PEN_WALLS:readonly Readonly<Obstacle>[]=Object.freeze(STADIUM_PENS.flatMap(pen=>stadiumPenWalls(pen)));
export const STADIUM_OBSTACLES:readonly Readonly<Obstacle>[]=Object.freeze([
  ...STADIUM_PEN_WALLS,
  {x:STADIUM_BOUNDS.minX+.35,z:(STADIUM_BOUNDS.minZ+STADIUM_BOUNDS.maxZ)/2,w:.7,d:STADIUM_BOUNDS.maxZ-STADIUM_BOUNDS.minZ},
  {x:STADIUM_BOUNDS.maxX-.35,z:(STADIUM_BOUNDS.minZ+STADIUM_BOUNDS.maxZ)/2,w:.7,d:STADIUM_BOUNDS.maxZ-STADIUM_BOUNDS.minZ},
  {x:(STADIUM_BOUNDS.minX+STADIUM_BOUNDS.maxX)/2,z:STADIUM_BOUNDS.minZ+.35,w:STADIUM_BOUNDS.maxX-STADIUM_BOUNDS.minX,d:.7},
  {x:(STADIUM_BOUNDS.minX+STADIUM_BOUNDS.maxX)/2,z:STADIUM_BOUNDS.maxZ-.35,w:STADIUM_BOUNDS.maxX-STADIUM_BOUNDS.minX,d:.7},
].map(w=>Object.freeze(w)));
