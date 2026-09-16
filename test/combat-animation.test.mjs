import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import * as T from '../dist/public/game/vendor/three.module.js';import {GLTFLoader} from '../dist/public/game/vendor/GLTFLoader.js';
import {createAnimatedWarrior} from '../dist/public/game/character.js';import {SKILLS} from '../dist/public/game/skills.js';
async function load(name){const bytes=await fs.readFile(new URL('../public/game/characters/'+name,import.meta.url));const loader=new GLTFLoader();loader.register(()=>({name:'NoTextures',loadTexture:()=>Promise.resolve(new T.Texture())}));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
const library=await load('class-combat-v1.glb');
test('all thirty-six skill phases deform their actual equipped model without exploding or root drift',async()=>{
 assert.equal(Object.keys(SKILLS).length,36);
 assert.deepEqual(library.animations.map(c=>c.name).sort(),['Bow_Draw','Bow_Recoil','Mage_Cast','Mage_Pulse']);
 for(const classId of ['warrior','archer','mage']){
  const model=createAnimatedWarrior(await load(`ashen-${classId}-equipment-v1.glb`),classId,library.animations);
  const hero={weapon:'sword',classId,dead:0,hurt:0,attack:null,moveBlend:0,runBlend:0,gait:0};
  for(const skill of Object.values(SKILLS).filter(s=>s.classId===classId)){
   for(let frame=0;frame<=60;frame++){
    hero.attack={id:1,age:frame/60,duration:1,skillId:skill.id};model.animate(1/60,hero);model.root.updateMatrixWorld(true);
    const hips=model.model.getObjectByName('mixamorigHips').getWorldPosition(new T.Vector3());assert.ok(Math.hypot(hips.x,hips.z)<.025,`${skill.id}: planar drift`);
    const bounds=new T.Box3();model.model.traverse(o=>{if(o.isSkinnedMesh&&o.visible){o.skeleton.update();o.computeBoundingBox();bounds.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));}});
    assert.ok([...bounds.min,...bounds.max].every(Number.isFinite),skill.id);assert.ok(bounds.getSize(new T.Vector3()).length()<5,`${skill.id}: exploded skin`);assert.ok(bounds.min.y>-.35,`${skill.id}: sinks`);
   }
   hero.attack=null;for(let i=0;i<60;i++)model.animate(1/60,hero);assert.ok(Math.abs(model.model.rotation.y)<1e-8);
  }
  hero.dead=1;for(let i=0;i<60;i++)model.animate(1/60,hero);hero.dead=0;for(let i=0;i<60;i++)model.animate(1/60,hero);assert.ok(model.weights.Idle>.99);model.disposeExtras();
 }
});
