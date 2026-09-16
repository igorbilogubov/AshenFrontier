import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import * as T from '../public/game/vendor/three.module.js';import {GLTFLoader} from '../public/game/vendor/GLTFLoader.js';
import {LATE_MOB_TYPES} from '../dist/public/game/late-world.js';import {LATE_CREATURE_BOUNDS,LATE_CREATURE_STRIDES} from '../dist/public/game/late-creatures.js';
const types=Object.keys(LATE_MOB_TYPES),assets={};
for(const type of types){const bytes=await fs.readFile(new URL(`../public/game/creatures/${type}.glb`,import.meta.url)),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))),report=JSON.parse(await fs.readFile(new URL(`../art/creatures/late-world-v1/${type}-report.json`,import.meta.url)));assets[type]={...await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),''),bytes,json,report};}
function sampler(asset,clip){const mixer=new T.AnimationMixer(asset.scene),action=mixer.clipAction(asset.animations.find(a=>a.name===clip)).play();action.paused=true;return t=>{action.time=t*action.getClip().duration;mixer.update(0);asset.scene.updateMatrixWorld(true);};}
const point=(a,n)=>a.scene.getObjectByName(n).getWorldPosition(new T.Vector3());
test('sixteen authored GLBs retain weighted skins, eight clips and bounded materials/triangles',()=>{
 assert.equal(types.length,16);
 for(const type of types){const a=assets[type],p=a.json.meshes.flatMap(m=>m.primitives);assert(a.bytes.length<1_000_000,type);assert(p.length<=4,type);assert.equal(a.report.unweighted,0);assert(p.reduce((n,p)=>n+a.json.accessors[p.indices].count/3,0)<16000,type);assert.deepEqual(a.animations.map(c=>c.name),['Idle','Walk','Run','Attack','Hit','Death','Turn_Left','Turn_Right']);for(const primitive of p)for(const key of ['JOINTS_0','WEIGHTS_0','NORMAL','COLOR_0'])assert(primitive.attributes[key]!==undefined,`${type} ${key}`);assert.deepEqual(a.report.strides,LATE_CREATURE_STRIDES[type]);}
});
test('grounded late creatures keep support feet planted at the shipped distance strides',()=>{
 for(const type of types.filter(t=>!['plague-mosquito','cave-bat','lava-elemental'].includes(t)))for(const [clip,run]of [['Walk',0],['Run',1]]){const a=assets[type],at=sampler(a,clip),prefixes=[];a.scene.traverse(o=>{if(o.isBone&&o.name.endsWith('_Upper'))prefixes.push(o.name.slice(0,-6));});assert(prefixes.length>=2,type);
  for(const prefix of prefixes){let offset;if(prefix.startsWith('Front_')||prefix.startsWith('Hind_'))offset={Front_L:0,Front_R:.5,Hind_L:run?.5:.25,Hind_R:run?0:.75}[prefix];else {const i=Number(prefix.split('_')[1]);offset=(Number.isFinite(i)?i%2*.5:0)+(prefix.endsWith('R')?.5:0);}const points=[];for(const phase of [.08,.14,.20,.26,.32]){at((phase-offset+2)%1);const p=point(a,prefix+'_Paw');p.z+=phase*LATE_CREATURE_STRIDES[type][run?'run':'walk'];points.push(p);}for(const axis of ['x','y','z'])assert(Math.max(...points.map(p=>p[axis]))-Math.min(...points.map(p=>p[axis]))<.016,`${type} ${clip} ${prefix} ${axis}`);}
 }
});
test('all late creature animation phases remain inside measured culling boxes and above the floor',()=>{
 for(const type of types){const a=assets[type],all=new T.Box3(),bound=LATE_CREATURE_BOUNDS[type],cull=new T.Box3(new T.Vector3(...bound.min),new T.Vector3(...bound.max));
  for(const clip of a.animations){const at=sampler(a,clip.name);for(let i=0;i<=24;i++){at(i/24);a.scene.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();assert([...o.boundingBox.min,...o.boundingBox.max].every(Number.isFinite),type);assert(cull.containsBox(o.boundingBox),`${type} ${clip.name} frame${i} culling`);all.union(o.boundingBox);}});}if(['Idle','Walk','Run','Turn_Left','Turn_Right'].includes(clip.name)){at(0);const head=point(a,'Head');at(1);assert(head.distanceTo(point(a,'Head'))<.003,`${type} loop`);}}
  assert(all.min.y>-.03,`${type} floor ${all.min.y}`);assert(Math.max(...all.getSize(new T.Vector3()))<5,type);const at=sampler(a,'Death');at(0);const height=point(a,'Head').y;at(1);assert(point(a,'Head').y<height*.8,`${type} death head`);
 }
});
test('flying creatures and gargoyle wings flap independently of rooted locomotion',()=>{
 for(const type of ['plague-mosquito','cave-bat','gargoyle']){const a=assets[type],at=sampler(a,'Idle');at(0);const q=a.scene.getObjectByName('Wing_L').quaternion.clone();at(.125);assert(q.angleTo(a.scene.getObjectByName('Wing_L').quaternion)>.03,`${type} wing frozen`);}
});
