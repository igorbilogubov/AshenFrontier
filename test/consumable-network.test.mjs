import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {newHero,persistentHero} from '../dist/world.js';
import {SHOP} from '../dist/public/game/shop.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer,until} from './helpers/network.mjs';
import {testPlayer} from './helpers/network.mjs';

async function connect(server,fixture){
  const login=await testPlayer(server,{fixture});
  const c={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:login.headers}),state:null};
  c.ws.on('message',body=>{const m=JSON.parse(body);if(m.type==='state')c.state=m;});
  await once(c.ws,'open');c.send=message=>c.ws.send(JSON.stringify(message));c.send({type:'join',protocol:3,heroId:login.heroId});
  await until(()=>c.state);return c;
}
async function close(c){if(!c||c.ws.readyState===WebSocket.CLOSED)return;const done=once(c.ws,'close');c.ws.close();await done;}

test('WebSocket potion assignment, purchase and use are durable before their snapshot and survive restart',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),fixture='b'.repeat(48),hero=newHero('Бутылки');
  Object.assign(hero,{x:SHOP.x,z:SHOP.z,gold:100,hp:1,mana:0});
  await database.seed(fixture,persistentHero(hero));let server,c;
  try{
    server=await startTestServer(database);c=await connect(server,fixture);
    c.send({type:'assignConsumable',slot:'q',definitionId:'mana-basic'});
    c.send({type:'assignConsumable',slot:'w',definitionId:'hp-basic'});
    await until(()=>c.state.self.quickSlots.q==='mana-basic'&&c.state.self.quickSlots.w==='hp-basic');
    assert.deepEqual((await database.load(fixture)).hero.quickSlots,c.state.self.quickSlots);
    assert.equal(c.state.self.potions,3);assert.equal(c.state.self.manaPotions,3);
    c.send({type:'useConsumable',slot:'q'});c.send({type:'useConsumable',slot:'w'});c.send({type:'useConsumable',slot:'w'});
    await until(()=>c.state.self.potions===2&&c.state.self.manaPotions===2);
    const used=await database.load(fixture);assert.equal(used.hero.potions,2);assert.equal(used.hero.manaPotions,2);
    c.send({type:'interact',npcId:SHOP.id});await until(()=>c.state.self.shopActive);
    c.send({type:'buyConsumable',kind:'hp',requestId:'one-real-bottle'});c.send({type:'buyConsumable',kind:'hp',requestId:'one-real-bottle'});
    await until(()=>c.state.self.potions===3&&c.state.self.gold===94);
    const bought=await database.load(fixture);assert.equal(bought.hero.gold,94);assert.deepEqual(bought.hero.consumableInventory,c.state.self.consumableInventory);
    c.send({type:'assignConsumable',slot:'q',definitionId:null});await until(()=>c.state.self.quickSlots.q===null);
    const expected=structuredClone(c.state.self.consumableInventory);
    await close(c);c=null;await stopTestServer(server);server=await startTestServer(database);c=await connect(server,fixture);
    assert.deepEqual(c.state.self.consumableInventory,expected);assert.deepEqual(c.state.self.quickSlots,{q:null,w:'hp-basic'});assert.equal(c.state.self.gold,94);
  }finally{await close(c);await stopTestServer(server);await database.close();}
});
