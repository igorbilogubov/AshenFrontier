import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,safeHero,persistentHero,stats,makeLoot,EQUIPMENT_SLOTS} from '../dist/world.js';
import {safe,stand,moveHero,MOB_TYPES} from '../dist/public/game/location.js';
const setup=(classId='warrior')=>{const w=new World({random:()=>0}),p=newHero('Тест',classId);w.add(p);return {w,p};};
const step=(w,count=1)=>{for(let i=0;i<count;i++)w.tick(.05,w.t+50);};
function isolated(w,p){const m=w.mobs[0];w.mobs=[m];Object.assign(m,{x:8,z:1.8,homeX:8,homeZ:1.8,state:'idle',hp:60});Object.assign(p,{x:6.6,z:1.8,yaw:Math.PI/2,targetYaw:Math.PI/2});return m;}

test('legacy migration preserves every hero, item, slot, level, XP and gold without changing source',()=>{
  for(const classId of ['warrior','archer','mage']){
    const p=newHero('Старый',classId);for(const slot of Object.keys(EQUIPMENT_SLOTS)){const item=makeLoot(classId,10,1,slot);p.items.push(item);p.equipment[slot]=item.id;}
    const legacy={...persistentHero(p),schemaVersion:undefined,x:720,y:1728,level:10,xp:325,gold:2189,kills:105};delete legacy.z;
    const before=structuredClone(legacy),m=safeHero(legacy);
    assert.deepEqual(legacy,before);for(const k of ['id','name','classId','level','xp','gold','kills','items','equipment'])assert.deepEqual(m[k],legacy[k],k);
    assert(stand(m.x,m.z));assert(safe(m));assert.equal(m.questKills,0);
    assert.deepEqual(persistentHero(safeHero(persistentHero(m))),persistentHero(m));
  }
});
test('new save restores location, injury, quest and cooldowns without granting a heal',()=>{
  const {p}=setup();Object.assign(p,{x:8,z:2,hp:24,potions:1,potionCooldown:3,specialCooldown:4,questKills:5,boss:true,questClaimed:true,gold:150});
  const restored=safeHero(persistentHero(p));for(const key of ['x','z','hp','potions','potionCooldown','specialCooldown','questKills','boss','questClaimed','gold'])assert.equal(restored[key],p[key]);
});
test('forged state, coordinates, NaN, speed and items cannot modify the world',()=>{
  const {w,p}=setup(),before=persistentHero(p);
  for(const m of [{type:'state',x:25,hp:99999,gold:99999},{type:'input',x:1e9,z:0,aim:0,seq:1},{type:'input',x:NaN,z:0,aim:0,seq:1},{type:'equip',id:'forged'},{type:'move',x:25,z:0},{type:'attack',yaw:NaN}])w.command(p,m);
  assert.deepEqual(persistentHero(p),before);
});
test('input is speed-limited, collision-safe and expires when packets stop',()=>{
  const {w,p}=setup();Object.assign(p,{x:2,z:2,running:true});let seq=0;
  for(let i=0;i<20;i++){w.command(p,{type:'input',x:1,z:1,aim:0,seq:++seq});step(w);}
  assert(Math.hypot(p.x-2,p.z-2)<3.81);
  step(w,20);const x=p.x,z=p.z;step(w,10);assert.equal(p.x,x);assert.equal(p.z,z);
  const testHero={...p,x:-.8,z:-.6,vx:0,vz:0,attack:null,dead:0};for(let i=0;i<80;i++)moveHero(testHero,.05,{x:-1,z:0,aim:0});assert(stand(testHero.x,testHero.z));assert(testHero.x>-2.3);
});
test('attacks use server range, timing and cooldown rather than packet damage',()=>{
  const {w,p}=setup(),m=isolated(w,p);w.command(p,{type:'attack',yaw:Math.PI/2,damage:99999});assert.equal(m.hp,60);
  step(w,5);assert.equal(m.hp,60);step(w,2);assert(m.hp<60&&m.hp>20);const hp=m.hp;
  for(let i=0;i<50;i++)w.command(p,{type:'attack',yaw:Math.PI/2});step(w,2);assert.equal(m.hp,hp);
});
test('both nearby contributors earn personal persistent loot and a distant/idle bystander does not',()=>{
  const {w,p}=setup(),m=isolated(w,p),other=newHero('Союзник'),idle=newHero('Наблюдатель');Object.assign(other,{x:7,z:2.3});w.add(other);w.add(idle);
  w.hurtMob(p,m,25);w.hurtMob(other,m,35);
  for(const player of [p,other]){assert.equal(player.gold,8);assert.equal(player.xp,12);assert.equal(player.questKills,1);assert.equal(player.items.length,3);}
  assert.equal(idle.gold,0);assert.equal(idle.items.length,2);
  const reward=p.gold;w.kill(m);assert.equal(p.gold,reward);
  assert.deepEqual(w.snapshot(p.id).mobs,w.snapshot(other.id).mobs);
  const peers=w.snapshot(p.id).players;assert(peers.every(p=>!('items'in p)&&!('token'in p)&&!('gold'in p)));
});
test('full bag keeps earned equipment pending across reconnect until a slot is freed',()=>{
  const {w,p}=setup(),m=isolated(w,p);while(p.items.length<18)p.items.push(makeLoot(p.classId,1,0,'ring'));
  w.hurtMob(p,m,100);assert.equal(p.items.length,18);assert.equal(p.pendingItems.length,1);
  const restored=safeHero(persistentHero(p));assert.equal(restored.pendingItems.length,1);
  w.camp(p,true);p.combatUntil=0;w.command(p,{type:'sell',id:p.items.at(-1).id});w.command(p,{type:'claim'});assert.equal(p.pendingItems.length,0);assert.equal(p.items.length,18);
});
test('quest payout and level advancement are persistent and not repeatable on re-entry',()=>{
  const {w,p}=setup();Object.assign(p,{questKills:5,boss:true,xp:64});step(w);assert.equal(p.gold,50);assert(p.questClaimed);
  const restored=safeHero(persistentHero(p));w.remove(p.id);w.add(restored);step(w,20);assert.equal(restored.gold,50);
});
test('six slots equip only owned class-compatible items at camp; sale cannot destroy equipped gear',()=>{
  const {w,p}=setup();for(const slot of Object.keys(EQUIPMENT_SLOTS)){const item=makeLoot(p.classId,3,1,slot);p.items.push(item);w.command(p,{type:'equip',id:item.id});}
  assert.equal(Object.values(p.equipment).filter(Boolean).length,6);const before=structuredClone(p.equipment),count=p.items.length;
  for(const id of Object.values(p.equipment))w.command(p,{type:'sell',id});assert.deepEqual(p.equipment,before);assert.equal(p.items.length,count);
  const wrong=makeLoot('mage',2,1,'weapon');p.items.push(wrong);w.command(p,{type:'equip',id:wrong.id});assert.deepEqual(p.equipment,before);
});
test('class and starting weapon chosen at creation remain attached to the saved hero',()=>{
  for(const classId of ['warrior','archer','mage']){
    const {p}=setup(classId);p.gold=101;p.level=4;
    const restored=safeHero(persistentHero(p));
    assert.equal(restored.classId,classId);assert.equal(restored.gold,101);assert.equal(restored.level,4);
    assert.equal(restored.items.find(i=>i.id===restored.equipment.weapon).classId,classId);
    assert.deepEqual(restored.items,p.items);assert.deepEqual(restored.equipment,p.equipment);
  }
});
test('archer and mage launch real server projectiles that hit and respect obstacles',()=>{
  for(const classId of ['archer','mage']){
    const {w,p}=setup(classId),m=isolated(w,p);Object.assign(p,{x:5,z:1.8});assert(!safe(p));
    w.attack(p,Math.PI/2);step(w,10);assert(w.projectiles.length||m.hp<60);step(w,8);assert(m.hp<60);
    Object.assign(p,{x:27,z:-6,yaw:0,targetYaw:0,attack:null});Object.assign(m,{x:27,z:-3.5,homeX:27,homeZ:-3.5,hp:60,state:'idle',target:null});w.attack(p,0);step(w,25);assert.equal(m.hp,60);
  }
});
test('death and camp safety preserve equipment; manual camp return cannot escape combat',()=>{
  const {w,p}=setup(),equipment=structuredClone(p.equipment);w.damagePlayer(p,9999);assert.equal(p.hp,100);
  Object.assign(p,{x:8,z:2});w.damagePlayer(p,9999);assert.equal(p.hp,0);assert(p.dead>0);step(w,51);assert(safe(p));assert.deepEqual(p.equipment,equipment);
  Object.assign(p,{x:8,z:2,combatUntil:w.t+15000});w.command(p,{type:'camp'});assert.equal(p.x,8);
});
test('mob telegraph warns before hitting and leashing clears stale contributor rewards',()=>{
  const {w,p}=setup(),m=isolated(w,p);Object.assign(m,{state:'chase',target:p.id,yaw:-Math.PI/2});p.x=7;
  step(w);assert.equal(m.state,'windup');assert.equal(p.hp,100);step(w,16);assert(p.hp<100);
  w.hurtMob(p,m,1);w.camp(p,true);step(w);assert(['idle','return'].includes(m.state));assert.equal(m.contributors.size,0);
});

test('snapshot separates attack power from animation state; prediction stays finite',()=>{
  const {w,p}=setup();const self=w.snapshot(p.id).self;assert.equal(self.attack,null);assert(self.attackPower>0);
  for(let i=0;i<30;i++)moveHero(self,.05,{x:1,z:0,aim:1});assert([self.x,self.z,self.yaw,self.gait].every(Number.isFinite));
  isolated(w,p);w.attack(p,1);const attacking=w.snapshot(p.id).self;assert.equal(typeof attacking.attack,'object');assert(attacking.attackPower>0);
});
