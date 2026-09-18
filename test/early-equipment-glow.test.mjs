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
function rims(root,slot){
  const list=[];
  root.traverse(object=>{if(object.name===`EnhanceRim_${slot}`)list.push(object);});
  return list;
}
function cloth(root){
  const list=[];
  root.traverse(object=>{
    if(!(object instanceof T.Mesh)||object.name.startsWith('EnhanceRim'))return;
    for(const material of [].concat(object.material))if(material instanceof T.MeshStandardMaterial)list.push(material);
  });
  return list;
}

test('enhancement uses a per-slot rim and leaves cloth materials alone',async()=>{
  const base=await load('ashen-warrior-equipment-v1.glb'),late=await load('ashen-warrior-late-equipment-v1.glb');
  const hero=createAnimatedWarrior(base,'warrior',[],late.scene);
  hero.equipment('sword','warrior',watch);
  const plate=hero.model.getObjectByName('Armor_Body');
  const before=cloth(plate).map(material=>[material.emissiveIntensity,material.metalness,material.color.getHex()]);
  assert.equal(hero.applyEnhancement(0),0);
  assert.equal(hero.model.getObjectByName('EarlyGlow_armor_Spine2'),undefined);
  assert.ok(rims(hero.model,'armor').every(mesh=>mesh.visible===false));
  assert.equal(hero.applyEnhancement(9),9);
  const armorRims=rims(hero.model,'armor');
  assert.ok(armorRims.length);
  assert.ok(armorRims.every(mesh=>mesh.visible));
  assert.equal(armorRims[0].material.uniforms.uIntensity.value,enhancementGlow(9).intensity);
  assert.deepEqual(cloth(plate).map(material=>[material.emissiveIntensity,material.metalness,material.color.getHex()]),before);
  assert.ok(armorRims[0].material.toneMapped===false);
  assert.equal(armorRims[0].material.blending,T.AdditiveBlending);

  hero.applyEnhancement({weapon:6,armor:3,helmet:3,boots:3,ring:3,amulet:3});
  const swordRim=rims(hero.model,'weapon')[0],plateRim=armorRims[0];
  assert.ok(swordRim&&plateRim);
  assert.notEqual(swordRim.material,plateRim.material);
  assert.equal(swordRim.material.uniforms.uIntensity.value,enhancementGlow(6).intensity);
  assert.equal(plateRim.material.uniforms.uIntensity.value,enhancementGlow(3).intensity);
  assert.ok(swordRim.material.uniforms.uIntensity.value>plateRim.material.uniforms.uIntensity.value*2);
  assert.ok(swordRim.material.uniforms.uExpand.value>plateRim.material.uniforms.uExpand.value*2);
  assert.ok(swordRim.material.uniforms.uPower.value<plateRim.material.uniforms.uPower.value);
  assert.equal(plateRim.material.uniforms.uFill.value,0);
  assert.ok(swordRim.material.uniforms.uFill.value>0);
  assert.ok(enhancementGlow(7).expand>enhancementGlow(3).expand*3);
  assert.ok(enhancementGlow(7).intensity>enhancementGlow(3).intensity*3);

  hero.equipment('sword','warrior',appearance('warrior','snow'));
  hero.applyEnhancement(6);
  const snow=new T.Color(GLOW_COLORS.snow.warrior);
  assert.ok(rims(hero.model,'weapon')[0].material.uniforms.uColor.value.equals(snow));
  assert.ok(rims(hero.model,'armor')[0].material.uniforms.uColor.value.equals(snow));

  hero.equipment('sword','warrior',appearance('warrior','citadel'));
  hero.applyEnhancement(9);
  const citadel=new T.Color(GLOW_COLORS.citadel.warrior);
  assert.ok(rims(hero.model,'armor').some(mesh=>mesh.visible&&mesh.material.uniforms.uColor.value.equals(citadel)));
  let lights=0;hero.model.traverse(object=>{if(object instanceof T.Light)lights++;});
  assert.equal(lights,0);
  hero.disposeExtras();
});

test('archer forest gear gets slot rims instead of bone inlays',async()=>{
  const base=await load('ashen-archer-equipment-v1.glb'),late=await load('ashen-archer-late-equipment-v1.glb');
  const hero=createAnimatedWarrior(base,'archer',[],late.scene);
  hero.equipment('sword','archer',{weapon:'ranger-bow',armor:'ranger-armor',helmet:'ranger-hood',boots:'ranger-boots',ring:'hawk-ring',amulet:'leaf-amulet'});
  hero.applyEnhancement(5);
  assert.equal(hero.model.getObjectByName('EarlyGlow_weapon_LeftHand'),undefined);
  assert.equal(hero.model.getObjectByName('EarlyGlow_helmet_Head'),undefined);
  const bow=rims(hero.model,'weapon'),hood=rims(hero.model,'helmet');
  assert.ok(bow.length&&hood.length);
  assert.ok(bow.every(mesh=>mesh.visible));
  assert.ok(hood.every(mesh=>mesh.visible));
  assert.equal(bow[0].material.uniforms.uIntensity.value,enhancementGlow(5).intensity);
  hero.equipment('sword','archer',{weapon:'sentinel-bow',armor:'sentinel-armor',helmet:'sentinel-hood',boots:'sentinel-boots',ring:'hawk-ring',amulet:'leaf-amulet'});
  hero.applyEnhancement(5);
  assert.ok(rims(hero.model,'helmet').some(mesh=>mesh.visible));
  hero.disposeExtras();
});
