import {equipLegacySkills} from './helpers/skill-builds.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocket} from 'ws';
import {newHero,persistentHero} from '../dist/world.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer} from './helpers/network.mjs';
import {testPlayer} from './helpers/network.mjs';

async function until(predicate,timeout=5000){const end=Date.now()+timeout;while(!predicate()){assert(Date.now()<end,'Timed out waiting for skill state');await delay(20);}}
async function connect(server,join){
  const login=await testPlayer(server,join);
  const c={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:login.headers}),states:[],events:[]};
  c.ws.on('message',data=>{const message=JSON.parse(data);if(message.type==='state'){c.state=message;c.states.push(message);c.events.push(...message.events);}if(message.type==='welcome')c.welcome=message;});
  await once(c.ws,'open');c.ws.send(JSON.stringify({type:'join',protocol:3,heroId:login.heroId}));await until(()=>c.state);return c;
}
async function close(c){if(!c||c.ws.readyState===WebSocket.CLOSED)return;const ended=once(c.ws,'close');c.ws.close();await ended;}

test('real skill packets expose only public cast/impact, and private mana/cooldown state survives server restart',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),fixture='f'.repeat(48),hero=newHero('Сетевая магия','mage');
  equipLegacySkills(hero);
  Object.assign(hero,{x:6.3,z:1.8,yaw:Math.PI/2,targetYaw:Math.PI/2});
  await database.seed(fixture,persistentHero(hero));
  let server;const clients=[];
  try{
    server=await startTestServer(database);
    const owner=await connect(server,{fixture}),observer=await connect(server,{name:'Наблюдатель',classId:'warrior'});clients.push(owner,observer);
    const originalMana=owner.state.self.mana;
    owner.ws.send(JSON.stringify({type:'skill',skillId:'mage-fireball',yaw:Math.PI/2,damage:999999,manaCost:0,cooldown:0}));
    await until(()=>owner.states.some(state=>state.self?.attack?.skillId==='mage-fireball'));
    assert(owner.state.self.mana>=originalMana-17&&owner.state.self.mana<originalMana-16.5);
    await until(()=>observer.states.some(state=>state.players.some(p=>p.id===hero.id&&p.attack?.skillId==='mage-fireball')));
    assert(!('skillCooldowns' in observer.state.players.find(p=>p.id===hero.id)));
    await until(()=>observer.events.some(event=>event.type==='skillImpact'&&event.skillId==='mage-fireball'));
    assert(observer.events.some(event=>event.type==='skillImpact'&&event.yaw===Math.PI/2));
    assert.equal(owner.state.self.skillCooldowns['mage-fireball'],0);
    await close(owner);await close(observer);await stopTestServer(server);
    const saved=(await database.load(fixture)).hero;
    assert.equal(saved.mana<originalMana,true);assert.equal(saved.skillCooldowns['mage-fireball'],0);
    server=await startTestServer(database);const restored=await connect(server,{fixture});clients.push(restored);
    assert.equal(restored.state.self.classId,'mage');assert(restored.state.self.mana>=saved.mana&&restored.state.self.mana<originalMana);
    assert.equal(restored.state.self.skillCooldowns['mage-fireball'],0);
    await until(()=>restored.state.self.attack===null);
    restored.ws.send(JSON.stringify({type:'skill',skillId:'mage-meteor',yaw:Math.PI/2,damage:999999}));
    await until(()=>restored.states.some(state=>state.self?.attack?.skillId==='mage-meteor'));
    await until(()=>restored.events.some(event=>event.type==='skillImpact'&&event.skillId==='mage-meteor'&&event.phase==='warning'));
    await until(()=>restored.events.some(event=>event.type==='skillImpact'&&event.skillId==='mage-meteor'&&event.phase==='impact'));
    const warning=restored.events.find(event=>event.type==='skillImpact'&&event.skillId==='mage-meteor'&&event.phase==='warning');
    const impact=restored.events.find(event=>event.type==='skillImpact'&&event.skillId==='mage-meteor'&&event.phase==='impact');
    assert.deepEqual([warning.x,warning.z],[impact.x,impact.z]);
    assert.equal(restored.state.self.skillCooldowns['mage-meteor']>0,true);
    await close(restored);await stopTestServer(server);server=null;
    const meteorSaved=(await database.load(fixture)).hero;assert(meteorSaved.skillCooldowns['mage-meteor']>0);
  }finally{for(const client of clients)await close(client);await stopTestServer(server);await database.close();}
});
