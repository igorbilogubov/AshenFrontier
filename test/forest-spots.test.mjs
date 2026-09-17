import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero} from '../dist/world.js';
import {AFK_SPOTS as ALL_AFK_SPOTS,SPAWNS,MOB_TYPES,CAMP,stand,safe,distance,translate} from '../dist/public/game/location.js';
const AFK_SPOTS=ALL_AFK_SPOTS.slice(0,4);
import {AFK_TRAILS,afkSpotAt,withinSpot} from '../dist/public/game/afk.js';
import {CAMP_SPAWN} from '../dist/public/game/camp-layout.js';
import {WORLD_ROADS} from '../dist/public/game/world-layout.js';

test('the original route keeps its spawn ids and four disjoint hunting spots own twenty-four mobs',()=>{
  assert.deepEqual(SPAWNS.slice(0,7),[
    {type:'wolf',x:7.6,z:1.8},{type:'wolf',x:10.4,z:-4},{type:'boar',x:12.4,z:6.4},
    {type:'wolf',x:15.4,z:1.4},{type:'boar',x:18.2,z:-6.2},{type:'wolf',x:20.7,z:4.9},{type:'alpha',eliteId:'grey-alpha',x:25,z:-1.2},
  ]);
  assert.equal(SPAWNS.slice(0,41).length,41);assert.equal(AFK_SPOTS.length,4);
  assert.deepEqual(AFK_SPOTS[0].spawnIds.slice(0,6),[7,8,9,10,11,12]);
  assert.equal(AFK_SPOTS[0].spawnIds.length,12);assert.equal(AFK_SPOTS[0].radius,8.4);
  assert.deepEqual(AFK_SPOTS[1].spawnIds,[13,14,15,16,17,18]);
  assert.deepEqual(AFK_SPOTS[2].spawnIds,[19,20,21,22,23,24]);
  assert.equal(AFK_SPOTS[3].spawnIds.length,12);assert.deepEqual(AFK_SPOTS[3].spawnIds.slice(0,6),[25,26,27,28,29,30]);
  for(let i=0;i<AFK_SPOTS.length;i++)for(let j=i+1;j<AFK_SPOTS.length;j++)assert(distance(AFK_SPOTS[i],AFK_SPOTS[j])>AFK_SPOTS[i].radius+AFK_SPOTS[j].radius);
  for(const spot of AFK_SPOTS){
    assert(distance(spot,CAMP)>spot.radius+CAMP.r);
    for(const id of spot.spawnIds){
      const spawn=SPAWNS[id],radius=MOB_TYPES[spawn.type].radius;
      assert.equal(spawn.spotId,spot.id);assert(withinSpot(spawn,spot,-radius));
      assert(stand(spawn.x,spawn.z,radius));assert(!safe(spawn));
      // Every home can be reached from the centre with the largest mob's body,
      // including continuous swept collision, not only endpoint ray visibility.
      const actor={x:spot.x,z:spot.z};translate(actor,spawn.x-actor.x,spawn.z-actor.z,.46);
      assert(distance(actor,spawn)<1e-6,`${spot.id} home ${id} is obstructed`);
    }
  }
});

test('both branch trails and their approaches are continuously walkable from camp',()=>{
  const oldRoad=WORLD_ROADS.find(road=>road.id==='old-road');assert(oldRoad);
  for(const trail of AFK_TRAILS){
    const actor={...CAMP_SPAWN},main=oldRoad.points.filter(point=>point.x<=trail[0].x);
    for(const point of [...main,...trail]){
      translate(actor,point.x-actor.x,point.z-actor.z,.46);
      assert(distance(actor,point)<1e-6,`blocked at ${point.x}, ${point.z}`);
    }
    assert.equal(afkSpotAt(actor)?.id,afkSpotAt(trail.at(-1))?.id);
  }
});

test('spot selection rejects camp, malformed coordinates and outside positions',()=>{
  assert.equal(afkSpotAt(CAMP),null);assert.equal(afkSpotAt({x:NaN,z:0}),null);
  for(const spot of AFK_SPOTS){
    assert.equal(afkSpotAt(spot)?.id,spot.id);
    assert(!withinSpot({x:spot.x+spot.radius+.01,z:spot.z},spot));
    assert(withinSpot({x:spot.x+spot.radius+.1,z:spot.z},spot,.2));
    assert(!withinSpot(spot,spot,Infinity));
  }
});

test('new clustered mobs respawn at their own homes without duplicate rewards',()=>{
  const world=new World({random:()=>.99}),player=newHero('Лесной тест');world.add(player);
  for(const spot of AFK_SPOTS){
    Object.assign(player,{x:spot.x,z:spot.z});
    for(const id of spot.spawnIds){
      const mob=world.mobs[id];assert(world.hurtMob(player,mob,MOB_TYPES[mob.type].hp));
      assert.equal(mob.state,'dead');assert.equal(mob.timer,16);
      assert.equal(world.hurtMob(player,mob,999),false);
    }
  }
  assert.equal(player.kills,36);assert.equal(player.gold,0);
  assert.equal(world.snapshot(player.id).groundLoot.filter(drop=>drop.kind==='gold').reduce((sum,drop)=>sum+drop.amount,0),18*8+18*12);
  world.remove(player.id);
  for(let i=0;i<320;i++)world.tick(.05);
  // Allow a floating-point timer remainder to expire, without a patrol step.
  for(const spot of AFK_SPOTS)for(const id of spot.spawnIds){
    const mob=world.mobs[id];if(mob.state==='dead')world.tick(.00001);
    assert.equal(mob.state,'idle');assert.equal(mob.hp,MOB_TYPES[mob.type].hp);
    assert(distance(mob,SPAWNS[id])<.001);assert.equal(mob.spotId,spot.id);
  }
  assert.equal(player.kills,36);assert.equal(player.gold,0);
});

test('each ordinary species has exactly one large twelve-creature hunting pack',()=>{
  const large=ALL_AFK_SPOTS.filter(spot=>spot.spawnIds.length===12&&!String(spot.id).startsWith('stadium'));
  assert.equal(large.length,27);assert(large.every(spot=>spot.radius===8.4));
  assert.equal(new Set(large.map(spot=>SPAWNS[spot.spawnIds[0]].type)).size,27);
  for(const spot of large){
    const types=new Set(spot.spawnIds.map(id=>SPAWNS[id].type));
    assert.equal(types.size,1);
    for(const id of spot.spawnIds){
      const spawn=SPAWNS[id],radius=MOB_TYPES[spawn.type].radius;
      assert.equal(spawn.spotId,spot.id);assert(withinSpot(spawn,spot,-radius));assert(stand(spawn.x,spawn.z,radius));
    }
  }
});

