import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,stats,safeHero,persistentHero} from '../dist/world.js';
import {DUNGEONS,DUNGEON_SPAWNS,DUNGEON_PASSAGES,inBossTelegraph,dungeonSafe} from '../dist/public/game/dungeons.js';
import {ALL_PORTALS} from '../dist/public/game/stadium.js';
import {SPAWNS,mobConfig,stand,clearPath,safe} from '../dist/public/game/location.js';
import {fieldRegionAt,locationAt,sameLocation} from '../dist/public/game/world-layout.js';
import {LATE_REGIONS} from '../dist/public/game/late-world.js';
import {xpNeeded} from '../dist/public/game/progression-curve.js';
const advance=(w,seconds)=>{for(let i=0;i<Math.ceil(seconds/.05);i++)w.tick(.05);};
function fixture(region='forest',level=100){const w=new World({random:()=>0}),d=DUNGEONS.find(d=>d.region===region),p=newHero('Dungeon QA');p.level=level;p.x=d.boss.x-4;p.z=0;p.hp=stats(p).maxHp;p.mana=stats(p).maxMana;w.add(p);return {w,d,p,boss:w.mobs.find(m=>m.bossId===d.id),guards:w.mobs.filter(m=>m.dungeonId===d.id&&!m.bossId)};}
test('seven dungeons have an open route, legal homes, exits and distinct regional loot',()=>{
 assert.equal(DUNGEONS.length,7);assert.equal(DUNGEON_SPAWNS.length,91);assert.equal(SPAWNS.length,711);
 for(const d of DUNGEONS){assert(dungeonSafe(d.entry));assert.equal(locationAt(d.entry),d.id);assert.equal(fieldRegionAt(d.boss),d.region);assert(clearPath(d.entry,d.boss));for(const p of DUNGEON_SPAWNS.filter(s=>s.dungeonId===d.id)){assert(stand(p.x,p.z,mobConfig(p).radius));assert(!safe(p));}}
 for(const p of ALL_PORTALS){assert(stand(p.x,p.z),`${p.id} source blocked`);assert(stand(p.destination.x,p.destination.z),`${p.id} destination blocked`);}
 for(const p of DUNGEON_PASSAGES)assert(!sameLocation(p,p.destination));
 for(const region of LATE_REGIONS)assert.equal(locationAt(region.entry),region.id);
});
test('boss is shielded until all guards die; killed guards cannot respawn or yield twice',()=>{
 const {w,d,p,boss,guards}=fixture();assert(boss.bossLocked);assert(!w.hurtMob(p,boss,100));const hp=boss.hp;
 for(const g of guards){p.x=g.x;p.z=g.z;assert(w.hurtMob(p,g,1e8));}
 assert.equal(boss.hp,hp);assert(!boss.bossLocked);p.x=d.entry.x;p.z=d.entry.z;advance(w,30);assert(guards.every(g=>g.state==='dead'));
 const count=w.groundLoot.length;w.kill(guards[0]);assert.equal(w.groundLoot.length,count);
});
test('all three boss warnings damage only players inside the displayed shape and protect the foyer',()=>{
 const {w,p,boss,guards,d}=fixture();for(const g of guards)g.state='dead';w.refreshDungeon(d.id);boss.state='chase';boss.target=p.id;
 const shapes=[];
 for(let i=0;i<3;i++){
  p.hp=1e6;p.dead=0;p.x=boss.x;p.z=boss.z+4;w.tick(.05);assert(boss.telegraph);const t={...boss.telegraph};shapes.push(t.kind);const before=p.hp;
  if(t.kind==='circle'){p.x=t.x+5;p.z=t.z;}else if(t.kind==='cone'){p.x=t.x-5;p.z=t.z;}else{p.x=t.x;p.z=t.z;}
  assert(!inBossTelegraph(t,p));advance(w,t.duration+.05);assert.equal(p.hp,before);
  advance(w,1.1);boss.state='chase';boss.timer=0;
 }
 assert.deepEqual(shapes,['cone','circle','ring']);
 boss.telegraph={kind:'circle',x:p.x,z:p.z,yaw:0,radius:3,innerRadius:0,halfAngle:0,remaining:.01,duration:1};boss.state='windup';const hp=p.hp;w.tick(.05);assert(p.hp<hp);
 p.x=d.entry.x;p.z=0;const safeHp=p.hp;advance(w,2);assert(p.hp>=safeHp);assert(!boss.telegraph);
});
test('boss rewards use parent region, support yellow and set rolls, and cap progression at100',()=>{
 for(const [random,rarity] of [[.08,3],[.02,4]]){
  const {w,d,p,boss,guards}=fixture('citadel',99);w.random=()=>random;for(const g of guards)g.state='dead';w.refreshDungeon(d.id);p.x=boss.x;p.z=boss.z;p.xp=xpNeeded(99)-1;assert(w.hurtMob(p,boss,1e9));assert.equal(p.level,100);assert.equal(p.xp,0);
  const item=w.groundLoot.find(g=>g.kind==='item').item;assert.equal(item.rarity,rarity);assert.equal(item.itemLevel,85);const saved=safeHero(persistentHero(p));assert.equal(saved.level,100);assert.equal(stats(saved).xpNeeded,0);
  p.x=d.entry.x;p.z=0;advance(w,181);assert.equal(boss.state,'idle');assert(boss.bossLocked);assert(guards.every(m=>m.state!=='dead'));
 }
});
test('level checks reject a dungeon entrance and persisted low-level region positions',()=>{
 const w=new World(),p=newHero();w.add(p);for(const d of DUNGEONS){Object.assign(p,d.entrance);assert(!w.usePortal(p,`enter-${d.id}`));const saved=safeHero({...persistentHero(p),...d.entry});assert.equal(locationAt(saved),'forest');}
});
