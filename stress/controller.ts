import {CLASS_ITEMS,WARRIOR_ITEMS,rollEquipment} from '../public/game/equipment-items.js';
/** Test-only controller: load through the isolated runner, never on a production server. */
import type {IncomingMessage,ServerResponse} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {cpus,totalmem,tmpdir,platform,release} from 'node:os';
import path from 'node:path';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {WebSocket} from 'ws';
import {randomUUID} from 'node:crypto';
import {World,newHero,stats} from '../world.js';
import type {Hero,ServerMessage,ClientMessage,SelfSnapshot} from '../shared/types.js';
import {isRecord} from '../shared/types.js';
import {distribution} from '../public/game/performance-metrics.js';
import {AFK_SPOTS} from '../public/game/afk.js';
import {skillsForClass} from '../public/game/skills.js';

interface Bot {socket:WebSocket;id:string;token:string|null;seq:number;state:SelfSnapshot|null;index:number;nextSkill:0|1}
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export async function assertStressSandbox(dataDir:string,host:string){
  if(process.env.NODE_ENV==='production'||host!=='127.0.0.1'||!path.resolve(dataDir).startsWith(path.join(tmpdir(),'ashen-stress-'))||await readFile(path.join(dataDir,'.stress-sandbox'),'utf8')!=='temporary benchmark world\n')throw new Error('Stress mode requires the isolated npm run stress runner');
}
export async function createStressController(world:World,dataDir:string,host:string){
  await assertStressSandbox(dataDir,host);
  return new StressController(world);
}
class StressController {
  private bots:Bot[]=[];
  private mode:'camp'|'combat'|'afk'='camp';
  private epoch=Date.now();
  private busy=false;
  private samples:{tick:number[];simulation:number[];broadcast:number[];interval:number[]}={tick:[],simulation:[],broadcast:[],interval:[]};
  private bytes=0;
  private errors:string[]=[];
  private lastAttackSerial=new Map<string,number>();
  private skillCasts:Record<string,number>={};
  private attackCasts=0;
  private projectilePeak=0;
  private histogram=monitorEventLoopDelay({resolution:10});
  private timer:ReturnType<typeof setInterval>;
  constructor(private world:World){this.histogram.enable();this.timer=setInterval(()=>this.drive(),100);}
  recordTick(simulation:number,broadcast:number,total:number,interval:number){
    for(const [key,value] of Object.entries({simulation,broadcast,tick:total,interval}) as [keyof typeof this.samples,number][]){const a=this.samples[key];a.push(value);if(a.length>2000)a.shift();}
    this.projectilePeak=Math.max(this.projectilePeak,this.world.projectiles.length);
    for(const hero of this.world.players.values()){
      const previous=this.lastAttackSerial.get(hero.id)??hero.attackSerial;
      if(hero.attackSerial>previous){this.attackCasts+=hero.attackSerial-previous;if(hero.attack?.skillId)this.skillCasts[hero.attack.skillId]=(this.skillCasts[hero.attack.skillId]??0)+1;}
      this.lastAttackSerial.set(hero.id,hero.attackSerial);
    }
  }
  recordBytes(bytes:number){this.bytes+=bytes;}
  private resetMetrics(){this.samples={tick:[],simulation:[],broadcast:[],interval:[]};this.bytes=0;this.histogram.reset();this.epoch=Date.now();this.attackCasts=0;this.skillCasts={};this.projectilePeak=0;this.lastAttackSerial=new Map([...this.world.players.values()].map(hero=>[hero.id,hero.attackSerial]));}
  private snapshot(){return {tick:distribution(this.samples.tick),simulation:distribution(this.samples.simulation),broadcast:distribution(this.samples.broadcast),interval:distribution(this.samples.interval),eventLoopP99Ms:this.histogram.percentile(99)/1e6,outboundBytes:this.bytes,durationMs:Date.now()-this.epoch,players:this.world.players.size,bots:this.bots.length,activeAfk:[...this.world.players.values()].filter(hero=>!!hero.afk&&!hero.dead).length,afkTargets:[...this.world.players.values()].filter(hero=>!hero.dead&&hero.afk?.targetId!==null&&hero.afk?.targetId!==undefined).length,skillCasts:this.skillCasts,attackCasts:this.attackCasts,projectilePeak:this.projectilePeak,projectiles:this.world.projectiles.length,liveMobs:this.world.mobs.filter(mob=>mob.state!=='dead').length,errors:this.errors};}
  private send(bot:Bot,message:ClientMessage){if(bot.socket.readyState===WebSocket.OPEN)bot.socket.send(JSON.stringify(message));}
  private async addBot(url:string,index:number,warriorsOnly:boolean,deadline:number){
    const connect=()=>new WebSocket(url.replace('http:','ws:')+'/ws',{origin:url});
    const bot:Bot={socket:connect(),id:'',token:null,seq:0,state:null,index,nextSkill:0};
    let attempt=0;
    while(Date.now()<deadline){
      const socket=attempt++?connect():bot.socket;bot.socket=socket;bot.state=null;
      let opened=false,closed=false,issue:string|null=null,joinError:string|null=null;
      socket.on('open',()=>{opened=true;});
      socket.on('close',()=>{closed=true;});
      socket.on('error',error=>{issue=error.message;});
      socket.on('unexpected-response',(_,response)=>{issue=`Bot HTTP upgrade ${response.statusCode}`;response.resume();socket.terminate();});
      socket.on('message',raw=>{
        if(bot.socket!==socket)return;
        const message=JSON.parse(String(raw)) as ServerMessage;
        if(message.type==='welcome'){
          if(bot.id&&bot.id!==message.id){issue='Bot identity changed after reconnect';return;}
          bot.id=message.id;bot.token=message.token;
        }
        if(message.type==='state')bot.state=message.self;
        if(message.type==='error')joinError=message.code;
      });
      const attemptDeadline=Math.min(deadline,Date.now()+6500);
      while(!opened&&!closed&&!issue&&Date.now()<attemptDeadline)await delay(25);
      if(opened){
        this.send(bot,{type:'join',protocol:2,name:`Нагрузка ${index+1}`,classId:warriorsOnly?'warrior':(['warrior','archer','mage'] as const)[index%3],...(bot.token?{token:bot.token}:{})});
        while(!bot.state&&!joinError&&!closed&&!issue&&Date.now()<attemptDeadline)await delay(25);
      }
      if(bot.state&&bot.id&&bot.token){this.bots.push(bot);return;}
      const retryable=joinError==='storage_unavailable'||(!!bot.token&&!joinError&&!issue&&(closed||opened));
      if(retryable&&socket.readyState===WebSocket.OPEN)socket.close();
      else socket.terminate();
      if(retryable){
        const closeDeadline=Math.min(deadline,Date.now()+250);
        while(socket.readyState!==WebSocket.CLOSED&&Date.now()<closeDeadline)await delay(25);
        if(socket.readyState!==WebSocket.CLOSED)socket.terminate();
        await delay(Math.min(250,Math.max(0,deadline-Date.now())));continue;
      }
      const failure=joinError||issue||(opened?'Bot join timeout':'Bot connect timeout');
      this.errors.push(failure);throw new Error(failure);
    }
    bot.socket.terminate();throw new Error('Bot join retry deadline exceeded');
  }
  private drive(){
    const time=(Date.now()-this.epoch)/1000;
    for(const bot of this.bots){
      const p=bot.state;if(!p)continue;
      if(this.mode==='afk'){
        this.send(bot,{type:'input',x:0,z:0,aim:null,seq:++bot.seq});
        continue;
      }
      let dx:number,dz:number;
      if(this.mode==='combat'){
        const target=this.world.mobs.filter(m=>m.state!=='dead').sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
        dx=target?target.x-p.x:0;dz=target?target.z-p.z:0;
        if(target&&!p.attack){
          const yaw=Math.atan2(dx,dz),distance=Math.hypot(dx,dz),skills=skillsForClass(p.classId);
          let cast=false;
          for(const slot of [bot.nextSkill,1-bot.nextSkill] as (0|1)[]){
            const skill=skills[slot];
            if(distance<=skill.range&&p.mana>=skill.manaCost&&(p.skillCooldowns?.[skill.id]??0)<=0){
              this.send(bot,{type:'skill',skillId:skill.id,yaw});bot.nextSkill=slot===0?1:0;cast=true;break;
            }
          }
          if(!cast&&distance<(p.range||1.5))this.send(bot,{type:'attack',yaw});
        }
      }else{const angle=bot.index*2.399+time*.5;dx=.5+Math.sin(angle)*1.65-p.x;dz=2+Math.cos(angle)*1.1-p.z;}
      const length=Math.hypot(dx,dz),stop=this.mode==='combat'&&length<(p.range||1.5)*.9;
      this.send(bot,{type:'input',x:stop?0:dx/Math.max(1,length),z:stop?0:dz/Math.max(1,length),aim:length>.01?Math.atan2(dx,dz):null,seq:++bot.seq});
      if(this.mode==='combat'&&p.hp<p.maxHp*.5)this.send(bot,{type:'potion'});
    }
  }
  private async scenario(players:number,mode:'camp'|'combat'|'afk',url:string,equipment:unknown){
    const joinDeadline=Date.now()+45000;
    const initialBots=this.bots.length;
    try{
      while(this.bots.length<players-1)await this.addBot(url,this.bots.length,equipment==='mixed-warrior'||equipment==='legacy-warrior',joinDeadline);
    }catch(error){
      while(this.bots.length>initialBots){
        const bot=this.bots.pop()!;bot.socket.close();
        const hero=this.world.players.get(bot.id);if(hero)hero.combatUntil=0;
      }
      throw error;
    }
    while(this.bots.length>players-1){const bot=this.bots.pop()!;bot.socket.close();const hero=this.world.players.get(bot.id);if(hero)hero.combatUntil=0;}
    const deadline=Date.now()+7000;while(this.world.players.size!==players){if(Date.now()>deadline)throw new Error('Expected player count not reached');await delay(50);}
    const observer=[...this.world.players.values()].find(hero=>!this.bots.some(bot=>bot.id===hero.id));
    if(mode==='afk'&&observer?.classId!=='warrior')throw new Error('AFK benchmark requires a warrior observer; use a new test session');
    this.mode=mode;this.errors=[];
    this.world.mobs=new World().mobs;this.world.projectiles=[];this.world.groundLoot=[];this.world.events=[];
    const participants=mode==='afk'?[observer!,...[...this.world.players.values()].filter(hero=>hero!==observer)]:[...this.world.players.values()];
    let index=0,playerIndex=0;for(const hero of participants){
      const fresh=newHero(hero.name,equipment==='mixed-warrior'||equipment==='legacy-warrior'?'warrior':hero.classId),oldId=hero.id;
      Object.assign(hero,fresh,{id:oldId,connected:true,x:mode==='camp'?.5:8.5,z:mode==='camp'?2:0});
      hero.afk=null;
      const scenarioIndex=playerIndex++;
      if(mode==='afk'){
        const spot=AFK_SPOTS[scenarioIndex%AFK_SPOTS.length],angle=scenarioIndex*2.399;
        hero.x=spot.x+Math.sin(angle)*.9;hero.z=spot.z+Math.cos(angle)*.9;
        hero.level=10;
        hero.allocatedStats=hero.classId==='warrior'?{strength:20,dexterity:10,vitality:20,energy:0}:hero.classId==='archer'?{strength:10,dexterity:20,vitality:20,energy:0}:{strength:0,dexterity:10,vitality:20,energy:20};
      }else if(this.bots.some(bot=>bot.id===oldId)){const angle=index++*2.399;hero.x+=Math.sin(angle)*1.3;hero.z+=Math.cos(angle)*1.3;}
      if(equipment==='mixed-warrior'){
        const family=index%2?'wanderer':'watch';
        hero.items=WARRIOR_ITEMS.map(definition=>({...rollEquipment(definition.id,randomUUID(),()=>.5),bound:true}));
        hero.equipment={};
        for(const item of hero.items)if(item.definitionId?.startsWith(family)||item.slot==='ring'||item.slot==='amulet')hero.equipment[item.slot]=item.id;
      }
      if(equipment==='mixed-classes'){
        const families=hero.classId==='warrior'?['wanderer','watch']:hero.classId==='archer'?['ranger','sentinel']:['acolyte','runekeeper'];
        const family=families[scenarioIndex%2];
        const definitions=CLASS_ITEMS[hero.classId].filter(definition=>definition.id.startsWith(family)||definition.slot==='ring'||definition.slot==='amulet');
        hero.items=definitions.map(definition=>({...rollEquipment(definition.id,randomUUID(),()=>.5),bound:true}));
        hero.equipment={};
        for(const item of hero.items)hero.equipment[item.slot]=item.id;
      }
      // All profiles use real HP, MP and deaths; AFK alone uses level-ten builds.
      const derived=stats(hero);hero.hp=derived.maxHp;hero.mana=derived.maxMana;
      if(mode==='afk'){
        this.world.command(hero,{type:'afk',enabled:true});
        if(!hero.afk)throw new Error('AFK command was not accepted after stress placement');
      }
    }
    for(const bot of this.bots)bot.seq=0;
    this.resetMetrics();return this.snapshot();
  }
  async http(req:IncomingMessage,res:ServerResponse):Promise<boolean>{
    const pathname=new URL(req.url||'/','http://localhost').pathname;if(!pathname.startsWith('/__stress/'))return false;
    const origin=`http://${req.headers.host}`,local=/^127\.0\.0\.1:\d+$/.test(req.headers.host||'')&&['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'');
    if(!local||(req.method==='POST'&&req.headers.origin!==origin)){res.writeHead(403);res.end();return true;}
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    try{
      if(req.method==='GET'&&pathname==='/__stress/info'){res.end(JSON.stringify({enabled:true,hardware:{cpu:cpus()[0]?.model,cores:cpus().length,memoryGiB:Math.round(totalmem()/2**30),os:platform(),release:release(),node:process.version},server:this.snapshot()}));return true;}
      if(req.method!=='POST'){res.writeHead(405);res.end();return true;}
      let content='';for await(const chunk of req){content+=String(chunk);if(content.length>1_000_000)throw new Error('Report too large');}
      const body:unknown=JSON.parse(content||'{}');if(!isRecord(body))throw new Error('Invalid request');
      if(pathname==='/__stress/scenario'){
        if(this.busy)throw new Error('Scenario change already running');
        if(![1,4,16].includes(Number(body.players))||(body.mode!=='camp'&&body.mode!=='combat'&&body.mode!=='afk'))throw new Error('Unknown scenario');
        this.busy=true;try{res.end(JSON.stringify(await this.scenario(Number(body.players),body.mode,origin,body.equipment)));}finally{this.busy=false;}return true;
      }
      if(pathname==='/__stress/reset-metrics'){this.resetMetrics();res.end('{}');return true;}
      if(pathname==='/__stress/report'){
        const report={...body,server:this.snapshot(),recordedAt:new Date().toISOString()};
        const filename=`${Date.now()}-${Math.random().toString(36).slice(2,7)}.json`;
        await writeFile(path.join(process.env.GAME_STRESS_REPORTS!,filename),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
        res.end(JSON.stringify({file:filename,server:report.server}));return true;
      }
      res.writeHead(404);res.end('{}');return true;
    }catch(error){res.writeHead(400);res.end(JSON.stringify({error:error instanceof Error?error.message:'Benchmark error'}));return true;}
  }
  close(){clearInterval(this.timer);this.histogram.disable();for(const bot of this.bots)bot.socket.close();}
}
