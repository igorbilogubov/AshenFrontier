import test from 'node:test';
import assert from 'node:assert/strict';
import {EQUIPMENT_ITEMS,RARE_CLASS_ITEMS,COMMON_CLASS_ITEMS,regionalEquipment,rollEquipment,validateEquipment} from '../dist/public/game/equipment-items.js';
import {GEAR_REGIONS} from '../dist/public/game/regional-equipment.js';
import {bossItemCount,gearRarity,GEAR_CHANCE,WHITE_GEAR_CHANCE,GREEN_GEAR_CHANCE,ELITE_GEAR_CHANCE,BOSS_GEAR_CHANCE} from '../dist/public/game/loot-rules.js';
import {possibleLoot} from '../dist/public/game/possible-loot.js';
import {newHero,persistentHero,safeHero} from '../dist/world.js';

const classes=['warrior','archer','mage'];
const optionCount=rarity=>rarity===0?1:rarity===1?2:rarity===2?3:4;

test('ordinary drops prefer white over green and never exceed green',()=>{
  assert.equal(WHITE_GEAR_CHANCE.wolf,.03);assert.equal(GREEN_GEAR_CHANCE.wolf,.01);
  assert.ok(WHITE_GEAR_CHANCE.wolf>GREEN_GEAR_CHANCE.wolf);
  assert.ok(WHITE_GEAR_CHANCE.alpha>GREEN_GEAR_CHANCE.alpha);
  assert.equal(GEAR_CHANCE.wolf,.04);assert.equal(GEAR_CHANCE.alpha,.10);
  assert.equal(gearRarity('wolf',undefined,()=>.029999),0);
  assert.equal(gearRarity('wolf',undefined,()=>.03),1);
  assert.equal(gearRarity('wolf',undefined,()=>.039999),1);
  assert.equal(gearRarity('wolf',undefined,()=>.04),null);
  assert.equal(gearRarity('alpha',undefined,()=>.059999),0);
  assert.equal(gearRarity('alpha',undefined,()=>.06),1);
  assert.equal(gearRarity('alpha',undefined,()=>.099999),1);
  assert.equal(gearRarity('alpha',undefined,()=>.10),null);
});

test('elites can drop white, green or blue and never yellow or set',()=>{
  assert.equal(gearRarity('wolf','named',()=>.199999),0);
  assert.equal(gearRarity('wolf','named',()=>.20),1);
  assert.equal(gearRarity('wolf','named',()=>.319999),1);
  assert.equal(gearRarity('wolf','named',()=>.32),2);
  assert.equal(gearRarity('wolf','named',()=>.359999),2);
  assert.equal(gearRarity('wolf','named',()=>.36),null);
  for(let i=0;i<1000;i++)assert.ok([null,0,1,2].includes(gearRarity('wolf','named',()=>(i+.5)/1000)));
});

test('bosses never drop white and always resolve a colored rarity',()=>{
  assert.equal(gearRarity('wolf','boss',()=>.499999,true),1);
  assert.equal(gearRarity('wolf','boss',()=>.50,true),2);
  assert.equal(gearRarity('wolf','boss',()=>.799999,true),2);
  assert.equal(gearRarity('wolf','boss',()=>.80,true),3);
  assert.equal(gearRarity('wolf','boss',()=>.949999,true),3);
  assert.equal(gearRarity('wolf','boss',()=>.95,true),4);
  for(let i=0;i<2000;i++)assert.ok([1,2,3,4].includes(gearRarity('scarab','named',()=>(i+.5)/2000,true)));
  assert.equal(bossItemCount(()=>0),1);
  assert.equal(bossItemCount(()=>.34),2);
  assert.equal(bossItemCount(()=>.67),3);
  assert.equal(bossItemCount(()=>.999),3);
});

test('each rarity keeps a fixed option count',()=>{
  for(const definition of EQUIPMENT_ITEMS){
    const rarity=definition.rarity??1;
    assert.equal(definition.ranges.length,optionCount(rarity),definition.id);
  }
});

