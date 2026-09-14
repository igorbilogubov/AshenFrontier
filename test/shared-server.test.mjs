import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocket} from 'ws';
import {newHero,persistentHero,makeLoot} from '../world.mjs';
const until=async(predicate,timeout=6000)=>{const end=Date.now()+timeout;while(!predicate()){assert(Date.now()<end,'Timed out waiting for server state');await delay(20);}};
async function start(dir){
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',GAME_HOST:'127.0.0.1',GAME_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  await until(()=>/http:\/\/127\.0\.0\.1:\d+/.test(output)||child.exitCode!==null);assert.equal(child.exitCode,null,output);return {child,url:output.match(/http:\/\/127\.0\.0\.1:\d+/)[0]};
}
async function stop(server){if(!server||server.child.exitCode!==null)return;const ended=once(server.child,'exit');server.child.kill('SIGTERM');await ended;}
async function connect(server,join={}){
  const c={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url}),history:[],events:[]};
  c.ws.on('message',b=>{const m=JSON.parse(b);if(m.type==='welcome')c.welcome=m;if(m.type==='state'){c.state=m;c.events.push(...m.events);}if(m.type==='error')c.error=m;});
  c.send=m=>c.ws.send(JSON.stringify(m));await once(c.ws,'open');c.send({type:'join',protocol:2,...join});await until(()=>c.state||c.error);return c;
}
async function close(c){if(!c||c.ws.readyState===WebSocket.CLOSED)return;const done=once(c.ws,'close');c.ws.close();await done;}

test('HTTP serves only the 3D client, models and public rules; save files and legacy assets stay inaccessible',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'ashen-http-'));let server;
  try{server=await start(dir);
    const page=await fetch(server.url);assert.equal(page.status,200);const html=await page.text();assert(html.includes('game/scene.js'));assert(!html.includes('src="game.js"'));
    for(const file of ['/data/heroes.json','/../data/heroes.json','/world.mjs','/game.js','/world.json','/assets/tiny-dungeon/tilemap.png','/game/../../data/heroes.json'])assert.equal((await fetch(server.url+file)).status,404,file);
    const model=await fetch(server.url+'/game/characters/ashen-warrior-v1.glb',{method:'HEAD'});assert.equal(model.status,200);assert.equal(model.headers.get('content-type'),'model/gltf-binary');
    assert.equal((await fetch(server.url+'/game/creature-preview.html')).status,200);
    assert.equal((await fetch(server.url+'/health')).status,200);
    const oldWorkshop=await fetch(server.url+'/art-test/character-preview.html');assert(oldWorkshop.url.endsWith('/game/character-preview.html'));
    await new Promise(resolve=>{const socket=new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:'https://unrelated.example'});socket.on('unexpected-response',(_,res)=>{assert.equal(res.statusCode,403);res.resume();socket.terminate();resolve();});socket.on('error',()=>{});});
  }finally{await stop(server);await rm(dir,{recursive:true,force:true});}
});
test('real WebSockets share movement/boss rewards and keep identity, loot and cooldowns through disconnect and restart',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'ashen-multiplayer-'));let server;const clients=[];
  try{
    const a=newHero('Первый'),b=newHero('Второй'),legacy=newHero('Старый','archer');
    Object.assign(a,{x:23.8,z:-1.2,level:8,questKills:4});Object.assign(b,{x:24.2,z:-2.2,level:8,questKills:4});
    const old=persistentHero(legacy);delete old.schemaVersion;delete old.z;old.x=720;old.y=1728;old.level=10;old.gold=2189;old.xp=317;
    const keys=['a'.repeat(48),'b'.repeat(48),'c'.repeat(48)];await writeFile(path.join(dir,'heroes.json'),JSON.stringify({[keys[0]]:persistentHero(a),[keys[1]]:persistentHero(b),[keys[2]]:old}));
    server=await start(dir);assert((await readdir(dir)).some(f=>f.startsWith('heroes-before-3d-')));
    const ca=await connect(server,{token:keys[0]}),cb=await connect(server,{token:keys[1]});clients.push(ca,cb);
    await until(()=>ca.state.players.length===2&&cb.state.players.length===2);
    const duplicate=await connect(server,{token:keys[0]});clients.push(duplicate);assert.equal(duplicate.error.code,'in_use');
    const bad=await connect(server,{token:'invented'});clients.push(bad);assert.equal(bad.error.code,'invalid_key');
    const attack=()=>{for(const c of [ca,cb]){const boss=c.state.mobs[6],p=c.state.self;if(boss.state!=='dead')c.send({type:'attack',yaw:Math.atan2(boss.x-p.x,boss.z-p.z),damage:99999});}};
    const attacking=setInterval(attack,180);
    try{await until(()=>ca.state.self.boss&&cb.state.self.boss,9000);}finally{clearInterval(attacking);}
    for(const c of [ca,cb]){assert.equal(c.state.self.gold,35);assert.equal(c.state.self.questKills,5);assert.equal(c.state.self.items.length,3);assert(c.state.self.xp>0);assert.equal(c.state.mobs[6].state,'dead');}
    const earned={id:ca.state.self.id,gold:ca.state.self.gold,xp:ca.state.self.xp,items:ca.state.self.items,boss:ca.state.self.boss};
    ca.send({type:'potion'});await delay(80);const hp=ca.state.self.hp;
    await close(ca);const rejoined=await connect(server,{token:keys[0]});clients.push(rejoined);
    assert.equal(rejoined.state.self.id,earned.id);assert(rejoined.state.self.hp<=hp);assert.deepEqual(rejoined.state.self.items,earned.items);assert.equal(rejoined.state.self.gold,35);
    const migrated=await connect(server,{token:keys[2]});clients.push(migrated);assert.equal(migrated.state.self.classId,'archer');assert.equal(migrated.state.self.gold,2189);assert.equal(migrated.state.self.level,10);assert.equal(migrated.state.self.xp,317);
    // Real acknowledged input is visible to a different client, with no coordinate command.
    const startX=migrated.state.self.x;for(let seq=1;seq<=8;seq++){migrated.send({type:'input',x:1,z:0,aim:Math.PI/2,seq});await delay(55);}
    await until(()=>cb.state.players.some(p=>p.id===migrated.state.self.id&&p.x>startX+.4));
    migrated.send({type:'input',x:0,z:0,aim:null,seq:9});
    const identity=migrated.state.self.id;
    await stop(server);server=await start(dir);
    const restored=await connect(server,{token:keys[0]});clients.push(restored);
    for(const k of ['id','gold','xp','items','boss'])assert.deepEqual(restored.state.self[k],earned[k],k);
    const oldAgain=await connect(server,{token:keys[2]});clients.push(oldAgain);assert.equal(oldAgain.state.self.id,identity);assert.equal(oldAgain.state.self.gold,2189);assert.equal(oldAgain.state.self.level,10);
    assert.equal(new Set(Object.values(JSON.parse(await readFile(path.join(dir,'heroes.json'),'utf8'))).map(p=>p.id)).size,3);
  }finally{for(const c of clients)await close(c);await stop(server);await rm(dir,{recursive:true,force:true});}
});
