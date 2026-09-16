import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,safeHero,persistentHero,makeLoot,stats} from '../dist/world.js';
import {AFK_SPOTS,MOB_TYPES,withinSpot,afkSpotAt,clearPath,stand,safe,distance} from '../dist/public/game/location.js';
import {CLASS_ITEMS,rollEquipment} from '../dist/public/game/equipment-items.js';
import {skillsForClass} from '../dist/public/game/skills.js';
import {PICKUP_RANGE} from '../dist/public/game/loot-rules.js';
import {STADIUM_PENS,STADIUM_HUB} from '../dist/public/game/stadium.js';
const setBottles=(p,kind,quantity)=>{const id=kind==='hp'?'hp-basic':'mana-basic';p.consumableInventory=p.consumableInventory.filter(stack=>stack.definitionId!==id);if(quantity)p.consumableInventory.push({id:crypto.randomUUID(),definitionId:id,quantity});p[kind==='hp'?'potions':'manaPotions']=quantity;};


const step=(w,n=1)=>{for(let i=0;i<n;i++)w.tick(.05,w.t+50);};
function fixture(classId='warrior',spot=AFK_SPOTS[0]){
  const w=new World({random:()=>0}),p=newHero('Автоохота',classId);w.add(p);
  Object.assign(p,{x:spot.x,z:spot.z,level:20});p.hp=stats(p).maxHp;p.mana=stats(p).maxMana;
  return {w,p,spot};
}
const toggle=(w,p,enabled)=>w.command(p,{type:'afk',enabled});

test('AFK starts at any valid position including town and spot edges; only connected living heroes enable it',()=>{
  const {w,p,spot}=fixture();w.mobs=[];
  for(const point of [{x:.5,z:4},{x:7.6,z:1.8},{x:spot.x+spot.radius-.2,z:spot.z},STADIUM_HUB]){
    Object.assign(p,point);assert(stand(p.x,p.z));toggle(w,p,true);
    assert.deepEqual(p.afk.anchor,{x:point.x,z:point.z});assert.equal(p.afk.targetId,null);
    step(w,40);assert.deepEqual({x:p.x,z:p.z},p.afk.anchor);assert(p.afk);
    toggle(w,p,false);toggle(w,p,false);assert.equal(p.afk,null);
  }
  for(const point of [{x:NaN,z:0},{x:100,z:100},{x:.5,z:2}]){
    Object.assign(p,point);toggle(w,p,true);assert.equal(p.afk,null);
  }
  Object.assign(p,{x:spot.x,z:spot.z,dead:2});toggle(w,p,true);assert.equal(p.afk,null);
  p.dead=0;p.connected=false;toggle(w,p,true);assert.equal(p.afk,null);
  p.connected=true;toggle(w,p,true);assert.deepEqual(p.afk,{anchor:{x:p.x,z:p.z},spotId:spot.id,targetId:null,skillCursor:0});
  Object.assign(p,{x:100,z:100});toggle(w,p,false);assert.equal(p.afk,null);
});

test('neutral 20 Hz input cannot cancel server control; manual move, attack, skill and camp can',()=>{
  const {w,p}=fixture();toggle(w,p,true);
  for(let seq=1;seq<=20;seq++){w.command(p,{type:'input',x:0,z:0,aim:null,seq});step(w);assert(p.afk);}
  assert.equal(p.ack,20);assert(p.afk.targetId!==null);
  w.command(p,{type:'input',x:1,z:0,aim:0,seq:21});assert.equal(p.afk,null);assert.equal(p.input.x,1);
  toggle(w,p,true);w.command(p,{type:'attack',yaw:Math.PI/2});assert.equal(p.afk,null);
  p.attack=null;toggle(w,p,true);w.command(p,{type:'skill',skillId:'warrior-cleave',yaw:Math.PI/2});assert.equal(p.afk,null);
  p.attack=null;toggle(w,p,true);w.command(p,{type:'camp'});assert.equal(p.afk,null);
});

