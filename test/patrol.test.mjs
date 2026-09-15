import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero} from '../dist/world.js';
import {MOB_TYPES,stand,safe} from '../dist/public/game/location.js';

test('undisturbed animals walk in sustained bouts and rest, without tick-by-tick Walk/Idle flicker',()=>{
  const world=new World(),samples=world.mobs.map(()=>({moving:false,ticks:0,walks:[],rests:[],changes:0}));
  for(let tick=0;tick<2400;tick++){
    world.tick(.05);
    for(const mob of world.mobs){
      const s=samples[mob.id],moving=mob.speed>.03;
      if(s.moving!==moving){(s.moving?s.walks:s.rests).push(s.ticks*.05);s.ticks=0;s.changes++;}
      s.ticks++;s.moving=moving;
      assert.equal(mob.state,'idle');assert(stand(mob.x,mob.z,MOB_TYPES[mob.type].radius));assert(!safe(mob));
      assert(Math.hypot(mob.x-mob.homeX,mob.z-mob.homeZ)<2.2,'patrol left its home area');
    }
  }
  for(const s of samples){
    assert(s.walks.length>=5,'animal did not patrol');
    assert(s.walks.every(seconds=>seconds>=1),'short movement bursts make the walk clip flicker');
    assert(s.rests.every(seconds=>seconds>=.5),'pauses must be visible, not single-tick stops');
    assert(s.changes/2<30,'too many Walk/Idle transitions per minute');
  }
});

test('patrol yields immediately to pursuit, keeps combat speed, and clears its route on respawn',()=>{
  const world=new World(),mob=world.mobs[0];world.mobs=[mob];
  for(let i=0;i<300&&(!mob.patrol?.goal||mob.speed<.1);i++)world.tick(.05);
  assert(mob.patrol.goal);
  const player=newHero('Следопыт');Object.assign(player,{x:mob.x+2.5,z:mob.z});world.add(player);
  world.tick(.05);assert.equal(mob.state,'chase');assert.equal(mob.target,player.id);
  assert.equal(mob.patrol.goal,null);assert(Math.abs(mob.speed-MOB_TYPES.wolf.speed)<1e-6);
  assert(!Object.hasOwn(world.snapshot(player.id).mobs[0],'patrol'),'private patrol planning must not leak into snapshots');
  world.remove(player.id);Object.assign(mob,{state:'dead',timer:.02,hp:0});world.tick(.05);
  assert.equal(mob.state,'idle');assert.equal(mob.patrol,null);assert.equal(mob.x,mob.homeX);
  world.tick(.05);assert(mob.patrol.pause>0);assert.equal(mob.speed,0);
});