test('every region and class has a valid white equipment pool with lower immutable rolls',()=>{
  for(const region of GEAR_REGIONS)for(const classId of classes){
    const white=regionalEquipment(classId,region,0),green=regionalEquipment(classId,region,1);
    assert.equal(white.length,green.length);assert.deepEqual([...new Set(white.map(item=>item.slot))].sort(),[...new Set(green.map(item=>item.slot))].sort());
    for(const definition of white){
      const greenDefinition=green.find(item=>item.id===definition.id.replace('-common-v1',''));assert.ok(greenDefinition);
      const item=rollEquipment(definition.id,`${region}-${classId}-${definition.slot}`,()=>.5);
      assert.equal(item.rarity,0);validateEquipment(structuredClone(item));
      assert.equal(item.rolls.length,1);
      assert.ok(definition.ranges.every((range,index)=>range.max<=greenDefinition.ranges[index].max));
    }
  }
});

test('boss kill table always yields gold plus 1-3 non-white items',()=>{
  const simulate=seed=>{
    const random=()=>seed;
    const count=bossItemCount(random);
    const items=[];
    for(let i=0;i<count;i++){
      const rarity=gearRarity('iron-warden','named',random,true);
      assert.ok(rarity!==null&&rarity!==0);
      const definition=regionalEquipment('warrior','citadel',rarity)[0];
      const item=rollEquipment(definition.id,`boss-${seed}-${i}`,random);
      assert.equal(item.rarity,rarity);validateEquipment(structuredClone(item));
      items.push(item);
    }
    return items;
  };
  assert.equal(simulate(0).length,1);
  assert.equal(simulate(.34).length,2);
  assert.equal(simulate(.67).length,3);
  assert.ok(simulate(.96).every(item=>item.rarity===4));
});

test('target hints expose actual pools, white-first ordinary chances and guaranteed boss gold',()=>{
  const ordinary=possibleLoot('wolf'),alpha=possibleLoot('alpha'),elite=possibleLoot('wolf','named'),boss=possibleLoot('iron-warden',undefined,'citadel-dungeon');
  assert.equal(ordinary.itemChance,.04);
  assert.deepEqual([...new Set(ordinary.categories.filter(category=>category.rarity!== 'gold').map(category=>category.rarity))],[0,1]);
  assert.equal(ordinary.categories.find(category=>category.rarity===0)?.chance,.03);
  assert.equal(ordinary.categories.find(category=>category.rarity===1)?.chance,.01);
  assert.equal(alpha.itemChance,.10);
  assert.equal(alpha.categories.find(category=>category.rarity===0)?.chance,.06);
  assert.equal(alpha.categories.find(category=>category.rarity===1)?.chance,.04);
  assert.equal(elite.itemChance,ELITE_GEAR_CHANCE);
  assert.deepEqual([...new Set(elite.categories.filter(category=>category.rarity!=='gold').map(category=>category.rarity))],[0,1,2]);
  assert.equal(boss.itemChance,BOSS_GEAR_CHANCE);
  assert.deepEqual(boss.itemCount,{min:1,max:3});
  assert.deepEqual([...new Set(boss.categories.filter(category=>category.rarity!=='gold').map(category=>category.rarity))],[1,2,3,4]);
  assert.equal(boss.categories.some(category=>category.rarity===0),false);
});

test('historical roll counts stay frozen when current rarity tables differ',()=>{
  const rare=rollEquipment(RARE_CLASS_ITEMS.warrior[0].id,'hist-rare',()=>.4);
  assert.equal(rare.rolls.length,3);
  const shorter=structuredClone(rare);shorter.rolls=shorter.rolls.slice(0,2);
  const white=rollEquipment(COMMON_CLASS_ITEMS.warrior[0].id,'hist-white',()=>.4);
  assert.equal(white.rolls.length,1);
  const longer=structuredClone(white);longer.rolls=[...longer.rolls,{key:'accuracy',value:1,min:1,max:3}];
  for(const item of [shorter,longer]){
    const before=JSON.stringify(item);
    validateEquipment(item);
    assert.equal(JSON.stringify(item),before);
  }
  const hero=newHero();
  hero.items.push(shorter,longer);
  const restored=safeHero(JSON.parse(JSON.stringify(persistentHero(hero))));
  assert.equal(restored.items.find(item=>item.id==='hist-rare').rolls.length,2);
  assert.equal(restored.items.find(item=>item.id==='hist-white').rolls.length,2);
});
