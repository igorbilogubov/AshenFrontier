import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../dist/public/game/vendor/three.module.js';
import {GLTFLoader} from '../dist/public/game/vendor/GLTFLoader.js';
import {clone} from '../dist/public/game/vendor/SkeletonUtils.js';
import {CLIP_NAMES,createAnimatedWarrior} from '../dist/public/game/character.js';

const bytes=await fs.readFile(new URL('../public/game/characters/ashen-warrior-v1.glb',import.meta.url));
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const report=JSON.parse(await fs.readFile(new URL('../art/characters/ashen-warrior-v1/build-report.json',import.meta.url),'utf8'));
async function characterAsset(){
  const loader=new GLTFLoader();
  // Node checks the real exported skin/animation data. Texture decoding is checked in WebGL.
  loader.register(()=>({name:'GeometryOnlyTest',loadTexture:()=>Promise.resolve(new T.Texture())}));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
async function character(){return createAnimatedWarrior(await characterAsset());}
function skinnedMeshes(model){const meshes=[];model.traverse(object=>{if(object.isSkinnedMesh)meshes.push(object);});return meshes;}
function bone(model,tail){let found;model.traverse(o=>{if(o.isBone&&o.name.endsWith(tail))found=o;});assert.ok(found,tail);return found;}
function point(model,tail){model.updateMatrixWorld(true);return bone(model,tail).getWorldPosition(new T.Vector3());}

test('warrior GLB includes seven distinct clips, embedded textures and a fully weighted skin',()=>{
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  assert.deepEqual(json.animations.map(a=>a.name),CLIP_NAMES);
  assert.equal(json.skins[0].joints.length,67);
  assert.ok(bytes.length<6*1024*1024);
  assert.ok(json.images.length>=2);
  assert.ok(json.images.every(i=>i.bufferView!==undefined&&!i.uri));
  assert.ok(json.buffers.every(b=>!b.uri));
  for(const mesh of json.meshes)for(const primitive of mesh.primitives){
    for(const name of ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0'])assert.ok(primitive.attributes[name]!==undefined,`${mesh.name}: ${name}`);
  }
  assert.ok(report.meshes.every(m=>m.unweighted===0));
});

test('every exported pose stays finite and rooted; locomotion loops close and death stays on the ground',async()=>{
  const w=await character();
  for(const name of CLIP_NAMES){
    w.previewClip(name);
    for(let i=0;i<=12;i++){
      w.samplePreview(w.clips[name].duration*i/12);
      const hips=point(w.root,'Hips');
      assert.ok(Math.abs(hips.x)<.02&&Math.abs(hips.z)<.02,`${name} has planar root drift`);
      const bounds=new T.Box3();
      w.model.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();bounds.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));}});
      assert.ok([...bounds.min,...bounds.max].every(Number.isFinite),name);
      assert.ok(bounds.getSize(new T.Vector3()).length()<5,`${name} exploded skin`);
      assert.ok(bounds.min.y>-.3,`${name} sinks below the floor`);
    }
  }
  for(const name of ['Idle','Walk','Run']){
    w.previewClip(name);w.samplePreview(0);const start=point(w.root,'RightFoot');
    w.samplePreview(w.clips[name].duration-.00001);
    assert.ok(start.distanceTo(point(w.root,'RightFoot'))<.07,`${name} loop discontinuity`);
  }
  w.previewClip('Death');w.samplePreview(w.clips.Death.duration);
  assert.ok(point(w.root,'Head').y<.3);
});

test('movement blends, attack variants, equipment switch and respawn use the actual exported rig',async()=>{
  const w=await character(),hero={weapon:'sword',dead:0,hurt:0,attack:null,moveBlend:0,runBlend:0,gait:0};
  const advance=(frames=60)=>{for(let i=0;i<frames;i++){hero.gait+=.1;w.animate(1/60,hero);}};
  advance();assert.equal(w.state,'Idle');
  hero.moveBlend=1;advance();assert.ok(w.weights.Walk>.99);
  hero.runBlend=1;advance();assert.ok(w.weights.Run>.99);
  hero.attack={age:.3,duration:.64};advance(1);assert.equal(w.state,'Attack_Sword_1');
  hero.attack=null;advance(10);hero.attack={age:.3,duration:.64};advance(1);assert.equal(w.state,'Attack_Sword_2');
  hero.attack=null;hero.weapon='axe';advance(10);
  assert.equal(w.model.getObjectByName('Weapon_Axe').visible,true);
  assert.equal(w.model.getObjectByName('Weapon_Sword').visible,false);
  hero.dead=2.5;advance(150);assert.ok(point(w.root,'Head').y<.3);
  hero.dead=0;hero.moveBlend=0;hero.runBlend=0;advance();
  assert.equal(w.state,'Idle');assert.ok(w.weights.Idle>.999);assert.ok(point(w.root,'Head').y>1.4);
  assert.ok(Math.abs(Object.values(w.weights).reduce((a,b)=>a+b,0)-1)<.00001);
});


