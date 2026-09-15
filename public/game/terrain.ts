import {STADIUM_OBSTACLES} from './stadium.js';
import type { Obstacle } from './motion.js';
import {WORLD_BOUNDS,WORLD_CLEARINGS,WORLD_LANDMARKS,ROAMING_SPAWNS,EXTRA_ROAMING_SPAWNS,roadEdgeDistance} from './world-layout.js';
import {AFK_SPOTS,AFK_SPAWNS,BEAR_AFK_SPAWNS,forestTrailDistance,withinSpot} from './afk.js';
export interface TreePosition {x:number;z:number;s:number;solid:boolean}
// World coordinates are metres. Only this module defines physical obstacles.
const spawns=[{x:7.6,z:1.8},{x:10.4,z:-4},{x:12.4,z:6.4},{x:15.4,z:1.4},{x:18.2,z:-6.2},{x:20.7,z:4.9},{x:25,z:-1.2}];
let seed=917493;
const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const trees:Readonly<TreePosition>[]=[];
for(let i=0;i<150;i++){
  const edge=i<65;let x=edge?-14+random()*50:-10+random()*40,z=(random()-.5)*(edge?43:28);
  if(edge&&x>-12&&x<32&&Math.abs(z)<16)z=(z>0?1:-1)*(16+random()*6);
  const path=Math.abs(z-1-Math.sin(x*.25)*.9);
  const coversFight=spawns.some(s=>{const dx=x-s.x,dz=z-s.z,depth=dx*Math.sin(.55)+dz*Math.cos(.55),side=dx*Math.cos(.55)-dz*Math.sin(.55);return depth>0&&depth<7&&Math.abs(side)<2.8;});
  const coversTrail=x>2&&x<29&&z>1+Math.sin(x*.25)*.9&&path<7;
  if(!edge&&(path<3||coversFight||coversTrail||Math.hypot(x+1,z)<7||spawns.some(s=>Math.hypot(s.x-x,s.z-z)<3)||Math.hypot(x-25,z+1.2)<4.5))continue;
  // Consume the original scale draw before filtering so surviving trees retain
  // their exact old positions. Removing trees opens routes without trapping saves.
  const s=.7+random()*.55;
  const coversSpot=AFK_SPOTS.some(spot=>{
    const dx=x-spot.x,dz=z-spot.z,depth=dx*Math.sin(.55)+dz*Math.cos(.55),side=dx*Math.cos(.55)-dz*Math.sin(.55);
    return withinSpot({x,z},spot,1.25)||(depth>0&&depth<8&&Math.abs(side)<4.3);
  });
  if(!edge&&(coversSpot||forestTrailDistance(x,z)<2.15))continue;
  // Former edge trees must disappear: this is open terrain now.
  if(!edge&&roadEdgeDistance(x,z)>.9)trees.push(Object.freeze({x,z,s,solid:true}));
}
// Place the new forest as separated groves, not concentric walls around paths.
const protectedSpawns=[...spawns,...AFK_SPAWNS,...ROAMING_SPAWNS,...EXTRA_ROAMING_SPAWNS,...BEAR_AFK_SPAWNS];
const groves=[[-30,-31],[-26,34],[-3,-13],[9,-39],[19,-25],[34,-22],[62,-31],[65,20],[43,37],[13,11],[6,40],[-31,-3],[42,12]];
for(let i=0;i<600;i++){
  const [cx,cz]=groves[i%groves.length],angle=random()*Math.PI*2,r=Math.sqrt(random())*9;
  const x=cx+Math.cos(angle)*r,z=cz+Math.sin(angle)*r,s=.75+random()*.65;
  if(x<WORLD_BOUNDS.minX+1||x>WORLD_BOUNDS.maxX-1||z<WORLD_BOUNDS.minZ+1||z>WORLD_BOUNDS.maxZ-1)continue;
  // No new collisions anywhere within the formerly playable rectangle.
  if(x>-12&&x<32&&z>-16&&z<16)continue;
  if(roadEdgeDistance(x,z)<1.1||WORLD_CLEARINGS.some(c=>Math.hypot(x-c.x,z-c.z)<c.radius+1))continue;
  if(protectedSpawns.some(p=>Math.hypot(x-p.x,z-p.z)<3.5)||WORLD_LANDMARKS.some(p=>Math.hypot(x-p.x,z-p.z)<4.5))continue;
  if(trees.some(p=>Math.hypot(x-p.x,z-p.z)<1.6))continue;
  trees.push(Object.freeze({x,z,s,solid:true}));
  if(trees.length>=230)break;
}
// A new outer tree line gives the full region a silhouette. It has no collision
// inside BOUNDS, and does not leave the old 42×30 m rectangle visible as a wall.
for(let i=0;i<140;i++){
  const edge=i%4,p=random(),offset=3+random()*6;
  const x=edge<2?WORLD_BOUNDS.minX+p*110:edge===2?WORLD_BOUNDS.minX-offset:WORLD_BOUNDS.maxX+offset;
  const z=edge>=2?WORLD_BOUNDS.minZ+p*90:edge===0?WORLD_BOUNDS.minZ-offset:WORLD_BOUNDS.maxZ+offset;
  trees.push(Object.freeze({x,z,s:.85+random()*.7,solid:false}));
}
export const TREE_POSITIONS=Object.freeze(trees);
export const LANDMARK_OBSTACLES:readonly Readonly<Obstacle>[]=Object.freeze(WORLD_LANDMARKS.flatMap<Obstacle>(p=>{
  if(p.kind==='standing-stones')return [-1,0,1].map(i=>({x:p.x+i*1.5,z:p.z+Math.abs(i)*.5,r:.48}));
  if(p.kind==='arches')return [-1,1].map(i=>({x:p.x+i*1.8,z:p.z,w:.9,d:1.1}));
  if(p.kind==='fallen-oak')return [{x:p.x,z:p.z,w:5.4,d:1.3}];
  return [{x:p.x,z:p.z,w:3.2,d:2.2}];
}).map(o=>Object.freeze(o)));
export const OBSTACLES:readonly Readonly<Obstacle>[]=Object.freeze([
  {x:-5,z:-4.6,w:4.8,d:4},{x:-2.3,z:-.6,r:1.02},{x:-4,z:-.5,r:.6},{x:-2.1,z:-2.25,r:.6},{x:-.4,z:-4.2,r:.6},
  ...[[22.6,-3.4],[28,-3.4],[28,2.5]].map(([x,z])=>({x,z,r:.42})),
  ...[[23,-4.7,2.3],[27,-4.7,2],[28.8,.3,.6]].map(([x,z,w])=>({x,z,w,d:.6})),
  ...[[8.5,-8,.85],[14,10,.9],[18.5,6.5,.65],[20,-10,1.1],[29,8,.8],[10,-11,.6]].map(([x,z,r])=>({x,z,r:r*.8})),
  ...LANDMARK_OBSTACLES,
  ...STADIUM_OBSTACLES,
  ...trees.filter(t=>t.solid).map(({x,z})=>({x,z,r:.32}))
].map(o=>Object.freeze(o)));

