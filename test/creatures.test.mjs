import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../dist/public/game/vendor/three.module.js';
import {GLTFLoader} from '../dist/public/game/vendor/GLTFLoader.js';
import {createMob,CREATURE_CLIPS,WOLF_CLIPS,BEAR_CLIPS,ATTACK_CONTACT,STRIDES} from '../dist/public/game/mobs.js';
import {MOB_TYPES} from '../dist/public/game/location.js';

const assets={},files={};
// Snow creatures have their own anatomy and contact tests in snow-creatures.test.mjs.
const FOREST_TYPES=['wolf','boar','alpha','bear'];
for(const type of Object.keys(MOB_TYPES)){
  const bytes=await fs.readFile(new URL(`../public/game/creatures/${type}.glb`,import.meta.url));
  const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength));
  if(FOREST_TYPES.includes(type))files[type]={bytes,json,binary:bytes.subarray(28+jsonLength)};
  const loader=new GLTFLoader();
  // Real skin and keyframes; embedded texture decoding is verified in the browser.
  loader.register(()=>({name:'GeometryOnlyTest',loadTexture:()=>Promise.resolve(new T.Texture())}));
  assets[type]=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
function bone(model,name){const b=model.model.getObjectByName(name);assert.ok(b?.isBone,name);return b;}
function point(model,name){model.root.updateMatrixWorld(true);return bone(model,name).getWorldPosition(new T.Vector3());}
function actor(type){return {id:0,type,x:4,z:3,yaw:0,targetYaw:0,state:'idle',hp:MOB_TYPES[type].hp,timer:1,age:0,speed:0,flash:0};}

test('fixed skinned-mesh culling bounds cover every exported animal pose and allow camera rejection',()=>{
  for(const type of Object.keys(MOB_TYPES)){
    const m=createMob(type,assets),range=new T.Box3(),skins=[];
    m.model.traverse(o=>{if(o.isSkinnedMesh)skins.push(o);});
    assert(skins.length>0,`${type}: no skinned meshes`);
    for(const skin of skins){
      assert.equal(skin.frustumCulled,true,`${type}: culling disabled`);
      assert(skin.boundingBox&&!skin.boundingBox.isEmpty(),`${type}: missing fixed box`);
      assert(skin.boundingSphere&&Number.isFinite(skin.boundingSphere.radius),`${type}: missing fixed sphere`);
    }
    for(const name of Object.keys(m.clips)){
      m.previewClip(name);
      for(let frame=0;frame<=24;frame++){
        m.samplePreview(m.clips[name].duration*frame/24);
        for(const skin of skins){
          const fixedBox=skin.boundingBox.clone(),fixedSphere=skin.boundingSphere.clone();
          skin.skeleton.update();skin.computeBoundingBox();const actual=skin.boundingBox.clone();
          assert(fixedBox.containsBox(actual),`${type} ${name} frame ${frame}: pose outside fixed box`);
          for(const x of [actual.min.x,actual.max.x])for(const y of [actual.min.y,actual.max.y])for(const z of [actual.min.z,actual.max.z])
            assert(fixedSphere.containsPoint(new T.Vector3(x,y,z)),`${type} ${name} frame ${frame}: pose outside fixed sphere`);
          range.union(actual);skin.boundingBox=fixedBox;
        }
      }
    }
    if(process.env.MOB_BOUNDS_VERBOSE==='1')console.log('MOB_LOCAL_RANGE',type,[...range.min],[...range.max]);
    const camera=new T.PerspectiveCamera(60,1,.1,50);camera.position.set(0,2,6);camera.lookAt(0,.7,0);camera.updateMatrixWorld(true);
    const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    m.root.position.set(0,0,0);m.root.updateMatrixWorld(true);
    assert(skins.some(skin=>frustum.intersectsObject(skin)),`${type}: visible mob rejected`);
    m.root.position.set(100,0,0);m.root.updateMatrixWorld(true);
    assert(skins.every(skin=>!frustum.intersectsObject(skin)),`${type}: distant mob not rejected`);
  }
});

test('creature assets carry their animations, a complete skin and actual coat colors in COLOR_0',()=>{
  for(const [type,{bytes,json,binary}] of Object.entries(files)){
    assert.equal(json.skins[0].joints.length,24);
    assert.deepEqual(json.animations.map(a=>a.name),type==='wolf'?WOLF_CLIPS:type==='bear'?BEAR_CLIPS:CREATURE_CLIPS);
    assert.ok(bytes.length<2*1024*1024);
    assert.ok(json.images.every(i=>i.bufferView!==undefined&&!i.uri));
    const fur=json.materials.findIndex(m=>m.name==='Layered_Fur');
    const p=json.meshes.flatMap(m=>m.primitives).find(p=>p.material===fur);
    assert.ok(p.attributes.COLOR_0!==undefined);
    const a=json.accessors[p.attributes.COLOR_0],view=json.bufferViews[a.bufferView];
    const offset=(view.byteOffset||0)+(a.byteOffset||0),size=a.componentType===5126?4:a.componentType===5123?2:1;
    const read=a.componentType===5126?'readFloatLE':a.componentType===5123?'readUInt16LE':'readUInt8';
    const colors=Array.from({length:a.count},(_,i)=>binary[read](offset+i*(view.byteStride||size*4)));
    assert.ok(Math.max(...colors)-Math.min(...colors)>1,`${type}: coat was replaced by white`);
    for(const mesh of json.meshes)for(const p of mesh.primitives)for(const attr of ['JOINTS_0','WEIGHTS_0','NORMAL'])assert.ok(p.attributes[attr]!==undefined);
  }
});

