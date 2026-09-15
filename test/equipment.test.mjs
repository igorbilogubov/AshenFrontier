import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../dist/public/game/vendor/three.module.js';
import {GLTFLoader} from '../dist/public/game/vendor/GLTFLoader.js';
import {clone} from '../dist/public/game/vendor/SkeletonUtils.js';
import {createAnimatedWarrior,CLIP_NAMES} from '../dist/public/game/character.js';
import {WARRIOR_ITEMS,rollEquipment,validateEquipment,equipmentAppearance} from '../dist/public/game/equipment-items.js';
import {World,newHero,persistentHero,safeHero,stats,makeLoot} from '../dist/world.js';
import {canEquip} from '../dist/public/rules.js';

test('ten warrior definitions roll inclusive endpoints and keep their instance values',()=>{
  assert.equal(WARRIOR_ITEMS.length,10);
  for(const definition of WARRIOR_ITEMS){
    const low=rollEquipment(definition.id,'low',()=>0),high=rollEquipment(definition.id,'high',()=>1-Number.EPSILON);
    assert.deepEqual(low.rolls.map(r=>r.value),definition.ranges.map(r=>r.min));
    assert.deepEqual(high.rolls.map(r=>r.value),definition.ranges.map(r=>r.max));
    validateEquipment(low);validateEquipment(high);
    const seen=new Set();let seed=37;
    for(let i=0;i<500;i++){
      const item=rollEquipment(definition.id,String(i),()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296));
      validateEquipment(item);seen.add(JSON.stringify(item.rolls.map(r=>r.value)));
    }
    assert(seen.size>4,'different finds have different values');
  }
});

test('saved rolls reject forged/out-of-range data and legacy items are preserved',()=>{
  const item=rollEquipment('wanderer-armor','test',()=>.5);
  for(const change of [
    i=>i.rolls[0].value=999,i=>i.rolls[0].key='constructor',
    i=>i.rolls[0].min=0,i=>i.rolls.push(i.rolls[0]),i=>i.classId='mage',
    i=>i.definitionId='unknown',i=>i.rollVersion=2
  ]){const forged=structuredClone(item);change(forged);assert.throws(()=>validateEquipment(forged));}
  const p=newHero(),legacy=structuredClone(p.items);p.items.push(item);p.pendingItems.push(rollEquipment('ember-amulet','pending',()=>.75));
  const world=new World();world.add(p);const before=structuredClone(p.items);
  world.command(p,{type:'equip',id:item.id,rolls:[{key:'maxHp',value:9000}]});
  world.command(p,{type:'unequip',id:item.id});world.command(p,{type:'equip',id:item.id});
  const restored=safeHero(JSON.parse(JSON.stringify(persistentHero(p))));
  assert.deepEqual(restored.items,before);assert.deepEqual(restored.pendingItems,p.pendingItems);assert.deepEqual(restored.items.slice(0,legacy.length),legacy);
  assert.deepEqual(restored.allocatedStats,p.allocatedStats);assert.equal(restored.mana,p.mana);assert.equal(restored.hp,p.hp);
});

test('gear applies each roll once, honors class and camp restrictions, and publishes only appearance',()=>{
  const p=newHero(),other=newHero('Наблюдатель'),world=new World();world.add(p);world.add(other);
  const base=stats(p),item=rollEquipment('wanderer-armor','armor',()=>1-Number.EPSILON);p.items.push(item);
  assert.equal(canEquip({classId:'mage',level:1},item),false);
  world.command(p,{type:'equip',id:item.id});const equipped=stats(p);
  assert.equal(equipped.maxHp,base.maxHp+15);
  assert.equal(equipped.armor,base.armor-p.items[1].power+4);
  const snapshot=world.snapshot(other.id).players.find(player=>player.id===p.id);
  assert.equal(snapshot.appearance.armor,'wanderer-armor');assert(!('items' in snapshot));assert(!('rolls' in snapshot));
  const saved=JSON.stringify(p.items);for(let i=0;i<20;i++)world.snapshot(p.id);assert.equal(JSON.stringify(p.items),saved);
  p.x=10;world.command(p,{type:'unequip',id:item.id});assert.equal(p.equipment.armor,item.id);
  p.x=.5;world.command(p,{type:'unequip',id:item.id});assert.equal(p.equipment.armor,null);
  assert.equal(equipmentAppearance(p).armor,null);
  // Legacy common armor stays usable by other classes.
  assert(canEquip({classId:'mage'},makeLoot('warrior',1,0,'armor')));
});

