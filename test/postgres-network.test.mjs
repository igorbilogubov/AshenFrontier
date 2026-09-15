import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
import pg from 'pg';
import {makeLoot,newHero,persistentHero} from '../dist/world.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer,until} from './helpers/network.mjs';

async function join(server,claim){
  const ws=new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url});
  let welcome,state,error;
  ws.on('message',data=>{
    const message=JSON.parse(data);
    if(message.type==='welcome')welcome=message;
    if(message.type==='state')state=message;
    if(message.type==='error')error=message;
  });
  await once(ws,'open');
  ws.send(JSON.stringify({type:'join',protocol:2,...claim}));
  await until(()=>state||error,{message:'Timed out waiting for PostgreSQL join'});
  return {ws,welcome,state,error};
}
async function leave(client){
  if(!client||client.ws.readyState===WebSocket.CLOSED)return;
  const ended=once(client.ws,'close');client.ws.close();await ended;
}

test('fresh PostgreSQL stays authoritative while a malformed legacy JSON save remains untouched',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),dir=await mkdtemp(path.join(tmpdir(),'ashen-json-ignored-'));
  const file=path.join(dir,'heroes.json'),legacy='{"broken":';
  await writeFile(file,legacy);
  let server,first,restored;
  try{
    server=await startTestServer(database,{dataDir:dir});
    first=await join(server,{name:'Новый герой',classId:'mage'});
    assert(first.welcome?.token);
    const identity=first.state.self.id,token=first.welcome.token;
    await leave(first);await stopTestServer(server);
    assert.equal(await readFile(file,'utf8'),legacy);
    const row=await database.load(token);
    assert.equal(row?.hero.id,identity);
    server=await startTestServer(database,{dataDir:dir});
    restored=await join(server,{token});
    assert.equal(restored.state.self.id,identity);
    assert.equal(restored.state.self.classId,'mage');
    assert.equal(await readFile(file,'utf8'),legacy);
  }finally{await leave(first);await leave(restored);await stopTestServer(server);await database.close();await rm(dir,{recursive:true,force:true});}
});

test('server refuses startup without DATABASE_URL instead of falling back to JSON',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'ashen-no-db-'));
  const file=path.join(dir,'heroes.json');await writeFile(file,'{}');
  const environment={...process.env,PORT:'0',GAME_HOST:'127.0.0.1',GAME_DATA_DIR:dir,GAME_PREVIEW_ALIAS:'0'};
  delete environment.DATABASE_URL;
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:environment,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  try{
    await until(()=>child.exitCode!==null||child.signalCode!==null,{timeout:10000,message:'Server unexpectedly waited for a database URL'});
    assert.notEqual(child.exitCode,0);
    assert(!/http:\/\/127\.0\.0\.1:\d+/.test(output),'Server must not listen without PostgreSQL');
    assert.equal(await readFile(file,'utf8'),'{}');
  }finally{if(child.exitCode===null&&child.signalCode===null){const ended=once(child,'exit');child.kill('SIGTERM');await ended;}await rm(dir,{recursive:true,force:true});}
});

test('a second world writer cannot start on the same database; the first keeps serving and restart releases the lock',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase();
  let server,client;
  try{
    server=await startTestServer(database);
    const health=await fetch(server.url+'/health');assert.equal(health.status,200);
    await assert.rejects(()=>startTestServer(database));
    assert.equal((await fetch(server.url+'/health')).status,200);
    client=await join(server,{name:'Один писатель'});
    assert(client.welcome?.token);
    await leave(client);await stopTestServer(server);
    server=await startTestServer(database);
    client=await join(server,{token:client.welcome.token});
    assert.equal(client.state.self.name,'Один писатель');
  }finally{await leave(client);await stopTestServer(server);await database.close();}
});

test('losing the retained PostgreSQL world writer freezes uncommitted sale and restores the last durable hero on restart',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),token='e'.repeat(48),hero=newHero('Последний коммит');
  const sale=makeLoot('warrior',1,0,'ring');hero.gold=25;hero.items.push(sale);
  let server,client,restored;
  const admin=new pg.Client({connectionString:database.url});
  try{
    await database.seed(token,persistentHero(hero));
    server=await startTestServer(database);
    client=await join(server,{token});assert(client.welcome&&client.state);
    assert.equal(client.state.self.gold,25);
    assert(client.state.self.items.some(item=>item.id===sale.id));
    const published=[];
    client.ws.on('message',body=>{const message=JSON.parse(String(body));if(message.type==='state')published.push(message);});
    await until(()=>published.length>0,{message:'Expected a live state before writer loss'});

    await admin.connect();
    // pg_locks can contain identically numbered advisory locks in unrelated
    // databases. Only terminate the writer of this disposable test database.
    const locks=await admin.query(`SELECT l.pid FROM pg_locks AS l
      JOIN pg_database AS d ON d.oid=l.database
      WHERE d.datname=current_database() AND l.database=d.oid
        AND l.locktype='advisory' AND l.classid=8675309::oid
        AND l.objid=4732::oid AND l.mode='ExclusiveLock' AND l.granted
        AND l.pid<>pg_backend_pid()`);
    assert.equal(locks.rowCount,1,'Expected exactly one writer lock in the disposable database');
    const terminated=await admin.query('SELECT pg_terminate_backend($1) AS terminated',[locks.rows[0].pid]);
    assert.equal(terminated.rows[0].terminated,true);

    // The command may enter the bounded queue, but its gold/item result must
    // never appear in a state frame without a confirmed database commit.
    assert.equal(client.ws.readyState,WebSocket.OPEN);
    client.ws.send(JSON.stringify({type:'sell',id:sale.id}));
    await new Promise(resolve=>setTimeout(resolve,200));
    const health=await fetch(server.url+'/health');
    assert.equal(health.status,503);
    const body=await health.json();
    assert.equal(body.storage.backend,'postgresql');
    assert.equal(body.storage.writer,false);
    await until(()=>client.ws.readyState===WebSocket.CLOSED,{message:'Live connection remained open after writer loss'});
    assert(published.every(state=>state.self.gold===25&&state.self.items.some(item=>item.id===sale.id)),
      'Server published an uncommitted sale after writer loss');
    const saved=await database.load(token);
    assert.equal(saved.hero.gold,25);
    assert(saved.hero.items.some(item=>item.id===sale.id));

    await stopTestServer(server);server=await startTestServer(database);
    restored=await join(server,{token});
    assert.equal(restored.state.self.gold,25);
    assert(restored.state.self.items.some(item=>item.id===sale.id));
  }finally{await leave(client);await leave(restored);await stopTestServer(server);await admin.end().catch(()=>{});await database.close();}
});
