import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero} from '../dist/world.js';

test('online roster is global, contains only connected heroes and exposes its minimal public shape',()=>{
  const world=new World(),forest=newHero('Лесной дозор','warrior'),snow=newHero('Снежная тень','mage'),resident=newHero('Отключённый','archer');
  forest.level=12;Object.assign(snow,{level:27,x:288,z:-12});Object.assign(resident,{level:99,x:548,z:-22,connected:false});
  world.add(forest);world.add(snow);world.add(resident);resident.connected=false;

  const roster=world.snapshot(forest.id).onlinePlayers;
  assert.deepEqual(roster,[
    {id:forest.id,name:'Лесной дозор',classId:'warrior',level:12,location:'forest'},
    {id:snow.id,name:'Снежная тень',classId:'mage',level:27,location:'snow'},
  ]);
  for(const player of roster)assert.deepEqual(Object.keys(player).sort(),['classId','id','level','location','name']);
});

test('online roster resolves a connected hero location from their current position',()=>{
  const world=new World(),viewer=newHero('Наблюдатель'),traveler=newHero('Путник','archer');
  world.add(viewer);world.add(traveler);
  Object.assign(traveler,{x:528,z:0,level:25});

  assert.equal(world.snapshot(viewer.id).onlinePlayers.find(player=>player.id===traveler.id)?.location,'wasteland');
});
