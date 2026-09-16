import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import * as T from '../dist/public/game/vendor/three.module.js';import {GLTFLoader} from '../dist/public/game/vendor/GLTFLoader.js';import {clone} from '../dist/public/game/vendor/SkeletonUtils.js';
import {createAnimatedWarrior} from '../dist/public/game/character.js';import {SKILLS} from '../dist/public/game/skills.js';import {createSkillEffects} from '../dist/public/game/skill-effects.js';import {skillMotionSample} from '../dist/public/game/skill-motion.js';import {BOW_GRIP} from '../dist/public/game/bow-presentation.js';
async function load(name){const bytes=await fs.readFile(new URL('../public/game/characters/'+name,import.meta.url)),loader=new GLTFLoader();loader.register(()=>({name:'NoTextures',loadTexture:()=>Promise.resolve(new T.Texture())}));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
const asset=await load('ashen-archer-equipment-v1.glb'),library=await load('class-combat-v1.glb');
test('thirty-six motion accents have finite continuous endpoints and distinct authored poses',()=>{
 for(const skill of Object.values(SKILLS)){
  let previous;for(let frame=0;frame<=240;frame++){const values=Object.values(skillMotionSample(skill.id,frame/240,skill.hitFraction));assert(values.every(Number.isFinite));if(previous)assert(Math.max(...values.map((v,i)=>Math.abs(v-previous[i])))<.2,skill.id+' discontinuity');if(frame===0||frame===240)assert(values.every(v=>Math.abs(v)<1e-8),skill.id+' terminal offset');previous=values;}
 }
});
test('all archer skills preserve physical grip/string/release and produce different hand poses',()=>{
 const poses=[];
 for(const collection of ['ranger','sentinel'])for(const skill of [null,...Object.values(SKILLS).filter(s=>s.classId==='archer'&&s.kind==='attack')]){
  const character=createAnimatedWarrior({...asset,scene:clone(asset.scene)},'archer',library.animations),left=character.model.getObjectByName('mixamorigLeftHand'),right=character.model.getObjectByName('mixamorigRightHand'),bow=character.model.getObjectByName(collection+'-bow'),arrow=character.model.getObjectByName('Bow_NockedArrow');
  const hero={weapon:'sword',classId:'archer',appearance:{weapon:collection+'-bow'},dead:0,hurt:0,moveBlend:0,runBlend:0,gait:0,attack:null};let previous;
  for(let frame=0;frame<=120;frame++){
   const phase=frame/120,contact=skill?.hitFraction??.49;hero.attack={id:1,age:phase,duration:1,skillId:skill?.id};character.animate(1/120,hero);character.root.updateMatrixWorld(true);
   const grip=bow.localToWorld(new T.Vector3(0,0,12)),palm=left.localToWorld(new T.Vector3(BOW_GRIP.x,BOW_GRIP.y,BOW_GRIP.z)),drawingHand=right.localToWorld(new T.Vector3(0,7,2));assert(grip.distanceTo(palm)<1e-5,skill?.id);
   if(phase<contact){assert(arrow.visible);assert(arrow.localToWorld(new T.Vector3(0,-.5,0)).distanceTo(drawingHand)<1e-6);}else assert(!arrow.visible);
   const hands=[...grip,...drawingHand];assert(hands.every(Number.isFinite));if(previous)assert(Math.max(...hands.map((v,i)=>Math.abs(v-previous[i])))<.25,(skill?.id??'basic')+' hand discontinuity');previous=hands;
   if(collection==='ranger'&&frame===42)poses.push({id:skill?.id??'basic',hands});
   assert.equal(character.model.getObjectByName('Bow_FanArrow_0').visible,skill?.id==='archer-volley'&&phase<contact);
  }
  hero.attack=null;for(let i=0;i<60;i++)character.animate(1/60,hero);assert(!character.model.getObjectByName('Bow_SkillCharge').visible);character.disposeExtras();
 }
 for(let i=0;i<poses.length;i++)for(let j=i+1;j<poses.length;j++)assert(Math.hypot(...poses[i].hands.map((v,k)=>v-poses[j].hands[k]))>.035,poses[i].id+' looks identical to '+poses[j].id);
});
test('impact effects remain pooled, finite and clean up slow markers',()=>{
 const scene=new T.Scene(),effects=createSkillEffects(scene),skills=Object.values(SKILLS);
 for(let i=0;i<1000;i++)effects.impact({skillId:skills[i%skills.length].id,caster:'test',attackId:i,x:2,z:3,yaw:.4,from:{x:-2,z:-3},phase:i%2?'warning':'impact',delay:.45});
 assert.equal(effects.stats().active,32);assert.equal(scene.children.length,32);
 for(let frame=0;frame<120;frame++){effects.update(1/120);scene.traverse(o=>{if(o.geometry?.attributes.position)assert([...o.geometry.attributes.position.array].every(Number.isFinite));});}
 assert.equal(effects.stats().active,0);
 effects.slowMobs([{id:1,x:0,z:0,slow:1,state:'idle'}]);assert.equal(effects.stats().slowRings,1);effects.slowMobs([]);assert.equal(effects.stats().slowRings,0);effects.dispose();assert.equal(scene.children.length,0);
});
test('lightning uses exact authoritative chain endpoints and rain lands when warning expires',()=>{
 const scene=new T.Scene(),effects=createSkillEffects(scene);effects.impact({skillId:'mage-lightning',caster:'test',attackId:4,x:3,z:2,yaw:.8,from:{x:-2,z:-3}});scene.updateMatrixWorld(true);
 const lightning=scene.children.find(o=>o.visible),line=lightning.children.find(o=>o.isLineSegments),points=line.geometry.attributes.position;
 const first=line.localToWorld(new T.Vector3().fromBufferAttribute(points,0)),last=line.localToWorld(new T.Vector3().fromBufferAttribute(points,points.count-1));assert(Math.hypot(first.x+2,first.z+3)<1e-6);assert(Math.hypot(last.x-3,last.z-2)<1e-6);
 effects.impact({skillId:'archer-rain',caster:'test',attackId:5,x:0,z:0,yaw:0,phase:'warning',delay:.45,radius:1.75});effects.update(.449);const rain=scene.children.filter(o=>o.visible).at(-1),arrows=rain.children.find(o=>o.isLineSegments).geometry.attributes.position;assert(arrows.getY(0)<.1,'rain reaches ground at damage time');effects.dispose();
});
test('warrior thrust extends the actual sword forward at authoritative contact and recovers without wrist snap',async()=>{
 const warrior=await load('ashen-warrior-equipment-v1.glb'),character=createAnimatedWarrior(warrior,'warrior',library.animations),skill=SKILLS['warrior-thrust'],hand=character.model.getObjectByName('mixamorigRightHand');
 const hero={weapon:'sword',classId:'warrior',dead:0,hurt:0,moveBlend:0,runBlend:0,gait:0,attack:null};let previous;
 for(let frame=0;frame<=120;frame++){hero.attack={id:1,age:frame/120,duration:1,skillId:skill.id};character.animate(1/120,hero);character.root.updateMatrixWorld(true);const point=hand.getWorldPosition(new T.Vector3());if(previous)assert(point.distanceTo(previous)<.16,'thrust hand snapped');previous=point;}
 for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){character.root.rotation.y=yaw;hero.attack={id:2,age:skill.hitFraction,duration:1,skillId:skill.id};character.animate(1/60,hero);character.root.updateMatrixWorld(true);const blade=new T.Vector3(1,0,0).applyQuaternion(hand.getWorldQuaternion(new T.Quaternion())),forward=new T.Vector3(0,0,1).applyQuaternion(character.root.quaternion);assert(blade.dot(forward)>.999,'thrust blade does not point down the attack lane');}
 hero.attack=null;for(let i=0;i<90;i++)character.animate(1/60,hero);assert(character.weights.Idle>.99);character.disposeExtras();
});

test('persistent server effects and beams are bounded and clear on world changes',async()=>{
 const {createPersistentSkillEffects}=await import('../dist/public/game/persistent-skill-effects.js');const scene=new T.Scene(),effects=createPersistentSkillEffects(scene);
 const zones=Array.from({length:100},(_,i)=>({id:String(i),owner:'hero',skillId:i%2?'mage-mana-source':'archer-trap',x:i,z:0,radius:2,remaining:5}));
 const players=Array.from({length:20},(_,i)=>({id:String(i),x:0,z:i,yaw:0,dead:0,attack:{skillId:'mage-beam',target:{x:3,z:i},targetId:undefined},effects:[]}));
 effects.sync(players,[],zones,1);assert.deepEqual(effects.stats(),{capacity:64,active:64,beamCapacity:12,beams:12});scene.updateMatrixWorld(true);scene.traverse(o=>assert(o.matrixWorld.elements.every(Number.isFinite)));
 effects.clear();assert(scene.children.every(c=>!c.visible));effects.sync([],[],[],2);assert.equal(effects.stats().active,0);effects.dispose();assert.equal(scene.children.length,0);
});
