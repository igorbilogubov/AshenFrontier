import * as T from './vendor/three.module.js';
import {GLTFLoader,type GLTF} from './vendor/GLTFLoader.js';
import type {MobType,PublicMob,MobState,Point} from '../../shared/types.js';
export type MobAssets=Partial<Record<MobType,GLTF>>;
import {clone} from './vendor/SkeletonUtils.js';
import {mesh,box,joint} from './models.js';
import {contactShadow} from './forms.js';
import {MOB_TYPES} from './location.js';
import {angleDelta} from './motion.js';

export const CREATURE_CLIPS=['Idle','Walk','Run','Attack','Hit','Death'] as const;
export const WOLF_CLIPS=[...CREATURE_CLIPS,'Turn_Left','Turn_Right'] as const;
export const ATTACK_CONTACT=.68;
export const STRIDES={wolf:{walk:.72,run:1.12},boar:{walk:.52,run:.82},alpha:{walk:.70,run:1.12}};
let assetPromise:Promise<MobAssets>|undefined;
export function loadMobAssets(){
  return assetPromise??=Promise.all((Object.keys(MOB_TYPES) as MobType[]).map(async type=>{
    const gltf=await new GLTFLoader().loadAsync(new URL(`./creatures/${type}.glb`,import.meta.url).href);
    for(const name of CREATURE_CLIPS)if(!gltf.animations.some(c=>c.name===name))throw new Error(`В модели ${type} отсутствует ${name}`);
    return [type,gltf] as const;
  })).then(entries=>Object.fromEntries(entries));
}

