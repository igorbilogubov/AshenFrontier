import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../dist/public/game/vendor/three.module.js';
import {GLTFLoader} from '../dist/public/game/vendor/GLTFLoader.js';
import {createAnimatedWarrior} from '../dist/public/game/character.js';
import {GLOW_COLORS,enhancementGlow} from '../dist/public/game/late-equipment-visuals.js';
import {REGIONAL_ITEMS} from '../dist/public/game/regional-equipment.js';

async function load(name){
  const bytes=await fs.readFile(new URL('../public/game/characters/'+name,import.meta.url));
  const loader=new GLTFLoader();
  loader.register(()=>({name:'NoTextures',loadTexture:()=>Promise.resolve(new T.Texture())}));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
const watch={weapon:'watch-sword',armor:'watch-armor',helmet:'watch-helm',boots:'watch-boots',ring:'copper-ring',amulet:'ember-amulet'};
function appearance(cls,region){return Object.fromEntries(REGIONAL_ITEMS[region][cls].map(d=>[d.slot,d.appearance]));}
function cloth(root){
  const list=[];
  root.traverse(object=>{
    if(!(object instanceof T.Mesh))return;
    for(const material of [].concat(object.material))if(material instanceof T.MeshStandardMaterial)list.push(material);
  });
  return list;
}
function tintDistance(material,hex){
  const color=material.color.clone().lerp(material.emissive,0.5);
  const target=new T.Color(hex);
  return Math.abs(color.r-target.r)+Math.abs(color.g-target.g)+Math.abs(color.b-target.b);
}

test('enhancement paints each worn item brighter without extra rim meshes',async()=>{
  const base=await load('ashen-warrior-equipment-v1.glb'),late=await load('ashen-warrior-late-equipment-v1.glb');
  const hero=createAnimatedWarrior(base,'warrior',[],late.scene);
  hero.equipment('sword','warrior',watch);
  const plate=hero.model.getObjectByName('Armor_Body');
  const sword=hero.model.getObjectByName('Weapon_WatchSword');
  const plateCloth=cloth(plate),swordCloth=cloth(sword);
  const before=plateCloth.map(material=>[material.emissiveIntensity,material.color.getHex()]);
  assert.equal(hero.applyEnhancement(0),0);
  assert.equal(hero.model.getObjectByName('EarlyGlow_armor_Spine2'),undefined);
  assert.equal(hero.model.getObjectByName('EnhanceRim_armor'),undefined);
  assert.deepEqual(plateCloth.map(material=>[material.emissiveIntensity,material.color.getHex()]),before);

  assert.equal(hero.applyEnhancement(9),9);
  assert.ok(plateCloth.every(material=>material.emissiveIntensity>before[0][0]));
  assert.equal(enhancementGlow(9).paint>enhancementGlow(3).paint,true);
  assert.equal(enhancementGlow(9).emissive>enhancementGlow(3).emissive,true);
  assert.ok(enhancementGlow(9,'armor').paint<0.22);
  assert.ok(enhancementGlow(7,'armor').paint<enhancementGlow(7,'weapon').paint);

  hero.applyEnhancement({weapon:7,armor:3,helmet:3,boots:3,ring:3,amulet:3});
  assert.ok(swordCloth[0].emissiveIntensity>plateCloth[0].emissiveIntensity);
  assert.ok(enhancementGlow(7).paint>enhancementGlow(3).paint);

  hero.equipment('sword','warrior',appearance('warrior','snow'));
  hero.applyEnhancement(6);
  const snowPlate=cloth(hero.model.getObjectByName('Armor_Body'));
  const snowHex=GLOW_COLORS.snow.warrior;
  assert.ok(tintDistance(snowPlate[0],snowHex)<tintDistance(snowPlate[0],'#000000'));

  hero.equipment('sword','warrior',appearance('warrior','citadel'));
  hero.applyEnhancement(9);
  const citadelPlate=cloth(hero.model.getObjectByName('dreadsovereign-armor')||hero.model);
  assert.ok(citadelPlate.some(material=>material.emissiveIntensity>=enhancementGlow(9).emissive));
  let lights=0;hero.model.traverse(object=>{if(object instanceof T.Light)lights++;});
  assert.equal(lights,0);

  hero.applyEnhancement(0);
  assert.deepEqual(cloth(plate).map(material=>[material.emissiveIntensity,material.color.getHex()]),before);
  hero.disposeExtras();
});

test('archer forest gear paints the bow and hood instead of bone inlays',async()=>{
  const base=await load('ashen-archer-equipment-v1.glb'),late=await load('ashen-archer-late-equipment-v1.glb');
  const hero=createAnimatedWarrior(base,'archer',[],late.scene);
  hero.equipment('sword','archer',{weapon:'ranger-bow',armor:'ranger-armor',helmet:'ranger-hood',boots:'ranger-boots',ring:'hawk-ring',amulet:'leaf-amulet'});
  const bow=hero.model.getObjectByName('ranger-bow');
  const hood=hero.model.getObjectByName('ranger-hood');
  const bowBefore=cloth(bow).map(material=>material.emissiveIntensity);
  hero.applyEnhancement(5);
  assert.equal(hero.model.getObjectByName('EarlyGlow_weapon_LeftHand'),undefined);
  assert.equal(hero.model.getObjectByName('EarlyGlow_helmet_Head'),undefined);
  assert.ok(cloth(bow).every((material,i)=>material.emissiveIntensity>bowBefore[i]));
  assert.ok(cloth(hood).every(material=>material.emissiveIntensity>0));
  hero.equipment('sword','archer',{weapon:'sentinel-bow',armor:'sentinel-armor',helmet:'sentinel-hood',boots:'sentinel-boots',ring:'hawk-ring',amulet:'leaf-amulet'});
  hero.applyEnhancement(5);
  assert.ok(cloth(hero.model.getObjectByName('sentinel-hood')).every(material=>material.emissiveIntensity>0));
  hero.disposeExtras();
});
