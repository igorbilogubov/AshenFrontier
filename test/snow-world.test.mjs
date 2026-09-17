import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,persistentHero,safeHero,stats} from '../dist/world.js';
import {SPAWNS,stand,safe,mobConfig,clearPath,distance,translate} from '../dist/public/game/location.js';
import {SNOW_BOUNDS,SNOW_ENTRY,SNOW_SPOTS,SNOW_SPAWNS,SNOW_PASSAGES,SNOW_ROADS,SNOW_TREES} from '../dist/public/game/snow.js';
import {WORLD_BOUNDS,locationAt} from '../dist/public/game/world-layout.js';
import {gearRarity} from '../dist/public/game/loot-rules.js';
import {CLASS_ITEMS,RARE_CLASS_ITEMS,rollEquipment,validateEquipment} from '../dist/public/game/equipment-items.js';
const area=b=>(b.maxX-b.minX)*(b.maxZ-b.minZ);
const step=(w,count)=>{for(let i=0;i<count;i++)w.tick(.05);};

test('snow is exactly three forest areas with four species, eight six-member spots, 48 roamers and two elites',()=>{
 assert.equal(area(SNOW_BOUNDS),area(WORLD_BOUNDS)*3);assert.equal(SNOW_SPAWNS.length,98);
 assert.equal(SNOW_SPOTS.length,8);assert.equal(SNOW_SPAWNS.filter(s=>!s.spotId&&!s.eliteId).length,48);
 assert.equal(new Set(SNOW_SPAWNS.map(s=>s.type)).size,4);assert.equal(SPAWNS[6].eliteId,'grey-alpha');assert.equal(SPAWNS[95].eliteId,'elder-bear');
 for(const spawn of SNOW_SPAWNS){assert(stand(spawn.x,spawn.z,mobConfig(spawn).radius));assert(!safe(spawn));}
 for(const spot of SNOW_SPOTS)for(const id of spot.spawnIds)assert.equal(SPAWNS[id].spotId,spot.id);
 for(const road of SNOW_ROADS)for(let i=1;i<road.points.length;i++)assert(clearPath(road.points[i-1],road.points[i]),road.id);
 assert(SNOW_TREES.length>10);for(const tree of SNOW_TREES)assert(!stand(tree.x,tree.z));
 for(let x=206;x<260;x++)assert(!stand(x,8));
});

test('server enforces level ten on click and held movement, returns without gate and persists snowy position',()=>{
 const w=new World(),p=newHero('Перевал');w.add(p);w.mobs=[];
 Object.assign(p,{x:67,z:5,level:9});assert.equal(w.startPortal(p,'forest-snow'),false);
 w.command(p,{type:'portal',portalId:'forest-snow',x:268,z:8,level:99});assert.equal(locationAt(p),'forest');assert.equal(p.level,9);
 assert(w.events.some(e=>e.type==='notice'&&e.text.includes('10')));
 p.level=10;w.command(p,{type:'input',x:1,z:0,aim:null,seq:1});step(w,6);assert.equal(locationAt(p),'snow');assert(distance(p,SNOW_ENTRY)<.01);
 step(w,20);assert.equal(locationAt(p),'snow');
 assert.deepEqual({x:safeHero(persistentHero(p)).x,z:safeHero(persistentHero(p)).z},SNOW_ENTRY);
 assert(w.startPortal(p,'snow-forest'));for(let i=0;i<100&&locationAt(p)==='snow';i++)w.tick(.05);assert.equal(locationAt(p),'forest');
 Object.assign(p,{...SNOW_PASSAGES[1],level:1});assert(w.startPortal(p,'snow-forest'));assert.equal(locationAt(p),'forest');
 const saved=persistentHero(p);Object.assign(saved,{...SNOW_ENTRY,level:1});assert.equal(locationAt(safeHero(saved)),'forest');
});

test('snow snapshots, loot, attacks and contributions remain region isolated',()=>{
 const w=new World({random:()=>0}),p=newHero('Снег','mage'),f=newHero('Лес');Object.assign(p,SNOW_ENTRY,{level:10});w.add(p);w.add(f);
 const snap=w.snapshot(p.id);assert.equal(snap.mobs.length,98);assert.deepEqual(snap.players.map(h=>h.id),[p.id]);assert.equal(w.snapshot(f.id).mobs.length,72);
 const snow=w.mobs[96];assert.equal(w.aimedMob(f,snow.id,999),null);
 snow.contributors.set(f.id,{at:w.t,damage:999});w.kill(snow);assert.equal(f.kills,0);assert.equal(w.snapshot(f.id).groundLoot.length,0);
});

test('elite rare reward is 4% absolute, ordinary gear can be white and saved rare ranges remain exact',()=>{
 assert.equal(gearRarity('yak','frost-matriarch',()=>.199999),0);assert.equal(gearRarity('yak','frost-matriarch',()=>.20),1);assert.equal(gearRarity('yak','frost-matriarch',()=>.32),2);assert.equal(gearRarity('yak','frost-matriarch',()=>.4),null);assert.equal(gearRarity('yak',undefined,()=>0),0);
 for(const classId of ['warrior','archer','mage'])for(const [i,definition] of RARE_CLASS_ITEMS[classId].entries()){
  const item=rollEquipment(definition.id,definition.id,()=>.5);validateEquipment(item);assert.equal(item.rarity,2);assert.equal(definition.appearance,CLASS_ITEMS[classId][i].appearance);
  for(const [j,roll] of item.rolls.entries()){
    const green=CLASS_ITEMS[classId][i].ranges[j];if(!green)continue;
    assert(roll.max>green.max);
  }
  assert.deepEqual(rollEquipment(definition.id,definition.id,()=>.5),item);
 }
 for(const id of [6,95,192,193]){
  const w=new World({random:()=>.33}),p=newHero('Награда');w.add(p);const m=w.mobs[id];Object.assign(p,{x:m.x,z:m.z,level:20});m.contributors.set(p.id,{at:w.t,damage:9999});w.kill(m);
  const drop=w.snapshot(p.id).groundLoot.filter(d=>d.kind==='item');assert.equal(drop.length,1);assert.equal(drop[0].item.rarity,2);assert(m.timer>=180);
  assert(w.pickUp(p,drop[0].id));assert.deepEqual(safeHero(persistentHero(p)).items,p.items);
  w.mobs=[m];const timer=m.timer;m.timer=.08;step(w,2);assert.equal(m.state,'idle');assert.equal(m.hp,mobConfig(m).hp);assert(timer>24);
 }
});

test('snow auto-hunt stays stationary and kills the entry species at level ten',()=>{
 for(const classId of ['warrior','archer','mage']){
  const w=new World({random:()=>0}),p=newHero(classId,classId);w.add(p);Object.assign(p,{x:288,z:-12,level:10});p.hp=stats(p).maxHp;p.mana=stats(p).maxMana;
  w.mobs=w.mobs.filter(m=>m.id===96);const m=w.mobs[0];Object.assign(m,{x:p.x+1.1,z:p.z,homeX:p.x+1.1,homeZ:p.z});assert(w.startAfk(p));
  for(let i=0;i<1000&&!p.kills&&!p.dead;i++)w.tick(.05);assert(p.kills>0,classId);assert.deepEqual({x:p.x,z:p.z},{x:288,z:-12});
 }
});