test('weapon appearance follows the item and haste shortens attacks without shortening skill cooldowns',()=>{
  const p=newHero(),world=new World();world.add(p);
  const sword=rollEquipment('watch-blade','sword',()=>1-Number.EPSILON),ring=rollEquipment('copper-ring','ring',()=>1-Number.EPSILON);
  p.items.push(sword,ring);world.command(p,{type:'equip',id:sword.id});world.command(p,{type:'equip',id:ring.id});
  world.command(p,{type:'weapon',weapon:'axe'});assert.equal(p.weapon,'sword');assert.equal(stats(p).attackSpeed,.08);
  p.x=10;assert(world.attack(p,0,true));assert.equal(p.specialCooldown,5);
  assert.ok(Math.abs(p.attack.duration-(.64/1.08*1.2))<1e-10);
  // Derived rules retain the global cap, even if a future catalog expands sources.
  for(const item of p.items.filter(i=>i.rolls))for(const r of item.rolls)if(r.key==='haste')r.value=25;
  assert.equal(stats(p).attackSpeed,.3);
});

test('modular GLB shares one rig and stays finite across equipment and all exported clips',async()=>{
  const bytes=await fs.readFile(new URL('../public/game/characters/ashen-warrior-equipment-v1.glb',import.meta.url));
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));assert.deepEqual(json.animations.map(a=>a.name),CLIP_NAMES);assert(bytes.length<6*1024*1024);
  const loader=new GLTFLoader();loader.register(()=>({name:'GeometryOnlyEquipmentTest',loadTexture:()=>Promise.resolve(new T.Texture())}));
  const asset=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const w=createAnimatedWarrior({...asset,scene:clone(asset.scene)}),second=createAnimatedWarrior({...asset,scene:clone(asset.scene)});
  const skins=[];w.model.traverse(o=>{if(o.isSkinnedMesh)skins.push(o);});assert.equal(new Set(skins.map(o=>o.skeleton)).size,1);
  assert.notEqual(skins[0].skeleton,second.model.getObjectByName(skins[0].name)?.skeleton);
  const light={armor:'wanderer-armor',helmet:'wanderer-hood',boots:'wanderer-boots',weapon:'wanderer-sword',ring:'copper-ring',amulet:'ember-amulet'};
  const heavy={armor:'watch-armor',helmet:'watch-helm',boots:'watch-boots',weapon:'watch-sword'};
  w.equipment('sword','warrior',light);assert.equal(w.model.getObjectByName('Traveller_Armor').visible,true);assert.equal(w.model.getObjectByName('Armor_Body').visible,false);
  w.equipment('sword','warrior',heavy);assert.equal(w.model.getObjectByName('Traveller_Armor').visible,false);assert.equal(w.model.getObjectByName('Armor_Body').visible,true);
  assert.equal(w.model.getObjectByName('Weapon_WatchSword').visible,true);assert.equal(w.model.getObjectByName('Weapon_Sword').visible,false);
  w.equipment('sword','warrior',{});assert.equal(w.model.getObjectByName('Base_Body').visible,true);assert.equal(w.model.getObjectByName('Helmet').visible,false);assert.equal(w.model.getObjectByName('Base_Head').visible,true);
  w.equipment('sword','warrior',{helmet:'future-helmet',boots:'future-boots'});assert.equal(w.model.getObjectByName('Base_Head').visible,true);assert.equal(w.model.getObjectByName('Base_Feet').visible,true);
  for(const appearance of [light,heavy,{}, {...light,armor:'watch-armor',boots:null,helmet:null}]){
    w.equipment('sword','warrior',appearance);
    for(const name of CLIP_NAMES){w.previewClip(name);for(let i=0;i<=6;i++){
      w.samplePreview(w.clips[name].duration*i/6);w.root.updateMatrixWorld(true);
      const bounds=new T.Box3();w.model.traverseVisible(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();bounds.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));}});
      assert([...bounds.min,...bounds.max].every(Number.isFinite),name);assert(bounds.getSize(new T.Vector3()).length()<5,name+' exploded skin');
    }}
  }
});


test('rare warrior drops roll once on the ground and preserve the exact instance after pickup',()=>{
  const p=newHero(),world=new World({random:()=>0});world.add(p);const m=world.mobs[0];p.x=m.x;p.z=m.z;
  m.contributors.set(p.id,{at:world.t,damage:999});world.kill(m);
  const drop=world.snapshot(p.id).groundLoot.find(drop=>drop.kind==='item');assert(drop);
  validateEquipment(drop.item);const before=structuredClone(drop.item);
  world.command(p,{type:'pickup',id:drop.id});assert.deepEqual(p.items.at(-1),before);
  assert.deepEqual(safeHero(persistentHero(p)).items.at(-1),before);
});