test('every animal remains finite through every clip and falls onto its side',()=>{
  for(const type of FOREST_TYPES){
    const m=createMob(type,assets),scale=MOB_TYPES[type].scale;
    for(const name of Object.keys(m.clips)){
      m.previewClip(name);
      for(let i=0;i<=8;i++){
        m.samplePreview(m.clips[name].duration*i/8);
        const bounds=new T.Box3();
        m.model.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();bounds.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));}});
        assert.ok([...bounds.min,...bounds.max].every(Number.isFinite),`${type} ${name}`);
        assert.ok(bounds.getSize(new T.Vector3()).length()<3.8*scale,`${type} ${name} stretched`);
        assert.ok(bounds.min.y>-.18*scale,`${type} ${name} below floor: ${bounds.min.y}`);
      }
    }
    m.previewClip('Death');m.samplePreview(m.clips.Death.duration);
    assert.ok(point(m,'Head').y<.55*scale,`${type}: head did not fall`);
  }
});

test('walk/run support paws hold the ground at the speed used by the renderer',()=>{
  for(const type of FOREST_TYPES)for(const name of ['Walk','Run']){
    const m=createMob(type,assets),cfg=MOB_TYPES[type],stride=STRIDES[type][name==='Walk'?'walk':'run'];
    m.previewClip(name);const points=[];
    for(const phase of [0,.12,.24,.36,.48]){m.samplePreview(m.clips[name].duration*phase);const p=point(m,'Front_L_Paw');p.z+=phase*stride*cfg.scale;points.push(p);}
    assert.ok(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))<.04*cfg.scale,`${type} ${name}: support paw bobs`);
    assert.ok(Math.max(...points.map(p=>p.z))-Math.min(...points.map(p=>p.z))<.04*cfg.scale,`${type} ${name}: support paw slides`);
  }
});

test('refined wolf and bear plant all four paws through a full stride and close their locomotion loops',()=>{
  for(const type of ['wolf','bear']){
    const m=createMob(type,assets),scale=MOB_TYPES[type].scale;
    for(const clip of ['Walk','Run','Turn_Left','Turn_Right']){
      const turn=clip.startsWith('Turn_'),run=clip==='Run',stride=STRIDES[type][run?'run':'walk'];
      const phases={Front_L:0,Front_R:.5,Hind_L:run?.5:.25,Hind_R:run?0:.75};
      m.previewClip(clip);
      for(const [leg,offset] of Object.entries(phases)){
        const name=leg+(leg.startsWith('Front')?'_Paw':'_Toe'),positions=[];
        // Sample a planted interval, including intervals crossing a clip boundary.
        for(let i=0;i<=16;i++){
          const phase=.04+i*.028-offset;
          m.samplePreview(((phase+1)%1)*m.clips[clip].duration);
          const p=point(m,name);
          if(turn)p.applyAxisAngle(new T.Vector3(0,1,0),phase*(clip==='Turn_Left'?1:-1));
          else p.z+=phase*stride*scale;
          positions.push(p);
        }
        const drift=Math.max(...positions.map(p=>p.distanceTo(positions[0])));
        assert.ok(drift<.028*scale,`${clip} ${name} slid ${drift/scale} model units`);
      }
      m.samplePreview(0);const starts={};m.model.traverse(o=>{if(o.isBone)starts[o.name]=point(m,o.name);});
      m.samplePreview(m.clips[clip].duration-.00001);
      for(const [name,start] of Object.entries(starts))assert.ok(start.distanceTo(point(m,name))<.001*scale,`${clip} ${name}: loop snaps`);
    }
  }
});

