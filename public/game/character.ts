import * as T from './vendor/three.module.js';
import {GLTFLoader,type GLTF} from './vendor/GLTFLoader.js';
import type {ClassId,WeaponId} from '../../shared/types.js';
import type {WarriorPose} from './render-types.js';
import {clone} from './vendor/SkeletonUtils.js';
import {contactShadow} from './forms.js';

export const CHARACTER_URL=new URL('./characters/ashen-warrior-v1.glb',import.meta.url).href;
export const CLIP_NAMES=['Idle','Walk','Run','Attack_Sword_1','Attack_Sword_2','Hit','Death'] as const;
export type WarriorClip=typeof CLIP_NAMES[number];
type AttackClip='Attack_Sword_1'|'Attack_Sword_2';
const IMPACT_PHASE={Attack_Sword_1:.5,Attack_Sword_2:.445};

let assetPromise:Promise<GLTF>|undefined;
export async function loadWarrior(){
  assetPromise??=new GLTFLoader().loadAsync(CHARACTER_URL);
  const asset=await assetPromise;
  return createAnimatedWarrior({...asset,scene:clone(asset.scene)});
}


// Exported separately so animation/respawn transitions can be tested on the real asset.
export function createAnimatedWarrior(gltf:{scene:T.Object3D;animations:T.AnimationClip[]}){
  const root=new T.Group();root.name='Warrior';
  const model=gltf.scene;model.scale.setScalar(1.12);root.add(model);
  contactShadow(root,1.05,.84);
  const tuned=new Set<T.Material>();
  model.traverse(o=>{if(o instanceof T.Mesh){o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();o.castShadow=true;o.receiveShadow=true;
    // Skinned vertices move beyond the bind-pose bounding box during a strike/death.
    o.frustumCulled=false;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if(m instanceof T.MeshStandardMaterial&&m.map)m.map.anisotropy=4;
      if(m instanceof T.MeshStandardMaterial&&m.name==='Weathered_Paladin_Steel'&&!tuned.has(m)){
        // The source diffuse includes strong baked shading; compensate for the overhead camera.
        m.color.multiplyScalar(1.6);m.metalness=.25;m.roughness=.6;m.normalScale.setScalar(.7);tuned.add(m);
      }
    }
  }});
  const clips=Object.fromEntries(gltf.animations.map(c=>[c.name,c]));
  for(const name of CLIP_NAMES)if(!clips[name])throw new Error(`В модели отсутствует анимация ${name}`);
  const mixer=new T.AnimationMixer(model),actions={} as Record<WarriorClip,T.AnimationAction>;
  for(const name of CLIP_NAMES){
    const action=mixer.clipAction(clips[name]);actions[name]=action;
    action.play();action.setEffectiveWeight(name==='Idle'?1:0);
    if(name!=='Idle')action.paused=true;
  }
  const upperHit=clips.Hit.clone();upperHit.name='Hit_UpperBody';
  upperHit.tracks=upperHit.tracks.filter(t=>/Spine|Neck|Head|Shoulder|Arm|Hand/.test(t.name));
  T.AnimationUtils.makeClipAdditive(upperHit,0,clips.Idle,30);
  const hitAction=mixer.clipAction(upperHit).play();hitAction.paused=true;hitAction.weight=0;
  const sword=model.getObjectByName('Weapon_Sword'),axe=model.getObjectByName('Weapon_Axe'),buckler=model.getObjectByName('Weapon_Buckler');
  if(!sword||!axe)throw new Error('В модели отсутствует оружие');
  axe.visible=false;
  const rightHand=model.getObjectByName('mixamorigRightHand')||model.getObjectByName('mixamorig:RightHand');
  const leftHand=model.getObjectByName('mixamorigLeftHand')||model.getObjectByName('mixamorig:LeftHand');
  const staff=new T.Group(),bow=new T.Group();
  if(rightHand){
    rightHand.add(staff);staff.position.set(0,7,2);
    const shaft=new T.Mesh(new T.CylinderGeometry(1.7,2.1,130,8),new T.MeshStandardMaterial({color:'#665146',roughness:.7}));shaft.rotation.z=Math.PI/2;staff.add(shaft);
    const crystal=new T.Mesh(new T.OctahedronGeometry(6),new T.MeshStandardMaterial({color:'#b6a1f5',emissive:'#8361de',emissiveIntensity:.5}));crystal.position.x=67;staff.add(crystal);
  }
  if(leftHand){
    leftHand.add(bow);bow.position.set(0,5,0);
    const curve=new T.CatmullRomCurve3([new T.Vector3(-55,0,0),new T.Vector3(-25,0,15),new T.Vector3(0,0,18),new T.Vector3(25,0,15),new T.Vector3(55,0,0)]);
    bow.add(new T.Mesh(new T.TubeGeometry(curve,16,1.8,6,false),new T.MeshStandardMaterial({color:'#98714a'})));
    const string=new T.Mesh(new T.CylinderGeometry(.22,.22,110,4),new T.MeshBasicMaterial({color:'#e1d2ac'}));string.rotation.z=Math.PI/2;bow.add(string);
  }
  staff.visible=bow.visible=false;

  let lastAttack:WarriorPose['attack']=null,attackIndex=0,attackName:AttackClip='Attack_Sword_1',wasDead=false,deathAge=0,lastHurt=0,hitAge=1,preview:WarriorClip|null=null;
  let state:WarriorClip='Idle';
  const weights=Object.fromEntries(CLIP_NAMES.map(n=>[n,n==='Idle'?1:0]));
  function equipment(weapon:WeaponId,classId:ClassId='warrior'){sword!.visible=classId==='warrior'&&weapon!=='axe';axe!.visible=classId==='warrior'&&weapon==='axe';if(buckler)buckler.visible=classId==='warrior';bow.visible=classId==='archer';staff.visible=classId==='mage';}
  function reset(){
    lastAttack=null;wasDead=false;deathAge=0;hitAge=1;lastHurt=0;hitAction.weight=0;
    for(const name of CLIP_NAMES){weights[name]=name==='Idle'?1:0;actions[name].time=0;actions[name].setEffectiveWeight(weights[name]);}
  }
  function animate(dt:number,hero:WarriorPose){
    if(preview)return;
    equipment(hero.weapon,hero.classId);
    if(wasDead&&!hero.dead)reset();
    const target=Object.fromEntries(CLIP_NAMES.map(n=>[n,0]));
    if(hero.dead){
      if(!wasDead)deathAge=0;
      deathAge+=dt;actions.Death.time=Math.min(deathAge,clips.Death.duration);
      target.Death=1;state='Death';
    }else if(hero.attack){
      if((hero.attack.id??hero.attack)!==(lastAttack?.id??lastAttack)){
        attackName=hero.weapon==='axe'?'Attack_Sword_2':`Attack_Sword_${1+(attackIndex++%2)}` as AttackClip;
        actions[attackName].time=0;
      }
      // Align the blade's forward crossing with gameplay's 49% damage event.
      const phase=T.MathUtils.clamp(hero.attack.age/hero.attack.duration,0,1),impact=IMPACT_PHASE[attackName];
      const sourcePhase=phase<.49?phase/.49*impact:impact+(phase-.49)/.51*(1-impact);
      actions[attackName].time=sourcePhase*clips[attackName].duration;
      target[attackName]=1;state=attackName;
    }else{
      const move=T.MathUtils.clamp(hero.moveBlend,0,1),run=T.MathUtils.clamp(hero.runBlend,0,1);
      target.Idle=1-move;target.Walk=move*(1-run);target.Run=move*run;
      const cycle=hero.gait/(Math.PI*2);
      actions.Walk.time=(cycle%1)*clips.Walk.duration;
      actions.Run.time=(cycle%1)*clips.Run.duration;
      state=move<.1?'Idle':run>.5?'Run':'Walk';
    }
    if(hero.hurt>lastHurt+.01&&!hero.dead)hitAge=0;
    hitAge+=dt;hitAction.time=Math.min(hitAge/.48,1)*upperHit.duration;
    hitAction.weight=hero.dead||hero.attack?0:Math.sin(Math.min(hitAge/.48,1)*Math.PI)*.55;
    const blend=1-Math.exp(-dt*(hero.dead?22:hero.attack?30:16));
    for(const name of CLIP_NAMES){weights[name]+=(target[name]-weights[name])*blend;actions[name].setEffectiveWeight(weights[name]);}
    mixer.update(dt);lastAttack=hero.attack;lastHurt=hero.hurt;wasDead=!!hero.dead;
  }
  function previewClip(name:WarriorClip){
    if(!clips[name])return;
    reset();preview=name;state=name;
    for(const n of CLIP_NAMES){actions[n].paused=true;actions[n].setEffectiveWeight(n===name?1:0);}
    actions[name].time=0;mixer.update(0);
  }
  function samplePreview(seconds:number){
    if(!preview)return;
    const duration=clips[preview].duration;
    actions[preview].time=preview==='Death'?Math.min(seconds,duration):seconds%duration;
    mixer.update(0);
  }
  // Initialize the skeleton before the first rendered frame, avoiding a T-pose flash.
  mixer.update(0);root.updateMatrixWorld(true);
  return {root,model,mixer,clips,animate,equipment,previewClip,samplePreview,
    get state(){return state;},get weights(){return {...weights};}};
}
