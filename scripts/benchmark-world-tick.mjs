/** In-memory simulation only: no server, sockets, database or hero saves. */
import {performance} from 'node:perf_hooks';
import {stripTypeScriptTypes} from 'node:module';
import {execFileSync} from 'node:child_process';
import {writeFile,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import * as current from '../dist/world.js';
import {DUNGEONS} from '../dist/public/game/dungeons.js';
import {LATE_REGIONS} from '../dist/public/game/late-world.js';
import {SNOW_SPOTS} from '../dist/public/game/snow.js';
import {WASTELAND_SPOTS} from '../dist/public/game/wasteland.js';
import {AFK_SPOTS} from '../dist/public/game/afk.js';
import {locationAt} from '../dist/public/game/world-layout.js';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>arg.replace(/^--/,'').split('=')));
const count=Number(args.players??16),ticks=Number(args.ticks??1200),warmup=Number(args.warmup??200),afk=args.afk!=='false';
if(![count,ticks,warmup].every(Number.isSafeInteger)||count<1||count>64||warmup<0||ticks<=warmup)throw Error('Use --players=1..64 --ticks=N --warmup=N (< ticks) [--afk=false] [--compare=commit].');
if(args.compare&&!/^[a-f0-9]{7,40}$/i.test(args.compare))throw Error('--compare must be a commit hash.');
const points=[AFK_SPOTS[0],SNOW_SPOTS[0],WASTELAND_SPOTS[0],...LATE_REGIONS.map(r=>r.spots[0]),...DUNGEONS.map(d=>({x:d.bounds.minX+31,z:0})),AFK_SPOTS.find(s=>s.id.startsWith('stadium')),AFK_SPOTS[1]];
const quantiles=values=>{values.sort((a,b)=>a-b);return {mean:values.reduce((n,v)=>n+v,0)/values.length,p50:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],p99:values[Math.floor(values.length*.99)],max:values.at(-1)};};
function fixture(name,api){
  let seed=7;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const w=new api.World({random}),players=[];
  for(let i=0;i<count;i++){
    const p=api.newHero(`CPU ${i}`,'mage');
    Object.assign(p,points[i%points.length],{id:`cpu-${i}`,level:100,hp:1e9,mana:1e9});w.add(p);if(afk)w.startAfk(p);players.push(p);
  }
  return {name,w,players,wall:[],cpu:[],snapshotWall:[],snapshotCpu:[]};
}
// UUIDs and wall-clock timestamps are excluded; compare actual encounter state.
function encounter(s){return createHash('sha256').update(JSON.stringify({
  players:s.players.map(p=>[p.x,p.z,p.hp,p.mana,p.kills,p.xp,p.attack?.age,p.attack?.skillId]),
  mobs:s.w.mobs.map(m=>[m.id,m.x,m.z,m.hp,m.state,m.timer,m.target]),
  projectiles:s.w.projectiles.map(p=>[p.owner,p.x,p.z,p.yaw,p.remaining]),
  loot:s.w.groundLoot.map(d=>[d.owner,d.kind,d.x,d.z,d.gold,d.item?.definitionId])
})).digest('hex');}
let baselineFile;
try{
  const fixtures=[];
  if(args.compare){
    const source=execFileSync('git',['show',`${args.compare}:world.ts`],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
    baselineFile=new URL(`../dist/world-benchmark-baseline-${process.pid}.js`,import.meta.url);
    await writeFile(baselineFile,stripTypeScriptTypes(source,{mode:'transform'}));
    fixtures.push(fixture(args.compare,await import(baselineFile.href)));
  }
  fixtures.push(fixture('current',current));
  console.log(JSON.stringify({node:process.version,cpu:os.cpus()[0].model,mobs:fixtures[0].w.mobs.length,players:count,afk,ticks,warmup,stepMs:50,maps:Array.from({length:count},(_,i)=>locationAt(points[i%points.length]))}));
  for(let tick=0;tick<ticks;tick++)for(const s of tick%2?fixtures.toReversed():fixtures){
    // Saturate repeated attacks without deaths or potion supply ending the run.
    for(const p of s.players){p.hp=1e9;p.mana=1e9;p.combatUntil=s.w.t+15000;}
    const cpu=process.cpuUsage(),start=performance.now();s.w.tick(.05);
    const wall=performance.now()-start,used=process.cpuUsage(cpu);
    if(tick>=warmup){
      s.wall.push(wall);s.cpu.push((used.user+used.system)/1000);
      if(tick%20===0){const cpu=process.cpuUsage(),start=performance.now();for(const p of s.players)JSON.stringify(s.w.snapshot(p.id));const used=process.cpuUsage(cpu);s.snapshotWall.push(performance.now()-start);s.snapshotCpu.push((used.user+used.system)/1000);}
    }
    s.w.events=[];
  }
  for(const s of fixtures)console.log(JSON.stringify({name:s.name,tickWallMs:quantiles(s.wall),tickCpuMs:quantiles(s.cpu),allSnapshotsWallMs:quantiles(s.snapshotWall),allSnapshotsCpuMs:quantiles(s.snapshotCpu),kills:s.players.reduce((sum,p)=>sum+p.kills,0),encounterHash:encounter(s)}));
  if(fixtures.length===2&&encounter(fixtures[0])!==encounter(fixtures[1]))throw Error('Baseline and current encounter outcomes differ.');
}finally{if(baselineFile)await unlink(baselineFile);}
