import test from 'node:test';
import assert from 'node:assert/strict';
import {MouseWalk} from '../dist/public/game/mouse-walk.js';
import {World,newHero} from '../dist/world.js';

function fixture(){
  const world=new World(),hero=newHero();world.add(hero);world.mobs=[];Object.assign(hero,{x:8,z:2});
  const mouse=new MouseWalk();let seq=0;
  const frame=(point,now)=>{
    const {takeover,input}=mouse.sample(hero,point,now);
    if(takeover)world.command(hero,{type:'cancelInteraction'});
    world.command(hero,{type:'input',...input,seq:++seq});world.tick(.05);
  };
  return {world,hero,mouse,frame};
}

test('a short ground click keeps its server route after release and later hovering cannot redirect it',()=>{
  const {world,hero,mouse,frame}=fixture();mouse.press(0);world.command(hero,{type:'moveTo',target:{x:14,z:2}});
  frame({x:14,z:2},50);frame({x:14,z:2},100);assert.equal(mouse.release(),false);
  for(let i=0;i<100;i++)frame({x:8,z:7},150+i*50);
  assert(Math.hypot(hero.x-14,hero.z-2)<.2);assert.equal(hero.navigation,undefined);
});

test('holding takes over a route, follows cursor changes and stops on release without resuming that route',()=>{
  const {world,hero,mouse,frame}=fixture();mouse.press(0);world.command(hero,{type:'moveTo',target:{x:14,z:2}});
  for(let i=0;i<20;i++)frame({x:hero.x+5,z:hero.z},i*50);
  assert(hero.x>9);assert.equal(hero.navigation,undefined);const turnedAt=hero.z;
  for(let i=20;i<35;i++)frame({x:hero.x,z:hero.z+5},i*50);
  assert(hero.z>turnedAt+1);assert.equal(mouse.release(),true);
  for(let i=35;i<45;i++)frame({x:14,z:2},i*50);
  const stopped={x:hero.x,z:hero.z};
  for(let i=45;i<80;i++)frame({x:14,z:2},i*50);
  assert.deepEqual({x:hero.x,z:hero.z},stopped);assert.equal(hero.navigation,undefined);assert.equal(hero.attackSerial,0);
});

test('held cursor deadzone, invalid positions and death cannot steer, and a new press starts as a click',()=>{
  const mouse=new MouseWalk(),hero={x:8,z:2,dead:0};mouse.press(0);
  assert(mouse.sample(hero,hero,200).takeover);
  for(const point of [hero,null,{x:NaN,z:2},{x:8,z:Infinity}])assert.deepEqual(mouse.sample(hero,point,250).input,{x:0,z:0,aim:null});
  assert.deepEqual(mouse.sample({...hero,dead:1},{x:12,z:2},300).input,{x:0,z:0,aim:null});
  const diagonal=mouse.sample(hero,{x:12,z:6},350).input;assert(Math.abs(Math.hypot(diagonal.x,diagonal.z)-1)<1e-12);
  mouse.release();mouse.press(400);assert.deepEqual(mouse.sample(hero,{x:12,z:2},450),{takeover:false,input:{x:0,z:0,aim:null}});
});
