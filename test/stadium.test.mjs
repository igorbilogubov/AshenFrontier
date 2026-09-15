import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,persistentHero,safeHero,stats} from '../dist/world.js';
import {STADIUM_BOUNDS,STADIUM_PENS,STADIUM_HUB,STADIUM_SPAWNS,STADIUM_PEN_WALLS,PORTALS} from '../dist/public/game/stadium.js';
import {BOUNDS,AFK_SPOTS,SPAWNS,MOB_TYPES,stand,safe,clearPath,translate,distance,withinSpot} from '../dist/public/game/location.js';
import {locationAt,boundsForPosition} from '../dist/public/game/world-layout.js';
const step=(world,n=1)=>{for(let i=0;i<n;i++)world.tick(.05);};

test('Stadium adds exactly three six-creature pens after all original forest spawn ids',()=>{
  assert.equal(STADIUM_PENS.length,3);assert.equal(STADIUM_SPAWNS.length,18);assert.equal(SPAWNS.length,59);
  assert.equal(AFK_SPOTS.filter(p=>locationAt(p)==='forest').length,4);
  assert.equal(AFK_SPOTS.filter(p=>locationAt(p)==='stadium').length,3);
  assert.deepEqual(STADIUM_PENS.flatMap(p=>p.spawnIds),Array.from({length:18},(_,i)=>41+i));
  assert.deepEqual(STADIUM_SPAWNS.map(p=>p.type).reduce((n,type)=>({...n,[type]:(n[type]||0)+1}),{}),{wolf:10,boar:6,alpha:2});
  for(const pen of STADIUM_PENS)for(const id of pen.spawnIds){
    const spawn=SPAWNS[id];assert.equal(spawn.spotId,pen.id);assert.equal(locationAt(spawn),'stadium');assert(stand(spawn.x,spawn.z,MOB_TYPES[spawn.type].radius));assert(withinSpot(spawn,pen,-MOB_TYPES[spawn.type].radius));assert(!safe(spawn));
  }
});

test('the original map and separate arena have legal union bounds with an impassable gap',()=>{
  assert.deepEqual(BOUNDS,{minX:-37,maxX:73,minZ:-45,maxZ:45});
  assert.equal(boundsForPosition(STADIUM_HUB),STADIUM_BOUNDS);
  for(let x=BOUNDS.maxX+.3;x<STADIUM_BOUNDS.minX-.3;x+=.25)assert(!stand(x,0),`void walkable at ${x}`);
  assert(!clearPath({x:72,z:0},{x:160,z:15}));
  for(const point of [{x:NaN,z:0},{x:Infinity,z:0},{x:160,z:24},{x:132,z:0},{x:188,z:0}])assert(!stand(point.x,point.z));
  const edge={x:72,z:0};translate(edge,100,0);assert(edge.x<73);assert.equal(locationAt(edge),'forest');
});

test('all three wide gates connect to the safe hub and every home without crossing pen walls',()=>{
  for(const pen of STADIUM_PENS){
    const points=[{x:160,z:14.8},{x:160,z:6},{x:pen.x,z:6},{x:pen.x,z:2},pen];
    const actor={...points[0]};
    for(const point of points.slice(1)){translate(actor,point.x-actor.x,point.z-actor.z,.52);assert(distance(actor,point)<1e-7,`${pen.id} blocked approach`);}
    for(const id of pen.spawnIds){const mover={x:pen.x,z:pen.z},spawn=SPAWNS[id];translate(mover,spawn.x-mover.x,spawn.z-mover.z,.52);assert(distance(mover,spawn)<1e-7);}
    const across={x:pen.x+5.7,z:pen.z};translate(across,4,0);assert(across.x<pen.x+7);assert(!clearPath({x:pen.x+6,z:pen.z},{x:pen.x+8,z:pen.z}));
  }
  for(const wall of STADIUM_PEN_WALLS)assert(!stand(wall.x,wall.z,0));
  for(const portal of PORTALS){assert(stand(portal.x,portal.z));assert(safe(portal));assert(stand(portal.destination.x,portal.destination.z));assert(safe(portal.destination));}
});