test('stationary AFK waits for distant mobs and attacks nearby roaming or returning mobs without spot ownership',()=>{
  const {w,p,spot}=fixture();
  const member=w.mobs.find(m=>m.id===spot.spawnIds[0]);
  w.mobs=[member];Object.assign(member,{x:spot.x+spot.radius-.5,z:spot.z,homeX:spot.x+spot.radius-.5,homeZ:spot.z,state:'recover',timer:100,target:p.id,hp:10000});
  assert(stand(member.x,member.z));assert(clearPath(p,member));
  const start={x:p.x,z:p.z};toggle(w,p,true);
  for(let i=0;i<220;i++){step(w);assert.deepEqual({x:p.x,z:p.z},start);assert.equal(p.afk.targetId,null);assert.equal(p.attack,null);}
  const roaming={...member,id:0,spotId:undefined,x:p.x+1,z:p.z,homeX:p.x+1,homeZ:p.z,hp:10000};
  w.mobs=[roaming];step(w,30);assert.equal(p.afk.targetId,roaming.id);assert(roaming.hp<10000);
  p.attack=null;roaming.state='return';assert.deepEqual(w.afkTargets(p),[roaming]);assert(w.autoAttack(p));
  assert.deepEqual({x:p.x,z:p.z},start);
});

test('real potion threshold and finite supply govern automatic survival; death and disconnect end it',()=>{
  const {w,p}=fixture();w.mobs=[];toggle(w,p,true);
  p.hp=stats(p).maxHp*.34;setBottles(p,'hp',2);p.potionCooldown=0;p.combatUntil=w.t+15000;
  const hp=p.hp;step(w);assert.equal(p.potions,1);assert.equal(p.hp,hp+45);assert(p.potionCooldown>0);
  p.hp=stats(p).maxHp*.2;setBottles(p,'hp',0);p.potionCooldown=0;const dry=p.hp;step(w);assert.equal(p.hp,dry);assert.equal(p.potions,0);
  w.damagePlayer(p,10000);assert.equal(p.afk,null);assert(p.dead>0);
  const next=fixture();toggle(next.w,next.p,true);next.p.connected=false;step(next.w);assert.equal(next.p.afk,null);
});

test('AFK rewards use real kill ledger without advancing the active quest; saved V3 never resumes',()=>{
  const {w,p,spot}=fixture();w.mobs=w.mobs.filter(m=>spot.spawnIds.includes(m.id));
  toggle(w,p,true);p.kills=2;p.questKills=4;
  const m=w.mobs[0];m.hp=60;assert(clearPath(p,m));
  assert(w.hurtMob(p,m,100,true));
  assert.equal(p.kills,3);assert.equal(p.questKills,4);assert.equal(p.xp,12);assert.equal(p.gold,0);
  assert.equal(p.items.length,2);assert.equal(w.snapshot(p.id).groundLoot.length,2);assert.equal(m.state,'dead');
  const saved=persistentHero(p);assert(!('afk' in saved));
  const restored=safeHero(saved);assert.equal(restored.afk,null);assert.equal(restored.kills,3);
  assert.equal(restored.questKills,4);assert.deepEqual(restored.items,p.items);
});

test('cancelling AFK during flight prevents delayed damage and story credit',()=>{
  const {w,p,spot}=fixture('mage');
  w.mobs=w.mobs.filter(m=>m.id===spot.spawnIds[0]);const m=w.mobs[0];m.hp=60;
  toggle(w,p,true);
  for(let i=0;i<25&&!w.projectiles.length;i++)step(w);
  assert(w.projectiles.length>0);assert(w.projectiles[0].automatic);
  toggle(w,p,false);assert.equal(p.afk,null);assert.equal(w.projectiles[0].remaining,0);
  step(w,20);assert.equal(m.hp,60);assert.equal(p.questKills,0);assert.equal(w.projectiles.length,0);
  w.hurtMob(p,m,60,true);assert.equal(p.kills,1);assert.equal(p.questKills,0);
});

