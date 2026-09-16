import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../dist/public/game/vendor/three.module.js';
import {regionalEquipment,rollEquipment,validateEquipment} from '../dist/public/game/equipment-items.js';
import {regionalAppearance} from '../dist/public/game/regional-equipment.js';
import {createRegionalEquipmentVisuals} from '../dist/public/game/regional-equipment-visuals.js';
import {itemArtKey} from '../dist/public/game/item-icons.js';
import {canEquip} from '../dist/public/rules.js';
import {World,newHero,safeHero,persistentHero} from '../dist/world.js';
import {locationAt} from '../dist/public/game/world-layout.js';
const classes=['warrior','archer','mage'];
test('regional collections have six slots, enforce level/class, preserve ranges and exact icon identity',async()=>{
 for(const region of ['snow','wasteland'])for(const classId of classes)for(const rarity of [1,2]){
  const definitions=regionalEquipment(classId,region,rarity),level=region==='snow'?10:25;
  assert.equal(definitions.length,6);assert.equal(new Set(definitions.map(d=>d.slot)).size,6);
  for(const definition of definitions){
   const item=rollEquipment(definition.id,definition.id,()=>.6);validateEquipment(item);validateEquipment(JSON.parse(JSON.stringify(item)));
   assert.equal(item.itemLevel,level);assert.equal(item.rarity,rarity);assert(!canEquip({classId,level:level-1},item));assert(canEquip({classId,level},item));assert(!canEquip({classId:classes.find(c=>c!==classId),level},item));
   assert.equal(regionalAppearance(definition.appearance).region,region);
   const png=await fs.readFile(new URL('../public/game/item-icons/'+itemArtKey(item)+'.png',import.meta.url));assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);
  }
 }
});
test('mob region selects loot tier even if hero can equip higher gear, and pickup/reload never rerolls',()=>{
 for(const region of ['forest','snow','wasteland'])for(const classId of classes){
  const world=new World({random:()=>0}),hero=newHero('Комплекты',classId);hero.level=30;world.add(hero);
  const mob=world.mobs.find(m=>locationAt(m)===region&&!m.eliteId);assert(mob);
  Object.assign(hero,{x:mob.x,z:mob.z});mob.contributors.set(hero.id,{at:world.t,damage:999});world.kill(mob);
  const drop=world.snapshot(hero.id).groundLoot.find(d=>d.kind==='item');assert(drop);assert.equal(drop.item.itemLevel,region==='forest'?1:region==='snow'?10:25);
  world.command(hero,{type:'pickup',id:drop.id});const item=hero.items.find(i=>i.id===drop.item.id);assert.deepEqual(item,drop.item);
  assert.deepEqual(safeHero(persistentHero(hero)).items.find(i=>i.id===item.id),item);
 }
});
test('regional appearance colours only its own slots and resets without changing another actor',()=>{
 const model=new T.Group(),base=new T.MeshStandardMaterial({color:'#eeeeee'}),own=base.clone();
 const armor=new T.Mesh(new T.BoxGeometry(1,1,1),own);armor.name='Armor_Body';model.add(armor);
 const apply=createRegionalEquipmentVisuals(model),original=own.color.clone(),other=base.color.clone();
 assert.equal(apply({armor:'frostguard-armor'},'warrior').armor,'watch-armor');assert(!own.color.equals(original));assert(base.color.equals(other));
 apply({armor:'obsidian-armor'},'warrior');assert(!own.color.equals(original));
 apply({armor:null},'warrior');assert(own.color.equals(original));assert(base.color.equals(other));
 armor.geometry.dispose();base.dispose();own.dispose();
});
