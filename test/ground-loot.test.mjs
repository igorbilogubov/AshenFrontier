import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,makeLoot,persistentHero,safeHero} from '../dist/world.js';
import {MOB_TYPES,stand} from '../dist/public/game/location.js';
import {BAG_CAPACITY,backpackItems} from '../dist/public/rules.js';
import {LOOT_TTL_MS,MAX_GROUND_DROPS_PER_HERO,GEAR_CHANCE} from '../dist/public/game/loot-rules.js';
import {validateEquipment} from '../dist/public/game/equipment-items.js';

function fixture(random=()=>.5){
  const w=new World({random}),p=newHero('Владелец');w.add(p);
  const m=w.mobs[0];w.mobs=[m];Object.assign(m,{x:8,z:1.8,homeX:8,homeZ:1.8,hp:MOB_TYPES[m.type].hp,state:'idle'});
  Object.assign(p,{x:8,z:1.8});
  return {w,p,m};
}
function kill(w,p,m){m.state='idle';m.hp=MOB_TYPES[m.type].hp;m.contributors.set(p.id,{at:w.t,damage:m.hp});w.kill(m);}
const tick=(w,n=1)=>{for(let i=0;i<n;i++)w.tick(.05,w.t+50);};

test('each eligible contributor sees only personal ground gold; XP and quest credit are immediate',()=>{
  const {w,p,m}=fixture(),other=newHero('Союзник'),idle=newHero('Прохожий');
  Object.assign(other,{x:8,z:2});w.add(other);w.add(idle);
  m.contributors.set(p.id,{at:w.t,damage:30});m.contributors.set(other.id,{at:w.t,damage:30});w.kill(m);
  for(const hero of [p,other]){
    assert.equal(hero.gold,0);assert.equal(hero.xp,13);assert.equal(hero.questKills,1);assert.equal(hero.items.length,2);
    const drops=w.snapshot(hero.id).groundLoot;assert.equal(drops.length,1);assert.equal(drops[0].kind,'gold');assert.equal(drops[0].amount,8);
    assert(!('owner' in drops[0]));
  }
  assert.deepEqual(w.snapshot(idle.id).groundLoot,[]);
  const otherDrop=w.snapshot(other.id).groundLoot[0];w.command(p,{type:'pickup',id:otherDrop.id});assert.equal(p.gold,0);
  const own=w.snapshot(p.id).groundLoot[0];w.command(p,{type:'pickup',id:own.id});assert.equal(p.gold,8);
  w.command(p,{type:'pickup',id:own.id});assert.equal(p.gold,8);assert.equal(w.snapshot(other.id).groundLoot.length,1);
  assert.deepEqual(safeHero(persistentHero(p)).items,p.items);
});

test('no guaranteed first-kill gear; rates are 10% common and 40% boss with one rolled item at most',()=>{
  assert.deepEqual(GEAR_CHANCE,{wolf:.10,boar:.10,bear:.10,alpha:.40,lynx:.10,yak:.10,'frost-spider':.10,'ice-golem':.10,'ash-jackal':.10,scorpion:.10,'monitor-lizard':.10,scarab:.10});
  const none=fixture(()=>.5);kill(none.w,none.p,none.m);
  assert.equal(none.w.snapshot(none.p.id).groundLoot.filter(d=>d.kind==='item').length,0);
  const all=fixture(()=>0);kill(all.w,all.p,all.m);
  const itemDrop=all.w.snapshot(all.p.id).groundLoot.filter(d=>d.kind==='item');assert.equal(itemDrop.length,1);
  validateEquipment(itemDrop[0].item);assert.equal(itemDrop[0].item.classId,all.p.classId);
  assert(stand(itemDrop[0].x,itemDrop[0].z));
  const previous=structuredClone(itemDrop[0].item);all.w.command(all.p,{type:'pickup',id:itemDrop[0].id});
  assert.deepEqual(all.p.items.at(-1),previous);assert.deepEqual(safeHero(persistentHero(all.p)).items.at(-1),previous);
});

test('distant click approaches server-side without attack; neutral packets preserve target and manual steering cancels',()=>{
  const {w,p,m}=fixture();kill(w,p,m);const drop=w.snapshot(p.id).groundLoot[0];
  Object.assign(p,{x:6,z:1.8});w.command(p,{type:'pickup',id:drop.id});assert.deepEqual(p.interactionTarget,{kind:'loot',id:drop.id});
  for(let seq=1;seq<=5;seq++){w.command(p,{type:'input',x:0,z:0,aim:null,seq});tick(w);assert(p.interactionTarget);}
  assert(p.x>6);assert.equal(p.attack,null);
  w.command(p,{type:'input',x:1,z:0,aim:0,seq:6});assert.equal(p.interactionTarget,null);
  w.command(p,{type:'pickup',id:drop.id});for(let i=0;i<60&&w.snapshot(p.id).groundLoot.length;i++)tick(w);
  assert.equal(p.gold,8);assert.equal(w.snapshot(p.id).groundLoot.length,0);assert.equal(p.interactionTarget,null);
});

test('a wall blocks server pickup and approach even with a forged personal drop id',()=>{
  const {w,p}=fixture();w.mobs=[];
  Object.assign(p,{x:-1.5,z:-4.6});assert(stand(p.x,p.z));assert(stand(-8,-4.6));
  w.addGroundDrop(p.id,{id:'behind-hut',kind:'gold',x:-8,z:-4.6,amount:8,expiresAt:w.t+LOOT_TTL_MS});
  w.command(p,{type:'pickup',id:'behind-hut'});
  assert.equal(p.gold,0);assert.equal(p.interactionTarget,null);
  assert.equal(w.snapshot(p.id).groundLoot.length,1);
});

test('full backpack leaves item on ground while gold remains collectible; expiry and per-owner cap hold',()=>{
  const {w,p,m}=fixture(()=>0);kill(w,p,m);
  while(backpackItems(p).length<BAG_CAPACITY)p.items.push(makeLoot('warrior',1,0,'ring'));
  const drops=w.snapshot(p.id).groundLoot,item=drops.find(d=>d.kind==='item'),gold=drops.find(d=>d.kind==='gold');
  w.command(p,{type:'pickup',id:item.id});assert.equal(backpackItems(p).length,BAG_CAPACITY);assert.equal(w.snapshot(p.id).groundLoot.length,2);
  w.command(p,{type:'pickup',id:gold.id});assert.equal(p.gold,8);assert.equal(w.snapshot(p.id).groundLoot.length,1);
  for(let i=0;i<MAX_GROUND_DROPS_PER_HERO+2;i++)w.addGroundDrop(p.id,{id:String(i),kind:'gold',x:8,z:1.8,amount:1,expiresAt:w.t+LOOT_TTL_MS});
  assert.equal(w.snapshot(p.id).groundLoot.length,MAX_GROUND_DROPS_PER_HERO);
  tick(w,1);assert(w.snapshot(p.id).groundLoot.length);w.tick(.05,w.t+LOOT_TTL_MS+1);assert.deepEqual(w.snapshot(p.id).groundLoot,[]);
  // Loose drops are explicitly transient even when the owner is saved.
  const restored=safeHero(persistentHero(p));const restarted=new World();restarted.add(restored);assert.deepEqual(restarted.snapshot(restored.id).groundLoot,[]);
});
