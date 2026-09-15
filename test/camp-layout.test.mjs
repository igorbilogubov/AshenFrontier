import test from 'node:test';
import assert from 'node:assert/strict';
import {stand,clearPath,safe} from '../dist/public/game/location.js';
import {CAMP_FIRE,CAMP_SPAWN,CAMP_FENCES} from '../dist/public/game/camp-layout.js';
import {World,newHero} from '../dist/world.js';

test('camp boundary leaves four road gates and open house doorway',()=>{
  assert(safe(CAMP_SPAWN));assert(stand(CAMP_SPAWN.x,CAMP_SPAWN.z));
  assert(!stand(CAMP_FIRE.x,CAMP_FIRE.z));
  assert(clearPath({x:-5.65,z:-1.5},{x:-5.65,z:-4.4}));
  assert(!clearPath({x:-3,z:-1.5},{x:-3,z:-4.4}));
  for(const point of [{x:-9,z:5},{x:5.6,z:2},{x:0,z:-8},{x:0,z:7}])assert(stand(point.x,point.z),`open gate ${JSON.stringify(point)}`);
  for(const fence of CAMP_FENCES)assert(!stand(fence.x,fence.z));
});

test('chest is personal, accessible through door and closes on leaving room',()=>{
  const world=new World(),hero=newHero('Дом');world.add(hero);world.mobs=[];
  world.command(hero,{type:'interact',npcId:'camp-chest'});
  for(let i=0;i<600&&!hero.stashActive;i++)world.tick(.05);
  assert(hero.stashActive);assert(safe(hero));assert(stand(hero.x,hero.z));
  assert(world.snapshot(hero.id).events.some(e=>e.type==='stashOpened'));
  Object.assign(hero,CAMP_SPAWN);world.tick(.05);assert.equal(hero.stashActive,false);
});
