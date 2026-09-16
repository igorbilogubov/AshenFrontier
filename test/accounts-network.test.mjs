import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {randomBytes,createHash} from 'node:crypto';
import {WebSocket} from 'ws';
import pg from 'pg';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer,until} from './helpers/network.mjs';
import {newHero,persistentHero} from '../dist/world.js';

const headers=(login,origin)=>({Origin:origin,'Content-Type':'application/json',...(login?{Cookie:`ashen_session=${login.cookie}`}:{})});
async function api(server,login,path,body){
  const response=await fetch(server.url+path,{headers:headers(login,server.url),...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
  return {status:response.status,body:response.status===204?null:await response.json(),headers:response.headers};
}
async function connect(server,login,heroId,extra={}){
  const c={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:headers(login,server.url)}),welcome:null,state:null,error:null,paused:false};
  c.ws.on('error',()=>{});c.ws.on('ping',body=>{if(String(body)==='join-pause')c.paused=true;});
  c.ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='state')c.state=m;if(m.type==='welcome')c.welcome=m;if(m.type==='error')c.error=m;});
  await once(c.ws,'open');c.ws.send(JSON.stringify({type:'join',protocol:3,heroId,...extra}));return c;
}
async function ready(c){await until(()=>c.state||c.error);return c;}
async function joinAvailable(server,login,heroId){
  for(let attempt=0;attempt<15;attempt++){
    const c=await ready(await connect(server,login,heroId));
    if(c.error?.code!=='storage_unavailable')return c;
    await close(c);await delay(100);
  }throw new Error('Character join remained unavailable');
}
async function close(c){if(!c||c.ws.readyState===WebSocket.CLOSED)return;const ended=once(c.ws,'close');c.ws.close();await ended;}
async function create(server,login,name='Новый герой',classId='warrior'){
  for(let attempt=0;attempt<20;attempt++){
    const result=await api(server,login,'/api/characters',{name,classId});
    if(result.status===503){await delay(100);continue;}
    assert.equal(result.status,201,JSON.stringify(result.body));return result.body.character;
  }throw new Error('Character creation remained unavailable');
}

test('HTTP account API requires authenticated cookie and same origin; old hero key joins are rejected',{skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase();let server;const clients=[];
  try{
    server=await startTestServer(db);
    const anonymous=await api(server,null,'/api/account');assert.equal(anonymous.status,200);assert.equal(anonymous.body.account,null);assert.deepEqual(anonymous.body.characters,[]);assert.equal(anonymous.body.configured,false);assert.equal(anonymous.body.maxCharacters,5);assert.equal(anonymous.headers.get('cache-control'),'no-store');
    assert.equal((await api(server,null,'/api/characters',{name:'No auth',classId:'warrior'})).status,401);
    const login=await db.identity(),hero=await create(server,login);
    const unauth=await ready(await connect(server,null,hero.id));clients.push(unauth);assert.equal(unauth.error.code,'auth_required');
    const legacy=await ready(await connect(server,login,hero.id,{protocol:2,token:'a'.repeat(48)}));clients.push(legacy);assert.equal(legacy.error.code,'version');
    const key=await ready(await connect(server,login,hero.id,{token:'a'.repeat(48)}));clients.push(key);assert.equal(key.error.code,'invalid_character');
    const forged=await fetch(server.url+'/api/characters',{method:'POST',headers:{...headers(login,server.url),Origin:'https://unrelated.example'},body:JSON.stringify({name:'CSRF',classId:'mage'})});assert.equal(forged.status,403);
    const logout=await fetch(server.url+'/auth/logout',{method:'POST',headers:{Cookie:`ashen_session=${login.cookie}`}});assert.equal(logout.status,403);
    const google=await fetch(server.url+'/auth/google',{redirect:'manual'});assert.equal(google.status,503);
    assert.equal((await fetch(server.url+'/api/stress-session',{method:'POST',headers:headers(login,server.url),body:'{}'})).status,405);
    assert.equal((await api(server,login,'/api/account')).body.characters.length,1);
  }finally{for(const c of clients)await close(c);await stopTestServer(server);await db.close();}
});

test('five character limit is atomic through concurrent HTTP requests; rosters stay private across accounts',{skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase();let server;
  try{
    server=await startTestServer(db);const a=await db.identity(),b=await db.identity();
    const results=await Promise.all(Array.from({length:8},(_,i)=>api(server,a,'/api/characters',{name:`Герой ${i}`,classId:['warrior','archer','mage'][i%3]})));
    assert.equal(results.filter(r=>r.status===201).length,5);assert.equal(results.filter(r=>r.status===409&&r.body.error==='character_limit').length,3);
    const mine=await api(server,a,'/api/account'),other=await api(server,b,'/api/account');assert.equal(mine.body.characters.length,5);assert.deepEqual(other.body.characters,[]);
    for(const hero of mine.body.characters)assert.deepEqual(Object.keys(hero).sort(),['classId','id','level','name']);
    for(const body of [{name:'',classId:'mage'},{name:'x',classId:'admin'},{name:'x'.repeat(19),classId:'archer'}])assert.equal((await api(server,b,'/api/characters',body)).status,400);
    assert.equal((await create(server,b,'Личный','mage')).classId,'mage');
    await stopTestServer(server);server=await startTestServer(db);
    assert.deepEqual((await api(server,a,'/api/account')).body.characters,mine.body.characters);
  }finally{await stopTestServer(server);await db.close();}
});

