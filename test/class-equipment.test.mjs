import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../dist/public/game/vendor/three.module.js';
import {GLTFLoader} from '../dist/public/game/vendor/GLTFLoader.js';
import {clone} from '../dist/public/game/vendor/SkeletonUtils.js';
import {createAnimatedWarrior,CLIP_NAMES} from '../dist/public/game/character.js';
import {CLASS_ITEMS,RARE_CLASS_ITEMS,EQUIPMENT_ITEMS,rollEquipment,validateEquipment,equipmentAppearance} from '../dist/public/game/equipment-items.js';
import {itemArtKey} from '../dist/public/game/item-icons.js';
import {canEquip,characterStats} from '../dist/public/rules.js';
const slots=['weapon','armor','helmet','boots','ring','amulet'];

test('rare equipment uses the existing image for its actual appearance in every class and slot',async()=>{
  for(const classId of ['warrior','archer','mage'])for(const definition of RARE_CLASS_ITEMS[classId]){
    const item=rollEquipment(definition.id,'rare-icon',()=>.5),base=CLASS_ITEMS[classId].find(candidate=>candidate.appearance===definition.appearance&&candidate.slot===definition.slot);
    assert.equal(item.rarity,2);assert.equal(itemArtKey(item,classId),base.id);
    const png=await fs.readFile(new URL('../public/game/item-icons/'+itemArtKey(item,classId)+'.png',import.meta.url));
    assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);
  }
});

test('each class has ten unique definitions and six slots, with stable validated rolls and art',async()=>{
  assert.equal(EQUIPMENT_ITEMS.length,540);assert.equal(new Set(EQUIPMENT_ITEMS.map(i=>i.id)).size,540);
  for(const classId of ['archer','mage']){
    const catalog=CLASS_ITEMS[classId];assert.equal(catalog.length,10);
    assert.deepEqual(slots.map(slot=>catalog.filter(d=>d.slot===slot).length),[2,2,2,2,1,1]);
    for(const definition of catalog){
      for(const random of [()=>0,()=>.42,()=>1-Number.EPSILON]){
        const item=rollEquipment(definition.id,definition.id,random);assert.equal(item.classId,classId);validateEquipment(item);validateEquipment(JSON.parse(JSON.stringify(item)));
        assert(canEquip({classId,level:1},item));assert(!canEquip({classId:classId==='mage'?'archer':'mage',level:1},item));
        const forged=structuredClone(item);forged.classId='warrior';assert.throws(()=>validateEquipment(forged));
        const bounds=structuredClone(item);bounds.rolls[0].max++;assert.throws(()=>validateEquipment(bounds));
        assert.equal(itemArtKey(item,classId),definition.id);
      }
      const png=await fs.readFile(new URL('../public/game/item-icons/'+definition.id+'.png',import.meta.url));assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);assert.equal(png[25],6);
    }
    const items=catalog.map(d=>rollEquipment(d.id,d.id,()=>.5));const equipment=Object.fromEntries(slots.map(slot=>[slot,items.find(i=>i.slot===slot).id]));const source={classId,level:1,items,equipment};
    const before=JSON.stringify(items);const appearance=equipmentAppearance(source);assert.deepEqual(Object.keys(appearance),slots);assert(Object.values(characterStats(source)).filter(v=>typeof v==='number').every(Number.isFinite));
    for(const slot of slots){equipment[slot]=null;assert.equal(equipmentAppearance(source)[slot],null);}assert.equal(JSON.stringify(items),before);
  }
});

for(const classId of ['archer','mage'])test(classId+' GLB shows exactly one variant per slot, keeps original head/base clothing and one finite skeleton',async()=>{
  const bytes=await fs.readFile(new URL('../public/game/characters/ashen-'+classId+'-equipment-v1.glb',import.meta.url));assert(bytes.length<6*1024*1024);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));assert.deepEqual(json.animations.map(a=>a.name),CLIP_NAMES);
  const loader=new GLTFLoader();loader.register(()=>({name:'ClassEquipmentGeometryTest',loadTexture:()=>Promise.resolve(new T.Texture())}));
  const asset=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');const hero=createAnimatedWarrior({...asset,scene:clone(asset.scene)},classId);
  const skins=[];hero.model.traverse(o=>{if(o.isSkinnedMesh)skins.push(o);});assert.equal(new Set(skins.map(s=>s.skeleton)).size,1);assert.equal(skins[0].skeleton.bones.length,67);
  const catalog=CLASS_ITEMS[classId],appearances=[{},Object.fromEntries(slots.map(slot=>[slot,'legacy']))];
  for(const variant of [0,1])appearances.push(Object.fromEntries(slots.map(slot=>{const defs=catalog.filter(i=>i.slot===slot);return [slot,(defs[variant]??defs[0]).appearance];})));
  appearances.push({...appearances[2],armor:appearances[3].armor,boots:null,helmet:null,weapon:null});
  for(const appearance of appearances){
    hero.equipment('sword',classId,appearance);assert.equal(hero.model.getObjectByName('Class_Base_Head').visible,true);
    for(const slot of slots){
      const visible=catalog.filter(d=>d.slot===slot&&hero.model.getObjectByName(d.appearance)?.visible);assert.equal(visible.length,appearance[slot]?1:0,slot);
      if(slot==='armor'||slot==='boots')assert.equal(hero.model.getObjectByName(slot==='armor'?'Class_Base_Body':'Class_Base_Boots').visible,!appearance[slot]);
    }
    for(const name of CLIP_NAMES){hero.previewClip(name);for(let i=0;i<=4;i++){
      hero.samplePreview(hero.clips[name].duration*i/4);hero.root.updateMatrixWorld(true);const bounds=new T.Box3();hero.model.traverseVisible(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();bounds.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));}});
      assert([...bounds.min,...bounds.max].every(Number.isFinite),name);assert(bounds.getSize(new T.Vector3()).length()<5,name+' exploded skin');
    }}
  }
});