test('reconnect and V3 recovery discard a saved in-flight automatic attack',()=>{
  const {w,p,spot}=fixture('mage');w.mobs=w.mobs.filter(m=>m.id===spot.spawnIds[0]);toggle(w,p,true);step(w);
  assert(p.attack?.automatic);
  const saved=persistentHero(p),recovered=safeHero(saved);
  assert(saved.attack.automatic);assert.equal(recovered.attack,null);assert.equal(recovered.afk,null);
  for(let i=0;i<25&&!w.projectiles.length;i++)step(w);
  assert(w.projectiles.length>0);
  p.connected=false;w.add(p);
  assert.equal(p.afk,null);assert.equal(w.projectiles[0].remaining,0);
});

test('full backpack and pending queue leave items on ground while AFK keeps hunting and collecting gold',()=>{
  const {w,p}=fixture();w.mobs=[];
  while(p.items.length<18)p.items.push(makeLoot(p.classId,1,0,'ring'));
  p.pendingItems=Array.from({length:16},()=>makeLoot(p.classId,1,0,'amulet'));
  toggle(w,p,true);assert(p.afk);
  w.addGroundDrop(p.id,{id:'full-gold',kind:'gold',x:p.x,z:p.z,amount:8,expiresAt:w.t+10000});
  w.addGroundDrop(p.id,{id:'full-item',kind:'item',x:p.x,z:p.z,item:makeLoot(p.classId,1,0,'ring'),expiresAt:w.t+10000});
  step(w,20);assert(p.afk);assert.equal(p.gold,8);assert.equal(p.pendingItems.length,16);
  assert.equal(w.snapshot(p.id).groundLoot.length,1);assert.equal(w.snapshot(p.id).groundLoot[0].kind,'item');
});

test('multi-target AFK kills collect gold and leave full-backpack items on the ground',()=>{
  const {w,p,spot}=fixture();
  w.mobs=w.mobs.filter(m=>spot.spawnIds.slice(0,3).includes(m.id));
  for(const [i,m] of w.mobs.entries())Object.assign(m,{x:spot.x+.9+i*.35,z:spot.z,hp:10,state:'recover',timer:100,target:p.id});
  while(p.items.length<18)p.items.push(makeLoot(p.classId,1,0,'ring'));
  p.pendingItems=Array.from({length:15},()=>makeLoot(p.classId,1,0,'amulet'));p.kills=2;
  toggle(w,p,true);for(let i=0;i<30;i++)step(w);
  assert.equal(p.pendingItems.length,15);assert.equal(p.items.length,18);
  assert(w.mobs.some(m=>m.state==='dead'));
  assert(p.gold>0);assert(w.snapshot(p.id).groundLoot.some(drop=>drop.kind==='item'));
});

test('all six members of each spot respawn at their homes after sixteen seconds; named forest alpha returns after three minutes',()=>{
  const {w,p}=fixture();
  const original={gold:p.gold,xp:p.xp,kills:p.kills};
  for(const spot of AFK_SPOTS)for(const id of spot.spawnIds){const m=w.mobs.find(m=>m.id===id);w.kill(m);assert.equal(m.timer,16);assert.equal(m.state,'dead');}
  const boss=w.mobs[6];w.kill(boss);assert.equal(boss.timer,180);
  w.remove(p.id);for(let i=0;i<161;i++)w.tick(.1,w.t+100);
  for(const spot of AFK_SPOTS)for(const id of spot.spawnIds){const m=w.mobs.find(m=>m.id===id);assert.equal(m.state,'idle');assert.equal(m.hp,MOB_TYPES[m.type].hp);assert.equal(m.x,m.homeX);assert.equal(m.z,m.homeZ);}
  assert.equal(boss.state,'dead');assert.deepEqual({gold:p.gold,xp:p.xp,kills:p.kills},original);
});