test('portal approaches and teleportation are server owned, preserve resources and cancel stale input',()=>{
  const world=new World(),p=newHero('Портал');world.add(p);p.gold=57;
  world.command(p,{type:'portal',portalId:'camp-stadium',x:999,z:999,gold:99999});
  assert.equal(p.interactionTarget?.kind,'portal');assert.equal(locationAt(p),'forest');
  for(let i=0;i<100&&locationAt(p)==='forest';i++)world.tick(.05);
  assert.equal(locationAt(p),'stadium');assert.equal(p.gold,57);assert.equal(p.interactionTarget,null);assert.equal(p.afk,null);assert.equal(p.shopActive,false);assert.deepEqual({x:p.x,z:p.z},PORTALS[0].destination);assert.equal(p.vx,0);assert.equal(p.vz,0);
  assert(world.events.some(e=>e.type==='portal'&&e.owner===p.id&&e.location==='stadium'));
  const saved=persistentHero(p),restored=safeHero(saved);assert.deepEqual({x:restored.x,z:restored.z},PORTALS[0].destination);assert.equal(restored.gold,57);assert(!('interactionTarget' in saved));
  const wrong={...p};assert.equal(world.startPortal(p,'camp-stadium'),false);assert.deepEqual({x:p.x,z:p.z},{x:wrong.x,z:wrong.z});
  assert(world.startPortal(p,'stadium-camp'));for(let i=0;i<100&&locationAt(p)==='stadium';i++)world.tick(.05);assert.equal(locationAt(p),'forest');assert.equal(p.gold,57);
});

test('dead and malformed portal requests never teleport; safe arrival clears fighting and pursuit',()=>{
  for(const state of ['dead','attack','combat','chased']){
    const world=new World(),p=newHero(state);world.add(p);Object.assign(p,{x:PORTALS[0].x,z:PORTALS[0].z});
    if(state==='dead')p.dead=2;if(state==='attack')p.attack={id:1,age:0,duration:1,yaw:0,hit:false,special:false};if(state==='combat')p.combatUntil=world.t+1;if(state==='chased')Object.assign(world.mobs[0],{state:'chase',target:p.id});
    assert.equal(world.startPortal(p,'camp-stadium'),state!=='dead');
    assert.equal(locationAt(p),state==='dead'?'forest':'stadium');
  }
  const world=new World(),p=newHero('Вход');world.add(p);
  for(const portalId of [null,[],{},'unknown','stadium-camp'])assert.equal(world.startPortal(p,portalId),false);
  assert(world.startPortal(p,'camp-stadium'));world.command(p,{type:'input',x:1,z:0,aim:null,seq:1});assert.equal(p.interactionTarget,null);
  assert(world.startPortal(p,'camp-stadium'));p.combatUntil=world.t+5000;step(world);assert.equal(p.combatUntil,world.t);
});

test('snapshots isolate players, mobs, ground loot and spatial effects by region',()=>{
  const world=new World(),forest=newHero('Лес'),arena=newHero('Арена');Object.assign(arena,STADIUM_HUB);world.add(forest);world.add(arena);
  world.addGroundDrop(arena.id,{id:'arena',kind:'gold',amount:5,x:160,z:15,expiresAt:world.t+1000});world.addGroundDrop(arena.id,{id:'forest',kind:'gold',amount:7,x:0,z:2,expiresAt:world.t+1000});
  world.emit('hit',{x:142,z:-6,amount:1,id:41});world.emit('hit',{x:10,z:0,amount:1,id:0});
  const a=world.snapshot(arena.id),f=world.snapshot(forest.id);
  assert.deepEqual(a.players.map(p=>p.id),[arena.id]);assert.deepEqual(f.players.map(p=>p.id),[forest.id]);assert.equal(a.mobs.length,18);assert.equal(f.mobs.length,41);assert.deepEqual(a.groundLoot.map(d=>d.id),['arena']);assert.equal(a.events.length,1);assert.equal(a.events[0].id,41);assert.equal(f.events.length,1);assert.equal(f.events[0].id,0);
});