test('different heroes and cookies of one account cannot play simultaneously; foreign heroes and logout are enforced',{skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase();let server;const clients=[];
  try{
    server=await startTestServer(db);const a=await db.identity('one account'),secondLogin=await db.identity('one account'),b=await db.identity();
    const first=await create(server,a,'Первый'),second=await create(server,a,'Второй','mage');
    const both=await Promise.all([connect(server,a,first.id),connect(server,secondLogin,second.id)]);clients.push(...both);await Promise.all(both.map(ready));
    assert.equal(both.filter(c=>c.state).length,1);assert.equal(both.find(c=>c.error).error.code,'in_use');
    const owner=both.find(c=>c.state),ownerLogin=owner===both[0]?a:secondLogin;
    const stolen=await ready(await connect(server,b,first.id));clients.push(stolen);assert.equal(stolen.error.code,'invalid_character');
    assert(owner.welcome);assert.equal(owner.welcome.protocol,3);assert(!('token' in owner.welcome));
    const before=owner.state.t;await api(server,ownerLogin,'/api/account');await until(()=>owner.state.t>before);assert.equal(owner.ws.readyState,WebSocket.OPEN);
    const signedOut=await api(server,ownerLogin,'/auth/logout',{});assert.equal(signedOut.status,200);await until(()=>owner.ws.readyState===WebSocket.CLOSED);assert.equal(owner.error.code,'auth_required');
    assert.equal((await api(server,ownerLogin,'/api/account')).body.account,null);
    const invalid=await ready(await connect(server,ownerLogin,first.id));clients.push(invalid);assert.equal(invalid.error.code,'auth_required');
    const remainingLogin=owner===both[0]?secondLogin:a;
    const back=await joinAvailable(server,remainingLogin,owner.state.self.id);clients.push(back);assert(back.state,back.error?.text);
  }finally{for(const c of clients)await close(c);await stopTestServer(server);await db.close();}
});

test('session expiry disconnects an idle socket without game packets and stops its AFK',{skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase();let server,c;
  try{
    const hero=newHero('Истечение');await db.seed('expiry',persistentHero(hero));server=await startTestServer(db);
    const login=await db.player({fixture:'expiry'}),cookie=randomBytes(32).toString('base64url');
    await db.withStore(store=>store.createSession(login.account.id,createHash('sha256').update(cookie).digest('hex'),new Date(Date.now()+1800)));
    c=await ready(await connect(server,{cookie},hero.id));assert(c.state,c.error?.text);c.ws.send(JSON.stringify({type:'afk',enabled:true}));await until(()=>c.state.self.afk);
    // ws answers ping automatically; no more application messages are sent.
    await until(()=>c.ws.readyState===WebSocket.CLOSED,{timeout:5000});assert.equal(c.error.code,'auth_required');
    await delay(1200);assert.equal((await api(server,null,'/api/account')).body.account,null);
    const health=await (await fetch(server.url+'/health')).json();assert.equal(health.players,0);assert.equal(health.entities,0);
  }finally{await close(c);await stopTestServer(server);await db.close();}
});

test('reconnect overlapping resident retirement keeps saves registered and retires cleanly afterwards',{skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase();let server,c,again;
  try{
    const hero=newHero('Переподключение');await db.seed('reconnect',persistentHero(hero));const login=await db.player({fixture:'reconnect'});
    server=await startTestServer(db,{environment:{NODE_ENV:'test',GAME_TEST_JOIN_PAUSE_MS:'650'}});
    c=await joinAvailable(server,login,hero.id);assert(c.state,c.error?.text);await close(c);await delay(600);
    again=await joinAvailable(server,login,hero.id);assert(again.state,again.error?.text);
    again.ws.send(JSON.stringify({type:'allocateStats',revision:again.state.self.statRevision,points:{strength:1}}));
    await until(()=>again.state.self.allocatedStats.strength===1);
    assert.equal((await db.load('reconnect')).hero.allocatedStats.strength,1);
    await close(again);await delay(1600);const health=await (await fetch(server.url+'/health')).json();assert.equal(health.players,0);assert.equal(health.entities,0);
  }finally{await close(c);await close(again);await stopTestServer(server);await db.close();}
});

test('logout while character normalization waits for database cannot attach a revoked session',{skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase();let server,c;const sql=new pg.Client({connectionString:db.url});
  try{
    const hero=newHero('Нормализация');await db.seed('normalize',persistentHero(hero));const login=await db.player({fixture:'normalize'});
    await sql.connect();await sql.query('UPDATE heroes SET strength=999 WHERE id=$1',[hero.id]);
    await sql.query(`CREATE FUNCTION test_slow_normalize() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(1); RETURN NEW; END $$`);
    await sql.query('CREATE TRIGGER test_slow_normalize BEFORE UPDATE ON heroes FOR EACH ROW EXECUTE FUNCTION test_slow_normalize()');
    server=await startTestServer(db);c=await connect(server,login,hero.id);
    // Poll pg_stat_activity to synchronize on the actual slow UPDATE, not a guessed delay.
    let normalizing=false;for(let i=0;i<100&&!normalizing;i++){const active=await sql.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state='active' AND query LIKE 'UPDATE heroes SET%' ");normalizing=active.rowCount>0;if(!normalizing)await delay(20);}assert(normalizing);
    const result=await api(server,login,'/auth/logout',{});assert.equal(result.status,200);await ready(c);assert.equal(c.state,null);assert.equal(c.error.code,'auth_required');
  }finally{await close(c);await stopTestServer(server);await sql.end().catch(()=>{});await db.close();}
});
