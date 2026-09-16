import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {newHero,persistentHero} from '../dist/world.js';
import {PORTALS,STADIUM_PENS} from '../dist/public/game/stadium.js';
import {locationAt} from '../dist/public/game/world-layout.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer,until} from './helpers/network.mjs';
import {testPlayer} from './helpers/network.mjs';
async function connect(server,fixture){
  const login=await testPlayer(server,{fixture});
  const client={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:login.headers}),states:[]};
  client.ws.on('message',data=>{const m=JSON.parse(data);if(m.type==='state'){client.state=m;client.states.push(m);}});
  await once(client.ws,'open');client.ws.send(JSON.stringify({type:'join',protocol:3,heroId:login.heroId}));await until(()=>client.state);return client;
}
async function close(client){if(!client||client.ws.readyState===WebSocket.CLOSED)return;const closed=once(client.ws,'close');client.ws.close();await closed;}

test('real portal commands isolate regions and preserve hero identity, gear and position through PostgreSQL restart',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),fixture='9'.repeat(48),observerFixture='8'.repeat(48),hero=newHero('Портал PostgreSQL'),observer=newHero('Лесной наблюдатель');
  hero.gold=123;await database.seed(fixture,persistentHero(hero));await database.seed(observerFixture,persistentHero(observer));
  let server;const clients=[];
  try{
    server=await startTestServer(database);const owner=await connect(server,fixture),watcher=await connect(server,observerFixture);clients.push(owner,watcher);
    await until(()=>watcher.state.players.some(p=>p.id===hero.id));
    owner.ws.send(JSON.stringify({type:'portal',portalId:'camp-stadium',x:-9999,z:9999,gold:999999}));
    await until(()=>locationAt(owner.state.self)==='stadium');await until(()=>!watcher.state.players.some(p=>p.id===hero.id));
    assert.equal(owner.state.mobs.length,24);assert.equal(watcher.state.mobs.length,72);assert.equal(owner.state.self.gold,123);
    assert(owner.states.some(state=>state.events.some(e=>e.type==='portal'&&e.location==='stadium')));
    const arrival={x:owner.state.self.x,z:owner.state.self.z};assert.deepEqual(arrival,PORTALS[0].destination);
    await close(owner);await close(watcher);await stopTestServer(server);
    const saved=(await database.load(fixture)).hero;assert.deepEqual({x:saved.x,z:saved.z},arrival);assert.equal(saved.gold,123);assert.deepEqual(saved.items,hero.items);assert.deepEqual(saved.equipment,hero.equipment);
    server=await startTestServer(database);const restored=await connect(server,fixture);clients.push(restored);
    assert.equal(restored.state.self.id,hero.id);assert.equal(locationAt(restored.state.self),'stadium');assert.equal(restored.state.self.afk,null);assert.equal(restored.state.mobs.length,24);assert.equal(restored.state.self.gold,123);
    restored.ws.send(JSON.stringify({type:'portal',portalId:'stadium-camp'}));await until(()=>locationAt(restored.state.self)==='forest');assert.equal(restored.state.self.gold,123);assert.equal(restored.state.mobs.length,72);
  }finally{for(const client of clients)await close(client);await stopTestServer(server);await database.close();}
});

test('network AFK chooses the real Stadium pen and cannot claim another region or grant forged rewards',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),fixture='7'.repeat(48),hero=newHero('Стадиум AFK','mage'),pen=STADIUM_PENS[0];Object.assign(hero,{x:pen.x,z:pen.z,level:20});await database.seed(fixture,persistentHero(hero));
  let server,client;
  try{
    server=await startTestServer(database);client=await connect(server,fixture);
    client.ws.send(JSON.stringify({type:'afk',enabled:true,spotId:'wolf-den',damage:999999,gold:999999}));
    await until(()=>client.states.some(state=>state.self.afk?.spotId===pen.id));assert.equal(client.state.self.gold,0);assert.equal(client.state.mobs.length,24);
    client.ws.send(JSON.stringify({type:'input',x:1,z:0,aim:null,seq:1}));await until(()=>client.state.self.afk===null);assert.equal(locationAt(client.state.self),'stadium');
  }finally{await close(client);await stopTestServer(server);await database.close();}
});
