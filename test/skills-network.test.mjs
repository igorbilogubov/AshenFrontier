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

async function until(predicate,timeout=5000){const end=Date.now()+timeout;while(!predicate()){assert(Date.now()<end,'Timed out waiting for skill state');await delay(20);}}
async function start(dir){
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',GAME_HOST:'127.0.0.1',GAME_DATA_DIR:dir,GAME_PREVIEW_ALIAS:'0'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  await until(()=>/http:\/\/127\.0\.0\.1:\d+/.test(output)||child.exitCode!==null);
  assert.equal(child.exitCode,null,output);
  return {child,url:output.match(/http:\/\/127\.0\.0\.1:\d+/)[0]};
}
async function stop(server){if(!server||server.child.exitCode!==null)return;const ended=once(server.child,'exit');server.child.kill('SIGTERM');await ended;}
async function connect(server,join){
  const c={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url}),states:[],events:[]};
  c.ws.on('message',data=>{const message=JSON.parse(data);if(message.type==='state'){c.state=message;c.states.push(message);c.events.push(...message.events);}if(message.type==='welcome')c.welcome=message;});
  await once(c.ws,'open');c.ws.send(JSON.stringify({type:'join',protocol:2,...join}));await until(()=>c.state);return c;
}
async function close(c){if(!c||c.ws.readyState===WebSocket.CLOSED)return;const ended=once(c.ws,'close');c.ws.close();await ended;}

test('real skill packets expose only public cast/impact, and private mana/cooldowns survive server restart',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'ashen-skills-network-')),token='f'.repeat(48),hero=newHero('Сетевая магия','mage');
  Object.assign(hero,{x:6.3,z:1.8,yaw:Math.PI/2,targetYaw:Math.PI/2});
  await writeFile(path.join(dir,'heroes.json'),JSON.stringify({[token]:persistentHero(hero)}));
  let server;const clients=[];
  try{
    server=await start(dir);
    const owner=await connect(server,{token}),observer=await connect(server,{name:'Наблюдатель',classId:'warrior'});clients.push(owner,observer);
    const originalMana=owner.state.self.mana;
    owner.ws.send(JSON.stringify({type:'skill',skillId:'mage-fireball',yaw:Math.PI/2,damage:999999,manaCost:0,cooldown:0}));
    await until(()=>owner.states.some(state=>state.self?.attack?.skillId==='mage-fireball'));
    assert(owner.state.self.mana>=originalMana-24&&owner.state.self.mana<originalMana-23.5);
    await until(()=>observer.states.some(state=>state.players.some(p=>p.id===hero.id&&p.attack?.skillId==='mage-fireball')));
    assert(!('skillCooldowns' in observer.state.players.find(p=>p.id===hero.id)));
    await until(()=>observer.events.some(event=>event.type==='skillImpact'&&event.skillId==='mage-fireball'));
    assert(observer.events.some(event=>event.type==='skillImpact'&&event.yaw===Math.PI/2));
    assert(owner.state.self.skillCooldowns['mage-fireball']>0);
    await close(owner);await close(observer);await stop(server);
    const saved=JSON.parse(await readFile(path.join(dir,'heroes.json'),'utf8'))[token];
    assert.equal(saved.mana<originalMana,true);assert(saved.skillCooldowns['mage-fireball']>0);
    server=await start(dir);const restored=await connect(server,{token});clients.push(restored);
    assert.equal(restored.state.self.classId,'mage');assert(restored.state.self.mana>=saved.mana&&restored.state.self.mana<originalMana);
    assert(restored.state.self.skillCooldowns['mage-fireball']>0);
  }finally{for(const client of clients)await close(client);await stop(server);await rm(dir,{recursive:true,force:true});}
});
