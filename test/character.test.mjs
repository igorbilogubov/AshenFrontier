import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../dist/public/game/vendor/three.module.js';
import {GLTFLoader} from '../dist/public/game/vendor/GLTFLoader.js';
import {CLIP_NAMES,createAnimatedWarrior} from '../dist/public/game/character.js';

const bytes=await fs.readFile(new URL('../public/game/characters/ashen-warrior-v1.glb',import.meta.url));
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const report=JSON.parse(await fs.readFile(new URL('../art/characters/ashen-warrior-v1/build-report.json',import.meta.url),'utf8'));
async function character(){
  const loader=new GLTFLoader();
  // Node checks the real exported skin/animation data. Texture decoding is checked in WebGL.
  loader.register(()=>({name:'GeometryOnlyTest',loadTexture:()=>Promise.resolve(new T.Texture())}));
  return createAnimatedWarrior(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''));
}
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
