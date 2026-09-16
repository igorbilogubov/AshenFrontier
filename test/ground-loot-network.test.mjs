import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WebSocket} from 'ws';
import {newHero,persistentHero} from '../dist/world.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer,until} from './helpers/network.mjs';
import {testPlayer} from './helpers/network.mjs';

async function connect(server,fixture){
  const login=await testPlayer(server,{fixture});
  const client={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:login.headers}),state:null,events:[]};
  client.ws.on('message',body=>{const message=JSON.parse(body);if(message.type==='state'){client.state=message;client.events.push(...message.events);}if(message.type==='error')client.error=message;});
  await once(client.ws,'open');client.send=message=>client.ws.send(JSON.stringify(message));client.send({type:'join',protocol:3,heroId:login.heroId});
  await until(()=>client.state||client.error);assert(!client.error);return client;
}
async function close(client){if(!client||client.ws.readyState===WebSocket.CLOSED)return;const done=once(client.ws,'close');client.ws.close();await done;}

test('personal ground gold needs a server pickup and persists atomically, while unpicked drops vanish on restart',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),dataDir=await mkdtemp(path.join(tmpdir(),'ashen-loot-'));
  const clients=[];let server;
  try{
    const hero=newHero('Сборщик');Object.assign(hero,{x:6.3,z:1.8,level:8});
    const fixture='d'.repeat(48);await database.seed(fixture,persistentHero(hero));
    server=await startTestServer(database,{dataDir});const client=await connect(server,fixture);clients.push(client);
    const mob=client.state.mobs[0];const attack=()=>{
      if(client.state?.mobs[0].state!=='dead')client.send({type:'attack',yaw:Math.atan2(mob.x-client.state.self.x,mob.z-client.state.self.z)});
    };
    const attacking=setInterval(attack,180);
    try{await until(()=>client.state?.mobs[0].state==='dead',{timeout:10000});}finally{clearInterval(attacking);}
    await until(()=>client.state?.groundLoot.some(drop=>drop.kind==='gold'));
    assert.equal(client.state.self.gold,0);assert(client.state.self.xp>0);
    const drop=client.state.groundLoot.find(drop=>drop.kind==='gold');assert.equal(drop.amount,8);
    const dbBefore=await database.load(fixture);assert.equal(dbBefore.hero.gold,0);assert(dbBefore.hero.xp>0);
    await until(()=>!client.state.self.attack);
    client.send({type:'pickup',id:drop.id});
    await until(()=>client.state?.self.gold===8&&client.state.groundLoot.every(candidate=>candidate.id!==drop.id),{timeout:10000});
    client.send({type:'pickup',id:drop.id});await new Promise(resolve=>setTimeout(resolve,100));assert.equal(client.state.self.gold,8);
    assert.equal((await database.load(fixture)).hero.gold,8);
    await close(client);await stopTestServer(server);server=await startTestServer(database,{dataDir});
    const restored=await connect(server,fixture);clients.push(restored);
    assert.equal(restored.state.self.gold,8);assert.deepEqual(restored.state.groundLoot,[]);
  }finally{for(const client of clients)await close(client);await stopTestServer(server);await database.close();await rm(dataDir,{recursive:true,force:true});}
});
