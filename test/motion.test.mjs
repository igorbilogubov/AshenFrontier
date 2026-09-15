import test from 'node:test';
import assert from 'node:assert/strict';
import {turnTowards,angleDelta,inStrike,screenDirection,canOccupy} from '../dist/public/game/motion.js';

test('360-degree aim crosses north by two degrees, without a full spin',()=>{
  const from=359*Math.PI/180,to=Math.PI/180,result=turnTowards(from,to,1/60);
  assert.ok(result>from);assert.ok(result<from+2*Math.PI/180);
  let yaw=from;for(let i=0;i<60;i++)yaw=turnTowards(yaw,to,1/60);
  assert.ok(Math.abs(angleDelta(yaw,to))<.00001);
});
test('strike follows any heading, excluding a target behind or beyond the weapon',()=>{
  for(const yaw of [0,.31,1.72,Math.PI,4.83,6.2]){
    const origin={x:3,z:-4},target={x:3+Math.sin(yaw)*1.4,z:-4+Math.cos(yaw)*1.4};
    assert.equal(inStrike(origin,target,yaw,1.85),true);
    assert.equal(inStrike(origin,target,yaw+Math.PI,1.85),false);
    assert.equal(inStrike(origin,target,yaw,1.0),false);
  }
});
test('screen-relative movement follows rotated camera and does not speed up diagonally',()=>{
  const up=screenDirection(0,-1,Math.PI/2);assert.ok(Math.abs(up.x+1)<1e-8);assert.ok(Math.abs(up.z)<1e-8);
  const diagonal=screenDirection(1,-1,.55);assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.z)-1)<1e-8);
});
test('warrior cannot occupy the fire, the hut, a dummy or leave the scene',()=>{
  const obstacles=[{x:-2.3,z:-.6,r:1.02},{x:-5,z:-4.6,w:4.8,d:4},{x:3.5,z:1,r:.35}];
  for(const p of [[-2.3,-.6],[-5,-4.6],[3.5,1],[11,0]])assert.equal(canOccupy(...p,obstacles),false);
  assert.equal(canOccupy(.5,2,obstacles),true);
});
