import {WARRIOR_ITEMS,rollEquipment} from '../public/game/equipment-items.js';
/** Test-only controller: load through the isolated runner, never on a production server. */
import type {IncomingMessage,ServerResponse} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {cpus,totalmem,tmpdir,platform,release} from 'node:os';
import path from 'node:path';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {WebSocket} from 'ws';
import {World,newHero,stats} from '../world.js';
import type {Hero,ServerMessage,ClientMessage,SelfSnapshot} from '../shared/types.js';
import {isRecord} from '../shared/types.js';
import {distribution} from '../public/game/performance-metrics.js';

interface Bot {socket:WebSocket;id:string;seq:number;state:SelfSnapshot|null;index:number}
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
  private mode:'camp'|'combat'='camp';
  private epoch=Date.now();
  private busy=false;
  private samples:{tick:number[];simulation:number[];broadcast:number[];interval:number[]}={tick:[],simulation:[],broadcast:[],interval:[]};
  private bytes=0;
  private errors:string[]=[];
  private histogram=monitorEventLoopDelay({resolution:10});
  private timer:ReturnType<typeof setInterval>;
  constructor(private world:World){this.histogram.enable();this.timer=setInterval(()=>this.drive(),100);}
  recordTick(simulation:number,broadcast:number,total:number,interval:number){
    for(const [key,value] of Object.entries({simulation,broadcast,tick:total,interval}) as [keyof typeof this.samples,number][]){const a=this.samples[key];a.push(value);if(a.length>2000)a.shift();}
  }
  recordBytes(bytes:number){this.bytes+=bytes;}
  private resetMetrics(){this.samples={tick:[],simulation:[],broadcast:[],interval:[]};this.bytes=0;this.histogram.reset();this.epoch=Date.now();}
  private snapshot(){return {tick:distribution(this.samples.tick),simulation:distribution(this.samples.simulation),broadcast:distribution(this.samples.broadcast),interval:distribution(this.samples.interval),eventLoopP99Ms:this.histogram.percentile(99)/1e6,outboundBytes:this.bytes,durationMs:Date.now()-this.epoch,players:this.world.players.size,bots:this.bots.length,errors:this.errors};}
  private send(bot:Bot,message:ClientMessage){if(bot.socket.readyState===WebSocket.OPEN)bot.socket.send(JSON.stringify(message));}
  private async addBot(url:string,index:number,warriorsOnly=false){
    const bot:Bot={socket:new WebSocket(url.replace('http:','ws:')+'/ws',{origin:url}),id:'',seq:0,state:null,index};
    bot.socket.on('message',raw=>{const message=JSON.parse(String(raw)) as ServerMessage;if(message.type==='welcome')bot.id=message.id;if(message.type==='state')bot.state=message.self;if(message.type==='error')this.errors.push(message.code);});
    bot.socket.on('error',error=>this.errors.push(error.message));
    this.bots.push(bot);
    await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Bot connect timeout')),6000);bot.socket.once('open',()=>{clearTimeout(timeout);resolve();});});
    this.send(bot,{type:'join',protocol:2,name:`Нагрузка ${index+1}`,classId:warriorsOnly?'warrior':(['warrior','archer','mage'] as const)[index%3]});
    const deadline=Date.now()+6000;while(!bot.state){if(Date.now()>deadline)throw new Error('Bot join timeout');await delay(25);}
  }
  private drive(){
    const time=(Date.now()-this.epoch)/1000;
    for(const bot of this.bots){
      const p=bot.state;if(!p)continue;
      let dx:number,dz:number;
      if(this.mode==='combat'){
        const target=this.world.mobs.filter(m=>m.state!=='dead').sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
        dx=target?target.x-p.x:0;dz=target?target.z-p.z:0;
        if(target&&Math.hypot(dx,dz)<(p.range||1.5))this.send(bot,{type:'attack',yaw:Math.atan2(dx,dz),special:Math.floor(time*10)%10===0});
      }else{const angle=bot.index*2.399+time*.5;dx=.5+Math.sin(angle)*1.65-p.x;dz=2+Math.cos(angle)*1.1-p.z;}
      const length=Math.hypot(dx,dz),stop=this.mode==='combat'&&length<(p.range||1.5)*.9;
      this.send(bot,{type:'input',x:stop?0:dx/Math.max(1,length),z:stop?0:dz/Math.max(1,length),aim:length>.01?Math.atan2(dx,dz):null,seq:++bot.seq});
      if(this.mode==='combat'&&p.hp<p.maxHp*.5)this.send(bot,{type:'potion'});
    }
  }
  private async scenario(players:number,mode:'camp'|'combat',url:string,equipment:unknown){
    while(this.bots.length<players-1)await this.addBot(url,this.bots.length,equipment==='mixed-warrior'||equipment==='legacy-warrior');
    while(this.bots.length>players-1){const bot=this.bots.pop()!;bot.socket.close();const hero=this.world.players.get(bot.id);if(hero)hero.combatUntil=0;}
    const deadline=Date.now()+7000;while(this.world.players.size!==players){if(Date.now()>deadline)throw new Error('Expected player count not reached');await delay(50);}
    this.mode=mode;this.errors=[];
    this.world.mobs=new World().mobs;this.world.projectiles=[];this.world.events=[];
    let index=0;for(const hero of this.world.players.values()){
      const fresh=newHero(hero.name,equipment==='mixed-warrior'||equipment==='legacy-warrior'?'warrior':hero.classId),oldId=hero.id;
      Object.assign(hero,fresh,{id:oldId,connected:true,x:mode==='camp'?.5:8.5,z:mode==='camp'?2:0});
      if(this.bots.some(bot=>bot.id===oldId)){const angle=index++*2.399;hero.x+=Math.sin(angle)*1.3;hero.z+=Math.cos(angle)*1.3;}
      if(equipment==='mixed-warrior'){
        const family=index%2?'wanderer':'watch';
        hero.items=WARRIOR_ITEMS.map(definition=>({...rollEquipment(definition.id,oldId+'-'+definition.id,()=>.5),bound:true}));
        hero.equipment={};
        for(const definition of WARRIOR_ITEMS)if(definition.id.startsWith(family)||definition.slot==='ring'||definition.slot==='amulet')hero.equipment[definition.slot]=oldId+'-'+definition.id;
      }
      // Test scenarios use ordinary level-one stats, real damage and real deaths.
      const derived=stats(hero);hero.hp=derived.maxHp;hero.mana=derived.maxMana;
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
        if(![1,4,16].includes(Number(body.players))||(body.mode!=='camp'&&body.mode!=='combat'))throw new Error('Unknown scenario');
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
