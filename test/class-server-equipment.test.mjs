import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,safeHero,persistentHero,makeLoot,stats} from '../dist/world.js';
import {CLASS_ITEMS,COMMON_CLASS_ITEMS,RARE_CLASS_ITEMS,YELLOW_ITEMS,SET_ITEMS,validateEquipment,equipmentAppearance,rollEquipment,regionalDropPool,itemDisplayName} from '../dist/public/game/equipment-items.js';
import {itemArtKey} from '../dist/public/game/item-icons.js';
import {AFK_SPOTS} from '../dist/public/game/location.js';
import {canEquip,itemWrongClass} from '../dist/public/rules.js';

function dropForPick(classId,pickUnit){
  let n=0;const random=()=>++n%2?0:pickUnit;
  const w=new World({random}),p=newHero('Добыча',classId);p.consumableInventory=[];w.add(p);
  Object.assign(p,{x:8,z:1.8});const m=w.mobs[0];
  Object.assign(m,{state:'idle',hp:60,target:null});m.contributors.set(p.id,{at:w.t,damage:60});w.kill(m);
  const drop=w.snapshot(p.id).groundLoot.find(item=>item.kind==='item');
  return {w,p,drop};
}

test('kills drop gear for every class, not only the killer',()=>{
  const seen=new Set();
  for(const pick of [0,.4,.8]){
    const {p,drop}=dropForPick('warrior',pick);
    assert(drop);validateEquipment(drop.item);seen.add(drop.item.classId);
    assert.equal(itemDisplayName(drop.item.name),drop.item.name);
    assert.doesNotMatch(drop.item.name,/простого качества|превосходства|величия|наследия/);
    assert.equal(itemWrongClass(p,drop.item),drop.item.classId!==p.classId);
    if(drop.item.classId!==p.classId)assert.equal(canEquip(p,drop.item),false);
  }
  assert.deepEqual([...seen].sort(),['archer','mage','warrior']);
});

test('catalog names omit rarity quality; display helper strips old suffixes',()=>{
  assert.equal(itemDisplayName('Меч странника простого качества'),'Меч странника');
  assert.equal(itemDisplayName('Лук следопыта превосходства'),'Лук следопыта');
  assert.equal(itemDisplayName('Посох послушника величия'),'Посох послушника');
  assert.equal(itemDisplayName('Капюшон странника наследия'),'Капюшон странника');
  assert.equal(itemDisplayName('Меч странника'),'Меч странника');
  const white=COMMON_CLASS_ITEMS.warrior[0],rare=RARE_CLASS_ITEMS.warrior[0],yellow=YELLOW_ITEMS.forest.warrior[0],set=SET_ITEMS.forest.warrior[0];
  assert.equal(white.name,'Меч странника');assert.equal(rare.name,'Меч странника');
  assert.equal(yellow.name,CLASS_ITEMS.warrior[0].name);assert.equal(set.name,CLASS_ITEMS.warrior.find(item=>item.id==='watch-blade').name);
  const pool=regionalDropPool('forest',0);
  assert.equal(new Set(pool.map(item=>item.classId)).size,3);
  assert.equal(pool.length,COMMON_CLASS_ITEMS.warrior.length+COMMON_CLASS_ITEMS.archer.length+COMMON_CLASS_ITEMS.mage.length);
});

test('saved archer and mage rolls keep their exact instance identity through load and equipment changes',()=>{
  for(const classId of ['archer','mage']){
    const w=new World({random:()=>0}),p=newHero('Очевидец',classId);w.add(p);
    const before=CLASS_ITEMS[classId].slice(0,6).map((definition,index)=>rollEquipment(definition.id,`keep-${classId}-${index}`,()=>.37));
    p.items.push(...before);
    const stored=persistentHero(p),restored=safeHero(stored);
    assert.deepEqual(restored.items.filter(item=>item.definitionId),before);
    assert.deepEqual(persistentHero(safeHero(persistentHero(restored))).items,stored.items);
    w.remove(p.id);w.add(restored);w.camp(restored,true);restored.combatUntil=0;
    const other=newHero('Зритель');w.add(other);
    const attackBefore=stats(restored).attackPower;
    for(const item of before)w.command(restored,{type:'equip',id:item.id});
    assert.deepEqual(restored.items.filter(item=>item.definitionId),before);
    assert(stats(restored).attackPower>attackBefore);
    const appearance=equipmentAppearance(restored);
    assert.deepEqual(w.snapshot(restored.id).self.appearance,appearance);
    const peer=w.snapshot(other.id).players.find(player=>player.id===restored.id);
    assert.deepEqual(peer.appearance,appearance);
    for(const secret of ['items','rolls','gold','equipment','skillCooldowns'])assert(!(secret in peer),secret);
    assert.deepEqual(safeHero(persistentHero(restored)).items.filter(item=>item.definitionId),before);
  }
});

test('AFK kill credit remains separate while equipment initially appears on the ground',()=>{
  for(const classId of ['archer','mage']){
    const w=new World({random:()=>0}),p=newHero('Авто-добыча',classId),spot=AFK_SPOTS[0];w.add(p);
    Object.assign(p,{x:spot.x,z:spot.z,kills:2,questKills:0});
    w.command(p,{type:'afk',enabled:true});assert(p.afk);
    const m=w.mobs[spot.spawnIds[0]];m.contributors.set(p.id,{at:w.t,damage:60,automatic:true});w.kill(m);
    const rolled=w.snapshot(p.id).groundLoot.filter(drop=>drop.kind==='item');
    assert.equal(p.kills,3);assert.equal(p.questKills,0);assert.equal(rolled.length,1);
    assert.ok(['warrior','archer','mage'].includes(rolled[0].item.classId));validateEquipment(rolled[0].item);
    assert.equal(p.items.filter(item=>item.definitionId).length,0);
  }
});

test('legacy archer/mage gear uses the first real collection art without rewriting saved items',()=>{
  for(const [classId,weapon,armor] of [['archer','ranger-bow','ranger-armor'],['mage','acolyte-staff','acolyte-armor']]){
    const p=newHero('Старые вещи',classId),saved=persistentHero(p);
    const wornWeapon=p.items.find(item=>item.id===p.equipment.weapon),wornArmor=p.items.find(item=>item.id===p.equipment.armor);
    assert.equal(itemArtKey(wornWeapon,classId),weapon);assert.equal(itemArtKey(wornArmor,classId),armor);
    assert(!wornWeapon.definitionId&&!wornArmor.definitionId);
    assert.deepEqual(safeHero(saved).items,p.items);
    const extra=makeLoot(classId,1,0,'weapon');assert.equal(itemArtKey(extra,classId),weapon);
  }
});
