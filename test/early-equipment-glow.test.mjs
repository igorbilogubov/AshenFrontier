import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../dist/public/game/vendor/three.module.js';
import {GLTFLoader} from '../dist/public/game/vendor/GLTFLoader.js';
import {createAnimatedWarrior} from '../dist/public/game/character.js';
import {GLOW_COLORS} from '../dist/public/game/late-equipment-visuals.js';
import {REGIONAL_ITEMS} from '../dist/public/game/regional-equipment.js';

async function load(name){
  const bytes=await fs.readFile(new URL('../public/game/characters/'+name,import.meta.url));
  const loader=new GLTFLoader();
  loader.register(()=>({name:'NoTextures',loadTexture:()=>Promise.resolve(new T.Texture())}));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
const watch={weapon:'watch-sword',armor:'watch-armor',helmet:'watch-helm',boots:'watch-boots',ring:'copper-ring',amulet:'ember-amulet'};
function appearance(cls,region){return Object.fromEntries(REGIONAL_ITEMS[region][cls].map(d=>[d.slot,d.appearance]));}
function glowMaterials(root){
  const list=[];
  root.traverse(object=>{
    if(!(object instanceof T.Mesh))return;
    for(const material of [].concat(object.material))if(material.name.endsWith('_Glow')||material.name.endsWith('_Metal'))list.push(material);
  });
  return list;
}

test('forest and snow gear reuse _Glow/_Metal materials and scale with enhance',async()=>{
  const base=await load('ashen-warrior-equipment-v1.glb'),late=await load('ashen-warrior-late-equipment-v1.glb');
  const hero=createAnimatedWarrior(base,'warrior',[],late.scene);
  hero.equipment('sword','warrior',watch);
  assert.equal(hero.applyEnhancement(0),0);
  const amulet=glowMaterials(hero.model.getObjectByName('Ember_Amulet'));
  assert.ok(amulet.some(material=>material.name.endsWith('_Glow')));
  assert.ok(amulet.every(material=>material.emissiveIntensity===.08));
  const plate=glowMaterials(hero.model.getObjectByName('Armor_Body'));
  assert.ok(plate.some(material=>material.name.endsWith('_Metal')));
  assert.equal(hero.applyEnhancement(9),9);
  assert.ok(amulet.some(material=>material.emissiveIntensity>1.5));
  assert.ok(plate.some(material=>material.emissiveIntensity>0));
  const inlay=hero.model.getObjectByName('EarlyGlow_armor_Spine2');
  assert.ok(inlay);assert.equal(inlay.visible,true);
  hero.root.updateMatrixWorld(true);
  const chest=inlay.getWorldPosition(new T.Vector3());
  assert.ok(chest.y>1&&chest.y<1.8,`chest glow height ${chest.y}`);
  assert.ok(Math.hypot(chest.x,chest.z)<.55,`chest glow offset ${chest.x},${chest.z}`);

  hero.equipment('sword','warrior',appearance('warrior','snow'));
  hero.applyEnhancement(6);
  const snow=new T.Color(GLOW_COLORS.snow.warrior);
  assert.ok(glowMaterials(hero.model.getObjectByName('Weapon_WatchSword')).some(material=>material.emissive.equals(snow)));
  assert.ok(inlay.material.emissive.equals(snow));

  hero.equipment('sword','warrior',appearance('warrior','citadel'));
  hero.applyEnhancement(9);
  assert.equal(inlay.visible,false);
  const lateGlow=glowMaterials(hero.model.getObjectByName('dreadsovereign-amulet'));
  assert.ok(lateGlow.some(material=>material.name==='dreadsovereign_Glow'&&material.emissiveIntensity>1.5));
  let lights=0;hero.model.traverse(object=>{if(object instanceof T.Light)lights++;});
  assert.equal(lights,0);
  hero.disposeExtras();
});

test('archer staff-less forest bows keep a hand inlay when no authored gem exists',async()=>{
  const base=await load('ashen-archer-equipment-v1.glb'),late=await load('ashen-archer-late-equipment-v1.glb');
  const hero=createAnimatedWarrior(base,'archer',[],late.scene);
  hero.equipment('sword','archer',{weapon:'ranger-bow',armor:'ranger-armor',helmet:'ranger-hood',boots:'ranger-boots',ring:'hawk-ring',amulet:'leaf-amulet'});
  hero.applyEnhancement(5);
  const gem=glowMaterials(hero.model.getObjectByName('leaf-amulet'));
  assert.ok(gem.some(material=>material.name.endsWith('_Glow')&&material.emissiveIntensity>.4));
  const bowInlay=hero.model.getObjectByName('EarlyGlow_weapon_LeftHand');
  assert.ok(bowInlay);assert.equal(bowInlay.visible,true);
  const hoodInlay=hero.model.getObjectByName('EarlyGlow_helmet_Head');
  assert.equal(hoodInlay.visible,true);
  hero.equipment('sword','archer',{weapon:'sentinel-bow',armor:'sentinel-armor',helmet:'sentinel-hood',boots:'sentinel-boots',ring:'hawk-ring',amulet:'leaf-amulet'});
  hero.applyEnhancement(5);
  assert.equal(hero.model.getObjectByName('EarlyGlow_helmet_Head').visible,false);
  hero.disposeExtras();
});
