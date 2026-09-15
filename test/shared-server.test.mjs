import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocket} from 'ws';
import {newHero,persistentHero,makeLoot} from '../dist/world.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer} from './helpers/network.mjs';
const until=async(predicate,timeout=6000)=>{const end=Date.now()+timeout;while(!predicate()){assert(Date.now()<end,'Timed out waiting for server state');await delay(20);}};
async function connect(server,join={}){
  const c={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url}),history:[],events:[]};
  c.ws.on('message',b=>{const m=JSON.parse(b);if(m.type==='welcome')c.welcome=m;if(m.type==='state'){c.state=m;c.events.push(...m.events);}if(m.type==='error')c.error=m;});
  c.send=m=>c.ws.send(JSON.stringify(m));await once(c.ws,'open');c.send({type:'join',protocol:2,...join});await until(()=>c.state||c.error);return c;
}
async function close(c){if(!c||c.ws.readyState===WebSocket.CLOSED)return;const done=once(c.ws,'close');c.ws.close();await done;}

test('HTTP serves only the 3D client, models and public rules; save files and legacy assets stay inaccessible',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase();let server;
  try{server=await startTestServer(database);
    const page=await fetch(server.url);assert.equal(page.status,200);const html=await page.text();assert(html.includes('game/scene.js'));assert(!html.includes('src="game.js"'));
    for(const file of ['/data/heroes.json','/../data/heroes.json','/world.mjs','/__stress/info','/__stress/report','/world.ts','/server.ts','/game/scene.ts','/game/scene.js.map','/dist/server.js','/game.js','/world.json','/assets/tiny-dungeon/tilemap.png','/game/../../data/heroes.json'])assert.equal((await fetch(server.url+file)).status,404,file);
    const module=await fetch(server.url+'/game/scene.js');assert.equal(module.status,200);assert.match(module.headers.get('content-type'),/javascript/);assert((await module.text()).includes('WebGLRenderer'));
    const model=await fetch(server.url+'/game/characters/ashen-warrior-v1.glb',{method:'HEAD'});assert.equal(model.status,200);assert.equal(model.headers.get('content-type'),'model/gltf-binary');
    assert.equal((await fetch(server.url+'/game/creature-preview.html')).status,200);
    assert.equal((await fetch(server.url+'/health')).status,200);
    const oldWorkshop=await fetch(server.url+'/art-test/character-preview.html');assert(oldWorkshop.url.endsWith('/game/character-preview.html'));
    await new Promise(resolve=>{const socket=new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:'https://unrelated.example'});socket.on('unexpected-response',(_,res)=>{assert.equal(res.statusCode,403);res.resume();socket.terminate();resolve();});socket.on('error',()=>{});});
  }finally{await stopTestServer(server);await database.close();}
});
test('real WebSockets share movement/boss rewards and keep identity, loot and cooldowns through disconnect and restart',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase();let server;const clients=[];
  try{
    const a=newHero('Первый'),b=newHero('Второй'),third=newHero('Третий','archer');
    Object.assign(a,{x:23.8,z:-1.2,level:8,questKills:4});Object.assign(b,{x:24.2,z:-2.2,level:8,questKills:4});
    Object.assign(third,{level:10,gold:2189,xp:317});
    const keys=['a'.repeat(48),'b'.repeat(48),'c'.repeat(48)];
    for(const [token,hero] of [[keys[0],a],[keys[1],b],[keys[2],third]])await database.seed(token,persistentHero(hero));
    server=await startTestServer(database);
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
    const thirdClient=await connect(server,{token:keys[2]});clients.push(thirdClient);assert.equal(thirdClient.state.self.classId,'archer');assert.equal(thirdClient.state.self.gold,2189);assert.equal(thirdClient.state.self.level,10);assert.equal(thirdClient.state.self.xp,317);
    // Real acknowledged input is visible to a different client, with no coordinate command.
    const startX=thirdClient.state.self.x;for(let seq=1;seq<=8;seq++){thirdClient.send({type:'input',x:1,z:0,aim:Math.PI/2,seq});await delay(55);}
    await until(()=>cb.state.players.some(p=>p.id===thirdClient.state.self.id&&p.x>startX+.4));
    thirdClient.send({type:'input',x:0,z:0,aim:null,seq:9});
    const identity=thirdClient.state.self.id;
    await stopTestServer(server);server=await startTestServer(database);
    const restored=await connect(server,{token:keys[0]});clients.push(restored);
    for(const k of ['id','gold','xp','items','boss'])assert.deepEqual(restored.state.self[k],earned[k],k);
    const oldAgain=await connect(server,{token:keys[2]});clients.push(oldAgain);assert.equal(oldAgain.state.self.id,identity);assert.equal(oldAgain.state.self.gold,2189);assert.equal(oldAgain.state.self.level,10);
    assert.equal(new Set((await Promise.all(keys.map(token=>database.load(token)))).map(row=>row.hero.id)).size,3);
  }finally{for(const c of clients)await close(c);await stopTestServer(server);await database.close();}
});

