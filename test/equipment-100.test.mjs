import test from 'node:test';
import assert from 'node:assert/strict';
import {EQUIPMENT_ITEMS,regionalEquipment,rollEquipment,validateEquipment} from '../dist/public/game/equipment-items.js';
import {GEAR_REGIONS,REGIONAL_ITEMS} from '../dist/public/game/regional-equipment.js';
import {EQUIPMENT_SETS,itemSet,equippedSetCounts,activeSetBonuses} from '../dist/public/game/equipment-sets.js';
import {gearRarity} from '../dist/public/game/loot-rules.js';
import {characterStats} from '../dist/public/rules.js';
const classes=['warrior','archer','mage'];
const levels=[1,10,25,40,55,70,85];
function dressed(classId,region,rarity,count=6){const items=[...new Map(regionalEquipment(classId,region,rarity).map(d=>[d.slot,d])).values()].slice(0,count).map((d,i)=>rollEquipment(d.id,`item-${i}`,()=>.5));return {classId,level:100,items,equipment:Object.fromEntries(items.map(i=>[i.slot,i.id]))};}
test('seven regional tiers preserve every class, slot and rarity, with immutable rolled ranges',()=>{
 assert.equal(EQUIPMENT_ITEMS.length,678);assert.equal(new Set(EQUIPMENT_ITEMS.map(d=>d.id)).size,678);
 for(const [index,region] of GEAR_REGIONS.entries())for(const cls of classes)for(const rarity of [0,1,2,3,4]){
  const definitions=regionalEquipment(cls,region,rarity);assert.equal(new Set(definitions.map(d=>d.slot)).size,6);
  for(const definition of definitions){assert.equal(definition.classId,cls);assert.equal(definition.level,levels[index]);
   for(const random of [()=>0,()=>.5,()=>.999999]){const item=rollEquipment(definition.id,'sample',random);assert.equal(item.rarity,rarity);validateEquipment(structuredClone(item));}
  }
 }
 assert.deepEqual(REGIONAL_ITEMS.snow.warrior[0].ranges,[{key:'attack',min:16,max:24},{key:'haste',min:2,max:5}]);
 assert.deepEqual(REGIONAL_ITEMS.wasteland.warrior[0].ranges,[{key:'attack',min:30,max:44},{key:'haste',min:2,max:5}]);
});
test('boss loot is one mutually exclusive roll, elites never yield yellow or set items',()=>{
 const counts={none:0,0:0,1:0,2:0,3:0,4:0};
 for(let i=0;i<10000;i++){const rng=()=>(i+.5)/10000;counts[gearRarity('scarab','named',rng,true)??'none']++;
  assert.ok([null,0,1,2].includes(gearRarity('wolf','named',rng)));assert.ok([null,0,1,2].includes(gearRarity('wolf',undefined,rng)));
 }
 assert.deepEqual(counts,{none:0,0:0,1:5000,2:3000,3:1500,4:500});
});
test('only equipped pieces of the same set activate its 2/4 bonuses',()=>{
 assert.equal(EQUIPMENT_SETS.length,21);
 const hero=dressed('warrior','citadel',4);const set=itemSet(hero.items[0]);assert.ok(set);
 assert.equal(equippedSetCounts(hero).get(set.id),6);assert.equal(activeSetBonuses(hero).length,2);
 hero.equipment={weapon:hero.items[0].id,armor:hero.items[1].id};assert.equal(activeSetBonuses(hero).length,1);
 hero.equipment.helmet=hero.items[2].id;assert.equal(activeSetBonuses(hero).length,1);
 hero.equipment.boots=hero.items[3].id;assert.equal(activeSetBonuses(hero).length,2);
 const other=rollEquipment(regionalEquipment('warrior','rift',4)[3].id,'other',()=>.5);hero.items.push(other);hero.equipment.boots=other.id;assert.equal(activeSetBonuses(hero).length,1);
 hero.level=84;assert.equal(activeSetBonuses(hero).length,0);
 hero.level=100;hero.classId='mage';assert.equal(activeSetBonuses(hero).length,0);
});
test('set bonuses enter shared character stats, remain bounded and cannot bypass speed/accuracy caps',()=>{
 for(const cls of classes)for(const region of GEAR_REGIONS){
  const hero=dressed(cls,region,4);const set=itemSet(hero.items[0]);const stats=characterStats(hero);
  const plain=structuredClone(hero);for(const item of plain.items){delete item.definitionId;item.rolls=undefined;item.power=0;}const noItems=characterStats({...hero,items:[],equipment:{}});
  const rawAttack=hero.items.flatMap(item=>item.rolls).filter(r=>r.key==='attack').reduce((a,r)=>a+r.value,0);
  assert.equal(stats.attack,noItems.attack+rawAttack+set.bonuses[1].stats[0].value);
  assert.ok(stats.attackSpeed<=.3);assert.ok(stats.hitChance<=.95);
  const yellow=characterStats(dressed(cls,region,3));assert.ok(stats.attack<=yellow.attack+2,`${cls} ${region} set attack exceeds yellow budget`);
 }
});
