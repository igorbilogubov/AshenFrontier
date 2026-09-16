import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,persistentHero,safeHero,stats} from '../dist/world.js';
import {TRAVEL_PORTALS,travelCost} from '../dist/public/game/travel.js';
import {DUNGEONS} from '../dist/public/game/dungeons.js';
import {safe,stand,distance} from '../dist/public/game/location.js';
import {findWalkPath,walkSegment} from '../dist/public/game/navigation.js';
import {locationAt} from '../dist/public/game/world-layout.js';
import {defaultSkillBuild} from '../dist/public/game/skill-builds.js';
const fixture=()=>{const w=new World({random:()=>0}),p=newHero();w.add(p);w.mobs=[];return {w,p};};
const advance=(w,n)=>{for(let i=0;i<n;i++)w.tick(.05);};
const position=p=>({x:p.x,z:p.z});
const gate=id=>TRAVEL_PORTALS.find(p=>p.location===id);
const open=(w,p,g)=>{Object.assign(p,{x:g.x,z:g.z});w.command(p,{type:'travelOpen',portalId:g.id});assert.equal(p.travelPortalId,g.id);};

test('every location has a walkable protected entry portal, all dungeon destinations precede guards',()=>{
 assert.equal(TRAVEL_PORTALS.length,15);assert.equal(new Set(TRAVEL_PORTALS.map(p=>p.location)).size,15);
 for(const p of TRAVEL_PORTALS){assert(stand(p.x,p.z),p.id);assert(safe(p),p.id);assert.equal(locationAt(p),p.location);assert(Number.isSafeInteger(p.fee)&&p.fee>0);assert.equal(p.safeRadius,4);}
 for(const d of DUNGEONS){const p=gate(d.id);assert(p.x<d.bounds.minX+17);assert(p.x<d.boss.x);assert.equal(p.minLevel,d.minLevel);}
});
test('travel validates open source proximity, destination level and gold; charges once and never heals',()=>{
 const {w,p}=fixture(),source=gate('forest'),dest=gate('snow');p.gold=500;p.hp=20;p.mana=4;p.potionCooldown=7;
 open(w,p,source);w.command(p,{type:'travel',portalId:source.id,destinationId:dest.id});assert.equal(p.gold,500);assert.equal(locationAt(p),'forest');
 p.level=10;p.gold=dest.fee-1;w.command(p,{type:'travel',portalId:source.id,destinationId:dest.id});assert.equal(locationAt(p),'forest');
 p.gold=500;w.command(p,{type:'travel',portalId:source.id,destinationId:dest.id,fee:0,x:1000});assert.equal(p.gold,500-travelCost(source,dest));assert.deepEqual(position(p),position(dest));assert.equal(p.hp,20);assert.equal(p.mana,4);assert.equal(p.potionCooldown,7);assert.equal(p.travelPortalId,undefined);
 w.command(p,{type:'travel',portalId:source.id,destinationId:dest.id});assert.equal(p.gold,500-dest.fee);
 const saved=persistentHero(p);assert.equal(safeHero(saved).gold,p.gold);assert.equal(locationAt(saved),'snow');assert(!('travelPortalId' in saved));
});
test('forged remote travel, dead/offline source and moved-away chooser cannot spend gold',()=>{
 for(const mode of ['remote','dead','offline','moved','closed']){const {w,p}=fixture(),source=gate('forest'),dest=gate('stadium');p.gold=500;open(w,p,source);
  if(mode==='remote')p.travelPortalId=dest.id;if(mode==='dead')p.dead=1;if(mode==='offline')p.connected=false;if(mode==='moved')p.x=25;if(mode==='closed')w.command(p,{type:'cancelInteraction'});
  const old=position(p);w.command(p,{type:'travel',portalId:source.id,destinationId:dest.id});assert.deepEqual(position(p),old,mode);assert.equal(p.gold,500,mode);
 }
});
test('portal click approaches and only opens chooser on arrival; walking away invalidates it',()=>{
 const {w,p}=fixture(),source=gate('stadium');Object.assign(p,{x:168,z:15});w.command(p,{type:'travelOpen',portalId:source.id});assert.equal(p.travelPortalId,undefined);assert.equal(p.interactionTarget?.kind,'travel');advance(w,50);assert.equal(p.travelPortalId,source.id);assert(w.snapshot(p.id).events.some(e=>e.type==='travelOpened'));
 w.command(p,{type:'moveTo',target:{x:172,z:15}});assert.equal(p.travelPortalId,undefined);
});
test('click movement persists through idle packets, goes round a fence and stops at target or cancellation',()=>{
 const {w,p}=fixture();Object.assign(p,{x:139,z:12});const target={x:139,z:0},path=findWalkPath(p,target);assert(path?.length>1);let from=p;for(const point of path){assert(walkSegment(from,point));from=point;}
 w.command(p,{type:'moveTo',target});for(let i=0;i<240;i++){w.command(p,{type:'input',x:0,z:0,aim:null,seq:i+1});w.tick(.05);}assert(distance(p,target)<.2);assert.equal(p.navigation,undefined);
 w.command(p,{type:'moveTo',target:{x:142,z:12}});assert(p.navigation);w.command(p,{type:'cancelInteraction'});const stopped=position(p);advance(w,10);assert.deepEqual(position(p),stopped);
 w.command(p,{type:'moveTo',target:{x:3000,z:0}});assert.equal(p.navigation,undefined);
});
test('target click approaches and repeats attacks; stationary click and death cancel chasing',()=>{
 const {w,p}=fixture();Object.assign(p,{x:8,z:2});const m=new World().mobs[0];Object.assign(m,{x:15,z:2,homeX:15,homeZ:2,hp:10000,state:'idle',target:null});w.mobs=[m];
 w.command(p,{type:'attack',yaw:Math.PI/2,targetId:m.id,approach:true});assert.equal(p.attackTargetId,m.id);advance(w,100);assert(p.attackSerial>=2);assert(p.x>8);assert(m.hp<10000);
 w.command(p,{type:'attack',yaw:Math.PI/2,targetId:m.id,approach:false});assert.equal(p.attackTargetId,undefined);assert.equal(p.navigation,undefined);
 w.command(p,{type:'attack',yaw:0,targetId:m.id,approach:true});m.state='dead';advance(w,1);assert.equal(p.attackTargetId,undefined);
});
test('Space chooses only one nearest personal drop and approaches within six metres',()=>{
 const {w,p}=fixture();Object.assign(p,{x:8,z:2});for(const [id,x,owner] of [['own1',9,p.id],['own2',10,p.id],['foreign',8.2,'other'],['far',18,p.id]])w.addGroundDrop(owner,{id,kind:'gold',amount:3,x,z:2,expiresAt:w.t+10000});
 const gold=p.gold;w.command(p,{type:'pickupNearest'});assert.equal(p.gold,gold+3);assert(!w.groundLoot.some(d=>d.id==='own1'));assert(w.groundLoot.some(d=>d.id==='own2'));w.command(p,{type:'pickupNearest'});advance(w,20);assert.equal(p.gold,gold+6);assert(w.groundLoot.some(d=>d.id==='foreign'));assert(w.groundLoot.some(d=>d.id==='far'));
});
test('combat build changes preserve resources and cooldowns and cannot cancel the attack recovery',()=>{
 const {w,p}=fixture();Object.assign(p,{x:8,z:2,level:20});p.skillBuild=defaultSkillBuild(p.classId);p.hp=20;p.mana=4;p.skillCooldowns={'warrior-cleave':7};w.attack(p,0);const recovery=p.attack.duration*1000;const build=structuredClone(p.skillBuild);
 w.command(p,{type:'buildApply',revision:0,build});assert.equal(p.buildRevision,1);assert.equal(p.attack,null);assert.equal(p.hp,20);assert.equal(p.mana,4);assert.equal(p.skillCooldowns['warrior-cleave'],7);assert(!w.attack(p,0));
 w.command(p,{type:'buildSavePreset',index:0});assert.deepEqual(p.skillPresets[0],build);w.command(p,{type:'buildLoadPreset',index:0,revision:1});assert.equal(p.buildRevision,2);assert(!w.attack(p,0));advance(w,Math.ceil(recovery/50));assert(w.attack(p,0));
});

test('drinking a potion does not cancel destination movement or target approach',()=>{
 const {w,p}=fixture();Object.assign(p,{x:8,z:2,hp:10});w.command(p,{type:'moveTo',target:{x:14,z:2}});assert(p.navigation);
 w.command(p,{type:'useConsumable',slot:'q'});assert(p.navigation);assert(p.hp>10);
 const m=new World().mobs[0];Object.assign(m,{x:15,z:2,state:'idle',target:null});w.mobs=[m];w.command(p,{type:'attack',targetId:m.id,yaw:0,approach:true});assert.equal(p.attackTargetId,m.id);
 w.command(p,{type:'potion',kind:'mana'});assert.equal(p.attackTargetId,m.id);
});
