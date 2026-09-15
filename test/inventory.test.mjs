import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {World,newHero,makeLoot,persistentHero,safeHero} from '../dist/world.js';
import {BAG_CAPACITY,backpackItems} from '../dist/public/rules.js';
import {WARRIOR_ITEMS,rollEquipment} from '../dist/public/game/equipment-items.js';
import {itemArtKey} from '../dist/public/game/item-icons.js';
import {backpackUsage} from '../dist/public/game/consumables.js';
import {SHOP} from '../dist/public/game/shop.js';

const setup=()=>{const p=newHero(),w=new World();w.add(p);return {p,w};};
const fill=p=>{while(backpackUsage(p)<BAG_CAPACITY)p.items.push(makeLoot('warrior',1,0,'ring'));};

test('wearing owns one instance outside the backpack, and taking it off restores that instance',()=>{
  const {p,w}=setup();assert.equal(backpackItems(p).length,0);
  const item=rollEquipment('wanderer-hood','hood',()=>.7);p.items.push(item);const original=structuredClone(p.items);
  for(let i=0;i<3;i++){
    w.command(p,{type:'equip',id:item.id});assert.equal(backpackItems(p).length,0);
    assert.equal(p.equipment.helmet,item.id);assert.equal(p.items.length,3);
    w.command(p,{type:'unequip',id:item.id});assert.deepEqual(backpackItems(p),[item]);
  }
  w.command(p,{type:'equip',id:item.id});const restored=safeHero(JSON.parse(JSON.stringify(persistentHero(p))));
  assert.deepEqual(restored.items,original);assert.deepEqual(backpackItems(restored),[]);assert.equal(restored.equipment.helmet,item.id);
});

test('full backpack blocks unequip but allows an atomic equipment swap without losing either item',()=>{
  const {p,w}=setup(),old=p.items.find(i=>i.id===p.equipment.armor),next=rollEquipment('watch-armor','replacement',()=>.2);p.items.push(next);fill(p);
  w.command(p,{type:'unequip',id:old.id});assert.equal(p.equipment.armor,old.id);assert.equal(backpackItems(p).length,14);assert.equal(backpackUsage(p),16);
  assert(w.events.some(e=>e.type==='notice'&&e.text.includes('Рюкзак полон')));
  w.command(p,{type:'equip',id:next.id});assert.equal(p.equipment.armor,next.id);assert(backpackItems(p).includes(old));assert(!backpackItems(p).includes(next));assert.equal(backpackItems(p).length,14);assert.equal(backpackUsage(p),16);
  Object.assign(p,{x:SHOP.x,z:SHOP.z});w.command(p,{type:'interact',npcId:SHOP.id});
  w.command(p,{type:'sell',id:p.items.at(-1).id});w.command(p,{type:'unequip',id:next.id});
  assert.equal(p.equipment.armor,null);assert.equal(backpackItems(p).length,14);assert.equal(backpackUsage(p),16);assert(backpackItems(p).includes(next));
  assert.equal(new Set(p.items.map(i=>i.id)).size,p.items.length);
});

test('putting a loose item in an empty gear slot frees room for exactly one pending reward',()=>{
  const {p,w}=setup(),ring=makeLoot('warrior',1,0,'ring');p.items.push(ring);fill(p);
  p.pendingItems=[rollEquipment('watch-boots','reward-1',()=>.2),rollEquipment('ember-amulet','reward-2',()=>.8)];
  w.command(p,{type:'claim'});assert.equal(p.pendingItems.length,2);
  w.command(p,{type:'equip',id:ring.id});assert.equal(backpackItems(p).length,13);assert.equal(backpackUsage(p),15);
  w.command(p,{type:'claim'});assert.equal(backpackItems(p).length,14);assert.equal(backpackUsage(p),16);assert.equal(p.pendingItems.length,1);
  assert(p.items.some(i=>i.id==='reward-1'));assert.equal(p.pendingItems[0].id,'reward-2');
});

test('ground loot fills the last free backpack cell only after pickup; a full bag leaves later loot outside',()=>{
  const {p,w}=setup();w.random=()=>0;while(backpackUsage(p)<15)p.items.push(makeLoot('warrior',1,0,'ring'));
  const m=w.mobs[0];p.x=m.x;p.z=m.z;
  const kill=()=>{m.state='idle';m.contributors.set(p.id,{at:w.t,damage:999});w.kill(m);};
  kill();assert.equal(backpackItems(p).length,13);assert.equal(backpackUsage(p),15);assert.equal(p.pendingItems.length,0);
  const first=w.snapshot(p.id).groundLoot.find(drop=>drop.kind==='item');assert(first);
  w.command(p,{type:'pickup',id:first.id});assert.equal(backpackItems(p).length,14);assert.equal(backpackUsage(p),16);assert.equal(w.events.find(e=>e.type==='item').pending,false);
  w.events=[];kill();const second=w.snapshot(p.id).groundLoot.find(drop=>drop.kind==='item');assert(second);
  w.command(p,{type:'pickup',id:second.id});assert.equal(backpackItems(p).length,14);assert.equal(backpackUsage(p),16);assert.equal(p.pendingItems.length,0);assert(w.snapshot(p.id).groundLoot.some(drop=>drop.id===second.id));
});

test('every catalog item has a distinct shipped 256px RGBA thumbnail',async()=>{
  const keys=WARRIOR_ITEMS.map(def=>itemArtKey(rollEquipment(def.id,'icon',()=>.5)));assert.equal(new Set(keys).size,WARRIOR_ITEMS.length);
  for(const key of [...keys,'legacy-bow','legacy-staff','legacy-axe','mage-armor','archer-armor']){
    const image=await fs.readFile(new URL('../public/game/item-icons/'+key+'.png',import.meta.url));
    assert.equal(image.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(image.readUInt32BE(16),256);assert.equal(image.readUInt32BE(20),256);assert.equal(image[25],6);assert(image.length>1500);
  }
});
