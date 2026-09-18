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
function tints(root,slot){
  const list=[];
  root.traverse(object=>{if(object.name===`EnhanceTint_${slot}`)list.push(object);});
  return list;
}
function cloth(root){
  const list=[];
  root.traverse(object=>{
    if(!(object instanceof T.Mesh)||object.name.startsWith('EnhanceTint'))return;
    for(const material of [].concat(object.material))if(material instanceof T.MeshStandardMaterial)list.push(material);
  });
  return list;
}

test('enhancement tints the mesh additively and leaves cloth albedo alone',async()=>{
  const base=await load('ashen-warrior-equipment-v1.glb'),late=await load('ashen-warrior-late-equipment-v1.glb');
  const hero=createAnimatedWarrior(base,'warrior',[],late.scene);
  hero.equipment('sword','warrior',watch);
  const plate=hero.model.getObjectByName('Armor_Body');
  const before=cloth(plate).map(material=>[material.emissiveIntensity,material.color.getHex(),material.metalness]);
  assert.equal(hero.applyEnhancement(0),0);
  assert.equal(hero.model.getObjectByName('EarlyGlow_armor_Spine2'),undefined);
  assert.ok(tints(hero.model,'armor').every(mesh=>mesh.visible===false));
  assert.deepEqual(cloth(plate).map(material=>[material.emissiveIntensity,material.color.getHex(),material.metalness]),before);

  assert.equal(hero.applyEnhancement(9),9);
  const armorTints=tints(hero.model,'armor');
  assert.ok(armorTints.length);
  assert.ok(armorTints.every(mesh=>mesh.visible));
  assert.equal(armorTints[0].material.uniforms.uIntensity.value,enhancementGlow(9,'armor').intensity);
  assert.deepEqual(cloth(plate).map(material=>[material.emissiveIntensity,material.color.getHex(),material.metalness]),before);
  assert.equal(armorTints[0].material.toneMapped,false);
  assert.equal(armorTints[0].material.blending,T.AdditiveBlending);
  assert.equal(armorTints[0].material.side,T.FrontSide);
  assert.ok(!('uExpand' in armorTints[0].material.uniforms));
  assert.ok(enhancementGlow(9,'armor').intensity<0.35);
  assert.ok(enhancementGlow(7,'armor').intensity<enhancementGlow(7,'weapon').intensity);

  hero.applyEnhancement({weapon:7,armor:3,helmet:3,boots:3,ring:3,amulet:3});
  const swordTint=tints(hero.model,'weapon')[0],plateTint=armorTints[0];
  assert.ok(swordTint&&plateTint);
  assert.notEqual(swordTint.material,plateTint.material);
  assert.equal(swordTint.material.uniforms.uIntensity.value,enhancementGlow(7,'weapon').intensity);
  assert.equal(plateTint.material.uniforms.uIntensity.value,enhancementGlow(3,'armor').intensity);
  assert.ok(swordTint.material.uniforms.uIntensity.value>plateTint.material.uniforms.uIntensity.value);

  hero.equipment('sword','warrior',appearance('warrior','snow'));
  hero.applyEnhancement(6);
  const snow=new T.Color(GLOW_COLORS.snow.warrior);
  assert.ok(tints(hero.model,'weapon')[0].material.uniforms.uColor.value.equals(snow));
  assert.ok(tints(hero.model,'armor')[0].material.uniforms.uColor.value.equals(snow));

  hero.equipment('sword','warrior',appearance('warrior','citadel'));
  hero.applyEnhancement(9);
  const citadel=new T.Color(GLOW_COLORS.citadel.warrior);
  assert.ok(tints(hero.model,'armor').some(mesh=>mesh.visible&&mesh.material.uniforms.uColor.value.equals(citadel)));
  let lights=0;hero.model.traverse(object=>{if(object instanceof T.Light)lights++;});
  assert.equal(lights,0);
  hero.disposeExtras();
});

test('archer forest gear tints the bow and hood instead of bone inlays',async()=>{
  const base=await load('ashen-archer-equipment-v1.glb'),late=await load('ashen-archer-late-equipment-v1.glb');
  const hero=createAnimatedWarrior(base,'archer',[],late.scene);
  hero.equipment('sword','archer',{weapon:'ranger-bow',armor:'ranger-armor',helmet:'ranger-hood',boots:'ranger-boots',ring:'hawk-ring',amulet:'leaf-amulet'});
  hero.applyEnhancement(5);
  assert.equal(hero.model.getObjectByName('EarlyGlow_weapon_LeftHand'),undefined);
  assert.equal(hero.model.getObjectByName('EarlyGlow_helmet_Head'),undefined);
  const bow=tints(hero.model,'weapon'),hood=tints(hero.model,'helmet');
  assert.ok(bow.length&&hood.length);
  assert.ok(bow.every(mesh=>mesh.visible));
  assert.ok(hood.every(mesh=>mesh.visible));
  assert.equal(bow[0].material.uniforms.uIntensity.value,enhancementGlow(5,'weapon').intensity);
  hero.equipment('sword','archer',{weapon:'sentinel-bow',armor:'sentinel-armor',helmet:'sentinel-hood',boots:'sentinel-boots',ring:'hawk-ring',amulet:'leaf-amulet'});
  hero.applyEnhancement(5);
  assert.ok(tints(hero.model,'helmet').some(mesh=>mesh.visible));
  hero.disposeExtras();
});