test('cloned warrior shares one bone palette without changing skinning or per-character animation',async()=>{
  const asset=await characterAsset(),model=clone(asset.scene),otherModel=clone(asset.scene);
  const meshes=skinnedMeshes(model);
  assert.equal(meshes.length,14,'the real GLB is split into fourteen skinned primitives');
  assert.equal(new Set(meshes.map(mesh=>mesh.skeleton)).size,14,'exercise SkeletonUtils clone duplication');
  const original=new Map(meshes.map(mesh=>[mesh,{
    skeleton:mesh.skeleton,geometry:mesh.geometry,bindMatrix:mesh.bindMatrix.clone(),
    inverses:mesh.skeleton.boneInverses.map(matrix=>matrix.clone()),
  }]));
  const warrior=createAnimatedWarrior({...asset,scene:model});
  const other=createAnimatedWarrior({...asset,scene:otherModel});
  const palette=meshes[0].skeleton,otherPalette=skinnedMeshes(other.model)[0].skeleton;
  assert.equal(new Set(meshes.map(mesh=>mesh.skeleton)).size,1);
  assert.notEqual(palette,otherPalette);
  assert.ok(palette.bones.every((bone,i)=>bone!==otherPalette.bones[i]),'characters never share mutable bones');
  for(const mesh of meshes){
    const before=original.get(mesh);
    assert.equal(mesh.geometry,before.geometry,'geometry is reused unchanged');
    assert.ok(mesh.bindMatrix.equals(before.bindMatrix),'mesh bind matrix is preserved');
    assert.ok(palette.boneInverses.every((matrix,i)=>matrix.equals(before.inverses[i])));
  }
  // Match the original independently cloned palettes at several deformed poses,
  // rather than merely checking that the optimization reduced object count.
  for(const clip of CLIP_NAMES){
    warrior.previewClip(clip);
    for(const phase of [.2,.65,.99]){
      warrior.samplePreview(warrior.clips[clip].duration*phase);warrior.root.updateMatrixWorld(true);palette.update();
      for(const mesh of meshes){
        const before=original.get(mesh).skeleton;before.update();
        const count=mesh.geometry.attributes.position.count;
        for(const index of [0,Math.floor(count/2),count-1]){
          const shared=mesh.getVertexPosition(index,new T.Vector3());
          mesh.skeleton=before;const separate=mesh.getVertexPosition(index,new T.Vector3());mesh.skeleton=palette;
          assert.ok(shared.distanceTo(separate)<1e-9,`${clip}: palette sharing changed ${mesh.name}`);
        }
      }
    }
  }
  other.previewClip('Idle');other.samplePreview(.3);
  const otherHand=point(other.root,'RightHand');
  warrior.previewClip('Attack_Sword_1');warrior.samplePreview(warrior.clips.Attack_Sword_1.duration*.5);
  assert.ok(point(other.root,'RightHand').distanceTo(otherHand)<1e-12,'animating one character leaves another unchanged');
  palette.computeBoneTexture();otherPalette.computeBoneTexture();
  assert.equal(new Set(meshes.map(mesh=>mesh.skeleton.boneTexture)).size,1,'one GPU bone texture per character');
  assert.notEqual(palette.boneTexture,otherPalette.boneTexture,'characters never share GPU bone palettes');
  palette.dispose();otherPalette.dispose();
});


test('palette sharing keeps different inverse bind matrices separate',async()=>{
  const asset=await characterAsset(),model=clone(asset.scene),meshes=skinnedMeshes(model);
  const different=meshes[1];
  different.skeleton.boneInverses=different.skeleton.boneInverses.map(matrix=>matrix.clone());
  different.skeleton.boneInverses[0].elements[12]+=.125;
  const warrior=createAnimatedWarrior({...asset,scene:model});
  assert.equal(new Set(skinnedMeshes(warrior.model).map(mesh=>mesh.skeleton)).size,2);
  assert.notEqual(different.skeleton,meshes[0].skeleton,'equal Bone references alone are insufficient');
});