// Server movement performs many tiny swept steps. The enlarged map must not
// scan all 254 obstacles for every step: each bucket includes a 1 m body margin.
const collisionCellSize=8;
const collisionCells=new Map<string,readonly Readonly<Obstacle>[]>();
const buildingCells=new Map<string,Readonly<Obstacle>[]>();
for(const obstacle of OBSTACLES){
  const halfX=obstacle.w!==undefined?obstacle.w/2:obstacle.r,halfZ=obstacle.d!==undefined?obstacle.d/2:obstacle.r;
  for(let x=Math.floor((obstacle.x-halfX-1)/collisionCellSize);x<=Math.floor((obstacle.x+halfX+1)/collisionCellSize);x++){
    for(let z=Math.floor((obstacle.z-halfZ-1)/collisionCellSize);z<=Math.floor((obstacle.z+halfZ+1)/collisionCellSize);z++){
      const key=`${x},${z}`,cell=buildingCells.get(key)??[];cell.push(obstacle);buildingCells.set(key,cell);
    }
  }
}
for(const [key,cell] of buildingCells)collisionCells.set(key,Object.freeze(cell));
buildingCells.clear();
const emptyObstacles:readonly Readonly<Obstacle>[]=Object.freeze([]);
export function nearbyObstacles(x:number,z:number,radius:number){
  if(radius>1||radius<0)return OBSTACLES;
  return collisionCells.get(`${Math.floor(x/collisionCellSize)},${Math.floor(z/collisionCellSize)}`)??emptyObstacles;
}
