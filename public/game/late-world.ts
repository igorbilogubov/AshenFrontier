import type {Position,Obstacle} from './motion.js';
export type LateRegionId='swamp'|'mines'|'rift'|'citadel';
export type LateMobType='swamp-frog'|'marsh-crocodile'|'plague-mosquito'|'bog-spider'|'cave-bat'|'cave-crawler'|'crystal-beetle'|'stone-guardian'|'hellhound'|'lava-elemental'|'ember-crab'|'basalt-brute'|'bonehound'|'gargoyle'|'void-stalker'|'iron-warden';
export interface LateMobConfig {name:string;level:number;hp:number;damage:number;speed:number;range:number;windup:number;cooldown:number;aggro:number;coins:number;xp:number;radius:number;scale:number}
const cfg=(name:string,level:number,hp:number,damage:number,speed:number,radius:number,xp:number):LateMobConfig=>({name,level,hp,damage,speed,radius,xp,scale:1,range:radius+1.1,windup:radius>.7?1.18:.83,cooldown:radius>.7?1.55:1.22,aggro:5.8,coins:Math.round(xp*.4)});
export const LATE_MOB_TYPES:Readonly<Record<LateMobType,LateMobConfig>>=Object.freeze({
 'swamp-frog':cfg('Топяная жаба',40,1650,77,1.7,.58,320),
 'marsh-crocodile':cfg('Болотный крокодил',44,2100,86,1.5,.75,385),
 'plague-mosquito':cfg('Чумной комар',48,1800,95,2.3,.46,450),
 'bog-spider':cfg('Топяной паук',52,2500,105,1.8,.7,525),
 'cave-bat':cfg('Пещерный нетопырь',55,2950,118,2.35,.48,640),
 'cave-crawler':cfg('Пещерный ползун',59,3600,133,1.65,.68,750),
 'crystal-beetle':cfg('Кристальный жук',63,4200,146,1.45,.78,860),
 'stone-guardian':cfg('Каменный страж',67,5000,161,1.25,.88,990),
 hellhound:cfg('Адская гончая',70,5500,180,2.4,.53,1170),
 'lava-elemental':cfg('Лавовый элементаль',74,6400,197,1.45,.78,1320),
 'ember-crab':cfg('Угольный краб',78,7300,218,1.6,.87,1500),
 'basalt-brute':cfg('Базальтовый громила',82,8500,242,1.2,.94,1710),
 bonehound:cfg('Костяная гончая',85,9100,265,2.45,.55,1950),
 gargoyle:cfg('Горгулья',89,10600,288,1.75,.8,2200),
 'void-stalker':cfg('Ловчий пустоты',93,11900,316,2.1,.67,2480),
 'iron-warden':cfg('Железный надзиратель',97,14000,350,1.3,.95,2820),
});
export const LATE_ELITE_TYPES=Object.freeze({
 'rotting-jaw':{type:'marsh-crocodile' as const,name:'Гнилая пасть',hp:6300,damage:130,coins:630,xp:1100,scale:1.35,respawn:300},
 'widow-of-the-bog':{type:'bog-spider' as const,name:'Вдова трясины',hp:7800,damage:155,coins:820,xp:1500,scale:1.3,respawn:360},
 'crystal-matriarch':{type:'crystal-beetle' as const,name:'Кристальная матка',hp:12500,damage:215,coins:1200,xp:2350,scale:1.3,respawn:300},
 'forgotten-sentinel':{type:'stone-guardian' as const,name:'Забытый дозорный',hp:15000,damage:245,coins:1500,xp:2850,scale:1.3,respawn:360},
 'furnace-heart':{type:'lava-elemental' as const,name:'Сердце горнила',hp:20000,damage:295,coins:1900,xp:3850,scale:1.35,respawn:300},
 'black-anvil':{type:'basalt-brute' as const,name:'Чёрная наковальня',hp:25000,damage:350,coins:2300,xp:4850,scale:1.3,respawn:360},
 'night-harbinger':{type:'gargoyle' as const,name:'Вестник ночи',hp:32000,damage:420,coins:3000,xp:6250,scale:1.3,respawn:300},
 'iron-executioner':{type:'iron-warden' as const,name:'Железный палач',hp:42000,damage:490,coins:3900,xp:8000,scale:1.3,respawn:360},
});
export interface LatePassage extends Position {id:string;name:string;range:number;destination:Position;destinationName:string;minLevel:number}
export interface LateSpot extends Position {id:string;name:string;radius:number;spawnIds:readonly number[]}
export interface LateRegion {id:LateRegionId;name:string;minLevel:number;bounds:{minX:number;maxX:number;minZ:number;maxZ:number};entry:Position;safe:Position&{r:number};dungeonEntrance:Position;spawns:readonly (Position&{type:LateMobType;spotId?:string;eliteId?:string})[];spots:readonly LateSpot[];roads:readonly {id:string;width:number;points:readonly Position[]}[];obstacles:readonly Obstacle[];passages:readonly LatePassage[];props:readonly (Position&{r:number;height:number;kind:'tree'|'rock'|'pillar'})[]}
const DESIGNS=[
 {id:'swamp' as const,name:'Топь забвения',minLevel:40,minX:760,species:['swamp-frog','marsh-crocodile','plague-mosquito','bog-spider'] as const,elites:['rotting-jaw','widow-of-the-bog'] as const,spotNames:['Жабьи заводи','Омут крокодилов','Гнилые корни','Чумные заросли','Гнёзда комаров','Паучий остров','Затопленные плиты','Вдовья трясина']},
 {id:'mines' as const,name:'Забытые шахты',minLevel:55,minX:1020,species:['cave-bat','cave-crawler','crystal-beetle','stone-guardian'] as const,elites:['crystal-matriarch','forgotten-sentinel'] as const,spotNames:['Колония нетопырей','Выработки ползунов','Обваленная штольня','Малахитовые жилы','Логово ползунов','Кристальный карьер','Каменные дозоры','Заброшенное горнило']},
 {id:'rift' as const,name:'Расколотые земли',minLevel:70,minX:1280,species:['hellhound','lava-elemental','ember-crab','basalt-brute'] as const,elites:['furnace-heart','black-anvil'] as const,spotNames:['Гончие пепла','Остывший поток','Обугленный гребень','Пылающая чаша','Расколотая плита','Угольные гнёзда','Базальтовые столбы','Старое горнило']},
 {id:'citadel' as const,name:'Чёрная цитадель',minLevel:85,minX:1540,species:['bonehound','gargoyle','void-stalker','iron-warden'] as const,elites:['night-harbinger','iron-executioner'] as const,spotNames:['Костяные поля','Крылатые стражи','Разрушенный двор','Сад пустоты','Ночные охотники','Чёрные бастионы','Плац надзирателей','Железный караул']},
];
export function lateRoadDistance(region:Pick<LateRegion,'roads'>,x:number,z:number){let d=Infinity;for(const r of region.roads)for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));d=Math.min(d,Math.hypot(x-a.x-t*dx,z-a.z-t*dz)-r.width/2);}return d;}
export const LATE_REGIONS:readonly LateRegion[]=Object.freeze(DESIGNS.map((d,index)=>{
 const x=d.minX,p=(dx:number,z:number)=>({x:x+dx,z}),entry=p(9,0),safe={...p(8,0),r:7},dungeonEntrance=p(110,-18);
 const centers=[[31,-28],[35,44],[66,-62],[78,21],[110,-48],[113,60],[149,-59],[151,26]] as const;
 const speciesIndex=[0,1,0,2,1,2,3,3];
 const spots=centers.map(([dx,z],i)=>({id:`${d.id}-spot-${i+1}`,name:d.spotNames[i],...p(dx,z),radius:5.2,spawnIds:Array.from({length:6},(_,j)=>292+index*82+i*6+j)}));
 const spawns:LateRegion['spawns']=[...spots.flatMap((s,i)=>Array.from({length:6},(_,j)=>({type:d.species[speciesIndex[i]],spotId:s.id,x:s.x+Math.cos(j*Math.PI/3)*3.4,z:s.z+Math.sin(j*Math.PI/3)*3.4}))),...Array.from({length:32},(_,i)=>{const dx=22+i%8*20;let z=-77+Math.floor(i/8)*48;for(let a=0;a<15&&(spots.some(s=>Math.hypot(x+dx-s.x,z-s.z)<9)||Math.hypot(dx-110,z+18)<12);a++)z+=1.4;return {type:d.species[Math.floor(i%8/2)],...p(dx,z)};}),{type:LATE_ELITE_TYPES[d.elites[0]].type,eliteId:d.elites[0],...p(112,-77)},{type:LATE_ELITE_TYPES[d.elites[1]].type,eliteId:d.elites[1],...p(167,61)}];
 const roads=[{id:`${d.id}-main`,width:6,points:[entry,p(33,0),p(66,-4),p(99,4),p(135,0),p(177,0)]},{id:`${d.id}-north`,width:5,points:[p(33,0),p(31,-28),p(66,-62),p(110,-48),p(149,-59),p(163,-27),p(151,26)]},{id:`${d.id}-south`,width:5,points:[p(33,0),p(35,44),p(76,63),p(113,60),p(151,26)]},{id:`${d.id}-cross`,width:5,points:[p(66,-62),p(72,-28),p(78,21),p(76,63)]},{id:`${d.id}-dungeon`,width:5,points:[p(110,-48),dungeonEntrance,p(99,4),p(113,60)]}];
 const props=Array.from({length:190},(_,i)=>({...p(17+i*43.193%155,-82+i*67.171%164),r:d.id==='swamp'?.35:.8,height:2.2+i%5*.6,kind:(d.id==='swamp'?'tree':d.id==='citadel'?'pillar':'rock') as 'tree'|'rock'|'pillar'})).filter(v=>lateRoadDistance({roads},v.x,v.z)>4&&spawns.every(s=>Math.hypot(s.x-v.x,s.z-v.z)>5.5)&&spots.every(s=>Math.hypot(s.x-v.x,s.z-v.z)>s.radius+4)&&Math.hypot(v.x-dungeonEntrance.x,v.z-dungeonEntrance.z)>10&&Math.hypot(v.x-safe.x,v.z-safe.z)>safe.r+4);
 const prev=index?DESIGNS[index-1]:{id:'wasteland',name:'Пепельные пустоши',minX:500},next=DESIGNS[index+1];
 const passages:LatePassage[]=[{id:`${d.id}-${prev.id}`,name:prev.name,...p(3,0),range:1.8,destination:{x:index?prev.minX+171:671,z:0},destinationName:prev.name,minLevel:1},{id:`${prev.id}-${d.id}`,name:`${d.name} · ур. ${d.minLevel}`,x:index?prev.minX+177:677,z:0,range:1.8,destination:entry,destinationName:d.name,minLevel:d.minLevel}];
 return {id:d.id,name:d.name,minLevel:d.minLevel,bounds:{minX:x,maxX:x+180,minZ:-90,maxZ:90},entry,safe,dungeonEntrance,spawns,spots,roads,props,obstacles:props.map(v=>({x:v.x,z:v.z,r:v.r})),passages};
}));
export const LATE_SPAWNS=Object.freeze(LATE_REGIONS.flatMap(r=>r.spawns));
export const LATE_SPOTS=Object.freeze(LATE_REGIONS.flatMap(r=>r.spots));
export const LATE_PASSAGES=Object.freeze(LATE_REGIONS.flatMap(r=>r.passages));
export function lateRegionAt(p:Position){return LATE_REGIONS.find(r=>p.x>=r.bounds.minX&&p.x<=r.bounds.maxX&&p.z>=r.bounds.minZ&&p.z<=r.bounds.maxZ);}
export const lateSafe=(p:Position)=>LATE_REGIONS.some(r=>Math.hypot(p.x-r.safe.x,p.z-r.safe.z)<r.safe.r);
