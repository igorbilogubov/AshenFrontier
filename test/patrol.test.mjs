import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero} from '../dist/world.js';
import {locationAt} from '../dist/public/game/world-layout.js';
import {LATE_REGIONS} from '../dist/public/game/late-world.js';
import {MOB_TYPES,stand,safe} from '../dist/public/game/location.js';

test('undisturbed animals walk in sustained bouts and rest, without tick-by-tick Walk/Idle flicker',()=>{
  const world=new World();world.mobs=world.mobs.filter(m=>!m.dungeonId);
  for(const point of [{x:.5,z:4},{x:160,z:15},{x:266,z:8},{x:526,z:0},...LATE_REGIONS.map(r=>r.entry)]){const observer=newHero(`Observer ${locationAt(point)}`);Object.assign(observer,point,{level:100});world.add(observer);}
  const samples=new Map(world.mobs.map(m=>[m.id,{moving:false,ticks:0,walks:[],rests:[],changes:0}]));
  for(let tick=0;tick<2400;tick++){
    world.tick(.05);
    for(const mob of world.mobs){
      const s=samples.get(mob.id),moving=mob.speed>.03;
      if(s.moving!==moving){(s.moving?s.walks:s.rests).push(s.ticks*.05);s.ticks=0;s.changes++;}
      s.ticks++;s.moving=moving;
      assert.equal(mob.state,'idle');assert(stand(mob.x,mob.z,MOB_TYPES[mob.type].radius));assert(!safe(mob));
      assert(Math.hypot(mob.x-mob.homeX,mob.z-mob.homeZ)<2.2,'patrol left its home area');
    }
  }
  for(const mob of world.mobs){
    const s=samples.get(mob.id);
    assert(s.walks.length>=5,`animal ${mob.type}#${mob.id} in ${locationAt(mob)} did not patrol: ${s.walks.length}`);
    assert(s.walks.every(seconds=>seconds>=1),'short movement bursts make the walk clip flicker');
    assert(s.rests.every(seconds=>seconds>=.5),'pauses must be visible, not single-tick stops');
    assert(s.changes/2<30,'too many Walk/Idle transitions per minute');
  }
});

test('patrol yields immediately to pursuit, keeps combat speed, and clears its route on respawn',()=>{
  const world=new World(),mob=world.mobs[0];world.mobs=[mob];world.add(newHero('Safe observer'));
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

test('empty regions suspend movement until an observer arrives without losing creature state',()=>{const w=new World(),m=w.mobs[0],start={x:m.x,z:m.z,hp:m.hp};for(let i=0;i<200;i++)w.tick(.05);assert.deepEqual({x:m.x,z:m.z,hp:m.hp},start);assert.equal(m.speed,0);w.add(newHero('Observer'));for(let i=0;i<300&&!m.patrol?.goal;i++)w.tick(.05);assert(m.patrol?.goal);});
