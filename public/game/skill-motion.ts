import * as T from './vendor/three.module.js';
import type {WarriorPose} from './render-types.js';
import {SKILLS} from './skills.js';

const smooth=(value:number)=>{const x=T.MathUtils.clamp(value,0,1);return x*x*(3-2*x);};
/** Continuous accents layered on the licensed clips, in character-facing axes.
 * The envelope starts/ends at zero and never changes authoritative root position. */
export function skillMotionSample(skill:string,phase:number,contact:number){
  const p=T.MathUtils.clamp(phase,0,1),ready=smooth(p/Math.max(.12,contact*.55)),recover=1-smooth((p-contact)/Math.max(.001,1-contact));
  const envelope=ready*recover,charge=ready*(1-smooth((p-contact*.86)/Math.max(.001,contact*.24))),strike=Math.sin(Math.PI*smooth((p-contact*.8)/Math.max(.001,(1-contact)*.8)));
  let lean=0,turn=0,leftLift=0,rightLift=0,leftSpread=0,rightSpread=0,head=0;
  switch(skill){
    case 'warrior-cleave': turn=(-.34*charge+.25*strike);rightLift=-.16*charge;lean=.15*strike;break;
    case 'warrior-whirlwind':leftSpread=.28*envelope;rightSpread=.35*envelope;lean=.12*envelope;break;
    case 'warrior-thrust':turn=-.4*charge+.28*strike;rightLift=-.48*envelope;rightSpread=-.28*envelope;lean=.25*strike-.09*charge;break;
    case 'warrior-shockwave':rightLift=-1.12*charge;leftLift=-.48*charge;lean=-.16*charge+.42*strike;head=.12*strike;break;
    case 'archer-piercing':turn=-.24*charge;lean=-.12*charge+.16*strike;rightSpread=.19*charge;break;
    case 'archer-volley':turn=(-.38*charge+.33*strike);leftSpread=.2*envelope;rightSpread=.26*envelope;break;
    case 'archer-frost-shot':{const low=envelope*(1-smooth((p/contact-.45)/.55));lean=.22*low;leftLift=.22*low;rightLift=.18*low;head=-.12*low;break;}
    case 'archer-rain':lean=-.38*envelope;leftLift=-.5*envelope;rightLift=-.5*envelope;head=-.22*envelope;break;
    case 'mage-fireball':turn=-.23*charge+.28*strike;rightLift=-.22*charge;leftSpread=.25*charge;break;
    case 'mage-frost':leftSpread=.4*envelope;rightSpread=.4*envelope;lean=.16*strike;break;
    case 'mage-lightning':turn=-.35*charge+.22*strike;rightLift=-.58*envelope;leftLift=.25*envelope;leftSpread=-.2*envelope;lean=.16*strike;break;
    case 'mage-meteor':leftLift=-.68*charge;rightLift=-.82*charge;leftSpread=.18*charge;rightSpread=.18*charge;lean=-.2*charge+.36*strike;head=-.16*charge;break;
  }
  // The strike accent also tapers at the terminal pose (animation snapshots can
  // jump directly to 1, so do not rely on frame-by-frame damping for recovery).
  const end=1-smooth((p-.88)/.12);
  return {lean:lean*end,turn:turn*end,leftLift:leftLift*end,rightLift:rightLift*end,leftSpread:leftSpread*end,rightSpread:rightSpread*end,head:head*end,charge:charge*end};
}

