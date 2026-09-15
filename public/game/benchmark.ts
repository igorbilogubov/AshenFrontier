import type * as T from './vendor/three.module.js';
import type {NetworkGame} from './network.js';
import {distribution,frameSummary} from './performance-metrics.js';

type Variant='full'|'no-shadows'|'no-animation'|'low-resolution'|'no-trees'|'picking'|'no-render'|'no-labels'|'scheduler';
interface Scenario {name:string;players:1|4|16;mode:'camp'|'combat'|'afk';variant:Variant}
interface Hooks {renderer:T.WebGLRenderer;scene:T.Scene;camera:T.Camera;game:NetworkGame;modelsReady:()=>boolean;setVariant:(variant:Variant)=>void}
interface GpuExtension {TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number}
const scenarios:Scenario[]=[
  {name:'1 игрок · лагерь',players:1,mode:'camp',variant:'full'},
  {name:'4 игрока · лагерь',players:4,mode:'camp',variant:'full'},
  {name:'16 игроков · лагерь',players:16,mode:'camp',variant:'full'},
  {name:'16 · без теней',players:16,mode:'camp',variant:'no-shadows'},
  {name:'16 · без сэмплирования анимации',players:16,mode:'camp',variant:'no-animation'},
  {name:'16 · DPR 0.75',players:16,mode:'camp',variant:'low-resolution'},
  {name:'16 · без деревьев',players:16,mode:'camp',variant:'no-trees'},
  {name:'16 · обычная графика повтор',players:16,mode:'camp',variant:'full'},
  {name:'16 · без вывода 3D (диагностика)',players:16,mode:'camp',variant:'no-render'},
  {name:'16 · без подписей игроков',players:16,mode:'camp',variant:'no-labels'},
  {name:'16 · только rAF и сеть (контроль)',players:16,mode:'camp',variant:'scheduler'},
  {name:'16 · бой',players:16,mode:'combat',variant:'full'},
  {name:'16 · бой и выбор моба каждый кадр',players:16,mode:'combat',variant:'picking'},
  {name:'1 · AFK охота',players:1,mode:'afk',variant:'full'},
  {name:'4 · AFK охота',players:4,mode:'afk',variant:'full'},
  {name:'16 · AFK охота',players:16,mode:'afk',variant:'full'},
];
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function request(route:string,body:object){const response=await fetch(`/__stress/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(await response.text());return response.json() as Promise<Record<string,unknown>>;}
export async function stressEnabled(){return new URLSearchParams(location.search).has('stress')&&(await fetch('/__stress/info')).ok;}
export class Benchmark {
  variant:Variant='full';
  private panel=document.createElement('aside');
  private status=document.createElement('p');
  private results=document.createElement('pre');
  private runButton=document.createElement('button');
  private select=document.createElement('select');
  private measuring=false;
  private running=false;
  private interrupted=false;
  private previous=0;
  private markAt=0;
  private frameStart=0;
  private frameNumber=0;
  private durations:number[]=[];
  private sections:Record<string,number[]>={};
  private counters:Record<string,number[]>={};
  private gpuTimes:number[]=[];
  private longTasks:number[]=[];
  private gl:WebGL2RenderingContext;
  private extension:GpuExtension|null;
  private pending:WebGLQuery[]=[];
  private currentQuery:WebGLQuery|null=null;
  private gpuDisjoint=false;
  private observer:PerformanceObserver|null=null;
  constructor(private hooks:Hooks){
    this.gl=hooks.renderer.getContext() as WebGL2RenderingContext;this.extension=this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as GpuExtension|null;
    this.panel.className='benchmark';this.panel.setAttribute('aria-label','Стресс-тест');
    const title=document.createElement('strong');title.textContent='Лаборатория FPS · отдельный тестовый мир';
    this.runButton.textContent='Запустить весь тест';
    this.select.setAttribute('aria-label','Сценарий нагрузки');
    for(const [index,scenario] of scenarios.entries()){const option=document.createElement('option');option.value=String(index);option.textContent=scenario.name;this.select.append(option);}
    const single=document.createElement('button');single.textContent='Проверить выбранный';
    const cancel=document.createElement('button');cancel.textContent='Остановить';cancel.onclick=()=>{if(this.running){this.interrupted=true;this.status.textContent='Останавливаем после текущего замера…';}};
    this.runButton.onclick=()=>void this.run(scenarios);single.onclick=()=>void this.run([scenarios[Number(this.select.value)]]);
    this.status.textContent='Сначала 5 секунд прогрева, затем 12 секунд измерения каждого сценария. Держите вкладку видимой. Изменение размера или сворачивание делает прогон недействительным.';
    this.panel.append(title,this.runButton,this.select,single,cancel,this.status,this.results);document.body.append(this.panel);
    const invalidate=()=>{if(this.running)this.interrupted=true;};document.addEventListener('visibilitychange',invalidate);addEventListener('resize',invalidate);addEventListener('blur',invalidate);
    for(const event of ['pointerdown','wheel','keydown'])hooks.renderer.domElement.addEventListener(event,invalidate);
    if(PerformanceObserver.supportedEntryTypes.includes('longtask')){this.observer=new PerformanceObserver(list=>{if(this.measuring)for(const entry of list.getEntries())this.longTasks.push(entry.duration);});this.observer.observe({entryTypes:['longtask']});}
  }
  get freezeAnimations(){return this.variant==='no-animation';}
  begin(timestamp:number){
    if(!this.measuring)return;
    if(this.previous)this.durations.push(timestamp-this.previous);this.previous=timestamp;
    this.markAt=this.frameStart=performance.now();
  }
  mark(name:string){if(!this.measuring)return;const now=performance.now();(this.sections[name]??=[]).push(now-this.markAt);this.markAt=now;}
  gpuBegin(){
    if(!this.measuring||!this.extension)return;
    const gl=this.gl,ext=this.extension;
    if(gl.getParameter(ext.GPU_DISJOINT_EXT)){this.gpuDisjoint=true;for(const query of this.pending)gl.deleteQuery(query);this.pending=[];return;}
    while(this.pending.length&&gl.getQueryParameter(this.pending[0],gl.QUERY_RESULT_AVAILABLE)){
      const query=this.pending.shift()!;this.gpuTimes.push(Number(gl.getQueryParameter(query,gl.QUERY_RESULT))/1e6);gl.deleteQuery(query);
    }
    if(++this.frameNumber%4===0&&this.pending.length<8){this.currentQuery=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,this.currentQuery);}
  }
  end(){
    if(this.currentQuery){this.gl.endQuery(this.extension!.TIME_ELAPSED_EXT);this.pending.push(this.currentQuery);this.currentQuery=null;}
    if(!this.measuring)return;
    this.mark('render-submit');
    const {renderer,game}=this.hooks;
    const values={cpuFrame:performance.now()-this.frameStart,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,players:game.players.length,warriors:game.players.filter(p=>p.classId==='warrior').length,archers:game.players.filter(p=>p.classId==='archer').length,mages:game.players.filter(p=>p.classId==='mage').length,activeAttacks:game.players.filter(p=>!!p.attack).length,activeSkills:game.players.filter(p=>!!p.attack?.skillId).length,mobs:game.mobs.length,liveMobs:game.mobs.filter(m=>m.state!=='dead').length,projectiles:game.projectiles.length,snapshotAge:performance.now()-game.receivedAt};
    for(const [key,value] of Object.entries(values))(this.counters[key]??=[]).push(value);
  }
  private reset(){
    this.previous=0;this.frameNumber=0;this.durations=[];this.sections={};this.counters={};this.gpuTimes=[];this.longTasks=[];this.gpuDisjoint=false;
    for(const query of this.pending)this.gl.deleteQuery(query);this.pending=[];
  }
  private async run(list:Scenario[]){
    if(this.running)return;this.running=true;this.runButton.disabled=true;this.interrupted=false;
    try{
      const environment=await (await fetch('/__stress/info')).json() as {hardware:unknown};
      for(const scenario of list){
        if(this.interrupted)throw new Error('Прогон прерван: вкладка потеряла фокус или изменился размер окна. Запустите заново.');
        this.measuring=false;this.status.textContent=`${scenario.name}: подключение игроков…`;
        const equipment=new URLSearchParams(location.search).get('equipment');
        await request('scenario',{...scenario,equipment});
        this.variant='full';this.hooks.setVariant('full');
        const deadline=performance.now()+15000;
        while(this.hooks.game.players.length!==scenario.players||!this.hooks.modelsReady()){if(performance.now()>deadline)throw new Error('Не загрузились модели всех игроков');await pause(100);}
        this.variant=scenario.variant;this.hooks.setVariant(this.variant);
        this.status.textContent=`${scenario.name}: прогрев 5 секунд…`;await pause(5000);
        this.reset();await request('reset-metrics',{});this.measuring=true;
        this.status.textContent=`${scenario.name}: измерение 12 секунд…`;const started=performance.now();await pause(12000);this.measuring=false;
        if(this.interrupted||document.hidden)throw new Error('Недействительный прогон: вкладка скрыта, окно/фокус изменились или было ручное управление.');
        if(!this.durations.length||this.counters.players?.some(count=>count!==scenario.players)||!this.hooks.game.connected)throw new Error('Недействительный прогон: потеряно соединение или изменилось число игроков.');
        const gl=this.gl,debug=gl.getExtension('WEBGL_debug_renderer_info');
        const report={scenario,equipmentProfile:equipment||'default',valid:true,measurementMs:performance.now()-started,frames:frameSummary(this.durations),cpuSections:Object.fromEntries(Object.entries(this.sections).map(([k,v])=>[k,distribution(v)])),counters:Object.fromEntries(Object.entries(this.counters).map(([k,v])=>[k,distribution(v)])),gpu:{available:!!this.extension,disjoint:this.gpuDisjoint,milliseconds:this.gpuDisjoint?null:distribution(this.gpuTimes)},longTasks:distribution(this.longTasks),browser:navigator.userAgent,hardware:environment.hardware,graphics:{renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),width:innerWidth,height:innerHeight,dpr:this.hooks.renderer.getPixelRatio(),displayDpr:devicePixelRatio,cameraPosition:this.hooks.camera.position.toArray(),cameraQuaternion:this.hooks.camera.quaternion.toArray(),cameraZoom:'zoom' in this.hooks.camera?this.hooks.camera.zoom:null,shadows:this.hooks.renderer.shadowMap.enabled},rawFrameMs:this.durations};
        const saved=await request('report',report);const frames=report.frames,cpu=report.counters.cpuFrame;
        const server=saved.server as {activeAfk?:number;skillCasts?:Record<string,number>;attackCasts?:number;projectilePeak?:number}|undefined;
        const afkActivity=scenario.mode==='afk'&&server?` · AFK ${server.activeAfk}/${scenario.players} · навыки ${Object.values(server.skillCasts??{}).reduce((sum,count)=>sum+count,0)} · атаки ${server.attackCasts} · снаряды пик ${server.projectilePeak}`:'';
        this.results.textContent+=`${scenario.name}: ${frames.fps?.toFixed(1)} FPS · p95 ${frames.p95?.toFixed(1)} мс · >50мс ${frames.over50} · CPU ${cpu.mean?.toFixed(1)} мс${afkActivity}\n`;
        console.info('Benchmark saved',saved.file);
      }
      this.status.textContent='Готово. JSON-отчёты сохранены в artifacts/performance. Можно повторить отдельный сценарий.';
    }catch(error){this.status.textContent=error instanceof Error?error.message:'Ошибка теста';}
    finally{this.measuring=false;try{await request('scenario',{players:1,mode:'camp'});}catch{this.status.textContent+=' Не удалось отключить ботов; перезапустите npm run stress.';}this.variant='full';this.hooks.setVariant('full');this.running=false;this.runButton.disabled=false;}
  }
}
