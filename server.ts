import type {Hero, ChatEntry, PersistentHero, ServerMessage} from './shared/types.js';
import {isRecord,isClassId} from './shared/types.js';
import type {AddressInfo} from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import {readFileSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {World,newHero,safeHero,persistentHero,SAVE_VERSION} from './world.js';
import {openHeroStore} from './storage/postgres.js';
import {createGoogleAuth} from './auth/google.js';
import type {AuthSession} from './auth/google.js';
import {MAX_CHARACTERS} from './shared/accounts.js';

const root=fileURLToPath(new URL('../',import.meta.url)),publicRoot=path.join(root,'public'),compiledPublicRoot=path.join(root,'dist','public');
const errorCode=(error: unknown)=>isRecord(error)&&typeof error.code==='string'?error.code:'';
const errorMessage=(error: unknown)=>error instanceof Error?error.message:'Unknown error';
interface Session { accountId: string; auth: AuthSession; p: Hero; ws: WebSocket | null; revision: number; durable: string }
interface PendingCommit { entries: {accountId:string;hero:PersistentHero;expectedRevision:number}[]; operationId:string; reason:string }
const dataDir=process.env.GAME_DATA_DIR||path.join(root,'data');
const port=Number(process.env.PORT||4731),host=process.env.GAME_HOST||'127.0.0.1';
const stressModule=process.env.GAME_STRESS==='1'?await import('./stress/controller.js'):null;
await stressModule?.assertStressSandbox(dataDir,host);
if(stressModule){
  const url=new URL(process.env.DATABASE_URL||'postgres://invalid/');
  if(!['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname)||!(url.pathname==='/ashen_stress'||url.pathname.startsWith('/ashen_test_')))
    throw new Error('Stress mode requires a loopback PostgreSQL ashen_stress/ashen_test_ database');
}
await fs.mkdir(dataDir,{recursive:true,mode:0o700});
// Docker already enforces the unique game container; local commands also take a PID lock.
if(process.env.NODE_ENV!=='production'){
// A single process owns each save directory, even if started on another port.
const lockFile=path.join(dataDir,'.server.lock'),lockValue=JSON.stringify({pid:process.pid,nonce:randomBytes(12).toString('hex')});
try{
  const previous: unknown=JSON.parse(await fs.readFile(lockFile,'utf8'));
  if(!isRecord(previous)||typeof previous.pid!=='number'||!Number.isSafeInteger(previous.pid)||previous.pid<=0)throw new Error('Invalid server lock');
  let alive=true;try{process.kill(previous.pid,0);}catch(error){if(errorCode(error)==='ESRCH')alive=false;}
  if(alive)throw new Error('This save directory is already in use by a game server');
  await fs.unlink(lockFile);
}catch(error){if(errorCode(error)!=='ENOENT')throw error;}
const lock=await fs.open(lockFile,'wx',0o600);try{await lock.writeFile(lockValue);}finally{await lock.close();}
process.once('exit',()=>{try{if(readFileSync(lockFile,'utf8')===lockValue)unlinkSync(lockFile);}catch{}});

}
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required for PostgreSQL hero storage');
const store=await openHeroStore({connectionString:process.env.DATABASE_URL,writer:true});
const world=new World(),sessions=new Map<string,Session>(),connections=new Map<WebSocket,Session>(),chat: ChatEntry[]=[];
const alive=new WeakMap<WebSocket,boolean>();
const joining=new Set<string>();
const auth=createGoogleAuth(store,{onSessionRevoked:(sessionHash:string)=>{
  for(const [ws,entry] of connections)if(entry.auth.sessionHash===sessionHash){
    send(ws,{type:'error',code:'auth_required',text:'Вы вышли из аккаунта. Войдите через Google снова.'});release(ws);ws.close(1008,'Signed out');
  }
}});
const commands=new Map<WebSocket,{move:unknown|null; actions:unknown[]}>();
const economy=(p:PersistentHero)=>JSON.stringify([p.gold,p.xp,p.level,p.kills,p.items,p.pendingItems,p.stash,p.equipment,p.consumableInventory,p.quickSlots,p.consumableOverflow,p.bag,p.allocatedStats,p.statRevision,p.potions,p.manaPotions,p.questKills,p.questClaimed,p.boss,p.afkPreferences,p.skillBuild,p.buildRevision,p.skillPresets]);
let lastSavedAt=Date.now(),lastCheckpoint=Date.now(),saveHealthy=true,shuttingDown=false,busy=false,pending:PendingCommit|null=null,retryTimer:ReturnType<typeof setTimeout>|null=null,writerLost=false,noticeSent=false;
const stress=stressModule?await stressModule.createStressController(world,dataDir,host,async()=>{
  // Test-only scenario reset: old camp inputs must not cancel freshly placed AFK
  // heroes on the next authoritative tick. Wait for in-flight saves first.
  const deadline=Date.now()+5000;
  while(busy||pending){
    if(writerLost||Date.now()>=deadline)throw new Error('Stress scenario reset cannot reach a durable idle point');
    await new Promise<void>(resolve=>setTimeout(resolve,25));
  }
  if(writerLost)throw new Error('Stress scenario writer unavailable');
  commands.clear();
}):null;
function changedEntries(force=false){
  return [...sessions.values()].flatMap(entry=>{
    const hero=persistentHero(entry.p);
    return force||economy(hero)!==entry.durable?[{accountId:entry.accountId,hero,expectedRevision:entry.revision}]:[];
  });
}
function storageNotice(){
  if(noticeSent)return;noticeSent=true;
  for(const {p} of connections.values())world.notice(p,'Хранилище временно недоступно. Мир остановлен до подтверждения сохранения.');
}
async function commitPending(){
  const batch=pending;if(!batch||writerLost)return false;
  try{
    const receipts=await store.commit(batch.entries,batch.operationId,batch.reason);
    if(receipts.length!==batch.entries.length||receipts.some((receipt,i)=>receipt.id!==batch.entries[i].hero.id||!Number.isSafeInteger(receipt.revision)))
      throw new Error('Storage returned mismatched commit receipts');
    for(let i=0;i<batch.entries.length;i++){
      const entry=sessions.get(batch.entries[i].hero.id);
      if(entry){entry.revision=receipts[i].revision;entry.durable=economy(batch.entries[i].hero);}
    }
    pending=null;saveHealthy=true;noticeSent=false;lastSavedAt=Date.now();lastCheckpoint=lastSavedAt;
    return true;
  }catch(error){
    saveHealthy=false;
    console.error('PostgreSQL save failed:',errorMessage(error));
    if((error instanceof Error&&error.name==='StoreConflictError')||!await store.health().catch(()=>false)){
      writerLost=true;console.error('PostgreSQL writer unavailable; this process will not take over stale world state');
      for(const ws of connections.keys())ws.close(1013,'Storage unavailable');
      return false;
    }
    storageNotice();
    if(!retryTimer&&!shuttingDown)retryTimer=setTimeout(()=>{retryTimer=null;void retryPending();},1000);
    return false;
  }
}
async function retryPending(){
  if(!pending||writerLost)return;
  if(busy){retryTimer=setTimeout(()=>{retryTimer=null;void retryPending();},250);return;}
  busy=true;try{if(await commitPending())publish();}finally{busy=false;}
}
async function durable(reason:string,force=false){
  if(pending||writerLost)return false;
  const entries=changedEntries(force);if(!entries.length){lastCheckpoint=Date.now();return true;}
  pending={entries,operationId:randomBytes(16).toString('hex'),reason};
  return commitPending();
}
function publish(){
  for(const [ws,{p}] of connections)send(ws,{type:'state',...world.snapshot(p.id),save:{at:lastSavedAt,ok:saveHealthy}});
  world.events=[];
}
function jsonResponse(res:http.ServerResponse,status:number,body:unknown){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(body));
}
async function readJson(req:http.IncomingMessage):Promise<unknown>{
  if(!req.headers['content-type']?.startsWith('application/json'))throw new Error('json_required');
  let size=0;const chunks:Buffer[]=[];
  for await(const chunk of req){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>4096)throw new Error('body_too_large');chunks.push(bytes);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const characterRequests=new Map<string,{at:number;count:number}>();
async function accountHttp(req:http.IncomingMessage,res:http.ServerResponse):Promise<boolean>{
  const pathname=new URL(req.url||'/','http://localhost').pathname;
  const sandboxSession=!!stress&&pathname==='/api/stress-session';
  if(!['/api/account','/api/characters'].includes(pathname)&&!sandboxSession)return false;
  const error=(status:number,code:string,text:string)=>{jsonResponse(res,status,{error:code,text});return true;};
  if(pathname==='/api/account'){
    if(req.method!=='GET')return error(405,'method','Используйте GET');
    try{
      const identity=await auth.authenticate(req);
      const characters=identity?await store.listHeroes(identity.account.id):[];
      jsonResponse(res,200,{configured:auth.configured,account:identity?.account??null,characters,maxCharacters:MAX_CHARACTERS});
    }catch{return error(503,'storage_unavailable','Сервис входа временно недоступен. Повторите попытку.');}
    return true;
  }
  if(req.method!=='POST')return error(405,'method','Используйте POST');
  if(!auth.checkOrigin(req))return error(403,'origin','Запрос должен быть отправлен из игры');
  try{
    if(shuttingDown||pending||writerLost||!saveHealthy)return error(503,'storage_unavailable','Хранилище временно недоступно');
    const identity=await auth.authenticate(req);
    if(!identity&&!sandboxSession)return error(401,'auth_required','Войдите в аккаунт через Google');
    const body=await readJson(req);
    if(!isRecord(body))return error(400,'invalid_character','Укажите имя и класс персонажа');
    const name=typeof body.name==='string'?body.name.trim():'';
    if(!name||name.length>18||/[\p{C}<>]/u.test(name)||!isClassId(body.classId))return error(400,'invalid_character','Имя: от 1 до 18 символов. Выберите воина, лучника или мага.');
    if(sandboxSession&&identity){const characters=await store.listHeroes(identity.account.id);if(characters[0]){jsonResponse(res,200,{character:characters[0]});return true;}}
    const account=identity?.account??await store.upsertGoogleAccount({sub:BigInt('0x'+randomBytes(16).toString('hex')).toString(),email:'benchmark@example.invalid',name:'Изолированный тест'});
    const now=Date.now();
    for(const [id,request] of characterRequests)if(now-request.at>60000)characterRequests.delete(id);
    const request=characterRequests.get(account.id)??{at:now,count:0};
    if(++request.count>12)return error(429,'rate_limit','Слишком много попыток. Подождите минуту.');
    characterRequests.set(account.id,request);
    const hero=newHero(name,body.classId);
    await store.commit([{accountId:account.id,hero:persistentHero(hero),expectedRevision:0}],randomBytes(16).toString('hex'),'create character');
    if(sandboxSession)await auth.issueSession(account,res);
    jsonResponse(res,201,{character:{id:hero.id,name:hero.name,classId:hero.classId,level:hero.level}});
  }catch(cause){
    if(cause instanceof Error&&cause.name==='CharacterLimitError')return errorResponseLimit(res);
    if(cause instanceof SyntaxError||cause instanceof Error&&['json_required','body_too_large'].includes(cause.message))return error(400,'invalid_request','Некорректный запрос');
    return error(503,'storage_unavailable','Не удалось сохранить персонажа. Повторите попытку.');
  }
  return true;
}
function errorResponseLimit(res:http.ServerResponse){jsonResponse(res,409,{error:'character_limit',text:`На аккаунте может быть до ${MAX_CHARACTERS} персонажей`});return true;}

const mime: Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const server=http.createServer(async(req,res)=>{
  try{
    // The isolated stress controller joins bots through the live tick loop.
    if(stress&&await stress.http(req,res))return;
    if(await auth.handle(req,res))return;
    if(await accountHttp(req,res))return;
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    const url=new URL(req.url||'/','http://localhost');
    if(url.pathname==='/health'){
      const dbHealthy=!writerLost&&await store.health().catch(()=>false);
      const dbSchemaVersion=await store.schemaVersion().catch(()=>0);
      const ok=saveHealthy&&dbHealthy&&!pending;
      if(!dbHealthy){writerLost=true;saveHealthy=false;for(const ws of connections.keys())ws.close(1013,'Storage unavailable');}
      res.writeHead(ok?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:JSON.stringify({ok,world:'ashen-opushka-3d',players:connections.size,entities:world.players.size,saveVersion:SAVE_VERSION,storage:{backend:'postgresql',schemaVersion:dbSchemaVersion,writer:dbHealthy,pending:!!pending}}));return;
    }
    // Keep previously bookmarked workshops reachable, without serving the obsolete app.
    if(url.pathname==='/art-test.html'||url.pathname.startsWith('/art-test/')){
      res.writeHead(302,{Location:url.pathname==='/art-test.html'?'/':url.pathname.replace('/art-test/','/game/')});res.end();return;
    }
    const pathname=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    if(!['/index.html','/privacy.html','/terms.html','/rules.js'].includes(pathname)&&!pathname.startsWith('/game/')){res.writeHead(404);res.end('Not found');return;}
    const extension=path.extname(pathname);
    // First-party modules come from the compiler. Assets/vendor files stay in public.
    // No fallback to TS sources, sourcemaps, server modules, saves or arbitrary dist files.
    const assetRoot=extension==='.js'&&!pathname.startsWith('/game/vendor/')?compiledPublicRoot:publicRoot;
    const filename=path.resolve(assetRoot,'.'+pathname);
    if(!filename.startsWith(assetRoot+path.sep)||!Object.hasOwn(mime,extension)){res.writeHead(404);res.end();return;}
    const data=await fs.readFile(filename);
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)],'Content-Length':data.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
    res.end(req.method==='HEAD'?undefined:data);
  }catch(e){res.writeHead(errorCode(e)==='ENOENT'||errorCode(e)==='EISDIR'?404:400);res.end('Not found');}
});
server.requestTimeout=10000;
let previewServer: http.Server | undefined;
const wss=new WebSocketServer({noServer:true,maxPayload:4096});
server.on('upgrade',(req,socket,head)=>{
  const origin=req.headers.origin,pathname=new URL(req.url||'/','http://localhost').pathname;
  if(shuttingDown||writerLost||pathname!=='/ws'||(!origin||!auth.checkOrigin(req))){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
const send=(ws: WebSocket,msg: ServerMessage)=>{if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<256000){const data=JSON.stringify(msg);stress?.recordBytes(Buffer.byteLength(data));ws.send(data);}};
function release(ws: WebSocket){
  commands.delete(ws);
  const entry=connections.get(ws);if(!entry)return;
  connections.delete(ws);if(entry.ws!==ws)return;
  entry.ws=null;entry.p.connected=false;world.stopCampReturn(entry.p);world.stopInteraction(entry.p);world.stopAfk(entry.p);world.clearSkillRuntime(entry.p);entry.p.input={...entry.p.input,x:0,z:0,aim:null};
  entry.p.disconnectAt=Math.max(Date.now()+1000,entry.p.combatUntil);
}
wss.on('connection',(ws,req)=>{
  let entry: Session | null=null,lastChat=0,windowStart=Date.now(),messages=0,joinStarted=false;alive.set(ws,true);ws.on('pong',()=>alive.set(ws,true));
  const helloTimeout=setTimeout(()=>ws.close(1008,'Join first'),8000);
  const reject=(code: string,text: string)=>{send(ws,{type:'error',code,text});ws.close(1008,code);};
  async function join(msg:Record<string,unknown>){
    if(msg.protocol!==3){reject('version','Обновите страницу игры');return;}
    if(typeof msg.heroId!=='string'||!msg.heroId||msg.heroId.length>128||'token' in msg){reject('invalid_character','Выберите персонажа аккаунта');return;}
    let identity:AuthSession|null;
    try{identity=await auth.authenticate(req);}catch{reject('storage_unavailable','Сервис входа временно недоступен');return;}
    if(!identity){reject('auth_required','Войдите в аккаунт через Google');return;}
    if(ws.readyState!==WebSocket.OPEN)return;
    const accountId=identity.account.id,heroId=msg.heroId;
    // Account reservation precedes every await: different heroes/windows cannot race.
    if(joining.has(accountId)||[...connections.values()].some(s=>s.accountId===accountId)){
      reject('in_use','Аккаунт уже играет в другом окне. Закройте игру в нём и повторите вход.');return;
    }
    const resident=sessions.get(heroId);
    if([...sessions.values()].some(s=>s.accountId===accountId&&s.p.id!==heroId)){
      reject('in_use','Предыдущий персонаж ещё выходит из мира. Повторите вход через несколько секунд.');return;
    }
    if(connections.size+joining.size>=16||(!resident&&world.players.size+joining.size>=16)){reject('full','Мир заполнен. Повторяем подключение через несколько секунд.');return;}
    joining.add(accountId);
    try{
      if(shuttingDown||pending||writerLost){reject('storage_unavailable','Хранилище недоступно. Повторите подключение');return;}
      if(!await store.health()){
        writerLost=true;saveHealthy=false;
        for(const client of connections.keys())client.close(1013,'Storage unavailable');
        reject('storage_unavailable','Хранилище недоступно. Повторите подключение');return;
      }
      const existing=sessions.get(heroId);
      const loaded=await store.load(heroId,accountId);
      if(!loaded||existing&&existing.accountId!==accountId){reject('invalid_character','Персонаж не найден в этом аккаунте');return;}
      if(ws.readyState!==WebSocket.OPEN)return;
      // Isolated network tests exercise a checkpoint overlapping this async join.
      if(process.env.NODE_ENV==='test'&&process.env.GAME_TEST_JOIN_PAUSE_MS){
        const pause=Number(process.env.GAME_TEST_JOIN_PAUSE_MS);
        if(Number.isFinite(pause)&&pause>0&&pause<=1000){ws.ping('join-pause');await new Promise<void>(resolve=>setTimeout(resolve,pause));}
      }
      if(ws.readyState!==WebSocket.OPEN)return;
      if(shuttingDown||pending||writerLost){reject('storage_unavailable','Хранилище недоступно. Повторите подключение');return;}
      // Logout/expiry can occur while loading. Recheck before attaching a player.
      const refreshed=await auth.authenticate(req);
      if(!refreshed||refreshed.account.id!==accountId){reject('auth_required','Войдите в аккаунт через Google');return;}
      if(ws.readyState!==WebSocket.OPEN)return;
      if(shuttingDown||pending||writerLost){reject('storage_unavailable','Хранилище недоступно. Повторите подключение');return;}
      if(existing){entry=existing;entry.auth=refreshed;entry.ws=ws;entry.p.input={x:0,z:0,aim:null,seq:0};entry.p.ack=0;}
      else{
        const p=safeHero(loaded.hero),revision=loaded.revision;
        entry={accountId,auth:refreshed,p,ws,revision,durable:economy(loaded.hero)};
        if(economy(persistentHero(p))!==entry.durable){
          const receipt=await store.commit([{accountId,hero:persistentHero(p),expectedRevision:revision}],randomBytes(16).toString('hex'),'normalize hero');
          if(receipt.length!==1||receipt[0].id!==p.id||!Number.isSafeInteger(receipt[0].revision))throw new Error('Incomplete hero normalization receipt');
          entry.revision=receipt[0].revision;entry.durable=economy(persistentHero(p));lastSavedAt=Date.now();
        }
        const afterNormalization=await auth.authenticate(req);
        if(!afterNormalization||afterNormalization.account.id!==accountId){entry=null;reject('auth_required','Войдите в аккаунт через Google');return;}
        if(ws.readyState!==WebSocket.OPEN){entry=null;return;}
        if(shuttingDown||writerLost){entry=null;reject('storage_unavailable','Хранилище недоступно. Повторите подключение');return;}
        sessions.set(heroId,entry);
      }
      world.add(entry.p);connections.set(ws,entry);clearTimeout(helloTimeout);
      send(ws,{type:'welcome',protocol:3,id:entry.p.id,chat});
    }catch(error){console.error('Hero join/storage failed:',errorMessage(error));reject('storage_unavailable','Хранилище недоступно. Повторите подключение');}
    finally{joining.delete(accountId);}
  }
  ws.on('message',raw=>{
    try{
      if(shuttingDown)return;
      const now=Date.now();if(now-windowStart>1000){windowStart=now;messages=0;}if(++messages>70){ws.close(1008,'Too many messages');return;}
      const msg: unknown=JSON.parse(raw.toString());if(!isRecord(msg))return;
      if(!entry){
        if(msg.type!=='join'||joinStarted)return;joinStarted=true;
        if(msg.protocol!==3){reject('version','Обновите страницу игры');return;}
        void join(msg);return;
      }
      if(entry.auth.expiresAt<=now||entry.ws!==ws){release(ws);reject('auth_required','Войдите в аккаунт через Google');return;}
      if(msg.type==='chat'&&typeof msg.text==='string'&&now-lastChat>1000){
        const text=msg.text.replace(/[\p{C}]/gu,'').trim().slice(0,180);
        if(text){lastChat=now;const message={name:entry.p.name,text,t:now,id:entry.p.id};chat.push(message);if(chat.length>40)chat.shift();for(const client of connections.keys())send(client,{type:'chat',entry:message});}return;
      }
      if(msg.type==='ping'){send(ws,{type:'pong',t:msg.t});return;}
      const queued=commands.get(ws)??{move:null,actions:[]};
      if(msg.type==='input')queued.move=msg;
      else if(queued.actions.length<32)queued.actions.push(msg);
      else {ws.close(1008,'Command queue full');return;}
      commands.set(ws,queued);
    }catch{} // Packets never replace authoritative state.
  });
  ws.on('close',()=>{clearTimeout(helloTimeout);release(ws);});ws.on('error',()=>{});
});
let last=Date.now();
const tick=setInterval(()=>{void runTick();},50);
async function runTick(){
  if(busy||pending||writerLost||shuttingDown)return;
  busy=true;
  try{
    const tickStart=performance.now(),now=Date.now(),interval=now-last,dt=Math.min(.1,interval/1000);last=now;
    for(const [ws,session] of connections)if(session.auth.expiresAt<=now){
      release(ws);send(ws,{type:'error',code:'auth_required',text:'Сессия истекла. Войдите через Google снова.'});ws.close(1008,'Session expired');
    }
    for(const [ws,queued] of commands){
      const session=connections.get(ws);commands.delete(ws);if(!session)continue;
      if(session.auth.expiresAt<=now){release(ws);send(ws,{type:'error',code:'auth_required',text:'Сессия истекла. Войдите через Google снова.'});ws.close(1008,'Session expired');continue;}
      if(queued.move)world.command(session.p,queued.move);
      for(const action of queued.actions)world.command(session.p,action);
    }
    world.tick(dt,now);const simulationEnd=performance.now();
    // Rewards, items, stat points, quest progress and consumables are durable
    // before their associated state/events leave the authoritative server.
    const economic=changedEntries().length>0;
    const retiring=[...sessions.values()].some(session=>!session.ws&&!joining.has(session.accountId)&&session.p.disconnectAt<=now);
    if(economic||retiring||now-lastCheckpoint>=2000){
      if(!await durable(economic?'economic mutation':retiring?'disconnect':'checkpoint',retiring||!economic))return;
    }
    for(const [heroId,session] of sessions){
      if(session.ws||joining.has(session.accountId)||session.p.disconnectAt>now)continue;
      world.remove(session.p.id);sessions.delete(heroId);
    }
    publish();
    stress?.recordTick(simulationEnd-tickStart,performance.now()-simulationEnd,performance.now()-tickStart,interval);
  }finally{busy=false;}
}
const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!alive.get(ws)){release(ws);ws.terminate();continue;}alive.set(ws,false);ws.ping();}},5000);
server.listen(port,host,()=>{
  console.log(`Пепельный рубеж: http://${host}:${(server.address() as AddressInfo).port}\nShared 3D world; persistent heroes enabled`);
  const aliasPort=Number(process.env.GAME_PREVIEW_ALIAS??(port===4731&&host==='127.0.0.1'?4740:0));
  if(aliasPort){
    previewServer=http.createServer((req,res)=>{const url=new URL(req.url||'/',`http://127.0.0.1:${(server.address() as AddressInfo).port}`);url.protocol='http:';url.host=`127.0.0.1:${(server.address() as AddressInfo).port}`;res.writeHead(302,{Location:url.href});res.end();});
    previewServer.on('error',e=>console.error('Preview redirect:',e.message));previewServer.listen(aliasPort,'127.0.0.1');
  }
});
async function shutdown(){
  if(shuttingDown)return;shuttingDown=true;stress?.close();clearInterval(tick);clearInterval(heartbeat);
  if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
  for(const ws of wss.clients)ws.close(1012,'Server restarting');
  previewServer?.close();server.close();wss.close();
  const deadline=Date.now()+8000;
  while(busy&&Date.now()<deadline)await new Promise<void>(resolve=>setTimeout(resolve,25));
  if(!busy&&!writerLost){
    if(!pending){
      await Promise.race([
        durable('shutdown',true),
        new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),Math.max(0,deadline-Date.now())))
      ]);
    }
    while(pending&&Date.now()<deadline&&!writerLost){
      await new Promise<void>(resolve=>setTimeout(resolve,250));
      await Promise.race([
        commitPending(),
        new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),Math.max(0,deadline-Date.now())))
      ]);
    }
  }
  const ok=!busy&&!pending&&!writerLost&&saveHealthy;
  if(!ok)console.error('Shutdown failed: durable hero checkpoint not confirmed');
  await Promise.race([
    store.close().catch((error:unknown)=>console.error('Storage close failed:',errorMessage(error))),
    new Promise<void>(resolve=>setTimeout(resolve,Math.max(0,deadline-Date.now())))
  ]);
  for(const ws of wss.clients)ws.terminate();
  process.exit(ok?0:1);
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
