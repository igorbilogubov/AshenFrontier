import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../public/game/vendor/three.module.js';
import {GLTFLoader} from '../public/game/vendor/GLTFLoader.js';
const types=['lynx','yak','frost-spider','ice-golem'],assets={};
const strides={lynx:[.72,1],yak:[.72,1],'frost-spider':[.62,.90],'ice-golem':[.64,.92]};
for(const type of types){
  const bytes=await fs.readFile(new URL(`../public/game/creatures/${type}.glb`,import.meta.url));
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  assets[type]={...asset,bytes,json};
}
function sample(asset,clip){const mixer=new T.AnimationMixer(asset.scene),action=mixer.clipAction(asset.animations.find(a=>a.name===clip)).play();action.paused=true;return t=>{action.time=t*action.getClip().duration;mixer.update(0);asset.scene.updateMatrixWorld(true);};}
function point(asset,name){return asset.scene.getObjectByName(name).getWorldPosition(new T.Vector3());}
test('four original snow GLBs have complete skins, eight clips and bounded draw/asset budgets',()=>{
  for(const type of types){
    const {json,bytes}=assets[type];assert(bytes.length<2*1024*1024,type);
    assert.deepEqual(json.animations.map(a=>a.name),['Idle','Walk','Run','Attack','Hit','Death','Turn_Left','Turn_Right']);
    const ps=json.meshes.flatMap(m=>m.primitives);assert(ps.length<=5,`${type}: draw groups`);
    assert(ps.reduce((n,p)=>n+json.accessors[p.indices].count/3,0)<25000,`${type}: triangle budget`);
    for(const p of ps)for(const key of ['JOINTS_0','WEIGHTS_0','NORMAL','COLOR_0'])assert(p.attributes[key]!==undefined,`${type}: ${key}`);
    assert.equal(json.skins[0].joints.length,type==='frost-spider'?28:type==='ice-golem'?14:24);
  }
});
test('snow locomotion keeps every support foot planted at the renderer stride',()=>{
  for(const type of types)for(const [clip,run] of [['Walk',0],['Run',1]]){
    const asset=assets[type],at=sample(asset,clip),spider=type==='frost-spider',golem=type==='ice-golem';
    const prefixes=spider?Array.from({length:8},(_,i)=>`Leg_${Math.floor(i/2)}_${i%2?'R':'L'}`):golem?['Leg_L','Leg_R']:['Front_L','Front_R','Hind_L','Hind_R'];
    for(const prefix of prefixes){
      const offset=spider?((Number(prefix.split('_')[1])%2)*.5+(prefix.endsWith('R')?.5:0))%1:golem?(prefix.endsWith('R')?.5:0):({Front_L:0,Front_R:.5,Hind_L:run?.5:.25,Hind_R:run?0:.75}[prefix]);
      const points=[];
      for(const phase of [.08,.14,.20,.26,.32]){const t=(phase-offset+1)%1;at(t);const p=point(asset,prefix+'_Paw');p.z+=phase*strides[type][run];points.push(p);}
      for(const axis of ['x','y','z'])assert(Math.max(...points.map(p=>p[axis]))-Math.min(...points.map(p=>p[axis]))<.015,`${type} ${clip} ${prefix}: ${axis} support drift`);
    }
  }
});
test('snow clips stay finite, close locomotion loops and settle at death',()=>{
  for(const type of types){
    const asset=assets[type],all=new T.Box3();
    for(const clip of asset.animations){
      const at=sample(asset,clip.name);
      for(let i=0;i<=24;i++){
        at(i/24);asset.scene.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();assert([...o.boundingBox.min,...o.boundingBox.max].every(Number.isFinite));all.union(o.boundingBox);}});
      }
      if(['Idle','Walk','Run','Turn_Left','Turn_Right'].includes(clip.name)){
        at(0);const start=point(asset,'Head');at(1);assert(start.distanceTo(point(asset,'Head'))<.002,`${type} ${clip.name} loop`);
      }
    }
    assert(all.getSize(new T.Vector3()).length()<4.5,`${type}: stretching`);
    assert(all.min.y>-.03,`${type}: sinks below floor ${all.min.y}`);
    const at=sample(asset,'Death');at(0);const standing=point(asset,'Head').y;at(1);assert(point(asset,'Head').y<standing*.75,`${type}: death must lower head`);
  }
});
