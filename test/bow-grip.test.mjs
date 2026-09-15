import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import * as T from '../dist/public/game/vendor/three.module.js';import {GLTFLoader} from '../dist/public/game/vendor/GLTFLoader.js';import {clone} from '../dist/public/game/vendor/SkeletonUtils.js';
import {createAnimatedWarrior} from '../dist/public/game/character.js';import {BOW_GRIP} from '../dist/public/game/bow-presentation.js';
async function load(name){const bytes=await fs.readFile(new URL('../public/game/characters/'+name,import.meta.url));const loader=new GLTFLoader();loader.register(()=>({name:'NoTextures',loadTexture:()=>Promise.resolve(new T.Texture())}));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
const asset=await load('ashen-archer-equipment-v1.glb'),library=await load('class-combat-v1.glb');
const fixture=()=>createAnimatedWarrior({...asset,scene:clone(asset.scene)},'archer',library.animations);
const sourceGrip=new T.Vector3(0,0,12),up=new T.Vector3(0,1,0);

test('both exported bows stay centred in the animated palm through idle, locomotion, draw and release',()=>{
  const character=fixture(),left=character.model.getObjectByName('mixamorigLeftHand'),right=character.model.getObjectByName('mixamorigRightHand');
  const hero={weapon:'sword',classId:'archer',dead:0,hurt:0,attack:null,moveBlend:0,runBlend:0,gait:0};
  for(const collection of ['ranger','sentinel']){
    hero.appearance={weapon:collection+'-bow'};
    const bow=character.model.getObjectByName(collection+'-bow'),length=collection==='sentinel'?62:55;
    const metal=bow.children.find(o=>o.isMesh&&o.material.name==='archer_BrushedMetal'),vertices=metal.geometry.attributes.position,actualGrip=new T.Vector3();let gripVertices=0;
    for(let i=0;i<vertices.count;i++)if(Math.abs(Math.abs(vertices.getX(i))-8)<.001){actualGrip.add(new T.Vector3().fromBufferAttribute(vertices,i));gripVertices++;}
    assert(gripVertices>=24,'exported reinforced grip has no measurable surface');actualGrip.divideScalar(gripVertices);
    assert(actualGrip.distanceTo(sourceGrip)<.001,'exported grip differs from authored socket reference');
    for(const mode of ['Idle','Walk','Run','Attack'])for(let frame=0;frame<90;frame++){
      hero.moveBlend=mode==='Walk'||mode==='Run'?1:0;hero.runBlend=mode==='Run'?1:0;hero.gait=frame*.11;
      hero.attack=mode==='Attack'?{id:1,age:frame/90,duration:1}:null;
      character.animate(1/60,hero);character.root.updateMatrixWorld(true);
      const grip=bow.localToWorld(actualGrip.clone()),palm=left.localToWorld(new T.Vector3(BOW_GRIP.x,BOW_GRIP.y,BOW_GRIP.z));
      assert(grip.distanceTo(palm)<1e-5,`${collection} ${mode}: detached grip`);
      const string=character.model.getObjectByName('Bow_DynamicString'),positions=string.geometry.attributes.position;
      for(const [i,x] of [[0,-length],[2,length]]){
        const expected=bow.localToWorld(new T.Vector3(x,0,-8)),actual=string.localToWorld(new T.Vector3().fromBufferAttribute(positions,i));
        assert(expected.distanceTo(actual)<1e-6,`${collection} ${mode}: detached string end`);
      }
      const arrow=character.model.getObjectByName('Bow_NockedArrow');
      if(hero.attack&&hero.attack.age<.49){
        assert(arrow.visible);const nock=right.localToWorld(new T.Vector3(0,7,2)),actual=string.localToWorld(new T.Vector3().fromBufferAttribute(positions,1));assert(nock.distanceTo(actual)<1e-6);
        const direction=up.clone().applyQuaternion(arrow.getWorldQuaternion(new T.Quaternion())),towardGrip=grip.clone().sub(nock).normalize();assert(direction.dot(towardGrip)>.99999,'arrow points away from the bow');
        const tail=arrow.localToWorld(new T.Vector3(0,-.5,0));assert(tail.distanceTo(nock)<1e-6,'arrow floats ahead of drawing fingers');
        if(frame>15){const mid=bow.localToWorld(new T.Vector3(0,0,-8));assert(mid.sub(grip).dot(nock.clone().sub(grip))>0,'string faces away from drawing hand');}
      }else assert(!arrow.visible,'arrow remains after release');
    }
  }
  hero.attack=null;hero.appearance={weapon:null};character.animate(1/60,hero);assert(!character.model.getObjectByName('Bow_DynamicString').visible);assert(!character.model.getObjectByName('Bow_NockedArrow').visible);character.disposeExtras();
});

test('runtime socket conversion keeps cached GLB vertices, skeleton and other clones unchanged',()=>{
  const source=asset.scene.getObjectByName('ranger-bow'),before=[];source.traverse(o=>{if(o.isSkinnedMesh)before.push(...o.geometry.attributes.position.array);});
  const first=fixture(),second=fixture();first.animate(1/60,{weapon:'sword',classId:'archer',dead:0,hurt:0,attack:{id:1,age:.35,duration:1},moveBlend:0,runBlend:0,gait:0});
  const after=[];source.traverse(o=>{if(o.isSkinnedMesh)after.push(...o.geometry.attributes.position.array);});assert.deepEqual(after,before);
  assert.notEqual(first.model.getObjectByName('ranger-bow').children[0].geometry,second.model.getObjectByName('ranger-bow').children[0].geometry);
  assert(Math.abs(second.model.getObjectByName('ranger-bow').rotation.x)<1e-10);
  first.disposeExtras();second.disposeExtras();
});