export function createMob(type:MobType,assets:MobAssets){
  const cfg=MOB_TYPES[type],asset=assets?.[type];
  if(!cfg||!asset)throw new Error(`Модель ${type} не загружена`);
  const root=new T.Group(),body=clone(asset.scene);root.name=`Creature_${type}`;body.scale.setScalar(cfg.scale);root.add(body);
  const contact=contactShadow(root,1.25*cfg.scale,2.45*cfg.scale);
  body.traverse(o=>{if(o instanceof T.Mesh){
    o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
    // Bounds cover living poses and the short lunge, avoiding a per-frame vertex scan.
    if(o instanceof T.SkinnedMesh)o.boundingBox=new T.Box3(new T.Vector3(-.48,-.05,-1.38),new T.Vector3(.48,1.7,1.48));
    if(o instanceof T.SkinnedMesh)o.boundingSphere=new T.Sphere(new T.Vector3(0,.65,0),2.1);
    for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat instanceof T.MeshStandardMaterial&&mat.map)mat.map.anisotropy=4;
  }});
  const clips=Object.fromEntries(asset.animations.map(c=>[c.name,c]));
  const clipNames=Object.keys(clips),refined=type==='wolf'&&!!clips.Turn_Left&&!!clips.Turn_Right;
  const mixer=new T.AnimationMixer(body),actions:Record<string,T.AnimationAction>={},weights:Record<string,number>={};
  for(const name of clipNames){const a=mixer.clipAction(clips[name]).play();a.paused=true;a.setEffectiveWeight(name==='Idle'?1:0);actions[name]=a;weights[name]=name==='Idle'?1:0;}
  const additive=clips.Hit.clone();additive.name='Hit_UpperBody';
  additive.tracks=additive.tracks.filter(t=>/^(Chest|Neck|Head|Jaw)\./.test(t.name));
  T.AnimationUtils.makeClipAdditive(additive,0,clips.Idle,30);
  const reaction=mixer.clipAction(additive).play();reaction.paused=true;reaction.weight=0;

  const health=joint(root,0,(type==='boar'?1.45:1.78)*cfg.scale,0);
  box(health,1.12,.08,.018,new T.MeshBasicMaterial({color:'#1c2420'}));
  const fill=box(health,1.06,.045,.022,new T.MeshBasicMaterial({color:type==='alpha'?'#dfaf69':'#be705b'}),0,0,.015);
  health.traverse(o=>{o.castShadow=false;o.receiveShadow=false;});
  const warning=mesh(root,new T.RingGeometry(.05,cfg.range+.2,40,1,Math.PI/2-.72,1.44),new T.MeshBasicMaterial({color:'#ff8a36',transparent:true,opacity:.3,side:T.DoubleSide,depthWrite:false}));
  warning.rotation.x=Math.PI/2;warning.position.y=.025;warning.castShadow=false;warning.receiveShadow=false;warning.visible=false;
  const selection=mesh(root,new T.RingGeometry(.55*cfg.scale,.59*cfg.scale,40),new T.MeshBasicMaterial({color:'#e9c087',transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false}));
  selection.rotation.x=-Math.PI/2;selection.position.y=.03;selection.castShadow=false;selection.receiveShadow=false;selection.visible=false;
  let lastState:MobState='idle',lastTime:number|null=null,gait=0,runBlend=0,moveBlend=0,lastFlash=0,hitAge=1,state='Idle',preview:string|null=null,lastPosition:Point|null=null,lastYaw:number|null=null,turnGait=0,turnBlend=0,turnDirection=1;
  function reset(){
    gait=runBlend=moveBlend=turnGait=turnBlend=0;lastPosition=null;lastYaw=null;lastFlash=0;hitAge=1;reaction.weight=0;
    for(const name of clipNames){weights[name]=name==='Idle'?1:0;actions[name].time=0;actions[name].setEffectiveWeight(weights[name]);}
  }
  function animate(mob:PublicMob,time:number,selected:boolean,camera:T.Camera,sampleAnimation=true){
    if(preview)return;
    const dt=lastTime===null?1/60:T.MathUtils.clamp(time-lastTime,0,.15);lastTime=time;
    if(lastState==='dead'&&mob.state!=='dead')reset();
    const yawDelta=lastYaw===null?0:angleDelta(lastYaw,mob.yaw);
    const travelled=lastPosition?Math.hypot(mob.x-lastPosition.x,mob.z-lastPosition.z):0;
    root.position.set(mob.x,0,mob.z);body.rotation.y=mob.yaw;
    body.visible=mob.state!=='dead'||mob.age<2;contact.visible=body.visible;
    health.visible=mob.state!=='dead'&&(selected||mob.hp<cfg.hp||mob.state!=='idle');
    health.quaternion.copy(camera.quaternion);fill.scale.x=mob.hp/cfg.hp;fill.position.x=-(1-mob.hp/cfg.hp)*.53;
    warning.visible=mob.state==='windup';warning.rotation.z=-mob.targetYaw;
    warning.material.opacity=.12+.4*T.MathUtils.clamp(1-mob.timer/cfg.windup,0,1);
    selection.visible=selected&&mob.state!=='dead';
    const target=Object.fromEntries(clipNames.map(n=>[n,0]));
    if(mob.state==='dead'){
      actions.Death.time=Math.min(mob.age,clips.Death.duration);target.Death=1;state='Death';
    }else if(mob.state==='windup'||mob.state==='recover'&&mob.age<.45){
      // Damage is applied at the .68 contact pose, when the warning expires.
      const phase=mob.state==='windup'?T.MathUtils.clamp(1-mob.timer/cfg.windup,0,1)*ATTACK_CONTACT:
        ATTACK_CONTACT+(1-ATTACK_CONTACT)*T.MathUtils.clamp(mob.age/.45,0,1);
      actions.Attack.time=phase*clips.Attack.duration;target.Attack=1;state='Attack';
    }else{
      const moving=mob.speed>.03,run=moving&&mob.state!=='idle';
      runBlend+=(Number(run)-runBlend)*(1-Math.exp(-(refined?10:12)*dt));
      const moveTarget=refined?T.MathUtils.clamp(mob.speed/.20,0,1):Number(moving);
      moveBlend+=(moveTarget-moveBlend)*(1-Math.exp(-(refined?12:16)*dt));
      const stride=T.MathUtils.lerp(type==='wolf'&&!refined?.70:STRIDES[type].walk,STRIDES[type].run,runBlend)*cfg.scale;
      gait+=(refined?(travelled<1?travelled:0):mob.speed*dt)/stride;
      actions.Idle.time=(time+mob.id*.31)%clips.Idle.duration;
      actions.Walk.time=(gait%1)*clips.Walk.duration;actions.Run.time=(gait%1)*clips.Run.duration;
      if(refined){
        const turning=mob.speed<.15?T.MathUtils.clamp(Math.abs(yawDelta)/Math.max(dt,.001)/.65,0,1):0;
        if(Math.abs(yawDelta)>.0001)turnDirection=Math.sign(yawDelta);
        turnBlend+=(turning-turnBlend)*(1-Math.exp(-14*dt));turnGait+=Math.abs(yawDelta)/1.0;
        for(const name of ['Turn_Left','Turn_Right'])actions[name].time=(turnGait%1)*clips[name].duration;
        target[turnDirection>0?'Turn_Left':'Turn_Right']=turnBlend*(1-moveBlend);
      }
      target.Idle=(1-moveBlend)*(1-turnBlend);target.Walk=moveBlend*(1-runBlend);target.Run=moveBlend*runBlend;
      state=moveBlend<.1?(turnBlend>.5?(turnDirection>0?'Turn_Left':'Turn_Right'):'Idle'):runBlend>.5?'Run':'Walk';
    }
    if(mob.flash>lastFlash+.01)hitAge=0;
    hitAge+=dt;reaction.time=Math.min(hitAge,additive.duration);
    reaction.weight=mob.state==='dead'||mob.state==='windup'||mob.state==='recover'?0:Math.sin(Math.min(hitAge/additive.duration,1)*Math.PI)*.75;
    const blend=1-Math.exp(-dt*(mob.state==='dead'?35:20));
    for(const name of clipNames){weights[name]+=(target[name]-weights[name])*blend;actions[name].setEffectiveWeight(weights[name]);}
    if(sampleAnimation)mixer.update(0);lastState=mob.state;lastFlash=mob.flash;lastPosition={x:mob.x,z:mob.z};lastYaw=mob.yaw;
  }
  function previewClip(name:string){
    if(!clips[name])return;
    reset();preview=name;state=name;body.visible=true;contact.visible=true;health.visible=warning.visible=selection.visible=false;
    for(const n of clipNames)actions[n].setEffectiveWeight(n===name?1:0);
    actions[name].time=0;mixer.update(0);root.updateMatrixWorld(true);
  }
  function samplePreview(seconds:number){
    if(!preview)return;
    actions[preview].time=preview==='Death'?Math.min(seconds,clips[preview].duration):seconds%clips[preview].duration;
    mixer.update(0);root.updateMatrixWorld(true);
  }
  mixer.update(0);root.updateMatrixWorld(true);
  return {root,pickRoot:body,model:body,mixer,clips,animate,previewClip,samplePreview,health,warning,selection,
    get state(){return state;},get weights(){return {...weights};},get attackTime(){return actions.Attack.time;}};
}
