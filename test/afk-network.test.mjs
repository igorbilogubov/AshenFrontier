import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocket} from 'ws';
import {newHero,persistentHero,stats} from '../dist/world.js';
import {AFK_SPOTS,afkSpotAt} from '../dist/public/game/location.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer} from './helpers/network.mjs';

async function until(predicate,timeout=5000){const end=Date.now()+timeout;while(!predicate()){assert(Date.now()<end,'Timed out waiting for AFK state');await delay(20);}}
async function connect(server,join){
  const c={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url}),states:[]};
  c.ws.on('message',data=>{const message=JSON.parse(data);if(message.type==='state'){c.state=message;c.states.push(message);}});
  await once(c.ws,'open');c.ws.send(JSON.stringify({type:'join',protocol:2,...join}));await until(()=>c.state);return c;
}
async function close(c){if(!c||c.ws.readyState===WebSocket.CLOSED)return;const ended=once(c.ws,'close');c.ws.close();await ended;}

test('real online AFK stops with the socket and never resumes from saved V3 after restart',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),token='e'.repeat(48),anchor={x:7.6,z:1.8},hero=newHero('Сетевая опушка','warrior');
  Object.assign(hero,anchor,{level:35});hero.hp=stats(hero).maxHp;hero.mana=stats(hero).maxMana;assert.equal(afkSpotAt(hero),null);await database.seed(token,persistentHero(hero));
  let server;const clients=[];
  try{
    server=await startTestServer(database);const owner=await connect(server,{token}),observer=await connect(server,{name:'Наблюдатель',classId:'mage'});clients.push(owner,observer);
    assert.equal(owner.state.self.afk,null);
    owner.ws.send(JSON.stringify({type:'afk',enabled:true,spotId:'forged',anchor:{x:160,z:15},afkRadius:999999,damage:999999}));
    await until(()=>owner.state?.self.afk);
    assert.deepEqual(owner.state.self.afk.anchor,anchor);assert.equal(owner.state.self.afk.spotId,undefined);assert.equal(owner.state.self.afkRadius,2.5);
    await until(()=>owner.state.self.attackSerial>0);await delay(250);
    assert(owner.states.filter(state=>state.self.afk).every(state=>state.self.x===anchor.x&&state.self.z===anchor.z));
    assert(!('afk' in observer.state.players.find(player=>player.id===hero.id)));
    await close(owner);await close(observer);await stopTestServer(server);
    const saved=(await database.load(token)).hero;assert(!('afk' in saved));
    server=await startTestServer(database);const restored=await connect(server,{token});clients.push(restored);
    assert.equal(restored.state.self.afk,null);assert.equal(restored.state.self.id,saved.id);
    assert.equal(restored.state.self.kills,saved.kills);assert.equal(restored.state.self.questKills,saved.questKills);
    await delay(180);assert(restored.states.every(state=>state.self.afk===null));
  }finally{for(const client of clients)await close(client);await stopTestServer(server);await database.close();}
});

test('real online AFK collects personal gold and PostgreSQL keeps the award after restart',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),token='f'.repeat(48),spot=AFK_SPOTS[0],hero=newHero('Автосбор','warrior');
  Object.assign(hero,{x:spot.x,z:spot.z,level:35});hero.hp=stats(hero).maxHp;hero.mana=stats(hero).maxMana;
  await database.seed(token,persistentHero(hero));let server;const clients=[];
  try{
    server=await startTestServer(database);const owner=await connect(server,{token});clients.push(owner);
    owner.ws.send(JSON.stringify({type:'afk',enabled:true}));
    await until(()=>owner.state?.self.afk?.spotId===spot.id);
    await until(()=>owner.state?.self.gold>0,20000);
    assert(owner.state.self.kills>0);assert(owner.state.self.afk);
    const awarded=owner.state.self.gold;
    let durable=0;
    for(let i=0;i<40&&durable<awarded;i++){durable=(await database.load(token)).hero.gold;if(durable<awarded)await delay(100);}
    assert(durable>=awarded);
    await close(owner);await stopTestServer(server);
    server=await startTestServer(database);const restored=await connect(server,{token});clients.push(restored);
    assert(restored.state.self.gold>=awarded);assert.equal(restored.state.self.afk,null);
  }finally{for(const client of clients)await close(client);await stopTestServer(server);await database.close();}
});


test('network AFK enables quietly in town for every class and publishes only the server activation point',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),anchor={x:.5,z:4};let server;const clients=[];
  try{
    const heroes=['warrior','archer','mage'].map((classId,index)=>({hero:newHero(`Лагерь ${index}`,classId),token:String(index+1).repeat(48)}));
    for(const {hero,token} of heroes){Object.assign(hero,anchor);await database.seed(token,persistentHero(hero));}
    server=await startTestServer(database);
    for(const {token} of heroes){
      const client=await connect(server,{token});clients.push(client);
      client.ws.send(JSON.stringify({type:'afk',enabled:true,anchor:{x:999,z:999},afkRadius:999}));
      await until(()=>client.state?.self.afk);assert.deepEqual(client.state.self.afk.anchor,anchor);
      assert.equal(client.state.self.afk.spotId,undefined);assert(client.state.self.afkRadius>0&&client.state.self.afkRadius<8);
    }
    await delay(600);
    for(const client of clients){
      const states=client.states.filter(state=>state.self.afk);assert(states.length>2);
      assert(states.every(state=>state.self.x===anchor.x&&state.self.z===anchor.z&&state.self.attackSerial===0&&state.self.afk.targetId===null));
      assert(states.every(state=>!state.events.some(event=>event.type==='safe'||event.type==='notice')));
      client.ws.send(JSON.stringify({type:'input',x:1,z:0,aim:null,seq:1}));await until(()=>client.state.self.afk===null);
    }
  }finally{for(const client of clients)await close(client);await stopTestServer(server);await database.close();}
});