test('online AFK uses an authored skill, then falls back to free basic attacks at low mana',()=>{
  const {w,p,spot}=fixture('mage',AFK_SPOTS[0]);
  w.mobs=w.mobs.filter(m=>m.id===spot.spawnIds[0]);
  Object.assign(w.mobs[0],{hp:10000,state:'recover',timer:100,target:p.id});toggle(w,p,true);
  let sawSkill=false,sawBasic=false;
  for(let i=0;i<100;i++){
    step(w);if(p.attack?.skillId&&!sawSkill){sawSkill=true;p.mana=0;}
    if(p.attack&&!p.attack.skillId){sawBasic=true;break;}
  }
  assert(sawSkill);assert(sawBasic);assert(w.mobs[0].hp<10000);
  assert(withinSpot(p,spot,-.46));
});

test('AFK stays anchored through three empty waves and respawns',()=>{
  const {w,p,spot}=fixture();w.mobs=w.mobs.filter(m=>spot.spawnIds.includes(m.id));
  toggle(w,p,true);const anchor={x:p.x,z:p.z};
  for(let wave=0;wave<3;wave++){
    for(const m of w.mobs)w.kill(m);
    for(let i=0;i<322;i++){step(w);assert(p.afk);assert.deepEqual({x:p.x,z:p.z},anchor);}
    assert(w.mobs.some(m=>m.state!=='dead'),`wave ${wave+1} should respawn`);
  }
});

test('AFK collects owned gold and rolled item, ignores foreign/outside loot and keeps rolls exact',()=>{
  const {w,p,spot}=fixture();w.mobs=[];toggle(w,p,true);
  const item=rollEquipment(CLASS_ITEMS[p.classId][0].id,'owned-rolled',()=>.37);
  const near={x:spot.x+.8,z:spot.z};
  w.addGroundDrop(p.id,{id:'owned-gold',kind:'gold',...near,amount:11,expiresAt:w.t+10000});
  w.addGroundDrop(p.id,{id:'owned-item',kind:'item',...near,item,expiresAt:w.t+10000});
  w.addGroundDrop('someone-else',{id:'foreign',kind:'gold',...near,amount:99,expiresAt:w.t+10000});
  w.addGroundDrop(p.id,{id:'outside',kind:'gold',x:spot.x+spot.radius+1,z:spot.z,amount:99,expiresAt:w.t+10000});
  for(let i=0;i<60&&(p.gold<11||!p.items.some(found=>found.id===item.id));i++)step(w);
  assert.equal(p.gold,11);assert.deepEqual(p.items.find(found=>found.id===item.id),item);assert(p.afk);
  assert.deepEqual(w.snapshot(p.id).groundLoot.map(drop=>drop.id),['outside']);
  assert(w.groundLoot.some(drop=>drop.id==='foreign'));
  assert(withinSpot(p,spot,-.46));
  assert.deepEqual(safeHero(persistentHero(p)).items.find(found=>found.id===item.id),item);
});

test('AFK collects only drops within normal pickup reach and never approaches distant loot',()=>{
  const {w,p,spot}=fixture();w.mobs=[];toggle(w,p,true);const anchor={x:p.x,z:p.z};
  w.addGroundDrop(p.id,{id:'near-gold',kind:'gold',x:p.x+PICKUP_RANGE-.01,z:p.z,amount:7,expiresAt:w.t+10000});
  w.addGroundDrop(p.id,{id:'far-gold',kind:'gold',x:p.x+PICKUP_RANGE+.01,z:p.z,amount:13,expiresAt:w.t+10000});
  for(let i=0;i<100;i++){step(w);assert(p.afk);assert.deepEqual({x:p.x,z:p.z},anchor);}
  assert.equal(p.gold,7);assert.deepEqual(w.snapshot(p.id).groundLoot.map(drop=>drop.id),['far-gold']);
});

