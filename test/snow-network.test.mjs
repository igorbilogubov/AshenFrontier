import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {newHero,persistentHero} from '../dist/world.js';
import {SNOW_ENTRY,SNOW_PASSAGES} from '../dist/public/game/snow.js';
import {locationAt} from '../dist/public/game/world-layout.js';
import {RARE_CLASS_ITEMS,rollEquipment,validateEquipment} from '../dist/public/game/equipment-items.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer,testPlayer,until} from './helpers/network.mjs';

async function connect(server,fixture){
  const login=await testPlayer(server,{fixture});
  const client={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:login.headers}),states:[]};
  client.ws.on('message',data=>{const message=JSON.parse(data);if(message.type==='state'){client.state=message;client.states.push(message);}});
  await once(client.ws,'open');
  client.ws.send(JSON.stringify({type:'join',protocol:3,heroId:login.heroId}));
  await until(()=>client.state);return client;
}
async function close(client){
  if(!client||client.ws.readyState===WebSocket.CLOSED)return;
  const closed=once(client.ws,'close');client.ws.close();await closed;
}
const send=(client,message)=>client.ws.send(JSON.stringify(message));
const notices=client=>client.states.flatMap(state=>state.events).filter(event=>event.type==='notice');

test('account-cookie snow passage rejects level nine and forged level through real WebSocket commands',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),fixture='snow-gate-level-nine',hero=newHero('Ранний перевал');
  Object.assign(hero,{x:67,z:5,level:9,gold:71});await database.seed(fixture,persistentHero(hero));
  let server,client;
  try{
    server=await startTestServer(database);client=await connect(server,fixture);
    send(client,{type:'portal',portalId:'forest-snow',level:99,x:268,z:8,gold:99999});
    await until(()=>notices(client).some(event=>event.text.includes('10 уровня')));
    assert.equal(client.state.self.level,9);assert.equal(client.state.self.gold,71);assert.equal(locationAt(client.state.self),'forest');
    const priorNotices=notices(client).length;
    send(client,{type:'input',x:1,z:0,aim:null,seq:1,level:99,location:'snow'});
    await until(()=>notices(client).length>priorNotices&&client.state.self.ack>=1);
    send(client,{type:'input',x:0,z:0,aim:null,seq:2});await until(()=>client.state.self.ack>=2);
    assert(client.states.every(state=>locationAt(state.self)==='forest'));
    assert.equal(client.state.self.level,9);assert.equal(client.state.self.gold,71);assert.equal(client.state.mobs.length,72);
  }finally{await close(client);await stopTestServer(server);await database.close();}
});

test('account-cookie level ten enters snow, isolates regions and restores blue equipment and snowy position from PostgreSQL after server restart',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),fixture='snow-persistent-owner',observerFixture='snow-forest-observer';
  const hero=newHero('Снежный путешественник'),observer=newHero('Лесной наблюдатель');
  Object.assign(observer,{x:-20,z:5});
  const rare=rollEquipment(RARE_CLASS_ITEMS.warrior[0].id,'snow-rare-persisted-instance',()=>.42);
  validateEquipment(rare);hero.items.push(rare);Object.assign(hero,{x:67,z:5,level:10,gold:123});
  await database.seed(fixture,persistentHero(hero));await database.seed(observerFixture,persistentHero(observer));
  let server;const clients=[];
  try{
    server=await startTestServer(database);
    const owner=await connect(server,fixture),watcher=await connect(server,observerFixture);clients.push(owner,watcher);
    await until(()=>watcher.state.players.some(player=>player.id===hero.id));
    send(owner,{type:'input',x:1,z:0,aim:null,seq:1});
    await until(()=>locationAt(owner.state.self)==='snow');
    await until(()=>!watcher.state.players.some(player=>player.id===hero.id));
    assert.equal(owner.state.mobs.length,98);assert(owner.state.mobs.every(mob=>locationAt(mob)==='snow'));
    assert.equal(watcher.state.mobs.length,72);assert(watcher.state.mobs.every(mob=>locationAt(mob)==='forest'));
    assert.deepEqual(owner.state.players.map(player=>player.id),[hero.id]);
    assert(owner.states.some(state=>state.events.some(event=>event.type==='portal'&&event.portalId==='forest-snow'&&event.location==='snow')));
    assert.deepEqual({x:owner.state.self.x,z:owner.state.self.z},SNOW_ENTRY);
    assert.equal(owner.state.self.gold,123);assert.deepEqual(owner.state.self.items.find(item=>item.id===rare.id),rare);
    send(watcher,{type:'attack',yaw:0,targetId:192,damage:99999});
    await until(()=>notices(watcher).some(event=>event.text.includes('Цель недоступна')));
    assert.equal(owner.state.mobs.find(mob=>mob.id===192).hp,1100);
    await close(owner);await close(watcher);await stopTestServer(server);
    const saved=(await database.load(fixture)).hero;
    assert.deepEqual({x:saved.x,z:saved.z},SNOW_ENTRY);assert.equal(saved.level,10);assert.equal(saved.gold,123);assert.deepEqual(saved.items,hero.items);
    validateEquipment(saved.items.find(item=>item.id===rare.id));
    server=await startTestServer(database);const restored=await connect(server,fixture);clients.push(restored);
    assert.equal(restored.state.self.id,hero.id);assert.equal(locationAt(restored.state.self),'snow');assert.equal(restored.state.mobs.length,98);
    assert.deepEqual({x:restored.state.self.x,z:restored.state.self.z},SNOW_ENTRY);
    assert.deepEqual(restored.state.self.items.find(item=>item.id===rare.id),rare);assert.equal(restored.state.self.afk,null);
    send(restored,{type:'portal',portalId:'snow-forest'});await until(()=>locationAt(restored.state.self)==='forest');
    assert.equal(restored.state.mobs.length,72);assert.deepEqual({x:restored.state.self.x,z:restored.state.self.z},SNOW_PASSAGES[1].destination);
    assert.equal(restored.state.self.gold,123);assert.deepEqual(restored.state.self.items.find(item=>item.id===rare.id),rare);
    await close(restored);await stopTestServer(server);
    const returned=(await database.load(fixture)).hero;assert.equal(locationAt(returned),'forest');assert.deepEqual(returned.items,hero.items);
  }finally{for(const client of clients)await close(client);await stopTestServer(server);await database.close();}
});
