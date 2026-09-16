import test from 'node:test';
import assert from 'node:assert/strict';
import {NetworkGame} from '../dist/public/game/network.js';
import {SKILLS} from '../dist/public/game/skills.js';
import {World,newHero,stats} from '../dist/world.js';

function browserGame(t){
  const globals={location:{search:'',origin:'http://localhost'},localStorage:{},WebSocket:{OPEN:1}};
  const descriptors=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  t.after(()=>{for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  const game=new NetworkGame(),messages=[];
  game.socket={readyState:1,send:raw=>messages.push(JSON.parse(raw))};game.connected=true;
  return {game,messages};
}

test('real client skill payloads omit cursor coordinates for non-area skills and the server accepts every class cast',t=>{
  const {game,messages}=browserGame(t);
  for(const skill of Object.values(SKILLS))for(const selected of [false,true]){
    const world=new World(),hero=newHero('Навык',skill.classId);world.add(hero);
    Object.assign(hero,{x:6.6,z:1.8,level:45});hero.skillBuild={slots:[skill.id,null,null,null],talents:{}};hero.mana=stats(hero).maxMana;
    const mob=world.mobs[0];world.mobs=[mob];Object.assign(mob,{x:8,z:1.8});
    const yaw=.31,point={x:mob.x,z:mob.z},aim={target:point,...(selected?{targetId:mob.id}:{})};
    const before=structuredClone(aim),area=skill.id==='archer-rain'||skill.id==='mage-meteor'||skill.kind==='mobility'||skill.id==='archer-trap';
    game.skill(skill.id,yaw,aim);
    const payload=messages.at(-1);
    assert.deepEqual(payload,{type:'skill',skillId:skill.id,yaw,...(selected?{targetId:mob.id}:{}),...(area?{target:point}:{})},skill.id);
    assert.deepEqual(aim,before,'sending a cast must not mutate the pointer aim');
    const mana=hero.mana;world.command(hero,payload);
    assert.equal(hero.attack?.skillId,skill.id,`${skill.id} was rejected with ${selected?'selected target':'cursor only'}`);
    assert.equal(hero.mana,mana-(skill.kind==='channel'?0:skill.manaCost));
    if(area)assert.deepEqual(hero.attack.target,point);
    assert(!world.events.some(event=>event.type==='notice'&&event.text==='Неверная точка навыка'));
  }
});

test('client skill calls preserve optional aiming and never send while disconnected',t=>{
  const {game,messages}=browserGame(t);
  game.skill('warrior-thrust',Math.PI);
  assert.deepEqual(messages,[{type:'skill',skillId:'warrior-thrust',yaw:Math.PI}]);
  game.skill('mage-meteor',.7,{targetId:0});
  assert.deepEqual(messages.at(-1),{type:'skill',skillId:'mage-meteor',yaw:.7,targetId:0});
  game.connected=false;game.skill('archer-rain',1,{target:{x:8,z:2}});assert.equal(messages.length,2);
});