test('AFK leaves town safe and quiet, refuses targets behind walls and never mixes locations',()=>{
  const {w,p}=fixture('mage');Object.assign(p,{x:.5,z:4});
  const target=w.mobs[0];w.mobs=[target];Object.assign(target,{x:7,z:4,hp:10000,state:'recover',timer:100,target:p.id});
  assert(safe(p));toggle(w,p,true);step(w,60);assert(p.afk);assert.equal(target.hp,10000);assert.equal(p.attackSerial,0);
  assert(!w.events.some(event=>event.type==='safe'||event.type==='notice'));
  toggle(w,p,false);const pen=STADIUM_PENS[0];Object.assign(p,{x:pen.x+8,z:-6});
  Object.assign(target,{x:pen.x+6,z:-6,state:'recover',timer:100,target:p.id});assert(stand(p.x,p.z));assert(!clearPath(p,target));
  toggle(w,p,true);assert.equal(w.afkTargets(p).length,0);assert.equal(w.autoAttack(p),false);
  Object.assign(target,{x:7.6,z:1.8});assert.equal(w.afkTargets(p).length,0);
  toggle(w,p,false);Object.assign(p,{x:7.6,z:1.8});Object.assign(target,{x:.5,z:4});toggle(w,p,true);
  assert(safe(target));assert.equal(w.afkTargets(p).length,0);
});

test('every class and enabled skill rotates and deals real damage without leaving the activation anchor',()=>{
  for(const classId of ['warrior','archer','mage'])for(const skill of skillsForClass(classId)){
    const {w,p}=fixture(classId);Object.assign(p,{x:7.6,z:1.8,yaw:0,targetYaw:0,vx:3,vz:2,moveBlend:1,runBlend:1});
    assert.equal(afkSpotAt(p),null);const target=w.mobs[0];w.mobs=[target];
    Object.assign(target,{x:p.x+1.3,z:p.z,homeX:p.x+1.3,homeZ:p.z,hp:10000,state:'recover',timer:100,target:p.id});
    p.afkPreferences={...p.afkPreferences,skillOrder:[skill.id],basicAttackFallback:false};
    toggle(w,p,true);const anchor={x:p.x,z:p.z};
    for(let tick=0;tick<75;tick++){
      step(w);assert(p.afk,skill.id);assert.deepEqual({x:p.x,z:p.z},anchor,skill.id);
      assert.equal(p.vx,0);assert.equal(p.vz,0);assert.equal(p.moveBlend,0);assert.equal(p.runBlend,0);
    }
    assert(p.attackSerial>0,skill.id);assert(target.hp<10000,`${skill.id} failed to hit from the anchor`);
    assert(distance(p,target)<skill.range+MOB_TYPES[target.type].radius);
  }
});

test('AFK activation cancels an approach and repeated enable does not reset its anchor or skill order',()=>{
  const {w,p}=fixture();w.mobs=[];
  w.addGroundDrop(p.id,{id:'approach',kind:'gold',x:p.x+3,z:p.z,amount:10,expiresAt:w.t+10000});
  assert(w.startPickup(p,'approach'));assert(p.interactionTarget);
  toggle(w,p,true);assert.equal(p.interactionTarget,null);const active=p.afk;active.skillCursor=1;
  toggle(w,p,true);assert.equal(p.afk,active);assert.equal(p.afk.skillCursor,1);step(w,20);assert.equal(p.gold,0);
  assert.deepEqual({x:p.x,z:p.z},active.anchor);
});

test('stopping AFK removes its delayed areas before a new activation can revive old damage',()=>{
  const {w,p}=fixture('mage'),target=w.mobs[0];w.mobs=[target];
  Object.assign(target,{x:p.x+1,z:p.z,hp:10000,state:'recover',timer:100,target:p.id});
  p.afkPreferences={...p.afkPreferences,skillOrder:['mage-meteor'],basicAttackFallback:false};toggle(w,p,true);
  for(let tick=0;tick<40&&!w.pendingAreas.length;tick++)step(w);
  assert.equal(w.pendingAreas.length,1);toggle(w,p,false);assert.equal(w.pendingAreas.length,0);
  p.afkPreferences.skillOrder=[];toggle(w,p,true);step(w,30);assert.equal(target.hp,10000);
});