test('bear keeps the asset budget, lifts its striking paw and lands with a grounded broad silhouette',()=>{
  const {json,bytes}=files.bear,primitives=json.meshes.flatMap(m=>m.primitives);
  assert.ok(primitives.length<=6,'bear exceeds its material draw-call budget');
  assert.ok(primitives.reduce((n,p)=>n+json.accessors[p.indices].count/3,0)<=25000,'bear triangle budget exceeded');
  assert.ok(bytes.length<2*1024*1024,'bear GLB budget exceeded');
  const m=createMob('bear',assets),scale=MOB_TYPES.bear.scale;
  m.previewClip('Idle');m.samplePreview(0);const rest=point(m,'Front_R_Paw');
  m.previewClip('Attack');m.samplePreview(m.clips.Attack.duration*.36);const raised=point(m,'Front_R_Paw');
  assert.ok(raised.y-rest.y>.25*scale,'bear attack lacks a readable lifted paw');
  m.samplePreview(m.clips.Attack.duration*ATTACK_CONTACT);const contact=point(m,'Front_R_Paw');
  assert.ok(contact.z-rest.z>.35*scale,'bear swipe does not reach forward at damage phase');
  m.samplePreview(m.clips.Attack.duration-.00001);
  assert.ok(point(m,'Front_R_Paw').distanceTo(rest)<.002*scale,'bear swipe does not recover its support pose');
  m.previewClip('Death');m.samplePreview(m.clips.Death.duration);
  const box=new T.Box3();m.model.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));}});
  assert.ok(box.min.y>=-.015*scale&&box.min.y<.04*scale,'bear corpse floats or sinks');
});

test('wolf and bear movement and pivot transitions keep poses continuous at 30 and 60 FPS',()=>{
  for(const type of ['wolf','bear']){
    const camera=new T.PerspectiveCamera(),scale=MOB_TYPES[type].scale;
    for(const fps of [30,60]){
      const model=createMob(type,assets),mob=actor(type),tracked=['Head','Front_L_Paw','Front_R_Paw','Hind_L_Toe','Hind_R_Toe'];
      const states=new Set();let previous=null,maxJump=0,maxWalkJump=0;
      for(let frame=0;frame<fps*10;frame++){
        const t=frame/fps;
        mob.speed=t<1?0:t<2?(t-1)*.62:t<4?.62:t<5?.62+(t-4)*1.38:t<6?2:t<7?2*(7-t):0;
        mob.state=t>=4&&t<7?'chase':'idle';mob.z+=mob.speed/fps;
        if(t>=7&&t<9)mob.yaw-=.9/fps;
        model.animate(mob,t,false,camera);states.add(model.state);
        const pose=tracked.map(name=>point(model,name));
        for(const p of pose)assert.ok([...p].every(Number.isFinite));
        for(const p of pose.slice(1))assert.ok(p.y>-.02*scale,'paw penetrated the floor during a transition');
        if(previous)for(let i=0;i<pose.length;i++){
          const jump=pose[i].distanceTo(previous[i]);maxJump=Math.max(maxJump,jump);
          if(t>=1&&t<4)maxWalkJump=Math.max(maxWalkJump,jump);
        }
        assert.ok(Math.abs(Object.values(model.weights).reduce((a,b)=>a+b,0)-1)<1e-6,'blend lost its base pose');
        previous=pose;
      }
      // Returning paws move faster than the body, especially during the trot.
      assert.ok(maxJump<8*scale/fps,`${fps} FPS: pose jumps ${maxJump/scale}`);
      assert.ok(maxWalkJump<3.5*scale/fps,`${fps} FPS: walk pose jumps ${maxWalkJump/scale}`);
      for(const state of ['Idle','Walk','Run','Turn_Right'])assert.ok(states.has(state),`missing ${state}`);
      assert.ok(model.weights.Idle>.99,`${type} did not settle after the turn`);
    }
  }
});

test('cloned mobs animate independently; warning, contact, corpse hiding and respawn stay synchronized',()=>{
  const camera=new T.PerspectiveCamera();
  for(const type of FOREST_TYPES){
    const a=createMob(type,assets),b=createMob(type,assets),mob=actor(type),cfg=MOB_TYPES[type];
    const unchanged=point(b,'Head').clone();
    assert.notEqual(bone(a,'Head'),bone(b,'Head'));
    mob.state='windup';mob.timer=cfg.windup*.5;a.animate(mob,1,true,camera);
    assert.equal(a.warning.visible,true);assert.equal(a.selection.visible,true);
    assert.ok(Math.abs(a.attackTime/a.clips.Attack.duration-ATTACK_CONTACT*.5)<1e-6);
    mob.state='recover';mob.age=0;a.animate(mob,1.02,true,camera);
    assert.equal(a.warning.visible,false);assert.ok(Math.abs(a.attackTime/a.clips.Attack.duration-ATTACK_CONTACT)<1e-6);
    mob.state='dead';mob.age=2.1;mob.hp=0;a.animate(mob,3,false,camera);
    assert.equal(a.model.visible,false);assert.equal(a.health.visible,false);
    assert.ok(point(b,'Head').distanceTo(unchanged)<1e-8,'another mob inherited the death pose');
    mob.state='idle';mob.age=0;mob.hp=cfg.hp;a.animate(mob,3.1,false,camera);
    assert.equal(a.model.visible,true);assert.equal(a.state,'Idle');assert.ok(a.weights.Idle>.99);
    assert.ok(point(a,'Head').y>.65*cfg.scale);
  }
});
