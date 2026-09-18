import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {newHero,persistentHero,stats} from '../dist/world.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer,until,testPlayer} from './helpers/network.mjs';

test('SIGTERM tells connected clients to reload before closing 1012',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase();
  let server,ws;
  try{
    server=await startTestServer(database);
    const login=await testPlayer(server,{name:'Перезапуск',classId:'warrior'});
    const messages=[];
    let closeCode,closeReason;
    ws=new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:login.headers});
    ws.on('message',data=>messages.push(JSON.parse(String(data))));
    ws.on('close',(code,reason)=>{closeCode=code;closeReason=String(reason);});
    await once(ws,'open');
    ws.send(JSON.stringify({type:'join',protocol:3,heroId:login.heroId}));
    await until(()=>messages.some(message=>message.type==='state'),{message:'Timed out waiting to join before restart'});
    const ended=once(server.child,'exit');
    server.child.kill('SIGTERM');
    await ended;
    await until(()=>closeCode!==undefined,{timeout:8000,message:'Timed out waiting for restart close'});
    assert(messages.some(message=>message.type==='reload'&&message.reason==='restart'),JSON.stringify(messages.map(message=>message.type)));
    assert(!messages.some(message=>message.type==='error'&&message.code==='restart'));
    assert.equal(closeCode,1012);
    assert.match(closeReason,/restart/i);
  }finally{
    if(ws&&ws.readyState!==WebSocket.CLOSED)ws.terminate();
    await stopTestServer(server);
    await database.close();
  }
});

test('a reload resume command re-enables AFK after a process restart, the save itself does not',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),fixture='r'.repeat(48),hero=newHero('Охотник','warrior');
  Object.assign(hero,{x:7.6,z:1.8,level:35});hero.hp=stats(hero).maxHp;hero.mana=stats(hero).maxMana;
  await database.seed(fixture,persistentHero(hero));
  let server,first,second;
  try{
    server=await startTestServer(database);
    const login=await testPlayer(server,{fixture});
    first=new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:login.headers});
    let state;
    first.on('message',data=>{const message=JSON.parse(String(data));if(message.type==='state')state=message;});
    await once(first,'open');
    first.send(JSON.stringify({type:'join',protocol:3,heroId:login.heroId}));
    await until(()=>state);
    first.send(JSON.stringify({type:'afk',enabled:true}));
    await until(()=>state.self.afk);
    await stopTestServer(server);
    assert(!('afk' in (await database.load(fixture)).hero));
    server=await startTestServer(database);
    const again=await testPlayer(server,{fixture});
    second=new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:again.headers});
    let restored;
    second.on('message',data=>{const message=JSON.parse(String(data));if(message.type==='state')restored=message;});
    await once(second,'open');
    second.send(JSON.stringify({type:'join',protocol:3,heroId:again.heroId}));
    await until(()=>restored);
    assert.equal(restored.self.afk,null);
    second.send(JSON.stringify({type:'afk',enabled:true}));
    await until(()=>restored.self.afk);
    assert.ok(restored.self.afk);
  }finally{
    if(first&&first.readyState!==WebSocket.CLOSED)first.terminate();
    if(second&&second.readyState!==WebSocket.CLOSED)second.terminate();
    await stopTestServer(server);
    await database.close();
  }
});