test('stat allocation is atomic over WebSocket and restores a saved archer from PostgreSQL',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase();let server;const clients=[];
  try{
    const fixture=newHero('Наследник','archer');
    Object.assign(fixture,{level:7,xp:173,gold:842,questKills:5,boss:true,questClaimed:true});
    const saved=persistentHero(fixture);
    const token='d'.repeat(48);
    await database.seed(token,saved);
    server=await startTestServer(database);
    const owner=await connect(server,{token,classId:'mage'}),observer=await connect(server,{name:'Наблюдатель',classId:'mage'});clients.push(owner,observer);
    const p=owner.state.self;
    assert.equal(p.schemaVersion,3);assert.equal(p.unspentPoints,35);
    for(const field of ['id','classId','level','xp','gold','questKills','boss','questClaimed','items','equipment','x','z'])assert.deepEqual(p[field],saved[field],field);

    async function command(message,ok){
      owner.events.length=0;owner.send(message);
      await until(()=>owner.events.some(e=>e.type==='statResult'));
      const result=owner.events.find(e=>e.type==='statResult');assert.equal(result.ok,ok);
      return structuredClone(owner.state.self);
    }
    const revision=p.statRevision,request={type:'allocateStats',points:{strength:3,vitality:2},revision};
    const allocated=await command(request,true);
    assert.equal(allocated.unspentPoints,30);assert.equal(allocated.allocatedStats.strength,3);assert.equal(allocated.allocatedStats.vitality,2);
    assert.equal(allocated.statRevision,revision+1);assert(allocated.maxHp>p.maxHp);assert(allocated.attackPower>p.attackPower);
    const replay=await command(request,false);assert.deepEqual(replay.allocatedStats,allocated.allocatedStats);assert.equal(replay.statRevision,allocated.statRevision);
    for(const points of [{strength:31},{strength:-1},{energy:.5},{dexterity:1,admin:1}]){
      const rejected=await command({type:'allocateStats',points,revision:allocated.statRevision},false);
      assert.equal(rejected.unspentPoints,30);assert.deepEqual(rejected.allocatedStats,allocated.allocatedStats);
    }
    await until(()=>observer.state.players.some(peer=>peer.id===saved.id));
    const peer=observer.state.players.find(peer=>peer.id===saved.id);
    for(const privateField of ['allocatedStats','attributes','unspentPoints','statRevision','items','token'])assert(!(privateField in peer),privateField);
    assert(!observer.events.some(e=>e.type==='statResult'));

    // The stored archer class also wins over old clients and forged class commands.
    for(const classId of ['warrior','mage','archer']){
      owner.events.length=0;owner.send({type:'class',classId});
      await until(()=>owner.events.some(e=>e.type==='notice'&&e.text==='Класс выбирается при создании героя и не меняется'));
      for(const field of ['id','classId','level','xp','gold','items','equipment','allocatedStats','statRevision','unspentPoints'])assert.deepEqual(owner.state.self[field],allocated[field],field);
    }
    await close(owner);
    const rejoined=await connect(server,{token,classId:'warrior'});clients.push(rejoined);
    assert.equal(rejoined.state.self.classId,'archer');
    assert.deepEqual(rejoined.state.self.allocatedStats,allocated.allocatedStats);assert.equal(rejoined.state.self.unspentPoints,30);
    await stopTestServer(server);server=await startTestServer(database);
    const restored=await connect(server,{token,classId:'mage'});clients.push(restored);
    for(const field of ['id','classId','level','xp','gold','questKills','boss','questClaimed','items','equipment','allocatedStats','statRevision'])assert.deepEqual(restored.state.self[field],allocated[field],field);
    assert.equal(restored.state.self.unspentPoints,30);
    const disk=(await database.load(token)).hero;
    assert.equal(disk.schemaVersion,3);assert.deepEqual(disk.allocatedStats,allocated.allocatedStats);
  }finally{for(const client of clients)await close(client);await stopTestServer(server);await database.close();}
});


