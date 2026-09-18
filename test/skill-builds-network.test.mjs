import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {newHero,persistentHero} from '../dist/world.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer,testPlayer,until} from './helpers/network.mjs';
async function connect(server,fixture){
 const login=await testPlayer(server,{fixture}),c={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:login.headers}),events:[]};
 c.ws.on('message',data=>{const m=JSON.parse(data);if(m.type==='state'){c.state=m;c.events.push(...m.events);}});
 await once(c.ws,'open');c.ws.send(JSON.stringify({type:'join',protocol:3,heroId:login.heroId}));await until(()=>c.state);return c;
}
async function close(c){if(c?.ws.readyState!==WebSocket.CLOSED&&c){const end=once(c.ws,'close');c.ws.close();await end;}}

test('real account session applies, saves and restores private build; malformed and stale commands fail',{skip:!hasTestDatabase},async()=>{
 const db=await createTestDatabase(),p=newHero('Книга','warrior'),fixture='skill-build-network';p.level=86;await db.seed(fixture,persistentHero(p));let server,c;
 try{
  server=await startTestServer(db);c=await connect(server,fixture);
  assert.equal(c.state.self.buildRevision,0);assert(!('skillBuild' in c.state.players[0]));
  const build={slots:['warrior-heavy','warrior-charge','warrior-guard','warrior-berserk',null,null],talents:{'warrior-duelist-1':2,'warrior-duelist-2':2}};
  c.ws.send(JSON.stringify({type:'buildApply',revision:0,build}));await until(()=>c.state.self.buildRevision===1);assert.deepEqual(c.state.self.skillBuild,build);
  c.ws.send(JSON.stringify({type:'buildSavePreset',index:2}));await until(()=>c.state.self.skillPresets[2]);assert.deepEqual(c.state.self.skillPresets[2],build);
  c.ws.send(JSON.stringify({type:'buildApply',revision:0,build:{slots:[null,null,null,null,null,null],talents:{}}}));await until(()=>c.events.some(e=>e.type==='buildResult'&&!e.ok));assert.deepEqual(c.state.self.skillBuild,build);
  const failures=c.events.filter(e=>e.type==='buildResult'&&!e.ok).length;
  c.ws.send(JSON.stringify({type:'buildApply',revision:1,build:{...build,talents:{'warrior-duelist-mastery':1}}}));await until(()=>c.events.filter(e=>e.type==='buildResult'&&!e.ok).length>failures);assert.equal(c.state.self.buildRevision,1);
  await close(c);c=null;await stopTestServer(server);server=null;
  const saved=(await db.load(fixture)).hero;assert.deepEqual(saved.skillBuild,build);assert.deepEqual(saved.skillPresets[2],build);assert.equal(saved.buildRevision,1);
  server=await startTestServer(db);c=await connect(server,fixture);assert.deepEqual(c.state.self.skillBuild,build);assert.deepEqual(c.state.self.skillPresets[2],build);
 }finally{await close(c);await stopTestServer(server);await db.close();}
});
