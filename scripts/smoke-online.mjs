// Creates two dedicated QA heroes, or reconnects them after a service restart.
// Hero keys are written only to a private local file, never to stdout or URLs.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocket} from 'ws';

const base=(process.argv[2]||'http://127.0.0.1:4731').replace(/\/$/,''),restore=process.argv.includes('--restore');
const directory=new URL('../artifacts/shared-3d/',import.meta.url),file=new URL('online-heroes.json',directory);
await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
const wait=async(fn)=>{const end=Date.now()+12000;while(!fn()){assert(Date.now()<end,'Timed out waiting for the online world');await delay(30);}};
const clients=[];
async function join(options){
  const c={socket:new WebSocket(base.replace(/^http/,'ws')+'/ws',{origin:base})};clients.push(c);
  c.send=m=>c.socket.send(JSON.stringify(m));
  c.socket.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome')c.identity=m;if(m.type==='state')c.state=m;if(m.type==='error')c.error=m.code;});
  c.socket.on('error',()=>{c.error='connection';});
  await once(c.socket,'open');c.send({type:'join',protocol:2,...options});await wait(()=>c.state||c.error);assert(!c.error,c.error);return c;
}
const durable=p=>Object.fromEntries(['id','name','classId','level','xp','gold','kills','items','equipment','x','z','weapon','potions','questKills','boss','questClaimed'].map(k=>[k,p[k]]));
try{
  const health=await fetch(base+'/health');assert.equal(health.status,200);assert.equal((await health.json()).world,'ashen-opushka-3d');
  const html=await (await fetch(base)).text();assert(html.includes('game/scene.js'));
  for(const route of ['/data/heroes.json','/game.js','/assets/tiny-dungeon/tilemap.png'])assert.equal((await fetch(base+route)).status,404);
  for(const route of ['/game/characters/ashen-warrior-v1.glb','/game/creatures/alpha.glb'])assert.equal((await fetch(base+route,{method:'HEAD'})).status,200);
  if(restore){
    const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.base,base);
    for(const hero of saved.heroes){const c=await join({token:hero.token});assert.deepEqual(durable(c.state.self),hero.state);}
  }else{
    const first=await join({name:'Проверка мира',classId:'warrior'}),second=await join({name:'Проверка сохранений',classId:'archer'});
    await wait(()=>first.state.players.some(p=>p.id===second.state.self.id)&&second.state.players.some(p=>p.id===first.state.self.id));
    const start=first.state.self.x;
    for(let seq=1;seq<=10;seq++){first.send({type:'input',seq,x:1,z:0,aim:Math.PI/2});await delay(55);}
    first.send({type:'input',seq:11,x:0,z:0,aim:null});await wait(()=>first.state.self.ack===11);
    await wait(()=>second.state.players.some(p=>p.id===first.state.self.id&&p.x>start+.7));
    await delay(2400);assert(first.state.save.ok&&first.state.save.at>0);
    await writeFile(file,JSON.stringify({base,heroes:clients.map(c=>({token:c.identity.token,state:durable(c.state.self)}))},null,2),{mode:0o600});await chmod(file,0o600);
  }
  console.log(JSON.stringify({ok:true,mode:restore?'restore':'shared-world',heroes:clients.length,world:'ashen-opushka-3d',persistentStateVerified:restore}));
}finally{
  for(const c of clients){if(c.socket.readyState===WebSocket.OPEN){const closed=once(c.socket,'close');c.socket.close();await closed;}else c.socket.terminate();}
}
