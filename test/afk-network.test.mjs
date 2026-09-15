import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocket} from 'ws';
import {newHero,persistentHero} from '../dist/world.js';
import {AFK_SPOTS} from '../dist/public/game/location.js';

async function until(predicate,timeout=5000){const end=Date.now()+timeout;while(!predicate()){assert(Date.now()<end,'Timed out waiting for AFK state');await delay(20);}}
async function start(dir){
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',GAME_HOST:'127.0.0.1',GAME_DATA_DIR:dir,GAME_PREVIEW_ALIAS:'0'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  await until(()=>/http:\/\/127\.0\.0\.1:\d+/.test(output)||child.exitCode!==null);assert.equal(child.exitCode,null,output);
  return {child,url:output.match(/http:\/\/127\.0\.0\.1:\d+/)[0]};
}
async function stop(server){if(!server||server.child.exitCode!==null)return;const ended=once(server.child,'exit');server.child.kill('SIGTERM');await ended;}
async function connect(server,join){
  const c={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url}),states:[]};
  c.ws.on('message',data=>{const message=JSON.parse(data);if(message.type==='state'){c.state=message;c.states.push(message);}});
  await once(c.ws,'open');c.ws.send(JSON.stringify({type:'join',protocol:2,...join}));await until(()=>c.state);return c;
}
async function close(c){if(!c||c.ws.readyState===WebSocket.CLOSED)return;const ended=once(c.ws,'close');c.ws.close();await ended;}

test('real online AFK stops with the socket and never resumes from saved V3 after restart',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'ashen-afk-network-')),token='e'.repeat(48),spot=AFK_SPOTS[0],hero=newHero('Сетевой загон','warrior');
  Object.assign(hero,{x:spot.x,z:spot.z});await writeFile(path.join(dir,'heroes.json'),JSON.stringify({[token]:persistentHero(hero)}));
  let server;const clients=[];
  try{
    server=await start(dir);const owner=await connect(server,{token}),observer=await connect(server,{name:'Наблюдатель',classId:'mage'});clients.push(owner,observer);
    assert.equal(owner.state.self.afk,null);
    owner.ws.send(JSON.stringify({type:'afk',enabled:true,spotId:'forged',damage:999999}));
    await until(()=>owner.states.some(state=>state.self.afk?.spotId===spot.id));
    assert(!('afk' in observer.state.players.find(player=>player.id===hero.id)));
    await close(owner);await close(observer);await stop(server);
    const saved=JSON.parse(await readFile(path.join(dir,'heroes.json'),'utf8'))[token];assert(!('afk' in saved));
    server=await start(dir);const restored=await connect(server,{token});clients.push(restored);
    assert.equal(restored.state.self.afk,null);assert.equal(restored.state.self.id,saved.id);
    assert.equal(restored.state.self.kills,saved.kills);assert.equal(restored.state.self.questKills,saved.questKills);
    await delay(180);assert(restored.states.every(state=>state.self.afk===null));
  }finally{for(const client of clients)await close(client);await stop(server);await rm(dir,{recursive:true,force:true});}
});
