import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {SKILLS} from './skills.js';
import type {ClassId,HeroAttack} from '../../shared/types.js';
const COMBAT_URL=new URL('./characters/class-combat-v1.glb',import.meta.url).href;
let loading:Promise<T.AnimationClip[]>|undefined;
export function loadCombatClips(){return loading??=new GLTFLoader().loadAsync(COMBAT_URL).then(asset=>asset.animations).catch(error=>{loading=undefined;throw error;});}
export const COMBAT_CLIPS=['Bow_Draw','Bow_Recoil','Mage_Cast','Mage_Pulse'] as const;
type ClipName=typeof COMBAT_CLIPS[number];
export function createCombatAnimator(model:T.Object3D,mixer:T.AnimationMixer,clips:T.AnimationClip[]){
  const actions=new Map<ClipName,T.AnimationAction>();
  for(const name of COMBAT_CLIPS){const clip=clips.find(c=>c.name===name);if(!clip)continue;const action=mixer.clipAction(clip);action.play();action.paused=true;action.weight=0;actions.set(name,action);}
  return {
    available:actions.size===4,
    update(dt:number,classId:ClassId,attack:Pick<HeroAttack,'age'|'duration'|'skillId'>|null,dead:boolean){
      const target=new Map<ClipName,number>(),phase=attack?T.MathUtils.clamp(attack.age/attack.duration,0,1):0;
      const contact=attack?.skillId?SKILLS[attack.skillId].hitFraction:.49;
      if(attack&&!dead&&classId==='archer'){
        // The preparation clip holds the drawn bow; release starts at the server's launch frame.
        const draw=actions.get('Bow_Draw'),release=actions.get('Bow_Recoil');
        if(draw&&release){
          const blend=T.MathUtils.smoothstep(phase,contact-.035,contact+.035);target.set('Bow_Draw',1-blend);target.set('Bow_Recoil',blend);
          draw.time=Math.min(1,phase/contact)*Math.min(.85,draw.getClip().duration);
          release.time=T.MathUtils.clamp((phase-contact)/(1-contact),0,1)*release.getClip().duration;
        }
      }else if(attack&&!dead&&classId==='mage'){
        const name=attack.skillId==='mage-frost'?'Mage_Pulse':'Mage_Cast',action=actions.get(name);
        if(action){const sourceContact=name==='Mage_Pulse'?.60:.45;action.time=(phase<contact?phase/contact*sourceContact:sourceContact+(phase-contact)/(1-contact)*(1-sourceContact))*action.getClip().duration;target.set(name,1);}
      }
      const blend=1-Math.exp(-dt*28);
      for(const [name,action] of actions)action.weight+=((target.get(name)||0)-action.weight)*blend;
      // This is presentation-only rotation around the actor; authoritative facing is on root.
      model.rotation.y=attack?.skillId==='warrior-whirlwind'&&!dead?Math.PI*2*T.MathUtils.smoothstep(phase,.12,.92):0;
    },
    reset(){for(const action of actions.values()){action.weight=0;action.time=0;}model.rotation.y=0;},
  };
}
