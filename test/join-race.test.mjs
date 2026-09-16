import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import pg from 'pg';
import {newHero,persistentHero} from '../dist/world.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer,until} from './helpers/network.mjs';
import {testPlayer} from './helpers/network.mjs';

async function connect(server,claim){
  const login=await testPlayer(server,claim);
  const client={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:login.headers}),state:null,error:null,welcome:null,paused:false};
  client.ws.on('ping',body=>{if(String(body)==='join-pause')client.paused=true;});
  client.ws.on('message',body=>{
    const message=JSON.parse(String(body));
    if(message.type==='state')client.state=message;
    if(message.type==='welcome')client.welcome=message;
    if(message.type==='error')client.error=message;
  });
  await once(client.ws,'open');client.ws.send(JSON.stringify({type:'join',protocol:3,heroId:login.heroId}));
  return client;
}
async function close(client){
  if(!client||client.ws.readyState===WebSocket.CLOSED)return;
  const ended=once(client.ws,'close');client.ws.close();await ended;
}

test('join in flight gets explicit storage_unavailable when a slow durable save starts',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),fixture='a'.repeat(48),hero=newHero('Race owner');Object.assign(hero,{hp:40,x:5,z:12});
  const admin=new pg.Client({connectionString:database.url});let server,owner,joining,retry;
  try{
    await database.seed(fixture,persistentHero(hero));
    await admin.connect();
    // Disposable database only: keep the writer commit pending long enough to
    // overlap the join after its initial storage check.
    await admin.query(`CREATE FUNCTION test_slow_hero_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(1); RETURN NEW; END $$`);
    await admin.query(`CREATE TRIGGER test_slow_hero_update BEFORE UPDATE ON heroes
      FOR EACH ROW EXECUTE FUNCTION test_slow_hero_update()`);
    server=await startTestServer(database,{environment:{NODE_ENV:'test',GAME_TEST_JOIN_PAUSE_MS:'450'}});
    owner=await connect(server,{fixture});await until(()=>owner.state,{message:'Owner did not join'});
    joining=await connect(server,{name:'Join during save',classId:'mage'});
    await until(()=>joining.paused,{message:'Join did not reach asynchronous pause'});
    owner.ws.send(JSON.stringify({type:'potion'}));
    await until(()=>joining.error||joining.state,{timeout:5000,message:'In-flight join got no response'});
    assert.equal(joining.error?.code,'storage_unavailable');assert.equal(joining.welcome,null);assert.equal(joining.state,null);
    const stored=await admin.query('SELECT count(*)::integer AS count FROM heroes');assert.equal(stored.rows[0].count,2);
    await until(()=>owner.state?.self.potions===2,{timeout:5000,message:'Owner save did not finish'});
    retry=await connect(server,{name:'Join after save',classId:'mage'});
    await until(()=>retry.state||retry.error,{timeout:5000,message:'Retry join got no response'});
    assert.equal(retry.error,null);assert.equal(retry.state?.self.classId,'mage');
  }finally{await close(owner);await close(joining);await close(retry);await stopTestServer(server);await admin.end().catch(()=>{});await database.close();}
});
