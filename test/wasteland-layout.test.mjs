import test from 'node:test';
import assert from 'node:assert/strict';
import {WASTELAND_BOUNDS as B,WASTELAND_ENTRY,WASTELAND_SPOTS,WASTELAND_SPAWNS,WASTELAND_ROADS,WASTELAND_PASSAGES,WASTELAND_TREES} from '../dist/public/game/wasteland.js';
import {SPAWNS,mobConfig,stand,safe,clearPath} from '../dist/public/game/location.js';
import {locationAt,sameLocation} from '../dist/public/game/world-layout.js';
import {portalById} from '../dist/public/game/stadium.js';
test('wasteland is large open territory with four species, packs, singles and independent IDs',()=>{
 assert.equal((B.maxX-B.minX)*(B.maxZ-B.minZ),25600);assert.equal(WASTELAND_SPAWNS.length,98);assert.equal(WASTELAND_SPOTS.length,8);assert.equal(WASTELAND_SPAWNS.filter(s=>!s.spotId&&!s.eliteId).length,48);assert.equal(new Set(WASTELAND_SPAWNS.map(s=>s.type)).size,4);
 assert.equal(SPAWNS.filter(s=>['forest','stadium','snow','wasteland'].includes(locationAt(s))).length,292);assert.equal(SPAWNS[193].eliteId,'glacier-warden');assert.equal(SPAWNS[290].eliteId,'obsidian-stinger');assert.equal(SPAWNS[291].eliteId,'sun-devourer');
 for(const spawn of WASTELAND_SPAWNS){assert(stand(spawn.x,spawn.z,mobConfig(spawn).radius),JSON.stringify(spawn));assert(!safe(spawn));assert.equal(locationAt(spawn),'wasteland');}
 for(const spot of WASTELAND_SPOTS)for(const id of spot.spawnIds)assert.equal(SPAWNS[id].spotId,spot.id);
 for(const road of WASTELAND_ROADS)for(let i=1;i<road.points.length;i++)assert(clearPath(road.points[i-1],road.points[i]),road.id);
 for(const tree of WASTELAND_TREES)assert(!stand(tree.x,tree.z));
});
test('wasteland passages use safe separated arrival, correct gate and unwalkable region gaps',()=>{
 assert(safe(WASTELAND_ENTRY));assert(stand(WASTELAND_ENTRY.x,WASTELAND_ENTRY.z));assert(!sameLocation(WASTELAND_ENTRY,{x:433,z:12}));
 for(const gate of WASTELAND_PASSAGES){assert.equal(portalById(gate.id),gate);assert(stand(gate.x,gate.z));assert(stand(gate.destination.x,gate.destination.z));}
 assert.equal(WASTELAND_PASSAGES[0].minLevel,25);assert.equal(WASTELAND_PASSAGES[1].minLevel,1);
 assert(Math.hypot(WASTELAND_ENTRY.x-WASTELAND_PASSAGES[1].x,WASTELAND_ENTRY.z)>WASTELAND_PASSAGES[1].range);
 for(let x=441;x<520;x++)assert(!stand(x,0));
});
