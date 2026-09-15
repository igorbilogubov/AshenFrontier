import test from 'node:test';
import assert from 'node:assert/strict';
import {heldMouseInput} from '../dist/public/game/mouse-input.js';
import {moveHero} from '../dist/public/game/location.js';
import {CAMP_SPAWN} from '../dist/public/game/camp-layout.js';

const hero=()=>({...CAMP_SPAWN,yaw:.75,targetYaw:.75,vx:0,vz:0,gait:0,runBlend:0,moveBlend:0,running:false,attack:null,dead:0});
test('hover and a released press cannot move or turn an idle hero, even with an old enemy target',()=>{
  const p=hero(),before={x:p.x,z:p.z,yaw:p.yaw};
  for(let n=0;n<120;n++)moveHero(p,1/60,heldMouseInput(p,{x:Math.sin(n)*10,z:Math.cos(n)*10},{target:{x:8,z:2}}));
  assert.deepEqual({x:p.x,z:p.z,yaw:p.yaw},before);
});
test('held steering follows the current cursor direction and has normalized speed in every direction',()=>{
  const p=hero();
  for(const [x,z] of [[4,0],[-4,0],[0,4],[3,-3]]){
    const input=heldMouseInput(p,{x:p.x+x,z:p.z+z},{held:true});
    assert(Math.abs(Math.hypot(input.x,input.z)-1)<1e-12);
    assert.equal(input.aim,Math.atan2(x,z));assert.equal(input.attack,false);
  }
  const first=heldMouseInput(p,{x:5,z:2},{held:true}),next=heldMouseInput(p,{x:-5,z:2},{held:true});
  assert(first.x>0&&next.x<0);
});
test('releasing a held walk settles instead of continuing toward the last cursor point',()=>{
  const p=hero();
  for(let n=0;n<45;n++)moveHero(p,1/60,heldMouseInput(p,{x:p.x+5,z:p.z},{held:true}));
  const releasedX=p.x;assert(releasedX>.5);
  for(let n=0;n<60;n++)moveHero(p,1/60,heldMouseInput(p,{x:30,z:10}));
  assert(p.x-releasedX<.3);assert.equal(p.vx,0);assert.equal(p.vz,0);
  const settled={x:p.x,z:p.z,yaw:p.yaw};
  for(let n=0;n<60;n++)moveHero(p,1/60,heldMouseInput(p,{x:-30,z:-10}));
  assert.equal(p.x,settled.x);assert.equal(p.z,settled.z);
  // The previous turn eases to its final heading; hover must not create a new one.
  assert(Math.abs(p.yaw-settled.yaw)<1e-8);
});
test('deadzone slows close steering and invalid pointers or death cannot issue movement',()=>{
  const p=hero();
  assert.deepEqual(heldMouseInput(p,{x:p.x+.05,z:p.z},{held:true}),{x:0,z:0,aim:null,attack:false});
  assert(heldMouseInput(p,{x:p.x+.3,z:p.z},{held:true}).x<.3);
  for(const point of [null,{x:NaN,z:2},{x:4,z:Infinity}])assert.equal(heldMouseInput(p,point,{held:true}).x,0);
  p.dead=1;assert.equal(heldMouseInput(p,{x:8,z:2},{held:true}).aim,null);
});
test('left steering over an enemy only follows the cursor and never attacks or chases the enemy',()=>{
  const p=hero(),point={x:8,z:2},target={x:2,z:2};
  const near=heldMouseInput(p,point,{held:true,target,reach:5.5});assert.equal(near.attack,false);assert(near.x>0);
  const camp=heldMouseInput(p,point,{held:true,target,reach:5.5,inCamp:true});assert(!camp.attack);assert(camp.x>0);
  assert(!heldMouseInput(p,point,{target,reach:5.5}).attack);
  const overlap=heldMouseInput(p,point,{held:true,target:{x:p.x,z:p.z},reach:1.45});assert.equal(overlap.attack,false);assert.equal(overlap.aim,Math.atan2(point.x-p.x,point.z-p.z));assert(overlap.x>0);
});