test('online AFK works in every pen for all three classes while respecting hunting boundaries and manual loot',()=>{
  for(const pen of STADIUM_PENS)for(const classId of ['warrior','archer','mage']){
    const world=new World({random:()=>0}),p=newHero(`${classId}`,classId);world.add(p);Object.assign(p,{x:pen.x,z:pen.z,level:35});p.hp=stats(p).maxHp;p.mana=stats(p).maxMana;
    world.mobs=world.mobs.filter(m=>m.spotId===pen.id);assert(world.startAfk(p));
    for(let i=0;i<800&&p.afk;i++){world.tick(.05);assert(withinSpot(p,pen,-.46));assert(stand(p.x,p.z));}
    assert(p.kills>0,`${pen.id}/${classId} cannot kill`);assert.equal(p.gold,0);assert.equal(p.questKills,0);assert.equal(p.items.length,2);
    assert(world.groundLoot.some(drop=>drop.owner===p.id));world.command(p,{type:'input',x:1,z:0,aim:null,seq:2});assert.equal(p.afk,null);
  }
});

test('mobs and projectiles cannot cross the empty space between regions or deal damage through pen walls',()=>{
  const world=new World({random:()=>0}),p=newHero('Вдали','mage');Object.assign(p,STADIUM_HUB);world.add(p);
  const mob=world.mobs[0];Object.assign(mob,{x:72,z:0,homeX:72,homeZ:0,state:'chase',target:p.id});world.mobs=[mob];
  const hp=p.hp;step(world,200);assert.equal(locationAt(mob),'forest');assert(stand(mob.x,mob.z,MOB_TYPES[mob.type].radius));assert.equal(p.hp,hp);
  const shooter=newHero('Снаряд','mage');Object.assign(shooter,{x:72,z:0});world.add(shooter);
  world.projectiles.push({id:'gap-shot',owner:shooter.id,x:72,z:0,yaw:Math.PI/2,remaining:200,speed:20,kind:'mage',damage:999,aoe:0});step(world,20);assert.equal(world.projectiles.length,0);assert.equal(p.hp,hp);
  Object.assign(p,{x:STADIUM_PENS[0].x+8,z:-6});Object.assign(mob,{x:STADIUM_PENS[0].x+6,z:-6,state:'idle',type:'wolf',hp:60});assert.equal(world.hurtMob(p,mob,999),false);assert.equal(mob.hp,60);
});

test('manual and automatic Stadium kills preserve the forest quest and only the original manual alpha advances its boss flag',()=>{
  for(const automatic of [false,true]){
    const world=new World({random:()=>0}),p=newHero('Задание');world.add(p);p.questKills=4;
    for(const pen of STADIUM_PENS){Object.assign(p,{x:pen.x,z:pen.z});for(const id of pen.spawnIds)assert(world.hurtMob(p,world.mobs[id],999,automatic));}
    assert.equal(p.kills,18);assert.equal(p.questKills,4);assert.equal(p.boss,false);assert.equal(p.questClaimed,false);assert.equal(p.gold,0);
    Object.assign(p,{x:25,z:-1.2});assert(world.hurtMob(p,world.mobs[6],999,automatic));assert.equal(p.boss,!automatic);assert.equal(p.questKills,automatic?4:5);
  }
});

test('portal clears delayed areas and projectiles from its owner before the new region is published',()=>{
  const world=new World(),p=newHero('Отмена','mage');world.add(p);Object.assign(p,{x:PORTALS[0].x,z:PORTALS[0].z});
  world.pendingAreas.push({skillId:'mage-meteor',caster:p.id,attackId:1,yaw:0,x:142,z:-6,at:world.t+100,damage:999,automatic:false});
  world.projectiles.push({id:'stale',owner:p.id,x:142,z:-6,yaw:0,remaining:50,speed:1,kind:'mage',damage:999,aoe:0});
  assert(world.usePortal(p,'camp-stadium'));assert.equal(world.pendingAreas.length,0);assert.equal(world.projectiles.length,0);
  const hp=world.mobs[41].hp;step(world,10);assert.equal(world.mobs[41].hp,hp);
});
