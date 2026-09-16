import test from 'node:test';
import assert from 'node:assert/strict';
import {minimapMarkers} from '../dist/public/game/minimap.js';
import {minimapProjection} from '../dist/public/game/minimap-world.js';
import {DUNGEONS} from '../dist/public/game/dungeons.js';
import {LATE_REGIONS} from '../dist/public/game/late-world.js';
import {ALL_PORTALS} from '../dist/public/game/stadium.js';
import {AFK_SPOTS} from '../dist/public/game/afk.js';
import {boundsForPosition, sameLocation} from '../dist/public/game/world-layout.js';

const positions=[{x:0,z:0},{x:160,z:0},{x:330,z:0},{x:530,z:0},...LATE_REGIONS.map(r=>r.entry),...DUNGEONS.map(d=>d.entry)];

test('minimap hides ordinary mobs, dead elites and actors from other regions',()=>{
  const mobs=[
    {x:12,z:5,state:'idle'},
    {x:25,z:0,state:'idle',eliteId:'grey-alpha'},
    {x:-20,z:-15,state:'dead',eliteId:'elder-bear'},
    {x:330,z:0,state:'idle',eliteId:'frost-matriarch'},
  ];
  const enemies=minimapMarkers({x:0,z:0},mobs).filter(m=>m.kind==='elite'||m.kind==='boss');
  assert.equal(enemies.length,1);
  assert.equal(enemies[0].x,25);
  const dungeon=DUNGEONS[0];
  assert.equal(minimapMarkers(dungeon.entry,[{...dungeon.boss,state:'idle',bossId:dungeon.id}]).filter(m=>m.kind==='boss').length,1);
});

test('all field, stadium and dungeon routes/spots come from the shared world definitions',()=>{
  for(const position of positions){
    const markers=minimapMarkers(position,[]);
    for(const portal of ALL_PORTALS.filter(p=>sameLocation(p,position))){
      const marker=markers.find(m=>m.id===portal.id);
      assert.ok(marker,`missing ${portal.id}`);
      assert.equal(marker.kind,portal.id.includes('dungeon')?'dungeon':portal.id.includes('stadium')?'stadium':'passage');
    }
    assert.equal(markers.filter(m=>m.kind==='spot').length,AFK_SPOTS.filter(s=>sameLocation(s,position)).length);
  }
});

test('projection preserves world distances and leaves every region corner inside the canvas',()=>{
  for(const position of positions){
    const p=minimapProjection(300,190,position),b=boundsForPosition(position);
    const low=p.at({x:b.minX,z:b.minZ}),high=p.at({x:b.maxX,z:b.maxZ});
    assert.ok(low.x>=14&&low.y>=14);
    assert.ok(high.x<=286&&high.y<=176);
    const origin=p.at(position),east=p.at({x:position.x+1,z:position.z}),south=p.at({x:position.x,z:position.z+1});
    assert.ok(Math.abs((east.x-origin.x)-(south.y-origin.y))<1e-10);
  }
});
