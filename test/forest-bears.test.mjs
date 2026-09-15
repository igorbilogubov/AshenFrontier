import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,stats} from '../dist/world.js';
import {AFK_SPOTS,SPAWNS,MOB_TYPES,stand,safe,withinSpot,translate,distance} from '../dist/public/game/location.js';
import {WORLD_ROADS} from '../dist/public/game/world-layout.js';

const bearSpot=AFK_SPOTS.find(spot=>spot.id==='bear-grove');

test('six forest bears own stable appended ids in a separate accessible AFK ring',()=>{
  assert(bearSpot);
  assert.deepEqual(bearSpot.spawnIds,[83,84,85,86,87,88]);
  assert.equal(MOB_TYPES.bear.radius,.62);
  assert(MOB_TYPES.bear.hp>MOB_TYPES.boar.hp&&MOB_TYPES.bear.hp<MOB_TYPES.alpha.hp);
  assert(MOB_TYPES.bear.damage>MOB_TYPES.boar.damage&&MOB_TYPES.bear.damage<MOB_TYPES.alpha.damage);
  for(const other of AFK_SPOTS.filter(spot=>spot.id!==bearSpot.id))assert(distance(bearSpot,other)>bearSpot.radius+other.radius);
  const approach=WORLD_ROADS.find(road=>road.id==='bear-approach');assert(approach);
  const actor={x:-27,z:-12};
  for(const waypoint of approach.points.slice(1)){
    translate(actor,waypoint.x-actor.x,waypoint.z-actor.z,.62);
    assert(distance(actor,waypoint)<1e-6,`bear approach blocked at ${waypoint.x},${waypoint.z}`);
  }
  assert(distance(actor,bearSpot)<1e-6);
  for(const id of bearSpot.spawnIds){
    const home=SPAWNS[id];assert.equal(home.type,'bear');assert.equal(home.spotId,bearSpot.id);
    assert(withinSpot(home,bearSpot,-MOB_TYPES.bear.radius));assert(stand(home.x,home.z,.62));assert(!safe(home));
    const mover={x:bearSpot.x,z:bearSpot.z};translate(mover,home.x-mover.x,home.z-mover.z,.62);
    assert(distance(mover,home)<1e-6,`bear home ${id} blocked from spot centre`);
  }
});

test('bear grove online AFK keeps the hero in its ring and collects allowed rewards',()=>{
  const world=new World({random:()=>0}),hero=newHero('Медвежья чаща','warrior');world.add(hero);
  Object.assign(hero,{x:bearSpot.x,z:bearSpot.z,level:35});hero.hp=stats(hero).maxHp;hero.mana=stats(hero).maxMana;
  world.mobs=world.mobs.filter(mob=>mob.spotId===bearSpot.id);
  assert(world.startAfk(hero));
  for(let i=0;i<900&&hero.afk;i++){
    world.tick(.05);assert(withinSpot(hero,bearSpot,-.46));assert(stand(hero.x,hero.z));
  }
  assert(hero.kills>0);assert(hero.gold>0);assert.equal(hero.questKills,0);
  assert(hero.afk,'automatic collection does not cancel an active hunt');
});
