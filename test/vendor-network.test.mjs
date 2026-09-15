import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WebSocket} from 'ws';
import {newHero,persistentHero} from '../dist/world.js';
import {SHOP,shopItems,sellPrice} from '../dist/public/game/shop.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer,until} from './helpers/network.mjs';

async function connect(server,token){
  const c={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url}),state:null,events:[]};
  c.ws.on('message',body=>{const m=JSON.parse(body);if(m.type==='state'){c.state=m;c.events.push(...m.events);}if(m.type==='error')c.error=m;});
  await once(c.ws,'open');c.send=message=>c.ws.send(JSON.stringify(message));c.send({type:'join',protocol:2,token});
  await until(()=>c.state||c.error);assert(!c.error);return c;
}
async function close(c){if(!c||c.ws.readyState===WebSocket.CLOSED)return;const done=once(c.ws,'close');c.ws.close();await done;}

test('real WebSocket vendor purchases and sales preserve the exact PostgreSQL economy across restart',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),dataDir=await mkdtemp(path.join(tmpdir(),'ashen-vendor-'));
  const clients=[];let server;
  try{
    const hero=newHero('Купец');Object.assign(hero,{x:SHOP.x,z:SHOP.z,gold:100});
    const token='e'.repeat(48);await database.seed(token,persistentHero(hero));
    server=await startTestServer(database,{dataDir});const c=await connect(server,token);clients.push(c);
    const listing=shopItems().find(item=>item.classId==='warrior'&&item.slot==='ring');
    c.send({type:'buy',definitionId:listing.definitionId});await new Promise(resolve=>setTimeout(resolve,100));assert.equal(c.state.self.gold,100);
    c.send({type:'interact',npcId:SHOP.id});await until(()=>c.events.some(e=>e.type==='shopOpen'));
    c.send({type:'buy',definitionId:listing.definitionId,requestId:'ring-one'});
    await until(()=>c.state?.self.gold===100-listing.price&&c.state.self.items.length===3);
    const bought=c.state.self.items.at(-1);assert.equal(bought.definitionId,listing.definitionId);
    c.send({type:'buy',definitionId:listing.definitionId,requestId:'ring-one'});await new Promise(resolve=>setTimeout(resolve,100));assert.equal(c.state.self.items.length,3);
    const stored=await database.load(token);assert.equal(stored.hero.gold,c.state.self.gold);assert.deepEqual(stored.hero.items.at(-1),bought);
    c.send({type:'sell',id:bought.id});await until(()=>c.state?.self.items.length===2);
    const expected=100-listing.price+sellPrice(bought);assert.equal(c.state.self.gold,expected);assert.equal((await database.load(token)).hero.gold,expected);
    const starter=c.state.self.items.find(item=>item.id===hero.equipment.weapon);assert(starter.bound);assert(sellPrice(starter)>0);
    c.send({type:'sell',id:starter.id});await new Promise(resolve=>setTimeout(resolve,100));assert.equal(c.state.self.gold,expected);
    c.send({type:'unequip',id:starter.id});await until(()=>c.state?.self.equipment.weapon===null);
    c.send({type:'sell',id:starter.id});await until(()=>c.state?.self.items.length===1);
    const boundExpected=expected+sellPrice(starter);assert.equal(c.state.self.gold,boundExpected);
    c.send({type:'sell',id:starter.id});await new Promise(resolve=>setTimeout(resolve,100));assert.equal(c.state.self.gold,boundExpected);
    const soldStorage=await database.load(token);assert.equal(soldStorage.hero.gold,boundExpected);assert(!soldStorage.hero.items.some(item=>item.id===starter.id));
    await close(c);await stopTestServer(server);server=await startTestServer(database,{dataDir});
    const restored=await connect(server,token);clients.push(restored);
    assert.equal(restored.state.self.gold,boundExpected);assert.equal(restored.state.self.items.length,1);
  }finally{for(const c of clients)await close(c);await stopTestServer(server);await database.close();await rm(dataDir,{recursive:true,force:true});}
});
