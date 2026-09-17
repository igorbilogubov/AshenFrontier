import test from 'node:test';
import assert from 'node:assert/strict';
import {LATE_REGIONS,LATE_MOB_TYPES,LATE_SPAWNS,LATE_PASSAGES,lateRoadDistance,lateSafe,lateRegionAt} from '../dist/public/game/late-world.js';
import {SPAWNS} from '../dist/public/game/location.js';
import {canOccupy} from '../dist/public/game/motion.js';
test('late ordinary damage continues the wasteland curve without an entry spike',()=>{
 assert.deepEqual(Object.values(LATE_MOB_TYPES).map(m=>m.damage),[34,38,42,46,46,50,55,60,60,66,72,78,78,86,94,102]);
 assert.deepEqual(Object.values(LATE_MOB_TYPES).map(m=>m.level),[40,44,49,54,55,59,64,69,70,74,79,84,85,89,94,99]);
});
test('four large regions keep 328 independent spawn identities and reachable safe arrivals',()=>{
 assert.deepEqual(LATE_REGIONS.map(r=>r.minLevel),[40,55,70,85]);assert.equal(LATE_SPAWNS.length,328);const ids=[];
 for(const r of LATE_REGIONS){assert.equal((r.bounds.maxX-r.bounds.minX)*(r.bounds.maxZ-r.bounds.minZ),32400);assert.equal(r.spawns.length,82);assert.equal(r.spots.length,8);assert.equal(r.spawns.filter(s=>s.eliteId).length,2);assert.equal(r.spawns.filter(s=>!s.spotId&&!s.eliteId).length,32);assert.equal(new Set(r.spawns.map(s=>s.type)).size,4);assert(lateSafe(r.entry));assert.equal(lateRegionAt(r.entry).id,r.id);assert(canOccupy(r.entry.x,r.entry.z,r.obstacles,.3,r.bounds));
  for(const spot of r.spots){assert.equal(spot.spawnIds.length,spot.radius>6?12:6);ids.push(...spot.spawnIds);for(const id of spot.spawnIds)assert.equal(SPAWNS[id].spotId,spot.id);}
  for(const s of r.spawns){assert(canOccupy(s.x,s.z,r.obstacles,LATE_MOB_TYPES[s.type].radius,r.bounds),`${r.id} ${s.type} blocked spawn`);assert(!lateSafe(s));}
 }
 assert.equal(new Set(ids).size,288);
});
test('map routes and dungeon entrances have no invisible obstructions',()=>{
 for(const r of LATE_REGIONS){assert(lateRoadDistance(r,r.dungeonEntrance.x,r.dungeonEntrance.z)<0);assert(canOccupy(r.dungeonEntrance.x,r.dungeonEntrance.z,r.obstacles,.5,r.bounds));
  for(const road of r.roads)for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)*3);for(let k=0;k<=n;k++){const x=a.x+(b.x-a.x)*k/n,z=a.z+(b.z-a.z)*k/n;assert(canOccupy(x,z,r.obstacles,.3,r.bounds),`${r.id} ${road.id} route collision`);}}
 }
 assert.equal(new Set(LATE_PASSAGES.map(p=>p.id)).size,8);
 for(const p of LATE_PASSAGES){const destination=LATE_REGIONS.find(r=>lateRegionAt(p.destination)?.id===r.id);if(destination)assert(canOccupy(p.destination.x,p.destination.z,destination.obstacles,.3,destination.bounds));assert(LATE_PASSAGES.every(t=>Math.hypot(t.x-p.destination.x,t.z-p.destination.z)>t.range+.3),'arrival retriggers transition');}
});
test('inactive late environments are hidden and static geometry stays batched',async()=>{
 const T=await import('../dist/public/game/vendor/three.module.js'),{createLateWorldEnvironment}=await import('../dist/public/game/late-world-environment.js');const scene=new T.Scene(),env=createLateWorldEnvironment(scene);assert.equal(env.roots.size,4);
 for(const r of LATE_REGIONS){env.updateRegion(r.id);assert.equal([...env.roots.values()].filter(g=>g.visible).length,1);let draws=0,triangles=0;env.roots.get(r.id).traverse(o=>{if(o.isMesh){draws++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});assert(draws<=12,`${r.id}: ${draws} unbatched draw calls`);assert(triangles<150000,`${r.id}: ${triangles} triangles`);env.update(.016);}
 env.updateRegion('forest');assert([...env.roots.values()].every(g=>!g.visible));env.dispose();assert.equal(scene.children.length,0);
});
