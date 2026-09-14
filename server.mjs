import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import {readFileSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {World,newHero,safeHero,persistentHero,CLASSES,SAVE_VERSION} from './world.mjs';

const root=path.dirname(fileURLToPath(import.meta.url)),publicRoot=path.join(root,'public');
const dataDir=process.env.GAME_DATA_DIR||path.join(root,'data'),saveFile=path.join(dataDir,'heroes.json');
const port=Number(process.env.PORT||4731),host=process.env.GAME_HOST||'127.0.0.1';
const allowedOrigins=new Set((process.env.GAME_ALLOWED_ORIGINS||'').split(',').filter(Boolean));
await fs.mkdir(dataDir,{recursive:true,mode:0o700});
// Docker already enforces the unique game container; local commands also take a PID lock.
if(process.env.NODE_ENV!=='production'){
// A single process owns each save directory, even if started on another port.
const lockFile=path.join(dataDir,'.server.lock'),lockValue=JSON.stringify({pid:process.pid,nonce:randomBytes(12).toString('hex')});
try{
  const previous=JSON.parse(await fs.readFile(lockFile,'utf8'));
  let alive=true;try{process.kill(previous.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}
  if(alive)throw new Error('This save directory is already in use by a game server');
  await fs.unlink(lockFile);
}catch(error){if(error.code!=='ENOENT')throw error;}
const lock=await fs.open(lockFile,'wx',0o600);try{await lock.writeFile(lockValue);}finally{await lock.close();}
process.once('exit',()=>{try{if(readFileSync(lockFile,'utf8')===lockValue)unlinkSync(lockFile);}catch{}});

}
let saves={};
try{
  saves=JSON.parse(await fs.readFile(saveFile,'utf8'));
  if(!saves||Array.isArray(saves)||typeof saves!=='object')throw new Error('Invalid save root');
  if(Object.values(saves).some(p=>p.schemaVersion!==SAVE_VERSION)){
    const migration=Object.values(saves).some(p=>!Number.isInteger(p.schemaVersion)||p.schemaVersion<2)?'3d':`stats-v${SAVE_VERSION}`;
    const backup=path.join(dataDir,`heroes-before-${migration}-${Date.now()}.json`);await fs.copyFile(saveFile,backup);await fs.chmod(backup,0o600);
  }
}catch(e){if(e.code!=='ENOENT')throw new Error(`Cannot read saved heroes: ${e.message}`);}
const world=new World(),sessions=new Map(),connections=new Map(),chat=[];
let dirty=false,lastSavedAt=0,saveHealthy=true,shuttingDown=false,saveChain=Promise.resolve();
function save(){
  saveChain=saveChain.then(async()=>{
    if(!dirty)return;dirty=false;
    for(const [token,{p}] of sessions)saves[token]=persistentHero(p);
    const serialized=JSON.stringify(saves,null,2),temp=saveFile+'.tmp';
    try{
      const file=await fs.open(temp,'w',0o600);
      try{await file.writeFile(serialized);await file.sync();}finally{await file.close();}
      await fs.rename(temp,saveFile);lastSavedAt=Date.now();saveHealthy=true;
    }catch(error){dirty=true;saveHealthy=false;console.error('Save failed:',error.message);}
  });
  return saveChain;
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary'};
const server=http.createServer(async(req,res)=>{
  try{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/health'){
      res.writeHead(saveHealthy?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:JSON.stringify({ok:saveHealthy,world:'ashen-opushka-3d',players:connections.size,entities:world.players.size,saveVersion:SAVE_VERSION}));return;
    }
    // Keep previously bookmarked workshops reachable, without serving the obsolete app.
    if(url.pathname==='/art-test.html'||url.pathname.startsWith('/art-test/')){
      res.writeHead(302,{Location:url.pathname==='/art-test.html'?'/':url.pathname.replace('/art-test/','/game/')});res.end();return;
    }
    const pathname=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    if(pathname!=='/index.html'&&pathname!=='/rules.js'&&!pathname.startsWith('/game/')){res.writeHead(404);res.end('Not found');return;}
    const filename=path.resolve(publicRoot,'.'+pathname);
    if(!filename.startsWith(publicRoot+path.sep)||!Object.hasOwn(mime,path.extname(filename))){res.writeHead(404);res.end();return;}
    const data=await fs.readFile(filename);
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)],'Content-Length':data.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
    res.end(req.method==='HEAD'?undefined:data);
  }catch(e){res.writeHead(e.code==='ENOENT'||e.code==='EISDIR'?404:400);res.end('Not found');}
});
let previewServer;
const wss=new WebSocketServer({noServer:true,maxPayload:4096});
server.on('upgrade',(req,socket,head)=>{
  const origin=req.headers.origin,pathname=new URL(req.url,'http://localhost').pathname;
  if(shuttingDown||pathname!=='/ws'||(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`&&!allowedOrigins.has(origin))){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
const send=(ws,msg)=>{if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<256000)ws.send(JSON.stringify(msg));};
function release(ws){
  const entry=connections.get(ws);if(!entry)return;
  connections.delete(ws);entry.ws=null;entry.p.connected=false;entry.p.input={...entry.p.input,x:0,z:0,aim:null};
  entry.p.disconnectAt=Math.max(Date.now()+1000,entry.p.combatUntil);dirty=true;void save();
}
wss.on('connection',ws=>{
  let entry=null,lastChat=0,windowStart=Date.now(),messages=0;ws.alive=true;ws.on('pong',()=>ws.alive=true);
  const helloTimeout=setTimeout(()=>ws.close(1008,'Join first'),8000);
  const reject=(code,text)=>{send(ws,{type:'error',code,text});ws.close(1008,code);};
  ws.on('message',raw=>{
    try{
      if(shuttingDown)return;
      const now=Date.now();if(now-windowStart>1000){windowStart=now;messages=0;}if(++messages>70){ws.close(1008,'Too many messages');return;}
      const msg=JSON.parse(raw.toString());if(!msg||typeof msg!=='object')return;
      if(!entry){
        if(msg.type!=='join')return;
        if(msg.protocol!==2){reject('version','Обновите страницу игры');return;}
        const candidate=typeof msg.token==='string'&&/^[a-f0-9]{48}$/.test(msg.token)?msg.token:null;
        if(msg.token&&(!candidate||(!saves[candidate]&&!sessions.has(candidate)))){reject('invalid_key','Ключ героя не найден на этом сервере');return;}
        const existing=candidate?sessions.get(candidate):null;
        if(existing?.ws&&existing.ws.readyState===WebSocket.OPEN){reject('in_use','Герой уже открыт в другой вкладке. Закройте её и повторите вход.');return;}
        if(connections.size>=16||(!existing&&world.players.size>=16)){reject('full','Мир заполнен. Повторяем подключение через несколько секунд.');return;}
        if(!candidate&&msg.classId!==undefined&&!Object.hasOwn(CLASSES,msg.classId)){reject('invalid_class','Выберите воина, лучника или мага');return;}
        const token=candidate||randomBytes(24).toString('hex');
        if(existing){entry=existing;entry.ws=ws;entry.p.input={x:0,z:0,aim:null,seq:0};entry.p.ack=0;}
        else{const p=safeHero(candidate?saves[token]:newHero(typeof msg.name==='string'?msg.name:'Странник',msg.classId));entry={token,p,ws};sessions.set(token,entry);}
        world.add(entry.p);connections.set(ws,entry);dirty=true;clearTimeout(helloTimeout);
        send(ws,{type:'welcome',protocol:2,id:entry.p.id,token,chat});void save();return;
      }
      if(msg.type==='chat'&&typeof msg.text==='string'&&now-lastChat>1000){
        const text=msg.text.replace(/[\p{C}]/gu,'').trim().slice(0,180);
        if(text){lastChat=now;const message={name:entry.p.name,text,t:now};chat.push(message);if(chat.length>40)chat.shift();for(const client of connections.keys())send(client,{type:'chat',entry:message});}return;
      }
      if(msg.type==='ping'){send(ws,{type:'pong',t:msg.t});return;}
      world.command(entry.p,msg);dirty=true;
    }catch{} // Packets never replace authoritative state.
  });
  ws.on('close',()=>{clearTimeout(helloTimeout);release(ws);});ws.on('error',()=>{});
});
let last=Date.now();
const tick=setInterval(()=>{
  const now=Date.now(),dt=Math.min(.1,(now-last)/1000);last=now;world.tick(dt,now);
  for(const [token,entry] of sessions)if(!entry.ws&&entry.p.disconnectAt<=now){saves[token]=persistentHero(entry.p);world.remove(entry.p.id);sessions.delete(token);dirty=true;}
  for(const [ws,{p}] of connections)send(ws,{type:'state',...world.snapshot(p.id),save:{at:lastSavedAt,ok:saveHealthy}});
  world.events=[];if(sessions.size)dirty=true;
},50);
const saveTimer=setInterval(()=>void save(),2000);
const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){release(ws);ws.terminate();continue;}ws.alive=false;ws.ping();}},5000);
server.listen(port,host,()=>{
  console.log(`Пепельный рубеж: http://${host}:${server.address().port}\nShared 3D world; persistent heroes enabled`);
  const aliasPort=Number(process.env.GAME_PREVIEW_ALIAS??(port===4731&&host==='127.0.0.1'?4740:0));
  if(aliasPort){
    previewServer=http.createServer((req,res)=>{const url=new URL(req.url,`http://127.0.0.1:${server.address().port}`);url.protocol='http:';url.host=`127.0.0.1:${server.address().port}`;res.writeHead(302,{Location:url.href});res.end();});
    previewServer.on('error',e=>console.error('Preview redirect:',e.message));previewServer.listen(aliasPort,'127.0.0.1');
  }
});
async function shutdown(){
  if(shuttingDown)return;shuttingDown=true;clearInterval(tick);clearInterval(saveTimer);clearInterval(heartbeat);
  dirty=true;await save();for(const ws of wss.clients)ws.close(1012,'Server restarting');
  previewServer?.close();server.close();wss.close();setTimeout(()=>{for(const ws of wss.clients)ws.terminate();process.exit(saveHealthy?0:1);},500);
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
