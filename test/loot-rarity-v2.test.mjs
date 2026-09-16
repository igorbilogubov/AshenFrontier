import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalEquipment,rollEquipment,validateEquipment} from '../dist/public/game/equipment-items.js';
import {GEAR_REGIONS} from '../dist/public/game/regional-equipment.js';
import {gearRarity} from '../dist/public/game/loot-rules.js';
import {possibleLoot} from '../dist/public/game/possible-loot.js';

const classes=['warrior','archer','mage'];

test('ordinary and alpha drops use the exact white and green boundaries',()=>{
  assert.equal(gearRarity('wolf',undefined,()=>.004999),0);
  assert.equal(gearRarity('wolf',undefined,()=>.005),1);
  assert.equal(gearRarity('wolf',undefined,()=>.024999),1);
  assert.equal(gearRarity('wolf',undefined,()=>.025),null);
  assert.equal(gearRarity('alpha',undefined,()=>.009999),0);
  assert.equal(gearRarity('alpha',undefined,()=>.01),1);
  assert.equal(gearRarity('alpha',undefined,()=>.089999),1);
  assert.equal(gearRarity('alpha',undefined,()=>.09),null);
});

test('elites and bosses retain their rare tiers while reducing green drops',()=>{
  assert.equal(gearRarity('wolf','named',()=>.029999),2);
  assert.equal(gearRarity('wolf','named',()=>.03),1);
  assert.equal(gearRarity('wolf','named',()=>.129999),1);
  assert.equal(gearRarity('wolf','named',()=>.13),null);
  assert.equal(gearRarity('wolf','boss',()=>.039999,true),4);
  assert.equal(gearRarity('wolf','boss',()=>.04,true),3);
  assert.equal(gearRarity('wolf','boss',()=>.12,true),2);
  assert.equal(gearRarity('wolf','boss',()=>.47,true),1);
  assert.equal(gearRarity('wolf','boss',()=>.57,true),null);
});

test('every region and class has a valid white equipment pool with lower immutable rolls',()=>{
  for(const region of GEAR_REGIONS)for(const classId of classes){
    const white=regionalEquipment(classId,region,0),green=regionalEquipment(classId,region,1);
    assert.equal(white.length,green.length);assert.deepEqual([...new Set(white.map(item=>item.slot))].sort(),[...new Set(green.map(item=>item.slot))].sort());
    for(const definition of white){
      const greenDefinition=green.find(item=>item.id===definition.id.replace('-common-v1',''));assert.ok(greenDefinition);
      const item=rollEquipment(definition.id,`${region}-${classId}-${definition.slot}`,()=>.5);
      assert.equal(item.rarity,0);validateEquipment(structuredClone(item));
      assert.ok(definition.ranges.every((range,index)=>range.max<=greenDefinition.ranges[index].max));
    }
  }
});

test('target hints expose both actual ordinary pools and their per-rarity chances',()=>{
  const ordinary=possibleLoot('wolf'),alpha=possibleLoot('alpha');
  assert.equal(ordinary.itemChance,.025);
  assert.deepEqual([...new Set(ordinary.categories.filter(category=>category.rarity!== 'gold').map(category=>category.rarity))],[0,1]);
  assert.equal(ordinary.categories.find(category=>category.rarity===0)?.chance,.005);
  assert.equal(ordinary.categories.find(category=>category.rarity===1)?.chance,.02);
  assert.equal(alpha.itemChance,.09);
  assert.equal(alpha.categories.find(category=>category.rarity===0)?.chance,.01);
  assert.equal(alpha.categories.find(category=>category.rarity===1)?.chance,.08);
});