export function createSkillMotion(model:T.Object3D){
  const find=(name:string)=>model.getObjectByName(`mixamorig${name}`)||model.getObjectByName(`mixamorig:${name}`);
  const bones={spine:find('Spine1'),chest:find('Spine2'),head:find('Neck'),left:find('LeftArm'),right:find('RightArm'),elbow:find('RightForeArm'),hand:find('RightHand')};
  const saved=new Map<T.Object3D,T.Quaternion>(),active=new Set<T.Object3D>(),axis=new T.Vector3(),world=new T.Quaternion(),parent=new T.Quaternion(),delta=new T.Quaternion(),local=new T.Quaternion();
  for(const bone of Object.values(bones))if(bone)saved.set(bone,new T.Quaternion());
  const shoulder=new T.Vector3(),elbow=new T.Vector3(),hand=new T.Vector3(),target=new T.Vector3(),along=new T.Vector3(),bend=new T.Vector3(),desiredElbow=new T.Vector3(),direction=new T.Vector3(),other=new T.Vector3();
  function remember(bone:T.Object3D){if(!active.has(bone)){saved.get(bone)!.copy(bone.quaternion);active.add(bone);}}
  function restore(){for(const bone of active)bone.quaternion.copy(saved.get(bone)!);active.clear();}
  function applyWorldDelta(bone:T.Object3D){remember(bone);bone.parent?.getWorldQuaternion(parent);local.copy(parent).invert().multiply(delta).multiply(parent);bone.quaternion.premultiply(local);bone.updateWorldMatrix(false,true);}
  function rotate(bone:T.Object3D|undefined,x:number,y:number,z:number){
    if(!bone)return;remember(bone);
    for(const [angle,ax,ay,az]of [[x,1,0,0],[y,0,1,0],[z,0,0,1]]){
      if(Math.abs(angle)<1e-8)continue;
      model.getWorldQuaternion(world);axis.set(ax,ay,az).applyQuaternion(world);
      bone.parent?.getWorldQuaternion(parent);delta.setFromAxisAngle(axis,angle);
      local.copy(parent).invert().multiply(delta).multiply(parent);bone.quaternion.premultiply(local);bone.updateWorldMatrix(false,false);
    }
  }
  return {restore,apply(hero:WarriorPose){
    if(!hero.attack||hero.dead||!hero.attack.skillId)return;
    const contact=SKILLS[hero.attack.skillId].hitFraction,m=skillMotionSample(hero.attack.skillId,hero.attack.age/hero.attack.duration,contact);
    model.updateWorldMatrix(true,true);
    rotate(bones.spine,m.lean*.6,m.turn*.55,0);rotate(bones.chest,m.lean*.4,m.turn*.45,0);
    rotate(bones.head,m.head,0,0);rotate(bones.left,m.leftLift,0,-m.leftSpread);rotate(bones.right,m.rightLift,0,m.rightSpread);
    if(hero.attack.skillId==='warrior-thrust'&&bones.right&&bones.elbow&&bones.hand){
      // A slash source supplies the feet and anticipation; a two-bone reach
      // makes the named thrust an actual forward extension at server contact.
      const p=hero.attack.age/hero.attack.duration,weight=smooth((p-.12)/(contact-.12))*(1-smooth((p-contact)/(1-contact)));
      if(weight>0){
        bones.right.getWorldPosition(shoulder);bones.elbow.getWorldPosition(elbow);bones.hand.getWorldPosition(hand);
        const upperLength=shoulder.distanceTo(elbow),lowerLength=elbow.distanceTo(hand);
        model.localToWorld(target.set(-.24,1.23,.95));target.lerpVectors(hand,target,weight);along.copy(target).sub(shoulder);
        const distance=T.MathUtils.clamp(along.length(),.01,(upperLength+lowerLength)*.99);along.normalize();target.copy(shoulder).addScaledVector(along,distance);
        const projected=(upperLength**2+distance**2-lowerLength**2)/(2*distance),height=Math.sqrt(Math.max(0,upperLength**2-projected**2));
        model.getWorldQuaternion(world);bend.set(-1,-.45,0).applyQuaternion(world);bend.addScaledVector(along,-bend.dot(along)).normalize();desiredElbow.copy(shoulder).addScaledVector(along,projected).addScaledVector(bend,height);
        direction.copy(elbow).sub(shoulder).normalize();other.copy(desiredElbow).sub(shoulder).normalize();delta.setFromUnitVectors(direction,other);applyWorldDelta(bones.right);
        bones.elbow.getWorldPosition(elbow);bones.hand.getWorldPosition(hand);direction.copy(hand).sub(elbow).normalize();other.copy(target).sub(elbow).normalize();delta.setFromUnitVectors(direction,other);applyWorldDelta(bones.elbow);
        // Authored sword length follows RightHand local X, through the grip.
        bones.hand.getWorldQuaternion(world);direction.set(1,0,0).applyQuaternion(world);model.getWorldQuaternion(world);other.set(0,0,1).applyQuaternion(world);delta.setFromUnitVectors(direction,other);delta.slerp(new T.Quaternion(),1-weight);applyWorldDelta(bones.hand);
      }
    }
  }};
}
