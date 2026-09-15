import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,makeLoot,persistentHero,safeHero} from '../dist/world.js';
import {SHOP,shopItems,shopPrice,sellPrice} from '../dist/public/game/shop.js';
import {stand,safe,clearPath,distance} from '../dist/public/game/location.js';
import {BAG_CAPACITY,backpackItems} from '../dist/public/rules.js';
import {validateEquipment} from '../dist/public/game/equipment-items.js';

const tick=(w,n=1)=>{for(let i=0;i<n;i++)w.tick(.05,w.t+50);};
const fixture=()=>{const w=new World(),p=newHero('Покупатель');w.add(p);w.mobs=[];return {w,p};};
const open=(w,p)=>{w.command(p,{type:'interact',npcId:SHOP.id});for(let i=0;i<80&&!p.shopActive;i++)tick(w);assert(p.shopActive);};

test('one basic six-slot collection per class is priced and reachable in the safe camp',()=>{
  assert(stand(SHOP.x,SHOP.z));assert(safe(SHOP));assert(clearPath({x:.5,z:2},SHOP));
  const catalog=shopItems();assert.equal(catalog.length,18);assert.equal(new Set(catalog.map(i=>i.definitionId)).size,18);
  for(const classId of ['warrior','archer','mage'])assert.deepEqual(catalog.filter(i=>i.classId===classId).map(i=>i.slot),['weapon','armor','helmet','boots','ring','amulet']);
  assert(catalog.every(i=>i.price===shopPrice(i.definitionId)&&i.price>0));assert.equal(shopPrice('watch-blade'),undefined);
});

test('shop opens only on server arrival; purchase deducts once and min rolls survive persistence',()=>{
  const {w,p}=fixture();p.gold=100;const listing=shopItems()[0];
  w.command(p,{type:'buy',definitionId:listing.definitionId});assert.equal(p.items.length,2);
  w.command(p,{type:'interact',npcId:SHOP.id});assert(p.interactionTarget);assert.equal(p.shopActive,false);
  tick(w,2);assert(distance(p,SHOP)<distance({x:.5,z:2},SHOP));open(w,p);
  assert(w.events.some(e=>e.type==='shopOpen'&&e.owner===p.id));
  w.command(p,{type:'buy',definitionId:listing.definitionId,requestId:'one'});const item=p.items.at(-1);
  assert.equal(p.gold,100-listing.price);assert.equal(p.items.length,3);validateEquipment(item);
  assert(item.rolls.every(roll=>roll.value===roll.min));
  w.command(p,{type:'buy',definitionId:listing.definitionId,requestId:'one'});assert.equal(p.items.length,3);assert.equal(p.gold,100-listing.price);
  assert.deepEqual(safeHero(persistentHero(p)).items.at(-1),item);
});

test('only an active nearby vendor buys/sells; bound/equipped items and insufficient funds are protected',()=>{
  const {w,p}=fixture(),loose=makeLoot('warrior',1,0,'ring');p.items.push(loose);
  w.command(p,{type:'sell',id:loose.id});assert(p.items.includes(loose));
  open(w,p);w.command(p,{type:'sell',id:p.equipment.weapon});assert(p.items.some(i=>i.id===p.equipment.weapon));
  w.command(p,{type:'sell',id:loose.id});assert(!p.items.includes(loose));assert.equal(p.gold,sellPrice(loose));
  w.command(p,{type:'sell',id:loose.id});assert.equal(p.gold,sellPrice(loose));
  const listing=shopItems()[0];w.command(p,{type:'buy',definitionId:listing.definitionId});assert.equal(p.items.length,2);
  p.gold=listing.price;w.command(p,{type:'buy',definitionId:listing.definitionId});assert.equal(p.gold,0);assert.equal(p.items.length,3);
  w.command(p,{type:'buy',definitionId:listing.definitionId});assert.equal(p.items.length,3);
  Object.assign(p,{x:8,z:1.8});tick(w);assert.equal(p.shopActive,false);
  w.command(p,{type:'sell',id:p.items.at(-1).id});assert.equal(p.items.length,3);
});

test('full bag and canceled approach cannot spend gold; camp/death/disconnect clear shop session',()=>{
  const {w,p}=fixture();p.gold=100;open(w,p);
  while(backpackItems(p).length<BAG_CAPACITY)p.items.push(makeLoot('warrior',1,0,'ring'));
  w.command(p,{type:'buy',definitionId:shopItems()[0].definitionId});assert.equal(p.gold,100);assert.equal(backpackItems(p).length,BAG_CAPACITY);
  w.command(p,{type:'cancelInteraction'});assert(p.shopActive);
  w.command(p,{type:'camp'});assert.equal(p.shopActive,false);
  open(w,p);w.remove(p.id);assert.equal(p.shopActive,false);
  w.add(p);open(w,p);Object.assign(p,{x:8,z:1.8});w.damagePlayer(p,100000);assert.equal(p.shopActive,false);
});
