import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,persistentHero,safeHero,stats} from '../dist/world.js';
import {rollEquipment} from '../dist/public/game/equipment-items.js';
import {CAMP_SPAWN} from '../dist/public/game/camp-layout.js';
import {DUNGEONS,DUNGEON_PASSAGES} from '../dist/public/game/dungeons.js';
import {stand,clearPath} from '../dist/public/game/location.js';
import {locationAt} from '../dist/public/game/world-layout.js';
const fixture=()=>{const w=new World({random:()=>0}),p=newHero();w.add(p);w.mobs=[];Object.assign(p,{x:8,z:2});return {w,p};};
const advance=(w,n)=>{for(let i=0;i<n;i++)w.tick(.05);};
const start=(w,p)=>w.command(p,{type:'camp'});

test('return channels for five seconds, exposes private countdown and never persists or heals',()=>{
 const {w,p}=fixture();p.hp=30;p.mana=7;p.potionCooldown=12;p.manaPotionCooldown=11;p.skillCooldowns={'warrior-cleave':10};
 start(w,p);assert.equal(p.x,8);assert.equal(w.snapshot(p.id).self.campReturnRemaining,5);
 assert(!('campReturn' in persistentHero(p)));assert(!('campReturnRemaining' in persistentHero(p)));
 const restored=safeHero({...persistentHero(p),campReturn:{until:w.t+5000,x:p.x,z:p.z}});assert.equal(restored.campReturn,undefined);
 assert(!('campReturnRemaining' in w.snapshot(p.id).players[0]));
 advance(w,99);assert.equal(p.x,8);assert(w.snapshot(p.id).self.campReturnRemaining>0);
 const hp=p.hp,mp=p.mana;advance(w,1);assert.deepEqual({x:p.x,z:p.z},CAMP_SPAWN);assert(p.hp<hp+1);assert(p.mana<mp+1);
 assert.equal(w.snapshot(p.id).self.campReturnRemaining,0);assert(p.potionCooldown>6);assert(p.manaPotionCooldown>5);assert(p.skillCooldowns['warrior-cleave']>4);
});
test('neutral inputs preserve return; repeated button, movement and incompatible commands cancel it',()=>{
 for(const command of [{type:'camp'},{type:'input',x:1,z:0,aim:null,seq:2},{type:'attack',yaw:0},{type:'skill',skillId:'warrior-cleave',yaw:0},{type:'afk',enabled:true},{type:'portal',portalId:'unknown'},{type:'pickup',id:'unknown'},{type:'interact',npcId:'unknown'},{type:'buildApply',revision:0,build:{}}]){
  const {w,p}=fixture();start(w,p);w.command(p,{type:'input',x:0,z:0,aim:null,seq:1});assert.equal(w.snapshot(p.id).self.campReturnRemaining,5);
  w.command(p,command);assert.equal(w.snapshot(p.id).self.campReturnRemaining,0,command.type);advance(w,101);assert.notDeepEqual({x:p.x,z:p.z},CAMP_SPAWN);
 }
});
test('return refuses attacks and aggro; damage, death and disconnect interrupt before completion',()=>{
 for(const kind of ['attack','channel','aggro']){const {w,p}=fixture();if(kind==='attack')p.attack={id:1};if(kind==='channel')p.channel={skillId:'mage-beam'};if(kind==='aggro'){const m=new World().mobs[0];Object.assign(m,{x:8,z:3,target:p.id,state:'chase'});w.mobs=[m];}start(w,p);assert.equal(w.snapshot(p.id).self.campReturnRemaining,0,kind);}
 for(const kind of ['damage','dead','disconnect','displaced']){const {w,p}=fixture();start(w,p);advance(w,99);if(kind==='damage')w.damagePlayer(p,1);if(kind==='dead')p.dead=2;if(kind==='disconnect')p.connected=false;if(kind==='displaced')p.x+=1;advance(w,1);assert.notDeepEqual({x:p.x,z:p.z},CAMP_SPAWN);assert.equal(w.snapshot(p.id).self.campReturnRemaining,0,kind);}
});
test('new enemy aggro on the finishing tick cancels return before teleport',()=>{
 const {w,p}=fixture();start(w,p);advance(w,99);const m=new World().mobs[0];Object.assign(m,{x:8,z:3,homeX:8,homeZ:3,state:'idle',target:null});w.mobs=[m];advance(w,1);assert.equal(p.x,8);assert.equal(w.snapshot(p.id).self.campReturnRemaining,0);assert.equal(m.target,p.id);
});
test('combat equipment and point allocation preserve active attacks, cooldowns and damaged resources',()=>{
 const {w,p}=fixture(),item=rollEquipment('wanderer-armor','combat-armor',()=>.9);p.items.push(item);w.attack(p,0);assert(p.attack);const attack=p.attack;
 p.hp=30;p.mana=5;p.potionCooldown=7;p.manaPotionCooldown=6;p.skillCooldowns={'warrior-cleave':4};
 w.command(p,{type:'allocateStats',revision:0,points:{vitality:1,energy:1}});assert.equal(p.statRevision,1);
 for(const type of ['equip','unequip','equip']){w.command(p,{type,id:item.id});assert.equal(p.equipment.armor,type==='unequip'?null:item.id);assert.equal(p.attack,attack);assert.equal(p.hp,30);assert.equal(p.mana,5);assert.equal(p.potionCooldown,7);assert.equal(p.manaPotionCooldown,6);assert.equal(p.skillCooldowns['warrior-cleave'],4);}
 w.command(p,{type:'resetStats',revision:1});assert.equal(p.statRevision,1);
 p.dead=1;w.command(p,{type:'unequip',id:item.id});w.command(p,{type:'allocateStats',revision:1,points:{strength:1}});assert.equal(p.equipment.armor,item.id);assert.equal(p.statRevision,1);
});
test('each dungeon has a reachable far-end exit to its own exterior, obeying combat guards',()=>{
 for(const d of DUNGEONS){const {w,p}=fixture(),portal=DUNGEON_PASSAGES.find(p=>p.id===`exit-${d.id}-end`);assert(portal,d.id);assert(portal.x>d.boss.x);assert(stand(portal.x,portal.z));assert(clearPath(d.boss,portal));p.level=100;Object.assign(p,{x:portal.x,z:portal.z});p.attack={id:1};assert(!w.usePortal(p,portal.id));p.attack=null;assert(w.usePortal(p,portal.id));assert.equal(locationAt(p),d.region);assert.deepEqual({x:p.x,z:p.z},portal.destination);}
});
