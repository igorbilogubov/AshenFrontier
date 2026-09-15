import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../dist/public/game/vendor/three.module.js';
import {GLTFLoader} from '../dist/public/game/vendor/GLTFLoader.js';
import {clone} from '../dist/public/game/vendor/SkeletonUtils.js';
import {createAnimatedWarrior,CLIP_NAMES,CHARACTER_URLS} from '../dist/public/game/character.js';

async function load(filename){
  const bytes=await fs.readFile(new URL('../public/game/characters/'+filename,import.meta.url));
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  const loader=new GLTFLoader();loader.register(()=>({name:'GeometryOnlyClassTest',loadTexture:()=>Promise.resolve(new T.Texture())}));
  return {json,bytes,asset:await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')};
}
for(const classId of ['archer','mage'])test(classId+' has its own textured body, compatible scale and independent animation palette',async()=>{
  const {asset,json,bytes}=await load('ashen-'+classId+'-v1.glb');
  assert(bytes.length<5*1024*1024);assert.equal(json.skins.length,1);assert.equal(json.skins[0].joints.length,67);
  assert(json.images.length>=2);assert.deepEqual(json.animations.map(a=>a.name),CLIP_NAMES);
  assert.notEqual(CHARACTER_URLS[classId],CHARACTER_URLS.warrior);
  const a=createAnimatedWarrior({...asset,scene:clone(asset.scene)},classId),b=createAnimatedWarrior({...asset,scene:clone(asset.scene)},classId);
  const skins=[];a.model.traverse(o=>{if(o.isSkinnedMesh)skins.push(o);});assert.equal(new Set(skins.map(o=>o.skeleton)).size,1);
  assert.notEqual(skins[0].skeleton,b.model.getObjectByName(skins[0].name).skeleton);
  assert(a.model.getObjectByName('Class_Body'));assert(!a.model.getObjectByName('Armor_Body'));
  assert.equal(a.model.getObjectByName('Weapon_Sword').visible,false);assert.equal(a.model.getObjectByName('Weapon_Buckler').visible,false);
  for(const clip of CLIP_NAMES){a.previewClip(clip);for(let frame=0;frame<=8;frame++){
    a.samplePreview(a.clips[clip].duration*frame/8);a.root.updateMatrixWorld(true);
    const box=new T.Box3();a.model.traverseVisible(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));}});
    const size=box.getSize(new T.Vector3());assert([...box.min,...box.max].every(Number.isFinite));assert(size.length()<4.5,classId+' '+clip+' distorted geometry');
    if(clip==='Idle')assert(size.y>1.5&&size.y<2.5,classId+' scale differs from the world');
  }}
});
test('modular update preserves the heavy armor geometry and replaces the primitive base with textured Exo Gray',async()=>{
  const old=await load('ashen-warrior-v1.glb'),next=await load('ashen-warrior-equipment-v1.glb');
  for(const name of ['Armor_Body','Helmet','Boots']){
    const before=[],after=[];old.asset.scene.getObjectByName(name).traverse(o=>{if(o.isMesh)before.push(...o.geometry.attributes.position.array);});
    next.asset.scene.getObjectByName(name).traverse(o=>{if(o.isMesh)after.push(...o.geometry.attributes.position.array);});assert.deepEqual(after,before,name+' changed');
  }
  const base=next.json.nodes.find(n=>n.name==='Base_Head');assert(base);assert(next.json.meshes[base.mesh].primitives.some(p=>p.attributes.TEXCOORD_0!==undefined));
  const a=createAnimatedWarrior({...next.asset,scene:clone(next.asset.scene)});a.equipment('sword','warrior',{helmet:'wanderer-hood'});
  assert(a.model.getObjectByName('Base_Head').visible,'face remains inside the cloth hood');
});
