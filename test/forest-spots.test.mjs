import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero} from '../dist/world.js';
import {AFK_SPOTS,SPAWNS,MOB_TYPES,CAMP,stand,safe,distance,translate} from '../dist/public/game/location.js';
import {AFK_TRAILS,afkSpotAt,withinSpot} from '../dist/public/game/afk.js';

test('the original route keeps its spawn ids and four disjoint hunting spots own twenty-four mobs',()=>{
  assert.deepEqual(SPAWNS.slice(0,7),[
    {type:'wolf',x:7.6,z:1.8},{type:'wolf',x:10.4,z:-4},{type:'boar',x:12.4,z:6.4},
    {type:'wolf',x:15.4,z:1.4},{type:'boar',x:18.2,z:-6.2},{type:'wolf',x:20.7,z:4.9},{type:'alpha',x:25,z:-1.2},
  ]);
  assert.equal(SPAWNS.length,41);assert.equal(AFK_SPOTS.length,4);
  for(let i=0;i<AFK_SPOTS.length;i++)for(let j=i+1;j<AFK_SPOTS.length;j++)assert(distance(AFK_SPOTS[i],AFK_SPOTS[j])>AFK_SPOTS[i].radius+AFK_SPOTS[j].radius);
  assert.deepEqual(AFK_SPOTS.flatMap(spot=>spot.spawnIds),Array.from({length:24},(_,i)=>i+7));
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
  for(const trail of AFK_TRAILS){
    const actor={x:.5,z:2},main=[];
    for(let x=1;x<trail[0].x;x+=.2)main.push({x,z:1+Math.sin(x*.25)*.9});
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
  const world=new World({random:()=>0}),player=newHero('Лесной тест');world.add(player);
  for(const spot of AFK_SPOTS){
    Object.assign(player,{x:spot.x,z:spot.z});
    for(const id of spot.spawnIds){
      const mob=world.mobs[id];assert(world.hurtMob(player,mob,MOB_TYPES[mob.type].hp));
      assert.equal(mob.state,'dead');assert.equal(mob.timer,16);
      assert.equal(world.hurtMob(player,mob,999),false);
    }
  }
  assert.equal(player.kills,24);assert.equal(player.gold,0);
  assert.equal(world.snapshot(player.id).groundLoot.filter(drop=>drop.kind==='gold').reduce((sum,drop)=>sum+drop.amount,0),12*8+12*12);
  world.remove(player.id);
  for(let i=0;i<320;i++)world.tick(.05);
  // Allow a floating-point timer remainder to expire, without a patrol step.
  for(const spot of AFK_SPOTS)for(const id of spot.spawnIds){
    const mob=world.mobs[id];if(mob.state==='dead')world.tick(.00001);
    assert.equal(mob.state,'idle');assert.equal(mob.hp,MOB_TYPES[mob.type].hp);
    assert(distance(mob,SPAWNS[id])<.001);assert.equal(mob.spotId,spot.id);
  }
  assert.equal(player.kills,24);assert.equal(player.gold,0);
});
