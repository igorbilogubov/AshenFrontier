import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,safeHero,persistentHero,makeLoot,stats} from '../dist/world.js';
import {CLASS_ITEMS,validateEquipment,equipmentAppearance} from '../dist/public/game/equipment-items.js';
import {itemArtKey} from '../dist/public/game/item-icons.js';
import {AFK_SPOTS} from '../dist/public/game/location.js';

function fifteenKills(classId){
  const w=new World({random:()=>0}),p=newHero('Добыча',classId);w.add(p);
  Object.assign(p,{x:8,z:1.8});const m=w.mobs[0];
  for(let n=0;n<15;n++){
    Object.assign(m,{state:'idle',hp:60,target:null});m.contributors.set(p.id,{at:w.t,damage:60});w.kill(m);
    const item=w.snapshot(p.id).groundLoot.find(drop=>drop.kind==='item');assert(item);
    w.command(p,{type:'pickup',id:item.id});
  }
  return {w,p,drops:p.items.filter(item=>item.definitionId)};
}

test('personal class drops keep each randomly selected definition and stable rolls',()=>{
  for(const classId of ['warrior','archer','mage']){
    const {p,drops}=fifteenKills(classId);
    assert.equal(drops.length,15,classId);
    assert.equal(p.questKills,15);assert.equal(p.kills,15);
    for(const item of drops){
      assert.equal(item.classId,classId);assert.equal(item.rollVersion,1);assert(item.rolls.length>0);
      assert(CLASS_ITEMS[classId].some(def=>def.id===item.definitionId&&def.slot===item.slot));
      validateEquipment(item);
    }
  }
});

test('saved archer and mage rolls keep their exact instance identity through load and equipment changes',()=>{
  for(const classId of ['archer','mage']){
    const {w,p,drops}=fifteenKills(classId),before=structuredClone(drops);
    const stored=persistentHero(p),restored=safeHero(stored);
    assert.deepEqual(restored.items.filter(item=>item.definitionId),before);
    assert.deepEqual(persistentHero(safeHero(persistentHero(restored))).items,stored.items);
    w.remove(p.id);w.add(restored);w.camp(restored,true);restored.combatUntil=0;
    const other=newHero('Очевидец');w.add(other);
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

test('AFK kill credit remains separate while equipment waits on the ground for manual pickup',()=>{
  for(const classId of ['archer','mage']){
    const w=new World({random:()=>0}),p=newHero('Авто-добыча',classId),spot=AFK_SPOTS[0];w.add(p);
    Object.assign(p,{x:spot.x,z:spot.z,kills:2,questKills:0});
    w.command(p,{type:'afk',enabled:true});assert(p.afk);
    const m=w.mobs[spot.spawnIds[0]];m.contributors.set(p.id,{at:w.t,damage:60,automatic:true});w.kill(m);
    const rolled=w.snapshot(p.id).groundLoot.filter(drop=>drop.kind==='item');
    assert.equal(p.kills,3);assert.equal(p.questKills,0);assert.equal(rolled.length,1);
    assert.equal(rolled[0].item.classId,classId);validateEquipment(rolled[0].item);
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
