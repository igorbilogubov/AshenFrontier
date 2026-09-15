import test from 'node:test';
import assert from 'node:assert/strict';
import {BOUNDS,SPAWNS,MOB_TYPES,stand,distance,translate} from '../dist/public/game/location.js';
import {WORLD_ROADS,WORLD_CLEARINGS,ROAMING_SPAWNS} from '../dist/public/game/world-layout.js';
import {canOccupy} from '../dist/public/game/motion.js';
import {OBSTACLES,TREE_POSITIONS} from '../dist/public/game/terrain.js';

test('the region grows to 9900 square metres and every creature has a body-safe home',()=>{
  assert.equal((BOUNDS.maxX-BOUNDS.minX)*(BOUNDS.maxZ-BOUNDS.minZ),9900);
  assert.equal(SPAWNS.length,41);assert.equal(ROAMING_SPAWNS.length,10);
  for(const spawn of SPAWNS)assert(stand(spawn.x,spawn.z,MOB_TYPES[spawn.type].radius),`blocked spawn ${spawn.x},${spawn.z}`);
  assert(TREE_POSITIONS.length<=370,'vegetation budget grew without a bound');
  for(const tree of TREE_POSITIONS.filter(t=>!t.solid))assert(tree.x<BOUNDS.minX||tree.x>BOUNDS.maxX||tree.z<BOUNDS.minZ||tree.z>BOUNDS.maxZ,'old edge forest blocks the expanded view');
});

test('authored roads form continuously walkable loops and frontier roads allow side-by-side travel',()=>{
  for(const road of WORLD_ROADS){
    const actor={...road.points[0]};assert(stand(actor.x,actor.z,.46));
    for(const point of road.points.slice(1)){
      translate(actor,point.x-actor.x,point.z-actor.z,.46);
      assert(distance(actor,point)<1e-6,`${road.id} blocked at ${point.x},${point.z}; ended ${actor.x},${actor.z}`);
    }
    if(['old-road','wolf-approach','boar-approach'].includes(road.id))continue;
    for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],length=distance(a,b),nx=-(b.z-a.z)/length,nz=(b.x-a.x)/length;
      for(let t=0;t<=length;t+=.4)for(const side of [-1.3,0,1.3]){
        const x=a.x+(b.x-a.x)*t/length+nx*side,z=a.z+(b.z-a.z)*t/length+nz*side;
        assert(stand(x,z,.46),`${road.id} broad lane blocked at ${x},${z}`);
      }
    }
  }
});

test('large clearings are open fields rather than routes cut between walls',()=>{
  for(const field of WORLD_CLEARINGS.filter(c=>c.radius>=9)){
    let total=0,free=0;
    for(let dx=-field.radius+1;dx<=field.radius-1;dx++)for(let dz=-field.radius+1;dz<=field.radius-1;dz++){
      if(Math.hypot(dx,dz)>field.radius-1)continue;
      total++;if(stand(field.x+dx,field.z+dz,.46))free++;
    }
    assert(free/total>.9,`${field.id}: only ${(100*free/total).toFixed(1)}% of clearing is open`);
  }
});

test('the whole region connects to camp through open space, including all spawns and clearing centres',()=>{
  const width=BOUNDS.maxX-BOUNDS.minX-1,depth=BOUNDS.maxZ-BOUNDS.minZ-1;
  const walkable=new Uint8Array(width*depth),visited=new Uint8Array(width*depth),queue=[];
  const point=i=>({x:BOUNDS.minX+1+i%width,z:BOUNDS.minZ+1+Math.floor(i/width)});
  const cell=p=>Math.round(p.x-BOUNDS.minX-1)+Math.round(p.z-BOUNDS.minZ-1)*width;
  for(let i=0;i<walkable.length;i++){const p=point(i);walkable[i]=Number(stand(p.x,p.z,.46));}
  const start=cell({x:0,z:2});queue.push(start);visited[start]=1;
  for(let n=0;n<queue.length;n++){
    const i=queue[n],a=point(i);
    for(const delta of [-1,1,-width,width]){
      const j=i+delta;if(j<0||j>=walkable.length||!walkable[j]||visited[j])continue;
      const b=point(j);if(distance(a,b)>1.01)continue;
      const actor={...a};translate(actor,b.x-a.x,b.z-a.z,.46);
      if(distance(actor,b)>1e-6)continue;
      visited[j]=1;queue.push(j);
    }
  }
  const free=walkable.reduce((a,b)=>a+b,0);
  assert(free/walkable.length>.9,'world is mostly filled with obstacles');
  assert(queue.length/free>.99,'open world contains inaccessible islands');
  for(const target of [...SPAWNS,...WORLD_CLEARINGS.filter(c=>c.id!=='camp'),{x:0,z:2}])assert(visited[cell(target)],`unreachable ${target.x},${target.z}`);
});


test('spatial collision lookup exactly matches the shared full obstacle scan',()=>{
  for(let x=BOUNDS.minX-.5;x<=BOUNDS.maxX+.5;x+=1.3)for(let z=BOUNDS.minZ-.5;z<=BOUNDS.maxZ+.5;z+=1.3){
    for(const radius of [0,.29,.46,1,1.5])assert.equal(stand(x,z,radius),canOccupy(x,z,OBSTACLES,radius,BOUNDS),`collision mismatch ${x},${z},r=${radius}`);
  }
  for(const obstacle of OBSTACLES)for(const offset of [-1.01,-1,-.46,0,.46,1,1.01]){
    for(const radius of [.29,.46,1])assert.equal(stand(obstacle.x+offset,obstacle.z,radius),canOccupy(obstacle.x+offset,obstacle.z,OBSTACLES,radius,BOUNDS));
  }
});
