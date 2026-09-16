import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {newHero,persistentHero} from '../dist/world.js';
import {PORTALS} from '../dist/public/game/stadium.js';
import {CAMP_SPAWN} from '../dist/public/game/camp-layout.js';
import {locationAt} from '../dist/public/game/world-layout.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer,until,testPlayer} from './helpers/network.mjs';
async function connect(server,fixture){
 const login=await testPlayer(server,{fixture}),c={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:login.headers}),states:[]};
 c.ws.on('message',data=>{const m=JSON.parse(data);if(m.type==='state'){c.state=m;c.states.push(m);}});
 await once(c.ws,'open');c.send=m=>c.ws.send(JSON.stringify(m));c.send({type:'join',protocol:3,heroId:login.heroId});await until(()=>c.state);return c;
}
async function close(c){if(!c||c.ws.readyState===WebSocket.CLOSED)return;const done=once(c.ws,'close');c.ws.close();await done;}
test('real return command cannot forge its deadline; disconnect drops channel and completed travel survives PostgreSQL restart',{skip:!hasTestDatabase},async()=>{
 const db=await createTestDatabase(),fixture='return-channel',hero=newHero('Возврат QA');Object.assign(hero,PORTALS[0].destination);await db.seed(fixture,persistentHero(hero));
 const clients=[];let server;
 try{
  server=await startTestServer(db);const c=await connect(server,fixture);clients.push(c);assert.equal(locationAt(c.state.self),'stadium');
  c.send({type:'camp',campReturnRemaining:0,until:0,x:CAMP_SPAWN.x,z:CAMP_SPAWN.z});await until(()=>c.state.self.campReturnRemaining>0);assert(c.state.self.campReturnRemaining>4);assert.equal(locationAt(c.state.self),'stadium');
  await close(c);await stopTestServer(server);const saved=(await db.load(fixture)).hero;assert.equal(locationAt(saved),'stadium');assert(!('campReturn' in saved));assert(!('campReturnRemaining' in saved));
  server=await startTestServer(db);const restored=await connect(server,fixture);clients.push(restored);assert.equal(restored.state.self.campReturnRemaining,0);assert.equal(locationAt(restored.state.self),'stadium');
  restored.send({type:'camp'});await until(()=>restored.state.self.campReturnRemaining>0);await until(()=>locationAt(restored.state.self)==='forest');
  assert.deepEqual({x:restored.state.self.x,z:restored.state.self.z},CAMP_SPAWN);assert(restored.states.some(s=>s.events.some(e=>e.type==='camp')));
  await close(restored);await stopTestServer(server);assert.deepEqual({x:(await db.load(fixture)).hero.x,z:(await db.load(fixture)).hero.z},CAMP_SPAWN);
 }finally{for(const c of clients)await close(c);await stopTestServer(server);await db.close();}
});
