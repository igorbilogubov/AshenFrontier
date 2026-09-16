import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero} from '../dist/world.js';
import {DUNGEONS} from '../dist/public/game/dungeons.js';
import {LATE_REGIONS} from '../dist/public/game/late-world.js';
import {SNOW_ENTRY} from '../dist/public/game/snow.js';
import {WASTELAND_ENTRY} from '../dist/public/game/wasteland.js';
import {CAMP_SPAWN} from '../dist/public/game/camp-layout.js';
import {STADIUM_HUB} from '../dist/public/game/stadium.js';
import {locationAt} from '../dist/public/game/world-layout.js';

test('snapshots follow coordinate changes immediately, including dungeon and field transfers between ticks',()=>{
  const w=new World(),p=newHero('Spatial QA');p.level=100;w.add(p);
  const points=[CAMP_SPAWN,STADIUM_HUB,SNOW_ENTRY,WASTELAND_ENTRY,...LATE_REGIONS.map(r=>r.entry),...DUNGEONS.map(d=>d.entry)];
  // Reuse the same hero and mob objects: neither the position cache nor an
  // index based on a spawn's original region may leak entities across maps.
  for(const point of [...points,...points.toReversed()]){
    Object.assign(p,point);
    const expected=w.mobs.filter(m=>locationAt(m)===locationAt(p)).map(m=>m.id);
    assert.deepEqual(w.snapshot(p.id).mobs.map(m=>m.id),expected,locationAt(p));
  }
  const m=w.mobs[0];w.snapshot(p.id);
  Object.assign(m,DUNGEONS[0].boss);assert(!w.snapshot(p.id).mobs.some(other=>other.id===m.id));
  Object.assign(p,DUNGEONS[0].entry);assert(w.snapshot(p.id).mobs.some(other=>other.id===m.id));
  Object.assign(m,CAMP_SPAWN);assert(!w.snapshot(p.id).mobs.some(other=>other.id===m.id));
});

test('protection immediately follows both coordinates for a hero and an existing attack target',()=>{
  const w=new World({random:()=>0}),p=newHero('Safe boundary QA');w.add(p);
  const m=w.mobs[0];w.mobs=[m];Object.assign(m,{x:8,z:1.8,hp:10000});
  // Warm the protected result, then cross the open east gate without a tick.
  Object.assign(p,{x:4.9,z:1.8});assert.equal(w.hurtMob(p,m,1),false);
  p.x=7.6;assert.equal(w.hurtMob(p,m,1),true);
  // Moving only Z must also invalidate protection at the southern gate.
  Object.assign(p,{x:0,z:6.5});assert.equal(w.hurtMob(p,m,1),false);
  p.z=8;Object.assign(m,{x:0,z:9});assert.equal(w.hurtMob(p,m,1),true);
  m.z=6.5;assert.equal(w.hurtMob(p,m,1),false);
  m.z=9;assert.equal(w.hurtMob(p,m,1),true);
  p.z=6.5;assert.equal(w.hurtMob(p,m,1),false);
});