test('isolated stress controller creates 16 real sessions and cleans up; ordinary servers cannot access it',{skip:!hasTestDatabase},async()=>{
  const database=await createTestDatabase(),dir=await mkdtemp(path.join(tmpdir(),'ashen-stress-'));let server;const clients=[];
  try{
    await writeFile(path.join(dir,'.stress-sandbox'),'temporary benchmark world\n');
    server=await startTestServer(database,{dataDir:dir,environment:{GAME_STRESS:'1',GAME_STRESS_REPORTS:dir,NODE_ENV:'development'}});
    const viewer=await connect(server,{name:'Benchmark viewer',classId:'warrior'});clients.push(viewer);
    const post=(route,body,origin=server.url)=>fetch(server.url+'/__stress/'+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await post('scenario',{players:16,mode:'camp'},'https://unrelated.example')).status,403);
    assert.equal((await post('scenario',{players:64,mode:'camp'})).status,400);
    const crowd=await post('scenario',{players:16,mode:'camp'});assert.equal(crowd.status,200);assert.equal((await crowd.json()).players,16);
    await until(()=>viewer.state.players.length===16);
    const extra=await connect(server,{name:'Capacity check',classId:'warrior'});clients.push(extra);assert.equal(extra.error.code,'full');
    const cleanup=await post('scenario',{players:1,mode:'camp'});assert.equal(cleanup.status,200);assert.equal((await cleanup.json()).players,1);
    const info=await (await fetch(server.url+'/__stress/info')).json();assert.equal(info.server.bots,0);assert.deepEqual(info.server.errors,[]);
  }finally{for(const c of clients)await close(c);await stopTestServer(server);await database.close();await rm(dir,{recursive:true,force:true});}
});

test('rolled equipment survives real WebSocket equip, observer updates and a server restart',{skip:!hasTestDatabase},async()=>{
  const {backpackItems}=await import('../dist/public/rules.js');
  const {rollEquipment}=await import('../dist/public/game/equipment-items.js');
  const database=await createTestDatabase();let server;const clients=[];
  try{
    const hero=newHero('Экипировка'),observer=newHero('Наблюдатель');
    const armor=rollEquipment('wanderer-armor','rolled-armor',()=>.7),blade=rollEquipment('watch-blade','rolled-blade',()=>.3);
    hero.items.push(armor,blade);const original=structuredClone(hero.items);const keys=['d'.repeat(48),'e'.repeat(48)];
    await database.seed(keys[0],persistentHero(hero));await database.seed(keys[1],persistentHero(observer));
    server=await startTestServer(database);const owner=await connect(server,{token:keys[0]}),watcher=await connect(server,{token:keys[1]});clients.push(owner,watcher);
    owner.send({type:'equip',id:armor.id,rolls:[{key:'maxHp',value:99999}]});owner.send({type:'equip',id:blade.id});
    await until(()=>watcher.state.players.some(p=>p.id===hero.id&&p.appearance?.armor==='wanderer-armor'&&p.appearance?.weapon==='watch-sword'));
    assert.deepEqual(owner.state.self.items,original);assert.equal(owner.state.self.maxHp,112);
    assert(!backpackItems(owner.state.self).some(item=>item.id===armor.id||item.id===blade.id));
    for(const client of clients)await close(client);clients.length=0;await stopTestServer(server);server=await startTestServer(database);
    const restored=await connect(server,{token:keys[0]});clients.push(restored);
    assert.deepEqual(restored.state.self.items,original);assert.equal(restored.state.self.equipment.armor,armor.id);
    restored.send({type:'unequip',id:armor.id});await until(()=>restored.state.self.equipment.armor===null);
    assert.equal(restored.state.self.appearance.armor,null);assert.deepEqual(restored.state.self.items,original);
    assert.equal(backpackItems(restored.state.self).filter(item=>item.id===armor.id).length,1);
    assert(!backpackItems(restored.state.self).some(item=>item.id===blade.id));
  }finally{for(const client of clients)await close(client);await stopTestServer(server);await database.close();}
});
