import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../dist/public/game/vendor/three.module.js';
import {GLTFLoader} from '../dist/public/game/vendor/GLTFLoader.js';
import {createAnimatedWarrior,CLIP_NAMES} from '../dist/public/game/character.js';
import {REGIONAL_COLLECTIONS,REGIONAL_ITEMS} from '../dist/public/game/regional-equipment.js';
import {rollEquipment,equipmentAppearance,regionalEquipment} from '../dist/public/game/equipment-items.js';
import {itemArtKey} from '../dist/public/game/item-icons.js';
const regions=['swamp','mines','rift','citadel'];
async function load(name){const bytes=await fs.readFile(new URL('../public/game/characters/'+name,import.meta.url));const loader=new GLTFLoader();loader.register(()=>({name:'NoTextures',loadTexture:()=>Promise.resolve(new T.Texture())}));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
function appearance(cls,region){return Object.fromEntries(REGIONAL_ITEMS[region][cls].map(d=>[d.slot,d.appearance]));}
function visible(o){for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;}
function bounds(o){const box=new T.Box3(),v=new T.Vector3();o.traverse(mesh=>{if(!(mesh instanceof T.Mesh)||!visible(mesh))return;if(mesh instanceof T.SkinnedMesh)mesh.skeleton.update();const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);assert.ok(Number.isFinite(v.x+v.y+v.z),'nonfinite skinned point');box.expandByPoint(v);}});return box;}
test('late modular GLBs share only original actor bones and animate without exploding or detached feet',async()=>{
 for(const cls of ['warrior','archer','mage']){
  const base=await load(`ashen-${cls}-equipment-v1.glb`),late=await load(`ashen-${cls}-late-equipment-v1.glb`);assert.equal(late.animations.length,0);
  const hero=createAnimatedWarrior(base,cls,[],late.scene);const bones=[];hero.model.traverse(o=>{if(o instanceof T.Bone)bones.push(o);});assert.equal(bones.length,67,'no second skeleton');
  for(const region of regions){hero.equipment('sword',cls,appearance(cls,region));
   for(const clip of CLIP_NAMES){hero.previewClip(clip);for(const phase of [0,.25,.5,.75,1]){hero.samplePreview(hero.clips[clip].duration*phase);hero.root.updateMatrixWorld(true);const b=bounds(hero.model);assert.ok(b.max.y<3.5&&b.min.y>-.75,`${cls} ${region} ${clip}: y=${b.min.y}..${b.max.y}`);assert.ok(b.max.x-b.min.x<5&&b.max.z-b.min.z<5,`${cls} ${region} detached mesh`);}}
  }
  hero.disposeExtras();
 }
});
test('late sets have different geometry silhouettes and glow is per instance, clamped, and uses no lights',async()=>{
 const base=await load('ashen-warrior-equipment-v1.glb'),late=await load('ashen-warrior-late-equipment-v1.glb');const hero=createAnimatedWarrior(base,'warrior',[],late.scene);
 const counts=[];for(const region of regions){const part=hero.model.getObjectByName(REGIONAL_COLLECTIONS[region].warrior[0]+'-armor');assert.ok(part);let count=0;part.traverse(o=>{if(o instanceof T.Mesh)count+=o.geometry.attributes.position.count;});counts.push(count);}assert.equal(new Set(counts).size,4);
 const material=[];hero.model.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name==='dreadsovereign_Glow')material.push(m);});assert.ok(material.length);
 hero.equipment('sword','warrior',appearance('warrior','citadel'));
 const armor=hero.model.getObjectByName('dreadsovereign-armor');
 const cloth=[];armor.traverse(o=>{if(o instanceof T.Mesh&&!String(o.name).startsWith('EnhanceTint'))for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof T.MeshStandardMaterial)cloth.push(m);});
 const before=cloth.map(m=>[m.emissiveIntensity,m.color.getHex()]);
 assert.equal(hero.applyEnhancement(99),9);
 const citadelTints=[];hero.model.traverse(o=>{if(o.name==='EnhanceTint_armor')citadelTints.push(o);});
 assert.ok(citadelTints.length);assert.ok(citadelTints[0].material.uniforms.uIntensity.value>0.2);assert.ok(citadelTints[0].material.uniforms.uIntensity.value<0.35);
 assert.deepEqual(cloth.map(m=>[m.emissiveIntensity,m.color.getHex()]),before);
 assert.equal(hero.applyEnhancement(-1),0);assert.equal(citadelTints[0].material.uniforms.uIntensity.value,0);assert.equal(hero.applyEnhancement(NaN),0);
 const worn=hero.model.getObjectByName('dreadsovereign-armor');assert.equal(worn.visible,true);hero.equipment('sword','warrior',{});assert.equal(worn.visible,false);
 let lights=0;hero.model.traverse(o=>{if(o instanceof T.Light)lights++;});assert.equal(lights,0);hero.disposeExtras();
});
test('late rarity variants share the exact authored slot thumbnail',async()=>{
 for(const region of regions)for(const cls of ['warrior','archer','mage'])for(const quality of [1,2,3,4])for(const d of regionalEquipment(cls,region,quality)){
  const key=itemArtKey(rollEquipment(d.id,'icon',()=>.5));assert.equal(key,d.appearance+'-v1');const bytes=await fs.readFile(new URL('../public/game/item-icons/'+key+'.png',import.meta.url));assert.equal(bytes.readUInt32BE(16),256);assert.equal(bytes.readUInt32BE(20),256);
 }
});
test('all four authored bows keep the palm grip and both string tips throughout drawing and release',async()=>{
 const base=await load('ashen-archer-equipment-v1.glb'),late=await load('ashen-archer-late-equipment-v1.glb'),library=await load('class-combat-v1.glb');const character=createAnimatedWarrior(base,'archer',library.animations,late.scene);
 const left=character.model.getObjectByName('mixamorigLeftHand'),right=character.model.getObjectByName('mixamorigRightHand');
 const hero={weapon:'sword',classId:'archer',dead:0,hurt:0,attack:null,moveBlend:0,runBlend:0,gait:0};
 for(const region of regions){hero.appearance=appearance('archer',region);const bow=character.model.getObjectByName(hero.appearance.weapon);
  for(let frame=0;frame<=60;frame++){
   hero.attack={id:1,age:frame/60,duration:1,skillId:'archer-aimed'};character.animate(1/60,hero);character.root.updateMatrixWorld(true);
   const grip=bow.localToWorld(new T.Vector3(0,0,12)),palm=left.localToWorld(new T.Vector3(0,7,2));assert.ok(grip.distanceTo(palm)<1e-5);
   const string=character.model.getObjectByName('Bow_DynamicString');assert.equal(string.visible,true);
   for(const [i,sign] of [[0,-1],[2,1]]){const tip=bow.localToWorld(new T.Vector3(sign*bow.userData.bowLength,0,-8)),actual=string.localToWorld(new T.Vector3().fromBufferAttribute(string.geometry.attributes.position,i));assert.ok(tip.distanceTo(actual)<1e-6);}
  }
 }
 character.disposeExtras();
});
